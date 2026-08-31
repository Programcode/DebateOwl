import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createClient, type Session } from '@supabase/supabase-js';
import { expect, test as setup } from '@playwright/test';

const AUTH_STATE_PATH = 'test-results/.auth/staging.json';
const EXPECTED_STAGING_PROJECT_REF = 'brifeyypjauyusmkptkx';
const PRODUCTION_PROJECT_REF = 'uziwdtkzofptihahfooo';

type StagingConfig = {
  supabaseUrl: string;
  anonKey: string;
  demoCode: string;
  baseUrl: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the protected staging suite`);
  return value;
}

function readAnonKeyProjectRef(anonKey: string): string {
  const parts = anonKey.split('.');
  if (parts.length !== 3) throw new Error('STAGING_SUPABASE_ANON_KEY is not a JWT');

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    throw new Error('STAGING_SUPABASE_ANON_KEY has an invalid JWT payload');
  }

  if (!isRecord(payload) || payload.role !== 'anon' || typeof payload.ref !== 'string') {
    throw new Error('STAGING_SUPABASE_ANON_KEY must be an anon key with a project ref');
  }
  return payload.ref;
}

function loadStagingConfig(): StagingConfig {
  const supabaseUrl = requireEnv('STAGING_SUPABASE_URL');
  const anonKey = requireEnv('STAGING_SUPABASE_ANON_KEY');
  const demoCode = requireEnv('STAGING_DEMO_CODE');
  const baseUrl = requireEnv('PLAYWRIGHT_BASE_URL');

  const parsedSupabaseUrl = new URL(supabaseUrl);
  const projectRef = parsedSupabaseUrl.hostname.split('.')[0];
  if (parsedSupabaseUrl.protocol !== 'https:' || !parsedSupabaseUrl.hostname.endsWith('.supabase.co')) {
    throw new Error('STAGING_SUPABASE_URL must be an HTTPS Supabase project URL');
  }
  if (projectRef === PRODUCTION_PROJECT_REF) {
    throw new Error('Refusing to run the staging suite against the production project');
  }
  if (projectRef !== EXPECTED_STAGING_PROJECT_REF) {
    throw new Error('STAGING_SUPABASE_URL does not identify DebateLab staging');
  }
  if (readAnonKeyProjectRef(anonKey) !== projectRef) {
    throw new Error('The staging anon key does not belong to STAGING_SUPABASE_URL');
  }
  if (!/^DEMO-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(demoCode)) {
    throw new Error('STAGING_DEMO_CODE has an invalid format');
  }

  const parsedBaseUrl = new URL(baseUrl);
  const isLoopback = parsedBaseUrl.hostname === '127.0.0.1' || parsedBaseUrl.hostname === 'localhost';
  if (parsedBaseUrl.protocol !== 'http:' || !isLoopback) {
    throw new Error('PLAYWRIGHT_BASE_URL must use an HTTP loopback address');
  }

  return { supabaseUrl, anonKey, demoCode, baseUrl };
}

function parseLoginResponse(value: unknown): { email: string; tokenHash: string } {
  if (!isRecord(value) || typeof value.email !== 'string' || typeof value.tokenHash !== 'string') {
    throw new Error('demo-code-login returned an invalid handoff payload');
  }
  return { email: value.email, tokenHash: value.tokenHash };
}

async function installSession(page: import('@playwright/test').Page, session: Session, email: string) {
  await page.addInitScript(({ authSession, testEmail }) => {
    localStorage.setItem('debate-supabase-env', 'staging');
    localStorage.setItem('debate-auth-staging', JSON.stringify(authSession));
    localStorage.setItem('debate-staging-e2e-email', testEmail);
    localStorage.setItem('debate-trainer-settings', JSON.stringify({
      state: { language: 'en', outputLanguage: 'en', theme: 'system' },
      version: 0,
    }));
  }, { authSession: session, testEmail: email });
}

setup('authenticate with the protected staging demo code', async ({ page }) => {
  const config = loadStagingConfig();
  const response = await fetch(`${config.supabaseUrl}/functions/v1/demo-code-login`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      'Content-Type': 'application/json',
      Origin: config.baseUrl,
    },
    body: JSON.stringify({
      code: config.demoCode,
      browserFingerprint: `playwright-staging-${Date.now()}`,
      redirectTo: `${config.baseUrl}/app`,
    }),
  });
  if (!response.ok) {
    throw new Error(`demo-code-login failed with HTTP ${response.status}`);
  }

  const handoff = parseLoginResponse(await response.json());
  const supabase = createClient(config.supabaseUrl, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase.auth.verifyOtp({
    email: handoff.email,
    token_hash: handoff.tokenHash,
    type: 'magiclink',
  });
  if (error || !data.session) {
    throw new Error(`Staging OTP verification failed: ${error?.message ?? 'no session returned'}`);
  }

  await installSession(page, data.session, handoff.email);
  await page.goto('/app/settings');
  await expect(page).toHaveURL(/\/app\/settings$/);
  await expect(page.getByText(handoff.email, { exact: true })).toBeVisible();

  await mkdir(dirname(AUTH_STATE_PATH), { recursive: true });
  await page.context().storageState({ path: AUTH_STATE_PATH });
});
