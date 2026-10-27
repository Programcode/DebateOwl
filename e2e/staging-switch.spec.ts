import { expect, test } from '@playwright/test';

// The strip is the way back from staging, so it must stay usable on every
// route, including the landing page with its fixed navigation bar.
for (const path of ['/', '/login']) {
  const landing = path === '/';
  test(`the staging strip returns to production from ${path}`, async ({ page }) => {
    // Never reach a real Supabase project from this test.
    await page.route('https://*.supabase.co/**', (route) => route.abort());
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('staging-switch-test-started')) {
        sessionStorage.setItem('staging-switch-test-started', '1');
        localStorage.setItem('debate-supabase-env', 'staging');
      }
    });
    await page.goto(path);
    // The landing navigation is fixed and slides in from above. Click only once
    // it has arrived, so the test sees what a person sees.
    if (landing) {
      const landingNav = page.locator('nav.fixed');
      await landingNav.waitFor();
      await expect.poll(() => landingNav.evaluate((nav) => getComputedStyle(nav).transform)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/);
    }

    const strip = page.getByRole('status').filter({ hasText: 'Staging backend' });
    await expect(strip).toBeVisible();
    if (landing) {
      // The fixed navigation must sit below the strip, not underneath it.
      const stripBox = await strip.boundingBox();
      const navBox = await page.locator('nav.fixed').boundingBox();
      expect(navBox!.y).toBeGreaterThanOrEqual(stripBox!.y + stripBox!.height - 1);
    }
    await strip.getByRole('button', { name: 'Switch to production' }).click({ timeout: 5_000 });

    await expect(strip).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('debate-supabase-env'))).toBeNull();
  });
}

test('switching in one tab reloads the other tabs onto the same project', async ({ context }) => {
  await context.route('https://*.supabase.co/**', (route) => route.abort());
  await context.addInitScript(() => {
    if (!sessionStorage.getItem('staging-switch-test-started')) {
      sessionStorage.setItem('staging-switch-test-started', '1');
      localStorage.setItem('debate-supabase-env', 'staging');
    }
  });
  const switching = await context.newPage();
  const other = await context.newPage();
  await switching.goto('/login');
  await other.goto('/login');
  const stripIn = (page: typeof other) => page.getByRole('status').filter({ hasText: 'Staging backend' });
  await expect(stripIn(other)).toBeVisible();

  await stripIn(switching).getByRole('button', { name: 'Switch to production' }).click();

  await expect(stripIn(switching)).toHaveCount(0);
  await expect(stripIn(other)).toHaveCount(0);
});
