import { test, expect } from '@playwright/test';
import { setLocale } from './helpers/auth';

const LOCALES = ['en', 'es', 'hu'] as const;
const PUBLIC_ROUTES = [
  { path: '/', name: 'landing' },
  { path: '/terms', name: 'terms' },
  { path: '/privacy', name: 'privacy' },
  { path: '/login', name: 'login' },
] as const;

for (const locale of LOCALES) {
  test.describe(`public pages [${locale}]`, () => {
    test.beforeEach(async ({ page }) => {
      await setLocale(page, locale);
    });

    for (const route of PUBLIC_ROUTES) {
      test(`${route.name} renders without runtime errors`, async ({ page }) => {
        const consoleErrors: string[] = [];
        page.on('pageerror', (err) => consoleErrors.push(err.message));
        page.on('console', (msg) => {
          if (msg.type() === 'error') consoleErrors.push(msg.text());
        });

        const response = await page.goto(route.path, { waitUntil: 'domcontentloaded' });
        expect(response?.ok()).toBeTruthy();
        await expect(page.locator('body')).toBeVisible();

        const fatalErrors = consoleErrors.filter((msg) =>
          !msg.includes('Failed to load resource') &&
          !msg.includes('favicon') &&
          !msg.includes('net::ERR_') &&
          !/^Failed to fetch(:|$)/.test(msg) &&
          !/^Warning:/.test(msg),
        );
        expect(fatalErrors, fatalErrors.join('\n')).toEqual([]);
      });
    }
  });
}

test('landing logos use the sized display asset with intrinsic dimensions', async ({ page }) => {
  await setLocale(page, 'en');
  await page.goto('/');

  const logos = page.locator('img[alt="DebateLab logo"]');
  await expect(logos).toHaveCount(2);
  expect(await logos.evaluateAll((images) => images.map((image) => {
    const logo = image as HTMLImageElement;
    return {
      path: new URL(logo.currentSrc).pathname,
      width: logo.getAttribute('width'),
      height: logo.getAttribute('height'),
    };
  }))).toEqual([
    { path: '/favicon-72.png', width: '36', height: '36' },
    { path: '/favicon-72.png', width: '32', height: '32' },
  ]);
});
