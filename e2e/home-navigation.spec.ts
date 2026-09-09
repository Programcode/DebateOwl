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

  for (const key of ['generate', 'attack', 'brainstorm', 'factoids', 'ask', 'library', 'timer', 'flowchart', 'history']) {
    await expect(page.locator(`[data-tour="mode-${key}"]`)).toBeVisible();
    await expect.poll(() => page.evaluate((targetKey) => {
      const spotlight = document.querySelector('[data-test-id="spotlight"]');
      if (!(spotlight instanceof HTMLElement)) return false;

      const spotlightWidth = Number.parseFloat(spotlight.style.width);
      const spotlightHeight = Number.parseFloat(spotlight.style.height);
      return Array.from(document.querySelectorAll<HTMLElement>(
        `[data-tour="mode-${targetKey}"], [data-tour="nav-${targetKey}"]`,
      )).some((target) => {
        const style = window.getComputedStyle(target);
        const rect = target.getBoundingClientRect();
        return style.display !== 'none'
          && style.visibility !== 'hidden'
          && target.getClientRects().length > 0
          && rect.width > 0
          && rect.height > 0
          && Math.abs(spotlightWidth - rect.width - 20) < 2
          && Math.abs(spotlightHeight - rect.height - 20) < 2;
      });
    }, key)).toBe(true);
    await page.locator('[data-test-id="button-primary"]').click();
  }

  await page.locator('[data-test-id="button-skip"]').click();
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

  await expect(page.locator('header img[alt="DebateLab"]')).toBeVisible();
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
