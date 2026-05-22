import { App } from '@capacitor/app';
import { NATIVE_OAUTH_HASH_KEY, closeExternalBrowser, isNativeApp } from '@/lib/native';

export function registerNativeAppUrlListener() {
  if (!isNativeApp()) return;

  App.addListener('appUrlOpen', async ({ url }) => {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return;
    }

    if (parsedUrl.protocol !== 'app.debatelab.mobile:') return;

    if (parsedUrl.host === 'auth' && parsedUrl.hash) {
      sessionStorage.setItem(NATIVE_OAUTH_HASH_KEY, parsedUrl.hash.slice(1));
      await closeExternalBrowser();
      window.location.assign('/app');
      return;
    }

    await closeExternalBrowser();
    const route = parsedUrl.host === 'app' ? `/app${parsedUrl.pathname}${parsedUrl.search}` : '/app';
    window.location.assign(route);
  }).catch((error) => {
    console.warn('[Native] Failed to register app URL listener:', error);
  });
}
