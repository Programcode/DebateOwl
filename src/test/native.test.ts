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

import { Browser } from '@capacitor/browser';
import { getWebAppRedirectUrl, openExternalUrl } from '@/lib/native';

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

  it('rejects unsafe schemes before opening a native browser', async () => {
    isNativePlatformMock.mockReturnValue(true);

    await expect(openExternalUrl('javascript:alert(1)')).rejects.toThrow('unsupported URL scheme');
    expect(Browser.open).not.toHaveBeenCalled();
  });

  it('rejects unsafe schemes before opening a browser window', async () => {
    const openSpy = vi.spyOn(window, 'open');

    await expect(openExternalUrl('data:text/html,unsafe', { newWindow: true })).rejects.toThrow('unsupported URL scheme');
    expect(openSpy).not.toHaveBeenCalled();
  });
});
