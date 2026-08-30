import { describe, expect, it } from 'vitest';
import {
  SparringInputSchema,
  SparringScorecardSchema,
  SparringScoreResponseSchema,
  SparringTurnResponseSchema,
  type SparringSpeech,
} from '@/lib/ai/schemas/sparring';
import { mockGenerateSparringTurn, mockJudgeSparringSession } from '@/lib/ai/providers/mock-provider';

const session = {
  sessionId: '00000000-0000-4000-8000-000000000001',
  motion: 'This house would regulate social media algorithms',
  userSide: 'pro' as const,
  format: 'pf' as const,
  difficulty: 'medium' as const,
  language: 'en',
  speeches: [] as SparringSpeech[],
};

describe('Sparring AI contract', () => {
  it('accepts both discriminated request actions', () => {
    expect(SparringInputSchema.safeParse({
      ...session,
      action: 'respond',
      currentTurn: { id: 'pf-2', label: 'Con constructive', side: 'con', kind: 'constructive', timeLimitSeconds: 240 },
    }).success).toBe(true);
    expect(SparringInputSchema.safeParse({ ...session, action: 'score' }).success).toBe(true);
  });

  it('caps session context at twelve speeches and requires all score categories', () => {
    const speech = {
      id: 'speech-1', turnId: 'pf-1', speaker: 'user', side: 'pro', role: 'Pro constructive',
      content: 'A complete argument.', createdAt: 1, timeLimitSeconds: 240, timeUsedSeconds: 20,
    };
    expect(SparringInputSchema.safeParse({ ...session, action: 'score', speeches: Array(13).fill(speech) }).success).toBe(false);
    const category = (name: 'Logic' | 'Evidence' | 'Delivery' | 'Strategy') => ({ name, userScore: 20, aiScore: 18, feedback: 'Clear comparison.' });
    const scorecard = {
      userScore: 80, aiScore: 72,
      categories: ['Logic', 'Evidence', 'Delivery', 'Strategy'].map((name) => category(name as 'Logic' | 'Evidence' | 'Delivery' | 'Strategy')),
      overallFeedback: 'The user wins the central comparison.', keyMoments: ['The opening claim'], improvementAreas: ['Add a clearer warrant'], winner: 'user', verdict: 'User edge',
    };
    expect(SparringScorecardSchema.safeParse(scorecard).success).toBe(true);
    expect(SparringScorecardSchema.safeParse({ ...scorecard, categories: [category('Logic'), category('Logic'), category('Delivery'), category('Strategy')] }).success).toBe(false);
    expect(SparringScorecardSchema.safeParse({ ...scorecard, userScore: 79 }).success).toBe(false);
    expect(SparringScorecardSchema.safeParse({ ...scorecard, winner: 'ai' }).success).toBe(false);
  });

  it('produces deterministic, schema-valid mock turn and score responses', async () => {
    const respondInput = {
      ...session,
      action: 'respond' as const,
      currentTurn: { id: 'pf-2', label: 'Con constructive', side: 'con' as const, kind: 'constructive' as const, timeLimitSeconds: 240 },
      speeches: [{
        id: 'speech-1', turnId: 'pf-1', speaker: 'user' as const, side: 'pro' as const, role: 'Pro constructive',
        content: 'The policy improves accountability through transparent reporting.', createdAt: 1, timeLimitSeconds: 240, timeUsedSeconds: 30,
      }],
    };
    const firstTurn = await mockGenerateSparringTurn(respondInput);
    const secondTurn = await mockGenerateSparringTurn(respondInput);
    expect(firstTurn).toEqual(secondTurn);
    expect(SparringTurnResponseSchema.safeParse(firstTurn).success).toBe(true);

    const scoreInput = { ...session, action: 'score' as const, speeches: respondInput.speeches };
    const score = await mockJudgeSparringSession(scoreInput);
    expect(SparringScoreResponseSchema.safeParse(score).success).toBe(true);
    expect(score.scorecard.categories.map((category) => category.name)).toEqual(['Logic', 'Evidence', 'Delivery', 'Strategy']);
  });
});
