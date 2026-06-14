"""Coverage gate — checks whether test coverage meets the configured threshold."""

from __future__ import annotations

from typing import Optional

from config import settings


def check_coverage_gate(
    unit_coverage_percent: float,
    integration_coverage_percent: Optional[float] = None,
    custom_threshold: Optional[int] = None,
) -> dict:
    threshold = custom_threshold if custom_threshold is not None else settings.COVERAGE_THRESHOLD
    enabled = settings.COVERAGE_THRESHOLD_ENABLED

    unit_passed = unit_coverage_percent >= threshold

    integration_passed = True
    if integration_coverage_percent is not None:
        integration_passed = integration_coverage_percent >= threshold

    overall_passed = unit_passed and integration_passed

    reasons: list[str] = []
    if not unit_passed:
        gap = threshold - unit_coverage_percent
        reasons.append(
            f"Unit test coverage {unit_coverage_percent:.1f}% is below "
            f"threshold {threshold}% (gap: {gap:.1f}%)"
        )
    if not integration_passed and integration_coverage_percent is not None:
        gap = threshold - integration_coverage_percent
        reasons.append(
            f"Integration test coverage {integration_coverage_percent:.1f}% "
            f"is below threshold {threshold}% (gap: {gap:.1f}%)"
        )

    recommendation: Optional[str] = None
    if not unit_passed:
        gap = threshold - unit_coverage_percent
        if gap <= 5:
            recommendation = (
                f"Coverage is close ({gap:.1f}% gap). Add tests for the "
                f"uncovered functions shown in the Traceability Map."
            )
        elif gap <= 15:
            recommendation = (
                f"Coverage gap is {gap:.1f}%. Focus on high-risk uncovered "
                f"functions first."
            )
        else:
            recommendation = (
                f"Coverage gap is {gap:.1f}%. Consider generating tests for "
                f"all uncovered functions or lowering the threshold temporarily."
            )

    return {
        "passed": overall_passed,
        "blocked": not overall_passed and enabled,
        "threshold_enabled": enabled,
        "unit_coverage": round(unit_coverage_percent, 1),
        "integration_coverage": (
            round(integration_coverage_percent, 1)
            if integration_coverage_percent is not None
            else None
        ),
        "threshold": threshold,
        "reasons": reasons,
        "recommendation": recommendation,
    }
