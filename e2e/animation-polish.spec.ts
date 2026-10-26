import { expect, test, type Page } from '@playwright/test';
import { seedCurrentDebate, stubSupabaseSession } from './helpers/auth';
import { stubAIResponses } from './fixtures/ai-responses';

const featureConfig = { provider: 'openrouter', model: 'z-ai/glm-5.3-flash' };
const STATE_TIMEOUT_MS = 15_000;

async function prepareMotionFixture(page: Page, reducedMotion: 'no-preference' | 'reduce') {
  await page.emulateMedia({ reducedMotion });
  await stubSupabaseSession(page);
  await seedCurrentDebate(page, 'This House would make public transport free.');
  await page.addInitScript(() => {
    window.localStorage.setItem('debate-trainer-onboarding', JSON.stringify({ state: { hasCompletedOnboarding: true, isTourRunning: false }, version: 0 }));
  });
  await stubAIResponses(page);
  await page.addInitScript((config) => {
    window.localStorage.setItem('debate-trainer-settings', JSON.stringify({
      state: {
        language: 'en',
        outputLanguage: 'en',
        theme: 'light',
        featureConfigs: {
          generate: config,
          attack: config,
          brainstorm: config,
          factoids: config,
          ask: config,
          sparring: config,
        },
        wikiResearchEnabled: false,
      },
      version: 0,
    }));
  }, featureConfig);
}

async function openGenerateOptions(page: Page) {
  await page.goto('/app/generate', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Ready to Generate')).toBeVisible({ timeout: STATE_TIMEOUT_MS });
  const options = page.locator('#generate-more-options');
  expect(await options.evaluate((element) => (element as HTMLElement).inert)).toBe(true);
  await page.getByRole('button', { name: 'More options' }).click();
  await expect(options).toHaveAttribute('data-open', 'true');
  expect(await options.evaluate((element) => (element as HTMLElement).inert)).toBe(false);
  await page.getByRole('button', { name: 'More options' }).click();
  await expect(options).toHaveAttribute('data-open', 'false');
  expect(await options.evaluate((element) => (element as HTMLElement).inert)).toBe(true);
  await page.getByRole('button', { name: 'More options' }).click();
  await expect(options).toHaveAttribute('data-open', 'true');
  return options;
}

async function generateMockCase(page: Page) {
  await page.getByLabel('Motion / Topic').fill('This House would make public transport free.');
  await page.getByRole('button', { name: 'Generate debate case' }).click();
  await page.mouse.move(0, 0);
  await expect(page.getByText('Writing your case…')).toBeVisible({ timeout: STATE_TIMEOUT_MS });
  await expect(page.getByText(/We support the motion/)).toBeVisible({ timeout: STATE_TIMEOUT_MS });
}

/** Tools open from the Tools page, which is reached from the header. */
async function openFeatureRoute(page: Page, route: 'brainstorm' | 'factoids' | 'ask') {
  await page.locator('header a[href="/app"]').first().click();
  await page.locator('main').locator(`a[href="/app/${route}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/app/${route}$`));
}

test('removes non-essential route and state movement for reduced motion', async ({ page }, testInfo) => {
  await prepareMotionFixture(page, 'reduce');
  const options = await openGenerateOptions(page);

  await expect(page.locator('[data-route-transition-ms]')).toHaveCount(0);
  // Reduced motion keeps gentle fades but nothing that moves: no transform, height or grid-row transitions.
  await expect.poll(() => options.evaluate((element) => getComputedStyle(element).transitionProperty)).not.toMatch(/transform|grid-template-rows|height|all/);
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('reduced-empty-options.png'), fullPage: true });

  await generateMockCase(page);
  await expect(page.locator('#generate-results')).toBeVisible();
  // Phones scroll the results into view; wide screens show them beside the form.
  if ((page.viewportSize()?.width ?? 1280) < 1024) await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('reduced-result.png'), fullPage: true });
});

test('keeps a delayed route skeleton static under reduced motion', async ({ page }, testInfo) => {
  await prepareMotionFixture(page, 'reduce');
  await page.goto('/app', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Prepare' })).toBeVisible({ timeout: STATE_TIMEOUT_MS });
  await page.screenshot({ path: testInfo.outputPath('reduced-route-before.png'), fullPage: true });

  let destinationRequested = false;
  await page.route('**/src/pages/AttackPage.tsx*', async (route) => {
    destinationRequested = true;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });

  await page.locator('main').locator('a[href="/app/attack"]').click();
  await expect.poll(() => destinationRequested).toBe(true);

  const pendingStatus = page.getByRole('status', { name: 'Opening Attack', exact: true });
  const pendingSkeleton = page.locator('[data-route-skeleton="tool-form"][aria-busy="true"]');
  await expect(pendingStatus).toHaveCount(1);
  await expect(pendingStatus).toHaveAttribute('aria-live', 'polite');
  await expect(pendingStatus).toHaveText('Opening Attack');
  await expect(pendingSkeleton).toBeVisible();
  await expect(page.locator('.motion-loading-shell')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('reduced-route-pending.png'), fullPage: true });

  await expect(page.getByRole('heading', { name: 'Attack', exact: true })).toBeVisible({ timeout: STATE_TIMEOUT_MS });
  await page.screenshot({ path: testInfo.outputPath('reduced-route-ready.png'), fullPage: true });
});

test('audits applicable empty, loading, result, and option states across feature routes', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await prepareMotionFixture(page, 'no-preference');

  await page.goto('/app/attack', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('No Mercy Mode')).toBeVisible({ timeout: STATE_TIMEOUT_MS });
  const attackOptions = page.locator('#attack-options');
  await page.getByRole('button', { name: 'More options' }).click();
  await expect(attackOptions).toHaveAttribute('data-open', 'true');
  await page.getByRole('button', { name: 'More options' }).click();
  await expect(attackOptions).toHaveAttribute('data-open', 'false');
  expect(await attackOptions.evaluate((element) => (element as HTMLElement).inert)).toBe(true);
  await page.getByLabel('Your Argument').fill('Universal transit improves access, reduces congestion, and strengthens civic participation.');
  await page.getByRole('button', { name: 'Find weaknesses' }).click();
  await expect(page.getByText('Reviewing your case…')).toBeVisible({ timeout: STATE_TIMEOUT_MS });
  await expect(page.getByRole('heading', { name: 'Overall Assessment' })).toBeVisible({ timeout: STATE_TIMEOUT_MS });
  await page.screenshot({ path: testInfo.outputPath('attack-result.png'), fullPage: true });

  await openFeatureRoute(page, 'brainstorm');
  await expect(page.getByText('Unlock Creative Angles')).toBeVisible({ timeout: STATE_TIMEOUT_MS });
  await page.getByLabel('Motion / Topic').fill('This House would make public transport free.');
  await page.getByRole('button', { name: 'Start brainstorming' }).click();
  await expect(page.getByText('Finding angles…')).toBeVisible({ timeout: STATE_TIMEOUT_MS });
  await expect(page.getByRole('heading', { name: 'Top 5 Argument Angles' })).toBeVisible({ timeout: STATE_TIMEOUT_MS });

  await openFeatureRoute(page, 'factoids');
  await expect(page.getByText('Evidence That Wins')).toBeVisible({ timeout: STATE_TIMEOUT_MS });
  await page.getByLabel('Statement').fill('Free public transport reduces urban congestion.');
  await page.getByRole('button', { name: 'Find Factoids' }).click();
  await expect(page.getByText('Searching for evidence…')).toBeVisible({ timeout: STATE_TIMEOUT_MS });
  await expect(page.getByRole('heading', { name: 'Factoids' })).toBeVisible({ timeout: STATE_TIMEOUT_MS });

  await openFeatureRoute(page, 'ask');
  await expect(page.getByText('Start a conversation')).toBeVisible({ timeout: STATE_TIMEOUT_MS });
  await page.getByPlaceholder('Ask your debate coach...').fill('How should I weigh access against cost?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Working…')).toBeVisible({ timeout: STATE_TIMEOUT_MS });
  await expect(page.getByText(/Great question about/)).toBeVisible({ timeout: STATE_TIMEOUT_MS });
});
