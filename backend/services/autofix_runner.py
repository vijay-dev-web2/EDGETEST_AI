"""Run a test, and if it fails, call the LLM autofix chain up to MAX_ATTEMPTS times."""

from __future__ import annotations

import os
import subprocess
import tempfile

from chains.autofix import autofix_test

MAX_ATTEMPTS = 3


async def run_with_autofix(
    source_code: str,
    test_code: str,
    test_function_name: str,
    timeout: int = 30,
) -> dict:
    current_test = test_code
    current_source = source_code
    attempts: list[dict] = []
    result: dict = {}

    for attempt_num in range(1, MAX_ATTEMPTS + 1):
        result = _run_single_test(current_source, current_test, timeout)

        if result["status"] == "passed":
            return {
                "final_status": "passed",
                "attempts": attempt_num,
                "fix_history": attempts,
                "final_test_code": current_test,
                "final_source_code": current_source,
                "was_autofixed": attempt_num > 1,
            }

        if attempt_num == MAX_ATTEMPTS:
            break

        fix = await autofix_test(
            source_code=current_source,
            test_code=current_test,
            error_output=result["error_output"],
            previous_attempts=attempts,
        )

        attempts.append({
            "attempt": attempt_num,
            "error": result["error_output"][:500],
            "fix_explanation": fix.get("fix_explanation"),
            "fault_location": fix.get("fault_location"),
            "result": "failed — retrying",
        })

        current_test = fix.get("fixed_test_code", current_test)
        if fix.get("fixed_source_code"):
            current_source = fix["fixed_source_code"]

    return {
        "final_status": "failed",
        "attempts": MAX_ATTEMPTS,
        "fix_history": attempts,
        "final_test_code": current_test,
        "final_source_code": current_source,
        "was_autofixed": False,
        "last_error": result.get("error_output", ""),
    }


def _run_single_test(source_code: str, test_code: str, timeout: int) -> dict:
    with tempfile.TemporaryDirectory() as tmpdir:
        with open(os.path.join(tmpdir, "source.py"), "w") as f:
            f.write(source_code)
        with open(os.path.join(tmpdir, "test_autofix.py"), "w") as f:
            f.write(test_code)

        try:
            proc = subprocess.run(
                ["pytest", "test_autofix.py", "--tb=short", "-q"],
                capture_output=True,
                text=True,
                timeout=timeout,
                cwd=tmpdir,
            )
        except subprocess.TimeoutExpired:
            return {"status": "failed", "error_output": "Test timed out"}

        passed = proc.returncode == 0
        return {
            "status": "passed" if passed else "failed",
            "error_output": (proc.stdout + proc.stderr)[:2000] if not passed else "",
        }
