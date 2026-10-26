import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { chromium } from '@playwright/test';

const ROOT = process.cwd();
const SERVER_TIMEOUT_MS = 30_000;
const CONTENT_TIMEOUT_MS = 15_000;
const V2_WORKER = `
const CACHE = 'debate-lab-v2-shell';
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.put('/legacy.js', new Response('legacy'))));
});
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
`;

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolve) => server.close(resolve));
  if (!port) throw new Error('Could not allocate a loopback port.');
  return port;
}

async function waitForServer(url) {
  const started = Date.now();
  while (Date.now() - started < SERVER_TIMEOUT_MS) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return;
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Preview did not answer ${url}.`);
}

async function stopServer(child) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

function stubSession() {
  const expiresAt = Math.floor(Date.now() / 1_000) + 3_600;
  return {
    access_token: 'stub-access',
    refresh_token: 'stub-refresh',
    expires_in: 3_600,
    expires_at: expiresAt,
    token_type: 'bearer',
    user: {
      id: '00000000-0000-0000-0000-000000000001',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'e2e@example.com',
      app_metadata: { provider: 'google' },
      user_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
}

async function cachePaths(page) {
  return page.evaluate(async () => (await Promise.all(
    (await caches.keys()).map(async (key) => (await (await caches.open(key)).keys())
      .map((request) => new URL(request.url).pathname)),
  )).flat());
}

/**
 * Polls an async check in the page until it is true. page.waitForFunction
 * treats the Promise an async function returns as truthy and passes at once.
 */
async function waitFor(page, check, arg, label) {
  const started = Date.now();
  while (Date.now() - started < CONTENT_TIMEOUT_MS) {
    try {
      if (await page.evaluate(check, arg)) return;
    } catch {
      // A navigation replaced the page mid-check; try again.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const CACHE_KEY = /^debate-lab-v6-[0-9a-f]{12}-(?:shell|runtime|pages)$/;

async function cacheKeys(page) {
  return page.evaluate(async () => caches.keys());
}

async function main() {
  const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8'));
  const en = JSON.parse(await readFile('src/locales/en.json', 'utf8'));
  const es = JSON.parse(await readFile('src/locales/es.json', 'utf8'));
  const { product } = JSON.parse(await readFile('src/config/site.json', 'utf8'));
  const chunk = (key) => `/${manifest[key].file}`;
  const entryPath = chunk('index.html');
  const attackPath = chunk('src/pages/AttackPage.tsx');
  // Precached at install: opened offline after one visit to /app, without visiting them first.
  const precachedPaths = [
    'src/pages/LandingPage.tsx',
    'src/components/layout/AppLayout.tsx',
    'src/pages/HomePage.tsx',
    'src/pages/LibraryPage.tsx',
    'src/pages/HistoryPage.tsx',
    'src/pages/TimerPage.tsx',
    'src/pages/SettingsPage.tsx',
    'src/locales/es.json',
    'src/locales/hu.json',
  ].map(chunk);
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
  });
  let browser;

  try {
    await waitForServer(origin);
    browser = await chromium.launch({ headless: true });
    const createContext = async () => {
      const nextContext = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 1280, height: 800 } });
      await nextContext.addInitScript((session) => {
        localStorage.setItem('debate-auth-production', JSON.stringify(session));
        localStorage.setItem('debate-trainer-onboarding', JSON.stringify({
          state: { hasCompletedOnboarding: true, isTourRunning: false },
          version: 0,
        }));
      }, stubSession());
      return nextContext;
    };
    let context = await createContext();

    const prepare = async (page) => {
      await page.route('**/*', (route) => {
        const url = new URL(route.request().url());
        return url.origin === origin || url.protocol === 'data:' ? route.continue() : route.abort();
      });
    };
    const homeHeading = (page) => page.locator('main h1', { hasText: en.home.heading });

    const upgradePage = await context.newPage();
    await prepare(upgradePage);
    await context.route(`${origin}/sw.js`, (route) => route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      headers: { 'Cache-Control': 'no-store' },
      body: V2_WORKER,
    }));
    await upgradePage.goto(origin, { waitUntil: 'load' });
    await upgradePage.evaluate(async () => navigator.serviceWorker.ready);
    await waitFor(upgradePage, async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return registration?.active?.state === 'activated' &&
        navigator.serviceWorker.controller !== null &&
        (await caches.keys()).includes('debate-lab-v2-shell');
    }, undefined, 'the v2 worker to activate');
    await context.unroute(`${origin}/sw.js`);
    await upgradePage.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    });
    await waitFor(upgradePage, async () =>
      Boolean((await navigator.serviceWorker.getRegistration())?.waiting),
    undefined, 'the new worker to install');
    await upgradePage.close();
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    const activatedPage = await context.newPage();
    await prepare(activatedPage);
    await activatedPage.goto(origin, { waitUntil: 'load' });
    await activatedPage.evaluate(async () => navigator.serviceWorker.ready);
    await waitFor(activatedPage, async () => {
      const keys = await caches.keys();
      return navigator.serviceWorker.controller !== null &&
        keys.some((key) => /^debate-lab-v6-[0-9a-f]{12}-shell$/.test(key)) &&
        !keys.some((key) => key.startsWith('debate-lab-v2'));
    }, undefined, 'the new worker to replace the v2 caches');
    const upgradedKeys = await cacheKeys(activatedPage);
    assert.ok(upgradedKeys.every((key) => CACHE_KEY.test(key)), `unexpected caches after upgrade: ${upgradedKeys}`);
    await activatedPage.close();
    await context.close();
    context = await createContext();

    // One online visit to /app installs the worker; a public page visited after it is kept too.
    const page = await context.newPage();
    await prepare(page);
    await page.goto(`${origin}/app`, { waitUntil: 'load' });
    await homeHeading(page).waitFor({ timeout: CONTENT_TIMEOUT_MS });
    await page.evaluate(async () => navigator.serviceWorker.ready);
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: CONTENT_TIMEOUT_MS });
    await page.goto(`${origin}/terms`, { waitUntil: 'load' });
    await page.locator('main h1', { hasText: en.termsPage.title }).waitFor({ timeout: CONTENT_TIMEOUT_MS });
    await page.goto(`${origin}/app`, { waitUntil: 'load' });
    await homeHeading(page).waitFor({ timeout: CONTENT_TIMEOUT_MS });
    await waitFor(page, async (paths) => {
      const urls = (await Promise.all((await caches.keys()).map(async (key) =>
        (await (await caches.open(key)).keys()).map((request) => new URL(request.url).pathname)
      ))).flat();
      return paths.every((path) => urls.includes(path));
    }, [entryPath, ...precachedPaths, '/app-shell.html', '/terms', '/owl-mark.svg'], 'the precache and the visited Terms page');
    // Installed up front, not picked up by browsing: they sit in this build's shell cache.
    const shellCache = await page.evaluate(async () => {
      const key = (await caches.keys()).find((name) => name.endsWith('-shell'));
      return key ? (await (await caches.open(key)).keys()).map((request) => new URL(request.url).pathname) : [];
    });
    const notPrecached = [entryPath, ...precachedPaths, '/', '/app-shell.html'].filter((path) => !shellCache.includes(path));
    assert.deepEqual(notPrecached, [], 'expected in the install-time precache');

    const firstVisitCache = await cachePaths(page);
    assert.equal(firstVisitCache.includes(attackPath), false, 'unvisited Attack chunk was cached');
    assert.equal(firstVisitCache.some((path) => path.startsWith('/auth/')), false, 'the sign-in callback entered Cache Storage');
    assert.equal(firstVisitCache.includes('/app'), false, 'an app route was stored under its own URL instead of the shell');

    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await homeHeading(page).waitFor({ timeout: CONTENT_TIMEOUT_MS });
    await page.getByRole('status').filter({ hasText: en.offlineIndicator.label }).waitFor({ timeout: CONTENT_TIMEOUT_MS });
    const logo = page.locator('header a[href="/app"] img');
    assert.equal(await logo.getAttribute('src'), '/owl-mark.svg');
    assert.ok(await logo.evaluate((image) => image.naturalWidth > 0), 'offline logo did not load');

    await page.locator('main [data-tour="mode-attack"]').click();
    await page.getByRole('heading', { name: en.routeError.heading }).waitFor({ timeout: CONTENT_TIMEOUT_MS });

    // Each precached page opens offline as a fresh navigation, never visited before.
    for (const [path, title] of [
      ['/app/library', en.libraryPage.title],
      ['/app/history', en.historyPage.title],
      ['/app/settings', en.settings.title],
      ['/app/timer', en.timer.title],
    ]) {
      await page.goto(`${origin}${path}`, { waitUntil: 'domcontentloaded' });
      await page.locator('main h1', { hasText: title }).waitFor({ timeout: CONTENT_TIMEOUT_MS });
    }

    // The timer runs offline.
    const clock = page.getByRole('timer', { name: en.timer.displayLabel });
    const before = await clock.textContent();
    await page.getByRole('button', { name: en.timer.start, exact: true }).click();
    await page.waitForFunction(([name, start]) =>
      document.querySelector(`[role="timer"][aria-label="${name}"]`)?.textContent !== start,
    [en.timer.displayLabel, before], { timeout: CONTENT_TIMEOUT_MS });

    // Switching language offline uses the precached Spanish strings.
    await page.getByRole('button', { name: en.langSwitcher.label }).click();
    await page.getByRole('radiogroup', { name: en.langSwitcher.uiLanguage }).getByRole('radio', { name: 'Español' }).click();
    await page.locator('main h1', { hasText: es.timer.title }).waitFor({ timeout: CONTENT_TIMEOUT_MS });
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'es');

    // Public pages answer only with themselves: Terms was visited, Privacy was not.
    await page.goto(`${origin}/terms`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.locator('#root').getAttribute('data-prerendered'), null);
    await page.locator('main h1', { hasText: es.termsPage.title }).waitFor({ timeout: CONTENT_TIMEOUT_MS });
    await page.goto(`${origin}/privacy`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Offline', exact: true }).waitFor({ timeout: CONTENT_TIMEOUT_MS });
    // The landing page was never visited, but its HTML and code were precached:
    // React takes it over offline instead of replacing it with the error page.
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded' });
    await waitFor(page, () => document.getElementById('root')?.dataset.prerendered === undefined, undefined, 'React to take over the landing page');
    await page.locator('h1', { hasText: es.hero.headline.replace('{{product}}', product) }).waitFor({ timeout: CONTENT_TIMEOUT_MS });
    assert.equal(await page.getByRole('heading', { name: es.routeError.heading }).count(), 0, 'the landing page turned into the error page offline');
    await page.goto(`${origin}/app`, { waitUntil: 'domcontentloaded' });
    await page.locator('main h1', { hasText: es.home.heading }).waitFor({ timeout: CONTENT_TIMEOUT_MS });
    await page.close();

    await context.setOffline(false);
    const prefetchedPage = await context.newPage();
    await prepare(prefetchedPage);
    await prefetchedPage.addInitScript(() => {
      localStorage.setItem('debate-trainer-settings', JSON.stringify({ state: { language: 'en', outputLanguage: 'en', theme: 'system' }, version: 2 }));
    });
    await prefetchedPage.goto(`${origin}/app`, { waitUntil: 'load' });
    await homeHeading(prefetchedPage).waitFor({ timeout: CONTENT_TIMEOUT_MS });
    const attackLink = prefetchedPage.locator('main [data-tour="mode-attack"]');
    await attackLink.hover();
    await waitFor(prefetchedPage, async (path) => {
      const urls = (await Promise.all((await caches.keys()).map(async (key) =>
        (await (await caches.open(key)).keys()).map((request) => new URL(request.url).pathname)
      ))).flat();
      return urls.includes(path);
    }, attackPath, 'the hovered Attack chunk to be cached');
    await prefetchedPage.waitForTimeout(500);
    await context.setOffline(true);
    await attackLink.click();
    await prefetchedPage.getByRole('heading', { name: 'Attack', exact: true }).waitFor({ timeout: CONTENT_TIMEOUT_MS });

    // The sign-in callback always goes to the network and is never stored.
    await context.setOffline(false);
    await prefetchedPage.goto(`${origin}/auth/callback?code=t11-offline-test`, { waitUntil: 'load' });
    await prefetchedPage.waitForTimeout(1_000);
    const finalCache = await cachePaths(prefetchedPage);
    assert.equal(finalCache.some((path) => path.startsWith('/auth/')), false, 'the sign-in callback entered Cache Storage');
    assert.deepEqual(
      finalCache.filter((path) => /^\/(?:auth|rest|functions|storage)\/v1/.test(path)),
      [],
      'private API response entered Cache Storage',
    );
    console.log(JSON.stringify({
      upgradeActivated: true,
      precachedRoutesOffline: ['/', '/app', '/app/library', '/app/history', '/app/settings', '/app/timer'],
      authCallbackNeverCached: true,
      timerRunsOffline: true,
      languageSwitchOffline: true,
      publicPagesKeepTheirOwnHtml: true,
      offlineIndicator: true,
      unvisitedRouteShowsRecovery: true,
      intentPrefetchedRouteOffline: true,
      offlineLogo: true,
      apiCacheEntries: 0,
    }));
  } finally {
    await browser?.close();
    await stopServer(server);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
