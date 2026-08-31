import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderConfig } from '@/lib/ai/providers/types';
import type { GenerateInput, GenerateOutput } from '@/lib/ai/schemas/generate';
import type { CrossfireAIInput } from '@/lib/crossfire/schemas';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  invoke: vi.fn(),
  captureProductEvent: vi.fn(),
  captureException: vi.fn(),
  settings: { customSystemPrompt: undefined as string | undefined, outputLanguage: 'en' },
  session: {
    sourceLibrary: [] as Array<{ title: string; content: string; origin: string; type: string; isActive: boolean }>,
  },
}));

vi.mock('@/lib/observability', () => ({
  captureProductEvent: mocks.captureProductEvent,
  captureException: mocks.captureException,
}));

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: { getSession: mocks.getSession },
    functions: { invoke: mocks.invoke },
  },
}));

vi.mock('@/lib/stores/settings-store', () => ({
  useSettingsStore: { getState: () => mocks.settings },
}));

vi.mock('@/lib/stores/session-store', () => ({
  useSessionStore: { getState: () => mocks.session },
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
  classifyAIError,
  crossfire,
  generateCase,
} from '@/lib/ai/client';

const config: ProviderConfig = {
  provider: 'openai',
  model: 'gpt-4o',
  temperature: 0.7,
};

const input: GenerateInput = {
  motion: 'USER MOTION SHOULD NEVER APPEAR IN TELEMETRY',
  side: 'pro',
  format: 'bp',
  role: 'intro',
  length: 'brief',
  audience: 'beginner',
  tone: 'formal',
};

const output: GenerateOutput = {
  caseStructure: {
    thesis: 'A thesis',
    framework: 'A framework',
    keyDefinitions: [],
    burdenOfProof: 'A burden',
  },
  contentions: [
    { id: '1', claim: 'Claim one', reasoning: 'Reasoning one', evidence: 'Evidence one', needsSource: false, impact: 'Impact one' },
    { id: '2', claim: 'Claim two', reasoning: 'Reasoning two', evidence: 'Evidence two', needsSource: false, impact: 'Impact two' },
  ],
  predictedOpponentCase: { likelyArguments: [], strategicWeaknesses: [], keyClashes: [] },
  counters: [],
  metadata: { side: 'pro', format: 'bp', generatedAt: '2026-01-01T00:00:00.000Z' },
};

function nextTurnInput(): CrossfireAIInput {
  return {
    operation: 'next-turn' as const,
    config: {
      resolution: 'A resolution',
      argument: 'An argument',
      mode: 'question-ai' as const,
      style: 'cooperative' as const,
      durationSeconds: 180 as const,
      useSourceLibrary: false,
      seedQuestions: [] as string[],
    },
    transcript: [{
      id: 'T1',
      sequence: 1,
      speaker: 'user' as const,
      kind: 'question' as const,
      text: 'A question',
      createdAt: 1,
    }],
    expectedReply: 'answer' as const,
  };
}

describe('non-streaming AI request analytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'token' } } });
    mocks.invoke.mockResolvedValue({ data: { output }, error: null });
  });

  it('emits started and succeeded events with only safe request metadata', async () => {
    await generateCase(input, config);

    expect(mocks.captureProductEvent).toHaveBeenNthCalledWith(1, 'ai_request_started', {
      feature: 'generate',
      provider: 'openai',
      model: 'gpt-4o',
    });
    expect(mocks.captureProductEvent).toHaveBeenNthCalledWith(2, 'ai_request_succeeded', {
      feature: 'generate',
      provider: 'openai',
      model: 'gpt-4o',
      durationMs: expect.any(Number),
    });

    for (const [, properties] of mocks.captureProductEvent.mock.calls) {
      expect(JSON.stringify(properties)).not.toContain(input.motion);
    }
  });

  it('emits a classified failure and captures provider exceptions without user content', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { error: 'OpenAI API unavailable' }, error: null });

    await expect(generateCase(input, config)).rejects.toMatchObject({ name: 'AIProviderError' });

    expect(mocks.captureProductEvent).toHaveBeenNthCalledWith(2, 'ai_request_failed', {
      feature: 'generate',
      provider: 'openai',
      model: 'gpt-4o',
      durationMs: expect.any(Number),
      errorName: 'AIProviderError',
      statusCode: undefined,
    });
    expect(mocks.captureException).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'AIProviderError', message: 'AIProviderError' }),
      expect.objectContaining({ feature: 'generate', provider: 'openai', model: 'gpt-4o' }),
    );
    const [capturedError, capturedContext] = mocks.captureException.mock.calls[0];
    expect(capturedError).toMatchObject({ message: 'AIProviderError' });
    expect(JSON.stringify(capturedContext)).not.toContain(input.motion);
  });

  it('skips Sentry for expected auth failures', async () => {
    mocks.getSession.mockResolvedValueOnce({ data: { session: null } });

    await expect(generateCase(input, config)).rejects.toBeInstanceOf(AIAuthError);
    expect(mocks.captureProductEvent).toHaveBeenNthCalledWith(2, 'ai_request_failed', expect.objectContaining({
      errorName: 'AIAuthError',
    }));
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it('reports malformed responses as AIResponseError failures', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { requestId: 'request-id-only' }, error: null });

    await expect(generateCase(input, config)).rejects.toBeInstanceOf(AIResponseError);
    expect(mocks.captureProductEvent).toHaveBeenNthCalledWith(2, 'ai_request_failed', expect.objectContaining({
      errorName: 'AIResponseError',
    }));
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });

  it('does not count a non-empty malformed output as a successful request', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: { output: {} }, error: null });

    await expect(generateCase(input, config)).rejects.toBeInstanceOf(AIResponseError);
    expect(mocks.captureProductEvent).toHaveBeenNthCalledWith(1, 'ai_request_started', expect.objectContaining({
      feature: 'generate',
    }));
    expect(mocks.captureProductEvent).toHaveBeenNthCalledWith(2, 'ai_request_failed', expect.objectContaining({
      feature: 'generate',
      errorName: 'AIResponseError',
    }));
    expect(mocks.captureProductEvent).not.toHaveBeenCalledWith(
      'ai_request_succeeded',
      expect.anything(),
    );
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });

  it('reports unknown failures after the client wraps them', async () => {
    mocks.invoke.mockRejectedValueOnce(new Error(input.motion));

    await expect(generateCase(input, config)).rejects.toMatchObject({ name: 'AIError' });
    expect(mocks.captureProductEvent).toHaveBeenNthCalledWith(2, 'ai_request_failed', expect.objectContaining({
      errorName: 'AIError',
    }));
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
    const [capturedError, capturedContext] = mocks.captureException.mock.calls[0];
    expect(capturedError).toMatchObject({ message: 'AIError' });
    expect(JSON.stringify(capturedContext)).not.toContain(input.motion);
  });

  it('does not send caller aborts to Sentry', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(crossfire(nextTurnInput(), config, { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.captureProductEvent).toHaveBeenNthCalledWith(2, 'ai_request_failed', expect.objectContaining({
      errorName: 'AbortError',
    }));
    expect(mocks.captureException).not.toHaveBeenCalled();
  });
});

describe('classifyAIError', () => {
  it.each([
    [new AIAuthError('auth', { statusCode: 401 }), 'AIAuthError', false, 401],
    [new AIRateLimitError('rate'), 'AIRateLimitError', false, 429],
    [new AISubscriptionError('subscription'), 'AISubscriptionError', false, 402],
    [new AIModelRestrictionError('upgrade'), 'AIModelRestrictionError', false, 403],
    [new TimeoutError('timeout'), 'TimeoutError', true, 408],
    [new AIProviderError('provider', { statusCode: 503 }), 'AIProviderError', true, 503],
    [new AIResponseError('response'), 'AIResponseError', true, undefined],
    [new AIError('unknown', { statusCode: 500 }), 'AIError', true, 500],
  ])('classifies %s', (error, errorName, shouldCaptureException, statusCode) => {
    expect(classifyAIError(error)).toEqual({ errorName, statusCode, shouldCaptureException });
  });

  it('suppresses Sentry for an explicitly user-initiated abort', () => {
    expect(classifyAIError(new Error('canceled'), true)).toEqual({
      errorName: 'AbortError',
      shouldCaptureException: false,
    });
  });
});
