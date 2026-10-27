import { expect, test, type Page } from '@playwright/test';
import { setLocale, stubSupabaseSession } from './helpers/auth';

// A fresh account: the server holds no debates until the journey starts one.
// The REST routes below stand in for Supabase, so this proves the client flow
// only; e2e/full-stack/first-run.spec.ts repeats it against real Auth and RLS.
const USER_ID = '00000000-0000-0000-0000-000000000001';

const copy = {
  en: {
    welcome: 'Welcome to DebateLab!',
    firstDebate: 'Start your first debate here.',
    startDebate: 'Start debate',
    motionField: 'Motion',
    library: 'Library',
    generate: 'Generate',
    ready: "You're Ready!",
    finish: 'Get started!',
    generateMotion: 'Motion / Topic *',
    generateSubmit: 'Generate debate case',
    offerTitle: 'Start a debate with this motion?',
    workingIn: 'Working in:',
    tourMotion: 'This House would ban homework',
    gateMotion: 'This House would abolish zoos',
  },
  hu: {
    welcome: 'Üdvözlünk a DebateLabban!',
    firstDebate: 'Itt indíthatod el az első vitádat.',
    startDebate: 'Vita indítása',
    motionField: 'Tétel',
    library: 'Könyvtár',
    generate: 'Generálás',
    ready: 'Készen állsz!',
    finish: 'Kezdjük!',
    generateMotion: 'Indítvány / téma *',
    generateSubmit: 'Vitaeset generálása',
    offerTitle: 'Indítasz egy vitát ezzel a tétellel?',
    workingIn: 'Munka ebben:',
    tourMotion: 'Ez a Ház betiltaná a házi feladatot',
    gateMotion: 'Ez a Ház bezárná az állatkerteket',
  },
} as const;

type DebateRow = { id: string; motion: string; settings: unknown; instructions: string; last_activity_at: string; created_at: string };

async function installFreshAccount(page: Page) {
  const debates: DebateRow[] = [];
  const aiDebateIds: Array<string | null> = [];
  let currentId: string | null = null;

  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return route.continue();

    if (url.pathname.endsWith('/auth/v1/user')) {
      return route.fulfill({ json: { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'e2e@example.com' } });
    }

    const single = (request.headers().accept ?? '').includes('vnd.pgrst.object');
    if (url.pathname.endsWith('/rest/v1/debates')) {
      if (request.method() === 'POST') {
        const body = request.postDataJSON() as { motion: string; settings?: unknown; instructions?: string };
        const now = new Date().toISOString();
        const row: DebateRow = {
          id: `00000000-0000-4000-8000-${String(debates.length + 1).padStart(12, '0')}`,
          motion: body.motion,
          settings: body.settings ?? {},
          instructions: body.instructions ?? '',
          last_activity_at: now,
          created_at: now,
        };
        debates.unshift(row);
        return route.fulfill({ status: 201, json: single ? row : [row] });
      }
      if (request.method() === 'GET') return route.fulfill({ json: debates });
      return route.fulfill({ status: 204, body: '' });
    }
    if (url.pathname.endsWith('/rest/v1/current_debates')) {
      if (request.method() === 'POST') {
        currentId = (request.postDataJSON() as { debate_id: string }).debate_id;
        return route.fulfill({ status: 201, body: '' });
      }
      return route.fulfill({ json: currentId ? [{ debate_id: currentId }] : [] });
    }
    if (url.pathname.includes('/rest/v1/')) {
      // PostgREST answers a single-row read of an empty table with 406.
      if (single) return route.fulfill({ status: 406, json: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } });
      return route.fulfill({ headers: { 'content-range': '*/0' }, json: [] });
    }
    if (url.pathname.endsWith('/functions/v1/ai')) {
      const body = request.postDataJSON() as { debateContext?: { debateId: string } };
      aiDebateIds.push(body.debateContext?.debateId ?? null);
      // The journey ends at the request; the model's answer is not under test.
      return route.fulfill({ status: 503, json: { error: 'Not under test' } });
    }
    return route.fulfill({ status: 404, body: '' });
  });

  return { debates, aiDebateIds };
}

async function freshStart(page: Page, locale: 'en' | 'hu', tourDone: boolean) {
  await setLocale(page, locale);
  await stubSupabaseSession(page);
  await page.addInitScript((done) => {
    // Seed once: a reload must keep what the app wrote.
    if (window.localStorage.getItem('debate-trainer-onboarding')) return;
    window.localStorage.setItem('debate-trainer-onboarding', JSON.stringify({
      state: { hasCompletedOnboarding: done, isTourRunning: false },
      version: 0,
    }));
  }, tourDone);
  return installFreshAccount(page);
}

for (const locale of ['en', 'hu'] as const) {
  const text = copy[locale];

  test(`[${locale}] the first tour step starts the first debate, then shows Library and Generate`, locale === 'en' ? { tag: '@smoke' } : {}, async ({ page }) => {
    const backend = await freshStart(page, locale, false);
    await page.goto('/app', { waitUntil: 'domcontentloaded' });

    const card = page.getByTestId('home-current-debate');
    const tooltip = page.locator('.react-joyride__tooltip');
    const next = page.locator('[data-test-id="button-primary"]');
    await expect(tooltip).toContainText(text.welcome, { timeout: 15_000 });
    await expect(tooltip).toContainText(text.firstDebate);
    await expect(next).toHaveAccessibleName(/1.*4/);

    // The student starts the debate from inside the first step.
    await tooltip.getByRole('button', { name: text.startDebate }).click();
    const dialog = page.getByRole('dialog');
    await expect(tooltip).toHaveCount(0);
    await dialog.getByLabel(text.motionField).fill(text.tourMotion);
    await dialog.getByRole('button', { name: text.startDebate }).click();
    await expect(dialog).toBeHidden();
    await expect(card).toContainText(text.tourMotion);
    expect(backend.debates.map((debate) => debate.motion)).toEqual([text.tourMotion]);

    // The tour resumes on Library, then one Prepare tool, then ends.
    await expect(tooltip).toContainText(text.library);
    await expect(next).toHaveAccessibleName(/2.*4/);
    await next.click();
    await expect(tooltip).toContainText(text.generate);
    await expect(next).toHaveAccessibleName(/3.*4/);
    await next.click();
    await expect(tooltip).toContainText(text.ready);
    await page.getByRole('button', { name: text.finish }).click();
    await expect(tooltip).toHaveCount(0);

    // Generate now works inside the debate the tour started.
    await page.locator('main [data-tour="mode-generate"]').click();
    await expect(page.getByTestId('current-debate-strip')).toContainText(`${text.workingIn} ${text.tourMotion}`);
    await expect(page.getByRole('textbox', { name: text.generateMotion })).toHaveValue(text.tourMotion);

    // Finishing is remembered across a reload.
    await page.goto('/app', { waitUntil: 'domcontentloaded' });
    await expect(card).toBeVisible();
    // eslint-disable-next-line no-restricted-properties -- observation window: the finished tour must not reopen after its start delay.
    await page.waitForTimeout(800);
    await expect(tooltip).toHaveCount(0);
  });

  test(`[${locale}] a tool offers a first debate from the typed motion instead of the switch dialog`, locale === 'en' ? { tag: '@smoke' } : {}, async ({ page }) => {
    const backend = await freshStart(page, locale, true);
    await page.goto('/app/generate', { waitUntil: 'domcontentloaded' });

    await page.getByRole('textbox', { name: text.generateMotion }).fill(text.gateMotion);
    await page.getByRole('button', { name: text.generateSubmit }).click();

    const offer = page.getByRole('dialog', { name: text.offerTitle });
    await expect(offer).toContainText(text.gateMotion);
    await offer.getByRole('button', { name: text.startDebate }).click();
    await expect(offer).toBeHidden();

    await expect(page.getByTestId('current-debate-strip')).toContainText(`${text.workingIn} ${text.gateMotion}`);
    expect(backend.debates.map((debate) => debate.motion)).toEqual([text.gateMotion]);
    // The request that followed belongs to the new debate.
    await expect.poll(() => backend.aiDebateIds).toEqual([backend.debates[0].id]);
  });
}
