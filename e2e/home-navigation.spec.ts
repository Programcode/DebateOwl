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

test('onboarding starts a fresh delay when a protected route reaches home', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('debate-trainer-onboarding', JSON.stringify({
      state: { hasCompletedOnboarding: false, isTourRunning: false },
      version: 0,
    }));
  });
  await page.goto('/app/generate', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Ready to Generate' })).toBeVisible({ timeout: 15_000 });
  // eslint-disable-next-line no-restricted-properties -- observation window: let the first onboarding delay run partway before navigating.
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

  // Mobile keeps the logo, language, and menu on the first row; Settings and the theme live in the menu and Settings.
  const languageControl = page.getByRole('button', { name: 'Language' });
  const menuControl = page.getByRole('button', { name: 'Open menu' });
  const debateControl = page.getByTestId('current-debate-mobile');
  const controls = [languageControl, menuControl, debateControl];

  await expect(page.getByAltText('DebateLab logo')).toBeVisible();
  for (const control of controls) await expect(control).toBeVisible();

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
    expect(await navigation.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('mobile menu holds only Tools, Current debate, Library, History, and Settings', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Open menu' }).click();

  const mobileNavigation = page.getByRole('navigation', { name: 'Mobile navigation' });
  const hrefs = await mobileNavigation.getByRole('link').evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(hrefs).toEqual(['/app', '/app/debate', '/app/library', '/app/history', '/app/settings']);

  await mobileNavigation.getByRole('link', { name: /^Library/ }).click();
  await expect(page).toHaveURL(/\/app\/library$/);
  await expect(page.getByRole('navigation', { name: 'Mobile navigation' })).toHaveCount(0);
});
