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

系统分三个阶段，**阶段一和二只需执行一次**，之后可反复搜索。

### 阶段一：抓取论文数据（一次性）

> Data Manager → 选择会议 + 年份 → **Fetch Papers**

```
OpenReview API
  → 拉取指定会议的所有 submission
  → 过滤出已接收论文（检查 decision 字段）
  → 保存到 storage/papers_data/{venue}_{year}.json
```

### 阶段二：构建向量索引（一次性）

> Data Manager → **Build Vector Index**

```
读取本地 JSON 数据
  → 每篇论文拼接 title + abstract + keywords
  → 批量调用 SiliconFlow Embedding API 向量化
  → 向量持久化到 storage/vector_db/{venue}_{year}/（ChromaDB）
```

> ⚡ 索引构建完成后不再调用 Embedding API，每次搜索仅对 query 本身调用一次。

### 阶段三：搜索与排序（每次搜索）

> Search → 输入研究方向 → **Search**

```
① 关键词提取（LLM）
     用户描述 → 提取核心术语 + 同义词扩展
     e.g. "LLM reasoning" → ["chain-of-thought", "CoT", "prompt engineering", ...]

② 混合检索（Hybrid Search）
     向量检索：query 向量化 → ChromaDB 近邻搜索
     关键词检索：扩展词在论文文本中匹配
     RRF 融合：Reciprocal Rank Fusion 合并两路排名

③ LLM 重排（可选，use_llm_eval=true）
     并行调用 LLM 对候选论文打相关性分（0~1）
     按分数重排后返回 top_k 结果

④ 前端展示
     相关性进度条 + 评分理由 + 摘要折叠 + OpenReview/PDF 链接
```

## 配置说明（.env）

```
# LLM 提供商（用于关键词提取和相关性评分）：'openai' 或 'gemini'
LLM_PROVIDER=openai

# OpenAI 配置（支持自定义 base_url 接入第三方兼容接口）
OPENAI_API_KEY=sk-...
OPENAI_BASE_URL=https://api.openai.com/v1  # 可选，默认官方地址
LLM_MODEL=gpt-4o-mini

# Gemini 配置（LLM_PROVIDER=gemini 时使用）
# GEMINI_API_KEY=...
# LLM_MODEL=gemini-2.0-flash

# 硅基流动 Embedding 配置（独立于 LLM 提供商，优先级最高）
# 申请地址：https://cloud.siliconflow.cn/account/ak
SILICONFLOW_API_KEY=sk-...
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
SILICONFLOW_EMBEDDING_MODEL=BAAI/bge-m3  # 可选：Qwen/Qwen3-Embedding-8B（更强）

# 未配置硅基流动时的降级 Embedding 模型
EMBEDDING_MODEL=text-embedding-3-small
```

**推荐 Embedding 模型：**

| 模型 | 维度 | 最大 tokens | 适用场景 |
|------|------|------------|----------|
| `BAAI/bge-m3` | 1024 | 8192 | 多语言，默认推荐 |
| `Qwen/Qwen3-Embedding-8B` | 4096 | 32768 | 最强效果，长文本 |
| `BAAI/bge-large-en-v1.5` | 1024 | 512 | 纯英文，速度快 |

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
