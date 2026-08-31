import { expect, test } from '@playwright/test';
import { setLocale, stubSupabaseSession } from './helpers/auth';

const strongSourceUrl = 'https://energy.gov/reports/solar-costs-2024';
const weakSourceUrl = 'https://example.com/broad-commentary';

test('authenticated Factoids shows the consulted-source quality panel', async ({ page }) => {
  await setLocale(page, 'en');
  await stubSupabaseSession(page);

  await page.route('**/functions/v1/ai', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        output: {
          factoids: [{
            id: 'fact-1',
            shortClaim: 'Solar costs fell by 42 percent',
            keyFigure: '42%',
            context: 'The official report compares the relevant period.',
            limitations: 'The result depends on the measured market segment.',
            citation: {
              title: 'Official energy statistics',
              publisher: 'Department of Energy',
              date: '2024',
              url: strongSourceUrl,
              verified: 'verified',
            },
            howToUse: 'Use this as a bounded cost trend.',
            relevanceScore: 92,
          }],
          searchSuggestions: [],
          warnings: [],
          verificationStatus: 'complete',
        },
        discoveredSources: [{
          title: 'Official energy statistics',
          url: strongSourceUrl,
          content: 'Official government statistics.',
          sourceType: 'government',
          qualityScore: 91,
          qualityLabel: 'strong',
          query: 'solar energy costs government evidence',
        }, {
          title: 'Broad commentary',
          url: weakSourceUrl,
          content: 'General commentary.',
          sourceType: 'generic',
          qualityScore: 30,
          qualityLabel: 'weak',
          query: 'solar energy costs commentary',
        }],
      }),
    });
  });

  await page.route('**/rest/v1/source_folders*', async (route) => {
    await route.fulfill({ status: 201, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/rest/v1/sources*', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'source-1',
        title: 'Consulted source',
        content: 'Evidence',
        type: 'url',
        origin: strongSourceUrl,
        folder: 'Auto-saved',
        metadata: {},
        is_active: true,
        created_at: new Date().toISOString(),
      }),
    });
  });

  await page.goto('/app/factoids');
  await page.getByRole('textbox', { name: /statement/i }).fill('Solar energy costs are falling');
  await page.getByRole('button', { name: /find factoids/i }).click();

  await expect(page.getByRole('heading', { name: /researched sources/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /official energy statistics/i }).first()).toHaveAttribute('href', strongSourceUrl);
  await expect(page.getByRole('link', { name: /broad commentary/i })).toHaveAttribute('href', weakSourceUrl);
  await expect(page.getByText('strong', { exact: true })).toBeVisible();
  await expect(page.getByText('weak', { exact: true })).toBeVisible();
  await expect(page.getByText('fallback context only', { exact: true })).toBeVisible();
  await expect(page.getByText('Solar costs fell by 42 percent')).toBeVisible();
});
