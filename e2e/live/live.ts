import type { Page } from "@playwright/test";
import { expect, fake } from "../full-stack/stack";

// Live runs call real providers, so outputs vary. Assert structure, never text.
export const LIVE_TIMEOUT = 180_000;

/** Resolves with the parsed body of the next `ai` Edge Function response for a feature. */
export function aiResponse(page: Page, feature: string) {
  return page.waitForResponse((response) => {
    if (!response.url().includes("/functions/v1/ai") || response.request().method() !== "POST") return false;
    try {
      return (response.request().postDataJSON() as { feature?: string }).feature === feature;
    } catch {
      return false;
    }
  }, { timeout: LIVE_TIMEOUT }).then(async (response) => {
    expect(response.status(), `ai ${feature} status`).toBe(200);
    return response.json() as Promise<{ output: Record<string, unknown>; discoveredSources?: unknown[] }>;
  });
}

/** Every provider call went through the pinned live model and succeeded. */
export async function expectProviderCallsHealthy(features: string[]) {
  const calls = await fake.requests() as Array<{ feature: string | null; model?: string; status?: number }>;
  for (const feature of features) {
    expect(calls.map((call) => call.feature), `provider calls include ${feature}`).toContain(feature);
  }
  const failed = calls.filter((call) => call.status !== 200);
  expect(failed, "provider calls that did not return 200").toEqual([]);
  const chatModels = new Set(calls.filter((call) => call.feature !== "jev").map((call) => call.model));
  expect([...chatModels], "chat calls use only the live model").toEqual([process.env.LIVE_MODEL]);
}
