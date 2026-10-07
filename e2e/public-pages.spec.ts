import { test, expect } from '@playwright/test';
import { setLocale } from './helpers/auth';

const LOCALES = ['en', 'es', 'hu'] as const;
const PUBLIC_ROUTES = [
  { path: '/', name: 'landing' },
  { path: '/terms', name: 'terms' },
  { path: '/privacy', name: 'privacy' },
  { path: '/login', name: 'login' },
  // An unknown route renders the 404 page, which must not log an error.
  { path: '/no-such-page', name: 'not-found' },
] as const;

for (const locale of LOCALES) {
  test.describe(`public pages [${locale}]`, locale === 'en' ? { tag: '@smoke' } : {}, () => {
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
        // Pages are lazy chunks: wait until the page itself has rendered, so
        // errors it logs while mounting are in the list below.
        await expect(page.locator('h1').first()).toBeVisible();

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
