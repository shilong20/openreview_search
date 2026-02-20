"""Unified LLM and Embedding client supporting OpenAI and Gemini formats."""

import os
from typing import Any

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI, OpenAIEmbeddings

load_dotenv()


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

    Supports OpenAI format and Gemini via OpenAI-compatible API.
    Configuration via environment variables:
      - LLM_PROVIDER: 'openai' (default) or 'gemini'
      - OPENAI_API_KEY / GEMINI_API_KEY
      - OPENAI_BASE_URL / GEMINI_BASE_URL (optional)
      - EMBEDDING_MODEL: default embedding model name
    """
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
