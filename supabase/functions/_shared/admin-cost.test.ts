import {
  collectAdminUsagePages,
  getKnownCost,
  hasUnknownCost,
  isCostableAiRequest,
  isNonAiActivity,
} from "./admin-cost.ts";

Deno.test("known successful AI rows contribute their stored cost", () => {
  const row = {
    feature: "ask",
    status: "success",
    cost_usd: 0.0125,
    input_tokens: 100,
    output_tokens: 50,
  };

  if (!isCostableAiRequest(row)) throw new Error("known AI row should be costable");
  if (hasUnknownCost(row)) throw new Error("known AI row should not be unknown");
  if (getKnownCost(row) !== 0.0125) throw new Error("known AI cost was not preserved");
});

Deno.test("unknown successful AI rows are costable but have unknown cost", () => {
  const row = {
    feature: "generate",
    status: "success",
    cost_usd: null,
    input_tokens: 100,
    output_tokens: 50,
  };

  if (!isCostableAiRequest(row)) throw new Error("unknown AI row should be costable");
  if (!hasUnknownCost(row)) throw new Error("unknown AI row was not marked unknown");
  if (getKnownCost(row) !== 0) throw new Error("unknown AI row contributed known cost");
});

Deno.test("rate-limited rows are not unknown, while provider failures are", () => {
  const rateLimited = { feature: "ask", status: "rate_limited", cost_usd: 1.25, input_tokens: null, output_tokens: null };
  if (isCostableAiRequest(rateLimited)) throw new Error("rate-limited row should not be costable");
  if (hasUnknownCost(rateLimited)) throw new Error("rate-limited row should not be unknown cost");
  if (getKnownCost(rateLimited) !== 0) throw new Error("rate-limited cost leaked into AI totals");

  for (const status of ["error", "cancelled"]) {
    const providerFailure = { feature: "ask", status, cost_usd: null, input_tokens: 100, output_tokens: 50 };
    if (!isCostableAiRequest(providerFailure)) throw new Error(`${status} provider work should be costable`);
    if (!hasUnknownCost(providerFailure)) throw new Error(`${status} provider work should be unknown cost`);
  }
});

Deno.test("successful importer rows remain volume activity without AI cost", () => {
  const row = {
    feature: "import_source",
    status: "success",
    cost_usd: 1.25,
    input_tokens: null,
    output_tokens: null,
  };

  if (!isNonAiActivity(row)) throw new Error("importer row was classified as AI activity");
  if (isCostableAiRequest(row)) throw new Error("importer row should not be costable");
  if (hasUnknownCost(row)) throw new Error("importer row should not be unknown AI cost");
  if (getKnownCost(row) !== 0) throw new Error("importer cost leaked into AI totals");
});

Deno.test("invalid stored costs remain unknown instead of becoming free", () => {
  const row = {
    feature: "ask",
    status: "success",
    cost_usd: Number.NaN,
    input_tokens: 100,
    output_tokens: 50,
  };

  if (!hasUnknownCost(row)) throw new Error("invalid cost should be unknown");
  if (getKnownCost(row) !== 0) throw new Error("invalid cost should not contribute to known totals");
});

Deno.test("stored costs stay known when historical token columns are null", () => {
  const row = {
    feature: "ask",
    status: "success",
    cost_usd: 0.25,
    input_tokens: null,
    output_tokens: null,
  };

  if (hasUnknownCost(row)) throw new Error("stored cost was reclassified as unknown");
  if (getKnownCost(row) !== 0.25) throw new Error("stored cost was dropped");
});

Deno.test("admin usage pagination reads past one full page", async () => {
  const calls: Array<[number, number]> = [];
  const rows = await collectAdminUsagePages(async (from, to) => {
    calls.push([from, to]);
    return { data: from === 0 ? [1, 2] : [3], error: null };
  }, 2);

  if (rows.join(",") !== "1,2,3") throw new Error(`rows were truncated: ${rows}`);
  if (JSON.stringify(calls) !== JSON.stringify([[0, 1], [2, 3]])) {
    throw new Error(`unexpected page ranges: ${JSON.stringify(calls)}`);
  }
});
