import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { supabaseMock, resetMockState, setMockSessionToken } from '../mocks/supabase';

vi.mock('@/lib/supabase/client', () => ({
  supabase: supabaseMock,
  SUPABASE_URL: 'http://test-supabase.local',
}));

import { streamAskChat } from '@/lib/ai/streaming';
import type { ProviderConfig } from '@/lib/ai/providers/types';

// Helper: build a ReadableStream that emits the given chunks one at a time.
function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[i]));
      i += 1;
    },
  });
}

function mockFetchOnce(body: BodyInit | null, init: ResponseInit = { status: 200 }) {
  const fetchMock = vi.fn(async () => new Response(body, init));
  // @ts-expect-error overriding global for the test
  globalThis.fetch = fetchMock;
  return fetchMock;
}

const config: ProviderConfig = { provider: 'openai', model: 'gpt-5.4-mini', temperature: 0.7 };
const options = {};

describe('streamAskChat (integration with mocked fetch)', () => {
  beforeEach(() => {
    resetMockState();
    setMockSessionToken('test-token');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('streams deltas to onDelta and resolves with the final output', async () => {
    const chunks = [
      'event: delta\ndata: {"text":"Hello"}\n\n',
      'event: delta\ndata: {"text":" world"}\n\n',
      'event: final\ndata: {"output":{"response":"Hello world","followUpQuestions":[],"uncertainties":[]}}\n\n',
    ];
    mockFetchOnce(streamFromChunks(chunks));

    const deltas: string[] = [];
    const result = await streamAskChat(
      'hi',
      [],
      'general',
      config,
      options,
      { onDelta: (text) => deltas.push(text) }
    );

    expect(deltas).toEqual(['Hello', ' world']);
    expect(result.response).toBe('Hello world');
  });

  it('skips malformed JSON chunks and still delivers the final output', async () => {
    const chunks = [
      'event: delta\ndata: {"text":"Hi"}\n\n',
      // Malformed: missing closing brace.
      'event: delta\ndata: {"text":"corrupted\n\n',
      'event: delta\ndata: {"text":"!"}\n\n',
      'event: final\ndata: {"output":{"response":"Hi!","followUpQuestions":[],"uncertainties":[]}}\n\n',
    ];
    mockFetchOnce(streamFromChunks(chunks));

    const deltas: string[] = [];
    const result = await streamAskChat(
      'hi',
      [],
      'general',
      config,
      options,
      { onDelta: (text) => deltas.push(text) }
    );

    // Malformed chunk was parsed as a string (fallback) so it doesn't satisfy
    // the "data is an object with text" guard and is skipped silently.
    expect(deltas).toEqual(['Hi', '!']);
    expect(result.response).toBe('Hi!');
  });

  it('throws on server-emitted error events', async () => {
    const chunks = [
      'event: delta\ndata: {"text":"partial"}\n\n',
      'event: error\ndata: {"message":"OpenAI exploded"}\n\n',
    ];
    mockFetchOnce(streamFromChunks(chunks));

    const deltas: string[] = [];
    await expect(streamAskChat(
      'hi',
      [],
      'general',
      config,
      options,
      { onDelta: (text) => deltas.push(text) }
    )).rejects.toThrow(/OpenAI exploded/);

    // Partial deltas should still have been delivered before the error event.
    expect(deltas).toEqual(['partial']);
  });

  it('rejects when the response status is not ok', async () => {
    mockFetchOnce('Internal error', { status: 500 });

    await expect(streamAskChat(
      'hi',
      [],
      'general',
      config,
      options,
      { onDelta: () => undefined }
    )).rejects.toThrow(/Streaming request failed/);
  });

  it('rejects when stream ends without a final event', async () => {
    const chunks = [
      'event: delta\ndata: {"text":"partial only"}\n\n',
      // No final event.
    ];
    mockFetchOnce(streamFromChunks(chunks));

    await expect(streamAskChat(
      'hi',
      [],
      'general',
      config,
      options,
      { onDelta: () => undefined }
    )).rejects.toThrow(/ended before a final response/);
  });

  it('aborts the stream when the signal fires', async () => {
    // Build a stream that emits one delta, then never emits anything else
    // until the test aborts the reader.
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('event: delta\ndata: {"text":"opening"}\n\n'));
        // Intentionally never close — abort must cause the read to reject.
      },
    });
    mockFetchOnce(stream);

    const controller = new AbortController();
    const deltas: string[] = [];

    const promise = streamAskChat(
      'hi',
      [],
      'general',
      config,
      options,
      {
        onDelta: (text) => {
          deltas.push(text);
          // Fire the abort right after the first delta lands.
          if (deltas.length === 1) controller.abort();
        },
        signal: controller.signal,
      }
    );

    await expect(promise).rejects.toThrow();
    expect(deltas).toEqual(['opening']);
  });

  it('throws when there is no session token', async () => {
    setMockSessionToken(null);
    mockFetchOnce(streamFromChunks([]));

    await expect(streamAskChat(
      'hi',
      [],
      'general',
      config,
      options,
      { onDelta: () => undefined }
    )).rejects.toThrow(/sign in/i);
  });

  it('handles deltas and final arriving in a single chunk', async () => {
    const chunks = [
      'event: delta\ndata: {"text":"A"}\n\nevent: delta\ndata: {"text":"B"}\n\nevent: final\ndata: {"output":{"response":"AB","followUpQuestions":[],"uncertainties":[]}}\n\n',
    ];
    mockFetchOnce(streamFromChunks(chunks));

    const deltas: string[] = [];
    const result = await streamAskChat(
      'hi',
      [],
      'general',
      config,
      options,
      { onDelta: (text) => deltas.push(text) }
    );

    expect(deltas).toEqual(['A', 'B']);
    expect(result.response).toBe('AB');
  });

  it('handles a delta split across two read() chunks', async () => {
    const chunks = [
      'event: delta\ndata: {"text":"Hel',
      'lo"}\n\nevent: final\ndata: {"output":{"response":"Hello","followUpQuestions":[],"uncertainties":[]}}\n\n',
    ];
    mockFetchOnce(streamFromChunks(chunks));

    const deltas: string[] = [];
    const result = await streamAskChat(
      'hi',
      [],
      'general',
      config,
      options,
      { onDelta: (text) => deltas.push(text) }
    );

    expect(deltas).toEqual(['Hello']);
    expect(result.response).toBe('Hello');
  });
});
