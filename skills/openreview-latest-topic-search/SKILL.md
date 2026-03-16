---
name: openreview-latest-topic-search
description: Use this skill when you need structured paper recommendations for a topic across NeurIPS, ICML, ICLR, and CVPR. It calls the local openreview_search API, automatically uses each venue's latest locally indexed year, enables LLM relevance scoring, returns 10 papers per venue, and does not request bilingual translation.
---

# OpenReview Latest Topic Search

Use this skill when the user wants topic-based paper recommendations from the four main conferences and needs machine-readable JSON for downstream agent use.

## Workflow

1. Make sure the local `openreview_search` backend is running.
2. Run the bundled script:

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
- Keep the output structured. Do not rewrite field names unless the user asks for a different format.
