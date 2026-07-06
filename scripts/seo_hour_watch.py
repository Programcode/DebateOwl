#!/usr/bin/env python3
"""One-hour post-deploy SEO/watch loop for DebateLab."""
from __future__ import annotations

import json
import re
import subprocess
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LOG = ROOT / "docs" / "seo-hour-watch.log"
URLS = [
    "https://debate.pi-stack.org/",
    "https://debate.pi-stack.org/debatelab",
    "https://debate.pi-stack.org/debatelab-by-programcode",
    "https://debate.pi-stack.org/what-is-debatelab",
    "https://debate.pi-stack.org/debatelab-app",
    "https://debate.pi-stack.org/llms.txt",
    "https://debate.pi-stack.org/sitemap.xml",
]


def stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (compatible; HermioneSEO/1.0)"})
    with urllib.request.urlopen(req, timeout=30) as r:
        body = r.read().decode("utf-8", "replace")
        return f"status={r.status} content_type={r.headers.get('content-type')} bytes={len(body)} title={extract_title(body)} canonical={extract_canonical(body)}"


def extract_title(body: str) -> str:
    m = re.search(r"<title>(.*?)</title>", body, re.I | re.S)
    return re.sub(r"\s+", " ", m.group(1)).strip() if m else "-"


def extract_canonical(body: str) -> str:
    m = re.search(r'<link rel="canonical" href="(.*?)"', body, re.I)
    return m.group(1) if m else "-"


def gh_status() -> str:
    try:
        out = subprocess.check_output(
            ["gh", "run", "list", "--limit", "2", "--json", "databaseId,headSha,status,conclusion,url,createdAt"],
            cwd=ROOT,
            timeout=30,
            text=True,
        )
        return out.strip()
    except Exception as exc:
        return f"gh_status_error={exc!r}"


def gsc_snapshot() -> str:
    try:
        out = subprocess.check_output(["python3", "scripts/gsc_submit.py"], cwd=ROOT, timeout=180, text=True, stderr=subprocess.STDOUT)
        interesting = []
        for line in out.splitlines():
            if any(token in line for token in ["SITEMAP_SUBMIT_OK", '"submitted"', '"indexed"', '"url"', '"coverageState"', '"lastDownloaded"']):
                interesting.append(line)
        return "\n".join(interesting[-80:])
    except Exception as exc:
        return f"gsc_snapshot_error={exc!r}"


def append(msg: str) -> None:
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("a") as f:
        f.write(msg + "\n")


def main() -> None:
    append(f"\n=== DebateLab SEO hour watch started {stamp()} ===")
    for i in range(7):
        append(f"\n--- tick {i + 1}/7 at {stamp()} ---")
        for url in URLS:
            try:
                append(f"{url} :: {fetch(url)}")
            except Exception as exc:
                append(f"{url} :: ERROR {exc!r}")
        append("GitHub Actions :: " + gh_status())
        if i in {0, 6}:
            append("GSC snapshot ::\n" + gsc_snapshot())
        if i < 6:
            time.sleep(600)
    append(f"=== DebateLab SEO hour watch finished {stamp()} ===")
    print(f"DebateLab SEO hour watch complete. Log: {LOG}")


if __name__ == "__main__":
    main()
