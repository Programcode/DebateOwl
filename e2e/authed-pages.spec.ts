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

test('visible Ask advanced controls use the non-streaming contract', async ({ page }) => {
  await setLocale(page, 'en');
  await stubSupabaseSession(page);
  await page.addInitScript(() => {
    window.localStorage.setItem('debate-trainer-settings', JSON.stringify({
      state: {
        language: 'en',
        outputLanguage: 'en',
        theme: 'light',
        featureConfigs: {
          ask: { provider: 'openai', model: 'gpt-5.4-mini', temperature: 0.7 },
        },
      },
      version: 0,
    }));
  });

  let requestBody: Record<string, unknown> | undefined;
  let streamCalls = 0;
  await page.route('**/functions/v1/ai-stream', async (route) => {
    streamCalls += 1;
    await route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"unexpected stream"}' });
  });
  await page.route('**/functions/v1/ai', async (route) => {
    requestBody = route.request().postDataJSON() as Record<string, unknown>;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        output: {
          response: 'Clarification contract response',
          followUpQuestions: ['Which debate format are you using?'],
          uncertainties: [],
        },
      }),
    });
  });

  await page.goto('/app/ask', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Clarify' }).click();
  for (const name of ['Citations', 'Web search', 'Pros/Cons', 'Arg Map']) {
    await page.getByRole('switch', { name }).click();
  }
  await page.getByPlaceholder('Ask your debate coach...').fill('Which assumptions should I define?');
  await page.getByRole('button', { name: 'Send message' }).click();

  await expect(page.getByText('Clarification contract response')).toBeVisible();
  expect(streamCalls).toBe(0);
  expect(requestBody).toMatchObject({
    feature: 'ask',
    input: {
      message: 'Which assumptions should I define?',
      mode: 'clarify',
      citationMode: true,
      webSearch: true,
      prosConsMode: true,
      argumentMapMode: true,
    },
  });
});
