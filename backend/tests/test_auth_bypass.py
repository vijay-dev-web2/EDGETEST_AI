"""Security regression tests for the dev auth bypass token.

The `dev-mock-token` bypass authenticates as a fixed test user without
contacting Supabase. It must work only outside production (gated on APP_ENV).
These tests lock that behaviour in so the bypass can never silently leak back
into production.
"""
import asyncio

import auth
from config import settings


def _verify(token: str):
    return asyncio.run(auth.verify_supabase_token(token))


def test_bypass_allowed_in_development(monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "development")
    payload = _verify(auth.DEV_BYPASS_TOKEN)
    assert payload is not None
    assert payload["email"] == "test@test.com"


def test_bypass_allowed_in_staging(monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "staging")
    assert _verify(auth.DEV_BYPASS_TOKEN) is not None


def test_bypass_rejected_in_production(monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "production")
    assert _verify(auth.DEV_BYPASS_TOKEN) is None


def test_bypass_rejected_in_production_case_insensitive(monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "Production")
    assert _verify(auth.DEV_BYPASS_TOKEN) is None
