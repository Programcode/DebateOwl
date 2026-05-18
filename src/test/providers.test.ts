import { describe, it, expect } from 'vitest';
import { DEFAULT_PROVIDERS } from '@/lib/ai/providers/types';

describe('DEFAULT_PROVIDERS', () => {
  it('has 3 providers', () => {
    expect(DEFAULT_PROVIDERS.length).toBe(3);
  });

  it('has openai provider', () => {
    expect(DEFAULT_PROVIDERS.find(p => p.id === 'openai')).toBeDefined();
  });

  it('has anthropic provider', () => {
    expect(DEFAULT_PROVIDERS.find(p => p.id === 'anthropic')).toBeDefined();
  });

  it('has google provider', () => {
    expect(DEFAULT_PROVIDERS.find(p => p.id === 'google')).toBeDefined();
  });

  it('each provider has a name', () => {
    DEFAULT_PROVIDERS.forEach(p => {
      expect(p.name).toBeTruthy();
    });
  });

  it('each provider has models array', () => {
    DEFAULT_PROVIDERS.forEach(p => {
      expect(Array.isArray(p.models)).toBe(true);
      expect(p.models.length).toBeGreaterThan(0);
    });
  });

  it('all models have id field', () => {
    DEFAULT_PROVIDERS.forEach(p => {
      p.models.forEach(m => {
        expect(m.id).toBeTruthy();
      });
    });
  });

  it('all models have name field', () => {
    DEFAULT_PROVIDERS.forEach(p => {
      p.models.forEach(m => {
        expect(m.name).toBeTruthy();
      });
    });
  });

  it('all models have maxTokens field', () => {
    DEFAULT_PROVIDERS.forEach(p => {
      p.models.forEach(m => {
        expect(m.maxTokens).toBeGreaterThan(0);
      });
    });
  });

  it('Pro models are correctly marked with isProOnly', () => {
    const proModels = DEFAULT_PROVIDERS.flatMap(p => p.models).filter(m => m.isProOnly);
    expect(proModels.length).toBeGreaterThan(0);
    proModels.forEach(m => {
      expect(m.isProOnly).toBe(true);
    });
  });

  it('non-Pro models exist', () => {
    const freeModels = DEFAULT_PROVIDERS.flatMap(p => p.models).filter(m => !m.isProOnly);
    expect(freeModels.length).toBeGreaterThan(0);
  });

  it('no duplicate model IDs across all providers', () => {
    const allIds = DEFAULT_PROVIDERS.flatMap(p => p.models.map(m => m.id));
    const uniqueIds = new Set(allIds);
    expect(uniqueIds.size).toBe(allIds.length);
  });

  it('provider isAvailable returns true for openai', () => {
    const openai = DEFAULT_PROVIDERS.find(p => p.id === 'openai')!;
    expect(openai.isAvailable()).toBe(true);
  });

  it('provider isAvailable returns true for anthropic', () => {
    const anthropic = DEFAULT_PROVIDERS.find(p => p.id === 'anthropic')!;
    expect(anthropic.isAvailable()).toBe(true);
  });

  it('provider isAvailable returns true for google', () => {
    const google = DEFAULT_PROVIDERS.find(p => p.id === 'google')!;
    expect(google.isAvailable()).toBe(true);
  });
});
