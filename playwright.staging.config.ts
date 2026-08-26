import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.PORT || 8080);
const baseURL = process.env.STAGING_PLAYWRIGHT_BASE_URL || `http://localhost:${PORT}`;
const authFile = 'test-results/.auth/staging.json';

export default defineConfig({
  testDir: './e2e/staging',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report-staging', open: 'never' }]],
  outputDir: 'test-results-staging',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'en-US',
  },
  projects: [
    {
      name: 'staging-auth-setup',
      testMatch: /auth\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'staging-desktop-chromium',
      testIgnore: /auth\.setup\.ts/,
      dependencies: ['staging-auth-setup'],
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        storageState: authFile,
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      ...process.env,
      VITE_FORCE_SUPABASE_ENV: 'staging',
    },
  },
});
