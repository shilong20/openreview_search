"""Fetch papers from OpenReview API for supported conferences."""

import json
import time
from datetime import datetime
from pathlib import Path
from typing import Any

import openreview
from loguru import logger

from .venues import get_venue_id, VENUES

STORAGE_DIR = Path(__file__).parent.parent.parent / "storage" / "papers_data"


def get_papers_dir(venue: str, year: int) -> Path:
    return STORAGE_DIR / f"{venue}_{year}"


def get_papers_file(venue: str, year: int) -> Path:
    return get_papers_dir(venue, year) / "all_papers.json"


def get_metadata_file(venue: str, year: int) -> Path:
    return get_papers_dir(venue, year) / "metadata.json"


def is_cached(venue: str, year: int) -> bool:
    return get_papers_file(venue, year).exists()


def get_cache_metadata(venue: str, year: int) -> dict | None:
    meta_file = get_metadata_file(venue, year)
    if meta_file.exists():
        return json.loads(meta_file.read_text(encoding="utf-8"))
    return None


def _get_openreview_client() -> openreview.api.OpenReviewClient:
    return openreview.api.OpenReviewClient(baseurl="https://api2.openreview.net")


def _extract_value(field: Any) -> Any:
    """Extract value from OpenReview field (handles dict wrapper)."""
    if isinstance(field, dict):
        return field.get("value", "")
    return field


def fetch_papers(
    venue: str,
    year: int,
    force: bool = False,
    progress_callback=None,
) -> dict:
    """Fetch all papers from a conference and save to disk.

    Args:
        venue: Conference name (e.g., "NeurIPS", "CVPR")
        year: Conference year
        force: Re-download even if cache exists
        progress_callback: Optional callable(current, total, message) for progress updates

    Returns:
        dict with keys: total, cached, venue, year
    """
    if venue not in VENUES:
        raise ValueError(f"Unsupported venue: {venue}")

    papers_file = get_papers_file(venue, year)
    data_dir = get_papers_dir(venue, year)
    data_dir.mkdir(parents=True, exist_ok=True)

    if papers_file.exists() and not force:
        meta = get_cache_metadata(venue, year)
        total = meta["total_papers"] if meta else 0
        logger.info(f"Cache hit: {venue} {year} ({total} papers)")
        return {"total": total, "cached": True, "venue": venue, "year": year}

    logger.info(f"Fetching papers from {venue} {year}...")
    client = _get_openreview_client()
    venue_id = get_venue_id(venue, year)

    # Fetch all submissions
    max_retries = 5
    retry_delay = 10
    submissions = None

    for attempt in range(max_retries):
        try:
            submissions = client.get_all_notes(
                invitation=f"{venue_id}/-/Submission",
            )
            logger.success(f"Fetched {len(submissions)} submissions")
            break
        except Exception as e:
            logger.warning(f"Attempt {attempt + 1}/{max_retries} failed: {e}")
            if attempt < max_retries - 1:
                time.sleep(retry_delay)
                retry_delay *= 2
            else:
                raise RuntimeError(f"Failed to fetch from OpenReview after {max_retries} attempts") from e

    papers: list[dict[str, Any]] = []
    total = len(submissions)

    for i, submission in enumerate(submissions, 1):
        if progress_callback:
            progress_callback(i, total, f"Processing paper {i}/{total}")

        title = _extract_value(submission.content.get("title", ""))
        authors = _extract_value(submission.content.get("authors", []))
        abstract = _extract_value(submission.content.get("abstract", ""))
        keywords = _extract_value(submission.content.get("keywords", []))

        # Try to get decision from venue field
        venue_field = submission.content.get("venue", {})
        decision = _extract_value(venue_field) if venue_field else "N/A"

        paper_info = {
            "id": submission.id,
            "title": title,
            "authors": authors if isinstance(authors, list) else [authors],
            "abstract": abstract,
            "keywords": keywords if isinstance(keywords, list) else [],
            "venue": venue,
            "year": year,
            "decision": decision or "N/A",
            "pdf_url": f"https://openreview.net/pdf?id={submission.id}",
            "forum_url": f"https://openreview.net/forum?id={submission.id}",
            "reviews": [],
            "rating_avg": None,
            "confidence_avg": None,
            "meta_review": "",
            "author_remarks": "",
            "decision_comment": "",
        }
        papers.append(paper_info)

    # Save papers
    papers_file.write_text(
        json.dumps(papers, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    # Save metadata
    metadata = {
        "venue": venue,
        "year": year,
        "total_papers": len(papers),
        "fetch_date": datetime.now().isoformat(),
        "file_size_mb": round(papers_file.stat().st_size / 1024 / 1024, 2),
        "includes_review_data": False,
    }
    get_metadata_file(venue, year).write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    logger.success(f"Saved {len(papers)} papers for {venue} {year}")
    return {"total": len(papers), "cached": False, "venue": venue, "year": year}


def load_papers(venue: str, year: int) -> list[dict]:
    """Load papers from cache."""
    papers_file = get_papers_file(venue, year)
    if not papers_file.exists():
        raise FileNotFoundError(
            f"No data for {venue} {year}. Run fetch first."
        )
    return json.loads(papers_file.read_text(encoding="utf-8"))
