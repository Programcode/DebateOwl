import { defineConfig, devices } from "@playwright/test";

// Canary against the live production site. No web server, no captures:
// traces and screenshots could retain the canary account's session.
export default defineConfig({
  testDir: "./e2e/production",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  expect: { timeout: 20_000 },
  use: {
    baseURL: process.env.PROD_URL ?? "https://debate.pi-stack.org",
    locale: "en-US",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  projects: [{ name: "production-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } }],
});
