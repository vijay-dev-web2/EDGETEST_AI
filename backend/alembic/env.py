import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

# ---------------------------------------------------------------------------
# Alembic config object — provides access to values in alembic.ini
# ---------------------------------------------------------------------------
config = context.config

# Wire Python logging from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ---------------------------------------------------------------------------
# Import app modules so Alembic sees all models via Base.metadata
# ---------------------------------------------------------------------------
from database import Base  # noqa: E402
import models  # noqa: E402, F401  — registers User, Session, TestRun on Base

target_metadata = Base.metadata

# Pull the live DATABASE_URL from our config instead of alembic.ini
from config import settings  # noqa: E402

DATABASE_URL = settings.DATABASE_URL


# ---------------------------------------------------------------------------
# Offline migrations (generate SQL without a live DB connection)
# ---------------------------------------------------------------------------

def run_migrations_offline() -> None:
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


# ---------------------------------------------------------------------------
# Online migrations (run against a live async engine)
# ---------------------------------------------------------------------------

def do_run_migrations(connection):
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = create_async_engine(DATABASE_URL, future=True)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
