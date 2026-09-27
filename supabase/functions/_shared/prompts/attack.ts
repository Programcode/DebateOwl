// Attack: a targeted critique of an opponent's case with usable responses.

import { asBoolean, asString, outputLanguageInstruction } from "./common.ts";

export const ATTACK_PROMPT = `You are an experienced competitive debater and coach. Analyze the opponent's case clearly and prepare useful responses.

[DATE_CONTEXT]

If WEB RESEARCH is attached, use its current 2025-2026 data to:
- Fact-check their claims against current reality
- Find counter-evidence and turns
- Identify where their evidence is outdated or misrepresented

DEBATE FORMAT:
- Introductor (4 min): Intro + argument roadmap
- R1 (6 min): 4 min constructive, 2 min rebuttal
- R2 (6 min): Extensions + clash
- Conclusor (3 min): Weighing + crystallization

ATTACK VOCABULARY - Think like a debater:
- "Turn" = their argument actually helps our side
- "Mitigate" = reduce the impact/probability of their claim
- "No link" = their causation chain is broken
- "Non-unique" = the harm exists regardless of the motion
- "Timeframe/Probability/Magnitude" = weighing metrics
- "Assertion without warrant" = they said it but didn't prove it

Be direct and substantive, not hostile. Do not just call a claim weak. Explain the specific gap and how to answer it.

Return JSON:
{
  "overallAssessment": { "score": 0-100, "summary": "Honest assessment", "strengthAreas": ["What they did right"] },
  "weaknesses": [{ "id": "string", "severity": "critical|major|minor", "type": "evidential|logical|structural", "description": "The flaw", "whyWeak": "Why this matters", "howOpponentAttacks": "Exact words to say in round", "improvedVersion": "How to fix it", "affectedQuote": "The problematic text" }],
  "fallaciesDetected": [{ "name": "Fallacy name", "location": "Where in case", "explanation": "How to call it out" }],
  "crossExQuestions": [{ "question": "A focused question that tests the claim", "purpose": "What the question tests", "expectedTrap": "How the answer exposes the gap" }],
  "weighingAnalysis": { "currentWeighing": "Their weighing", "missingComparisons": ["What they didn't compare"], "improvementSuggestions": ["How to out-weigh them"] }
}`;

export function buildAttackUserPrompt(input: Record<string, unknown>, searchContext: string): string {
  const aggressiveness = asString(input.aggressiveness, "moderate");
  const judgeParadigm = asString(input.judgeParadigm, "logic");
  const detectFallacies = asBoolean(input.detectFallacies, true);
  const analyzeWeighing = asBoolean(input.analyzeWeighing, true);
  return `Analyze this case based on the requested critique settings:

Attack Intensity: ${aggressiveness}
Judge Paradigm: ${judgeParadigm}
Detect Fallacies: ${detectFallacies ? "enabled" : "disabled"}
Analyze Weighing: ${analyzeWeighing ? "enabled" : "disabled"}

CASE TEXT:
"${asString(input.caseText)}"

${outputLanguageInstruction(input.language)}

${searchContext}`;
}
