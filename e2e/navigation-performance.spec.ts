import { expect, test, type Page } from '@playwright/test';
import { setLocale, stubSupabaseSession } from './helpers/auth';

declare global {
  interface Window {
    __baselineAppLayout?: Element | null;
    __baselineShell?: Element | null;
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
  ['/app', { selector: 'main h1', text: 'What are you working on?' }],
  ['/app/generate', { selector: 'main h1', text: 'Generate' }],
  ['/app/attack', { selector: 'main h1', text: 'Attack' }],
  ['/app/flowchart', { selector: 'main h1', text: 'Argument Flowchart' }],
  ['/app/history', { selector: 'main h1', text: 'History' }],
  ['/app/admin', { selector: 'main h1', text: 'Access Denied' }],
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

async function skipOnboarding(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('debate-trainer-onboarding', JSON.stringify({
      state: { hasCompletedOnboarding: true, isTourRunning: false },
      version: 0,
    }));
  });
}

// Tools open from the Tools page; the header carries only Tools, Current debate, Library and History.
function homeToolLink(page: Page, tool: string) {
  return page.locator(`main [data-tour="mode-${tool}"]`);
}

async function openHome(page: Page) {
  const width = page.viewportSize()?.width ?? 1280;
  if (width < 768) {
    await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: 'Tools', exact: true }).click();
  } else if (width < 1024) {
    await page.getByRole('button', { name: 'Open menu' }).click();
    await page.getByRole('navigation', { name: 'Mobile navigation' }).getByRole('link', { name: /^Tools/ }).click();
  } else {
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: 'Tools' }).click();
  }
  await expect(page).toHaveURL(/\/app$/);
}

test('cold routes expose real content on both browser profiles', async ({ page }) => {
  test.setTimeout(60_000);
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

test('workspaces stay unavailable without a collaboration endpoint', async ({ page }) => {
  await setLocale(page, 'en');
  await stubSupabaseSession(page);
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await waitForContent(page, { selector: 'main h1', text: 'What are you working on?' });

  await expect(page.locator('a[href="/app/workspaces"]')).toHaveCount(0);
  await page.goto('/app/workspaces', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '404' })).toBeVisible();
});

test('a delayed public route keeps the main landmark', async ({ page }) => {
  await setLocale(page, 'en');
  let releaseTerms: (() => void) | undefined;
  const termsReleased = new Promise<void>((resolve) => { releaseTerms = resolve; });
  await page.route('**/src/pages/TermsPage.tsx*', async (route) => {
    await termsReleased;
    await route.continue();
  });

  await page.goto('/terms', { waitUntil: 'domcontentloaded' });
  const fallback = page.getByRole('main').filter({ has: page.locator('[data-route-skeleton-shape]') });
  await expect(fallback).toHaveAttribute('data-route-skeleton', 'public');
  releaseTerms?.();
  await expect(page.getByRole('main').getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
});

test('a delayed destination chunk exposes the route fallback without replacing the shell', async ({ page }) => {
  await setLocale(page, 'en');
  await stubSupabaseSession(page);
  await skipOnboarding(page);
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await waitForContent(page, { selector: 'main h1', text: 'What are you working on?' });

  await page.evaluate(() => {
    window.__baselineAppLayout = document.querySelector('header')?.parentElement;
    window.__baselineShell = document.querySelector('header');
  });
  let destinationRequested = false;
  await page.route('**/src/pages/AttackPage.tsx*', async (route) => {
    destinationRequested = true;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });

  await startGenericLoaderObservation(page);
  await homeToolLink(page, 'attack').click();
  await expect.poll(() => destinationRequested).toBe(true);
  const pendingStatus = page.locator('main').getByRole('status', { name: 'Opening Attack', exact: true });
  await expect(pendingStatus).toHaveCount(1);
  await expect(pendingStatus).toHaveAttribute('aria-live', 'polite');
  await expect(pendingStatus).not.toHaveAttribute('aria-busy');
  const pendingSkeleton = page.locator('[data-route-skeleton="tool-form"][aria-busy="true"]');
  await expect(pendingSkeleton).toHaveCount(1);
  await expect(pendingSkeleton).toBeVisible();
  expect(await pendingStatus.evaluate((status) => status.nextElementSibling?.matches('[data-route-skeleton="tool-form"][aria-busy="true"]'))).toBe(true);
  await expect(page.locator('[data-route-skeleton-shape]').first()).toBeVisible();
  const pendingGeometry = await pendingSkeleton.evaluate((region) => {
    const shape = region.querySelector('[data-route-skeleton-shape]');
    const regionRect = region.getBoundingClientRect();
    const shapeRect = shape?.getBoundingClientRect();
    return {
      regionHeight: regionRect.height,
      shapeWidth: shapeRect?.width ?? 0,
      shapeHeight: shapeRect?.height ?? 0,
      shapeBackground: shape ? getComputedStyle(shape).backgroundColor : '',
    };
  });
  expect(pendingGeometry.regionHeight).toBeGreaterThan(0);
  expect(pendingGeometry.shapeWidth).toBeGreaterThan(0);
  expect(pendingGeometry.shapeHeight).toBeGreaterThan(0);
  expect(pendingGeometry.shapeBackground).not.toBe('rgba(0, 0, 0, 0)');
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
});

test('a failed route chunk recovers after the offered reload', async ({ page }) => {
  await setLocale(page, 'en');
  await stubSupabaseSession(page);
  let attempts = 0;
  await page.route('**/src/pages/AttackPage.tsx*', async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({ status: 503, contentType: 'text/plain', body: 'chunk unavailable' });
      return;
    }
    await route.continue();
  });

  await skipOnboarding(page);
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await waitForContent(page, { selector: 'main h1', text: 'What are you working on?' });
  await homeToolLink(page, 'attack').click();

  await expect(page.getByRole('heading', { name: 'Unable to load this page' })).toBeVisible();
  await page.getByRole('button', { name: 'Reload' }).click();
  await expect.poll(() => attempts).toBe(2);
  await waitForContent(page, attackContent);
  await expect(page.getByRole('banner')).toBeVisible();
});

async function gotoHome(page: Page) {
  await setLocale(page, 'en');
  await stubSupabaseSession(page);
  await skipOnboarding(page);
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await waitForContent(page, { selector: 'main h1', text: 'What are you working on?' });
}

async function attackLink(page: Page) {
  const link = homeToolLink(page, 'attack');
  await expect(link).toBeVisible();
  return link;
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

test('hover intent is limited to fine pointers and click stays in-document', async ({ page }) => {
  const requestCount = countAttackRequests(page);
  await gotoHome(page);
  const link = await attackLink(page);
  expect(requestCount()).toBe(0);

  await link.hover();
  const supportsHover = await page.evaluate(() => window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  if (supportsHover) {
    await expect.poll(requestCount).toBe(1);
  } else {
    // eslint-disable-next-line no-restricted-properties -- observation window: no prefetch may start without hover intent.
    await page.waitForTimeout(INTENT_OBSERVATION_MS);
    expect(requestCount()).toBe(0);
  }

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
  await gotoHome(page);
  const link = await attackLink(page);
  expect(requestCount()).toBe(0);

  await link.focus();
  await expect(link).toBeFocused();
  await expect.poll(requestCount).toBe(1);

  await startGenericLoaderObservation(page);
  await link.click();
  await waitForContent(page, attackContent);
  expect(await stopGenericLoaderObservation(page)).toBe(false);
  expect(requestCount()).toBe(1);
  await expect(page.locator('.motion-loading-shell')).toHaveCount(0);
});

test('touch intent fetches one destination chunk before click', async ({ page }) => {
  const requestCount = countAttackRequests(page);
  await gotoHome(page);
  const link = await attackLink(page);
  expect(requestCount()).toBe(0);

  await link.dispatchEvent('pointerdown', { pointerType: 'touch' });
  await expect.poll(requestCount).toBe(1);

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
    await gotoHome(page);
    const link = await attackLink(page);
    expect(requestCount()).toBe(0);

    await signalAllowedIntent(page, link);
    // eslint-disable-next-line no-restricted-properties -- observation window: this connection must not start a speculative request.
    await page.waitForTimeout(INTENT_OBSERVATION_MS);
    expect(requestCount()).toBe(0);

    await link.click();
    await waitForContent(page, attackContent);
    expect(requestCount()).toBe(1);
  });
}

test('subscription reads stay cached across sibling tool routes', async ({ page }) => {
  await setLocale(page, 'en');
  await stubSupabaseSession(page);
  await page.addInitScript(() => {
    window.localStorage.setItem('debate-trainer-onboarding', JSON.stringify({
      state: { hasCompletedOnboarding: true, isTourRunning: false },
      version: 0,
    }));
  });

  const subscriptionRequests: string[] = [];
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      await route.continue();
      return;
    }
    if (url.pathname.endsWith('/auth/v1/user')) {
      await route.fulfill({ json: { id: '00000000-0000-0000-0000-000000000001', email: 'e2e@example.com' } });
      return;
    }
    if (url.pathname.endsWith('/functions/v1/announcements')) {
      await route.fulfill({ json: { announcements: [] } });
      return;
    }
    if (url.pathname.includes('/rest/v1/')) {
      const select = url.searchParams.get('select') ?? '';
      if (url.pathname.endsWith('/user_settings') && select.includes('subscription_tier')) {
        subscriptionRequests.push('user_settings');
      } else if (url.pathname.endsWith('/subscriptions')) {
        subscriptionRequests.push('subscriptions');
      } else if (url.pathname.endsWith('/ai_requests')) {
        subscriptionRequests.push('ai_requests');
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '*/0' },
        body: '[]',
      });
      return;
    }
    await route.abort('blockedbyclient');
  });

  await page.goto('/app/generate');
  await waitForContent(page, { selector: 'main h1', text: 'Generate' });
  await expect.poll(() => subscriptionRequests.filter((name) => name === 'ai_requests').length).toBe(1);

  await openHome(page);
  await homeToolLink(page, 'attack').click();
  await waitForContent(page, attackContent);
  // eslint-disable-next-line no-restricted-properties -- observation window: no extra subscription request may follow.
  await page.waitForTimeout(100);

  expect(subscriptionRequests).toEqual(['user_settings', 'ai_requests']);
});
