"""Convert a user story + acceptance criteria directly into test cases."""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

logger = logging.getLogger(__name__)

_llm = ChatAnthropic(model="claude-sonnet-4-6", temperature=0.3, max_tokens=4096)

_SYSTEM = """You are an expert software test engineer. Given a user story and its
acceptance criteria, generate a comprehensive set of test cases following the
Given-When-Then (GWT) pattern.

Return ONLY valid JSON matching this exact schema:
{
  "test_file_name": "<suggested_filename.ext>",
  "story_summary": "<one sentence summary of what is being tested>",
  "test_cases": [
    {
      "name": "<test_function_name>",
      "category": "<Positive|Negative|Boundary|Exception|Edge>",
      "given": "<precondition description>",
      "when": "<action/trigger description>",
      "then": "<expected outcome description>",
      "test_code": "<complete runnable test code for this case>"
    }
  ],
  "suggested_mocks": ["<list of dependencies to mock>"],
  "implementation_notes": "<any important notes about the test approach>"
}

Rules:
- Generate at least 5 test cases covering positive, negative, boundary, exception, and edge scenarios
- test_code must be complete and runnable in the target language
- Use appropriate test framework for the language (pytest for Python, Jest for JS/TS, JUnit5 for Java, xUnit for C#)
- GWT fields should be clear, human-readable descriptions
"""

STORY_TO_TESTS_PROMPT = """You are a senior QA engineer. The user has provided a user story with no
existing source code. Generate complete, runnable test cases directly from
the story — without needing to see any implementation.

USER STORY:
{user_story}

ACCEPTANCE CRITERIA (if provided):
{acceptance_criteria}

LANGUAGE: {language}

Generate test cases covering:
1. Happy path — the story works as described
2. Negative path — what happens when it fails
3. Boundary conditions — edge values in the story
4. Business rule violations — attempts to break acceptance criteria
5. Exception handling — invalid inputs or system errors

Return a JSON object:
{{
  "test_file_name": "test_story_{slug}.py",
  "story_summary": "one sentence",
  "test_cases": [
    {{
      "name": "test_function_name",
      "category": "HAPPY_PATH",
      "given": "describe the precondition",
      "when": "describe the action",
      "then": "describe the expected outcome",
      "test_code": "full pytest function as string"
    }}
  ],
  "suggested_mocks": ["list of things needing mocks when implemented"],
  "implementation_notes": "brief note on what code must exist for these to pass"
}}

Return ONLY valid JSON. No markdown fences. No explanation.
"""

story_to_tests_chain = (
    ChatPromptTemplate.from_template(STORY_TO_TESTS_PROMPT)
    | _llm
    | StrOutputParser()
)


def story_to_tests(
    story: str,
    acceptance_criteria: str,
    language: str,
) -> dict[str, Any]:
    user_content = f"""User Story:
{story}

Acceptance Criteria:
{acceptance_criteria}

Target Language: {language}

Generate test cases now."""

    messages = [
        SystemMessage(content=_SYSTEM),
        HumanMessage(content=user_content),
    ]

    response = _llm.invoke(messages)
    raw = response.content

    start = raw.find("{")
    end = raw.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError("No JSON object found in LLM response")

    return json.loads(raw[start:end])


async def generate_tests_from_story(
    user_story: str,
    acceptance_criteria: str = "",
    language: str = "python",
) -> dict[str, Any]:
    slug = re.sub(r"[^a-z0-9]", "_", user_story[:30].lower())
    raw = await story_to_tests_chain.ainvoke({
        "user_story": user_story,
        "acceptance_criteria": acceptance_criteria,
        "language": language,
        "slug": slug,
    })
    clean = raw.strip().lstrip("```json").rstrip("```").strip()
    start = clean.find("{")
    end = clean.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError("No JSON object found in LLM response")
    return json.loads(clean[start:end])
