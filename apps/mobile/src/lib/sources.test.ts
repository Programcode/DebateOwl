import { describe, expect, it, vi } from 'vitest';

const supabase = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('./supabase', () => ({ supabase }));
// Reads go straight to the network here; offline-cache.test.ts covers the saved copies.
vi.mock('./offline-cache', () => ({ cachedRead: (_user: string, _group: string, _key: string, load: () => Promise<unknown>) => load(), afterWrite: vi.fn(), updateCopy: vi.fn(), readFailed: vi.fn() }));

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

describe('researched pages', () => {
  it.each(['Student excerpt', ''])('refreshes a normalized URL and fills only empty content (%j)', async (content) => {
    const existing = { id: 'saved-page', origin: 'http://www.example.com/report/?utm_source=student', content, metadata: { capturedVia: 'import', note: 'Keep me' } };
    const read = { eq: vi.fn(() => read), then: (done: (value: unknown) => unknown) => done({ data: [existing], error: null }) };
    const written = { eq: vi.fn(() => written), then: (done: (value: unknown) => unknown) => done({ error: null }) };
    const update = vi.fn(() => written);
    const insert = vi.fn();
    supabase.from.mockReturnValue({ select: () => read, update, insert });
    const { saveResearchedSource } = await import('./sources');
    await expect(saveResearchedSource('user-1', 'debate-1', { title: 'Research title', url: 'https://example.com/report#results', content: 'Research excerpt', qualityLabel: 'strong' }, 'generate')).resolves.toBe(false);
    expect(insert).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith({ metadata: { capturedVia: 'generate', note: 'Keep me', url: 'https://example.com/report#results', qualityLabel: 'strong' }, ...(content ? {} : { content: 'Research excerpt' }) });
    expect(written.eq.mock.calls).toEqual([['user_id', 'user-1'], ['debate_id', 'debate-1'], ['id', 'saved-page']]);
  });

  it('writes nothing when cancelled while looking for an existing page', async () => {
    const controller = new AbortController();
    const read = { eq: () => read, then: (done: (value: unknown) => unknown) => {
      controller.abort();
      return done({ data: [], error: null });
    } };
    const insert = vi.fn();
    const update = vi.fn();
    supabase.from.mockReturnValue({ select: () => read, insert, update });
    const { saveResearchedSource } = await import('./sources');
    await expect(saveResearchedSource('user-1', 'debate-1', { title: 'Page', url: 'https://example.com' }, 'generate', controller.signal)).resolves.toBe(false);
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});
