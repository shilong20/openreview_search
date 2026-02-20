# AI 论文搜索系统

基于研究相关性搜索和排序 AI 顶会论文。

## 支持的会议（2024 年起）

| 会议 | OpenReview Venue ID |
|------|---------------------|
| ICLR | ICLR.cc |
| NeurIPS | NeurIPS.cc |
| ICML | ICML.cc |
| CVPR | thecvf.com/CVPR |
| ACL | aclweb.org/ACL |

## 快速开始

### 1. 配置 API Key

```bash
cp .env.example .env
# 编辑 .env，填入你的 API Key
```

### 2. 启动后端

```bash
bash start_backend.sh
```

### 3. 启动前端

```bash
cd frontend
npm run dev
```

打开 http://localhost:5173

## 使用流程

1. 进入 **Data Manager** 标签页 → 选择会议 + 年份 → 抓取论文 → 构建向量索引
2. 进入 **Search** 标签页 → 选择会议 + 年份 → 描述研究方向 → 搜索

## 配置说明（.env）

```
# LLM 提供商：'openai' 或 'gemini'
LLM_PROVIDER=openai

# OpenAI 配置
OPENAI_API_KEY=sk-...
LLM_MODEL=gpt-4o-mini
EMBEDDING_MODEL=text-embedding-3-small

# Gemini 配置（LLM_PROVIDER=gemini 时使用）
# GEMINI_API_KEY=...
# LLM_MODEL=gemini-2.0-flash
# EMBEDDING_MODEL=text-embedding-004
```

## 项目结构

```
openreview_search/
├── backend/
│   ├── core/
│   │   ├── venues.py             # 会议 venue ID 配置
│   │   ├── llm_client.py         # OpenAI/Gemini 统一适配层
│   │   ├── fetcher.py            # OpenReview 论文抓取
│   │   ├── indexer.py            # ChromaDB 向量索引构建
│   │   ├── search_engine.py      # 混合检索（向量 + 关键词 + RRF）
│   │   ├── keyword_extractor.py  # LLM 关键词提取与扩展
│   │   └── evaluator.py          # LLM 相关性评分（并行）
│   ├── api/
│   │   └── routes.py             # FastAPI 路由
│   └── main.py                   # FastAPI 应用入口
├── frontend/
│   └── src/
│       ├── App.tsx
│       ├── components/
│       │   ├── DataManager.tsx   # 数据抓取与索引管理
│       │   ├── SearchPanel.tsx   # 搜索输入面板
│       │   └── ResultsList.tsx   # 结果展示
│       ├── api.ts                # API 客户端
│       └── types.ts              # TypeScript 类型定义
├── storage/
│   ├── papers_data/              # 抓取的论文 JSON 文件
│   └── vector_db/                # ChromaDB 向量索引
├── requirements.txt
└── .env.example
```
