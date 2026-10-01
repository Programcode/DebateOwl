import { expect, test } from '@playwright/test';
import { setLocale, stubSupabaseSession } from './helpers/auth';

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
  'content-type': 'application/json',
};

const opponentSpeech = (index: number) => ({
  action: 'respond',
  speech: {
    content: `Opponent response ${index}: the policy needs a stronger comparative case against narrower alternatives.`,
    strategy: 'Test the warrant, then weigh the alternative.',
    targetedPoints: ['The comparative mechanism is still underdeveloped.'],
  },
});

const scorecard = {
  action: 'score',
  scorecard: {
    userScore: 78,
    aiScore: 74,
    categories: [
      { name: 'Logic', userScore: 20, aiScore: 18, feedback: 'The causal chain was clear.' },
      { name: 'Evidence', userScore: 18, aiScore: 18, feedback: 'The factual warrant needed more support.' },
      { name: 'Delivery', userScore: 19, aiScore: 19, feedback: 'Judged from organization, not vocal performance.' },
      { name: 'Strategy', userScore: 21, aiScore: 19, feedback: 'The user prioritized the central clash.' },
    ],
    overallFeedback: 'The user won a narrow edge by weighing the main mechanism.',
    keyMoments: ['The rebuttal answered the opponent’s strongest objection.'],
    improvementAreas: ['Compare the alternative policy explicitly.'],
    winner: 'user',
    verdict: 'The user had the edge.',
  },
};

test.beforeEach(async ({ page }) => {
  await setLocale(page, 'en');
  await stubSupabaseSession(page);
});

test('completes an LD sparring round through mocked opponent turns and judging', async ({ page }) => {
  let responseNumber = 0;
  const actions: string[] = [];

  await page.route('**/functions/v1/ai**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: 'ok' });
      return;
    }

    const body = route.request().postDataJSON() as { input?: { action?: string } };
    const action = body.input?.action ?? 'unknown';
    actions.push(action);
    const output = action === 'score' ? scorecard : opponentSpeech(++responseNumber);
    if (action === 'score') {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ output }) });
  });

  await page.goto('/app/sparring', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Sparring' })).toBeVisible();

  await page.getByLabel('Motion').fill('This House would make public transport free at the point of use.');
  await page.getByRole('combobox', { name: 'Round format' }).click();
  await page.getByRole('option', { name: /Lincoln-Douglas · 5 speeches/ }).click();
  await page.getByRole('button', { name: 'Start round' }).click();
  // No Current Debate yet: run this round once without saving it to a debate.
  await page.getByRole('dialog', { name: 'Start a debate with this motion?' }).getByRole('button', { name: 'Not now, use it once' }).click();

  const userSpeeches = [
    ['Affirmative constructive', 'Universal access removes the direct price barrier to participation.'],
    ['First affirmative rebuttal', 'Targeted discounts preserve eligibility gaps and administrative friction.'],
    ['Second affirmative rebuttal', 'The universal policy is more reliable because every marginal trip is covered.'],
  ] as const;

  for (const [index, [turnLabel, content]] of userSpeeches.entries()) {
    const draft = page.getByRole('textbox', { name: `Draft for ${turnLabel}` });
    await expect(draft).toBeVisible();
    await draft.fill(content);
    await page.getByRole('button', { name: 'Submit speech' }).click();
    if (turnLabel !== 'Second affirmative rebuttal') {
      await expect(page.getByText(`Opponent response ${index + 1}:`)).toBeVisible();
    }
  }

  await expect(page.getByText('Judge is weighing the round')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Here is what happened in the room.' })).toBeVisible();
  await expect(page.getByText('You won the ballot')).toBeVisible();
  await expect(page.getByText('The user had the edge.')).toBeVisible();
  expect(actions).toEqual(['respond', 'respond', 'score']);

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);
});

test('uses the school 4-6-6-3 roles and coaching in the default round', async ({ page }) => {
  const actions: string[] = [];
  await page.route('**/functions/v1/ai**', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: 'ok' });
      return;
    }
    const body = route.request().postDataJSON() as { input?: { action?: string } };
    actions.push(body.input?.action ?? 'unknown');
    await route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ output: opponentSpeech(1) }) });
  });

  await page.goto('/app/sparring', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Motion').fill('This House would require community service for graduation.');
  await page.getByRole('button', { name: 'Start round' }).click();
  // No Current Debate yet: run this round once without saving it to a debate.
  await page.getByRole('dialog', { name: 'Start a debate with this motion?' }).getByRole('button', { name: 'Not now, use it once' }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  const introductor = page.getByRole('textbox', { name: 'Draft for Pro Introductor' });
  await expect(introductor).toBeVisible();
  await expect(page.getByText(/Open with an exordio, define the key terms/)).toBeVisible();
  await introductor.fill('Our framework is civic responsibility. We define service as supervised work that directly benefits the local community.');
  await page.getByRole('button', { name: 'Submit speech' }).click();

  await expect(page.getByText('Opponent response 1:')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Draft for Pro R1' })).toBeVisible();
  await expect(page.getByText(/Build the core arguments with claims, warrants, support, and impacts/)).toBeVisible();
  expect(actions).toEqual(['respond']);
});

test('keeps the setup usable on mobile with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/app/sparring', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Sparring' })).toBeVisible();
  const logo = page.getByAltText('DebateLab logo');
  await expect(logo).toHaveAttribute('src', '/favicon-72.png');
  await expect(logo).toHaveAttribute('width', '36');
  await expect(logo).toHaveAttribute('height', '36');
  await expect.poll(() => logo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole('combobox', { name: 'Round format' })).toHaveText('School 4-6-6-3 · 8 speeches');
  await expect(page.getByText('Write the resolution as you would hear it in the room.')).toHaveCount(0);
  await expect(page.getByText('A precise motion gives the opponent something concrete to attack.')).toHaveCount(0);
  await expect(page.getByText('Pro Introductor')).toBeHidden();
  const speakingSummary = page.locator('main details > summary');
  const summaryMetrics = await speakingSummary.evaluate((element) => {
    const icon = element.querySelector('svg');
    if (!icon) throw new Error('Speaking order disclosure is missing its chevron.');
    const summaryBox = element.getBoundingClientRect();
    const iconBox = icon.getBoundingClientRect();
    return Math.abs((summaryBox.top + summaryBox.height / 2) - (iconBox.top + iconBox.height / 2));
  });
  expect(summaryMetrics).toBeLessThanOrEqual(1);
  await page.getByText('Speaking order', { exact: true }).click();
  await expect(page.getByText('Pro Introductor')).toBeVisible();
  await expect(page.getByText('Pro Conclusor')).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(hasHorizontalOverflow).toBe(false);

  const animationNames = await page.locator('[class*="animate-"]').evaluateAll((elements) => elements
    .map((element) => getComputedStyle(element).animationName)
    .filter((name) => name !== 'none'));
  expect(animationNames).toEqual([]);
});
