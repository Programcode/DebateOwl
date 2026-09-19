import { expect, test, type Page } from '@playwright/test';
import { setLocale, stubSupabaseSession } from './helpers/auth';

declare global {
  interface Window {
    __baselineShell?: Element | null;
    __baselineClickAt?: number | null;
  }
}

const publicRoutes = [
  ['/', 'h1'],
  ['/login', 'button'],
] as const;

const privateRoutes = [
  ['/app', 'main h1'],
  ['/app/generate', 'main h1'],
  ['/app/attack', 'main h1'],
  ['/app/flowchart', 'main h3'],
  ['/app/history', 'main h1'],
  ['/app/admin', 'main h1, main h2, main h3'],
] as const;

async function waitForContent(page: Page, selector: string) {
  await expect(page.locator(selector).first()).toBeVisible({ timeout: 15_000 });
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
  await waitForContent(page, 'main h1');

  await page.evaluate(() => {
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

  await openAppNav(page, 'Attack');
  await expect.poll(() => destinationRequested).toBe(true);
  await expect(page.locator('.motion-loading-shell')).toBeVisible();
  await waitForContent(page, 'main h1');
  expect(await page.evaluate(() => document.querySelector('header') === window.__baselineShell)).toBe(true);

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
