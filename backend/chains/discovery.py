from __future__ import annotations

import json
import logging
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError

from chains.base import make_chain
from chains.coverage_extract import CoverageManifest

logger = logging.getLogger(__name__)

_BASE_SYSTEM = (
    "You are a production-grade automated test analyzer. Your primary objective is "
    "to analyze the provided source code and identify the high-level CATEGORIES of tests "
    "that are applicable. Do NOT generate specific test scenarios or test code. "
    "Instead, provide a list of test categories that would be relevant for this code.\n\n"
    "Common test categories include: Positive Flow, Negative Flow, Boundary Value, "
    "Edge Cases, Null/Empty Input, Invalid Input, Exception Handling, Security Validation, "
    "Performance Scenarios, Unit Tests, and Integration Tests.\n\n"
    "Return a JSON object with exactly two keys: \"coverage_report\" and \"categories\".\n\n"
    "The \"coverage_report\" object must have EXACTLY these fields:\n"
    '  "branch_coverage": integer 0-100 (estimate based on code complexity)\n'
    '  "guard_coverage": integer 0-100\n'
    '  "bva_coverage": integer 0-100\n'
    '  "exception_coverage": integer 0-100\n\n'
    "The \"categories\" array elements must have EXACTLY these fields:\n"
    '  "name": string — category name (e.g., "Boundary Value", "Exception Handling")\n'
    '  "type": one of "unit", "integration", "edge", "negative", "business_rule", "smoke", "security", "mutation"\n'
    '  "description": string — what this category of tests will cover in the provided code\n'
    '  "estimated_count": integer — rough estimate of how many specific tests this category requires\n'
    '  "relevant_functions": array of strings — names of functions this category applies to\n\n'
    "Return only valid JSON. No markdown fences."
)

_RISK_HIGH_EXTRA = (
    "The code has been assessed as HIGH RISK. Ensure categories for security, mutation, "
    "and exhaustive edge cases are included."
)

_RISK_MEDIUM_EXTRA = (
    "The code has been assessed as MEDIUM RISK. Include categories for edge cases and negative flows."
)

_RISK_LOW_EXTRA = (
    "The code has been assessed as LOW RISK. Focus on unit and smoke test categories."
)

class TestCategory(BaseModel):
    name: str = Field(min_length=1)
    type: Literal["unit", "integration", "edge", "negative", "business_rule", "smoke", "security", "mutation"]
    description: str = Field(min_length=1)
    estimated_count: int = 1
    relevant_functions: list[str] = Field(default_factory=list)

class CoverageReport(BaseModel):
    branch_coverage: int = Field(ge=0, le=100)
    guard_coverage: int = Field(ge=0, le=100)
    bva_coverage: int = Field(ge=0, le=100)
    exception_coverage: int = Field(ge=0, le=100)

class DiscoveryResult(BaseModel):
    coverage_report: CoverageReport
    categories: list[TestCategory]
    total_scenario_count: int = 0

async def discover_scenarios(
    code: str,
    pseudocode: str,
    ast_json: dict[str, Any],
    user_story: str | None = None,
    risk_level: str | None = None,
    high_risk_functions: list[str] | None = None,
    module_graph: dict[str, Any] | None = None,
    coverage_manifest: CoverageManifest | None = None,
) -> DiscoveryResult:
    risk_extra = ""
    if risk_level == "high":
        risk_extra = f"\n\n{_RISK_HIGH_EXTRA}"
    elif risk_level == "medium":
        risk_extra = f"\n\n{_RISK_MEDIUM_EXTRA}"
    elif risk_level == "low":
        risk_extra = f"\n\n{_RISK_LOW_EXTRA}"

    story_ctx = f"\n\nUser Story:\n{user_story}" if user_story else ""
    hrfs = f"\n\nHigh-Risk Functions: {', '.join(high_risk_functions)}" if high_risk_functions else ""

    system = _BASE_SYSTEM + risk_extra
    chain = make_chain(system, temperature=0.2, json_mode=True, label="discovery")

    human_input = (
        f"Source code:\n```\n{code}\n```\n\n"
        f"Pseudocode:\n{pseudocode}\n\n"
        f"Code structure (AST):\n{json.dumps(ast_json, indent=2)}"
        f"{story_ctx}"
        f"{hrfs}"
    )

    response = await chain.ainvoke({"input": human_input})

    try:
        data = json.loads(response.content)
    except json.JSONDecodeError as exc:
        raise ValueError(f"LLM returned non-JSON: {response.content!r}") from exc

    try:
        result = DiscoveryResult.model_validate(data)
    except ValidationError as exc:
        raise ValueError(f"LLM response failed validation: {exc}") from exc

    result.total_scenario_count = sum(c.estimated_count for c in result.categories)
    logger.info("Discovery complete: total_estimated_scenarios=%d", result.total_scenario_count)

    return result
