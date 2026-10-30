import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Driven by `bin/verify.sh drive`, which starts nothing: the stack from
// `verify.sh up` must already be running. Playwright empties outputDir at the
// start of every run, so each drive gets its own directory under .verify/artifacts.
const artifactDir = process.env.VERIFY_ARTIFACT_DIR;
if (!artifactDir) throw new Error("Run recipes through `verify.sh drive`, not npx playwright directly");
const live = process.env.VERIFY_MODE === "live";

export default defineConfig({
  // The repository root, so the maintained e2e suites can run against this stack too.
  testDir: fileURLToPath(new URL("../../..", import.meta.url)),
  // Recipes run in both modes. e2e/full-stack asserts fake-provider text, so
  // live mode keeps only its provider-free files; e2e/live asserts live
  // structure (live mode only); the workspace journey starts its own
  // collaboration process and runs in either mode.
  testMatch: live
    ? /(\.claude\/skills\/verify-debatelab\/recipes\/.+|e2e\/live\/.+|e2e\/full-stack\/(admin|public|auth|billing|account-data)|e2e\/workspace-collaboration)\.spec\.ts$/
    : /(\.claude\/skills\/verify-debatelab\/recipes\/.+|e2e\/full-stack\/.+|e2e\/workspace-collaboration)\.spec\.ts$/,
  // In live mode the full-stack tests that assert fake-provider text are
  // skipped; the recipes cover the same journeys with structural assertions.
  grepInvert: live
    ? /a promo code redeemed in Settings restores AI access|an expired access token refreshes before an AI request|only active Library sources ground AI requests|the output language setting follows the account/
    : undefined,
  outputDir: join(artifactDir, "playwright"),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // Live model calls with mandatory reasoning take far longer than the fake.
  timeout: live ? 600_000 : 120_000,
  reporter: [["list"], ["json", { outputFile: join(artifactDir, "report.json") }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:18081",
    locale: "en-US",
    actionTimeout: 15_000,
    // Proof runs keep everything, not only failures.
    trace: "on",
    screenshot: "on",
  },
  expect: { timeout: 15_000 },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile-chromium", use: { ...devices["Pixel 5"] } },
  ],
});
