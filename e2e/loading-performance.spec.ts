import { expect, test } from '@playwright/test';
import { setLocale, stubSupabaseSession } from './helpers/auth';

test('a stalled Jam recorder cannot delay the real application', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'Jam recording requires MediaRecorder, which this WebKit runtime does not expose.');
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
