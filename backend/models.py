import uuid
from datetime import datetime
from typing import Any

from cryptography.fernet import Fernet
from sqlalchemy import DateTime, ForeignKey, Float, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from database import Base


class EncryptedString(TypeDecorator):
    """Transparent Fernet encryption for a VARCHAR column."""

    impl = String
    cache_ok = True

    def _fernet(self) -> Fernet:
        from config import settings
        return Fernet(settings.FERNET_KEY.encode())

    def process_bind_param(self, value: str | None, dialect: Any) -> str | None:
        if value is None:
            return None
        return self._fernet().encrypt(value.encode()).decode()

    def process_result_value(self, value: str | None, dialect: Any) -> str | None:
        if value is None:
            return None
        return self._fernet().decrypt(value.encode()).decode()


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    github_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    avatar_url: Mapped[str] = mapped_column(String(2048), nullable=False, default="")
    access_token: Mapped[str] = mapped_column(EncryptedString(1024), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    sessions: Mapped[list["Session"]] = relationship(
        "Session", back_populates="user", cascade="all, delete-orphan"
    )


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    raw_code: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(String(32), nullable=False)
    user_story: Mapped[str | None] = mapped_column(Text, nullable=True)
    ast_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    pseudocode: Mapped[str | None] = mapped_column(Text)
    # Repository URL (when ingested from GitHub)
    repo_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    # Risk scoring fields
    risk_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    risk_level: Mapped[str | None] = mapped_column(String(16), nullable=True)
    risk_json: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    # Traceability
    traceability_map: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    # Per-test execution details (populated after sandbox run)
    test_cases: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)
    # Unit test artifacts (Step 4)
    unit_test_files: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)
    unit_coverage_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Integration test artifacts (Step 5)
    integration_test_files: Mapped[list[dict[str, Any]] | None] = mapped_column(JSON, nullable=True)
    integration_coverage_pct: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Separate traceability maps
    unit_traceability: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    integration_traceability: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(
        String(16), nullable=False, default="pending"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user: Mapped["User"] = relationship("User", back_populates="sessions")
    test_runs: Mapped[list["TestRun"]] = relationship(
        "TestRun", back_populates="session", cascade="all, delete-orphan"
    )


class TestRun(Base):
    __tablename__ = "test_runs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, index=True
    )
    run_type: Mapped[str] = mapped_column(String(16), nullable=False, default="combined")
    total_tests: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    passed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    results_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    report_html: Mapped[str | None] = mapped_column(Text)
    report_pdf_path: Mapped[str | None] = mapped_column(String(2048))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    session: Mapped["Session"] = relationship("Session", back_populates="test_runs")
