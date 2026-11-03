"""/debate-case-example: real DebateOwl cases, rendered from the raw output in scripts/case-examples/.

The case text comes from the JSON files unchanged, except for the replaced source links listed in
case-examples/corrections.json, which the page names. Only the page copy around it lives here;
generate_seo_content.render_case_example_page() builds the page.
"""
from datetime import datetime
from html import escape
import json
from pathlib import Path

RAW = Path(__file__).resolve().parent / "case-examples"
RAW_URL = "https://github.com/Programcode/DebateOwl/tree/main/scripts/case-examples"

SLUG = "debate-case-example"
TITLE = "AI Debate Case Example: Real DebateOwl Output | DebateOwl"
H1 = "What does an AI-written debate case look like?"
DESCRIPTION = "Three real DebateOwl cases (British Parliamentary, Policy, and Classroom in Hungarian), each a first speech and an R2, with every source linked."
PUBLISHED = "2026-11-03"
MODIFIED = "2026-11-03"
GENERATED_ON = "3 November 2026"
MODEL_NAME = "Claude Sonnet 5.5"
MODEL_ID = "anthropic/claude-sonnet-5.5"

# The paragraph answer engines quote, straight under the H1. 40-60 words.
ANSWER = (
    f"Below are three real DebateOwl cases generated on {GENERATED_ON} with {MODEL_NAME}: "
    "British Parliamentary and Policy in English, Classroom in Hungarian. Each first speech has an opening, "
    "three arguments with evidence and why they matter, “If they say… we answer…” replies and a closing line. "
    "The second speech (R2) backs them up and answers theirs."
)

# (id, heading, format setting, side label, language name, language code)
SAMPLES = [
    ("bp-en", "British Parliamentary, in English", "British Parliamentary", "For the motion", "English", "en"),
    ("policy-en", "Policy, in English", "Policy", "Against the motion", "English", "en"),
    ("classroom-hu", "Classroom, in Hungarian", "Classroom", "For the motion", "Hungarian", "hu"),
]

HOW_MADE = [
    "Each case was made with DebateOwl's Generate tool, the way a student uses it: start a debate with the motion and a format setting, generate the first speech (R1), then generate the second speech (R2) in the same debate, so the R2 can see and back up the R1.",
    f"Model: {MODEL_NAME} ({MODEL_ID}), the default model for Pro accounts. Length Standard, audience Intermediate and tone Formal, which are the form's defaults; reasoning effort low.",
    "Web research ran live for every speech. A case can only link a page that its own research returned; DebateOwl removes any other link before the case is shown.",
    f"The runs used a local copy of DebateOwl rather than debateowl.com, so no student account or data was involved. One step differs from the live app: the short step that writes the web search queries also ran on {MODEL_NAME} here, where the app uses Claude Haiku 5.5.",
    "One attempt failed: the first Hungarian R2 stopped with an error, so the Hungarian sample was generated again from the start. No other output was rerun or picked over another.",
]

FORMATS_NOTE = "For cases, DebateOwl currently supports the British Parliamentary, Policy and Classroom format settings. Whatever the setting, it writes each speech for a four-speaker team in the 4-6-6-3 structure: Introductor (4 minutes), R1 (6 minutes), R2 (6 minutes) and Conclusor (3 minutes). The samples show R1 and R2."

HONESTY = f"Generated {GENERATED_ON} with {MODEL_NAME}; not edited except formatting and two source links that did not load, replaced as listed below. Evidence leads link to their sources; check every source before you use it in a round."

FAQS = [
    (
        "Can AI write a debate case?",
        "Yes, as a draft. An AI case generator such as DebateOwl takes a motion, a side and a speaker role and writes the speech: an opening, arguments with evidence and why they matter, answers to what the other side is likely to say, a closing line and a source list. The samples on this page are real output, unedited apart from two replaced source links. A debater still has to open every source, check that it says what the case claims, and put the case into their own words before a round.",
    ),
    (
        "What should an AI debate case include?",
        "The parts a debater prepares by hand: an opening with a hook and a line saying what you will prove; two to four arguments, each with a point, an explanation, evidence that names its source and year, and why it matters; “If they say… we answer…” replies to the other side's likely claims; a closing line; and a list of sources with links you can open. A second speech should back up the team's arguments and answer the other side instead of adding new arguments.",
    ),
]

RELATED = [
    ("/ai-debate-case-generator", "AI debate case generator"),
    ("/how-to-write-a-debate-case", "How to write a debate case"),
    ("/how-to-prepare-for-a-debate-with-ai", "How to prepare for a debate with AI"),
    ("/debate-evidence-finder", "Debate evidence finder"),
    ("/debateowl-pricing", "DebateOwl pricing"),
]


# Source links replaced after generation because they did not load in a browser. Each change names the
# raw value it replaces, so a regenerated raw file fails here instead of keeping a stale correction.
CORRECTIONS = json.loads((RAW / "corrections.json").read_text())
REPLACED_URLS = {change["to"] for correction in CORRECTIONS for change in correction["changes"] if change["path"][-1] == "url"}


def raw(sample_id):
    return json.loads((RAW / f"{sample_id}.json").read_text())


def load(sample_id):
    """The raw record with its corrections applied."""
    record = raw(sample_id)
    for correction in CORRECTIONS:
        for change in correction["changes"]:
            if change["sample"] != sample_id:
                continue
            *parents, key = change["path"]
            target = record[change["speech"]]["response"]["output"]
            for step in parents:
                target = target[step]
            if target[key] != change["from"]:
                raise SystemExit(f"{sample_id} {change['speech']} {change['path']}: raw value is {target[key]!r}, correction {correction['id']} expects {change['from']!r}")
            target[key] = change["to"]
    return record


def check_corrections():
    """Every correction names a known sample and still matches its raw file."""
    known = {sample[0] for sample in SAMPLES}
    for correction in CORRECTIONS:
        for change in correction["changes"]:
            if change["sample"] not in known:
                raise SystemExit(f"correction {correction['id']} names unknown sample {change['sample']}")
    for sample_id in known:
        load(sample_id)


def corrections_html():
    items = "".join(f"<li>{escape(correction['note'])}</li>" for correction in CORRECTIONS)
    return f'<h3 id="replaced-sources">Source links replaced after generation</h3><p>Every source was opened in a browser on {GENERATED_ON}. These did not load, so each was replaced with a copy that does and that supports the same claim:</p><ul>{items}</ul>'


def generated_at(record, speech):
    """When the speech's main generate request finished, from its ai_requests row (UTC)."""
    rows = sorted(row["created_at"] for row in record["aiRequests"] if row["feature"] == "generate")
    stamp = datetime.fromisoformat(rows[0 if speech == "r1" else -1])
    return stamp


def _label(text, lang):
    """A field label. Labels are English; on a Hungarian case they say so."""
    attr = '' if lang == "en" else ' lang="en"'
    return f"<strong{attr}>{escape(text)}</strong>"


def _p(label, value, lang):
    return f"<p>{_label(label, lang)} {escape(value)}</p>" if value else ""


def _opening(output, lang):
    opening = output.get("opening") or {}
    parts = [f'<h4>Opening</h4>']
    if opening.get("hook"):
        parts.append(f"<p>{escape(opening['hook'])}</p>")
    parts.append(_p("What we mean:", opening.get("definition", ""), lang))
    parts.append(_p("What we will show:", (output.get("caseStructure") or {}).get("thesis", ""), lang))
    return "".join(parts)


def _arguments(output, lang):
    contentions = output.get("contentions") or []
    if not contentions:
        return ""
    items = []
    for number, item in enumerate(contentions, start=1):
        title = item.get("title") or item.get("claim", "")
        body = [
            f'<p class="arg-title">{_label(f"Argument {number}:", lang)} {escape(title)}</p>',
            _p("Point:", item.get("claim", ""), lang),
            _p("Explanation:", item.get("reasoning", ""), lang),
            _p("Evidence:", item.get("evidence", ""), lang),
            _p("Needs source:", item.get("sourceQuery", "") if item.get("needsSource") else "", lang),
            _p("Why it matters:", item.get("impact") or item.get("whyItMatters", ""), lang),
        ]
        items.append(f'<li>{"".join(body)}</li>')
    return f'<h4>Arguments</h4><ol class="case-list">{"".join(items)}</ol>'


def _reinforce(output, lang):
    reinforce = output.get("reinforce") or []
    if not reinforce:
        return ""
    items = "".join(f'<li><p class="arg-title"><strong>{escape(item.get("argument", ""))}</strong></p><p>{escape(item.get("text", ""))}</p></li>' for item in reinforce)
    return f'<h4>Backing up our case</h4><ol class="case-list">{items}</ol>'


def _counters(output, lang):
    counters = output.get("counters") or []
    if not counters:
        return ""
    items = []
    for item in counters:
        body = [
            _p("They say:", item.get("targetArgument", ""), lang),
            _p("We answer:", item.get("counterpoint", ""), lang),
            f'<p class="muted">{_label("Source:", lang)} {escape(item["source"])}</p>' if item.get("source") else "",
        ]
        items.append(f'<li>{"".join(body)}</li>')
    return f'<h4>If they say…</h4><ol class="case-list">{"".join(items)}</ol>'


def _sources(output, lang):
    sources = output.get("sources") or []
    if not sources:
        return ""
    items = []
    for source in sources:
        name = escape(", ".join(part for part in (source.get("org", ""), str(source.get("year", ""))) if part))
        named = f'<a href="{escape(source["url"])}">{name}</a>' if source.get("url") else name
        claim = f": {escape(source['claim'])}" if source.get("claim") else ""
        replaced = ' <a class="muted" href="#replaced-sources" lang="en">(link replaced)</a>' if source.get("url") in REPLACED_URLS else ""
        items.append(f"<li>{named}{claim}{replaced}</li>")
    return f'<h4>Sources</h4><ol class="sources">{"".join(items)}</ol>'


def speech_html(output, lang):
    """One speech in the app's own section order: opening, arguments or backing up, answers, closing line, sources."""
    closing = f'<h4>Closing line</h4><p>{escape(output["closingLine"])}</p>' if output.get("closingLine") else ""
    inner = _opening(output, lang) + _arguments(output, lang) + _reinforce(output, lang) + _counters(output, lang) + closing + _sources(output, lang)
    attr = "" if lang == "en" else f' lang="{lang}"'
    return f'<div class="speech"{attr}>{inner}</div>'


def utc(stamp):
    return f"{stamp.strftime('%H:%M')} UTC"


def sample_html(number, sample):
    sample_id, heading, format_label, side, language, lang = sample
    record = load(sample_id)
    if record["debateFormatSetting"] != format_label:
        raise SystemExit(f"{sample_id}: raw file says format {record['debateFormatSetting']}, page says {format_label}")
    r1, r2 = record["r1"]["response"]["output"], record["r2"]["response"]["output"]
    motion = record["r1"]["request"]["input"]["motion"]
    for speech in ("r1", "r2"):
        request = record[speech]["request"]
        if request["model"] != MODEL_ID or request["input"]["role"] != speech or request["input"]["language"] != lang:
            raise SystemExit(f"{sample_id} {speech}: the raw request does not match the page's model, role or language")
        served = {call["upstreamModel"] for call in record[speech]["providerCalls"] if call["feature"] == "generate"}
        if served != {MODEL_ID}:
            raise SystemExit(f"{sample_id} {speech}: generate calls were served by {served}")
    facts = [
        ("Motion", motion),
        ("Side", side),
        ("Format setting", f"{format_label} (speeches R1 and R2 of the 4-6-6-3 structure)"),
        ("Language", language),
        ("Generated", f"{GENERATED_ON}: R1 at {utc(generated_at(record, 'r1'))}, R2 at {utc(generated_at(record, 'r2'))}"),
        ("Model", f"{MODEL_NAME} ({MODEL_ID})"),
    ]
    facts_html = "".join(f"<dt>{escape(term)}</dt><dd{' lang=' + chr(34) + lang + chr(34) if term == 'Motion' and lang != 'en' else ''}>{escape(value)}</dd>" for term, value in facts)
    answers = len(r2.get("counters") or [])
    raw_link = f'<p class="muted">Raw output: <a href="{RAW_URL}/{sample_id}.json">{sample_id}.json</a></p>'
    return (
        f'<section class="case section article" id="sample-{sample_id}" aria-labelledby="sample-{sample_id}-title">'
        f'<h2 id="sample-{sample_id}-title">Sample {number}: {escape(heading)}</h2>'
        f'<dl class="facts">{facts_html}</dl>'
        f"<h3>First speech (R1)</h3>{speech_html(r1, lang)}"
        f"<h3>Second speech (R2)</h3>"
        f"<p>No new arguments: about two minutes backing up the R1's arguments, then {answers} “If they say… we answer…” blocks the speaker picks from.</p>"
        f"<details><summary>Show the full R2 ({answers} answers)</summary>{speech_html(r2, lang)}</details>"
        f"{raw_link}</section>"
    )


def creative_works(page_url, software_id):
    """One CreativeWork per sample for the JSON-LD graph."""
    works = []
    for sample in SAMPLES:
        sample_id, heading, format_label, _, _, lang = sample
        record = load(sample_id)
        motion = record["r1"]["request"]["input"]["motion"]
        works.append({
            "@type": "CreativeWork",
            "@id": f"{page_url}#sample-{sample_id}",
            "name": f"DebateOwl case ({format_label}): {motion}",
            "genre": "Debate case",
            "inLanguage": lang,
            "dateCreated": generated_at(record, "r1").isoformat(),
            "creator": {"@id": software_id},
            "url": f"{page_url}#sample-{sample_id}",
        })
    return works


def answer_words():
    return len(ANSWER.split())
