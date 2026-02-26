"""Fetch papers from CVF Open Access (openaccess.thecvf.com) for CVPR/ICCV/WACV."""

import time
from typing import Any, Callable
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from loguru import logger

CVF_BASE_URL = "https://openaccess.thecvf.com"


def _polite_get(
    url: str,
    session: requests.Session,
    retries: int = 3,
    timeout: int = 30,
    sleep: float = 0.2,
) -> requests.Response:
    last_exc: Exception | None = None
    for attempt in range(retries):
        try:
            r = session.get(
                url,
                timeout=timeout,
                headers={"User-Agent": "cvf-metadata-fetcher/1.0 (respectful; rate-limited)"},
            )
            if r.status_code == 200:
                return r
            logger.warning(f"HTTP {r.status_code} for {url}")
        except Exception as e:
            last_exc = e
            logger.warning(f"Attempt {attempt + 1}/{retries} failed for {url}: {e}")
        time.sleep(sleep * (attempt + 1))
    if last_exc:
        raise last_exc
    raise RuntimeError(f"Failed to GET {url} after {retries} retries")


def _parse_list_page(html: str) -> list[dict[str, Any]]:
    """Parse CVF listing page and extract (title, detail_url, authors, pdf_url)."""
    soup = BeautifulSoup(html, "html.parser")
    entries: list[dict[str, Any]] = []

    # Each paper block: dt.ptitle > a[href] (title link), then dd for authors/links
    for dt in soup.select("dt.ptitle"):
        a = dt.find("a", href=True)
        if not a:
            continue
        title = a.get_text(strip=True)
        detail_url = urljoin(CVF_BASE_URL, a["href"])

        # A paper block may contain multiple dd siblings (authors/links split across dd nodes)
        dd_nodes = []
        for sibling in dt.next_siblings:
            tag_name = getattr(sibling, "name", None)
            if tag_name == "dt":
                break
            if tag_name == "dd":
                dd_nodes.append(sibling)

        authors: list[str] = []
        pdf_url: str | None = None
        arxiv_url: str | None = None

        if dd_nodes:
            # Parse authors from the first dd block; detailed authors are later refreshed from detail page.
            author_dd = BeautifulSoup(str(dd_nodes[0]), "html.parser")
            author_node = author_dd.find("dd")
            if author_node:
                for tag in author_node.select("a, form, div.author_pdf_links"):
                    tag.decompose()
                raw_text = author_node.get_text(" ", strip=True)
                authors = [x.strip() for x in raw_text.replace(";", ",").split(",") if x.strip()]

            # Extract links across all dd nodes so we don't miss PDFs in later sibling dd tags.
            for dd in dd_nodes:
                for link in dd.select("a[href]"):
                    href = link.get("href", "").strip()
                    if not href:
                        continue
                    text = link.get_text(" ", strip=True).lower()
                    full_url = urljoin(CVF_BASE_URL, href)

                    if pdf_url is None and (href.lower().endswith(".pdf") or "pdf" in text):
                        pdf_url = full_url
                    if arxiv_url is None and ("arxiv.org" in href.lower() or "arxiv" in text):
                        arxiv_url = full_url

        entries.append({
            "title": title,
            "detail_url": detail_url,
            "authors": authors,
            "pdf_url": pdf_url,
            "arxiv_url": arxiv_url,
        })

    return entries


def _parse_detail_page(html: str) -> dict[str, Any]:
    """Parse CVF paper detail page to get abstract and bibtex."""
    soup = BeautifulSoup(html, "html.parser")

    abstract: str = ""
    ab_node = soup.select_one("#abstract")
    if ab_node:
        abstract = ab_node.get_text(" ", strip=True)

    bibtex: str = ""
    pre = soup.select_one("div.bibref pre")
    if pre:
        bibtex = pre.get_text().strip()
    else:
        bib = soup.select_one("div.bibref")
        if bib:
            bibtex = bib.get_text().strip()

    # Authors from detail page (more reliable)
    authors: list[str] = []
    anode = soup.select_one("#authors i")
    if anode:
        raw = anode.get_text(" ", strip=True)
        authors = [x.strip() for x in raw.replace(";", ",").split(",") if x.strip()]

    return {"abstract": abstract, "bibtex": bibtex, "authors": authors}


def fetch_cvf_papers(
    venue: str,
    year: int,
    progress_callback: Callable[[int, int, str], None] | None = None,
    sleep_between_requests: float = 0.15,
) -> list[dict[str, Any]]:
    """Fetch all accepted papers from CVF Open Access.

    Args:
        venue: Conference name, e.g. "CVPR", "ICCV"
        year: Conference year, e.g. 2025
        progress_callback: Optional callable(current, total, message)
        sleep_between_requests: Polite delay (seconds) between detail-page requests

    Returns:
        List of paper dicts compatible with the main fetcher schema.
    """
    conf = venue.upper()

    # Try both URL patterns used across different CVF years
    list_urls = [
        f"{CVF_BASE_URL}/{conf}{year}?day=all",
        f"{CVF_BASE_URL}/content/{conf}{year}",
    ]

    with requests.Session() as session:
        # Step 1: Get paper list
        entries: list[dict] = []
        for url in list_urls:
            try:
                logger.info(f"Fetching CVF list page: {url}")
                r = _polite_get(url, session)
                entries = _parse_list_page(r.text)
                if entries:
                    logger.success(f"Found {len(entries)} papers on list page")
                    break
            except Exception as e:
                logger.warning(f"Failed to fetch {url}: {e}")
                continue

        if not entries:
            logger.warning(f"No papers found for {venue} {year} on CVF Open Access")
            return []

        # Step 2: Visit each detail page for abstract
        papers: list[dict[str, Any]] = []
        total = len(entries)

        for i, entry in enumerate(entries, 1):
            if progress_callback:
                progress_callback(i, total, f"Fetching abstract {i}/{total}: {entry['title'][:60]}")

            detail = {"abstract": "", "bibtex": "", "authors": []}
            try:
                time.sleep(sleep_between_requests)
                rd = _polite_get(entry["detail_url"], session)
                detail = _parse_detail_page(rd.text)
            except Exception as e:
                logger.warning(f"Failed to fetch detail for '{entry['title']}': {e}")

            # Prefer detail-page authors (more reliable parsing)
            final_authors = detail["authors"] if detail["authors"] else entry["authors"]

            paper: dict[str, Any] = {
                "id": entry["detail_url"],  # use detail URL as stable ID
                "title": entry["title"],
                "authors": final_authors,
                "abstract": detail["abstract"],
                "keywords": [],
                "venue": venue,
                "year": year,
                "decision": "Accept",
                "pdf_url": entry["pdf_url"] or "",
                "forum_url": entry["detail_url"],
                "arxiv_url": entry.get("arxiv_url") or "",
                "bibtex": detail["bibtex"],
                "reviews": [],
                "rating_avg": None,
                "confidence_avg": None,
                "meta_review": "",
                "author_remarks": "",
                "decision_comment": "",
            }
            papers.append(paper)

            if i % 100 == 0:
                logger.info(f"Progress: {i}/{total} papers fetched")

        logger.success(f"Fetched {len(papers)} papers for {venue} {year} from CVF Open Access")
        return papers
