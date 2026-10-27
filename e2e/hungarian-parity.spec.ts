import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { seedCurrentDebate, setLocale, stubSupabaseSession } from './helpers/auth';

const site = JSON.parse(readFileSync('src/config/site.json', 'utf8')) as { product: string };

function collectRuntimeErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = message.text();
    if (text.includes('Failed to load resource')) return;
    if (text.includes('favicon')) return;
    if (text.includes('net::ERR_')) return;
    if (/^Failed to fetch(:|$)/.test(text)) return;
    if (text.includes('Auth] hydrate')) return;
    if (/^Warning:/.test(text)) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

async function expectHungarianDocument(page: Page) {
  await expect(page.locator('html')).toHaveAttribute('lang', 'hu');
}

test.describe('Hungarian parity', () => {
  test.beforeEach(async ({ page }) => {
    await setLocale(page, 'hu');
  });

  test('keeps public routes and landing navigation in Hungarian', async ({ page }) => {
    const errors = collectRuntimeErrors(page);
    await page.goto('/', { waitUntil: 'domcontentloaded' });

    await expectHungarianDocument(page);
    await expect(page.getByRole('heading', { level: 1, name: `${site.product}: MI-alapú vitafelkészítés és gyakorlás` })).toBeVisible();
    await expect(page.getByText(/^Attól függ, mire van szükséged\. 2026\. október állapot szerint/)).toBeAttached();
    if ((page.viewportSize()?.width ?? 0) < 768) {
      await expect(page.getByRole('button', { name: 'Menü megnyitása' })).toBeVisible();
    } else {
      const navigation = page.getByRole('navigation', { name: 'Fő navigáció' });
      await expect(navigation.getByRole('link', { name: 'Funkciók' })).toBeVisible();
      await expect(navigation.getByRole('link', { name: 'Árak' })).toBeVisible();
    }

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectHungarianDocument(page);

    for (const [path, heading] of [
      ['/login', 'Bejelentkezés a DebateOwl-ba'],
      ['/terms', 'Felhasználási feltételek'],
      ['/privacy', 'Adatvédelmi irányelvek'],
      ['/expocit/sources', 'Források'],
    ] as const) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expectHungarianDocument(page);
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('renders Hungarian workspace navigation, route titles, and onboarding', async ({ page }) => {
    const errors = collectRuntimeErrors(page);
    await stubSupabaseSession(page);
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('debate-trainer-onboarding', JSON.stringify({
          state: { hasCompletedOnboarding: false, isTourRunning: false },
          version: 0,
        }));
      } catch {
        // Ignore transient opaque documents during browser navigation.
      }
    });
    await page.goto('/app', { waitUntil: 'domcontentloaded' });

    await expectHungarianDocument(page);
    await expect(page.getByRole('heading', { name: 'Felkészülés' })).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.react-joyride__tooltip')).toContainText('Üdvözlünk a DebateOwl-ban!', { timeout: 15_000 });
    await expect(page.locator('[data-test-id="button-primary"]')).toContainText('Következő');
    await expect(page.locator('[data-test-id="button-skip"]')).toContainText('Túra kihagyása');
    await page.locator('[data-test-id="button-skip"]').click();

    for (const [route, heading] of [
      ['generate', 'Generálás'],
      ['attack', 'Támadás'],
      ['brainstorm', 'Ötletelés'],
      ['factoids', 'Tények'],
      ['ask', 'Kérdezés'],
    ] as const) {
      // Tools open from the Tools page; the header keeps only Tools, Current debate, Library and History.
      // Navigate in-app: a reload would rerun the init script and restart the tour.
      await page.locator('header a[href="/app"]').first().click();
      await page.locator(`main [data-tour="mode-${route}"]`).click();
      await expect(page).toHaveURL(new RegExp(`/app/${route}$`));
      await expect(page.getByRole('heading', { name: heading, exact: true }).last()).toBeVisible();
    }

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expectHungarianDocument(page);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('localizes saved chats, library controls, timer, and close labels', async ({ page }, testInfo) => {
    const errors = collectRuntimeErrors(page);
    await stubSupabaseSession(page);
    // Library needs a Current Debate before sources can be added.
    await seedCurrentDebate(page, 'Ez a Ház eltörölné a házi feladatot.');
    await page.addInitScript(() => {
      try {
        window.localStorage.setItem('debate-trainer-onboarding', JSON.stringify({
          state: { hasCompletedOnboarding: true, isTourRunning: false },
          version: 0,
        }));
      } catch {
        // Ignore transient opaque documents during browser navigation.
      }
    });

    await page.goto('/app/ask', { waitUntil: 'domcontentloaded' });
    if (testInfo.project.name === 'mobile-chromium') {
      await page.getByRole('button', { name: 'Mentett beszélgetések' }).click();
      const sheet = page.getByRole('dialog', { name: 'Mentett beszélgetések' });
      await expect(sheet.getByText('Még nincsenek mentett beszélgetések')).toBeVisible();
      await expect(sheet.getByRole('button', { name: 'Bezárás' })).toBeVisible();
      await sheet.getByRole('button', { name: 'Bezárás' }).click();
    } else {
      await page.getByRole('button', { name: 'Mentett beszélgetések megnyitása' }).click();
      await expect(page.getByText('Még nincsenek mentett beszélgetések')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Bezárás' })).toBeVisible();
    }

    await page.goto('/app/library', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('textbox', { name: 'Források keresése' })).toBeVisible();
    await page.getByRole('button', { name: 'Forrás hozzáadása' }).click();
    await expect(page.getByText('Importálás URL-ből')).toBeVisible();
    await page.getByRole('button', { name: 'Mentés a könyvtárba' }).click();
    // Required fields are checked inline, in Hungarian.
    await expect(page.getByRole('alert').filter({ hasText: 'Adj meg egy címet.' })).toBeVisible();

    await page.goto('/app/flowchart', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Megnyitás', exact: true }).click();
    await expect(page.getByRole('dialog', { name: 'Mentett folyamatábrák' }).getByRole('button', { name: 'Bezárás' })).toBeVisible();
    await page.keyboard.press('Escape');
    // Deleting a node raises a toast, whose close button is localized too.
    await page.getByText('1. érv', { exact: true }).click();
    await page.getByRole('button', { name: 'Törlés' }).last().click();
    const confirmNodeDelete = page.getByRole('button', { name: 'Csomópont törlése' });
    if (await confirmNodeDelete.isVisible().catch(() => false)) await confirmNodeDelete.click();
    await expect(page.locator('[data-sonner-toast] [data-close-button]')).toHaveAttribute('aria-label', 'Bezárás');

    await page.goto('/app/timer', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('timer', { name: 'Időmérő-kijelző' })).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
