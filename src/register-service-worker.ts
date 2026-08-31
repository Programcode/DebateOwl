import { isNativeApp } from '@/lib/native';

const SERVICE_WORKER_URL = '/sw.js';

export function registerServiceWorker() {
  if (isNativeApp()) return;
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  let hadController = navigator.serviceWorker.controller !== null;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(SERVICE_WORKER_URL)
      .then((registration) => {
        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              worker.postMessage({ type: 'SKIP_WAITING' });
            }
          });
        });
      })
      .catch((error) => {
        console.warn('[PWA] Service worker registration failed:', error);
      });
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (sessionStorage.getItem('pwa-refreshing') === 'true') return;
    sessionStorage.setItem('pwa-refreshing', 'true');
    window.location.reload();
  });
}
