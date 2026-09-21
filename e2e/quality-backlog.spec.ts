import { expect, test } from '@playwright/test';
import { setLocale, stubSupabaseSession } from './helpers/auth';

const locales = ['en', 'es', 'hu'] as const;
const titledRoutes = ['generate', 'attack', 'brainstorm', 'factoids', 'ask'] as const;
const mobileNavigationNames = {
  en: 'Mobile navigation',
  es: 'Navegación móvil',
  hu: 'Mobil navigáció',
} as const;

test('Sources does not show the stale consultation date', async ({ page }) => {
  await page.goto('/expocit/sources');

  await expect(page.getByRole('heading', { name: 'Sources' })).toBeVisible();
  await expect(page.getByText(/Consulta: 8 de marzo de 2026/i)).toHaveCount(0);
});

for (const locale of locales) {
  test(`navigation and page titles agree in ${locale}`, async ({ page }, testInfo) => {
    await setLocale(page, locale);
    await stubSupabaseSession(page);
    await page.addInitScript(() => {
      window.localStorage.setItem('debate-trainer-onboarding', JSON.stringify({
        state: { hasCompletedOnboarding: true, isTourRunning: false },
        version: 0,
      }));
    });
    await page.goto('/app');

    for (const route of titledRoutes) {
      const desktopLink = page.locator(`[data-tour="nav-${route}"]`).first();
      const label = await desktopLink.getAttribute('aria-label');
      expect(label).toBeTruthy();
      if (testInfo.project.name === 'mobile-chromium') {
        await page.locator('header button.lg\\:hidden[aria-expanded]').click();
        await page.getByRole('navigation', { name: mobileNavigationNames[locale] })
          .getByRole('link')
          .filter({ hasText: label! })
          .first()
          .click();
      } else {
        if (!await desktopLink.isVisible()) {
          await page.locator('summary[data-tour="nav-more"]').click();
        }
        await desktopLink.click();
      }
      await expect(page).toHaveURL(new RegExp(`/app/${route}$`));
      await expect(page.getByRole('heading', { level: 1, name: label!, exact: true }).last()).toBeVisible();
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

test('Flowchart confirms selected-node deletion and reports success', async ({ page }, testInfo) => {
  await setLocale(page, 'en');
  await stubSupabaseSession(page);
  await page.goto('/app/flowchart');

  await page.getByText('Argument 1', { exact: true }).click();
  await page.getByRole('button', { name: 'Delete' }).last().click();
  await expect(page.getByRole('alertdialog', { name: 'Delete node?' })).toBeVisible();
  const confirm = page.getByRole('button', { name: 'Delete node' });
  if (testInfo.project.name === 'mobile-chromium') {
    const box = await confirm.boundingBox();
    expect(box).not.toBeNull();
    await page.touchscreen.tap(box!.x + box!.width / 2, box!.y + box!.height / 2);
  } else {
    await confirm.click();
  }

  await expect(page.getByText('Node deleted', { exact: true })).toBeVisible();
  await expect(page.getByText('Argument 1', { exact: true })).toHaveCount(0);
});
