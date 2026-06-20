"""Tests for services/test_classifier.py — unit/integration/ambiguous detection
and misclassification flagging.

Plain synchronous functions (the classifier is sync), matching the lightweight
style used by test_authz.py — no new test infrastructure.
"""
from services.test_classifier import classify_test_file, validate_integration_tests


# A clear unit test: known unit name + single-method patterns + pytest.raises.
_CLEAR_UNIT = '''
def test_deposit_positive_amount_increases_balance():
    """Given/When/Then"""
    import pytest
    account = object()
    assert account is not None


def test_withdraw_negative_amount_raises_value_error():
    import pytest
    with pytest.raises(ValueError):
        raise ValueError("bad")
'''

# A clear integration test: *_flow name + docstring marker + repo mock pattern.
_CLEAR_INTEGRATION = '''
def test_order_payment_flow():
    """
    Services involved: OrderService, PaymentService
    """
    mock_repo = MockRepository()
    result = mock_repo.run()
    assert result is not None
'''

# Neither set of patterns fires strongly.
_AMBIGUOUS = '''
def test_thing():
    value = compute()
    assert value
'''


def test_classify_clear_unit():
    result = classify_test_file(_CLEAR_UNIT)
    assert result["classification"] == "unit"
    assert result["unit_score"] > result["integration_score"]


def test_classify_clear_integration():
    result = classify_test_file(_CLEAR_INTEGRATION)
    assert result["classification"] == "integration"
    assert result["integration_score"] >= 2


def test_classify_ambiguous():
    result = classify_test_file(_AMBIGUOUS)
    assert result["classification"] == "ambiguous"


def test_validate_flags_misclassified_unit():
    result = validate_integration_tests(_CLEAR_UNIT)
    assert result["is_misclassified"] is True
    assert "error" in result
    assert "corrective_action" in result


def test_validate_passes_real_integration():
    result = validate_integration_tests(_CLEAR_INTEGRATION)
    assert result["is_misclassified"] is False
    assert "error" not in result
