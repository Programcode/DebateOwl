import { test, expect, type Page } from '@playwright/test';
import { setLocale, stubSupabaseSession } from './helpers/auth';

test.beforeEach(async ({ page }) => {
  await setLocale(page, 'en');
  await stubSupabaseSession(page);
  await page.addInitScript(() => {
    window.localStorage.setItem('debate-trainer-onboarding', JSON.stringify({
      state: { hasCompletedOnboarding: true, isTourRunning: false },
      version: 0,
    }));
  });
});

test('home groups the eight main tools and keeps utility routes visible', async ({ page }) => {
  await page.goto('/app', { waitUntil: 'domcontentloaded' });

  const main = page.locator('main');
  await expect(main.getByRole('heading', { name: 'What are you working on?', level: 1 })).toBeVisible({ timeout: 15_000 });
  await expect(main.getByRole('heading', { name: 'Prepare' })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Practice' })).toBeVisible();
  await expect(main.getByRole('heading', { name: 'Utilities' })).toBeVisible();
  await expect(page.getByText('Choose a mode to start.')).toHaveCount(0);

  for (const href of ['/app/generate', '/app/brainstorm', '/app/factoids', '/app/flowchart', '/app/attack', '/app/ask', '/app/crossfire', '/app/sparring']) {
    await expect(page.locator('main').locator(`a[href="${href}"]`)).toBeVisible();
  }
  for (const href of ['/app/library', '/app/timer', '/app/history']) {
    await expect(page.locator('main').locator(`a[href="${href}"]`)).toBeVisible();
  }
});

test('onboarding follows visible home targets when secondary navigation is closed', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('debate-trainer-onboarding', JSON.stringify({
      state: { hasCompletedOnboarding: false, isTourRunning: false },
      version: 0,
    }));
  });
  await page.goto('/app', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('.react-joyride__tooltip')).toBeVisible({ timeout: 15_000 });

  // Current Debate first, then Library and one Prepare tool, all on Home.
  const tourTargets = ['current-debate', 'mode-library', 'mode-generate'];
  for (const [index, key] of tourTargets.entries()) {
    await expect(page.locator(`[data-tour="${key}"]`)).toBeVisible();
    const nextButton = page.locator('[data-test-id="button-primary"]');
    await expect(nextButton).toHaveAccessibleName(new RegExp(`Step ${index + 1} of 4`));
    await nextButton.click();
  }

  await page.locator('[data-test-id="button-primary"]').click();
  await expect(page.locator('.react-joyride__tooltip')).toHaveCount(0);
});

test('onboarding keeps its original start schedule after a delayed lazy chunk', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('debate-trainer-onboarding', JSON.stringify({
      state: { hasCompletedOnboarding: false, isTourRunning: false },
      version: 0,
    }));
  });
  await page.route('**/src/components/features/onboarding/OnboardingTour.tsx*', async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    const body = source.replace(
      /const\s+deadline\s*=\s*startedAt\s*\+\s*autoStartDelay;/,
      'window.localStorage.setItem("__onboarding-auto-start-delay", String(autoStartDelay));\n        const deadline = startedAt + autoStartDelay;',
    );
    if (body === source) throw new Error('Unable to instrument the onboarding auto-start delay');
    await new Promise((resolve) => setTimeout(resolve, 750));
    await route.fulfill({ response, body });
  });
  await page.route('**/node_modules/.vite/deps/react-joyride.js*', async (route) => {
    const response = await route.fetch();
    const body = await response.body();
    await route.fulfill({ response, body });
  });

  await page.goto('/app', { waitUntil: 'domcontentloaded' });

  await expect.poll(
    () => page.evaluate(() => Number(window.localStorage.getItem('__onboarding-auto-start-delay') ?? -1)),
    { timeout: 15_000 },
  ).toBe(0);
  await expect(page.locator('.react-joyride__tooltip')).toBeVisible({ timeout: 15_000 });
});

test('onboarding stays closed on a protected tool and starts when it reaches home', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(() => {
    window.localStorage.setItem('debate-trainer-onboarding', JSON.stringify({
      state: { hasCompletedOnboarding: false, isTourRunning: false },
      version: 0,
    }));
  });
  await page.goto('/app/generate', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Your case will appear here' })).toBeVisible({ timeout: 15_000 });
  // Advance past the tour's 500ms deadline while still on the tool. The tour
  // now starts when its Home target exists, rather than after a fixed delay.
  await page.clock.runFor(1_000);
  await expect(page.locator('.react-joyride__tooltip')).toHaveCount(0);

  await page.locator('header a[href="/app"]').first().click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator('[data-tour="current-debate"]')).toBeVisible();
  await expect(page.locator('.react-joyride__tooltip')).toBeVisible({ timeout: 15_000 });
});

test('header keeps the brand and controls inside a 320px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Prepare' })).toBeVisible({ timeout: 15_000 });

  // A phone keeps the logo, language, and Current debate row. Settings is a tab, not a menu button.
  const languageControl = page.getByRole('button', { name: 'Language' });
  const debateControl = page.getByTestId('current-debate-mobile');
  const tabBar = page.getByRole('navigation', { name: 'Mobile navigation' });
  const controls = [languageControl, debateControl];

  await expect(page.getByAltText('DebateOwl logo')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden();
  await expect(tabBar).toBeVisible();
  for (const control of controls) await expect(control).toBeVisible();
  for (const label of ['Tools', 'Current debate', 'Library', 'Settings']) {
    await expect(tabBar.getByRole('link', { name: label, exact: true })).toBeVisible();
  }

  const boxes = await Promise.all(controls.map((control) => control.boundingBox()));
  expect(boxes.every((box) => box && box.x >= 0 && box.x + box.width <= 320)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test('desktop header fits without internal or document overflow at supported widths', async ({ page }) => {
  for (const width of [1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Prepare' })).toBeVisible({ timeout: 15_000 });

    const navigation = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(navigation).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden();
    expect(await navigation.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('phone tab bar holds Tools, Current debate, Library, and Settings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Prepare' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeHidden();

  const tabBar = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(tabBar).toBeVisible();
  const hrefs = await tabBar.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(hrefs).toEqual(['/app', '/app/debate', '/app/library', '/app/settings']);
  const widths = await tabBar.getByRole('link').evaluateAll((links) => links.map((link) => link.getBoundingClientRect().width));
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(2);

  await tabBar.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page).toHaveURL(/\/app\/library$/);
  await expect(tabBar.getByRole('link', { name: 'Library', exact: true })).toHaveAttribute('aria-current', 'page');

  // The page can scroll its end clear of the bar, including the footer.
  await page.goto('/app/settings', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible({ timeout: 15_000 });
  const terms = page.getByRole('contentinfo').getByRole('link', { name: 'Terms' });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(terms).toBeVisible();
  const [termsBox, tabBox] = await Promise.all([terms.boundingBox(), tabBar.boundingBox()]);
  expect(termsBox).not.toBeNull();
  expect(tabBox).not.toBeNull();
  expect(termsBox!.y + termsBox!.height).toBeLessThanOrEqual(tabBox!.y + 1);
});

async function paintViewport(page: Page, next: { height: number; offsetTop: number; scale: number }) {
  await page.evaluate((value) => {
    const viewport = window.visualViewport;
    if (!viewport) throw new Error('visualViewport is missing');
    for (const key of ['height', 'offsetTop', 'scale'] as const) {
      Object.defineProperty(viewport, key, { configurable: true, get: () => value[key] });
    }
    viewport.dispatchEvent(new Event('resize'));
  }, next);
}

test('phone tab bar hides for a keyboard and returns, and ignores pinch-zoom', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app/ask', { waitUntil: 'domcontentloaded' });
  const field = page.getByRole('textbox', { name: 'Message to your debate coach' });
  const tabBar = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(field).toBeVisible({ timeout: 15_000 });
  await expect(tabBar).toBeVisible();

  await field.focus();
  await paintViewport(page, { height: 380, offsetTop: 0, scale: 1.5 });
  await expect(tabBar).toBeVisible();

  await paintViewport(page, { height: 380, offsetTop: 0, scale: 1 });
  await expect(tabBar).toBeHidden();
  const hidden = await page.evaluate(() => ({
    reserve: document.documentElement.style.getPropertyValue('--phone-tab-reserve').trim(),
    keyboard: document.documentElement.style.getPropertyValue('--native-keyboard-height').trim(),
  }));
  expect(hidden.reserve).toBe('0px');
  expect(Number.parseFloat(hidden.keyboard)).toBeGreaterThan(120);

  await paintViewport(page, { height: 844, offsetTop: 0, scale: 1 });
  await expect(tabBar).toBeVisible();
  const shown = await page.evaluate(() => document.documentElement.style.getPropertyValue('--phone-tab-reserve').trim());
  expect(Number.parseFloat(shown)).toBeGreaterThan(0);
});

test('Ask composer stays above the tab bar while an announcement is up', async ({ page }) => {
  await page.route('**/functions/v1/announcements*', (route) => route.fulfill({
    json: {
      announcements: [{
        id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        title: 'Scheduled maintenance',
        body: 'DebateLab will be unavailable for ten minutes.',
        starts_at: '2026-08-31T12:00:00.000Z',
        expires_at: null,
        created_at: '2026-08-31T11:00:00.000Z',
      }],
    },
  }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app/ask', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Scheduled maintenance' })).toBeVisible({ timeout: 15_000 });
  const send = page.getByRole('button', { name: 'Send' });
  const tabBar = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(send).toBeVisible();
  await expect(tabBar).toBeVisible();
  const [sendBox, tabBox, tops] = await Promise.all([
    send.boundingBox(),
    tabBar.boundingBox(),
    page.evaluate(() => ({
      main: document.documentElement.style.getPropertyValue('--app-main-top').trim(),
      header: document.documentElement.style.getPropertyValue('--app-header-bottom').trim(),
    })),
  ]);
  expect(sendBox).not.toBeNull();
  expect(tabBox).not.toBeNull();
  expect(sendBox!.y + sendBox!.height).toBeLessThanOrEqual(tabBox!.y + 1);
  expect(Number.parseFloat(tops.main)).toBeGreaterThan(Number.parseFloat(tops.header));
});

test('a toast at 700px sits above the tab bar', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 800 });
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Prepare' })).toBeVisible({ timeout: 15_000 });
  const tabBar = page.getByRole('navigation', { name: 'Mobile navigation' });
  await expect(tabBar).toBeVisible();

  const toasted = await page.evaluate(async () => {
    const match = performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((name) => name.includes('/sonner'));
    if (!match) return 'missing';
    const mod = await import(/* @vite-ignore */ match) as { toast?: { success: (message: string, options: { duration: number }) => void } };
    if (!mod.toast?.success) return 'no-toast';
    mod.toast.success('Copied to clipboard', { duration: 60_000 });
    return 'ok';
  });
  expect(toasted).toBe('ok');

  const toast = page.locator('[data-sonner-toast]').last();
  await expect(toast).toHaveAttribute('data-mounted', 'true');
  const offset = await page.evaluate(() => {
    const ol = document.querySelector('[data-sonner-toaster]');
    return {
      reserve: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--phone-tab-reserve')),
      usedBottom: ol ? Number.parseFloat(getComputedStyle(ol).bottom) : 0,
    };
  });
  expect(offset.reserve).toBeGreaterThan(40);
  expect(offset.usedBottom).toBeGreaterThan(offset.reserve);
  // The enter slide starts under the offset. The resting box is what has to clear the bar.
  await expect.poll(async () => {
    const [toastBox, tabBox] = await Promise.all([toast.boundingBox(), tabBar.boundingBox()]);
    if (!toastBox || !tabBox) return Number.POSITIVE_INFINITY;
    return toastBox.y + toastBox.height - tabBox.y;
  }).toBeLessThanOrEqual(1);
});

test('iPad width does not keep a keyboard pad', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/app/ask', { waitUntil: 'domcontentloaded' });
  const field = page.getByRole('textbox', { name: 'Message to your debate coach' });
  await expect(field).toBeVisible({ timeout: 15_000 });
  await field.focus();
  await paintViewport(page, { height: 500, offsetTop: 0, scale: 1 });
  const pad = await page.evaluate(() => ({
    keyboard: document.documentElement.style.getPropertyValue('--native-keyboard-height').trim(),
    reserve: document.documentElement.style.getPropertyValue('--phone-tab-reserve').trim(),
    main: getComputedStyle(document.querySelector('main')!).paddingBottom,
  }));
  expect(pad.keyboard).toBe('');
  expect(pad.reserve).toBe('');
  expect(pad.main).toBe('0px');
});

test('iPad portrait keeps the header nav instead of the tab bar', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Prepare' })).toBeVisible({ timeout: 15_000 });
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(navigation).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Open menu' })).toHaveCount(0);
  const hrefs = await navigation.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(hrefs).toEqual(expect.arrayContaining(['/app', '/app/library', '/app/history']));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
