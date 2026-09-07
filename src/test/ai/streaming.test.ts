import { beforeEach, describe, expect, it, afterEach, vi } from 'vitest';
import { supabaseMock, resetMockState, setMockSessionToken } from '../mocks/supabase';

const { captureExceptionMock, captureProductEventMock } = vi.hoisted(() => ({
  captureExceptionMock: vi.fn(),
  captureProductEventMock: vi.fn(),
}));

vi.mock('@/lib/observability', () => ({
  captureException: captureExceptionMock,
  captureProductEvent: captureProductEventMock,
}));

vi.mock('@/lib/supabase/client', () => ({
  supabase: supabaseMock,
  SUPABASE_URL: 'http://test-supabase.local',
}));

import { consumeSSEChunk, isAskStreamingSupported, streamAskChat } from '@/lib/ai/streaming';

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[index]));
      index += 1;
    },
  });
}

function mockFetchOnce(body: BodyInit | null, init: ResponseInit = { status: 200 }) {
  const fetchMock = vi.fn(async () => new Response(body, init));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const streamConfig = { provider: 'openrouter', model: 'gpt-5.4-mini', temperature: 0.7 } as const;
const streamOptions = {};

beforeEach(() => {
  resetMockState();
  setMockSessionToken('test-token');
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AI streaming helpers', () => {
  it('parses complete SSE events', () => {
    const result = consumeSSEChunk('', 'event: delta\ndata: {"text":"Hello"}\n\n');

    expect(result.buffer).toBe('');
    expect(result.events).toEqual([{ event: 'delta', data: { text: 'Hello' } }]);
  });

  it('keeps partial SSE events buffered until complete', () => {
    const first = consumeSSEChunk('', 'event: delta\ndata: {"text":"Hel');
    expect(first.events).toEqual([]);
    expect(first.buffer).toContain('Hel');

    const second = consumeSSEChunk(first.buffer, 'lo"}\n\n');
    expect(second.events).toEqual([{ event: 'delta', data: { text: 'Hello' } }]);
    expect(second.buffer).toBe('');
  });

  it('falls back to raw data string when SSE payload is not valid JSON', () => {
    const result = consumeSSEChunk('', 'event: status\ndata: not-json-payload\n\n');
    expect(result.events).toEqual([{ event: 'status', data: 'not-json-payload' }]);
  });

  it('parses multiple events in a single chunk', () => {
    const chunk = 'event: delta\ndata: {"text":"A"}\n\nevent: delta\ndata: {"text":"B"}\n\n';
    const result = consumeSSEChunk('', chunk);
    expect(result.events).toEqual([
      { event: 'delta', data: { text: 'A' } },
      { event: 'delta', data: { text: 'B' } },
    ]);
  });

  it('enables streaming for basic OpenRouter ask chats', () => {
    expect(isAskStreamingSupported({ provider: 'openrouter', model: 'openai/gpt-5.6-luna', temperature: 0.7 })).toBe(true);
    expect(isAskStreamingSupported({ provider: 'openai', model: 'gpt-5.4-mini', temperature: 0.7 })).toBe(false);
    expect(isAskStreamingSupported({ provider: 'google', model: 'gemini-3-flash-preview', temperature: 0.7 })).toBe(false);
    expect(isAskStreamingSupported({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.7 })).toBe(false);
    expect(isAskStreamingSupported({ provider: 'unknown' as string, model: 'x', temperature: 0.7 })).toBe(false);
    expect(isAskStreamingSupported(
      { provider: 'openrouter', model: 'openai/gpt-5.6-luna', temperature: 0.7 },
      { citationMode: true }
    )).toBe(false);
    expect(isAskStreamingSupported(
      { provider: 'openrouter', model: 'openai/gpt-5.6-luna', temperature: 0.7 },
      { webSearch: true }
    )).toBe(false);
    expect(isAskStreamingSupported(
      { provider: 'openrouter', model: 'openai/gpt-5.6-luna', temperature: 0.7 },
      { prosConsMode: true }
    )).toBe(false);
    expect(isAskStreamingSupported(
      { provider: 'openrouter', model: 'openai/gpt-5.6-luna', temperature: 0.7 },
      { argumentMapMode: true }
    )).toBe(false);
    expect(isAskStreamingSupported(
      { provider: 'openrouter', model: 'openai/gpt-5.6-luna', temperature: 0.7 },
      { mode: 'clarify' }
    )).toBe(false);
    expect(isAskStreamingSupported(
      { provider: 'openrouter', model: 'openai/gpt-5.6-luna', temperature: 0.7 },
      { mode: 'general' }
    )).toBe(true);
    for (const mode of ['clarify', 'summarize', 'proscons', 'argumentmap']) {
      expect(isAskStreamingSupported(
        { provider: 'openrouter', model: 'openai/gpt-5.6-luna', temperature: 0.7 },
        { mode }
      )).toBe(false);
    }
  });

  describe('telemetry', () => {
    it('emits comparable success events without including Ask input', async () => {
      mockFetchOnce(streamFromChunks([
        'event: delta\ndata: {"text":"answer"}\n\n',
        'event: final\ndata: {"output":{"response":"answer","followUpQuestions":[],"uncertainties":[]}}\n\n',
      ]));

      await streamAskChat(
        'private question',
        [{ role: 'user', content: 'private history' }],
        'general',
        streamConfig,
        streamOptions,
        { onDelta: () => undefined },
      );

      expect(captureProductEventMock).toHaveBeenNthCalledWith(1, 'ai_request_started', {
        feature: 'ask',
        streaming: true,
        provider: 'openrouter',
        model: 'gpt-5.4-mini',
      });
      expect(captureProductEventMock).toHaveBeenNthCalledWith(2, 'ai_request_succeeded', expect.objectContaining({
        feature: 'ask',
        streaming: true,
        provider: 'openrouter',
        model: 'gpt-5.4-mini',
        durationMs: expect.any(Number),
      }));
      expect(captureExceptionMock).not.toHaveBeenCalled();
      expect(JSON.stringify(captureProductEventMock.mock.calls)).not.toContain('private question');
      expect(JSON.stringify(captureProductEventMock.mock.calls)).not.toContain('private history');
    });

    it('records unexpected provider failures and sends them to Sentry', async () => {
      mockFetchOnce(streamFromChunks([
        'event: error\ndata: {"message":"OpenAI exploded for private question"}\n\n',
      ]));

      await expect(streamAskChat(
        'private question',
        [],
        'general',
        streamConfig,
        streamOptions,
        { onDelta: () => undefined },
      )).rejects.toMatchObject({ name: 'AIProviderError' });

      expect(captureProductEventMock).toHaveBeenNthCalledWith(2, 'ai_request_failed', expect.objectContaining({
        feature: 'ask',
        streaming: true,
        provider: 'openrouter',
        model: 'gpt-5.4-mini',
        durationMs: expect.any(Number),
        errorName: 'AIProviderError',
        statusCode: 500,
      }));
      expect(captureExceptionMock).toHaveBeenCalledTimes(1);
      expect(captureExceptionMock).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'AIProviderError' }),
        expect.objectContaining({ errorName: 'AIProviderError', statusCode: 500 }),
      );
      const [capturedError, capturedContext] = captureExceptionMock.mock.calls[0];
      expect(capturedError).toMatchObject({ message: 'AIProviderError' });
      expect(JSON.stringify(capturedContext)).not.toContain('private question');
    });

    it.each([
      ['auth', 401, { error: 'Unauthorized' }, 'AIAuthError'],
      ['rate limit', 429, { error: 'Rate limit exceeded' }, 'AIRateLimitError'],
      ['subscription', 402, { error: 'Trial expired', code: 'trial_expired' }, 'AISubscriptionError'],
      ['model restriction', 403, { error: 'Upgrade required', code: 'upgrade_required' }, 'AIModelRestrictionError'],
    ] as const)('does not send expected %s failures to Sentry', async (_label, status, payload, errorName) => {
      mockFetchOnce(JSON.stringify(payload), { status });

      await expect(streamAskChat(
        'private question',
        [],
        'general',
        streamConfig,
        streamOptions,
        { onDelta: () => undefined },
      )).rejects.toMatchObject({ name: errorName });

      expect(captureProductEventMock).toHaveBeenNthCalledWith(2, 'ai_request_failed', expect.objectContaining({
        feature: 'ask',
        streaming: true,
        provider: 'openrouter',
        model: 'gpt-5.4-mini',
        errorName,
        statusCode: status,
      }));
      expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it('records an unauthenticated attempt as an expected auth failure', async () => {
      setMockSessionToken(null);

      await expect(streamAskChat(
        'private question',
        [],
        'general',
        streamConfig,
        streamOptions,
        { onDelta: () => undefined },
      )).rejects.toMatchObject({ name: 'AIAuthError' });

      expect(captureProductEventMock).toHaveBeenNthCalledWith(2, 'ai_request_failed', expect.objectContaining({
        feature: 'ask',
        streaming: true,
        provider: 'openrouter',
        model: 'gpt-5.4-mini',
        errorName: 'AIAuthError',
      }));
      expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it('records caller aborts without sending them to Sentry', async () => {
      supabaseMock.auth.getSession.mockImplementationOnce(() => new Promise(() => undefined));
      const controller = new AbortController();
      const request = streamAskChat(
        'private question',
        [],
        'general',
        streamConfig,
        streamOptions,
        { onDelta: () => undefined, signal: controller.signal },
      );
      controller.abort();

      await expect(request).rejects.toMatchObject({ name: 'AbortError' });
      expect(captureProductEventMock).toHaveBeenNthCalledWith(2, 'ai_request_failed', expect.objectContaining({
        feature: 'ask',
        streaming: true,
        provider: 'openrouter',
        model: 'gpt-5.4-mini',
        errorName: 'AbortError',
      }));
      expect(captureExceptionMock).not.toHaveBeenCalled();
    });

    it('does not report success when cancellation settles a pending stream read', async () => {
      const controller = new AbortController();
      const encoder = new TextEncoder();
      const body = new ReadableStream<Uint8Array>({
        start(streamController) {
          streamController.enqueue(encoder.encode(
            'event: final\ndata: {"output":{"response":"answer","followUpQuestions":[],"uncertainties":[]}}\n\n',
          ));
          setTimeout(() => controller.abort(), 0);
        },
      });
      mockFetchOnce(body);

      await expect(streamAskChat(
        'private question',
        [],
        'general',
        streamConfig,
        streamOptions,
        { onDelta: () => undefined, signal: controller.signal },
      )).rejects.toMatchObject({ name: 'AbortError' });

      expect(captureProductEventMock).toHaveBeenLastCalledWith(
        'ai_request_failed',
        expect.objectContaining({ errorName: 'AbortError', streaming: true }),
      );
      expect(captureProductEventMock).not.toHaveBeenCalledWith(
        'ai_request_succeeded',
        expect.anything(),
      );
      expect(captureExceptionMock).not.toHaveBeenCalled();
    });
  });
});
