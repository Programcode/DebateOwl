import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { stubSupabaseSession } from './helpers/auth';

// T12 (IN-01, SE-01, IN-03, IN-04, IN-11, IN-14) in the browser without a
// backend: every request off this origin is stubbed, so this proves the client
// only. The verify-debatelab recipe recipes/localization.spec.ts repeats it
// against real Auth, Postgres and Edge Functions. Screenshots go to the test's
// output directory.

const catalog = (language: string) => JSON.parse(readFileSync(`src/locales/${language}.json`, 'utf8'));
const en = catalog('en');
const es = catalog('es');
const hu = catalog('hu');
const BRAND = 'DebateLab by Pi-Stack';
const LANGUAGES = { en: 'English', es: 'Español', hu: 'Magyar' } as const;
const SWITCHER = new RegExp(`^(${[en, es, hu].map((strings) => strings.langSwitcher.label).join('|')})$`);
const brand = (text: string) => text.replace('{{brand}}', BRAND);

const APP_ROUTES = ['/app', '/app/generate', '/app/attack', '/app/history', '/app/settings'];
const PUBLIC_ROUTES = ['/terms', '/privacy', '/tools', '/no-such-page'];

test.beforeEach(async ({ page }, testInfo) => {
  // Phones at 375 px, the width the QA report used; desktop keeps 1280.
  if (testInfo.project.name === 'mobile-chromium') await page.setViewportSize({ width: 375, height: page.viewportSize()!.height });
  // Nothing leaves this origin: empty tables, and 404 for anything else.
  await page.route((url) => url.hostname !== '127.0.0.1' && url.hostname !== 'localhost', (route) => {
    const request = route.request();
    if (new URL(request.url()).pathname.includes('/rest/v1/')) {
      // PostgREST answers a single-row read of an empty table with 406.
      if ((request.headers().accept ?? '').includes('vnd.pgrst.object')) {
        return route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } });
      }
      return route.fulfill({ headers: { 'content-range': '*/0' }, json: [] });
    }
    return route.fulfill({ status: 404, body: '' });
  });
});

async function shot(page: Page, name: string) {
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });
}

async function choose(page: Page, language: keyof typeof LANGUAGES) {
  await page.getByRole('button', { name: SWITCHER }).first().click();
  await page.getByRole('radiogroup').first().getByRole('radio', { name: LANGUAGES[language] }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', language);
  await page.keyboard.press('Escape');
}

test('every route has its own tab title in each language, and a switch retitles it', async ({ page }) => {
  // 27 full page loads; the dev server compiles each route's chunk on first use.
  test.setTimeout(240_000);
  await stubSupabaseSession(page);
  const titles: Record<string, Record<string, string>> = {};
  for (const language of ['en', 'es', 'hu'] as const) {
    await page.goto(`/app?lang=${language}`);
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    titles[language] = {};
    for (const route of [...APP_ROUTES, ...PUBLIC_ROUTES]) {
      await page.goto(route);
      await expect.poll(() => page.title(), { timeout: 30_000 }).not.toBe('DebateLab');
      titles[language][route] = await page.title();
    }
  }
  writeFileSync(test.info().outputPath('document-titles.json'), JSON.stringify(titles, null, 2));

  for (const language of ['en', 'es', 'hu'] as const) {
    for (const route of APP_ROUTES) expect(titles[language][route]).toMatch(/ · DebateLab$/);
    for (const route of PUBLIC_ROUTES) expect(titles[language][route]).toMatch(/ \| DebateLab by Pi-Stack$/);
  }
  expect(titles.hu['/app/attack']).toBe(`${hu.nav.attack} · DebateLab`);
  expect(titles.es['/no-such-page']).toBe(brand(es.pageHead.notFound.title));
  for (const route of [...APP_ROUTES, ...PUBLIC_ROUTES]) expect(titles.hu[route], route).not.toBe(titles.en[route]);

  // No reload: the switcher retitles the page on screen.
  await page.goto('/app/generate');
  await choose(page, 'en');
  await expect(page).toHaveTitle(`${en.nav.generate} · DebateLab`);
  await choose(page, 'hu');
  await expect(page).toHaveTitle(`${hu.nav.generate} · DebateLab`);
});

test('an empty Attack says the case is required in the interface language, only after submit', async ({ page }) => {
  await stubSupabaseSession(page);
  await page.goto('/app/attack?lang=hu');
  await expect(page.getByRole('button', { name: hu.attackForm.submit })).toBeVisible();
  await expect(page.getByText(hu.validation.caseTextRequired)).toHaveCount(0);
  await shot(page, '01-attack-hu-before-submit');

  await page.getByRole('button', { name: hu.attackForm.submit }).click();
  await expect(page.getByText(hu.validation.caseTextRequired)).toBeVisible();
  await expect(page.getByText(en.validation.caseTextRequired)).toHaveCount(0);
  await shot(page, '02-attack-hu-required');

  await choose(page, 'es');
  await expect(page.getByText(es.validation.caseTextRequired)).toBeVisible();
  await shot(page, '03-attack-es-required');
});

test('sign-in and not-found pages carry the language switcher', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { level: 1, name: en.login.title })).toBeVisible();
  await shot(page, '01-login-en');
  await choose(page, 'hu');
  await expect(page.getByRole('heading', { level: 1, name: hu.login.title })).toBeVisible();
  // "Bejelentkezés a DebateLabba" already names the app, so it gets no suffix.
  await expect(page).toHaveTitle(hu.login.title);
  await shot(page, '02-login-hu');

  await page.goto('/no-such-page');
  await expect(page.getByRole('heading', { level: 1, name: hu.notFound.title })).toBeVisible();
  await expect(page).toHaveTitle(brand(hu.pageHead.notFound.title));
  await shot(page, '03-not-found-hu');
  await choose(page, 'es');
  await expect(page).toHaveTitle(brand(es.pageHead.notFound.title));
  await expect(page.getByText(es.notFound.message)).toBeVisible();
  await shot(page, '04-not-found-es');
});

test('?lang= and the /hu and /es home pages open the landing page in that language', async ({ page }) => {
  await page.goto('/?lang=hu');
  await expect(page.locator('html')).toHaveAttribute('lang', 'hu');
  await expect(page).toHaveTitle(brand(hu.pageHead.home.title));
  await expect.poll(() => new URL(page.url()).search).toBe('');
  await shot(page, '01-landing-lang-hu');

  await page.goto('/es');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page).toHaveTitle(brand(es.pageHead.home.title));
  await shot(page, '02-landing-es');

  await page.goto('/hu');
  await expect.poll(() => new URL(page.url()).pathname).toBe('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'hu');
  // The choice is kept, not just shown once.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'hu');
  await shot(page, '03-landing-hu-after-reload');
});

test('a server refusal with a code reads in the interface language', async ({ page }) => {
  await stubSupabaseSession(page);
  // The account is suspended: the ai function answers 403 with its English reason and a code.
  await page.route((url) => url.pathname.endsWith('/functions/v1/ai'), (route) => route.fulfill({
    status: 403,
    json: { error: 'Your account has been suspended. Please contact support.', code: 'banned' },
  }));
  await page.goto('/app/attack?lang=hu');
  await page.getByRole('textbox', { name: new RegExp(hu.attackForm.argument) }).fill('A tömegközlekedés legyen ingyenes, mert csökkenti a forgalmat.');
  await page.getByRole('button', { name: hu.attackForm.submit }).click();
  // Without a Current Debate, the tool may first ask whether to start one.
  const once = page.getByRole('button', { name: hu.debate.offerNotNow });
  const refusal = page.getByText(hu.serverErrors.banned);
  await expect(once.or(refusal).first()).toBeVisible();
  if (await once.isVisible()) await once.click();
  await expect(refusal).toBeVisible();
  await expect(page.getByText('Your account has been suspended.')).toHaveCount(0);
  await shot(page, '01-attack-refused-hu');
});
