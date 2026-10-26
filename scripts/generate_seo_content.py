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
# A guide whose own copy changed alone sets "modified" in seo_guides.py instead;
# no page is dated earlier than CONTENT_DATE, since the shared copy is on every page.
CONTENT_DATE = "2026-10-26"
# The commit that first added every current guide (git log --diff-filter=A).
# A new guide sets "published" in its PAGES entry.
PUBLISHED_DATE = "2026-07-05"
# The lead answer under the first H2 stays short enough to quote whole.
ANSWER_MAX_WORDS = 100

CSS = """
:root{color-scheme:dark;--bg:#070a12;--panel:#101827;--text:#f8fafc;--muted:#b6c2d6;--brand:#7c5cff;--brand2:#22d3ee;--line:rgba(255,255,255,.14)}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 18% 8%,rgba(124,92,255,.30),transparent 34rem),radial-gradient(circle at 85% 18%,rgba(34,211,238,.18),transparent 28rem),var(--bg);color:var(--text);font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.65}a{color:inherit}.wrap{width:min(1120px,92vw);margin:auto}.nav{display:flex;justify-content:space-between;align-items:center;gap:18px;padding:24px 0}.brand{font-weight:850;letter-spacing:-.04em;font-size:1.25rem;text-decoration:none}.nav div{display:flex;gap:18px;flex-wrap:wrap;justify-content:flex-end}.nav a{color:var(--muted);text-decoration:none}.hero{padding:54px 0 34px}.eyebrow{display:inline-flex;border:1px solid var(--line);border-radius:999px;padding:8px 12px;color:#c4b5fd;background:rgba(124,92,255,.12);font-size:.92rem}.hero h1{max-width:940px;font-size:clamp(2.35rem,6vw,5.15rem);line-height:1;letter-spacing:-.07em;margin:22px 0}.lead{max-width:800px;color:var(--muted);font-size:clamp(1.08rem,1.8vw,1.28rem)}.cta{display:flex;gap:14px;flex-wrap:wrap;margin-top:28px}.btn{display:inline-flex;align-items:center;justify-content:center;border-radius:14px;padding:14px 20px;font-weight:750;text-decoration:none}.primary{background:linear-gradient(135deg,var(--brand),var(--brand2));color:white}.secondary{border:1px solid var(--line);background:rgba(255,255,255,.06)}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin:34px 0}.card{border:1px solid var(--line);border-radius:24px;background:rgba(16,24,39,.78);padding:24px;box-shadow:0 24px 80px rgba(0,0,0,.24)}.card h2,.card h3{letter-spacing:-.035em;line-height:1.12;margin-top:0}.muted{color:var(--muted)}.section{padding:34px 0}.article{max-width:840px}.article h2{font-size:clamp(1.65rem,3vw,2.35rem);letter-spacing:-.04em;line-height:1.14;margin-top:2rem}.article h3{font-size:1.2rem;letter-spacing:-.025em}.links{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin:28px 0}.links a{border:1px solid var(--line);border-radius:16px;padding:14px;text-decoration:none;background:rgba(255,255,255,.05)}details{border:1px solid var(--line);border-radius:18px;padding:16px 18px;margin:12px 0;background:rgba(255,255,255,.05)}summary{cursor:pointer;font-weight:750}.footer{border-top:1px solid var(--line);color:var(--muted);padding:28px 0;margin-top:42px}.breadcrumb{color:var(--muted);font-size:.94rem;margin-top:8px}.dates{color:var(--muted);font-size:.94rem;margin:18px 0 0}.answer{max-width:840px;border:1px solid var(--line);border-left:4px solid var(--brand);border-radius:20px;background:rgba(16,24,39,.78);padding:22px 26px}.answer h2{font-size:clamp(1.35rem,2.4vw,1.8rem);letter-spacing:-.035em;line-height:1.18;margin:0 0 10px}.answer p{margin:0}.table{overflow-x:auto;margin:18px 0}table{width:100%;border-collapse:collapse;font-size:.96rem}caption{text-align:left;color:var(--muted);padding-bottom:8px}th,td{border-bottom:1px solid var(--line);padding:10px 12px;text-align:left;vertical-align:top}th{color:var(--muted);font-weight:700}@media(max-width:760px){.nav{align-items:flex-start;flex-direction:column}.nav div{justify-content:flex-start}.grid,.links{grid-template-columns:1fr}.table thead{display:none}.table tr{display:block;padding:10px 0;border-bottom:1px solid var(--line)}.table td{display:block;border:0;padding:3px 0}.table td::before{content:attr(data-label);display:block;color:var(--muted);font-size:.85rem;font-weight:700}.hero{padding-top:34px}.hero h1{letter-spacing:-.045em}}
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
    {"slug": "debate-judge-adaptation", "title": "Debate Judge Adaptation Guide | DebateLab", "description": "Learn how to adapt to different debate judges: lay judges, tech judges, flow judges, and how to read the room for better ballot outcomes.", "eyebrow": "Strategy guide", "h1": "Debate Judge Adaptation Guide", "lead": "Read the judge, adapt your style, and frame the ballot they want to write.", "features": ["Judge types", "Style adaptation", "Ballot framing"], "sections": [["Types of judges", ["Lay judges want clear stories, flow judges want structured clash, tech judges want speed and evidence. Read the judge and adapt."]], ["How to adapt your style", ["Slow down for lay judges, speed up for tech judges, and always explain your weighing clearly regardless of judge type."]], ["Framing the ballot", ["Give the judge a reason to vote for you that fits their style. The best debaters make the judge's job easy."]]]},
    {"slug": "debate-speech-structure", "title": "Debate Speech Structure Guide | DebateLab", "description": "Learn debate speech structure for every format: opening, rebuttal, summary, final focus, crystallization, and reply speech organization.", "eyebrow": "Strategy guide", "h1": "Debate Speech Structure Guide", "lead": "Structure your speech so the judge can follow every argument and every comparison.", "features": ["Opening structure", "Rebuttal structure", "Final speech structure"], "sections": [["Why structure matters", ["A well-structured speech is easier to flow, easier to judge, and easier to win. The judge should never be confused about where you are."]], ["Opening speech structure", ["State your position, define key terms, present contentions with warrants and impacts, and preview weighing."]], ["Rebuttal and final speech structure", ["Respond to the key clash, extend your offense, weigh the comparison, and frame the ballot. End by telling the judge why you win."]]]},
    {"slug": "debate-motion-analysis", "modified": "2026-10-23", "title": "Debate Motion Analysis Guide | DebateLab", "description": "Learn how to analyze a debate motion: define terms, identify burdens, map clashes, and build case strategy from the topic release.", "eyebrow": "Strategy guide", "h1": "Debate Motion Analysis Guide", "lead": "From topic to strategy: define, clash, and build a winning case.", "features": ["Definition strategy", "Burden identification", "Clash mapping"], "sections": [["How to analyze a motion", ["Read the motion carefully, define each term, identify what each side must prove, and map the likely clashes.", "To practice on a motion you have not seen, draw one from the [free debate motion generator](/tools/debate-motion-generator)."]], ["Definition strategy", ["Definitions can frame the round. Choose definitions that are fair, defensible, and favorable to your side."]], ["Burden identification", ["Your burden is what you must prove to win. If you do not meet your burden, you lose regardless of how well you argue."]]]},
    {"slug": "best-ai-debate-tools", "title": "Best AI Debate Tools Compared | {product}", "description": "Compare the best AI debate tools for case generation, rebuttal practice, evidence research, flowcharts, coaching, and tournament preparation.", "eyebrow": "Comparison", "h1": "Best AI Debate Tools Compared", "lead": "See how AI debate tools compare on features, formats, and prep workflows."},
    {"slug": "debatelab-pricing", "title": "DebateLab Pricing and Plans | DebateLab", "description": "DebateLab pricing and plans for AI debate practice: free trial, Pro features, and what is included for students and competitive debaters.", "eyebrow": "Pricing", "h1": "DebateLab Pricing and Plans", "lead": "See what DebateLab offers and how to get started with AI debate practice."},
    {"slug": "debatelab-vs-chatgpt", "title": "{product} vs ChatGPT for Debate Prep | {product}", "description": "Compare {product} vs ChatGPT for debate prep: structured workflows vs generic chat, evidence research, rebuttal drills, case generation, and coaching.", "eyebrow": "Comparison", "h1": "{product} vs ChatGPT for Debate Prep", "lead": "ChatGPT is a general chatbot. {product} is a debate practice workspace.", "features": ["Structured workflows", "Evidence leads", "Practice tools"], "sections": [["What ChatGPT does well", ["ChatGPT is a flexible general-purpose AI. It can brainstorm, draft, and answer questions about any topic, including debate."]], ["What {product} does differently", ["{product} is designed for debate prep workflows: case structure, targeted rebuttals, evidence leads, argument flowcharts, coaching prompts, and timed practice. Each workflow supports a specific prep task."]], ["When to use each", ["Use ChatGPT for general brainstorming and research. Use {product} for structured, repeatable debate practice that mirrors what you do in a round."]]]},
    {"slug": "debatelab-vs-windebate", "title": "DebateLab vs WinDebate Comparison | DebateLab", "description": "Compare DebateLab vs WinDebate: case generation, rebuttal drills, evidence research, format coverage, pricing, and workflow differences.", "eyebrow": "Comparison", "h1": "DebateLab vs WinDebate", "lead": "Two AI debate prep platforms compared on features and workflows.", "features": ["Feature comparison", "Format coverage", "Workflow differences"], "sections": [["WinDebate overview", ["WinDebate focuses on research, drills, feedback, and progress tracking for competitive debaters. It covers PF, LD, Congress, Policy, and Worlds."]], ["DebateLab overview", ["DebateLab focuses on structured prep workflows: case generation, rebuttal practice, evidence leads, argument flowcharts, coaching prompts, and online debate timers."]], ["How to choose", ["Compare format coverage, feature depth, feedback style, pricing, and which tool fits your actual tournament workflow."]]]},
    {"slug": "debatelab-vs-debateclub", "title": "DebateLab vs DebateClub Comparison | DebateLab", "description": "Compare DebateLab vs DebateClub: voice debating, case generation, rebuttal drills, evidence research, and workflow differences for competitive debaters.", "eyebrow": "Comparison", "h1": "DebateLab vs DebateClub", "lead": "Voice sparring vs structured prep: two approaches to AI debate practice.", "features": ["Voice vs text workflows", "Feature comparison", "Prep focus areas"], "sections": [["DebateClub overview", ["DebateClub focuses on voice-based AI debate sparring with real-time feedback in a conversational format."]], ["DebateLab overview", ["DebateLab focuses on text-based structured prep: cases, rebuttals, evidence, flowcharts, coaching, and timed practice for tournament preparation."]], ["Which approach fits you", ["If you want voice practice, DebateClub is focused there. If you want structured prep workflows, DebateLab is designed for that."]]]},
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
# Merging by slug keeps PAGES in order, the order llms.txt lists the guides in.
PAGES = [fill({**page, **GUIDES.get(page["slug"], {})}) for page in PAGES]

# Topic clusters for the "Related" block. Every page in PAGES belongs to exactly
# one cluster. When a page leaves PAGES, delete it here and from LINK_PHRASES too.
CLUSTERS = {
    "Practice and product": [
        "ai-debate-practice", "ai-debate-coach", "ai-debate-case-generator", "ai-rebuttal-generator",
        "debate-rebuttal-practice", "debate-evidence-finder", "argument-flowchart", "online-debate-timer",
    ],
    "Formats": [
        "public-forum-debate", "lincoln-douglas-debate", "policy-debate", "british-parliamentary-debate",
        "world-schools-debate", "congress-debate",
    ],
    "Skills": [
        "how-to-write-a-debate-case", "how-to-practice-rebuttals", "how-to-weigh-in-debate", "how-to-cross-examine-in-debate",
        "how-to-flow-in-debate", "debate-clash-points", "debate-speech-structure", "debate-fallacies",
        "debate-motion-analysis", "debate-judge-adaptation", "how-to-prepare-for-a-debate-tournament", "debate-topics-for-students",
    ],
    "Compare": ["best-ai-debate-tools", "debatelab-vs-chatgpt", "debatelab-vs-debateclub", "debatelab-vs-windebate", "debatelab-pricing"],
}
RELATED_SIBLINGS = 6
RELATED_CROSS = 2

# In-body links. In this order, each entry links the first paragraph text that matches it
# (whole words, any case) to its guide, until the page has IN_BODY_LINKS of them. Specific
# phrases come first; the single words at the end only fill pages that are still short.
LINK_PHRASES = [
    (r"Public Forum|final focus", "public-forum-debate"),
    (r"Lincoln-Douglas|value and criterion", "lincoln-douglas-debate"),
    (r"British Parliamentary|closing teams?", "british-parliamentary-debate"),
    (r"World Schools|reply speech(?:es)?", "world-schools-debate"),
    (r"Congress(?:ional)? debate|crystalli[sz]ation", "congress-debate"),
    (r"policy debate|counterplans?", "policy-debate"),
    (r"cross-examination", "how-to-cross-examine-in-debate"),
    (r"flowing|flow sheets?", "how-to-flow-in-debate"),
    (r"argument flowcharts?", "argument-flowchart"),
    (r"rebuttal drills|practi[cs]e rebuttals|rebuttal practice", "debate-rebuttal-practice"),
    (r"rebuttal blocks?|block files?|pre-written responses", "how-to-practice-rebuttals"),
    (r"key clash(?:es)?|clash points?|collaps(?:e|es|ing)|drop the rest", "debate-clash-points"),
    (r"fallac(?:y|ies)", "debate-fallacies"),
    (r"motion analysis|analy[sz]e the motion|interpret(?:ing)? (?:the|a) motion", "debate-motion-analysis"),
    (r"(?:lay|tech|flow) judges?|judge types?|read the judge", "debate-judge-adaptation"),
    (r"tournament prep(?:aration)?|tournament day|before (?:a|the) tournament|prep time", "how-to-prepare-for-a-debate-tournament"),
    (r"speech structure|structured speech|delivery|pronunciation", "debate-speech-structure"),
    (r"write (?:a|your) case|writing (?:a|your) case|case structure", "how-to-write-a-debate-case"),
    (r"case generator|generate (?:a|the) case|case generation", "ai-debate-case-generator"),
    (r"evidence leads|evidence research|research evidence", "debate-evidence-finder"),
    (r"AI (?:debate )?coach", "ai-debate-coach"),
    (r"AI opponents?|Sparring rounds?", "ai-debate-practice"),
    (r"generated rebuttals?|rebuttal generator", "ai-rebuttal-generator"),
    (r"ChatGPT|general chatbot", "debatelab-vs-chatgpt"),
    (r"debate topics|topic areas", "debate-topics-for-students"),
    (r"speech times?|timed practice", "online-debate-timer"),
    (r"weighing|weigh|compare impacts", "how-to-weigh-in-debate"),
    (r"points? of information", "world-schools-debate"),
    (r"frame the ballot|framing the ballot", "debate-judge-adaptation"),
    (r"questioning", "how-to-cross-examine-in-debate"),
    (r"criterion", "lincoln-douglas-debate"),
    (r"extensions?", "british-parliamentary-debate"),
    (r"cross-ex", "how-to-cross-examine-in-debate"),
    (r"burdens?", "debate-motion-analysis"),
    (r"blocks|rebuttals", "how-to-practice-rebuttals"),
    (r"clash(?:es)?", "debate-clash-points"),
    (r"evidence", "debate-evidence-finder"),
]
IN_BODY_LINKS = 3
# The in-body links each page got, for the report main() prints with --links.
IN_BODY_REPORT = {}

def check_link_tables():
    """Fails generation when CLUSTERS or LINK_PHRASES name a page PAGES lacks, or miss one it has."""
    slugs = [page["slug"] for page in PAGES]
    clustered = [slug for cluster in CLUSTERS.values() for slug in cluster]
    problems = [f"CLUSTERS lists {slug}, which is not in PAGES" for slug in clustered if slug not in slugs]
    problems += [f"{slug} is in no cluster in CLUSTERS" for slug in slugs if slug not in clustered]
    problems += [f"{slug} is in more than one cluster" for slug in set(clustered) if clustered.count(slug) > 1]
    problems += [f"LINK_PHRASES links to {slug}, which is not in PAGES" for _, slug in LINK_PHRASES if slug not in slugs]
    if problems:
        raise SystemExit("Fix the link tables in generate_seo_content.py:\n  " + "\n  ".join(problems))

check_link_tables()
PAGE_BY_SLUG = {page["slug"]: page for page in PAGES}
CLUSTER_OF = {slug: name for name, cluster in CLUSTERS.items() for slug in cluster}
CLUSTER_ORDER = [slug for cluster in CLUSTERS.values() for slug in cluster]
PHRASE_PATTERNS = [(re.compile(rf"\b(?:{phrase})\b", re.I), slug) for phrase, slug in LINK_PHRASES]
ANSWERS = fill(ANSWERS)

NAV = [("AI practice","/ai-debate-practice"),("Case generator","/ai-debate-case-generator"),("Rebuttal practice","/debate-rebuttal-practice"),("Evidence finder","/debate-evidence-finder"),("Pricing","/debatelab-pricing"),("Open app","/app")]

SOFTWARE_ID = BASE + "/#software"
ORGANIZATION_REF = {"@type": "Organization", "@id": BASE + "/#organization", "name": ORGANIZATION, "url": BASE + "/", "logo": BASE + "/icon-1024.png", "sameAs": SITE["organizationSameAs"]}
SOFTWARE = {
    "@type": "SoftwareApplication",
    "@id": SOFTWARE_ID,
    "name": PRODUCT,
    "alternateName": BRAND,
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

def related_slugs(current):
    """Up to RELATED_SIBLINGS pages from the current page's cluster, then RELATED_CROSS from
    other clusters. Both start just after the current page, so each page gets a different set."""
    cluster = CLUSTERS[CLUSTER_OF[current]]
    at = cluster.index(current)
    siblings = (cluster[at + 1:] + cluster[:at])[:RELATED_SIBLINGS]
    others = [slug for slug in CLUSTER_ORDER if CLUSTER_OF[slug] != CLUSTER_OF[current]]
    start = (CLUSTER_ORDER.index(current) * 5) % len(others)
    cross = []
    for slug in others[start:] + others[:start]:
        # One page from each of two other clusters, not two from the same one.
        if all(CLUSTER_OF[slug] != CLUSTER_OF[taken] for taken in cross):
            cross.append(slug)
        if len(cross) == RELATED_CROSS:
            break
    return siblings + cross

def internal_links(current):
    return "\n".join(f'<a href="/{slug}">{esc(PAGE_BY_SLUG[slug]["h1"])}</a>' for slug in related_slugs(current))

def body_texts(page):
    """The texts in-body links may go in, in page order: paragraphs, then each list or steps item."""
    for _, blocks in page["sections"]:
        for block in blocks:
            if isinstance(block, str):
                yield block
            elif "list" in block or "steps" in block:
                yield from block.get("list", block.get("steps"))

def in_body_links(page, used):
    """The in-body links for a page: {(text, part): [(start, end, slug)]}, where text indexes
    body_texts(page) and part indexes re.split(MARKDOWN_LINK, text). `used` holds slugs the page must not link."""
    paragraphs = list(body_texts(page))
    spans = {}
    for pattern, slug in PHRASE_PATTERNS:
        if sum(map(len, spans.values())) == IN_BODY_LINKS:
            break
        if slug in used:
            continue
        for at, paragraph in enumerate(paragraphs):
            parts = re.split(MARKDOWN_LINK, paragraph)
            for part in range(0, len(parts), 3):
                taken = spans.get((at, part), [])
                match = next((m for m in pattern.finditer(parts[part]) if all(m.end() <= start or end <= m.start() for start, end, _ in taken)), None)
                if match:
                    spans.setdefault((at, part), []).append((match.start(), match.end(), slug))
                    used.add(slug)
                    break
            if slug in used:
                break
    return spans

def with_links(text, spans):
    """Escaped text with each (start, end, slug) span turned into a link to that guide."""
    out, last = [], 0
    for start, end, slug in sorted(spans):
        out.append(f'{esc(text[last:start])}<a href="/{slug}">{esc(text[start:end])}</a>')
        last = end
    return "".join(out) + esc(text[last:])

def feature_card(feature):
    """A highlight card: a title, or a (title, description) pair."""
    if isinstance(feature, str):
        return f'<article class="card"><h3>{esc(feature)}</h3></article>'
    title, description = feature
    return f'<article class="card"><h3>{esc(title)}</h3><p class="muted">{esc(description)}</p></article>'

MARKDOWN_LINK = r"\[([^\]]+)\]\((/[^)\s]*|https://[^)\s]+)\)"

def linked(text, spans=None):
    """Escaped text in which [label](/path) links a page on this site and [label](https://...) a primary source.
    `spans` maps a part of re.split(MARKDOWN_LINK, text) to its in-body links (see in_body_links)."""
    spans = spans or {}
    parts = re.split(MARKDOWN_LINK, text)
    out = [with_links(parts[0], spans.get(0, []))]
    for i in range(1, len(parts), 3):
        out.append(f'<a href="{esc(parts[i + 1])}">{esc(parts[i])}</a>{with_links(parts[i + 2], spans.get(i + 2, []))}')
    return "".join(out)

def render_block(block, spans_of=lambda: None):
    """A paragraph string, or a dict holding one of h3, steps, list, table or example.
    Paragraphs, list items and table cells may link with [label](/path) or [label](https://...).
    `spans_of()` returns the in-body links of the next text from body_texts()."""
    if isinstance(block, str):
        return f"<p>{linked(block, spans_of())}</p>"
    if "h3" in block:
        return f"<h3>{esc(block['h3'])}</h3>"
    if "steps" in block:
        return "<ol>" + "".join(f"<li>{linked(item, spans_of())}</li>" for item in block["steps"]) + "</ol>"
    if "list" in block:
        return "<ul>" + "".join(f"<li>{linked(item, spans_of())}</li>" for item in block["list"]) + "</ul>"
    if "table" in block:
        table = block["table"]
        head = "".join(f'<th scope="col">{esc(cell)}</th>' for cell in table["head"])
        # data-label lets narrow screens show each row as a stack of labelled cells.
        labels = [esc(cell) for cell in table["head"]]
        rows = "".join("<tr>" + "".join(f'<td data-label="{label}">{linked(cell)}</td>' for label, cell in zip(labels, row)) + "</tr>" for row in table["rows"])
        caption = f"<caption>{esc(table['caption'])}</caption>" if "caption" in table else ""
        return f'<div class="table"><table>{caption}<thead><tr>{head}</tr></thead><tbody>{rows}</tbody></table></div>'
    example = block["example"]
    rows = "".join(f"<p><strong>{esc(label)}</strong> {esc(text)}</p>" for label, text in example["rows"])
    return f'<div class="card"><h3>{esc(example["title"])}</h3>{rows}</div>'

def about(slug):
    """The About aside. The full definition and plan facts stay on the pricing page (and on / and llms.txt);
    every other guide gets one line, so the same paragraph is not repeated across the site."""
    if slug == "debatelab-pricing":
        body = f'<p>{esc(DEFINITION)} The app is available in English, Spanish and Hungarian.</p><p>{esc(PLAN_FACTS)}</p>'
    else:
        body = f'<p>{PRODUCT} is an AI debate prep and practice app. See <a href="/">how it works</a> or <a href="/debatelab-pricing">pricing</a>.</p>'
    return f'<aside class="section article" aria-labelledby="about"><h2 id="about">About {PRODUCT}</h2>{body}</aside>'

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
    modified = max(page.get("modified", CONTENT_DATE), CONTENT_DATE)
    if not page.get("faqs"):
        raise SystemExit(f"{page['slug']} has no FAQs of its own in seo_guides.py")
    feature_cards = "".join(feature_card(feature) for feature in page["features"])
    # In-body links skip the page itself and pages its copy already links.
    written = {href.lstrip("/") for text in body_texts(page) for _, href in re.findall(MARKDOWN_LINK, text)}
    spans = in_body_links(page, {page["slug"], *written})
    texts = iter(range(len(list(body_texts(page)))))
    def spans_of():
        at = next(texts)
        return {part: links for (where, part), links in spans.items() if where == at}
    article = []
    for heading, blocks in page["sections"]:
        article.append(f"<h2>{esc(heading)}</h2>")
        article.extend(render_block(block, spans_of) for block in blocks)
    IN_BODY_REPORT[page["slug"]] = spans
    faqs = page["faqs"]
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
    {about(page["slug"])}
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
    if "--links" in sys.argv:
        for slug, spans in IN_BODY_REPORT.items():
            print(f"{slug}: " + (", ".join(f"/{target}" for links in spans.values() for _, _, target in links) or "(none)"))

if __name__ == "__main__":
    main()
