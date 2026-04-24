"""Unified LLM and Embedding client supporting OpenAI and Gemini formats."""

import os
from collections.abc import Sequence
from typing import Any

from dotenv import load_dotenv
from langchain_core.messages import BaseMessage
from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from loguru import logger
from openai import AsyncOpenAI, OpenAI

load_dotenv()


def extract_text(content: str | list) -> str:
    """Extract plain text from LLM response content.

    Handles both plain string and structured block list
    (e.g. [{'type': 'text', 'text': '...'}]) returned by some providers.
    """
    if isinstance(content, str):
        return content
    parts = []
    for block in content:
        if isinstance(block, dict):
            parts.append(block.get("text", ""))
        elif isinstance(block, str):
            parts.append(block)
    return "".join(parts)


def get_llm_provider() -> str:
    """Detect LLM provider from environment variables."""
    provider = os.getenv("LLM_PROVIDER", "openai").lower()
    if provider not in ("openai", "gemini"):
        raise ValueError(f"Unsupported LLM_PROVIDER: {provider}. Use 'openai' or 'gemini'.")
    return provider


def _resolve_llm_config(
    model: str | None,
    temperature: float,
    max_tokens: int,
    timeout: int | None,
) -> dict[str, Any]:
    """Resolve shared chat client configuration from environment variables."""
    provider = get_llm_provider()

    if provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY")
        base_url = os.getenv("OPENAI_BASE_URL")
        default_model = os.getenv("LLM_MODEL", "gpt-4o-mini")
    else:  # gemini
        api_key = os.getenv("GEMINI_API_KEY")
        base_url = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai/")
        default_model = os.getenv("LLM_MODEL", "gemini-2.0-flash")

    resolved_model = model or default_model
    resolved_timeout = timeout if timeout is not None else int(os.getenv("LLM_TIMEOUT_SECONDS", "600"))

    kwargs: dict[str, Any] = {
        "model": resolved_model,
        "temperature": temperature,
        "timeout": resolved_timeout,
        "api_key": api_key,
    }
    if base_url:
        kwargs["base_url"] = base_url

    if resolved_model.startswith("gpt-5"):
        kwargs["max_completion_tokens"] = max_tokens * 5
    else:
        kwargs["max_tokens"] = max_tokens

    return kwargs


def _messages_to_openai_payload(messages: Sequence[BaseMessage]) -> list[dict[str, str]]:
    payload: list[dict[str, str]] = []
    for message in messages:
        role = getattr(message, "type", "user")
        if role == "human":
            role = "user"
        elif role not in {"system", "user", "assistant", "tool"}:
            role = "user"
        payload.append({
            "role": role,
            "content": extract_text(message.content),
        })
    return payload


def _should_prefer_streaming_text(config: dict[str, Any]) -> bool:
    """Prefer streaming on custom OpenAI-compatible gateways.

    Some third-party gateways return empty content in non-streaming mode while
    still emitting normal `content.delta` events during streaming.
    """
    base_url = str(config.get("base_url") or "").strip().lower()
    if not base_url:
        return False
    if "api.openai.com" in base_url:
        return False
    return True


def _stream_text(messages: Sequence[BaseMessage], config: dict[str, Any]) -> str:
    client = OpenAI(
        api_key=config["api_key"],
        base_url=config.get("base_url"),
        timeout=config.get("timeout"),
    )

    request_kwargs = {
        "model": config["model"],
        "messages": _messages_to_openai_payload(messages),
        "temperature": config["temperature"],
    }
    if "max_completion_tokens" in config:
        request_kwargs["max_completion_tokens"] = config["max_completion_tokens"]
    elif "max_tokens" in config:
        request_kwargs["max_tokens"] = config["max_tokens"]

    chunks: list[str] = []
    with client.chat.completions.stream(**request_kwargs) as stream:
        for event in stream:
            event_type = getattr(event, "type", "")
            if event_type == "content.delta":
                delta = getattr(event, "delta", "")
                if delta:
                    chunks.append(delta)
            elif event_type in {"chunk", "ChatCompletionChunk"}:
                try:
                    delta = event.choices[0].delta
                    if delta and delta.content:
                        chunks.append(delta.content)
                except Exception:
                    continue
        final = stream.get_final_completion()

    final_content = final.choices[0].message.content or ""
    return final_content.strip() or "".join(chunks).strip()


async def _astream_text(messages: Sequence[BaseMessage], config: dict[str, Any]) -> str:
    client = AsyncOpenAI(
        api_key=config["api_key"],
        base_url=config.get("base_url"),
        timeout=config.get("timeout"),
    )

    request_kwargs = {
        "model": config["model"],
        "messages": _messages_to_openai_payload(messages),
        "temperature": config["temperature"],
    }
    if "max_completion_tokens" in config:
        request_kwargs["max_completion_tokens"] = config["max_completion_tokens"]
    elif "max_tokens" in config:
        request_kwargs["max_tokens"] = config["max_tokens"]

    chunks: list[str] = []
    async with client.chat.completions.stream(**request_kwargs) as stream:
        async for event in stream:
            event_type = getattr(event, "type", "")
            if event_type == "content.delta":
                delta = getattr(event, "delta", "")
                if delta:
                    chunks.append(delta)
            elif event_type in {"chunk", "ChatCompletionChunk"}:
                try:
                    delta = event.choices[0].delta
                    if delta and delta.content:
                        chunks.append(delta.content)
                except Exception:
                    continue
        final = await stream.get_final_completion()

    final_content = final.choices[0].message.content or ""
    return final_content.strip() or "".join(chunks).strip()


def create_llm(
    model: str | None = None,
    temperature: float = 0.0,
    max_tokens: int = 1000,
    timeout: int | None = None,
) -> ChatOpenAI:
    """Create a chat LLM client.

    Supports OpenAI format and Gemini via OpenAI-compatible API.
    Configuration via environment variables:
      - LLM_PROVIDER: 'openai' (default) or 'gemini'
      - OPENAI_API_KEY / GEMINI_API_KEY
      - OPENAI_BASE_URL / GEMINI_BASE_URL (optional, for custom endpoints)
      - LLM_MODEL: default model name
    """
    kwargs = _resolve_llm_config(
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        timeout=timeout,
    )
    return ChatOpenAI(**kwargs)


def invoke_text(
    messages: Sequence[BaseMessage],
    model: str | None = None,
    temperature: float = 0.0,
    max_tokens: int = 1000,
    timeout: int | None = None,
) -> str:
    """Invoke the LLM and return plain text content.

    On some custom OpenAI-compatible gateways, non-streaming responses may
    contain empty content even though streaming deltas are correct. Prefer
    streaming on those gateways and retry with streaming as a fallback when
    needed.
    """
    config = _resolve_llm_config(
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        timeout=timeout,
    )

    if _should_prefer_streaming_text(config):
        return _stream_text(messages, config)

    llm = ChatOpenAI(**config)
    response = llm.invoke(list(messages))
    text = extract_text(response.content).strip()
    if text:
        return text

    logger.warning(
        "LLM returned empty content for model '{}'; retrying with streaming fallback.",
        config["model"],
    )
    return _stream_text(messages, config)


async def ainvoke_text(
    messages: Sequence[BaseMessage],
    model: str | None = None,
    temperature: float = 0.0,
    max_tokens: int = 1000,
    timeout: int | None = None,
) -> str:
    """Async variant of :func:`invoke_text`."""
    config = _resolve_llm_config(
        model=model,
        temperature=temperature,
        max_tokens=max_tokens,
        timeout=timeout,
    )

    if _should_prefer_streaming_text(config):
        return await _astream_text(messages, config)

    llm = ChatOpenAI(**config)
    response = await llm.ainvoke(list(messages))
    text = extract_text(response.content).strip()
    if text:
        return text

    logger.warning(
        "LLM returned empty content for model '{}'; retrying with async streaming fallback.",
        config["model"],
    )
    return await _astream_text(messages, config)


def create_embeddings(model: str | None = None) -> OpenAIEmbeddings:
    """Create an embeddings client.

    Embedding provider is configured independently from LLM provider.
    Priority:
      1) Generic embedding config (EMBEDDING_API_KEY / EMBEDDING_BASE_URL / EMBEDDING_MODEL)
      2) Legacy compatibility config (SILICONFLOW_*)
      3) LLM_PROVIDER-specific fallback credentials

    Fallback follows LLM_PROVIDER when embedding credentials are not explicitly set:
      - openai: OPENAI_API_KEY / OPENAI_BASE_URL / EMBEDDING_MODEL
      - gemini:  GEMINI_API_KEY / GEMINI_BASE_URL / EMBEDDING_MODEL
    """
    # 1) Generic embedding config (provider-agnostic)
    generic_api_key = os.getenv("EMBEDDING_API_KEY")
    generic_base_url = os.getenv("EMBEDDING_BASE_URL")
    generic_model = os.getenv("EMBEDDING_MODEL")

    if generic_api_key or generic_base_url or generic_model:
        resolved_model = model or generic_model or "text-embedding-3-small"

        # If api key is omitted in generic config, fall back to provider credentials.
        api_key = generic_api_key
        if not api_key:
            provider = get_llm_provider()
            api_key = os.getenv("OPENAI_API_KEY") if provider == "openai" else os.getenv("GEMINI_API_KEY")

        kwargs: dict[str, Any] = {
            "model": resolved_model,
            "api_key": api_key,
        }
        if generic_base_url:
            kwargs["base_url"] = generic_base_url
        return OpenAIEmbeddings(**kwargs)

    # 2) Legacy compatibility config
    legacy_api_key = os.getenv("SILICONFLOW_API_KEY")
    if legacy_api_key:
        base_url = os.getenv("SILICONFLOW_BASE_URL", "https://api.siliconflow.cn/v1")
        default_model = os.getenv("SILICONFLOW_EMBEDDING_MODEL", "BAAI/bge-m3")
        resolved_model = model or default_model
        return OpenAIEmbeddings(
            model=resolved_model,
            api_key=legacy_api_key,
            base_url=base_url,
        )

    # 3) Fallback: use LLM provider's credentials
    provider = get_llm_provider()
    if provider == "openai":
        api_key = os.getenv("OPENAI_API_KEY")
        base_url = os.getenv("OPENAI_BASE_URL")
        default_model = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
    else:  # gemini
        api_key = os.getenv("GEMINI_API_KEY")
        base_url = os.getenv("GEMINI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai/")
        default_model = os.getenv("EMBEDDING_MODEL", "text-embedding-004")

    resolved_model = model or default_model

    kwargs: dict[str, Any] = {
        "model": resolved_model,
        "api_key": api_key,
    }
    if base_url:
        kwargs["base_url"] = base_url

    return OpenAIEmbeddings(**kwargs)
