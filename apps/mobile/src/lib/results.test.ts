import { describe, expect, it, vi } from 'vitest';

const addSource = vi.hoisted(() => vi.fn());

vi.mock('./supabase', () => ({ supabase: {} }));
vi.mock('expo/fetch', () => ({ fetch: vi.fn() }));
vi.mock('./sources', () => ({ addSource, applySourceAssessments: vi.fn(), fetchSourceIdsInFolder: vi.fn(), removeSource: vi.fn() }));

import { autosaveSources } from './results';

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
