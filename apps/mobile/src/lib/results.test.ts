import { beforeEach, describe, expect, it, vi } from 'vitest';

const saveResearchedSource = vi.hoisted(() => vi.fn());

vi.mock('./supabase', () => ({ supabase: {} }));
vi.mock('expo/fetch', () => ({ fetch: vi.fn() }));
vi.mock('./offline-cache', () => ({ cachedRead: vi.fn(), afterWrite: vi.fn(), updateCopy: vi.fn(), readFailed: vi.fn() }));
vi.mock('./sources', () => ({ saveResearchedSource, applySourceAssessments: vi.fn(), fetchSourceIdsInFolder: vi.fn(), removeSource: vi.fn() }));

import { autosaveSources, readBrainstorm, readFactoids } from './results';

describe('autosaveSources', () => {
  beforeEach(() => saveResearchedSource.mockReset());
  it('writes no further source once Generate or Attack is cancelled during a write', async () => {
    const controller = new AbortController();
    let finishFirst = () => {};
    saveResearchedSource.mockImplementationOnce(() => new Promise<boolean>((resolve) => (finishFirst = () => resolve(true))));
    saveResearchedSource.mockResolvedValue(true);
    const sources = ['a', 'b', 'c'].map((name) => ({ title: name, url: `https://example.com/${name}` }));

    const saving = autosaveSources('user-1', sources, 'generate', 'debate-1', controller.signal);
    await vi.waitFor(() => expect(saveResearchedSource).toHaveBeenCalledOnce());
    controller.abort();
    finishFirst();

    await expect(saving).resolves.toEqual({ saved: 1, failed: 0 });
    expect(saveResearchedSource).toHaveBeenCalledTimes(1);
  });

  it('serializes tool batches and saves normalized page variants once per answer', async () => {
    let finishFirst = () => {};
    saveResearchedSource.mockImplementationOnce(() => new Promise<boolean>((resolve) => (finishFirst = () => resolve(true))));
    saveResearchedSource.mockResolvedValue(false);
    const first = autosaveSources('user-1', [
      { title: 'Page', url: 'https://www.example.com/report/' },
      { title: 'Same page', url: 'http://example.com/report?utm_source=research#results' },
    ], 'generate', 'debate-1');
    const second = autosaveSources('user-1', [{ title: 'Page again', url: 'https://example.com/report' }], 'brainstorm', 'debate-1');
    await vi.waitFor(() => expect(saveResearchedSource).toHaveBeenCalledOnce());
    finishFirst();
    await expect(first).resolves.toEqual({ saved: 1, failed: 0 });
    await expect(second).resolves.toEqual({ saved: 0, failed: 0 });
    expect(saveResearchedSource.mock.calls.map((args) => args[3])).toEqual(['generate', 'brainstorm']);
  });

});

describe('reading Brainstorm and Factoids output', () => {
  it('rejects a brainstorm with a non-text list entry before rendering or exporting', () => {
    const output = readBrainstorm({
      needsMoreInfo: false,
      topFive: [{ rank: 1, idea: { title: 'Cleaner air', description: 'Fewer cars in the centre' }, whyTop: 'Health' }],
      nextSteps: [{ action: 'Find local air-quality data' }, 'Ask the council'],
      warningsAndTradeoffs: [],
    });
    expect(output).toBeNull();
  });

  it('rejects shared brainstorm data the transform cannot read, instead of throwing', () => {
    // A public share link can hold any JSON; this one breaks String() inside the transform.
    expect(readBrainstorm({ topFive: [{ idea: { title: { toString: null } } }] })).toBeNull();
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
