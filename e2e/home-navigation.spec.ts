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
