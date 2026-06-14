"""LLM chain for diagnosing and fixing a failing test."""

from __future__ import annotations

import json

from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from config import settings

_llm = ChatOpenAI(
    model="gpt-4o",
    max_tokens=4096,
    openai_api_key=settings.OPENAI_API_KEY,  # type: ignore[arg-type]
)

AUTOFIX_PROMPT = """You are a senior QA engineer debugging a failing test.

ORIGINAL SOURCE CODE:
{source_code}

FAILING TEST:
{test_code}

PYTEST ERROR OUTPUT:
{error_output}

PREVIOUS FIX ATTEMPTS (if any):
{previous_attempts}

Your job:
1. Identify the ROOT CAUSE of the failure
2. Determine: is the bug in the TEST or in the SOURCE CODE?
3. If the bug is in the TEST: rewrite the test to be correct
4. If the bug is in the SOURCE CODE: fix the source AND update the test

Return a JSON object:
{{
  "fault_location": "test or source or both",
  "root_cause": "one sentence explanation",
  "fix_explanation": "what you changed and why",
  "fixed_test_code": "complete corrected pytest function",
  "fixed_source_code": "complete corrected source function or null",
  "confidence": "high or medium or low"
}}

Return ONLY valid JSON. No markdown fences.
"""

autofix_chain = (
    ChatPromptTemplate.from_template(AUTOFIX_PROMPT)
    | _llm
    | StrOutputParser()
)


async def autofix_test(
    source_code: str,
    test_code: str,
    error_output: str,
    previous_attempts: list[dict] | None = None,
) -> dict:
    attempts_str = ""
    if previous_attempts:
        for i, a in enumerate(previous_attempts, 1):
            attempts_str += (
                f"\nAttempt {i}: {a.get('fix_explanation', '')}"
                f"\nResult: {a.get('result', '')}\n"
            )

    raw = await autofix_chain.ainvoke({
        "source_code": source_code,
        "test_code": test_code,
        "error_output": error_output,
        "previous_attempts": attempts_str or "None",
    })
    clean = raw.strip()
    if clean.startswith("```"):
        clean = clean.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    start = clean.find("{")
    end = clean.rfind("}") + 1
    return json.loads(clean[start:end])
