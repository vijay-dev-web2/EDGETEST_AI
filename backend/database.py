from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    pool_pre_ping=True,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def init_db() -> None:
    """Create all tables (dev convenience — use Alembic migrations in production)."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add columns introduced after initial schema; safe to re-run (IF NOT EXISTS).
        await conn.execute(text(
            "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_story TEXT"
        ))
        await conn.execute(text(
            "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS repo_url VARCHAR(2048)"
        ))
        await conn.execute(text(
            "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS test_cases JSON"
        ))
        await conn.execute(text(
            "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS unit_test_files JSON"
        ))
        await conn.execute(text(
            "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS unit_coverage_pct FLOAT"
        ))
        await conn.execute(text(
            "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS integration_test_files JSON"
        ))
        await conn.execute(text(
            "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS integration_coverage_pct FLOAT"
        ))
        await conn.execute(text(
            "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS unit_traceability JSON"
        ))
        await conn.execute(text(
            "ALTER TABLE sessions ADD COLUMN IF NOT EXISTS integration_traceability JSON"
        ))
        await conn.execute(text(
            "ALTER TABLE test_runs ADD COLUMN IF NOT EXISTS run_type VARCHAR(16) DEFAULT 'combined'"
        ))


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that yields a transactional AsyncSession."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
