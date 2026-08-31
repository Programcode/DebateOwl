import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/native', () => ({ isNativeApp: () => false }));

import { registerServiceWorker } from '@/register-service-worker';

describe('registerServiceWorker', () => {
  const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  let controllerChange: EventListener | undefined;

  beforeEach(() => {
    vi.stubEnv('PROD', true);
    sessionStorage.clear();
    controllerChange = undefined;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        controller: null,
        register: vi.fn().mockResolvedValue({ addEventListener: vi.fn() }),
        addEventListener: vi.fn((type: string, listener: EventListener) => {
          if (type === 'controllerchange') controllerChange = listener;
        }),
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

  it('skips the initial claim but refreshes for a later controller change', () => {
    registerServiceWorker();

    expect(controllerChange).toBeDefined();
    controllerChange?.(new Event('controllerchange'));
    expect(sessionStorage.getItem('pwa-refreshing')).toBeNull();

    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    controllerChange?.(new Event('controllerchange'));
    expect(sessionStorage.getItem('pwa-refreshing')).toBe('true');
  });
});
