import { expect, test } from '@playwright/test';
import { setLocale, stubSupabaseSession } from './helpers/auth';

test('shows a dark private startup shell while the entry module is delayed', async ({ page }) => {
  await setLocale(page, 'en');
  await page.addInitScript(() => {
    const settings = JSON.parse(window.localStorage.getItem('debate-trainer-settings') || '{}');
    settings.state = { ...settings.state, theme: 'dark' };
    window.localStorage.setItem('debate-trainer-settings', JSON.stringify(settings));
  });
  await stubSupabaseSession(page);
  await page.route('**/src/bootstrap.ts*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });

  await page.goto('/app', { waitUntil: 'commit' });
  await expect(page.locator('[data-startup-shell]')).toBeVisible();
  await expect(page.locator('#root > .seo-fallback')).toBeHidden();
  await expect(page.locator('[data-startup-status]')).toHaveText('Loading DebateLab');
  await expect.poll(() => page.evaluate(() => ({
    appShell: document.documentElement.classList.contains('app-shell'),
    dark: document.documentElement.classList.contains('dark'),
  }))).toEqual({ appShell: true, dark: true });
});

test('shows the startup shell on login while the entry module is delayed', async ({ page }) => {
  await setLocale(page, 'en');
  await page.route('**/src/bootstrap.ts*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });

  await page.goto('/login', { waitUntil: 'commit' });
  await expect(page.locator('[data-startup-shell]')).toBeVisible();
  await expect(page.locator('#root > .seo-fallback')).toBeHidden();
  await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('app-shell'))).toBe(true);
});

test('mounts the app before Jam recorder modules resolve', async ({ page }) => {
  await setLocale(page, 'en');
  await stubSupabaseSession(page);
  await page.addInitScript(() => {
    if (typeof window.MediaRecorder === 'undefined') {
      Object.defineProperty(window, 'MediaRecorder', { value: class MediaRecorderStub {} });
    }
  });
  await page.route('**/js.jam.dev/*.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 6000));
    await route.fulfill({ status: 200, contentType: 'application/javascript', body: '' });
  });

  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'DebateLab', exact: true, level: 1 })).toBeVisible({ timeout: 5_000 });
  await expect(page.locator('#root > .seo-fallback')).toHaveCount(0);
  expect(await page.evaluate(() => {
    const jam = (window as Window & { __jam__?: { exports?: { metadata?: unknown } } }).__jam__;
    return typeof jam?.exports?.metadata === 'function';
  })).toBe(true);
});

test('shows a recoverable message when the main entry fails', async ({ page }) => {
  await page.route('**/src/main.tsx*', (route) => route.fulfill({ status: 503, body: 'entry unavailable' }));

  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-bootstrap-error]')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Unable to load DebateLab' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload' })).toBeEnabled();
});

test('keeps the public SEO root visible before a delayed entry module', async ({ page }) => {
  await setLocale(page, 'en');
  await page.route('**/src/bootstrap.ts*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });

  await page.goto('/', { waitUntil: 'commit' });
  await expect(page.locator('#root > .seo-fallback')).toBeVisible();
  await expect(page.locator('#root > .seo-fallback nav a')).toHaveCount(19);
});
