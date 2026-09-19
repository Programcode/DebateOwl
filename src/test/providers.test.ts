import { describe, it, expect } from 'vitest';
import { DEFAULT_PROVIDERS } from '@/lib/ai/providers/types';

describe('DEFAULT_PROVIDERS', () => {
  // Model IDs key request routing and the stored per-session model choice, so a
  // collision across providers would silently route to the wrong provider.
  it('no duplicate model IDs across all providers', () => {
    const allIds = DEFAULT_PROVIDERS.flatMap(p => p.models.map(m => m.id));
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('exposes the approved model catalog through OpenRouter', () => {
    expect(DEFAULT_PROVIDERS).toHaveLength(1);
    expect(DEFAULT_PROVIDERS[0]?.id).toBe('openrouter');
    expect(DEFAULT_PROVIDERS[0]?.models.map((model) => model.id)).toEqual([
      'openai/gpt-5.6-luna',
      'google/gemini-3.8-flash',
      'deepseek/deepseek-v4-flash-0731',
      'anthropic/claude-sonnet-5',
      'anthropic/claude-opus-5',
      'openai/gpt-5.6-sol',
      'openai/gpt-5.6-terra',
      'deepseek/deepseek-v4-pro-0813',
      'z-ai/glm-5.3-flash',
      'meta/muse-spark-1.3',
    ]);
  });
});
