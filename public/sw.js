const CACHE_VERSION = 'debate-lab-v1';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const APP_SHELL = [
  '/',
  '/app',
  '/app/generate',
  '/app/attack',
  '/app/brainstorm',
  '/app/factoids',
  '/app/ask',
  '/app/library',
  '/app/timer',
  '/app/sparring',
  '/app/flowchart',
  '/app/history',
  '/app/settings',
  '/index.html',
  '/config.js',
  '/theme-init.js',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/favicon.png',
  '/hero-visual.png',
];

const API_PATH_PREFIXES = [
  '/auth/v1',
  '/rest/v1',
  '/functions/v1',
  '/storage/v1',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_SHELL_CACHE)
      .then((cache) => Promise.allSettled(
        APP_SHELL.map(async (url) => {
          const response = await fetch(url, { cache: 'reload' });
          if (response.ok) await cache.put(url, response);
        }),
      ))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => !key.startsWith(CACHE_VERSION))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline and not cached. Return a 504 so the browser/app sees a real
    // response instead of a network-level failure — prevents blank-page on
    // route navigation when a lazy chunk wasn't yet cached.
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

async function navigationFallback(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(APP_SHELL_CACHE);
      cache.put('/index.html', response.clone());
    }
    return response;
  } catch {
    return (await caches.match('/index.html')) ||
      new Response('<!doctype html><title>Offline</title><main style="font-family:system-ui;padding:2rem"><h1>Offline</h1><p>DebateLab is unavailable until your connection returns.</p></main>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (API_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationFallback(request));
    return;
  }

  if (
    request.destination === 'script' ||
    request.destination === 'style' ||
    request.destination === 'image' ||
    request.destination === 'font' ||
    url.pathname.startsWith('/assets/')
  ) {
    event.respondWith(cacheFirst(request));
  }
});
