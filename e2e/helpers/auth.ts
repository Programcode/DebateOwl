import type { Page } from '@playwright/test';

const HOUR_SECONDS = 60 * 60;

export interface StubAuthOptions {
  env?: 'production' | 'staging';
  userId?: string;
  email?: string;
}

/**
 * Inject a stub Supabase session into localStorage so RequireAuth lets the
 * test through. The JWT is bogus, so any API call from the page will fail —
 * use this only for render smoke checks, not data-fetching assertions.
 */
export async function stubSupabaseSession(page: Page, opts: StubAuthOptions = {}) {
  const env = opts.env ?? 'production';
  const userId = opts.userId ?? '00000000-0000-0000-0000-000000000001';
  const email = opts.email ?? 'e2e@example.com';
  const expiresAt = Math.floor(Date.now() / 1000) + HOUR_SECONDS;
  const session = {
    access_token: 'stub-access',
    refresh_token: 'stub-refresh',
    expires_in: HOUR_SECONDS,
    expires_at: expiresAt,
    token_type: 'bearer',
    user: {
      id: userId,
      aud: 'authenticated',
      role: 'authenticated',
      email,
      app_metadata: { provider: 'google' },
      user_metadata: { full_name: 'E2E Tester' },
      created_at: new Date().toISOString(),
    },
  };

  await page.addInitScript(({ key, value }) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, { key: `debate-auth-${env}`, value: session });
}

/**
 * Set the persisted language so a page loads in a specific locale on first
 * paint, without depending on the language toggle UI.
 */
export async function setLocale(page: Page, locale: 'en' | 'es' | 'hu') {
  await page.addInitScript((lang) => {
    const stored = {
      state: { language: lang, outputLanguage: lang, theme: 'system' },
      version: 0,
    };
    try {
      window.localStorage.setItem('debate-trainer-settings', JSON.stringify(stored));
    } catch {
      /* ignore */
    }
  }, locale);
}
