import { App } from '@capacitor/app';
import { NATIVE_URL_SCHEME, closeExternalBrowser, isNativeApp } from '@/lib/native';

interface NativeAppUrlAction {
  route: string;
}

const handledNativeUrls = new Set<string>();

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

function isNativeAuthErrorUrl(url: string) {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.protocol === `${NATIVE_URL_SCHEME}:` &&
      parsedUrl.host === 'auth' &&
      parsedUrl.pathname === '/callback' &&
      (parsedUrl.searchParams.has('error') || parsedUrl.searchParams.has('error_description'))
    );
  } catch {
    return false;
  }
}

async function handleNativeAppUrl(url: string) {
  const action = resolveNativeAppUrl(url);
  if (!action) {
    if (isNativeAuthErrorUrl(url)) {
      await closeExternalBrowser();
      window.location.assign('/login');
    }
    return;
  }

  await closeExternalBrowser();
  window.location.assign(action.route);
}

async function handleNativeAppUrlOnce(url: string) {
  if (handledNativeUrls.has(url)) return;
  handledNativeUrls.add(url);
  await handleNativeAppUrl(url);
}

export function registerNativeAppUrlListener() {
  if (!isNativeApp()) return;

  App.getLaunchUrl().then((launchUrl) => {
    if (launchUrl?.url) {
      return handleNativeAppUrlOnce(launchUrl.url);
    }
  }).catch((error) => {
    console.warn('[Native] Failed to read launch URL:', error);
  });

  App.addListener('appUrlOpen', ({ url }) => handleNativeAppUrlOnce(url)).catch((error) => {
    console.warn('[Native] Failed to register app URL listener:', error);
  });
}
