#!/usr/bin/env python3
"""The comparison and prep pages, each with its own layout, including the native Spanish and Hungarian ones.

DebateOwl leads every page. Competitor facts stay sourced. The generator
refuses jargon, a missing pricing sentence, or two pages that share more
than two H2s.
"""
from html import escape, unescape
from pathlib import Path
import json
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
SITE = json.loads((ROOT / "src" / "config" / "site.json").read_text())
BASE = SITE["origin"]
PRODUCT = SITE["product"]
ORG = SITE["organization"]
PRICING = SITE["pricing"]
DATE = "2026-10-29"
LONG = "October 29, 2026"
PRICE = SITE["freePlan"].replace("{{product}}", PRODUCT).replace("{{trialDays}}", str(PRICING["trialDays"])).replace("{{proMonthly}}", PRICING["proMonthly"])
HU_PRICE = (
    f"A {PRODUCT} alkalmazásnak nincs ingyenes csomagja ({PRICING['trialDays']} napos ingyenes próba, "
    f"utána havi ${PRICING['proMonthly']}); a /hu/tools oldalon lévő külön eszközök ingyenesek, és fiók nélkül is használhatók."
)
BYLINE = f"By the {PRODUCT} team · Published {LONG} · Last updated {LONG}"
DISCLOSURE = (
    f"{PRODUCT} makes one of the tools on this page. Facts about other products come from their own websites, "
    f"checked on {LONG}. Check them before you pay."
)
HU_DISCLOSURE = (
    f"A {PRODUCT} készíti az egyik eszközt ezen az oldalon. A többi termékről szóló tények a saját weboldalukról származnak, "
    "2026. október 29-én ellenőrizve. Fizetés előtt ellenőrizd őket."
)
ES_DISCLOSURE = (
    f"{PRODUCT} hace una de las herramientas de esta página. Los datos de los demás productos salen de sus propias webs, "
    "consultadas el 30 de octubre de 2026. Compruébalos antes de pagar."
)
# The pricing sentence of the native pages, worded as es.json (faq.a9) and HU_PRICE have it,
# with the free tools linked by name instead of the bare /es/tools or /hu/tools path.
ES_PRICE_START = f"La app {PRODUCT} no tiene plan gratuito"
ES_PRICE_HTML = (
    f"{ES_PRICE_START} (prueba gratis de {PRICING['trialDays']} días y después ${PRICING['proMonthly']}/mes); "
    'las herramientas aparte, <a href="/es/tools">cronómetro, generador de mociones, hoja de flujo y calculadora de tiempo de discurso</a>, '
    "son gratis y no piden cuenta."
)
HU_PRICE_START = f"A {PRODUCT} alkalmazásnak nincs ingyenes csomagja"
HU_PRICE_HTML = (
    f"{HU_PRICE_START} ({PRICING['trialDays']} napos ingyenes próba, utána havi ${PRICING['proMonthly']}); "
    'a különálló <a href="/hu/tools">időmérő, tételgenerátor, jegyzetlap és beszédidő-kalkulátor</a> ingyenes, és fiók nélkül is használható.'
)
MONTHS = {
    "es": ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
    "hu": ["január", "február", "március", "április", "május", "június", "július", "augusztus", "szeptember", "október", "november", "december"],
}


def long_date(iso, lang="en"):
    year, month, day = (int(part) for part in iso.split("-"))
    if lang == "es":
        return f"{day} de {MONTHS['es'][month - 1]} de {year}"
    if lang == "hu":
        return f"{year}. {MONTHS['hu'][month - 1]} {day}."
    return f"{['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][month - 1]} {day}, {year}"


# /best-ai-for-debate and its native Spanish and Hungarian pages name each other.
# render_best_ai_page in generate_seo_content.py prints the same set, as check-site.mjs requires.
BEST_AI_ALTERNATES = [
    ("en", f"{BASE}/best-ai-for-debate"),
    ("es", f"{BASE}/es/mejor-ia-para-preparar-un-debate"),
    ("hu", f"{BASE}/hu/melyik-ai-a-legjobb-vitara"),
    ("x-default", f"{BASE}/best-ai-for-debate"),
]


OWN = ' class="own"'


def hreflang_links(alternates):
    return "".join(f'\n  <link rel="alternate" hreflang="{lang}" href="{href}" />' for lang, href in alternates)


CASE = (
    'A DebateOwl case is a speech you can read out: an opening, two to four arguments, each with an explanation, '
    'evidence that names its source and year, and why it matters, then "If they say… we answer…" replies, a closing line, and the sources it used. '
    "You can regenerate one weak section without touching the rest."
)
# The pricing sentence as the pages show it: once per page, in the call-to-action area,
# with the free tools named and linked instead of a bare "/tools".
PRICE_HTML = escape(PRICE).replace(
    "the separate tools at /tools are free",
    'the separate <a href="/tools">timer, motion generator, flow sheet and speech-time calculator</a> are free',
)
PRICE_START = f"The {PRODUCT} app has no free plan"

JARGON = re.compile(
    r"\b(frameworks?|contentions?|warrants?|impact calculus|keretrendszer(?:t|ek)?|kontenció(?:k|t)?|contenci[oó]n(?:es)?|garant[ií]as?|marco teórico|érvelési keret\w*)\b",
    re.I,
)
SIBLINGS = {
    "debateowl-vs-debate-ladder",
    "free-vs-paid-ai-debate-tools",
    "chatgpt-vs-claude-for-debate",
    "ai-debate-tools-for-teachers",
    "how-to-prepare-for-a-debate-with-ai",
    "best-ai-for-public-forum",
    "hu/mi-vitafelkeszules",
    "es/mejor-ia-para-preparar-un-debate",
    "hu/melyik-ai-a-legjobb-vitara",
    "debateowl-vs-argufight",
    "debateowl-vs-mindduel",
}


def esc(value):
    return escape(str(value), quote=True)


def ensure_fonts(public):
    dest = public / "fonts"
    dest.mkdir(parents=True, exist_ok=True)
    files = [
        "fredoka/files/fredoka-latin-wght-normal.woff2",
        "fredoka/files/fredoka-latin-ext-wght-normal.woff2",
        "nunito/files/nunito-latin-wght-normal.woff2",
        "nunito/files/nunito-latin-ext-wght-normal.woff2",
    ]
    for rel in files:
        src = ROOT / "node_modules" / "@fontsource-variable" / rel
        if not src.exists():
            raise SystemExit(f"Missing {src}. Run npm ci before generating these pages.")
        target = dest / src.name
        if not target.exists() or target.stat().st_size != src.stat().st_size:
            shutil.copyfile(src, target)


TICK = (
    '<svg class="tick" viewBox="0 0 16 16" width="18" height="18" aria-hidden="true">'
    '<path d="M3.2 8.4 6.4 11.6 12.8 4.4" fill="none" stroke="#14B37D" stroke-width="2.4" '
    'stroke-linecap="round" stroke-linejoin="round"/></svg>'
)


def fonts():
    return """
@font-face{font-family:Fredoka;font-style:normal;font-display:swap;font-weight:300 700;src:url("/fonts/fredoka-latin-ext-wght-normal.woff2") format("woff2");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:Fredoka;font-style:normal;font-display:swap;font-weight:300 700;src:url("/fonts/fredoka-latin-wght-normal.woff2") format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:Nunito;font-style:normal;font-display:swap;font-weight:200 1000;src:url("/fonts/nunito-latin-ext-wght-normal.woff2") format("woff2");unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
@font-face{font-family:Nunito;font-style:normal;font-display:swap;font-weight:200 1000;src:url("/fonts/nunito-latin-wght-normal.woff2") format("woff2");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;color:#1F2B40;font-family:Nunito,ui-rounded,system-ui,sans-serif;font-weight:600;line-height:1.65}h1,h2,h3,.cta,button,summary{font-family:Fredoka,Nunito,ui-rounded,system-ui,sans-serif;font-weight:600;letter-spacing:-.02em;line-height:1.15}a{color:#0556D6}a:focus-visible,button:focus-visible,input:focus-visible{outline:3px solid #0A6FF0;outline-offset:3px}.tick{display:inline-block;vertical-align:-3px;margin-right:6px;flex:none}.cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:14px;padding:14px 20px;background:#0A6FF0;color:#fff;text-decoration:none;box-shadow:0 5px 0 #02307E}.cta:active{transform:translateY(5px);box-shadow:none}.scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%}table{border-collapse:collapse;width:100%}th,td{text-align:left;vertical-align:top;padding:10px 12px;border-bottom:1px solid #CDD7E4}th{font-family:Fredoka,Nunito,sans-serif}.byline,.disclosure,.updated{color:#46566F;font-size:.95rem}.answer{border-left:4px solid #0A6FF0;padding:4px 0 4px 16px}pre{overflow-x:auto;background:#0B1426;color:#EEF4FF;border-radius:16px;padding:16px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:500;font-size:.92rem;line-height:1.45}code{font-family:inherit}
"""


def organization():
    return {
        "@type": "Organization",
        "@id": BASE + "/#organization",
        "name": ORG["name"],
        "alternateName": SITE["alternateName"],
        "url": BASE + "/",
        "logo": {"@type": "ImageObject", "url": BASE + ORG["logo"]["path"], "width": ORG["logo"]["width"], "height": ORG["logo"]["height"]},
        "email": SITE["contactEmail"],
        "contactPoint": {"@type": "ContactPoint", "contactType": "customer support", "email": SITE["contactEmail"], "availableLanguage": ["en", "hu", "es"]},
    }


def graph(page, faqs, howto=None):
    url = f"{BASE}/{page['slug']}"
    org = organization()
    nodes = [
        {
            "@type": "Article",
            "headline": page["h1"],
            "name": page["title"],
            "url": url,
            "description": page["description"],
            "inLanguage": page["lang"],
            "datePublished": page.get("published", DATE),
            "dateModified": page.get("modified", DATE),
            "author": org,
            "publisher": org,
            "about": {"@id": BASE + "/#software"},
        },
        {"@type": "BreadcrumbList", "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": PRODUCT, "item": BASE + "/"},
            {"@type": "ListItem", "position": 2, "name": page["h1"], "item": url},
        ]},
            {"@type": "FAQPage", "mainEntity": [
            {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}}
            for q, a in [(page["question"], page["answer"]), *[(q, a) for q, a in faqs if q != page["question"]]]
        ]},
    ]
    if howto:
        nodes.append(howto)
    raw = json.dumps({"@context": "https://schema.org", "@graph": nodes}, ensure_ascii=False, separators=(",", ":"))
    return raw.replace("<", "\\u003c")


def sources(heading, items, checked="Checked Oct 29, 2026."):
    rows = "".join(
        f'<li id="{esc(key)}"><a href="{esc(url)}">{esc(url)}</a>. {esc(note)} {esc(checked)}</li>'
        for key, url, note in items
    )
    return f'<section><h2>{esc(heading)}</h2><ol>{rows}</ol></section>'


def faq_block(heading, faqs, kind):
    if kind == "details":
        body = "".join(f"<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>" for q, a in faqs)
    elif kind == "defs":
        body = "<dl>" + "".join(f"<dt>{esc(q)}</dt><dd>{esc(a)}</dd>" for q, a in faqs) + "</dl>"
    elif kind == "cards":
        body = '<div class="qcards">' + "".join(f'<article><h3>{esc(q)}</h3><p>{esc(a)}</p></article>' for q, a in faqs) + "</div>"
    else:
        body = "".join(f"<h3>{esc(q)}</h3><p>{esc(a)}</p>" for q, a in faqs)
    return f"<section><h2>{esc(heading)}</h2>{body}</section>"


def wins(items):
    lis = "".join(f"<li>{TICK}<span>{item}</span></li>" for item in items)
    return f'<ul class="wins">{lis}</ul>'


def chrome(page):
    """The byline, disclosure, "last updated" line and About aside, in the page's language."""
    lang = page["lang"]
    published = long_date(page.get("published", DATE), lang)
    modified = long_date(page.get("modified", DATE), lang)
    if lang == "es":
        return {
            "home": "/es",
            "byline": f'Por el <a href="/es">equipo de {PRODUCT}</a> · Publicado el {published} · Última actualización: {modified}',
            "disclosure": ES_DISCLOSURE,
            "updated": f"Última actualización: {modified}",
            "about": f'<aside class="about" aria-labelledby="about"><h2 id="about">Sobre {PRODUCT}</h2><p><a href="/es">{PRODUCT}</a> es una app de preparación y práctica de debate con IA. Cómo funciona y lo que cuesta está en la <a href="/es">página de inicio en español</a>.</p></aside>',
        }
    if lang == "hu":
        return {
            "home": "/hu",
            "byline": f'<a href="/hu">{PRODUCT}</a> csapata · Közzétéve: {published} · Utolsó frissítés: {modified}',
            "disclosure": page.get("disclosure", HU_DISCLOSURE),
            "updated": f"Utolsó frissítés: {modified}",
            "about": '<aside class="about" aria-labelledby="about"><h2 id="about">A DebateOwlról</h2><p>A <a href="/hu">DebateOwl</a> MI-alapú vitafelkészítő és gyakorlóalkalmazás. A működés és az ár a <a href="/hu">magyar kezdőlapon</a> olvasható.</p></aside>',
        }
    return {
        "home": "/",
        "byline": f'By the <a href="/">{PRODUCT} team</a> · Published {published} · Last updated {modified}',
        "disclosure": DISCLOSURE.replace(LONG, modified),
        "updated": f"Last updated: {modified}",
        "about": f'<aside class="about" aria-labelledby="about"><h2 id="about">About {PRODUCT}</h2><p><a href="/">{PRODUCT}</a> is an AI debate prep and practice app. See <a href="/">how it works</a> or <a href="/debateowl-pricing">pricing</a>.</p></aside>',
    }


def shell(page, style, body, faqs, howto=None):
    url = f"{BASE}/{page['slug']}"
    hreflang = ""
    if "alternates" in page:
        hreflang = hreflang_links(page["alternates"])
    elif page["lang"] == "hu":
        hreflang = hreflang_links([("hu", url), ("x-default", url)])
    text = chrome(page)
    # The first Hungarian page also carries the English disclosure; the native pages carry their own only.
    extra_disclosure = f'<p class="disclosure">{esc(DISCLOSURE)}</p>' if page.get("english_disclosure") else ""
    return f"""<!doctype html>
<html lang="{page['lang']}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{esc(page['title'])}</title>
  <meta name="description" content="{esc(page['description'])}" />
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
  <link rel="canonical" href="{url}" />{hreflang}
  <meta name="author" content="{esc(ORG['name'])}" />
  <meta name="msvalidate.01" content="8FC8FD530126287EF8AD3977BFB24C17" />
  <link rel="icon" href="/favicon.ico" sizes="48x48" />
  <link rel="icon" type="image/png" href="/favicon.png" sizes="48x48" />
  <link rel="icon" type="image/png" href="/icon-192.png" sizes="192x192" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="{esc(PRODUCT)}" />
  <meta property="og:title" content="{esc(page['title'])}" />
  <meta property="og:description" content="{esc(page['description'])}" />
  <meta property="og:url" content="{url}" />
  <meta property="og:image" content="{BASE}/hero-visual.jpg?v=2" />
  <meta property="article:published_time" content="{page.get('published', DATE)}" />
  <meta property="article:modified_time" content="{page.get('modified', DATE)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{esc(page['title'])}" />
  <meta name="twitter:description" content="{esc(page['description'])}" />
  <style>{fonts()}{style}</style>
  <script type="application/ld+json">{graph(page, faqs, howto)}</script>
</head>
<body class="{esc(page['body'])}">
<main>
  <p class="crumb"><a href="{text['home']}">{esc(PRODUCT)}</a></p>
  <h1>{esc(page['h1'])}</h1>
  <p class="byline">{text['byline']}</p>
  <p class="disclosure">{esc(text['disclosure'])}</p>
  {extra_disclosure}
  <p class="updated">{esc(text['updated'])}</p>
  <section class="answer" aria-labelledby="short-answer"><h2 id="short-answer">{esc(page['question'])}</h2><p>{esc(page['answer'])}</p></section>
  {body}
  {text['about']}
</main>
</body>
</html>
"""


def page_ladder():
    answer = (
        "Pick DebateOwl if you have a real school or tournament debate coming up and need a case you can read out, "
        '"If they say… we answer…" replies to the other side, and timed practice rounds in School 4-6-6-3, Lincoln-Douglas or Public Forum. '
        "Pick Debate Ladder if you want to argue out loud against an AI and climb a ranked Elo ladder. "
        "Many debaters could use both, one for prep and one for speaking reps."
    )
    faqs = [
        ("Is Debate Ladder free?", "New accounts get 100 free credits, and a debate costs about one credit per minute of speaking, according to its site (October 2026). More credits are sold; its /pricing page returned 404, so there is no published plan price beyond credits."),
        ("Is DebateOwl free?", "Not the app: it is paid after a 3-day free trial. Its debate timer, motion generator and flow sheet are free without an account."),
        ("Which should I use for a school debate next week?", "DebateOwl. It writes the case you will read and the answers to the other side, then lets you practise the round at real speech times. Debate Ladder is the better fit when the goal is ranked speaking reps on topics you did not choose."),
        ("Can I practise speaking out loud with DebateOwl?", "Yes. Sparring speeches can be typed or spoken."),
        ("Does Debate Ladder rank you?", "Yes. Ranked wins raise your Elo, which starts at 500, and losses lower it. Practice and custom debates are unrated."),
    ]
    owl_checks = [
        "I have a set motion and a date",
        "I need to know what the other side will say and how to answer it",
        "I'm in a School 4-6-6-3, LD or PF round",
        "I want to export my case to Word, PDF or Google Docs",
        "I'd like the app in Spanish or Hungarian",
    ]
    ladder_checks = [
        "I mostly want to practise speaking out loud",
        "A ranked score keeps me motivated",
    ]
    owl = "".join(f'<label><input type="checkbox" /> {esc(item)}</label>' for item in owl_checks)
    ladder = "".join(f'<label><input type="checkbox" /> {esc(item)}</label>' for item in ladder_checks)
    rows = [
        ("Main job", "Case prep plus timed practice rounds for a set motion", "Out-loud practice debates against an AI, ranked by Elo"),
        ("Speeches", "Format speeches: School 4-6-6-3, LD, PF in Sparring", "Opening, rebuttal, closing"),
        ("Written case", 'Yes: opening, 2–4 arguments, "If they say… we answer…", closing, sources', "Not listed on its homepage"),
        ("Scoring", "Judged verdict after a Sparring round", "AI judge on 5 criteria, Elo from 500"),
        ("Voice", "Type or speak", "Voice-first; type in practice mode"),
        ("Price", "No free plan: 3-day free trial, then $5/month + tax; the free timer needs no account", "100 free credits, then credits (about 1 per minute of speaking)"),
    ]
    trs = "".join(f"<tr><th scope=\"row\">{esc(a)}</th><td>{esc(b)}</td><td>{esc(c)}</td></tr>" for a, b, c in rows)
    body = f"""
<p class="lede">{TICK}<strong>Start here when the round is real.</strong> DebateOwl writes the case you will actually read, including the replies, then times the practice.</p>
<section class="verdict">
  <h2>The pick for a dated round</h2>
  <p>If your motion and your date are already set, DebateOwl is the pick. Its job is written prep: the speech and the replies are on the page before you say them, then a timed round gives you somewhere to say them, where Debate Ladder starts from your voice and a ranking. The <a href="/best-ai-for-debate">short answer</a> across more tools is a separate page. Debate Ladder stays the right extra when you want frequent out-loud reps and a ranking, including if you are not in a tournament at all.</p>
  {wins([
    "A case you can read out loud",
    '"If they say X, we answer Y" replies',
    "Timed rounds in three formats",
    "Free timer, motions and flow sheet",
    "$5/month after a 3-day trial",
  ])}
  <p><a class="cta" href="/app">Build your case for the next round, then spar it</a></p>
  <p>{PRICE_HTML}</p>
</section>
<section>
  <h2>The 7-question checklist</h2>
  <p>Tick the lines that are true this week. This is not a score. The side with more ticks is the closer fit, and two strong reasons for Debate Ladder are on the page on purpose. Many people tick some of both: prep in one, speaking reps in the other.</p>
  <form>
    <fieldset class="owl">
      <legend>{TICK}DebateOwl</legend>
      {owl}
    </fieldset>
    <fieldset>
      <legend>Debate Ladder</legend>
      {ladder}
    </fieldset>
  </form>
</section>
<section>
  <h2>What DebateOwl does well</h2>
  <p>{esc(CASE)}</p>
  <p>Speaker roles follow a school round. The introductor gets the opening and the headline arguments. The first refutation speaker gets the full arguments. The second speaker brings no new arguments: about two minutes backing up the team's arguments, then about four minutes on "If they say X, we answer Y" replies, usually five or six blocks. The closing speaker brings no new arguments either: two or three reasons your side won, then the closing line.</p>
  <p>Around that case, Attack looks for the weak link in the other side, Factoids researches a claim and names sources you still have to open, Crossfire drills questions, and Sparring runs a timed round in School 4-6-6-3, Lincoln-Douglas or Public Forum and ends with a judged verdict. World Schools, British Parliamentary, Policy and Congress use the prep tools, not a full simulated round. The app is in English, Spanish and Hungarian. Pro adds expanded AI prep access, all 10 models (including Claude Opus and Sonnet, GPT-6.1 Sol and Gemini), Active Grounding research and priority support. Evidence leads still need checking against the original source.</p>
  <p>The free <a href="/tools/debate-timer">debate timer</a> is separate from the app: seven formats, protected time, points-of-information knocks and prep banks, and it saves the round in the browser. See also the <a href="/ai-debate-case-generator">case generator</a>, <a href="/ai-debate-practice">practice rounds</a>, <a href="/how-to-practice-rebuttals">rebuttal practice</a> and <a href="/debateowl-pricing">pricing</a>.</p>
</section>
<section>
  <h2>What Debate Ladder does well</h2>
  <p>Debate Ladder is best for people who want frequent out-loud reps and a ranking, on any topic, including non-competitors. Its homepage describes a voice-first debate game. You are assigned PRO or CON, then speak an opening, rebuttal and closing while an AI argues the other side. Practice mode lets you type. An AI judge scores logic, responsiveness, clarity, delivery and persuasiveness, then gives feedback. Ranked wins raise your Elo, which starts at 500, and losses lower it. Practice and custom debates are unrated. Topics run from beginner to expert, and you can write your own. New accounts get 100 free credits, and a debate costs about one credit per minute of speaking time. <a href="#s1">S1</a></p>
</section>
<section>
  <h2>Side by side (checked October 29, 2026)</h2>
  <div class="scroll"><table>
    <caption>DebateOwl beside Debate Ladder. DebateOwl is the prep column.</caption>
    <thead><tr><th scope="col"> </th><th scope="col">DebateOwl</th><th scope="col">Debate Ladder</th></tr></thead>
    <tbody>{trs}</tbody>
  </table></div>
  <p>DebateOwl is best for students preparing a specific motion for a school or competitive round. Debate Ladder is best for ranked speaking practice that is not tied to one tournament motion.</p>
</section>
{faq_block("Questions people ask before they pick", faqs, "details")}
{sources("Where these facts come from", [("s1", "https://debateladder.com/", "Debate Ladder homepage. Its /pricing address returned 404.")])}
<p>The worked second-speech shape is on <a href="/how-to-prepare-for-a-debate-with-ai">how to prepare for a debate with AI</a>.</p>
"""
    style = """
body.ladder{background:#F7FAFE}body.ladder main{width:min(980px,calc(100% - 32px));margin:32px auto 64px}
body.ladder h1{font-size:clamp(2.4rem,6vw,4.2rem);color:#0B1426;margin:8px 0}
body.ladder .lede{font-size:1.2rem}
body.ladder .verdict{background:#fff;border:2px solid #0B1426;border-radius:28px;padding:22px;margin:22px 0}
body.ladder form{display:grid;grid-template-columns:1.35fr .8fr;gap:16px;margin-top:12px}
body.ladder fieldset{border:2px solid #CDD7E4;border-radius:22px;background:#fff;padding:16px 18px}
body.ladder fieldset.owl{border-color:#0A6FF0;background:#EEF7FF}
body.ladder legend{font-family:Fredoka,Nunito,sans-serif;font-size:1.25rem;padding:0 6px}
body.ladder label{display:flex;gap:10px;align-items:flex-start;margin:10px 0}
body.ladder input{accent-color:#14B37D;width:1.15rem;height:1.15rem;margin-top:4px}
body.ladder .wins{list-style:none;padding:0;display:grid;gap:8px}
body.ladder .wins li{display:flex;align-items:center}
body.ladder table{min-width:640px;background:#fff}
body.ladder details{border-bottom:1px solid #CDD7E4;padding:10px 0}
@media(max-width:720px){body.ladder form{grid-template-columns:1fr}}
"""
    return {
        "slug": "debateowl-vs-debate-ladder",
        "lang": "en",
        "body": "ladder",
        "title": "DebateOwl vs Debate Ladder: Case Prep or Ranked Voice Rounds? | DebateOwl",
        "description": "Debate Ladder is a voice-first debate game with an Elo ladder. DebateOwl writes ready-to-read cases and runs timed rounds. A checklist to pick.",
        "h1": "DebateOwl vs Debate Ladder",
        "question": "DebateOwl or Debate Ladder: which should I use?",
        "answer": answer,
        "faqs": faqs,
        "style": style,
        "html_body": body,
    }


def page_price():
    answer = (
        "Start with DebateOwl when you want a case you can read out, replies to the other side and timed rounds at the low end of paid prices: "
        "$5/month after a 3-day free trial, with its separate debate tools free. "
        "You can practise with AI for free: ChatGPT and Claude have free plans, PublicForumAI gives 3 practice rounds a month, Debate Ladder gives new accounts 100 credits, and ArguFight is free to start. "
        "Paid plans mostly add more rounds, linked evidence or speaking time, at roughly $5 to $20 a month."
    )
    faqs = [
        ("Is there a free AI for debate practice?", "Yes. ChatGPT and Claude have free plans, PublicForumAI includes 3 full practice rounds a month, Debate Ladder gives new accounts 100 credits, and ArguFight is free to start. DebateOwl's app is paid after a 3-day trial, and its timer and motion generator cost nothing."),
        ("What is the cheapest paid AI debate tool?", "Among the tools in this table, the lowest monthly prices listed are Debatable's Tokens plan at $4.99/month, DebateOwl at $5/month + tax, and Symbai's individual plan at NZ$4.99/month. Debatable's Individual plan is $10 a year. Compare what each one actually includes before you treat the smallest number as the same product."),
        ("Is DebateOwl free?", "The app is not: you get a 3-day free trial, then Pro at $5/month + tax. The timer, flow sheet and motion generator on its free tools page cost nothing."),
        ("Are free AI debate tools good enough?", "For drills and background reading, often yes. Paid plans mainly add volume and linked evidence. Whatever you use, check evidence against the original source. For a tournament week, DebateOwl at $5/month is the low-priced way to get a case, replies and timed rounds together."),
        ("Is ChatGPT free for debate?", "Yes. OpenAI says the free version is available to everyone. Paid plans add more access."),
    ]
    tools = [
        ("DebateOwl", "3-day free trial, no card; the separate debate tools are free, no account", "$5/month + tax (Pro)", "All 10 models, Active Grounding, priority support. The case, the replies and timed rounds are the job.", "This site"),
        ("ChatGPT", "Free version available to everyone", "Go, Plus, Pro, plus Business and Enterprise (dollar prices not shown on the page we opened)", "More messages. Plus and Pro add more models and deep research. Study mode and voice are on the free plan too.", "P1"),
        ("Claude", "Free plan, $0", "Pro $20/mo monthly ($17/mo billed annually); Max from $100/mo", "More usage, Opus, Research. The free plan includes web search, memory and voice.", "P2"),
        ("PublicForumAI", "Free: 3 full practice rounds/mo, unlimited AI Flow drills, 5 AI cases/mo plus 2 Premium cases with real sources, 15 training modules", "Premium $9.99/mo or $79/yr", "Unlimited rounds, real sourced evidence with links, rounds and ballots kept. Free rounds are kept 30 days.", "P3"),
        ("Debate Ladder", "100 free credits for new accounts", "More credits (about 1 credit per minute of speaking); no plan price published", "More debates", "S1"),
        ("ArguFight", '"Free to start"; "free forever for base debating"; free for classrooms', "Not listed on the pages we opened", "Not listed. Classrooms are described as free.", "P4, P5"),
        ("Debatable", "Free: 10 AI voice minutes after sign-in (about one round), not refilled; live rounds with people free. A short voice preview exists before sign-in.", "Individual $10/yr; Voice $12/mo; Tokens $4.99/mo; BYOK $1/mo; Team $50/yr; school programs $200/season", "120 AI voice minutes/mo and a written decision on Individual and Voice. Tokens adds extra voice rounds.", "P6"),
        ("Cardinal", '"Core tools free forever" (five tools marked free)', "Pro $10/month or $75 a season", "Practice rounds with an AI judge and a written ballot, a word counter, case files and more prep tools.", "P7"),
        ("Prilo NSDA", "Not stated", "$15/month or $60/year", "Sparring, a 3-minute cross-examination simulator, flowing practice, speech analytics, card cutting", "P8"),
        ("HyperWrite Debate Assistant", '"Limited trial"', "Premium $19.99/mo; Ultra $44.99/mo. Annual prices are also listed ($16/mo and $29/mo).", "More messages and citations", "P9, P10"),
        ("Debate Arena", "Free plan with unlimited debates vs AI and live opponents", "Gold plan (price not stated on the page opened)", "50+ personas, detailed evaluations, British Parliamentary practice", "P11"),
        ("Symbai", "Trial; a free read-only workspace after the trial. The individual button says try 1 month free.", "Individual NZ$4.99/mo; teacher or club plans from NZ$9.99/mo. Teacher plans say try 2 months free.", "AI coaching re-enabled", "P12"),
        ("Kialo Edu", 'Free ("free and always will be")', "None listed", "Nothing further is listed, because the classroom product is free.", "P13"),
    ]
    trs = "".join(
        f'<tr class="{"top" if i == 0 else ""}"><th scope="row">{TICK if i == 0 else ""}{esc(name)}</th><td>{esc(free)}</td><td>{esc(paid)}</td><td>{esc(adds)}</td><td>{esc(src)}</td></tr>'
        for i, (name, free, paid, adds, src) in enumerate(tools)
    )
    body = f"""
<section class="band">
  <h2>The pick on price</h2>
  <p>For a case you can read, replies, and timed rounds, DebateOwl is the row to read first. {PRICE_HTML} See <a href="/best-ai-for-debate">the short answer</a> if you want the wider map, or <a href="/chatgpt-vs-claude-for-debate">ChatGPT and Claude</a> if the question is which general chatbot to open. <a href="/best-ai-for-public-forum">Public Forum tools</a> are compared speech by speech, and <a href="/debateowl-vs-debate-ladder">Debate Ladder</a> is the ranked voice game.</p>
  <p class="row">{TICK}<strong>DebateOwl in one line:</strong> a readable case with replies and timed Sparring rounds, for $5 a month once the trial ends.</p>
  <p><a class="cta" href="/tools">Try the free tools first, no account</a></p>
</section>
<section>
  <h2>Price table (checked October 29, 2026)</h2>
  <div class="scroll"><table>
    <caption>DebateOwl is the first row. Prices as listed by each product on October 29, 2026.</caption>
    <thead><tr><th scope="col">Tool</th><th scope="col">Free option</th><th scope="col">Paid price (as listed)</th><th scope="col">What paid adds</th><th scope="col">Source</th></tr></thead>
    <tbody>{trs}</tbody>
  </table></div>
  <p>Prices and plans as listed on each product's own website on October 29, 2026, in the currency shown. Check before you subscribe.</p>
</section>
<section>
  <h2>What $0 gets you</h2>
  <ul>
    <li>ChatGPT: a free version OpenAI says is available to everyone, including study mode and voice, with limits.</li>
    <li>Claude: a $0 plan with web search, memory and voice mode.</li>
    <li>DebateOwl's separate tools: a timer, motion generator, printable flow sheet and speech-time calculator, no account. The app itself is a 3-day trial, not a permanent free plan.</li>
    <li>PublicForumAI: 3 full practice rounds a month, unlimited AI Flow drills, 5 cases a month plus 2 with real sources, and 15 training modules.</li>
    <li>Debate Ladder: 100 credits for a new account, about one credit per minute of speaking.</li>
    <li>ArguFight: free to start, free forever for base debating, and free for classrooms.</li>
    <li>Debatable: 10 AI voice minutes after sign-in, not refilled, and live rounds with people at no charge.</li>
    <li>Cardinal: the core tools, five of them marked free, described as free forever.</li>
    <li>HyperWrite: a limited trial of the debate assistant.</li>
    <li>Debate Arena: a free plan with unlimited debates against AI and live opponents.</li>
    <li>Symbai: a trial, then a read-only workspace if you do not pay.</li>
    <li>Kialo Edu: the classroom product, free, and the site says it always will be.</li>
    <li>Prilo's pages we opened do not state a free option.</li>
  </ul>
</section>
<section>
  <h2>What paying adds</h2>
  <p>Across these pages, payment tends to buy the same kinds of things, and the lists above are the ones to trust:</p>
  <ul>
    <li>More rounds or more minutes, once a free cap runs out.</li>
    <li>Sourced evidence with links, where the product says the free tier argues without them.</li>
    <li>Voice time, on the products that meter speaking.</li>
    <li>Teacher dashboards, student analytics or class controls, on the products built for a whole class.</li>
  </ul>
  <p>DebateOwl's $5 plan is the low monthly price that adds the prep workspace: all 10 models, Active Grounding research and priority support. Open every source before a lead goes into a speech. Active Grounding is not a promise that a citation is already checked.</p>
</section>
<section class="steps">
  <h2>The cheapest way to prep for a tournament</h2>
  <ol>
    <li>Use the free <a href="/tools">tools</a> for drills: the <a href="/tools/debate-timer">timer</a>, the <a href="/tools/debate-flow-sheet">flow sheet</a> and the <a href="/tools/debate-motion-generator">motion generator</a>. No account.</li>
    <li>Use a free chatbot for background reading. It will not keep your motion, side and speech times for you.</li>
    <li>Buy one month of a paid tool during tournament weeks. DebateOwl is $5/month + tax after the 3-day trial, which is the straightforward way to get the case, the replies and the timed rounds in one place. PublicForumAI's free tier may be enough for debaters who only need a few PF practice rounds and are not also writing a case to export.</li>
  </ol>
  <p>Plan details are on <a href="/debateowl-pricing">the pricing page</a>.</p>
</section>
<section>
  <h2>Prices change</h2>
  <p>Each product's own page wins over this table. A number here was copied from that page on October 29, 2026, and it can move. Debatable also lists a Tokens plan at $4.99/month for extra voice rounds, which is why the cheapest-price answer names it. Cardinal's Pro price is $10 a month or $75 a season, not only the monthly figure.</p>
</section>
{faq_block("Price questions", faqs, "defs")}
{sources("Sources for the prices", [
    ("p1", "https://chatgpt.com/pricing", "Free version available to everyone. Go, Plus and Pro are on the page; the FAQ also names Business and Enterprise. No dollar prices in the text we opened."),
    ("p2", "https://claude.com/pricing", "Free $0. Pro $17/mo annual or $20 monthly. Max from $100. Free plan: web search, memory, voice. Context window up to 1M, varying by model."),
    ("p3", "https://publicforumai.com/pricing", "Free tier and Premium at $9.99/mo or $79/yr."),
    ("s1", "https://debateladder.com/", "100 free credits. About one credit per minute. /pricing returned 404."),
    ("p4", "https://www.argufight.com/", "Free to start. Free forever for base debating."),
    ("p5", "https://www.argufight.com/for-schools", "Free for classrooms."),
    ("p6", "https://debatable.com/pricing", "Voice minutes and the Individual, Voice, Tokens, BYOK, Team and school prices."),
    ("p7", "https://cardinaldebate.org/", "Core tools free forever. Pro $10/month or $75 a season."),
    ("p8", "https://www.prilo.ai/nsda", "$15/month or $60/year."),
    ("p9", "https://www.hyperwriteai.com/aitools/debate-assistant", "Limited trial. Premium $19.99/mo. Ultra $44.99/mo."),
    ("p10", "https://www.hyperwriteai.com/pricing", "Premium and Ultra, including annual prices."),
    ("p11", "https://www.debatearena.app/ai-debate-practice", "Free plan and Gold. No Gold price on the page."),
    ("p12", "https://symbai.ai/pricing/", "NZ$ prices, trial, and the free read-only workspace."),
    ("p13", "https://www.kialo-edu.com/", "Free, and the site says it always will be."),
])}
"""
    style = """
body.prices{background:#fff;color:#131E33}body.prices main{width:min(1180px,calc(100% - 28px));margin:20px auto 72px}
body.prices h1{font-size:clamp(2rem,4vw,3.2rem);border-bottom:4px solid #0B1426;padding-bottom:10px}
body.prices .band{background:#FFF8DB;border-radius:0 0 24px 24px;padding:8px 18px 18px;margin:0 -8px 28px}
body.prices table{min-width:920px;font-size:.95rem}
body.prices tr.top{background:#EEF7FF}
body.prices tr.top th{font-size:1.05rem}
body.prices .row{display:flex;align-items:center;flex-wrap:wrap;gap:4px;background:#fff;border:2px solid #0B1426;border-radius:999px;padding:8px 16px;margin:0 0 14px}
body.prices dt{font-family:Fredoka,Nunito,sans-serif;margin-top:16px}
body.prices .steps{display:grid;grid-template-columns:1.2fr .8fr;gap:24px;align-items:start}
body.prices .steps ol{font-size:1.05rem}
@media(max-width:800px){body.prices .steps{grid-template-columns:1fr}}
"""
    return {
        "slug": "free-vs-paid-ai-debate-tools",
        "lang": "en",
        "body": "prices",
        "title": "Free vs Paid AI Debate Tools: What $0 Gets You (Oct 2026) | DebateOwl",
        "description": "Free and paid AI debate tools compared by price, as of October 2026: what $0 includes, what paid plans add, and the cheapest way to prep.",
        "h1": "Free vs paid AI debate tools: what you actually get",
        "question": "Is there a free AI for debate practice, and what do the paid ones cost?",
        "answer": answer,
        "faqs": faqs,
        "style": style,
        "html_body": body,
    }


def page_chat():
    answer = (
        "DebateOwl is the pick when you want the motion kept for you: a case you can read out, "
        '"If they say… we answer…" replies, and timed Sparring rounds that end in a verdict. '
        "ChatGPT and Claude both work well for debate prep, and neither is clearly better for everyone. "
        "Debaters often use ChatGPT for fast brainstorming and Claude for a longer critique of a case they paste in. "
        "What neither does by default is keep your motion, side and speech times."
    )
    faqs = [
        ("Is ChatGPT or Claude better for debate?", "Neither is clearly better for everyone. ChatGPT is a fast way to brainstorm, and Claude is a strong place to paste a long case and ask for a critique. DebateOwl is the pick when you also want the case shape, the replies and a timed round without rebuilding that setup."),
        ("Can ChatGPT run a debate round with me?", "It can role-play an opponent if you set it up. It has no built-in speech timer or verdict for debate formats, so long rounds work better in a tool built for them."),
        ("Is Claude free?", "Yes. Claude has a free plan. Pro is $20/month billed monthly, or $17/month billed annually."),
        ("Will AI make up sources?", "It can, so open every source and confirm the exact claim before it goes on a card."),
        ("What does DebateOwl add over a chatbot?", 'A saved workspace per motion, a case with "If they say… we answer…" replies, Crossfire drills and timed Sparring rounds with a verdict. The app is paid after a 3-day trial.'),
    ]
    prompts = [
        ("1. Hold the other side", "Take the other side of this motion and do not concede unless my answer beats your point. Stay on that side for the whole exchange."),
        ("2. Five things they will say", "List the 5 things the other side will say about this motion. Give each one a one-line answer I could say aloud."),
        ("3. One question at a time", "Cross-examine me with one question at a time. Wait for my answer before you ask the next question."),
        ("4. The weakest reason", "Read this argument and find the weakest reason in it. Say what a judge would still be unsure about."),
        ("5. The second speech", 'Write a second speech: no new arguments, about 2 minutes backing up our arguments, then "If they say X, we answer Y" for each of their points.'),
    ]
    blocks = "".join(f"<h3>{esc(title)}</h3><pre><code>{esc(text)}</code></pre>" for title, text in prompts)
    body = f"""
<section class="verdict">
  <h2>The pick when you want the round set up</h2>
  <p>Open a chatbot for background. Come back to DebateOwl for the motion itself. A chatbot starts every new chat without your motion, your side or your speech times; DebateOwl keeps all three in one Current Debate, with the case and its replies saved beside them. <a href="/best-ai-for-debate">The short answer</a> compares more tools. Prices for these plans are on <a href="/free-vs-paid-ai-debate-tools">free vs paid AI debate tools</a>, and the full prep sequence is <a href="/how-to-prepare-for-a-debate-with-ai">how to prepare for a debate with AI</a>.</p>
  <p class="ifyou"><strong>If you are</strong> exploring a topic you have never argued, pick ChatGPT. <strong>If you are</strong> pasting in a long case for critique, pick Claude. <strong>If you are</strong> preparing a set motion for a dated round, pick DebateOwl.</p>
  <p><a class="cta" href="/ai-debate-case-generator">Skip the prompt setup: get a case with replies ready</a></p>
  <p>{PRICE_HTML}</p>
</section>
<section>
  <h2>Where a debate tool does the setup for you</h2>
  <div class="scroll"><table>
    <caption>DebateOwl is the first column. Chatbots can imitate parts of this if you prompt them every time.</caption>
    <thead><tr><th scope="col"></th><th scope="col">DebateOwl</th><th scope="col">ChatGPT</th><th scope="col">Claude</th></tr></thead>
    <tbody>
      <tr><th scope="row">Remembers your motion, side and role</th><td>Built in: one Current Debate per motion</td><td>Only if you set it up (Projects or memory)</td><td>Only if you set it up (Projects or memory)</td></tr>
      <tr><th scope="row">Case structure</th><td>Opening, 2–4 arguments, "If they say… we answer…", closing, sources</td><td>Whatever you prompt</td><td>Whatever you prompt</td></tr>
      <tr><th scope="row">Timed rounds with a verdict</th><td>Sparring: School 4-6-6-3, LD, PF</td><td>No built-in debate timer</td><td>No built-in debate timer</td></tr>
      <tr><th scope="row">Free option</th><td>No free app plan: paid after a 3-day free trial; the debate timer is free</td><td>Free version</td><td>Free plan</td></tr>
    </tbody>
  </table></div>
  <p>If you already live in one chatbot, the <a href="/debateowl-vs-chatgpt">DebateOwl vs ChatGPT</a> page goes further. For the drills themselves, see <a href="/how-to-practice-rebuttals">rebuttal practice</a> and <a href="/how-to-cross-examine-in-debate">cross-examination</a>.</p>
</section>
<section>
  <h2>What general chatbots are good at in debate</h2>
  <p>Debate Ladder's guide to ChatGPT lists jobs a general chatbot does well: brainstorming both sides, steel-manning the other side, rebuttal drills, and questions you might be asked in cross-examination. Those are real uses. Treat the output as a draft, and verify every citation before it goes into a speech. <a href="#s2">S2</a></p>
</section>
<section>
  <h2>Where Debate Ladder's guide says they struggle</h2>
  <p>The same guide says that in long timed rounds a general chatbot drifts or softens, the difficulty is not calibrated, scoring is inconsistent, and there is no progress record. That is Debate Ladder's description of ChatGPT, not a claim we measured ourselves. A long round is easier in a tool that already knows the speech times. <a href="#s2">S2</a></p>
</section>
<section class="split">
  <div>
    <h2>ChatGPT for a fast first pass</h2>
    <p>The free version is available to everyone. Paid plans on the pricing page include Go, Plus and Pro, and the FAQ also names Business and Enterprise. Dollar prices were not shown on the page we opened. Study mode and voice are available on the free plan, with limits on voice. It is best for quick idea generation and for practising out loud with voice, once you have told it the motion again. <a href="#p1">P1</a></p>
  </div>
  <div>
    <h2>Claude for a long case you paste in</h2>
    <p>The free plan is $0. Pro is $20 a month billed monthly, or $17 a month billed annually. Max starts at $100 a month. The free plan includes web search, memory and voice mode. The context window is up to 1 million tokens, varying by model, which is useful when you paste a full case and the evidence behind it. It is best for critique of long cases. This page does not cite a benchmark. <a href="#p2">P2</a></p>
  </div>
</section>
<section>
  <h2>Prompt pack: make any chatbot argue back</h2>
  <p>These five prompts are plain-language instructions you can paste into ChatGPT or Claude. They do not replace a saved case.</p>
  {blocks}
  <p>DebateOwl's case generator writes this shape for you, including prompt 5's second speech, and you can regenerate one weak section without rewriting the rest.</p>
</section>
<section>
  <h2>A week that uses all three</h2>
  <p>Monday is for the chatbot. Paste the motion into ChatGPT and ask for the five arguments each side might run, then ask Claude to steel-man the side you understand less. Keep that list. Do not paste it into a speech yet. The job of Monday is to see the field, not to memorise a paragraph.</p>
  <p>Tuesday is DebateOwl. Start a Current Debate with the motion and your side. Generate the case and read it aloud once, slowly, before you edit anything. Mark the argument you would be unhappy to say in front of a judge. Regenerate that section only. The replies at the bottom are the start of Tuesday night: pick the two you think the other side will actually run, and say the answer out loud in one breath.</p>
  <p>Wednesday is evidence. Take one factual sentence from the case, ask Factoids for a lead, and open the source. If the source does not say what the case said, cut the sentence. A chatbot can suggest search terms for the same claim. It should not be the thing you quote.</p>
  <p>Thursday is Crossfire. Ten minutes of one question at a time is enough. Write down the question that made you pause. That pause is the line to fix in the case, not a reason to add a sixth argument.</p>
  <p>Friday is the timed round. Sparring in the format you actually debate, typed or spoken. Read the verdict for the reason it names, then change one thing. The free timer is there if you are drilling a format Sparring does not simulate, such as British Parliamentary or World Schools. Saturday is a human, if you have one. Sunday is off. The $5 month is for the weeks that look like this, not for a subscription you forget about in June.</p>
</section>
<section>
  <h2>Using a chatbot and DebateOwl together</h2>
  <p>Use the chatbot for background reading and for a first list of ideas. Use DebateOwl once the motion is chosen: generate the case, read the replies, run Crossfire, then spar at the real times.</p>
</section>
{faq_block("Questions about chatbots and debate", faqs, "cards")}
{sources("Notes on the chatbot pages", [
    ("s2", "https://debateladder.com/blog/chatgpt-for-debate-practice", "What that guide says ChatGPT is good and bad at. We rewrote its examples into plain words."),
    ("p1", "https://chatgpt.com/pricing", "Free version, Go, Plus and Pro, study mode and voice. No dollar prices on the page we opened."),
    ("p2", "https://claude.com/pricing", "Free, Pro, Max, and the free plan's web search, memory and voice. Context window up to 1M."),
])}
"""
    style = """
body.chat{background:linear-gradient(#F2EEFF,#F7FAFE 280px)}body.chat main{width:min(1040px,calc(100% - 32px));margin:28px auto 70px}
body.chat h1{font-size:clamp(2.2rem,5vw,3.6rem);max-width:16ch}
body.chat .verdict{display:grid;grid-template-columns:1.4fr .8fr;gap:18px;align-items:center}
body.chat .verdict>h2,body.chat .verdict>p:first-of-type,body.chat .verdict>p:last-child{grid-column:1/-1;margin-bottom:0}
body.chat .ifyou{background:#fff;border-radius:18px;padding:12px 16px;border:1px solid #E2D9FF}
body.chat .split{display:grid;grid-template-columns:1fr 1fr;gap:22px}
body.chat .qcards{display:grid;gap:12px}body.chat .qcards article{background:#fff;border-radius:18px;padding:14px 16px;border:1px solid #E2D9FF}
body.chat table{min-width:720px;background:#fff}body.chat th:nth-child(2),body.chat td:nth-child(2){background:#EEF7FF}
@media(max-width:800px){body.chat .verdict,body.chat .split{grid-template-columns:1fr}}
"""
    return {
        "slug": "chatgpt-vs-claude-for-debate",
        "lang": "en",
        "body": "chat",
        "title": "ChatGPT vs Claude for Debate (2026), and When to Use a Debate Tool | DebateOwl",
        "description": "ChatGPT and Claude both help with debate prep. Where each fits, prompts that make them argue back, and when a debate-specific tool saves time.",
        "h1": "ChatGPT vs Claude for debate prep",
        "question": "Is ChatGPT or Claude better for debate?",
        "answer": answer,
        "faqs": faqs,
        "style": style,
        "html_body": body,
    }


def page_teachers():
    answer = (
        "Start with DebateOwl when the debate is tomorrow and you do not want student accounts: the free timer, motion generator and printable flow sheet work in any browser and on a projector. "
        "For a club preparing a round, the DebateOwl app writes a case students can read out, with replies and timed practice, at $5/month after the trial. "
        "For every student debating an AI at once, Symbai and SchoolAI let teachers set up and monitor AI activities. "
        "For a class tournament judged by AI, ArguFight offers free private classroom tournaments. For a graded written discussion, Kialo Edu is free."
    )
    faqs = [
        ("What should I use if I want a free tool for class tomorrow?", "DebateOwl's free tools, if you want no student accounts: the timer, the motion generator and the flow sheet. For a written discussion you can grade, Kialo Edu. For AI-judged class tournaments, ArguFight for Schools is free for classrooms."),
        ("Can students debate an AI in class?", "Yes. Symbai gives each student their own AI opponent in a workspace the teacher sets up, and SchoolAI lets teachers build AI activities and watch them live. SchoolAI's pages we opened do not call it a debate product. It is a general classroom platform where you can build a debate activity as a Space."),
        ("Do students need accounts for DebateOwl's tools?", "No. The free tools run in the browser with no account. The timer saves the round in the browser, not on a server."),
        ("Is the DebateOwl app free for schools?", "No. The app is paid after a 3-day free trial. The timer, motion generator and flow sheet stay free for the whole class, with no accounts."),
        ("Can I project the debate timer?", "Yes. It has a fullscreen mode, and it can be embedded on a class site."),
    ]
    body = f"""
<section class="hero-note">
  <h2>The pick for a class with no sign-ups</h2>
  <p>If the lesson is tomorrow, DebateOwl's free tools are the pick: nothing to install, no student accounts, and a timer you can put on the projector. {PRICE_HTML} For the wider map, see <a href="/best-ai-for-debate">the short answer</a>. Topic ideas live on <a href="/debate-topics-for-students">debate topics for students</a>, and flowing is covered in <a href="/how-to-flow-in-debate">how to flow in debate</a>. A club that needs cases and rounds should read <a href="/how-to-prepare-for-a-debate-with-ai">how to prepare for a debate with AI</a>.</p>
  <p class="kicker">Checklist for tomorrow's lesson</p>
  <ul class="checklist">
    <li>Put the free timer on the projector and pick the format</li>
    <li>Draw a motion with the motion generator, or veto three</li>
    <li>Print one flow sheet per student</li>
    <li>For a club with a competition coming: try the app's 3-day trial</li>
  </ul>
  <p><a class="cta" href="/tools/debate-timer">Open the free classroom timer</a></p>
</section>
<section class="scene first">
  <p class="kicker">Scenario 1</p>
  <h2>I want to run a debate tomorrow with no sign-ups</h2>
  <p>Use DebateOwl's free tools. The timer knows seven formats (Public Forum, Lincoln-Douglas, Policy, British Parliamentary, World Schools, Asian Parliamentary and School 4-6-6-3), shows protected time, and has points-of-information knocks and prep banks. You can build a custom format, share it as a link, and embed the timer. The motion generator has 300 original motions and a 3-motion veto drill. The flow sheet prints on A4 or Letter. The timer saves the round in the browser, not on a server. There are <a href="/es/tools">Spanish</a> and <a href="/hu/tools">Hungarian</a> versions too.</p>
  <p>That is the clearest fit when you refuse to spend the lesson on accounts. Open the <a href="/tools">tools</a>, the <a href="/tools/debate-motion-generator">motion generator</a> and the <a href="/tools/debate-flow-sheet">flow sheet</a> from any laptop on the projector.</p>
</section>
<section class="scene">
  <p class="kicker">Scenario 2</p>
  <h2>I want every student to debate an AI at once</h2>
  <h3>Symbai, when each student needs a workspace</h3>
  <p>Symbai is best for a teacher who wants each student in their own debate workspace. Teachers create a debate and send each student a workspace, with settings such as difficulty and access to the AI tutor. There is a visual debate tree. Classroom controls let you disable the AI tutor for assessments, restrict copy-paste and lock after deadlines. The pricing page lists a dashboard with student analytics, and the homepage says progress is trackable over time. Teacher plans run from NZ$9.99 a month (up to 7 students) to NZ$79.99 a month (up to 100), and those buttons say "Try 2 Months For Free". <a href="#p12">P12</a> <a href="#p14">P14</a></p>
  <h3>SchoolAI, when you already use a classroom AI</h3>
  <p>SchoolAI is best for a school that already wants a general AI classroom platform, not a debate-only product. Its pages we opened do not use the word debate. Teachers design and manage AI Spaces. Mission Control shows what every student is doing in real time while a Space is active. Its listed compliance is FERPA, COPPA, SOC 2 Type 2 and 1EdTech certified. There is a Free Trial with 5 Space launches per year, plus Pro and Scale plans for schools. The homepage says teachers can try SchoolAI free. Dollar prices for Pro and Scale were not on the pricing page we opened. <a href="#p15">P15</a> <a href="#p16">P16</a></p>
</section>
<section class="scene">
  <p class="kicker">Scenario 3</p>
  <h2>I want a class tournament with a judge</h2>
  <p>ArguFight for Schools is best for a private class tournament judged by AI, at no charge. It offers private, invite-only tournaments in bracket, championship and king-of-the-hill formats. Every match is judged 0–100 with written reasoning. Students get an Elo, a history and per-round feedback. It lists 26 languages, and getting started is free for classrooms. The schools page describes the tournaments and the written reasoning. The main site also lets you dictate an argument with speech-to-text in Chrome, Edge and the mobile app, so the product is not only typed. <a href="#p5">P5</a> <a href="#p4">P4</a></p>
</section>
<section class="scene">
  <p class="kicker">Scenario 4</p>
  <h2>I want a written discussion I can grade</h2>
  <p>Kialo Edu is best for a graded written discussion, and it is free. Students write pros and cons under each other's points as an interactive map. There is an anonymous mode. Discussions are saved, so you can grade them later. It works with Google Classroom, Microsoft, Moodle, Blackboard, Clever and D2L. The site says it is free and always will be. <a href="#p13">P13</a></p>
</section>
<section class="scene club">
  <p class="kicker">Scenario 5</p>
  <h2>My debate club is preparing for a competition</h2>
  <p>This is where the DebateOwl app is the pick. Students get a case they can read out, with "If they say… we answer…" replies, Crossfire drills and timed Sparring in School 4-6-6-3, Lincoln-Douglas or Public Forum, in English, Spanish or Hungarian. There is no teacher dashboard. It is built for the students who are preparing, not for a screen that shows every student at once. The app is paid after a 3-day free trial.</p>
  <p>If you also want roles, timing and judges' score sheets for a live in-class debate, with an AI analysis from uploaded audio, Camelot for Debate does that in Italian and English. <a href="#p17">P17</a></p>
</section>
<section>
  <h2>Before you use any AI tool with students</h2>
  <ol class="privacy">
    <li>Read the age requirements.</li>
    <li>Read where the data goes.</li>
    <li>See whether students need accounts.</li>
    <li>Look for teacher controls, if the lesson needs them.</li>
    <li>Read what the tool itself says about student data.</li>
  </ol>
  <p>DebateOwl's free tools need no account, and the timer saves the round in the browser, not on a server. The app, once a student signs in, keeps cases and rounds behind that account.</p>
</section>
{faq_block("Questions from teachers", faqs, "h3")}
{sources("Sources checked for this classroom guide", [
    ("p12", "https://symbai.ai/pricing/", "Teacher prices in NZ dollars, the trial, and the read-only workspace."),
    ("p14", "https://symbai.ai/", "Per-student workspaces, the debate tree, and classroom controls. The same controls are listed at https://symbai.ai/features/."),
    ("p15", "https://schoolai.com/pricing", "Free Trial with 5 Space launches a year, Pro, Scale, Mission Control, and the compliance list."),
    ("p16", "https://schoolai.com/", "Teachers can try SchoolAI free. The pages we opened do not use the word debate."),
    ("p5", "https://www.argufight.com/for-schools", "Free private classroom tournaments."),
    ("p4", "https://www.argufight.com/", "Speech-to-text, and free for base debating."),
    ("p13", "https://www.kialo-edu.com/", "Free written discussions and the integrations."),
    ("p17", "https://www.camelot.vote/en/debate", "Roles, timing, judge sheets, and AI analysis from uploaded audio, in Italian and English."),
])}
"""
    style = """
body.teach{background:#F7FAFE}body.teach main{width:min(860px,calc(100% - 28px));margin:0 auto 64px}
body.teach h1{font-size:clamp(2.3rem,6vw,3.8rem);padding-top:28px}
body.teach .hero-note{background:#0B1426;color:#EEF4FF;margin:0 -16px;padding:8px 22px 22px;border-radius:0 0 32px 32px}
body.teach .hero-note a{color:#FCE48A}
body.teach .checklist{list-style:none;padding:0;margin:4px 0 12px}body.teach .checklist li{margin:6px 0}body.teach .checklist li::before{content:"";display:inline-block;width:.9em;height:.9em;border:2px solid #FCE48A;border-radius:4px;margin-right:10px;vertical-align:-1px}
body.teach .hero-note .kicker{color:#FCE48A}
body.teach .scene{padding:8px 0 4px;border-top:1px solid #CDD7E4}
body.teach .scene.first{border-top:none;background:#fff;margin:18px -16px 0;padding:8px 22px 18px;border-radius:24px}
body.teach .kicker{font-family:Fredoka,Nunito,sans-serif;color:#0556D6;margin-bottom:0}
body.teach .club{background:#FFF8DB;margin:0 -16px;padding:8px 22px 18px;border-radius:24px}
body.teach .privacy{font-size:1.15rem}
"""
    return {
        "slug": "ai-debate-tools-for-teachers",
        "lang": "en",
        "body": "teach",
        "title": "AI Debate Tools for Teachers: 5 Classroom Scenarios | DebateOwl",
        "description": "Which AI debate tool fits your classroom: no-signup timers, AI opponents for every student, class tournaments, graded discussion and club prep.",
        "h1": "AI debate tools for teachers",
        "question": "What should I use to run debates in class?",
        "answer": answer,
        "faqs": faqs,
        "style": style,
        "html_body": body,
    }


def page_prep():
    answer = (
        "Use DebateOwl for the slow parts you would rather not invent from a blank page: read the motion, draft two to four arguments with evidence, "
        'list what the other side will say and write an "If they say… we answer…" reply to each, then practise at real speech times. '
        "Keep the judgement calls for yourself, and check every source before it goes into a speech. A general chatbot can do pieces of this if you prompt it."
    )
    steps = [
        ("Read the motion", "Open Brainstorm on the Current Debate and ask what each side has to prove.", "Paste the motion and ask it to define the terms and say what each side must prove.", "/debate-motion-analysis"),
        ("Gather sources", "Use Factoids for one claim and the Library for sources you already trust.", "Ask for the source and the year of every fact, then open each one. Cut anything you cannot find.", "/debate-evidence-finder"),
        ("Draft the arguments", "The case generator writes the opening, two to four arguments, and why each matters.", "Ask for a point, an explanation, evidence with a source and year, and why it matters. Do not accept a wall of text.", "/ai-debate-case-generator"),
        ("Predict the other side", "Run Attack on your case, and read the case's own \"If they say…\" lines.", "Ask for the strongest case against you, written so a fan of that side would agree.", "/how-to-practice-rebuttals"),
        ("Write the replies", 'The case already includes "If they say X, we answer Y" blocks. Regenerate one weak block if you need to.', "Demand one short answer per opposing point, in words you could say aloud.", ""),
        ("Drill the questions", "Crossfire asks one question at a time, or lets the AI question you.", "Say you will answer one question at a time and that it should wait.", "/how-to-cross-examine-in-debate"),
        ("Practise at real times", "Sparring runs School 4-6-6-3, Lincoln-Douglas or Public Forum and ends with a verdict. For every other format, use the free timer.", "You keep the clock yourself. The free timer already knows seven formats.", "/tools/debate-timer"),
    ]
    rendered = []
    howto_steps = []
    for index, (name, owl, any_ai, href) in enumerate(steps, start=1):
        link = f' See <a href="{esc(href)}">the related guide</a>.' if href else ""
        rendered.append(
            f'<li id="step-{index}"><h3>{index}. {esc(name)}</h3>'
            f"<p><strong>In DebateOwl.</strong> {owl}</p>"
            f"<p><strong>With any AI.</strong> {esc(any_ai)}{link}</p></li>"
        )
        howto_steps.append({
            "@type": "HowToStep",
            "position": index,
            "name": f"{index}. {name}",
            "text": f"In DebateOwl. {owl} With any AI. {any_ai}",
        })
    faqs = [
        ("Can AI help me prepare for a debate?", "Yes, as long as you treat what it gives you as a draft. Use it for the slow parts, and keep the judgement calls. Check every source before it goes into a speech."),
        ('What should a second speech include?', 'No new arguments: about two minutes backing up your team\'s arguments, then about four minutes of "If they say X, we answer Y" replies.'),
        ("Is using AI for debate prep cheating?", "Prep is usually fine, but most leagues restrict electronics or AI during the round itself. Check your league's rules."),
        ("How do I stop the AI making up evidence?", "Ask for the source and year of every fact, open each one, and cut anything you can't find."),
        ("Which AI should I use?", "For this plan, DebateOwl is the pick, because the modes match the steps, and it is paid after a 3-day trial. A wider comparison is on the short-answer page linked above."),
    ]
    howto = {
        "@type": "HowTo",
        "name": "How to prepare for a debate with AI",
        "description": answer,
        "step": howto_steps,
    }
    body = f"""
<section class="rail">
  <h2>Seven steps, DebateOwl first</h2>
  <p>DebateOwl fits at step 3: once you know what each side must prove, the case generator drafts the arguments and the "If they say…" replies together, and Sparring times the round at step 7. The wider comparison is <a href="/best-ai-for-debate">the short answer</a>. If you are choosing between chatbots first, read <a href="/chatgpt-vs-claude-for-debate">ChatGPT vs Claude for debate</a>. A head-to-head with a ranked voice game is <a href="/debateowl-vs-debate-ladder">DebateOwl vs Debate Ladder</a>. Teachers running the class itself should read <a href="/ai-debate-tools-for-teachers">AI debate tools for teachers</a>. Case structure in general is in <a href="/how-to-write-a-debate-case">how to write a debate case</a>.</p>
  <p class="row">{TICK}<strong>Where the app saves the most time:</strong> steps 3 to 5 come back as one draft you can read aloud.</p>
  <ol class="steps">{''.join(rendered)}</ol>
  <p><a class="cta" href="/app">Generate your first case in the 3-day trial</a></p>
  <p>{PRICE_HTML}</p>
</section>
<section id="worked-example" class="sheet">
  <h2>A worked second speech: phones in class</h2>
  <p>Motion: "This House would ban phones in class." The same motion appears on the DebateOwl homepage. Nothing below is a real study. The brackets are placeholders you replace after you have opened a source.</p>
  <p><strong>Opening line.</strong> Today we will show two arguments that prove phones belong outside class.</p>
  <h3>Argument 1, in our team's first speech</h3>
  <p><strong>Notifications break concentration.</strong> Explanation: a student who looks at a message then spends the next explanation catching up has missed the step the rest of the room is on. Evidence: [a study on refocus time: name the source and year you verified]. Why it matters: a lesson only works if the room is in it together.</p>
  <h3>Argument 2, so the second speech has two points to back up</h3>
  <p><strong>Class is a shared conversation.</strong> Explanation: when some students are on their phones, the people speaking lose the listeners the lesson depends on. Evidence: [a classroom observation you have checked: name the source and year]. Why it matters: a discussion you cannot join is not a discussion.</p>
  <h3>Second speech, about 6 minutes</h3>
  <p><strong>Part 1, about 2 minutes, reinforce.</strong> No new arguments. Back up the first argument with one fresh example: the student who glances down and then asks a question the room already answered. Back up the second with one fresh example: a partner task where one person is scrolling and the other is talking to an empty chair.</p>
  <p><strong>Part 2, about 4 minutes, "If they say X, we answer Y".</strong></p>
  <ol>
    <li>If they say "Students need phones for emergencies", we answer: the school office can call home, and a phone in a bag at the office covers the same emergency without a screen on every desk.</li>
    <li>If they say "Phones are learning tools", we answer: when a task actually needs a device, the class can share a computer or a set of tablets, which is different from every student having a private phone out all period.</li>
    <li>If they say "A ban is unenforceable", we answer: schools already collect items that distract, and a basket at the door is easier to see than a rule about using a phone well.</li>
    <li>If they say "Students must learn self-control", we answer: self-control is practised when the distraction is not buzzing during the explanation. The lesson is the place to pay attention.</li>
    <li>If they say "Parents want to reach their children", we answer: parents can call the office, and students can check messages at lunch. A class period is short enough that a delay is not the same as being unreachable.</li>
  </ol>
  <p><strong>Closing line.</strong> That is why phones belong outside the lesson: the class stays on the work, and a real emergency still has a way through.</p>
  <p>This is the shape DebateOwl's case generator produces for the second-speaker role. Every case also ends with the sources it used.</p>
</section>
<section>
  <h2>What you still decide yourself</h2>
  <p>The plan above will hand you a full draft. The round is still yours. Three decisions should not be delegated, even when the draft sounds confident.</p>
  <p>The first is the motion's meaning. If "ban" in your motion means a legal prohibition and the draft treats it as a classroom norm, the whole case is about the wrong world. Read the actor, the action and the word that sets the strength of the claim before you fall in love with an argument. Brainstorm will offer readings. You pick the one a judge would accept without a fight.</p>
  <p>The second is which argument you are willing to live on. Two to four arguments is the shape. Three of them can be true and only one of them can be the thing you return to in the last speech. If you cannot say, in one sentence, why that argument matters more than the other side's best point, you do not yet have a case. You have a list.</p>
  <p>The third is the source. A named year is not a check. Open the page, find the sentence, and see whether it is about your claim or about a neighbouring one. If you cannot find it, the sentence leaves the speech. This is the same rule for DebateOwl, for ChatGPT and for Claude. Active Grounding, on the paid plan, is a research aid. It is not a substitute for the tab you open yourself.</p>
  <p>A practical test before you close the laptop: give the second speech to an empty room, at about six minutes, with a timer. If part 1 starts a new argument, stop and cut it. If part 2 answers a point the other side would never say, replace that block with one they would. If you run out of time before the closing line, the reinforcement was too long. The free timer will do this drill for any format. Sparring will do it against an opponent for School 4-6-6-3, Lincoln-Douglas and Public Forum, and it will tell you a reason at the end. Change one thing from that reason. Then stop.</p>
  <p>Teachers who want the class to do this without accounts can put the timer on a projector and print the flow sheet. Students who are preparing a dated round should be in the app, because that is where the case, the replies and the timed round stay attached to one motion. Both can be true in the same week.</p>
  <p>If you only have twenty minutes, do the smallest version. Read the motion, generate the case, say the second speech's reply blocks once, and open one source. That is a complete prep, not a sketch you feel guilty about. The rest of the week can add the timed round.</p>
</section>
{faq_block("Questions about using AI for prep", faqs, "h3")}
{sources("Notes for this prep plan", [
    ("p1", "https://chatgpt.com/pricing", "A free chatbot is enough for the 'with any AI' lines. The free version is available to everyone."),
    ("p2", "https://claude.com/pricing", "Claude's free plan is the other general chatbot this plan allows."),
])}
"""
    style = """
body.prep{background:#fff}body.prep main{width:min(820px,calc(100% - 36px));margin:24px auto 72px}
body.prep h1{font-size:clamp(2.2rem,5vw,3.5rem)}
body.prep .steps{list-style:none;padding:0;margin:0;border-left:3px solid #0A6FF0}
body.prep .steps li{padding:0 0 8px 22px;position:relative}
body.prep .steps li::before{content:"";position:absolute;left:-8px;top:8px;width:13px;height:13px;border-radius:50%;background:#0A6FF0}
body.prep .row{display:flex;align-items:center;gap:4px;border-top:2px solid #0A6FF0;border-bottom:2px solid #0A6FF0;padding:10px 0;margin:14px 0}
body.prep .sheet{background:#FFF8DB;border:3px solid #0B1426;border-radius:8px;padding:8px 22px 18px;margin-top:28px}
body.prep .sheet ol li{margin:8px 0}
"""
    page = {
        "slug": "how-to-prepare-for-a-debate-with-ai",
        "lang": "en",
        "body": "prep",
        "title": "How to Prepare for a Debate with AI: 7 Steps and a Worked Example | DebateOwl",
        "description": 'A 7-step plan to prep a debate with AI: read the motion, build arguments, predict the other side, write "If they say… we answer…" replies and spar.',
        "h1": "How to prepare for a debate with AI",
        "question": "How do I use AI to prepare for a debate?",
        "answer": answer,
        "faqs": faqs,
        "style": style,
        "html_body": body,
    }
    page["howto"] = howto
    return page


def page_pf():
    answer = (
        "For Public Forum, start with DebateOwl when you want a case you can read out, "
        '"If they say… we answer…" replies, crossfire drills, and Sparring at the 4-4-3-2 speech times, '
        "for $5/month after a 3-day free trial. PublicForumAI is built only for PF and has free practice rounds. "
        "Cardinal focuses on finding and cutting evidence. Prilo covers PF, Lincoln-Douglas and Policy with a cross-examination simulator."
    )
    faqs = [
        ("What should I use for Public Forum?", "Start with DebateOwl if you want the case, the replies, crossfire drills and timed speeches in one place. PublicForumAI is the free, PF-only practice round. Cardinal is the evidence tool. Prilo is the circuit tool with a cross-examination simulator and flowing drills."),
        ("Is there a free AI for PF practice?", "Yes. PublicForumAI's free plan has 3 full practice rounds a month, and Cardinal lists five free tools, described as free forever."),
        ("Can AI do crossfire practice?", "Yes. DebateOwl has timed Crossfire drills, and Prilo has a 3-minute cross-examination simulator. PublicForumAI says it doesn't yet have a crossfire feature, \"it's in the works\"."),
        ("Can I use AI during a PF round?", "PublicForumAI itself says its tools are for practice, not for live rounds. Check your league's rules."),
        ("How much does DebateOwl cost for PF?", "Pro is $5/month + tax after a 3-day free trial, with no permanent free plan. The PF timer with prep banks and the flow sheet are free."),
    ]
    rows = [
        ("Constructive (4 min)", "A clear two-argument case with evidence", "DebateOwl case generator. PublicForumAI's case writer. Cardinal's card cutter."),
        ("Crossfire (3 min, three times)", "Fast questions and answers", 'DebateOwl Crossfire drills. Prilo\'s 3-minute cross-examination simulator. PublicForumAI says it doesn\'t yet have a crossfire feature, "it\'s in the works".'),
        ("Rebuttal (4 min)", "Answers to their case", 'DebateOwl "If they say… we answer…" replies, plus Attack. Prilo\'s AI rebuttal drafts.'),
        ("Summary (3 min) and final focus (2 min)", "Collapse onto the points that decide the round", "DebateOwl's Sparring verdict and Ask coach. PublicForumAI's full rounds, with a judge ballot and tech or lay feedback."),
        ("Evidence", "Real sources you can open", "Cardinal searches the web and opencaselist and cuts cards. PublicForumAI Premium adds real sourced evidence with working links. DebateOwl Factoids names sources you still have to check."),
        ("Flowing", "A record of every argument", "PublicForumAI's AI Flow, with speech recognition. Prilo's flowing practice. DebateOwl's free printable flow sheet."),
    ]
    trs = "".join(f"<tr><th scope=\"row\">{esc(a)}</th><td>{esc(b)}</td><td>{esc(c)}</td></tr>" for a, b, c in rows)
    body = f"""
<section class="order">
  <h2>The pick for a Public Forum case and a timed round</h2>
  <p>DebateOwl is the first name in the speech table because it covers the case you read, the replies, the crossfire drill and the timed speeches together. {PRICE_HTML} The rules of the format, without the tool comparison, are on <a href="/public-forum-debate">Public Forum debate</a>. Question drills are in <a href="/how-to-cross-examine-in-debate">how to cross-examine</a>, and weighing is in <a href="/how-to-weigh-in-debate">how to weigh</a>. The wider list is <a href="/best-ai-for-debate">the short answer</a>. Prices are on <a href="/free-vs-paid-ai-debate-tools">free vs paid</a>.</p>
  {wins(["A PF case you can read out", '"If they say… we answer…" replies', "Crossfire as its own drill", "Sparring at 4-4-3-2, then $5/month"])}
  <p>Sparring runs the PF speeches at those times and ends with a judged verdict. It does not insert the three crossfire periods. Practise those in Crossfire. The free <a href="/tools/debate-timer">timer</a> does run the crossfires and the prep banks, and the <a href="/tools/debate-flow-sheet">flow sheet</a> prints the columns. <a href="/debate-clash-points">Clash</a> is where you decide which argument the summary should keep.</p>
  <p><a class="cta" href="/app">Spar a full PF round at 4-4-3-2 times</a></p>
</section>
<section>
  <h2>Speech by speech</h2>
  <div class="scroll"><table>
    <caption>NSDA times, as the Public Forum guide on this site states them. DebateOwl is named first wherever it does the job.</caption>
    <thead><tr><th scope="col">PF speech</th><th scope="col">What you need</th><th scope="col">Tools that help</th></tr></thead>
    <tbody>{trs}</tbody>
  </table></div>
</section>
<section class="profiles">
  <h2>DebateOwl for Public Forum</h2>
  <p>Best for students who want case writing, replies, crossfire and full speech rounds in one place at a low price. The case is an opening, two to four arguments with evidence and why each matters, the replies, a closing line and the sources. For PF, the first constructive carries the arguments, and the rebuttal is where you answer theirs without pretending a new argument belongs there. The app is in English, Spanish and Hungarian. The free timer has prep banks. The app is paid after the 3-day trial.</p>
  <h2>PublicForumAI, the PF-only practice round</h2>
  <p>Best for PF debaters who want a free, PF-only practice round. It was started in 2024 by students on a high school debate team in New York City. The free plan has 3 rounds a month and 5 cases a month. Premium is $9.99 a month or $79 a year. A round takes about 35 minutes including prep, without crossfire. There are middle school and high school difficulty levels. Its tools are for practice, not for live rounds. <a href="#p3">P3</a> <a href="#p18">P18</a></p>
  <h2>Cardinal, for the cards</h2>
  <p>Best for evidence work. Five tools are marked free, and the site calls the core tools free forever. Pro is $10 a month or $75 a season. Card search runs over the web and opencaselist. <a href="#p7">P7</a></p>
  <h2>Prilo, for circuit drills</h2>
  <p>Best for NSDA-circuit debaters who want cross-examination and flowing drills. It is $15 a month or $60 a year, and it covers Lincoln-Douglas, Public Forum and Policy, with a 3-minute cross-examination simulator and speech analytics. <a href="#p8">P8</a></p>
</section>
<section class="mini">
  <h2>A tiny PF reply block</h2>
  <p>This is an example resolution, not a claim about the current NSDA topic: "Resolved: Public schools should give students one homework-free weekend a month."</p>
  <p><strong>One argument, on the proposition.</strong> A weekend with no homework gives students time to sleep and to show up on Monday able to listen. The reason is ordinary: homework that fills both days crowds out the rest a student needs before a week of class. Why it matters: a tired first speech, in class or in a round, is a worse speech.</p>
  <ol>
    <li>If they say "Students will fall behind", we answer: one weekend a month is not the end of practice, and the other weekends still carry the load.</li>
    <li>If they say "Homework is how you learn", we answer: learning also needs a break, and a single protected weekend does not delete the assignments on the other days.</li>
    <li>If they say "Families will fill the time with more activities", we answer: that is the family's choice, and the school's job is not to occupy every hour so the choice never comes up.</li>
  </ol>
</section>
{faq_block("Public Forum questions", faqs, "details")}
{sources("Sources for the PF tools", [
    ("p18", "https://publicforumai.com/", "PF only, started in 2024 by NYC high school debaters, no crossfire feature yet, about 35 minutes, tech or lay judge, not for live rounds."),
    ("p3", "https://publicforumai.com/pricing", "Free plan and Premium at $9.99/mo or $79/yr."),
    ("p7", "https://cardinaldebate.org/", "Card search, five free tools, Pro at $10/month or $75 a season."),
    ("p8", "https://www.prilo.ai/nsda", "PF, LD and Policy, the 3-minute simulator, $15/month or $60/year."),
])}
"""
    style = """
body.pf{background:#F7FAFE}body.pf main{width:min(900px,calc(100% - 32px));margin:20px auto 64px}
body.pf h1{font-size:clamp(2.4rem,6vw,4rem);color:#0B1426}
body.pf .order{background:#fff;border-radius:28px;padding:8px 20px 16px;box-shadow:0 16px 40px rgba(11,20,38,.06)}
body.pf .wins{display:flex;flex-wrap:wrap;gap:8px 16px;list-style:none;padding:0}
body.pf .wins li{display:flex;align-items:center}
body.pf table{min-width:680px}
body.pf .profiles h2{margin-top:1.6rem;padding-top:12px;border-top:4px solid #FFC414}
body.pf .profiles h2:first-child{border-top-color:#0A6FF0}
body.pf .mini{background:#0B1426;color:#EEF4FF;border-radius:24px;padding:8px 20px 18px}
body.pf .mini a{color:#FCE48A}
"""
    return {
        "slug": "best-ai-for-public-forum",
        "lang": "en",
        "body": "pf",
        "title": "Best AI for Public Forum Debate (2026): Tools by Speech | DebateOwl",
        "description": "AI tools for Public Forum debate, compared speech by speech: cases, rebuttals, crossfire, summary and final focus, with prices as of October 2026.",
        "h1": "Best AI for Public Forum debate",
        "question": "What should I use for Public Forum debate?",
        "answer": answer,
        "faqs": faqs,
        "style": style,
        "html_body": body,
    }


def page_hu():
    answer = (
        "Ha konkrét indítványra készülsz iskolai vagy versenyvitára, a DebateOwl a kiindulás: felolvasható esetet ír "
        "„Ha azt mondják… erre azt feleljük…” válaszokkal, és időzített gyakorlófordulót futtat, magyarul is. "
        "Ötleteléshez és háttérolvasáshoz egy általános MI-asszisztens, például a ChatGPT vagy a Claude is jó, mindkettőnek van ingyenes csomagja."
    )
    case = (
        "A DebateOwl úgy írja meg az esetet, ahogy az iskolai vitázók készülnek: nyitás, két–négy érv, mindegyik magyarázattal, "
        "bizonyítékkal és azzal, hogy miért fontos, „Ha azt mondják… erre azt feleljük…” válaszok, egy zárómondat és a felhasznált források."
    )
    r2 = "Nem hoz új érvet: körülbelül két percig megerősíti a csapat érveit, utána körülbelül négy percig »Ha azt mondják X-et, erre azt feleljük Y« válaszokat mond."
    cost = HU_PRICE + " A Claude-nak van ingyenes, $0-s csomagja. A ChatGPT ingyenes változata mindenki számára elérhető."
    during = "Felkészüléshez igen. A vita közben a verseny szabályait ellenőrizd: a legtöbb liga korlátozza az elektronikát és az MI-t a forduló alatt."
    account = "Nem, a /hu/tools eszközök fiók nélkül működnek."
    question = "Melyik MI mire jó a vitára készülésben?"
    faqs = [
        (question, answer),
        ("Mit csinál a második beszélő (R2)?", r2),
        ("Mennyibe kerül?", cost),
        ("Lehet MI-t használni a vita közben?", during),
        ("Kell fiók az ingyenes eszközökhöz?", account),
    ]
    body = f"""
<section class="lead-block">
  <h2>Mit tartalmaz egy DebateOwl-eset?</h2>
  <p>{esc(case)}</p>
  <p>A többi eszköz rövid angol összevetése: <a href="/best-ai-for-debate">the short answer</a>. Itthon a kiindulás a felolvasható eset, a válaszok és az időzített forduló. Ha az a kérdés, melyik eszközt válaszd, arra külön oldal felel, kérdésekkel és válaszokkal: <a href="/hu/melyik-ai-a-legjobb-vitara">melyik AI a legjobb vitára</a>.</p>
  {wins(["Felolvasható eset", "„Ha azt mondják… erre azt feleljük…”", "Időzített Vitapárbaj", "Ingyenes eszközök, aztán havi $5"])}
  <p><a class="cta" href="/app">Próbáld ki 3 napig ingyen</a></p>
</section>
<section>
  <h2>Mit csinál a második beszélő (R2)?</h2>
  <p>{esc(r2)}</p>
  <p>Példa a „Tiltsuk be a telefont az órákon” indítványra, számok nélkül. Ha azt mondják, hogy vészhelyzetben kell a telefon, erre azt feleljük: az iskola titkársága fel tudja hívni a szülőt, a telefon pedig a titkárságon is ott lehet, nem az órán. Ha azt mondják, hogy a telefon tanulási eszköz, erre azt feleljük: ha a feladat tényleg eszközt kér, az osztály közös gépe is elég, és az nem csipog minden diáknál a magyarázat közben.</p>
</section>
<section>
  <h2>Milyen formátumokban lehet gyakorolni?</h2>
  <p>Vitapárbaj: iskolai 4-6-6-3, Lincoln-Douglas és Public Forum, a végén bírói döntéssel. Az időmérő hét formátumot ismer, köztük azokat is, amelyekhez nincs teljes szimulált forduló. A többi formátumra a felkészítő eszközök valók. Beszélni és gépelni is lehet.</p>
</section>
<section>
  <h2>Mennyibe kerül?</h2>
  <p>{esc(cost)}</p>
  <h3>Kell fiók az ingyenes eszközökhöz?</h3>
  <p>{esc(account)}</p>
</section>
<section>
  <h2>Lehet MI-t használni a vita közben?</h2>
  <p>{esc(during)}</p>
</section>
<section>
  <h2>Mire való melyik, egymás mellett</h2>
  <div class="scroll"><table>
    <caption>A DebateOwl az első oszlop. Az általános asszisztens a háttérolvasásé.</caption>
    <thead><tr><th scope="col"></th><th scope="col">DebateOwl</th><th scope="col">Általános MI-asszisztens</th><th scope="col">Ingyenes eszközök</th></tr></thead>
    <tbody>
      <tr><th scope="row">Mire jó</th><td>Konkrét indítvány: felolvasható eset és időzített gyakorlóforduló</td><td>Ötletelés és háttérolvasás</td><td>Időmérő, tételgenerátor, jegyzetlap és beszédidő-kalkulátor</td></tr>
      <tr><th scope="row">Ára</th><td>3 napos próba, utána havi $5. Nincs ingyenes csomag.</td><td>A ChatGPT ingyenes változata mindenkié. A Claude csomagja $0.</td><td>Ingyenes, fiók nélkül</td></tr>
    </tbody>
  </table></div>
  <p>Az eszközök: <a href="/hu">a magyar kezdőlap</a>, <a href="/hu/tools">az összes ingyenes eszköz</a>, <a href="/hu/tools/vitaidomero">a vitaidőmérő</a>, <a href="/hu/tools/vitatetel-generator">a tételgenerátor</a>, <a href="/hu/tools/jegyzetlap">a jegyzetlap</a> és <a href="/hu/tools/beszedido-kalkulator">a beszédidő-kalkulátor</a>.</p>
</section>
<section>
  <h2>Hogyan néz ki egy felkészülő este?</h2>
  <p>Először olvasd el az indítványt. Ki cselekszik, és mit kérnek tőle? Egy tiltás más vita, mint egy szabályozás. A DebateOwlban ezt a Brainstorm módban teszed fel, a saját aktuális vitádhoz kötve, nem egy üres csevegésben.</p>
  <p>Utána jön az eset. A generátor megírja a nyitást, a két–négy érvet, a magyarázatot, a bizonyíték helyét és azt, hogy miért fontos. A bizonyíték mellé kérd a forrás nevét és évét, majd nyisd meg. Amit nem találsz, az nem mehet bele a beszédbe. Egy általános asszisztens ugyanerre képes, ha minden alkalommal újra bemásolod az indítványt. A DebateOwlban az indítvány megmarad.</p>
  <p>A második beszélő beszédét érdemes hangosan elpróbálni. Két perc megerősítés, négy perc válasz. Ha az első részben új érv bukkan fel, vágd ki. Ha a válasz olyan pontra felel, amit a másik oldal úgysem mondana, cseréld le egy valószínűbbre. A Vitapárbaj ugyanezt időre teszi, iskolai 4-6-6-3, Lincoln-Douglas vagy Public Forum formában, és a végén indokolt döntést ad. A többi formátumhoz az ingyenes időmérő a helyes eszköz.</p>
  <p>A hét végén egy ember, ha van. Az MI a lassú részt veszi le: a vázlatot, a válaszokat, az ismétlést. Azt, hogy melyik érvre építed az utolsó beszédet, te döntöd el. Ez a kiindulás egy iskolai vagy versenyvitára, magyarul is.</p>
  <p>Ha csak húsz perced van, a rövid változat is elég. Olvasd el az indítványt, generálj egy esetet, mondd el hangosan a második beszélő válaszait, és nyiss meg egy forrást. Ez már felkészülés, nem vázlat, ami miatt szoronganod kellene. Az időzített fordulót másnap is ráérsz.</p>
  <p>Amit nem érdemes az MI-re bízni: a definíciót, ha a vita attól függ, és azt a mondatot, amit a bíró az utolsó percben megjegyez. A zárómondatot te írd meg, a saját szavaiddal, akkor is, ha a többi részt a generátor adta. A forrást pedig te nyitod meg. A név és az év a lapon még nem ellenőrzés.</p>
</section>
{sources("Források", [
    ("p1", "https://chatgpt.com/pricing", "Az ingyenes változat mindenki számára elérhető."),
    ("p2", "https://claude.com/pricing", "Ingyenes csomag, $0."),
])}
"""
    style = """
body.hu{background:#fff}body.hu main{width:min(680px,calc(100% - 32px));margin:36px auto 80px}
body.hu h1{font-size:clamp(2rem,6vw,3.1rem)}
body.hu h2{font-size:clamp(1.45rem,3vw,1.9rem);margin-top:2rem}
body.hu .lead-block{background:#EEF7FF;border-radius:28px;padding:8px 20px 16px}
body.hu .wins{list-style:none;padding:0}body.hu .wins li{display:flex;align-items:center;margin:6px 0}
body.hu table{min-width:560px}
"""
    return {
        "slug": "hu/mi-vitafelkeszules",
        "lang": "hu",
        "body": "hu",
        "modified": "2026-10-30",
        "english_disclosure": True,
        "title": "Vitafelkészülés MI-vel: melyik eszköz mire jó? | DebateOwl",
        "description": "Melyik MI segít a vitára készülésben? Általános MI-asszisztens, vitagyakorló alkalmazás vagy ingyenes eszközök: mire jó melyik, magyarul.",
        "h1": "Vitafelkészülés mesterséges intelligenciával",
        "question": question,
        "answer": answer,
        "faqs": faqs,
        "style": style,
        "html_body": body,
    }


def page_es():
    answer = (
        "DebateOwl sirve para preparar un debate concreto: te da un caso que puedes leer en voz alta, "
        "respuestas «Si dicen… respondemos…» y rondas cronometradas contra una IA, con la app y lo que escribe la IA en español. "
        "Para sacar ideas sin pagar bastan ChatGPT o Claude, y para entrenar réplicas cortas en español, Socrátiko ofrece debates gratis cada semana."
    )
    faqs = [
        ("¿La IA de DebateOwl escribe en español?", "Sí. Con la app en español, el caso, las respuestas, el oponente de Sparring y el coach escriben en español. La app también está en inglés y en húngaro."),
        ("¿Hay alguna IA gratis para preparar un debate?", "Sí. A octubre de 2026, ChatGPT tiene una versión gratis para todos, Claude un plan gratis y Socrátiko 3 debates gratis cada semana. El cronómetro, el generador de mociones, la hoja de flujo y la calculadora de tiempo de DebateOwl son gratis y sin cuenta; la app es de pago cuando acaba la prueba de 3 días."),
        ("¿Puedo usar la IA durante el debate?", "Casi nunca. La mayoría de las ligas y torneos limitan los dispositivos y la IA durante la ronda. Úsala para preparar y revisa el reglamento de tu competición."),
        ("¿La IA se inventa fuentes?", "Puede pasar. Abre cada fuente y comprueba que dice exactamente lo que vas a citar. Si no la encuentras, esa frase no entra en tu discurso."),
        ("¿Qué formatos puedo practicar en una ronda completa?", "Sparring simula rondas del formato escolar 4-6-6-3, Lincoln-Douglas y Public Forum. Para Parlamentario Británico, World Schools y otros formatos tienes las herramientas de preparación y el cronómetro gratis, no una ronda simulada."),
    ]
    rows = [
        ("DebateOwl", "Lluvia de ideas guardada en tu Debate actual", "Sí: caso completo en español", "Sí: «Si dicen… respondemos…» y Atacante de casos", "Sí: Sparring con tiempos reales y veredicto", "Prueba de 3 días, luego $5/mes + impuestos"),
        ("ChatGPT", "Sí, si le das la moción", "Si se lo pides cada vez", "Si se lo pides cada vez", "Solo si montas tú la conversación", "Versión gratis para todos; planes Go, Plus y Pro"),
        ("Claude", "Sí, si le das la moción", "Si se lo pides cada vez", "Si se lo pides cada vez", "Solo si montas tú la conversación", "Plan gratis; Pro $20/mes ($17/mes anual)"),
        ("Socrátiko", "No consta", "No consta", "Debates en los que la IA te lleva la contraria", "Debates con nota y consejos; tiempos de torneo: no consta", "3 debates gratis cada semana; precio de pago no indicado"),
        ("Debatly", "No consta", "No consta", "Ejercicios de refutación contra un entrenador de IA", "Sesiones con un juez que puntúa tres criterios", "Desde 19 €/mes; no indica plan gratis"),
    ]
    trs = "".join(
        f'<tr{OWN if i == 0 else ""}><th scope="row">{esc(r[0])}</th>' + "".join(f"<td>{esc(c)}</td>" for c in r[1:]) + "</tr>"
        for i, r in enumerate(rows)
    )
    body = f"""
<ol class="route" aria-label="Los cuatro pasos">
  <li><a href="#paso-1">Analizar la moción</a></li><li><a href="#paso-2">Escribir el caso</a></li><li><a href="#paso-3">Preparar las respuestas</a></li><li><a href="#paso-4">Practicar con tiempo</a></li>
</ol>
<section class="step" id="paso-1">
  <h2>Paso 1: analizar la moción</h2>
  <p>Lee la moción palabra por palabra. ¿Quién actúa, qué cambia y a quién afecta? «Prohibir» no es lo mismo que «regular», y «en primaria» deja fuera a la secundaria. Escribe en una línea qué tiene que demostrar cada equipo.</p>
  <p class="decision"><strong>Decisión:</strong> aquí cualquier IA ayuda. ChatGPT o Claude, con su plan gratis, te dan ideas de los dos lados si les pegas la moción. En DebateOwl haces lo mismo con Lluvia de ideas, y lo que salga queda guardado en el Debate actual de esa moción. Si solo quieres practicar con mociones nuevas, el <a href="/es/tools/generador-mociones">generador de mociones</a> es gratis.</p>
</section>
<section class="step" id="paso-2">
  <h2>Paso 2: escribir el caso</h2>
  <p>Un caso de DebateOwl se escribe como lo preparan los debatientes escolares, en el orden en que lo vas a decir. Este es el esqueleto con una moción de ejemplo, sin datos inventados: donde va la evidencia te decimos qué buscar, porque esa parte la compruebas tú.</p>
  <div class="case">
    <p class="motion">Moción: «Este colegio eliminaría los deberes en primaria». Equipo a favor.</p>
    <h3>Apertura</h3>
    <p>Las tardes de un niño de ocho años no son tiempo muerto. Hoy vamos a demostrar que los deberes en primaria quitan más de lo que dan.</p>
    <h3>Argumento 1: el descanso también enseña</h3>
    <p><strong>Explicación:</strong> a esa edad, jugar, leer por gusto y dormir bien ayudan a aprender al día siguiente. <strong>Evidencia:</strong> busca un estudio sobre deberes y rendimiento en primaria; anota autor y año, y ábrelo antes de citarlo. <strong>Por qué importa:</strong> si los deberes no mejoran las notas a esta edad, el coste en descanso no se compensa.</p>
    <h3>Argumento 2: los deberes amplían la distancia entre familias</h3>
    <p><strong>Explicación:</strong> en casa, unos niños tienen ayuda y otros no. <strong>Evidencia:</strong> busca un informe sobre apoyo escolar en casa según el nivel de estudios de los padres. <strong>Por qué importa:</strong> una tarea que depende de quién te ayuda en casa mide a la familia, no al alumno.</p>
    <h3>Cierre</h3>
    <p>Si de verdad queremos que aprendan más, dejemos que la tarde haga su parte.</p>
  </div>
  <p class="decision"><strong>Decisión:</strong> si tienes moción y fecha, este es el paso donde DebateOwl ahorra el trabajo de montar la estructura. Con la app en español, el caso sale en español. Puedes regenerar solo el argumento flojo y exportar el caso a Word, PDF o Google Docs. Un chatbot también puede escribirlo, pero tienes que pedirle esta estructura cada vez.</p>
</section>
<section class="step" id="paso-3">
  <h2>Paso 3: preparar las respuestas</h2>
  <p>El otro equipo va a atacar tus argumentos más fuertes. Prepara una respuesta corta para cada ataque probable, dicha en una sola respiración.</p>
  <div class="replies">
    <p><strong>Si dicen</strong> que los deberes crean hábito de estudio, <strong>respondemos:</strong> el hábito se crea igual con lectura libre y con tareas cortas en clase, sin cargar la tarde.</p>
    <p><strong>Si dicen</strong> que los padres quieren saber qué se hace en clase, <strong>respondemos:</strong> para eso sirve un resumen semanal del profesor, no una ficha diaria.</p>
  </div>
  <p class="decision"><strong>Decisión:</strong> cada caso de DebateOwl trae estas respuestas, y el Atacante de casos busca los puntos débiles de tu propio caso antes que el rival. Si lo que quieres es entrenar la réplica rápida contra una IA, Socrátiko y Debatly están en español y están hechos para eso.</p>
</section>
<section class="step" id="paso-4">
  <h2>Paso 4: practicar con tiempo</h2>
  <p>Un caso que no has dicho en voz alta todavía no está listo. Cronométrate: los jueces notan cuándo te sobra un minuto o te falta medio.</p>
  <p class="decision"><strong>Decisión:</strong> Sparring en DebateOwl simula una ronda completa del formato escolar 4-6-6-3, Lincoln-Douglas o Public Forum, con los tiempos reales, escribiendo o hablando, y termina con un veredicto que dice por qué ganaste o perdiste. Interrogatorio entrena preguntas y respuestas. Para Parlamentario Británico o World Schools no hay ronda simulada: usa el <a href="/es/tools/cronometro-debate">cronómetro de debate</a>, que trae esos formatos, la <a href="/es/tools/hoja-de-flujo">hoja de flujo</a> imprimible y la <a href="/es/tools/calculadora-tiempo-discurso">calculadora de tiempo de discurso</a> para ver si tu texto cabe.</p>
  <div class="cta-box">
    <p><a class="cta" href="/app">Prepara tu moción en DebateOwl</a></p>
    <p class="price">{ES_PRICE_HTML}</p>
  </div>
</section>
<section>
  <h2>¿ChatGPT o una herramienta de debate?</h2>
  <p>ChatGPT y Claude son buenos compañeros para pensar: responden rápido, te llevan la contraria si se lo pides y tienen planes gratis. Lo que no hacen por su cuenta es recordar tu moción, tu lado y los tiempos de cada discurso, ni darte el caso con la estructura de arriba sin que se la pidas. A octubre de 2026, OpenAI dice que la versión gratis de ChatGPT está disponible para todos, y Claude tiene un plan gratis de $0 y Pro a $20 al mes. <a href="#es1">F1</a> <a href="#es2">F2</a></p>
  <p>Las herramientas de debate en español van por otro lado. A octubre de 2026, en Socrátiko eliges un tema o escribes el tuyo, una IA te lleva la contraria y se adapta a tu nivel, y al final recibes una nota, tus puntos fuertes y débiles y consejos; tiene campañas con historia y da 3 debates gratis cada semana. <a href="#es3">F3</a> En el entrenamiento de Debatly eliges una moción y una postura, un entrenador de IA defiende la contraria y señala falacias, y un juez puntúa tres criterios con consejos; sus planes empiezan en 19 € al mes, con devolución durante los primeros 7 días. <a href="#es4">F4</a> <a href="#es5">F5</a></p>
  <p>Para una réplica rápida, cualquiera de estas sirve. Para llegar a un torneo con el caso escrito, las respuestas preparadas y una ronda cronometrada, DebateOwl hace las tres cosas en el mismo sitio.</p>
</section>
<section>
  <h2>Qué herramienta para cada paso</h2>
  <div class="scroll"><table>
    <caption>A octubre de 2026, según la web de cada producto. «No consta» significa que su web no lo dice.</caption>
    <thead><tr><th scope="col">Herramienta</th><th scope="col">1. Moción</th><th scope="col">2. Caso</th><th scope="col">3. Respuestas</th><th scope="col">4. Práctica con tiempo</th><th scope="col">Precio</th></tr></thead>
    <tbody>{trs}</tbody>
  </table></div>
</section>
{faq_block("Preguntas frecuentes", faqs, "details")}
<p class="langs">Esta guía también está en <a href="/best-ai-for-debate" hreflang="en">inglés</a>, con más herramientas, y en <a href="/hu/melyik-ai-a-legjobb-vitara" hreflang="hu">húngaro</a>.</p>
{sources("Fuentes (consultadas en octubre de 2026)", [
    ("es1", "https://chatgpt.com/pricing", "Versión gratis disponible para todos; planes Go, Plus y Pro."),
    ("es2", "https://claude.com/pricing", "Plan gratis de $0; Pro $17/mes anual o $20 mensual."),
    ("es3", "https://www.socratiko.com/", "Debates contra una IA que te lleva la contraria, campañas, nota y consejos, 3 debates gratis cada semana y 2 batallas de campaña al día."),
    ("es4", "https://debatly.com/es/ia-debate", "Entrenamiento con moción y postura, entrenador de IA en contra, juez que puntúa tres criterios."),
    ("es5", "https://debatly.com/es/pricing", "Starter 19 €/mes, Pro 39 €/mes, Max 89 €/mes; devolución en los primeros 7 días."),
], "Consultado el 30 de octubre de 2026.")}
"""
    style = """
body.es{background:#FFFBF2}body.es main{width:min(880px,calc(100% - 32px));margin:30px auto 72px}
body.es h1{font-size:clamp(2.1rem,5.4vw,3.6rem);color:#0B1426;max-width:18ch}
body.es .route{display:flex;flex-wrap:wrap;gap:8px;padding:0;list-style:none;counter-reset:paso;margin:22px 0}
body.es .route li{counter-increment:paso;background:#fff;border:2px solid #F2C14E;border-radius:999px;padding:6px 14px}
body.es .route li::before{content:counter(paso) ". ";font-family:Fredoka,Nunito,sans-serif}
body.es .step{border-left:4px solid #F2C14E;padding-left:20px;margin:28px 0}
body.es .decision{background:#fff;border-radius:18px;padding:12px 16px;border:1px solid #F0DFB2}
body.es .case{background:#fff;border-left:5px solid #0A6FF0;border-radius:0 22px 22px 0;padding:6px 20px 12px}
body.es .case h3{margin:16px 0 4px}body.es .motion{font-family:Fredoka,Nunito,sans-serif;font-size:1.1rem}
body.es .replies p{background:#EEF7FF;border-radius:14px;padding:10px 14px}
body.es .cta-box{background:#0B1426;color:#EEF4FF;border-radius:22px;padding:8px 20px 14px}body.es .cta-box a:not(.cta){color:#FCE48A}
body.es table{min-width:820px;background:#fff}body.es tr.own{background:#EEF7FF}
body.es details{border-bottom:1px solid #E8DCC0;padding:10px 0}
"""
    return {
        "slug": "es/mejor-ia-para-preparar-un-debate",
        "lang": "es",
        "body": "es",
        "published": "2026-10-30",
        "modified": "2026-10-30",
        "alternates": BEST_AI_ALTERNATES,
        "price": (ES_PRICE_START, ES_PRICE_HTML),
        "title": "Mejor IA para preparar un debate: guía paso a paso (2026) | DebateOwl",
        "description": "Qué IA usar en cada paso de la preparación de un debate: analizar la moción, escribir el caso, preparar respuestas y practicar con tiempo, en español.",
        "h1": "Cómo preparar un debate con IA, paso a paso",
        "question": "¿Qué IA sirve para preparar un debate?",
        "answer": answer,
        "faqs": faqs,
        "style": style,
        "html_body": body,
    }


def page_hu_best():
    answer = (
        "A DebateOwl az első választás, ha konkrét tételre és időpontra készülsz: felolvasható esetet ír "
        "„Ha azt mondják… erre azt feleljük…” válaszokkal, és időzített gyakorlófordulót futtat egy AI-ellenféllel, magyarul. "
        "Ha csak ötletelsz, egy általános chatbot ingyenes csomagja is elég, például a ChatGPT vagy a Claude."
    )
    q_lang = "Tud-e magyarul az AI vitapartner?"
    a_lang = "A DebateOwl igen: magyar felületen az eset, a válaszok, a Vitapárbaj ellenfele és az Edző is magyarul ír. Egy általános chatbotnak minden beszélgetésben meg kell adnod az indítványt, az oldaladat és a beszédidőket."
    q_price = "Mennyibe kerül?"
    a_price = "Az alkalmazás 3 napos ingyenes próba után havi $5 + adó. Az időmérő, a tételgenerátor, a jegyzetlap és a beszédidő-kalkulátor ingyenes, fiók nélkül. 2026 októberében a ChatGPT ingyenes változata mindenkinek elérhető, a Claude-nak $0-s csomagja van."
    q_not = "Mire nem jó az AI a vitában?"
    a_not = "Nem ellenőrzi helyetted a forrásokat, nem ismeri a bírádat, és a forduló alatt általában nem is használhatod. A döntést, hogy melyik érvre építed a zárást, neked kell meghoznod."
    q_teacher = "Hogyan használja egy tanár a vitaszakkörön?"
    a_teacher = "Az ingyenes eszközökkel, fiók nélkül: kivetített vitaidőmérő, tételgenerátor, nyomtatott jegyzetlap. A versenyre készülő diákok a DebateOwl alkalmazásban írják meg az esetet és gyakorolnak időre."
    faqs = [(q_lang, a_lang), (q_price, a_price), (q_not, a_not), (q_teacher, a_teacher)]
    choices = [
        ("Ha konkrét tételre és időpontra készülsz,", "akkor a DebateOwl: megírja az esetet, a válaszokat, és időre elpróbálhatod a Vitapárbajban."),
        ("Ha csak ötletelsz vagy egy új témát értenél meg,", "akkor egy általános chatbot ingyenes csomagja elég, például a ChatGPT vagy a Claude."),
        ("Ha a szakkörön óra közben kell egy időmérő,", 'akkor az ingyenes <a href="/hu/tools/vitaidomero">vitaidőmérő</a>, kivetítve, fiók nélkül.'),
        ("Ha gyakorló tétel kell,", 'akkor a <a href="/hu/tools/vitatetel-generator">vitatétel-generátor</a>.'),
        ("Ha a beszédedet hangosan akarod elpróbálni,", "akkor a Vitapárbaj, ahol gépelni és beszélni is lehet."),
        ("Ha egy forrás kell a beszédbe,", "akkor kérj nyomot az AI-tól, de a forrást te nyisd meg és olvasd el."),
    ]
    choice_html = "".join(f"<li><strong>{esc(a)}</strong> {b}</li>" for a, b in choices)
    body = f"""
<section class="ifthen">
  <h2>Ha… akkor…</h2>
  <ul>{choice_html}</ul>
</section>
<section class="qa">
  <h2>{esc(q_lang)}</h2>
  <p>A DebateOwl igen. Ha magyarra állítod a felületet, az AI minden szöveget magyarul ír: az esetet, a „Ha azt mondják…” válaszokat, a Vitapárbaj ellenfelének beszédeit és az Edző tanácsait. Az alkalmazás angolul és spanyolul is elérhető.</p>
  <p>Egy általános chatbotot neked kell beállítanod: minden új beszélgetésben újra meg kell adnod az indítványt, az oldaladat és a beszédidőket. A DebateOwlban ezek az aktuális vitádhoz tartoznak, és ott maradnak.</p>
</section>
<section class="qa">
  <h2>Mit ír meg az AI, és mi marad rád?</h2>
  <p>Egy példa: „Az iskolák térjenek át négynapos tanítási hétre.” Ellenző oldal. A bizonyítékok helyén csak az áll, mit keress, mert azt neked kell megnyitnod és ellenőrizned.</p>
  <ul class="outline">
    <li><strong>Nyitás:</strong> Egy rövidebb hét jól hangzik, amíg meg nem kérdezzük, ki vigyáz a gyerekre pénteken.</li>
    <li><strong>1. érv, a dolgozó szülők:</strong> a szabad pénteket valakinek meg kell oldania. Bizonyíték: keress felmérést arról, hány családban dolgozik mindkét szülő. Miért fontos: ha a teher a családokra kerül, a reform költsége csak máshol jelenik meg.</li>
    <li><strong>2. érv, a hosszabb napok:</strong> négy nap alatt ugyanannyi tananyag hosszabb tanítási napot jelent. Bizonyíték: keress kutatást a délutáni figyelemről alsó tagozaton. Miért fontos: ha délután már nem figyelnek, a tananyag papíron megvan, a fejekben nincs.</li>
    <li><strong>Ha azt mondják,</strong> hogy a tanárok kipihentebbek lesznek, <strong>erre azt feleljük:</strong> a hosszabb napok ugyanazt a fáradtságot négy napba sűrítik.</li>
    <li><strong>Ha azt mondják,</strong> hogy a pénteki napon lehet szakkör, <strong>erre azt feleljük:</strong> akkor az iskola továbbra is nyitva van, csak nem tanít, és ez nem rövidebb hét.</li>
    <li><strong>Zárás:</strong> A jó tanítási hét nem a napok számán múlik, hanem azon, mennyit marad meg belőle.</li>
  </ul>
  <p>Ezt a vázat írja meg a DebateOwl, a te tételedre. Rád marad a források megnyitása, a gyenge rész újragenerálása vagy átírása, és a zárómondat, amit a saját szavaiddal mondasz. Az esetet Wordbe, PDF-be vagy Google Docsba is kiviheted.</p>
</section>
<section class="qa price-box">
  <h2>{esc(q_price)}</h2>
  <p class="price">{HU_PRICE_HTML}</p>
  <p><a class="cta" href="/app">Kipróbálom a DebateOwlt 3 napig</a></p>
  <p>Ha csak ötletelni akarsz, nem kell fizetned: 2026 októberében a ChatGPT ingyenes változata mindenkinek elérhető, a Claude-nak pedig $0-s csomagja van. <a href="#hu1">F1</a> <a href="#hu2">F2</a></p>
</section>
<section class="qa">
  <h2>{esc(q_not)}</h2>
  <ul>
    <li>Nem ellenőrzi helyetted a forrást. A név és az év a lapon még nem ellenőrzés: nyisd meg, és nézd meg, hogy tényleg azt mondja-e.</li>
    <li>Nem ismeri a bírádat és a ligád szabályait. Ezt egy edző vagy a csapattársaid tudják.</li>
    <li>A forduló alatt általában nem használhatod. A legtöbb verseny korlátozza az elektronikát, ezért az AI a felkészülésé.</li>
    <li>A DebateOwl Vitapárbaja iskolai 4-6-6-3, Lincoln-Douglas és Public Forum fordulót futtat. Brit parlamenti vagy World Schools fordulóhoz a felkészítő eszközök és az időmérő valók.</li>
  </ul>
</section>
<section class="qa">
  <h2>{esc(q_teacher)}</h2>
  <p>Egy szakköri foglalkozáshoz nem kell fiók. Vetítsd ki a <a href="/hu/tools/vitaidomero">vitaidőmérőt</a>, húzz egy tételt a <a href="/hu/tools/vitatetel-generator">tételgenerátorral</a>, nyomtass mindenkinek <a href="/hu/tools/jegyzetlap">jegyzetlapot</a>, és a <a href="/hu/tools/beszedido-kalkulator">beszédidő-kalkulátorral</a> nézd meg, belefér-e egy megírt beszéd az időbe.</p>
  <p>A versenyre készülő diákok a DebateOwl alkalmazásban írják meg az esetet, és a Vitapárbajban gyakorolnak időre. Egy teljes felkészülő este menetét a <a href="/hu/mi-vitafelkeszules">vitafelkészülés MI-vel</a> útmutató írja le.</p>
</section>
<p class="langs">Ez az oldal <a href="/best-ai-for-debate" hreflang="en">angolul</a> is elérhető, több eszközzel, és <a href="/es/mejor-ia-para-preparar-un-debate" hreflang="es">spanyolul</a> is.</p>
{sources("Források (ellenőrizve: 2026. október)", [
    ("hu1", "https://chatgpt.com/pricing", "Ingyenes változat mindenkinek; Go, Plus és Pro csomag."),
    ("hu2", "https://claude.com/pricing", "Ingyenes csomag $0; Pro havi $20, éves fizetéssel havi $17."),
], "Ellenőrizve: 2026. október 30.")}
"""
    style = """
body.hubest{background:#F4F8F2}body.hubest main{width:min(760px,calc(100% - 32px));margin:30px auto 72px}
body.hubest h1{font-size:clamp(2.1rem,5.4vw,3.4rem);color:#10301F;max-width:20ch}
body.hubest .ifthen{background:#fff;border-radius:26px;padding:6px 22px 14px;border:2px solid #14B37D;margin:22px 0}
body.hubest .ifthen ul{list-style:none;padding:0;display:grid;gap:8px}body.hubest .ifthen li{padding:6px 0;border-bottom:1px dashed #CFE3D5}
body.hubest .qa h2{border-top:3px solid #14B37D;padding-top:14px}
body.hubest .outline{list-style:none;padding:0;display:grid;gap:8px}body.hubest .outline li{background:#fff;border-radius:16px;padding:10px 14px;border:1px solid #CFE3D5}
body.hubest .price-box{background:#fff;border-radius:22px;padding:2px 20px 12px;margin-top:24px}
"""
    return {
        "slug": "hu/melyik-ai-a-legjobb-vitara",
        "lang": "hu",
        "body": "hubest",
        "published": "2026-10-30",
        "modified": "2026-10-30",
        "alternates": BEST_AI_ALTERNATES,
        "disclosure": (
            f"A {PRODUCT} készíti az egyik eszközt ezen az oldalon. A többi termékről szóló tények a saját weboldalukról származnak, "
            "2026. október 30-án ellenőrizve. Fizetés előtt nézd meg őket."
        ),
        "price": (HU_PRICE_START, HU_PRICE_HTML),
        "title": "Melyik AI a legjobb vitára? Kérdések és válaszok (2026) | DebateOwl",
        "description": "Melyik AI segít a vitára készülésben, tud-e magyarul, mennyibe kerül, mire nem jó, és hogyan használja egy tanár a szakkörön. 2026. októberi adatok.",
        "h1": "AI a vitafelkészüléshez: kérdések és válaszok diákoknak és tanároknak",
        "question": "Melyik AI a legjobb vitafelkészüléshez?",
        "answer": answer,
        "faqs": faqs,
        "style": style,
        "html_body": body,
    }


VS_CHECKED = "Checked Oct 30, 2026."


def page_argufight():
    answer = (
        "Pick DebateOwl if a set motion and a date are coming: it writes a case you can read out, "
        '"If they say… we answer…" replies, and runs timed practice rounds against an AI at real speech times. '
        "Pick ArguFight if you want to argue in writing against real people, have a panel of AI judges score each debate, and climb a ranking, "
        "or if you debate in a language DebateOwl does not offer. ArguFight is free to start. "
        "Plenty of debaters could use both: prep in one, test the arguments on strangers in the other."
    )
    faqs = [
        ("Is ArguFight free?", "As of October 2026 its homepage says it is free to start and \"free forever for base debating\", and its schools page says classrooms are free. Its /pricing address returned 404, so any paid tiers are not stated."),
        ("Does ArguFight write a case for me?", "Not that its pages say. You write each round's argument yourself; the AI judges score it and explain the verdict. DebateOwl is the one that drafts a case with replies."),
        ("Can I debate real people on DebateOwl?", "No. DebateOwl's practice rounds are against an AI opponent. ArguFight is built around human opponents, with AI opponents for warming up."),
        ("Which is better for a teacher?", "For a class tournament that an AI judges, ArguFight for Schools is free and lets you make it private. For a live debate in the classroom, DebateOwl's free timer, motion generator and flow sheet need no student accounts."),
        ("Which languages do they support?", "ArguFight's site lists 26 languages. The DebateOwl app is in English, Spanish and Hungarian."),
    ]
    debaters = [
        ("You have a tournament motion next week", "DebateOwl", "It writes the case in the order you will say it, with \"If they say… we answer…\" replies, then times a practice round in School 4-6-6-3, Lincoln-Douglas or Public Forum."),
        ("You want quick, casual argument practice", "ArguFight", "You can test a take against its AI in about a minute or start a speed debate of 3 rounds in 1 hour, and it is free to start."),
        ("You coach a club", "ArguFight", "Its schools page offers free, private class tournaments where an AI judges every match 0–100 with written reasons. For a live round in the room, DebateOwl's free timer and flow sheet need no accounts."),
        ("You debate in Spanish or Hungarian", "DebateOwl", "The app is in both languages and its AI writes the case, the replies and the practice opponent in them. ArguFight's site lists both languages too, but it does not write a case."),
        ("You debate in French, German or another language", "ArguFight", "Its site lists 26 languages. The DebateOwl app covers English, Spanish and Hungarian."),
    ]
    cards = "".join(
        f'<article class="who {"owl" if pick == "DebateOwl" else "af"}"><h3>{esc(who)}</h3><p class="pick">{TICK if pick == "DebateOwl" else ""}Pick: {esc(pick)}</p><p>{esc(why)}</p></article>'
        for who, pick, why in debaters
    )
    head = ["", "Made for", "Case you can read out", "\"If they say… we answer…\" replies", "Timed rounds in real formats", "Languages", "Price (as of Oct 2026)"]
    rows = [
        ("DebateOwl", "Preparing one motion and rehearsing it", "Yes: opening, arguments with evidence and why they matter, closing, sources", "Yes, in every case", "Yes: School 4-6-6-3, LD and PF in Sparring, typed or spoken", "English, Spanish, Hungarian", "3-day free trial, then $5/month + tax"),
        ("ArguFight", "Written debates against people, judged by AI", "Not listed", "Not listed", "No: its own written rounds, 5 over 24 hours or 3 in 1 hour", "26 listed", "Free to start; paid tiers not stated"),
    ]
    ths = "".join(f'<th scope="col">{esc(h)}</th>' for h in head)
    trs = "".join(f'<tr{OWN if i == 0 else ""}><th scope="row">{esc(r[0])}</th>' + "".join(f"<td>{esc(c)}</td>" for c in r[1:]) + "</tr>" for i, r in enumerate(rows))
    body = f"""
<section class="who-grid">
  <h2>Five debaters, five picks</h2>
  <p>Find the line that sounds like you. The pick is about the job in front of you this month, not about which product is bigger.</p>
  <div class="cards">{cards}</div>
</section>
<section class="cta-band">
  <h2>If your round has a date</h2>
  <p>Start with the case. DebateOwl writes it, lists the replies you will need, and gives you a timed round to say it in. ArguFight is a fine place to test the same arguments afterwards. <a href="/best-ai-for-debate">The short answer across more tools</a> is on its own page.</p>
  <p><a class="cta" href="/app">Write the case for your motion</a></p>
  <p>{PRICE_HTML}</p>
</section>
<section>
  <h2>What ArguFight is, in its own words</h2>
  <p>As of October 2026, ArguFight calls itself an AI-judged debate platform. You create a challenge, choose FOR or AGAINST, and pick standard mode (5 rounds over 24 hours) or speed mode (3 rounds in 1 hour). Someone accepts from the open challenges, you trade written arguments round by round, and spectators can watch. <a href="#af1">S1</a></p>
  <p>Up to three AI judges score each debate from 0 to 100 and explain their reasoning, and the majority decides. Its pages count the roster differently: the judges page shows ten named personas with published paradigms, the homepage says both "3 of 7" and "up to 3" from six, and the About page says six. Every verdict also comes with coaching notes on what worked and what to fix. <a href="#af1">S1</a> <a href="#af2">S2</a> <a href="#af3">S3</a></p>
  <p>Around that sit ELO rankings, championship belts in categories such as Science and Politics, bracket tournaments, community judging, a fact-check that the judges never see, speech-to-text input, and an AI opponent you can warm up against. The site lists 26 languages, including Spanish and Hungarian. It says it is free to start and free forever for base debating. <a href="#af1">S1</a></p>
</section>
<section>
  <h2>What DebateOwl is for</h2>
  <p>DebateOwl starts from a motion you have been given. You open a Current Debate for it, and the case, sources, drills and practice rounds stay filed under that motion. The case generator writes the speech in the order you would give it. Attack looks for the weak link in the other side, Factoids suggests evidence with a source you still have to open, Crossfire drills questions, and Sparring runs a timed round against an AI in School 4-6-6-3, Lincoln-Douglas or Public Forum, typed or spoken, ending with a verdict. World Schools and British Parliamentary get the prep tools, not a simulated round.</p>
</section>
<section>
  <h2>One motion, prepared here and tested there</h2>
  <p>Motion: "Social media apps should be banned for under-16s." Side: for. This is the shape DebateOwl gives you, with the evidence left as what to look for, because that part you check yourself.</p>
  <ol class="case">
    <li><strong>Opening.</strong> We do not let fourteen-year-olds sign phone contracts alone. We should not let them sign up to apps built to keep them scrolling.</li>
    <li><strong>Argument 1: the design works against young users.</strong> Explanation: endless feeds and streaks reward time spent, not time well spent. Evidence: find a study on teenage sleep and late-night app use; note the author and year. Why it matters: lost sleep hits schoolwork and mood every day, not only on bad days.</li>
    <li><strong>Argument 2: parents cannot police it alone.</strong> Explanation: one family's rules collapse when the whole class is on the app. Evidence: find a survey of parents on setting screen-time rules. Why it matters: a legal age gives every family the same line to point to.</li>
    <li><strong>If they say</strong> teenagers will lie about their age, <strong>we answer:</strong> some will, as with any age limit, and the rule still moves the default for everyone else.</li>
    <li><strong>If they say</strong> social media keeps isolated teenagers connected, <strong>we answer:</strong> messaging and video calls stay open; the ban targets feeds built to hold attention.</li>
    <li><strong>Closing.</strong> A good age limit does not stop teenagers growing up online. It stops the apps deciding how fast.</li>
  </ol>
  <p>To test it on ArguFight, post the motion as a speed challenge. Your first round can carry the opening and argument 1, and the "If they say…" lines are ready for whatever the other person writes back. ArguFight's judges then tell you which point held. That split of rounds is our suggestion, not an ArguFight rule.</p>
</section>
<section>
  <h2>Matrix: DebateOwl and ArguFight</h2>
  <div class="scroll"><table>
    <caption>As of October 2026, from each product's own pages. DebateOwl is the first column.</caption>
    <thead><tr>{ths}</tr></thead>
    <tbody>{trs}</tbody>
  </table></div>
</section>
<section>
  <h2>Where ArguFight is the better pick</h2>
  <ul>
    <li>Real human opponents. DebateOwl has none.</li>
    <li>A free start, with no trial clock.</li>
    <li>A class tournament the AI marks, free for classrooms and private if you want.</li>
    <li>Languages beyond English, Spanish and Hungarian.</li>
    <li>A public ranking, belts and spectators, if competition keeps you practising.</li>
  </ul>
  <p>For a ranked voice game instead of written rounds, see <a href="/debateowl-vs-debate-ladder">DebateOwl vs Debate Ladder</a>. For short spoken drills on a phone, <a href="/debateowl-vs-mindduel">DebateOwl vs MindDuel</a> follows one motion through both apps.</p>
</section>
{faq_block("ArguFight questions", faqs, "details")}
{sources("Sources (checked October 2026)", [
    ("af1", "https://www.argufight.com/", "Challenges, standard and speed modes, AI judge panel, ELO, belts, tournaments, voice input, 26 languages, free to start. Its /pricing address returned 404."),
    ("af2", "https://www.argufight.com/judges", "Ten judge personas with published paradigms; three per debate."),
    ("af3", "https://www.argufight.com/about", "A roster of six judge personalities; free to join and start debating."),
    ("af4", "https://www.argufight.com/for-schools", "Free for classrooms; private, invite-only tournaments; every match judged 0–100 with written reasoning."),
], VS_CHECKED)}
"""
    style = """
body.argu{background:#F6F7FB}body.argu main{width:min(1060px,calc(100% - 32px));margin:28px auto 72px}
body.argu h1{font-size:clamp(2.3rem,5.6vw,3.9rem);color:#0B1426}
body.argu .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px}
body.argu .who{background:#fff;border-radius:22px;padding:4px 18px 10px;border:2px solid #D9DEEA}
body.argu .who.owl{border-color:#0A6FF0}body.argu .who.af{border-color:#E4572E}
body.argu .pick{font-family:Fredoka,Nunito,sans-serif;display:flex;align-items:center;margin:0}
body.argu .cta-band{background:#0B1426;color:#EEF4FF;border-radius:28px;padding:8px 24px 20px;margin:28px 0}
body.argu .cta-band a:not(.cta){color:#FCE48A}
body.argu .case{display:grid;gap:8px;padding-left:1.3rem}body.argu .case li{background:#fff;border-radius:14px;padding:8px 12px}
body.argu table{min-width:900px;background:#fff}body.argu tr.own{background:#EEF7FF}
body.argu details{border-bottom:1px solid #D9DEEA;padding:10px 0}
"""
    return {
        "slug": "debateowl-vs-argufight",
        "lang": "en",
        "body": "argu",
        "published": "2026-10-30",
        "modified": "2026-10-30",
        "title": "DebateOwl vs ArguFight: Which Debater Should Pick Which? | DebateOwl",
        "description": "ArguFight runs written debates against people, scored by AI judges. DebateOwl writes a case and runs timed rounds. Which debater should pick which.",
        "h1": "DebateOwl vs ArguFight: which debater should pick which",
        "question": "Should I use DebateOwl or ArguFight?",
        "answer": answer,
        "faqs": faqs,
        "style": style,
        "html_body": body,
    }


def page_mindduel():
    answer = (
        "They train different things. MindDuel, an Android app, gives you ten short spoken turns against an AI, each 5 to 60 seconds, "
        "then a 0–100 score across five areas. DebateOwl prepares a full round: a case you can read out, "
        '"If they say… we answer…" replies, and a timed practice round at your format\'s real speech times, ending in a verdict. '
        "Use MindDuel for quick reflexes on your phone, and DebateOwl when a motion and a date are set."
    )
    faqs = [
        ("Which MindDuel is this page about?", "The Android app \"MindDuel – AI Debate Practice\" by Serdar Yalkabov on Google Play. We found no website for it. mindduel.io is an unrelated puzzle game."),
        ("How much does MindDuel cost?", "As of October 2026 its Google Play listing shows in-app purchases but does not state prices."),
        ("Can I enter my own motion in MindDuel?", "Not stated. Its listing describes real-world topics in politics, technology, ethics and society."),
        ("Does DebateOwl score me out of 100?", "No. A Sparring round ends with a judged verdict that names the reason you won or lost, which you can turn into the next fix."),
        ("Can I speak instead of type in both?", "Yes. MindDuel uses voice-to-text. DebateOwl's Sparring speeches can be typed or spoken."),
    ]
    mind = [
        ("Prepare", "Its listing names no prep step. Choose a topic (its listing names politics, technology, ethics and society) and a level: Beginner, Intermediate or Expert. Set thinking time and speaking time, each 5 to 60 seconds."),
        ("Practise", "Ten rounds, you against the AI, spoken through voice-to-text."),
        ("Review", "A 0–100 total, scored on clarity, logic and structure, evidence and examples, persuasiveness and rebuttal, with a short explanation. The debate goes into your history, and there is a global leaderboard."),
    ]
    owl = [
        ("Prepare", 'Open a Current Debate with the motion and your side, and generate the case: opening, two to four arguments with evidence and why they matter, "If they say… we answer…" replies, closing line, sources. Open the sources.'),
        ("Practise", "Run Sparring in School 4-6-6-3, Lincoln-Douglas or Public Forum at the real speech times, typed or spoken. Crossfire drills the questions."),
        ("Review", "A judged verdict that names the reason. Rebuild that one part, with Attack or by regenerating the section, and give the speech again."),
    ]
    def lane(steps):
        return "".join(f"<li><strong>{esc(step)}.</strong> {esc(text)}</li>" for step, text in steps)
    rows = [
        ("What a turn is", "A short spoken answer, 5–60 seconds", "A full speech at your format's time, often several minutes"),
        ("Preparation", "None built in; you argue from what you know", "A written case with replies, before you speak"),
        ("Formats", "Its own 10-round format", "School 4-6-6-3, LD, PF in Sparring; prep tools for other formats"),
        ("Feedback", "0–100 total across five areas, plus an explanation", "A verdict that names the reason, then a targeted fix"),
        ("Where it runs", "Android app", "In the browser"),
        ("Price", "In-app purchases; prices not stated", "3-day free trial, then $5/month + tax"),
    ]
    trs = "".join(f'<tr><th scope="row">{esc(a)}</th><td>{esc(b)}</td><td>{esc(c)}</td></tr>' for a, b, c in rows)
    body = f"""
<section class="motion-card">
  <p class="label">The motion for this page</p>
  <p class="motion">"Public transport in cities should be free to ride."</p>
  <p>Below, the same motion goes through both apps, step by step. In MindDuel that works if one of its topics is this motion or close to it; whether you can type your own is not stated.</p>
</section>
<section class="lanes">
  <h2>Two workflows, side by side</h2>
  <div class="two">
    <div class="lane md"><h3>In MindDuel</h3><ol>{lane(mind)}</ol></div>
    <div class="lane owl"><h3>{TICK}In DebateOwl</h3><ol>{lane(owl)}</ol></div>
  </div>
  <p>Both columns follow the same three steps: prepare, practise, review. MindDuel trains how fast you can answer. DebateOwl trains what you say when the round is real.</p>
</section>
<section>
  <h2>What the DebateOwl case looks like for this motion</h2>
  <div class="case">
    <p><strong>Opening:</strong> A bus that is free to board is a bus more people use, and a city where more people take the bus is easier to live in for everyone, drivers included.</p>
    <p><strong>Argument 1, cleaner, quicker streets:</strong> fewer car trips means less traffic and less exhaust in the centre. Evidence: find a study of a city that dropped fares, with ridership before and after; note the year. Why it matters: every bus seat filled is a car not queuing.</p>
    <p><strong>Argument 2, fairness:</strong> fares take the biggest share from people on the lowest wages. Evidence: find household spending data on transport by income. Why it matters: free fares are a raise for the people who need one most.</p>
    <p><strong>If they say</strong> the city cannot afford it, <strong>we answer:</strong> fare collection has its own costs, and the city already pays for congestion in lost time and road repairs.</p>
    <p><strong>If they say</strong> free buses will be overcrowded, <strong>we answer:</strong> crowding is a reason to run more buses, and that is a better problem than empty ones.</p>
    <p><strong>Closing:</strong> Make the bus the easy choice, and the city gets moving.</p>
  </div>
  <p>The two "If they say…" lines make good MindDuel material: each is a 30-second answer you can practise saying without notes. That is one honest way to use both.</p>
</section>
<section>
  <h2>The two apps in one table</h2>
  <div class="scroll"><table>
    <caption>As of October 2026. MindDuel facts come from its Google Play listing. DebateOwl is the right-hand column.</caption>
    <thead><tr><th scope="col"></th><th scope="col">MindDuel</th><th scope="col">DebateOwl</th></tr></thead>
    <tbody>{trs}</tbody>
  </table></div>
  <p>MindDuel's listing places it in the Entertainment category. Its only public page we found is that listing, so anything it does not say is marked not stated.</p>
</section>
<section class="ending">
  <h2>When MindDuel is enough, and when you want DebateOwl</h2>
  <div class="two">
    <div>
      <h3>MindDuel is enough when</h3>
      <p>you have ten spare minutes and an Android phone, you want to get used to answering out loud in under a minute, and a score out of 100 is the feedback you need. It is also a gentle start if speaking makes you nervous: begin on Beginner with long thinking time.</p>
    </div>
    <div class="owl">
      <h3>{TICK}You want DebateOwl when</h3>
      <p>a motion and a date are set. Then you need the case written before the reflexes, replies ready for the other side, and a round at your format's real speech times that ends with a reason, not only a number.</p>
      <p><a class="cta" href="/ai-debate-case-generator">Get the case for your motion</a></p>
      <p>{PRICE_HTML}</p>
    </div>
  </div>
  <p>Other tools are compared on <a href="/best-ai-for-debate">which AI is best for debate</a>, and written rounds against real people on <a href="/debateowl-vs-argufight">DebateOwl vs ArguFight</a>.</p>
</section>
{faq_block("MindDuel questions", faqs, "defs")}
{sources("Sources (checked October 2026)", [
    ("md1", "https://play.google.com/store/apps/details?id=com.serdaryalkabov.brightmint", "MindDuel – AI Debate Practice on Google Play: 10 rounds, 5–60 second thinking and speaking time, three levels, voice-to-text, 0–100 score in five areas, history, leaderboard, in-app purchases, Entertainment category. No prices listed."),
    ("md2", "https://www.mindduel.io/", "A browser puzzle game with the same name, unrelated to the debate app."),
], VS_CHECKED)}
"""
    style = """
body.duel{background:#FBF7FF}body.duel main{width:min(1000px,calc(100% - 32px));margin:28px auto 72px}
body.duel h1{font-size:clamp(2.2rem,5.4vw,3.7rem);color:#1D1036}
body.duel .motion-card{background:#1D1036;color:#F3ECFF;border-radius:26px;padding:16px 24px;margin:22px 0}
body.duel .motion-card .label{text-transform:uppercase;letter-spacing:.08em;font-size:.8rem;margin:0;color:#C9B6F2}
body.duel .motion{font-family:Fredoka,Nunito,sans-serif;font-size:clamp(1.3rem,3vw,1.8rem);margin:6px 0}
body.duel .two{display:grid;grid-template-columns:1fr 1fr;gap:16px}
body.duel .lane{background:#fff;border-radius:22px;padding:4px 18px 10px;border:2px solid #E3D8F7}
body.duel .lane.owl{border-color:#0A6FF0;background:#F2F8FF}body.duel .lane h3{display:flex;align-items:center}
body.duel .lane li{margin:8px 0}
body.duel .case{background:#fff;border-radius:22px;padding:6px 20px;border-left:5px solid #0A6FF0}
body.duel .ending .two>div{background:#fff;border-radius:22px;padding:4px 18px 10px;border:2px solid #E3D8F7}body.duel .ending .owl{border-color:#0A6FF0!important;background:#F2F8FF!important}body.duel .ending h3{display:flex;align-items:center}
body.duel table{min-width:640px;background:#fff}body.duel td:nth-child(3){background:#EEF7FF}
body.duel dt{font-family:Fredoka,Nunito,sans-serif;margin-top:14px}
@media(max-width:760px){body.duel .two{grid-template-columns:1fr}}
"""
    return {
        "slug": "debateowl-vs-mindduel",
        "lang": "en",
        "body": "duel",
        "published": "2026-10-30",
        "modified": "2026-10-30",
        "title": "DebateOwl vs MindDuel: One Motion, Two Workflows | DebateOwl",
        "description": "MindDuel gives you ten short spoken turns and a score. DebateOwl writes the case and runs a timed round. One motion through both apps, as of Oct 2026.",
        "h1": "DebateOwl vs MindDuel: one motion, two workflows",
        "question": "What is the difference between DebateOwl and MindDuel?",
        "answer": answer,
        "faqs": faqs,
        "style": style,
        "html_body": body,
    }


def visible_text(html):
    text = re.sub(r"<script[\s\S]*?</script>", " ", html)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text)
    text = re.sub(r"<[^>]+>", " ", text)
    return escape(text) and re.sub(r"\s+", " ", text)


def write_comparison_pages(public: Path):
    ensure_fonts(public)
    pages = [page_ladder(), page_price(), page_chat(), page_teachers(), page_prep(), page_pf(), page_hu(), page_es(), page_hu_best(), page_argufight(), page_mindduel()]
    h2s = {}
    answers = []
    for page in pages:
        html = shell(page, page["style"], page["html_body"], page["faqs"], page.get("howto"))
        headings = re.findall(r"<h2\b[^>]*>(.*?)</h2>", html, flags=re.S)
        headings = [re.sub(r"<[^>]+>", "", item).strip() for item in headings]
        h2s[page["slug"]] = headings
        answers.append(page["answer"])
        if page["lang"] == "en":
            words = len(page["answer"].split())
            if words > 100:
                raise SystemExit(f"{page['slug']}: opening answer has {words} words; keep it to 100")
            visible = unescape(visible_text(html))
            if visible.count(PRICE_START) != 1 or PRICE_HTML not in html:
                raise SystemExit(f"{page['slug']}: the pricing sentence must appear exactly once, with the tools linked")
            if "/tools" in visible:
                raise SystemExit(f"{page['slug']}: shows the path /tools; link the tools by name instead")
        elif "price" in page:
            start, price_html = page["price"]
            if unescape(visible_text(html)).count(start) != 1 or price_html not in html:
                raise SystemExit(f"{page['slug']}: the pricing sentence must appear exactly once, with the tools linked")
        elif HU_PRICE not in html:
            raise SystemExit("Hungarian page is missing the pricing sentence")
        if JARGON.search(re.sub(r"<script[\s\S]*?</script>", " ", html)):
            raise SystemExit(f"{page['slug']}: jargon in the page")
        if html.lower().count('href="/best-ai-for-debate"') != 1:
            raise SystemExit(f"{page['slug']}: expected exactly one link to /best-ai-for-debate")
        sibling_links = set(re.findall(r'href="/((?:hu/)?[a-z0-9-]+)"', html))
        # Count sibling comparison pages linked, excluding self.
        linked = [slug for slug in SIBLINGS if slug != page["slug"] and f'href="/{slug}"' in html]
        if len(linked) > 3:
            raise SystemExit(f"{page['slug']}: links to {len(linked)} sibling pages: {linked}")
        folder = public / page["slug"]
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "index.html").write_text(html)
        if len(page["description"]) > 155 and page["slug"] == "debateowl-vs-debate-ladder":
            raise SystemExit("Page 1 meta description is over 155 characters")
    if len(set(answers)) != len(answers):
        raise SystemExit("Opening answers are not all distinct")
    slugs = list(h2s)
    for i, left in enumerate(slugs):
        for right in slugs[i + 1:]:
            shared = set(h2s[left]) & set(h2s[right])
            if len(shared) > 2:
                raise SystemExit(f"{left} and {right} share H2s: {shared}")
    print(f"Wrote {len(pages)} comparison pages")


if __name__ == "__main__":
    write_comparison_pages(ROOT / "public")
