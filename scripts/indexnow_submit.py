#!/usr/bin/env python3
"""Submit DebateLab public URLs to IndexNow-compatible engines.

This does not affect Google directly; it gives Bing/Yandex-compatible crawlers an
immediate change signal and provides another public crawl path for the brand pages.
"""
from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITEMAP = ROOT / "public" / "sitemap.xml"
KEY = "4edb6e55e44b9a2ccae55ceb1a4d6e6e"
HOST = "debate.pi-stack.org"
KEY_LOCATION = f"https://{HOST}/{KEY}.txt"
ENDPOINTS = [
    "https://www.bing.com/indexnow",
    "https://yandex.com/indexnow",
]


def sitemap_urls() -> list[str]:
    text = SITEMAP.read_text()
    urls: list[str] = []
    start = 0
    while True:
        i = text.find("<loc>", start)
        if i == -1:
            break
        j = text.find("</loc>", i)
        if j == -1:
            break
        urls.append(text[i + 5 : j].strip())
        start = j + 6
    return urls


def submit(endpoint: str, urls: list[str]) -> tuple[int, str]:
    payload = json.dumps(
        {
            "host": HOST,
            "key": KEY,
            "keyLocation": KEY_LOCATION,
            "urlList": urls,
        }
    ).encode()
    req = urllib.request.Request(
        endpoint,
        data=payload,
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            body = response.read().decode("utf-8", errors="replace")
            return response.status, body
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as exc:
        return 0, f"request_error={exc.reason}"


def main() -> int:
    urls = sitemap_urls()
    print(json.dumps({"urls": len(urls), "keyLocation": KEY_LOCATION}, indent=2))
    ok = True
    for endpoint in ENDPOINTS:
        status, body = submit(endpoint, urls)
        print(json.dumps({"endpoint": endpoint, "status": status, "body": body[:500]}, indent=2))
        ok = ok and status in {200, 202}
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
