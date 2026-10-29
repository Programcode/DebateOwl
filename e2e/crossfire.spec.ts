import { expect, test, type Page } from '@playwright/test';
import { seedCurrentDebate, setLocale, stubSupabaseSession } from './helpers/auth';
import { fulfillQuotaCheck } from './helpers/quota';

const MOTION = 'Resolved: cities should ban private cars downtown.';
const SEEDED_DEBATE_ID = '00000000-0000-4000-8000-00000000d001';

type CrossfireRequest = {
  feature: string;
  input: {
    operation: 'next-turn' | 'debrief' | 'signal';
    expectedReply?: 'question' | 'answer';
    reply?: { type: 'question' | 'answer'; text: string };
    signalToken?: string;
    config: { mode: 'question-ai' | 'ai-questions-user'; useSourceLibrary: boolean };
    transcript: Array<{ id: string; kind: 'question' | 'answer'; text: string }>;
  };
  sources: unknown[];
};

async function installDeterministicBackend(page: Page, requests: CrossfireRequest[], failFirstAnswer = false) {
  let answerFailed = false;
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      await route.continue();
      return;
    }

    // Serve the seeded debate so hydration keeps it as the Current Debate.
    const debateRow = url.pathname.endsWith('/rest/v1/debates')
      ? { id: SEEDED_DEBATE_ID, motion: MOTION, settings: {}, instructions: '', last_activity_at: new Date().toISOString(), created_at: new Date().toISOString() }
      : url.pathname.endsWith('/rest/v1/current_debates') ? { debate_id: SEEDED_DEBATE_ID } : null;
    if (debateRow && route.request().method() === 'GET') {
      const single = (route.request().headers().accept ?? '').includes('vnd.pgrst.object');
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(single ? debateRow : [debateRow]) });
      return;
    }

    if (url.pathname.includes('/rest/v1/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '*/0' },
        body: '[]',
      });
      return;
    }

    if (url.pathname.endsWith('/auth/v1/user')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: '00000000-0000-0000-0000-000000000001', email: 'e2e@example.com' }),
      });
      return;
    }

    if (url.pathname.endsWith('/functions/v1/ai')) {
      if (await fulfillQuotaCheck(route, {})) return;
      const body = route.request().postDataJSON() as CrossfireRequest;
      requests.push(body);
      if (body.input.operation === 'signal') {
        const answerTurnId = body.input.reply?.type === 'answer'
          ? `T${body.input.transcript.length + 1}`
          : body.input.transcript.at(-1)?.kind === 'answer' ? body.input.transcript.at(-1)?.id : undefined;
        const signal = answerTurnId ? {
          answerTurnId,
          answerQuality: body.input.reply?.type === 'answer' ? 'direct' : 'partial',
          answerQualityConfidence: 0.91,
          concession: body.input.reply?.type === 'answer' ? 'none' : 'implicit',
          concessionConfidence: 0.76,
          followUpOpportunity: 0.82,
        } : undefined;
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ output: signal ? { signal } : {} }) });
        return;
      }
      if (body.input.operation === 'next-turn') {
        if (failFirstAnswer && !answerFailed && body.input.expectedReply === 'answer') {
          answerFailed = true;
          await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Temporary Crossfire failure' }) });
          return;
        }
        const questionCount = requests.filter((request) =>
          request.input.operation === 'next-turn' && request.input.expectedReply === 'question'
        ).length;
        const output = body.input.expectedReply === 'answer'
          ? { type: 'answer', text: 'The case relies on reduced traffic exposure and documented collision risk.' }
          : {
              type: 'question',
              text: questionCount === 1
                ? 'What evidence connects fewer private cars to safer streets?'
                : 'How would you answer the strongest enforcement objection?',
            };
        const hasCompletedExchange = output.type === 'answer' || body.input.transcript.at(-1)?.kind === 'answer';
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ output, ...(hasCompletedExchange ? { signalToken: 'e2e-signal-token' } : {}) }) });
        return;
      }

      const output = {
        concessionsSecured: [{ turnIds: ['T2'], claim: 'The answer accepts that the safety link depends on traffic exposure.' }],
        controlledQuestions: [{ turnIds: ['T1'], claim: 'The opening question keeps the discussion on the central causal warrant.' }],
        weakOrRepetitiveQuestions: [{ turnIds: ['T1'], claim: 'The question could identify the type of evidence required more precisely.' }],
        evasiveOrIncompleteAnswers: [{ turnIds: ['T2'], claim: 'The answer does not name a study or traffic count.' }],
        missedFollowUps: [{ turnIds: ['T2'], claim: 'The next question should test the missing evidence.' }],
        betterFollowUpQuestions: [{ turnIds: ['T2'], question: 'Which study measures that reduction in collision risk?', reason: 'It turns the general answer into a checkable claim.' }],
        strongestExchange: { turnIds: ['T1', 'T2'], claim: 'The first exchange isolates the case\'s main empirical dependency.' },
      };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ output }) });
      return;
    }

    await route.abort('blockedbyclient');
  });
}

async function prepare(page: Page, requests: CrossfireRequest[], failFirstAnswer = false) {
  await setLocale(page, 'en');
  await stubSupabaseSession(page);
  await seedCurrentDebate(page, MOTION);
  await page.addInitScript(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('debatelab-crossfire-draft:')) window.localStorage.removeItem(key);
    }
  });
  await installDeterministicBackend(page, requests, failFirstAnswer);
  await page.goto('/app/crossfire');
  await page.getByTestId('crossfire-resolution').fill('Resolved: cities should ban private cars downtown.');
  await page.getByTestId('crossfire-argument').fill('Private cars create congestion and unsafe streets.');
}

test('Question the AI completes a grounded Crossfire debrief', async ({ page }, testInfo) => {
  const requests: CrossfireRequest[] = [];
  await prepare(page, requests);
  await page.getByTestId('mode-question-ai').click();
  await page.getByTestId('style-cooperative').click();
  await page.getByTestId('source-grounding').click();
  await page.getByTestId('start-crossfire').click();

  await page.getByTestId('crossfire-input').fill('What evidence supports the safety mechanism?');
  await page.getByTestId('submit-turn').click();
  await expect(page.getByText('The case relies on reduced traffic exposure and documented collision risk.')).toBeVisible();
  await expect(page.getByText('Direct answer')).toBeVisible();
  await expect(page.getByText('What evidence supports the safety mechanism?').locator('..')).not.toContainText('Direct answer');
  await expect(page.getByText('Follow-up opportunity')).toHaveCount(1);
  await page.getByTestId('end-crossfire').click();

  await expect(page.getByTestId('crossfire-debrief')).toBeVisible();
  await expect(page.getByText('Direct answer')).toBeVisible();
  await expect(page.getByText('T1', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('T2', { exact: true }).first()).toBeVisible();
  expect(requests[0].input).toMatchObject({ operation: 'next-turn', expectedReply: 'answer', config: { mode: 'question-ai', useSourceLibrary: true } });
  expect(requests[0].input.transcript.at(-1)?.text).toBe('What evidence supports the safety mechanism?');
  expect(requests.at(-1)?.input.operation).toBe('debrief');
  await page.screenshot({ path: testInfo.outputPath('crossfire-question-ai-final.png'), fullPage: true });
});

test('Let the AI question me alternates roles and completes a debrief', async ({ page }, testInfo) => {
  const requests: CrossfireRequest[] = [];
  await prepare(page, requests);
  await page.getByTestId('mode-ai-questions-user').click();
  await page.getByTestId('style-aggressive').click();
  await page.getByTestId('start-crossfire').click();

  await expect(page.getByText('What evidence connects fewer private cars to safer streets?')).toBeVisible();
  await page.getByTestId('crossfire-input').fill('Traffic exposure falls when trips shift to transit and walking.');
  await page.getByTestId('submit-turn').click();
  await expect(page.getByText('How would you answer the strongest enforcement objection?')).toBeVisible();
  await expect(page.getByText('Partial answer')).toBeVisible();
  await expect(page.getByText('Implicit concession')).toBeVisible();
  await expect(page.getByText('What evidence connects fewer private cars to safer streets?').locator('..')).not.toContainText('Partial answer');
  await page.getByTestId('end-crossfire').click();

  await expect(page.getByTestId('crossfire-debrief')).toBeVisible();
  await expect(page.getByText('Partial answer')).toBeVisible();
  expect(requests[0].input).toMatchObject({ operation: 'next-turn', expectedReply: 'question', config: { mode: 'ai-questions-user', useSourceLibrary: false } });
  expect(requests.filter((request) => request.input.operation === 'next-turn')[1].input.transcript.at(-1)?.text).toBe('Traffic exposure falls when trips shift to transit and walking.');
  expect(requests.at(-1)?.input.operation).toBe('debrief');
  await page.screenshot({ path: testInfo.outputPath('crossfire-ai-questions-user-final.png'), fullPage: true });
});

test('retry attaches one signal to the recovered answer', async ({ page }) => {
  const requests: CrossfireRequest[] = [];
  await prepare(page, requests, true);
  await page.getByTestId('start-crossfire').click();
  await page.getByTestId('crossfire-input').fill('What evidence supports the safety mechanism?');
  await page.getByTestId('submit-turn').click();
  await expect(page.getByTestId('retry-ai')).toBeVisible();
  await page.getByTestId('retry-ai').click();
  await expect(page.getByText('The case relies on reduced traffic exposure and documented collision risk.')).toBeVisible();
  await expect(page.getByText('Direct answer')).toHaveCount(1);
  await expect(page.getByText('Follow-up opportunity')).toHaveCount(1);
});
