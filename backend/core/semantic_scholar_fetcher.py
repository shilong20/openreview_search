"""Fetch papers from Semantic Scholar bulk API for conferences like AAAI."""

import time
from typing import Any, Callable

import requests
from loguru import logger

S2_BULK_URL = "https://api.semanticscholar.org/graph/v1/paper/search/bulk"
S2_FIELDS = "title,authors,abstract,year,venue,externalIds,openAccessPdf"

# Map venue name to the exact venue string used in Semantic Scholar
VENUE_NAME_MAP: dict[str, str] = {
    "AAAI": "AAAI Conference on Artificial Intelligence",
    "IJCAI": "International Joint Conference on Artificial Intelligence",
}


def fetch_semantic_scholar_papers(
    venue: str,
    year: int,
    progress_callback: Callable[[int, int, str], None] | None = None,
    sleep_between_pages: float = 1.0,
) -> list[dict[str, Any]]:
    """Fetch all accepted papers from Semantic Scholar bulk API.

    Args:
        venue: Conference short name, e.g. "AAAI"
        year: Conference year, e.g. 2025
        progress_callback: Optional callable(current, total, message)
        sleep_between_pages: Polite delay between paginated requests

    Returns:
        List of paper dicts compatible with the main fetcher schema.
    """
    s2_venue = VENUE_NAME_MAP.get(venue, venue)

    base_params = {
        "fields": S2_FIELDS,
        "venue": s2_venue,
        "year": str(year),
        "limit": 1000,
    }

    papers: list[dict[str, Any]] = []
    token: str | None = None
    total: int | None = None
    page = 0

    with requests.Session() as session:
        session.headers.update({"User-Agent": "openreview-search/1.0 (research tool)"})

        while True:
            page += 1
            req_params = dict(base_params)
            if token:
                req_params["token"] = token

            data = None
            for attempt in range(3):
                try:
                    r = session.get(S2_BULK_URL, params=req_params, timeout=60)
                    r.raise_for_status()
                    data = r.json()
                    break
                except Exception as e:
                    logger.warning(f"Semantic Scholar API attempt {attempt+1}/3 failed on page {page}: {e}")
                    if attempt < 2:
                        time.sleep(3 * (attempt + 1))
            if data is None:
                raise RuntimeError(
                    f"Failed to fetch Semantic Scholar page {page} after 3 attempts; "
                    "aborting to avoid caching partial results"
                )

            if total is None:
                total = data.get("total", 0)
                logger.info(f"Semantic Scholar: {total} papers found for {venue} {year}")

            batch = data.get("data", [])
            if not batch:
                break

            for item in batch:
                authors_raw = item.get("authors", [])
                authors = [a.get("name", "") for a in authors_raw if a.get("name")]

                external_ids = item.get("externalIds") or {}
                arxiv_id = external_ids.get("ArXiv", "")
                doi = external_ids.get("DOI", "")

                pdf_info = item.get("openAccessPdf") or {}
                pdf_url = pdf_info.get("url", "") or ""

                arxiv_url = f"https://arxiv.org/abs/{arxiv_id}" if arxiv_id else ""
                doi_url = f"https://doi.org/{doi}" if doi else ""

                paper: dict[str, Any] = {
                    "id": item.get("paperId", ""),
                    "title": item.get("title", ""),
                    "authors": authors,
                    "abstract": item.get("abstract") or "",
                    "keywords": [],
                    "venue": venue,
                    "year": year,
                    "decision": "Accept",
                    "pdf_url": pdf_url,
                    "forum_url": doi_url or arxiv_url,
                    "arxiv_url": arxiv_url,
                    "reviews": [],
                    "rating_avg": None,
                    "confidence_avg": None,
                    "meta_review": "",
                    "author_remarks": "",
                    "decision_comment": "",
                }
                papers.append(paper)

            fetched = len(papers)
            if progress_callback and total:
                progress_callback(fetched, total, f"Fetched {fetched}/{total} papers from Semantic Scholar")

            token = data.get("token")
            if len(papers) % 1000 == 0:
                logger.info(f"Progress: {len(papers)}/{total} papers fetched")

            if not token:
                break

            time.sleep(sleep_between_pages)

    logger.success(f"Fetched {len(papers)} papers for {venue} {year} from Semantic Scholar")
    return papers
