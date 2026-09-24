import { MODEL_CATALOG } from "../../supabase/functions/_shared/model-catalog";
import { expect, fake, stackReady, test } from "../full-stack/stack";
import { aiResponse, LIVE_TIMEOUT } from "../live/live";

// Every model a user can pick must generate a case. The regular live suite pins
// one cheap model, so it cannot see a production model that times out or
// returns invalid JSON. Run with LIVE_MODEL=as-requested (see docs/testing.md).
test.skip(!stackReady, "Live gate is required (LIVE_PROVIDERS=1 LIVE_MODEL=as-requested ./.superset/db-gate.sh)");
test.describe.configure({ timeout: LIVE_TIMEOUT + 60_000 });

for (const model of MODEL_CATALOG) {
  test(`${model.name} generates a case`, async ({ signedIn: page }) => {
    await page.goto("/app/generate");
    await page.getByRole("combobox", { name: "Select AI model for generate" }).click();
    await page.getByRole("option", { name: new RegExp(`^${model.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) }).click();
    await page.getByRole("textbox", { name: "Motion / Topic *" }).fill("This House would make public transport free at the point of use");
    const response = aiResponse(page, "generate");
    await page.getByRole("button", { name: "Generate Debate Case" }).click();
    const body = await response;
    expect(body.output.contentions).toHaveLength(3);

    const calls = (await fake.requests()) as Array<{ feature: string | null; model?: string; status?: number; ms?: number }>;
    const generate = calls.filter((call) => call.feature === "generate");
    expect(generate.map((call) => call.model), "the case came from the selected model").toContain(model.id);
    expect(generate.filter((call) => call.status !== 200), "failed provider calls").toEqual([]);
    // The ai function shares a 130 s request budget; print the provider portion.
    console.log(`latency ${model.id}: ${generate.map((call) => call.ms).join(", ")} ms`);
  });
}
