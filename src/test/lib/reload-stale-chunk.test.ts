import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STALE_CHUNK_RELOAD_WINDOW_MS, installStaleChunkReload, reloadOnceForStaleChunk, resetStaleChunkReloadForTests } from '@/lib/reload-stale-chunk';

function fakeWindow() {
  const listeners = new Map<string, (event: Event) => void>();
  const stored = new Map<string, string>();
  const reload = vi.fn();
  const target = {
    addEventListener: (type: string, listener: EventListener): void => {
      listeners.set(type, listener as (event: Event) => void);
    },
    sessionStorage: {
      getItem: (key: string): string | null => stored.get(key) ?? null,
      setItem: (key: string, value: string): void => { stored.set(key, value); },
      removeItem: (key: string): void => { stored.delete(key); },
      clear: (): void => { stored.clear(); },
      key: (): string | null => null,
      length: 0,
    },
    location: { pathname: '/app/ask', reload },
    navigator: { onLine: true },
  };
  return { target, listeners, reload };
}

describe('stale chunk reload', () => {
  beforeEach(() => resetStaleChunkReloadForTests());

  it('reloads once when a route chunk is missing and then lets the error stand', () => {
    const { target, listeners, reload } = fakeWindow();
    installStaleChunkReload(target as unknown as Window);
    const handler = listeners.get('vite:preloadError');
    expect(handler).toBeTypeOf('function');

    const first = new Event('vite:preloadError', { cancelable: true });
    handler!(first);
    expect(first.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    // The reloaded document starts with no reload pending; sessionStorage remembers the first.
    resetStaleChunkReloadForTests();
    const second = new Event('vite:preloadError', { cancelable: true });
    handler!(second);
    expect(second.defaultPrevented).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads again for a later deploy, but not twice inside the window', () => {
    const { target, reload } = fakeWindow();
    const start = 1_000_000;
    const asWindow = target as unknown as Window;
    expect(reloadOnceForStaleChunk(asWindow, start)).toBe(true);
    resetStaleChunkReloadForTests();
    expect(reloadOnceForStaleChunk(asWindow, start + 5_000)).toBe(false);
    resetStaleChunkReloadForTests();
    expect(reloadOnceForStaleChunk(asWindow, start + STALE_CHUNK_RELOAD_WINDOW_MS + 1)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('treats a value it cannot read as a recent reload', () => {
    const { target, reload } = fakeWindow();
    target.sessionStorage.setItem('debatelab-stale-chunk:/app/ask', 'not-a-time');
    expect(reloadOnceForStaleChunk(target as unknown as Window)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('never reloads while offline, where a missing chunk is unreachable rather than stale', () => {
    const { target, listeners, reload } = fakeWindow();
    target.navigator.onLine = false;
    installStaleChunkReload(target as unknown as Window);

    const offline = new Event('vite:preloadError', { cancelable: true });
    listeners.get('vite:preloadError')!(offline);
    expect(offline.defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
