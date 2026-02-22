# AI Paper Search System

[中文文档](./README_zh.md)

Search and rank top AI conference papers by research relevance.

## Supported Venues (2024+)

| Venue | OpenReview Venue ID |
|---|---|
| ICLR | `ICLR.cc/{year}/Conference` |
| NeurIPS | `NeurIPS.cc/{year}/Conference` |
| ICML | `ICML.cc/{year}/Conference` |
| CVPR | `thecvf.com/CVPR/{year}/Conference` |
| ACL | `aclweb.org/ACL/{year}/Conference` |

## Highlights

- Fetches paper submissions from OpenReview and caches them locally.
- Builds local vector indexes with ChromaDB for semantic retrieval.
- Hybrid retrieval pipeline: vector search + keyword matching + RRF fusion.
- Optional LLM relevance reranking with controllable reason language (Chinese/English).
- Optional bilingual output for title and abstract (EN + ZH).
- Search history saved in browser `localStorage`.

## Quick Start

### 1. Configure environment variables

```bash
cp .env.example .env
# Edit .env and fill your API keys/config
```

### 2. One-command start (recommended)

```bash
make dev
```

Open: `http://localhost:5173`

If `make` is unavailable:

```bash
./start_all.sh
```

### 3. Start services separately (optional)

Backend:

```bash
bash start_backend.sh
```

Frontend:

```bash
cd frontend
npm run dev
```

## Workflow

The workflow has three stages. Stages 1 and 2 are usually one-time per venue/year.

### Stage 1: Fetch papers

`Data Manager` -> choose `Conference` + `Year` -> click `Fetch`.

What happens:

- Pull submissions from OpenReview.
- Save data to `storage/papers_data/{venue}_{year}/all_papers.json`.
- Save metadata to `storage/papers_data/{venue}_{year}/metadata.json`.

![Data Manager UI](./data%20manager.png)

### Stage 2: Build vector index

`Data Manager` -> click `Build Index`.

What happens:

- Read local cached paper JSON.
- Build embeddings for each paper (`title + abstract + keywords`).
- Persist ChromaDB index to `storage/vector_db/{venue}_{year}/`.

### Stage 3: Search and rank

`Search` -> enter `Research Interests` -> click `Search`.

Pipeline:

1. Keyword extraction and expansion (LLM).
2. Hybrid retrieval (vector + keyword + RRF).
3. Optional LLM relevance scoring (`use_llm_eval`).
4. Optional bilingual translation for final `top_k` (`use_bilingual_translation`).
5. Return ranked results to UI.

![Search UI](./search.png)

## Advanced Search Options (UI)

In `Search` -> `Show advanced options`:

- `Top K results`:
  - UI default: `10`
  - UI range: `10..100` (step `10`)
  - API default: `10`
- `LLM relevance scoring` (`use_llm_eval`)
- `Relevance reason in Chinese` (`use_chinese_relevance_reason`)
  - Controls the evaluator prompt language.
  - Disabled when LLM relevance scoring is off.
- `Bilingual title/abstract (ZH + EN)` (`use_bilingual_translation`)

Persistent UI preferences in browser `localStorage`:

- `paper_search_use_bilingual_translation_v1`
- `paper_search_use_chinese_relevance_reason_v1`

## Search History

- Automatically saves query + result snapshot in browser `localStorage`.
- Storage key: `paper_search_history_v1`.
- Keeps latest `20` items.
- Supports open/delete/clear from the `Search History` panel.

## Configuration (`.env`)

```bash
# LLM provider for keyword extraction / relevance evaluation
LLM_PROVIDER=openai  # or gemini

# OpenAI-compatible LLM config
OPENAI_API_KEY=...
OPENAI_BASE_URL=...   # optional
LLM_MODEL=...

# Gemini (when LLM_PROVIDER=gemini)
# GEMINI_API_KEY=...
# GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
# LLM_MODEL=gemini-2.0-flash

# Embeddings
EMBEDDING_API_KEY=...
EMBEDDING_BASE_URL=https://your-embedding-endpoint/v1
EMBEDDING_MODEL=BAAI/bge-m3
```

## Project Structure

```text
openreview_search/
├── backend/
│   ├── api/
│   │   └── routes.py
│   ├── core/
│   │   ├── venues.py
│   │   ├── fetcher.py
│   │   ├── indexer.py
│   │   ├── search_engine.py
│   │   ├── keyword_extractor.py
│   │   ├── evaluator.py
│   │   ├── translator.py
│   │   └── llm_client.py
│   └── main.py
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── DataManager.tsx
│       │   ├── SearchPanel.tsx
│       │   ├── SearchHistory.tsx
│       │   └── ResultsList.tsx
│       ├── api.ts
│       ├── types.ts
│       └── App.tsx
├── storage/
│   ├── papers_data/
│   └── vector_db/
├── start_backend.sh
├── start_all.sh
├── Makefile
├── requirements.txt
└── .env.example
```
