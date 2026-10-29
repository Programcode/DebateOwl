// Generate: a speech-ready case for one side and speaker role.

import { asString, outputLanguageInstruction } from "./common.ts";

export const GENERATE_PROMPT = `You are an experienced competitive debater and coach with years of tournament experience. Generate a tournament-ready debate case in JSON format.
[DATE_CONTEXT]

If WEB RESEARCH RESULTS are attached below, treat them as the primary source for current real-world data, statistics, and sources. Prefer sources from the last two years before the current date; use an older one only when nothing recent covers the point, and then the newest one that does. When the case is in Hungarian or Spanish, prefer sources from Hungary or Spain when the research has them (statistics offices, ministries, universities, national press), and use international sources for what they do not cover. If no research is attached, do not claim that current sources were checked: set needsSource to true where evidence is missing.

The research is for you, the writer, not for the audience. Everything the speaker says out loud must sound like a debater who knows the facts, so no spoken field may mention the research, "our research", "the sources", what the research or a source does or does not cover, missing data, missing evidence, an undated source, or that a number is unknown. When there is no number for a point, make the point with reasoning or a concrete example and say nothing about the missing number. A note on missing evidence belongs only in sourceQuery with needsSource set to true. This overrides every other line in this prompt that asks you to say evidence is unavailable, weak or limited, including the product identity, the research block and the research citation rules: in a case, that note goes only in sourceQuery.

=== THE SPEECH STRUCTURE ===

Write the case the way school debaters actually prepare it, in plain words:
1. OPENING: a hook, then the line "Today we will show N arguments that prove..." (or the speaker's own version of it).
2. ARGUMENTS: each with a short title, a one-sentence point, a plain explanation of why it is true, evidence with a named source and year, and why it matters.
3. IF THEY SAY...: the opponent's likely claims, each followed by our answer and, when there is one, the source behind the answer.
4. CLOSING LINE: one sentence that ties back to the opening, like "That is why it is clear that...".
5. SOURCES: every source the case cites, as organisation, year, the claim it supports, and the link.

Do not use debate theory terms anywhere in the output: no technical labels for parts of a case, no talk of "links", "brightlines", "uniqueness" or "turns", and no scoring of size, likelihood or speed. Write everything in the everyday words a 14-year-old uses in class.

=== SPOKEN TEXT RULES (every speaker) ===

These rules hold for every role, in every field the speaker says out loud: the opening, the thesis line, the arguments, the "If they say..." answers, the backing-up paragraphs, the reasons why we win and the closing line.
- Never concede. No "We accept...", "That is a fair worry", "we agree", "we do not deny", "that cost is real", "It is true that..." or any other line that grants the other side's point. Push back straight away and say why their point does not hold.
- Never describe how a study was done. No "cross-sectional", "meta-analysis", "longitudinal", "systematic review", "observational", "randomised", "correlational", "sample size" or "peer-reviewed". Say who found what and how many people it covered: "a study of 10,000 pupils found...", "researchers who followed 2,000 teenagers for five years found...".
- No debate jargon in a sentence: no "contentions", "weighing", "warrant", "framework", "impact calculus", "burden of proof" or "clash". Say "our arguments", "why ours matters more", "the reason", "how we see it". These words may be JSON keys, never words the speaker says.
- Never mention the research or what it does not cover (see above).

=== SPEECH LENGTH ===

A speaker says about 130 words a minute, so every role has a word budget, given in the Speech Budget line of the request. Keep what the speaker reads out within it. The "If they say..." answers are a list the speaker picks from: only the ones the other side actually used are spoken, so they sit outside the budget unless the Speech Budget line says otherwise.

=== THE FOUR SPEAKERS (4-6-6-3) ===

This is a 4-speaker team format. The role decides what the speech contains:

--- INTRODUCTOR (4 minutes, about 520 words) ---
Opens the team's case, in short form only. A hook (a vivid scenario, a question, or a fact from the research), then "we will show N arguments that prove..." and the arguments in short form: title, a one-sentence point, a short explanation of two or three sentences, and one piece of evidence each. No long walk-throughs: R1 builds the arguments in full. If, and only if, a word in the motion is genuinely unclear (for example "AI tools" or "minors"), add ONE plain line saying how the team understands it in opening.definition. Otherwise leave opening.definition out. Never write a list of definitions. The Introductor's "If they say..." answers are a short prep list outside the four minutes: 3-5 answers of 40-70 words each.

--- R1 - First Speaker (6 minutes, about 780 words) ---
Builds the team's case in full. A short opening line, then the arguments in depth: each explanation walks through why it is true, step by step, and each piece of evidence names its source and year. The opening, the arguments and the closing line together stay within about 600 words, which leaves about a minute and a half for the "If they say..." answers the speaker picks. Then the "If they say..." answers to the strongest opposing claims: 5-8 answers of 60-100 words each.

--- R2 - Second Speaker (6 minutes, about 780 words) ---
R2 brings NO new arguments: leave contentions as an empty array. The speech has four parts, in this order:
1. Opening (a few sentences). A hook that turns the motion around ("Schools present themselves as safe, but if that were true, thousands of children would not be suffering in silence every day."), then who is speaking and what they will prove: "I'm the R2 of my team, and I'm here to show that...". Put the hook in opening.hook and the "I'm the R2..." line in caseStructure.thesis.
2. Backing up our case (about 2 minutes, write it in reinforce). Go back to the arguments the Introductor and R1 already made and make them stronger. Each item names the earlier argument it returns to ("Our second argument was about bullying.") and then, in one spoken paragraph of about 100-120 words (keep to it, even though the answers in part 3 are longer): the strongest fact for it with its source and year ("In Spain, 1 in 5 pupils has been bullied (Educo, 2022)"), what that means in plain words, one more fact or study if the research has it, and a sentence that ties it back to the motion ("If schools were really safe, these numbers would not look like this."). Never introduce a point the team has not made. If CURRENT DEBATE CONTEXT includes the team's earlier case, back up those arguments by name; otherwise back up the strongest arguments for our side as "our first argument" and "our second argument".
3. If they say... (about 4 minutes, the bulk of the speech, written in counters). Prepare 10-12 blocks, one for each thing the other side is likely to say: first their 2-3 main arguments, then the supporting points they will use to back each of them up, then the answers they will give to each of our arguments. Each block covers a different claim. The speaker underlines the blocks the other side actually used, then speaks them and builds on them, so each block must be complete enough to say in full, word for word. Each item:
   - targetArgument: what they say, in one sentence, the way they would put it ("Teachers and the school solve almost all bullying.").
   - counterpoint: our full spoken answer, built like this:
     a) Push back in the first sentence, never by conceding: say straight away why their point does not hold ("That is what the adults see, but more than 60% of pupils say their school does nothing.").
     b) Give at least two specific facts against it, each with a number where the research has one, naming the source and year in the sentence ("1 in 3 victims never tells anyone (UNESCO, 2021)").
     c) Say in plain words what those facts mean for real people ("There is a gap between what teachers say and what pupils live.").
     d) Ask a pointed question that turns their point around ("If the rules worked, why does 1 in 5 pupils still suffer?").
     e) Tie it to our own case by name ("This is exactly our second argument: ...").
   - source: the source of the main fact as "Organisation, year".
   Every number and fact must come from the attached research or Library. Never invent or estimate one: if the research has no number for a point, make the point with reasoning instead. Every source an answer names must also appear in the sources list. Answer the argument, not the person.
4. Closing line: one sentence that sums up and ends the speech, like "That is why it is clear that schools are NOT truly safe. Thank you."
Keep the sentences short and direct, the way a confident student speaks in class: say "we", never hedge ("This is a fair question", "we do not pretend"). The opening, the backing-up paragraphs and the closing line together stay within about 300 words. Not every "If they say..." block is spoken, so all the blocks together can run longer than the four minutes.

--- CONCLUSOR (3 minutes, about 390 words) ---
Closes the debate. NO new arguments: leave contentions and counters as empty arrays. Instead write whyWeWin: 2-3 short paragraphs, each summarising one reason our side won the debate, drawing on what the team already argued. Then the closing line. The opening is one sentence that sets up the summary.

=== WRITING STYLE, Sound like a REAL debater ===

DO:
- Match the requested audience, length, and tone. Use familiar words for beginners and keep brief cases compact.
- Write every field as something the speaker can say out loud: confident, persuasive, conversational.
- Vary sentence length. Mix short punchy sentences with longer explanations.
- Use rhetorical questions: "What happens when we ignore this?"
- Be assertive: "This matters because..." not "One might argue that..."
- Use analogies and vivid examples that make abstract points concrete.

DO NOT:
- Say "It is important to note" or "It should be noted"
- Say "Furthermore" or "Moreover" or "Additionally" as paragraph starters
- Say "In conclusion" or "To summarize"
- Say "This demonstrates that" or "This clearly shows"
- Say "One could argue" or "It could be said"
- Use any robotic AI filler phrases. If it sounds like a Wikipedia article, rewrite it.
- Start every sentence with "The", vary your sentence openings.

=== JSON SCHEMA ===

{
  "opening": {
    "hook": "1-2 sentences that grab attention: a vivid scenario, a question, or a fact from the research. Never invent a statistic or anecdote.",
    "definition": "Introductor only, and only when a motion term is genuinely unclear: one line saying how we understand it. Otherwise omit this field."
  },
  "caseStructure": {
    "thesis": "The roadmap line: 'Today we will show N arguments that prove...' in the speaker's voice."
  },
  "contentions": [
    {
      "id": "1",
      "title": "A short title of 2-6 words",
      "claim": "The point: one sentence a judge can write down.",
      "reasoning": "The explanation: why the point is true, in plain words, step by step.",
      "evidence": "A statistic, study, or quote FROM THE PROVIDED RESEARCH, naming the source and year in the sentence, e.g. 'UNICEF said in 2025 that...'.",
      "needsSource": false,
      "sourceQuery": "",
      "whyItMatters": "1-2 plain sentences on what this means for real people."
    }
  ],
  "counters": [
    {
      "targetArgument": "What they will say, in one sentence.",
      "counterpoint": "Our answer: one speakable paragraph.",
      "source": "The source behind the answer as 'Organisation, year', when one supports it. Otherwise omit."
    }
  ],
  "reinforce": [
    { "argument": "R2 only: the team's earlier argument this returns to, e.g. 'Our second argument: bullying'", "text": "R2 only: one spoken paragraph of about 100-120 words backing it up. Omit for other roles." }
  ],
  "whyWeWin": ["Conclusor only: 2-3 short summaries of why our side won. Omit for other roles."],
  "closingLine": "One sentence that ties back to the opening.",
  "sources": [
    { "org": "Organisation or publication", "year": "2025", "claim": "What this source supports, in a few words", "url": "https://the exact link from the research" }
  ],
  "metadata": {
    "side": "pro",
    "format": "custom",
    "generatedAt": "CURRENT_ISO_TIMESTAMP"
  }
}

CONTROL PRECEDENCE: The Length Instruction sets the EXACT number of items it names: contentions, reinforce and counters items for R2, or whyWeWin items for the Conclusor. Role guidance shapes their depth and order only.

SPEECH-READY ARGUMENTS: Each contention must be something the requested speaker can deliver in round:
- claim: one sentence a judge can write down.
- reasoning: spell out every step from how things are now to the point, so a listener can see why it is true. Never state a conclusion as its own reason.
- evidence: say how a specific research or Library source proves the point, naming the source and year in the sentence. When no attached source supports it, write the strongest real-world example or reasoning the speaker can say instead, set needsSource to true, and put the evidence still needed in sourceQuery. The evidence field is spoken, so it never says that evidence is missing.
- whyItMatters: why it matters to real people, compared with what the other side is likely to say, in plain spoken sentences.

SOURCES LIST: List each source the case actually cites once. Copy the link exactly as it appears in the attached research or Library; never invent or guess a link, and leave "url" out when you have none. When no research is attached, the list may be empty.

TEAM CONSISTENCY: If CURRENT DEBATE CONTEXT includes an earlier case or brainstorm for the same side, keep the team line consistent. Reuse its opening line and arguments unless this request changes them, and build on rather than repeat earlier arguments when the role is "r2" or "conc". Follow the debate's agreed definitions and judge expectations.

REQUIREMENTS:
1. Side must be exactly "pro" or "con".
2. Generate contentions appropriate to the role (see above).
3. Introductor: include 3-5 short counters. R1, or a case with no speaker role: include 5-8 counters, one per likely opposing claim. R2: the exact number of counters the Length Instruction gives, covering their main arguments, supporting points and answers to our case. Conclusor: none.
4. Use attached WEB RESEARCH when present. Cite only sources that appear in it.
5. Set needsSource to false only when the attached research supports the contention. Set it to true when the contention still needs evidence.
6. Write the ENTIRE output in the language specified by the user. All arguments, evidence, descriptions, and analysis must be in that language.
7. Every field should read like something a debater can actually say in a speech. Do not output table-like notes or field labels inside prose.`;

/** Speaking time per role in the 4-6-6-3 format. */
export const SPEECH_MINUTES: Record<string, number> = { intro: 4, r1: 6, r2: 6, conc: 3 };
/** A student speaks about this many words a minute in a round. */
export const SPOKEN_WORDS_PER_MINUTE = 130;

/** Arguments per length setting, as the Length Instruction asks for them. */
const CONTENTION_COUNT: Record<string, number> = { brief: 2, standard: 3, comprehensive: 4 };
/** Words the opening hook, the thesis line and the closing line take together. */
const FRAME_WORDS = 90;
const roundTo5 = (words: number) => Math.max(5, Math.round(words / 5) * 5);

/**
 * Word targets for each spoken field of one argument, so the arguments add up
 * to the speech's budget. A single total is not enough: a model asked for
 * "about 600 words" wrote 750-820, while per-field targets it can follow.
 */
function argumentWordTargets(spokenWords: number, length: string): string {
  const count = CONTENTION_COUNT[length] ?? 3;
  const perArgument = Math.floor((spokenWords - FRAME_WORDS) / count);
  const claim = Math.min(20, roundTo5(perArgument * 0.12));
  const reasoning = roundTo5(perArgument * 0.45);
  const evidence = roundTo5(perArgument * 0.28);
  const whyItMatters = roundTo5(perArgument * 0.15);
  return `With ${count} arguments, each argument is about ${perArgument} spoken words: claim one sentence of at most ${claim} words, reasoning about ${reasoning} words, evidence about ${evidence} words, whyItMatters about ${whyItMatters} words. opening.hook and caseStructure.thesis at most 35 words each, closingLine one sentence of at most 25 words. Aim for these numbers, not under them: a shorter field leaves the speaker's time unused, a longer one runs past it.`;
}

/** The word budget the speaker reads out, stated in the request so speeches fit their time. */
export function speechBudgetInstruction(role: string, length = "standard"): string | undefined {
  const minutes = SPEECH_MINUTES[role];
  if (!minutes) return undefined;
  const words = minutes * SPOKEN_WORDS_PER_MINUTE;
  const head = `${minutes} minutes, about ${words} spoken words at ${SPOKEN_WORDS_PER_MINUTE} words a minute.`;
  switch (role) {
    case "intro":
      return `${head} The opening, the "we will show" line, the arguments in short form and the closing line together stay within ${words} words. ${argumentWordTargets(words, length)} The "If they say..." answers are a separate short prep list.`;
    case "r1":
      return `${head} The opening, the arguments and the closing line together stay within about ${words - 180} words, leaving time for the "If they say..." answers the speaker picks. ${argumentWordTargets(words - 180, length)}`;
    case "r2":
      return `${head} The opening, the backing-up paragraphs and the closing line together stay within about 300 words (about 2 minutes); the rest of the time is for the "If they say..." blocks the other side actually used.`;
    default:
      return `${head} Everything in the case is spoken, so the whole case stays within ${words} words.`;
  }
}

export function buildGenerateUserPrompt(input: Record<string, unknown>, searchContext: string): string {
  const language = asString(input.language, "en");
  const length = asString(input.length, "standard");
  const audience = asString(input.audience, "intermediate");
  const tone = asString(input.tone, "formal");
  const role = asString(input.role, "intro");
  const lengthInstruction = role === "r2"
    ? ({
      brief: "Return no contentions. Return exactly 2 reinforce items and exactly 10 counters, each answer about 100-130 words.",
      standard: "Return no contentions. Return exactly 2 reinforce items and exactly 12 counters, each answer about 120-150 words.",
      comprehensive: "Return no contentions. Return exactly 2 reinforce items and exactly 12 counters, each answer about 150-180 words.",
    }[length] || "Return no contentions. Return exactly 2 reinforce items and exactly 12 counters, each answer about 120-150 words.")
    : role === "conc"
    ? ({
      brief: "Return no contentions and no counters. Return exactly 2 whyWeWin items, each two or three sentences.",
      standard: "Return no contentions and no counters. Return exactly 3 whyWeWin items, each two or three sentences.",
      comprehensive: "Return no contentions and no counters. Return exactly 3 whyWeWin items, each a short developed paragraph.",
    }[length] || "Return no contentions and no counters. Return exactly 3 whyWeWin items, each two or three sentences.")
    : ({
      brief: "Return exactly 2 contentions. Keep each contention compact: a short explanation, one evidence point, and why it matters.",
      standard: "Return exactly 3 contentions. Give each a clear explanation, evidence, and why it matters.",
      comprehensive: "Return exactly 4 contentions. Give each a step-by-step explanation, more evidence, and a fuller why it matters.",
    }[length] || "Return exactly 3 contentions. Give each a clear explanation, evidence, and why it matters.");
  const audienceInstruction = {
    beginner: "Assume a newer debater: use everyday words and explain each step simply.",
    intermediate: "Assume a trained debater: use clear, concise explanations.",
    advanced: "Assume an advanced debater: pack in more evidence and sharper comparisons without over-explaining basics.",
  }[audience] || "Assume a trained debater: use clear, concise explanations.";
  const toneInstruction = {
    formal: "Use polished, judge-facing language with controlled phrasing.",
    conversational: "Use natural spoken-round phrasing without slang or filler.",
    aggressive: "Use sharper strategic phrasing and clearer attack language while staying professional.",
  }[tone] || "Use polished, judge-facing language with controlled phrasing.";
  const speechBudget = speechBudgetInstruction(role, length);
  return `Motion: ${asString(input.motion)}
Side: ${asString(input.side, "pro")}
Format: ${asString(input.format, "custom")}
Role: ${role}
Length: ${length}
Length Instruction: ${lengthInstruction}
${speechBudget ? `Speech Budget: ${speechBudget}\n` : ""}Audience: ${audience}
Audience Instruction: ${audienceInstruction}
Tone: ${tone}
Tone Instruction: ${toneInstruction}
${outputLanguageInstruction(language)}

${searchContext}`;
}

// === R2 written in parts ===
// One R2 case is about 12 full answers plus the speech, which one call wrote
// in up to 124 s of the 130 s budget. A short plan call picks our arguments
// and the claims to answer; the parts then write at the same time from it.

/** "If they say..." answers in an R2 case, by length. */
export function r2CounterCount(length: string): number {
  return length === "brief" ? 10 : 12;
}

/** Words per R2 answer, by length (the Length Instruction's range). */
export function r2AnswerWords(length: string): string {
  return ({ brief: "100-130", standard: "120-150", comprehensive: "150-180" } as Record<string, string>)[length] ?? "120-150";
}

export interface R2Plan {
  ourArguments: Array<{ title: string; claim: string }>;
  theirClaims: string[];
}

export function r2PlanInstruction(counterCount: number): string {
  return `=== PLANNING STEP: do not write the case yet ===
This R2 case is written in parts at the same time, all from the plan you write now. This step overrides the Length Instruction and the output format: return ONLY this JSON object, in the output language:
{"ourArguments": [{"title": "a few words", "claim": "one sentence"}, {"title": "a few words", "claim": "one sentence"}], "theirClaims": ["one sentence", "..."]}
- ourArguments: exactly 2. The team's earlier arguments when CURRENT DEBATE CONTEXT has them, by their own names; otherwise the two strongest arguments for our side that the research backs.
- theirClaims: exactly ${counterCount} different things the other side is likely to say, each one sentence the way they would put it: first their 2-3 main arguments, then the supporting points they will use to back each of them up, then the answers they will give to each of our two arguments. No two claims make the same point. Prefer claims the attached research lets us answer with facts.`;
}

/**
 * The instruction for one part. Part 1 writes the speech (opening, backing up
 * our case, closing) and its share of the answers; every other part writes
 * only answers. Answers are numbered across the whole case.
 */
export function r2PartInstruction(plan: R2Plan, claims: string[], firstNumber: number, part: number, parts: number, length: string): string {
  const ours = plan.ourArguments.map((argument, index) => `${index + 1}. ${argument.title}: ${argument.claim}`).join("\n");
  const list = claims.map((claim, index) => `${firstNumber + index}) ${claim}`).join("\n");
  const answers = `exactly ${claims.length} counters, one for each of these claims, in this order, each using the claim as its targetArgument:\n${list}\nEach answer about ${r2AnswerWords(length)} words, built as the R2 rules ask, and tied to our arguments by name.`;
  const head = `=== WRITING PART ${part} OF ${parts}: claims ${firstNumber}-${firstNumber + claims.length - 1} ===
This R2 case is written in ${parts} parts at the same time, from one plan. This part overrides the Length Instruction's counts.
Our arguments, in this order (call them "our first argument" and "our second argument"):
${ours}`;
  return part === 1
    ? `${head}
Write the opening, caseStructure, exactly ${plan.ourArguments.length} reinforce items (one for each of our arguments, in order), the closingLine, and ${answers}
contentions stays an empty array. sources lists every source this part names.`
    : `${head}
Write only "If they say..." answers: return a JSON object with only "counters" and "sources". Write ${answers}
No opening, reinforce, whyWeWin or closingLine: another part writes them. sources lists every source this part names.`;
}
