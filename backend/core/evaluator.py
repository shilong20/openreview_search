"""LLM-based paper relevance evaluator (relevance score only)."""

import asyncio
import json
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from loguru import logger

from .llm_client import create_llm

SYSTEM_PROMPT = """You are an expert academic paper evaluator. Your task is to assess how relevant a research paper is to a user's research interests.

Evaluate the paper and return a JSON object with exactly this structure:
{
  "relevance_score": <float between 0.0 and 1.0>,
  "relevance_reason": "<one sentence explanation>"
}

Scoring guide:
- 0.9-1.0: Directly addresses the research topic, highly relevant
- 0.7-0.9: Closely related, significant overlap
- 0.5-0.7: Moderately related, some overlap
- 0.3-0.5: Tangentially related
- 0.0-0.3: Not relevant

Return ONLY the JSON object, no other text."""

USER_PROMPT_TEMPLATE = """Research interests: {research_description}

Paper title: {title}
Abstract: {abstract}
Keywords: {keywords}

Evaluate the relevance of this paper to the research interests."""


def _parse_score(response_text: str) -> dict[str, Any]:
    """Parse LLM response to extract relevance score."""
    try:
        # Try direct JSON parse
        return json.loads(response_text.strip())
    except json.JSONDecodeError:
        pass

    # Try extracting JSON from response
    match = re.search(r'\{[^{}]+\}', response_text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    # Fallback: try to extract score with regex
    score_match = re.search(r'"relevance_score"\s*:\s*([0-9.]+)', response_text)
    score = float(score_match.group(1)) if score_match else 0.0
    return {"relevance_score": score, "relevance_reason": ""}


async def _evaluate_single(
    paper: dict,
    research_description: str,
    llm,
    semaphore: asyncio.Semaphore,
) -> dict:
    """Evaluate a single paper's relevance."""
    async with semaphore:
        title = paper.get("title", "")
        abstract = paper.get("abstract", "")[:1500]  # truncate long abstracts
        keywords = ", ".join(paper.get("keywords", [])[:10])

        messages = [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=USER_PROMPT_TEMPLATE.format(
                research_description=research_description,
                title=title,
                abstract=abstract,
                keywords=keywords,
            )),
        ]

        try:
            response = await llm.ainvoke(messages)
            parsed = _parse_score(response.content)
            relevance_score = max(0.0, min(1.0, float(parsed.get("relevance_score", 0.0))))
            relevance_reason = parsed.get("relevance_reason", "")
        except Exception as e:
            logger.warning(f"LLM eval failed for '{title[:50]}': {e}")
            relevance_score = 0.0
            relevance_reason = ""

        result = paper.copy()
        result["relevance_score"] = relevance_score
        result["relevance_reason"] = relevance_reason
        return result


async def _evaluate_papers_parallel(
    papers: list[dict],
    research_description: str,
    max_concurrent: int = 10,
    model: str | None = None,
) -> list[dict]:
    """Evaluate papers in parallel with rate limiting."""
    llm = create_llm(model=model, temperature=0.0, max_tokens=200)
    semaphore = asyncio.Semaphore(max_concurrent)

    tasks = [
        _evaluate_single(paper, research_description, llm, semaphore)
        for paper in papers
    ]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    evaluated = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            logger.warning(f"Paper {i} evaluation failed: {result}")
            paper = papers[i].copy()
            paper["relevance_score"] = 0.0
            paper["relevance_reason"] = ""
            evaluated.append(paper)
        else:
            evaluated.append(result)

    return evaluated


def evaluate_relevance(
    papers: list[dict],
    research_description: str,
    top_k: int = 100,
    max_concurrent: int = 10,
    model: str | None = None,
) -> list[dict]:
    """Evaluate and rank papers by relevance to research description.

    Args:
        papers: List of paper dicts (already pre-filtered by hybrid search)
        research_description: Natural language description of research interests
        top_k: Number of papers to evaluate with LLM
        max_concurrent: Max concurrent LLM calls
        model: LLM model name (uses env default if None)

    Returns:
        Papers sorted by relevance_score descending
    """
    candidates = papers[:top_k]
    logger.info(f"LLM evaluating {len(candidates)} papers for relevance...")

    evaluated = asyncio.run(
        _evaluate_papers_parallel(
            candidates,
            research_description,
            max_concurrent=max_concurrent,
            model=model,
        )
    )

    evaluated.sort(key=lambda p: p.get("relevance_score", 0.0), reverse=True)
    logger.success(f"Evaluation complete. Top score: {evaluated[0].get('relevance_score', 0):.2f}" if evaluated else "No papers evaluated")
    return evaluated
