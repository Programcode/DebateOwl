import { expect, test, type Page } from '@playwright/test';
import { setLocale, stubSupabaseSession } from './helpers/auth';

type CrossfireRequest = {
  feature: string;
  input: {
    operation: 'next-turn' | 'debrief';
    expectedReply?: 'question' | 'answer';
    config: { mode: 'question-ai' | 'ai-questions-user'; useSourceLibrary: boolean };
    transcript: Array<{ id: string; text: string }>;
  };
  sources: unknown[];
};

async function installDeterministicBackend(page: Page, requests: CrossfireRequest[]) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      await route.continue();
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
      const body = route.request().postDataJSON() as CrossfireRequest;
      requests.push(body);
      if (body.input.operation === 'next-turn') {
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
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ output }) });
        return;
      }

      const output = {
        concessionsSecured: [{ turnIds: ['T2'], claim: 'The answer accepts that the safety link depends on traffic exposure.' }],
        controlledQuestions: [{ turnIds: ['T1', 'T2'], claim: 'The opening exchange keeps the discussion on the central causal warrant.' }],
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

async function prepare(page: Page, requests: CrossfireRequest[]) {
  await setLocale(page, 'en');
  await stubSupabaseSession(page);
  await page.addInitScript(() => {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith('debatelab-crossfire-draft:')) window.localStorage.removeItem(key);
    }
  });
  await installDeterministicBackend(page, requests);
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
  await page.getByTestId('end-crossfire').click();

  await expect(page.getByTestId('crossfire-debrief')).toBeVisible();
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
  await page.getByTestId('end-crossfire').click();

  await expect(page.getByTestId('crossfire-debrief')).toBeVisible();
  expect(requests[0].input).toMatchObject({ operation: 'next-turn', expectedReply: 'question', config: { mode: 'ai-questions-user', useSourceLibrary: false } });
  expect(requests[1].input.transcript.at(-1)?.text).toBe('Traffic exposure falls when trips shift to transit and walking.');
  expect(requests.at(-1)?.input.operation).toBe('debrief');
  await page.screenshot({ path: testInfo.outputPath('crossfire-ai-questions-user-final.png'), fullPage: true });
});
