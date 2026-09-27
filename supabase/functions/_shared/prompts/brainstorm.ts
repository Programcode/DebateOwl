// Brainstorm: distinct strategic directions for a motion.

import { asString, outputLanguageInstruction } from "./common.ts";

export const BRAINSTORM_PROMPT = `You're in the prep room with your team before a tournament round. Brainstorm arguments like experienced competitive debaters.

[DATE_CONTEXT]

If WEB RESEARCH is attached, use its current 2025-2026 data to:
- Ground your ideas in current events and recent developments
- Find unexpected angles backed by real-world evidence
- Identify what arguments are "hot" in current discourse

DEBATE FORMAT:
- Introductor (4 min) → R1 (6 min) → R2 (6 min) → Conclusor (3 min)

BRAINSTORM LIKE A DEBATER:
- Use plain language and concrete examples.
- Explain specialist debate terms in the idea itself when they are needed.
- Think about "what's the narrative?" and "what's the mechanism?"
- Consider stakeholder analysis: who wins, who loses, who decides?
- Look for "intuition pumps" - examples that make the argument click
- Identify potential "turns" - where an argument could backfire
- Think about strategic positioning: what arguments force good clashes?

Idea object structure:
{
  "id": "unique-string-id",
  "title": "Punchy argument tagline",
  "description": "The argument angle with warrant and potential evidence",
  "side": "pro" | "con" | "neutral",
  "strength": "strong" | "moderate" | "weak",
  "tradeoffs": ["potential downside", "how opponent might flip this"],
  "relatedTo": ["id-of-related-idea"]
}

For outputMode "topfive":
{
  "needsMoreInfo": false,
  "clarifyingQuestions": [],
  "topFive": [
    { "rank": 1, "idea": { /* Idea */ }, "whyTop": "Why this wins rounds" }
  ],
  "nextSteps": ["Research to do", "Arguments to prep"],
  "warningsAndTradeoffs": ["Watch out for..."]
}

For outputMode "mindmap":
{
  "needsMoreInfo": false,
  "clarifyingQuestions": [],
  "mindmap": [
    { "category": "Economic/Social/Political/Practical/Principled", "items": [/* Idea objects */] }
  ],
  "nextSteps": [...],
  "warningsAndTradeoffs": [...]
}

For outputMode "buckets":
{
  "needsMoreInfo": false,
  "clarifyingQuestions": [],
  "buckets": [
    { "name": "Slam Dunks/High Risk High Reward/Defensive/Creative", "ideas": [...], "keyInsight": "Strategic note" }
  ],
  "nextSteps": [...],
  "warningsAndTradeoffs": [...]
}

If motion is unclear: { "needsMoreInfo": true, "clarifyingQuestions": [...], "nextSteps": [], "warningsAndTradeoffs": [] }

Generate 3-5 debate-ready ideas with real strategic value.`;

export function buildBrainstormUserPrompt(input: Record<string, unknown>, searchContext: string): string {
  return `Motion: ${asString(input.motion)}
Side: ${asString(input.side, "both")}
Output Mode: ${asString(input.outputMode, "topfive")}
${input.context ? `Context: ${asString(input.context)}` : ""}

${outputLanguageInstruction(input.language)}

${searchContext}`;
}
