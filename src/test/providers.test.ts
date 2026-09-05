import { describe, it, expect } from 'vitest';
import { DEFAULT_PROVIDERS } from '@/lib/ai/providers/types';

describe('DEFAULT_PROVIDERS', () => {
  // Model IDs key request routing and the stored per-session model choice, so a
  // collision across providers would silently route to the wrong provider.
  it('no duplicate model IDs across all providers', () => {
    const allIds = DEFAULT_PROVIDERS.flatMap(p => p.models.map(m => m.id));
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});
