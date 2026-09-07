import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

export const NATIVE_URL_SCHEME = 'debatelab';
export const NATIVE_CALLBACK_URL = `${NATIVE_URL_SCHEME}://auth/callback`;
export const PUBLIC_WEB_APP_ORIGIN = 'https://debate.pi-stack.org';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function getWebAppRedirectUrl(path = '/app'): string {
  const origin = isNativeApp() ? PUBLIC_WEB_APP_ORIGIN : window.location.origin;
  return `${origin}${path}`;
}

export function getOAuthRedirectUrl(): string {
  if (isNativeApp()) return NATIVE_CALLBACK_URL;
  return `${window.location.origin}/app`;
}

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:']);

function getSafeExternalUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Refusing to open a malformed URL.');
  }

  if (!ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Refusing to open an unsupported URL scheme: ${parsed.protocol}`);
  }

  return parsed.toString();
}

export async function openExternalUrl(url: string, { newWindow = false }: { newWindow?: boolean } = {}): Promise<void> {
  const safeUrl = getSafeExternalUrl(url);

  if (isNativeApp()) {
    await Browser.open({ url: safeUrl, presentationStyle: 'fullscreen' });
    return;
  }

  if (newWindow) {
    window.open(safeUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  window.location.assign(safeUrl);
}

export async function closeExternalBrowser(): Promise<void> {
  if (!isNativeApp()) return;

  try {
    await Browser.close();
  } catch {
    // Browser.close is best-effort; iOS may have already dismissed the browser.
  }
}
