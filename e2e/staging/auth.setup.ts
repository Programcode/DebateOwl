import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { test as setup, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

const authFile = 'test-results/.auth/staging.json';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for the stateful staging E2E suite. This suite must not run in ordinary pull-request CI.`);
  }
  return value;
}

setup('authenticate against the pre-provisioned staging demo account', async ({ page, request, baseURL }) => {
  const supabaseUrl = requireEnv('E2E_STAGING_SUPABASE_URL').replace(/\/$/, '');
  const anonKey = requireEnv('E2E_STAGING_ANON_KEY');
  const demoCode = requireEnv('E2E_STAGING_DEMO_CODE');
  const appBaseUrl = baseURL || 'http://localhost:8080';

  // This endpoint is intentionally stateful: it consumes a demo-code use and
  // may provision/update the corresponding demo account. Never call this setup
  // merely to verify an untrusted pull request.
  const login = await request.post(`${supabaseUrl}/functions/v1/demo-code-login`, {
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      origin: appBaseUrl,
      'content-type': 'application/json',
    },
    data: {
      code: demoCode,
      browserFingerprint: `debatelab-playwright-${Date.now()}`,
      redirectTo: `${appBaseUrl}/app`,
    },
  });

  expect(login.ok(), `demo-code-login failed with HTTP ${login.status()}`).toBeTruthy();
  const handoff = await login.json() as { tokenHash?: string; type?: string; error?: string };
  expect(handoff.tokenHash, handoff.error || 'demo-code-login did not return a token hash').toBeTruthy();

  const client = createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await client.auth.verifyOtp({
    token_hash: handoff.tokenHash!,
    type: 'magiclink',
  });
  if (error || !data.session) {
    throw new Error(`Staging OTP verification failed: ${error?.message || 'no session returned'}`);
  }

  await page.goto('/');
  await page.evaluate((session) => {
    window.localStorage.setItem('debate-supabase-env', 'staging');
    window.localStorage.setItem('debate-auth-staging', JSON.stringify(session));
  }, data.session);

  await mkdir(dirname(authFile), { recursive: true });
  await page.context().storageState({ path: authFile });
});
