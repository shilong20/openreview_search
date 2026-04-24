"""Translate paper title and abstract into Chinese for bilingual output."""

import asyncio
import hashlib
import json
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from loguru import logger

from .llm_client import ainvoke_text

SYSTEM_PROMPT = """You are an expert academic translator.

Translate the given paper title and abstract into Simplified Chinese.
Requirements:
- Keep technical terminology accurate.
- Keep abbreviations (e.g., CFG, LLM, GAN) and formulas unchanged when needed.
- Keep the meaning faithful; do not add extra explanations.
- Return ONLY a JSON object with this exact structure:
{
  "title_zh": "...",
  "abstract_zh": "..."
}"""

USER_PROMPT_TEMPLATE = """Title:
{title}

Abstract:
{abstract}

Translate both fields to Simplified Chinese and return JSON only."""

_translation_cache: dict[str, dict[str, str]] = {}


def _cache_key(title: str, abstract: str) -> str:
    payload = f"{title}\n{abstract}".encode("utf-8")
    return hashlib.sha1(payload).hexdigest()


def _parse_translation(response_text: str) -> dict[str, str]:
    text = response_text.strip()
    try:
        data = json.loads(text)
        return {
            "title_zh": str(data.get("title_zh", "")).strip(),
            "abstract_zh": str(data.get("abstract_zh", "")).strip(),
        }
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            data = json.loads(match.group())
            return {
                "title_zh": str(data.get("title_zh", "")).strip(),
                "abstract_zh": str(data.get("abstract_zh", "")).strip(),
            }
        except json.JSONDecodeError:
            pass

    return {"title_zh": "", "abstract_zh": ""}


async def _translate_single(
    paper: dict[str, Any],
    semaphore: asyncio.Semaphore,
    model: str | None = None,
) -> dict[str, Any]:
    title = str(paper.get("title", "")).strip()
    abstract = str(paper.get("abstract", "")).strip()

    key = _cache_key(title, abstract)
    if key in _translation_cache:
        merged = paper.copy()
        merged.update(_translation_cache[key])
        return merged

    async with semaphore:
        messages = [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(
                content=USER_PROMPT_TEMPLATE.format(
                    title=title[:500],
                    abstract=abstract[:3500],
                )
            ),
        ]

        try:
            text = await ainvoke_text(messages, model=model, temperature=0.0, max_tokens=1200)
            parsed = _parse_translation(text)
            title_zh = parsed.get("title_zh", "") or title
            abstract_zh = parsed.get("abstract_zh", "") or abstract
        except Exception as e:
            logger.warning(f"Translate failed for '{title[:60]}': {e}")
            title_zh = title
            abstract_zh = abstract

        translated = {"title_zh": title_zh, "abstract_zh": abstract_zh}
        _translation_cache[key] = translated

        merged = paper.copy()
        merged.update(translated)
        return merged


async def _translate_papers_parallel(
    papers: list[dict[str, Any]],
    max_concurrent: int = 10,
    model: str | None = None,
) -> list[dict[str, Any]]:
    if not papers:
        return []

    semaphore = asyncio.Semaphore(max_concurrent)

    tasks = [_translate_single(p, semaphore, model=model) for p in papers]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    translated: list[dict[str, Any]] = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            paper = papers[i].copy()
            title = str(paper.get("title", "")).strip()
            abstract = str(paper.get("abstract", "")).strip()
            paper["title_zh"] = title
            paper["abstract_zh"] = abstract
            translated.append(paper)
        else:
            translated.append(result)
    return translated


def translate_papers_bilingual(
    papers: list[dict[str, Any]],
    max_concurrent: int = 10,
    model: str | None = None,
) -> list[dict[str, Any]]:
    """Translate final papers to bilingual fields: title_zh and abstract_zh."""
    logger.info(f"Translating {len(papers)} papers to bilingual fields...")
    translated = asyncio.run(
        _translate_papers_parallel(
            papers=papers,
            max_concurrent=max_concurrent,
            model=model,
        )
    )
    logger.success("Bilingual translation complete")
    return translated
