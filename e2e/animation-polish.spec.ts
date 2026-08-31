import { expect, test, type Page } from '@playwright/test';
import { stubSupabaseSession } from './helpers/auth';

const featureConfig = { provider: 'mock', model: 'local', temperature: 0.7 };
const STATE_TIMEOUT_MS = 15_000;

async function prepareMotionFixture(page: Page, reducedMotion: 'no-preference' | 'reduce') {
  await page.emulateMedia({ reducedMotion });
  await stubSupabaseSession(page);
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
  await page.getByRole('button', { name: 'Generate Debate Case' }).click();
  await expect(page.getByText('Reading the motion...')).toBeVisible({ timeout: STATE_TIMEOUT_MS });
  await expect(page.getByText(/We support the motion/)).toBeVisible({ timeout: STATE_TIMEOUT_MS });
}

test('keeps route and feature-state motion short and stable', async ({ page }, testInfo) => {
  await prepareMotionFixture(page, 'no-preference');
  const options = await openGenerateOptions(page);

  const route = page.locator('[data-route-transition-ms="160"]');
  await expect(route).toHaveAttribute('data-reduced-motion', 'false');
  const transitionMs = await options.evaluate((element) => Number.parseFloat(getComputedStyle(element).transitionDuration) * 1000);
  expect(transitionMs).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath('normal-empty-options.png'), fullPage: true });

  await generateMockCase(page);
  await expect(page.locator('#generate-results')).toBeVisible();
  await expect(page.locator('main.page-enter')).toHaveCount(0);
  await expect(page.getByText('Generate complete', { exact: true })).toBeHidden({ timeout: 10_000 });
  await page.screenshot({ path: testInfo.outputPath('normal-result.png'), fullPage: true });
});

test('removes non-essential route and state movement for reduced motion', async ({ page }, testInfo) => {
  await prepareMotionFixture(page, 'reduce');
  const options = await openGenerateOptions(page);

  const route = page.locator('[data-route-transition-ms="160"]');
  await expect(route).toHaveAttribute('data-reduced-motion', 'true');
  await expect.poll(() => options.evaluate((element) => getComputedStyle(element).transitionDuration)).toBe('0s');
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0);
  await page.screenshot({ path: testInfo.outputPath('reduced-empty-options.png'), fullPage: true });

  await generateMockCase(page);
  await expect(page.locator('#generate-results')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.getAnimations().filter((animation) => animation.playState === 'running').length)).toBe(0);
  await expect(page.getByText('Generate complete', { exact: true })).toBeHidden({ timeout: 10_000 });
  await page.screenshot({ path: testInfo.outputPath('reduced-result.png'), fullPage: true });
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
  await page.getByRole('button', { name: 'Find Weaknesses' }).click();
  await expect(page.getByText('Analyzing the case structure...')).toBeVisible({ timeout: STATE_TIMEOUT_MS });
  await expect(page.getByRole('heading', { name: 'Overall Assessment' })).toBeVisible({ timeout: STATE_TIMEOUT_MS });
  await page.screenshot({ path: testInfo.outputPath('attack-result.png'), fullPage: true });

  await page.goto('/app/brainstorm', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Unlock Creative Angles')).toBeVisible({ timeout: STATE_TIMEOUT_MS });
  await page.getByLabel('Motion / Topic').fill('This House would make public transport free.');
  await page.getByRole('button', { name: 'Start Brainstorming' }).click();
  await expect(page.getByText('Exploring angles...')).toBeVisible({ timeout: STATE_TIMEOUT_MS });
  await expect(page.getByRole('heading', { name: 'Top 5 Argument Angles' })).toBeVisible({ timeout: STATE_TIMEOUT_MS });

  await page.goto('/app/factoids', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Evidence That Wins')).toBeVisible({ timeout: STATE_TIMEOUT_MS });
  await page.getByLabel('Statement').fill('Free public transport reduces urban congestion.');
  await page.getByRole('button', { name: 'Find Factoids' }).click();
  await expect(page.getByText('Searching databases...')).toBeVisible({ timeout: STATE_TIMEOUT_MS });
  await expect(page.getByRole('heading', { name: 'Factoids' })).toBeVisible({ timeout: STATE_TIMEOUT_MS });

  await page.goto('/app/ask', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Start a conversation')).toBeVisible({ timeout: STATE_TIMEOUT_MS });
  await page.getByPlaceholder('Ask your debate coach...').fill('How should I weigh access against cost?');
  await page.getByRole('button', { name: 'Send message' }).click();
  await expect(page.getByText('Thinking...')).toBeVisible({ timeout: STATE_TIMEOUT_MS });
  await expect(page.getByText(/Great question about/)).toBeVisible({ timeout: STATE_TIMEOUT_MS });
});
