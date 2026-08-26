import { test, expect } from '@playwright/test';

test('real staging session survives reload and stays inside the protected app', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('body')).toBeVisible();
  expect(page.url()).not.toContain('/login');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toBeVisible();
  expect(page.url()).not.toContain('/login');
});

test('real staging auth can complete one Sparring opponent turn', async ({ page }) => {
  test.setTimeout(180_000);

  await page.goto('/app/sparring');
  await page.getByLabel('Motion').fill('This House would require social media platforms to offer a chronological feed by default.');
  await page.getByRole('button', { name: 'Start sparring' }).click();

  await page.locator('textarea').first().fill(
    'A chronological default reduces platform incentives to maximize engagement through opaque ranking, while still letting users opt into recommendations if they want them.',
  );
  await page.getByRole('button', { name: 'Send opening' }).click();

  // The text is rendered only after the authenticated AI request completes.
  await expect(page.getByText('AI opponent')).toBeVisible({ timeout: 150_000 });
  await expect(page.getByRole('button', { name: 'Send rebuttal' })).toBeVisible();
});
