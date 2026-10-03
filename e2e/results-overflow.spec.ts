import { expect, test } from '@playwright/test';
import { seedCurrentDebate, setLocale, stubSupabaseSession } from './helpers/auth';

// Models quote raw URLs in evidence. On 2026-10-02 a live run quoted this
// 135-character URL and the Generate results column grew past the viewport:
// a 1fr grid track grows to the min-content width of an unbreakable word.
const longUrl = 'https://admin.farefreelondon.org/wp-content/uploads/2026/04/20240320_GCC_Free_Public_Transport_Study_Summary_Report_v2.0.pdf';
const motion = 'This House would make public transport free';

const contention = (index: number) => ({
  id: String(index + 1),
  claim: `Contention ${index + 1}: fares block the riders who need transit most`,
  reasoning: 'Fares are a regressive barrier concentrated on low-income riders.',
  evidence: `The 2026 policy brief (${longUrl}) found fares covered 8 percent of operating costs.`,
  needsSource: false,
  impact: 'More people reach work, school, and healthcare.',
});

test('a long URL in generated evidence does not widen the page', async ({ page }) => {
  await setLocale(page, 'en');
  await stubSupabaseSession(page);
  await seedCurrentDebate(page, motion);
  await page.route('**/functions/v1/ai', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        output: {
          caseStructure: {
            thesis: 'Free transit is a net public good.',
            framework: 'Net societal benefit, weighed on access and cost.',
            keyDefinitions: ['Public transport: publicly funded scheduled transit.'],
            burdenOfProof: 'We must show the policy produces a net gain in practice.',
          },
          contentions: [0, 1, 2].map(contention),
          predictedOpponentCase: {
            likelyArguments: ['The lost farebox revenue has to come from somewhere.'],
            strategicWeaknesses: ['Assumes fare revenue is the only funding model.'],
            keyClashes: ['Who actually bears the cost.'],
          },
          counters: [{ targetArgument: 'Funding gap', counterpoint: 'Fare collection has overhead.', rebuttal: 'Net cost is small.' }],
          metadata: { side: 'pro', format: 'custom', generatedAt: new Date().toISOString() },
        },
        discoveredSources: [],
      }),
    });
  });

  await page.goto('/app/generate');
  await page.getByRole('button', { name: 'Generate Debate Case' }).click();
  await expect(page.getByText('Contention 3: fares block the riders who need transit most')).toBeVisible();

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'horizontal page overflow in px').toBeLessThanOrEqual(1);
  // The column must also stay inside the page container, which ends before the viewport edge on desktop.
  const results = await page.locator('#generate-results').boundingBox();
  const container = await page.locator('#generate-results').locator('xpath=ancestor::div[contains(@class, "max-w-6xl")]').boundingBox();
  expect(results && container && Math.round(results.x + results.width - (container.x + container.width))).toBeLessThanOrEqual(1);
});
