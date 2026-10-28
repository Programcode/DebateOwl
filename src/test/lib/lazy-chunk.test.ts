import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isChunkLoadError, loadChunk, namedChunk } from '@/lib/lazy-chunk';
import { resetStaleChunkReloadForTests } from '@/lib/reload-stale-chunk';

const PENDING = Symbol('pending');

/** What the promise has done after the microtask queue drains: its value, its error, or nothing yet. */
async function settled<T>(promise: Promise<T>): Promise<T | typeof PENDING | { rejected: unknown }> {
  const result = await Promise.race([
    promise.then((value) => value, (error: unknown) => ({ rejected: error })),
    new Promise<typeof PENDING>((resolve) => setTimeout(() => resolve(PENDING), 20)),
  ]);
  return result;
}

const missingChunk = () => new TypeError('Failed to fetch dynamically imported module: https://debateowl.com/assets/LoginPage-old.js');

describe('loadChunk', () => {
  beforeEach(() => resetStaleChunkReloadForTests());

  it('returns a module that loaded', async () => {
    const module = { default: (): null => null };
    await expect(loadChunk(() => Promise.resolve(module), () => false)).resolves.toBe(module);
  });

  it('waits for the reload instead of handing back nothing after a stale-chunk preload error', async () => {
    // Vite resolves the import to undefined once the preload listener prevented its error.
    const reload = vi.fn(() => true);
    const consumer = loadChunk(() => Promise.resolve(undefined), reload).then(({ default: Page }: { default: unknown }) => Page);
    expect(await settled(consumer)).toBe(PENDING);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('fails with a named error when an empty module cannot be reloaded', async () => {
    const result = await settled(loadChunk(() => Promise.resolve(undefined), () => false));
    expect(result).toEqual({ rejected: expect.objectContaining({ name: 'ChunkLoadError' }) });
  });

  it('reloads once for a missing chunk and lets the error through when that is used up', async () => {
    expect(await settled(loadChunk(() => Promise.reject(missingChunk()), () => true))).toBe(PENDING);
    const second = await settled(loadChunk(() => Promise.reject(missingChunk()), () => false));
    expect(second).toEqual({ rejected: expect.objectContaining({ name: 'TypeError' }) });
  });

  it('does not reload for an error that is not a missing chunk', async () => {
    const reload = vi.fn(() => true);
    const result = await settled(loadChunk(() => Promise.reject(new RangeError('bug in the page')), reload));
    expect(result).toEqual({ rejected: expect.objectContaining({ name: 'RangeError' }) });
    expect(reload).not.toHaveBeenCalled();
  });

  it('fails with a named error when a module lacks the export a lazy component asked for', async () => {
    await expect(namedChunk(() => Promise.resolve({ AppLayout: (): null => null }), 'Layout' as 'AppLayout')).rejects.toMatchObject({ name: 'ChunkLoadError' });
  });

  it('recognizes each browser’s missing-module message', () => {
    expect(isChunkLoadError(missingChunk())).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module: /assets/a.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Failed to fetch'))).toBe(false);
  });
});
