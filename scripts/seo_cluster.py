"""The AI-debate cluster: its pages, the exact anchors that link them, and the links both
generators add for it. src/config/ai-debate-cluster.json holds the list, and the home page
hub, the footer and the /tools pages read the same file.

A link with "live": false is for a page that does not exist yet. It stays out of every
page until it is set true; then rerun scripts/generate_seo_content.py and commit the
regenerated pages. The build's link check fails if it is set true before the page exists.
"""

from html import escape
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
CLUSTER = json.loads((ROOT / "src" / "config" / "ai-debate-cluster.json").read_text())
LINKS = [link for link in CLUSTER["links"] if link.get("live", True)]
# The slugs that carry the Related block, as public/<slug>/index.html names them.
PAGES = {path.lstrip("/") for path in CLUSTER["pages"]}
PARTNER = next((link for link in LINKS if link["path"] == "/ai-debate"), None)


def link(path):
    """An <a> to a cluster page with its exact anchor."""
    entry = next(item for item in CLUSTER["links"] if item["path"] == path)
    return f'<a href="{entry["path"]}">{escape(entry["anchor"])}</a>'


def related_ai_debate(slug, skip=(), css_class=""):
    """The Related block for a cluster page: every other live cluster page by its anchor.
    `skip` holds paths the page must not link again."""
    items = "".join(
        f"<li>{link(item['path'])}</li>"
        for item in LINKS
        if item["path"] != f"/{slug}" and item["path"] not in skip
    )
    attribute = f' class="{css_class}"' if css_class else ""
    return f'<section{attribute} aria-labelledby="related-ai-debate"><h2 id="related-ai-debate">{escape(CLUSTER["heading"])}</h2><ul>{items}</ul></section>'


# One sentence per /debateowl-vs-* page that points to the tools round-up. Each is
# written for its page: the guide tests fail on a long sentence repeated across pages.
VS_LINES = {
    "debateowl-vs-chatgpt": "Weighing ChatGPT against more than one alternative? Our list of the {tools} compares them on cases, replies, timed rounds and price.",
    "debateowl-vs-claude": "Claude is only one of the assistants debaters try; the {tools} guide says what each one is best for.",
    "debateowl-vs-gemini": "If you are still choosing between Gemini and an app built for debate, our comparison of the {tools} sets out what each tool is best for.",
    "debateowl-vs-hyperwrite": "A one-shot writer is one kind of tool; the {tools} round-up covers others and what each costs.",
    "debateowl-vs-schoolai": "Teachers choosing for a whole class can compare more options in our guide to the {tools}.",
    "debateowl-vs-publicforumai": "If you want more choices than these two, our list of the {tools} says what each one is best for.",
    "debateowl-vs-windebate": "WinDebate and DebateOwl are two of several debate apps; the {tools} comparison puts more of them side by side.",
    "debateowl-vs-debateclub": "For more than two options, our round-up of the {tools} lists what each one is best for and what it costs.",
    "debateowl-vs-debate-ladder": "Debate Ladder is one of several AI practice options; our list of the {tools} covers the rest, with prices.",
    "debateowl-vs-argufight": "If neither ArguFight nor DebateOwl fits, our list of the {tools} names other options and what each is for.",
    "debateowl-vs-mindduel": "Before you settle on MindDuel or DebateOwl, compare a wider set in our guide to the {tools}.",
    "debateowl-vs-debatable": "Want more than these two to choose from? Our {tools} comparison weighs other apps on price and on what they are best for.",
    "debateowl-vs-prilo": "For prices beyond Prilo and DebateOwl, our list of the {tools} gives each tool's cost as of the day we checked it.",
    "debateowl-vs-debatethis": "If neither a ladder game nor a coach is quite right, read our list of the {tools} to see what else is out there.",
    "debateowl-vs-kialo-edu": "For classroom options beyond argument maps, our guide to the {tools} says what each tool is best for.",
}


def vs_line(slug):
    """The paragraph a /debateowl-vs-* page carries: its round-up sentence, then the AI debate partner once that page is live."""
    if slug not in VS_LINES:
        raise SystemExit(f"{slug}: add its sentence to VS_LINES in scripts/seo_cluster.py")
    text = escape(VS_LINES[slug]).replace("{tools}", link("/best-ai-debate-tools"))
    if PARTNER:
        text += f" Or argue a motion now against our {link('/ai-debate')}."
    return f'<p class="next">{text}</p>'


def llms_lines(page_url):
    """The cluster's llms.txt entries: each live page by its anchor, with a one-line summary."""
    return "\n".join(f"- [{item['anchor'][0].upper() + item['anchor'][1:]}]({page_url(item['path'].lstrip('/'))}): {item['summary']}" for item in LINKS)
