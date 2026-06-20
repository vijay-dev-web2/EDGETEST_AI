from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from auth import assert_session_owner, get_optional_user
from database import get_db
from models import Session as SessionModel, TestRun, User
from sandbox import run_tests, run_unit_tests, run_integration_tests
from services.autofix_runner import run_with_autofix

logger = logging.getLogger(__name__)

router = APIRouter()


class SandboxRunRequest(BaseModel):
    session_id: str
    language: str
    autofix_enabled: bool = True


async def _execute_and_persist(
    payload: SandboxRunRequest,
    db: AsyncSession,
    current_user: "User | None",
    executor_fn,
    run_type: str,
) -> dict:
    import uuid as _uuid
    try:
        sid = _uuid.UUID(payload.session_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid session_id")

    session = await db.get(SessionModel, sid)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    assert_session_owner(session.user_id, current_user)

    try:
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            None, executor_fn, payload.session_id, payload.language
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Autofix: attempt to repair individual failing tests
    autofix_enabled = payload.autofix_enabled
    if autofix_enabled and result.get("failed", 0) > 0 and result.get("failures"):
        source_code = session.raw_code or ""
        autofix_summaries: list[dict] = []
        recovered = 0

        for failure in result.get("failures", []):
            test_code = failure.get("test_code") or failure.get("test_name", "")
            test_name = failure.get("test_name", "")
            error_output = failure.get("error_message", "") + "\n" + failure.get("traceback", "")

            if not test_code or not source_code:
                continue

            try:
                fix_result = await run_with_autofix(
                    source_code=source_code,
                    test_code=test_code,
                    test_function_name=test_name,
                    timeout=30,
                )
                failure["was_autofixed"] = fix_result["was_autofixed"]
                failure["autofix_attempts"] = fix_result["attempts"]
                failure["fix_history"] = fix_result["fix_history"]
                if fix_result["final_status"] == "passed":
                    failure["status"] = "passed"
                    recovered += 1
                if fix_result.get("final_source_code") and fix_result["final_source_code"] != source_code:
                    failure["source_was_modified"] = True
                    failure["fixed_source_code"] = fix_result["final_source_code"]
                autofix_summaries.append({
                    "test_name": test_name,
                    "final_status": fix_result["final_status"],
                    "attempts": fix_result["attempts"],
                    "was_autofixed": fix_result["was_autofixed"],
                })
            except Exception:
                logger.exception("autofix failed for test %s", test_name)

        if recovered > 0:
            result["passed"] = result.get("passed", 0) + recovered
            result["failed"] = max(0, result.get("failed", 0) - recovered)
        result["autofix_summaries"] = autofix_summaries

    test_run = TestRun(
        session_id=sid,
        run_type=run_type,
        total_tests=result.get("total", 0),
        passed=result.get("passed", 0),
        failed=result.get("failed", 0),
        results_json=result,
    )
    db.add(test_run)
    await db.commit()
    return result


@router.post("/run")
async def run(
    payload: SandboxRunRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> dict:
    """Execute generated tests in the isolated Docker sandbox and persist results."""
    return await _execute_and_persist(payload, db, current_user, run_tests, "combined")


@router.post("/run-unit")
async def run_unit(
    payload: SandboxRunRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> dict:
    """Execute only unit tests in the isolated Docker sandbox."""
    return await _execute_and_persist(payload, db, current_user, run_unit_tests, "unit")


@router.post("/run-integration")
async def run_integration(
    payload: SandboxRunRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> dict:
    """Execute only integration tests in the isolated Docker sandbox."""
    import uuid as _uuid
    try:
        sid = _uuid.UUID(payload.session_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid session_id")

    session = await db.get(SessionModel, sid)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    assert_session_owner(session.user_id, current_user)

    ast = session.ast_json or {}
    gates = ast.get("pipeline_gates") or {}
    if not gates.get("execute_integration_tests", True):
        eligibility = ast.get("eligibility") or {}
        reason = eligibility.get("integration_test_reason", "No integration boundaries detected.")
        raise HTTPException(status_code=400, detail=f"Integration test execution skipped: {reason}")

    return await _execute_and_persist(payload, db, current_user, run_integration_tests, "integration")
