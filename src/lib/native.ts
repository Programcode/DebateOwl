import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

export const NATIVE_URL_SCHEME = 'debatelab';
export const NATIVE_CALLBACK_URL = `${NATIVE_URL_SCHEME}://auth/callback`;
export const PUBLIC_WEB_APP_ORIGIN = 'https://debate.pi-stack.org';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function getAppRedirectUrl(path = '/app'): string {
  if (isNativeApp()) return `${NATIVE_URL_SCHEME}://${path.replace(/^\/+/, '')}`;
  return `${window.location.origin}${path}`;
}

export function getWebAppRedirectUrl(path = '/app'): string {
  const origin = isNativeApp() ? PUBLIC_WEB_APP_ORIGIN : window.location.origin;
  return `${origin}${path}`;
}

export function getOAuthRedirectUrl(): string {
  if (isNativeApp()) return NATIVE_CALLBACK_URL;
  return `${window.location.origin}/app`;
}

export async function openExternalUrl(url: string, { newWindow = false }: { newWindow?: boolean } = {}): Promise<void> {
  if (isNativeApp()) {
    await Browser.open({ url, presentationStyle: 'fullscreen' });
    return;
  }

  if (newWindow) {
    window.open(url, '_blank', 'noopener,noreferrer');
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
