import { expect, test, type Page } from '@playwright/test';
import { setLocale, stubSupabaseSession } from './helpers/auth';

async function openMobileNavigation(page: Page) {
  if ((page.viewportSize()?.width ?? 1280) < 1024) {
    await page.getByRole('button', { name: 'Open menu' }).click();
  }
}

test('a stalled Jam recorder cannot delay the real application', async ({ page }) => {
  await page.route('https://js.jam.dev/**', async () => new Promise(() => undefined));
  const jamRequest = page.waitForRequest('https://js.jam.dev/**');

  await page.goto('/', { waitUntil: 'domcontentloaded' });

  await jamRequest;
  await expect(page.getByRole('heading', { name: /Prep Faster/ })).toBeVisible({ timeout: 2_000 });
  await expect(page.getByText('DebateLab by Programcode is the official')).toHaveCount(0);
});

test('public routes keep the real UI after refresh', async ({ page }) => {
  await setLocale(page, 'en');
  for (const [path, label] of [
    ['/', /Prep Faster/],
    ['/login', 'Continue with Google'],
  ] as const) {
    await page.goto(path);
    await page.reload();
    await expect(page.getByRole(path === '/' ? 'heading' : 'button', { name: label })).toBeVisible();
    await expect(page.getByText('DebateLab by Programcode is the official')).toHaveCount(0);
  }
});

test('authenticated routes keep the shell and current page after refresh', async ({ page }) => {
  await setLocale(page, 'en');
  await stubSupabaseSession(page);
  for (const [path, heading] of [
    ['/app', 'Prepare'],
    ['/app/generate', 'Ready to Generate'],
    ['/app/attack', 'No Mercy Mode'],
  ] as const) {
    await page.goto(path);
    await page.reload();
    await expect(page.locator('header')).toBeVisible();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByText('DebateLab by Programcode is the official')).toHaveCount(0);
  }
});

test('landing CTA enters the app without replacing the document', async ({ page }) => {
  await setLocale(page, 'en');
  await stubSupabaseSession(page);
  let documentRequests = 0;
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) documentRequests += 1;
  });

  await page.goto('/');
  await page.evaluate(() => { document.documentElement.dataset.e2eDocument = 'original'; });
  const initialDocumentRequests = documentRequests;
  await page.getByRole('link', { name: 'Start Trial' }).first().click();

  await expect(page).toHaveURL(/\/app$/);
  expect(documentRequests).toBe(initialDocumentRequests);
  expect(await page.evaluate(() => performance.getEntriesByType('navigation'))).toHaveLength(1);
  expect(await page.evaluate(() => document.documentElement.dataset.e2eDocument)).toBe('original');
});

test('protected sibling navigation keeps AppLayout mounted while the page loads', async ({ page }) => {
  await setLocale(page, 'en');
  await stubSupabaseSession(page);
  await page.goto('/app/generate');
  const header = page.locator('header');
  await expect(header).toBeVisible();
  await header.evaluate((element) => { element.dataset.e2eLayout = 'original'; });

  let releaseAttackModule: (() => void) | undefined;
  const attackModuleReleased = new Promise<void>((resolve) => { releaseAttackModule = resolve; });
  let attackModuleRequested = false;
  await page.route('**/src/pages/AttackPage.tsx*', async (route) => {
    attackModuleRequested = true;
    await attackModuleReleased;
    await route.continue();
  });

  await openMobileNavigation(page);
  await page.getByRole('link', { name: 'Attack' }).click();
  await expect.poll(() => attackModuleRequested).toBe(true);
  await page.waitForTimeout(250);

  await expect(header).toBeVisible();
  expect(await header.getAttribute('data-e2e-layout')).toBe('original');

  releaseAttackModule?.();
  await expect(page).toHaveURL(/\/app\/attack$/);
  await expect(page.getByRole('heading', { name: /Attack/i }).first()).toBeVisible();
  expect(await header.getAttribute('data-e2e-layout')).toBe('original');
});
