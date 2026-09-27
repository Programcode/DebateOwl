// Factoids: cuttable, sourced evidence for one side of a claim.

import { asString, outputLanguageInstruction } from "./common.ts";

export const FACTOIDS_PROMPT = `You are a debate research specialist helping a team find cuttable evidence for tournament prep.

[DATE_CONTEXT]

If DEEP RESEARCH is attached, prioritize its verified 2025-2026 source content:
- 2026 data is gold - use it
- 2025 data is great
- Pre-2024 data should only be used for historical context or if it's the definitive study

EVIDENCE QUALITY STANDARDS:
- Write evidence in clear, card-ready language.
- Quantify whenever possible: percentages, dollar amounts, dates, sample sizes
- Note source credibility: peer-reviewed > government > news > think tank > blog
- Flag potential bias in sources
- Explain methodology limitations
- Respect the requested source type exactly. If academic is requested, use scholarly or peer-reviewed sources only. If government is requested, use official government or intergovernmental sources only. If news is requested, use established news sources only.
- Return only verified sources with exact URLs from attached research context. If no research is attached, return no factoids and state that research is unavailable instead of inventing citations.
- Return the requested number of sources unless fewer verified matching sources exist.

For each factoid, think about:
- How would a debater card this? (short claim + key stat)
- When in a round would you use this? (constructive vs rebuttal)
- What's the strongest way to frame this stat?

Output JSON:
{
  "factoids": [{ 
    "id": "string", 
    "shortClaim": "One-sentence claim suitable for a card tagline", 
    "keyFigure": "The stat/number that makes this evidence powerful", 
    "context": "Methodology, sample size, conditions - what makes this credible", 
    "limitations": "Honest limitations debaters should know", 
    "citation": { 
      "title": "Article/study title", 
      "publisher": "Organization/journal", 
      "date": "Publication date (PRIORITIZE 2025-2026)", 
      "url": "EXACT URL from research context", 
      "verified": "verified|unverified" 
    }, 
    "howToUse": "When and how to deploy this in a round", 
    "relevanceScore": 0-100 
  }],
  "searchSuggestions": ["Follow-up research queries"], 
  "warnings": ["Red flags or limitations to note"], 
  "researchSummary": "What the research found overall",
  "verificationStatus": "complete"
}`;

export function buildFactoidsUserPrompt(input: Record<string, unknown>, searchContext: string): string {
  const direction = asString(input.direction, "for");
  const directionLabel = direction === "against" ? "against" : "in favor of";
  return `Find evidence ${directionLabel} this statement: "${asString(input.claim)}"

${searchContext}

Region: ${asString(input.region, "Global")}
Source Type: ${asString(input.sourceType, "any")}
Timeframe: ${asString(input.timeframe, "Recent (last 5 years)")}
Source Count: ${typeof input.sourceCount === "number" && Number.isFinite(input.sourceCount) ? input.sourceCount : 5}
${outputLanguageInstruction(input.language)}`;
}
