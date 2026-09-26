import { mkdir, appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Locator } from "@playwright/test";
import { expect, stackReady, test as stackTest } from "../../../../e2e/full-stack/stack";

// Recipes reuse the full-stack gate's fixtures: a fresh demo-code user per test
// (deleted afterwards), `signedIn`, the fake provider, and the service-role
// `admin` client for reading rows. This file adds a production guard and an
// evidence writer.
export * from "../../../../e2e/full-stack/stack";

if (!stackReady) throw new Error("Stack environment missing; run recipes through `verify.sh drive`");

export type Evidence = {
  dir: string;
  /** Full-page screenshot, `<name>.png`. */
  shot(name: string): Promise<string>;
  /** ARIA snapshot of a region (default: whole page), `<name>.aria.yml`. */
  aria(name: string, locator?: Locator): Promise<string>;
  /** Any JSON value, such as provider calls or database rows, `<name>.json`. */
  json(name: string, value: unknown): Promise<string>;
  /** One line in `steps.log` describing the user action just taken. */
  step(line: string): Promise<void>;
};

export const test = stackTest.extend<{ evidence: Evidence }>({
  // Overriding `page` also covers `signedIn`, which navigates during setup.
  page: async ({ page }, provide) => {
    const remote: string[] = [];
    await page.context().route(/^https:\/\/[^/]+\.supabase\.co\//, (route) => {
      remote.push(route.request().url());
      return route.abort();
    });
    await provide(page);
    expect(remote, "requests to a remote Supabase project").toEqual([]);
  },
  evidence: async ({ page }, provide, testInfo) => {
    const slug = testInfo.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const dir = join(process.env.VERIFY_ARTIFACT_DIR!, testInfo.project.name, slug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "run.json"), JSON.stringify({
      test: testInfo.title,
      project: testInfo.project.name,
      commit: process.env.VERIFY_HEAD,
      baseURL: testInfo.project.use.baseURL,
      startedAt: new Date().toISOString(),
    }, null, 2));
    const file = (name: string) => join(dir, name);
    await provide({
      dir,
      async shot(name) {
        const path = file(`${name}.png`);
        await page.screenshot({ path, fullPage: true });
        return path;
      },
      async aria(name, locator = page.locator("body")) {
        const path = file(`${name}.aria.yml`);
        await writeFile(path, `# ${page.url()}\n${await locator.ariaSnapshot()}\n`);
        return path;
      },
      async json(name, value) {
        const path = file(`${name}.json`);
        await writeFile(path, JSON.stringify(value, null, 2));
        return path;
      },
      async step(line) {
        await appendFile(file("steps.log"), `${new Date().toISOString()} ${line}\n`);
      },
    });
  },
});
