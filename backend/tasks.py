from __future__ import annotations

import asyncio
import logging
import uuid

from celery import Celery

from config import settings
from database import AsyncSessionLocal

logger = logging.getLogger(__name__)

celery_app = Celery(
    "edgetest",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
)


# ---------------------------------------------------------------------------
# Ingest task (used by routers/ingest.py)
# ---------------------------------------------------------------------------


@celery_app.task(bind=True, name="tasks.ingest_repository")
def ingest_repository(self, project_id: str, repo_url: str, branch: str = "main") -> dict:
    self.update_state(state="PROGRESS", meta={"step": "cloning"})
    return {"project_id": project_id, "status": "ingested"}


# ---------------------------------------------------------------------------
# Async helpers — run inside asyncio.run() from sync Celery workers
# ---------------------------------------------------------------------------


async def _set_session_status(session_id: str, status: str) -> None:
    from models import Session as SessionModel

    async with AsyncSessionLocal() as db:
        session = await db.get(SessionModel, uuid.UUID(session_id))
        if session is not None:
            session.status = status
            await db.commit()


async def _run_pipeline_async(task, session_id: str, code: str, language: str) -> dict:
    """Full analysis pipeline: AST parse → completeness → pseudocode → discovery → codegen."""
    from chains.codegen import generate_tests
    from chains.completeness import analyze_completeness
    from chains.discovery import discover_scenarios
    from chains.pseudocode import stream_pseudocode
    from models import Session as SessionModel
    from parser import TREE_SITTER_AVAILABLE, parse_code

    session_uuid = uuid.UUID(session_id)

    # ── Initialise: parse AST and mark session as running ──────────────────
    base_ast: dict = {}
    async with AsyncSessionLocal() as db:
        session = await db.get(SessionModel, session_uuid)
        if session is None:
            raise ValueError(f"Session {session_id!r} not found")

        base_ast = dict(session.ast_json) if session.ast_json else {}
        user_story: str | None = session.user_story
        if not base_ast and TREE_SITTER_AVAILABLE:
            try:
                base_ast = parse_code(code, language)
            except Exception:
                base_ast = {}

        session.status = "running"
        session.ast_json = base_ast
        await db.commit()

    # ── Chain 1: Completeness ──────────────────────────────────────────────
    task.update_state(state="PROGRESS", meta={"step": "completeness", "pct": 10})
    logger.info("Pipeline [%s] step=completeness", session_id)
    completeness = await analyze_completeness(code, language, user_story)

    async with AsyncSessionLocal() as db:
        session = await db.get(SessionModel, session_uuid)
        accumulated = dict(session.ast_json) if session.ast_json else {}
        accumulated["completeness"] = completeness.model_dump()
        session.ast_json = accumulated
        await db.commit()

    # ── Chain 2: Pseudocode ────────────────────────────────────────────────
    task.update_state(state="PROGRESS", meta={"step": "pseudocode", "pct": 35})
    logger.info("Pipeline [%s] step=pseudocode", session_id)
    tokens: list[str] = []
    async for token in stream_pseudocode(code, base_ast, language, user_story):
        tokens.append(token)
    pseudocode = "".join(tokens)

    async with AsyncSessionLocal() as db:
        session = await db.get(SessionModel, session_uuid)
        session.pseudocode = pseudocode
        await db.commit()

    # ── Chain 3: Scenario discovery ────────────────────────────────────────
    task.update_state(state="PROGRESS", meta={"step": "discovery", "pct": 60})
    logger.info("Pipeline [%s] step=discovery", session_id)
    discovery_result = await discover_scenarios(code, pseudocode, base_ast, user_story)
    scenarios = discovery_result.scenarios

    async with AsyncSessionLocal() as db:
        session = await db.get(SessionModel, session_uuid)
        accumulated = dict(session.ast_json) if session.ast_json else {}
        accumulated["scenarios"] = [s.model_dump() for s in scenarios]
        accumulated["coverage_report"] = discovery_result.coverage_report.model_dump()
        session.ast_json = accumulated
        await db.commit()

    # ── Chain 4: Test code generation ──────────────────────────────────────
    task.update_state(state="PROGRESS", meta={"step": "codegen", "pct": 85})
    logger.info("Pipeline [%s] step=codegen", session_id)
    files = await generate_tests(
        code=code,
        language=language,
        selected_scenarios=[s.name for s in scenarios],
        session_id=session_uuid,
        user_story=user_story,
    )

    # ── Done ───────────────────────────────────────────────────────────────
    async with AsyncSessionLocal() as db:
        session = await db.get(SessionModel, session_uuid)
        session.status = "complete"
        await db.commit()

    logger.info("Pipeline [%s] complete: %d scenarios, %d files", session_id, len(scenarios), len(files))
    return {
        "session_id": session_id,
        "status": "complete",
        "scenarios": len(scenarios),
        "files_generated": len(files),
    }


async def _run_sandbox_async(session_id: str, language: str) -> dict:
    """Execute generated tests in Docker and persist a TestRun row."""
    from models import TestRun
    from sandbox import run_tests

    try:
        results: dict = await asyncio.to_thread(run_tests, session_id, language)
    except (FileNotFoundError, ValueError) as exc:
        results = {
            "total": 0,
            "passed": 0,
            "failed": 0,
            "failures": [{"test_name": "__error__", "error_message": str(exc), "traceback": ""}],
        }

    async with AsyncSessionLocal() as db:
        test_run = TestRun(
            session_id=uuid.UUID(session_id),
            total_tests=results.get("total", 0),
            passed=results.get("passed", 0),
            failed=results.get("failed", 0),
            results_json=results,
        )
        db.add(test_run)
        await db.commit()
        logger.info(
            "Sandbox [%s] saved: total=%d passed=%d failed=%d",
            session_id,
            test_run.total_tests,
            test_run.passed,
            test_run.failed,
        )

    return results


# ---------------------------------------------------------------------------
# Celery tasks
# ---------------------------------------------------------------------------


@celery_app.task(bind=True, name="tasks.run_analysis_pipeline")
def run_analysis_pipeline(self, session_id: str, code: str, language: str) -> dict:
    """Run all four analysis chains in sequence, updating PostgreSQL at each step.

    Runs on Celery prefork workers (the default pool). Each step persists its
    output so the frontend status endpoint can reflect partial progress.
    """
    try:
        return asyncio.run(_run_pipeline_async(self, session_id, code, language))
    except Exception:
        logger.exception("Pipeline failed for session %s", session_id)
        asyncio.run(_set_session_status(session_id, "error"))
        raise


@celery_app.task(bind=True, name="tasks.run_sandbox_task")
def run_sandbox_task(self, session_id: str, language: str) -> dict:
    """Run the Docker sandbox against generated tests and save results to test_runs.

    Stores a TestRun row regardless of pass/fail outcome so the report
    endpoints always have data to display.
    """
    self.update_state(state="PROGRESS", meta={"step": "running"})
    try:
        return asyncio.run(_run_sandbox_async(session_id, language))
    except Exception:
        logger.exception("Sandbox task failed for session %s", session_id)
        raise
