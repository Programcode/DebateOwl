import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:18081";
const hostResolverRules = process.env.PLAYWRIGHT_HOST_RESOLVER_RULES;

export default defineConfig({
  testDir: "./e2e",
  testMatch: /workspace-collaboration\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    actionTimeout: 10_000,
    baseURL,
    launchOptions: hostResolverRules ? { args: [`--host-resolver-rules=${hostResolverRules}`] } : undefined,
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
