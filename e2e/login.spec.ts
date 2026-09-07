import { expect, test } from '@playwright/test';
import { setLocale } from './helpers/auth';

test.describe('login passwordless flows', () => {
  test.beforeEach(async ({ page }) => {
    await setLocale(page, 'en');
  });

  test('keeps Google primary and exposes email and demo-code tabs', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Demo code' })).toBeVisible();
  });

  test('sends an email code and focuses the verification field', async ({ page }) => {
    let requestEmail: string | undefined;
    await page.route('**/auth/v1/otp', async (route) => {
      const body = route.request().postDataJSON() as { email?: unknown };
      requestEmail = typeof body.email === 'string' ? body.email : undefined;
      await new Promise((resolve) => setTimeout(resolve, 250));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({}),
      });
    });

    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Email' }).click();
    await page.getByLabel('Email address').fill(' student@example.com ');
    await page.getByRole('button', { name: 'Send code' }).click();

    await expect(page.getByRole('button', { name: 'Sending code...' })).toBeVisible();
    await expect(page.getByText('Code sent', { exact: true })).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Verification code' })).toBeFocused();
    expect(requestEmail).toBe('student@example.com');
  });

  test('shows a demo-code backend error while keeping the form editable', async ({ page }) => {
    await page.route('**/functions/v1/demo-code-login', (route) => route.fulfill({
      status: 403,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'This demo code has expired.' }),
    }));

    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Demo code' }).click();
    await page.getByRole('textbox', { name: 'Demo code' }).fill('DEMO-AB12-CD34');
    await page.getByRole('button', { name: 'Sign in with demo code' }).click();

    await expect(page.getByRole('alert')).toHaveText('Edge Function returned a non-2xx status code');
    await expect(page.getByRole('textbox', { name: 'Demo code' })).toBeEnabled();
  });
});
