from __future__ import annotations

import json

from pydantic import BaseModel, Field, ValidationError, model_validator

from chains.base import make_chain

# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

_COMPLETENESS_SYSTEM = (
    "You are a senior code-review expert. Analyze the provided source code for completeness. "
    "Return a JSON object with EXACTLY these three fields and no others:\n"
    '  "is_complete": boolean — true if the implementation is substantially complete\n'
    '  "completeness_score": integer 0-100 — overall completeness percentage\n'
    '  "missing_elements": array of strings — one entry per incomplete or absent part '
    "(empty array if nothing is missing)\n"
    "Return only valid JSON. No markdown fences, no explanation outside the JSON."
)

_SUGGESTIONS_SYSTEM = (
    "You are a code-completion expert. Given incomplete source code and a list of missing "
    "elements, produce exactly 3 concrete, self-contained code snippets that each address "
    "the missing elements. Return a JSON object with EXACTLY one field:\n"
    '  "suggestions": array of exactly 3 strings — each string is a runnable code snippet\n'
    "Return only valid JSON. No markdown fences, no explanation outside the JSON."
)

# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------


class CompletenessResult(BaseModel):
    is_complete: bool
    completeness_score: int = Field(ge=0, le=100)
    missing_elements: list[str]


class SuggestionsResult(BaseModel):
    suggestions: list[str]

    @model_validator(mode="after")
    def exactly_three(self) -> SuggestionsResult:
        if len(self.suggestions) != 3:
            # Trim or pad so callers always get exactly 3
            self.suggestions = (self.suggestions + [""] * 3)[:3]
        return self


class CompletenessResponse(BaseModel):
    is_complete: bool
    completeness_score: int = Field(ge=0, le=100)
    missing_elements: list[str]
    suggestions: list[str] | None = None


# ---------------------------------------------------------------------------
# Chain logic
# ---------------------------------------------------------------------------


def _parse_json(content: str, model: type[BaseModel]) -> BaseModel:
    """Parse raw LLM content as JSON and validate against a Pydantic model."""
    try:
        data = json.loads(content)
    except json.JSONDecodeError as exc:
        raise ValueError(f"LLM returned non-JSON content: {content!r}") from exc
    return model.model_validate(data)


async def analyze_completeness(code: str, language: str, user_story: str | None = None) -> CompletenessResponse:
    """Run the two-step completeness analysis chain.

    Step 1 (temp=0.0, json_mode): assess completeness.
    Step 2 (temp=0.4, json_mode): if score < 70, generate 3 completion suggestions.
    """
    # --- Step 1 ---
    chain1 = make_chain(_COMPLETENESS_SYSTEM, temperature=0.0, json_mode=True)
    story_ctx = f"\n\nUser Story (the code should fulfill this):\n{user_story}" if user_story else ""
    step1_input = f"Language: {language}\n\nCode:\n```{language}\n{code}\n```{story_ctx}"
    response1 = await chain1.ainvoke({"input": step1_input})
    assessment = _parse_json(response1.content, CompletenessResult)

    result = CompletenessResponse(
        is_complete=assessment.is_complete,
        completeness_score=assessment.completeness_score,
        missing_elements=assessment.missing_elements,
    )

    # --- Step 2 (only when score < 70) ---
    if assessment.completeness_score < 70:
        chain2 = make_chain(_SUGGESTIONS_SYSTEM, temperature=0.4, json_mode=True)
        missing_list = "\n".join(f"- {e}" for e in assessment.missing_elements)
        step2_input = (
            f"Language: {language}\n\n"
            f"Code:\n```{language}\n{code}\n```\n\n"
            f"Missing elements:\n{missing_list}"
            + (f"\n\nUser Story:\n{user_story}" if user_story else "")
        )
        response2 = await chain2.ainvoke({"input": step2_input})
        suggestions = _parse_json(response2.content, SuggestionsResult)
        result.suggestions = suggestions.suggestions

    return result
