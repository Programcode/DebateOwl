import { askChat, AIResponseError } from '@/lib/ai/client';
import type { ProviderConfig } from '@/lib/ai/providers/types';
import {
  SparringOpponentOutputSchema,
  SparringScorecardSchema,
  type SparringOpponentOutput,
  type SparringScorecard,
  type SparringSession,
  type SparringTurn,
} from '@/lib/ai/schemas/sparring';

function opposingSide(side: 'pro' | 'con') {
  return side === 'pro' ? 'con' : 'pro';
}

function difficultyInstruction(difficulty: SparringSession['setup']['difficulty']) {
  switch (difficulty) {
    case 'beginner':
      return 'Argue clearly and realistically. Pressure obvious gaps, but do not use obscure theory or intentionally tricky framing.';
    case 'brutal':
      return 'Argue like a strong elimination-round opponent. Exploit dropped warrants, force comparative weighing, and punish unsupported assertions. Stay fair and do not invent evidence.';
    case 'competitive':
    default:
      return 'Argue like a competent tournament opponent. Directly engage the user, develop warrants, and create clear clash without manufacturing facts.';
  }
}

function transcript(turns: SparringTurn[]) {
  return turns.map((turn, index) => {
    const speaker = turn.role === 'user' ? 'USER' : 'AI OPPONENT';
    return `${index + 1}. ${speaker} (${turn.phase.toUpperCase()}):\n${turn.content}`;
  }).join('\n\n');
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(unfenced.slice(start, end + 1));
    }
    throw new Error('No JSON object found');
  }
}

function opponentPrompt(session: SparringSession, userSpeech: string) {
  const aiSide = opposingSide(session.setup.side);
  return `You are the opponent in a DebateLab sparring round.

Motion: ${session.setup.motion}
User side: ${session.setup.side}
Your side: ${aiSide}
Difficulty: ${session.setup.difficulty}
Difficulty instruction: ${difficultyInstruction(session.setup.difficulty)}

Round transcript so far:
${transcript(session.turns)}

The user's newest speech is:
${userSpeech}

Respond to the user's actual arguments, not a generic version of the motion. Do not invent facts, quotations, statistics, studies, or sources. If the user's claim lacks support, attack the missing warrant instead of fabricating counter-evidence. Make the speech usable in a real round and keep it under 550 words.

Inside your normal DebateLab response field, return ONLY this JSON object and no markdown fences:
{
  "speech": "the opponent speech",
  "pressurePoints": ["up to four specific vulnerabilities in the user's latest speech"]
}`;
}

function scorecardPrompt(session: SparringSession) {
  return `Judge this completed DebateLab sparring round as a demanding but fair debate coach.

Motion: ${session.setup.motion}
User side: ${session.setup.side}
AI opponent side: ${opposingSide(session.setup.side)}
Difficulty: ${session.setup.difficulty}
Active Source Library grounding was ${session.setup.useActiveSources ? 'enabled' : 'not requested'} for the round.

FULL TRANSCRIPT:
${transcript(session.turns)}

Evaluate only what appears in the transcript. Do not pretend the user cited evidence they did not cite. Do not infer delivery, tone of voice, eye contact, speaking speed, or other audio qualities from typed text. For every category, point to a specific argument, omission, comparison, or response from the transcript. Scores are deliberately qualitative because false numeric precision is not useful here.

Inside your normal DebateLab response field, return ONLY this JSON object and no markdown fences:
{
  "verdict": "user-edge | ai-edge | close",
  "summary": "short judge-style explanation of the round",
  "biggestImprovement": "the single highest-leverage change for the user's next round",
  "strengths": ["specific strengths, maximum five"],
  "missedArguments": ["arguments, responses, or weighing opportunities the user missed, maximum five"],
  "categories": [
    { "category": "argument-strength", "rating": "needs-work | solid | strong", "evidence": "specific transcript evidence", "advice": "concrete improvement" },
    { "category": "warrant-quality", "rating": "needs-work | solid | strong", "evidence": "specific transcript evidence", "advice": "concrete improvement" },
    { "category": "impact-analysis", "rating": "needs-work | solid | strong", "evidence": "specific transcript evidence", "advice": "concrete improvement" },
    { "category": "engagement", "rating": "needs-work | solid | strong", "evidence": "specific transcript evidence", "advice": "concrete improvement" },
    { "category": "rebuttal-efficiency", "rating": "needs-work | solid | strong", "evidence": "specific transcript evidence", "advice": "concrete improvement" },
    { "category": "weighing", "rating": "needs-work | solid | strong", "evidence": "specific transcript evidence", "advice": "concrete improvement" },
    { "category": "evidence-use", "rating": "needs-work | solid | strong", "evidence": "specific transcript evidence", "advice": "concrete improvement" },
    { "category": "strategy", "rating": "needs-work | solid | strong", "evidence": "specific transcript evidence", "advice": "concrete improvement" }
  ],
  "nextDrill": "one focused drill the user can do immediately"
}`;
}

async function askForJson(prompt: string, config: ProviderConfig) {
  const output = await askChat(prompt, [], 'general', config, {
    citationMode: false,
    webSearch: false,
    prosConsMode: false,
    argumentMapMode: false,
  });
  return output.response;
}

export async function requestSparringOpponent(
  session: SparringSession,
  userSpeech: string,
  config: ProviderConfig,
): Promise<SparringOpponentOutput> {
  const response = await askForJson(opponentPrompt(session, userSpeech), config);
  try {
    return SparringOpponentOutputSchema.parse(extractJsonObject(response));
  } catch {
    // A plain-text opponent speech is still useful and safer than discarding a
    // successful provider response because it ignored the inner JSON request.
    const speech = response.trim();
    if (speech) return { speech, pressurePoints: [] };
    throw new AIResponseError('The sparring opponent returned an empty response.');
  }
}

export async function requestSparringScorecard(
  session: SparringSession,
  config: ProviderConfig,
): Promise<SparringScorecard> {
  const first = await askForJson(scorecardPrompt(session), config);
  try {
    return SparringScorecardSchema.parse(extractJsonObject(first));
  } catch {
    const repairPrompt = `${scorecardPrompt(session)}\n\nYour previous response could not be parsed as the requested scorecard. Re-evaluate from the transcript and return the raw JSON object only. Do not add prose or markdown fences.`;
    const repaired = await askForJson(repairPrompt, config);
    try {
      return SparringScorecardSchema.parse(extractJsonObject(repaired));
    } catch (error) {
      throw new AIResponseError('The sparring scorecard did not match the expected schema.', {
        details: { cause: error instanceof Error ? error.message : String(error) },
      });
    }
  }
}
