import { beforeEach, describe, expect, it, vi } from 'vitest';

const { settingsState } = vi.hoisted(() => ({
  settingsState: { outputLanguage: 'en' as 'en' | 'es' | 'hu' },
}));

vi.mock('@/lib/ai/client', () => ({
  AIResponseError: class AIResponseError extends Error {
    details?: Record<string, unknown>;
    constructor(message: string, options?: { details?: Record<string, unknown> }) {
      super(message);
      this.name = 'AIResponseError';
      this.details = options?.details;
    }
  },
  askChat: vi.fn(),
}));

vi.mock('@/lib/stores/settings-store', () => ({
  useSettingsStore: {
    getState: () => settingsState,
  },
}));

import { askChat } from '@/lib/ai/client';
import { requestSparringOpponent, requestSparringScorecard } from '@/lib/ai/sparring-client';
import type { SparringSession } from '@/lib/ai/schemas/sparring';

const config = { provider: 'google', model: 'gemini-3-flash-preview', temperature: 0.75 };

const session: SparringSession = {
  id: 'spar_test',
  setup: {
    motion: 'This House would ban targeted advertising to minors.',
    side: 'pro',
    difficulty: 'competitive',
    useActiveSources: true,
  },
  turns: [
    { id: 'u1', role: 'user', phase: 'opening', content: 'Targeted advertising exploits information asymmetry and encourages harmful consumption.', createdAt: 1 },
    { id: 'a1', role: 'ai', phase: 'opening', content: 'A ban is overbroad and less effective than enforcing transparency and data minimization.', createdAt: 2 },
    { id: 'u2', role: 'user', phase: 'rebuttal', content: 'Transparency does not remove the incentive to optimize manipulation against minors.', createdAt: 3 },
    { id: 'a2', role: 'ai', phase: 'rebuttal', content: 'The user still has not shown that a categorical ban outperforms narrower privacy rules.', createdAt: 4 },
  ],
  status: 'active',
  createdAt: 1,
  updatedAt: 4,
};

function askOutput(response: string) {
  return {
    response,
    followUpQuestions: [],
    uncertainties: [],
  };
}

const scorecard = {
  verdict: 'ai-edge',
  summary: 'The user had a plausible harm but did not win the policy comparison.',
  biggestImprovement: 'Compare the ban directly against the narrower alternative.',
  strengths: ['The rebuttal identified why transparency alone may not change incentives.'],
  missedArguments: ['No direct answer to the overbreadth objection.'],
  categories: [
    { category: 'argument-strength', rating: 'solid', evidence: 'The opening identified information asymmetry as the core harm.', advice: 'Tie the harm to the necessity of a ban.' },
    { category: 'warrant-quality', rating: 'solid', evidence: 'The manipulation mechanism was asserted but not fully developed.', advice: 'Explain why minors are uniquely vulnerable.' },
    { category: 'impact-analysis', rating: 'needs-work', evidence: 'The user did not compare the scale of the harm with the costs of a categorical ban.', advice: 'Quantify or at least comparatively weigh the affected harms.' },
    { category: 'engagement', rating: 'solid', evidence: 'The rebuttal answered transparency but not overbreadth.', advice: 'Answer every independent piece of opponent offense.' },
    { category: 'rebuttal-efficiency', rating: 'solid', evidence: 'The response was concise and on-clash.', advice: 'Use the saved time to answer the alternative policy.' },
    { category: 'weighing', rating: 'needs-work', evidence: 'There was no explicit probability or comparative solvency weighing.', advice: 'End with why your mechanism solves more reliably.' },
    { category: 'evidence-use', rating: 'needs-work', evidence: 'No evidence was cited in the typed transcript.', advice: 'Use one sourced fact only where it advances a contested warrant.' },
    { category: 'strategy', rating: 'needs-work', evidence: 'The round allowed the narrower-alternative framing to become decisive.', advice: 'Preempt alternatives in the opening or collapse onto why they fail.' },
  ],
  nextDrill: 'Give a 60-second comparative rebuttal against transparency-only regulation.',
};

describe('sparring-client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsState.outputLanguage = 'en';
  });

  it('parses a structured opponent response from Ask', async () => {
    vi.mocked(askChat).mockResolvedValueOnce(askOutput(JSON.stringify({
      speech: 'Your ban still has to beat a narrower privacy rule that addresses the same targeting problem.',
      pressurePoints: ['No comparative solvency against narrower regulation.'],
    })) as never);

    const result = await requestSparringOpponent(session, session.turns[2].content, config);
    expect(result.speech).toContain('narrower privacy rule');
    expect(result.pressurePoints).toHaveLength(1);
    expect(vi.mocked(askChat).mock.calls[0][0]).toContain('Respond to the user\'s actual arguments');
  });

  it('propagates the configured output language into opponent and scorecard prompts', async () => {
    settingsState.outputLanguage = 'es';
    vi.mocked(askChat)
      .mockResolvedValueOnce(askOutput(JSON.stringify({ speech: 'Respuesta del oponente.', pressurePoints: [] })) as never)
      .mockResolvedValueOnce(askOutput(JSON.stringify(scorecard)) as never);

    await requestSparringOpponent(session, session.turns[2].content, config);
    await requestSparringScorecard(session, config);

    expect(vi.mocked(askChat).mock.calls[0][0]).toContain('Response language: Spanish (es)');
    expect(vi.mocked(askChat).mock.calls[1][0]).toContain('Response language: Spanish (es)');
  });

  it('keeps useful plain-text opponent output instead of discarding it', async () => {
    vi.mocked(askChat).mockResolvedValueOnce(askOutput('You never answered why a narrower rule cannot solve the same harm.') as never);
    const result = await requestSparringOpponent(session, session.turns[2].content, config);
    expect(result.speech).toContain('narrower rule');
    expect(result.pressurePoints).toEqual([]);
  });

  it('parses the qualitative scorecard and forbids fake delivery judging in the prompt', async () => {
    vi.mocked(askChat).mockResolvedValueOnce(askOutput(`\`\`\`json\n${JSON.stringify(scorecard)}\n\`\`\``) as never);
    const result = await requestSparringScorecard(session, config);
    expect(result.verdict).toBe('ai-edge');
    expect(result.categories).toHaveLength(8);
    expect(vi.mocked(askChat).mock.calls[0][0]).toContain('Do not infer delivery, tone of voice');
  });

  it('repairs a malformed scorecard once before failing', async () => {
    vi.mocked(askChat)
      .mockResolvedValueOnce(askOutput('not json') as never)
      .mockResolvedValueOnce(askOutput(JSON.stringify(scorecard)) as never);

    const result = await requestSparringScorecard(session, config);
    expect(result.nextDrill).toContain('comparative rebuttal');
    expect(vi.mocked(askChat)).toHaveBeenCalledTimes(2);
  });
});
