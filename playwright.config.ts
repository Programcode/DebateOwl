import { defineConfig, devices } from '@playwright/test';
import { assertE2eSupabaseTarget } from './src/lib/supabase/e2e-guard';

assertE2eSupabaseTarget();

const PORT = Number(process.env.PORT || 18080);
const baseURL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;
const stagingStorageState = 'test-results/.auth/staging.json';
const stagingValues = [
  process.env.STAGING_SUPABASE_URL,
  process.env.STAGING_SUPABASE_ANON_KEY,
  process.env.STAGING_DEMO_CODE,
];
const stagingEnabled = stagingValues.every((value) => Boolean(value?.trim()));
const stagingPartiallyConfigured = stagingValues.some((value) => Boolean(value?.trim())) && !stagingEnabled;

export const STAGING_CAPTURE_POLICY = {
  trace: 'off',
  screenshot: 'off',
  video: 'off',
} as const;

if (stagingPartiallyConfigured) {
  throw new Error('Protected staging E2E requires STAGING_SUPABASE_URL, STAGING_SUPABASE_ANON_KEY, and STAGING_DEMO_CODE together.');
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // The dev server transforms lazily-imported route modules on demand, so the
  // first assertion after navigating to a lazy route races that waterfall. On a
  // shared CI runner it has measured over 3.5s from document to the component
  // that owns the heading, which overruns the 5s default.
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'en-US',
  },
  projects: [
    {
      name: 'desktop-chromium',
      testIgnore: /(staging|full-stack|live|model-matrix|production)\//,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile-chromium',
      testIgnore: /(staging|full-stack|live|model-matrix|production)\//,
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'webkit',
      testIgnore: /(staging|full-stack|live|model-matrix|production)\//,
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } },
    },
    ...(stagingEnabled ? [{
      name: 'staging-setup',
      testMatch: /staging\/auth\.setup\.ts/,
      use: STAGING_CAPTURE_POLICY,
    },
    {
      name: 'staging',
      testMatch: /staging\/authed-flows\.spec\.ts/,
      dependencies: ['staging-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: stagingStorageState,
        // Browser captures can archive authenticated staging data.
        ...STAGING_CAPTURE_POLICY,
      },
    }] : []),
  ],
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      VITE_E2E: '1',
      ...(process.env.E2E_ALLOW_PROD === '1' ? { VITE_E2E_ALLOW_PROD: '1' } : {}),
    },
  },
});
