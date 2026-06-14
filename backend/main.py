"""EdgeTest AI — FastAPI application entry point.

Wires up all routers, configures CORS and logging, initialises the database
on startup, and exposes the /health and /api/status/{session_id} utility
endpoints used by the frontend to poll pipeline progress.
"""

import logging
import uuid
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from config import settings
from database import AsyncSessionLocal, get_db, init_db
from models import Session as SessionModel, TestRun, User
from routers import analyze, auth, export, ingest, metrics, report
from routers.sandbox import router as sandbox_router
from routers.story import router as story_router

logger = logging.getLogger(__name__)


def _configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _configure_logging()
    logger.info("Starting EdgeTest AI (env=%s)", settings.APP_ENV)
    await init_db()
    yield
    logger.info("Shutdown complete")


app = FastAPI(
    title="EdgeTest AI",
    version="0.1.0",
    lifespan=lifespan,
)



app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(ingest.router, prefix="/api/ingest", tags=["ingest"])
app.include_router(analyze.router, prefix="/api/analyze", tags=["analyze"])
app.include_router(export.router, prefix="/api/export", tags=["export"])
app.include_router(report.router, prefix="/api/report", tags=["report"])
app.include_router(sandbox_router, prefix="/api/sandbox", tags=["sandbox"])
app.include_router(metrics.router, prefix="/api/metrics", tags=["metrics"])
app.include_router(story_router, prefix="/api/story", tags=["story"])


@app.get("/api/status/{session_id}")
async def get_session_status(
    session_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Poll endpoint for the frontend to track pipeline and sandbox progress.

    Returns the session status, any intermediate results persisted so far,
    and the latest test run summary if the sandbox has been executed.
    """
    session = await db.get(SessionModel, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Derive which pipeline steps have completed from what's been persisted.
    ast = session.ast_json or {}
    steps_completed: list[str] = []
    if "completeness" in ast:
        steps_completed.append("completeness")
    if session.pseudocode:
        steps_completed.append("pseudocode")
    if "scenarios" in ast:
        steps_completed.append("discovery")
    if session.status == "complete":
        steps_completed.append("codegen")

    result = await db.execute(
        select(TestRun)
        .where(TestRun.session_id == session_id)
        .order_by(TestRun.created_at.desc())
        .limit(1)
    )
    test_run = result.scalar_one_or_none()

    return {
        "session_id": str(session_id),
        "status": session.status,
        "language": session.language,
        "steps_completed": steps_completed,
        "pseudocode": session.pseudocode,
        "scenarios": ast.get("scenarios"),
        "completeness": ast.get("completeness"),
        "eligibility": ast.get("eligibility"),
        "pipeline_gates": ast.get("pipeline_gates"),
        "test_run": {
            "id": str(test_run.id),
            "total_tests": test_run.total_tests,
            "passed": test_run.passed,
            "failed": test_run.failed,
            "pass_rate": round(test_run.passed / test_run.total_tests * 100, 1)
            if test_run.total_tests > 0
            else 0.0,
            "created_at": test_run.created_at.isoformat(),
        }
        if test_run is not None
        else None,
    }


@app.get("/")
async def root() -> JSONResponse:
    return JSONResponse({"service": "EdgeTest AI API", "docs": "/docs"})


@app.get("/favicon.ico", include_in_schema=False)
async def favicon() -> Response:
    return Response(status_code=204)


@app.get("/health")
async def health_check() -> dict:
    checks: dict[str, str] = {}

    try:
        async with AsyncSessionLocal() as db:
            await db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        logger.exception("Health check: database unreachable")
        checks["database"] = "error"

    try:
        import redis.asyncio as aioredis

        r = aioredis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        await r.ping()
        await r.aclose()
        checks["redis"] = "ok"
    except Exception:
        logger.exception("Health check: redis unreachable")
        checks["redis"] = "error"

    overall = "ok" if all(v == "ok" for v in checks.values()) else "degraded"
    return {"status": overall, **checks}
