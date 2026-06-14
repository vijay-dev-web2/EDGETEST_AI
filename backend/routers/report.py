from __future__ import annotations

import asyncio
import io
import pathlib
import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse
from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import Session as SessionModel, TestRun, User
from services.coverage_gate import check_coverage_gate

router = APIRouter()

_TEMPLATES_DIR = pathlib.Path(__file__).parent.parent / "templates"

_jinja_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=select_autoescape(["html", "j2"]),
)


async def _get_session_and_run(
    session_id: uuid.UUID,
    db: AsyncSession,
    current_user: User,
) -> tuple[SessionModel, TestRun]:
    session = await db.get(SessionModel, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    result = await db.execute(
        select(TestRun)
        .where(TestRun.session_id == session_id)
        .order_by(TestRun.created_at.desc())
        .limit(1)
    )
    test_run = result.scalar_one_or_none()
    if test_run is None:
        raise HTTPException(status_code=404, detail="No test results found for this session")

    return session, test_run


def _read_test_code_files(session_id: str) -> list[dict]:
    test_dir = pathlib.Path("/tmp/edgetest") / session_id
    if not test_dir.is_dir():
        return []

    files: list[dict] = []
    seen: set[str] = set()
    for pattern in ("test_*.py", "*.test.js", "*.test.ts", "*.spec.js", "*.spec.ts"):
        for path in sorted(test_dir.glob(pattern)):
            if path.name in seen:
                continue
            seen.add(path.name)
            try:
                content = path.read_text(encoding="utf-8", errors="replace")
                files.append({"name": path.name, "content": content})
            except OSError:
                pass
    return files


def _build_enriched_tests(test_run: TestRun, session: SessionModel) -> list[dict]:
    results = test_run.results_json
    all_tests: list[dict] = results.get("tests", [])

    scenarios = session.ast_json.get("scenarios", []) if session.ast_json else []
    scenario_map: dict[str, dict] = {}
    for s in scenarios:
        name = (s.get("name") or "").lower()
        if name:
            scenario_map[name] = s

    def _enrich(t: dict) -> dict:
        test_name = t.get("test_name", "")
        base = test_name.split("[")[0] if "[" in test_name else test_name
        s = scenario_map.get(base.lower(), {})
        return {
            **t,
            "type": s.get("type", "unit"),
            "priority": s.get("priority", "-"),
            "description": s.get("description", ""),
        }

    if all_tests:
        return [_enrich(t) for t in all_tests]

    enriched: list[dict] = []
    for f in results.get("failures", []):
        raw_name = f.get("test_name", "")
        parts = raw_name.split("::")
        base = (parts[-1] if len(parts) > 1 else raw_name).split("[")[0]
        s = scenario_map.get(base.lower(), {})
        enriched.append({
            "test_name": raw_name,
            "node_id": raw_name,
            "file_name": parts[0] if len(parts) > 1 else "",
            "status": "failed",
            "duration": 0.0,
            "error_message": f.get("error_message", ""),
            "traceback": f.get("traceback", ""),
            "type": s.get("type", "unit"),
            "priority": s.get("priority", "-"),
            "description": s.get("description", ""),
        })
    return enriched


def _extract_function_under_test(test_name: str) -> str:
    """Derive the function name being tested from the test function name."""
    name = test_name.lower()
    for prefix in ("test_", "test"):
        if name.startswith(prefix):
            name = name[len(prefix):]
            break
    for suffix in ("_success", "_failure", "_error", "_valid", "_invalid",
                   "_edge", "_boundary", "_none", "_empty", "_raises",
                   "_should_", "_returns_", "_when_"):
        idx = name.find(suffix)
        if idx > 0:
            name = name[:idx]
            break
    return name


def _extract_module_name(test_name: str, test_code: str) -> str:
    """Infer the module/class name from test code imports or class names."""
    if test_code:
        # Look for class names like UserAuthService, BankAccount, etc.
        matches = re.findall(r'\b([A-Z][a-zA-Z0-9]+(?:Service|Manager|Handler|Controller|Model|Auth|Bank|Payment|Cart|Order|User|Auth))\b', test_code)
        if matches:
            return matches[0]
        # Look for "from solution import X" or "import X"
        imp = re.search(r'from\s+\w+\s+import\s+(\w+)', test_code)
        if imp:
            return imp.group(1)
    # Fallback: capitalize the function_under_test guess
    fn = _extract_function_under_test(test_name)
    return fn.replace("_", " ").title().replace(" ", "") if fn else "Module"


def _build_test_cases_with_code(enriched_tests: list[dict], test_code_files: list[dict]) -> list[dict]:
    """Build rich test case objects that include the actual test code snippet."""
    # Build a map from test function name → code snippet
    code_map: dict[str, str] = {}
    for file_obj in test_code_files:
        content = file_obj.get("content", "")
        # Split by function definitions
        blocks = re.split(r'\n(?=def test_|async def test_)', content)
        for block in blocks:
            m = re.match(r'(?:async )?def (test_\w+)', block)
            if m:
                func_name = m.group(1)
                code_map[func_name.lower()] = block.strip()

    full_code = "\n".join(f["content"] for f in test_code_files)

    result = []
    for i, t in enumerate(enriched_tests):
        raw_name = t.get("test_name", "")
        # test_name may be "test_func_name" or "file.py::test_func_name"
        func_name = raw_name.split("::")[-1].split("[")[0]
        test_code = code_map.get(func_name.lower(), "")
        module_name = _extract_module_name(func_name, full_code)
        function_under_test = _extract_function_under_test(func_name)

        result.append({
            **t,
            "index": i + 1,
            "func_name": func_name,
            "test_code": test_code,
            "module_name": module_name,
            "function_under_test": function_under_test,
        })

    return result


def _build_module_analysis(test_cases: list[dict]) -> list[dict]:
    """Group test cases by module and build per-module stats."""
    modules: dict[str, dict] = {}
    for tc in test_cases:
        mod = tc.get("module_name", "Unknown")
        if mod not in modules:
            modules[mod] = {
                "module_name": mod,
                "test_cases": [],
                "passed": 0,
                "failed": 0,
                "functions": set(),
            }
        modules[mod]["test_cases"].append(tc)
        if tc.get("status") == "passed":
            modules[mod]["passed"] += 1
        elif tc.get("status") == "failed":
            modules[mod]["failed"] += 1
        fn = tc.get("function_under_test", "")
        if fn:
            modules[mod]["functions"].add(fn)

    result = []
    for mod_name, data in modules.items():
        result.append({
            "module_name": mod_name,
            "test_count": len(data["test_cases"]),
            "passed": data["passed"],
            "failed": data["failed"],
            "functions": sorted(data["functions"]),
            "test_cases": data["test_cases"],
        })
    return sorted(result, key=lambda x: x["test_count"], reverse=True)


def _read_github_actions_yaml(session: SessionModel) -> str:
    """Read or render the GitHub Actions YAML for this session."""
    session_dir = pathlib.Path("/tmp/edgetest") / str(session.id)
    yaml_path = session_dir / "workflow.yml"
    if yaml_path.exists():
        return yaml_path.read_text(encoding="utf-8")

    # Generate a minimal inline YAML
    lang = session.language or "python"
    if lang == "python":
        return f"""name: EdgeTest AI — Generated Tests

on:
  push:
    branches: ["main"]
  pull_request:
    branches: ["main"]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.11"
      - run: pip install pytest pytest-json-report
      - run: pytest tests/ -v --tb=short
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results
          path: .pytest_cache/
"""
    else:
        return f"""name: EdgeTest AI — Generated Tests

on:
  push:
    branches: ["main"]
  pull_request:
    branches: ["main"]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: npm install
      - run: npx jest --no-coverage --json --outputFile=jest-results.json
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results
          path: jest-results.json
"""


def _render_html(session: SessionModel, test_run: TestRun, user: User) -> str:
    template = _jinja_env.get_template("report.html.j2")
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    total = test_run.total_tests or 0
    passed = test_run.passed or 0
    failed = test_run.failed or 0
    pass_rate = round(passed / total * 100, 1) if total > 0 else 0.0

    enriched_tests = _build_enriched_tests(test_run, session)
    test_code_files = _read_test_code_files(str(session.id))
    test_cases = _build_test_cases_with_code(enriched_tests, test_code_files)
    module_analysis = _build_module_analysis(test_cases)

    risk_json = session.risk_json or {}
    traceability_map = session.traceability_map or {}

    function_coverage_pct = traceability_map.get("function_coverage_pct", 0)
    requirement_coverage_pct = traceability_map.get("requirement_coverage_pct", 0)

    ast_json = session.ast_json or {}
    coverage_report = ast_json.get("coverage_report", {})
    branch_coverage_pct = coverage_report.get("branch_coverage", 0)
    guard_coverage_pct = coverage_report.get("guard_coverage", 0)
    bva_coverage_pct = coverage_report.get("bva_coverage", 0)
    exception_coverage_pct = coverage_report.get("exception_coverage", 0)

    high_risk_functions = risk_json.get("high_risk_functions", [])
    risk_reason = risk_json.get("human_readable_reason", "")

    github_actions_yaml = _read_github_actions_yaml(session)

    return template.render(
        session=session,
        test_run=test_run,
        user=user,
        now=now,
        total_tests=total,
        passed=passed,
        failed=failed,
        pass_rate=pass_rate,
        risk_score=(session.risk_score or 0),
        risk_level=(session.risk_level or "na"),
        risk_json=risk_json,
        high_risk_functions=high_risk_functions,
        risk_reason=risk_reason,
        function_coverage_pct=function_coverage_pct,
        requirement_coverage_pct=requirement_coverage_pct,
        branch_coverage_pct=branch_coverage_pct,
        guard_coverage_pct=guard_coverage_pct,
        bva_coverage_pct=bva_coverage_pct,
        exception_coverage_pct=exception_coverage_pct,
        traceability_map=traceability_map,
        enriched_tests=enriched_tests,
        test_code_files=test_code_files,
        test_cases=test_cases,
        module_analysis=module_analysis,
        github_actions_yaml=github_actions_yaml,
        language=session.language or "python",
        repo_url=getattr(session, "repo_url", None),
        session_id=str(session.id),
        generated_at=now,
    )


@router.get("/{session_id}", response_class=HTMLResponse)
async def get_report_html(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> HTMLResponse:
    session, test_run = await _get_session_and_run(session_id, db, current_user)
    html = _render_html(session, test_run, current_user)
    return HTMLResponse(content=html)


@router.get("/{session_id}/pdf")
async def get_report_pdf(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    session, test_run = await _get_session_and_run(session_id, db, current_user)
    html = _render_html(session, test_run, current_user)

    loop = asyncio.get_running_loop()

    def _to_pdf() -> bytes:
        from weasyprint import HTML
        return HTML(string=html).write_pdf()

    pdf_bytes = await loop.run_in_executor(None, _to_pdf)

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f"attachment; filename=report-{session_id}.pdf",
            "Content-Length": str(len(pdf_bytes)),
        },
    )


@router.get("/{session_id}/data")
async def get_report_data(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    session, test_run = await _get_session_and_run(session_id, db, current_user)

    unit_coverage = float(session.unit_coverage_pct or 0)
    integration_coverage = float(session.integration_coverage_pct) if session.integration_coverage_pct is not None else None

    # Read per-session coverage threshold from ast_json config
    session_config = (session.ast_json or {}).get("_config", {})
    custom_threshold = session_config.get("coverage_threshold")

    gate = check_coverage_gate(
        unit_coverage_percent=unit_coverage,
        integration_coverage_percent=integration_coverage,
        custom_threshold=custom_threshold,
    )

    report = {
        "session_id": str(session_id),
        "language": session.language,
        "session_status": session.status,
        "session_created_at": session.created_at.isoformat(),
        "run_id": str(test_run.id),
        "run_created_at": test_run.created_at.isoformat(),
        "total_tests": test_run.total_tests,
        "passed": test_run.passed,
        "failed": test_run.failed,
        "pass_rate": round(test_run.passed / test_run.total_tests * 100, 1)
        if test_run.total_tests > 0
        else 0.0,
        "results": test_run.results_json,
        "coverage_gate": gate,
        "status": "passed" if gate["passed"] else "coverage_gate_failed",
    }
    return report
