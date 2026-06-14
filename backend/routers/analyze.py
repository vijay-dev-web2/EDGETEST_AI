from __future__ import annotations

import ast
import json
import uuid
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user, get_optional_user
from chains.base import make_chain
from chains.codegen import TestFile, generate_tests, _sanitize_python
from services.test_classifier import validate_integration_tests
from chains.completeness import CompletenessResponse, analyze_completeness
from chains.discovery import TestCategory, discover_scenarios, DiscoveryResult
from chains.pseudocode import stream_pseudocode
from chains.risk_scoring import RiskResult, compute_risk_score
from chains.eligibility import scan_eligibility, get_pipeline_gates
from schemas import EligibilityResponse
from database import AsyncSessionLocal, get_db
from models import Session as SessionModel
from models import User

router = APIRouter()

# ---------------------------------------------------------------------------
# Story → Code
# ---------------------------------------------------------------------------

_STORY_TO_CODE_SYSTEM = (
    "You are an expert software engineer. Convert the user story into clean, working starter code. "
    "Rules:\n"
    "1. Implement all requirements and acceptance criteria from the user story\n"
    "2. Include proper error handling for edge cases mentioned in the story\n"
    "3. Add docstrings or comments to explain each function\n"
    "4. Keep the code well-structured and idiomatic for the target language\n\n"
    "Return a JSON object with exactly one key 'code' whose value is the complete source code as a string. "
    "Return only valid JSON. No markdown fences outside the JSON."
)

_TRACEABILITY_SYSTEM = (
    "You are a QA traceability expert. Given test categories and source code (plus optional user story), "
    "build a traceability matrix mapping each category to the code functions and requirements it covers.\n\n"
    "Return a JSON object with EXACTLY these fields:\n"
    '  "matrix": array of objects, each with:\n'
    '    "category_name": string\n'
    '    "covers_functions": array of strings (function/method names)\n'
    '    "covers_requirements": array of strings (requirement IDs or acceptance criteria)\n'
    '    "risk_level": "high", "medium", or "low"\n'
    '  "function_coverage_pct": integer 0-100\n'
    '  "requirement_coverage_pct": integer 0-100 (0 if no user story)\n'
    '  "high_risk_covered": integer — count of high-risk functions covered\n'
    '  "high_risk_total": integer — total high-risk functions\n'
    "Return only valid JSON. No markdown fences."
)


class StoryToCodeRequest(BaseModel):
    user_story: str
    language: str = "python"


@router.post("/story-to-code")
async def story_to_code(payload: StoryToCodeRequest) -> dict:
    chain = make_chain(_STORY_TO_CODE_SYSTEM, temperature=0.3, json_mode=True)
    human_input = f"Language: {payload.language}\n\nUser Story:\n{payload.user_story}"
    response = await chain.ainvoke({"input": human_input})
    try:
        data = json.loads(response.content)
        return {"code": data.get("code", response.content)}
    except (json.JSONDecodeError, AttributeError):
        return {"code": str(response.content)}


# ---------------------------------------------------------------------------
# POST /analyze/validate
# ---------------------------------------------------------------------------


class ValidateRequest(BaseModel):
    code: str
    language: str


class ValidateResponse(BaseModel):
    valid: bool
    error: str | None = None
    fixed_code: str | None = None


@router.post("/validate", response_model=ValidateResponse)
async def validate_code(payload: ValidateRequest) -> ValidateResponse:
    if payload.language != "python":
        return ValidateResponse(valid=True)

    try:
        ast.parse(payload.code)
        return ValidateResponse(valid=True)
    except SyntaxError:
        pass

    try:
        fixed = _sanitize_python(payload.code)
        return ValidateResponse(valid=True, fixed_code=fixed)
    except ValueError as exc:
        try:
            ast.parse(payload.code)
        except SyntaxError as syn:
            return ValidateResponse(valid=False, error=f"Line {syn.lineno}: {syn.msg}")
        return ValidateResponse(valid=False, error=str(exc))


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------


class CompletenessRequest(BaseModel):
    code: str
    language: str
    user_story: str | None = None


class PseudocodeRequest(BaseModel):
    code: str
    ast_json: dict[str, Any]
    session_id: uuid.UUID
    user_story: str | None = None


class DiscoverRequest(BaseModel):
    code: str
    pseudocode: str
    ast_json: dict[str, Any]
    user_story: str | None = None
    risk_level: str | None = None
    high_risk_functions: list[str] | None = None
    module_graph: dict[str, Any] | None = None


class SessionCreateRequest(BaseModel):
    code: str
    language: str
    user_story: str | None = None


class SessionCreateResponse(BaseModel):
    session_id: uuid.UUID


class GenerateRequest(BaseModel):
    selected_categories: list[str]
    code: str
    language: str
    session_id: uuid.UUID
    user_story: str | None = None
    structured_files: list[dict[str, Any]] | None = None


class RiskRequest(BaseModel):
    code: str
    language: str
    session_id: uuid.UUID | None = None
    user_story: str | None = None


class TraceabilityRequest(BaseModel):
    code: str
    language: str
    categories: list[dict[str, Any]]
    session_id: uuid.UUID | None = None
    user_story: str | None = None
    high_risk_functions: list[str] | None = None


class EligibilityRequest(BaseModel):
    session_id: uuid.UUID



# ---------------------------------------------------------------------------
# POST /analyze/sessions
# ---------------------------------------------------------------------------


@router.post("/sessions", response_model=SessionCreateResponse)
async def create_session(
    payload: SessionCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SessionCreateResponse:
    code = payload.code
    if payload.language == "python":
        try:
            code = _sanitize_python(code)
        except ValueError:
            # Source has a syntax error — store raw code and continue.
            # The error will be surfaced at sandbox execution time.
            pass

    session = SessionModel(
        user_id=current_user.id,
        raw_code=code,
        language=payload.language,
        user_story=payload.user_story,
        status="pending",
    )
    db.add(session)
    await db.flush()
    return SessionCreateResponse(session_id=session.id)


# ---------------------------------------------------------------------------
# POST /analyze/completeness
# ---------------------------------------------------------------------------


@router.post("/completeness", response_model=CompletenessResponse)
async def completeness(payload: CompletenessRequest) -> CompletenessResponse:
    try:
        return await analyze_completeness(payload.code, payload.language, payload.user_story)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


# ---------------------------------------------------------------------------
# POST /analyze/risk
# ---------------------------------------------------------------------------


@router.post("/risk", response_model=RiskResult)
async def risk_analysis(
    payload: RiskRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> RiskResult:
    try:
        result = await compute_risk_score(payload.code, payload.language, payload.user_story)
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    if payload.session_id and current_user:
        session = await db.get(SessionModel, payload.session_id)
        if session and session.user_id == current_user.id:
            session.risk_score = float(result.risk_score)
            session.risk_level = result.risk_level
            session.risk_json = result.model_dump()
            await db.commit()

    return result


# ---------------------------------------------------------------------------
# POST /analyze/traceability
# ---------------------------------------------------------------------------


@router.post("/traceability")
async def traceability(
    payload: TraceabilityRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    chain = make_chain(_TRACEABILITY_SYSTEM, temperature=0.0, json_mode=True, label="traceability")

    story_ctx = f"\n\nUser Story:\n{payload.user_story}" if payload.user_story else ""
    hrfs = (
        f"\n\nHigh-Risk Functions: {', '.join(payload.high_risk_functions)}"
        if payload.high_risk_functions
        else ""
    )
    categories_txt = json.dumps(
        [{"name": s.get("name"), "type": s.get("type"), "description": s.get("description")} for s in payload.categories],
        indent=2,
    )

    human_input = (
        f"Language: {payload.language}\n\n"
        f"Source Code:\n```{payload.language}\n{payload.code}\n```\n\n"
        f"Test Categories:\n{categories_txt}"
        f"{story_ctx}"
        f"{hrfs}"
    )

    try:
        response = await chain.ainvoke({"input": human_input})
        data = json.loads(response.content)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    if payload.session_id:
        session = await db.get(SessionModel, payload.session_id)
        if session and session.user_id == current_user.id:
            session.traceability_map = data
            await db.commit()

    return data


# ---------------------------------------------------------------------------
# POST /analyze/eligibility
# ---------------------------------------------------------------------------


@router.post("/eligibility", response_model=EligibilityResponse)
async def eligibility_scan(
    payload: EligibilityRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, Any]:
    session = await db.get(SessionModel, payload.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    ast = dict(session.ast_json or {})

    # If already calculated, return it from cache
    if "eligibility" in ast and "pipeline_gates" in ast:
        return {
            "eligibility": ast["eligibility"],
            "pipeline_gates": ast["pipeline_gates"],
        }

    # Otherwise run the eligibility scan
    eligibility_raw = await scan_eligibility(
        source_code=session.raw_code,
        file_name=session.repo_url or "code",
        language=session.language,
    )

    gates = get_pipeline_gates(eligibility_raw)

    # Save back to ast_json
    ast["eligibility"] = eligibility_raw
    ast["pipeline_gates"] = gates
    session.ast_json = ast

    await db.commit()

    return {
        "eligibility": eligibility_raw,
        "pipeline_gates": gates,
    }



# ---------------------------------------------------------------------------
# POST /analyze/pseudocode  (SSE streaming)
# ---------------------------------------------------------------------------


@router.post("/pseudocode")
async def pseudocode_stream(
    payload: PseudocodeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> StreamingResponse:
    row = await db.get(SessionModel, payload.session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if current_user and row.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    language = row.language
    session_id = payload.session_id

    async def event_stream() -> AsyncGenerator[str, None]:
        chunks: list[str] = []
        try:
            async for token in stream_pseudocode(payload.code, payload.ast_json, language, payload.user_story):
                chunks.append(token)
                yield f"data: {token}\n\n"
        except Exception as exc:
            yield f"data: [ERROR] {exc}\n\n"
            return

        final_text = "".join(chunks)
        async with AsyncSessionLocal() as save_db:
            session_row = await save_db.get(SessionModel, session_id)
            if session_row is not None:
                session_row.pseudocode = final_text
                session_row.status = "complete"
                await save_db.commit()

        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# POST /analyze/discover
# ---------------------------------------------------------------------------


@router.post("/discover", response_model=DiscoveryResult)
async def discover(payload: DiscoverRequest) -> DiscoveryResult:
    try:
        return await discover_scenarios(
            payload.code,
            payload.pseudocode,
            payload.ast_json,
            payload.user_story,
            risk_level=payload.risk_level,
            high_risk_functions=payload.high_risk_functions,
            module_graph=payload.module_graph,
        )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


# ---------------------------------------------------------------------------
# POST /analyze/complete-code  (SSE streaming)
# ---------------------------------------------------------------------------

_CODE_COMPLETION_SYSTEM = (
    "You are an expert code completion assistant. "
    "The user has uploaded incomplete source code. "
    "Complete or fix the code based on their instruction. "
    "Return ONLY the completed source code — no markdown fences, no explanation, "
    "no preamble. Just the raw, runnable source code."
)


class CodeCompletionRequest(BaseModel):
    code: str
    language: str = "python"
    instruction: str


@router.post("/complete-code")
async def complete_code_stream(payload: CodeCompletionRequest) -> StreamingResponse:
    chain = make_chain(_CODE_COMPLETION_SYSTEM, temperature=0.2, streaming=True, label="code-completion")
    human_input = (
        f"Language: {payload.language}\n\n"
        f"Incomplete code:\n```{payload.language}\n{payload.code}\n```\n\n"
        f"User instruction: {payload.instruction}\n\n"
        f"Complete the code:"
    )

    async def event_stream() -> AsyncGenerator[str, None]:
        try:
            async for chunk in chain.astream({"input": human_input}):
                text = chunk.content if isinstance(chunk.content, str) else ""
                if text:
                    # Escape newlines so each SSE data line stays valid
                    escaped = text.replace("\n", "\\n")
                    yield f"data: {escaped}\n\n"
        except Exception as exc:
            yield f"data: [ERROR] {exc}\n\n"
            return
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# POST /analyze/generate
# ---------------------------------------------------------------------------

_INTEGRATION_TYPES = {"integration"}


@router.post("/generate", response_model=list[TestFile])
async def generate(
    payload: GenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> list[TestFile]:
    row = await db.get(SessionModel, payload.session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if current_user and row.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    if not payload.selected_categories:
        raise HTTPException(status_code=422, detail="selected_categories must not be empty")

    try:
        return await generate_tests(
            code=payload.code,
            language=payload.language,
            selected_categories=payload.selected_categories,
            session_id=payload.session_id,
            user_story=payload.user_story,
            structured_files=payload.structured_files or None,
        )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


# ---------------------------------------------------------------------------
# POST /analyze/generate-unit
# ---------------------------------------------------------------------------


@router.post("/generate-unit", response_model=list[TestFile])
async def generate_unit(
    payload: GenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> list[TestFile]:
    """Generate unit tests (isolated, function-level) and store in session.unit_test_files."""
    row = await db.get(SessionModel, payload.session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if current_user and row.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    unit_categories = [c for c in payload.selected_categories if not c.lower().startswith("integration")]
    if not unit_categories:
        unit_categories = ["Unit Tests - positive, negative, boundary, exception, edge cases"]

    try:
        files = await generate_tests(
            code=payload.code,
            language=payload.language,
            selected_categories=unit_categories,
            session_id=payload.session_id,
            user_story=payload.user_story,
            structured_files=payload.structured_files or None,
            subdir="unit",
            test_mode="unit",
        )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    files_data = [f.model_dump() for f in files]
    row.unit_test_files = files_data
    row.unit_coverage_pct = float(min(100, len(files) * 15))
    await db.commit()
    return files


# ---------------------------------------------------------------------------
# POST /analyze/generate-integration
# ---------------------------------------------------------------------------


@router.post("/generate-integration", response_model=list[TestFile])
async def generate_integration(
    payload: GenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> list[TestFile]:
    """Generate integration tests (workflow/module-level) and store in session.integration_test_files."""
    row = await db.get(SessionModel, payload.session_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if current_user and row.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    # Eligibility Gate
    ast = row.ast_json or {}
    gates = ast.get("pipeline_gates") or {}
    if not gates.get("generate_integration_tests", True):
        eligibility = ast.get("eligibility") or {}
        reason = eligibility.get("integration_test_reason", "No integration boundaries detected in source code.")
        raise HTTPException(status_code=400, detail=f"Integration test generation skipped: {reason}")

    integration_categories = [c for c in payload.selected_categories if "integration" in c.lower()]
    if not integration_categories:
        integration_categories = [
            "Integration Tests - multi-step workflows, cross-object state verification, "
            "service interaction patterns, end-to-end business process flows"
        ]

    try:
        files = await generate_tests(
            code=payload.code,
            language=payload.language,
            selected_categories=integration_categories,
            session_id=payload.session_id,
            user_story=payload.user_story,
            structured_files=payload.structured_files or None,
            subdir="integration",
            test_mode="integration",
        )
    except ValueError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    # Classify each file — flag any that are actually unit tests in disguise
    classified: list[TestFile] = []
    for f in files:
        result = validate_integration_tests(f.code)
        if result["is_misclassified"]:
            f = f.model_copy(update={
                "misclassified": True,
                "classification_warning": result.get("error", ""),
            })
        classified.append(f)

    files_data = [f.model_dump() for f in classified]
    row.integration_test_files = files_data
    row.integration_coverage_pct = float(min(100, len(classified) * 12))
    await db.commit()
    return classified


# ---------------------------------------------------------------------------
# POST /analyze/session-config
# ---------------------------------------------------------------------------


class SessionConfigUpdate(BaseModel):
    session_id: uuid.UUID
    coverage_threshold: int | None = None
    autofix_enabled: bool | None = None


@router.post("/session-config")
async def update_session_config(
    body: SessionConfigUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> dict:
    """Store per-session config (coverage threshold, autofix toggle) in ast_json._config."""
    session = await db.get(SessionModel, body.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    if current_user and session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    ast = dict(session.ast_json or {})
    cfg = dict(ast.get("_config", {}))
    if body.coverage_threshold is not None:
        cfg["coverage_threshold"] = body.coverage_threshold
    if body.autofix_enabled is not None:
        cfg["autofix_enabled"] = body.autofix_enabled
    ast["_config"] = cfg
    session.ast_json = ast
    await db.commit()
    return {"updated": True, "config": cfg}
