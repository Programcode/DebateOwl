/**
 * Screenshots of the web export at iPhone and iPad sizes, light and dark,
 * English and Hungarian, into .verify/mobile-shots/ at the repository root.
 * The web export is close to the native app but not the same: it has no
 * native tab bar, large titles, sheets or gestures.
 *
 *   npm run -w @debatelab/mobile export:web
 *   PORT=<free port> npx tsx apps/mobile/scripts/screenshots.ts
 *
 * Signed-in screens need a staging session. With STAGING_DEMO_CODE set, the
 * script signs in once through the real sign-in screen and also checks that a
 * cold start without a network keeps the user signed in. The deployed Edge
 * Functions only accept browser calls from a few origins, so for that run use
 * PORT=18080 (http://127.0.0.1:18080). Never print the code or put it in a
 * screenshot.
 */
import { chromium, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize } from 'node:path';

import { SUPABASE_PROJECTS } from '../../../src/lib/supabase/projects';

type StorageState = Exclude<BrowserContextOptions['storageState'], string | undefined>;

const DIST = join(__dirname, '../dist');
const OUT = join(__dirname, '../../../.verify/mobile-shots');
const PORT = Number(process.env.PORT);
const DEMO_CODE = process.env.STAGING_DEMO_CODE?.trim();
const ORIGIN = `http://127.0.0.1:${PORT}`;
const STAGING_HOST = new URL(SUPABASE_PROJECTS.staging.url).host;
const SESSION_KEY = `sb-${STAGING_HOST.split('.')[0]}-auth-token`;

const DEVICES = {
  iphone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
} as const;
const SCHEMES = ['light', 'dark'] as const;
const LOCALES = { en: 'en-GB', hu: 'hu-HU' } as const;
const SIGNED_IN_ROUTES = { debate: '/', prepare: '/prepare', practice: '/practice', library: '/library', you: '/you' };

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
};

/** Serves the static export with clean URLs (/prepare -> prepare.html). */
function serve(): Promise<Server> {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url ?? '/', ORIGIN).pathname)).replace(/^(\.\.[/\\])+/, '');
    const candidates = [join(DIST, path), join(DIST, `${path}.html`), join(DIST, path, 'index.html')];
    const file = candidates.find((candidate) => candidate.startsWith(DIST) && existsSync(candidate) && statSync(candidate).isFile());
    if (!file) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

/** Fails the run on page errors and console errors, which leave plausible-looking but broken screenshots. */
function watchErrors(page: Page, problems: string[], label: string) {
  page.on('pageerror', (error) => problems.push(`${label}: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`${label}: ${message.text()}`);
  });
}

async function shoot(page: Page, name: string) {
  // Let fonts and the colour scheme settle after hydration.
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(OUT, `${name}.png`), mask: [page.getByTestId('account-email')] });
}

async function signIn(browser: Browser, problems: string[]): Promise<StorageState> {
  const context = await browser.newContext({ ...DEVICES.iphone, locale: LOCALES.en });
  const page = await context.newPage();
  watchErrors(page, problems, 'sign-in');
  const authHosts: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/auth/v1/') || request.url().includes('/functions/v1/')) {
      authHosts.push(new URL(request.url()).host);
    }
  });
  await page.goto(`${ORIGIN}/sign-in`);
  await page.getByRole('tab', { name: 'Demo code' }).click();
  await page.getByRole('textbox').fill(DEMO_CODE ?? '');
  await page.getByRole('button', { name: 'Sign in with demo code' }).click();
  await page.getByRole('tab', { name: 'Debate' }).waitFor({ timeout: 30_000 });
  if (authHosts.length === 0 || authHosts.some((host) => host !== STAGING_HOST)) {
    throw new Error(`Sign-in reached ${[...new Set(authHosts)].join(', ') || 'no backend'}, expected ${STAGING_HOST}`);
  }
  const state = await context.storageState();
  await context.close();
  return state;
}

/** A cold start with an expired access token and no network must keep the user signed in. */
async function checkOfflineColdStart(browser: Browser, state: StorageState, problems: string[]) {
  const expired = structuredClone(state);
  const entry = expired.origins.flatMap((origin) => origin.localStorage).find((item) => item.name === SESSION_KEY);
  if (!entry) throw new Error('No stored session after sign-in');
  const session = JSON.parse(entry.value) as { expires_at: number };
  session.expires_at = Math.floor(Date.now() / 1000) - 60;
  entry.value = JSON.stringify(session);

  const context = await browser.newContext({ ...DEVICES.iphone, locale: LOCALES.en, storageState: expired });
  const page = await context.newPage();
  // Offline for the backend only; the page itself still loads from the local server.
  const toBackend = (url: URL) => url.host === STAGING_HOST;
  await page.route(toBackend, (route) => route.abort('internetdisconnected'));
  const started = Date.now();
  await page.goto(`${ORIGIN}/`);
  await page.getByRole('tab', { name: 'Debate' }).waitFor({ timeout: 60_000 });
  const offlineMs = Date.now() - started;
  const signInShown = await page.getByRole('button', { name: 'Send code' }).isVisible();
  const stored = await page.evaluate((key) => localStorage.getItem(key) !== null, SESSION_KEY);
  await shoot(page, 'offline-cold-start');

  // unroute matches the predicate by identity.
  await page.unroute(toBackend);
  watchErrors(page, problems, 'back online');
  await page.reload();
  await page.getByRole('tab', { name: 'Debate' }).waitFor({ timeout: 30_000 });
  // The tabs render from storage first; the refresh lands shortly after.
  const refreshed = await page
    .waitForFunction((key) => {
      const value = localStorage.getItem(key);
      return value ? (JSON.parse(value) as { expires_at: number }).expires_at * 1000 > Date.now() : false;
    }, SESSION_KEY, { timeout: 30_000 })
    .then(() => true, () => false);
  await context.close();

  console.log(`offline cold start: tabs shown after ${offlineMs} ms, sign-in shown: ${signInShown}, session kept: ${stored}`);
  console.log(`back online: session refreshed: ${refreshed}`);
  if (signInShown || !stored || !refreshed) throw new Error('Offline cold start signed the user out');
}

async function main() {
  if (!Number.isInteger(PORT) || PORT <= 0) throw new Error('Set PORT to a free port');
  if (!existsSync(join(DIST, 'index.html'))) throw new Error('Run `npm run -w @debatelab/mobile export:web` first');
  await mkdir(OUT, { recursive: true });

  const server = await serve();
  const browser = await chromium.launch();
  const problems: string[] = [];
  let shots = 0;
  try {
    const session = DEMO_CODE ? await signIn(browser, problems) : null;
    if (session) await checkOfflineColdStart(browser, session, problems);
    else console.log('STAGING_DEMO_CODE is not set: signed-in screens skipped');

    for (const [device, options] of Object.entries(DEVICES)) {
      for (const scheme of SCHEMES) {
        for (const [language, locale] of Object.entries(LOCALES)) {
          const prefix = `${device}-${scheme}-${language}`;
          const signedOut = await browser.newContext({ ...options, colorScheme: scheme, locale });
          const page = await signedOut.newPage();
          watchErrors(page, problems, prefix);
          await page.goto(`${ORIGIN}/sign-in`);
          await page.getByRole('tablist').waitFor();
          await shoot(page, `${prefix}-sign-in`);
          await page.getByRole('button').first().click();
          await page.getByRole('alert').waitFor();
          await shoot(page, `${prefix}-sign-in-error`);
          await page.getByRole('tab').nth(1).click();
          await shoot(page, `${prefix}-sign-in-demo`);
          shots += 3;
          await signedOut.close();

          if (!session) continue;
          const signedIn = await browser.newContext({ ...options, colorScheme: scheme, locale, storageState: session });
          const tabPage = await signedIn.newPage();
          watchErrors(tabPage, problems, `${prefix} signed in`);
          for (const [name, route] of Object.entries(SIGNED_IN_ROUTES)) {
            await tabPage.goto(`${ORIGIN}${route}`);
            await tabPage.getByRole('tablist').waitFor();
            await shoot(tabPage, `${prefix}-${name}`);
            shots += 1;
          }
          await signedIn.close();
        }
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`${shots} screenshots in ${OUT}`);
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
