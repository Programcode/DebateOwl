from pathlib import Path
import html
import json

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"

CSS = """
:root{color-scheme:dark;--bg:#070a12;--panel:#101827;--text:#f8fafc;--muted:#b6c2d6;--brand:#7c5cff;--brand2:#22d3ee;--line:rgba(255,255,255,.14)}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 18% 8%,rgba(124,92,255,.30),transparent 34rem),radial-gradient(circle at 85% 18%,rgba(34,211,238,.18),transparent 28rem),var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.65}a{color:inherit}.wrap{width:min(1080px,92vw);margin:auto}.nav{display:flex;justify-content:space-between;align-items:center;padding:28px 0}.brand{font-weight:850;letter-spacing:-.04em;font-size:1.25rem;text-decoration:none}.nav a{color:var(--muted);text-decoration:none;margin-left:20px}.hero{padding:58px 0 42px}.eyebrow{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:8px 12px;color:#c4b5fd;background:rgba(124,92,255,.12);font-size:.92rem}.hero h1{max-width:900px;font-size:clamp(2.4rem,6.4vw,5.5rem);line-height:.96;letter-spacing:-.075em;margin:22px 0}.lead{max-width:780px;color:var(--muted);font-size:clamp(1.1rem,2vw,1.32rem)}.cta{display:flex;gap:14px;flex-wrap:wrap;margin-top:28px}.btn{display:inline-flex;align-items:center;justify-content:center;border-radius:14px;padding:14px 20px;font-weight:750;text-decoration:none}.primary{background:linear-gradient(135deg,var(--brand),var(--brand2));color:white}.secondary{border:1px solid var(--line);background:rgba(255,255,255,.06)}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin:42px 0}.card{border:1px solid var(--line);border-radius:24px;background:rgba(16,24,39,.78);padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.24)}.card h2,.card h3{letter-spacing:-.035em;line-height:1.12;margin-top:0}.muted{color:var(--muted)}.section{padding:38px 0}.article{max-width:820px}.article h2{font-size:clamp(1.7rem,3vw,2.45rem);letter-spacing:-.04em;line-height:1.14;margin-top:2.1rem}.article h3{font-size:1.3rem;letter-spacing:-.025em}.article p,.article li{color:var(--muted)}.article strong{color:var(--text)}.faq details{border-top:1px solid var(--line);padding:18px 0}.faq summary{cursor:pointer;font-weight:750}.footer{border-top:1px solid var(--line);margin-top:42px;padding:26px 0 40px;color:var(--muted);font-size:.95rem}.list{padding-left:1.2rem}.list li{margin:.5rem 0}@media(max-width:820px){.grid{grid-template-columns:1fr}.nav{align-items:flex-start;gap:16px;flex-direction:column}.nav a{margin:0 14px 0 0}.hero h1{letter-spacing:-.055em}}
""".strip()

PAGES = [
    {
        "slug": "ai-debate-practice",
        "title": "AI Debate Practice Platform | DebateLab",
        "description": "Practice debate online with DebateLab: AI opponents, targeted drills, rebuttal feedback, evidence research, argument flowcharts, and tournament-ready prep tools.",
        "eyebrow": "DebateLab guide",
        "h1": "AI Debate Practice for Stronger Cases, Rebuttals, and Speeches",
        "lead": "A practical guide to using AI for debate preparation without turning every round into a generic chatbot prompt.",
        "sections": [
            ("Why AI debate practice needs structure", [
                "Good debate prep is not just asking an AI model for arguments. Debaters need claims, warrants, impacts, weighing, evidence, and responses that fit the format they are preparing for.",
                "DebateLab is built around that workflow: generate a case, attack it, gather sources, map the clash, ask for coaching, and practice with a timer before the round starts."
            ]),
            ("What to practice before a round", [
                "Start by writing the motion in plain language. Then identify the burdens for each side, the likely clashes, and the judge questions that decide the round.",
                "Use AI debate practice to stress-test your weakest link: a missing warrant, an overclaimed impact, a weak comparative, or a rebuttal that answers the wrong part of the argument."
            ]),
            ("How DebateLab helps", [
                "DebateLab connects case generation, rebuttal practice, evidence finding, argument flowcharts, coaching, and timers in one debate-prep workspace.",
                "That matters for SEO and for users: public pages explain the product, while private app pages stay protected behind login."
            ]),
        ],
        "features": ["Generate structured cases", "Practice rebuttals", "Map clash and weighing"],
        "faq": [("Can Google index private DebateLab app pages?", "No. Googlebot cannot log in, so private dashboards should stay noindexed while public guides and feature pages provide crawlable context."), ("Is AI debate practice useful for beginners?", "Yes. Beginners get structure and examples, while advanced debaters use it to move through prep faster."), ("Should the app pages be public?", "User data and dashboards should remain private. Public feature pages should explain what those tools do.")],
    },
    {
        "slug": "debate-case-generator",
        "title": "AI Debate Case Generator | DebateLab",
        "description": "Generate structured debate cases with claims, warrants, impacts, counters, and evidence suggestions for any motion or side using DebateLab.",
        "eyebrow": "Feature guide",
        "h1": "Generate Structured Debate Cases in Minutes",
        "lead": "A debate case generator should create a starting structure you can improve, verify, and adapt for your format.",
        "sections": [
            ("What a useful debate case includes", ["A strong case separates claims from warrants and impacts. It also makes the weighing explicit so the judge knows why your argument matters more than the other side's.", "DebateLab helps turn a motion into contentions, reasoning chains, counters, and prep notes instead of a flat paragraph of generic arguments."]),
            ("How to use generated cases responsibly", ["Generated cases are a draft, not a substitute for research. The best workflow is to generate structure, check the assumptions, add verified evidence, and then practice attacking the case yourself.", "This is why DebateLab links case generation to source finding, rebuttal practice, and flowcharts."]),
            ("From case draft to round strategy", ["Once the case exists, the real question is what the other side can exploit. Use DebateLab to find weak warrants, missing examples, and impact comparisons before the round."])
        ],
        "features": ["Claims and warrants", "Impacts and weighing", "Counters and prep notes"],
        "faq": [("Does DebateLab write the whole case for me?", "It helps generate a structured draft, then you should edit, verify, and adapt it."), ("Can I choose a side?", "Yes. Case prep starts from the motion and the side you are preparing."), ("Does it include evidence?", "DebateLab can help find evidence leads, but you should always verify original sources.")]
    },
    {
        "slug": "debate-rebuttal-practice",
        "title": "Debate Rebuttal Practice & Argument Analyzer | DebateLab",
        "description": "Practice rebuttals with DebateLab. Analyze arguments, find weak warrants, missing weighing, logical gaps, and cross-examination traps before your round.",
        "eyebrow": "Feature guide",
        "h1": "Practice Rebuttals Before Your Opponent Finds the Weakness",
        "lead": "Rebuttal practice is where debate prep becomes strategic: you decide which link to attack and why that attack wins the round.",
        "sections": [
            ("What makes a rebuttal effective", ["A good rebuttal does not answer every sentence. It attacks the part of the argument that matters: the warrant, evidence quality, internal link, impact, or weighing comparison.", "DebateLab helps identify those pressure points so your prep produces sharper responses."]),
            ("Train with your own cases", ["Paste a case, speech, or contention and ask what a strong opponent would attack. Then build blocks that answer the most likely objections.", "This is especially useful when preparing alone and you do not have a teammate available to pressure-test your arguments."]),
            ("Use cross-examination as a weapon", ["Weak warrants often become strong cross-examination questions. DebateLab can help turn hidden assumptions into questions that expose the other side's burden."])
        ],
        "features": ["Find weak warrants", "Build targeted blocks", "Practice weighing and collapse"],
        "faq": [("Can DebateLab analyze my argument?", "Yes. You can use it to find logical gaps, missing weighing, and likely attacks."), ("Does rebuttal practice work for any format?", "The principles apply broadly, though you should adapt timing and style to your event."), ("Can it suggest cross-examination questions?", "Yes. Weak assumptions can be turned into pressure questions.")]
    },
    {
        "slug": "ai-debate-coach",
        "title": "AI Debate Coach for Strategy, Structure & Practice | DebateLab",
        "description": "Ask DebateLab’s AI debate coach for help with strategy, argument structure, weighing, rebuttals, speeches, prep questions, and practice feedback.",
        "eyebrow": "Feature guide",
        "h1": "Ask an AI Debate Coach for Round-Ready Prep",
        "lead": "A debate coach helps you choose the right strategy, not just produce more words. DebateLab gives debaters a focused AI coach for practice and preparation.",
        "sections": [
            ("What an AI debate coach should do", ["The useful coach asks what the round is about, what side you are on, what your burden is, and what the judge needs to compare.", "DebateLab is designed to support strategy, structure, weighing, rebuttals, and speech practice rather than generic essay writing."]),
            ("Use coaching to improve faster", ["After a practice speech, ask what was unclear, what was under-warranted, and what should become the collapse. Then repeat with a narrower drill.", "That loop turns feedback into deliberate practice instead of vague advice."]),
            ("Public guidance, private workspace", ["The coaching explanations can be public and indexable. Your saved cases, history, and private prep should remain protected behind login."])
        ],
        "features": ["Strategy help", "Speech structure", "Practice feedback"],
        "faq": [("Can an AI coach replace a human coach?", "No. It is a practice tool, not a substitute for a great human coach or team."), ("What can I ask it?", "Strategy, structure, rebuttals, weighing, speech drills, and prep questions."), ("Is my private prep public?", "No. Private app content should stay behind login and out of search.")]
    },
]

TEMPLATE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
  <meta name="description" content="{description}" />
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
  <link rel="canonical" href="https://debate.pi-stack.org/{slug}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="DebateLab" />
  <meta property="og:title" content="{title}" />
  <meta property="og:description" content="{description}" />
  <meta property="og:url" content="https://debate.pi-stack.org/{slug}" />
  <meta property="og:image" content="https://debate.pi-stack.org/hero-visual.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <link rel="stylesheet" href="/seo-pages.css" />
  <script type="application/ld+json">{json_ld}</script>
</head>
<body>
  <main class="wrap">
    <nav class="nav" aria-label="Primary">
      <a class="brand" href="/">DebateLab</a>
      <div><a href="/ai-debate-practice">AI practice</a><a href="/debate-case-generator">Case generator</a><a href="/debate-rebuttal-practice">Rebuttals</a><a href="/app">Open app</a></div>
    </nav>
    <section class="hero">
      <span class="eyebrow">{eyebrow}</span>
      <h1>{h1}</h1>
      <p class="lead">{lead}</p>
      <div class="cta"><a class="btn primary" href="/app">Start practicing</a><a class="btn secondary" href="/">See DebateLab</a></div>
    </section>
    <section class="grid" aria-label="Highlights">{feature_cards}</section>
    <article class="article section">{article_html}</article>
    <section class="section faq article">
      <h2>Frequently asked questions</h2>
      {faq_html}
    </section>
  </main>
  <footer class="footer"><div class="wrap">DebateLab — AI-powered debate practice, case prep, rebuttal training, evidence research, flowcharts, and coaching. <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></div></footer>
</body>
</html>
"""

def render_page(page):
    article = []
    for heading, paragraphs in page["sections"]:
        article.append(f"<h2>{html.escape(heading)}</h2>")
        for paragraph in paragraphs:
            article.append(f"<p>{html.escape(paragraph)}</p>")
    faq_html = "".join(f"<details><summary>{html.escape(q)}</summary><p>{html.escape(a)}</p></details>" for q, a in page["faq"])
    feature_cards = "".join(f"<article class=\"card\"><h3>{html.escape(feature)}</h3><p class=\"muted\">A public, crawlable overview of a DebateLab workflow that opens into the private app.</p></article>" for feature in page["features"])
    json_ld = json.dumps({
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "Article", "headline": page["h1"], "name": page["title"], "url": f"https://debate.pi-stack.org/{page['slug']}", "description": page["description"], "publisher": {"@type": "Organization", "name": "DebateLab", "url": "https://debate.pi-stack.org/"}},
            {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in page["faq"]]},
        ],
    }, separators=(",", ":"))
    return TEMPLATE.format(
        title=html.escape(page["title"]),
        description=html.escape(page["description"]),
        slug=page["slug"],
        eyebrow=html.escape(page["eyebrow"]),
        h1=html.escape(page["h1"]),
        lead=html.escape(page["lead"]),
        feature_cards=feature_cards,
        article_html="\n".join(article),
        faq_html=faq_html,
        json_ld=html.escape(json_ld, quote=False),
    )


def main():
    (PUBLIC / "seo-pages.css").write_text(CSS + "\n")
    for page in PAGES:
        directory = PUBLIC / page["slug"]
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "index.html").write_text(render_page(page))

    sitemap = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '  <url>',
        '    <loc>https://debate.pi-stack.org/</loc>',
        '    <changefreq>weekly</changefreq>',
        '    <priority>1.0</priority>',
        '  </url>',
    ]
    for page in PAGES:
        sitemap.extend([
            '  <url>',
            f'    <loc>https://debate.pi-stack.org/{page["slug"]}</loc>',
            '    <changefreq>monthly</changefreq>',
            '    <priority>0.8</priority>',
            '  </url>',
        ])
    sitemap.extend([
        '  <url>',
        '    <loc>https://debate.pi-stack.org/terms</loc>',
        '    <changefreq>yearly</changefreq>',
        '    <priority>0.2</priority>',
        '  </url>',
        '  <url>',
        '    <loc>https://debate.pi-stack.org/privacy</loc>',
        '    <changefreq>yearly</changefreq>',
        '    <priority>0.2</priority>',
        '  </url>',
        '</urlset>',
    ])
    (PUBLIC / "sitemap.xml").write_text("\n".join(sitemap) + "\n")
    print(f"Generated {len(PAGES)} public SEO pages and updated sitemap")

if __name__ == "__main__":
    main()
