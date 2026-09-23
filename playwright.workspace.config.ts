import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:18081";

export default defineConfig({
  testDir: "./e2e",
  testMatch: /(workspace-collaboration|full-stack\/.+)\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    actionTimeout: 10_000,
    baseURL,
    locale: "en-US",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  expect: { timeout: 10_000 },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile-chromium", use: { ...devices["Pixel 5"] } },
  ],
});
