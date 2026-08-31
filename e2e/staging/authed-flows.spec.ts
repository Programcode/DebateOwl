import { expect, test } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

test('real staging session persists, writes and removes a source, and completes one AI request', async ({ page }) => {
  test.setTimeout(180_000);
  const consoleErrors: string[] = [];
  const sourceTitle = `E2E staging source ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sourceContent = 'A dedicated Playwright staging record used to verify authenticated persistence.';
  let sourceCreated = false;

  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`console: ${message.text()}`);
  });

  try {
    await page.goto('/app/settings');
    const testEmail = await page.evaluate(() => localStorage.getItem('debate-staging-e2e-email'));
    expect(testEmail).toBeTruthy();
    await expect(page.getByText(testEmail!, { exact: true })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/app\/settings$/);
    await expect(page.getByText(testEmail!, { exact: true })).toBeVisible();

    await page.goto('/app/library');
    await page.getByRole('button', { name: 'Add Source' }).click();
    await page.getByPlaceholder('Source title...').fill(sourceTitle);
    await page.getByPlaceholder('Paste source content...').fill(sourceContent);
    const sourceInsert = page.waitForResponse((response) =>
      response.request().method() === 'POST' && response.url().includes('/rest/v1/sources')
    );
    await page.getByRole('button', { name: 'Save to Library' }).click();
    expect((await sourceInsert).ok()).toBe(true);
    sourceCreated = true;
    await expect(page.getByText(sourceTitle, { exact: true })).toBeVisible();

    await page.evaluate(() => localStorage.removeItem('debate-trainer-storage'));
    const sourceHydration = page.waitForResponse((response) =>
      response.request().method() === 'GET' && response.url().includes('/rest/v1/sources?')
    );
    await page.reload();
    expect((await sourceHydration).ok()).toBe(true);
    await expect(page.getByText(sourceTitle, { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.getByText(sourceTitle, { exact: true }).click();
    await expect(page.locator('#source-detail-content')).toHaveValue(sourceContent);
    await page.getByRole('button', { name: 'Close' }).click();

    await page.goto('/app/ask');
    await page.getByLabel('Pros/Cons').click();
    await page.getByPlaceholder('Ask your debate coach...').fill('Reply with one short sentence confirming this staging request.');
    const aiResponse = page.waitForResponse((response) =>
      response.request().method() === 'POST' && response.url().includes('/functions/v1/ai')
    );
    await page.getByRole('button', { name: 'Send message' }).click();
    expect((await aiResponse).ok()).toBe(true);
    const saveResponseButton = page.getByRole('button', { name: 'Save message' }).last();
    await expect(saveResponseButton).toBeAttached({ timeout: 90_000 });
    const assistantBubble = saveResponseButton.locator('..');
    await expect(assistantBubble.locator(':scope > .text-sm')).toHaveText(/\S/, { timeout: 90_000 });
  } finally {
    if (sourceCreated) {
      await page.goto('/app/library');
      await expect(page.getByText(sourceTitle, { exact: true })).toBeVisible({ timeout: 15_000 });
      const sourceDelete = page.waitForResponse((response) =>
        response.request().method() === 'DELETE' && response.url().includes('/rest/v1/sources?')
      );
      await page.getByRole('button', { name: `Delete ${sourceTitle}` }).click();
      expect((await sourceDelete).ok()).toBe(true);
      await page.evaluate(() => localStorage.removeItem('debate-trainer-storage'));
      await page.reload();
      await expect(page.getByText(sourceTitle, { exact: true })).toHaveCount(0, { timeout: 15_000 });
    }
  }

  expect(consoleErrors, consoleErrors.join('\n')).toEqual([]);
});
