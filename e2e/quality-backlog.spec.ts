import { expect, test } from '@playwright/test';
import { seedCurrentDebate, setLocale, stubSupabaseSession } from './helpers/auth';

const locales = ['en', 'es', 'hu'] as const;
const titledRoutes = ['generate', 'attack', 'brainstorm', 'factoids', 'ask'] as const;
const toolsHeadings = {
  en: 'Prepare and practice',
  es: 'Preparar y practicar',
  hu: 'Felkészülés és gyakorlás',
} as const;

test('Sources does not show the stale consultation date', async ({ page }) => {
  await page.goto('/expocit/sources');

  await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();
  await expect(page.getByText(/Consulta: 8 de marzo de 2026/i)).toHaveCount(0);
});

for (const locale of locales) {
  test(`navigation and page titles agree in ${locale}`, async ({ page }) => {
    await setLocale(page, locale);
    await stubSupabaseSession(page);
    await page.addInitScript(() => {
      window.localStorage.setItem('debate-trainer-onboarding', JSON.stringify({
        state: { hasCompletedOnboarding: true, isTourRunning: false },
        version: 0,
      }));
    });
    await seedCurrentDebate(page, 'This House would make public transport free.');

    // The Current Debate dashboard lists every tool under its navigation label.
    for (const route of titledRoutes) {
      await page.goto('/app/debate');
      const toolLink = page.getByRole('region', { name: toolsHeadings[locale] }).locator(`a[href="/app/${route}"]`);
      const label = (await toolLink.innerText()).trim();
      expect(label).toBeTruthy();
      await toolLink.click();
      await expect(page).toHaveURL(new RegExp(`/app/${route}$`));
      await expect(page.getByRole('heading', { level: 1, name: label, exact: true }).last()).toBeVisible();
    }
  });
}

test('Factoids names the save action with its claim', async ({ page }) => {
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
              url: 'https://energy.gov/reports/solar-costs-2024',
              verified: 'verified',
            },
            howToUse: 'Use this as a bounded cost trend.',
            relevanceScore: 92,
          }],
          searchSuggestions: [],
          warnings: [],
          verificationStatus: 'complete',
        },
      }),
    });
  });

  await page.goto('/app/factoids');
  await page.getByRole('textbox', { name: /statement/i }).fill('Solar energy costs are falling');
  await page.getByRole('button', { name: /find factoids/i }).click();

  await expect(page.getByRole('button', {
    name: 'Save Solar costs fell by 42 percent to library',
  })).toBeVisible();
});

test('Flowchart deletes a selected node at once and Undo puts it back', async ({ page }, testInfo) => {
  await setLocale(page, 'en');
  await stubSupabaseSession(page);
  await page.goto('/app/flowchart');

  await page.getByText('Argument 1', { exact: true }).click();
  const remove = page.getByRole('button', { name: 'Delete' }).last();
  if (testInfo.project.name === 'mobile-chromium') {
    const box = await remove.boundingBox();
    expect(box).not.toBeNull();
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
  } else {
    await remove.click();
  }

  // No confirmation: the node goes, and the toast offers Undo.
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByText('Argument 1', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Argument 1', { exact: true })).toHaveCount(1);
});
