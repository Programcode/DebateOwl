import { describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('./supabase', () => ({ supabase }));
// Reads go straight to the network here; offline-cache.test.ts covers the saved copies.
vi.mock('./offline-cache', () => ({ cachedRead: (_user: string, _group: string, _key: string, load: () => Promise<unknown>) => load(), forgetCopy: vi.fn() }));

import { applySourceAssessments } from './sources';

describe('applySourceAssessments', () => {
  it('writes no ranking once Generate, Attack or Ask is cancelled while the sources are read', async () => {
    const controller = new AbortController();
    let finishRead = (_rows: unknown) => {};
    const read = new Promise((resolve) => (finishRead = resolve));
    const chain = { eq: () => chain, then: read.then.bind(read) };
    const written = { eq: () => written, then: (done: (value: unknown) => unknown) => done({ error: null }) };
    const update = vi.fn(() => written);
    supabase.from.mockReturnValue({ select: () => chain, update });
    const assessment = { key: 'https://example.com/a', relevance: 0.8, importance: 2 as const, strength: 2 as const, evaluatedAt: '2026-10-09T00:00:00Z', retained: true };

    const applying = applySourceAssessments('user-1', 'debate-1', [assessment], controller.signal);
    controller.abort();
    finishRead({ data: [{ id: 'source-a', origin: 'https://example.com/a', metadata: null }], error: null });

    await expect(applying).resolves.toBeUndefined();
    expect(update).not.toHaveBeenCalled();
  });
});
