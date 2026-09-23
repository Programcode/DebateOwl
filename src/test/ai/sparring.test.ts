import { beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseMock, resetMockState, setMockInvokeResponse } from '../mocks/supabase';
import {
  AIResponseError,
  generateSparringTurn,
  judgeSparringSession,
} from '@/lib/ai/client';
import type { SparringRespondInput, SparringScoreInput } from '@/lib/ai/schemas/sparring';
import type { ProviderConfig } from '@/lib/ai/providers/types';

const authState = vi.hoisted(() => ({ token: 'cached-token', userId: 'user-1' }));

vi.mock('@/lib/supabase/client', () => ({
  getActiveAccessToken: (): string | null => authState.token,
  getActiveUserId: (): string | null => authState.userId,
  invokeAuthenticatedFunction: supabaseMock.functions.invoke,
  supabase: supabaseMock,
}));

const CONFIG: ProviderConfig = {
  provider: 'openai',
  model: 'gpt-4o',
  temperature: 0.7,
};

const SESSION: Omit<SparringRespondInput, 'action' | 'currentTurn'> = {
  sessionId: '00000000-0000-4000-8000-000000000001',
  motion: 'This House would make public transport free at the point of use.',
  userSide: 'pro' as const,
  format: 'pf' as const,
  difficulty: 'hard' as const,
  speeches: [{
    id: 'speech-1',
    turnId: 'pf-1',
    speaker: 'user',
    side: 'pro',
    role: 'Pro constructive',
    content: 'Universal access removes the direct price barrier to participation.',
    createdAt: 1_000,
    timeLimitSeconds: 240,
    timeUsedSeconds: 80,
  }],
  language: 'en',
};

const RESPOND_INPUT: SparringRespondInput = {
  ...SESSION,
  action: 'respond',
  currentTurn: {
    id: 'pf-2',
    label: 'Con constructive',
    side: 'con',
    kind: 'constructive',
    timeLimitSeconds: 240,
  },
};

const SCORE_INPUT: SparringScoreInput = {
  ...SESSION,
  action: 'score',
};

const TURN_RESPONSE = {
  action: 'respond' as const,
  speech: {
    content: 'Universal access removes a direct barrier to participation.',
    strategy: 'Answer the central claim and weigh the mechanism.',
    targetedPoints: ['The warrant needs a clearer causal link.'],
  },
};

const SCORE_RESPONSE = {
  action: 'score' as const,
  scorecard: {
    userScore: 78,
    aiScore: 74,
    categories: [
      { name: 'Logic' as const, userScore: 20, aiScore: 18, feedback: 'The causal chain was clear.' },
      { name: 'Evidence' as const, userScore: 18, aiScore: 18, feedback: 'The factual warrant needed more support.' },
      { name: 'Delivery' as const, userScore: 19, aiScore: 19, feedback: 'Judged from organization, not vocal performance.' },
      { name: 'Strategy' as const, userScore: 21, aiScore: 19, feedback: 'The user prioritized the central clash.' },
    ],
    overallFeedback: 'The user won a narrow edge by weighing the main mechanism.',
    keyMoments: ['The rebuttal answered the opponent’s strongest objection.'],
    improvementAreas: ['Compare the alternative policy explicitly.'],
    winner: 'user' as const,
    verdict: 'The user had the edge.',
  },
};

describe('sparring AI client', () => {
  beforeEach(() => {
    resetMockState();
    authState.token = 'cached-token';
    authState.userId = 'user-1';
  });

  it('sends a validated opponent-turn request with its full session context', async () => {
    setMockInvokeResponse({ output: TURN_RESPONSE });

    await expect(generateSparringTurn(RESPOND_INPUT, CONFIG)).resolves.toEqual(TURN_RESPONSE);
    expect(supabaseMock.functions.invoke).toHaveBeenCalledWith('ai', expect.objectContaining({
      headers: { Authorization: expect.stringContaining('Bearer') },
      body: expect.objectContaining({
        feature: 'sparring',
        provider: 'openrouter',
        model: 'gpt-4o',
        input: expect.objectContaining({
          action: 'respond',
          sessionId: SESSION.sessionId,
          motion: SESSION.motion,
          format: 'pf',
          difficulty: 'hard',
          currentTurn: RESPOND_INPUT.currentTurn,
        }),
      }),
    }));
  });

  it('shares identical in-flight turn requests across remounts', async () => {
    let resolveInvoke!: (value: { data: { output: typeof TURN_RESPONSE }; error: null }) => void;
    const invokeResponse = new Promise<{ data: { output: typeof TURN_RESPONSE }; error: null }>((resolve) => {
      resolveInvoke = resolve;
    });
    supabaseMock.functions.invoke.mockImplementation(() => invokeResponse);

    const first = generateSparringTurn(RESPOND_INPUT, CONFIG);
    await vi.waitFor(() => expect(supabaseMock.functions.invoke).toHaveBeenCalledTimes(1));
    authState.token = 'refreshed-token';
    const second = generateSparringTurn(RESPOND_INPUT, CONFIG);
    await Promise.resolve();
    resolveInvoke({ data: { output: TURN_RESPONSE }, error: null });

    await expect(Promise.all([first, second])).resolves.toEqual([TURN_RESPONSE, TURN_RESPONSE]);
    expect(supabaseMock.functions.invoke).toHaveBeenCalledTimes(1);
  });

  it('sends turns and scores without reopening the Supabase session', async () => {
    setMockInvokeResponse({ output: TURN_RESPONSE });
    supabaseMock.auth.getSession.mockRejectedValue(new Error('session lookup must not run'));

    await expect(generateSparringTurn(RESPOND_INPUT, CONFIG)).resolves.toEqual(TURN_RESPONSE);
    setMockInvokeResponse({ output: SCORE_RESPONSE });
    await expect(judgeSparringSession(SCORE_INPUT, CONFIG)).resolves.toEqual(SCORE_RESPONSE);
    expect(supabaseMock.auth.getSession).not.toHaveBeenCalled();
  });

  it('sends a score request and validates the scorecard envelope', async () => {
    setMockInvokeResponse({ output: SCORE_RESPONSE });

    await expect(judgeSparringSession(SCORE_INPUT, CONFIG)).resolves.toEqual(SCORE_RESPONSE);
    expect(supabaseMock.functions.invoke).toHaveBeenCalledWith('ai', expect.objectContaining({
      body: expect.objectContaining({
        feature: 'sparring',
        input: expect.objectContaining({
          action: 'score',
          sessionId: SESSION.sessionId,
          speeches: expect.arrayContaining([
            expect.objectContaining({ id: 'speech-1', speaker: 'user', content: expect.stringContaining('Universal access') }),
          ]),
          language: 'en',
        }),
      }),
    }));
  });

  it('rejects a malformed opponent response before the page can append it', async () => {
    setMockInvokeResponse({
      output: {
        action: 'respond',
        speech: { content: '', strategy: 42, targetedPoints: [''] },
      },
    });

    await expect(generateSparringTurn(RESPOND_INPUT, CONFIG))
      .rejects.toBeInstanceOf(AIResponseError);
    expect(supabaseMock.functions.invoke).toHaveBeenCalledTimes(1);
  });

  it('rejects a malformed scorecard rather than accepting partial judging', async () => {
    setMockInvokeResponse({
      output: {
        action: 'score',
        scorecard: { ...SCORE_RESPONSE.scorecard, categories: SCORE_RESPONSE.scorecard.categories.slice(0, 3) },
      },
    });

    await expect(judgeSparringSession(SCORE_INPUT, CONFIG))
      .rejects.toMatchObject({ name: 'AIResponseError' });
  });

  it('rejects a turn request passed to the scoring operation', async () => {
    await expect(judgeSparringSession(RESPOND_INPUT as unknown as SparringScoreInput, CONFIG))
      .rejects.toMatchObject({ name: 'AIResponseError' });
    expect(supabaseMock.functions.invoke).not.toHaveBeenCalled();
  });
});
