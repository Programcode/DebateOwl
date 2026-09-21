import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/native', () => ({ isNativeApp: () => false }));

import { registerServiceWorker } from '@/register-service-worker';

describe('registerServiceWorker', () => {
  const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  const addEventListener = vi.fn();
  const registrationAddEventListener = vi.fn();
  const postMessage = vi.fn();

  beforeEach(() => {
    vi.stubEnv('PROD', true);
    addEventListener.mockClear();
    registrationAddEventListener.mockClear();
    postMessage.mockClear();
    vi.spyOn(performance, 'getEntriesByType').mockReturnValue([]);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: null,
        register: vi.fn().mockResolvedValue({ addEventListener: registrationAddEventListener }),
        ready: Promise.resolve({ active: { postMessage } }),
        addEventListener,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    if (originalServiceWorker) {
      Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker);
    } else {
      Reflect.deleteProperty(navigator, 'serviceWorker');
    }
  });

  it('registers without forcing an update activation or document reload', async () => {
    registerServiceWorker();
    window.dispatchEvent(new Event('load'));
    await Promise.resolve();

    expect(navigator.serviceWorker.register).toHaveBeenCalledWith('/sw.js');
    expect(addEventListener).not.toHaveBeenCalledWith('controllerchange', expect.any(Function));
    expect(registrationAddEventListener).not.toHaveBeenCalledWith('updatefound', expect.any(Function));
  });

  it('asks the active worker to cache assets loaded before it took control', async () => {
    vi.mocked(performance.getEntriesByType).mockReturnValue([
      { name: `${window.location.origin}/assets/index-hash.js` } as PerformanceResourceTiming,
      { name: `${window.location.origin}/assets/GeneratePage-hash.js` } as PerformanceResourceTiming,
      { name: `${window.location.origin}/rest/v1/cases` } as PerformanceResourceTiming,
      { name: 'https://example.com/assets/external.js' } as PerformanceResourceTiming,
    ]);

    registerServiceWorker();
    window.dispatchEvent(new Event('load'));
    await Promise.resolve();
    await Promise.resolve();

    expect(postMessage).toHaveBeenCalledWith({
      type: 'CACHE_VISITED_ASSETS',
      urls: [
        `${window.location.origin}/assets/index-hash.js`,
        `${window.location.origin}/assets/GeneratePage-hash.js`,
      ],
    });
  });
});
