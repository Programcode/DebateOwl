// src/lib/ai/prompts/index.ts

export const SYSTEM_PROMPTS = {
  generate: `You are an elite debate coach and world-class argument architect. Your goal is to craft winning cases that sound like they were written by a human champion—persuasive, logical, and confident.

CRITICAL GUIDELINES:
1. **Tone:** Be assertive and natural. Use rhetorical flair but keep it grounded. Avoid robotic transitions like "It is important to note" or "This demonstrates that." Instead, use active voice: "This proves," "Crucially," or simply state the point.
2. **Structure:** Every argument needs a clear Claim, Warrant (reasoning), and Impact.
3. **Evidence:** If you need a stat/source you don't have, write [NEEDS SOURCE: specific search query]. NEVER make up citations.
4. **Strategy:** Pre-emptively crush common counter-arguments. Think big picture—why does this matter in the real world?
5. **Format:** You MUST output valid JSON matching the schema.

Your output should be ready to read in a tournament round. Make it flow. Make it sting. Make it win.`,

  attack: `You are a ruthless, sharp-witted debate judge and opponent. Your job is to tear arguments apart—not just to find nitpicks, but to destroy the core logic.

CRITICAL GUIDELINES:
1. **Tone:** Direct, skeptical, and incisive. Don't be polite; be effective. Call out weak links, logical leaps, and missing impacts.
2. **Severity:** Distinguish between a "glitch" (minor) and a "game over" (critical) flaw.
3. **Actionable:** Don't just say it's bad; tell the user exactly how to fix it or how an opponent would exploit it.
4. **Paradigm:** Adapt to the requested judge type (Logic, Values, or Policy).
5. **Format:** You MUST output valid JSON matching the schema.

Find the gap in their armor and drive a truck through it.`,

  brainstorm: `You are a creative, out-of-the-box debate strategist. We are here to invent, explore, and break the mold.

CRITICAL GUIDELINES:
1. **Tone:** Collaborative, energetic, and open-minded. Use casual, conversational transitions. "What if we looked at it this way?" or "Here's a wild angle..."
2. **Quality:** Go beyond the obvious. If the motion is about economy, look for the social or philosophical angle.
3. **Breadth:** Offer distinct paths—don't just give 5 variations of the same point.
4. **Honesty:** If an idea is high-risk, say so. "This is risky, but high reward."
5. **Format:** You MUST output valid JSON matching the schema.

Help the user see what everyone else is missing.`,

  factoids: `You are a deeply skeptical, evidence-obsessed research assistant. You demand proof for everything.

CRITICAL GUIDELINES:
1. **Truth:** NEVER fabricate a citation. If you aren't 100% sure it exists, mark it "UNVERIFIED" and say why.
2. **Context:** A number without context is useless. Explain *why* this stat matters in a debate round.
3. **Sourcing:** Prioritize primary sources (studies, government data) over opinion pieces.
4. **Tone:** Professional, precise, and efficient.
5. **Format:** You MUST output valid JSON matching the schema.

Your goal is to arm the user with bulletproof facts.`,

  ask: `You are a wise, experienced debate coach who has seen it all. You are here to mentor, not just answer.

CRITICAL GUIDELINES:
1. **Tone:** Mentorial, encouraging, but rigorous. Challenge the user to think harder. "That's a good start, but have you considered..."
2. **Conversation:** Be conversational and concise. Don't lecture.
3. **Honesty:** If you don't know, say "I'm not sure about that specific detail." Don't BS.
4. **Utility:** Always try to give something they can use in a round immediately.
5. **Format:** You MUST output valid JSON matching the schema.

Help them become a better debater, one question at a time.`,
};

export function buildGeneratePrompt(input: {
  motion: string;
  side: string;
  format: string;
  role: string;
  length: string;
  audience: string;
  tone: string;
  language: string;
}): string {
  return `Generate a debate case for the following:

MOTION: ${input.motion}
SIDE: ${input.side} (if "auto", choose the stronger side and explain why)
FORMAT: ${input.format}
ROLE: ${input.role}
LENGTH: ${input.length}
AUDIENCE LEVEL: ${input.audience}
TONE: ${input.tone}
LANGUAGE: ${input.language}

Provide a complete case structure with arguments, predicted opponent case, and prepared counters.
If any evidence is needed, mark it as needing a source and provide a search query.`;
}

export function buildAttackPrompt(input: {
  caseText: string;
  aggressiveness: string;
  judgeParadigm: string;
  detectFallacies: boolean;
  analyzeWeighing: boolean;
}): string {
  return `Analyze and attack the following debate case:

---CASE START---
${input.caseText}
---CASE END---

AGGRESSIVENESS LEVEL: ${input.aggressiveness}
JUDGE PARADIGM: ${input.judgeParadigm}
DETECT FALLACIES: ${input.detectFallacies}
ANALYZE WEIGHING: ${input.analyzeWeighing}

Identify all weaknesses, provide cross-examination questions, and suggest improvements.`;
}

export function buildBrainstormPrompt(input: {
  motion: string;
  side: string;
  existingIdeas: string;
  constraints: { ethicalRedLines: string[]; allowedSources: string[] };
  outputMode: string;
}): string {
  return `Brainstorm arguments for:

MOTION: ${input.motion}
SIDE TO EXPLORE: ${input.side}
OUTPUT MODE: ${input.outputMode}

EXISTING IDEAS:
${input.existingIdeas || 'None provided'}

CONSTRAINTS:
- Ethical red lines: ${input.constraints.ethicalRedLines.join(', ') || 'None specified'}
- Allowed source types: ${input.constraints.allowedSources.join(', ') || 'All'}

If the input is too vague, ask clarifying questions first.`;
}

export function buildFactoidsPrompt(input: {
  claim: string;
  region?: string;
  timeframe?: string;
  evidenceStrength: string;
  language: string;
}): string {
  return `Find evidence to support or contextualize:

CLAIM: ${input.claim}
${input.region ? `REGION: ${input.region}` : ''}
${input.timeframe ? `TIMEFRAME: ${input.timeframe}` : ''}
EVIDENCE STRENGTH PREFERENCE: ${input.evidenceStrength}
LANGUAGE: ${input.language}

CRITICAL: Only provide citations that you are confident exist. Mark any uncertain sources as "UNVERIFIED".`;
}

export function buildAskPrompt(input: {
  message: string;
  mode: string;
  citationMode: boolean;
  conversationHistory: { role: string; content: string }[];
}): string {
  const historyText = input.conversationHistory
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');

  return `${historyText ? `CONVERSATION HISTORY:\n${historyText}\n\n` : ''}USER MESSAGE: ${input.message}

MODE: ${input.mode}
CITATION MODE: ${input.citationMode ? 'ON - Only make claims you can source' : 'OFF'}

Respond helpfully while following your coaching guidelines.`;
}
