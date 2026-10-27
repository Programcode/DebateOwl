import { test, expect, type Page } from '@playwright/test';

const ORIGIN = 'https://debate.pi-stack.org';
const TOOL_PAGES = [
  { path: '/tools', h1: 'Free debate tools', type: 'CollectionPage' },
  { path: '/tools/debate-timer', h1: 'Free debate timer for every format', type: 'WebApplication' },
  { path: '/tools/debate-motion-generator', h1: 'Debate motion generator', type: 'WebApplication' },
  { path: '/tools/debate-flow-sheet', h1: 'Printable debate flow sheet', type: 'WebApplication' },
  { path: '/tools/speech-time-calculator', h1: 'How long is my speech? Speech time calculator', type: 'WebApplication' },
] as const;

/** Every request the page makes to a Supabase host or API path. The free tools need none. */
function watchSupabase(page: Page): string[] {
  const calls: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.hostname.endsWith('supabase.co') || /^\/(auth|rest|functions|storage)\/v1\//.test(url.pathname)) calls.push(request.url());
  });
  return calls;
}

const T0 = new Date('2026-10-22T10:00:00Z').getTime();

/** Opens a page on a fake clock that only moves when the test runs it forward. */
async function openPaused(page: Page, path: string) {
  await page.clock.install({ time: T0 });
  await page.goto(path);
  await page.clock.pauseAt(T0 + 5_000);
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !/Failed to load resource|net::ERR_/.test(message.text())) errors.push(message.text());
  });
  return errors;
}

test.describe('free debate tools', { tag: '@smoke' }, () => {
  for (const tool of TOOL_PAGES) {
    test(`${tool.path} renders signed out with its head and structured data`, async ({ page }) => {
      const supabase = watchSupabase(page);
      const errors = watchErrors(page);
      const response = await page.goto(tool.path);
      expect(response?.ok()).toBeTruthy();
      await expect(page.getByRole('heading', { level: 1, name: tool.h1 })).toBeVisible();
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${ORIGIN}${tool.path}`);
      await expect(page).toHaveTitle(/DebateOwl/);
      const graphs = await page.locator('script[type="application/ld+json"]').allTextContents();
      const types = graphs.flatMap((json) => (JSON.parse(json)['@graph'] as { '@type': string }[]).map((node) => node['@type']));
      expect(types).toContain(tool.type);
      expect(types).toContain('BreadcrumbList');
      expect(JSON.stringify(graphs)).not.toMatch(/aggregateRating|"review"/);
      expect(supabase, supabase.join('\n')).toEqual([]);
      expect(errors, errors.join('\n')).toEqual([]);
    });
  }

  test('the timer starts, pauses and opens points of information after the first minute', async ({ page }) => {
    await openPaused(page, '/tools/debate-timer?format=bp');
    const clock = page.getByRole('timer', { name: 'Speech time remaining' });
    await expect(clock).toHaveText('7:00');
    await expect(page.getByText('Protected time', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Start' }).click();
    await page.clock.runFor(61_000);
    await expect(clock).toHaveText('5:59');
    await expect(page.getByText('POIs open', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Pause' }).click();
    await page.clock.runFor(5_000);
    await expect(clock).toHaveText('5:59');

    // The round survives a reload.
    await page.reload();
    await expect(page.getByRole('timer', { name: 'Speech time remaining' })).toHaveText('5:59');

    // Keys act once the timer has focus.
    await page.getByRole('timer', { name: 'Speech time remaining' }).click();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('heading', { level: 2, name: 'Leader of the Opposition (Opening Opposition)' })).toBeVisible();
  });

  test('a custom format applies, lands in the share link, and survives a reload', async ({ page }) => {
    await page.goto('/tools/debate-timer?format=wsdc');
    await page.getByRole('button', { name: 'Build a custom format' }).click();
    const editor = page.getByRole('form', { name: 'Custom format' });
    await editor.getByLabel('Format name').fill('Club round');
    // Whole and fractional minutes both submit; the browser's step check once blocked every value.
    await editor.getByLabel('Minutes', { exact: true }).first().fill('5');
    await editor.getByLabel('Minutes', { exact: true }).nth(1).fill('2.5');
    await editor.getByRole('button', { name: 'Use this format' }).click();
    await expect(editor).toHaveCount(0);
    await expect(page).toHaveURL(/format=custom&custom=[A-Za-z0-9_-]+/);
    await expect(page.getByRole('timer', { name: 'Speech time remaining' })).toHaveText('5:00');
    await page.reload();
    await expect(page.getByRole('region', { name: /round timer/ }).getByLabel('Format')).toHaveValue('custom');
    await expect(page.getByRole('navigation', { name: 'Speeches' })).toContainText('2:30');
  });

  test('prep banks run down one side at a time', async ({ page }) => {
    await openPaused(page, '/tools/debate-timer?format=pf');
    const teamA = page.getByRole('button', { name: /Team A prep/ });
    const teamB = page.getByRole('button', { name: /Team B prep/ });
    await teamA.click();
    await page.clock.runFor(30_000);
    await teamB.click();
    await page.clock.runFor(10_000);
    await expect(teamA).toContainText('2:30');
    await expect(teamB).toContainText('2:50');
    await expect(teamB).toHaveAttribute('aria-pressed', 'true');
    await expect(teamA).toHaveAttribute('aria-pressed', 'false');
  });

  test('the embed renders the format alone, makes no third-party request, and stays out of the index', async ({ page, baseURL }) => {
    const external: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== new URL(baseURL!).origin) external.push(request.url());
    });
    await page.goto('/embed/debate-timer?format=wsdc');
    await expect(page.getByRole('heading', { level: 2, name: 'First Proposition' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `${ORIGIN}/tools/debate-timer`);
    const attribution = page.getByRole('link', { name: 'Timer by DebateOwl' });
    await expect(attribution).toHaveAttribute('href', `${ORIGIN}/tools/debate-timer`);
    await expect(attribution).not.toHaveAttribute('rel', /nofollow/);
    await expect(page.getByLabel('Format')).toHaveCount(0);
    await page.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    // Running for a few seconds gives any stray request time to show up.
    await expect(page.getByRole('timer', { name: 'Speech time remaining' })).toHaveText('7:57', { timeout: 10_000 });
    expect(external, external.join('\n')).toEqual([]);
  });

  test('a drawn set of motions keeps its permalink', async ({ page }) => {
    await page.goto('/tools/debate-motion-generator');
    await page.getByRole('button', { name: 'Education', exact: true }).click();
    await page.getByRole('button', { name: 'Draw three' }).click();
    const options = page.getByRole('region', { name: 'Motion generator' }).locator('ol > li');
    await expect(options).toHaveCount(3);
    const drawn = await options.locator('p').first().textContent();
    await expect(page).toHaveURL(/[?&]m=edu-\d{3}%2Cedu-\d{3}%2Cedu-\d{3}/);
    await page.reload();
    await expect(page.getByRole('region', { name: 'Motion generator' }).locator('ol > li').first().locator('p').first()).toHaveText(drawn!);
    // The whole bank is on the page for readers and crawlers.
    await expect(page.locator('#edu-001')).toBeAttached();
  });

  test('the calculator times a pasted speech and fits it to speech slots', async ({ page }) => {
    await page.goto('/tools/speech-time-calculator');
    await page.getByLabel('Your speech').fill(Array.from({ length: 260 }, (_, i) => `word${i}`).join(' '));
    await expect(page.getByTestId('word-count')).toHaveText('260');
    // 260 words at 130 wpm is two minutes: it fits a 2:00 final focus exactly.
    await expect(page.getByTestId('slot-fits').locator('li', { hasText: 'PF 2:00' })).toContainText('0:00 spare');
  });

  test('the flow sheet has a column per speech and prints', async ({ page }) => {
    await page.goto('/tools/debate-flow-sheet');
    await page.getByLabel('Format').selectOption('bp');
    const sheet = page.getByTestId('flow-sheet');
    for (const speech of ['PM', 'LO', 'DPM', 'DLO', 'MG', 'MO', 'GW', 'OW']) await expect(sheet.getByText(speech, { exact: true })).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('button', { name: /Print/ })).toBeHidden();
    await expect(sheet).toBeVisible();
  });

  test('the landing footer links to the tools hub', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('contentinfo').getByRole('link', { name: 'Free debate tools' }).click();
    await expect(page).toHaveURL(/\/tools$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Free debate tools' })).toBeVisible();
  });
});
