import { describe, expect, it, vi } from 'vitest';
import { runJevSmoke } from '../../../scripts/smoke-jev.mjs';

describe('Jev smoke command', () => {
  it('sends the pinned model and returns only a sanitized summary', async () => {
    let requestBody: Record<string, unknown> | undefined;
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        model: 'typesafe/jev-1.13',
        answers: {
          fit: { type: 'choice', choice: 'specific', confidence: 0.91, probabilities: { specific: 0.91, vague: 0.09 } },
        },
        usage: { input_tokens: 12, output_tokens: 1 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const summary = await runJevSmoke({ apiKey: 'secret-key', fetchImpl, now: () => 100 });
    expect(requestBody).toMatchObject({ model: 'typesafe/jev-1.13' });
    expect(summary).toEqual({ model: 'typesafe/jev-1.13', answers: { fit: 'specific' }, latencyMs: 0, usage: { inputTokens: 12, outputTokens: 1 } });
    expect(JSON.stringify(summary)).not.toContain('secret-key');
    expect(JSON.stringify(summary)).not.toContain('DebateLab smoke test');
  });

  it('rejects a missing key before network access', async () => {
    const fetchImpl = vi.fn();
    await expect(runJevSmoke({ apiKey: '', fetchImpl })).rejects.toThrow('OPENROUTER_API_KEY missing');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects unsuccessful and malformed responses', async () => {
    await expect(runJevSmoke({
      apiKey: 'key',
      fetchImpl: vi.fn(async () => new Response('unavailable', { status: 503 })),
    })).rejects.toThrow('OpenRouter Jev smoke failed with 503');
    await expect(runJevSmoke({
      apiKey: 'key',
      fetchImpl: vi.fn(async () => new Response(JSON.stringify({ model: 'typesafe/jev-1.13', answers: {} }), { status: 200 })),
    })).rejects.toThrow('malformed');
  });
});
