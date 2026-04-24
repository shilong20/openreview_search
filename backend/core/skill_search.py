"""Multi-venue topic search across indexed conferences."""

from typing import Any

from loguru import logger

from .evaluator import evaluate_relevance
from .indexer import list_indexed_years
from .keyword_extractor import extract_keywords
from .search_engine import hybrid_search
from .translator import translate_papers_bilingual
from .venues import VENUES

SKILL_VENUES = ("NeurIPS", "ICML", "ICLR", "CVPR")
SKILL_TOP_K = 10
SKILL_CANDIDATE_MULTIPLIER = 3
SKILL_MAX_CONCURRENT = 10


def pick_latest_indexed_year(venue: str) -> int | None:
    years = list_indexed_years(venue)
    if not years:
        return None
    return years[-1]


def resolve_auto_latest_venues() -> list[tuple[str, int]]:
    """Return (venue, latest_indexed_year) for every venue that has indexed data."""
    pairs: list[tuple[str, int]] = []
    for venue_name in VENUES:
        year = pick_latest_indexed_year(venue_name)
        if year is not None:
            pairs.append((venue_name, year))
    return pairs


def serialize_papers(papers: list[dict[str, Any]], venue: str, year: int) -> list[dict[str, Any]]:
    serialized: list[dict[str, Any]] = []
    for rank, paper in enumerate(papers, start=1):
        serialized.append({
            "rank": rank,
            "id": paper.get("id", ""),
            "title": paper.get("title", ""),
            "title_zh": paper.get("title_zh", ""),
            "authors": paper.get("authors", []),
            "abstract": paper.get("abstract", ""),
            "abstract_zh": paper.get("abstract_zh", ""),
            "keywords": paper.get("keywords", []),
            "venue": paper.get("venue", venue),
            "year": paper.get("year", year),
            "decision": paper.get("decision", "N/A"),
            "pdf_url": paper.get("pdf_url", ""),
            "forum_url": paper.get("forum_url", ""),
            "relevance_score": round(paper.get("relevance_score", 0.0), 4),
            "relevance_reason": paper.get("relevance_reason", ""),
            "rrf_score": round(paper.get("rrf_score", 0.0), 6),
            "search_source": paper.get("search_source", ""),
        })
    return serialized


def search_single_venue(
    venue: str,
    year: int,
    topic: str,
    all_keywords: list[str],
    top_k: int = SKILL_TOP_K,
    candidate_multiplier: int = SKILL_CANDIDATE_MULTIPLIER,
    max_concurrent: int = SKILL_MAX_CONCURRENT,
    use_llm_eval: bool = True,
    use_chinese_reason: bool = True,
    use_bilingual_translation: bool = False,
    eval_progress_callback: Any = None,
    translate_progress_callback: Any = None,
) -> dict[str, Any]:
    candidates = hybrid_search(
        query_text=topic,
        keywords=all_keywords,
        venue=venue,
        year=year,
        top_k=top_k * candidate_multiplier,
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

    if use_llm_eval:
        papers = evaluate_relevance(
            papers=candidates,
            research_description=topic,
            top_k=top_k,
            max_concurrent=max_concurrent,
            use_chinese_reason=use_chinese_reason,
            progress_callback=eval_progress_callback,
        )
    else:
        papers = candidates[:top_k]
        for p in papers:
            p["relevance_score"] = p.get("rrf_score", 0.0)
            p["relevance_reason"] = ""

    if use_bilingual_translation:
        papers = translate_papers_bilingual(
            papers=papers,
            max_concurrent=max_concurrent,
            progress_callback=translate_progress_callback,
        )
    else:
        for p in papers:
            p.setdefault("title_zh", p.get("title", ""))
            p.setdefault("abstract_zh", p.get("abstract", ""))

    return {
        "venue": venue,
        "selected_year": year,
        "status": "ok",
        "total_candidates": len(candidates),
        "papers": serialize_papers(papers, venue, year),
    }


def search_multi_venues(
    topic: str,
    venue_year_pairs: list[tuple[str, int]],
    top_k: int = SKILL_TOP_K,
    max_concurrent: int = SKILL_MAX_CONCURRENT,
    use_llm_eval: bool = True,
    use_chinese_reason: bool = True,
    use_bilingual_translation: bool = False,
    progress_callback: Any = None,
) -> dict[str, Any]:
    """Search multiple venues, extracting keywords only once.

    progress_callback(event: dict) is called with:
      {"stage": "keywords"}
      {"stage": "venue_start", "venue": ..., "year": ...}
      {"stage": "eval", "venue": ..., "year": ..., "evaluated": n, "total": m}
      {"stage": "translate", "venue": ..., "year": ..., "translated": n, "total": m}
      {"stage": "venue_done", "venue": ..., "year": ..., "papers": n}
    """
    topic = topic.strip()
    logger.info(f"Multi-venue search: '{topic[:80]}' across {len(venue_year_pairs)} venues")

    if progress_callback:
        progress_callback({"stage": "keywords"})

    kw_result = extract_keywords(topic)
    all_keywords = kw_result["all_terms"]

    venue_results: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []

    for venue, year in venue_year_pairs:
        if progress_callback:
            progress_callback({"stage": "venue_start", "venue": venue, "year": year})

        def make_eval_cb(v: str, y: int):
            def cb(evaluated: int, total: int):
                if progress_callback:
                    progress_callback({"stage": "eval", "venue": v, "year": y, "evaluated": evaluated, "total": total})
            return cb

        def make_translate_cb(v: str, y: int):
            def cb(translated: int, total: int):
                if progress_callback:
                    progress_callback({"stage": "translate", "venue": v, "year": y, "translated": translated, "total": total})
            return cb

        try:
            result = search_single_venue(
                venue=venue,
                year=year,
                topic=topic,
                all_keywords=all_keywords,
                top_k=top_k,
                max_concurrent=max_concurrent,
                use_llm_eval=use_llm_eval,
                use_chinese_reason=use_chinese_reason,
                use_bilingual_translation=use_bilingual_translation,
                eval_progress_callback=make_eval_cb(venue, year),
                translate_progress_callback=make_translate_cb(venue, year),
            )
            venue_results.append(result)
            if progress_callback:
                progress_callback({"stage": "venue_done", "venue": venue, "year": year, "papers": len(result.get("papers", []))})
        except Exception as exc:
            logger.exception(f"Multi-venue search failed for {venue} {year}: {exc}")
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
            "requested_venues": len(venue_year_pairs),
            "successful_venues": successful_venues,
            "failed_venues": len(failures),
            "returned_papers": returned_papers,
        },
    }


def search_latest_topic_for_skill(topic: str) -> dict[str, Any]:
    """Search four flagship conferences using their latest locally indexed year.

    Preserved for backward compatibility with the skill API endpoint.
    """
    topic = topic.strip()
    logger.info(f"Skill search topic: '{topic[:80]}'")

    kw_result = extract_keywords(topic)
    all_keywords = kw_result["all_terms"]

    venue_results: list[dict[str, Any]] = []
    failures: list[dict[str, str]] = []

    for venue in SKILL_VENUES:
        year = pick_latest_indexed_year(venue)
        if year is None:
            failures.append({
                "venue": venue,
                "stage": "year_selection",
                "reason": "No locally indexed year is available for this venue.",
            })
            continue

        try:
            venue_results.append(search_single_venue(
                venue=venue,
                year=year,
                topic=topic,
                all_keywords=all_keywords,
            ))
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
