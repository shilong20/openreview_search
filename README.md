# AI Paper Search System

Search and rank AI conference papers by research relevance.

## Supported Conferences (2024+)

| Conference | OpenReview Venue |
|-----------|-----------------|
| ICLR | ICLR.cc |
| NeurIPS | NeurIPS.cc |
| ICML | ICML.cc |
| CVPR | thecvf.com/CVPR |
| ACL | aclweb.org/ACL |

## Quick Start

### 1. Configure API Keys

```bash
cp .env.example .env
# Edit .env and set your API key
```

### 2. Start Backend

```bash
bash start_backend.sh
```

### 3. Start Frontend

```bash
cd frontend
npm run dev
```

Open http://localhost:5173

## Workflow

1. **Data Manager** tab → Select conference + year → Fetch Papers → Build Vector Index
2. **Search** tab → Select conference + year → Describe research interests → Search

## Configuration (.env)

```
# Provider: 'openai' or 'gemini'
LLM_PROVIDER=openai

# OpenAI
OPENAI_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small

# Gemini (if LLM_PROVIDER=gemini)
# GEMINI_API_KEY=...
# LLM_MODEL=gemini-2.0-flash
# EMBEDDING_MODEL=text-embedding-004
```

## Architecture

```
paper_search_system/
├── backend/
│   ├── core/
│   │   ├── venues.py          # Conference venue config
│   │   ├── llm_client.py      # OpenAI/Gemini API adapter
│   │   ├── fetcher.py         # OpenReview paper fetcher
│   │   ├── indexer.py         # ChromaDB vector index builder
│   │   ├── search_engine.py   # Hybrid search (vector + keyword + RRF)
│   │   ├── keyword_extractor.py  # LLM keyword extraction
│   │   └── evaluator.py       # LLM relevance scoring
│   ├── api/
│   │   └── routes.py          # FastAPI routes
│   └── main.py                # FastAPI app
├── frontend/
│   └── src/
│       ├── App.tsx
│       ├── components/
│       │   ├── DataManager.tsx   # Fetch & index management
│       │   ├── SearchPanel.tsx   # Search input
│       │   └── ResultsList.tsx   # Results display
│       ├── api.ts             # API client
│       └── types.ts           # TypeScript types
├── storage/
│   ├── papers_data/           # Fetched paper JSON files
│   └── vector_db/             # ChromaDB vector indices
├── requirements.txt
└── .env.example
```
