#!/usr/bin/env python3
from datetime import date
from pathlib import Path
import html
import json
import re
import sys

sys.dont_write_bytecode = True  # keep scripts/__pycache__ out of the tree
from seo_answers import ANSWERS  # noqa: E402
from seo_guides import GUIDES  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public"
# Brand and domain strings come from src/config/site.json, shared with the app
# and the build scripts. Page copy names the product with {product}.
SITE = json.loads((ROOT / "src" / "config" / "site.json").read_text())
BASE = SITE["origin"]
BRAND = SITE["brand"]
PRODUCT = SITE["product"]
ORGANIZATION = SITE["organization"]
PRICING = SITE["pricing"]
# Prices and plan facts are stated "as of" this month; move it when they are rechecked.
FACTS_AS_OF = date.fromisoformat(SITE["factsCheckedOn"]).strftime("%B %Y")
DEFINITION = f'{PRODUCT} is {SITE["definition"]}.'
PRO_PRICE = f"${PRICING['proMonthly']}/month + tax"
# One line every guide, llms.txt and the pricing page share.
PLAN_FACTS = (
    f"As of {FACTS_AS_OF}, {PRODUCT} has a {PRICING['trialDays']}-day free trial with no credit card required, "
    f"then Pro costs {PRO_PRICE}. There is no permanent free plan."
)
# The date the page text last changed. The build reads it into sitemap.xml as
# <lastmod>, so bump it only when the copy changes, not on every regeneration.
# A guide whose own copy changed alone sets "modified" in seo_guides.py instead.
CONTENT_DATE = "2026-10-20"
# The date the shared FAQS below last changed; a page that shows them is modified then at the latest.
FAQS_DATE = "2026-10-23"
# The commit that first added every current guide (git log --diff-filter=A).
# A new guide sets "published" in its PAGES entry.
PUBLISHED_DATE = "2026-07-05"
# The lead answer under the first H2 stays short enough to quote whole.
ANSWER_MAX_WORDS = 100

CSS = """
:root{color-scheme:dark;--bg:#070a12;--panel:#101827;--text:#f8fafc;--muted:#b6c2d6;--brand:#7c5cff;--brand2:#22d3ee;--line:rgba(255,255,255,.14)}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 18% 8%,rgba(124,92,255,.30),transparent 34rem),radial-gradient(circle at 85% 18%,rgba(34,211,238,.18),transparent 28rem),var(--bg);color:var(--text);font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.65}a{color:inherit}.wrap{width:min(1120px,92vw);margin:auto}.nav{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:24px 0}.brand{font-weight:850;letter-spacing:-.04em;font-size:1.25rem;text-decoration:none}.nav div{display:flex;gap:18px;flex-wrap:wrap;justify-content:flex-end}.nav a{color:var(--muted);text-decoration:none}.hero{padding:54px 0 34px}.eyebrow{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:8px 12px;color:#c4b5fd;background:rgba(124,92,255,.12);font-size:.92rem}.hero h1{max-width:940px;font-size:clamp(2.35rem,6vw,5.15rem);line-height:1;letter-spacing:-.07em;margin:22px 0}.lead{max-width:800px;color:var(--muted);font-size:clamp(1.08rem,1.8vw,1.28rem)}.cta{display:flex;gap:14px;flex-wrap:wrap;margin-top:28px}.btn{display:inline-flex;align-items:center;justify-content:center;border-radius:14px;padding:14px 20px;font-weight:750;text-decoration:none}.primary{background:linear-gradient(135deg,var(--brand),var(--brand2));color:white}.secondary{border:1px solid var(--line);background:rgba(255,255,255,.06)}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin:34px 0}.card{border:1px solid var(--line);border-radius:24px;background:rgba(16,24,39,.78);padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.24)}.card h2,.card h3{letter-spacing:-.035em;line-height:1.12;margin-top:0}.muted{color:var(--muted)}.section{padding:34px 0}.article{max-width:840px}.article h2{font-size:clamp(1.65rem,3vw,2.35rem);letter-spacing:-.04em;line-height:1.14;margin-top:2rem}.article h3{font-size:1.2rem;letter-spacing:-.025em}.links{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:28px 0}.links a{border:1px solid var(--line);border-radius:16px;padding:14px;text-decoration:none;background:rgba(255,255,255,.05)}details{border:1px solid var(--line);border-radius:18px;padding:16px 18px;margin:12px 0;background:rgba(255,255,255,.05)}summary{cursor:pointer;font-weight:750}.footer{border-top:1px solid var(--line);color:var(--muted);padding:28px 0;margin-top:42px}.breadcrumb{color:var(--muted);font-size:.94rem;margin-top:8px}.dates{color:var(--muted);font-size:.94rem;margin:18px 0 0}.answer{max-width:840px;border:1px solid var(--line);border-left:4px solid var(--brand);border-radius:20px;background:rgba(16,24,39,.78);padding:22px 26px}.answer h2{font-size:clamp(1.35rem,2.4vw,1.8rem);letter-spacing:-.035em;line-height:1.18;margin:0 0 10px}.answer p{margin:0}@media(max-width:760px){.nav{align-items:flex-start;flex-direction:column}.nav div{justify-content:flex-start}.grid,.links{grid-template-columns:1fr}.hero{padding-top:34px}.hero h1{letter-spacing:-.045em}}
""".strip()

PAGES = [
    {"slug": "ai-debate-practice", "title": "AI Debate Practice Platform | {product}", "description": "Practice debate online with {product}: AI opponents, targeted drills, rebuttal feedback, evidence research, argument flowcharts, and tournament-ready prep tools.", "eyebrow": "{product} guide", "h1": "AI Debate Practice for Stronger Cases, Rebuttals, and Speeches", "lead": "Use a focused debate workspace for cases, rebuttals, sources, flowcharts, coaching, and timed practice."},
    {"slug": "ai-debate-case-generator", "title": "AI Debate Case Generator with Citations | {product}", "description": "Use an AI debate case generator to draft structured cases with claims, warrants, impacts, and evidence leads, then verify sources before round.", "eyebrow": "Tool guide", "h1": "AI Debate Case Generator with Citations", "lead": "Draft faster, verify carefully, and walk into the round with a structured case."},
    {"slug": "debate-rebuttal-practice", "title": "Debate Rebuttal Practice & Argument Analyzer | {product}", "description": "Practice rebuttals with {product}. Analyze arguments, find weak warrants, missing weighing, logical gaps, and cross-examination traps before your round.", "eyebrow": "Feature guide", "h1": "Practice Rebuttals Before Your Opponent Finds the Weakness", "lead": "Choose the link to attack, explain why it matters, and turn pressure into round-winning collapse."},
    {"slug": "ai-debate-coach", "title": "AI Debate Coach for Strategy, Structure & Practice | {product}", "description": "Ask {product}'s AI debate coach for help with strategy, argument structure, weighing, rebuttals, speeches, prep questions, and practice feedback.", "eyebrow": "Feature guide", "h1": "Ask an AI Debate Coach for Round-Ready Prep", "lead": "Get focused help with strategy, structure, weighing, rebuttals, speeches, and practice feedback."},
    {"slug":"debate-evidence-finder","title":"Debate Evidence Finder for Source-Backed Cases | DebateLab","description":"Find evidence leads for debate cases with DebateLab, then verify original sources, citations, warrants, and impact links before using them in round.","eyebrow":"Research workflow","h1":"Find Better Debate Evidence Without Losing the Argument","lead":"Use AI to locate research directions, then verify sources and connect evidence to warrants.","features":["Evidence leads","Citation checks","Impact links"],"sections":[("Evidence is not the argument",["Cards win rounds only when they support a clear warrant. A source should answer a burden, not decorate a speech.","DebateLab helps move from a claim to research leads, source checks, and the impact comparison the judge must evaluate."]),("Verify before you read it aloud",["Open the original source, check date and author, confirm the quote, and explain why the evidence proves your link. Never rely on an AI summary alone."]),("Connect research to clash",["The best evidence pages are tied to specific clashes: solvency, harms, tradeoffs, comparative examples, and weighing."])]},
    {"slug":"argument-flowchart","title":"Argument Flowchart Tool for Debate Prep | DebateLab","description":"Map debate arguments, clash, links, impacts, and weighing with DebateLab's argument flowchart workflow for clearer speeches and rebuttals.","eyebrow":"Flowing guide","h1":"Map the Clash With an Argument Flowchart","lead":"Turn cases and rebuttals into a visual map of claims, warrants, impacts, and weighing.","features":["Visual clash maps","Link chains","Weighing notes"],"sections":[("Why flowcharts help debaters",["Debate rounds become messy fast. A flowchart keeps the important relationships visible: what claim depends on which warrant, where the clash sits, and what impact comparison matters."]),("Build from the motion outward",["Start with burdens, add each contention, then connect evidence and rebuttals. If a link is missing, the map makes the gap obvious."]),("Use the map for speeches",["Before speaking, choose the path that wins the round. A good flowchart helps you collapse instead of spreading yourself thin."])]},
    {"slug":"online-debate-timer","title":"Debate Speech Times by Format: How Timing Works | DebateLab","description":"How long debate speeches are in Public Forum, Lincoln-Douglas, Policy, British Parliamentary and World Schools, with cross-examination, prep time and drills for practising against the clock.","eyebrow":"Timing guide","h1":"How Debate Speech Times Work in Each Format","lead":"Speech lengths, cross-examination and prep time for the main formats, and how to practise against the clock.","tool":("Open the free debate timer","/tools/debate-timer"),"features":["Speech timing","Prep drills","Pacing feedback"],"sections":[("Timing changes strategy",["A great argument can still lose if it arrives too late or takes too long. Timed practice forces you to pick the strongest material."]),("Drill one skill at a time",["Use short timers for rebuttal blocks, longer timers for full speeches, and prep timers to simulate tournament pressure."]),("Pair timing with feedback",["After each timed speech, use DebateLab to identify unclear structure, missing weighing, and the next drill to repeat."])]},
    {"slug":"how-to-write-a-debate-case","title":"How to Write a Debate Case | {product} Guide","description":"Learn how to write a debate case with a clear motion analysis, burdens, contentions, warrants, evidence, impacts, and weighing using {product}.","eyebrow":"How-to guide","h1":"How to Write a Debate Case","lead":"Move from motion analysis to contentions, warrants, evidence, impacts, and weighing.","features":["Motion analysis","Contention structure","Weighing"],"sections":[("Start with burdens",["Before writing contentions, define what your side must prove. A case that misses the burden can sound polished and still lose."]),("Write contentions as reasoning chains",["Each contention should connect claim, warrant, evidence, impact, and weighing. If one piece is missing, mark it before you practice."]),("Pressure-test the draft",["Use {product} to attack your own case. The strongest final version usually comes after finding the easiest rebuttals first."])]},
    {"slug":"how-to-practice-rebuttals","title":"How to Practice Rebuttals for Debate | {product} Guide","description":"Learn how to practice debate rebuttals with drills for warrants, evidence quality, impact weighing, cross-examination, and speech collapse.","eyebrow":"How-to guide","h1":"How to Practice Debate Rebuttals","lead":"Build sharper responses by attacking warrants, evidence, impacts, and weighing one drill at a time.","features":["Rebuttal drills","Cross-ex questions","Collapse practice"],"sections":[("Do not rebut everything",["Good rebuttal practice teaches selection. Answer the argument that determines the round, not every sentence your opponent says."]),("Use repeatable drills",["Run separate drills for weak warrants, missing examples, evidence quality, impact defense, and comparative weighing."]),("Turn attacks into speeches",["After finding objections, practice explaining them under time. The goal is a clean speech, not a long list of notes."])]},
    {"slug": "public-forum-debate", "title": "Public Forum Debate Prep with AI | {product}", "description": "Prepare for Public Forum debate with {product}: case construction, rebuttal drills, summary and final focus practice, crossfire prep, and evidence research.", "eyebrow": "Format guide", "h1": "Public Forum Debate Prep with AI", "lead": "Practice PF cases, rebuttals, crossfire, summary, and final focus with AI feedback.", "features": ["PF case building", "Crossfire prep", "Summary and final focus"], "sections": [["How PF cases work", ["A PF case has two contentions, each with a claim, warrant, impact, and evidence. The strongest cases also include pre-emption and weighing from the constructive.", "{product} helps you draft, attack, and refine PF cases before the round."]], ["Crossfire and rebuttal practice", ["Crossfire exposes weak warrants and missing evidence. Use {product} to generate likely crossfire questions and practice ten-second rebuttal blocks."]], ["Summary and final focus", ["The best summaries collapse to the winning argument. Practice selecting the right clash and framing the ballot for the judge."]]]},
    {"slug": "lincoln-douglas-debate", "title": "Lincoln-Douglas Debate Prep with AI | DebateLab", "modified": "2026-10-23", "description": "Prepare for Lincoln-Douglas debate with DebateLab: value and criterion structure, case writing, rebuttal drills, cross-examination, and value debate practice.", "eyebrow": "Format guide", "h1": "Lincoln-Douglas Debate Prep with AI", "lead": "Build LD cases with values, criteria, contentions, and rebuttal blocks.", "features": ["Value and criterion structure", "LD case writing", "Cross-examination prep"], "sections": [["Values and criteria", ["LD is a value debate. Your value tells the judge what matters; your criterion measures whether you achieve it. DebateLab helps you test whether your criterion actually links to your value."]], ["Case structure for LD", ["A strong LD case has an opening quote, definitions, value, criterion, and contentions with warrants and impacts. Use DebateLab to draft and pressure-test each piece.", "Paste the written case into the [speech time calculator](/tools/speech-time-calculator) to check that it fits the six-minute affirmative or seven-minute negative constructive."]], ["Cross-examination and rebuttal", ["Cross-ex in LD exposes weak links between value and criterion. Practice generating likely CX questions and building rebuttal blocks for common LD arguments."]]]},
    {"slug": "policy-debate", "title": "Policy Debate Prep with AI | DebateLab", "modified": "2026-10-23", "description": "Prepare for Policy/CX debate with DebateLab: plan text, advantages, disadvantages, counterplans, topicality, and kritik prep with AI-assisted research.", "eyebrow": "Format guide", "h1": "Policy Debate Prep with AI", "lead": "Build plans, DAs, counterplans, and kritik prep blocks for CX debate.", "features": ["Plan and advantage writing", "DA and counterplan prep", "Topicality and kritik blocks"], "sections": [["How policy debate works", ["Policy debate asks whether a plan should be adopted. Prep involves plans, advantages, disadvantages, counterplans, topicality, and kritiks.", "DebateLab helps you draft and attack each component.", "The [free debate timer](/tools/debate-timer) runs the NSDA 8-3-5 round order, with each cross-examination and each team's prep time."]], ["Researching DAs and counterplans", ["Use DebateLab to find potential disadvantages, test counterplan competition, and build blocks for common DA scenarios."]], ["Kritik and theory prep", ["Kritiks challenge assumptions behind the opponent's framework. DebateLab can help you brainstorm kritik arguments and theory blocks."]]]},
    {"slug": "british-parliamentary-debate", "title": "British Parliamentary Debate Prep with AI | DebateLab", "modified": "2026-10-23", "description": "Prepare for British Parliamentary debate with DebateLab: motion analysis, government and opposition roles, extensions, POIs, and comparative weighing.", "eyebrow": "Format guide", "h1": "British Parliamentary Debate Prep with AI", "lead": "Practice BP roles, extensions, POIs, and comparative weighing.", "features": ["Motion analysis", "Extension strategy", "POI practice"], "sections": [["BP roles and strategy", ["BP has four teams: Opening Government, Opening Opposition, Closing Government, Closing Opposition. Each role has different responsibilities and winning strategies."]], ["Extensions that win", ["Closing teams must extend by adding new analysis, not repeating opening arguments. DebateLab helps you brainstorm credible extensions from any motion."]], ["POIs and weighing", ["Points of information expose holes in reasoning. Practice generating and answering POIs, and compare impacts clearly for the judge.", "The [free debate timer](/tools/debate-timer) has a BP preset that knocks when points of information open after the first minute and close before the last."]]]},
    {"slug": "congress-debate", "title": "Congressional Debate Prep with AI | DebateLab", "description": "Prepare for Congressional debate with DebateLab: bill analysis, speeches, questioning, ranking, and crystallization practice for congress rounds.", "eyebrow": "Format guide", "h1": "Congressional Debate Prep with AI", "lead": "Draft congress speeches, practice questioning, and prepare crystallization.", "features": ["Bill analysis", "Speech drafting", "Questioning prep"], "sections": [["Bill analysis and speeches", ["Congress debate requires understanding legislation, sponsorship, and opposition. DebateLab helps you draft speeches that add value, not repetition."]], ["Questioning and ranking", ["Effective questioning exposes flaws in reasoning without grandstanding. Practice generating pointed congress questions and ranking arguments for crystallization."]], ["Crystallization speeches", ["Crystallization means telling the judges why your side won the key clashes. Practice selecting the right arguments and framing the ballot."]]]},
    {"slug": "world-schools-debate", "title": "World Schools Debate Prep with AI | DebateLab", "description": "Prepare for World Schools Style debate with DebateLab: motion analysis, burdens, speeches, POIs, reply speeches, and team coordination.", "eyebrow": "Format guide", "h1": "World Schools Debate Prep with AI", "lead": "Practice WSDC motions, burdens, POIs, and reply speech framing.", "features": ["Motion interpretation", "Burden analysis", "Reply speech practice"], "sections": [["Motion interpretation", ["WSDC motions are broad. Define the model carefully, identify stakeholders, and clarify what each side must prove before writing speeches."]], ["Team roles in WSDC", ["First speaker sets up, second speaker extends, third speaker weighs and rebuts, reply speaker frames the ballot. Practice each role with DebateLab."]], ["POIs and reply speeches", ["POIs test warrants under pressure. Reply speeches summarize the round without new arguments. Practice both to improve your WSDC prep."]]]},
    {"slug": "how-to-weigh-in-debate", "title": "How to Weigh in Debate: Magnitude, Probability, Timeframe | DebateLab", "description": "Learn how to weigh in debate using magnitude, probability, timeframe, reversibility, scope, and link strength to frame the ballot for the judge.", "eyebrow": "How-to guide", "h1": "How to Weigh in Debate", "lead": "Use impact calculus to tell the judge why your argument matters more.", "features": ["Magnitude vs probability", "Timeframe and scope", "Link strength and reversibility"], "sections": [["Why weighing wins rounds", ["If both sides have offense, the judge needs a reason to prefer yours. Weighing gives them that reason by comparing impacts across multiple dimensions."]], ["Types of weighing", ["Magnitude: how big is the impact? Probability: how likely is it? Timeframe: how soon? Reversibility: can it be undone? Scope: who is affected? Link strength: how certain is the causal chain?"]], ["When to weigh", ["Start weighing in the constructive, reinforce in rebuttals, and crystallize in the final speech. Late weighing is better than no weighing, but early weighing frames the entire round."]]]},
    {"slug": "how-to-cross-examine-in-debate", "title": "How to Cross-Examine in Debate | DebateLab Guide", "description": "Learn how to cross-examine in debate with targeted questions that expose weak warrants, missing evidence, flawed logic, and unsupported impacts.", "eyebrow": "How-to guide", "h1": "How to Cross-Examine in Debate", "lead": "Ask questions that expose assumptions, not questions that let the opponent talk.", "features": ["Leading questions", "Warrant exposure", "Time management"], "sections": [["The goal of cross-examination", ["Cross-ex is not a speech. It is a tool to expose weaknesses. Ask leading questions that force concessions or reveal unsupported claims."]], ["Common cross-ex mistakes", ["Asking open-ended questions, arguing instead of questioning, and running out of time without making a point are the most common errors."]], ["How to use cross-ex in your speech", ["Take the concessions from cross-ex and use them in your rebuttal. If the opponent admitted the warrant is weak, remind the judge."]]]},
    {"slug": "how-to-prepare-for-a-debate-tournament", "title": "How to Prepare for a Debate Tournament | DebateLab Guide", "description": "Learn how to prepare for a debate tournament: topic research, case writing, rebuttal blocks, speech timing, and tournament-day strategy.", "eyebrow": "How-to guide", "h1": "How to Prepare for a Debate Tournament", "lead": "From topic release to tournament day, build a prep system that works.", "features": ["Topic research", "Block files", "Tournament-day checklist"], "sections": [["Topic research workflow", ["Start with topic analysis, identify key clashes, research both sides, and build case templates. DebateLab helps you move from topic to structured prep."]], ["Building block files", ["Block files are pre-written responses to common arguments. Use DebateLab to brainstorm likely arguments and prepare blocks before the tournament."]], ["Tournament day checklist", ["Bring extra pens, backup evidence, water, snacks, a timer, and a plan for each round. Mental stamina matters as much as preparation."]]]},
    {"slug": "how-to-flow-in-debate", "title": "How to Flow in Debate | DebateLab Guide", "description": "Learn how to flow in debate: track arguments, map clash, visualize links and impacts, and use your flow to write better speeches and rebuttals.", "eyebrow": "How-to guide", "h1": "How to Flow in Debate", "lead": "Flowing is the skill that separates good debaters from great ones.", "features": ["Argument tracking", "Clash mapping", "Speech organization"], "sections": [["Why flowing matters", ["If you cannot see the argument structure, you cannot respond strategically. Flowing keeps the full round visible on one page."]], ["How to flow efficiently", ["Use columns for each speech, abbreviate claims and warrants, track the flow of arguments across speeches, and mark dropped arguments."]], ["Using your flow in speeches", ["Before you speak, look at the flow and decide which clashes you must win. Your speech should trace the flow, not introduce random new arguments."]]]},
    {"slug": "ai-rebuttal-generator", "title": "AI Rebuttal Generator for Debate | {product}", "description": "Use an AI rebuttal generator to find weak warrants, build targeted blocks, and practice responses to common debate arguments.", "eyebrow": "Tool guide", "h1": "AI Rebuttal Generator for Debate", "lead": "Find the weak link, build the block, and practice the response.", "features": ["Weak warrant detection", "Block building", "Response practice"], "sections": [["What an AI rebuttal generator should do", ["A useful tool points you to the weakest part of the opponent's argument and helps you build a targeted response, not a generic counter-narrative."]], ["How to use generated rebuttals", ["Take the generated block, adapt it to the specific argument, and practice saying it under time. The best rebuttals are concise and repeated."]], ["Pair with cross-ex", ["If your rebuttal attacks a warrant, your cross-ex should force the opponent to defend or abandon that warrant. Practice both with {product}."]]]},
    {"slug": "debate-topics-for-students", "title": "Debate Topics for Students | {product}", "description": "Browse debate topics for students organized by format, difficulty, and subject, with AI-assisted case brainstorming and prep workflows.", "eyebrow": "Resource", "h1": "Debate Topics for Students", "lead": "Find topics, brainstorm cases, and start preparing with AI-guided prompts.", "features": ["Topic categories", "Case brainstorming", "Format-specific topics"], "sections": [["How to pick a debate topic", ["A good topic has clear clashes, real-world stakes, and enough literature for both sides. {product} can help you brainstorm cases from any topic."]], ["Popular debate topics", ["Common topic areas include technology, education, environment, foreign policy, civil liberties, economics, and ethics. Each area has predictable clashes."]], ["From topic to prep", ["Once you pick a topic, use {product} to draft a case, attack it, find evidence leads, and practice the speech."]]]},
    {"slug": "debate-clash-points", "title": "Debate Clash Points: Finding and Attacking the Key Argument | DebateLab", "description": "Learn how to identify debate clash points, select the winning clash, and frame the ballot for the judge in any debate format.", "eyebrow": "Strategy guide", "h1": "Debate Clash Points: Find and Attack the Key Argument", "lead": "Identify the clash that decides the round and focus your prep there.", "features": ["Clash identification", "Clash selection", "Ballot framing"], "sections": [["What is a clash point", ["A clash is the point where two sides disagree. The key clash is the one the judge must resolve to decide the round."]], ["How to find the key clash", ["Ask: which disagreement, if resolved in my favor, wins me the round? That is the clash to focus on."]], ["Framing the clash for the judge", ["Tell the judge why this clash matters and why your side wins it. If you frame the clash, you frame the ballot."]]]},
    {"slug": "debate-fallacies", "title": "Common Debate Fallacies and How to Attack Them | DebateLab", "description": "Learn common logical fallacies in debate: ad hominem, straw man, false dichotomy, slippery slope, and how to turn them into rebuttal opportunities.", "eyebrow": "Strategy guide", "h1": "Common Debate Fallacies and How to Attack Them", "lead": "Turn your opponent's bad logic into round-winning rebuttals.", "features": ["Fallacy identification", "Attack strategies", "Cross-ex exploitation"], "sections": [["Why fallacies matter", ["If your opponent commits a fallacy, you can win the clash by pointing it out and explaining why the argument fails."]], ["Common fallacies in debate", ["Ad hominem, straw man, false dichotomy, slippery slope, hasty generalization, appeal to authority, and circular reasoning are the most common."]], ["How to attack a fallacy", ["Do not just name it. Explain why the logic fails, why the conclusion does not follow, and what the judge should do about it."]]]},
    {"slug": "debate-prep-time-management", "modified": "2026-10-23", "title": "Debate Prep Time Management | DebateLab Guide", "description": "Learn how to manage prep time in debate: allocation strategies, block building, speech prioritization, and tournament-day prep workflow.", "eyebrow": "Strategy guide", "h1": "Debate Prep Time Management", "lead": "Use your limited prep time to build the arguments that win rounds.", "features": ["Prep allocation", "Block building strategy", "Speech prioritization"], "sections": [["Why prep management matters", ["Prep time is limited. The best debaters spend it on the clashes that decide the round, not on reading every card."]], ["How to allocate prep time", ["Spend the first third on case structure, the second on rebuttal blocks, and the last on speech organization and weighing.", "If you write speeches out, the [speech time calculator](/tools/speech-time-calculator) shows how long a draft takes to deliver and which speech slots it fits."]], ["Tournament-day prep", ["Before the round, organize evidence, confirm arguments, and practice the opening. During prep time, prioritize blocks over new research.", "To practice under real limits, the [free debate timer](/tools/debate-timer) keeps a prep bank for each side in Public Forum, Lincoln-Douglas and Policy."]]]},
    {"slug": "debate-judge-adaptation", "title": "Debate Judge Adaptation Guide | DebateLab", "description": "Learn how to adapt to different debate judges: lay judges, tech judges, flow judges, and how to read the room for better ballot outcomes.", "eyebrow": "Strategy guide", "h1": "Debate Judge Adaptation Guide", "lead": "Read the judge, adapt your style, and frame the ballot they want to write.", "features": ["Judge types", "Style adaptation", "Ballot framing"], "sections": [["Types of judges", ["Lay judges want clear stories, flow judges want structured clash, tech judges want speed and evidence. Read the judge and adapt."]], ["How to adapt your style", ["Slow down for lay judges, speed up for tech judges, and always explain your weighing clearly regardless of judge type."]], ["Framing the ballot", ["Give the judge a reason to vote for you that fits their style. The best debaters make the judge's job easy."]]]},
    {"slug": "ai-vs-traditional-debate-prep", "title": "AI vs Traditional Debate Prep | DebateLab", "description": "Compare AI debate prep tools with traditional research and coaching methods, and learn how to combine both for the strongest tournament preparation.", "eyebrow": "Comparison", "h1": "AI vs Traditional Debate Prep", "lead": "AI speeds up structure; traditional research and coaching provide depth and judgment.", "features": ["Speed and structure", "Research depth", "Human judgment"], "sections": [["What AI does well", ["AI generates structure fast: case outlines, rebuttal blocks, topic brainstorming, and evidence leads. It saves time on the repetitive parts of prep."]], ["What traditional prep does better", ["Original source reading, real coaching feedback, tournament-specific strategy, and adapting to a specific opponent all require human judgment."]], ["How to combine them", ["Use AI for scaffolding, use traditional research for depth, and use coaching for strategy. DebateLab supports the AI scaffolding step."]]]},
    {"slug": "debate-block-file-guide", "title": "How to Build a Debate Block File | DebateLab", "description": "Learn how to build a debate block file with pre-written responses to common arguments, structured by clash, and ready for use in round.", "eyebrow": "Strategy guide", "h1": "How to Build a Debate Block File", "lead": "Pre-written blocks let you respond faster and more precisely in round.", "features": ["Block structure", "Clash organization", "Evidence integration"], "sections": [["What is a block file", ["A block file is a collection of pre-written responses to common arguments. It saves prep time and improves response quality in round."]], ["How to organize blocks", ["Organize by clash, not by topic. Each clash should have blocks for both sides so you are ready regardless of which side you are assigned."]], ["Using AI to build blocks", ["DebateLab can help you brainstorm likely arguments and draft initial blocks. Verify the logic and evidence before using them in round."]]]},
    {"slug": "debate-speech-structure", "title": "Debate Speech Structure Guide | DebateLab", "description": "Learn debate speech structure for every format: opening, rebuttal, summary, final focus, crystallization, and reply speech organization.", "eyebrow": "Strategy guide", "h1": "Debate Speech Structure Guide", "lead": "Structure your speech so the judge can follow every argument and every comparison.", "features": ["Opening structure", "Rebuttal structure", "Final speech structure"], "sections": [["Why structure matters", ["A well-structured speech is easier to flow, easier to judge, and easier to win. The judge should never be confused about where you are."]], ["Opening speech structure", ["State your position, define key terms, present contentions with warrants and impacts, and preview weighing."]], ["Rebuttal and final speech structure", ["Respond to the key clash, extend your offense, weigh the comparison, and frame the ballot. End by telling the judge why you win."]]]},
    {"slug": "debate-motion-analysis", "modified": "2026-10-23", "title": "Debate Motion Analysis Guide | DebateLab", "description": "Learn how to analyze a debate motion: define terms, identify burdens, map clashes, and build case strategy from the topic release.", "eyebrow": "Strategy guide", "h1": "Debate Motion Analysis Guide", "lead": "From topic to strategy: define, clash, and build a winning case.", "features": ["Definition strategy", "Burden identification", "Clash mapping"], "sections": [["How to analyze a motion", ["Read the motion carefully, define each term, identify what each side must prove, and map the likely clashes.", "To practice on a motion you have not seen, draw one from the [free debate motion generator](/tools/debate-motion-generator)."]], ["Definition strategy", ["Definitions can frame the round. Choose definitions that are fair, defensible, and favorable to your side."]], ["Burden identification", ["Your burden is what you must prove to win. If you do not meet your burden, you lose regardless of how well you argue."]]]},
    {"slug": "debate-collapsing-strategy", "title": "How to Collapse in Debate | DebateLab Guide", "description": "Learn how to collapse in debate: select the winning clash, drop losing arguments, and concentrate your time on the comparison that wins the ballot.", "eyebrow": "Strategy guide", "h1": "How to Collapse in Debate", "lead": "Collapsing means choosing the few arguments that win and abandoning the rest.", "features": ["Clash selection", "Time concentration", "Ballot framing"], "sections": [["Why collapsing matters", ["If you spread yourself thin, you lose. Collapsing lets you spend more time on the argument that actually wins the round."]], ["How to decide what to collapse to", ["Pick the clash where you have the strongest evidence, the clearest warrant, and the best weighing. Drop the rest cleanly."]], ["How to collapse cleanly", ["Signal that you are collapsing, explain why the dropped arguments do not matter, and spend your remaining time on the winning clash."]]]},
    {"slug": "debate-pronunciation-and-delivery", "title": "Debate Speech Delivery and Pronunciation Guide | DebateLab", "description": "Improve your debate speech delivery with tips on clarity, pacing, emphasis, pronunciation, and using pauses for judge-friendly presentations.", "eyebrow": "Delivery guide", "h1": "Debate Speech Delivery and Pronunciation Guide", "lead": "Clear delivery makes your arguments land. Slow down, emphasize key words, and pause where it matters.", "features": ["Clarity and pacing", "Emphasis techniques", "Pause strategy"], "sections": [["Why delivery matters", ["The judge cannot vote for an argument they did not hear clearly. Speed without clarity is wasted effort."]], ["How to improve delivery", ["Slow down on tags and author names, pause between contentions, and emphasize weighing phrases. Practice with a timer and record yourself."]], ["Common delivery problems", ["Speaking too fast, mumbling, monotone delivery, and forgetting to pause. Each of these can cost you rounds even with strong arguments."]]]},
    {"slug": "best-ai-debate-tools", "title": "Best AI Debate Tools Compared | {product}", "description": "Compare the best AI debate tools for case generation, rebuttal practice, evidence research, flowcharts, coaching, and tournament preparation.", "eyebrow": "Comparison", "h1": "Best AI Debate Tools Compared", "lead": "See how AI debate tools compare on features, formats, and prep workflows."},
    {"slug": "debatelab-pricing", "title": "DebateLab Pricing and Plans | DebateLab", "description": "DebateLab pricing and plans for AI debate practice: free trial, Pro features, and what is included for students and competitive debaters.", "eyebrow": "Pricing", "h1": "DebateLab Pricing and Plans", "lead": "See what DebateLab offers and how to get started with AI debate practice."},
    {"slug": "debatelab-vs-chatgpt", "title": "{product} vs ChatGPT for Debate Prep | {product}", "description": "Compare {product} vs ChatGPT for debate prep: structured workflows vs generic chat, evidence research, rebuttal drills, case generation, and coaching.", "eyebrow": "Comparison", "h1": "{product} vs ChatGPT for Debate Prep", "lead": "ChatGPT is a general chatbot. {product} is a debate practice workspace.", "features": ["Structured workflows", "Evidence leads", "Practice tools"], "sections": [["What ChatGPT does well", ["ChatGPT is a flexible general-purpose AI. It can brainstorm, draft, and answer questions about any topic, including debate."]], ["What {product} does differently", ["{product} is designed for debate prep workflows: case structure, targeted rebuttals, evidence leads, argument flowcharts, coaching prompts, and timed practice. Each workflow supports a specific prep task."]], ["When to use each", ["Use ChatGPT for general brainstorming and research. Use {product} for structured, repeatable debate practice that mirrors what you do in a round."]]]},
    {"slug": "debatelab-vs-windebate", "title": "DebateLab vs WinDebate Comparison | DebateLab", "description": "Compare DebateLab vs WinDebate: case generation, rebuttal drills, evidence research, format coverage, pricing, and workflow differences.", "eyebrow": "Comparison", "h1": "DebateLab vs WinDebate", "lead": "Two AI debate prep platforms compared on features and workflows.", "features": ["Feature comparison", "Format coverage", "Workflow differences"], "sections": [["WinDebate overview", ["WinDebate focuses on research, drills, feedback, and progress tracking for competitive debaters. It covers PF, LD, Congress, Policy, and Worlds."]], ["DebateLab overview", ["DebateLab focuses on structured prep workflows: case generation, rebuttal practice, evidence leads, argument flowcharts, coaching prompts, and online debate timers."]], ["How to choose", ["Compare format coverage, feature depth, feedback style, pricing, and which tool fits your actual tournament workflow."]]]},
    {"slug": "debatelab-vs-debateclub", "title": "DebateLab vs DebateClub Comparison | DebateLab", "description": "Compare DebateLab vs DebateClub: voice debating, case generation, rebuttal drills, evidence research, and workflow differences for competitive debaters.", "eyebrow": "Comparison", "h1": "DebateLab vs DebateClub", "lead": "Voice sparring vs structured prep: two approaches to AI debate practice.", "features": ["Voice vs text workflows", "Feature comparison", "Prep focus areas"], "sections": [["DebateClub overview", ["DebateClub focuses on voice-based AI debate sparring with real-time feedback in a conversational format."]], ["DebateLab overview", ["DebateLab focuses on text-based structured prep: cases, rebuttals, evidence, flowcharts, coaching, and timed practice for tournament preparation."]], ["Which approach fits you", ["If you want voice practice, DebateClub is focused there. If you want structured prep workflows, DebateLab is designed for that."]]]},
]

FAQS = [
    ("Is {product} an AI debate practice platform?", "Yes. {product} focuses on debate prep workflows such as cases, rebuttals, evidence, flowcharts, coaching, and timing."),
    ("Should students verify AI-generated debate evidence?", "Yes. AI can suggest research leads, but students should check original sources before using evidence in round."),
]

def tool_keys(name):
    """The tool keys in one of the lists in tool-links.tsx, in order."""
    block = re.search(rf"export const {name} = \[(.*?)\] satisfies", TOOL_LINKS, re.S)
    keys = re.findall(r"\bkey: '([^']+)'", block.group(1)) if block else []
    if not keys or len(keys) != block.group(1).count("{"):
        raise SystemExit(f"Could not read every tool in {name} in tool-links.tsx")
    return keys

def names(keys):
    """Tool names as the landing page shows them (features.<key> in en.json), joined with "and"."""
    labels = [EN["features"][key] for key in keys]
    return labels[0] if len(labels) == 1 else ", ".join(labels[:-1]) + " and " + labels[-1]

# The app's tool lists are the source of truth for how many modes there are.
TOOL_LINKS = (ROOT / "src" / "components" / "features" / "tools" / "tool-links.tsx").read_text()
EN = json.loads((ROOT / "src" / "locales" / "en.json").read_text())
PREP_MODES = tool_keys("PREPARE_TOOLS") + tool_keys("PRACTICE_TOOLS")
UTILITIES = tool_keys("UTILITY_TOOLS")

def free_tools():
    """(route, name, blurb) for each no-login tool under /tools, from FREE_TOOLS in ToolPageLayout.tsx."""
    source = (ROOT / "src" / "components" / "free-tools" / "ToolPageLayout.tsx").read_text()
    block = re.search(r"export const FREE_TOOLS = \[(.*?)\] as const", source, re.S)
    tools = re.findall(r"route: '([^']+)', name: '([^']+)', blurb: '([^']+)'", block.group(1)) if block else []
    if not tools or len(tools) != block.group(1).count("{"):
        raise SystemExit("Could not read every tool in FREE_TOOLS in ToolPageLayout.tsx")
    return tools

FREE_TOOLS = free_tools()
TOKENS = {
    "{product}": PRODUCT,
    "{pro_price}": PRO_PRICE,
    "{mode_count}": str(len(PREP_MODES)),
    "{mode_names}": names(PREP_MODES),
    "{utility_names}": names(UTILITIES),
}

def fill(value):
    """Replaces the tokens in TOKENS ({product}, {pro_price}, {mode_count}, ...) in page copy."""
    if isinstance(value, str):
        for token, text in TOKENS.items():
            value = value.replace(token, text)
        return value
    if isinstance(value, dict):
        return {key: fill(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return type(value)(fill(item) for item in value)
    return value

# Long-form guides replace a page's features and sections and add its own FAQs.
# Merging by slug keeps PAGES in order, which internal_links() depends on.
PAGES = [fill({**page, **GUIDES.get(page["slug"], {})}) for page in PAGES]
FAQS = fill(FAQS)
ANSWERS = fill(ANSWERS)

NAV = [("AI practice","/ai-debate-practice"),("Case generator","/ai-debate-case-generator"),("Rebuttal practice","/debate-rebuttal-practice"),("Evidence finder","/debate-evidence-finder"),("Pricing","/debatelab-pricing"),("Open app","/app")]

SOFTWARE_ID = BASE + "/#software"
ORGANIZATION_REF = {"@type": "Organization", "@id": BASE + "/#organization", "name": ORGANIZATION, "url": BASE + "/", "logo": BASE + "/icon-1024.png"}
SOFTWARE = {
    "@type": "SoftwareApplication",
    "@id": SOFTWARE_ID,
    "name": BRAND,
    "alternateName": PRODUCT,
    "description": DEFINITION,
    "applicationCategory": "EducationalApplication",
    "operatingSystem": "Web",
    "url": BASE + "/",
    "inLanguage": ["en", "es", "hu"],
    "featureList": [EN["features"][key] for key in PREP_MODES + UTILITIES],
    "offers": [
        {"@type": "Offer", "name": "Free trial", "price": "0", "priceCurrency": PRICING["currency"], "description": f"{PRICING['trialDays']}-day free trial, no credit card required."},
        {"@type": "Offer", "name": "Pro", "price": PRICING["proMonthly"], "priceCurrency": PRICING["currency"], "description": "Monthly subscription, billed plus tax.", "priceSpecification": {"@type": "UnitPriceSpecification", "price": PRICING["proMonthly"], "priceCurrency": PRICING["currency"], "billingDuration": "P1M", "valueAddedTaxIncluded": False}},
    ],
    "publisher": {"@id": BASE + "/#organization"},
}

def page_url(slug):
    return f"{BASE}/{slug}"

def esc(s):
    return html.escape(s, quote=True)

def long_date(iso):
    value = date.fromisoformat(iso)
    return f"{value.strftime('%B')} {value.day}, {value.year}"

def json_script(data):
    """JSON for a <script> element. Entities are not decoded there, so only "<" is escaped."""
    return json.dumps(data, separators=(",", ":"), ensure_ascii=False).replace("<", "\\u003c")

def lead_answer(page):
    """The page's main question and its short answer, checked so no page drifts."""
    slug = page["slug"]
    if slug not in ANSWERS:
        raise SystemExit(f"{slug} has no entry in seo_answers.ANSWERS")
    question, answer = ANSWERS[slug]
    words = len(answer.split())
    if not question.endswith("?"):
        raise SystemExit(f"{slug}: the lead question must end with '?'")
    if words > ANSWER_MAX_WORDS:
        raise SystemExit(f"{slug}: the lead answer has {words} words; the limit is {ANSWER_MAX_WORDS}")
    return question, answer

def internal_links(current):
    links = [(p["title"].replace(f" | {PRODUCT}", "").replace(f" | {PRODUCT} Guide", ""), "/" + p["slug"]) for p in PAGES if p["slug"] != current]
    chosen = links[:8]
    if current in [p["slug"] for p in PAGES[:8]]:
        chosen = links[8:16]
    return "\n".join(f'<a href="{esc(href)}">{esc(label)}</a>' for label, href in chosen[:8])

def feature_card(feature):
    """A highlight card: a title, or a (title, description) pair."""
    if isinstance(feature, str):
        return f'<article class="card"><h3>{esc(feature)}</h3></article>'
    title, description = feature
    return f'<article class="card"><h3>{esc(title)}</h3><p class="muted">{esc(description)}</p></article>'

def linked(text):
    """Escaped text in which [label](/path) becomes a link to that page on this site."""
    parts = re.split(r"\[([^\]]+)\]\((/[^)\s]*)\)", text)
    out = [esc(parts[0])]
    for i in range(1, len(parts), 3):
        out.append(f'<a href="{esc(parts[i + 1])}">{esc(parts[i])}</a>{esc(parts[i + 2])}')
    return "".join(out)

def render_block(block):
    """A paragraph string, or a dict holding one of h3, steps, list or example.
    Paragraphs may link another page with [label](/path)."""
    if isinstance(block, str):
        return f"<p>{linked(block)}</p>"
    if "h3" in block:
        return f"<h3>{esc(block['h3'])}</h3>"
    if "steps" in block:
        return "<ol>" + "".join(f"<li>{esc(item)}</li>" for item in block["steps"]) + "</ol>"
    if "list" in block:
        return "<ul>" + "".join(f"<li>{esc(item)}</li>" for item in block["list"]) + "</ul>"
    example = block["example"]
    rows = "".join(f"<p><strong>{esc(label)}</strong> {esc(text)}</p>" for label, text in example["rows"])
    return f'<div class="card"><h3>{esc(example["title"])}</h3>{rows}</div>'

def structured_data(page, question, answer, faqs, published, modified):
    # sitemap.mjs reads the first dateModified in the file, so the Article stays first.
    graph = [
        {"@type": "Article", "headline": page["h1"], "name": page["title"], "url": page_url(page["slug"]), "description": page["description"], "inLanguage": "en", "dateModified": modified, "datePublished": published, "author": ORGANIZATION_REF, "publisher": ORGANIZATION_REF, "about": {"@id": SOFTWARE_ID}},
        {"@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in [(question, answer), *faqs]]},
        {"@type": "BreadcrumbList", "itemListElement": [{"@type": "ListItem", "position": 1, "name": BRAND, "item": BASE + "/"}, {"@type": "ListItem", "position": 2, "name": page["h1"], "item": page_url(page["slug"])}]},
    ]
    if page.get("software"):
        graph.append(SOFTWARE)
    return json_script({"@context": "https://schema.org", "@graph": graph})

def render_page(page):
    question, answer = lead_answer(page)
    published = page.get("published", PUBLISHED_DATE)
    modified = page.get("modified", CONTENT_DATE)
    if "faqs" not in page:
        modified = max(modified, FAQS_DATE)
    feature_cards = "".join(feature_card(feature) for feature in page["features"])
    article = []
    for heading, blocks in page["sections"]:
        article.append(f"<h2>{esc(heading)}</h2>")
        article.extend(render_block(block) for block in blocks)
    faqs = page.get("faqs", FAQS)
    faq_html = "".join(f"<details><summary>{esc(q)}</summary><p>{esc(a)}</p></details>" for q, a in faqs)
    nav = "".join(f'<a href="{href}">{esc(label)}</a>' for label, href in NAV)
    dates = f'Published <time datetime="{published}">{long_date(published)}</time> · Updated <time datetime="{modified}">{long_date(modified)}</time>'
    # A guide that supports a free tool leads with that tool, so the tool page owns the topic.
    cta = f'<a class="btn primary" href="/app">Start practicing</a><a class="btn secondary" href="/">See {PRODUCT}</a>'
    if "tool" in page:
        label, href = page["tool"]
        cta = f'<a class="btn primary" href="{esc(href)}">{esc(label)}</a><a class="btn secondary" href="/app">Start practicing</a>'
    return f'''<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{esc(page["title"])}</title>
  <meta name="description" content="{esc(page["description"])}" />
  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large" />
  <link rel="canonical" href="{page_url(page["slug"])}" />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content="{BRAND}" />
  <meta property="og:title" content="{esc(page["title"])}" />
  <meta property="og:description" content="{esc(page["description"])}" />
  <meta property="og:url" content="{page_url(page["slug"])}" />
  <meta property="og:image" content="{BASE}/hero-visual.jpg" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="{esc(f"{PRODUCT} debate prep workspace preview")}" />
  <meta property="article:published_time" content="{published}" />
  <meta property="article:modified_time" content="{modified}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="{BASE}/hero-visual.jpg" />
  <meta name="twitter:image:alt" content="{esc(f"{PRODUCT} debate prep workspace preview")}" />
  <link rel="stylesheet" href="/seo-pages.css" />
  <script type="application/ld+json">{structured_data(page, question, answer, faqs, published, modified)}</script>
</head>
<body>
  <header class="wrap">
    <nav class="nav" aria-label="Primary"><a class="brand" href="/">{BRAND}</a><div>{nav}</div></nav>
  </header>
  <main class="wrap">
    <nav class="breadcrumb" aria-label="Breadcrumb"><a href="/">{PRODUCT}</a> / <span aria-current="page">{esc(page["h1"])}</span></nav>
    <article>
      <header class="hero"><span class="eyebrow">{esc(page["eyebrow"])}</span><h1>{esc(page["h1"])}</h1><p class="lead">{esc(page["lead"])}</p><p class="dates">{dates}</p><div class="cta">{cta}</div></header>
      <section class="answer" aria-labelledby="short-answer"><h2 id="short-answer">{esc(question)}</h2><p>{esc(answer)}</p></section>
      <section class="grid" aria-label="Highlights">{feature_cards}</section>
      <div class="article section">{"".join(article)}</div>
      <section class="section faq article" aria-labelledby="faq"><h2 id="faq">Frequently asked questions</h2>{faq_html}</section>
    </article>
    <aside class="section article" aria-labelledby="about"><h2 id="about">About {PRODUCT}</h2><p>{esc(DEFINITION)} The app is available in English, Spanish and Hungarian.</p><p>{esc(PLAN_FACTS)} <a href="/debatelab-pricing">See pricing</a>.</p></aside>
    <section class="section article" aria-labelledby="related"><h2 id="related">Related {PRODUCT} guides</h2><nav class="links" aria-label="Related guides">{internal_links(page["slug"])}</nav></section>
  </main>
  <footer class="footer"><div class="wrap">{BRAND}: <a href="/">Home</a> / <a href="/debatelab-pricing">Pricing</a> / <a href="/privacy">Privacy</a> / <a href="/terms">Terms</a> / <a href="/sitemap.xml">Sitemap</a></div></footer>
</body>
</html>
'''

# The Hungarian and Spanish pages (src/config/localized-routes.json), named by their own titles.
LOCALIZED_ROUTES = json.loads((ROOT / "src" / "config" / "localized-routes.json").read_text())
PAGE_HEAD_IDS = {"/": "home", "/tools": "tools", "/tools/debate-timer": "debateTimer", "/tools/debate-motion-generator": "motionGenerator", "/tools/debate-flow-sheet": "flowSheet", "/tools/speech-time-calculator": "speechTimeCalculator"}

def localized_sections():
    sections = []
    for language, heading in (("hu", "Magyar"), ("es", "Español")):
        heads = json.loads((ROOT / "src" / "locales" / f"{language}.json").read_text())["pageHead"]
        lines = []
        for route, paths in LOCALIZED_ROUTES.items():
            head = heads[PAGE_HEAD_IDS[route]]
            title, description = (head[key].replace("{{brand}}", BRAND).replace("{{product}}", PRODUCT) for key in ("title", "description"))
            lines.append(f"- [{title}]({BASE}{paths[language]}): {description}")
        sections.append(f"## {heading}\n\n" + "\n".join(lines))
    return "\n\n".join(sections)

def llms_txt():
    """public/llms.txt: a plain summary for AI agents, from the same facts as the pages."""
    guides = "\n".join(f'- [{p["h1"]}]({page_url(p["slug"])}): {p["description"]}' for p in PAGES)
    tools = "\n".join(f"- [{name}]({BASE}{route}): {blurb}" for route, name, blurb in FREE_TOOLS)
    return f"""# {BRAND}

> {DEFINITION}

{BRAND} runs at {BASE}/. It is a separate product from debatelab.ai.

## Key facts (as of {FACTS_AS_OF})

- Who it is for: students, competitive debaters and their coaches.
- {len(PREP_MODES)} prep modes: {names(PREP_MODES)}. Plus {len(UTILITIES)} utilities: {names(UTILITIES)}.
- Practice: Sparring runs timed rounds against an AI opponent in School 4-6-6-3, Lincoln-Douglas and Public Forum and ends with a judged verdict. Crossfire drills cross-examination.
- Languages: English, Spanish and Hungarian.
- Pricing: {PLAN_FACTS}
- Pro adds expanded AI prep access, all 10 models (including Claude Opus and Sonnet, GPT-6.1 Sol and Gemini), Active Grounding research and priority support.
- Privacy: cases, sources, practice rounds and history stay behind sign-in and are not indexed.

## Main pages

- [Home]({BASE}/): what {PRODUCT} is, the {len(PREP_MODES)} prep modes, pricing and FAQ
- [Pricing]({page_url("debatelab-pricing")}): trial, Pro and what each includes
- [Best AI debate tools]({page_url("best-ai-debate-tools")}): how to choose an AI debate tool
- [Sitemap]({BASE}/sitemap.xml): every public page

## Free tools

Free to use, no account needed, and they run in the browser.

- [All free debate tools]({BASE}/tools): every tool below on one page
{tools}

{localized_sections()}

## Guides

{guides}
"""

def main():
    (PUBLIC / "seo-pages.css").write_text(CSS + "\n")
    for page in PAGES:
        directory = PUBLIC / page["slug"]
        directory.mkdir(parents=True, exist_ok=True)
        (directory / "index.html").write_text(render_page(page))
    (PUBLIC / "llms.txt").write_text(llms_txt())

    print(f"Generated {len(PAGES)} public SEO pages and llms.txt; the build writes sitemap.xml")

if __name__ == "__main__":
    main()
