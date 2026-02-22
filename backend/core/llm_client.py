"""Unified LLM and Embedding client supporting OpenAI and Gemini formats."""

import os
from typing import Any

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

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


def create_llm(
    model: str | None = None,
    temperature: float = 0.0,
    max_tokens: int = 1000,
    timeout: int = 60,
) -> ChatOpenAI:
    """Create a chat LLM client.

    Supports OpenAI format and Gemini via OpenAI-compatible API.
    Configuration via environment variables:
      - LLM_PROVIDER: 'openai' (default) or 'gemini'
      - OPENAI_API_KEY / GEMINI_API_KEY
      - OPENAI_BASE_URL / GEMINI_BASE_URL (optional, for custom endpoints)
      - LLM_MODEL: default model name
    """
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

    kwargs: dict[str, Any] = {
        "model": resolved_model,
        "temperature": temperature,
        "timeout": timeout,
        "api_key": api_key,
    }
    if base_url:
        kwargs["base_url"] = base_url

    # GPT-5 series uses max_completion_tokens
    if resolved_model.startswith("gpt-5"):
        kwargs["max_completion_tokens"] = max_tokens * 5
    else:
        kwargs["max_tokens"] = max_tokens

    return ChatOpenAI(**kwargs)


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
