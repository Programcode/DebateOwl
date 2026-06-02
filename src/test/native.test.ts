import { beforeEach, describe, expect, it, vi } from 'vitest';

const { isNativePlatformMock } = vi.hoisted(() => ({
  isNativePlatformMock: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: isNativePlatformMock,
  },
}));

vi.mock('@capacitor/browser', () => ({
  Browser: {
    open: vi.fn(),
    close: vi.fn(),
  },
}));

import { getWebAppRedirectUrl } from '@/lib/native';

describe('native URL helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isNativePlatformMock.mockReturnValue(false);
  });

  it('uses the browser origin for web Stripe return URLs', () => {
    expect(getWebAppRedirectUrl('/app/settings')).toBe(`${window.location.origin}/app/settings`);
  });

  it('uses the public HTTPS origin for native Stripe return URLs', () => {
    isNativePlatformMock.mockReturnValue(true);

    expect(getWebAppRedirectUrl('/app/settings')).toBe('https://debate.pi-stack.org/app/settings');
  });
});
