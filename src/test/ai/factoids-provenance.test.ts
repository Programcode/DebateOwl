import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetMockState, setMockInvokeResponse, setMockSessionToken, supabaseMock } from '@/test/mocks/supabase';

vi.mock('@/lib/supabase/client', () => ({ supabase: supabaseMock }));
vi.mock('@/lib/stores/settings-store', () => ({
  useSettingsStore: {
    getState: () => ({ customSystemPrompt: undefined, outputLanguage: 'en' }),
  },
}));
vi.mock('@/lib/stores/session-store', () => ({
  useSessionStore: {
    getState: () => ({ sourceLibrary: [] }),
  },
}));

import { factoids } from '@/lib/ai/client';

const config = { provider: 'google', model: 'gemini-3-flash-preview', temperature: 0.3 };

describe('Factoids provenance boundary', () => {
  beforeEach(() => {
    resetMockState();
    setMockSessionToken('valid-token');
    vi.clearAllMocks();
  });

  it('returns validated consulted sources separately from verified evidence', async () => {
    setMockInvokeResponse({
      output: {
        factoids: [{
          id: 'fact-1',
          shortClaim: 'Transit ridership increased.',
          keyFigure: '12%',
          context: 'A measured increase after a fare policy change.',
          limitations: 'Single-city result.',
          citation: {
            title: 'Transport report',
            publisher: 'City agency',
            url: 'https://transport.example.gov/report',
            verified: 'verified',
          },
          howToUse: 'Use as a narrow empirical example.',
          relevanceScore: 88,
        }],
        searchSuggestions: [],
        warnings: [],
        verificationStatus: 'complete',
      },
      discoveredSources: [
        {
          title: 'Transport report',
          url: 'https://transport.example.gov/report',
          content: 'Agency report text',
          sourceType: 'government',
          qualityScore: 91,
          qualityLabel: 'strong',
          query: 'fare policy ridership report',
        },
        {
          title: 'Forum discussion',
          url: 'https://www.reddit.com/r/transit/example',
          content: 'Anecdotal discussion',
          sourceType: 'social',
          qualityScore: 18,
          qualityLabel: 'weak',
          query: 'fare policy ridership discussion',
        },
        { title: '', url: 'https://invalid.example' },
      ],
    });

    const outcome = await factoids({
      claim: 'Free transit increases ridership',
      direction: 'for',
      region: 'Global',
      sourceType: 'any',
      timeframe: '2020-2026',
      sourceCount: 5,
    }, config);

    expect(outcome.result.factoids).toHaveLength(1);
    expect(outcome.discoveredSources).toHaveLength(2);
    expect(outcome.discoveredSources[0]).toEqual(expect.objectContaining({
      sourceType: 'government',
      qualityLabel: 'strong',
      qualityScore: 91,
      query: 'fare policy ridership report',
    }));
    expect(outcome.discoveredSources[1].qualityLabel).toBe('weak');
  });

  it('keeps mock-provider Factoids inside the same result envelope', async () => {
    const outcome = await factoids({
      claim: 'Test claim',
      direction: 'for',
      region: 'Global',
      sourceType: 'any',
      timeframe: '',
      sourceCount: 5,
    }, { ...config, provider: 'mock' });

    expect(outcome.result.factoids).toBeDefined();
    expect(outcome.discoveredSources).toEqual([]);
    expect(supabaseMock.functions.invoke).not.toHaveBeenCalled();
  });
});
