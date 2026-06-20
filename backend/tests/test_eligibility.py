"""Tests for chains/eligibility.py — eligibility scan, gate mapping, fallback.

Matches the lightweight style in test_auth_bypass.py / test_authz.py:
plain functions, asyncio.run for async, monkeypatch to stub the LLM chain.
"""
import asyncio
import json

import chains.eligibility as el


class _FakeResp:
    def __init__(self, content: str):
        self.content = content


class _FakeChain:
    """Stands in for make_chain(...) — returns canned LLM content."""
    def __init__(self, content: str):
        self._content = content

    async def ainvoke(self, _inp):
        return _FakeResp(self._content)


class _BoomChain:
    async def ainvoke(self, _inp):
        raise RuntimeError("LLM unavailable")


_VALID_ELIGIBILITY = {
    "unit_test_eligible": True,
    "unit_test_reason": "Has pure functions",
    "unit_test_targets": [{"name": "add", "type": "function", "test_categories": ["positive"]}],
    "integration_test_eligible": False,
    "integration_test_reason": "No external boundary",
    "integration_boundaries": [],
    "architecture_summary": "single module",
    "components": [],
    "recommended_test_plan": {
        "unit_tests_to_generate": 3,
        "integration_tests_to_generate": 0,
        "estimated_coverage": "85%",
        "priority_order": [],
        "skipped_steps": [],
    },
    "user_message": "Unit tests will run.",
}


# --- scan_eligibility -----------------------------------------------------

def test_scan_eligibility_returns_valid_shape(monkeypatch):
    monkeypatch.setattr(el, "make_chain", lambda *a, **k: _FakeChain(json.dumps(_VALID_ELIGIBILITY)))
    result = asyncio.run(el.scan_eligibility("def add(a, b): return a + b", "math.py", "python"))
    assert result["unit_test_eligible"] is True
    assert result["integration_test_eligible"] is False
    assert "integration_boundaries" in result
    assert "recommended_test_plan" in result


def test_scan_eligibility_strips_markdown_fences(monkeypatch):
    fenced = "```json\n" + json.dumps(_VALID_ELIGIBILITY) + "\n```"
    monkeypatch.setattr(el, "make_chain", lambda *a, **k: _FakeChain(fenced))
    result = asyncio.run(el.scan_eligibility("x = 1", "x.py", "python"))
    assert result["unit_test_eligible"] is True


def test_scan_eligibility_fallback_on_error(monkeypatch):
    # Matches the documented safe-default fallback: unit eligible, integration not.
    monkeypatch.setattr(el, "make_chain", lambda *a, **k: _BoomChain())
    result = asyncio.run(el.scan_eligibility("x = 1", "x.py", "python"))
    assert result["unit_test_eligible"] is True
    assert result["integration_test_eligible"] is False
    skipped = result["recommended_test_plan"]["skipped_steps"]
    assert any("Integration" in s["step"] for s in skipped)


def test_scan_eligibility_fallback_on_bad_json(monkeypatch):
    monkeypatch.setattr(el, "make_chain", lambda *a, **k: _FakeChain("not valid json at all"))
    result = asyncio.run(el.scan_eligibility("x = 1", "x.py", "python"))
    assert result["unit_test_eligible"] is True
    assert result["integration_test_eligible"] is False


# --- get_pipeline_gates ---------------------------------------------------

def test_gates_map_unit_only():
    gates = el.get_pipeline_gates({"unit_test_eligible": True, "integration_test_eligible": False})
    assert gates["generate_unit_tests"] is True
    assert gates["execute_unit_tests"] is True
    assert gates["generate_integration_tests"] is False
    assert gates["execute_integration_tests"] is False
    # Always-on stages
    assert gates["analyze"] is True and gates["report"] is True


def test_gates_map_integration_enabled():
    gates = el.get_pipeline_gates({"unit_test_eligible": True, "integration_test_eligible": True})
    assert gates["generate_integration_tests"] is True
    assert gates["execute_integration_tests"] is True


def test_gates_default_when_flags_missing():
    # unit defaults True, integration defaults False when keys absent
    gates = el.get_pipeline_gates({})
    assert gates["generate_unit_tests"] is True
    assert gates["generate_integration_tests"] is False


# --- _build_boundary_hint (Fix 3) -----------------------------------------

def test_boundary_hint_empty_when_no_graph():
    assert el._build_boundary_hint(None) == ""
    assert el._build_boundary_hint({}) == ""
    assert el._build_boundary_hint({"integration_boundaries": []}) == ""


def test_boundary_hint_renders_service_calls():
    hint = el._build_boundary_hint({
        "integration_boundaries": [
            {"from": "OrderService.place", "to": "PaymentService.charge", "type": "service_call"},
        ]
    })
    assert "OrderService.place" in hint
    assert "PaymentService.charge" in hint
    assert "service_call" in hint
