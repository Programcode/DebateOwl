import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

export const NATIVE_CALLBACK_URL = 'app.debatelab.mobile://auth/callback';
export const NATIVE_OAUTH_HASH_KEY = 'debatelab-native-oauth-hash';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function getAppRedirectUrl(path = '/app'): string {
  if (isNativeApp()) return `app.debatelab.mobile://${path.replace(/^\/+/, '')}`;
  return `${window.location.origin}${path}`;
}

export function getOAuthRedirectUrl(): string {
  if (isNativeApp()) return NATIVE_CALLBACK_URL;
  return `${window.location.origin}/app`;
}

export async function openExternalUrl(url: string): Promise<void> {
  if (isNativeApp()) {
    await Browser.open({ url, presentationStyle: 'fullscreen' });
    return;
  }

  window.location.assign(url);
}

export async function closeExternalBrowser(): Promise<void> {
  if (!isNativeApp()) return;

  try {
    await Browser.close();
  } catch {
    // Browser.close is best-effort; iOS may have already dismissed the browser.
  }
}
