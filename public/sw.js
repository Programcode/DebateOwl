// Filled in by the build (serviceWorkerPrecache in vite.config.ts): an id for
// this build's caches, and the hashed scripts, styles and fonts that open the
// app shell and its main pages offline and switch language there. Empty in
// development, where the worker is never registered.
const BUILD = { id: 'dev', assets: [] };

const CACHE_PREFIX = 'debate-lab-v6';
const CACHE_VERSION = `${CACHE_PREFIX}-${BUILD.id}`;
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const PAGES_CACHE = `${CACHE_VERSION}-pages`;

// Unhashed files, fetched past the HTTP cache on every install. The two HTML
// documents are required; an install that cannot store them fails and retries.
const REQUIRED_DOCUMENTS = ['/', '/app-shell.html'];
const APP_SHELL = [
  '/theme-init.js',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/favicon.png',
  '/favicon-72.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/owl-mark.svg',
];

// vercel.json serves app-shell.html at these paths, so offline the worker does too.
// (/expocit/sources is rewritten too, but its prerendered file is served first,
// so it is a public page here.)
const APP_SHELL_PATHS = [/^\/app(?:\/|$)/, /^\/login\/?$/, /^\/share\//];

const NETWORK_ONLY_PREFIXES = [
  // Supabase, also when a preview proxies it on this origin.
  '/auth/v1',
  '/rest/v1',
  '/functions/v1',
  '/storage/v1',
  '/__staging-supabase/',
  // The sign-in callback exchanges a one-time code; it must always reach the server.
  '/auth/callback',
  // Vercel Analytics and Speed Insights update their own scripts.
  '/_vercel/',
];

function htmlMislabeledAsAsset(response, request) {
  const type = (response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('text/html')) return false;
  const path = new URL(request.url).pathname;
  return request.destination === 'script'
    || request.destination === 'style'
    || path.startsWith('/assets/');
}

async function store(cache, url, init) {
  const request = new Request(url, init);
  const response = await fetch(request);
  if (!response.ok || response.redirected || htmlMislabeledAsAsset(response, request)) {
    throw new Error(`Could not precache ${url}`);
  }
  await cache.put(url, response);
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_SHELL_CACHE);
    // Hashed assets never change, so the HTTP cache may answer them; the page
    // that registered this worker has usually just downloaded most of them.
    await Promise.all([
      ...REQUIRED_DOCUMENTS.map((url) => store(cache, url, { cache: 'reload' })),
      ...BUILD.assets.map((url) => store(cache, url)),
    ]);
    await Promise.allSettled(APP_SHELL.map((url) => store(cache, url, { cache: 'reload' })));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(
        // Earlier builds' caches: their pages reference assets this build no longer has.
        keys
          .filter((key) => !key.startsWith(`${CACHE_VERSION}-`))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreVary: true });
  if (cached && !htmlMislabeledAsAsset(cached, request)) return cached;

  try {
    const response = await fetch(request);
    if (response.ok && !htmlMislabeledAsAsset(response, request)) {
      const cache = await caches.open(RUNTIME_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline and not cached. Return a 504 so the browser/app sees a real
    // response instead of a network-level failure — prevents blank-page on
    // route navigation when a lazy chunk wasn't yet cached.
    return new Response('', { status: 504, statusText: 'Offline' });
  }
}

function offlinePage() {
  return new Response('<!doctype html><title>Offline</title><main style="font-family:system-ui;padding:2rem"><h1>Offline</h1><p>DebateOwl is unavailable until your connection returns.</p></main>', {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/** App routes: the network, or offline the shell this build precached. */
async function appShellNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    return (await caches.match('/app-shell.html', { cacheName: APP_SHELL_CACHE })) || offlinePage();
  }
}

/**
 * Public pages are prerendered, each with its own HTML. Each is stored under
 * its own path, so offline a page is only ever answered with itself.
 */
async function pageNavigation(event) {
  const url = new URL(event.request.url);
  const key = `${url.origin}${url.pathname}`;
  try {
    const response = await fetch(event.request);
    // A redirected response cannot answer a navigation later.
    if (response.ok && !response.redirected) {
      // Copied now: the page starts reading the original as soon as it is returned.
      const copy = response.clone();
      event.waitUntil(caches.open(PAGES_CACHE).then((cache) => cache.put(key, copy)));
    }
    return response;
  } catch {
    // The copy saved on the last visit, before the one stored at install.
    return (await caches.match(key, { cacheName: PAGES_CACHE, ignoreVary: true }))
      || (await caches.match(key, { ignoreVary: true }))
      || offlinePage();
  }
}

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CACHE_VISITED_ASSETS' || !Array.isArray(event.data.urls)) return;

  const urls = event.data.urls.slice(0, 200).filter((value) => {
    if (typeof value !== 'string') return false;
    try {
      const url = new URL(value, self.location.origin);
      return url.origin === self.location.origin && url.pathname.startsWith('/assets/');
    } catch {
      return false;
    }
  });
  event.waitUntil(Promise.allSettled(urls.map((url) => cacheFirst(new Request(url)))));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NETWORK_ONLY_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return;
  // Embeds are framed on other sites: never store one as the app shell, and
  // never answer one with the cached shell, which refuses to be framed.
  if (url.pathname.startsWith('/embed/')) return;

  if (request.mode === 'navigate') {
    if (APP_SHELL_PATHS.some((pattern) => pattern.test(url.pathname))) {
      event.respondWith(appShellNavigation(request));
    } else {
      event.respondWith(pageNavigation(event));
    }
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
