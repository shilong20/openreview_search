"""Hybrid search engine: vector search + keyword search + RRF fusion."""

from pathlib import Path

from loguru import logger

from .fetcher import load_papers
from .indexer import load_vectorstore, is_indexed

DEFAULT_RRF_K = 60
DEFAULT_TOP_K = 100


def reciprocal_rank_fusion(
    results_dict: dict[str, list[str]],
    k: int = DEFAULT_RRF_K,
    weights: dict[str, float] | None = None,
) -> list[tuple[str, float]]:
    """Combine ranked lists using Reciprocal Rank Fusion."""
    weights = weights or {algo: 1.0 for algo in results_dict}
    fused: dict[str, float] = {}

    for algo, ranked_ids in results_dict.items():
        weight = weights.get(algo, 1.0)
        for rank, paper_id in enumerate(ranked_ids):
            fused[paper_id] = fused.get(paper_id, 0.0) + weight * (1.0 / (k + rank + 1))

    return sorted(fused.items(), key=lambda x: x[1], reverse=True)


def vector_search(
    query_text: str,
    venue: str,
    year: int,
    top_k: int = DEFAULT_TOP_K,
) -> list[tuple[str, float]]:
    """Semantic vector search via ChromaDB."""
    if not is_indexed(venue, year):
        logger.warning(f"No vector index for {venue} {year}, skipping vector search")
        return []

    vectorstore = load_vectorstore(venue, year)
    results = vectorstore.similarity_search_with_score(query_text, k=top_k)

    ranked = []
    for doc, distance in results:
        paper_id = doc.metadata.get("id")
        if paper_id:
            similarity = 1.0 / (1.0 + distance)
            ranked.append((paper_id, similarity))

    logger.debug(f"Vector search: {len(ranked)} results")
    return ranked


def keyword_search(
    keywords: list[str],
    venue: str,
    year: int,
    top_k: int = DEFAULT_TOP_K,
) -> list[tuple[str, float]]:
    """Keyword matching on title, abstract, and keywords fields."""
    papers = load_papers(venue, year)
    keywords_lower = [kw.lower().strip() for kw in keywords if kw.strip()]

    scored: list[tuple[str, float]] = []

    for paper in papers:
        # Skip clear rejects
        decision = paper.get("decision", "").lower()
        if "reject" in decision:
            continue

        paper_id = paper.get("id")
        if not paper_id:
            continue

        title = paper.get("title", "").lower()
        abstract = paper.get("abstract", "").lower()
        paper_keywords = [kw.lower() for kw in paper.get("keywords", [])]
        text = f"{title} {abstract}"

        score = 0.0
        matched = 0

        for kw in keywords_lower:
            if any(kw in pk for pk in paper_keywords):
                score += 2.0
                matched += 1
            elif kw in text:
                score += 1.0
                matched += 1

        if keywords_lower:
            coverage = matched / len(keywords_lower)
            score += coverage * 0.5

        if score > 0:
            scored.append((paper_id, score))

    scored.sort(key=lambda x: x[1], reverse=True)
    logger.debug(f"Keyword search: {len(scored)} results")
    return scored[:top_k]


def hybrid_search(
    query_text: str,
    keywords: list[str],
    venue: str,
    year: int,
    top_k: int = DEFAULT_TOP_K,
    vector_weight: float = 1.0,
    keyword_weight: float = 1.0,
) -> list[dict]:
    """Hybrid search combining vector and keyword search with RRF.

    Returns list of paper dicts with added 'rrf_score' and 'search_source' fields.
    """
    logger.info(f"Hybrid search in {venue} {year} | query='{query_text[:60]}...'")

    # Vector search
    vector_results = vector_search(query_text, venue, year, top_k=top_k * 2)
    vector_ids = [pid for pid, _ in vector_results]

    # Keyword search
    keyword_results = keyword_search(keywords, venue, year, top_k=top_k * 2)
    keyword_ids = [pid for pid, _ in keyword_results]

    if not vector_ids and not keyword_ids:
        logger.warning("No results from either search method")
        return []

    # RRF fusion
    results_dict: dict[str, list[str]] = {}
    weights: dict[str, float] = {}
    if vector_ids:
        results_dict["vector"] = vector_ids
        weights["vector"] = vector_weight
    if keyword_ids:
        results_dict["keyword"] = keyword_ids
        weights["keyword"] = keyword_weight

    fused = reciprocal_rank_fusion(results_dict, weights=weights)

    # Load paper metadata
    papers = load_papers(venue, year)
    papers_by_id = {p["id"]: p for p in papers if "id" in p}

    vector_set = set(vector_ids)
    keyword_set = set(keyword_ids)

    result_papers = []
    for paper_id, rrf_score in fused[:top_k]:
        if paper_id in papers_by_id:
            paper = papers_by_id[paper_id].copy()
            paper["rrf_score"] = rrf_score
            if paper_id in vector_set and paper_id in keyword_set:
                paper["search_source"] = "both"
            elif paper_id in vector_set:
                paper["search_source"] = "vector"
            else:
                paper["search_source"] = "keyword"
            result_papers.append(paper)

    logger.info(f"Hybrid search returned {len(result_papers)} papers")
    return result_papers
