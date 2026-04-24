#!/usr/bin/env python3
"""Call the local latest-topic-search API and print structured JSON."""

from __future__ import annotations

import argparse
import json
import os
import sys
from urllib import error, request

DEFAULT_TIMEOUT_SECONDS = int(os.environ.get("OPENREVIEW_SEARCH_TIMEOUT_SECONDS", "600"))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Search the latest indexed NeurIPS/ICML/ICLR/CVPR papers for a topic."
    )
    parser.add_argument("--topic", required=True, help="Research topic or question")
    parser.add_argument(
        "--base-url",
        default=os.environ.get("OPENREVIEW_SEARCH_BASE_URL", "http://127.0.0.1:8000"),
        help="Base URL of the openreview_search backend",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    url = args.base_url.rstrip("/") + "/api/skill/latest-topic-search"
    payload = json.dumps({"topic": args.topic}, ensure_ascii=False).encode("utf-8")

    req = request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with request.urlopen(req, timeout=DEFAULT_TIMEOUT_SECONDS) as resp:
            body = resp.read().decode("utf-8")
    except error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        print(
            json.dumps(
                {
                    "error": "http_error",
                    "status": exc.code,
                    "detail": detail,
                },
                ensure_ascii=False,
                indent=2,
            ),
            file=sys.stderr,
        )
        return 1
    except error.URLError as exc:
        print(
            json.dumps(
                {
                    "error": "connection_error",
                    "detail": str(exc.reason),
                    "url": url,
                },
                ensure_ascii=False,
                indent=2,
            ),
            file=sys.stderr,
        )
        return 1

    try:
        parsed = json.loads(body)
    except json.JSONDecodeError:
        print(body)
        return 0

    print(json.dumps(parsed, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
