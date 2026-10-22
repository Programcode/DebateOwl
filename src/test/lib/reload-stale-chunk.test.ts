import { describe, expect, it, vi } from 'vitest';
import { installStaleChunkReload } from '@/lib/reload-stale-chunk';

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
  };
  return { target, listeners, reload };
}

describe('stale chunk reload', () => {
  it('reloads once when a route chunk is missing and then lets the error stand', () => {
    const { target, listeners, reload } = fakeWindow();
    installStaleChunkReload(target as unknown as Window);
    const handler = listeners.get('vite:preloadError');
    expect(handler).toBeTypeOf('function');

    const first = new Event('vite:preloadError', { cancelable: true });
    handler!(first);
    expect(first.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    const second = new Event('vite:preloadError', { cancelable: true });
    handler!(second);
    expect(second.defaultPrevented).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
