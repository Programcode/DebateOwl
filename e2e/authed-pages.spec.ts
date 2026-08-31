import { test, expect } from '@playwright/test';
import { stubSupabaseSession, setLocale } from './helpers/auth';

const LOCALES = ['en', 'es', 'hu'] as const;
const AUTH_ROUTES = [
  { path: '/app', name: 'home' },
  { path: '/app/generate', name: 'generate' },
  { path: '/app/attack', name: 'attack' },
  { path: '/app/crossfire', name: 'crossfire' },
  { path: '/app/brainstorm', name: 'brainstorm' },
  { path: '/app/factoids', name: 'factoids' },
  { path: '/app/ask', name: 'ask' },
  { path: '/app/library', name: 'library' },
  { path: '/app/history', name: 'history' },
  { path: '/app/timer', name: 'timer' },
  { path: '/app/sparring', name: 'sparring' },
  { path: '/app/flowchart', name: 'flowchart' },
  { path: '/app/settings', name: 'settings' },
] as const;

for (const locale of LOCALES) {
  test.describe(`authed pages [${locale}]`, () => {
    test.beforeEach(async ({ page }) => {
      await setLocale(page, locale);
      await stubSupabaseSession(page);
    });

    for (const route of AUTH_ROUTES) {
      test(`${route.name} renders without runtime errors`, async ({ page }) => {
        const consoleErrors: string[] = [];
        page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${err.message}`));
        page.on('console', (msg) => {
          if (msg.type() !== 'error') return;
          const text = msg.text();
          if (text.includes('Failed to load resource')) return;
          if (text.includes('favicon')) return;
          if (text.includes('net::ERR_')) return;
          if (/^Failed to fetch(:|$)/.test(text)) return;
          if (text.includes('Auth] hydrate')) return;
          if (/^Warning:/.test(text)) return;
          consoleErrors.push(`console: ${text}`);
        });

        await page.goto(route.path, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('body')).toBeVisible();

        // ErrorBoundary fallback should never appear for a clean route render.
        await expect(page.getByText('Something broke on this page')).toHaveCount(0);
        // We were not bounced back to /login by RequireAuth.
        expect(page.url()).not.toContain('/login');

        expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
      });
    }
  });
}
