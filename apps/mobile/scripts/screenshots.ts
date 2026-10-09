/**
 * Screenshots of the web export at iPhone and iPad sizes, light and dark,
 * English and Hungarian, into .verify/mobile-shots/ at the repository root.
 * The web export is close to the native app but not the same: it has no
 * native tab bar, large titles, sheets or gestures.
 *
 *   npm run -w @debatelab/mobile export:web
 *   PORT=<free port> npx tsx apps/mobile/scripts/screenshots.ts
 *
 * ONLY=iphone-light-en limits a run to the combinations whose name starts with it.
 *
 * Signed-in screens need a staging session. With STAGING_DEMO_CODE set, the
 * script signs in once through the real sign-in screen and also checks that a
 * cold start without a network keeps the user signed in. The deployed Edge
 * Functions only accept browser calls from a few origins, so for that run use
 * PORT=18080 (http://127.0.0.1:18080). Never print the code or put it in a
 * screenshot.
 *
 * Signed in, the app applies the account's saved language and theme, which
 * would override the locale and colour scheme under test. Screenshot runs
 * therefore answer the app's user_settings reads with the run's language and
 * the System theme; nothing is written. The Debate tab shows the account's
 * real Current Debate, and its empty state comes from answering the
 * current_debates read with no row. The Debate tab is shot once per side view.
 *
 * Ask screenshots never call a model and never save a chat: the page answers
 * ai-stream from a fake stream inside the page (expo/fetch uses the page's
 * fetch), answers the ai function with a fixed answer with citations, and
 * answers chat and message writes locally. The Library screens read the
 * account's real sources and write nothing.
 */
import { chromium, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from '@playwright/test';
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
const ONLY = process.env.ONLY?.trim() ?? '';
const ORIGIN = `http://127.0.0.1:${PORT}`;
const STAGING_HOST = new URL(SUPABASE_PROJECTS.staging.url).host;
const SESSION_KEY = `sb-${STAGING_HOST.split('.')[0]}-auth-token`;

const DEVICES = {
  iphone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  ipad: { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
} as const;
const SCHEMES = ['light', 'dark'] as const;
const LOCALES = { en: 'en-GB', hu: 'hu-HU' } as const;
const SIGNED_IN_ROUTES = { prepare: '/prepare', practice: '/practice', you: '/you' };
const REST = `https://${STAGING_HOST}/rest/v1`;

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

/** Answers user_settings reads with the run's language and the System theme (see the header). */
async function pinSettings(page: Page, language: string) {
  await page.route(`${REST}/user_settings*`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const pin = (row: Record<string, unknown>) => ({
      ...row,
      ...('language' in row ? { language } : {}),
      ...('output_language' in row ? { output_language: language } : {}),
      ...('theme' in row ? { theme: 'system' } : {}),
    });
    const body: unknown = await response.json();
    const json = Array.isArray(body)
      ? body.map((row) => pin(row as Record<string, unknown>))
      : body && typeof body === 'object' ? pin(body as Record<string, unknown>) : body;
    await route.fulfill({ response, json });
  });
}

/** Waits until the screen's data has arrived, so no spinner is caught mid-load. */
async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => document.querySelectorAll('[role="progressbar"]').length === 0, undefined, { timeout: 15_000 });
}

async function shootDebateScreens(page: Page, prefix: string) {
  await page.goto(`${ORIGIN}/`);
  await page.getByTestId('current-debate-motion').waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="debate-counts"]')?.textContent?.includes('–'));
  await settle(page);
  await shoot(page, `${prefix}-debate`);
  // Both sides' work is already loaded, so the Against view needs no new request.
  await page.getByRole('tab', { name: /^(Against|Ellene|En contra)$/ }).click();
  await shoot(page, `${prefix}-debate-con`);

  await page.getByTestId('current-debate-pill').click();
  await page.getByTestId('debates-sheet').waitFor();
  await settle(page);
  // Let the sheet finish sliding in.
  await page.waitForTimeout(700);
  await shoot(page, `${prefix}-debates-sheet`);

  await page.getByRole('button', { name: /^(New debate|Új vita|Nuevo debate)$/ }).click();
  await page.getByTestId('new-debate-sheet').waitFor();
  await page.waitForTimeout(700);
  await shoot(page, `${prefix}-new-debate`);
}

// A made-up answer in the shape of mock 07, streamed a word at a time.
const ASK_QUESTION = 'How do I answer "what about the nurse who drives in at 5 a.m."?';
const ASK_STREAM = 'Concede the edge case, then shrink it. Three moves:\n\n1. **Exemptions exist.** Every real ban permits shift workers and carers.\n2. **Night buses follow demand.** Cities that closed their centres added routes in the first year.\n3. **Flip it.** The same nurse breathes the air on her walk from the car park.';
const ASK_CITED = {
  response: 'Two of your sources carry it.\n\n**Exemptions exist.** Every real ban permits shift workers and carers.\n\n**Night buses follow demand.** Cities that closed their centres added routes in the first year.',
  citations: [
    { claim: 'Every real ban permits shift workers and carers', source: 'City exemptions policy', verified: true },
    { claim: 'Cities that closed their centres added routes in the first year', source: 'Transit report https://example.org/transit-report', verified: true },
  ],
  followUpQuestions: [],
  uncertainties: [],
};
// The stream stops after this many words and stays open, so a shot can catch it mid-answer.
const STREAM_HOLD_WORDS = 34;

/** Fakes Ask's AI calls and chat writes for this page (see the header). Call before the first navigation. */
async function fakeAsk(page: Page, hold: boolean) {
  await page.addInitScript(({ text, holdAfter }) => {
    const realFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.endsWith('/functions/v1/ai-stream')) return realFetch(input, init);
      const words = text.split(/(?<= )/);
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          for (const word of holdAfter ? words.slice(0, holdAfter) : words) {
            await new Promise((resolve) => setTimeout(resolve, 15));
            controller.enqueue(encoder.encode(`event: delta\ndata: ${JSON.stringify({ text: word })}\n\n`));
          }
          if (holdAfter) return;
          const output = { response: text, followUpQuestions: [], uncertainties: [] };
          controller.enqueue(encoder.encode(`event: final\ndata: ${JSON.stringify({ output, meta: {} })}\n\n`));
          controller.close();
        },
      });
      return Promise.resolve(new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    };
  }, { text: ASK_STREAM, holdAfter: hold ? STREAM_HOLD_WORDS : 0 });
  await page.route(`https://${STAGING_HOST}/functions/v1/ai`, (route) =>
    route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, json: { output: ASK_CITED } }),
  );
  for (const table of ['chats', 'messages']) {
    await page.route(`${REST}/${table}*`, (route) =>
      route.request().method() === 'POST'
        ? route.fulfill({ status: 201, json: { id: '00000000-0000-4000-8000-00000000c4a7' } })
        : route.continue(),
    );
  }
}

async function shootLibraryScreens(page: Page, prefix: string) {
  await page.goto(`${ORIGIN}/library`);
  await page.getByTestId('library-add').waitFor({ timeout: 30_000 });
  await settle(page);
  await shoot(page, `${prefix}-library`);

  await page.getByTestId('library-add').click();
  await page.getByRole('menu').waitFor();
  await shoot(page, `${prefix}-library-menu`);
  await page.getByRole('menuitem').first().click();
  await page.getByTestId('add-link-sheet').waitFor();
  await page.waitForTimeout(700);
  await shoot(page, `${prefix}-add-link`);

  await page.goto(`${ORIGIN}/new-note`);
  await page.getByTestId('new-note-sheet').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(700);
  await shoot(page, `${prefix}-new-note`);

  await page.goto(`${ORIGIN}/library`);
  await page.getByTestId('source-row').first().click({ timeout: 30_000 });
  await page.getByTestId('source-sheet').getByRole('heading').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(700);
  await shoot(page, `${prefix}-source`);
}

async function shootAskScreens(context: BrowserContext, prefix: string, language: string, problems: string[]) {
  const ask = async (hold: boolean) => {
    const page = await context.newPage();
    watchErrors(page, problems, `${prefix} ask`);
    await pinSettings(page, language);
    await fakeAsk(page, hold);
    await page.goto(`${ORIGIN}/ask`);
    await page.getByTestId('ask-input').waitFor({ timeout: 30_000 });
    await settle(page);
    return page;
  };

  const empty = await ask(false);
  await shoot(empty, `${prefix}-ask-empty`);
  await empty.getByTestId('ask-input').fill(ASK_QUESTION);
  await empty.getByTestId('ask-send').click();
  await empty.getByTestId('ask-answer').waitFor({ timeout: 15_000 });
  await empty.getByRole('switch').first().click();
  await empty.getByTestId('ask-input').fill('Which of my sources back that up?');
  await empty.getByTestId('ask-send').click();
  await empty.getByTestId('ask-answer').nth(1).waitFor({ timeout: 15_000 });
  await empty.waitForTimeout(300);
  await shoot(empty, `${prefix}-ask-answer`);
  await empty.close();

  const streaming = await ask(true);
  await streaming.getByTestId('ask-input').fill(ASK_QUESTION);
  await streaming.getByTestId('ask-send').click();
  await streaming.getByTestId('ask-streaming').waitFor({ timeout: 15_000 });
  await streaming.waitForTimeout(STREAM_HOLD_WORDS * 15 + 600);
  await shoot(streaming, `${prefix}-ask-streaming`);
  await streaming.close();
}

async function shootEmptyDebate(page: Page, prefix: string) {
  await page.route(`${REST}/current_debates*`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', json: [] }),
  );
  await page.goto(`${ORIGIN}/`);
  await page.getByTestId('current-debate-pill').waitFor({ timeout: 30_000 });
  await settle(page);
  await shoot(page, `${prefix}-debate-empty`);
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
  // The tabs first render from storage. supabase-js's own first event comes
  // after its offline retries (about 30 s) and must not sign the user out.
  await page.getByTestId('auth-settled').waitFor({ state: 'attached', timeout: 60_000 });
  const settledMs = Date.now() - started;
  const tabsShown = await page.getByRole('tab', { name: 'Debate' }).isVisible();
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

  console.log(`offline cold start: tabs shown after ${offlineMs} ms, auth settled after ${settledMs} ms`);
  console.log(`after settling offline: tabs shown: ${tabsShown}, sign-in shown: ${signInShown}, session kept: ${stored}`);
  console.log(`back online: session refreshed: ${refreshed}`);
  if (!tabsShown || signInShown || !stored || !refreshed) throw new Error('Offline cold start signed the user out');
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
          if (!prefix.startsWith(ONLY)) continue;
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
          await pinSettings(tabPage, language);
          await shootDebateScreens(tabPage, prefix).catch(async (error: unknown) => {
            await shoot(tabPage, `${prefix}-failed`);
            throw error;
          });
          shots += 4;
          await shootLibraryScreens(tabPage, prefix).catch(async (error: unknown) => {
            await shoot(tabPage, `${prefix}-failed`);
            throw error;
          });
          shots += 5;
          for (const [name, route] of Object.entries(SIGNED_IN_ROUTES)) {
            await tabPage.goto(`${ORIGIN}${route}`);
            await tabPage.getByRole('tablist').first().waitFor();
            if (name === 'you') await tabPage.getByTestId('subscription-tier').waitFor({ timeout: 30_000 });
            await settle(tabPage);
            await shoot(tabPage, `${prefix}-${name}`);
            shots += 1;
          }
          const emptyPage = await signedIn.newPage();
          watchErrors(emptyPage, problems, `${prefix} empty`);
          await pinSettings(emptyPage, language);
          await shootEmptyDebate(emptyPage, prefix);
          shots += 1;
          await shootAskScreens(signedIn, prefix, language, problems);
          shots += 3;
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
