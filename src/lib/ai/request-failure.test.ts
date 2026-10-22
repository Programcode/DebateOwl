import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock, captureExceptionMock, captureProductEventMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  captureExceptionMock: vi.fn(),
  captureProductEventMock: vi.fn(),
}));

vi.mock('@/lib/observability', () => ({
  captureException: captureExceptionMock,
  captureProductEvent: captureProductEventMock,
}));

vi.mock('@/lib/supabase/client', () => ({
  getActiveAccessToken: () => 'token',
  invokeAuthenticatedFunction: invokeMock,
  invokeAuthenticatedFunctionWith: invokeMock,
  supabase: { auth: { getSession: vi.fn() } },
}));

import { AIAuthError, AIModelRestrictionError, AINetworkError, AISubscriptionError, AIUnknownError, TimeoutError } from '@/lib/ai/errors';
import { callSupabaseAI } from '@/lib/ai/request';

const config = { provider: 'openrouter' as const, model: 'openai/gpt-6-luna', reasoningEffort: 'low' as const };

function failedEvents() {
  return captureProductEventMock.mock.calls.filter((call) => call[0] === 'ai_request_failed');
}

describe('callSupabaseAI failure reporting', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    captureExceptionMock.mockReset();
    captureProductEventMock.mockReset();
  });

  it('does not capture a fetch TypeError and still records the network failure', async () => {
    invokeMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(callSupabaseAI('generate', { motion: 'Made up motion' }, config, { debateId: null })).rejects.toBeInstanceOf(AINetworkError);

    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(failedEvents()).toEqual([
      expect.arrayContaining(['ai_request_failed', expect.objectContaining({ feature: 'generate', errorName: 'AINetworkError' })]),
    ]);
    const properties = failedEvents()[0][1] as Record<string, unknown>;
    expect(properties.statusCode).toBeUndefined();
    expect(JSON.stringify(properties)).not.toContain('Failed to fetch');
  });

  it('captures an unknown error with the cause type and not the message', async () => {
    invokeMock.mockRejectedValue(new RangeError('student motion leaked'));

    await expect(callSupabaseAI('generate', {}, config, { debateId: null })).rejects.toBeInstanceOf(AIUnknownError);

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    const [captured, extra] = captureExceptionMock.mock.calls[0] as [Error, Record<string, unknown>];
    expect(captured.name).toBe('AIUnknownError');
    expect(extra.causeType).toBe('RangeError:RangeError');
    expect(JSON.stringify(extra)).not.toContain('student');
    expect(failedEvents()[0][1]).toMatchObject({ errorName: 'AIUnknownError', feature: 'generate' });
  });

  it('keeps 402, 403 and timeouts on their existing reporting', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { status: 402, json: async () => ({ error: 'limit', code: 'limit_reached', limit: 5, current: 5 }) },
      },
    });
    await expect(callSupabaseAI('generate', {}, config, { debateId: null })).rejects.toBeInstanceOf(AISubscriptionError);
    expect(captureExceptionMock).not.toHaveBeenCalled();
    expect(failedEvents().at(-1)?.[1]).toMatchObject({ errorName: 'AISubscriptionError', statusCode: 402 });

    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { status: 403, json: async () => ({ error: 'This model requires Pro', code: 'upgrade_required' }) },
      },
    });
    await expect(callSupabaseAI('generate', {}, config, { debateId: null })).rejects.toBeInstanceOf(AIModelRestrictionError);
    expect(captureExceptionMock).not.toHaveBeenCalled();

    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { status: 403, json: async () => ({ error: 'Access denied' }) },
      },
    });
    await expect(callSupabaseAI('generate', {}, config, { debateId: null })).rejects.toBeInstanceOf(AIAuthError);
    expect(captureExceptionMock).not.toHaveBeenCalled();

    invokeMock.mockRejectedValueOnce(new DOMException('The operation was aborted.', 'AbortError'));
    await expect(callSupabaseAI('generate', {}, config, { debateId: null })).rejects.toBeInstanceOf(TimeoutError);
    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    expect(captureExceptionMock.mock.calls[0][0].name).toBe('TimeoutError');
  });
});
