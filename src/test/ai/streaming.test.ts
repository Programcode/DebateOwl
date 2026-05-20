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

  it('only enables streaming for basic OpenAI ask chats', () => {
    expect(isAskStreamingSupported({ provider: 'openai', model: 'gpt-5.4-mini', temperature: 0.7 })).toBe(true);
    expect(isAskStreamingSupported({ provider: 'lovable', model: 'gpt-5.4-mini', temperature: 0.7 })).toBe(true);
    expect(isAskStreamingSupported({ provider: 'google', model: 'gemini-3-flash-preview', temperature: 0.7 })).toBe(false);
    expect(isAskStreamingSupported(
      { provider: 'openai', model: 'gpt-5.4-mini', temperature: 0.7 },
      { citationMode: true }
    )).toBe(false);
  });
});
