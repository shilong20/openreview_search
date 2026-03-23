# 多会议论文检索 + 一键检索

> 日期：2026-03-23
> 分支：`improve/multi-venue-search`
> 状态：设计已确认

## 目标

在现有单会议检索基础上，新增"多会议检索"能力：

1. **一键检索**（默认）：用户只需输入研究兴趣，后端自动检测所有已索引会议的最新年份，一次返回全部结果。
2. **自定义多会议**：用户手动勾选多个会议及年份组合。
3. **结果展示**：支持"按会议分组"和"混合排序"两种视图切换。

## 选定方案

**方案 A：复用后端逻辑 + 新增 `/api/multi-search` 端点**

增量式改动，后端新增独立端点不破坏现有功能，前端新增模式切换。

## 后端设计

### 新增端点 `POST /api/multi-search`

请求体 `MultiSearchRequest`：

```python
class VenueYearPair(BaseModel):
    venue: str
    year: int

class MultiSearchRequest(BaseModel):
    research_description: str                    # >= 3 字符
    venues: list[VenueYearPair] | None = None    # 自定义模式
    auto_latest: bool = True                     # 一键模式
    top_k: int = 10                              # 每个会议返回数
    use_llm_eval: bool = True
    use_chinese_relevance_reason: bool = True
    use_bilingual_translation: bool = False      # 多会议默认关闭翻译以加速
```

核心逻辑：

1. `auto_latest=True`：遍历 `VENUES` 中所有会议，`list_indexed_years()` 获取最新已索引年份，自动组装列表
2. `auto_latest=False`：使用 `venues` 参数
3. 关键词提取只执行一次（共享）
4. 逐会议执行 `hybrid_search` + `evaluate_relevance`
5. 部分失败不阻断，记录到 `failures`

响应体：

```json
{
  "topic": "string",
  "keywords": ["..."],
  "expanded_keywords": ["..."],
  "venues": [
    {
      "venue": "NeurIPS",
      "selected_year": 2025,
      "status": "ok | empty | error",
      "total_candidates": 30,
      "papers": [...]
    }
  ],
  "failures": [
    { "venue": "AAAI", "stage": "year_selection", "reason": "No indexed year" }
  ],
  "summary": {
    "requested_venues": 6,
    "successful_venues": 4,
    "failed_venues": 2,
    "returned_papers": 40
  }
}
```

### 代码复用

提取 `skill_search.py` 中 `_search_single_venue` 和 `_serialize_papers` 为通用函数，新端点和 skill 端点共享。

## 前端设计

### SearchPanel 搜索模式切换

顶部新增 Tab 切换：

- **Single**：保持现有逻辑不变（单会议 + 单年份）
- **Multi**：显示多会议检索面板
  - 一键检索按钮（默认）：只需输入研究兴趣
  - 自定义子模式：checkbox 多选会议，每个会议可覆盖年份

### VenueSelector 组件

- Checkbox 列表展示所有会议
- 每个会议旁显示最新已索引年份（从 venues status 推断）
- 勾选后可选择覆盖年份

### 搜索历史兼容

扩展 `SearchHistoryItem` 类型：

```typescript
interface SearchHistoryItem {
  // ... 现有字段保留
  mode?: 'single' | 'multi'
  venues?: { venue: string; year: number }[]
  multiResult?: MultiSearchResult
}
```

老记录无 `mode` 字段，默认当作 `single` 处理。

## 结果展示

### MultiResultsList 组件

两种视图，用户可切换：

1. **分组视图**（默认）：每个会议一个可折叠区域，内部复用 `PaperCard`。区域头显示会议名、年份、论文数。
2. **混合排序视图**：所有论文按 `relevance_score` 降序，每张卡片额外显示来源会议 badge。

顶部 summary bar：总论文数、覆盖会议数、关键词列表。

## 数据流

```
用户输入研究兴趣
       │
   模式判断
   ┌───┴───┐
   │       │
 单会议   多会议
   │       │
   │   auto_latest?
   │   ┌───┴───┐
   │   Yes     No
   │   │       │
   │   │   用户选择 venues
   │   │       │
   │   └───┬───┘
   │       │
 POST      POST
/search   /multi-search
   │       │
   ▼       ▼
ResultsList  MultiResultsList
```

## 错误处理

- 部分失败：展示成功会议的结果 + 失败会议的提示（如"NeurIPS 2025: 未索引"）
- 全部失败：统一错误提示
- 一键模式无已索引会议：提示去 Data Manager 拉取数据

## 不做

- 不改现有 `/api/search` 端点
- 不改现有单会议搜索流程
- 不新增数据拉取/索引逻辑

---

## 实现计划

### Task 1: 后端 — 提取通用多会议检索函数 + 新增 `/api/multi-search` 端点

**改动：**
- 修改: `backend/core/skill_search.py` — 将 `_search_single_venue` 和 `_serialize_papers` 改为公开函数，并泛化 `search_latest_topic_for_skill` 调用方式
- 修改: `backend/api/routes.py` — 新增 `MultiSearchRequest` 模型和 `POST /api/multi-search` 路由

**核心内容：**

`backend/core/skill_search.py` 改动：
- `_search_single_venue` → `search_single_venue`（去掉下划线，公开导出）
- `_serialize_papers` → `serialize_papers`（去掉下划线，公开导出）
- `search_latest_topic_for_skill` 改为调用新的公开函数名
- 新增 `search_multi_venues(topic, venue_year_pairs, top_k, use_llm_eval, use_chinese_reason, use_bilingual_translation)` 函数：
  - 关键词提取一次
  - 遍历 venue_year_pairs 调用 `search_single_venue`
  - 可选翻译
  - 返回完整响应结构
- 新增 `resolve_auto_latest_venues()` 函数：遍历所有 `VENUES`，对每个调用 `list_indexed_years()` 取最新年份，返回 `list[tuple[str, int]]`

`backend/api/routes.py` 改动：
```python
class VenueYearPair(BaseModel):
    venue: str
    year: int

class MultiSearchRequest(BaseModel):
    research_description: str = Field(..., min_length=3)
    venues: list[VenueYearPair] | None = None
    auto_latest: bool = True
    top_k: int = Field(default=10, ge=1, le=200)
    max_concurrent: int = Field(default=10, ge=1, le=20)
    use_llm_eval: bool = True
    use_chinese_relevance_reason: bool = True
    use_bilingual_translation: bool = False

@router.post("/multi-search")
def multi_search(req: MultiSearchRequest) -> dict[str, Any]:
    if req.auto_latest:
        venue_pairs = resolve_auto_latest_venues()
        if not venue_pairs:
            raise HTTPException(400, "No indexed venues found")
    else:
        if not req.venues:
            raise HTTPException(400, "venues required when auto_latest=False")
        venue_pairs = [(v.venue, v.year) for v in req.venues]

    return search_multi_venues(
        topic=req.research_description,
        venue_year_pairs=venue_pairs,
        top_k=req.top_k,
        max_concurrent=req.max_concurrent,
        use_llm_eval=req.use_llm_eval,
        use_chinese_reason=req.use_chinese_relevance_reason,
        use_bilingual_translation=req.use_bilingual_translation,
    )
```

**验证：**
运行: `curl -X POST http://127.0.0.1:8000/api/multi-search -H "Content-Type: application/json" -d '{"research_description": "large language model efficiency", "auto_latest": true, "use_llm_eval": false, "top_k": 3}'`
预期: 返回 JSON，包含 `venues` 数组（每个已索引会议一项）、`summary`、`keywords`

**提交：** `feat: add /api/multi-search endpoint with auto-latest and custom venue modes`

---

### Task 2: 前端 — 类型定义 + API 客户端

**改动：**
- 修改: `frontend/src/types.ts` — 新增多会议相关类型
- 修改: `frontend/src/api.ts` — 新增 `multiSearch` 方法

**核心内容：**

`frontend/src/types.ts` 新增：
```typescript
export interface VenueResult {
  venue: string
  selected_year: number
  status: 'ok' | 'empty' | 'error'
  total_candidates: number
  papers: Paper[]
}

export interface MultiSearchResult {
  topic: string
  keywords: string[]
  expanded_keywords: string[]
  venues: VenueResult[]
  failures: { venue: string; stage: string; reason: string }[]
  summary: {
    requested_venues: number
    successful_venues: number
    failed_venues: number
    returned_papers: number
  }
}

export interface SearchHistoryItem {
  // 现有字段保留
  id: string
  created_at: string
  venue: string
  year: number
  description: string
  result: SearchResult
  // 新增可选字段
  mode?: 'single' | 'multi'
  venues?: { venue: string; year: number }[]
  multiResult?: MultiSearchResult
}
```

`frontend/src/api.ts` 新增：
```typescript
multiSearch: (params: {
  research_description: string
  venues?: { venue: string; year: number }[]
  auto_latest?: boolean
  top_k?: number
  use_llm_eval?: boolean
  use_chinese_relevance_reason?: boolean
  use_bilingual_translation?: boolean
}) =>
  request<MultiSearchResult>('/multi-search', {
    method: 'POST',
    body: JSON.stringify(params),
  }),
```

**验证：**
运行: `cd frontend && npx tsc --noEmit`
预期: 无类型错误

**提交：** `feat: add multi-search types and API client`

---

### Task 3: 前端 — MultiSearchPanel 组件 + SearchPanel 模式切换

**改动：**
- 新增: `frontend/src/components/MultiSearchPanel.tsx` — 多会议检索面板
- 修改: `frontend/src/components/SearchPanel.tsx` — 顶部新增模式 Tab（Single / Multi）
- 修改: `frontend/src/App.tsx` — 引入 MultiSearchPanel，传递多会议搜索结果

**核心内容：**

`MultiSearchPanel.tsx`：
- 接收 props: `venues: Venue[]`, `onResults: (result: MultiSearchResult, description: string) => void`
- 两种子模式 Tab：「一键检索」和「自定义」
- 一键检索模式：只有研究兴趣输入 + 搜索按钮
- 自定义模式：checkbox 会议列表（每个会议旁显示最新已索引年份 badge），可选覆盖年份
- 共享高级选项（top_k, use_llm_eval 等）
- 调用 `api.multiSearch()`

`SearchPanel.tsx` 改动：
- 顶部新增 `searchMode: 'single' | 'multi'` Tab
- `single` 模式下显示现有面板内容
- `multi` 模式下渲染 `<MultiSearchPanel>`

`App.tsx` 改动：
- 新增 `multiSearchResult` state
- `handleMultiResults` 回调：保存结果到 state + 更新搜索历史
- 结果区域根据 `searchMode` 决定渲染 `ResultsList` 还是 `MultiResultsList`

**验证：**
运行: `cd frontend && npm run build`
预期: 构建成功，无错误

**提交：** `feat: add multi-venue search panel with one-click and custom modes`

---

### Task 4: 前端 — MultiResultsList 组件（分组视图 + 混合排序视图）

**改动：**
- 新增: `frontend/src/components/MultiResultsList.tsx` — 多会议结果展示
- 修改: `frontend/src/App.tsx` — 在结果区域条件渲染 MultiResultsList

**核心内容：**

`MultiResultsList.tsx`：
- Props: `result: MultiSearchResult`, `description: string`
- 顶部 summary bar（总论文数、覆盖会议数、关键词）
- 视图切换 Toggle：分组 / 混合
- 分组视图：每个 VenueResult 一个可折叠 section，section 头显示会议名、年份、论文数；内部复用 `PaperCard`
- 混合视图：将所有 venue 的 papers 合并，按 relevance_score 降序排列，每张卡片额外显示 venue badge
- 失败会议显示 warning 提示条

**验证：**
运行: `cd frontend && npm run build`
预期: 构建成功

**提交：** `feat: add MultiResultsList with grouped and merged view modes`

---

### Task 5: 集成测试 + 搜索历史兼容性

**改动：**
- 修改: `frontend/src/App.tsx` — 确保搜索历史对多会议记录的保存/加载/展示兼容
- 修改: `frontend/src/components/SearchHistory.tsx` — 多会议历史条目显示多个 venue badge
- 修改: `skills/openreview-latest-topic-search/SKILL.md` — 更新说明，反映后端重构

**核心内容：**

搜索历史兼容：
- 保存多会议记录时 `mode='multi'`，`venues` 存选择的会议列表，`multiResult` 存完整响应
- 加载历史时：无 `mode` 字段默认为 `single`
- SearchHistory 组件：多会议条目显示为 "Multi (NeurIPS, ICLR, ...)" 格式

**验证：**
运行: 启动前后端，执行一次一键检索，确认结果正常展示，刷新页面后历史记录可恢复
预期: 分组视图和混合排序视图都能正常工作，老的单会议历史记录不受影响

**提交：** `feat: integrate multi-search history and update skill docs`

---

## 执行进度

| 任务 | 改动 | 验证 | 提交 |
|------|------|------|------|
| Task 1: 后端 — 通用多会议检索函数 + /api/multi-search | ✓ | ✓ | ○ |
| Task 2: 前端 — 类型定义 + API 客户端 | ○ | ○ | ○ |
| Task 3: 前端 — MultiSearchPanel + 模式切换 | ○ | ○ | ○ |
| Task 4: 前端 — MultiResultsList 分组/混合视图 | ○ | ○ | ○ |
| Task 5: 集成 — 搜索历史兼容 + SKILL 更新 | ○ | ○ | ○ |
