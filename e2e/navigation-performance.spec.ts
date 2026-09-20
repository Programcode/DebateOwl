import { expect, test, type Page } from '@playwright/test';
import { setLocale, stubSupabaseSession } from './helpers/auth';

declare global {
  interface Window {
    __baselineAppLayout?: Element | null;
    __baselineShell?: Element | null;
    __baselineClickAt?: number | null;
    __genericLoaderObserver?: MutationObserver;
    __genericLoaderSeen?: boolean;
  }
}

type ContentMarker = {
  selector: string;
  text?: string;
};

const publicRoutes = [
  ['/', 'h1'],
  ['/login', 'button'],
] as const;

const privateRoutes = [
  ['/app', { selector: 'main h1', text: 'DebateLab' }],
  ['/app/generate', { selector: 'main h1', text: 'Generate' }],
  ['/app/attack', { selector: 'main h1', text: 'Attack' }],
  ['/app/flowchart', { selector: 'main h3', text: 'Argument Flowchart' }],
  ['/app/history', { selector: 'main h1', text: 'History' }],
  ['/app/admin', { selector: 'main h3', text: 'Access Denied' }],
] as const;

const attackContent: ContentMarker = { selector: 'main h1', text: 'Attack' };
const attackChunk = /\/src\/pages\/AttackPage\.tsx(?:[?#]|$)/i;
const INTENT_OBSERVATION_MS = 250;

async function waitForContent(page: Page, marker: string | ContentMarker) {
  const locator = typeof marker === 'string'
    ? page.locator(marker).first()
    : page.locator(marker.selector).filter({ hasText: marker.text ?? '' }).first();
  await expect(locator).toBeVisible({ timeout: 15_000 });
}

async function openAppNav(page: Page, label: string) {
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: new RegExp(`^${label}`) }).click();
    return;
  }

  if (['Flowchart', 'History'].includes(label)) {
    await page.locator('summary[aria-label="More"]').click();
    await page.locator('details').getByRole('link', { name: label }).click();
    return;
  }

  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: label }).click();
}

test('cold routes expose real content on both browser profiles', async ({ page }) => {
  await setLocale(page, 'en');
  for (const [path, selector] of publicRoutes) {
    await page.goto(path, { waitUntil: 'domcontentloaded' });
    await waitForContent(page, selector);
  }

  const appPage = await page.context().newPage();
  await setLocale(appPage, 'en');
  await stubSupabaseSession(appPage);
  await appPage.route('**/functions/v1/admin*', (route) => route.fulfill({
    status: 403,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Admin access required' }),
  }));
  for (const [path, selector] of privateRoutes) {
    await appPage.goto(path, { waitUntil: 'domcontentloaded' });
    await waitForContent(appPage, selector);
  }
  await appPage.close();
});

test('a delayed destination chunk exposes the route fallback without replacing the shell', async ({ page }) => {
  await setLocale(page, 'en');
  await stubSupabaseSession(page);
  await page.goto('/app/generate', { waitUntil: 'domcontentloaded' });
  await waitForContent(page, { selector: 'main h1', text: 'Generate' });

  await page.evaluate(() => {
    window.__baselineAppLayout = document.querySelector('header')?.parentElement;
    window.__baselineShell = document.querySelector('header');
    window.__baselineClickAt = null;
    document.addEventListener('click', (event) => {
      const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (anchor && new URL(anchor.href, window.location.href).pathname === '/app/attack') {
        window.__baselineClickAt = performance.now();
      }
    }, true);
  });
  let destinationRequested = false;
  await page.route('**/src/pages/AttackPage.tsx*', async (route) => {
    destinationRequested = true;
    await new Promise((resolve) => setTimeout(resolve, 750));
    await route.continue();
  });

  await startGenericLoaderObservation(page);
  await openAppNav(page, 'Attack');
  await expect.poll(() => destinationRequested).toBe(true);
  const pendingStatus = page.locator('main').getByRole('status', { name: /Attack/i });
  await expect(pendingStatus).toHaveCount(1);
  await expect(pendingStatus).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.motion-loading-shell')).toHaveCount(0);
  expect(await page.evaluate(() => ({
    appLayout: document.querySelector('header')?.parentElement === window.__baselineAppLayout,
    header: document.querySelector('header') === window.__baselineShell,
  }))).toEqual({ appLayout: true, header: true });
  await waitForContent(page, attackContent);
  expect(await stopGenericLoaderObservation(page)).toBe(false);
  expect(await page.evaluate(() => ({
    appLayout: document.querySelector('header')?.parentElement === window.__baselineAppLayout,
    header: document.querySelector('header') === window.__baselineShell,
  }))).toEqual({ appLayout: true, header: true });

  const transitionMetrics = await page.evaluate(() => ({
    clickTime: window.__baselineClickAt ?? null,
    route: location.pathname,
    shellDomIdentitySurvived: document.querySelector('header') === window.__baselineShell,
    allRequestCount: performance.getEntriesByType('resource').length,
    measuredRequestCount: performance.getEntriesByType('resource')
      .filter((entry) => window.__baselineClickAt !== null && entry.startTime >= window.__baselineClickAt).length,
    sourceRequestCount: performance.getEntriesByType('resource')
      .filter((entry) => window.__baselineClickAt !== null && entry.startTime < window.__baselineClickAt).length,
    allLongTaskCount: performance.getEntriesByType('longtask').length,
    measuredLongTaskCount: performance.getEntriesByType('longtask')
      .filter((entry) => window.__baselineClickAt !== null && entry.startTime >= window.__baselineClickAt).length,
  }));
  expect(transitionMetrics.clickTime).not.toBeNull();
  expect(transitionMetrics.route).toBe('/app/attack');
  expect(transitionMetrics.shellDomIdentitySurvived).toBe(true);
  expect(transitionMetrics.sourceRequestCount).toBeGreaterThan(0);
  expect(transitionMetrics.measuredRequestCount).toBeGreaterThan(0);
  expect(transitionMetrics.measuredRequestCount).toBeLessThan(transitionMetrics.allRequestCount);
  expect(transitionMetrics.measuredLongTaskCount).toBeLessThanOrEqual(transitionMetrics.allLongTaskCount);
});

async function gotoGenerate(page: Page) {
  await setLocale(page, 'en');
  await stubSupabaseSession(page);
  await page.goto('/app/generate', { waitUntil: 'domcontentloaded' });
  await waitForContent(page, { selector: 'main h1', text: 'Generate' });
}

async function attackLink(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    await page.getByRole('button', { name: 'Open menu' }).click();
    return page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: /^Attack/ });
  }
  return page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Attack' });
}

async function startGenericLoaderObservation(page: Page) {
  await page.evaluate(() => {
    window.__genericLoaderSeen = document.querySelector('.motion-loading-shell') !== null;
    const observer = new MutationObserver(() => {
      if (document.querySelector('.motion-loading-shell')) window.__genericLoaderSeen = true;
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.__genericLoaderObserver = observer;
  });
}

async function stopGenericLoaderObservation(page: Page) {
  return page.evaluate(() => {
    window.__genericLoaderObserver?.disconnect();
    const seen = Boolean(window.__genericLoaderSeen || document.querySelector('.motion-loading-shell'));
    delete window.__genericLoaderObserver;
    delete window.__genericLoaderSeen;
    return seen;
  });
}

async function setConnection(page: Page, connection: { saveData?: boolean; effectiveType?: string }) {
  await page.addInitScript((value) => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      value,
    });
  }, connection);
}

function countAttackRequests(page: Page) {
  let count = 0;
  page.on('request', (request) => {
    if (attackChunk.test(request.url())) count += 1;
  });
  return () => count;
}

async function signalAllowedIntent(page: Page, link: Awaited<ReturnType<typeof attackLink>>) {
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    await link.dispatchEvent('pointerdown', { pointerType: 'touch' });
    return;
  }
  await link.hover();
}

test('hover intent fetches one destination chunk before click and keeps navigation in-document', async ({ page }) => {
  const requestCount = countAttackRequests(page);
  await gotoGenerate(page);
  const link = await attackLink(page);
  expect(requestCount()).toBe(0);

  await link.hover();
  await page.waitForTimeout(INTENT_OBSERVATION_MS);
  expect(requestCount()).toBe(1);

  const navigationEntriesBeforeClick = await page.evaluate(() => performance.getEntriesByType('navigation').length);
  await startGenericLoaderObservation(page);
  await link.click();
  await waitForContent(page, attackContent);
  expect(await stopGenericLoaderObservation(page)).toBe(false);
  expect(requestCount()).toBe(1);
  expect(await page.evaluate(() => performance.getEntriesByType('navigation').length)).toBe(navigationEntriesBeforeClick);
  await expect(page.locator('.motion-loading-shell')).toHaveCount(0);
});

test('keyboard focus fetches one destination chunk before click', async ({ page }) => {
  const requestCount = countAttackRequests(page);
  await gotoGenerate(page);
  const link = await attackLink(page);
  expect(requestCount()).toBe(0);

  await link.focus();
  await expect(link).toBeFocused();
  await page.waitForTimeout(INTENT_OBSERVATION_MS);
  expect(requestCount()).toBe(1);

  await startGenericLoaderObservation(page);
  await link.click();
  await waitForContent(page, attackContent);
  expect(await stopGenericLoaderObservation(page)).toBe(false);
  expect(requestCount()).toBe(1);
  await expect(page.locator('.motion-loading-shell')).toHaveCount(0);
});

test('touch intent fetches one destination chunk before click', async ({ page }) => {
  const requestCount = countAttackRequests(page);
  await gotoGenerate(page);
  const link = await attackLink(page);
  expect(requestCount()).toBe(0);

  await link.dispatchEvent('pointerdown', { pointerType: 'touch' });
  await page.waitForTimeout(INTENT_OBSERVATION_MS);
  expect(requestCount()).toBe(1);

  await startGenericLoaderObservation(page);
  await link.click();
  await waitForContent(page, attackContent);
  expect(await stopGenericLoaderObservation(page)).toBe(false);
  expect(requestCount()).toBe(1);
  await expect(page.locator('.motion-loading-shell')).toHaveCount(0);
});

for (const [label, connection] of [
  ['Save-Data', { saveData: true }],
  ['slow-2g connection', { effectiveType: 'slow-2g' }],
  ['2g connection', { effectiveType: '2g' }],
] as const) {
  test(`${label} skips speculative route requests for the same intent`, async ({ page }) => {
    await setConnection(page, connection);
    const requestCount = countAttackRequests(page);
    await gotoGenerate(page);
    const link = await attackLink(page);
    expect(requestCount()).toBe(0);

    await signalAllowedIntent(page, link);
    await page.waitForTimeout(INTENT_OBSERVATION_MS);
    expect(requestCount()).toBe(0);

    await link.click();
    await waitForContent(page, attackContent);
    expect(requestCount()).toBe(1);
  });
}
