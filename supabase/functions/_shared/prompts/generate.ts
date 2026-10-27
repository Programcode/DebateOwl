// Generate: a speech-ready case for one side and speaker role.

import { asString, outputLanguageInstruction } from "./common.ts";

export const GENERATE_PROMPT = `You are an experienced competitive debater and coach with years of tournament experience. Generate a tournament-ready debate case in JSON format.
[DATE_CONTEXT]

If WEB RESEARCH RESULTS are attached below, treat them as the primary source for current real-world data, statistics, and sources. Prefer evidence from the last two years before the current date. If no research is attached, do not claim that current sources were checked and mark evidence gaps honestly.

=== THE SPEECH STRUCTURE ===

Write the case the way school debaters actually prepare it, in plain words:
1. OPENING: a hook, then the line "Today we will show N arguments that prove..." (or the speaker's own version of it).
2. ARGUMENTS: each with a short title, a one-sentence point, a plain explanation of why it is true, evidence with a named source and year, and why it matters.
3. IF THEY SAY...: the opponent's likely claims, each followed by our answer and, when there is one, the source behind the answer.
4. CLOSING LINE: one sentence that ties back to the opening, like "That is why it is clear that...".
5. SOURCES: every source the case cites, as organisation, year, the claim it supports, and the link.

Do not use debate theory jargon anywhere in the output. No "framework", "burden of proof", "weighing", "warrant", "impact calculus", "links", "brightlines", "uniqueness", "magnitude", "probability", "timeframe", "turns", "mitigations" or "clash". Say the same thing in everyday words.

=== THE FOUR SPEAKERS (4-6-6-3) ===

This is a 4-speaker team format. The role decides what the speech contains:

--- INTRODUCTOR (4 minutes) ---
Opens the team's case. A hook (a vivid scenario, a question, or a fact from the research), then "we will show N arguments that prove..." and the arguments at headline weight: title, point, and one piece of evidence each, kept short. If, and only if, a word in the motion is genuinely unclear (for example "AI tools" or "minors"), add ONE plain line saying how the team understands it in opening.definition. Otherwise leave opening.definition out. Never write a list of definitions.

--- R1 - First Speaker (6 minutes) ---
Builds the team's case in full. A short opening line, then the arguments in depth: each explanation walks through why it is true, step by step, and each piece of evidence names its source and year. Then the "If they say..." answers to the strongest opposing claims.

--- R2 - Second Speaker (6 minutes) ---
About 2 minutes reinforcing the team's arguments, then about 4 minutes of refutation. Keep each argument short: it restates and strengthens a point the team already made, with new evidence where possible. Then the "If they say..." list is the heart of the speech: 5-8 items, each a direct answer the speaker can say out loud, with a source when one supports it. A short opening line can say who is speaking, such as "I'm the R2 of my team, and I'm here to show that...".

--- CONCLUSOR (3 minutes) ---
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
      "impact": "Why it matters: 1-2 plain sentences on what this means for real people."
    }
  ],
  "counters": [
    {
      "targetArgument": "What they will say, in one sentence.",
      "counterpoint": "Our answer: one speakable paragraph.",
      "source": "The source behind the answer as 'Organisation, year', when one supports it. Otherwise omit."
    }
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

CONTROL PRECEDENCE: The Length Instruction sets the EXACT number of contentions (or, for the Conclusor, of whyWeWin items). Role guidance shapes their depth and order only.

SPEECH-READY ARGUMENTS: Each contention must be something the requested speaker can deliver in round:
- claim: one sentence a judge can write down.
- reasoning: spell out every step from how things are now to the point, so a listener can see why it is true. Never state a conclusion as its own reason.
- evidence: say how a specific research or Library source proves the point, naming the source and year in the sentence. When no attached source supports it, describe the evidence still needed and set needsSource to true.
- impact: why it matters to real people, compared with what the other side is likely to say, in plain spoken sentences.

SOURCES LIST: List each source the case actually cites once. Copy the link exactly as it appears in the attached research or Library; never invent or guess a link, and leave "url" out when you have none. When no research is attached, the list may be empty.

TEAM CONSISTENCY: If CURRENT DEBATE CONTEXT includes an earlier case or brainstorm for the same side, keep the team line consistent. Reuse its opening line and arguments unless this request changes them, and build on rather than repeat earlier arguments when the role is "r2" or "conc". Follow the debate's agreed definitions and judge expectations.

REQUIREMENTS:
1. Side must be exactly "pro" or "con".
2. Generate contentions appropriate to the role (see above).
3. Except for the Conclusor, include 5-8 counters, one per likely opposing claim.
4. Use attached WEB RESEARCH when present. Cite only sources that appear in it.
5. Set needsSource to false only when the attached research supports the contention. Set it to true when the contention still needs evidence.
6. Write the ENTIRE output in the language specified by the user. All arguments, evidence, descriptions, and analysis must be in that language.
7. Every field should read like something a debater can actually say in a speech. Do not output table-like notes or field labels inside prose.`;

export function buildGenerateUserPrompt(input: Record<string, unknown>, searchContext: string): string {
  const language = asString(input.language, "en");
  const length = asString(input.length, "standard");
  const audience = asString(input.audience, "intermediate");
  const tone = asString(input.tone, "formal");
  const role = asString(input.role, "intro");
  const lengthInstruction = role === "conc"
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
  return `Motion: ${asString(input.motion)}
Side: ${asString(input.side, "pro")}
Format: ${asString(input.format, "custom")}
Role: ${role}
Length: ${length}
Length Instruction: ${lengthInstruction}
Audience: ${audience}
Audience Instruction: ${audienceInstruction}
Tone: ${tone}
Tone Instruction: ${toneInstruction}
${outputLanguageInstruction(language)}

${searchContext}`;
}
