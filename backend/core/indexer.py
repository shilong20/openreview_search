"""Build and manage ChromaDB vector index for paper search."""

from pathlib import Path

from langchain_chroma import Chroma
from loguru import logger

from .fetcher import load_papers
from .llm_client import create_embeddings

VECTOR_DB_DIR = Path(__file__).parent.parent.parent / "storage" / "vector_db"


def get_collection_name(venue: str, year: int) -> str:
    return f"{venue}_{year}".lower()


def get_db_path(venue: str, year: int) -> Path:
    return VECTOR_DB_DIR / get_collection_name(venue, year)


def is_indexed(venue: str, year: int) -> bool:
    db_path = get_db_path(venue, year)
    return db_path.exists() and any(db_path.iterdir())


def build_index(
    venue: str,
    year: int,
    force: bool = False,
    progress_callback=None,
) -> dict:
    """Build ChromaDB vector index for a conference.

    Args:
        venue: Conference name
        year: Conference year
        force: Rebuild even if index exists
        progress_callback: Optional callable(current, total, message)

    Returns:
        dict with keys: total, venue, year
    """
    db_path = get_db_path(venue, year)

    if is_indexed(venue, year) and not force:
        logger.info(f"Index already exists for {venue} {year}")
        return {"total": 0, "venue": venue, "year": year, "cached": True}

    logger.info(f"Building vector index for {venue} {year}...")
    papers = load_papers(venue, year)

    # Filter to accepted papers only (exclude clear rejects)
    accepted = [
        p for p in papers
        if (
            "reject" not in p.get("decision", "").lower()
            and p.get("decision", "N/A") != "N/A"
        ) or (
            p.get("decision", "N/A") == "N/A"
            and bool(p.get("abstract", ""))
        )
    ]

    if not accepted:
        accepted = papers  # fallback: index all

    logger.info(f"Indexing {len(accepted)} papers...")

    embedding_fn = create_embeddings()

    # Build documents for ChromaDB
    texts = []
    metadatas = []
    ids = []

    for paper in accepted:
        title = paper.get("title", "")
        abstract = paper.get("abstract", "")
        keywords = ", ".join(paper.get("keywords", []))
        text = f"{title}\n{abstract}"
        if keywords:
            text += f"\nKeywords: {keywords}"

        texts.append(text)
        metadatas.append({
            "id": paper["id"],
            "title": title,
            "venue": venue,
            "year": str(year),
        })
        ids.append(paper["id"])

    # Create vectorstore in batches
    batch_size = 500
    collection_name = get_collection_name(venue, year)

    vectorstore = None
    total = len(texts)

    for i in range(0, total, batch_size):
        batch_texts = texts[i:i + batch_size]
        batch_metas = metadatas[i:i + batch_size]
        batch_ids = ids[i:i + batch_size]

        if progress_callback:
            progress_callback(min(i + batch_size, total), total, f"Embedding batch {i // batch_size + 1}")

        if vectorstore is None:
            vectorstore = Chroma.from_texts(
                texts=batch_texts,
                embedding=embedding_fn,
                metadatas=batch_metas,
                ids=batch_ids,
                collection_name=collection_name,
                persist_directory=str(db_path),
            )
        else:
            vectorstore.add_texts(
                texts=batch_texts,
                metadatas=batch_metas,
                ids=batch_ids,
            )

        logger.info(f"Indexed {min(i + batch_size, total)}/{total} papers")

    logger.success(f"Vector index built for {venue} {year}: {total} papers")
    return {"total": total, "venue": venue, "year": year, "cached": False}


def load_vectorstore(venue: str, year: int) -> Chroma:
    """Load existing ChromaDB vectorstore."""
    db_path = get_db_path(venue, year)
    if not is_indexed(venue, year):
        raise FileNotFoundError(
            f"No vector index for {venue} {year}. Run build_index first."
        )
    embedding_fn = create_embeddings()
    return Chroma(
        persist_directory=str(db_path),
        embedding_function=embedding_fn,
        collection_name=get_collection_name(venue, year),
    )
