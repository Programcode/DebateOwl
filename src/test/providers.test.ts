import { describe, it, expect } from 'vitest';
import { AVAILABLE_MODELS, PROVIDER_ID } from '@/lib/ai/providers/types';

describe('AVAILABLE_MODELS', () => {
  // Model IDs key request routing and the stored per-session model choice, so a
  // duplicate would silently route to the wrong catalog entry.
  it('has no duplicate model IDs', () => {
    const allIds = AVAILABLE_MODELS.map((model) => model.id);
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it('exposes the approved model catalog through OpenRouter', () => {
    expect(PROVIDER_ID).toBe('openrouter');
    expect(AVAILABLE_MODELS.map((model) => model.id)).toEqual([
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
