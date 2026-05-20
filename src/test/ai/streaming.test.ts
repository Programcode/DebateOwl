import { describe, expect, it } from 'vitest';
import { consumeSSEChunk, isAskStreamingSupported } from '@/lib/ai/streaming';

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

  it('enables streaming for OpenAI, Google, and Anthropic basic ask chats', () => {
    expect(isAskStreamingSupported({ provider: 'openai', model: 'gpt-5.4-mini', temperature: 0.7 })).toBe(true);
    expect(isAskStreamingSupported({ provider: 'lovable', model: 'gpt-5.4-mini', temperature: 0.7 })).toBe(true);
    expect(isAskStreamingSupported({ provider: 'google', model: 'gemini-3-flash-preview', temperature: 0.7 })).toBe(true);
    expect(isAskStreamingSupported({ provider: 'anthropic', model: 'claude-haiku-4-5-20251001', temperature: 0.7 })).toBe(true);
    expect(isAskStreamingSupported({ provider: 'unknown' as string, model: 'x', temperature: 0.7 })).toBe(false);
    expect(isAskStreamingSupported(
      { provider: 'openai', model: 'gpt-5.4-mini', temperature: 0.7 },
      { citationMode: true }
    )).toBe(false);
    expect(isAskStreamingSupported(
      { provider: 'openai', model: 'gpt-5.4-mini', temperature: 0.7 },
      { webSearch: true }
    )).toBe(false);
    expect(isAskStreamingSupported(
      { provider: 'openai', model: 'gpt-5.4-mini', temperature: 0.7 },
      { prosConsMode: true }
    )).toBe(false);
    expect(isAskStreamingSupported(
      { provider: 'openai', model: 'gpt-5.4-mini', temperature: 0.7 },
      { argumentMapMode: true }
    )).toBe(false);
  });
});
