const SERVICE_WORKER_URL = '/sw.js';

function assetUrls(entries: PerformanceEntry[]): string[] {
  return [...new Set(entries
    .map((entry) => entry.name)
    .filter((name) => {
      const url = new URL(name, window.location.href);
      return url.origin === window.location.origin && url.pathname.startsWith('/assets/');
    }))];
}

export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(SERVICE_WORKER_URL)
      .then(async () => {
        const registration = await navigator.serviceWorker.ready;
        const send = (entries: PerformanceEntry[]) => {
          const urls = assetUrls(entries);
          if (urls.length) registration.active?.postMessage({ type: 'CACHE_VISITED_ASSETS', urls });
        };
        send(performance.getEntriesByType('resource'));

        if (typeof PerformanceObserver !== 'undefined') {
          const observer = new PerformanceObserver((list) => send(list.getEntries()));
          observer.observe({ type: 'resource', buffered: true });
          window.setTimeout(() => observer.disconnect(), 5_000);
        }
      })
      .catch((error) => {
        console.warn('[PWA] Service worker registration failed:', error);
      });
  }, { once: true });
}
