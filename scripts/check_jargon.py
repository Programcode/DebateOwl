"""Report guide jargon: python3 scripts/check_jargon.py [--max N] [--json].

Without --max this only reports counts. LD and Policy are exempt from limits.
"""

import argparse
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re


JARGON = re.compile(r"\b(frameworks?|contentions?|warrants?|impact calculus)\b", re.I)
EXEMPT = {"lincoln-douglas-debate", "policy-debate"}


class PageText(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.in_body = False
        self.hidden = None
        self.is_json_ld = False
        self.visible = []
        self.json_ld = []
        self.script = []

    def handle_starttag(self, tag, attrs):
        if tag == "body":
            self.in_body = True
        if self.in_body and self.hidden is None:
            self.visible.append(" ")
        if tag in {"script", "style"}:
            self.hidden = tag
            self.is_json_ld = (
                tag == "script"
                and dict(attrs).get("type", "").lower() == "application/ld+json"
            )
            self.script = []

    def handle_endtag(self, tag):
        if tag == self.hidden:
            if self.is_json_ld:
                self.json_ld.append(json.dumps(
                    json.loads("".join(self.script)), ensure_ascii=False,
                ))
            self.hidden = None
            self.is_json_ld = False
        if tag == "body":
            self.in_body = False
        if self.in_body and self.hidden is None:
            self.visible.append(" ")

    def handle_data(self, data):
        if self.is_json_ld:
            self.script.append(data)
        elif self.in_body and self.hidden is None:
            self.visible.append(data)

    def handle_entityref(self, name):
        self.handle_data(f"&{name};")

    def handle_charref(self, name):
        self.handle_data(f"&#{name};")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--max", type=int, dest="maximum",
        help="fail if either count exceeds N outside LD and Policy",
    )
    parser.add_argument("--json", action="store_true", help="print JSON instead of a table")
    args = parser.parse_args()
    if args.maximum is not None and args.maximum < 0:
        parser.error("--max must be non-negative")

    rows = []
    for path in sorted((Path(__file__).resolve().parent.parent / "public").glob("*/index.html")):
        page = PageText()
        page.feed(path.read_text(encoding="utf-8"))
        page.close()
        rows.append({
            "slug": path.parent.name,
            "visible": len(JARGON.findall(unescape("".join(page.visible)))),
            "json_ld": len(JARGON.findall(" ".join(page.json_ld))),
        })

    if args.json:
        print(json.dumps(rows, ensure_ascii=False, indent=2))
    else:
        width = max([len("slug")] + [len(row["slug"]) for row in rows])
        print(f"{'slug':<{width}}  visible  json-ld")
        for row in rows:
            print(f"{row['slug']:<{width}}  {row['visible']:>7}  {row['json_ld']:>7}")

    return int(args.maximum is not None and any(
        row["slug"] not in EXEMPT and max(row["visible"], row["json_ld"]) > args.maximum
        for row in rows
    ))


if __name__ == "__main__":
    raise SystemExit(main())
