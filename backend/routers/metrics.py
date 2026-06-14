from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db

router = APIRouter()


@router.get("")
async def get_metrics(db: AsyncSession = Depends(get_db)) -> dict:
    """Aggregate stats across all sessions and test runs."""

    total_sessions = (await db.execute(text("SELECT COUNT(*) FROM sessions"))).scalar() or 0

    sessions_today = (
        await db.execute(
            text("SELECT COUNT(*) FROM sessions WHERE created_at >= NOW() - INTERVAL '24 hours'")
        )
    ).scalar() or 0

    lang_rows = (
        await db.execute(
            text("SELECT language, COUNT(*) AS cnt FROM sessions GROUP BY language ORDER BY cnt DESC")
        )
    ).fetchall()
    language_breakdown = {row.language: int(row.cnt) for row in lang_rows}

    # Completeness score is stored as ast_json -> 'completeness' -> 'completeness_score' (float 0–1)
    avg_completeness_raw = (
        await db.execute(
            text(
                "SELECT AVG((ast_json->'completeness'->>'completeness_score')::float) "
                "FROM sessions WHERE ast_json->'completeness' IS NOT NULL"
            )
        )
    ).scalar()
    avg_completeness = round((avg_completeness_raw or 0.0) * 100, 1)

    avg_tests_raw = (
        await db.execute(text("SELECT AVG(total_tests) FROM test_runs WHERE total_tests > 0"))
    ).scalar()
    avg_tests = round(avg_tests_raw or 0.0, 1)

    pass_row = (
        await db.execute(
            text("SELECT SUM(passed)::float, SUM(total_tests)::float FROM test_runs")
        )
    ).fetchone()
    passed_sum = float(pass_row[0] or 0)
    total_sum = float(pass_row[1] or 0)
    pass_rate = round(passed_sum / total_sum * 100, 1) if total_sum > 0 else 0.0

    total_test_runs = (await db.execute(text("SELECT COUNT(*) FROM test_runs"))).scalar() or 0

    # Top scenario names from the last 20 sessions (quick approximation)
    scenario_rows = (
        await db.execute(
            text(
                "SELECT ast_json->'scenarios' AS scenarios FROM sessions "
                "WHERE ast_json->'scenarios' IS NOT NULL ORDER BY created_at DESC LIMIT 20"
            )
        )
    ).fetchall()
    scenario_counts: dict[str, int] = {}
    for row in scenario_rows:
        scenarios = row.scenarios or []
        for s in scenarios:
            name = s.get("name", "") if isinstance(s, dict) else ""
            if name:
                scenario_counts[name] = scenario_counts.get(name, 0) + 1
    top_scenarios = sorted(scenario_counts.items(), key=lambda x: x[1], reverse=True)[:5]

    return {
        "total_sessions": int(total_sessions),
        "sessions_today": int(sessions_today),
        "total_test_runs": int(total_test_runs),
        "language_breakdown": language_breakdown,
        "avg_completeness_score": avg_completeness,
        "avg_tests_generated": avg_tests,
        "pass_rate": pass_rate,
        "top_scenarios": [{"name": n, "count": c} for n, c in top_scenarios],
    }
