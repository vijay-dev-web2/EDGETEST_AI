"""Security regression tests for resource authorization and the prod config guard."""
import uuid

import pytest
from fastapi import HTTPException

import auth
from config import Settings, validate_production_settings


class _FakeUser:
    def __init__(self, uid):
        self.id = uid


# --- assert_session_owner (IDOR) ------------------------------------------

def test_owner_allowed():
    uid = uuid.uuid4()
    auth.assert_session_owner(uid, _FakeUser(uid))  # no raise


def test_non_owner_denied():
    with pytest.raises(HTTPException) as exc:
        auth.assert_session_owner(uuid.uuid4(), _FakeUser(uuid.uuid4()))
    assert exc.value.status_code == 403


def test_anonymous_denied_on_owned_session():
    # The core IDOR fix: an unauthenticated caller must not reach an owned session.
    with pytest.raises(HTTPException) as exc:
        auth.assert_session_owner(uuid.uuid4(), None)
    assert exc.value.status_code == 403


def test_ownerless_resource_allows_anonymous():
    auth.assert_session_owner(None, None)  # no owner → no restriction


# --- validate_production_settings (prod secrets guard) --------------------

def _settings(**kw):
    base = dict(
        APP_ENV="production",
        SECRET_KEY="a-real-strong-secret",
        FERNET_KEY="x" * 44,
        DATABASE_URL="postgresql+asyncpg://app:strongpw@db:5432/edgetest",
        SUPABASE_URL="https://proj.supabase.co",
        SUPABASE_SERVICE_KEY="svc-key",
    )
    base.update(kw)
    return Settings(**base)


def test_dev_env_is_noop():
    assert validate_production_settings(_settings(APP_ENV="development", SECRET_KEY="change-me-in-production")) == []


def test_prod_clean_config_passes():
    assert validate_production_settings(_settings()) == []


def test_prod_placeholder_secret_flagged():
    problems = validate_production_settings(_settings(SECRET_KEY="change-me-in-production"))
    assert any("SECRET_KEY" in p for p in problems)


def test_prod_default_db_creds_flagged():
    url = "postgresql+asyncpg://postgres:postgres@db:5432/edgetest"
    problems = validate_production_settings(_settings(DATABASE_URL=url))
    assert any("postgres:postgres" in p for p in problems)


def test_prod_missing_supabase_flagged():
    problems = validate_production_settings(_settings(SUPABASE_URL="", SUPABASE_SERVICE_KEY=""))
    assert any("Supabase" in p for p in problems)
