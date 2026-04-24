---
name: openreview-latest-topic-search
description: Use this skill when you need structured paper recommendations for a topic across NeurIPS, ICML, ICLR, and CVPR. It calls the local openreview_search API, automatically uses each venue's latest locally indexed year, enables LLM relevance scoring, returns 10 papers per venue, and does not request bilingual translation.
---

# OpenReview Latest Topic Search

Use this skill when the user wants topic-based paper recommendations from the four main conferences and needs machine-readable JSON for downstream agent use.

## Workflow

1. Make sure the local `openreview_search` backend is running.
2. Run the bundled script. This request may take several minutes because the backend performs keyword extraction, multi-venue retrieval, and LLM relevance scoring. During testing, do not assume the agent is stuck just because there is no immediate output; allow up to 10 minutes before treating it as a timeout or failure.

```bash
python3 scripts/search_latest_topic.py --topic "your topic here"
```

3. Return the script's JSON output directly unless the user explicitly asks for extra narration.

## Behavior

- Fixed venues: `NeurIPS`, `ICML`, `ICLR`, `CVPR`
- Each venue uses the latest year that is already indexed locally
- Each venue returns up to 10 papers
- Relevance scoring is enabled
- Title/abstract translation is disabled
- Partial failures are preserved in the JSON response under `failures`

## Configuration

- Default API base URL: `http://127.0.0.1:8000`
- Override with env var: `OPENREVIEW_SEARCH_BASE_URL`

## Notes

- If the backend is unreachable or a venue has no indexed local year, fail explicitly instead of inventing results.
- This skill can be slow in real runs. Agents should treat it as a potentially long-running call and avoid declaring it hung too early when no intermediate output is shown.
- Keep the output structured. Do not rewrite field names unless the user asks for a different format.
