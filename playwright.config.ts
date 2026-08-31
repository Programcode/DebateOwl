import { defineConfig, devices } from '@playwright/test';

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
      testIgnore: /staging\//,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile-chromium',
      testIgnore: /staging\//,
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'webkit',
      testIgnore: /staging\//,
      use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } },
    },
    ...(stagingEnabled ? [{
      name: 'staging-setup',
      testMatch: /staging\/auth\.setup\.ts/,
      use: { trace: 'off' },
    },
    {
      name: 'staging',
      testMatch: /staging\/authed-flows\.spec\.ts/,
      dependencies: ['staging-setup'],
      use: {
        ...devices['Desktop Chrome'],
        storageState: stagingStorageState,
        // Traces contain request headers and localStorage. Do not retain a
        // staging trace because it would archive the real session token.
        trace: 'off',
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
  },
});
