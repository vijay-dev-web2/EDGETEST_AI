"""Phase 2 — Coverage Extraction for EdgeTest AI.

Extracts all test-worthy coverage points from the tagged pseudocode
produced by Phase 1 and from the raw source code.  The output is a
``CoverageManifest`` that downstream phases (3–6) use to guarantee no
scenario is missed.

Coverage points extracted
-------------------------
* **Thresholds** — every comparison operator with a numeric threshold ``N``
  produces test values ``N-1``, ``N``, ``N+1``.
* **Guards** — every ``GUARD:`` tag in pseudocode produces a negative-test
  requirement.
* **Exceptions** — every ``THROWS`` tag produces an exception-test
  requirement.
* **Boolean returns** — every function returning ``bool`` produces two
  scenarios (true-path and false-path).

Public API
----------
extract_coverage(pseudocode, source_code, language) → CoverageManifest
"""

from __future__ import annotations

import json
import logging
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from chains.base import make_chain

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class ThresholdPoint(BaseModel):
    """A comparison operator and its boundary test values."""
    function_name: str = ""
    operator: str = Field(
        description="Comparison operator: <, <=, >, >=, ==, !="
    )
    threshold_value: float | int
    test_values: list[float | int] = Field(
        description="Boundary values: [N-1, N, N+1]"
    )
    description: str = ""


class GuardPoint(BaseModel):
    """An input validation guard that requires a negative test."""
    function_name: str = ""
    guard_condition: str = Field(
        description="The condition being guarded (e.g. 'input is not None')"
    )
    violation_input: str = Field(
        description="Example input that violates the guard"
    )
    expected_error: str = Field(
        description="Expected exception or error message"
    )


class ExceptionPoint(BaseModel):
    """A throw/raise that requires an exception test."""
    function_name: str = ""
    exception_type: str = Field(
        description="Exception class (e.g. ValueError, IllegalArgumentException)"
    )
    trigger_condition: str = Field(
        description="Condition that triggers the exception"
    )
    trigger_input: str = Field(
        description="Example input that triggers the exception"
    )


class BooleanPath(BaseModel):
    """A boolean return that requires both true-path and false-path tests."""
    function_name: str = ""
    true_condition: str = ""
    false_condition: str = ""
    true_example_input: str = ""
    false_example_input: str = ""


class CoverageManifest(BaseModel):
    """Complete set of coverage points extracted from pseudocode + source."""
    thresholds: list[ThresholdPoint] = Field(default_factory=list)
    guards: list[GuardPoint] = Field(default_factory=list)
    exceptions: list[ExceptionPoint] = Field(default_factory=list)
    boolean_returns: list[BooleanPath] = Field(default_factory=list)
    total_required_tests: int = Field(
        default=0,
        description="Computed minimum test count from all coverage points"
    )


# ---------------------------------------------------------------------------
# System prompt
# ---------------------------------------------------------------------------

_COVERAGE_SYSTEM = """\
You are a test coverage analyst. Given pseudocode and source code, extract \
ALL test-worthy coverage points. Be exhaustive — every comparison, guard, \
exception, and boolean return must be captured.

EXTRACTION RULES:

1. THRESHOLDS — for every comparison operator (>, >=, <, <=, ==, !=) with \
a numeric threshold N, output:
   - The operator and threshold value
   - test_values: [N-1, N, N+1] (integer boundaries)
   - Example: "balance >= 0" → operator=">=", threshold_value=0, \
test_values=[-1, 0, 1]

2. GUARDS — for every input validation check (GUARD tags in pseudocode, \
or explicit null/type/range checks in source):
   - The guard condition and what input violates it
   - The expected error when the guard fails

3. EXCEPTIONS — for every throw/raise statement (THROWS tags in pseudocode):
   - The exception type (ValueError, TypeError, etc.)
   - What condition triggers it
   - Example input that triggers it

4. BOOLEAN RETURNS — for every function that returns a boolean (True/False, \
true/false):
   - Condition for the true path and an example input
   - Condition for the false path and an example input

5. TOTAL COUNT — compute total_required_tests as:
   thresholds×3 (N-1, N, N+1 each) + guards×1 + exceptions×1 \
+ boolean_returns×2 (true+false)

Return a JSON object with EXACTLY these keys:
  "thresholds": array of {function_name, operator, threshold_value, \
test_values, description}
  "guards": array of {function_name, guard_condition, violation_input, \
expected_error}
  "exceptions": array of {function_name, exception_type, trigger_condition, \
trigger_input}
  "boolean_returns": array of {function_name, true_condition, \
false_condition, true_example_input, false_example_input}
  "total_required_tests": integer

Return only valid JSON. No markdown fences, no commentary.\
"""


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def extract_coverage(
    pseudocode: str,
    source_code: str,
    language: str,
) -> CoverageManifest:
    """Extract coverage points from pseudocode and source code.

    Parameters
    ----------
    pseudocode : str
        Tagged pseudocode from Phase 1 (with GUARD: and THROWS tags).
    source_code : str
        Raw source code string.
    language : str
        Programming language identifier.

    Returns
    -------
    CoverageManifest
        All extracted coverage points with computed minimum test count.
    """
    chain = make_chain(
        _COVERAGE_SYSTEM,
        temperature=0.0,
        json_mode=True,
        label="coverage_extract",
    )

    human_input = (
        f"Language: {language}\n\n"
        f"Pseudocode (with GUARD: and THROWS tags):\n{pseudocode}\n\n"
        f"Source code:\n```{language}\n{source_code}\n```"
    )

    response = await chain.ainvoke({"input": human_input})

    try:
        data = json.loads(response.content)
    except json.JSONDecodeError as exc:
        logger.warning("Coverage extraction returned non-JSON, using empty manifest: %s", exc)
        return CoverageManifest()

    try:
        manifest = CoverageManifest.model_validate(data)
    except ValidationError as exc:
        logger.warning("Coverage extraction validation failed, using empty manifest: %s", exc)
        return CoverageManifest()

    # Recompute total_required_tests deterministically to override any LLM drift
    manifest.total_required_tests = (
        len(manifest.thresholds) * 3
        + len(manifest.guards)
        + len(manifest.exceptions)
        + len(manifest.boolean_returns) * 2
    )

    return manifest
