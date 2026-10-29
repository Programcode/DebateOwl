"""Fail when the seven comparison pages share long sentences: python3 scripts/check_templating.py.

Each comparison page needs its own angle, so no sentence longer than MAX_WORDS
words may appear in the visible text of more than MAX_PAGES of them. The pricing
sentence (once per page by design) and the byline, disclosure and "Last updated"
lines are exempt.
"""

from collections import defaultdict
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
import re
import sys

PUBLIC = Path(__file__).resolve().parents[1] / "public"
PAGES = [
    "best-ai-for-debate",
    "ai-debate-tools-for-teachers",
    "best-ai-for-public-forum",
    "chatgpt-vs-claude-for-debate",
    "debateowl-vs-debate-ladder",
    "free-vs-paid-ai-debate-tools",
    "how-to-prepare-for-a-debate-with-ai",
]
MAX_WORDS = 12
MAX_PAGES = 2
PRICING_START = "The DebateOwl app has no free plan"
# Elements whose text is the same on every page on purpose.
EXEMPT_CLASSES = {"byline", "disclosure", "updated", "dates"}
BLOCKS = {"p", "li", "h1", "h2", "h3", "h4", "td", "th", "dt", "dd", "summary", "caption", "label", "legend", "pre", "div", "section", "aside", "nav", "footer", "header", "tr", "ol", "ul", "dl", "table", "figcaption"}
VOID = {"br", "img", "input", "meta", "link", "hr", "source", "wbr"}


class Blocks(HTMLParser):
    """Visible body text, split into one string per block element."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_body = False
        self.hidden = 0
        self.stack = []
        self.blocks = []
        self.current = []

    def flush(self):
        text = re.sub(r"\s+", " ", "".join(self.current)).strip()
        if text:
            self.blocks.append(text)
        self.current = []

    def handle_starttag(self, tag, attrs):
        if tag == "body":
            self.in_body = True
        if tag in VOID:
            return
        classes = set((dict(attrs).get("class") or "").split())
        exempt = tag in {"script", "style"} or bool(classes & EXEMPT_CLASSES)
        if tag in BLOCKS:
            self.flush()
        self.stack.append((tag, exempt))
        if exempt:
            self.hidden += 1

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        while self.stack:
            open_tag, exempt = self.stack.pop()
            if exempt:
                self.hidden -= 1
            if open_tag == tag:
                break
        if tag in BLOCKS:
            self.flush()

    def handle_data(self, data):
        if self.in_body and not self.hidden:
            self.current.append(data)


def sentences(html):
    parser = Blocks()
    parser.feed(html)
    parser.flush()
    for block in parser.blocks:
        for sentence in re.split(r"(?<=[.!?])[\"”’)]*\s+(?=[\"“‘(]?[A-Z0-9$])", unescape(block)):
            sentence = sentence.strip()
            if sentence:
                yield sentence


def main():
    seen = defaultdict(set)
    for slug in PAGES:
        html = (PUBLIC / slug / "index.html").read_text()
        for sentence in sentences(html):
            if len(sentence.split()) <= MAX_WORDS or sentence.startswith(PRICING_START) or "Last updated" in sentence:
                continue
            seen[re.sub(r"\s+", " ", sentence).lower()].add(slug)
    shared = {sentence: pages for sentence, pages in seen.items() if len(pages) > MAX_PAGES}
    for sentence, pages in sorted(shared.items()):
        print(f"On {len(pages)} pages ({', '.join(sorted(pages))}):\n  {sentence}")
    if shared:
        print(f"\n{len(shared)} sentence(s) of more than {MAX_WORDS} words appear on more than {MAX_PAGES} comparison pages. Give each page its own wording.")
        return 1
    print(f"Templating check passed: no sentence of more than {MAX_WORDS} words is on more than {MAX_PAGES} of the {len(PAGES)} comparison pages.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
