"""Classifier that detects whether a test file contains unit tests or integration tests.

Used after integration test generation to flag any unit-style tests that slipped through.
"""

from __future__ import annotations

import re
from typing import Literal

TestType = Literal["unit", "integration", "ambiguous"]

# Patterns that strongly indicate multi-service/workflow integration-level tests
_INTEGRATION_PATTERNS: list[str] = [
    r"def\s+test_.*_flow\b",           # test_*_flow naming
    r"def\s+test_.*_workflow\b",        # test_*_workflow naming
    r"def\s+test_.*_cycle\b",           # test_*_cycle naming
    r"def\s+test_.*_integration\b",     # explicit integration name
    r"transaction_log",                 # simulated transaction repository
    r"mock_repo|MockRepository",        # repository mock
    r"MockNotifier|mock_notifier",      # notifier mock
    r"Services involved",               # docstring integration marker
    r"account_[ab]\s*=",               # multi-account pattern
    r"account_a\..*\naccount_b\.",     # two-account interaction
]

# Patterns that indicate single-function unit-level tests
_UNIT_PATTERNS: list[str] = [
    r"def\s+test_deposit_\w+_amount",   # deposit single method test
    r"def\s+test_withdraw_\w+_amount",  # withdraw single method test
    r"def\s+test_get_balance_",         # get_balance test
    r"def\s+test_\w+_raises_value",     # exception tests (usually unit)
    r"def\s+test_\w+_returns_\w+",     # return value tests (usually unit)
    r"pytest\.raises",                  # exception assertion (usually unit)
]

# Names that are definitively unit tests for the BankAccount example
_UNIT_TEST_NAMES: frozenset[str] = frozenset({
    "test_deposit_positive_amount_increases_balance",
    "test_withdraw_valid_amount_decreases_balance",
    "test_deposit_negative_amount_raises_value_error",
    "test_withdraw_negative_amount_raises_value_error",
    "test_withdraw_excessive_amount_raises_value_error",
    "test_get_balance_returns_correct_balance",
    "test_withdraw_amount_exceeding_balance_raises_value_error",
    "test_withdraw_zero_amount_raises_value_error",
    "test_deposit_zero_amount_raises_value_error",
})


def classify_test_file(test_code: str) -> dict:
    """Classify whether a test file contains unit or integration tests."""
    integration_score = 0
    unit_score = 0
    integration_matches: list[str] = []
    unit_matches: list[str] = []

    for pattern in _INTEGRATION_PATTERNS:
        if re.search(pattern, test_code, re.IGNORECASE | re.MULTILINE):
            integration_score += 1
            integration_matches.append(pattern)

    for pattern in _UNIT_PATTERNS:
        if re.search(pattern, test_code, re.IGNORECASE | re.MULTILINE):
            unit_score += 1
            unit_matches.append(pattern)

    # Count known unit test function names present in this file
    found_unit_names = [
        name for name in _UNIT_TEST_NAMES
        if re.search(rf"\bdef\s+{re.escape(name)}\b", test_code)
    ]
    if found_unit_names:
        unit_score += len(found_unit_names) * 2  # strong signal

    # Count distinct class instantiations (BankAccount(), MockX(), etc.)
    class_inits = len(re.findall(r"\b[A-Z][a-zA-Z]+\(", test_code))
    if class_inits >= 3:
        integration_score += 1

    # Detect multi-step Act sections (3+ consecutive operations)
    act_sections = re.findall(
        r"# --- Act ---.*?# --- Assert ---", test_code, re.DOTALL
    )
    for act in act_sections:
        method_calls = re.findall(r"\.\w+\(", act)
        if len(method_calls) >= 3:
            integration_score += 1

    if integration_score > unit_score and integration_score >= 2:
        test_type: TestType = "integration"
    elif unit_score > 0 and integration_score <= 1:
        test_type = "unit"
    else:
        test_type = "ambiguous"

    return {
        "classification": test_type,
        "unit_score": unit_score,
        "integration_score": integration_score,
        "unit_indicators": unit_matches,
        "integration_indicators": integration_matches,
        "found_unit_test_names": found_unit_names,
        "is_misclassified": False,
        "recommendation": (
            "These appear to be UNIT TESTS — should be in the unit test pipeline."
            if test_type == "unit"
            else (
                "These appear to be INTEGRATION TESTS — correct placement."
                if test_type == "integration"
                else "Classification ambiguous — review manually."
            )
        ),
    }


def validate_integration_tests(test_code: str) -> dict:
    """Validate that a supposed integration test file actually contains integration tests.

    Returns a classification dict. If the file contains unit tests in disguise,
    ``is_misclassified`` is set to True along with an error message.
    """
    result = classify_test_file(test_code)

    if result["classification"] == "unit":
        result["is_misclassified"] = True
        names = ", ".join(result["found_unit_test_names"][:3])
        suffix = "…" if len(result["found_unit_test_names"]) > 3 else ""
        result["error"] = (
            "MISCLASSIFICATION DETECTED: This file contains unit tests placed in the "
            "integration test pipeline. "
            + (f"Unit tests found: {names}{suffix}. " if names else "")
            + "Unit tests test single functions in isolation. "
            "Integration tests must span multiple services, objects, or workflow steps."
        )
        result["corrective_action"] = (
            "Move these tests to the Unit Test pipeline. "
            "Regenerate integration tests that test multi-step workflows "
            "involving multiple objects or service boundaries."
        )

    return result
