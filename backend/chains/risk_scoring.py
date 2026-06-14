"""Risk-scoring LangChain chain for EdgeTest AI.

Computes a 0–100 risk score for a code snippet using a five-factor weighted
formula evaluated by GPT-4o, augmented with local static-analysis hints
extracted from the Python AST:

    RISK_SCORE = (Complexity × 0.20)
               + (Business Impact × 0.25)
               + (Dependency Depth × 0.15)
               + (Coverage Gap × 0.20)
               + (Security Sensitivity × 0.20)

The formula is re-applied deterministically by ``_apply_formula`` after the
LLM responds, so drift in the model's arithmetic never corrupts the final
score. A security floor ensures auth/payment/secret-handling code always
lands in at least MEDIUM (score ≥ 45) or HIGH (score ≥ 72).

Public API
----------
compute_risk_score(code, language, user_story) → RiskResult
"""

from __future__ import annotations

import ast
import json
from typing import Any

from pydantic import BaseModel, Field, ValidationError

from chains.base import make_chain

# Security-sensitive keywords found in function/method names
_SECURITY_KEYWORDS = frozenset({
    "login", "logout", "auth", "authenticate", "authorize",
    "password", "passwd", "token", "session", "cookie",
    "payment", "charge", "billing", "admin", "superuser",
    "encrypt", "decrypt", "cipher", "secret", "private",
    "jwt", "oauth", "credential", "apikey", "api_key",
    "hash", "salt", "hmac", "signature", "verify", "validate_token",
    "reset_password", "change_password", "permission", "role",
})

# Modules that indicate external API/network calls
_API_MODULES = frozenset({
    "requests", "httpx", "urllib", "aiohttp", "http",
    "boto3", "stripe", "twilio", "sendgrid",
    "redis", "celery", "pika", "kafka",
})

_RISK_SYSTEM = (
    "You are a senior software quality engineer specializing in risk-based testing. "
    "Analyze the provided source code and score each risk factor independently.\n\n"
    "RISK SCORE (0-100) formula — apply EXACTLY:\n"
    "  RISK_SCORE = (Complexity × 0.20) + (Business Impact × 0.25) + "
    "(Dependency Depth × 0.15) + (Coverage Gap × 0.20) + (Security Sensitivity × 0.20)\n\n"
    "Factor scoring guidelines:\n"
    "  complexity_score: cyclomatic complexity, nesting depth, number of branches/loops\n"
    "  business_impact_score: financial, data integrity, user-facing, or compliance impact\n"
    "  dependency_depth_score: external libraries, DB calls, API dependencies\n"
    "  coverage_gap_score: likelihood of untested paths, edge cases, error branches\n"
    "  security_sensitivity_score:\n"
    "    90-100 — functions handling auth, passwords, tokens, sessions, payments, "
    "encryption, admin operations, or secrets\n"
    "    70-80  — handles raw user input without obvious validation guards\n"
    "    60-70  — makes external HTTP/API calls\n"
    "    20-30  — no security-sensitive operations\n"
    "    (Use the security_hints field from AST metrics as your primary signal)\n\n"
    "Risk Levels (based on final computed RISK_SCORE):\n"
    "  HIGH   (≥70): Maximum Testing — Unit + Integration + Edge + Negative + Security + Mutation + Business Rules\n"
    "  MEDIUM (40-69): Standard Testing — Unit + Integration + Edge\n"
    "  LOW    (<40): Basic Testing — Unit + Smoke\n\n"
    "Return a JSON object with EXACTLY these fields:\n"
    '  "risk_score": integer 0-100 (compute via the formula above)\n'
    '  "risk_level": "high", "medium", or "low"\n'
    '  "complexity_score": integer 0-100\n'
    '  "business_impact_score": integer 0-100\n'
    '  "dependency_depth_score": integer 0-100\n'
    '  "coverage_gap_score": integer 0-100\n'
    '  "security_sensitivity_score": integer 0-100\n'
    '  "risk_factors": array of strings — specific risk reasons\n'
    '  "recommended_test_types": array from ["unit","integration","edge","negative","business_rule","security","mutation","smoke"]\n'
    '  "human_readable_reason": string — 2-3 sentence plain-English explanation\n'
    '  "high_risk_functions": array of strings — function/method names with highest risk\n'
    "Return only valid JSON. No markdown fences."
)


class RiskResult(BaseModel):
    risk_score: int = Field(ge=0, le=100)
    risk_level: str
    complexity_score: int = Field(ge=0, le=100)
    business_impact_score: int = Field(ge=0, le=100)
    dependency_depth_score: int = Field(ge=0, le=100)
    coverage_gap_score: int = Field(ge=0, le=100)
    security_sensitivity_score: int = Field(default=0, ge=0, le=100)
    risk_factors: list[str]
    recommended_test_types: list[str]
    human_readable_reason: str
    high_risk_functions: list[str] = []


def _apply_formula(result: RiskResult) -> RiskResult:
    """Recompute risk_score and risk_level deterministically from component scores.

    Security floor rule: code that handles auth/payment/secrets always warrants
    maximum testing regardless of cyclomatic complexity, so a high security
    sensitivity score sets a minimum floor on the final risk score.

      security_sensitivity >= 90 → minimum score 72 (HIGH)
      security_sensitivity >= 70 → minimum score 45 (MEDIUM)
    """
    # Weighted sum — weights must sum to 1.0 (0.20+0.25+0.15+0.20+0.20)
    raw = (
        result.complexity_score * 0.20
        + result.business_impact_score * 0.25
        + result.dependency_depth_score * 0.15
        + result.coverage_gap_score * 0.20
        + result.security_sensitivity_score * 0.20
    )
    score = min(100, max(0, round(raw)))

    # Security floor: auth/payment/secret handlers warrant maximum coverage
    # regardless of how simple their cyclomatic complexity appears.
    sec = result.security_sensitivity_score
    if sec >= 90:
        score = max(score, 72)   # floor at HIGH threshold
    elif sec >= 70:
        score = max(score, 45)   # floor at MEDIUM threshold

    level = "high" if score >= 70 else "medium" if score >= 40 else "low"
    result.risk_score = score
    result.risk_level = level
    return result


def _compute_ast_metrics(code: str, language: str) -> dict[str, Any]:
    # Static analysis via the stdlib ast module — Python only.
    # JavaScript metrics rely entirely on the LLM's reading of the source.
    if language != "python":
        return {
            "functions": [],
            "classes": [],
            "imports": 0,
            "imported_modules": [],
            "loops": 0,
            "conditions": 0,
            "exceptions": 0,
            "security_hints": {},
        }
    try:
        tree = ast.parse(code)
    except SyntaxError:
        return {
            "functions": [],
            "classes": [],
            "imports": 0,
            "imported_modules": [],
            "loops": 0,
            "conditions": 0,
            "exceptions": 0,
            "security_hints": {},
        }

    functions: list[str] = []
    classes: list[str] = []
    imported_modules: list[str] = []
    imports = loops = conditions = exceptions = 0

    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            functions.append(node.name)
        elif isinstance(node, ast.ClassDef):
            classes.append(node.name)
        elif isinstance(node, ast.Import):
            imports += 1
            for alias in node.names:
                imported_modules.append(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            imports += 1
            if node.module:
                imported_modules.append(node.module.split(".")[0])
        elif isinstance(node, (ast.For, ast.While, ast.AsyncFor)):
            loops += 1
        elif isinstance(node, ast.If):
            conditions += 1
        elif isinstance(node, (ast.ExceptHandler, ast.Try)):
            exceptions += 1

    security_hints = _compute_security_hints(functions, imported_modules)

    return {
        "functions": functions,
        "classes": classes,
        "imports": imports,
        "imported_modules": imported_modules,
        "loops": loops,
        "conditions": conditions,
        "exceptions": exceptions,
        "security_hints": security_hints,
    }


def _compute_security_hints(functions: list[str], imported_modules: list[str]) -> dict[str, Any]:
    """Produce concrete, LLM-readable signals about security sensitivity."""
    sensitive_funcs = [
        name for name in functions
        if any(kw in name.lower() for kw in _SECURITY_KEYWORDS)
    ]
    api_modules = [m for m in imported_modules if m in _API_MODULES]

    if sensitive_funcs:
        suggested_score = "90-100"
        reason = (
            f"Functions {sensitive_funcs!r} contain security-sensitive names "
            "(auth/password/token/payment/encrypt/admin/secret)."
        )
    elif api_modules:
        suggested_score = "60-70"
        reason = f"Code imports external API/network modules: {api_modules!r}."
    else:
        suggested_score = "20-30"
        reason = "No security-sensitive function names or external API modules detected."

    return {
        "security_sensitive_functions": sensitive_funcs,
        "external_api_modules": api_modules,
        "suggested_security_sensitivity_score": suggested_score,
        "reason": reason,
    }


async def compute_risk_score(
    code: str,
    language: str,
    user_story: str | None = None,
) -> RiskResult:
    ast_metrics = _compute_ast_metrics(code, language)
    chain = make_chain(_RISK_SYSTEM, temperature=0.0, json_mode=True, label="risk_scoring")

    story_ctx = f"\n\nUser Story:\n{user_story}" if user_story else ""
    human_input = (
        f"Language: {language}\n\n"
        f"Code:\n```{language}\n{code}\n```\n\n"
        f"AST Metrics (use security_hints.suggested_security_sensitivity_score as your primary "
        f"signal for security_sensitivity_score):\n{json.dumps(ast_metrics, indent=2)}"
        f"{story_ctx}"
    )

    response = await chain.ainvoke({"input": human_input})

    try:
        data = json.loads(response.content)
    except json.JSONDecodeError as exc:
        raise ValueError(f"LLM returned non-JSON for risk scoring: {response.content!r}") from exc

    try:
        result = RiskResult.model_validate(data)
    except ValidationError as exc:
        raise ValueError(f"Risk result validation failed: {exc}") from exc

    # Apply the formula deterministically — overrides any LLM drift
    return _apply_formula(result)
