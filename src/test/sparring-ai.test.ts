import { describe, expect, it } from 'vitest';
import {
  SparringInputSchema,
  SparringScorecardSchema,
  SparringScoreResponseSchema,
  SparringTurnResponseSchema,
  type SparringSpeech,
} from '@/lib/ai/schemas/sparring';

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

  it('accepts every first-class school speaker role', () => {
    for (const [kind, label, seconds] of [
      ['introductor', 'Con Introductor', 240],
      ['r1', 'Con R1', 360],
      ['r2', 'Con R2', 360],
      ['conclusor', 'Con Conclusor', 180],
    ] as const) {
      expect(SparringInputSchema.safeParse({
        ...session,
        format: 'standard',
        action: 'respond',
        currentTurn: { id: `standard-${kind}`, label, side: 'con', kind, timeLimitSeconds: seconds },
      }).success).toBe(true);
    }
  });

  it('caps session context at twelve speeches and requires all score categories', () => {
    const speeches = Array.from({ length: 13 }, (_, index) => ({
      id: `speech-${index + 1}`,
      turnId: `turn-${index + 1}`,
      speaker: index % 2 === 0 ? 'user' as const : 'ai' as const,
      side: index % 2 === 0 ? 'pro' as const : 'con' as const,
      role: `Speaker ${index + 1}`,
      content: `Complete argument ${index + 1}.`,
      createdAt: index + 1,
      timeLimitSeconds: 240,
      timeUsedSeconds: 20,
      ...(index % 2 === 1 ? { integrityToken: `${'x'.repeat(40)}${index + 1}` } : {}),
    }));
    expect(SparringInputSchema.safeParse({ ...session, action: 'score', speeches: speeches.slice(0, 12) }).success).toBe(true);
    expect(SparringInputSchema.safeParse({ ...session, action: 'score', speeches }).success).toBe(false);
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
});
