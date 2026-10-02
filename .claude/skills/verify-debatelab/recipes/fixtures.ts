import { mkdir, appendFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { expect, fake, stackReady, test as stackTest } from "../../../../e2e/full-stack/stack";

// Recipes reuse the full-stack gate's fixtures: a fresh demo-code user per test
// (deleted afterwards), `signedIn`, the provider proxy, and the service-role
// `admin` client for reading rows. This file adds a remote-project guard, an
// evidence writer, and mode-aware provider checks. Recipes must pass in both
// modes, so assert structure (response shape, rows, visible sections), never
// model wording.
export * from "../../../../e2e/full-stack/stack";
// Scripted microphone, recogniser, and browser voice for spoken rounds.
export { say, spokenByBrowser, stubSpeech } from "../../../../e2e/helpers/voice";

if (!stackReady) throw new Error("Stack environment missing; run recipes through `verify.sh drive`");

export const LIVE = process.env.VERIFY_MODE === "live";
export const LIVE_MODEL = process.env.LIVE_MODEL ?? "";
/** Per-step wait for one AI round trip. Live reasoning models are slow. */
export const AI_TIMEOUT = LIVE ? 240_000 : 30_000;

export type ProviderCall = {
  feature: string | null;
  model?: string;
  requestedModel?: string;
  upstreamModel?: string;
  upstreamProvider?: string;
  status?: number;
  ms?: number;
  stream?: boolean;
  system?: string;
  user?: string;
};

export async function providerCalls(): Promise<ProviderCall[]> {
  return (await fake.requests()) as ProviderCall[];
}

/** Resolves with the parsed body of the next `ai` Edge Function response for a feature. */
export function aiResponse(page: Page, feature: string, operation?: string) {
  return page.waitForResponse((response) => {
    if (!response.url().endsWith("/functions/v1/ai") || response.request().method() !== "POST") return false;
    try {
      const body = response.request().postDataJSON() as { feature?: string; input?: { operation?: string } };
      return body.feature === feature && (!operation || body.input?.operation === operation);
    } catch {
      return false;
    }
  }, { timeout: AI_TIMEOUT }).then(async (response) => {
    expect(response.status(), `ai ${feature} status`).toBe(200);
    return response.json() as Promise<{ output: Record<string, unknown>; discoveredSources?: unknown[]; [key: string]: unknown }>;
  });
}

/** The provider was called for each feature, and every call succeeded. */
export async function expectProviderCalls(features: string[]) {
  const calls = await providerCalls();
  for (const feature of features) {
    expect(calls.map((call) => call.feature), `provider calls include ${feature}`).toContain(feature);
  }
  return calls;
}

export type Evidence = {
  dir: string;
  /** Full-page screenshot, `<name>.png`. */
  shot(name: string, target?: Page): Promise<string>;
  /** ARIA snapshot of a region (default: whole page), `<name>.aria.yml`. */
  aria(name: string, locator?: Locator): Promise<string>;
  /** Any JSON value, such as responses or database rows, `<name>.json`. */
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
    const slug = testInfo.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);
    const dir = join(process.env.VERIFY_ARTIFACT_DIR!, testInfo.project.name, slug);
    await mkdir(dir, { recursive: true });
    const file = (name: string) => join(dir, name);
    await writeFile(file("run.json"), JSON.stringify({
      test: testInfo.title,
      file: testInfo.file,
      project: testInfo.project.name,
      commit: process.env.VERIFY_HEAD,
      mode: LIVE ? "live" : "fake",
      liveModel: LIVE ? LIVE_MODEL : null,
      baseURL: testInfo.project.use.baseURL,
      startedAt: new Date().toISOString(),
    }, null, 2));
    await provide({
      dir,
      async shot(name, target = page) {
        const path = file(`${name}.png`);
        await target.screenshot({ path, fullPage: true });
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

    // Every test records what reached the provider. In live mode this is the
    // proof of spend and pinning: OpenRouter's own reply names the model.
    const calls = await providerCalls();
    await writeFile(file("provider-calls.json"), JSON.stringify(calls.map(({ system, user, ...call }) => ({
      ...call,
      systemChars: system?.length,
      userHead: user?.slice(0, 300),
    })), null, 2));
    if (LIVE) {
      const answered = calls.filter((call) => call.feature !== "jev" && call.status === 200);
      const offPin = answered.filter((call) => call.model !== LIVE_MODEL || !call.upstreamModel?.startsWith(LIVE_MODEL));
      expect(offPin.map((call) => `${call.feature}: sent ${call.model}, answered by ${call.upstreamModel}`), "live chat calls answered by the pinned model").toEqual([]);
    }
  },
});
