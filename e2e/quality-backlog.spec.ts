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
    // Locator taps scroll into view and wait for layout stability, just like
    // clicks. Raw viewport coordinates can hit the canvas after selection reflows.
    await remove.tap();
  } else {
    await remove.click();
  }

  // No confirmation: the node goes, and the toast offers Undo.
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(page.getByText('Argument 1', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText('Argument 1', { exact: true })).toHaveCount(1);
});

// VS-05: a long motion and long item titles once widened the dashboard past a phone screen.
for (const locale of locales) {
  test(`Current Debate fits a 360px phone with sources attached in ${locale}`, async ({ page }) => {
    const motion = 'This House believes that national governments should nationalise all critical digital infrastructure including undersea cables';
    await page.setViewportSize({ width: 360, height: 780 });
    await setLocale(page, locale);
    await stubSupabaseSession(page);
    await seedCurrentDebate(page, motion);
    await page.addInitScript(({ motion }) => {
      const debateId = '00000000-0000-4000-8000-00000000d001';
      const now = Date.now();
      const sources = [0, 1, 2].map((index) => ({
        id: `source-${index}`, title: `${motion} source ${index}`, content: 'Evidence', type: 'text',
        debateId, createdAt: now - index, isActive: true, folder: 'General',
      }));
      const savedCases = [0, 1].map((index) => ({
        id: `case-${index}`, title: `${motion} case ${index}`, data: { motion }, createdAt: now - index,
        debateId, side: index ? 'con' : 'pro',
      }));
      window.localStorage.setItem('debate-trainer-storage', JSON.stringify({
        state: { ownerUserId: '00000000-0000-0000-0000-000000000001', sourceLibrary: sources, savedCases, sourceFolders: ['General'] },
        version: 1,
      }));
    }, { motion });

    await page.goto('/app/debate');
    await expect(page.getByTestId('debate-sources').getByText(`${motion} source 0`)).toBeVisible();
    // The Load button stays on screen beside its truncated title.
    const load = await page.getByTestId('debate-side-pro').getByRole('button', { name: `${motion} case 0` }).boundingBox();
    expect(load).not.toBeNull();
    expect(load!.x + load!.width).toBeLessThanOrEqual(360);

    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  });
}

// VS-09: picking a language closes the menu; the choice already persists.
test('language menu closes once a language is chosen', async ({ page }) => {
  await setLocale(page, 'en');
  await page.goto('/');
  // Below lg the section links and the language control sit in the menu.
  const language = page.getByRole('button', { name: 'Language' });
  const openMenu = page.getByRole('button', { name: 'Open menu' });
  await expect(language.or(openMenu).first()).toBeVisible();
  if (await openMenu.isVisible()) await openMenu.click();
  await language.click();
  const menu = page.getByRole('radiogroup', { name: 'Interface language' });
  await expect(menu).toBeVisible();

  await menu.getByRole('radio', { name: 'Magyar' }).click();

  await expect(page.getByRole('radiogroup')).toHaveCount(0);
  await expect(page.locator('html')).toHaveAttribute('lang', 'hu');
});

// Bug bash 2026-11-01: a motion or argument of only spaces passed validation and spent an AI request.
test('a motion or argument of only spaces counts as blank', async ({ page }) => {
  await stubSupabaseSession(page);
  const aiCalls: string[] = [];
  page.on('request', (request) => { if (request.url().includes('/functions/v1/ai')) aiCalls.push(request.url()); });

  await page.goto('/app/generate');
  await page.getByLabel('Motion / topic *').fill('     ');
  await page.getByRole('button', { name: 'Generate debate case' }).click();
  await expect(page.getByText('Motion is required')).toBeVisible();

  await page.goto('/app/attack');
  await page.getByRole('textbox', { name: /argument/i }).first().fill('   ');
  await page.getByRole('button', { name: 'Find weaknesses' }).click();
  await expect(page.getByText('Case text is required')).toBeVisible();

  expect(aiCalls).toEqual([]);
});
