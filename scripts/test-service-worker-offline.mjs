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

async function main() {
  const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8'));
  const entryPath = `/${Object.values(manifest).find((entry) => entry.isEntry).file}`;
  const homePath = `/${manifest['src/pages/HomePage.tsx'].file}`;
  const attackPath = `/${manifest['src/pages/AttackPage.tsx'].file}`;
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

    const upgradePage = await context.newPage();
    await prepare(upgradePage);
    await context.route(`${origin}/sw.js`, (route) => route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      headers: { 'Cache-Control': 'no-store' },
      body: V2_WORKER,
    }));
    await upgradePage.goto(origin, { waitUntil: 'networkidle' });
    await upgradePage.evaluate(async () => navigator.serviceWorker.ready);
    await upgradePage.waitForFunction(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return registration?.active?.state === 'activated' &&
        navigator.serviceWorker.controller !== null &&
        (await caches.keys()).includes('debate-lab-v2-shell');
    });
    await context.unroute(`${origin}/sw.js`);
    await upgradePage.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      await registration?.update();
    });
    await upgradePage.waitForFunction(async () =>
      Boolean((await navigator.serviceWorker.getRegistration())?.waiting),
    undefined, { timeout: CONTENT_TIMEOUT_MS });
    await upgradePage.close();
    await new Promise((resolve) => setTimeout(resolve, 1_000));

    const activatedPage = await context.newPage();
    await prepare(activatedPage);
    await activatedPage.goto(origin, { waitUntil: 'networkidle' });
    await activatedPage.evaluate(async () => navigator.serviceWorker.ready);
    await activatedPage.waitForFunction(async () => {
      const keys = await caches.keys();
      return navigator.serviceWorker.controller !== null &&
        keys.includes('debate-lab-v3-shell') &&
        !keys.some((key) => key.startsWith('debate-lab-v2'));
    }, undefined, { timeout: CONTENT_TIMEOUT_MS });
    await activatedPage.close();
    await context.close();
    context = await createContext();

    const page = await context.newPage();
    await prepare(page);
    await page.goto(`${origin}/app`, { waitUntil: 'networkidle' });
    await page.locator('main h1', { hasText: 'DebateLab' }).waitFor({ timeout: CONTENT_TIMEOUT_MS });
    await page.evaluate(async () => navigator.serviceWorker.ready);
    await page.waitForFunction(async (paths) => {
      const urls = (await Promise.all((await caches.keys()).map(async (key) =>
        (await (await caches.open(key)).keys()).map((request) => new URL(request.url).pathname)
      ))).flat();
      return paths.every((path) => urls.includes(path));
    }, [entryPath, homePath, '/favicon-72.png'], { timeout: CONTENT_TIMEOUT_MS });

    const firstVisitCache = await cachePaths(page);
    assert.equal(firstVisitCache.includes(attackPath), false, 'unvisited Attack chunk was cached');
    await context.setOffline(true);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('main h1', { hasText: 'DebateLab' }).waitFor({ timeout: CONTENT_TIMEOUT_MS });
    const logo = page.locator('header a[href="/app"] img');
    assert.equal(await logo.getAttribute('src'), '/favicon-72.png');
    assert.ok(await logo.evaluate((image) => image.naturalWidth > 0), 'offline logo did not load');

    await page.locator('main [data-tour="mode-attack"]').click();
    await page.getByRole('heading', { name: 'Unable to load this page' }).waitFor({ timeout: CONTENT_TIMEOUT_MS });

    await context.setOffline(false);
    const prefetchedPage = await context.newPage();
    await prepare(prefetchedPage);
    await prefetchedPage.goto(`${origin}/app`, { waitUntil: 'networkidle' });
    await prefetchedPage.locator('main h1', { hasText: 'DebateLab' }).waitFor({ timeout: CONTENT_TIMEOUT_MS });
    const attackLink = prefetchedPage.locator('main [data-tour="mode-attack"]');
    await attackLink.hover();
    await prefetchedPage.waitForFunction(async (path) => {
      const urls = (await Promise.all((await caches.keys()).map(async (key) =>
        (await (await caches.open(key)).keys()).map((request) => new URL(request.url).pathname)
      ))).flat();
      return urls.includes(path);
    }, attackPath, { timeout: CONTENT_TIMEOUT_MS });
    await prefetchedPage.waitForTimeout(500);
    await context.setOffline(true);
    await attackLink.click();
    await prefetchedPage.getByRole('heading', { name: 'Attack', exact: true }).waitFor({ timeout: CONTENT_TIMEOUT_MS });

    const finalCache = await cachePaths(prefetchedPage);
    assert.deepEqual(
      finalCache.filter((path) => /^\/(?:auth|rest|functions|storage)\/v1/.test(path)),
      [],
      'private API response entered Cache Storage',
    );
    console.log(JSON.stringify({
      upgradeActivated: true,
      firstVisitedRouteOffline: true,
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
