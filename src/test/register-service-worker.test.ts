import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/native', () => ({ isNativeApp: () => false }));

import { registerServiceWorker } from '@/register-service-worker';

describe('registerServiceWorker', () => {
  const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  const addEventListener = vi.fn();
  const registrationAddEventListener = vi.fn();

  beforeEach(() => {
    vi.stubEnv('PROD', true);
    addEventListener.mockClear();
    registrationAddEventListener.mockClear();
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: null,
        register: vi.fn().mockResolvedValue({ addEventListener: registrationAddEventListener }),
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
});
