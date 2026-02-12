/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderConfig } from '@/lib/ai/providers/types';
import type { GenerateInput } from '@/lib/ai/schemas/generate';

const {
  getSessionMock,
  invokeMock,
  addSourceMock,
  sessionState,
  settingsState,
} = vi.hoisted(() => {
  const getSessionMock = vi.fn();
  const invokeMock = vi.fn();
  const addSourceMock = vi.fn();
  const sessionState = {
    sourceLibrary: [
      { title: 'Active source', content: 'Useful evidence', origin: 'https://example.com', type: 'url', isActive: true },
      { title: 'Inactive source', content: 'Ignore me', origin: 'https://example.com/2', type: 'url', isActive: false },
    ],
    addSource: addSourceMock,
  };
  const settingsState = {
    customSystemPrompt: 'custom-system-prompt',
  };

  return { getSessionMock, invokeMock, addSourceMock, sessionState, settingsState };
});

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
    },
    functions: {
      invoke: invokeMock,
    },
  },
}));

vi.mock('@/lib/stores/settings-store', () => ({
  useSettingsStore: {
    getState: vi.fn(() => settingsState),
  },
}));

vi.mock('@/lib/stores/session-store', () => ({
  useSessionStore: {
    getState: vi.fn(() => sessionState),
  },
}));

import {
  AIAuthError,
  AIError,
  AIModelRestrictionError,
  AIProviderError,
  AIRateLimitError,
  AIResponseError,
  AISubscriptionError,
  TimeoutError,
  attackCase,
  askChat,
  brainstorm,
  factoids,
  generateCase,
  isAIAuthError,
  isAIModelRestrictionError,
  isAIProviderError,
  isAIRateLimitError,
  isAISubscriptionError,
  isTimeoutError,
} from '@/lib/ai/client';

const config: ProviderConfig = {
  provider: 'openai',
  model: 'gpt-4o',
  temperature: 0.6,
};

const validGenerateInput: GenerateInput = {
  motion: 'This house would adopt universal basic income',
  side: 'pro',
  format: 'bp',
  role: 'intro',
  length: 'brief',
  audience: 'beginner',
  tone: 'formal',
  language: 'en',
};

const validGenerateOutput = {
  caseStructure: {
    thesis: 'Universal basic income improves economic resilience',
    framework: 'Welfare economics',
    keyDefinitions: ['universal basic income'],
    burdenOfProof: 'Prove net societal benefits',
  },
  contentions: [],
  predictedOpponentCase: {
    likelyArguments: [],
    strategicWeaknesses: [],
    keyClashes: [],
  },
  counters: [],
  metadata: {
    side: 'pro',
    format: 'bp',
    generatedAt: '2026-01-01T00:00:00.000Z',
  },
};

describe('AI client branch coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'token-123' } },
    });
    sessionState.addSource.mockResolvedValue(undefined);
  });

  it('throws AISubscriptionError for trial-expired response payload', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        error: 'Trial ended',
        code: 'trial_expired',
        limit: 5,
        current: 5,
      },
      error: null,
    });

    try {
      await generateCase(validGenerateInput, config);
      throw new Error('Expected generateCase to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AISubscriptionError);
      expect(error).toMatchObject({ code: 'trial_expired', limit: 5, current: 5 });
    }
  });

  it('throws AIModelRestrictionError for upgrade_required responses', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        error: 'This model requires upgrade',
        code: 'upgrade_required',
      },
      error: null,
    });

    await expect(generateCase(validGenerateInput, config)).rejects.toBeInstanceOf(AIModelRestrictionError);
  });

  it('throws AIRateLimitError when response indicates rate limits', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        error: 'rate limit exceeded',
        limit: 10,
        current: 10,
      },
      error: null,
    });

    await expect(generateCase(validGenerateInput, config)).rejects.toBeInstanceOf(AIRateLimitError);
  });

  it('throws AIProviderError when provider error text is returned', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        error: 'OpenAI API unavailable',
      },
      error: null,
    });

    await expect(generateCase(validGenerateInput, config)).rejects.toBeInstanceOf(AIProviderError);
  });

  it('throws AIResponseError when output is missing', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        requestId: 'abc',
      },
      error: null,
    });

    await expect(generateCase(validGenerateInput, config)).rejects.toBeInstanceOf(AIResponseError);
  });

  it('transforms non-schema generate output into required structure', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        output: {
          title: 'Fallback Thesis',
          side: 'con',
          contentions: [
            {
              title: 'Cost burden',
              analysis: 'Costs increase quickly',
              evidence: ['OECD report'],
            },
          ],
          rebuttals: [
            {
              attack: 'It is too expensive',
              response: 'Long-term gains offset initial costs',
            },
          ],
          potentialWeaknesses: ['Funding complexity'],
        },
      },
      error: null,
    });

    const result = await generateCase(validGenerateInput, config);

    expect(result.caseStructure.thesis).toBe('Fallback Thesis');
    expect(result.metadata.side).toBe('con');
    expect(result.contentions[0].claim).toBe('Cost burden');
    expect(result.contentions[0].evidence).toContain('OECD report');
    expect(result.counters[0].targetArgument).toBe('It is too expensive');
    expect(result.predictedOpponentCase.strategicWeaknesses).toContain('Funding complexity');
  });

  it('stores discovered sources for generate responses', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        output: validGenerateOutput,
        discoveredSources: [
          { title: 'Source A', url: 'https://a.com', content: 'A content' },
          { title: 'Source B', url: 'https://b.com', content: 'B content' },
        ],
      },
      error: null,
    });

    await generateCase(validGenerateInput, config);

    expect(addSourceMock).toHaveBeenCalledTimes(2);
    expect(addSourceMock).toHaveBeenCalledWith({
      title: 'Source A',
      content: 'A content',
      type: 'url',
      origin: 'https://a.com',
    });
  });

  it('normalizes brainstorm output for topFive, mindmap, and buckets', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        output: {
          needsMoreInfo: 1,
          clarifyingQuestions: ['What audience?'],
          nextSteps: ['Pick strongest frame'],
          warningsAndTradeoffs: ['May trigger equity concerns'],
          topFive: [
            {
              rank: 1,
              idea: { title: 'Economic stability', side: 'pro', strength: 'strong' },
              whyTop: 'Most pragmatic',
            },
            null,
          ],
          mindmap: [
            {
              category: 'Economy',
              items: [{ title: 'Inflation risk', side: 'con' }],
            },
          ],
          buckets: [
            {
              name: 'Implementation',
              ideas: [{ title: 'Phased rollout', side: 'pro', tradeoffs: ['slower impact'] }],
              keyInsight: 'Start small',
            },
          ],
        },
      },
      error: null,
    });

    const result = await brainstorm(
      { motion: 'UBI', side: 'both', outputMode: 'topfive' },
      config,
    );

    expect(result.needsMoreInfo).toBe(true);
    expect(result.topFive).toHaveLength(1);
    expect(result.topFive?.[0].idea.title).toBe('Economic stability');
    expect(result.mindmap?.[0].items[0].title).toBe('Inflation risk');
    expect(result.buckets?.[0].ideas[0].title).toBe('Phased rollout');
  });

  it('stores discovered sources for brainstorm responses', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        output: { needsMoreInfo: false, clarifyingQuestions: [], nextSteps: [], warningsAndTradeoffs: [] },
        discoveredSources: [{ title: 'Source C', url: 'https://c.com', content: 'C content' }],
      },
      error: null,
    });

    await brainstorm({ motion: 'Climate policy', side: 'pro', outputMode: 'mindmap' }, config);

    expect(addSourceMock).toHaveBeenCalledWith({
      title: 'Source C',
      content: 'C content',
      type: 'url',
      origin: 'https://c.com',
    });
  });

  it('sends ask options defaults as false', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        output: {
          response: 'Use clear weighing criteria.',
          followUpQuestions: [],
          uncertainties: [],
        },
      },
      error: null,
    });

    await askChat('How do I weigh impacts?', [], 'general', config);

    expect(invokeMock).toHaveBeenCalledWith('ai', expect.objectContaining({
      body: expect.objectContaining({
        feature: 'ask',
        input: expect.objectContaining({
          citationMode: false,
          webSearch: false,
        }),
      }),
    }));
  });

  it('maps invoke errors with 401 status to AIAuthError', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          status: 401,
          clone: () => ({
            json: async () => ({ error: 'Unauthorized' }),
          }),
        },
      },
    });

    await expect(generateCase(validGenerateInput, config)).rejects.toBeInstanceOf(AIAuthError);
  });

  it('maps invoke errors with 403 + upgrade_required payload to AIModelRestrictionError', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          status: 403,
          clone: () => ({
            json: async () => ({ error: 'Upgrade required', code: 'upgrade_required' }),
          }),
        },
      },
    });

    await expect(generateCase(validGenerateInput, config)).rejects.toBeInstanceOf(AIModelRestrictionError);
  });

  it('maps invoke errors with message-pattern 429 to AIRateLimitError', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code 429 rate limit',
        context: {
          clone: () => ({
            json: async () => {
              throw new Error('not json');
            },
          }),
        },
      },
    });

    await expect(generateCase(validGenerateInput, config)).rejects.toBeInstanceOf(AIRateLimitError);
  });

  it('maps invoke errors with 402 payload to AISubscriptionError', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          status: 402,
          json: async () => ({ error: 'Plan required', code: 'limit_reached', limit: 5, current: 6 }),
        },
      },
    });

    await expect(generateCase(validGenerateInput, config)).rejects.toMatchObject({
      name: 'AISubscriptionError',
      code: 'limit_reached',
      limit: 5,
      current: 6,
    });
  });

  it('maps invoke errors with 403 forbidden to AIAuthError when not upgrade-related', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Forbidden',
        context: {
          status: 403,
          json: async () => ({ error: 'Forbidden' }),
        },
      },
    });

    await expect(generateCase(validGenerateInput, config)).rejects.toBeInstanceOf(AIAuthError);
  });

  it('maps invoke errors with status-code message hints when status is absent', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code 500 Internal',
        context: {
          json: async () => ({ error: 'Internal failure' }),
        },
      },
    });

    await expect(generateCase(validGenerateInput, config)).rejects.toBeInstanceOf(AIError);
  });

  it('maps 402 message hints without status to AISubscriptionError', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code 402',
        context: {
          json: async () => ({ detail: 'Subscription required' }),
        },
      },
    });

    await expect(generateCase(validGenerateInput, config)).rejects.toBeInstanceOf(AISubscriptionError);
  });

  it('maps 403 message hints without status to AIAuthError for non-upgrade text', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code 403 Forbidden',
        context: {
          json: async () => ({ detail: 'Forbidden' }),
        },
      },
    });

    await expect(generateCase(validGenerateInput, config)).rejects.toBeInstanceOf(AIAuthError);
  });

  it('handles invoke errors where cloned payload has no json parser', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code 500 Internal',
        context: {
          clone: () => ({}),
        },
      },
    });

    await expect(generateCase(validGenerateInput, config)).rejects.toBeInstanceOf(AIError);
  });

  it('handles invoke errors where payload json is non-object', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code 500 Internal',
        context: {
          json: async () => 'not an object',
        },
      },
    });

    await expect(generateCase(validGenerateInput, config)).rejects.toBeInstanceOf(AIError);
  });

  it('maps unknown invoke errors to generic AIError with helpful prefix', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          status: 500,
          clone: () => ({
            json: async () => ({ error: 'Internal server error' }),
          }),
        },
      },
    });

    await expect(generateCase(validGenerateInput, config)).rejects.toThrow('AI service error: Internal server error');
  });

  it('wraps unknown thrown errors in AIError', async () => {
    invokeMock.mockRejectedValueOnce(new Error('network down'));

    await expect(generateCase(validGenerateInput, config)).rejects.toMatchObject({
      name: 'AIError',
      message: 'network down',
    });
  });

  it('wraps non-Error thrown values in AIError with unknown message', async () => {
    invokeMock.mockRejectedValueOnce('fatal');

    await expect(generateCase(validGenerateInput, config)).rejects.toMatchObject({
      name: 'AIError',
      message: 'Unknown error occurred',
    });
  });

  it('throws TimeoutError when invoke never resolves', async () => {
    vi.useFakeTimers();
    invokeMock.mockImplementationOnce(() => new Promise(() => {}));

    const requestExpectation = expect(generateCase(validGenerateInput, config)).rejects.toBeInstanceOf(TimeoutError);
    await vi.advanceTimersByTimeAsync(200_000);

    await requestExpectation;
    vi.useRealTimers();
  });

  it('fails when there is no authenticated session token', async () => {
    getSessionMock.mockResolvedValueOnce({ data: { session: null } });

    await expect(generateCase(validGenerateInput, config)).rejects.toBeInstanceOf(AIAuthError);
  });

  it('type guards detect expected AI error classes', () => {
    expect(isAIAuthError(new AIAuthError('auth'))).toBe(true);
    expect(isAIRateLimitError(new AIRateLimitError('rate'))).toBe(true);
    expect(isAIProviderError(new AIProviderError('provider'))).toBe(true);
    expect(isAISubscriptionError(new AISubscriptionError('subscription'))).toBe(true);
    expect(isAIModelRestrictionError(new AIModelRestrictionError('upgrade'))).toBe(true);
    expect(isTimeoutError(new TimeoutError('timeout'))).toBe(true);

    const authByName = new Error('x');
    authByName.name = 'AIAuthError';
    const rateByName = new Error('x');
    rateByName.name = 'AIRateLimitError';
    const providerByName = new Error('x');
    providerByName.name = 'AIProviderError';
    const subByName = new Error('x');
    subByName.name = 'AISubscriptionError';
    const modelByName = new Error('x');
    modelByName.name = 'AIModelRestrictionError';
    const timeoutByName = new Error('x');
    timeoutByName.name = 'TimeoutError';

    expect(isAIAuthError(authByName)).toBe(true);
    expect(isAIRateLimitError(rateByName)).toBe(true);
    expect(isAIProviderError(providerByName)).toBe(true);
    expect(isAISubscriptionError(subByName)).toBe(true);
    expect(isAIModelRestrictionError(modelByName)).toBe(true);
    expect(isTimeoutError(timeoutByName)).toBe(true);

    expect(isAIAuthError(new Error('plain'))).toBe(false);
    expect(isAIRateLimitError({ name: 'AIRateLimitError' })).toBe(false);
    expect(isTimeoutError({ name: 'TimeoutError' })).toBe(false);
  });

  it('passes only active sources and mapped provider in invoke payload', async () => {
    invokeMock.mockResolvedValueOnce({ data: { output: validGenerateOutput }, error: null });

    await generateCase(validGenerateInput, { ...config, provider: 'lovable' });

    expect(invokeMock).toHaveBeenCalledWith('ai', expect.objectContaining({
      body: expect.objectContaining({
        provider: 'openai',
        customSystemPrompt: 'custom-system-prompt',
        sources: [
          {
            title: 'Active source',
            content: 'Useful evidence',
            origin: 'https://example.com',
            type: 'url',
          },
        ],
      }),
    }));
  });

  it('throws generic AIError for edge payload errors that are not classified', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        error: 'Unexpected downstream failure',
      },
      error: null,
    });

    await expect(generateCase(validGenerateInput, config)).rejects.toBeInstanceOf(AIError);
  });

  it('uses fallback generated sections when transform input omits contentions and rebuttals', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        output: {
          title: 'Fallback title only',
        },
      },
      error: null,
    });

    const result = await generateCase(validGenerateInput, config);

    expect(result.contentions[0].claim).toBe('Main argument');
    expect(result.counters[0].targetArgument).toBe('Opponent argument');
    expect(result.metadata.side).toBe('pro');
  });

  it('normalizes partially empty generate contentions and rebuttals', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        output: {
          thesis: 'Partial thesis',
          contentions: [{ points: ['p1', 'p2'], evidence: [], analysis: undefined }],
          rebuttals: [{}],
          potentialWeaknesses: [],
        },
      },
      error: null,
    });

    const result = await generateCase(validGenerateInput, config);

    expect(result.contentions[0].claim).toBe('Argument');
    expect(result.contentions[0].reasoning).toContain('p1 p2');
    expect(result.contentions[0].evidence).toBe('');
    expect(result.contentions[0].impact).toBe('');
    expect(result.counters[0].targetArgument).toBe('');
    expect(result.counters[0].counterpoint).toBe('');
    expect(result.counters[0].rebuttal).toBe('');
  });

  it('normalizes brainstorm ideas with invalid side/strength and missing arrays', async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        output: {
          topFive: [{ idea: { id: 12, title: null, side: 'invalid', strength: 'invalid' } }],
          mindmap: [{ items: [{ title: 'Map node', side: 'invalid', strength: 'invalid' }] }],
          buckets: [{ ideas: [{ title: 'Bucket idea', side: 'invalid', strength: 'invalid' }] }],
        },
      },
      error: null,
    });

    const result = await brainstorm({ motion: 'M', side: 'both', outputMode: 'mindmap' }, config);

    expect(result.topFive?.[0].idea.side).toBe('neutral');
    expect(result.topFive?.[0].idea.strength).toBe('moderate');
    expect(result.mindmap?.[0].category).toBe('Uncategorized');
    expect(result.buckets?.[0].name).toBe('Unnamed Bucket');
  });

  it('returns local mock-provider outputs for all public feature helpers', async () => {
    const mockConfig = { ...config, provider: 'mock' as const };

    const attack = await attackCase({ caseText: 'Case text' } as any, mockConfig);
    const ideas = await brainstorm({ motion: 'Motion', side: 'both', outputMode: 'topfive' } as any, mockConfig);
    const facts = await factoids({ claim: 'Claim' } as any, mockConfig);
    const chat = await askChat('hello', [], 'general', mockConfig);

    expect(attack.overallAssessment.score).toBeTypeOf('number');
    expect(ideas.nextSteps).toBeInstanceOf(Array);
    expect(facts.factoids).toBeInstanceOf(Array);
    expect(chat.response).toContain('hello');
    expect(invokeMock).not.toHaveBeenCalled();
  }, 15000);
});
