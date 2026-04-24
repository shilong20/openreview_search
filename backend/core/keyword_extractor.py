"""Extract and expand keywords from natural language research descriptions."""

import json
import re

from langchain_core.messages import HumanMessage, SystemMessage
from loguru import logger

from .llm_client import invoke_text

SYSTEM_PROMPT = """You are a research keyword extraction expert. Given a research interest description, extract key terms and generate synonyms/related terms to improve search coverage.

Return a JSON object with exactly this structure:
{
  "keywords": ["term1", "term2", ...],
  "expanded": ["synonym1", "related_term1", ...]
}

Rules:
- "keywords": 3-8 core technical terms from the description
- "expanded": 5-15 synonyms, abbreviations, and closely related terms
- Use standard academic/technical terminology
- Include both full names and abbreviations (e.g., "large language model" and "LLM")
- Return ONLY the JSON object, no other text"""

USER_PROMPT = """Research interest: {description}

Extract keywords and generate expanded search terms."""


def extract_keywords(description: str, model: str | None = None) -> dict[str, list[str]]:
    """Extract keywords and synonyms from a research description.

    Args:
        description: Natural language research interest description
        model: LLM model name (uses env default if None)

    Returns:
        dict with 'keywords' and 'expanded' lists
    """
    try:
        messages = [
            SystemMessage(content=SYSTEM_PROMPT),
            HumanMessage(content=USER_PROMPT.format(description=description)),
        ]

        text = invoke_text(messages, model=model, temperature=0.0, max_tokens=500).strip()

        # Try direct JSON parse
        try:
            result = json.loads(text)
        except json.JSONDecodeError:
            # Extract JSON from response
            match = re.search(r'\{[^{}]*\}', text, re.DOTALL)
            if match:
                result = json.loads(match.group())
            else:
                raise ValueError("No JSON found in response")

        keywords = result.get("keywords", [])
        expanded = result.get("expanded", [])

        # Combine and deduplicate
        all_terms = list(dict.fromkeys(keywords + expanded))

        logger.info(f"Extracted {len(keywords)} keywords, {len(expanded)} expanded terms")
        return {"keywords": keywords, "expanded": expanded, "all_terms": all_terms}

    except Exception as e:
        logger.warning(f"Keyword extraction failed: {e}. Falling back to simple split.")
        # Fallback: simple word extraction
        words = [w.strip() for w in description.replace(",", " ").split() if len(w.strip()) > 3]
        return {"keywords": words[:8], "expanded": [], "all_terms": words[:8]}
