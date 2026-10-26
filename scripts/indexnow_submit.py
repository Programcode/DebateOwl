#!/usr/bin/env python3
"""Submit public URLs to IndexNow (npm run seo:indexnow).

One POST to api.indexnow.org, which shares the submission with every engine
that takes part (Bing, Yandex, Seznam, Naver and others). It does not reach
Google. Run it after a production deploy, not before: the engines fetch the
URLs straight away.

URLs come from dist/sitemap.xml when a build is present, otherwise from the
live sitemap at the origin in src/config/site.json.

  python3 scripts/indexnow_submit.py --dry-run          # print the request, send nothing
  python3 scripts/indexnow_submit.py --only /tools ...  # submit only these paths or URLs
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parents[1]
SITE = json.loads((ROOT / "src" / "config" / "site.json").read_text())
ORIGIN = SITE["origin"]
HOST = urlparse(ORIGIN).netloc
DIST_SITEMAP = ROOT / "dist" / "sitemap.xml"
# The key is public by design: the engines check it against public/<key>.txt.
KEY = "4edb6e55e44b9a2ccae55ceb1a4d6e6e"
KEY_LOCATION = f"{ORIGIN}/{KEY}.txt"
ENDPOINT = "https://api.indexnow.org/indexnow"


def sitemap_urls() -> tuple[list[str], str]:
    """Every <loc> in the sitemap, and where the sitemap came from."""
    if DIST_SITEMAP.exists():
        text, source = DIST_SITEMAP.read_text(), str(DIST_SITEMAP.relative_to(ROOT))
    else:
        source = f"{ORIGIN}/sitemap.xml"
        with urllib.request.urlopen(source, timeout=30) as response:
            text = response.read().decode("utf-8")
    return [loc.strip() for loc in re.findall(r"<loc>([^<]+)</loc>", text)], source


def only_urls(values: list[str]) -> list[str]:
    """--only values as absolute URLs on this site; a value on another host is an error."""
    urls = [urljoin(ORIGIN + "/", value) for value in values]
    foreign = [url for url in urls if urlparse(url).netloc != HOST]
    if foreign:
        raise SystemExit(f"--only takes URLs on {HOST}; not: {', '.join(foreign)}")
    return urls


def submit(payload: dict) -> tuple[int, str]:
    request = urllib.request.Request(
        ENDPOINT,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json; charset=utf-8"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as error:
        return error.code, error.read().decode("utf-8", errors="replace")
    except urllib.error.URLError as error:
        return 0, f"request_error={error.reason}"


def main() -> int:
    parser = argparse.ArgumentParser(description="Submit public URLs to IndexNow.")
    parser.add_argument("--only", nargs="+", metavar="URL", help="submit only these paths or URLs instead of the whole sitemap")
    parser.add_argument("--dry-run", action="store_true", help="print the request and send nothing")
    args = parser.parse_args()

    if args.only:
        urls, source = only_urls(args.only), "--only"
    else:
        urls, source = sitemap_urls()
    if not urls:
        raise SystemExit(f"No URLs to submit from {source}")
    payload = {"host": HOST, "key": KEY, "keyLocation": KEY_LOCATION, "urlList": urls}
    print(json.dumps({"endpoint": ENDPOINT, "source": source, "urls": len(urls), "dryRun": args.dry_run}, indent=2))
    if args.dry_run:
        print(json.dumps(payload, indent=2))
        return 0

    status, body = submit(payload)
    print(json.dumps({"status": status, "body": body[:500]}, indent=2))
    # 200 means accepted, 202 accepted with the key still being checked.
    return 0 if status in {200, 202} else 1


if __name__ == "__main__":
    sys.exit(main())
