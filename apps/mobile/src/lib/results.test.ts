import { describe, expect, it, vi } from 'vitest';

const addSource = vi.hoisted(() => vi.fn());

vi.mock('./supabase', () => ({ supabase: {} }));
vi.mock('expo/fetch', () => ({ fetch: vi.fn() }));
vi.mock('./sources', () => ({ addSource, applySourceAssessments: vi.fn(), fetchSourceIdsInFolder: vi.fn(), removeSource: vi.fn() }));

import { autosaveSources, readBrainstorm, readFactoids } from './results';

describe('autosaveSources', () => {
  it('writes no further source once Generate or Attack is cancelled during a write', async () => {
    const controller = new AbortController();
    let finishFirst = () => {};
    addSource.mockImplementationOnce(() => new Promise<void>((resolve) => (finishFirst = resolve)));
    addSource.mockResolvedValue(undefined);
    const sources = ['a', 'b', 'c'].map((name) => ({ title: name, url: `https://example.com/${name}` }));

    const saving = autosaveSources('user-1', sources, 'generate', 'debate-1', controller.signal);
    controller.abort();
    finishFirst();

    await expect(saving).resolves.toEqual({ saved: 1, failed: 0 });
    expect(addSource).toHaveBeenCalledTimes(1);
  });
});

describe('reading Brainstorm and Factoids output', () => {
  it('keeps only text in a brainstorm list, so an object never reaches the document or the export', () => {
    const output = readBrainstorm({
      needsMoreInfo: false,
      topFive: [{ rank: 1, idea: { title: 'Cleaner air', description: 'Fewer cars in the centre' }, whyTop: 'Health' }],
      nextSteps: [{ action: 'Find local air-quality data' }, 'Ask the council'],
      warningsAndTradeoffs: [],
    });
    expect(output?.nextSteps).toEqual(['Ask the council']);
    expect(output?.topFive?.[0].idea.title).toBe('Cleaner air');
  });

  it('rejects a saved factoids row whose factoid does not fit the schema', () => {
    const factoid = {
      id: 'f1',
      shortClaim: { text: 'Air quality improved' },
      keyFigure: '30%',
      context: '',
      limitations: '',
      citation: { title: 'Report', publisher: 'Agency', verified: 'verified' },
      howToUse: '',
      relevanceScore: 80,
    };
    expect(readFactoids({ factoids: [factoid], searchSuggestions: [], warnings: [], verificationStatus: 'complete' })).toBeNull();
    expect(readFactoids({ factoids: [{ ...factoid, shortClaim: 'Air quality improved' }], searchSuggestions: [], warnings: [], verificationStatus: 'complete' })?.factoids).toHaveLength(1);
  });
});
