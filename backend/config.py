from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List


class Settings(BaseSettings):
    # App
    APP_ENV: str = "development"
    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://user:password@localhost:5432/edgetest"
    # Run `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` to generate
    FERNET_KEY: str = ""

    # Redis / Celery
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/1"

    # Docker sandbox
    SANDBOX_IMAGE: str = "python:3.12-slim"
    SANDBOX_TIMEOUT: int = 30

    # Coverage threshold
    COVERAGE_THRESHOLD: int = 80
    COVERAGE_THRESHOLD_ENABLED: bool = True

    # LLM
    OPENAI_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    LLM_MODEL: str = "gpt-4o"
    LLM_TEMPERATURE: float = 0.2

    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""
    SUPABASE_JWT_SECRET: str = ""

    # GitHub OAuth
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    GITHUB_TOKEN: str = ""  # Optional PAT for ingest — raises rate limit to 5000/hr

    # Frontend
    FRONTEND_URL: str = "http://localhost:3000"

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000"]

    model_config = SettingsConfigDict(
        extra="ignore",
        env_file=".env",
        env_file_encoding="utf-8",
    )


settings = Settings()
