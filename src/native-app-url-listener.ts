import { App } from '@capacitor/app';
import { NATIVE_URL_SCHEME, closeExternalBrowser, isNativeApp } from '@/lib/native';

interface NativeAppUrlAction {
  route: string;
}

export function resolveNativeAppUrl(url: string): NativeAppUrlAction | null {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return null;
  }

  if (parsedUrl.protocol !== `${NATIVE_URL_SCHEME}:`) return null;

  if (parsedUrl.host === 'auth' && parsedUrl.pathname === '/callback') {
    if (parsedUrl.searchParams.has('code')) {
      return { route: `/app${parsedUrl.search}` };
    }

    return null;
  }

  if (parsedUrl.host !== 'app') return null;

  return {
    route: `/app${parsedUrl.pathname}${parsedUrl.search}`,
  };
}

async function handleNativeAppUrl(url: string) {
  const action = resolveNativeAppUrl(url);
  if (!action) return;

  await closeExternalBrowser();
  window.location.assign(action.route);
}

export function registerNativeAppUrlListener() {
  if (!isNativeApp()) return;

  App.getLaunchUrl().then((launchUrl) => {
    if (launchUrl?.url) {
      return handleNativeAppUrl(launchUrl.url);
    }
  }).catch((error) => {
    console.warn('[Native] Failed to read launch URL:', error);
  });

  App.addListener('appUrlOpen', ({ url }) => handleNativeAppUrl(url)).catch((error) => {
    console.warn('[Native] Failed to register app URL listener:', error);
  });
}
