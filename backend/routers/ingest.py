"""GitHub repository ingestion.

POST /github  — async, httpx-based. Gets the full repo tree in ONE API call
(git/trees?recursive=1), then fetches supported file contents concurrently.
No PyGithub, no blocking executor, no N+1 round-trips.
"""
from __future__ import annotations

import ast as _ast
import asyncio
import base64
import logging
import re
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from auth import get_current_user, get_optional_user
from models import User
from module_graph import build_module_graph
from schemas import IngestRequest, IngestResponse
from tasks import ingest_repository

logger = logging.getLogger(__name__)

router = APIRouter()

# ---------------------------------------------------------------------------
# Existing Celery-backed queue endpoint (unchanged)
# ---------------------------------------------------------------------------


@router.post("/", response_model=IngestResponse, status_code=status.HTTP_202_ACCEPTED)
async def ingest(
    payload: IngestRequest,
    current_user: User = Depends(get_current_user),
) -> IngestResponse:
    task = ingest_repository.delay(
        project_id=str(current_user.id),
        repo_url=payload.repo_url,
        branch=payload.branch,
    )
    return IngestResponse(task_id=task.id, message="Repository ingestion queued")


@router.get("/status/{task_id}")
async def ingest_status(
    task_id: str,
    current_user: User = Depends(get_current_user),
) -> dict:
    task = ingest_repository.AsyncResult(task_id)
    return {"task_id": task_id, "state": task.state, "info": task.info}


# ---------------------------------------------------------------------------
# Async GitHub repo fetch — httpx + GitHub REST API
# ---------------------------------------------------------------------------

class GithubFetchRequest(BaseModel):
    repo_url: str
    branch: str = "main"


_SUPPORTED_EXTS = frozenset({
    ".py", ".ts", ".js", ".tsx", ".jsx",
    ".java", ".cs", ".cpp", ".cc", ".cxx", ".h", ".hpp",
})
_EXCLUDE_DIRS = frozenset({
    "node_modules", "venv", ".venv", "dist", "build", "__pycache__",
    ".git", ".next", "coverage", "target", ".pytest_cache",
    "bower_components", ".nyc_output", "vendor", "env",
})
_MAX_FILES = 80
_MAX_FILE_BYTES = 100_000   # 100 KB per file
_MAX_TOTAL_BYTES = 500_000  # 500 KB combined
_CONCURRENCY = 6  # parallel content fetches


def _gh_headers(token: str | None = None) -> dict[str, str]:
    """Build GitHub API request headers.

    Priority:
      1. User/PAT token  → Bearer auth  (5 000 req/hr)
      2. OAuth app creds → Basic auth   (5 000 req/hr, no personal token needed)
      3. Unauthenticated                (60 req/hr — avoid hitting this)
    """
    from config import settings

    headers: dict[str, str] = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "EdgeTest-AI/1.0",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    elif settings.GITHUB_TOKEN:
        headers["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"
    elif settings.GITHUB_CLIENT_ID and settings.GITHUB_CLIENT_SECRET:
        # OAuth app Basic auth — 5 000 req/hr without a PAT
        raw = f"{settings.GITHUB_CLIENT_ID}:{settings.GITHUB_CLIENT_SECRET}"
        b64 = base64.b64encode(raw.encode()).decode()
        headers["Authorization"] = f"Basic {b64}"
    return headers


def _parse_repo_url(url: str) -> str:
    url = url.strip().rstrip("/").removesuffix(".git")
    m = re.search(r"github\.com[/:]([A-Za-z0-9_.\-]+/[A-Za-z0-9_.\-]+)", url)
    if not m:
        raise HTTPException(
            status_code=400,
            detail="Invalid GitHub URL — expected https://github.com/owner/repository",
        )
    return m.group(1)


def _should_skip(path: str) -> bool:
    parts = path.split("/")
    return any(p in _EXCLUDE_DIRS or p.startswith(".") for p in parts)


def _is_supported(path: str) -> bool:
    if path.endswith(".d.ts"):
        return False
    dot = path.rfind(".")
    return dot != -1 and path[dot:].lower() in _SUPPORTED_EXTS


async def _get_tree(
    client: httpx.AsyncClient,
    repo: str,
    branch: str,
    headers: dict[str, str],
) -> list[dict]:
    url = f"https://api.github.com/repos/{repo}/git/trees/{branch}?recursive=1"
    r = await client.get(url, headers=headers)

    if r.status_code == 404:
        raise HTTPException(
            status_code=404,
            detail=f"Repository or branch '{branch}' not found — make sure it's public",
        )
    if r.status_code in (403, 429):
        raise HTTPException(
            status_code=429,
            detail="GitHub rate limit exceeded — please try again in ~1 hour",
        )
    if r.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"GitHub API error {r.status_code}: {r.text[:200]}",
        )

    data = r.json()
    return [
        item for item in data.get("tree", [])
        if item.get("type") == "blob"
        and not _should_skip(item["path"])
        and _is_supported(item["path"])
        and item.get("size", 0) <= _MAX_FILE_BYTES
    ]


def _strip_unicode(content: str) -> str:
    """Strip BOM and invisible Unicode characters that break AST parsing."""
    content = content.replace("﻿", "")   # BOM (U+FEFF)
    content = content.replace("​", "")   # zero-width space (U+200B)
    content = content.replace(" ", " ")  # non-breaking space → regular space
    return content


def _validate_python(content: str, path: str) -> tuple[bool, str]:
    """Try to AST-parse a Python file. Returns (ok, error_msg)."""
    try:
        _ast.parse(content)
        return True, ""
    except SyntaxError as exc:
        return False, f"syntax error line {exc.lineno}: {exc.msg}"


async def _fetch_content(
    client: httpx.AsyncClient,
    sem: asyncio.Semaphore,
    repo: str,
    path: str,
    branch: str,
    headers: dict[str, str],
) -> tuple[str, str] | None:
    """Fetch one file with a single retry on timeout."""
    async with sem:
        url = f"https://api.github.com/repos/{repo}/contents/{path}?ref={branch}"
        r = None
        for attempt in range(2):
            try:
                r = await client.get(url, headers=headers)
                break
            except httpx.TimeoutException:
                if attempt == 0:
                    logger.debug("Timeout fetching %s, retrying…", path)
                    continue
                return None

        if r is None or r.status_code != 200:
            return None

        data = r.json()
        raw_b64 = data.get("content", "")
        try:
            content = base64.b64decode(raw_b64.replace("\n", "")).decode("utf-8-sig", errors="replace")
        except Exception:
            return None

        content = _strip_unicode(content)
        return path, content


@router.post("/github")
async def fetch_github_repo(
    payload: GithubFetchRequest,
    current_user: User | None = Depends(get_optional_user),
) -> dict[str, Any]:
    """Fetch Python / JS / TS files from a public GitHub repository.

    Returns structured_files (list of {path, content}), combined_code,
    module_graph (AST-based dependency analysis for Python repos), and
    skipped_files (files that failed AST validation).

    Auth token priority: logged-in user's GitHub token > GITHUB_TOKEN env var > none.
    """
    repo = _parse_repo_url(payload.repo_url)
    branch = (payload.branch or "main").strip() or "main"

    user_token = current_user.access_token if current_user else None
    headers = _gh_headers(user_token)

    async with httpx.AsyncClient(timeout=30.0) as client:
        # ── Step 1: get tree ──────────────────────────────────────────────
        try:
            blobs = await _get_tree(client, repo, branch, headers)
        except HTTPException as exc:
            if exc.status_code == 404:
                alt = "master" if branch == "main" else "main"
                try:
                    blobs = await _get_tree(client, repo, alt, headers)
                    branch = alt
                except HTTPException:
                    raise exc
            else:
                raise

        if not blobs:
            raise HTTPException(
                status_code=422,
                detail=(
                    "No supported source files found "
                    "(.py, .js, .ts, .tsx, .jsx, .java, .cs, .cpp, .cc, .cxx, .h, .hpp) "
                    "in this repository"
                ),
            )

        # ── Step 2: limit and sort ────────────────────────────────────────
        blobs = sorted(blobs, key=lambda b: b["path"])[:_MAX_FILES]

        # ── Step 3: fetch contents concurrently ───────────────────────────
        sem = asyncio.Semaphore(_CONCURRENCY)
        tasks = [
            _fetch_content(client, sem, repo, b["path"], branch, headers) for b in blobs
        ]
        results = await asyncio.gather(*tasks)

    # ── Step 4: validate, assemble ───────────────────────────────────────
    structured_files: list[dict[str, str]] = []
    skipped_files: list[dict[str, str]] = []
    files_found: list[str] = []
    parts: list[str] = []
    total_bytes = 0

    for item in results:
        if item is None:
            continue
        path, content = item

        # AST validation for Python files
        if path.endswith(".py"):
            ok, err = _validate_python(content, path)
            if not ok:
                msg = f"Skipped {path}: {err}"
                logger.info(msg)
                skipped_files.append({"path": path, "reason": err})
                continue

        total_bytes += len(content)
        if total_bytes > _MAX_TOTAL_BYTES:
            break

        files_found.append(path)
        structured_files.append({"path": path, "content": content})
        parts.append(f"# File: {path}\n{content.rstrip()}")

    if not files_found:
        raise HTTPException(
            status_code=422,
            detail="Could not fetch any file contents from the repository",
        )

    combined_code = "\n\n".join(parts)

    # Detect primary language by source-file count (headers excluded from C++ count)
    py   = sum(1 for f in files_found if f.endswith(".py"))
    ts   = sum(1 for f in files_found if f.endswith((".ts", ".tsx")) and not f.endswith(".d.ts"))
    js   = sum(1 for f in files_found if f.endswith((".js", ".jsx")))
    java = sum(1 for f in files_found if f.endswith(".java"))
    cs   = sum(1 for f in files_found if f.endswith(".cs"))
    cpp  = sum(1 for f in files_found if f.endswith((".cpp", ".cc", ".cxx")))

    counts = {"python": py, "typescript": ts, "javascript": js,
              "java": java, "csharp": cs, "cpp": cpp}
    language = max(counts, key=lambda k: counts[k])

    # ── Step 5: build module graph (Python only) ──────────────────────────
    module_graph: dict[str, Any] = {}
    if language == "python":
        py_files = [f for f in structured_files if f["path"].endswith(".py")]
        if py_files:
            try:
                module_graph = build_module_graph(py_files)
            except Exception as exc:
                logger.warning("Module graph build failed: %s", exc)

    return {
        "success": True,
        "repo_url": payload.repo_url,
        "repo_path": repo,
        "branch": branch,
        "files_found": files_found,
        "file_count": len(files_found),
        "language": language,
        "combined_code": combined_code,
        "total_size_bytes": total_bytes,
        "structured_files": structured_files,
        "module_graph": module_graph,
        "skipped_files": skipped_files,
    }
