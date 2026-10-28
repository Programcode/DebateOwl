import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock, captureProductEventMock, captureMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  captureProductEventMock: vi.fn(),
  captureMock: vi.fn(),
}));

vi.mock('@/lib/observability', () => ({
  captureException: vi.fn(),
  captureProductEvent: captureProductEventMock,
}));

vi.mock('@/lib/supabase/client', () => ({
  getActiveAccessToken: () => 'token',
  getActiveUserId: (): null => null,
  invokeAuthenticatedFunction: invokeMock,
  invokeAuthenticatedFunctionWith: invokeMock,
  supabase: { auth: { getSession: vi.fn() } },
}));

import {
  AIAuthError,
  AIError,
  AIModelRestrictionError,
  AINetworkError,
  AIProviderError,
  AIRateLimitError,
  AIResponseError,
  AIServerError,
  AISubscriptionError,
  AIUnknownError,
  TimeoutError,
} from '@/lib/ai/errors';
import { aiFailureCode, aiFailureHttpStatus, aiFailureRecovery, aiFailureStage } from '@/lib/ai/failure-reason';
import { callSupabaseAI } from '@/lib/ai/request';

const config = { provider: 'openrouter' as const, model: 'openai/gpt-6-luna', reasoningEffort: 'low' as const };

describe('AI failure reasons', () => {
  it.each([
    [new AISubscriptionError('limit', { code: 'limit_reached' }), 'limit_reached', 'plan'],
    [new AIRateLimitError(), 'limit_reached', 'retry'],
    [new AIModelRestrictionError(), 'model_restricted', 'upgrade'],
    [new AIAuthError('expired', { statusCode: 401 }), 'auth_expired', 'sign_in'],
    [new TimeoutError(), 'timeout', 'retry'],
    [new AINetworkError('offline'), 'network', 'retry'],
    [new TypeError('Failed to fetch'), 'network', 'retry'],
    [new DOMException('The request was canceled.', 'AbortError'), 'aborted', 'none'],
    [new AIProviderError('down', { details: { code: 'provider_unavailable' } }), 'provider_error', 'retry'],
    [new AIResponseError('bad shape'), 'invalid_response', 'retry'],
    [new AIServerError('boom', { statusCode: 503 }), 'server_error', 'retry'],
    [new AIError('gone', { statusCode: 502 }), 'server_error', 'retry'],
    [new AIError('too large', { statusCode: 413 }), 'unknown', 'none'],
    [new AIUnknownError('?'), 'unknown', 'retry'],
    [new RangeError('student text'), 'unknown', 'retry'],
  ] as const)('%s maps to %s with %s', (error, code, recovery) => {
    expect(aiFailureCode(error)).toBe(code);
    expect(aiFailureRecovery(error)).toBe(recovery);
  });

  it('sends no status for the browser\'s own timeout', () => {
    expect(aiFailureHttpStatus(new TimeoutError())).toBeUndefined();
    expect(aiFailureHttpStatus(new AIServerError('boom', { statusCode: 503 }))).toBe(503);
  });

  it('reports a caller abort as aborted whatever the error says', () => {
    expect(aiFailureCode(new TimeoutError(), true)).toBe('aborted');
  });

  it('files a rejected answer under parse, whatever stage the caller was at', () => {
    expect(aiFailureStage(new AIResponseError('bad'), 'stream')).toBe('parse');
    expect(aiFailureStage(new AINetworkError('offline'), 'stream')).toBe('stream');
    expect(aiFailureStage(new TimeoutError())).toBe('request');
  });
});

describe('ai_request_failed reason properties', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    captureProductEventMock.mockReset();
  });

  function failedEvent(): Record<string, unknown> {
    const call = captureProductEventMock.mock.calls.find(([name]) => name === 'ai_request_failed');
    expect(call).toBeDefined();
    return call![1] as Record<string, unknown>;
  }

  it('sends the tool, code, status, stage and duration of a refused request', async () => {
    invokeMock.mockResolvedValue({ data: { error: 'Daily limit reached', code: 'limit_reached', limit: 5, current: 5 }, error: null });

    await expect(callSupabaseAI('generate', { motion: 'Made up motion' }, config, { debateId: null })).rejects.toBeInstanceOf(AISubscriptionError);

    expect(failedEvent()).toMatchObject({
      tool: 'generate',
      error_code: 'limit_reached',
      http_status: 402,
      stage: 'request',
      streaming: false,
      duration_ms: expect.any(Number),
      // The fields existing insights read stay.
      feature: 'generate',
      errorName: 'AISubscriptionError',
      statusCode: 402,
    });
  });

  it('marks a failure while checking the answer as the parse stage, even for a non-AI error', async () => {
    invokeMock.mockResolvedValue({ data: { output: { anything: true } }, error: null });

    await expect(callSupabaseAI('attack', {}, config, {
      debateId: null,
      transformResponse: () => { throw new RangeError('Made up motion text'); },
    })).rejects.toBeInstanceOf(AIUnknownError);

    const properties = failedEvent();
    expect(properties).toMatchObject({ tool: 'attack', error_code: 'unknown', stage: 'parse' });
    expect(JSON.stringify(properties)).not.toContain('Made up motion');
  });

  it('says whether the request was streamed', async () => {
    invokeMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(callSupabaseAI('brainstorm', {}, config, { debateId: null, live: { onDraft: () => undefined } })).rejects.toBeInstanceOf(AINetworkError);

    expect(failedEvent()).toMatchObject({ tool: 'brainstorm', error_code: 'network', streaming: true });
    expect(failedEvent().http_status).toBeUndefined();
  });
});

describe('product telemetry schema', () => {
  beforeEach(() => {
    vi.resetModules();
    captureMock.mockReset();
    vi.stubEnv('VITE_POSTHOG_KEY', 'phc_test');
    vi.stubEnv('VITE_SENTRY_DSN', '');
    vi.doMock('posthog-js', () => ({ default: { init: vi.fn(), capture: captureMock } }));
    vi.doUnmock('@/lib/observability');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('posthog-js');
  });

  async function sent(name: string, properties: Record<string, unknown>): Promise<unknown[][]> {
    const observability = await vi.importActual<typeof import('@/lib/observability')>('@/lib/observability');
    observability.resetObservabilityForTests();
    observability.captureProductEvent(name, properties);
    await vi.waitFor(() => expect(captureMock).toHaveBeenCalled());
    return captureMock.mock.calls;
  }

  it('lets the failure reason fields through and drops anything outside the schema', async () => {
    const calls = await sent('ai_request_failed', {
      tool: 'ask',
      error_code: 'provider_error',
      http_status: 503,
      stage: 'stream',
      streaming: true,
      duration_ms: 1200,
      motion: 'Made up motion',
      email: 'student@example.com',
    });
    expect(calls[0]).toEqual(['ai_request_failed', {
      tool: 'ask',
      error_code: 'provider_error',
      http_status: 503,
      stage: 'stream',
      streaming: true,
      duration_ms: 1200,
    }]);
  });

  it('drops a reason value outside the closed set', async () => {
    const calls = await sent('ai_request_failed', { error_code: 'Made up motion', stage: 'upload', http_status: 42 });
    expect(calls[0]).toEqual(['ai_request_failed', {}]);
  });

  it('sends the activation events with their bounded properties', async () => {
    const calls = await sent('paywall_shown', { reason: 'weekly_budget_reached', tool: 'sparring' });
    expect(calls[0]).toEqual(['paywall_shown', { reason: 'weekly_budget_reached', tool: 'sparring' }]);
  });
});
