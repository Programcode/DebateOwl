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
  // English runs in the pull-request smoke set; the other locales run nightly.
  test.describe(`authed pages [${locale}]`, locale === 'en' ? { tag: '@smoke' } : {}, () => {
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

test('aligns Factoids timeframe and model controls responsively', async ({ page }) => {
  await setLocale(page, 'en');
  await stubSupabaseSession(page);
  await page.goto('/app/factoids', { waitUntil: 'domcontentloaded' });

  const timeframe = page.locator('#timeframe');
  const model = page.getByRole('combobox', { name: /Select AI model for factoids/i });
  await expect(timeframe).toBeVisible();
  await expect(model).toBeVisible();
  const layout = await page.evaluate(() => {
    const timeframeElement = document.querySelector('#timeframe');
    const modelElement = document.querySelector('[aria-label*="Select AI model for factoids"]');
    if (!timeframeElement || !modelElement) throw new Error('Factoids alignment controls are missing.');
    const timeframeBox = timeframeElement.getBoundingClientRect();
    const modelBox = modelElement.getBoundingClientRect();
    return {
      viewportWidth: window.innerWidth,
      timeframe: { top: timeframeBox.top, bottom: timeframeBox.bottom, left: timeframeBox.left },
      model: { top: modelBox.top, left: modelBox.left },
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });

  expect(layout.horizontalOverflow).toBe(false);
  // FactoidsForm switches its settings grid at Tailwind `sm` (640px).
  if (layout.viewportWidth >= 640) {
    expect(Math.abs(layout.timeframe.top - layout.model.top)).toBeLessThanOrEqual(1);
    expect(layout.model.left).toBeGreaterThan(layout.timeframe.left);
  } else {
    expect(layout.model.top).toBeGreaterThanOrEqual(layout.timeframe.bottom);
    expect(Math.abs(layout.timeframe.left - layout.model.left)).toBeLessThanOrEqual(1);
  }
});

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
          ask: { provider: 'openai', model: 'gpt-5.4-mini' },
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
  await page.getByRole('button', { name: 'Options' }).click();
  for (const name of ['Citations', 'Web search', 'Pros/cons', 'Arg map']) {
    await page.getByRole('switch', { name }).click();
  }
  await page.keyboard.press('Escape');
  await page.getByPlaceholder('Ask your debate coach…').fill('Which assumptions should I define?');
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
