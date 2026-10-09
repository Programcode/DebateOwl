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
 *
 * Generate and Attack screenshots never call a model and never save: the
 * page answers the ai function with a fixed case or attack, holds it open
 * for the "generating" shot, and answers case, attack and source writes
 * locally. The PDF export's HTML (the web export cannot run expo-print) is
 * rendered in a page of its own, and the "Copy as text" output is written
 * next to the screenshots. Brainstorm and Factoids are shot the same way,
 * from a fixed brainstorm and fixed factoids, and save nothing.
 *
 * Flowchart screenshots read fixed saved maps: the page answers every
 * flowcharts read with two made-up maps in the website's React Flow shape (or
 * none for one-off work, which shows the starter map) and answers writes
 * locally. The one-off shot turns one-off mode on in memory, as the switcher
 * does, and never taps a debate row.
 */
import { chromium, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from '@playwright/test';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
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

// A made-up case in GenerateOutput's shape, after mock 03: three arguments for a Standard case.
const FAKE_CASE = {
  caseStructure: {
    thesis: 'City centres are shared public space, and private cars take the most of it while costing everyone else their health.',
    framework: 'City centres are shared public space. The motion asks who gets to use that space, and at what cost to everyone else\'s health.',
    keyDefinitions: ['City centre: the area inside a city\'s inner ring road', 'Private cars: privately owned passenger vehicles, with exemptions for disabled drivers'],
    burdenOfProof: 'We must show that removing private cars improves health and access for most people who use the centre.',
  },
  contentions: [
    {
      id: '1',
      claim: 'Clean air is a public health duty',
      reasoning: 'Traffic is the largest source of roadside pollution, and the people who breathe it most are pedestrians, cyclists and residents, not drivers.',
      evidence: 'Low-traffic zones cut roadside NO₂ within their first year, according to the Clean Streets Review.',
      needsSource: false,
      impact: 'Fewer asthma admissions among children who live and study in the centre.',
    },
    {
      id: '2',
      claim: 'Streets back for people',
      reasoning: 'Parked and moving cars take most of a centre\'s street space while carrying a minority of the people in it.',
      evidence: 'The Street Space Audit found cars use most of the road area; the Footfall Study found shops gain visits when streets close to traffic.',
      needsSource: false,
      impact: 'Wider pavements, more seating and safer crossings for everyone.',
    },
    {
      id: '3',
      claim: 'Transit works when it isn\'t stuck in traffic',
      reasoning: 'Buses lose most of their delay to congestion caused by private cars.',
      evidence: 'Bus journeys became quicker and more reliable after the centre closed to through traffic, per the Clean Streets Review.',
      needsSource: false,
      impact: 'Faster, more reliable buses make the ban fair to people who cannot walk or cycle.',
    },
  ],
  predictedOpponentCase: {
    likelyArguments: ['Shift workers and carers need cars at hours when transit is thin', 'Businesses lose customers who drive in'],
    strategicWeaknesses: ['Depends on exemptions working in practice'],
    keyClashes: ['Access for the few against health for the many', 'Shops and footfall'],
  },
  counters: [
    { targetArgument: 'Shift workers need cars', counterpoint: 'Exemptions and night buses cover them.', rebuttal: 'Every real ban exempts carers and shift workers, and transit follows demand.' },
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

/** Fakes the tools' AI calls and saves for this page (see the header). `hold` keeps that tool waiting. */
async function fakeResults(page: Page, hold: FakeFeature | null) {
  const outputs: Record<string, { output: unknown; discoveredSources: unknown[] }> = {
    generate: { output: FAKE_CASE, discoveredSources: FAKE_SOURCES },
    attack: { output: FAKE_ATTACK, discoveredSources: [] },
    brainstorm: { output: FAKE_BRAINSTORM, discoveredSources: FAKE_SOURCES },
    factoids: { output: FAKE_FACTOIDS, discoveredSources: FAKE_SOURCES },
  };
  await page.route(`https://${STAGING_HOST}/functions/v1/ai`, async (route) => {
    const feature = (route.request().postDataJSON() as { feature?: string } | null)?.feature;
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
  await waiting.getByRole('button', { name: /^(Generate Debate Case|Vitaeset Generálása|Generar Caso de Debate)$/ }).click();
  await waiting.getByTestId('tool-progress').waitFor({ timeout: 15_000 });
  await shoot(waiting, `${prefix}-generating`);
  await waiting.close();

  const page = await open(false);
  await page.goto(`${ORIGIN}/generate?from=prepare`);
  await page.getByTestId('generate-motion').waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => (document.querySelector('[data-testid="generate-motion"]') as HTMLTextAreaElement | null)?.value.trim());
  await page.getByRole('button', { name: /^(Generate Debate Case|Vitaeset Generálása|Generar Caso de Debate)$/ }).click();
  await page.getByTestId('case-document').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(400);
  await shoot(page, `${prefix}-case`);
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

  await page.getByTestId('attack-this-case').click();
  await page.getByTestId('attack-case-text').waitFor({ timeout: 15_000 });
  await page.waitForFunction(() => (document.querySelector('[data-testid="attack-case-text"]') as HTMLTextAreaElement | null)?.value.startsWith('THESIS:'));
  await shoot(page, `${prefix}-attack-form`);
  await page.getByRole('button', { name: /^(Find Weaknesses|Gyengeségek Keresése|Encontrar Debilidades)$/ }).click();
  await page.getByTestId('attack-document').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(400);
  await shoot(page, `${prefix}-attack-result`);
  await page.close();
}

const TOOLS = {
  brainstorm: { field: 'brainstorm-motion', submit: /^(Start Brainstorming|Ötletelés Indítása|Comenzar Lluvia de Ideas)$/, document: 'brainstorm-document', working: 'brainstorming' },
  factoids: { field: 'factoids-claim', submit: /^(Find Factoids|Tények Keresése|Buscar Datos)$/, document: 'factoids-document', working: 'finding-factoids' },
} as const;
const FACTOIDS_CLAIM = 'Car-free city centres cut asthma admissions';

/** Brainstorm or Factoids: the form, its progress, the document open and collapsed, and Export, from fixed outputs. */
async function shootTool(context: BrowserContext, prefix: string, language: string, problems: string[], tool: keyof typeof TOOLS) {
  const spec = TOOLS[tool];
  const open = async (hold: boolean) => {
    const page = await context.newPage();
    watchErrors(page, problems, `${prefix} ${tool}`);
    page.on('dialog', (dialog) => void dialog.dismiss());
    await pinSettings(page, language);
    await fakeResults(page, hold ? tool : null);
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

  const page = await open(false);
  await page.getByRole('button', { name: spec.submit }).click();
  await page.getByTestId(spec.document).waitFor({ timeout: 30_000 });
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
  await page.goBack();
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
  await oneOff.getByRole('tab', { name: /^(Prepare|Felkészülés|Preparar)$/ }).click();
  await oneOff.getByTestId('prepare-tool-flowchart').waitFor({ timeout: 30_000 });
  await oneOff.getByTestId('prepare-tool-flowchart').click();
  await oneOff.getByTestId('flowchart-screen').getByTestId('one-off-notice').waitFor({ timeout: 30_000 });
  await oneOff.getByTestId('flow-card').first().waitFor({ timeout: 30_000 });
  await settle(oneOff);
  await shoot(oneOff, `${prefix}-flowchart-oneoff`);
  await oneOff.close();
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
          await shootResultScreens(signedIn, prefix, language, problems);
          shots += 9;
          for (const tool of ['brainstorm', 'factoids'] as const) {
            await shootTool(signedIn, prefix, language, problems, tool);
            shots += 6;
          }
          await shootFlowchart(signedIn, prefix, language, problems);
          shots += 10;
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
