/**
 * Screenshots of the web export at iPhone and iPad sizes, light and dark,
 * English, Hungarian and Spanish, into .verify/mobile-shots/ at the repository root.
 * Every shot also lists the texts it cuts off, in clipped.json.
 * The web export is close to the native app but not the same: it has no
 * native tab bar, large titles, sheets or gestures.
 *
 *   npm run -w @debatelab/mobile export:web
 *   PORT=<free port> npx tsx apps/mobile/scripts/screenshots.ts
 *
 * ONLY=iphone-light-en limits a run to the combinations whose name starts with it;
 * separate several with commas (ONLY=iphone-light-en,ipad-dark-hu).
 * SCREENS=you,timer limits the signed-in screens to those groups: debate,
 * debate-check, library, prepare, practice, you, empty, ask, results, brainstorm,
 * factoids, case-edits, context, limits, sidebar, first-run, share,
 * timer, voice, tools, crossfire, sparring, flowchart, one-off, history, announcements,
 * account, model. Sign-in screens are always shot.
 * KEEP_GOING=1 carries on past a failed group (see groupFailed).
 * ONLY=offline runs only the offline reading check (see shootOfflineScreens).
 *
 * The iPad sizes are portrait (1024x1366), landscape (1366x1024), an 11-inch
 * iPad Air (820x1180 and 1180x820) and a 600-point window (Split View or Slide
 * Over), which takes the phone layout.
 *
 * Signed-in screens need a staging session. With STAGING_DEMO_CODE set, the
 * script signs in once through the real sign-in screen and also checks that a
 * cold start without a network keeps the user signed in. The deployed Edge
 * Functions only accept browser calls from a few origins, so for that run use
 * PORT=18080 (http://127.0.0.1:18080), or another port with
 * FUNCTIONS_ORIGIN=http://127.0.0.1:18080 (see newContext). Never print the
 * code or put it in a screenshot.
 *
 * Signed in, the app applies the account's saved language and theme, which
 * would override the locale and colour scheme under test. Screenshot runs
 * therefore answer the app's user_settings reads with the run's language and
 * the System theme; nothing is written. The Debate tab shows the account's
 * real Current Debate, and its empty state comes from answering the
 * current_debates read with no row. The Debate tab is shot once per side view,
 * and with one-off mode on, with and without a Current Debate; Prepare and
 * Generate are shot in one-off mode too. One-off mode is in memory only; the
 * script toggles it and never taps a debate row.
 *
 * Ask screenshots never call a model and never save a chat: the page answers
 * ai-stream from a fake stream inside the page (expo/fetch uses the page's
 * fetch), answers the ai function with a fixed answer with citations, and
 * answers chat and message writes locally.
 *
 * The Library screens read made-up sources (librarySources: four folders, a
 * source switched off, quality rankings) and answer every source and folder
 * write locally. File import picks the made-up PDF, DOCX and PNG in
 * scripts/fixtures through the page's file chooser, so the website's reader
 * (pdf.js and mammoth, the code the iOS DOM component runs) reads them for
 * real; the run checks the extracted text. Edit is shown, never saved.
 *
 * Every debates read is answered as active just now, so the five-day check
 * stays out of the shots; its own shot answers it as nine days idle and
 * never presses a button. Edit settings is shown, never saved.
 *
 * Generate and Attack screenshots never call a model and never save: the
 * page answers the ai function with a fixed case or attack, holds it open
 * for the "generating" shot, streams part of it from inside the page and
 * holds that open for the "-live" shot, and answers case, attack and source writes
 * locally. The PDF export's HTML (the web export cannot run expo-print) is
 * rendered in a page of its own, and the "Copy as text" output is written
 * next to the screenshots. Brainstorm and Factoids are shot the same way,
 * from a fixed brainstorm and fixed factoids, and save nothing.
 *
 * Crossfire screenshots never call a model and never save: the page answers
 * each turn, signal and debrief with fixed text in the run's language, and
 * answers the crossfire write locally.
 *
 * Sparring screenshots never call a model and never save: the page answers
 * each opponent turn and the judge with fixed text in the run's language
 * (holding them open for the "opponent" and "judging" shots), and answers
 * the attach_to_debate call locally. The run checks the turn-start taps. The
 * flow button's Flowchart reads the fixed maps described below.
 *
 * The Timer runs on Playwright's clock, so its minutes pass at once, and the
 * run checks that it signalled one beep at the last minute and two at time up.
 *
 * Flowchart screenshots read fixed saved maps: the page answers every
 * flowcharts read with two made-up maps in the website's React Flow shape (or
 * none for one-off work, which shows the starter map) and answers writes
 * locally. The one-off shot turns one-off mode on in memory, as the switcher
 * does, and never taps a debate row.
 *
 * History reads the account's real saved work for the Current Debate and
 * another debate, and the unsorted view answers its reads (rows with no debate)
 * with made-up work, one item suggesting the Current Debate. Add to debate is
 * shown, never pressed. The announcement banner comes from two made-up
 * announcements answered inside the page; its dismissal is answered locally.
 * You is shot down to its data rows; Download my data reads the account's real
 * export once (iphone-light-en) and writes only its top-level keys next to the
 * screenshots. The Delete all my data sheet is shot empty and never confirmed.
 * The model picker in Generate is shot with its menu open; no model is chosen,
 * so feature_configs is never written.
 */
import { chromium, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from '@playwright/test';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';

import { SUPABASE_PROJECTS } from '../../../src/lib/supabase/projects';

type StorageState = Exclude<BrowserContextOptions['storageState'], string | undefined>;

const DIST = join(__dirname, '../dist');
// SHOTS_DIR moves the screenshots elsewhere, e.g. for a before/after set.
const OUT = process.env.SHOTS_DIR || join(__dirname, '../../../.verify/mobile-shots');
const PORT = Number(process.env.PORT);
const DEMO_CODE = process.env.STAGING_DEMO_CODE?.trim();
const ONLY = (process.env.ONLY ?? '').split(',').map((value) => value.trim()).filter((value) => value.length > 0);
const offlineOnly = ONLY.length === 1 && ONLY[0] === 'offline';
const SCREENS = process.env.SCREENS?.split(',').map((name) => name.trim()).filter(Boolean);
const want = (group: string) => !SCREENS?.length || SCREENS.includes(group);
const ORIGIN = `http://127.0.0.1:${PORT}`;
const STAGING_HOST = new URL(SUPABASE_PROJECTS.staging.url).host;
const SESSION_KEY = `sb-${STAGING_HOST.split('.')[0]}-auth-token`;

const DEVICES = {
  iphone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
  ipad: { viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'ipad-landscape': { viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'ipad-narrow': { viewport: { width: 600, height: 1366 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  // An 11-inch iPad Air: portrait takes the regular layout, landscape the wide one.
  'ipad-air': { viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  'ipad-air-landscape': { viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
} as const;
const SCHEMES = ['light', 'dark'] as const;
// Spanish runs use the English fake model text; only the interface is Spanish.
const LOCALES = { en: 'en-GB', hu: 'hu-HU', es: 'es-ES' } as const;
const SIGNED_IN_ROUTES = { prepare: '/prepare', practice: '/practice', you: '/you' };
const NOTIFICATIONS = { en: 'Notifications', hu: 'Értesítések', es: 'Notificaciones' } as const;
// The Timer format menu's custom format entry.
const TIMER_NEW_FORMAT = { en: 'Build a custom format', hu: 'Saját formátum készítése', es: 'Crear un formato personalizado' } as const;
const REST = `https://${STAGING_HOST}/rest/v1`;

/**
 * The deployed Edge Functions answer browser calls only from a few origins
 * (supabase/functions/_shared/cors.ts), 127.0.0.1:18080 among them. When
 * several worktrees take screenshots at once, set FUNCTIONS_ORIGIN to that
 * origin and use any PORT: each function call the page makes is sent again
 * from Node with that Origin and its answer handed back to the page. Staging only.
 */
const FUNCTIONS_ORIGIN = process.env.FUNCTIONS_ORIGIN;

/**
 * FONT_SCALE draws a Dynamic Type size (src/theme/font-scale.web.ts): 3.1 is
 * iOS's largest accessibility size for body text. Use it with SHOTS_DIR, so
 * the large-text shots do not replace the usual ones.
 */
const FONT_SCALE = Number(process.env.FONT_SCALE ?? '1');

/**
 * Screenshots show each screen at rest: contexts prefer reduced motion, which the app's
 * animations follow (Reanimated and react-native-web read prefers-reduced-motion), so
 * confetti, count-ups, entrances and springs land at once. MOTION=1 plays them; with
 * RECORD_DIR set, every page is also recorded as a video there.
 */
const MOTION = process.env.MOTION === '1';
const RECORD_DIR = process.env.RECORD_DIR;

async function newContext(browser: Browser, options: BrowserContextOptions): Promise<BrowserContext> {
  const context = await browser.newContext({
    reducedMotion: MOTION ? 'no-preference' : 'reduce',
    ...(RECORD_DIR && options.viewport ? { recordVideo: { dir: RECORD_DIR, size: options.viewport } } : {}),
    ...options,
  });
  if (FONT_SCALE > 0 && FONT_SCALE !== 1) {
    await context.addInitScript((scale) => {
      (window as unknown as { __debateowlFontScale?: number }).__debateowlFontScale = scale;
    }, FONT_SCALE);
  }
  if (FUNCTIONS_ORIGIN && FUNCTIONS_ORIGIN !== ORIGIN) {
    // Context routes run after page routes, so a page that fakes a function keeps its fake.
    await context.route(`https://${STAGING_HOST}/functions/v1/**`, async (route) => {
      const request = route.request();
      const cors = { 'access-control-allow-origin': ORIGIN, 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS', vary: 'Origin' };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      // A page that closes mid-call ends the relay quietly: Playwright's error would print the request's headers, session included.
      try {
        const response = await route.fetch({ headers: { ...request.headers(), origin: FUNCTIONS_ORIGIN } });
        await route.fulfill({ response, headers: { ...response.headers(), ...cors } });
      } catch {
        await route.abort().catch(() => undefined);
      }
    });
  }
  return context;
}

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
    // A dynamic route such as /case/<id> is exported once, as case/[id].html (share/[code].html for /share/<code>).
    const candidates = [join(DIST, path), join(DIST, `${path}.html`), join(DIST, path, 'index.html'), join(DIST, dirname(path), '[id].html'), join(DIST, dirname(path), '[code].html')];
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

/**
 * Fails the run on page errors and console errors, which leave plausible-looking but broken screenshots.
 * While `offline()` is true, the browser's own "Failed to load resource" errors are expected.
 */
function watchErrors(page: Page, problems: string[], label: string, offline = () => false) {
  // A project without the App Store migration answers the plan's App Store
  // read with a 404 (PGRST205), which the plan reader takes as no App Store
  // rows. The browser logs each one; only those are expected.
  let appStoreMisses = 0;
  page.on('response', (response) => {
    if (response.status() === 404 && response.url().includes('/rest/v1/app_store_subscriptions')) appStoreMisses += 1;
  });
  page.on('pageerror', (error) => { if (process.env.SHOT_DEBUG) console.error('PAGEERROR', label, error.stack); problems.push(`${label}: ${error.message}`); });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (offline() && message.text().startsWith('Failed to load resource')) return;
    if (appStoreMisses > 0 && message.text().includes('status of 404')) {
      appStoreMisses -= 1;
      return;
    }
    problems.push(`${label}: ${message.text()}`);
  });
}

/** Texts cut off in each shot (see clippedTexts), written to clipped.json at the end of the run. */
const clipped: Record<string, string[]> = {};

/**
 * React Native Web draws a truncated <Text> with an ellipsis or a line clamp;
 * this lists every such text that does not fit, so a run reports clipping
 * instead of leaving it to the eye. Some truncation is by design (a long title
 * in a one-line row); the list says which.
 */
async function clippedTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const cut: string[] = [];
    for (const element of Array.from(document.querySelectorAll<HTMLElement>('div, span'))) {
      const style = getComputedStyle(element);
      const ellipsis = style.textOverflow === 'ellipsis' && element.scrollWidth > element.clientWidth + 1;
      const clamped = style.webkitLineClamp !== 'none' && style.webkitLineClamp !== '' && element.scrollHeight > element.clientHeight + 1;
      if ((ellipsis || clamped) && element.offsetParent !== null && element.textContent?.trim()) cut.push(element.textContent.trim().slice(0, 80));
    }
    return Array.from(new Set(cut));
  });
}

async function shoot(page: Page, name: string) {
  // Let fonts and the colour scheme settle after hydration.
  await page.evaluate(() => document.fonts.ready);
  const cut = await clippedTexts(page);
  if (cut.length > 0) clipped[name] = cut;
  // The Delete all my data field shows the email as its placeholder, as on the website.
  await page.screenshot({ path: join(OUT, `${name}.png`), mask: [page.getByTestId('account-email'), page.getByTestId('delete-data-confirmation')] });
}

/**
 * A finished round or a new case, attack, brainstorm or factoids result opens under its celebration: shoot it as `name`, then tap it away
 * (unless it already went on its own) and wait until the screen underneath is clear.
 */
async function shootCelebration(page: Page, name: string) {
  const celebration = page.getByTestId('celebration');
  await celebration.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(400);
  await shoot(page, name);
  await celebration.click({ timeout: 2_000 }).catch(() => {});
  await celebration.waitFor({ state: 'detached', timeout: 5_000 });
}

/** Answers user_settings reads with the run's language and the System theme (see the header). */
async function pinSettings(page: Page, language: string) {
  await pinDebateActivity(page, 0);
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

/**
 * Answers the debates list with every debate last active `ageMs` ago, so the
 * five-day check opens only in its own shot. Nothing is written.
 */
async function pinDebateActivity(page: Page, ageMs: number) {
  await page.route(`${REST}/debates?*`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    const response = await route.fetch();
    const body: unknown = await response.json();
    const json = Array.isArray(body) ? body.map((row) => ({ ...(row as Record<string, unknown>), last_activity_at: iso(-ageMs) })) : body;
    await route.fulfill({ response, json });
  });
}

/** Waits until the screen's data has arrived, so no spinner is caught mid-load. */
/** The app's navigation: the tab bar on iPhone and in Split View, the sidebar in a full-screen iPad window. */
const appShell = (page: Page) => page.locator(':is([data-testid="app-tab-bar"], [data-testid="app-sidebar"]):visible').first();

/** Opens a Prepare tool the way the layout offers it: from the iPad sidebar, or from the Prepare tab's tile. */
async function openPrepareTool(page: Page, tool: string) {
  const sidebar = page.getByTestId('app-sidebar');
  if (await sidebar.isVisible()) {
    await sidebar.getByTestId(`sidebar-item-${tool}`).click();
    return;
  }
  if (!(await page.getByTestId(`prepare-tool-${tool}`).filter({ visible: true }).isVisible())) {
    await page.getByRole('tab', { name: /^(Prepare|Felkészülés|Preparar)$/ }).click();
  }
  await page.getByTestId(`prepare-tool-${tool}`).filter({ visible: true }).click();
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle');
  // Only what shows: a screen opened from a link has the Debate tab mounted, unfocused, beneath it,
  // and that tab loads only once it is shown.
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('[role="progressbar"]')).every((el) => !(el as HTMLElement).checkVisibility()),
    undefined,
    { timeout: 15_000 },
  );
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

  // One-off mode lives in memory only, so toggling it writes nothing. Never tap a debate row
  // here: switching saves the pointer and last activity to staging.
  await turnOnOneOff(page);
  await shoot(page, `${prefix}-debates-oneoff`);
  await closeSwitcher(page);
  await page.getByTestId('one-off-notice').waitFor();
  await shoot(page, `${prefix}-debate-oneoff`);
  await page.getByTestId('one-off-notice').getByRole('button').click();
  await page.getByTestId('one-off-notice').waitFor({ state: 'detached' });

  await page.getByTestId('current-debate-pill').click();
  await page.getByTestId('debates-sheet').waitFor();
  await page.getByRole('button', { name: /^(New debate|Új vita|Nuevo debate)$/ }).click();
  await page.getByTestId('new-debate-sheet').waitFor();
  await page.waitForTimeout(700);
  await shoot(page, `${prefix}-new-debate`);
  await shootSheetEnd(page, 'new-debate-sheet', `${prefix}-new-debate-end`);

  // Edit settings is shown, never saved: saving would write the account's debate.
  await page.goto(`${ORIGIN}/`);
  await page.getByTestId('edit-debate').click({ timeout: 30_000 });
  await page.getByTestId('edit-debate-sheet').waitFor();
  await page.waitForTimeout(700);
  await shoot(page, `${prefix}-edit-debate`);
  await shootSheetEnd(page, 'edit-debate-sheet', `${prefix}-edit-debate-end`);
}

/**
 * Shows the end of a long sheet. The web preview draws sheets as pages that
 * grow with their content, so it scrolls what scrolls and, where nothing
 * does, makes the window tall enough for the whole sheet for one shot.
 */
async function shootSheetEnd(page: Page, testId: string, name: string) {
  await scrollToEnd(page, testId);
  const viewport = page.viewportSize();
  const height = await page.getByTestId(testId).evaluate((element) => element.scrollHeight);
  if (viewport && height > viewport.height) await page.setViewportSize({ width: viewport.width, height: Math.ceil(height) + 40 });
  await page.waitForTimeout(300);
  await shoot(page, name);
  if (viewport) await page.setViewportSize(viewport);
}

/** Scrolls a sheet's own scroll view to its end; the web preview draws sheets as pages. */
async function scrollToEnd(page: Page, testId: string) {
  // The sheet's own scroll view, or the page or a wrapper around it, whichever scrolls at this size.
  await page.getByTestId(testId).evaluate((root) => {
    const candidates = [document.scrollingElement, root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
    for (let element = root.parentElement; element; element = element.parentElement) candidates.push(element);
    for (const element of candidates) {
      if (element && element.scrollHeight > element.clientHeight + 1) element.scrollTo({ top: element.scrollHeight });
    }
  });
  await page.waitForTimeout(300);
}

/**
 * The five-day check, from a debates list answered as nine days idle. Its
 * buttons are shown, never pressed: Continue would write the debate's activity.
 */
async function shootDebateCheck(context: BrowserContext, prefix: string, language: string, problems: string[]) {
  const page = await context.newPage();
  watchErrors(page, problems, `${prefix} debate check`);
  await pinSettings(page, language);
  // Registered last, so it answers before pinSettings' recent activity.
  await pinDebateActivity(page, 9 * 86_400_000);
  // Closing the sheet would count as Continue, so the page is closed without it ever being dismissed.
  await page.route(`${REST}/debates?*`, (route) => (route.request().method() === 'PATCH' ? route.fulfill({ status: 204, headers: CORS }) : route.fallback()));
  await page.goto(`${ORIGIN}/`);
  await page.getByTestId('debate-check-sheet').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(700);
  await shoot(page, `${prefix}-debate-check`);
  await page.close();
}

async function turnOnOneOff(page: Page) {
  const toggle = page.getByTestId('debates-sheet').getByRole('switch');
  await toggle.click();
  if (!(await toggle.isChecked())) throw new Error('The one-off switch did not turn on');
}

async function closeSwitcher(page: Page) {
  await page.getByTestId('debates-sheet').getByRole('button', { name: /^(Done|Kész|Listo)$/ }).click();
  await page.getByTestId('debates-sheet').waitFor({ state: 'detached' });
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

// A made-up case in GenerateOutput's shape, after mock 03: three arguments for a Standard case.
// A made-up case in the new format (#244): opening, titled arguments, "If they say…", closing line and sources.
const FAKE_CASE = {
  opening: {
    hook: 'Picture a school run where the loudest thing on the street is children talking.',
    definition: 'City centre: the area inside the inner ring road, with exemptions for disabled drivers and deliveries.',
  },
  caseStructure: {
    thesis: 'We will show three arguments that prove city centres work better for everyone without private cars: cleaner air, streets back for people, and buses that run on time.',
  },
  contentions: [
    {
      id: '1',
      title: 'Clean air',
      claim: 'Clean air is a public health duty',
      reasoning: 'Traffic is the largest source of roadside pollution, and the people who breathe it most are pedestrians, cyclists and residents, not drivers.',
      evidence: 'Low-traffic zones cut roadside NO₂ within their first year, according to the Clean Streets Review.',
      needsSource: false,
      impact: 'Fewer asthma admissions among children who live and study in the centre.',
    },
    {
      id: '2',
      title: 'Streets back for people',
      claim: 'Cars take most of the street while carrying a minority of the people in it',
      reasoning: 'Parked and moving cars take most of a centre\'s street space while carrying a minority of the people in it.',
      evidence: 'The Street Space Audit found cars use most of the road area; the Footfall Study found shops gain visits when streets close to traffic.',
      needsSource: false,
      impact: 'Wider pavements, more seating and safer crossings for everyone.',
    },
    {
      id: '3',
      title: 'Buses on time',
      claim: 'Transit works when it isn\'t stuck in traffic',
      reasoning: 'Buses lose most of their delay to congestion caused by private cars.',
      evidence: 'Bus journeys became quicker and more reliable after the centre closed to through traffic, per the Clean Streets Review.',
      needsSource: false,
      impact: 'Faster, more reliable buses make the ban fair to people who cannot walk or cycle.',
    },
  ],
  counters: [
    { targetArgument: 'Shift workers and carers need cars at night', counterpoint: 'Every real ban exempts carers and shift workers, and night buses follow demand.', source: 'Clean Streets Review' },
    { targetArgument: 'Shops lose customers who drive in', counterpoint: 'Footfall rose when streets closed to traffic: people on foot shop more often than drivers.', source: 'Footfall Study' },
    { targetArgument: 'It just moves traffic to the suburbs', counterpoint: 'Through traffic falls overall when the centre closes, because some trips stop being made by car at all.' },
  ],
  closingLine: 'A city centre should belong to the people in it, not the cars passing through it.',
  sources: [
    { org: 'Clean Streets Review', year: '2025', claim: 'Low-traffic zones cut roadside NO₂ within a year', url: 'https://example.org/clean-streets' },
    { org: 'Street Space Audit', year: '2024', claim: 'Cars use most of the road area in city centres', url: 'https://example.org/street-space' },
    { org: 'Footfall Study', claim: 'Shops gain visits when streets close to traffic', url: 'https://example.org/footfall' },
  ],
  metadata: {
    side: 'pro',
    format: 'custom',
    generatedAt: '2026-10-09T16:43:00.000Z',
    model: 'test-model',
    provider: 'openrouter',
    durationMs: 41200,
    sourceUsage: [
      { key: 'https://example.org/clean-streets', title: 'Clean Streets Review', origin: 'https://example.org/clean-streets', importance: 3, strength: 3, probability: 0.9, judgment: 'used' },
      { key: 'https://example.org/street-space', title: 'Street Space Audit', origin: 'https://example.org/street-space', importance: 2, strength: 2, probability: 0.8, judgment: 'used' },
      { key: 'https://example.org/footfall', title: 'Footfall Study', origin: 'https://example.org/footfall', importance: 2, strength: 2, probability: 0.7, judgment: 'used' },
    ],
  },
};
const FAKE_SOURCES = [
  { title: 'Clean Streets Review', url: 'https://example.org/clean-streets', content: 'Made up for screenshots.', qualityLabel: 'strong', qualityScore: 82 },
  { title: 'Footfall Study', url: 'https://example.org/footfall', content: 'Made up for screenshots.', qualityLabel: 'moderate', qualityScore: 64 },
];
// A made-up attack in AttackOutput's shape.
const FAKE_ATTACK = {
  overallAssessment: {
    score: 64,
    summary: 'A clear case with strong health evidence, but it leans on exemptions it never defines.',
    strengthAreas: ['Concrete health impact', 'Good use of the street space argument'],
  },
  weaknesses: [
    { id: 'w1', severity: 'critical', type: 'evidential', description: 'Exemptions are assumed, not shown', whyWeak: 'The case says carers and shift workers are exempt but never says how.', howOpponentAttacks: 'Who checks the exemptions, and what happens to the nurse at 5 a.m.?', improvedVersion: 'Name a real scheme and say how its exemptions work.', affectedQuote: 'Every real ban exempts carers' },
    { id: 'w2', severity: 'major', type: 'logical', description: 'Footfall gains may not transfer', whyWeak: 'One study of one city does not prove shops gain everywhere.', howOpponentAttacks: 'Your study is one city with a metro.', improvedVersion: 'Compare two centres of different sizes.' },
    { id: 'w3', severity: 'minor', type: 'structural', description: 'Impact of the third argument is thin', whyWeak: 'It restates the claim.', howOpponentAttacks: 'So what if buses are faster?', improvedVersion: 'Tie faster buses to who can reach jobs.' },
  ],
  fallaciesDetected: [{ name: 'Hasty generalisation', location: 'Argument 2', explanation: 'One city stands in for all cities.' }],
  crossExQuestions: [{ question: 'How many people would need an exemption?', purpose: 'Test the size of the carve-out', expectedTrap: 'A large number undercuts the health benefit' }],
  weighingAnalysis: { currentWeighing: 'Health outweighs convenience.', missingComparisons: ['Cost to low-income drivers'], improvementSuggestions: ['Weigh by number of people affected'] },
};
const FAKE_ROW = (table: string) => ({
  id: table === 'sources' ? '00000000-0000-4000-8000-0000000050c0' : '00000000-0000-4000-8000-00000000ca5e',
  title: 'fake',
  content: '',
  type: 'url',
  origin: null,
  metadata: null,
  created_at: new Date().toISOString(),
});

// A made-up brainstorm in the shape the model returns (Top 5), before the website's transform.
const FAKE_BRAINSTORM = {
  needsMoreInfo: false,
  topFive: [
    { rank: 1, whyTop: 'It turns a convenience debate into a health one.', idea: { id: 'a', title: 'Cleaner air for children', description: 'Traffic fumes peak at school gates; closing centres to cars cuts them where children walk.', side: 'pro', strength: 'strong', tradeoffs: ['Needs air-quality data'], relatedTo: [] } },
    { rank: 2, whyTop: 'Shops are the opposition’s strongest group.', idea: { id: 'b', title: 'Footfall helps local shops', description: 'People on foot stop more often than drivers passing through.', side: 'pro', strength: 'moderate', tradeoffs: ['Evidence varies by city size'], relatedTo: [] } },
    { rank: 3, whyTop: 'Pre-empts the fairness attack.', idea: { id: 'c', title: 'Who loses access', description: 'Carers, disabled drivers and night-shift workers rely on cars.', side: 'con', strength: 'strong', tradeoffs: [], relatedTo: [] } },
    { rank: 4, whyTop: 'A cheap, concrete mechanism.', idea: { id: 'd', title: 'Faster buses', description: 'Empty streets let buses keep to their timetable.', side: 'pro', strength: 'moderate', tradeoffs: [], relatedTo: [] } },
    { rank: 5, whyTop: 'Frames the debate on space, not cars.', idea: { id: 'e', title: 'Street space as a public good', description: 'Parking takes space that could be parks or cafés.', side: 'neutral', strength: 'weak', tradeoffs: ['Abstract for some judges'], relatedTo: [] } },
  ],
  nextSteps: ['Find one city that closed its centre and measured the air', 'Prepare an answer on exemptions'],
  warningsAndTradeoffs: ['The footfall evidence comes from large cities.'],
};
// Made-up factoids: three verified, one unverified that the website's selection drops.
const FAKE_FACTOIDS = {
  factoids: [
    { id: 'f1', shortClaim: 'Asthma admissions fell after a city centre closed to cars', keyFigure: '−12% in two years', context: 'A made-up city compared admissions before and after its car-free zone.', limitations: 'One city; other changes happened at the same time.', citation: { title: 'Clean Streets Review', publisher: 'Example Health Institute', date: '2024', url: 'https://example.org/clean-streets', verified: 'verified' }, howToUse: 'Lead with it in the first argument.', relevanceScore: 92 },
    { id: 'f2', shortClaim: 'Shops in pedestrian streets report more visits', keyFigure: '+18% footfall', context: 'Counts on three streets before and after closure.', limitations: 'Weekday counts only.', citation: { title: 'Footfall Study', publisher: 'Example Retail Council', date: '2023', url: 'https://example.org/footfall', verified: 'verified' }, howToUse: 'Answer the shopkeepers’ objection.', relevanceScore: 81 },
    { id: 'f3', shortClaim: 'Buses ran closer to their timetable', keyFigure: '4 minutes saved per trip', context: 'Average delay on routes through the centre.', limitations: 'Peak hours only.', citation: { title: 'Transit Report', publisher: 'Example Transport Board', url: 'https://example.org/transit-report', verified: 'verified' }, howToUse: 'Use it for the access argument.', relevanceScore: 74 },
    { id: 'f4', shortClaim: 'An unverified claim', keyFigure: '?', context: '', limitations: '', citation: { title: 'Unknown', publisher: 'Unknown', verified: 'unverified' }, howToUse: '', relevanceScore: 10 },
  ],
  searchSuggestions: ['car-free city centre asthma study', 'pedestrian zone retail footfall'],
  warnings: ['Most studies come from large European cities.'],
  verificationStatus: 'complete',
};

type FakeFeature = 'generate' | 'brainstorm' | 'factoids';

const FAKE_OUTPUTS: Record<string, { output: unknown; discoveredSources: unknown[] }> = {
  generate: { output: FAKE_CASE, discoveredSources: FAKE_SOURCES },
  attack: { output: FAKE_ATTACK, discoveredSources: [] },
  brainstorm: { output: FAKE_BRAINSTORM, discoveredSources: FAKE_SOURCES },
  factoids: { output: FAKE_FACTOIDS, discoveredSources: FAKE_SOURCES },
};
// The live stream writes this share of the answer's JSON, then stays open.
const LIVE_HOLD_SHARE = 0.55;

/**
 * Answers `feature`'s streamed request inside the page (expo/fetch uses the
 * page's fetch) the way the ai function streams: research, then writing,
 * then part of the answer's JSON a few characters at a time, and then it
 * stays open, so a shot catches the live draft. Call before the first navigation.
 */
async function fakeLiveStream(page: Page, feature: FakeFeature) {
  const text = JSON.stringify(FAKE_OUTPUTS[feature].output);
  await page.addInitScript(({ name, partial }) => {
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.endsWith('/functions/v1/ai')) return realFetch(input, init);
      // expo/fetch may hand over a Request rather than a body.
      const text = typeof init?.body === 'string' ? init.body : input instanceof Request ? await input.clone().text() : '';
      const body = text ? (JSON.parse(text) as { feature?: string; stream?: boolean }) : null;
      if (body?.feature !== name || !body.stream) return realFetch(input, init);
      // No named helper functions here: tsx wraps them in a __name call the page does not have.
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encoder.encode('event: phase\ndata: {"phase":"research"}\n\n'));
          await new Promise((resolve) => setTimeout(resolve, 150));
          controller.enqueue(encoder.encode('event: phase\ndata: {"phase":"writing"}\n\n'));
          for (let index = 0; index < partial.length; index += 40) {
            await new Promise((resolve) => setTimeout(resolve, 5));
            controller.enqueue(encoder.encode(`event: delta\ndata: ${JSON.stringify({ text: partial.slice(index, index + 40) })}\n\n`));
          }
        },
      });
      return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
    };
  }, { name: feature, partial: text.slice(0, Math.floor(text.length * LIVE_HOLD_SHARE)) });
}

/**
 * Fakes the tools' AI calls and saves for this page (see the header). `hold` keeps that tool
 * waiting; with `live`, it writes part of its answer first (fakeLiveStream).
 */
async function fakeResults(page: Page, hold: FakeFeature | null, live = false) {
  const outputs = FAKE_OUTPUTS;
  if (hold && live) await fakeLiveStream(page, hold);
  await page.route(`https://${STAGING_HOST}/functions/v1/ai`, async (route) => {
    const body = route.request().postDataJSON() as { feature?: string; quotaCheck?: boolean } | null;
    const feature = body?.feature;
    // Crossfire, opened from a case or an attack, asks what a round costs.
    if (body?.quotaCheck) return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, json: FAKE_QUOTA });
    if (feature && feature === hold) return; // Never answered: the page shows its progress state.
    const json = feature ? outputs[feature] : undefined;
    if (json) return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, json });
    return route.abort();
  });
  for (const table of ['cases', 'attacks', 'brainstorms', 'factoids', 'sources', 'source_folders']) {
    await page.route(`${REST}/${table}*`, (route) =>
      route.request().method() === 'POST' ? route.fulfill({ status: 201, json: FAKE_ROW(table) }) : route.continue(),
    );
  }
}

/** Prepare, Generate, the case document, Export and Attack, all from fixed outputs (see the header). */
async function shootResultScreens(context: BrowserContext, prefix: string, language: string, problems: string[]) {
  const open = async (hold: boolean) => {
    const page = await context.newPage();
    watchErrors(page, problems, `${prefix} results`);
    page.on('dialog', (dialog) => void dialog.dismiss());
    await pinSettings(page, language);
    await fakeResults(page, hold ? 'generate' : null);
    return page;
  };

  const waiting = await open(true);
  await waiting.goto(`${ORIGIN}/prepare`);
  await waiting.getByTestId('prepare-tool-generate').waitFor({ timeout: 30_000 });
  await settle(waiting);
  await shoot(waiting, `${prefix}-prepare`);
  await waiting.getByTestId('prepare-tool-generate').click();
  await waiting.getByTestId('generate-motion').waitFor({ timeout: 30_000 });
  await waiting.waitForFunction(() => (document.querySelector('[data-testid="generate-motion"]') as HTMLTextAreaElement | null)?.value.trim());
  await shoot(waiting, `${prefix}-generate-form`);
  await waiting.getByRole('button', { name: /^(Generate debate case|Vitaeset generálása|Generar caso de debate)$/i }).click();
  await waiting.getByTestId('tool-progress').waitFor({ timeout: 15_000 });
  await shoot(waiting, `${prefix}-generating`);
  await waiting.close();

  const writing = await context.newPage();
  watchErrors(writing, problems, `${prefix} results live`);
  writing.on('dialog', (dialog) => void dialog.dismiss());
  await pinSettings(writing, language);
  await fakeResults(writing, 'generate', true);
  await writing.goto(`${ORIGIN}/generate?from=prepare`);
  await writing.getByTestId('generate-motion').waitFor({ timeout: 30_000 });
  await writing.waitForFunction(() => (document.querySelector('[data-testid="generate-motion"]') as HTMLTextAreaElement | null)?.value.trim());
  await writing.getByRole('button', { name: /^(Generate debate case|Vitaeset generálása|Generar caso de debate)$/i }).click();
  await writing.getByTestId('live-draft').waitFor({ timeout: 15_000 });
  await writing.waitForTimeout(1200);
  await shoot(writing, `${prefix}-generating-live`);
  await writing.close();

  const page = await open(false);
  await page.goto(`${ORIGIN}/generate?from=prepare`);
  await page.getByTestId('generate-motion').waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => (document.querySelector('[data-testid="generate-motion"]') as HTMLTextAreaElement | null)?.value.trim());
  await page.getByRole('button', { name: /^(Generate debate case|Vitaeset generálása|Generar caso de debate)$/i }).click();
  await shootCelebration(page, `${prefix}-case-celebration`);
  await page.getByTestId('case-document').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(400);
  await shoot(page, `${prefix}-case`);
  // A wide iPad shows the outline rail: jumping to a part scrolls that part's heading to the top of the case.
  const outline = page.getByTestId('document-outline');
  if (await outline.isVisible()) {
    // A part far enough from the end of the case to reach the top.
    const part = /^(If they say…|Ha azt mondják…|Si dicen…)$/;
    const heading = page.getByTestId('case-document').getByRole('heading', { name: part });
    const before = (await heading.boundingBox())?.y ?? 0;
    await outline.getByRole('menuitem').filter({ hasText: part }).click();
    await page.waitForTimeout(800);
    const after = (await heading.boundingBox())?.y ?? 0;
    if (!(after < before && after < 200)) throw new Error(`The outline did not scroll to If they say (heading at ${before}, then ${after})`);
    await shoot(page, `${prefix}-case-outline`);
  }
  // Close the open argument, so every argument shows collapsed.
  await page.getByTestId('document-item').first().click();
  await shoot(page, `${prefix}-case-collapsed`);
  await page.getByTestId('document-item').first().click();

  await page.getByTestId('export-button').click();
  await page.getByTestId('export-menu').waitFor();
  await shoot(page, `${prefix}-export-menu`);
  await page.getByTestId('export-menu').getByRole('menuitem').first().click();
  await page.getByTestId('export-button').click();
  await page.getByTestId('export-menu').getByRole('menuitem').nth(1).click();
  const exported = await page.evaluate(() => (window as unknown as { __debatelabExport?: { html?: string; fileName?: string; copied?: string } }).__debatelabExport ?? {});
  if (!exported.html || !exported.copied) throw new Error('Export did not hand over the PDF HTML or the copied text');
  await writeFile(join(OUT, `${prefix}-case-copy.txt`), exported.copied);
  const pdf = await context.newPage();
  await pdf.setViewportSize({ width: 794, height: 1123 });
  await pdf.setContent(exported.html);
  await pdf.screenshot({ path: join(OUT, `${prefix}-case-pdf-html.png`), fullPage: true });
  await pdf.close();
  console.log(`${prefix}: PDF file name ${exported.fileName}, copied ${exported.copied.length} characters`);

  // The case's menu leads on: Open in Crossfire with the case filled in, and the case built into a map.
  // Nothing is saved: the Crossfire form is not started and the map is not saved.
  // A wide iPad's outline rail is a menu too; the action menu is the one with the actions.
  const caseMenu = page.getByRole('menu').filter({ has: page.getByRole('menuitem', { name: MENU.crossfire }) });
  await page.getByTestId('document-more').click();
  await caseMenu.waitFor();
  await shoot(page, `${prefix}-case-menu`);
  await caseMenu.getByRole('menuitem', { name: MENU.crossfire }).click();
  await page.getByTestId('crossfire-imported').waitFor({ timeout: 15_000 });
  await settle(page);
  await shoot(page, `${prefix}-crossfire-from-case`);
  await page.goBack();
  await page.getByTestId('case-document').waitFor({ timeout: 15_000 });
  await page.getByTestId('document-more').click();
  await caseMenu.getByRole('menuitem', { name: MENU.flowchart }).click();
  await page.getByTestId('flowchart-screen').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await shoot(page, `${prefix}-flowchart-from-case`);
  await page.goBack();
  await page.getByTestId('case-document').waitFor({ timeout: 15_000 });

  await page.getByTestId('attack-this-case').click();
  await page.getByTestId('attack-case-text').waitFor({ timeout: 15_000 });
  await page.waitForFunction(() => (document.querySelector('[data-testid="attack-case-text"]') as HTMLTextAreaElement | null)?.value.startsWith('OPENING:'));
  await shoot(page, `${prefix}-attack-form`);
  await page.getByRole('button', { name: /^(Find weaknesses|Gyengeségek keresése|Encontrar debilidades)$/i }).click();
  await page.getByTestId('attack-document').waitFor({ timeout: 30_000 });
  await shootCelebration(page, `${prefix}-attack-celebration`);
  await page.waitForTimeout(400);
  await shoot(page, `${prefix}-attack-result`);
  // The case stays mounted under the attack, so its menu is looked up inside the attack.
  await page.getByTestId('attack-document').getByTestId('document-more').click();
  await page.getByRole('menuitem', { name: MENU.crossfire }).last().click();
  await page.getByTestId('crossfire-imported').waitFor({ timeout: 15_000 });
  // Not settle(): the attack's score meter (a progressbar) stays mounted under Crossfire.
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
  await shoot(page, `${prefix}-crossfire-from-attack`);
  await page.close();
}

const TOOLS = {
  brainstorm: { field: 'brainstorm-motion', submit: /^(Start brainstorming|Ötletelés indítása|Comenzar lluvia de ideas)$/i, document: 'brainstorm-document', working: 'brainstorming' },
  factoids: { field: 'factoids-claim', submit: /^(Find factoids|Tények keresése|Buscar datos)$/i, document: 'factoids-document', working: 'finding-factoids' },
} as const;
const FACTOIDS_CLAIM = 'Car-free city centres cut asthma admissions';

/** Brainstorm or Factoids: the form, its progress, the document open and collapsed, and Export, from fixed outputs. */
async function shootTool(context: BrowserContext, prefix: string, language: string, problems: string[], tool: keyof typeof TOOLS) {
  const spec = TOOLS[tool];
  const open = async (hold: boolean, live = false) => {
    const page = await context.newPage();
    watchErrors(page, problems, `${prefix} ${tool}`);
    page.on('dialog', (dialog) => void dialog.dismiss());
    await pinSettings(page, language);
    await fakeResults(page, hold ? tool : null, live);
    await page.goto(`${ORIGIN}/prepare`);
    await page.getByTestId(`prepare-tool-${tool}`).waitFor({ timeout: 30_000 });
    await settle(page);
    await page.getByTestId(`prepare-tool-${tool}`).click();
    await page.getByTestId(spec.field).waitFor({ timeout: 30_000 });
    // Brainstorm takes the Current Debate's motion; Factoids research a claim the student types.
    if (tool === 'brainstorm') await page.waitForFunction((id) => (document.querySelector(`[data-testid="${id}"]`) as HTMLTextAreaElement | null)?.value.trim(), spec.field);
    else await page.getByTestId(spec.field).fill(FACTOIDS_CLAIM);
    return page;
  };

  const waiting = await open(true);
  await shoot(waiting, `${prefix}-${tool}-form`);
  await waiting.getByRole('button', { name: spec.submit }).click();
  await waiting.getByTestId('tool-progress').waitFor({ timeout: 15_000 });
  await shoot(waiting, `${prefix}-${spec.working}`);
  await waiting.close();

  const writing = await open(true, true);
  await writing.getByRole('button', { name: spec.submit }).click();
  await writing.getByTestId('live-draft').waitFor({ timeout: 15_000 });
  await writing.waitForTimeout(1200);
  await shoot(writing, `${prefix}-${spec.working}-live`);
  await writing.close();

  const page = await open(false);
  await page.getByRole('button', { name: spec.submit }).click();
  await page.getByTestId(spec.document).waitFor({ timeout: 30_000 });
  await shootCelebration(page, `${prefix}-${tool}-celebration`);
  await page.waitForTimeout(400);
  await shoot(page, `${prefix}-${tool}`);
  // Close the open item, so every item shows collapsed.
  await page.getByTestId('document-item').first().click();
  await shoot(page, `${prefix}-${tool}-collapsed`);
  await page.getByTestId('document-item').first().click();

  await page.getByTestId('export-button').click();
  await page.getByTestId('export-menu').waitFor();
  await shoot(page, `${prefix}-${tool}-export-menu`);
  await page.getByTestId('export-menu').getByRole('menuitem').first().click();
  await page.getByTestId('export-button').click();
  await page.getByTestId('export-menu').getByRole('menuitem').nth(1).click();
  const exported = await page.evaluate(() => (window as unknown as { __debatelabExport?: { html?: string; fileName?: string; copied?: string } }).__debatelabExport ?? {});
  if (!exported.html || !exported.copied) throw new Error(`${tool} export did not hand over the PDF HTML or the copied text`);
  await writeFile(join(OUT, `${prefix}-${tool}-copy.txt`), exported.copied);
  const pdf = await context.newPage();
  await pdf.setViewportSize({ width: 794, height: 1123 });
  await pdf.setContent(exported.html);
  await pdf.screenshot({ path: join(OUT, `${prefix}-${tool}-pdf-html.png`), fullPage: true });
  await pdf.close();
  console.log(`${prefix} ${tool}: PDF file name ${exported.fileName}, copied ${exported.copied.length} characters`);
  await page.close();
}

const MENU = {
  crossfire: /^(Open in Crossfire|Megnyitás a Keresztkérdezésben|Abrir en Interrogatorio)$/,
  flowchart: /^(Build flowchart from case|Folyamatábra az esetből|Crear diagrama desde el caso)$/,
  regenerate: /^(Regenerate a section|Szakasz újragenerálása|Regenerar una sección)$/,
  arguments: /^(Regenerate Arguments|Érvek újragenerálása|Regenerar Argumentos)$/,
  save: /^(Save|Mentés|Guardar)$/,
  shareLink: /^(Share link|Link megosztása|Compartir enlace)$/,
};

/**
 * Regenerate, Undo and Save on a case, from the fixed case: the regenerate
 * menu, a regeneration held open, the case after it, the Save case sheet and
 * the saved confirmation. The case's first save to its debate is answered
 * with an error, so the case stays unsaved and offers Save; the Save sheet's
 * write is answered locally. Nothing reaches a model or the database.
 */
async function shootCaseEdits(context: BrowserContext, prefix: string, language: string, problems: string[]) {
  const open = async (holdRegeneration: boolean) => {
    const page = await context.newPage();
    const seen: string[] = [];
    watchErrors(page, seen, `${prefix} case edits`);
    page.on('dialog', (dialog) => void dialog.dismiss());
    await pinSettings(page, language);
    await fakeResults(page, null);
    let generations = 0;
    await page.route(`https://${STAGING_HOST}/functions/v1/ai`, async (route) => {
      generations += 1;
      if (holdRegeneration && generations > 1) return; // Never answered: the strip shows.
      return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, json: FAKE_OUTPUTS.generate });
    });
    let caseWrites = 0;
    await page.route(`${REST}/cases*`, (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      caseWrites += 1;
      return caseWrites === 1
        ? route.fulfill({ status: 500, headers: { 'access-control-allow-origin': '*' }, json: { message: 'screenshot: not recorded' } })
        : route.fulfill({ status: 201, json: FAKE_ROW('cases') });
    });
    await page.goto(`${ORIGIN}/generate?from=prepare`);
    await page.getByTestId('generate-motion').waitFor({ timeout: 30_000 });
    await page.waitForFunction(() => (document.querySelector('[data-testid="generate-motion"]') as HTMLTextAreaElement | null)?.value.trim());
    await page.getByRole('button', { name: /^(Generate debate case|Vitaeset generálása|Generar caso de debate)$/i }).click();
    await page.getByTestId('case-document').waitFor({ timeout: 30_000 });
    // A new case opens with its celebration (shot in the results group); tap it away first.
    await page.getByTestId('celebration').click({ timeout: 5_000 }).catch(() => {});
    await page.getByTestId('celebration').waitFor({ state: 'detached', timeout: 5_000 });
    await page.waitForTimeout(3800); // The arrival notice fades.
    return { page, seen };
  };
  const regenerateArguments = async (page: Page, shotMenu: boolean) => {
    await page.getByTestId('document-more').click();
    await page.getByRole('menuitem', { name: MENU.regenerate }).click();
    await page.getByTestId('regenerate-menu').waitFor();
    if (shotMenu) await shoot(page, `${prefix}-regenerate-menu`);
    await page.getByTestId('regenerate-menu').getByRole('menuitem', { name: MENU.arguments }).click();
  };
  const finish = (seen: string[]) => problems.push(...seen.filter((problem) => !problem.includes('status of 500')));

  const held = await open(true);
  await regenerateArguments(held.page, true);
  await held.page.getByTestId('regenerating').waitFor({ timeout: 15_000 });
  await shoot(held.page, `${prefix}-case-regenerating`);
  await held.page.close();
  finish(held.seen);

  const { page, seen } = await open(false);
  await regenerateArguments(page, false);
  await page.getByTestId('document-notice').waitFor({ timeout: 15_000 });
  await shoot(page, `${prefix}-case-regenerated`);
  await page.waitForTimeout(3800);
  await page.getByTestId('document-more').click();
  await page.getByRole('menuitem', { name: MENU.save }).click();
  await page.getByTestId('save-case-sheet').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(500);
  await shoot(page, `${prefix}-save-case`);
  await page.getByTestId('save-case-confirm').click();
  await page.getByTestId('save-case-sheet').waitFor({ state: 'detached', timeout: 15_000 });
  await page.getByTestId('document-notice').waitFor({ timeout: 15_000 });
  await shoot(page, `${prefix}-case-saved`);
  await page.close();
  finish(seen);
}

/**
 * The debate context line on Generate and its Review sheet, from the
 * account's real Current Debate. Turning an item off lives in memory only;
 * pin writes are answered locally, so nothing is saved.
 */
async function shootContextReview(context: BrowserContext, prefix: string, language: string, problems: string[]) {
  const page = await context.newPage();
  watchErrors(page, problems, `${prefix} context`);
  await pinSettings(page, language);
  await page.route(`${REST}/debate_context_pins*`, (route) =>
    route.request().method() === 'GET' ? route.continue() : route.fulfill({ status: 201, headers: { 'access-control-allow-origin': '*' }, body: '' }),
  );
  await page.goto(`${ORIGIN}/generate?from=prepare`);
  await page.getByTestId('generate-motion').waitFor({ timeout: 30_000 });
  const line = page.getByTestId('debate-context-line');
  await line.waitFor({ timeout: 30_000 });
  await line.scrollIntoViewIfNeeded();
  await settle(page);
  await shoot(page, `${prefix}-context-line`);
  await line.getByRole('button').click();
  const sheet = page.getByTestId('context-review-sheet');
  await sheet.waitFor({ timeout: 15_000 });
  await page.waitForFunction(() => document.querySelectorAll('[role="checkbox"]').length > 0, undefined, { timeout: 15_000 });
  await page.waitForTimeout(500);
  await shoot(page, `${prefix}-context-review`);
  // Leave the first source out of the next request, and pin the first saved result.
  await sheet.getByRole('checkbox').first().click();
  const pin = sheet.getByTestId('debate-context-pin').first();
  if (await pin.count()) {
    await pin.click();
    await page.waitForTimeout(400);
  }
  await page.getByTestId('debate-context-reset').waitFor({ timeout: 15_000 });
  await shoot(page, `${prefix}-context-review-changed`);
  await page.close();
}

/**
 * The limit and model sheets: Generate answered with the ai function's
 * refusals (402 limit_reached with its counts, then 403 upgrade_required).
 * Nothing is sent to a model; "Use low reasoning instead" is never pressed.
 */
async function shootLimitSheets(context: BrowserContext, prefix: string, language: string, problems: string[]) {
  const refusals = [
    { name: 'limit-sheet', status: 402, json: { error: 'Daily limit reached', code: 'limit_reached', limit: 20, current: 20, units: 1 } },
    { name: 'model-sheet', status: 403, json: { error: 'This model requires a Pro subscription.', code: 'upgrade_required' } },
  ];
  for (const refusal of refusals) {
    const page = await context.newPage();
    // The browser logs the refused request itself; only that error is expected.
    const seen: string[] = [];
    watchErrors(page, seen, `${prefix} ${refusal.name}`);
    page.on('dialog', (dialog) => void dialog.dismiss());
    await pinSettings(page, language);
    await page.route(`https://${STAGING_HOST}/functions/v1/ai`, (route) =>
      route.fulfill({ status: refusal.status, headers: { 'access-control-allow-origin': '*' }, json: refusal.json }),
    );
    await page.goto(`${ORIGIN}/generate?from=prepare`);
    await page.getByTestId('generate-motion').waitFor({ timeout: 30_000 });
    await page.waitForFunction(() => (document.querySelector('[data-testid="generate-motion"]') as HTMLTextAreaElement | null)?.value.trim());
    await page.getByRole('button', { name: /^(Generate debate case|Vitaeset generálása|Generar caso de debate)$/i }).click();
    await page.getByTestId('limit-sheet').waitFor({ timeout: 15_000 });
    await settle(page);
    await page.waitForTimeout(500);
    await shoot(page, `${prefix}-${refusal.name}`);
    await page.close();
    problems.push(...seen.filter((problem) => !problem.includes(`status of ${refusal.status}`)));
  }
}

// Made-up saved maps in the website's React Flow shape, after mock A.
const FLOW_NODE = (id: string, x: number, y: number, label: string, type: string, strength?: string) => ({
  id, type: 'custom', position: { x, y }, width: 220, height: 96,
  data: { label, description: '', type, ...(strength ? { strength } : {}) },
});
const FAKE_FLOWCHART = {
  nodes: [
    FLOW_NODE('thesis', 400, 50, 'Ban private cars from city centres', 'thesis'),
    FLOW_NODE('c1', 150, 200, 'Air quality is a health duty', 'contention', 'strong'),
    FLOW_NODE('c2', 400, 200, 'Streets belong to people', 'contention', 'moderate'),
    FLOW_NODE('c3', 650, 200, 'Fewer road deaths', 'dropped'),
    FLOW_NODE('a1', 150, 350, 'Shift workers have no alternative', 'attack'),
    FLOW_NODE('a2', 400, 350, 'Small shops lose customers', 'attack'),
    FLOW_NODE('r1', 150, 500, 'Night buses follow demand', 'rebuttal'),
  ],
  edges: [
    { id: 'e-thesis-c1', source: 'thesis', target: 'c1', animated: true, markerEnd: { type: 'arrowclosed' } },
    { id: 'e-thesis-c2', source: 'thesis', target: 'c2', animated: true, markerEnd: { type: 'arrowclosed' } },
    { id: 'e-thesis-c3', source: 'thesis', target: 'c3', animated: true, markerEnd: { type: 'arrowclosed' } },
    { id: 'reactflow__edge-c1-a1', source: 'c1', sourceHandle: null, target: 'a1', targetHandle: null, animated: true, label: 'Attack', style: { stroke: '#ef4444', strokeWidth: 2 }, markerEnd: { type: 'arrowclosed' } },
    { id: 'e-c2-a2', source: 'c2', target: 'a2', style: { stroke: '#ef4444' }, markerEnd: { type: 'arrowclosed' } },
    { id: 'reactflow__edge-a1-r1', source: 'a1', sourceHandle: null, target: 'r1', targetHandle: null, animated: true, label: 'Rebuttal', style: { stroke: '#3b82f6', strokeWidth: 2 }, markerEnd: { type: 'arrowclosed' } },
  ],
};
const FAKE_FLOWCHART_ROWS = [
  { id: '00000000-0000-4000-8000-00000000f10a', title: 'Car ban: first speech', created_at: '2026-10-09T09:12:00.000Z', ...FAKE_FLOWCHART },
  { id: '00000000-0000-4000-8000-00000000f10b', title: 'Practice round map', created_at: '2026-10-02T17:40:00.000Z', nodes: FAKE_FLOWCHART.nodes.slice(0, 3), edges: FAKE_FLOWCHART.edges.slice(0, 2) },
];

/** Answers flowcharts reads with the made-up maps, none for one-off work, and writes locally (see the header). */
async function fakeFlowcharts(page: Page) {
  // The maps belong to the debate the last list was read for.
  let debateId: string | null = null;
  await page.route(`${REST}/flowcharts*`, (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const single = (request.headers().accept ?? '').includes('vnd.pgrst.object');
    if (request.method() === 'DELETE') return route.fulfill({ status: 204 });
    if (request.method() !== 'GET') {
      const row = { ...FAKE_FLOWCHART_ROWS[0], id: '00000000-0000-4000-8000-00000000f1ff', debate_id: debateId };
      return route.fulfill({ status: 201, json: single ? row : [row] });
    }
    const scope = url.searchParams.get('debate_id');
    if (scope) debateId = scope === 'is.null' ? null : scope.replace(/^eq\./, '');
    const id = url.searchParams.get('id')?.replace(/^eq\./, '');
    const rows = (scope === 'is.null' ? [] : FAKE_FLOWCHART_ROWS)
      .filter((row) => !id || row.id === id)
      .map((row) => ({ ...row, debate_id: debateId }));
    return route.fulfill({ status: 200, json: single ? rows[0] ?? null : rows });
  });
}

/** Flow, Map, the claim sheet, adding a card, the saved maps, the menu and Export, from fixed maps. Nothing is saved. */
async function shootFlowchart(context: BrowserContext, prefix: string, language: string, problems: string[]) {
  const page = await context.newPage();
  watchErrors(page, problems, `${prefix} flowchart`);
  page.on('dialog', (dialog) => void dialog.dismiss());
  await pinSettings(page, language);
  await fakeFlowcharts(page);
  await page.goto(`${ORIGIN}/prepare`);
  await page.getByTestId('prepare-tool-flowchart').waitFor({ timeout: 30_000 });
  await settle(page);
  await page.getByTestId('prepare-tool-flowchart').click();
  await page.getByTestId('flow-card').first().waitFor({ timeout: 30_000 });
  await settle(page);
  await shoot(page, `${prefix}-flowchart-flow`);

  await page.getByRole('tab', { name: /^(Map|Térkép|Mapa)$/ }).click();
  await page.getByTestId('map-tree').waitFor();
  await shoot(page, `${prefix}-flowchart-map`);

  await page.getByTestId('map-card').filter({ hasText: 'Small shops lose customers' }).click();
  await page.getByTestId('claim-sheet').waitFor();
  await page.waitForTimeout(700);
  await shoot(page, `${prefix}-flowchart-claim`);
  await page.getByTestId('claim-link').click();
  await page.getByTestId('link-targets').waitFor();
  await shoot(page, `${prefix}-flowchart-link`);
  // On iPad the claim is docked beside the map, so it closes instead of going back.
  const docked = page.getByTestId('claim-close');
  if (await docked.isVisible()) await docked.click();
  else await page.goBack();
  await page.getByTestId('flowchart-screen').waitFor();

  await page.getByTestId('document-add').click();
  await page.getByTestId('card-sheet').waitFor();
  await page.waitForTimeout(700);
  await shoot(page, `${prefix}-flowchart-add-card`);
  await page.goBack();

  await page.getByTestId('flowchart-maps').click();
  await page.getByTestId('maps-sheet').waitFor();
  await page.getByTestId('saved-map').nth(1).waitFor({ timeout: 15_000 });
  await page.waitForTimeout(700);
  await shoot(page, `${prefix}-flowchart-maps`);
  await page.goBack();

  await page.getByTestId('document-more').click();
  await page.getByRole('menu').waitFor();
  await shoot(page, `${prefix}-flowchart-menu`);
  // Save, Save as, Saved Flowcharts, Export, Delete map.
  await page.getByRole('menuitem').nth(3).click();
  await page.getByTestId('export-menu').waitFor();
  await shoot(page, `${prefix}-flowchart-export-menu`);
  await page.getByTestId('export-menu').getByRole('menuitem').first().click();
  await page.getByTestId('document-more').click();
  await page.getByRole('menuitem').nth(3).click();
  await page.getByTestId('export-menu').getByRole('menuitem').nth(1).click();
  const exported = await page.evaluate(() => (window as unknown as { __debatelabExport?: { html?: string; fileName?: string; copied?: string } }).__debatelabExport ?? {});
  if (!exported.html || !exported.copied) throw new Error('Flowchart export did not hand over the PDF HTML or the copied text');
  await writeFile(join(OUT, `${prefix}-flowchart-copy.txt`), exported.copied);
  const pdf = await context.newPage();
  await pdf.setViewportSize({ width: 794, height: 1123 });
  await pdf.setContent(exported.html);
  await pdf.screenshot({ path: join(OUT, `${prefix}-flowchart-pdf-html.png`), fullPage: true });
  await pdf.close();
  console.log(`${prefix} flowchart: PDF file name ${exported.fileName}, copied ${exported.copied.length} characters`);
  await page.close();

  // One-off work has its own maps; with none saved, the starter map shows under the one-off notice.
  const oneOff = await context.newPage();
  watchErrors(oneOff, problems, `${prefix} flowchart one-off`);
  await pinSettings(oneOff, language);
  await fakeFlowcharts(oneOff);
  await oneOff.goto(`${ORIGIN}/`);
  await oneOff.getByTestId('current-debate-motion').waitFor({ timeout: 30_000 });
  await settle(oneOff);
  await oneOff.getByTestId('current-debate-pill').click();
  await oneOff.getByTestId('debates-sheet').waitFor();
  await settle(oneOff);
  const toggle = oneOff.getByTestId('debates-sheet').getByRole('switch');
  await toggle.click();
  if (!(await toggle.isChecked())) throw new Error('The one-off switch did not turn on');
  await oneOff.getByTestId('debates-sheet').getByRole('button', { name: /^(Done|Kész|Listo)$/ }).click();
  await oneOff.getByTestId('debates-sheet').waitFor({ state: 'detached' });
  await openPrepareTool(oneOff, 'flowchart');
  await oneOff.getByTestId('flowchart-screen').getByTestId('one-off-notice').waitFor({ timeout: 30_000 });
  await oneOff.getByTestId('flow-card').first().waitFor({ timeout: 30_000 });
  await settle(oneOff);
  await shoot(oneOff, `${prefix}-flowchart-oneoff`);
  await oneOff.close();
}

const FIXTURES = join(__dirname, 'fixtures');

/** Made-up Library rows: four folders, one source switched off, and the website's quality rankings on three. */
function librarySources(debateId: string) {
  const semantic = (importance: number, strength: number, useCount: number, caseUseCount: number, lastUsedInCase = false) => ({
    relevance: 0.8, importance, strength, useCount, caseUseCount, lastUsedInCase, evaluatedAt: iso(-86_400_000),
  });
  const row = (id: number, fields: Record<string, unknown>) => ({
    id: `00000000-0000-4000-8000-0000005${String(id).padStart(7, '0')}`,
    debate_id: debateId,
    is_active: true,
    metadata: null,
    created_at: iso(-id * 7 * 3600_000),
    ...fields,
  });
  return [
    row(1, { title: 'City air quality report 2025', type: 'url', origin: 'https://example.org/air-quality-2025', folder: 'Evidence', content: 'Nitrogen dioxide fell by a third on streets closed to through traffic, measured over twelve months at forty sites.', metadata: { url: 'https://example.org/air-quality-2025', qualityScore: 0.9, semantic: semantic(3, 3, 4, 2, true) } }),
    row(2, { title: 'Congestion charge results', type: 'file', origin: 'congestion-charge-2024.pdf', folder: 'Evidence', content: 'Traffic in the charging zone fell by 18 percent in the first twelve months. Bus journey times improved by 9 percent.', metadata: { semantic: semantic(2, 2, 1, 1) } }),
    row(3, { title: 'Nurse shift-work exemptions', type: 'text', origin: null, folder: 'Rebuttals', content: 'Every real ban exempts shift workers, carers and blue badge holders. Night buses follow demand.' }),
    row(4, { title: 'Opposition talking points', type: 'text', origin: null, folder: 'General', is_active: false, content: 'Their likely lines: freedom of movement, trade in the centre, deliveries.' }),
    row(5, { title: 'Retail footfall after car bans', type: 'url', origin: 'https://example.com/footfall-study', folder: 'Auto-saved', content: 'Footfall recovered to its earlier level within eight months in five of six cities.', metadata: { url: 'https://example.com/footfall-study', semantic: semantic(1, 2, 1, 0) } }),
  ];
}

/**
 * Answers the Library's reads with librarySources and its writes locally, so
 * the shots show folders, a switched-off source and quality badges without
 * touching the account's real Library (see the header).
 */
async function fakeLibrary(page: Page) {
  let rows: Record<string, unknown>[] | null = null;
  const folders = ['General', 'Evidence', 'Rebuttals', 'Auto-saved'];
  await page.route((url) => url.href.startsWith(`${REST}/sources`) || url.href.startsWith(`${REST}/source_folders`), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const object = (request.headers()['accept'] ?? '').includes('vnd.pgrst.object');
    const debate = url.searchParams.get('debate_id')?.replace(/^eq\./, '');
    if (url.pathname.endsWith('/source_folders')) {
      if (request.method() === 'POST') {
        const body = request.postDataJSON() as { name?: string } | { name?: string }[];
        for (const row of Array.isArray(body) ? body : [body]) if (row.name && !folders.includes(row.name)) folders.push(row.name);
      }
      return route.fulfill({ status: request.method() === 'GET' ? 200 : 201, headers: CORS, json: request.method() === 'GET' ? folders.map((name) => ({ name })) : [] });
    }
    if (debate && !rows) rows = librarySources(debate);
    if (request.method() === 'GET') {
      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      const list = (rows ?? []).filter((row) => !id || row.id === id);
      return route.fulfill({ status: 200, headers: CORS, json: object ? list[0] ?? null : list });
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, unknown>;
      const saved = { id: `00000000-0000-4000-8000-0000006${String(Date.now() % 1e7).padStart(7, '0')}`, created_at: iso(0), ...body };
      rows = [saved, ...(rows ?? [])];
      return route.fulfill({ status: 201, headers: CORS, json: object ? saved : [saved] });
    }
    if (request.method() === 'DELETE') {
      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      const removed = (rows ?? []).filter((row) => row.id === id);
      rows = (rows ?? []).filter((row) => row.id !== id);
      return route.fulfill({ status: 200, headers: CORS, json: removed.map((row) => ({ debate_id: row.debate_id })) });
    }
    if (request.method() === 'PATCH') {
      // An edit or an Active switch, kept as the server keeps it, so the list read after a write shows it.
      const filter = url.searchParams.get('id') ?? '';
      const ids = filter.startsWith('eq.') ? [filter.slice(3)] : filter.startsWith('in.(') ? filter.slice(4, -1).split(',').map((id) => id.replace(/"/g, '')) : [];
      const body = request.postDataJSON() as Record<string, unknown>;
      rows = (rows ?? []).map((row) => (ids.includes(String(row.id)) ? { ...row, ...body } : row));
    }
    return route.fulfill({ status: 204, headers: CORS });
  });
}

/** Picks a fixture through the Library's Import a file, as the Files picker would hand it over. */
async function importFixture(page: Page, file: string) {
  await page.goto(`${ORIGIN}/library`);
  await page.getByTestId('library-add').click({ timeout: 30_000 });
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('menuitem').nth(2).click();
  await (await chooser).setFiles(join(FIXTURES, file));
  await page.getByTestId('add-file-sheet').waitFor({ timeout: 30_000 });
}

async function shootLibraryScreens(page: Page, prefix: string, problems: string[]) {
  await fakeLibrary(page);
  await page.goto(`${ORIGIN}/library`);
  await page.getByTestId('library-add').waitFor({ timeout: 30_000 });
  await page.getByTestId('source-row').first().waitFor({ timeout: 30_000 });
  await settle(page);
  await shoot(page, `${prefix}-library`);

  // The switch sits beside the row's link: tapping it turns the source off and on and never opens it.
  const toggle = page.getByTestId('source-active').first();
  for (const expected of [false, true]) {
    await toggle.click();
    await page.waitForFunction((on) => (document.querySelector('[data-testid="source-active"] [role="switch"]') as HTMLInputElement | null)?.checked === on, expected);
    if (!new URL(page.url()).pathname.endsWith('/library')) throw new Error('Tapping a source switch opened the source');
  }

  await page.getByTestId('library-more').click();
  await page.getByTestId('library-more-menu').waitFor();
  await shoot(page, `${prefix}-library-more`);
  await page.getByTestId('library-more').click();

  await page.getByTestId('folder-chip').filter({ hasText: 'Evidence' }).click();
  await page.getByTestId('folder-bar').waitFor();
  await shoot(page, `${prefix}-library-folder`);

  // New folder asks for a name (window.prompt in the web preview) and stays chosen once it is saved.
  page.once('dialog', (dialog) => void dialog.accept('Field notes'));
  await page.getByTestId('library-more').click();
  await page.getByTestId('library-more-menu').getByRole('menuitem').nth(-2).click();
  await page.getByTestId('folder-bar').filter({ hasText: 'Field notes' }).waitFor({ timeout: 15_000 });
  await settle(page);
  await page.waitForTimeout(500);
  if ((await page.getByTestId('folder-bar').filter({ hasText: 'Field notes' }).count()) === 0) throw new Error('The new folder did not stay chosen');
  await shoot(page, `${prefix}-library-new-folder`);

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

  // The real reader: pdf.js and mammoth read the fixtures in the page, as in the iOS DOM component.
  await importFixture(page, 'congestion-charge-results.pdf');
  await page.getByText('Bus journey times improved by 9 percent', { exact: false }).first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(500);
  await shoot(page, `${prefix}-add-file`);
  await page.getByRole('button', { name: /^(Save imported source|Importált forrás mentése|Guardar fuente importada)$/ }).click();
  await page.getByTestId('toast').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(400);
  await shoot(page, `${prefix}-library-saved`);

  await importFixture(page, 'rebuttal-notes.docx');
  await page.getByText('Night buses follow demand', { exact: false }).first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(500);
  await shoot(page, `${prefix}-add-file-docx`);

  await importFixture(page, 'whiteboard-photo.png');
  await page.getByRole('alert').first().waitFor({ timeout: 30_000 });
  await page.waitForTimeout(500);
  await shoot(page, `${prefix}-add-file-error`);

  await page.goto(`${ORIGIN}/library`);
  await page.getByTestId('source-row').first().click({ timeout: 30_000 });
  await page.getByTestId('source-sheet').getByRole('heading').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(700);
  await shoot(page, `${prefix}-source`);
  await page.getByTestId('source-sheet').getByRole('button', { name: /^(Edit|Szerkesztés|Editar)$/ }).click();
  await page.waitForTimeout(400);
  await shoot(page, `${prefix}-source-edit`);

  // Delete acts at once and offers Undo; the write is answered locally.
  await page.goto(`${ORIGIN}/library`);
  await page.getByTestId('source-row').nth(1).click({ timeout: 30_000 });
  await page.getByTestId('source-delete').click({ timeout: 30_000 });
  await page.getByTestId('toast-action').waitFor({ timeout: 30_000 });
  await page.getByTestId('source-sheet').waitFor({ state: 'detached', timeout: 10_000 });
  await page.waitForTimeout(400);
  await shoot(page, `${prefix}-library-undo`);
  const haptics = await page.evaluate(() => (window as unknown as { __debatelabHaptics?: string[] }).__debatelabHaptics ?? []);
  if (!haptics.includes('success')) problems.push(`${prefix}: deleting a source did not tap success`);
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
  // Stop keeps the answer so far, marked as stopped; the chat write is answered locally.
  await streaming.getByTestId('ask-stop').click();
  await streaming.getByTestId('ask-answer').waitFor({ timeout: 15_000 });
  await streaming.waitForTimeout(300);
  await shoot(streaming, `${prefix}-ask-stopped`);
  await streaming.close();

  // Clarify mode with a text file attached, then the answer saved to the Library's Ask folder.
  // The file is read in the page; the source write is answered locally.
  const clarify = await ask(false);
  for (const table of ['sources', 'source_folders']) {
    await clarify.route(`${REST}/${table}*`, (route) =>
      route.request().method() === 'GET' ? route.continue() : route.fulfill({ status: 201, json: FAKE_ROW(table) }),
    );
  }
  await clarify.getByTestId('ask-mode-clarify').click();
  const chooser = clarify.waitForEvent('filechooser');
  await clarify.getByTestId('ask-attach').click();
  await (await chooser).setFiles({ name: 'rebuttal-notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# Notes\n\nNight buses: routes added in year one.\n') });
  await clarify.getByTestId('ask-attachments').waitFor({ timeout: 15_000 });
  await clarify.getByTestId('ask-input').fill(ASK_QUESTION);
  await shoot(clarify, `${prefix}-ask-attached`);
  await clarify.getByTestId('ask-send').click();
  await clarify.getByTestId('ask-answer').waitFor({ timeout: 15_000 });
  await clarify.getByTestId('ask-save').click();
  await clarify.getByTestId('ask-saved').waitFor({ timeout: 15_000 });
  await clarify.waitForTimeout(300);
  await shoot(clarify, `${prefix}-ask-saved`);
  await clarify.close();
}

// A made-up Crossfire exchange and debrief, in English and Hungarian, so the Hungarian shots carry no English model text.
const CROSSFIRE_TEXT = {
  en: {
    argument: 'Banning private cars from city centres cuts roadside pollution and gives streets back to people who walk, cycle and take the bus.',
    questions: ['Who checks that the exemptions for carers actually work?', 'What happens to shops that depend on drivers?'],
    answers: [
      'Councils already issue permits for carers and shift workers, so the checks exist before the ban starts.',
      'Footfall studies show shops gain visitors when streets close to traffic, though a few car-dependent stores may lose trade.',
    ],
    debrief: {
      concession: 'The opponent admitted that some car-dependent stores may lose trade (T4).',
      controlled: 'Asking who checks the exemptions forced a concrete answer about permits.',
      missed: 'You could have pressed on how many permits a typical city issues.',
      better: 'How many permits would a city of a million people need to issue?',
      reason: 'A number tests whether the exemptions undercut the health benefit.',
      strongest: 'The question about shops drew out a concession you can use in rebuttal.',
    },
  },
  hu: {
    argument: 'Ha kitiltjuk a magánautókat a belvárosból, csökken az út menti szennyezés, és az utcák visszakerülnek a gyalogosokhoz, a biciklisekhez és a buszokhoz.',
    questions: ['Ki ellenőrzi, hogy a gondozóknak adott kivételek valóban működnek?', 'Mi lesz azokkal a boltokkal, amelyek az autósokból élnek?'],
    answers: [
      'Az önkormányzatok már most is adnak engedélyt a gondozóknak és a műszakban dolgozóknak, így az ellenőrzés a tilalom előtt megvan.',
      'A forgalmi felmérések szerint a boltok több látogatót kapnak, ha az utcát lezárják, bár néhány autós vásárlókra épülő üzlet veszíthet.',
    ],
    debrief: {
      concession: 'Az ellenfél elismerte, hogy néhány autós vásárlókra épülő üzlet veszíthet (T4).',
      controlled: 'A kivételek ellenőrzéséről szóló kérdés konkrét választ kényszerített ki az engedélyekről.',
      missed: 'Rákérdezhettél volna, hány engedélyt ad ki egy átlagos város.',
      better: 'Hány engedélyt kellene kiadnia egy egymilliós városnak?',
      reason: 'Egy szám megmutatja, hogy a kivételek nem rontják-e le az egészségügyi hasznot.',
      strongest: 'A boltokról szóló kérdés olyan engedményt hozott, amelyet a cáfolatban felhasználhatsz.',
    },
  },
} as const;

/** Fakes Crossfire's AI calls and its save for this page (see the header). Replies follow the request, as the client checks them. */
// The round's cost, as the ai function answers a quotaCheck: one use, 16 of 20 left today.
const FAKE_QUOTA = { quota: { allowed: true, units: 1, limit: 20, current: 4 } };

async function fakeCrossfire(page: Page, language: keyof typeof CROSSFIRE_TEXT) {
  const text = CROSSFIRE_TEXT[language];
  await page.route(`https://${STAGING_HOST}/functions/v1/ai`, async (route) => {
    const body = route.request().postDataJSON() as { feature?: string; input?: { operation?: string; expectedReply?: 'question' | 'answer'; transcript?: { id: string }[] } } | null;
    if (body?.feature !== 'crossfire') return route.abort();
    if ((body as { quotaCheck?: boolean }).quotaCheck) return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, json: FAKE_QUOTA });
    const input = body.input ?? {};
    const turns = input.transcript ?? [];
    const exchange = Math.floor(turns.length / 2) % text.answers.length;
    let output: unknown;
    let extra: Record<string, unknown> = {};
    if (input.operation === 'next-turn') {
      const type = input.expectedReply ?? 'answer';
      output = { type, text: type === 'answer' ? text.answers[exchange] : text.questions[exchange] };
      extra = { signalToken: 'screenshot-signal', ...((body as { voice?: boolean }).voice ? { voice: { segments: [{ text: 'Screenshot voice segment.', token: 'screenshot-voice-token' }] } } : {}) };
    } else if (input.operation === 'signal') {
      output = { signal: { answerTurnId: `T${turns.length + 1}`, answerQuality: exchange === 0 ? 'direct' : 'partial', answerQualityConfidence: 0.82, concession: exchange === 0 ? 'none' : 'implicit', concessionConfidence: 0.74, followUpOpportunity: 0.81 } };
    } else {
      const d = text.debrief;
      output = {
        // Concessions and controlled questions name one turn each (SingleTurnReferenceSchema).
        concessionsSecured: [{ turnIds: ['T4'], claim: d.concession }],
        controlledQuestions: [{ turnIds: ['T1'], claim: d.controlled }],
        weakOrRepetitiveQuestions: [],
        evasiveOrIncompleteAnswers: [],
        missedFollowUps: [{ turnIds: ['T2'], claim: d.missed }],
        betterFollowUpQuestions: [{ turnIds: ['T2'], question: d.better, reason: d.reason }],
        strongestExchange: { turnIds: ['T3', 'T4'], claim: d.strongest },
      };
    }
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, json: { output, ...extra } });
  });
  await page.route(`${REST}/crossfires*`, (route) =>
    route.request().method() === 'POST' ? route.fulfill({ status: 201, json: { id: '00000000-0000-4000-8000-00000000cf01' } }) : route.continue(),
  );
}

/** Crossfire from the Practice tab: the setup, a typed exchange with its live signals, and the debrief, all from fixed outputs. */
async function shootCrossfireScreens(context: BrowserContext, prefix: string, language: string, problems: string[]) {
  const text = CROSSFIRE_TEXT[language === 'hu' ? 'hu' : 'en'];
  const page = await context.newPage();
  watchErrors(page, problems, `${prefix} crossfire`);
  await pinSettings(page, language);
  await fakeCrossfire(page, language === 'hu' ? 'hu' : 'en');
  await page.goto(`${ORIGIN}/practice`);
  await page.getByTestId('practice-tool-crossfire').click({ timeout: 30_000 });
  await page.getByTestId('crossfire-setup').waitFor({ timeout: 15_000 });
  // The resolution comes from the Current Debate, so the round attaches to it without the motion question.
  await page.waitForFunction(() => (document.querySelector('[data-testid="crossfire-resolution"]') as HTMLTextAreaElement | null)?.value.trim());
  await page.getByTestId('crossfire-argument').fill(text.argument);
  await settle(page);
  await shoot(page, `${prefix}-crossfire-setup`);
  // The round's cost sits above the start button, below the fold on a phone.
  await page.getByTestId('session-cost').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shoot(page, `${prefix}-crossfire-cost`);

  await page.getByRole('button', { name: /^(Start crossfire|Keresztkérdezés indítása|Iniciar interrogatorio)$/ }).click();
  await page.getByTestId('crossfire-live').waitFor({ timeout: 15_000 });
  for (const [index, question] of text.questions.entries()) {
    await page.getByTestId('crossfire-input').fill(question);
    // The count is a plural string; without plural rules it shows its key instead.
    const count = (await page.getByTestId('crossfire-count').textContent()) ?? '';
    if (!/\d/.test(count) || count.includes('charactersRemaining')) throw new Error(`Crossfire character count read "${count}"`);
    await page.getByTestId('crossfire-send').click();
    await page.getByTestId('crossfire-turn').nth(index * 2 + 1).waitFor({ timeout: 15_000 });
    await page.getByTestId('crossfire-signal').nth(index).waitFor({ timeout: 15_000 });
  }
  await page.waitForTimeout(400);
  await shoot(page, `${prefix}-crossfire-exchange`);

  await page.getByTestId('crossfire-end').click();
  await shootCelebration(page, `${prefix}-crossfire-celebration`);
  await page.getByTestId('crossfire-debrief').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(400);
  await shoot(page, `${prefix}-crossfire-debrief`);
  await page.close();
}

// A made-up Lincoln-Douglas round as Con, in English and Hungarian, and a scorecard whose totals match its categories, as the client checks.
const SPARRING_TEXT = {
  en: {
    opponent: [
      'Private cars fill the centre with fumes that children breathe on their way to school. Closing the centre to them is the fastest way to clean that air, and every city that tried it kept the ban.',
      'My opponent says shops will suffer, but footfall rises when streets are calm. People who walk stop more often and stay longer than people looking for a parking space.',
      'The night-shift worker is covered: permits for carers and early shifts already exist. What remains is a choice between cleaner air for everyone and convenience for a few.',
    ],
    speeches: [
      'A ban punishes the people with the fewest choices. The nurse who drives in at five a.m. has no bus at that hour, and permits only help those who know how to apply.',
      'Cleaner air matters, but low-emission zones get most of the benefit without shutting anyone out. Charge the most polluting cars and leave the centre open.',
    ],
    verdict: "Your second speech answered the night-shift worker case directly. Evidence was thin: name the transit data, don't just say it exists.",
    feedback: ['The burden on shift workers was clear and well framed.', 'You asserted that low-emission zones work without a source.', 'Delivery read clearly, with short and confident sentences.', 'You chose the right clash and stayed on it.'],
    overall: 'A disciplined round. Lead with your strongest example and back each claim with one named source.',
    moments: ['Turning the permit system into an access problem.'],
    next: ['Bring one figure for how many workers start before the buses run.'],
  },
  hu: {
    opponent: [
      'A magánautók kipufogógázzal töltik meg a belvárost, amelyet a gyerekek iskolába menet belélegeznek. A belváros lezárása a leggyorsabb módja a levegő megtisztításának, és minden város megtartotta a tilalmat, amely kipróbálta.',
      'Az ellenfelem szerint a boltok veszítenek, de a forgalom nő, ha az utcák csendesek. A gyalogosok gyakrabban megállnak és tovább maradnak, mint akik parkolóhelyet keresnek.',
      'Az éjszakás dolgozókra is gondoltunk: a gondozóknak és a korai műszakosoknak már ma is jár engedély. A választás a tisztább levegő mindenkinek és néhányak kényelme között van.',
    ],
    speeches: [
      'A tilalom azokat bünteti, akiknek a legkevesebb választásuk van. A hajnali ötkor munkába autózó ápolónak abban az órában nincs busza, az engedély pedig csak annak segít, aki tudja, hogyan kérje.',
      'A tiszta levegő fontos, de az alacsony kibocsátású övezetek kizárás nélkül hozzák az előnyök nagy részét. Fizessenek a legjobban szennyező autók, a belváros maradjon nyitva.',
    ],
    verdict: 'A második beszéded közvetlenül válaszolt az éjszakás dolgozó esetére. A bizonyítékok gyengék voltak: nevezd meg a közlekedési adatokat, ne csak állítsd, hogy léteznek.',
    feedback: ['A műszakban dolgozók terhét világosan és jól keretezted.', 'Forrás nélkül állítottad, hogy az alacsony kibocsátású övezetek működnek.', 'Az előadás világos volt, rövid és határozott mondatokkal.', 'A megfelelő ütközési pontot választottad, és kitartottál mellette.'],
    overall: 'Fegyelmezett forduló. Kezdd a legerősebb példáddal, és minden állítást támassz alá egy megnevezett forrással.',
    moments: ['Az engedélyrendszert hozzáférési problémává fordítottad.'],
    next: ['Hozz egy számot arról, hány dolgozó kezd a buszok indulása előtt.'],
  },
} as const;

const SPARRING_CATEGORIES = [['Logic', 21, 18], ['Evidence', 15, 19], ['Delivery', 22, 17], ['Strategy', 20, 17]] as const;

/** Fakes Sparring's AI calls and its debate filing for this page (see the header). `hold` keeps the next answer of that kind open until it is released. */
async function fakeSparring(page: Page, language: keyof typeof SPARRING_TEXT) {
  const text = SPARRING_TEXT[language];
  const held: Record<'respond' | 'score', (() => void) | null> = { respond: null, score: null };
  const holding = { respond: false, score: false };
  await page.route(`https://${STAGING_HOST}/functions/v1/ai`, async (route) => {
    const body = route.request().postDataJSON() as { feature?: string; input?: { action?: 'respond' | 'score'; speeches?: { speaker: string }[] } } | null;
    if (body?.feature !== 'sparring') return route.abort();
    if ((body as { quotaCheck?: boolean }).quotaCheck) return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, json: FAKE_QUOTA });
    const action = body.input?.action ?? 'respond';
    if (holding[action]) await new Promise<void>((resolve) => { held[action] = resolve; });
    let output: unknown;
    if (action === 'respond') {
      const index = (body.input?.speeches ?? []).filter((speech) => speech.speaker === 'ai').length;
      output = { action, speech: { content: text.opponent[index % text.opponent.length], strategy: 'Press the access argument.', targetedPoints: [], integrityToken: 'screenshot-integrity-token-0000000000000000' } };
    } else {
      const categories = SPARRING_CATEGORIES.map(([name, userScore, aiScore], index) => ({ name, userScore, aiScore, feedback: text.feedback[index] }));
      output = {
        action,
        scorecard: {
          userScore: categories.reduce((sum, item) => sum + item.userScore, 0),
          aiScore: categories.reduce((sum, item) => sum + item.aiScore, 0),
          categories,
          overallFeedback: text.overall,
          keyMoments: [...text.moments],
          improvementAreas: [...text.next],
          winner: 'user',
          verdict: text.verdict,
        },
      };
    }
    // A voice round's turn carries a signed segment for the opponent's voice; the web preview only records it.
    const voice = action === 'respond' && (body as { voice?: boolean }).voice ? { voice: { segments: [{ text: 'Screenshot voice segment.', token: 'screenshot-voice-token' }] } } : {};
    return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*' }, json: { output, ...voice } });
  });
  await page.route(`${REST}/rpc/attach_to_debate`, (route) => route.fulfill({ status: 204, body: '' }));
  return {
    hold: (action: 'respond' | 'score') => { holding[action] = true; },
    release: (action: 'respond' | 'score') => {
      holding[action] = false;
      held[action]?.();
      held[action] = null;
    },
  };
}

/** Sparring from the Practice tab: the setup, the opponent's turn and yours, judging, and the scorecard, all from fixed outputs. */
async function shootSparringScreens(context: BrowserContext, prefix: string, language: string, problems: string[]) {
  const text = SPARRING_TEXT[language === 'hu' ? 'hu' : 'en'];
  const page = await context.newPage();
  watchErrors(page, problems, `${prefix} sparring`);
  await pinSettings(page, language);
  const fake = await fakeSparring(page, language === 'hu' ? 'hu' : 'en');
  await fakeFlowcharts(page);
  await page.goto(`${ORIGIN}/practice`);
  await page.getByTestId('practice-tool-sparring').click({ timeout: 30_000 });
  await page.getByTestId('sparring-setup').waitFor({ timeout: 15_000 });
  // The motion comes from the Current Debate, so the round attaches to it without the motion question.
  await page.waitForFunction(() => (document.querySelector('[data-testid="sparring-motion"]') as HTMLTextAreaElement | null)?.value.trim());
  await page.getByTestId('sparring-format').click();
  await page.getByRole('menuitem', { name: 'Lincoln-Douglas' }).click();
  await settle(page);
  await shoot(page, `${prefix}-sparring-setup`);
  // The round's cost sits above the start button, below the fold on a phone.
  await page.getByTestId('session-cost').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shoot(page, `${prefix}-sparring-cost`);

  fake.hold('respond');
  await page.getByRole('button', { name: /^(Start round|Forduló indítása|Iniciar ronda)$/ }).click();
  await page.getByRole('menuitem', { name: /^(Con|Ellene|En contra)$/ }).click();
  await page.getByTestId('sparring-thinking').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(400);
  await shoot(page, `${prefix}-sparring-opponent`);
  fake.release('respond');

  for (const [index, speech] of text.speeches.entries()) {
    await page.getByTestId('sparring-input').waitFor({ timeout: 15_000 });
    await page.getByTestId('sparring-input').fill(speech);
    if (index === 0) {
      await page.getByTestId('sparring-input').blur();
      await page.waitForTimeout(400);
      await shoot(page, `${prefix}-sparring-your-turn`);
      // The student's clock runs from the moment the turn starts.
      await page.getByTestId('sparring-time').filter({ hasText: /^6:5\d$/ }).waitFor({ timeout: 5_000 });
      // The flow button opens the Flowchart above the round, and the round is still there on the way back.
      await page.getByTestId('sparring-flow').click();
      await page.getByTestId('flow-card').first().waitFor({ timeout: 30_000 });
      await settle(page);
      await shoot(page, `${prefix}-sparring-flowchart`);
      await page.goBack();
      await page.getByTestId('sparring-input').waitFor({ timeout: 15_000 });
      if ((await page.getByTestId('sparring-input').inputValue()) !== speech) problems.push(`${prefix} sparring: the speech draft was lost after the Flowchart`);
    }
    if (index === text.speeches.length - 1) fake.hold('score');
    await page.getByTestId('sparring-main').click();
  }
  await page.getByTestId('sparring-judging').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(400);
  await shoot(page, `${prefix}-sparring-judging`);
  fake.release('score');

  await shootCelebration(page, `${prefix}-sparring-celebration`);
  await page.getByTestId('sparring-scorecard').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(400);
  await shoot(page, `${prefix}-sparring-scorecard`);
  const taps = await page.evaluate(() => (window as unknown as { __debatelabTurnTaps?: number }).__debatelabTurnTaps ?? 0);
  if (taps !== text.speeches.length) problems.push(`${prefix} sparring: expected ${text.speeches.length} turn-start taps, got ${taps}`);
  await page.close();
}

// What the web preview's fake recognizer "hears" (speech-recognition.web.ts): a filler, then a pause long enough to count.
const SPOKEN = {
  en: [
    { text: 'Um, a ban punishes the people with the fewest choices.', afterMs: 1_200 },
    { text: 'The nurse who drives in at five has no bus at that hour,', afterMs: 3_600 },
    { text: 'and permits only help those who know how to apply.', afterMs: 1_400 },
  ],
  hu: [
    { text: 'Hát, a tilalom azokat bünteti, akiknek a legkevesebb választásuk van.', afterMs: 1_200 },
    { text: 'A hajnali ötkor munkába autózó ápolónak abban az órában nincs busza,', afterMs: 3_600 },
    { text: 'az engedély pedig csak annak segít, aki tudja, hogyan kérje.', afterMs: 1_400 },
  ],
} as const;

/**
 * Voice rounds and dictation, on the web preview's fake recognizer and
 * opponent voice: the first-use notice, a spoken Sparring speech while it is
 * heard, the measured delivery on the scorecard, a spoken Crossfire question
 * and the round's delivery in the debrief, and Generate's dictation. The run
 * checks that the turns asked the server for the opponent's voice and that
 * the opponent's replies went to it.
 */
async function shootVoiceScreens(context: BrowserContext, prefix: string, language: string, problems: string[]) {
  const lang = language === 'hu' ? 'hu' : 'en';
  const text = SPARRING_TEXT[lang];
  const page = await context.newPage();
  watchErrors(page, problems, `${prefix} voice`);
  await pinSettings(page, language);
  await page.addInitScript((phrases) => {
    (window as unknown as { __debatelabFakeSpeech: unknown }).__debatelabFakeSpeech = { phrases };
    localStorage.removeItem('debatelab.voice-notice-v1');
  }, [...SPOKEN[lang]]);
  const voiceRequests: boolean[] = [];
  page.on('request', (request) => {
    if (!request.url().endsWith('/functions/v1/ai') || request.method() !== 'POST') return;
    const body = request.postDataJSON() as { input?: { action?: string; operation?: string }; quotaCheck?: boolean } | null;
    if (!body?.quotaCheck && (body?.input?.action === 'respond' || body?.input?.operation === 'next-turn')) voiceRequests.push((body as { voice?: boolean }).voice === true);
  });
  const fake = await fakeSparring(page, lang);
  await page.goto(`${ORIGIN}/practice`);
  await page.getByTestId('practice-tool-sparring').click({ timeout: 30_000 });
  await page.getByTestId('sparring-setup').waitFor({ timeout: 15_000 });
  await page.waitForFunction(() => (document.querySelector('[data-testid="sparring-motion"]') as HTMLTextAreaElement | null)?.value.trim());
  await page.getByTestId('sparring-format').click();
  await page.getByRole('menuitem', { name: 'Lincoln-Douglas' }).click();
  await page.getByTestId('voice-mode').getByRole('switch').click();
  await page.getByTestId('voice-notice').waitFor();
  await page.getByTestId('voice-notice').scrollIntoViewIfNeeded();
  await settle(page);
  await shoot(page, `${prefix}-voice-notice`);
  await page.getByTestId('voice-notice-accept').click();

  await page.getByRole('button', { name: /^(Start round|Forduló indítása|Iniciar ronda)$/ }).click();
  await page.getByRole('menuitem', { name: /^(Con|Ellene|En contra)$/ }).click();
  await page.getByTestId('voice-mic').waitFor({ timeout: 15_000 });
  await page.getByTestId('voice-mic').click();
  // Listening: the words fill the draft as they are heard.
  await page.waitForFunction((last) => (document.querySelector('[data-testid="sparring-input"]') as HTMLTextAreaElement | null)?.value.includes(last), SPOKEN[lang][1].text);
  await page.waitForTimeout(300);
  await shoot(page, `${prefix}-voice-speaking`);
  await page.waitForFunction((last) => (document.querySelector('[data-testid="sparring-input"]') as HTMLTextAreaElement | null)?.value.includes(last), SPOKEN[lang][2].text);
  await page.getByTestId('sparring-main').click();
  await page.getByTestId('sparring-input').waitFor({ timeout: 15_000 });
  await page.getByTestId('sparring-input').fill(text.speeches[1]);
  await page.getByTestId('sparring-main').click();
  // A strong score keeps its celebration up until it is tapped away.
  await shootCelebration(page, `${prefix}-voice-celebration`);
  await page.getByTestId('spoken-delivery').waitFor({ timeout: 15_000 });
  await page.getByTestId('spoken-delivery').scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await shoot(page, `${prefix}-voice-scorecard`);
  // The scorecard's PDF (export.web.ts keeps the HTML expo-print would print), rendered as a page of its own.
  // A wide iPad's outline rail is a menu too; the export is the item named PDF in every language.
  await page.getByTestId('document-more').click();
  await page.getByRole('menuitem', { name: /PDF/ }).click();
  const exported = await page.evaluate(() => (window as unknown as { __debatelabExport?: { html?: string; fileName?: string } }).__debatelabExport ?? {});
  if (!exported.html || !exported.fileName?.startsWith('SparringTranscript_')) problems.push(`${prefix} voice: the scorecard PDF was ${exported.fileName ?? 'not made'}`);
  else {
    const pdf = await context.newPage();
    await pdf.setViewportSize({ width: 794, height: 1123 });
    await pdf.setContent(exported.html);
    await pdf.screenshot({ path: join(OUT, `${prefix}-voice-sparring-pdf-html.png`), fullPage: true });
    await pdf.close();
  }
  const facts = (await page.getByTestId('delivery-facts').first().textContent()) ?? '';
  if (!/\d/.test(facts) || !facts.includes(lang === 'hu' ? 'hát' : 'um')) problems.push(`${prefix} voice: the delivery facts read "${facts}"`);
  const spoken = await page.evaluate(() => (window as unknown as { __debatelabOpponentVoice?: { segments: number }[] }).__debatelabOpponentVoice ?? []);
  if (spoken.length < 2 || spoken.some((item) => item.segments !== 1)) problems.push(`${prefix} voice: the opponent voice got ${JSON.stringify(spoken)}`);
  await page.close();

  // Crossfire: a spoken question, then the round's delivery in the debrief.
  const crossfire = await context.newPage();
  watchErrors(crossfire, problems, `${prefix} voice crossfire`);
  await pinSettings(crossfire, language);
  await crossfire.addInitScript((phrases) => {
    (window as unknown as { __debatelabFakeSpeech: unknown }).__debatelabFakeSpeech = { phrases };
  }, [{ text: CROSSFIRE_TEXT[lang].questions[0], afterMs: 1_000 }]);
  crossfire.on('request', (request) => {
    if (!request.url().endsWith('/functions/v1/ai') || request.method() !== 'POST') return;
    const body = request.postDataJSON() as { input?: { operation?: string }; quotaCheck?: boolean } | null;
    if (!body?.quotaCheck && body?.input?.operation === 'next-turn') voiceRequests.push((body as { voice?: boolean }).voice === true);
  });
  await fakeCrossfire(crossfire, lang);
  await crossfire.goto(`${ORIGIN}/practice`);
  await crossfire.getByTestId('practice-tool-crossfire').click({ timeout: 30_000 });
  await crossfire.getByTestId('crossfire-setup').waitFor({ timeout: 15_000 });
  await crossfire.waitForFunction(() => (document.querySelector('[data-testid="crossfire-resolution"]') as HTMLTextAreaElement | null)?.value.trim());
  await crossfire.getByTestId('crossfire-argument').fill(CROSSFIRE_TEXT[lang].argument);
  // The notice was accepted in the Sparring round, so the switch turns on at once.
  await crossfire.getByTestId('voice-mode').getByRole('switch').click();
  await crossfire.getByRole('button', { name: /^(Start crossfire|Keresztkérdezés indítása|Iniciar interrogatorio)$/ }).click();
  await crossfire.getByTestId('voice-mic').click({ timeout: 15_000 });
  await crossfire.waitForFunction((question) => (document.querySelector('[data-testid="crossfire-input"]') as HTMLTextAreaElement | null)?.value.includes(question), CROSSFIRE_TEXT[lang].questions[0]);
  await crossfire.waitForTimeout(300);
  await shoot(crossfire, `${prefix}-voice-crossfire`);
  await crossfire.getByTestId('crossfire-send').click();
  await crossfire.getByTestId('crossfire-turn').nth(1).waitFor({ timeout: 15_000 });
  // A typed second question: the fixed debrief cites the second exchange.
  await crossfire.getByTestId('crossfire-input').fill(CROSSFIRE_TEXT[lang].questions[1]);
  await crossfire.getByTestId('crossfire-send').click();
  await crossfire.getByTestId('crossfire-turn').nth(3).waitFor({ timeout: 15_000 });
  await crossfire.getByTestId('crossfire-end').click();
  await crossfire.getByTestId('spoken-delivery').waitFor({ timeout: 15_000 });
  await crossfire.getByTestId('spoken-delivery').scrollIntoViewIfNeeded();
  await crossfire.waitForTimeout(400);
  await shoot(crossfire, `${prefix}-voice-crossfire-debrief`);
  await crossfire.close();
  if (voiceRequests.length < 4 || voiceRequests.some((asked) => !asked)) problems.push(`${prefix} voice: turns asked for the voice as ${JSON.stringify(voiceRequests)}`);

  // Generate: dictating the motion.
  const generate = await context.newPage();
  watchErrors(generate, problems, `${prefix} dictation`);
  await pinSettings(generate, language);
  await generate.addInitScript((phrases) => {
    (window as unknown as { __debatelabFakeSpeech: unknown }).__debatelabFakeSpeech = { phrases };
  }, [{ text: lang === 'hu' ? 'Tiltsuk ki az autókat a belvárosból' : 'This House would ban private cars from city centres', afterMs: 800 }]);
  await generate.goto(`${ORIGIN}/generate`);
  await generate.getByTestId('generate-motion').waitFor({ timeout: 30_000 });
  await generate.getByTestId('generate-motion').fill('');
  await generate.getByTestId('dictate').click();
  await generate.waitForFunction(() => ((document.querySelector('[data-testid="generate-motion"]') as HTMLTextAreaElement | null)?.value ?? '').length > 10);
  await generate.waitForTimeout(300);
  await shoot(generate, `${prefix}-voice-dictation`);
  await generate.close();
}

// A saved Crossfire round, as CrossfirePage and the app save it, for the read-only view.
const SAVED_CROSSFIRE_ID = '00000000-0000-4000-8000-00000000cf02';

/**
 * The free tools in Practice: the speech time calculator with a speech in
 * it, the motion generator after drawing three, a drawn motion opened as a
 * new debate (shown, never saved), and a saved Crossfire round read again
 * from a fixed row.
 */
async function shootPracticeTools(context: BrowserContext, prefix: string, language: string, problems: string[]) {
  const lang = language === 'hu' ? 'hu' : 'en';
  const page = await context.newPage();
  watchErrors(page, problems, `${prefix} practice tools`);
  await pinSettings(page, language);
  await page.goto(`${ORIGIN}/practice`);
  await page.getByTestId('practice-tool-speech-time').click({ timeout: 30_000 });
  await page.getByTestId('speech-time-text').fill([...SPARRING_TEXT[lang].speeches, ...SPARRING_TEXT[lang].opponent].join('\n\n'));
  await page.getByTestId('slot-fits').waitFor();
  const words = Number(await page.getByTestId('word-count').textContent());
  if (!(words > 100)) problems.push(`${prefix} speech time: counted ${words} words`);
  await settle(page);
  await shoot(page, `${prefix}-tools-speech-time`);
  await page.getByTestId('slot-fits').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await shoot(page, `${prefix}-tools-speech-fits`);

  await page.goto(`${ORIGIN}/practice`);
  await page.getByTestId('practice-tool-motions').click({ timeout: 30_000 });
  await page.getByTestId('motion-filter-education').click();
  await page.getByTestId('motions-draw-three').click();
  await page.getByTestId('motion-card').nth(2).waitFor();
  await settle(page);
  await shoot(page, `${prefix}-tools-motions`);
  const drawn = (await page.getByTestId('motion-card').first().textContent()) ?? '';
  await page.getByTestId('motion-card').first().getByRole('button').last().click();
  await page.getByTestId('new-debate-sheet').waitFor({ timeout: 15_000 });
  const prefilled = await page.locator('[data-testid="new-debate-sheet"] textarea, [data-testid="new-debate-sheet"] input').first().inputValue();
  if (!prefilled || !drawn.includes(prefilled)) problems.push(`${prefix} motions: the new debate opened with "${prefilled}" for "${drawn}"`);
  await settle(page);
  await shoot(page, `${prefix}-tools-motion-debate`);
  await page.close();

  const saved = await context.newPage();
  watchErrors(saved, problems, `${prefix} saved crossfire`);
  await pinSettings(saved, language);
  const text = CROSSFIRE_TEXT[lang];
  const turns = [
    { id: 'T1', sequence: 1, speaker: 'user', kind: 'question', text: text.questions[0], createdAt: 1, delivery: { speakingSeconds: 6, wordCount: 9, wordsPerMinute: 90, fillerCount: 1, fillers: [{ word: lang === 'hu' ? 'hát' : 'um', count: 1 }], longPauses: 0, longestPauseSeconds: 0 } },
    { id: 'T2', sequence: 2, speaker: 'ai', kind: 'answer', text: text.answers[0], createdAt: 2 },
    { id: 'T3', sequence: 3, speaker: 'user', kind: 'question', text: text.questions[1], createdAt: 3 },
    { id: 'T4', sequence: 4, speaker: 'ai', kind: 'answer', text: text.answers[1], createdAt: 4 },
  ];
  const d = text.debrief;
  await saved.route(`${REST}/crossfires*`, (route) => route.fulfill({
    status: 200,
    headers: { 'access-control-allow-origin': '*' },
    json: {
      id: SAVED_CROSSFIRE_ID,
      title: 'This House would ban private cars from city centres',
      input: { resolution: 'This House would ban private cars from city centres', argument: text.argument, mode: 'question-ai', style: 'cooperative', durationSeconds: 300, seedQuestions: [], useSourceLibrary: false },
      output: {
        turns,
        debrief: {
          concessionsSecured: [{ turnIds: ['T4'], claim: d.concession }],
          controlledQuestions: [{ turnIds: ['T1'], claim: d.controlled }],
          weakOrRepetitiveQuestions: [],
          evasiveOrIncompleteAnswers: [],
          missedFollowUps: [{ turnIds: ['T2'], claim: d.missed }],
          betterFollowUpQuestions: [{ turnIds: ['T2'], question: d.better, reason: d.reason }],
          strongestExchange: { turnIds: ['T3', 'T4'], claim: d.strongest },
        },
        endedReason: 'manual',
      },
      created_at: new Date().toISOString(),
    },
  }));
  await saved.goto(`${ORIGIN}/crossfire-round/${SAVED_CROSSFIRE_ID}`);
  await saved.getByTestId('crossfire-saved').waitFor({ timeout: 30_000 });
  await saved.getByTestId('spoken-delivery').waitFor();
  await settle(saved);
  await shoot(saved, `${prefix}-tools-saved-crossfire`);
  await saved.close();
}

/**
 * The Timer from the Practice tab, on the website's free timer: idle,
 * running, and over time on the school format; a British Parliamentary
 * speech with points of information open; Public Forum prep; and the custom
 * format sheet. The page's clock is Playwright's, so minutes pass at once;
 * the web preview records the signals it would sound (timer-signals.web.ts)
 * and what the Lock Screen would show (live-activity.web.ts), and the run
 * checks both. The round is kept in the page's storage, so each run starts
 * from a cleared one.
 */
async function shootTimerScreens(context: BrowserContext, prefix: string, language: string, problems: string[]) {
  const page = await context.newPage();
  watchErrors(page, problems, `${prefix} timer`);
  await pinSettings(page, language);
  await page.clock.install();
  await page.goto(`${ORIGIN}/practice`);
  await page.evaluate(() => {
    localStorage.removeItem('debatelab.timer.session');
    localStorage.removeItem('debatelab.timer.formats');
  });
  await page.reload();
  await page.getByTestId('practice-tool-timer').click({ timeout: 30_000 });
  await page.getByTestId('timer-screen').waitFor({ timeout: 15_000 });
  await settle(page);
  await shoot(page, `${prefix}-timer`);

  // The school format's first speech is 4:00. After 1:14 it shows 2:46 and keeps running.
  await page.getByTestId('timer-toggle').click();
  await page.clock.fastForward('01:14');
  await page.getByTestId('timer-time').filter({ hasText: '2:46' }).waitFor();
  const activity = await page.evaluate(() => (window as unknown as { __debatelabTimerActivity?: { state: { kind: string; pausedAt: number | null } | null } }).__debatelabTimerActivity);
  if (activity?.state?.kind !== 'speech' || activity.state.pausedAt !== null) problems.push(`${prefix} timer: the Lock Screen state was ${JSON.stringify(activity)}`);
  await shoot(page, `${prefix}-timer-running`);

  // Past the last minute and on into overtime: one beep, then two, and the clock counts on.
  // runFor ticks through the marks; a jump (fastForward) reads as a return from the background, where only time up sounds.
  await page.clock.runFor('01:50');
  await page.getByTestId('timer-time').filter({ hasText: '0:56' }).waitFor();
  await page.clock.fastForward('01:00');
  await page.getByTestId('timer-time').filter({ hasText: '+0:04' }).waitFor();
  await page.waitForTimeout(100);
  const signals = async () => (await page.evaluate(() => (window as unknown as { __debatelabTimerSignals?: { signal: string }[] }).__debatelabTimerSignals ?? [])).map((item) => item.signal).join(',');
  const heard = await signals();
  if (heard !== 'beep,double-beep') throw new Error(`Timer signals were ${heard || 'none'}, expected beep,double-beep`);
  await shoot(page, `${prefix}-timer-time-up`);
  await page.getByTestId('timer-toggle').click();

  // British Parliamentary: 1:30 into the PM's speech, points of information are open and the knock sounded.
  await page.getByTestId('timer-format').click();
  await page.getByTestId('timer-format-menu').getByRole('menuitem', { name: 'British Parliamentary' }).click();
  await page.getByTestId('timer-time').filter({ hasText: '7:00' }).waitFor();
  await page.getByTestId('timer-toggle').click();
  await page.clock.runFor('01:30');
  await page.getByTestId('timer-time').filter({ hasText: '5:30' }).waitFor();
  await page.getByTestId('timer-poi').waitFor();
  await page.waitForTimeout(100);
  const withKnock = await signals();
  if (withKnock !== 'beep,double-beep,knock') problems.push(`${prefix} timer: BP signals were ${withKnock}, expected a knock when POIs opened`);
  await shoot(page, `${prefix}-timer-bp-poi`);
  await page.getByTestId('timer-toggle').click();

  // Public Forum prep: the first team's bank runs while the speech waits.
  await page.getByTestId('timer-format').click();
  await page.getByTestId('timer-format-menu').getByRole('menuitem', { name: 'Public Forum' }).click();
  await page.getByTestId('timer-prep-a').click();
  await page.clock.fastForward('00:40');
  await page.getByTestId('timer-prep-a').filter({ hasText: '2:20' }).waitFor();
  await page.getByTestId('timer-prep-a').scrollIntoViewIfNeeded();
  await shoot(page, `${prefix}-timer-prep`);
  await page.getByTestId('timer-prep-a').click();

  // The custom format sheet starts from the format on the timer.
  await page.getByTestId('timer-format').click();
  await page.getByTestId('timer-format-menu').getByRole('menuitem', { name: TIMER_NEW_FORMAT[language as keyof typeof TIMER_NEW_FORMAT] }).click();
  await page.getByTestId('timer-format-sheet').waitFor({ timeout: 15_000 });
  await settle(page);
  await shoot(page, `${prefix}-timer-format`);
  await page.close();
}

/** Prepare and Generate in one-off mode, reached in the app so the in-memory mode survives. Nothing is sent or saved. */
async function shootOneOffTools(page: Page, prefix: string) {
  await page.goto(`${ORIGIN}/`);
  // Opening the switcher takes the tab out of focus, which drops a load still running; let it finish first.
  await page.getByTestId('current-debate-motion').waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="debate-counts"]')?.textContent?.includes('–'));
  await settle(page);
  await page.getByTestId('current-debate-pill').click();
  await page.getByTestId('debates-sheet').waitFor();
  await settle(page);
  await turnOnOneOff(page);
  await closeSwitcher(page);
  // The iPad sidebar lists the tools themselves, so there is no Prepare tab to shoot there.
  const sidebar = await page.getByTestId('app-sidebar').isVisible();
  if (!sidebar) {
    await page.getByRole('tab', { name: /^(Prepare|Felkészülés|Preparar)$/ }).click();
    await page.getByTestId('prepare-tool-generate').waitFor({ timeout: 30_000 });
    // The Debate tab stays mounted behind Prepare with its own notice; only the visible one is Prepare's.
    await page.getByTestId('one-off-notice').filter({ visible: true }).waitFor();
    await settle(page);
    await shoot(page, `${prefix}-prepare-oneoff`);
  }
  // Brainstorm and Factoids say it through the same strip; a reload would end one-off mode, so go back in the app.
  for (const tool of ['brainstorm', 'factoids'] as const) {
    await openPrepareTool(page, tool);
    await page.getByTestId(`${tool}-screen`).getByTestId('one-off-notice').waitFor({ timeout: 30_000 });
    // The sidebar goes from tool to tool; on a phone the tool goes back to Prepare's tiles.
    if (!sidebar) {
      await page.goBack();
      await page.getByTestId('prepare-tool-generate').filter({ visible: true }).waitFor();
    }
  }
  await openPrepareTool(page, 'generate');
  await page.getByTestId('generate-motion').waitFor({ timeout: 30_000 });
  const notice = page.getByTestId('generate-screen').getByTestId('one-off-notice');
  await notice.waitFor();
  await shoot(page, `${prefix}-generate-oneoff`);
  // Return to debate turns the mode off in place, and the strip says where work goes again.
  await notice.getByRole('button').click();
  await page.getByTestId('generate-screen').getByTestId('working-in').waitFor();
}

/**
 * The iPad sidebar (ipad devices only): every tool under Debate, Prepare,
 * Practice, Library and You. It shoots the sidebar fully expanded, then with
 * Practice and Library closed while Generate is open, and checks that the
 * closed sections stay closed after a reload, that a row highlights the screen
 * it opens, that picking another row from an open tool replaces that tool
 * instead of stacking a second screen, and that a 600-point window (Split View)
 * has the tab bar instead.
 */
async function shootSidebar(context: BrowserContext, prefix: string, language: string, problems: string[]): Promise<number> {
  const page = await context.newPage();
  watchErrors(page, problems, `${prefix} sidebar`);
  await pinSettings(page, language);
  const viewport = page.viewportSize();
  await page.goto(`${ORIGIN}/`);
  await page.evaluate(() => localStorage.removeItem('debateowl.sidebar.collapsed'));
  await page.goto(`${ORIGIN}/`);
  const sidebar = page.getByTestId('app-sidebar');
  if (viewport && viewport.width < 700) {
    await page.getByTestId('app-tab-bar').waitFor();
    if (await sidebar.isVisible()) throw new Error(`${prefix}: a ${viewport.width}-point window shows the sidebar`);
    await page.close();
    return 0;
  }
  await sidebar.waitFor({ timeout: 30_000 });
  if (await page.getByTestId('app-tab-bar').isVisible()) throw new Error(`${prefix}: the tab bar shows beside the sidebar`);
  await page.getByTestId('current-debate-motion').waitFor({ timeout: 30_000 });
  await settle(page);
  const selected = async () => sidebar.locator('[aria-selected="true"]').getAttribute('data-testid');
  if ((await selected()) !== 'sidebar-item-dashboard') throw new Error(`${prefix}: the Debate tab does not highlight Dashboard`);
  await shoot(page, `${prefix}-sidebar-expanded`);

  // Generate from the sidebar, then Attack from Generate: the sidebar replaces the open tool.
  await sidebar.getByTestId('sidebar-item-generate').click();
  await page.getByTestId('generate-motion').waitFor({ timeout: 30_000 });
  await sidebar.getByTestId('sidebar-item-attack').click();
  await page.waitForURL('**/attack**');
  await sidebar.getByTestId('sidebar-item-generate').click();
  await page.getByTestId('generate-motion').waitFor({ timeout: 30_000 });
  if ((await selected()) !== 'sidebar-item-generate') throw new Error(`${prefix}: Generate is not highlighted on Generate`);
  await page.goBack();
  await page.waitForURL((url) => url.pathname === '/');
  await page.getByTestId('current-debate-motion').waitFor({ timeout: 30_000 });
  await sidebar.getByTestId('sidebar-item-generate').click();
  await page.getByTestId('generate-motion').waitFor({ timeout: 30_000 });

  // A tool opened cold, as from a link: the sidebar still replaces it, and Back reaches the tabs.
  await page.goto(`${ORIGIN}/generate`);
  await page.getByTestId('generate-motion').waitFor({ timeout: 30_000 });
  await sidebar.getByTestId('sidebar-item-ask').click();
  await page.waitForURL('**/ask**');
  await sidebar.getByTestId('sidebar-item-attack').click();
  await page.waitForURL('**/attack**');
  // The app's own Back (browser history on the web does not follow the stack).
  await page.getByTestId('document-back').filter({ visible: true }).click();
  await page.waitForURL((url) => url.pathname === '/', { timeout: 15_000 });
  // The dashboard drops a load it loses focus during, so let it finish before covering it again.
  await page.getByTestId('current-debate-motion').waitFor({ timeout: 30_000 });
  await settle(page);
  await sidebar.getByTestId('sidebar-item-generate').click();
  await page.getByTestId('generate-motion').waitFor({ timeout: 30_000 });

  for (const section of ['practice', 'library']) {
    const toggle = sidebar.getByTestId(`sidebar-toggle-${section}`);
    await toggle.click();
    if ((await toggle.getAttribute('aria-expanded')) !== 'false') throw new Error(`${prefix}: ${section} did not collapse`);
  }
  await settle(page);
  await shoot(page, `${prefix}-sidebar-collapsed`);

  await page.goto(`${ORIGIN}/library`);
  await sidebar.waitFor({ timeout: 30_000 });
  for (const section of ['practice', 'library']) {
    if (await sidebar.getByTestId(`sidebar-section-${section}`).locator('[data-testid^="sidebar-item-"]').count()) {
      throw new Error(`${prefix}: ${section} opened again after a reload`);
    }
  }
  // A closed section still marks the screen it holds.
  await sidebar.getByTestId('sidebar-toggle-library').click();
  if ((await selected()) !== 'sidebar-item-sources') throw new Error(`${prefix}: Sources is not highlighted on the Library`);

  // Split View: the same iPad at 600 points keeps the tab bar.
  if (viewport) {
    await page.setViewportSize({ width: 600, height: viewport.height });
    await page.getByTestId('app-tab-bar').waitFor();
    if (await sidebar.isVisible()) throw new Error(`${prefix}: the sidebar stays in a 600-point window`);
    await page.setViewportSize(viewport);
  }
  await page.close();
  return 2;
}

/**
 * A share link, end to end on staging: the made-up saved case's Share link
 * calls the real `share` function (one new link), and the link's code opens
 * the in-app viewer, which reads it back with the public get_shared_item RPC.
 */
async function shootShareLink(context: BrowserContext, prefix: string, language: string, problems: string[]): Promise<number> {
  const page = await context.newPage();
  watchErrors(page, problems, `${prefix} share`);
  await pinSettings(page, language);
  await fakeSavedCase(page);
  await page.goto(`${ORIGIN}/case/${SAVED_CASE_ID}`);
  await page.getByTestId('case-document').waitFor({ timeout: 30_000 });
  await page.getByTestId('document-more').click();
  await page.getByRole('menuitem', { name: MENU.shareLink }).last().click();
  await page.waitForFunction(() => Boolean((window as unknown as { __debatelabExport?: { sharedUrl?: string } }).__debatelabExport?.sharedUrl), undefined, { timeout: 30_000 });
  const url = await page.evaluate(() => (window as unknown as { __debatelabExport?: { sharedUrl?: string } }).__debatelabExport?.sharedUrl ?? '');
  const code = /^\/share\/([A-Za-z0-9_-]+)$/.exec(new URL(url).pathname)?.[1];
  if (!code) throw new Error(`The share link has no code: ${new URL(url).host}${new URL(url).pathname.replace(/[^/]+$/, '…')}`);
  console.log(`${prefix}: share link on ${new URL(url).host}, a ${code.length}-character code`);
  await page.close();

  const viewer = await context.newPage();
  watchErrors(viewer, problems, `${prefix} shared view`);
  await viewer.goto(`${ORIGIN}/share/${code}`);
  await viewer.getByTestId('shared-document').waitFor({ timeout: 30_000 });
  await viewer.getByTestId('case-opening').waitFor();
  await settle(viewer);
  await shoot(viewer, `${prefix}-shared-case`);
  await viewer.close();
  return 1;
}

/**
 * The first run and two account notices, each in a context of its own:
 * Ollie's welcome (asked for with ?intro=show, as on the website) and the
 * tour's first and last steps; the trial reminder, from a user_settings read
 * answered as a trial ending in two days with no subscription rows; and the
 * expired-session notice, from a stored session whose refresh the page
 * answers with invalid_grant. Nothing is written.
 */
async function shootFirstRun(
  browser: Browser,
  options: BrowserContextOptions,
  session: StorageState,
  prefix: string,
  language: string,
  problems: string[],
): Promise<number> {
  let shots = 0;
  const welcome = await newContext(browser, { ...options, storageState: session });
  const page = await welcome.newPage();
  watchErrors(page, problems, `${prefix} welcome`);
  await pinSettings(page, language);
  await page.goto(`${ORIGIN}/?intro=show`);
  await page.getByTestId('debateowl-intro').waitFor({ timeout: 30_000 });
  // The owl's lines land over 6.6 seconds.
  await page.waitForTimeout(7_000);
  await shoot(page, `${prefix}-welcome`);
  await page.getByTestId('intro-done').click();
  await page.getByTestId('tour-step-debate').waitFor();
  await shoot(page, `${prefix}-tour-debate`);
  for (const step of ['library', 'generate', 'ready']) {
    await page.getByTestId('tour-next').click();
    await page.getByTestId(`tour-step-${step}`).waitFor();
  }
  await shoot(page, `${prefix}-tour-ready`);
  await page.getByTestId('tour-next').click();
  await page.getByTestId('tour-step-ready').waitFor({ state: 'detached' });
  shots += 3;
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await welcome.close();

  const trial = await newContext(browser, { ...options, storageState: session });
  const trialPage = await trial.newPage();
  watchErrors(trialPage, problems, `${prefix} trial`);
  await pinSettings(trialPage, language);
  const endsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString();
  await trialPage.route(`${REST}/user_settings*`, async (route) => {
    if (route.request().method() !== 'GET' || !route.request().url().includes('trial_ends_at')) return route.fallback();
    // A read still running when the context closes ends quietly: Playwright's error would print the request's headers.
    try {
      const response = await route.fetch();
      const body: unknown = await response.json();
      const asTrial = (row: Record<string, unknown>) => ({ ...row, subscription_tier: 'trial', trial_ends_at: endsAt, grace_period_ends_at: null, daily_limit_override: null });
      await route.fulfill({ response, json: Array.isArray(body) ? body.map((row) => asTrial(row as Record<string, unknown>)) : asTrial(body as Record<string, unknown>) });
    } catch {
      await route.abort().catch(() => undefined);
    }
  });
  for (const table of ['subscriptions', 'app_store_subscriptions']) {
    await trialPage.route(`${REST}/${table}*`, (route) => route.fulfill({ status: 200, contentType: 'application/json', json: [] }));
  }
  await trialPage.goto(`${ORIGIN}/`);
  await trialPage.getByTestId('trial-banner').waitFor({ timeout: 30_000 });
  await settle(trialPage);
  await shoot(trialPage, `${prefix}-trial-banner`);
  await trialPage.getByTestId('trial-banner-dismiss').click();
  await trialPage.getByTestId('trial-banner').waitFor({ state: 'detached' });
  shots += 1;
  await trialPage.unrouteAll({ behavior: 'ignoreErrors' });
  await trial.close();

  // The stored session's access token has expired and the server refuses its refresh token.
  const expired = await newContext(browser, { ...options, storageState: session });
  await expired.addInitScript(() => {
    for (const key of Object.keys(localStorage)) {
      if (!key.includes('auth')) continue;
      try {
        const value = JSON.parse(localStorage.getItem(key) ?? 'null') as { expires_at?: number } | null;
        if (value && typeof value === 'object' && 'expires_at' in value) localStorage.setItem(key, JSON.stringify({ ...value, expires_at: 1 }));
      } catch {
        // Not a session.
      }
    }
  });
  await expired.route(`https://${STAGING_HOST}/auth/v1/token*`, (route) =>
    route.fulfill({ status: 400, contentType: 'application/json', json: { error: 'invalid_grant', error_description: 'Invalid Refresh Token: Refresh Token Not Found', code: 'refresh_token_not_found' } }),
  );
  // The refused refresh is the point of this page, so its 400 is not reported as a problem.
  const expiredPage = await expired.newPage();
  await expiredPage.goto(`${ORIGIN}/`);
  await expiredPage.getByTestId('session-expired').waitFor({ timeout: 45_000 });
  await shoot(expiredPage, `${prefix}-session-expired`);
  shots += 1;
  await expiredPage.unrouteAll({ behavior: 'ignoreErrors' });
  await expired.unrouteAll({ behavior: 'ignoreErrors' });
  await expired.close();
  return shots;
}

async function shootEmptyDebate(page: Page, prefix: string) {
  await page.route(`${REST}/current_debates*`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', json: [] }),
  );
  await page.goto(`${ORIGIN}/`);
  await page.getByTestId('current-debate-pill').waitFor({ timeout: 30_000 });
  await settle(page);
  await shoot(page, `${prefix}-debate-empty`);

  // One-off mode works without a Current Debate too; there is nothing to return to.
  await page.getByTestId('current-debate-pill').click();
  await page.getByTestId('debates-sheet').waitFor();
  await settle(page);
  await turnOnOneOff(page);
  await closeSwitcher(page);
  await page.getByTestId('one-off-notice').waitFor();
  if ((await page.getByTestId('one-off-notice').getByRole('button').count()) > 0) {
    throw new Error('One-off mode offered a return without a Current Debate');
  }
  await shoot(page, `${prefix}-debate-empty-oneoff`);
}

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS' };
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

/** Made-up work outside every debate, answered to the unsorted view's reads; the case suggests the Current Debate. */
async function fakeUnsorted(page: Page, motion: string) {
  const rows: Record<string, unknown[]> = {
    cases: [{ id: '00000000-0000-4000-8000-0000000c0001', title: motion, created_at: iso(-2 * 3600_000), motion, case_side: 'pro' }],
    brainstorms: [{ id: '00000000-0000-4000-8000-0000000b0001', title: 'School uniforms should be optional', created_at: iso(-26 * 3600_000), motion: 'School uniforms should be optional' }],
    chats: [{ id: '00000000-0000-4000-8000-0000000a0001', title: 'How long should a rebuttal be?', created_at: iso(-50 * 3600_000), messages: [{ count: 4 }] }],
    sources: [{ id: '00000000-0000-4000-8000-0000000d0001', title: 'City air quality report 2025', created_at: iso(-80 * 3600_000) }],
  };
  await page.route((url) => url.href.startsWith(REST) && url.search.includes('debate_id=is.null'), (route) => {
    if (route.request().method() !== 'GET') return route.abort();
    const table = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    return route.fulfill({ status: 200, headers: CORS, json: rows[table] ?? [] });
  });
}

/** History from the Debate tab's See all: the Current Debate, its chats, the scope menu, another debate and the unsorted view. */
async function shootHistory(context: BrowserContext, prefix: string, language: string, problems: string[]) {
  const page = await context.newPage();
  watchErrors(page, problems, `${prefix} history`);
  await pinSettings(page, language);
  await page.goto(`${ORIGIN}/`);
  await page.getByTestId('current-debate-motion').waitFor({ timeout: 30_000 });
  const motion = (await page.getByTestId('current-debate-motion').textContent())?.trim() ?? '';
  await fakeUnsorted(page, motion);
  // The Debate tab stays in the page under History; let its recent work finish loading first.
  await settle(page);
  await page.getByRole('button', { name: /^(See all|Összes|Ver todo)$/ }).click();
  await page.getByTestId('history-scope').waitFor({ timeout: 30_000 });
  await settle(page);
  await shoot(page, `${prefix}-history`);
  await page.getByTestId('history-tab-chats').click();
  await shoot(page, `${prefix}-history-chats`);
  await page.getByTestId('history-tab-sparring').click();
  await shoot(page, `${prefix}-history-sparring`);

  await page.getByTestId('history-scope').click();
  const menu = page.getByTestId('history-scope-menu');
  await menu.waitFor();
  await shoot(page, `${prefix}-history-scope-menu`);
  const items = menu.getByRole('menuitem');
  // The last item is one-off and unsorted work; the others are debates, the current one named with its motion.
  const others = (await items.count()) - 1;
  let other = -1;
  for (let index = 0; index < others; index += 1) {
    if (!(await items.nth(index).innerText()).includes(motion)) {
      other = index;
      break;
    }
  }
  if (other >= 0) {
    await items.nth(other).click();
    await settle(page);
    await shoot(page, `${prefix}-history-other`);
    await page.getByTestId('history-scope').click();
    await menu.waitFor();
  } else {
    console.log(`${prefix}: the account has one debate, so History shows no other debate`);
  }
  await items.last().click();
  await page.getByTestId('unsorted-target').first().waitFor({ timeout: 30_000 });
  await settle(page);
  await shoot(page, `${prefix}-history-unsorted`);
  await page.close();
}

const ANNOUNCEMENT_TEXT: Record<string, { title: string; body: string }[]> = {
  en: [
    { title: 'Practice rounds this Saturday', body: 'Sign up with your coach by Friday for a mixed-school practice round.' },
    { title: 'Your saved work, in one place', body: 'Every case, chat and brainstorm now opens from History.' },
  ],
  hu: [
    { title: 'Gyakorló fordulók szombaton', body: 'Péntekig jelentkezz az edződnél egy vegyes iskolai gyakorló fordulóra.' },
    { title: 'Mentett munkáid egy helyen', body: 'Minden eseted, beszélgetésed és ötletelésed az Előzményekből nyílik meg.' },
  ],
};

/** Answers the announcements function with two made-up announcements; a dismissal is answered locally. */
async function fakeAnnouncements(page: Page, language: string) {
  const announcements = (ANNOUNCEMENT_TEXT[language] ?? ANNOUNCEMENT_TEXT.en).map((text, index) => ({
    id: `00000000-0000-4000-8000-0000000e000${index + 1}`,
    title: text.title,
    body: text.body,
    starts_at: iso(-3600_000),
    expires_at: index === 0 ? iso(7 * 86_400_000) : null,
    created_at: iso(-3600_000),
  }));
  const dismissed = new Set<string>();
  await page.route(`https://${STAGING_HOST}/functions/v1/announcements*`, (route) => {
    const request = route.request();
    if (request.method() === 'POST') {
      const id = (request.postDataJSON() as { announcementId?: string } | null)?.announcementId;
      if (id) dismissed.add(id);
      return route.fulfill({ status: 200, headers: CORS, json: { success: true } });
    }
    if (request.method() === 'GET') {
      return route.fulfill({ status: 200, headers: CORS, json: { announcements: announcements.filter((item) => !dismissed.has(item.id)) } });
    }
    return route.fulfill({ status: 204, headers: CORS });
  });
}

async function shootAnnouncements(context: BrowserContext, prefix: string, language: string, problems: string[]) {
  const page = await context.newPage();
  watchErrors(page, problems, `${prefix} announcements`);
  await pinSettings(page, language);
  await fakeAnnouncements(page, language);
  await page.goto(`${ORIGIN}/`);
  const banner = page.getByTestId('announcement-banner');
  await banner.waitFor({ timeout: 30_000 });
  await settle(page);
  await shoot(page, `${prefix}-announcement`);
  const second = (ANNOUNCEMENT_TEXT[language] ?? ANNOUNCEMENT_TEXT.en)[1].title;
  await page.getByTestId('announcement-dismiss').click();
  await banner.getByText(second).waitFor({ timeout: 15_000 });
  await shoot(page, `${prefix}-announcement-next`);
  await page.close();
}

/** You down to its data rows, Download my data (once, read-only) and the Delete all my data sheet, never confirmed. */
async function shootAccount(context: BrowserContext, prefix: string, language: string, problems: string[]) {
  const page = await context.newPage();
  watchErrors(page, problems, `${prefix} account`);
  await pinSettings(page, language);
  await page.goto(`${ORIGIN}/you`);
  await page.getByTestId('subscription-tier').waitFor({ timeout: 30_000 });
  await settle(page);
  await page.getByTestId('you-delete-data').scrollIntoViewIfNeeded();
  await shoot(page, `${prefix}-you-account`);

  if (prefix === 'iphone-light-en') {
    await page.getByTestId('you-download-data').click();
    const exported = await page.waitForFunction(
      () => (window as unknown as { __debatelabExport?: { json?: string; fileName?: string } }).__debatelabExport?.json ? (window as unknown as { __debatelabExport: { json: string; fileName: string } }).__debatelabExport : null,
      undefined,
      { timeout: 60_000 },
    ).then((handle) => handle.jsonValue() as Promise<{ json: string; fileName: string }>);
    const data = JSON.parse(exported.json) as Record<string, unknown>;
    const shape = Object.fromEntries(Object.entries(data).map(([key, value]) => [key, Array.isArray(value) ? `array(${value.length})` : typeof value]));
    await writeFile(join(OUT, `${prefix}-download-data-shape.json`), JSON.stringify({ fileName: exported.fileName, keys: shape }, null, 2));
    console.log(`${prefix}: Download my data gave ${exported.fileName} with keys ${Object.keys(shape).join(', ')}`);
  }

  await page.getByTestId('you-delete-data').click();
  await page.getByTestId('delete-data-confirmation').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(700);
  await shoot(page, `${prefix}-delete-data`);
  await page.close();
}

/** The model picker in Generate, and its menu; nothing is chosen. */
async function shootModelPicker(context: BrowserContext, prefix: string, language: string, problems: string[]) {
  const page = await context.newPage();
  watchErrors(page, problems, `${prefix} model picker`);
  await pinSettings(page, language);
  await page.goto(`${ORIGIN}/generate?from=prepare`);
  await page.getByTestId('generate-motion').waitFor({ timeout: 30_000 });
  await page.locator('[data-testid="model-picker-generate"]:not([aria-disabled="true"])').waitFor({ timeout: 30_000 });
  await page.getByTestId('model-picker-generate').scrollIntoViewIfNeeded();
  await shoot(page, `${prefix}-generate-model`);
  await page.getByTestId('model-picker-generate').click();
  await page.getByRole('menu').waitFor();
  await shoot(page, `${prefix}-model-menu`);
  await page.close();
}

/** Shoots whatever page of the group is open when it fails, and names the group in the error. */
/**
 * KEEP_GOING=1 records a failed group and runs the rest, so one flaky step
 * does not cost every later shot; the run still exits with 1 and lists them.
 */
const KEEP_GOING = process.env.KEEP_GOING === '1';
const groupFailures: string[] = [];

function groupFailed(label: string, error: unknown): number {
  const message = `${label}: ${(error instanceof Error ? error.message : String(error)).split('\n')[0]}`;
  if (!KEEP_GOING) throw new Error(message);
  console.error(`FAILED ${message}`);
  groupFailures.push(message);
  return 0;
}

function failedIn(context: BrowserContext, prefix: string, group: string) {
  return async (error: unknown): Promise<number> => {
    const page = context.pages().at(-1);
    if (page) await shoot(page, `${prefix}-failed-${group}`).catch(() => undefined);
    return groupFailed(`${prefix} ${group}`, error);
  };
}

async function signIn(browser: Browser, problems: string[]): Promise<StorageState> {
  const context = await newContext(browser, { ...DEVICES.iphone, locale: LOCALES.en });
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
  await page.getByRole('tab', { name: 'Debate' }).waitFor({ timeout: 30_000 }).catch(async (error: unknown) => {
    const alert = await page.getByRole('alert').first().textContent({ timeout: 1_000 }).catch(() => null);
    // The field shows the code in plain text; empty it so the screenshot never holds it.
    await page.getByRole('textbox').fill('');
    await shoot(page, 'sign-in-failed');
    throw new Error(`Demo-code sign-in did not finish${alert ? `: ${alert}` : ''}`, { cause: error });
  });
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

  const context = await newContext(browser, { ...DEVICES.iphone, locale: LOCALES.en, storageState: expired });
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

const OFFLINE_RUNS = [
  { prefix: 'iphone-light-en', scheme: 'light', language: 'en' },
  { prefix: 'iphone-dark-hu', scheme: 'dark', language: 'hu' },
] as const;
const TABS = {
  debate: /^(Debate|Vita)$/,
  prepare: /^(Prepare|Felkészülés)$/,
  library: /^(Library|Könyvtár)$/,
  you: /^(You|Profil)$/,
};
const CACHE_PREFIX = 'debatelab.cache.v1';
const SAVED_CASE_ID = '00000000-0000-4000-8000-0000000ca5ed';
// Stands in for another account whose saved copies are still on the device.
const OTHER_USER_ID = '00000000-0000-4000-8000-0000000a11ce';

/** Answers the read of one made-up saved case (FAKE_CASE). Nothing is written. */
async function fakeSavedCase(page: Page) {
  await page.route(`${REST}/cases*`, (route) => {
    const request = route.request();
    if (request.method() !== 'GET' || new URL(request.url()).searchParams.get('id') !== `eq.${SAVED_CASE_ID}`) return route.continue();
    const row = { id: SAVED_CASE_ID, title: 'Car-free city centres', side: 'pro', debate_id: null, created_at: FAKE_CASE.metadata.generatedAt, input: {}, output: FAKE_CASE };
    const single = (request.headers().accept ?? '').includes('vnd.pgrst.object');
    return route.fulfill({ status: 200, json: single ? row : [row] });
  });
}

// Screens under the current one stay mounted on web, with their own notice.
const shownNotice = (page: Page) => page.locator('[data-testid="offline-notice"]:visible').first();
const cacheKeys = (page: Page) => page.evaluate((prefix) => Object.keys(localStorage).filter((key) => key.startsWith(prefix)), CACHE_PREFIX);

async function openFlowchart(page: Page) {
  await page.getByTestId('prepare-tool-flowchart').waitFor({ timeout: 30_000 });
  await settle(page);
  await page.getByTestId('prepare-tool-flowchart').click();
  await page.getByTestId('flow-card').first().waitFor({ timeout: 30_000 });
}

/**
 * Offline reading (ONLY=offline). Online, the run reads the Debate tab, the
 * Library and a source, a saved case and a flowchart, so the app keeps
 * copies. Then, first with the device offline (expo-network sees
 * navigator.onLine turn false) and navigating inside the app, and then
 * online but with every staging request failing and the page reloaded, the
 * same screens must show the same data under the offline notice. The case
 * and the maps are made up (FAKE_CASE, FAKE_FLOWCHART_ROWS); the debate and
 * the Library are the account's own. Nothing is written to staging.
 * Playwright's offline mode also blocks the local server, so the reload
 * fails staging requests instead.
 */
async function shootOfflineScreens(browser: Browser, state: StorageState, problems: string[], run: (typeof OFFLINE_RUNS)[number], isolation: boolean) {
  const { prefix, scheme, language } = run;
  const context = await newContext(browser, { ...DEVICES.iphone, colorScheme: scheme, locale: LOCALES[language], storageState: state });
  const page = await context.newPage();
  try {
    return await readOffline(context, page, problems, run, isolation);
  } catch (error) {
    await shoot(page, `${prefix}-offline-failed`);
    const spinners = await page.evaluate(() => Array.from(document.querySelectorAll('[role="progressbar"]'), (node) => node.getAttribute('aria-label') ?? ''));
    console.error(`${prefix}: failed at ${page.url()} with ${spinners.length} progress indicators ${JSON.stringify(spinners)}`);
    throw error;
  } finally {
    await context.close();
  }
}

async function readOffline(context: BrowserContext, page: Page, problems: string[], run: (typeof OFFLINE_RUNS)[number], isolation: boolean) {
  const { prefix, language } = run;
  let offline = false;
  watchErrors(page, problems, `${prefix} offline`, () => offline);
  page.on('dialog', (dialog) => void dialog.dismiss());
  await pinSettings(page, language);
  await fakeSavedCase(page);
  await fakeFlowcharts(page);

  // Online: read each screen once.
  await page.goto(`${ORIGIN}/`);
  await page.getByTestId('current-debate-motion').waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => !document.querySelector('[data-testid="debate-counts"]')?.textContent?.includes('–'));
  await settle(page);
  const motion = await page.getByTestId('current-debate-motion').textContent();
  const counts = await page.getByTestId('debate-counts').textContent();
  await page.getByRole('tab', { name: TABS.library }).click();
  await page.getByTestId('source-row').first().waitFor({ timeout: 30_000 });
  await settle(page);
  const firstSource = await page.getByTestId('source-row').first().textContent();
  await page.getByTestId('source-row').first().click();
  await page.getByTestId('source-sheet').getByRole('heading').waitFor({ timeout: 30_000 });
  await settle(page);
  await page.goto(`${ORIGIN}/case/${SAVED_CASE_ID}`);
  await page.getByTestId('case-document').waitFor({ timeout: 30_000 });
  await settle(page);
  await page.goto(`${ORIGIN}/prepare`);
  await openFlowchart(page);
  await settle(page);
  if (await page.getByTestId('offline-notice').count()) throw new Error('The offline notice showed while online');

  const userId = await page.evaluate((key) => (JSON.parse(localStorage.getItem(key) ?? '{}') as { user?: { id?: string } }).user?.id ?? '', SESSION_KEY);
  const kept = await cacheKeys(page);
  const foreign = kept.filter((key) => key !== `${CACHE_PREFIX}.owner` && !key.includes(userId));
  console.log(`${prefix}: ${kept.length} saved-copy keys after reading online, ${foreign.length} not under the signed-in account`);
  if (!userId || kept.length < 5 || foreign.length > 0) throw new Error('The app did not keep its saved copies under the signed-in account');

  const sameData = async (label: string) => {
    await page.waitForFunction(() => !document.querySelector('[data-testid="debate-counts"]')?.textContent?.includes('–'), undefined, { timeout: 30_000 });
    await settle(page);
    if ((await page.getByTestId('current-debate-motion').textContent()) !== motion) throw new Error(`${label}: the motion differs from the online read`);
    if ((await page.getByTestId('debate-counts').textContent()) !== counts) throw new Error(`${label}: the counts differ from the online read`);
  };

  // The device goes offline; the app navigates without reloading.
  offline = true;
  await context.setOffline(true);
  await shownNotice(page).waitFor({ timeout: 10_000 });
  await page.goBack();
  await page.getByRole('tab', { name: TABS.debate }).click();
  await page.getByTestId('current-debate-motion').waitFor({ timeout: 15_000 });
  await shownNotice(page).waitFor();
  await sameData('device offline');
  await shoot(page, `${prefix}-offline-debate`);
  await page.getByRole('tab', { name: TABS.library }).click();
  await page.getByTestId('source-row').first().waitFor({ timeout: 15_000 });
  if ((await page.getByTestId('source-row').first().textContent()) !== firstSource) throw new Error('device offline: the Library differs');
  await shoot(page, `${prefix}-offline-library`);
  await page.getByTestId('source-row').first().click();
  await page.getByTestId('source-sheet').getByRole('heading').waitFor({ timeout: 15_000 });
  await page.waitForTimeout(700);
  await shoot(page, `${prefix}-offline-source`);

  // Back online, but staging cannot be reached, and the page reloads.
  await context.setOffline(false);
  const toBackend = (url: URL) => url.host === STAGING_HOST;
  await page.route(toBackend, (route) => route.abort('internetdisconnected'));
  await page.goto(`${ORIGIN}/`);
  await page.getByTestId('current-debate-motion').waitFor({ timeout: 30_000 });
  await shownNotice(page).waitFor({ timeout: 15_000 });
  await sameData('staging unreachable');
  await shoot(page, `${prefix}-offline-reload-debate`);
  await page.getByRole('tab', { name: TABS.library }).click();
  await page.getByTestId('source-row').first().waitFor({ timeout: 15_000 });
  await shoot(page, `${prefix}-offline-reload-library`);
  await page.goto(`${ORIGIN}/case/${SAVED_CASE_ID}`);
  await page.getByTestId('case-document').waitFor({ timeout: 30_000 });
  await shownNotice(page).waitFor();
  await page.waitForTimeout(400);
  await shoot(page, `${prefix}-offline-case`);
  await page.goto(`${ORIGIN}/prepare`);
  await openFlowchart(page);
  await page.getByTestId('flowchart-screen').locator('[data-testid="offline-notice"]:visible').waitFor();
  await shoot(page, `${prefix}-offline-flowchart`);
  let shots = 7;

  if (isolation) {
    // Another account's copies on this device: move every copy to OTHER_USER_ID and make it the owner.
    await page.evaluate(({ prefix: cachePrefix, from, to }) => {
      for (const key of Object.keys(localStorage)) {
        if (!key.startsWith(cachePrefix) || !key.includes(from)) continue;
        const value = localStorage.getItem(key) ?? '';
        localStorage.setItem(key.replaceAll(from, to), value.replaceAll(from, to));
        localStorage.removeItem(key);
      }
      localStorage.setItem(`${cachePrefix}.owner`, to);
    }, { prefix: CACHE_PREFIX, from: userId, to: OTHER_USER_ID });
    const planted = (await cacheKeys(page)).filter((key) => key.includes(OTHER_USER_ID)).length;
    await page.goto(`${ORIGIN}/`);
    await page.getByTestId('auth-settled').waitFor({ state: 'attached', timeout: 60_000 });
    await settle(page);
    await page.waitForFunction(
      ({ prefix: cachePrefix, other }) => !Object.keys(localStorage).some((key) => key.startsWith(cachePrefix) && key.includes(other)),
      { prefix: CACHE_PREFIX, other: OTHER_USER_ID },
      { timeout: 15_000 },
    );
    const leaked = (await page.locator('body').innerText()).includes(motion ?? '\u0000');
    const motionShown = await page.getByTestId('current-debate-motion').count();
    await shoot(page, `${prefix}-offline-other-account`);
    shots += 1;
    console.log(`${prefix}: planted ${planted} copies for another account; after a start as this account: left ${(await cacheKeys(page)).filter((key) => key.includes(OTHER_USER_ID)).length}, motion shown ${motionShown > 0}`);
    if (planted === 0 || leaked || motionShown > 0) throw new Error("This account was shown another account's saved copies");

    // Signing out removes every copy. The logout request is answered here, so the staging session stays valid for other runs.
    await page.unroute(toBackend);
    offline = false;
    await page.route(`https://${STAGING_HOST}/auth/v1/logout*`, (route) => route.fulfill({ status: 204 }));
    await page.goto(`${ORIGIN}/`);
    await page.getByTestId('current-debate-motion').waitFor({ timeout: 30_000 });
    await settle(page);
    const before = (await cacheKeys(page)).length;
    await page.getByRole('tab', { name: TABS.you }).click();
    await page.getByRole('button', { name: /^(Sign out|Kijelentkezés)$/ }).click();
    await page.waitForURL('**/sign-in', { timeout: 30_000 });
    await page.waitForFunction((prefix) => !Object.keys(localStorage).some((key) => key.startsWith(prefix)), CACHE_PREFIX, { timeout: 15_000 });
    console.log(`${prefix}: ${before} saved-copy keys before sign-out, 0 after`);
    if (before === 0) throw new Error('No saved copies to clear before sign-out');
  }

  return shots;
}

async function main() {
  if (!Number.isInteger(PORT) || PORT <= 0) throw new Error('Set PORT to a free port');
  if (!existsSync(join(DIST, 'index.html'))) throw new Error('Run `npm run -w @debatelab/mobile export:web` first');
  await mkdir(OUT, { recursive: true });

  const server = await serve();
  // Launched in the try, so a missing browser still closes the server.
  let browser: Browser | null = null;
  const problems: string[] = [];
  let shots = 0;
  try {
    browser = await chromium.launch();
    const session = DEMO_CODE ? await signIn(browser, problems) : null;
    if (!session) console.log('STAGING_DEMO_CODE is not set: signed-in screens skipped');
    else if (offlineOnly) {
      for (const [index, run] of OFFLINE_RUNS.entries()) shots += await shootOfflineScreens(browser, session, problems, run, index === 0);
    } else await checkOfflineColdStart(browser, session, problems);

    for (const [device, options] of Object.entries(DEVICES)) {
      for (const scheme of SCHEMES) {
        for (const [language, locale] of Object.entries(LOCALES)) {
          const prefix = `${device}-${scheme}-${language}`;
          if (ONLY.length > 0 && !ONLY.some((only) => prefix.startsWith(only))) continue;
          const signedOut = await newContext(browser, { ...options, colorScheme: scheme, locale });
          const page = await signedOut.newPage();
          watchErrors(page, problems, prefix);
          await page.goto(`${ORIGIN}/sign-in`);
          await page.getByRole('tablist').waitFor();
          await shoot(page, `${prefix}-sign-in`);
          // The language menu sits above the form, so press Send code by name.
          await page.getByRole('button', { name: /^(Send code|Kód küldése|Enviar código)$/ }).click();
          await page.getByRole('alert').waitFor();
          await shoot(page, `${prefix}-sign-in-error`);
          await page.getByRole('tab').nth(1).click();
          await shoot(page, `${prefix}-sign-in-demo`);
          shots += 3;
          await signedOut.close();

          if (!session) continue;
          const signedIn = await newContext(browser, { ...options, colorScheme: scheme, locale, storageState: session });
          const tabPage = await signedIn.newPage();
          watchErrors(tabPage, problems, `${prefix} signed in`);
          await pinSettings(tabPage, language);
          if (want('debate')) {
            await shootDebateScreens(tabPage, prefix).catch(async (error: unknown) => {
              await shoot(tabPage, `${prefix}-failed`);
              groupFailed(prefix, error);
            });
            shots += 10;
          }
          if (want('debate-check')) {
            await shootDebateCheck(signedIn, prefix, language, problems).catch(failedIn(signedIn, prefix, 'debate-check'));
            shots += 1;
          }
          if (want('library')) {
            await shootLibraryScreens(tabPage, prefix, problems).catch(async (error: unknown) => {
              await shoot(tabPage, `${prefix}-failed`);
              groupFailed(prefix, error);
            });
            shots += 14;
          }
          for (const [name, route] of Object.entries(SIGNED_IN_ROUTES)) {
            if (!want(name)) continue;
            await tabPage.goto(`${ORIGIN}${route}`);
            await appShell(tabPage).waitFor();
            if (name === 'you') await tabPage.getByTestId('subscription-tier').waitFor({ timeout: 30_000 });
            await settle(tabPage);
            await shoot(tabPage, `${prefix}-${name}`);
            shots += 1;
            if (name === 'you') {
              // The web preview turns notifications on without registering anything (push.web.ts).
              const notifications = tabPage.getByRole('switch', { name: NOTIFICATIONS[language as keyof typeof NOTIFICATIONS] });
              await notifications.scrollIntoViewIfNeeded();
              await notifications.click();
              await tabPage.waitForFunction(() => document.querySelector('[role="switch"]:checked') !== null);
              await shoot(tabPage, `${prefix}-you-notifications-on`);
              shots += 1;
            }
          }
          if (want('empty')) {
            const emptyPage = await signedIn.newPage();
            watchErrors(emptyPage, problems, `${prefix} empty`);
            await pinSettings(emptyPage, language);
            await shootEmptyDebate(emptyPage, prefix);
            shots += 2;
          }
          if (want('sidebar') && device.startsWith('ipad')) {
            shots += await shootSidebar(signedIn, prefix, language, problems).catch(failedIn(signedIn, prefix, 'sidebar'));
          }
          // Each run makes one real share link on staging, so English only.
          if (want('share') && language === 'en') {
            shots += await shootShareLink(signedIn, prefix, language, problems).catch(failedIn(signedIn, prefix, 'share'));
          }
          if (want('first-run')) {
            shots += await shootFirstRun(browser, { ...options, colorScheme: scheme, locale }, session, prefix, language, problems).catch(failedIn(signedIn, prefix, 'first-run'));
          }
          if (want('ask')) {
            await shootAskScreens(signedIn, prefix, language, problems).catch(failedIn(signedIn, prefix, 'ask'));
            shots += 6;
          }
          if (want('results')) {
            await shootResultScreens(signedIn, prefix, language, problems).catch(failedIn(signedIn, prefix, 'results'));
            shots += 14;
          }
          for (const tool of ['brainstorm', 'factoids'] as const) {
            if (!want(tool)) continue;
            await shootTool(signedIn, prefix, language, problems, tool);
            shots += 7;
          }
          if (want('case-edits')) {
            await shootCaseEdits(signedIn, prefix, language, problems).catch(failedIn(signedIn, prefix, 'case-edits'));
            shots += 5;
          }
          if (want('context')) {
            await shootContextReview(signedIn, prefix, language, problems).catch(failedIn(signedIn, prefix, 'context'));
            shots += 3;
          }
          if (want('limits')) {
            await shootLimitSheets(signedIn, prefix, language, problems).catch(failedIn(signedIn, prefix, 'limits'));
            shots += 2;
          }
          if (want('tools')) {
            await shootPracticeTools(signedIn, prefix, language, problems).catch(failedIn(signedIn, prefix, 'tools'));
            shots += 6;
          }
          if (want('voice')) {
            await shootVoiceScreens(signedIn, prefix, language, problems).catch(failedIn(signedIn, prefix, 'voice'));
            shots += 6;
          }
          if (want('timer')) {
            await shootTimerScreens(signedIn, prefix, language, problems);
            shots += 6;
          }
          if (want('crossfire')) {
            await shootCrossfireScreens(signedIn, prefix, language, problems).catch(failedIn(signedIn, prefix, 'crossfire'));
            shots += 4;
          }
          if (want('sparring')) {
            await shootSparringScreens(signedIn, prefix, language, problems);
            shots += 7;
          }
          if (want('flowchart')) {
            await shootFlowchart(signedIn, prefix, language, problems);
            shots += 10;
          }
          if (want('one-off')) {
            const oneOffPage = await signedIn.newPage();
            watchErrors(oneOffPage, problems, `${prefix} one-off tools`);
            await pinSettings(oneOffPage, language);
            await shootOneOffTools(oneOffPage, prefix);
            await oneOffPage.close();
            shots += 2;
          }
          if (want('history')) {
            await shootHistory(signedIn, prefix, language, problems).catch(failedIn(signedIn, prefix, 'history'));
            shots += 7;
          }
          if (want('announcements')) {
            await shootAnnouncements(signedIn, prefix, language, problems).catch(failedIn(signedIn, prefix, 'announcements'));
            shots += 2;
          }
          if (want('account')) {
            await shootAccount(signedIn, prefix, language, problems).catch(failedIn(signedIn, prefix, 'account'));
            shots += 2;
          }
          if (want('model')) {
            await shootModelPicker(signedIn, prefix, language, problems).catch(failedIn(signedIn, prefix, 'model'));
            shots += 2;
          }
          await signedIn.close();
        }
      }
    }
  } finally {
    await browser?.close();
    server.close();
  }

  console.log(`${shots} screenshots in ${OUT}`);
  await writeFile(join(OUT, 'clipped.json'), JSON.stringify(clipped, null, 2));
  console.log(`${Object.keys(clipped).length} shots with clipped text (clipped.json)`);
  if (problems.length > 0 || groupFailures.length > 0) {
    console.error([...groupFailures, ...problems].join('\n'));
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
