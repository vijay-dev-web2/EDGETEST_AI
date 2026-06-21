"""
Eligibility Scanner — runs during Step 2 (Analyze).
Inspects source code and determines which pipeline stages are valid.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any

from chains.base import make_chain

logger = logging.getLogger(__name__)

ELIGIBILITY_SYSTEM = """You are a senior software architect performing a test eligibility analysis.
Inspect the source code provided and produce a precise eligibility report in JSON format.

Scan the code for the following:

UNIT TEST ELIGIBILITY:
  A file is eligible for unit tests if it contains ANY of:
  - Functions with logic (conditions, loops, calculations)
  - Classes with methods
  - Input validation
  - Exception handling
  - Return value computation
  - State changes within a single object
  Even a single function qualifies. Almost all code is unit-testable.

INTEGRATION TEST ELIGIBILITY:
  A file is eligible for integration tests ONLY IF it contains
  at least ONE real architectural boundary from this list:
  ✓ Database access (SQLAlchemy, psycopg2, pymongo, sqlite3, etc.)
  ✓ HTTP client calls (requests, httpx, aiohttp, fetch, axios)
  ✓ File system operations (open(), fs.readFile, os.path, pathlib)
  ✓ Message queue (pika, celery, redis, kafka, boto3 SQS)
  ✓ External API client (stripe, sendgrid, twilio, boto3, etc.)
  ✓ Two or more DISTINCT service/repository/module classes
    interacting with each other (not two instances of the same class)
  ✓ Framework routing (FastAPI router, Flask route, Express route)
    wired to a real service class
  ✓ Cache layer (Redis, Memcached)
  ✓ Authentication service (OAuth, JWT validator, session store)

  DO NOT mark as integration-eligible:
  ✗ A Python list or dict used as storage
  ✗ Multiple instances of the same class
  ✗ Long workflows within a single class
  ✗ Methods calling other methods of the same object

REQUIRED OUTPUT FORMAT
Return ONLY a valid JSON object matching this structure:
{
  "unit_test_eligible": true | false,
  "unit_test_reason": "one sentence explaining why unit tests are or are not possible",
  "unit_test_targets": [
    {
      "name": "function or class name",
      "type": "function | class | method",
      "test_categories": ["positive", "negative", "boundary", "exception", "edge"]
    }
  ],
  "integration_test_eligible": true | false,
  "integration_test_reason": "one sentence explaining why integration tests are or are not possible",
  "integration_boundaries": [
    {
      "boundary_type": "database | http | filesystem | queue | service_to_service | api_route | cache | auth",
      "description": "what exactly creates this boundary",
      "components_involved": ["ComponentA", "ComponentB"],
      "test_scenario": "one sentence describing a valid integration test"
    }
  ],
  "architecture_summary": "2-3 sentences describing the overall architecture of the code",
  "components": [
    {
      "name": "class or module name",
      "type": "class | function | module | service | repository | controller",
      "dependencies": ["list of external dependencies this component has"],
      "complexity": "low | medium | high"
    }
  ],
  "recommended_test_plan": {
    "unit_tests_to_generate": 0,
    "integration_tests_to_generate": 0,
    "estimated_coverage": "percentage string e.g. 85%",
    "priority_order": ["step names in recommended execution order"],
    "skipped_steps": [
      {
        "step": "step name",
        "reason": "plain English reason why this step is skipped"
      }
    ]
  },
  "user_message": "A friendly 2-3 sentence plain English summary for the user explaining what was found, what will run, and what will be skipped and why."
}
"""


def _build_boundary_hint(module_graph: dict[str, Any] | None) -> str:
    """Render AST-detected service boundaries as an LLM hint.

    Mirrors how risk_scoring injects AST-derived security_hints. The module
    graph's `integration_boundaries` are real cross-module service-to-service
    calls found by static analysis — strong evidence for integration eligibility.
    Returns an empty string when no graph / no boundaries are available.
    """
    if not module_graph:
        return ""
    boundaries = module_graph.get("integration_boundaries") or []
    if not boundaries:
        return ""
    lines = "\n".join(
        f"  - {b.get('from', '?')} → {b.get('to', '?')} ({b.get('type', 'service_call')})"
        for b in boundaries
    )
    return (
        "\n\nAST-DETECTED SERVICE BOUNDARIES (static-analysis hint — these are real "
        "cross-module service calls found in the code. Treat them as strong evidence "
        "of integration_test_eligible=true and reflect them in integration_boundaries):\n"
        f"{lines}"
    )


async def scan_eligibility(
    source_code: str,
    file_name: str = "unknown",
    language: str = "python",
    module_graph: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Scans source code and returns an EligibilityReport dict.

    When *module_graph* (from module_graph.build_module_graph) is provided, its
    detected service-to-service boundaries are injected as an extra hint for the
    LLM. Passing None preserves the original behaviour exactly (backward compatible).
    """
    chain = make_chain(ELIGIBILITY_SYSTEM, temperature=0.1, json_mode=True, label="eligibility")

    human_input = (
        f"FILE NAME: {file_name}\n"
        f"LANGUAGE: {language}\n\n"
        f"SOURCE CODE:\n"
        f"```{language}\n"
        f"{source_code}\n"
        f"```"
        f"{_build_boundary_hint(module_graph)}"
    )

    try:
        response = await chain.ainvoke({"input": human_input})
        clean = response.content.strip()
        if clean.startswith("```"):
            clean = re.sub(r"^```[a-z]*\n?", "", clean)
            clean = re.sub(r"\n?```$", "", clean)
        clean = clean.strip()
        return json.loads(clean)
    except Exception as e:
        logger.exception("Error scanning eligibility, using safe default fallback")
        return {
            "unit_test_eligible": True,
            "unit_test_reason": "Defaulting to eligible — parse or LLM error occurred",
            "unit_test_targets": [],
            "integration_test_eligible": False,
            "integration_test_reason": f"Could not parse eligibility response: {e}",
            "integration_boundaries": [],
            "architecture_summary": "Unknown architecture — analysis failed",
            "components": [],
            "recommended_test_plan": {
                "unit_tests_to_generate": 0,
                "integration_tests_to_generate": 0,
                "estimated_coverage": "unknown",
                "priority_order": [],
                "skipped_steps": [
                    {"step": "Generate Integration Tests", "reason": "Error during eligibility scan"},
                    {"step": "Execute Integration Tests", "reason": "Error during eligibility scan"}
                ]
            },
            "user_message": "Analysis encountered an error. Unit tests will proceed. Integration tests skipped."
        }


def get_pipeline_gates(eligibility: dict[str, Any]) -> dict[str, bool]:
    """Converts eligibility report into a simple gate map."""
    return {
        "ingest": True,
        "analyze": True,
        "risk_score": True,
        "generate_unit_tests": eligibility.get("unit_test_eligible", True),
        "generate_integration_tests": eligibility.get("integration_test_eligible", False),
        "traceability": True,
        "execute_unit_tests": eligibility.get("unit_test_eligible", True),
        "execute_integration_tests": eligibility.get("integration_test_eligible", False),
        "report": True,
    }
