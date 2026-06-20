"""Tests for the POST /api/analyze/generate-integration handler.

Calls the generate_integration handler function directly with lightweight
fakes (no DB, no HTTP server) — same fixture-free, asyncio.run + monkeypatch
style as test_authz.py. The LLM/codegen call (generate_tests) is monkeypatched
so we can assert it is NOT invoked when the eligibility gate blocks generation,
and that rejection reasons surface when no boundary is found (Fix 1).
"""
import asyncio
import uuid

import pytest
from fastapi import HTTPException

import routers.analyze as ra
from chains.codegen import TestFile as _TestFile  # aliased so pytest doesn't try to collect it


class _FakeUser:
    def __init__(self, uid):
        self.id = uid


class _FakeSession:
    def __init__(self, user_id, ast_json):
        self.id = uuid.uuid4()
        self.user_id = user_id
        self.ast_json = ast_json
        self.raw_code = "def f(): return 1"
        self.language = "python"
        self.integration_test_files = None
        self.integration_coverage_pct = None


class _FakeDB:
    def __init__(self, session):
        self._session = session
        self.committed = False

    async def get(self, _model, _sid):
        return self._session

    async def commit(self):
        self.committed = True


def _payload(session_id):
    return ra.GenerateRequest(
        code="def f(): return 1",
        language="python",
        session_id=session_id,
        selected_categories=["integration"],
    )


def test_gate_false_returns_400_and_skips_llm(monkeypatch):
    calls = {"n": 0}

    async def _fake_generate_tests(*args, **kwargs):
        calls["n"] += 1
        return []

    monkeypatch.setattr(ra, "generate_tests", _fake_generate_tests)

    uid = uuid.uuid4()
    sess = _FakeSession(uid, {
        "pipeline_gates": {"generate_integration_tests": False},
        "eligibility": {"integration_test_reason": "No integration boundaries detected."},
    })
    db = _FakeDB(sess)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(ra.generate_integration(_payload(sess.id), db=db, current_user=_FakeUser(uid)))

    assert exc.value.status_code == 400
    assert "skipped" in exc.value.detail.lower()
    assert calls["n"] == 0  # LLM/codegen must NOT be called when gated off


def test_gate_true_returns_files(monkeypatch):
    async def _fake_generate_tests(*args, **kwargs):
        return [_TestFile(
            filename="test_integration_python.py",
            language="python",
            code="def test_workflow():\n    assert True\n",
        )]

    monkeypatch.setattr(ra, "generate_tests", _fake_generate_tests)
    monkeypatch.setattr(ra, "validate_integration_tests", lambda code: {"is_misclassified": False})

    uid = uuid.uuid4()
    sess = _FakeSession(uid, {"pipeline_gates": {"generate_integration_tests": True}})
    db = _FakeDB(sess)

    resp = asyncio.run(ra.generate_integration(_payload(sess.id), db=db, current_user=_FakeUser(uid)))

    assert len(resp.files) == 1
    assert resp.files[0].filename == "test_integration_python.py"
    assert resp.rejected == []
    assert db.committed is True


def test_gate_true_surfaces_rejection_reasons(monkeypatch):
    # Fix 1: when no boundary is found, generate_tests populates rejected_out and
    # returns []. The handler must surface those reasons in the response body.
    async def _fake_generate_tests(*args, rejected_out=None, **kwargs):
        if rejected_out is not None:
            rejected_out.append({
                "proposed_name": "",
                "rejection_rule": "",
                "reason": "No real integration boundary found",
                "correct_classification": "",
            })
        return []

    monkeypatch.setattr(ra, "generate_tests", _fake_generate_tests)

    uid = uuid.uuid4()
    sess = _FakeSession(uid, {"pipeline_gates": {"generate_integration_tests": True}})
    db = _FakeDB(sess)

    resp = asyncio.run(ra.generate_integration(_payload(sess.id), db=db, current_user=_FakeUser(uid)))

    assert resp.files == []
    assert len(resp.rejected) == 1
    assert resp.rejected[0].reason == "No real integration boundary found"


def test_non_owner_denied(monkeypatch):
    async def _fake_generate_tests(*args, **kwargs):
        return []

    monkeypatch.setattr(ra, "generate_tests", _fake_generate_tests)

    sess = _FakeSession(uuid.uuid4(), {"pipeline_gates": {"generate_integration_tests": True}})
    db = _FakeDB(sess)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(ra.generate_integration(_payload(sess.id), db=db, current_user=_FakeUser(uuid.uuid4())))
    assert exc.value.status_code == 403
