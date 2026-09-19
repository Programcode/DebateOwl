import { expect, test } from '@playwright/test';
import { setLocale } from './helpers/auth';

test.describe('login passwordless flows', () => {
  test.beforeEach(async ({ page }) => {
    await setLocale(page, 'en');
  });

  test('keeps Google primary and exposes email and demo-code tabs', async ({ page }) => {
    await page.route('**/auth/v1/authorize**', (route) => route.fulfill({ status: 200, body: 'ok' }));
    await page.goto('/login', { waitUntil: 'domcontentloaded' });

    const googleButton = page.getByRole('button', { name: 'Continue with Google' });
    const expectedRedirect = `${new URL(page.url()).origin}/app`;
    await expect(googleButton).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Email' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Demo code' })).toBeVisible();

    const requestPromise = page.waitForRequest('**/auth/v1/authorize**');
    await googleButton.click();
    const requestUrl = new URL((await requestPromise).url());
    expect(requestUrl.searchParams.get('provider')).toBe('google');
    expect(requestUrl.searchParams.get('redirect_to')).toBe(expectedRedirect);
  });

  test('exchanges a demo-code magic-link hash for a Supabase session', async ({ page }) => {
    let verifyBody: Record<string, unknown> | undefined;
    await page.route('**/functions/v1/demo-code-login', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ email: 'demo@example.com', tokenHash: 'demo-token-hash', type: 'magiclink' }),
    }));
    await page.route('**/auth/v1/verify', async (route) => {
      verifyBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'stub-access',
          refresh_token: 'stub-refresh',
          expires_in: 3600,
          token_type: 'bearer',
          user: { id: '00000000-0000-4000-8000-000000000001', email: 'demo@example.com', app_metadata: {}, user_metadata: {} },
        }),
      });
    });

    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await page.getByRole('tab', { name: 'Demo code' }).click();
    await page.getByRole('textbox', { name: 'Demo code' }).fill('demo-ab12-cd34');
    await page.getByRole('button', { name: 'Sign in with demo code' }).click();

    await expect.poll(() => verifyBody).toMatchObject({ token_hash: 'demo-token-hash', type: 'magiclink' });
  });

  test('sends an email code and focuses the verification field', async ({ page }) => {
    let requestEmail: string | undefined;
    let releaseOtpResponse: (() => void) | undefined;
    const otpResponseReleased = new Promise<void>((resolve) => { releaseOtpResponse = resolve; });
    await page.route('**/auth/v1/otp', async (route) => {
      const body = route.request().postDataJSON() as { email?: unknown };
      requestEmail = typeof body.email === 'string' ? body.email : undefined;
      await otpResponseReleased;
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
    releaseOtpResponse?.();
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

    await expect(page.getByRole('alert')).toHaveText('This demo code has expired.');
    await expect(page.getByRole('textbox', { name: 'Demo code' })).toBeEnabled();
  });
});
