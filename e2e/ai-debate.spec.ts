import { test, expect, type Page, type Request } from '@playwright/test';

// The /ai-debate mini round with the demo-rebuttal Edge Function and Cloudflare
// Turnstile mocked. playwright.config.ts builds the dev server with
// VITE_DEMO_ENABLED=true and a test site key, so the live form shows.

const TURNSTILE_STUB = `window.turnstile = {
  render(element, options) { setTimeout(() => options.callback('test-turnstile-token'), 0); return 'widget-1'; },
  reset() {},
  remove() {},
};`;

async function mockDemo(page: Page) {
  const bodies: Array<Record<string, unknown>> = [];
  await page.route('https://challenges.cloudflare.com/**', (route) => route.fulfill({ contentType: 'text/javascript', body: TURNSTILE_STUB }));
  await page.route('**/functions/v1/demo-rebuttal', async (route) => {
    const request: Request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' } });
    const body = request.postDataJSON() as Record<string, unknown>;
    bodies.push(body);
    const turn = body.sessionId ? 2 : 1;
    return route.fulfill({
      status: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({
        sessionId: '11111111-1111-4111-8111-111111111111',
        ...(turn === 1 ? { sessionToken: 'signed-session-token' } : {}),
        turn,
        turnsLeft: turn === 1 ? 1 : 0,
        rebuttal: turn === 1 ? 'Phones also let pupils reach their parents in an emergency.' : 'Office phones are slower when every second counts.',
        judgeNote: turn === 1 ? 'You never say how a ban is enforced.' : 'Good answer; now weigh safety against focus.',
      }),
    });
  });
  return bodies;
}

test.describe('AI debate mini round', () => {
  test('two turns against the mocked AI end in the trial CTA', async ({ page }) => {
    const bodies = await mockDemo(page);
    await page.goto('/ai-debate');
    await expect(page.getByRole('heading', { level: 1, name: 'Debate an AI that argues back' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Frequently asked questions' })).toBeVisible();

    await page.getByLabel('Your argument').fill('Phones distract pupils in class and make bullying easier.');
    await page.getByRole('button', { name: 'Get the AI’s rebuttal' }).click();
    await expect(page.getByTestId('demo-rebuttal').first()).toHaveText('Phones also let pupils reach their parents in an emergency.');
    await expect(page.getByTestId('demo-judge-note').first()).toContainText('You never say how a ban is enforced.');

    await page.getByLabel('Your reply (one more turn)').fill('The school office phone covers emergencies.');
    await page.getByRole('button', { name: 'Send reply' }).click();
    await expect(page.getByTestId('demo-rebuttal').nth(1)).toHaveText('Office phones are slower when every second counts.');

    // Two turns is the cap: no third reply box, and the trial CTA in its place.
    await expect(page.getByLabel('Your reply (one more turn)')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Run a full timed round: start your 3-day trial' }).first()).toHaveAttribute('href', '/login');

    expect(bodies[0]).toMatchObject({ turnstileToken: 'test-turnstile-token', side: 'for', motion: 'This House would ban smartphones in schools' });
    expect(bodies[0].sessionId).toBeUndefined();
    expect(bodies[1]).toMatchObject({
      sessionId: '11111111-1111-4111-8111-111111111111',
      sessionToken: 'signed-session-token',
      previous: { argument: 'Phones distract pupils in class and make bullying easier.', rebuttal: 'Phones also let pupils reach their parents in an emergency.' },
    });
  });

  test('a switched-off server falls back to the sample round', async ({ page }) => {
    await page.route('https://challenges.cloudflare.com/**', (route) => route.fulfill({ contentType: 'text/javascript', body: TURNSTILE_STUB }));
    await page.route('**/functions/v1/demo-rebuttal', (route) => route.fulfill({
      status: 503,
      headers: { 'Access-Control-Allow-Origin': '*' },
      contentType: 'application/json',
      body: JSON.stringify({ error: 'demo_disabled' }),
    }));
    await page.goto('/ai-debate');
    await page.getByLabel('Your argument').fill('Phones distract pupils in class.');
    await page.getByRole('button', { name: 'Get the AI’s rebuttal' }).click();
    await expect(page.getByTestId('demo-sample')).toBeVisible();
    await expect(page.getByLabel('Your argument')).toHaveCount(0);
  });
});
