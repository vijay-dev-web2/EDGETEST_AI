from __future__ import annotations

import logging
import time
from typing import Any

from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.outputs import LLMResult
from langchain_core.runnables import Runnable, RunnableConfig
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate

from config import settings

logger = logging.getLogger(__name__)


class _TimingCallback(BaseCallbackHandler):
    """Log LLM call duration and token usage at INFO level."""

    def __init__(self, label: str) -> None:
        super().__init__()
        self._label = label
        self._t0: float = 0.0

    def on_llm_start(self, serialized: dict, prompts: list[str], **kwargs: Any) -> None:
        self._t0 = time.perf_counter()

    def on_llm_end(self, response: LLMResult, **kwargs: Any) -> None:
        elapsed = time.perf_counter() - self._t0
        usage: dict = {}
        if response.llm_output:
            usage = response.llm_output.get("token_usage", {})
        logger.info(
            "llm_call chain=%s model=%s elapsed=%.2fs prompt_tokens=%d completion_tokens=%d total_tokens=%d",
            self._label,
            settings.LLM_MODEL,
            elapsed,
            usage.get("prompt_tokens", 0),
            usage.get("completion_tokens", 0),
            usage.get("total_tokens", 0),
        )

    def on_llm_error(self, error: BaseException, **kwargs: Any) -> None:
        elapsed = time.perf_counter() - self._t0
        logger.error("llm_error chain=%s elapsed=%.2fs error=%s", self._label, elapsed, error)


def _wrap_openai_errors(exc: Exception) -> ValueError:
    """Convert openai SDK errors into a ValueError with a user-readable message."""
    msg = str(exc)
    if "insufficient_quota" in msg or "429" in msg:
        return ValueError(
            "OpenAI quota exceeded — please top up your account at platform.openai.com/billing"
        )
    if "invalid_api_key" in msg or "Incorrect API key" in msg or "401" in msg:
        return ValueError(
            "Invalid OpenAI API key — check OPENAI_API_KEY in backend/.env"
        )
    return ValueError(f"LLM error: {msg[:300]}")


class _SafeChain(Runnable):
    """Wraps a Runnable and converts OpenAI SDK errors to ValueError."""

    def __init__(self, inner: Runnable) -> None:
        self._inner = inner

    def invoke(self, input: Any, config: RunnableConfig | None = None, **kwargs: Any) -> Any:
        try:
            return self._inner.invoke(input, config, **kwargs)
        except Exception as exc:
            if "openai" in type(exc).__module__:
                raise _wrap_openai_errors(exc) from exc
            raise

    async def ainvoke(self, input: Any, config: RunnableConfig | None = None, **kwargs: Any) -> Any:
        try:
            return await self._inner.ainvoke(input, config, **kwargs)
        except Exception as exc:
            if "openai" in type(exc).__module__:
                raise _wrap_openai_errors(exc) from exc
            raise

    def stream(self, input: Any, config: RunnableConfig | None = None, **kwargs: Any) -> Any:
        try:
            yield from self._inner.stream(input, config, **kwargs)
        except Exception as exc:
            if "openai" in type(exc).__module__:
                raise _wrap_openai_errors(exc) from exc
            raise

    async def astream(self, input: Any, config: RunnableConfig | None = None, **kwargs: Any) -> Any:
        try:
            async for chunk in self._inner.astream(input, config, **kwargs):
                yield chunk
        except Exception as exc:
            if "openai" in type(exc).__module__:
                raise _wrap_openai_errors(exc) from exc
            raise


def make_chain(
    system_prompt: str,
    temperature: float,
    json_mode: bool = False,
    streaming: bool = False,
    label: str = "unknown",
) -> Runnable:
    # Escape braces in system_prompt so LangChain doesn't treat JSON content
    # (e.g. from the module graph) as template variables.
    escaped_system = system_prompt.replace("{", "{{").replace("}", "}}")
    prompt = ChatPromptTemplate.from_messages(
        [("system", escaped_system), ("human", "{input}")]
    )
    model_kwargs: dict[str, Any] = {}
    if json_mode:
        model_kwargs["response_format"] = {"type": "json_object"}
    llm = ChatOpenAI(
        model=settings.LLM_MODEL,
        temperature=temperature,
        streaming=streaming,
        openai_api_key=settings.OPENAI_API_KEY,  # type: ignore[arg-type]
        max_tokens=4096,
        model_kwargs=model_kwargs,
        callbacks=[_TimingCallback(label)],
    )
    return _SafeChain(prompt | llm)


class BaseChain:
    def __init__(self, temperature: float | None = None) -> None:
        self.llm = ChatOpenAI(
            model=settings.LLM_MODEL,
            openai_api_key=settings.OPENAI_API_KEY,  # type: ignore[arg-type]
            temperature=temperature if temperature is not None else settings.LLM_TEMPERATURE,
            max_tokens=4096,
        )

    def _build_chain(self) -> Any:
        raise NotImplementedError
