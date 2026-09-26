import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Driven by `bin/verify.sh drive`, which starts nothing: the stack from
// `verify.sh up` must already be running. Playwright empties outputDir at the
// start of every run, so each drive gets its own directory under .verify/artifacts.
const artifactDir = process.env.VERIFY_ARTIFACT_DIR;
if (!artifactDir) throw new Error("Run recipes through `verify.sh drive`, not npx playwright directly");

export default defineConfig({
  testDir: fileURLToPath(new URL("recipes", import.meta.url)),
  outputDir: join(artifactDir, "playwright"),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: join(artifactDir, "report.json") }]],
  use: {
    baseURL: "http://127.0.0.1:18081",
    locale: "en-US",
    actionTimeout: 10_000,
    // Proof runs keep everything, not only failures.
    trace: "on",
    screenshot: "on",
  },
  expect: { timeout: 10_000 },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "mobile-chromium", use: { ...devices["Pixel 5"] } },
  ],
});
