"""FastAPI route definitions."""

import asyncio
from typing import Any

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from loguru import logger

from ..core.venues import get_supported_venues, VENUES
from ..core.fetcher import fetch_papers, is_cached, get_cache_metadata, list_cached_years
from ..core.indexer import build_index, is_indexed, list_indexed_years
from ..core.keyword_extractor import extract_keywords
from ..core.search_engine import hybrid_search
from ..core.evaluator import evaluate_relevance

router = APIRouter()

# In-memory job status store (simple, no persistence needed)
_job_status: dict[str, dict] = {}


# ─── Models ────────────────────────────────────────────────────────────────────

class FetchRequest(BaseModel):
    venue: str
    year: int
    force: bool = False


class IndexRequest(BaseModel):
    venue: str
    year: int
    force: bool = False


class SearchRequest(BaseModel):
    venue: str
    year: int
    research_description: str = Field(..., min_length=3)
    top_k: int = Field(default=50, ge=1, le=200)
    max_concurrent: int = Field(default=10, ge=1, le=20)
    use_llm_eval: bool = True
    vector_weight: float = Field(default=1.0, ge=0.0)
    keyword_weight: float = Field(default=1.0, ge=0.0)


class PaperResult(BaseModel):
    id: str
    title: str
    authors: list[str]
    abstract: str
    keywords: list[str]
    venue: str
    year: int
    decision: str
    pdf_url: str
    forum_url: str
    relevance_score: float = 0.0
    relevance_reason: str = ""
    rrf_score: float = 0.0
    search_source: str = ""


# ─── Venues ────────────────────────────────────────────────────────────────────

@router.get("/venues")
def list_venues() -> list[dict]:
    """List supported conferences with min_year and status of locally cached/indexed years."""
    venues = get_supported_venues()
    for v in venues:
        cached_years = list_cached_years(v["name"])
        indexed_years = list_indexed_years(v["name"])
        all_years = sorted(set(cached_years) | set(indexed_years))
        v["status"] = {
            str(y): {
                "fetched": y in cached_years,
                "indexed": y in indexed_years,
            }
            for y in all_years
        }
    return venues


# ─── Data fetch ────────────────────────────────────────────────────────────────

@router.post("/fetch")
async def fetch_venue_papers(req: FetchRequest, background_tasks: BackgroundTasks) -> dict:
    """Start fetching papers for a venue/year in the background."""
    job_id = f"fetch_{req.venue}_{req.year}"

    if job_id in _job_status and _job_status[job_id].get("status") == "running":
        return {"job_id": job_id, "status": "already_running"}

    _job_status[job_id] = {"status": "running", "progress": 0, "total": 0, "message": "Starting..."}

    def run():
        try:
            def progress_cb(current, total, msg):
                _job_status[job_id].update({"progress": current, "total": total, "message": msg})

            result = fetch_papers(req.venue, req.year, force=req.force, progress_callback=progress_cb)
            _job_status[job_id] = {"status": "done", "result": result, "message": "Complete"}
        except Exception as e:
            logger.error(f"Fetch job {job_id} failed: {e}")
            _job_status[job_id] = {"status": "error", "message": str(e)}

    background_tasks.add_task(run)
    return {"job_id": job_id, "status": "started"}


@router.get("/fetch/{venue}/{year}/status")
def fetch_status(venue: str, year: int) -> dict:
    """Get fetch job status."""
    job_id = f"fetch_{venue}_{year}"
    if job_id not in _job_status:
        cached = is_cached(venue, year)
        meta = get_cache_metadata(venue, year) if cached else None
        return {
            "status": "done" if cached else "not_started",
            "cached": cached,
            "metadata": meta,
        }
    return _job_status[job_id]


# ─── Index ─────────────────────────────────────────────────────────────────────

@router.post("/index")
async def index_venue_papers(req: IndexRequest, background_tasks: BackgroundTasks) -> dict:
    """Build vector index for a venue/year in the background."""
    if not is_cached(req.venue, req.year):
        raise HTTPException(status_code=400, detail=f"No data for {req.venue} {req.year}. Fetch first.")

    job_id = f"index_{req.venue}_{req.year}"

    if job_id in _job_status and _job_status[job_id].get("status") == "running":
        return {"job_id": job_id, "status": "already_running"}

    _job_status[job_id] = {"status": "running", "progress": 0, "total": 0, "message": "Starting..."}

    def run():
        try:
            def progress_cb(current, total, msg):
                _job_status[job_id].update({"progress": current, "total": total, "message": msg})

            result = build_index(req.venue, req.year, force=req.force, progress_callback=progress_cb)
            _job_status[job_id] = {"status": "done", "result": result, "message": "Complete"}
        except Exception as e:
            logger.error(f"Index job {job_id} failed: {e}")
            _job_status[job_id] = {"status": "error", "message": str(e)}

    background_tasks.add_task(run)
    return {"job_id": job_id, "status": "started"}


@router.get("/index/{venue}/{year}/status")
def index_status(venue: str, year: int) -> dict:
    """Get index job status."""
    job_id = f"index_{venue}_{year}"
    if job_id not in _job_status:
        indexed = is_indexed(venue, year)
        return {"status": "done" if indexed else "not_started", "indexed": indexed}
    return _job_status[job_id]


# ─── Search ────────────────────────────────────────────────────────────────────

@router.post("/search")
def search_papers(req: SearchRequest) -> dict[str, Any]:
    """Search and rank papers by relevance to research description.

    Pipeline:
    1. Extract keywords from description (LLM)
    2. Hybrid search (vector + keyword + RRF)
    3. LLM relevance evaluation (optional)
    4. Return ranked results
    """
    if not is_cached(req.venue, req.year):
        raise HTTPException(
            status_code=400,
            detail=f"No data for {req.venue} {req.year}. Please fetch papers first."
        )

    # Step 1: Extract keywords
    logger.info(f"Search: {req.venue} {req.year} | '{req.research_description[:60]}'")
    kw_result = extract_keywords(req.research_description)
    all_keywords = kw_result["all_terms"]
    logger.info(f"Keywords: {kw_result['keywords']}")

    # Step 2: Hybrid search
    candidates = hybrid_search(
        query_text=req.research_description,
        keywords=all_keywords,
        venue=req.venue,
        year=req.year,
        top_k=req.top_k * 3 if req.use_llm_eval else req.top_k,
        vector_weight=req.vector_weight,
        keyword_weight=req.keyword_weight,
    )

    if not candidates:
        return {
            "papers": [],
            "keywords": kw_result["keywords"],
            "expanded_keywords": kw_result["expanded"],
            "total_candidates": 0,
        }

    # Step 3: LLM relevance evaluation (optional)
    if req.use_llm_eval:
        papers = evaluate_relevance(
            papers=candidates,
            research_description=req.research_description,
            top_k=req.top_k,
            max_concurrent=req.max_concurrent,
        )
    else:
        # No LLM eval: use rrf_score as relevance proxy
        papers = candidates[:req.top_k]
        for p in papers:
            p["relevance_score"] = p.get("rrf_score", 0.0)
            p["relevance_reason"] = ""

    # Serialize results
    result_papers = []
    for p in papers:
        result_papers.append({
            "id": p.get("id", ""),
            "title": p.get("title", ""),
            "authors": p.get("authors", []),
            "abstract": p.get("abstract", ""),
            "keywords": p.get("keywords", []),
            "venue": p.get("venue", req.venue),
            "year": p.get("year", req.year),
            "decision": p.get("decision", "N/A"),
            "pdf_url": p.get("pdf_url", ""),
            "forum_url": p.get("forum_url", ""),
            "relevance_score": round(p.get("relevance_score", 0.0), 4),
            "relevance_reason": p.get("relevance_reason", ""),
            "rrf_score": round(p.get("rrf_score", 0.0), 6),
            "search_source": p.get("search_source", ""),
        })

    return {
        "papers": result_papers,
        "keywords": kw_result["keywords"],
        "expanded_keywords": kw_result["expanded"],
        "total_candidates": len(candidates),
    }
