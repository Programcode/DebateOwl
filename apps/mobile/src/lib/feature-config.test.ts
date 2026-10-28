import { DEFAULT_MODEL, DEFAULT_PRO_MODEL } from '@debatelab/core/contract/model-catalog';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));

import { featureConfigsWith } from './feature-config';

describe('featureConfigsWith', () => {
  it('refuses a Pro model without Pro access', () => {
    expect(() => featureConfigsWith({}, false, 'generate', { model: DEFAULT_PRO_MODEL })).toThrow();
    expect(() => featureConfigsWith({}, false, 'generate', { model: 'auto-pro' })).toThrow();
  });

  it('changes one tool and keeps what the student saved for the others', () => {
    const saved = { attack: { provider: 'openrouter', model: 'openai/gpt-6-luna', reasoningEffort: 'high' } };
    const configs = featureConfigsWith(saved, false, 'generate', { model: 'deepseek/deepseek-v4-flash-0731' });
    expect(configs.generate).toEqual({ provider: 'openrouter', model: 'deepseek/deepseek-v4-flash-0731', reasoningEffort: 'low' });
    expect(configs.attack).toEqual(saved.attack);
    // The website reads an empty feature_configs as never saved, so every tool gets its defaults.
    expect(configs.ask.model).toBe(DEFAULT_MODEL);
    expect(Object.keys(configs).sort()).toEqual(['ask', 'attack', 'brainstorm', 'factoids', 'generate', 'sparring']);
  });
});
