import { test, expect } from '@playwright/test';
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
  await expect(main.getByRole('heading', { name: 'DebateLab' })).toBeVisible({ timeout: 15_000 });
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

  const desktopMoreMenu = page.locator('details').filter({ has: page.locator('summary[aria-label="More"]') });
  if ((page.viewportSize()?.width ?? 0) >= 1024) {
    await expect(desktopMoreMenu).not.toHaveAttribute('open');
  }

  await expect(page.locator('.react-joyride__tooltip')).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-test-id="button-primary"]').click();

  const tourTargets = ['generate', 'attack', 'brainstorm', 'factoids', 'ask', 'crossfire', 'sparring', 'library', 'timer', 'flowchart', 'history'];
  for (const [index, key] of tourTargets.entries()) {
    await expect(page.locator(`[data-tour="mode-${key}"]`)).toBeVisible();
    const nextButton = page.locator('[data-test-id="button-primary"]');
    await expect(nextButton).toHaveAccessibleName(new RegExp(`Step ${index + 2} of 14`));
    await nextButton.click();
  }

  await page.locator('[data-test-id="button-skip"]').click();
});

test('onboarding keeps its original start schedule after a delayed lazy chunk', async ({ page }) => {
  await page.addInitScript(() => {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function setItem(key, value) {
      if (key === 'debate-trainer-onboarding') {
        try {
          if (JSON.parse(value).state?.isTourRunning === true) {
            originalSetItem.call(this, '__onboarding-tour-started-at', String(Date.now()));
          }
        } catch {
          // Ignore malformed test-only storage writes.
        }
      }
      originalSetItem.call(this, key, value);
    };
    window.localStorage.setItem('debate-trainer-onboarding', JSON.stringify({
      state: { hasCompletedOnboarding: false, isTourRunning: false },
      version: 0,
    }));
  });
  await page.route('**/src/components/features/onboarding/OnboardingTour.tsx*', async (route) => {
    const response = await route.fetch();
    const body = `${await response.text()}\nwindow.localStorage.setItem('__onboarding-module-evaluated-at', String(Date.now()));`;
    await new Promise((resolve) => setTimeout(resolve, 750));
    await route.fulfill({ response, body });
  });
  await page.route('**/node_modules/.vite/deps/react-joyride.js*', async (route) => {
    const response = await route.fetch();
    const body = await response.body();
    await route.fulfill({ response, body });
  });

  await page.goto('/app', { waitUntil: 'domcontentloaded' });

  await expect.poll(async () => Number(await page.evaluate(() => window.localStorage.getItem('__onboarding-module-evaluated-at') ?? 0)), { timeout: 15_000 }).toBeGreaterThan(0);
  await expect.poll(async () => Number(await page.evaluate(() => window.localStorage.getItem('__onboarding-tour-started-at') ?? 0)), { timeout: 15_000 }).toBeGreaterThan(0);
  const moduleEvaluatedAt = await page.evaluate(() => Number(window.localStorage.getItem('__onboarding-module-evaluated-at')));
  const startedAt = await page.evaluate(() => Number(window.localStorage.getItem('__onboarding-tour-started-at')));
  expect(startedAt - moduleEvaluatedAt).toBeLessThan(450);
  await expect(page.locator('.react-joyride__tooltip')).toBeVisible({ timeout: 15_000 });
});

test('onboarding starts a fresh delay when a protected route reaches home', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('debate-trainer-onboarding', JSON.stringify({
      state: { hasCompletedOnboarding: false, isTourRunning: false },
      version: 0,
    }));
  });
  await page.goto('/app/generate', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Ready to Generate' })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(650);

  await page.locator('header a[href="/app"]').first().click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.locator('.react-joyride__tooltip')).toHaveCount(0, { timeout: 100 });
  await expect(page.locator('.react-joyride__tooltip')).toBeVisible({ timeout: 15_000 });
});

test('header keeps the brand and controls inside a 320px viewport', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Prepare' })).toBeVisible({ timeout: 15_000 });

  const languageControl = page.getByRole('button', { name: 'Language' });
  const themeControl = page.getByRole('button', { name: 'Toggle theme' });
  const settingsControl = page.getByRole('link', { name: 'Settings' });
  const menuControl = page.getByRole('button', { name: 'Open menu' });
  const controls = [languageControl, themeControl, settingsControl, menuControl];

  await expect(page.getByAltText('DebateLab logo')).toBeVisible();
  for (const control of controls) await expect(control).toBeVisible();

  const boxes = await Promise.all(controls.map((control) => control.boundingBox()));
  expect(boxes.every((box) => box && box.x >= 0 && box.x + box.width <= 320)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test('desktop More menu exposes secondary destinations without horizontal scrolling', async ({ page }) => {
  test.skip((page.viewportSize()?.width ?? 0) < 1024, 'Desktop-only More menu check');
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await page.locator('summary[aria-label="More"]').click();

  const moreMenu = page.locator('details').filter({ has: page.locator('summary[aria-label="More"]') });
  for (const [label, href] of [
    ['Brainstorm', '/app/brainstorm'],
    ['Factoids', '/app/factoids'],
    ['Flowchart', '/app/flowchart'],
    ['Library', '/app/library'],
    ['Timer', '/app/timer'],
    ['History', '/app/history'],
  ] as const) {
    await expect(moreMenu.getByRole('link', { name: label })).toHaveAttribute('href', href);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});

test('desktop header fits without internal or document overflow at supported widths', async ({ page }) => {
  for (const width of [1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Prepare' })).toBeVisible({ timeout: 15_000 });

    const navigation = page.getByRole('navigation', { name: 'Main navigation' });
    await expect(navigation).toBeVisible();
    expect(await navigation.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('mobile menu exposes every tool destination and closes after navigation', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Open menu' }).click();

  const mobileNavigation = page.getByRole('navigation', { name: 'Mobile navigation' });
  for (const label of ['Home', 'Generate', 'Attack', 'Brainstorm', 'Factoids', 'Ask', 'Crossfire', 'Library', 'Timer', 'Sparring', 'Flowchart', 'History']) {
    await expect(mobileNavigation.getByRole('link', { name: new RegExp(`^${label}`) })).toBeVisible();
  }

  await mobileNavigation.getByRole('link', { name: /^Brainstorm/ }).click();
  await expect(page).toHaveURL(/\/app\/brainstorm$/);
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toHaveCount(0);
});
