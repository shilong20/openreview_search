# Changelog

## [Unreleased]

### Fixed

- **OpenReview 数据获取只返回接收论文**：将 API 调用从 `invitation` 改为 `content.venueid` 过滤，修复 ICLR 2025/2026 等会议错误拉取全部投稿（1万+篇）的问题
- 简化 `indexer.py` 和 `search_engine.py` 中多余的 reject 过滤逻辑，数据源头已保证只有接收论文
- `vector_search` 添加异常捕获：当 embedding API 调用失败时，优雅降级并返回空结果，避免整个搜索流程崩溃
- 影响文件：`backend/core/fetcher.py`、`backend/core/indexer.py`、`backend/core/search_engine.py`
