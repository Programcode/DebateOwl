import { describe, expect, it } from 'vitest';
import {
  CrossfireAIInputSchema,
  CrossfireDebriefSchema,
  CrossfireReplySchema,
  CrossfireStateSchema,
  MAX_CROSSFIRE_ARGUMENT_CHARS,
  MAX_CROSSFIRE_REPLY_CHARS,
  MAX_CROSSFIRE_TRANSCRIPT_CHARS,
  type CrossfireConfig,
  type CrossfireDebrief,
  type CrossfireTurn,
} from '@/lib/crossfire/schemas';

const config: CrossfireConfig = {
  resolution: 'Resolved: cities should ban private cars downtown.',
  argument: 'Private cars create congestion and unsafe streets.',
  mode: 'question-ai',
  style: 'cooperative',
  durationSeconds: 180,
  useSourceLibrary: false,
  seedQuestions: [],
};

const turn: CrossfireTurn = {
  id: 'T1',
  sequence: 1,
  speaker: 'user',
  kind: 'question',
  text: 'What evidence supports the congestion claim?',
  createdAt: 1,
};

describe('Crossfire schemas', () => {
  it('accepts bounded next-turn input and rejects oversized arguments', () => {
    expect(CrossfireAIInputSchema.safeParse({
      operation: 'next-turn',
      config,
      transcript: [turn],
      expectedReply: 'answer',
    }).success).toBe(true);

    expect(CrossfireAIInputSchema.safeParse({
      operation: 'next-turn',
      config: { ...config, argument: 'x'.repeat(MAX_CROSSFIRE_ARGUMENT_CHARS + 1) },
      transcript: [turn],
      expectedReply: 'answer',
    }).success).toBe(false);
  });

  it('rejects transcripts that exceed the total character budget', () => {
    const oversizedTurns = Array.from({ length: 13 }, (_, index) => ({
      ...turn,
      id: `T${index + 1}`,
      sequence: index + 1,
      text: 'x'.repeat(Math.ceil(MAX_CROSSFIRE_TRANSCRIPT_CHARS / 12)),
    }));
    expect(CrossfireAIInputSchema.safeParse({
      operation: 'next-turn',
      config,
      transcript: oversizedTurns,
      expectedReply: 'answer',
    }).success).toBe(false);
  });

  it('rejects duplicate turn IDs and non-consecutive sequences', () => {
    const secondTurn = {
      ...turn,
      id: 'T2',
      sequence: 2,
      speaker: 'ai' as const,
      kind: 'answer' as const,
    };
    expect(CrossfireAIInputSchema.safeParse({
      operation: 'next-turn',
      config,
      transcript: [turn, { ...secondTurn, id: turn.id }],
      expectedReply: 'question',
    }).success).toBe(false);
    expect(CrossfireAIInputSchema.safeParse({
      operation: 'next-turn',
      config,
      transcript: [turn, { ...secondTurn, sequence: 3 }],
      expectedReply: 'question',
    }).success).toBe(false);
  });

  it('validates strict, bounded AI replies', () => {
    expect(CrossfireReplySchema.parse({ type: 'answer', text: 'The policy reduces vehicle trips.' })).toEqual({
      type: 'answer',
      text: 'The policy reduces vehicle trips.',
    });
    expect(CrossfireReplySchema.safeParse({ type: 'answer', text: '' }).success).toBe(false);
    expect(CrossfireReplySchema.safeParse({ type: 'answer', text: 'x'.repeat(MAX_CROSSFIRE_REPLY_CHARS + 1) }).success).toBe(false);
    expect(CrossfireReplySchema.safeParse({ type: 'answer', text: 'Valid', extra: true }).success).toBe(false);
  });

  it('requires every debrief claim and suggestion to cite transcript turns', () => {
    const valid: CrossfireDebrief = {
      concessionsSecured: [{ turnIds: ['T2'], claim: 'The answer concedes implementation has a cost.' }],
      controlledQuestions: [{ turnIds: ['T1', 'T2'], claim: 'The opening question fixes the scope.' }],
      weakOrRepetitiveQuestions: [],
      evasiveOrIncompleteAnswers: [],
      missedFollowUps: [{ turnIds: ['T2'], claim: 'The cost concession was not quantified.' }],
      betterFollowUpQuestions: [{ turnIds: ['T2'], question: 'How large is that cost?', reason: 'It tests the concession.' }],
      strongestExchange: { turnIds: ['T1', 'T2'], claim: 'The first exchange establishes the central tradeoff.' },
    };
    expect(CrossfireDebriefSchema.safeParse(valid).success).toBe(true);
    expect(CrossfireDebriefSchema.safeParse({
      ...valid,
      concessionsSecured: [{ turnIds: [], claim: 'Uncited claim' }],
    }).success).toBe(false);
  });

  it('allows an unfinished empty setup state but not an active invalid config', () => {
    expect(CrossfireStateSchema.safeParse({
      phase: 'setup',
      config: { ...config, resolution: '', argument: '' },
    }).success).toBe(true);
    expect(CrossfireStateSchema.safeParse({
      phase: 'active',
      sessionId: 'session-1',
      config: { ...config, resolution: '' },
      turns: [],
      startedAt: 1,
      endsAt: 2,
      request: { status: 'idle' },
    }).success).toBe(false);
  });
});
