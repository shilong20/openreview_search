# AI 论文搜索系统

[English Version](./README.md)

基于研究相关性检索与排序的 AI 顶会论文搜索系统。

## 支持会议（2024 年起）

| 会议 | OpenReview Venue ID |
|---|---|
| ICLR | `ICLR.cc/{year}/Conference` |
| NeurIPS | `NeurIPS.cc/{year}/Conference` |
| ICML | `ICML.cc/{year}/Conference` |
| CVPR | `thecvf.com/CVPR/{year}/Conference` |
| ACL | `aclweb.org/ACL/{year}/Conference` |

## 主要功能

- 从 OpenReview 抓取论文并本地缓存。
- 使用 ChromaDB 构建本地向量索引。
- 混合检索：向量检索 + 关键词匹配 + RRF 融合。
- 可选 LLM 相关性重排，且可控制理由语言（中文/英文）。
- 可选标题/摘要双语输出（英文 + 中文）。
- 前端内置搜索历史记录（浏览器本地持久化）。

## 快速开始

### 1. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填写你的 API Key 和模型配置
```

### 2. 一键启动（推荐）

```bash
make dev
```

打开：`http://localhost:5173`

如果本机没有 `make`：

```bash
./start_all.sh
```

### 3. 分开启动（可选）

后端：

```bash
bash start_backend.sh
```

前端：

```bash
cd frontend
npm run dev
```

## 使用流程

整体分三步，通常前两步对每个会议年份只做一次。

### 阶段一：抓取论文数据

`Data Manager` -> 选择 `Conference` + `Year` -> 点击 `Fetch`。

执行内容：

- 从 OpenReview 拉取投稿数据。
- 存储到 `storage/papers_data/{venue}_{year}/all_papers.json`。
- 元信息写入 `storage/papers_data/{venue}_{year}/metadata.json`。

### 阶段二：构建向量索引

`Data Manager` -> 点击 `Build Index`。

执行内容：

- 读取本地论文 JSON。
- 对每篇论文的 `title + abstract + keywords` 做 embedding。
- 将 ChromaDB 索引持久化到 `storage/vector_db/{venue}_{year}/`。

### 阶段三：搜索与排序

`Search` -> 输入 `Research Interests` -> 点击 `Search`。

执行流程：

1. 关键词提取与扩展（LLM）。
2. 混合检索（向量 + 关键词 + RRF）。
3. 可选 LLM 相关性评分（`use_llm_eval`）。
4. 可选双语翻译（最终 `top_k`，`use_bilingual_translation`）。
5. 返回排序结果并展示。

## 高级搜索选项（前端）

`Search` -> `Show advanced options`：

- `Top K results`：
  - 前端默认：`10`
  - 前端范围：`10..100`（步长 `10`）
  - 后端接口默认：`10`
- `LLM relevance scoring`（`use_llm_eval`）
- `Relevance reason in Chinese`（`use_chinese_relevance_reason`）
  - 控制评分提示词中的理由语言。
  - 当 LLM 评分关闭时，该项不可用。
- `Bilingual title/abstract (ZH + EN)`（`use_bilingual_translation`）

会持久化到浏览器 `localStorage` 的偏好项：

- `paper_search_use_bilingual_translation_v1`
- `paper_search_use_chinese_relevance_reason_v1`

## 搜索历史

- 自动保存“检索词 + 结果快照”到浏览器 `localStorage`。
- Key：`paper_search_history_v1`。
- 最多保留最近 `20` 条。
- 支持在 `Search History` 面板中打开、删除、清空。

## 环境变量说明（`.env`）

```bash
# 关键词提取 / 相关性评分所用 LLM 提供商
LLM_PROVIDER=openai  # 或 gemini

# OpenAI 兼容接口配置
OPENAI_API_KEY=...
OPENAI_BASE_URL=...   # 可选
LLM_MODEL=...

# Gemini（当 LLM_PROVIDER=gemini）
# GEMINI_API_KEY=...
# GEMINI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai/
# LLM_MODEL=gemini-2.0-flash

# Embedding
EMBEDDING_API_KEY=...
EMBEDDING_BASE_URL=https://your-embedding-endpoint/v1
EMBEDDING_MODEL=BAAI/bge-m3
```

## 项目结构

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
