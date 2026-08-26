import { test, expect } from '@playwright/test';
import { stubSupabaseSession, setLocale } from './helpers/auth';

const scorecard = {
  verdict: 'user-edge',
  summary: 'The user won the central mechanism clash and did more comparative weighing in rebuttal.',
  biggestImprovement: 'Front-load the comparison against narrower alternatives in the opening.',
  strengths: ['The rebuttal directly answered the opponent mechanism.'],
  missedArguments: ['The opening did not preempt the narrower-policy alternative.'],
  categories: [
    { category: 'argument-strength', rating: 'strong', evidence: 'The user established a clear participation benefit.', advice: 'Keep the causal claim this explicit.' },
    { category: 'warrant-quality', rating: 'solid', evidence: 'The participation mechanism was plausible but brief.', advice: 'Add one more causal link.' },
    { category: 'impact-analysis', rating: 'solid', evidence: 'The user explained why access matters but did not compare scale in the opening.', advice: 'Make the affected population comparative.' },
    { category: 'engagement', rating: 'strong', evidence: 'The rebuttal answered the opponent funding alternative directly.', advice: 'Keep organizing rebuttal around their offense.' },
    { category: 'rebuttal-efficiency', rating: 'strong', evidence: 'The response spent its time on the decisive alternative-policy clash.', advice: 'Preserve this collapse discipline.' },
    { category: 'weighing', rating: 'solid', evidence: 'The user compared access, but not probability explicitly.', advice: 'Add a one-sentence probability comparison.' },
    { category: 'evidence-use', rating: 'needs-work', evidence: 'No source was cited in the typed round.', advice: 'Use evidence only where it resolves a contested factual warrant.' },
    { category: 'strategy', rating: 'strong', evidence: 'The rebuttal collapsed onto why the alternative did not solve access.', advice: 'Preempt that alternative earlier next time.' },
  ],
  nextDrill: 'Give a 60-second opening that preempts one narrower counter-policy before the opponent raises it.',
};

function askEnvelope(response: string) {
  return JSON.stringify({ output: { response, followUpQuestions: [], uncertainties: [] } });
}

const corsHeaders = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'content-type': 'application/json',
};

test.beforeEach(async ({ page }) => {
  await setLocale(page, 'en');
  await stubSupabaseSession(page);
});

test('sparring completes the training loop and hands the round into existing tools', async ({ page }) => {
  let aiCall = 0;
  let discussInput: { message?: string; history?: Array<{ role?: string; content?: string }> } | undefined;

  await page.route('**/functions/v1/ai', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: 'ok' });
      return;
    }

    aiCall += 1;
    if (aiCall === 4) {
      const requestBody = route.request().postDataJSON() as { input?: typeof discussInput };
      discussInput = requestBody.input;
      await route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: askEnvelope('Focus the next drill on comparing universal access against targeted alternatives.'),
      });
      return;
    }

    const response = aiCall === 1
      ? JSON.stringify({
          speech: 'A universal free-transit policy is expensive. Targeted discounts can improve access while preserving funding for service quality.',
          pressurePoints: ['You have not shown why targeted support cannot solve the same access problem.'],
        })
      : aiCall === 2
        ? JSON.stringify({
            speech: 'You still need to prove that universal access creates more benefit than investing the same budget in frequency and reliability.',
            pressurePoints: ['The budget tradeoff is still underdeveloped.'],
          })
        : JSON.stringify(scorecard);

    await route.fulfill({ status: 200, headers: corsHeaders, body: askEnvelope(response) });
  });

  await page.goto('/app/sparring');
  await page.getByLabel('Motion').fill('This House would make public transport free at the point of use.');
  await page.getByRole('button', { name: 'Start sparring' }).click();

  const speechBox = page.locator('textarea').first();
  const opening = 'Free public transport removes a direct price barrier and lets more people participate in work, education, and public life.';
  await speechBox.fill(opening);
  await page.getByRole('button', { name: 'Send opening' }).click();
  await expect(page.getByText(/universal free-transit policy is expensive/i)).toBeVisible();
  await expect(page.getByText(/targeted support/i)).toBeVisible();

  await speechBox.fill('Targeted discounts preserve eligibility gaps and administrative friction, while universal access removes the barrier for every marginal trip.');
  await page.getByRole('button', { name: 'Send rebuttal' }).click();
  await expect(page.getByText(/frequency and reliability/i)).toBeVisible();

  await page.getByRole('button', { name: 'Finish and get scorecard' }).click();
  await expect(page.getByText('Your side had the edge')).toBeVisible();
  await expect(page.getByText(/Front-load the comparison against narrower alternatives/i)).toBeVisible();
  await expect(page.getByText('Weighing')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rematch this motion' })).toBeVisible();
  expect(aiCall).toBe(3);

  await page.getByRole('button', { name: 'Attack my round' }).click();
  await expect(page).toHaveURL(/\/app\/attack$/);
  await expect(page.locator('#caseText')).toHaveValue(new RegExp(opening.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  await page.goto('/app/sparring');
  await page.getByRole('button', { name: 'Discuss with Ask' }).click();
  await expect(page).toHaveURL(/\/app\/ask$/);
  await expect(page.getByText(/Focus the next drill on comparing universal access/i)).toBeVisible();

  expect(discussInput?.message).toContain('I just finished a DebateLab sparring round');
  expect(discussInput?.history?.some((entry) => entry.content === discussInput?.message)).toBe(false);
  expect(aiCall).toBe(4);
});

test('sparring can retry a failed opponent response without losing the user speech', async ({ page }) => {
  let aiCall = 0;
  await page.route('**/functions/v1/ai', async (route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 200, headers: corsHeaders, body: 'ok' });
      return;
    }

    aiCall += 1;
    const response = aiCall === 1
      ? ''
      : JSON.stringify({
          speech: 'A narrower subsidy still leaves eligibility friction, but you need to show why that friction is large enough to justify universality.',
          pressurePoints: ['Quantify or comparatively explain the eligibility-friction harm.'],
        });
    await route.fulfill({ status: 200, headers: corsHeaders, body: askEnvelope(response) });
  });

  await page.goto('/app/sparring');
  await page.getByLabel('Motion').fill('This House would make public transport free at the point of use.');
  await page.getByRole('button', { name: 'Start sparring' }).click();

  const opening = 'Universal access removes price and eligibility friction at the same time, increasing participation across marginal trips.';
  await page.locator('textarea').first().fill(opening);
  await page.getByRole('button', { name: 'Send opening' }).click();

  await expect(page.getByText(opening)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry opponent' })).toBeVisible();
  await page.getByRole('button', { name: 'Retry opponent' }).click();

  await expect(page.getByText(/narrower subsidy still leaves eligibility friction/i)).toBeVisible();
  await expect(page.getByText(opening)).toHaveCount(1);
  expect(aiCall).toBe(2);
});
