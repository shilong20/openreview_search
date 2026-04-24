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
- **多会议检索**：一键搜索所有已索引会议，或自定义会议+年份组合。
- **SSE 实时进度**：逐篇论文评分与翻译进度实时推送。
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

![Data Manager 界面](./data%20manager.png)

### 阶段二：构建向量索引

`Data Manager` -> 点击 `Build Index`。

执行内容：

- 读取本地论文 JSON。
- 对每篇论文的 `title + abstract + keywords` 做 embedding。
- 将 ChromaDB 索引持久化到 `storage/vector_db/{venue}_{year}/`。

### 阶段三：搜索与排序

`Search` -> 输入 `Research Interests` -> 点击 `Search`。

提供两种搜索模式：

- **Single Venue**：选择单个会议 + 年份（经典模式）。
- **Multi Venue**：跨多个会议同时搜索。
  - *One-Click*：自动使用所有已索引会议的最新年份。
  - *Custom*：自定义选择会议+年份组合（同一会议可选多个年份）。

执行流程：

1. 关键词提取与扩展（LLM）。
2. 混合检索（向量 + 关键词 + RRF）。
3. 可选 LLM 相关性评分（`use_llm_eval`），附 SSE 实时进度。
4. 可选双语翻译（最终 `top_k`，`use_bilingual_translation`），附 SSE 实时进度。
5. 返回排序结果并展示。

多会议结果支持两种视图：**分组视图**（按会议分组可折叠）和**混合排序**（所有论文按相关性降序）。

![Search 界面](./search.png)

## 高级搜索选项（前端）

`Search` -> `Show advanced options`：

- `Top K results`：
  - 前端默认：`25`
  - 前端范围：`5..50`（步长 `5`）
  - 后端接口默认：`10`
- `LLM relevance scoring`（`use_llm_eval`）
- `Relevance reason in Chinese`（`use_chinese_relevance_reason`）
  - 控制评分提示词中的理由语言。
  - 当 LLM 评分关闭时，该项不可用。
- `Bilingual title/abstract (ZH + EN)`（`use_bilingual_translation`）

会持久化到浏览器 `localStorage` 的偏好项：

- `paper_search_use_bilingual_translation_v1`
- `paper_search_use_chinese_relevance_reason_v1`

## 多会议搜索接口

```bash
curl -X POST http://127.0.0.1:8000/api/multi-search \
  -H 'Content-Type: application/json' \
  -d '{"research_description":"高效 LLM 训练","auto_latest":true,"top_k":10,"use_llm_eval":true}'
```

该接口返回 SSE 流，包含 `progress` 进度事件和最终 `result` 事件。

参数：

- `research_description`（必填）：研究兴趣的自然语言描述
- `auto_latest`（默认 `true`）：自动选择每个会议最新已索引年份
- `venues`：手动指定 `{venue, year}` 列表（当 `auto_latest=false` 时）
- `top_k`、`use_llm_eval`、`use_chinese_relevance_reason`、`use_bilingual_translation`

响应包含 `venues[]`（各会议结果）、`failures[]` 和 `summary`。

## Skill 接口

为了给 agent / skill 使用，后端新增了一个专用接口：

```bash
curl -X POST http://127.0.0.1:8000/api/skill/latest-topic-search \
  -H 'Content-Type: application/json' \
  -d '{"topic":"用于视频生成的 diffusion transformer"}'
```

当前版本的行为是固定的：

- 会议范围：`NeurIPS`、`ICML`、`ICLR`、`CVPR`
- 年份选择：每个会议都自动选择本地“已建索引”的最新年份
- 每会返回数：`10`
- relevance scoring：开启
- 双语翻译：关闭
- 失败语义：允许部分成功，并在 `failures` 中返回失败会议及原因

返回结构包括：

- `topic`、`keywords`、`expanded_keywords`
- `venues[]`，字段含 `venue`、`selected_year`、`status`、`total_candidates`、`papers`
- `papers[]`，字段含 `rank`、论文元信息、`pdf_url`、`forum_url`、`relevance_score`、`relevance_reason`
- `failures[]` 和 `summary`

## 仓库内本地 Skill

仓库内提供了一个本地 skill：`skills/openreview-latest-topic-search/`。

调用方式：

```bash
python3 skills/openreview-latest-topic-search/scripts/search_latest_topic.py \
  --topic "用于视频生成的 diffusion transformer"
```

可选配置：

- `OPENREVIEW_SEARCH_BASE_URL`：后端基础地址，默认 `http://127.0.0.1:8000`

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
│       │   ├── MultiSearchPanel.tsx
│       │   ├── MultiResultsList.tsx
│       │   ├── SearchHistory.tsx
│       │   └── ResultsList.tsx
│       ├── api.ts
│       ├── types.ts
│       └── App.tsx
├── skills/
│   └── openreview-latest-topic-search/
│       ├── SKILL.md
│       └── scripts/
│           └── search_latest_topic.py
├── storage/
│   ├── papers_data/
│   └── vector_db/
├── start_backend.sh
├── start_all.sh
├── Makefile
├── requirements.txt
└── .env.example
```
