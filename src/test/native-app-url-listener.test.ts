import { beforeEach, describe, expect, it, vi } from 'vitest';

const { addListenerMock, getLaunchUrlMock } = vi.hoisted(() => ({
  addListenerMock: vi.fn(),
  getLaunchUrlMock: vi.fn(),
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: addListenerMock,
    getLaunchUrl: getLaunchUrlMock,
  },
}));

vi.mock('@/lib/native', () => ({
  NATIVE_URL_SCHEME: 'debatelab',
  closeExternalBrowser: vi.fn(),
  isNativeApp: () => true,
}));

import { registerNativeAppUrlListener, resolveNativeAppUrl } from '@/native-app-url-listener';

describe('native app URL listener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    addListenerMock.mockResolvedValue({ remove: vi.fn() });
    getLaunchUrlMock.mockResolvedValue(null);
  });

  it('checks the launch URL so terminated-app callbacks are not lost', () => {
    registerNativeAppUrlListener();

    expect(getLaunchUrlMock).toHaveBeenCalledTimes(1);
  });

  it('rejects legacy fragment-token callbacks', () => {
    expect(resolveNativeAppUrl('debatelab://auth/callback#access_token=a&refresh_token=r')).toBeNull();
  });

  it('preserves PKCE codes from the native auth callback', () => {
    expect(resolveNativeAppUrl('debatelab://auth/callback?code=pkce-code')).toEqual({
      route: '/app?code=pkce-code',
    });
  });

  it('restores nested app routes and ignores unrelated schemes', () => {
    expect(resolveNativeAppUrl('debatelab://app/settings?checkout=success')).toEqual({
      route: '/app/settings?checkout=success',
    });
    expect(resolveNativeAppUrl('debatelab://auth/not-the-callback?code=pkce-code')).toBeNull();
    expect(resolveNativeAppUrl('https://example.com/app')).toBeNull();
  });
});
