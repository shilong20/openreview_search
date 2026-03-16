"""Skill-oriented topic search across the latest indexed top conferences."""

from typing import Any

from loguru import logger

from .evaluator import evaluate_relevance
from .indexer import list_indexed_years
from .keyword_extractor import extract_keywords
from .search_engine import hybrid_search

SKILL_VENUES = ("NeurIPS", "ICML", "ICLR", "CVPR")
SKILL_TOP_K = 10
SKILL_CANDIDATE_MULTIPLIER = 3
SKILL_MAX_CONCURRENT = 10


def _pick_latest_indexed_year(venue: str) -> int | None:
    years = list_indexed_years(venue)
    if not years:
        return None
    return years[-1]


def _serialize_papers(papers: list[dict[str, Any]], venue: str, year: int) -> list[dict[str, Any]]:
    serialized: list[dict[str, Any]] = []
    for rank, paper in enumerate(papers, start=1):
        serialized.append({
            "rank": rank,
            "id": paper.get("id", ""),
            "title": paper.get("title", ""),
            "authors": paper.get("authors", []),
            "abstract": paper.get("abstract", ""),
            "keywords": paper.get("keywords", []),
            "venue": paper.get("venue", venue),
            "year": paper.get("year", year),
            "decision": paper.get("decision", "N/A"),
            "pdf_url": paper.get("pdf_url", ""),
            "forum_url": paper.get("forum_url", ""),
            "relevance_score": round(paper.get("relevance_score", 0.0), 4),
            "relevance_reason": paper.get("relevance_reason", ""),
        })
    return serialized


def _search_single_venue(
    venue: str,
    year: int,
    topic: str,
    all_keywords: list[str],
) -> dict[str, Any]:
    candidates = hybrid_search(
        query_text=topic,
        keywords=all_keywords,
        venue=venue,
        year=year,
        top_k=SKILL_TOP_K * SKILL_CANDIDATE_MULTIPLIER,
        vector_weight=1.0,
        keyword_weight=1.0,
    )

    if not candidates:
        return {
            "venue": venue,
            "selected_year": year,
            "status": "empty",
            "total_candidates": 0,
            "papers": [],
        }

    papers = evaluate_relevance(
        papers=candidates,
        research_description=topic,
        top_k=SKILL_TOP_K,
        max_concurrent=SKILL_MAX_CONCURRENT,
        use_chinese_reason=True,
    )

    return {
        "venue": venue,
        "selected_year": year,
        "status": "ok",
        "total_candidates": len(candidates),
        "papers": _serialize_papers(papers, venue, year),
    }


def search_latest_topic_for_skill(topic: str) -> dict[str, Any]:
    """Search four conferences using their latest locally indexed year."""
    topic = topic.strip()
    logger.info(f"Skill search topic: '{topic[:80]}'")

    kw_result = extract_keywords(topic)
    all_keywords = kw_result["all_terms"]

    venue_results: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []

    for venue in SKILL_VENUES:
        year = _pick_latest_indexed_year(venue)
        if year is None:
            failures.append({
                "venue": venue,
                "stage": "year_selection",
                "reason": "No locally indexed year is available for this venue.",
            })
            continue

        try:
            venue_results.append(_search_single_venue(venue, year, topic, all_keywords))
        except Exception as exc:
            logger.exception(f"Skill search failed for {venue} {year}: {exc}")
            failures.append({
                "venue": venue,
                "stage": "search",
                "reason": str(exc),
            })

    returned_papers = sum(len(item["papers"]) for item in venue_results)
    successful_venues = sum(1 for item in venue_results if item["status"] == "ok")

    return {
        "topic": topic,
        "keywords": kw_result["keywords"],
        "expanded_keywords": kw_result["expanded"],
        "venues": venue_results,
        "failures": failures,
        "summary": {
            "requested_venues": len(SKILL_VENUES),
            "successful_venues": successful_venues,
            "failed_venues": len(failures),
            "returned_papers": returned_papers,
        },
    }
