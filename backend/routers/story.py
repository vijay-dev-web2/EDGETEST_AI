"""Story → Test Cases router."""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from chains.story_to_tests import generate_tests_from_story, story_to_tests

logger = logging.getLogger(__name__)

router = APIRouter()


class StoryRequest(BaseModel):
    story: Optional[str] = None
    user_story: Optional[str] = None
    acceptance_criteria: Optional[str] = ""
    language: str = "python"
    session_id: Optional[str] = None


class TestCase(BaseModel):
    name: str
    category: str
    given: str
    when: str
    then: str
    test_code: str


class StoryResponse(BaseModel):
    test_file_name: str
    story_summary: str
    test_cases: list[TestCase]
    suggested_mocks: list[str]
    implementation_notes: str
    total_tests: Optional[int] = None


@router.post("/generate-tests", response_model=StoryResponse)
async def generate_tests_from_story_endpoint(payload: StoryRequest) -> StoryResponse:
    story_text = payload.user_story or payload.story or ""
    if not story_text.strip():
        raise HTTPException(status_code=422, detail="user_story must not be empty")

    try:
        result = await generate_tests_from_story(
            user_story=story_text,
            acceptance_criteria=payload.acceptance_criteria or "",
            language=payload.language,
        )
    except Exception as exc:
        logger.exception("generate_tests_from_story failed")
        raise HTTPException(status_code=500, detail=f"Test generation failed: {exc}") from exc

    return StoryResponse(**result, total_tests=len(result.get("test_cases", [])))
