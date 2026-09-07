import {
  calculateRequestCost,
  mergeNormalizedUsage,
  normalizeAnthropicUsage,
  normalizeGoogleUsage,
  normalizeOpenRouterUsage,
  normalizeOpenAIUsage,
  selectObservedUsage,
} from "./cost.ts";

function approxEqual(a: number | null, b: number, epsilon = 1e-9): boolean {
  return a !== null && Math.abs(a - b) < epsilon;
}

Deno.test("openai standard usage costs input and output at short-context rates", () => {
  const result = calculateRequestCost({
    provider: "openai",
    model: "gpt-5.4-mini",
    usage: normalizeOpenAIUsage({ prompt_tokens: 1000, completion_tokens: 500 }),
  });
  if (result.inputTokens !== 1000 || result.outputTokens !== 500) throw new Error("token passthrough failed");
  // 1000/1M * $0.75 + 500/1M * $4.50
  if (!approxEqual(result.costUsd, 0.00075 + 0.00225)) throw new Error(`unexpected cost ${result.costUsd}`);
  if (result.pricingSnapshotId !== "official-docs-2026-08-22") throw new Error("snapshot id missing");
});

Deno.test("openai cached and reasoning tokens are not double counted", () => {
  const result = calculateRequestCost({
    provider: "openai",
    model: "gpt-5.4-mini",
    usage: normalizeOpenAIUsage({
      prompt_tokens: 1000,
      completion_tokens: 500,
      prompt_tokens_details: { cached_tokens: 400 },
      completion_tokens_details: { reasoning_tokens: 200 },
    }),
  });
  if (result.cachedInputTokens !== 400) throw new Error("cached tokens not captured");
  if (result.reasoningOutputTokens !== 200) throw new Error("reasoning tokens not captured");
  // (600 * 0.75 + 400 * 0.075 + 500 * 4.50) / 1M
  const expected = (600 * 0.75 + 400 * 0.075 + 500 * 4.5) / 1_000_000;
  if (!approxEqual(result.costUsd, expected)) throw new Error(`reasoning or cached double counted: ${result.costUsd} vs ${expected}`);
});

Deno.test("openai long-context rates apply above the published threshold", () => {
  const result = calculateRequestCost({
    provider: "openai",
    model: "gpt-5.4",
    usage: normalizeOpenAIUsage({ prompt_tokens: 300_000, completion_tokens: 1000 }),
  });
  // long context: input $5.00, output $22.50
  const expected = (300_000 * 5 + 1000 * 22.5) / 1_000_000;
  if (!approxEqual(result.costUsd, expected)) throw new Error(`long context cost wrong: ${result.costUsd} vs ${expected}`);
});

Deno.test("anthropic cache read and write tokens use their own rates", () => {
  const result = calculateRequestCost({
    provider: "anthropic",
    model: "claude-opus-4-7",
    usage: normalizeAnthropicUsage({
      input_tokens: 1000,
      output_tokens: 500,
      cache_read_input_tokens: 2000,
      cache_creation_input_tokens: 300,
    }),
  });
  if (result.cachedInputTokens !== 2000) throw new Error("cache read tokens not captured");
  const expected = (1000 * 5 + 2000 * 0.5 + 300 * 6.25 + 500 * 25) / 1_000_000;
  if (!approxEqual(result.costUsd, expected)) throw new Error(`anthropic cost wrong: ${result.costUsd} vs ${expected}`);
});

Deno.test("gemini thinking tokens are billed as output without double counting", () => {
  const result = calculateRequestCost({
    provider: "google",
    model: "gemini-3-flash-preview",
    usage: normalizeGoogleUsage({
      promptTokenCount: 1000,
      candidatesTokenCount: 400,
      thoughtsTokenCount: 100,
      cachedContentTokenCount: 200,
      totalTokenCount: 1700,
    }),
  });
  if (result.reasoningOutputTokens !== 100) throw new Error("thinking tokens not captured");
  if (result.outputTokens !== 500) throw new Error("billable output must be candidates + thoughts");
  const expected = (800 * 0.5 + 200 * 0.05 + 500 * 3.0) / 1_000_000;
  if (!approxEqual(result.costUsd, expected)) throw new Error(`gemini cost wrong: ${result.costUsd} vs ${expected}`);
});

Deno.test("gemini pro applies the 200k long-context threshold", () => {
  const result = calculateRequestCost({
    provider: "google",
    model: "gemini-3.1-pro-preview",
    usage: normalizeGoogleUsage({ promptTokenCount: 250_000, candidatesTokenCount: 1000 }),
  });
  const expected = (250_000 * 4 + 1000 * 18) / 1_000_000;
  if (!approxEqual(result.costUsd, expected)) throw new Error(`pro long context cost wrong: ${result.costUsd} vs ${expected}`);
});

Deno.test("unknown model returns null cost but keeps token counts", () => {
  const result = calculateRequestCost({
    provider: "google",
    model: "gemini-3.1-flash-lite-preview",
    usage: normalizeGoogleUsage({ promptTokenCount: 1234, candidatesTokenCount: 567 }),
  });
  if (result.costUsd !== null) throw new Error(`unknown model must fail closed, got ${result.costUsd}`);
  if (result.inputTokens !== 1234 || result.outputTokens !== 567) throw new Error("tokens lost for unknown model");
});

Deno.test("missing usage yields nulls instead of zeros", () => {
  const result = calculateRequestCost({ provider: "openai", model: "gpt-5.4-mini" });
  if (result.costUsd !== null) throw new Error("cost must be null without usage");
  if (result.inputTokens !== null || result.outputTokens !== null) throw new Error("tokens must be null without usage");
});

Deno.test("raw provider usage is preserved for audit", () => {
  const raw = { prompt_tokens: 10, completion_tokens: 5, system_fingerprint: "fp_x" };
  const result = calculateRequestCost({ provider: "openai", model: "gpt-5.4-mini", usage: normalizeOpenAIUsage(raw) });
  if (!result.rawUsage || result.rawUsage.system_fingerprint !== "fp_x") throw new Error("raw usage dropped");
});

Deno.test("OpenRouter usage uses its reported account cost, including zero", () => {
  const raw = {
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15,
    cost: 0,
  };
  const usage = normalizeOpenRouterUsage(raw);
  const result = calculateRequestCost({ provider: "openrouter", model: "openai/gpt-5.6-luna", usage });
  if (usage.reportedCostUsd !== 0 || result.costUsd !== 0) {
    throw new Error(`zero OpenRouter cost was not preserved: ${JSON.stringify({ usage, result })}`);
  }
  if (result.rawUsage?.cost !== 0) throw new Error("raw OpenRouter usage was dropped");
});

Deno.test("OpenRouter usage without a reported cost fails closed", () => {
  const usage = normalizeOpenRouterUsage({ prompt_tokens: 10, completion_tokens: 5 });
  const result = calculateRequestCost({ provider: "openrouter", model: "openai/gpt-5.6-luna", usage });
  if (result.costUsd !== null) {
    throw new Error(`missing OpenRouter cost was estimated: ${JSON.stringify(result)}`);
  }
});

Deno.test("anthropic ttl-split cache writes bill at 5m and 1h rates", () => {
  const result = calculateRequestCost({
    provider: "anthropic",
    model: "claude-opus-4-7",
    usage: normalizeAnthropicUsage({
      input_tokens: 1000,
      output_tokens: 100,
      cache_creation_input_tokens: {
        ephemeral_5m_input_tokens: 400,
        ephemeral_1h_input_tokens: 600,
      },
    }),
  });
  const expected = (1000 * 5 + 400 * 6.25 + 600 * 10 + 100 * 25) / 1_000_000;
  if (!approxEqual(result.costUsd, expected)) throw new Error(`ttl split cost wrong: ${result.costUsd} vs ${expected}`);
});

Deno.test("research sub-calls merge into one auditable usage record", async () => {
  const merged = mergeNormalizedUsage([
    normalizeOpenAIUsage({ prompt_tokens: 1000, completion_tokens: 500 }),
    normalizeOpenAIUsage({ prompt_tokens: 300, completion_tokens: 100 }),
  ]);
  if (!merged) throw new Error("merge dropped all usage");
  if (merged.inputTokens !== 1300 || merged.outputTokens !== 600) throw new Error("sums wrong");
  const rawCalls = (merged.raw as { calls: unknown[] }).calls;
  if (!Array.isArray(rawCalls) || rawCalls.length !== 2) throw new Error("raw calls not preserved");
});

Deno.test("merged OpenRouter research usage sums only complete reported costs", () => {
  const complete = mergeNormalizedUsage([
    normalizeOpenRouterUsage({ prompt_tokens: 10, completion_tokens: 5, cost: 0.25 }),
    normalizeOpenRouterUsage({ prompt_tokens: 20, completion_tokens: 8, cost: 0.75 }),
  ]);
  if (complete?.reportedCostUsd !== 1) throw new Error(`complete costs were not summed: ${complete?.reportedCostUsd}`);
  const completeCost = calculateRequestCost({ provider: "openrouter", model: "openai/gpt-5.6-luna", usage: complete });
  if (completeCost.costUsd !== 1) throw new Error(`complete merged cost was not retained: ${completeCost.costUsd}`);

  const missing = mergeNormalizedUsage([
    normalizeOpenRouterUsage({ prompt_tokens: 10, completion_tokens: 5, cost: 0.25 }),
    normalizeOpenRouterUsage({ prompt_tokens: 20, completion_tokens: 8 }),
  ]);
  if (missing?.reportedCostUsd !== undefined) throw new Error("missing sub-call cost was summed");
  const missingCost = calculateRequestCost({ provider: "openrouter", model: "openai/gpt-5.6-luna", usage: missing });
  if (missingCost.costUsd !== null) throw new Error(`missing sub-call cost was estimated: ${missingCost.costUsd}`);

  const incomplete = mergeNormalizedUsage([
    normalizeOpenRouterUsage({ prompt_tokens: 10, completion_tokens: 5, cost: 0.25 }),
    { incomplete: true, raw: { aborted: true } },
  ]);
  if (!incomplete?.incomplete || incomplete.reportedCostUsd !== undefined) throw new Error("incomplete sub-call was billed");
  const incompleteCost = calculateRequestCost({ provider: "openrouter", model: "openai/gpt-5.6-luna", usage: incomplete });
  if (incompleteCost.costUsd !== null) throw new Error(`incomplete merged cost was estimated: ${incompleteCost.costUsd}`);
});

Deno.test("incomplete merged usage keeps observed tokens but fails closed on cost", () => {
  const merged = mergeNormalizedUsage([
    normalizeOpenAIUsage({ prompt_tokens: 1000, completion_tokens: 500 }),
    { incomplete: true },
  ]);
  if (!merged?.incomplete) throw new Error("incomplete marker was dropped");
  if (merged.inputTokens !== 1000 || merged.outputTokens !== 500) {
    throw new Error("observed token counts were dropped");
  }

  const result = calculateRequestCost({
    provider: "openai",
    model: "gpt-5.4-mini",
    usage: merged,
  });
  if (result.costUsd !== null) throw new Error("incomplete usage must not produce a known cost");
  if (result.inputTokens !== 1000 || result.outputTokens !== 500) {
    throw new Error("cost audit lost observed token counts");
  }
});

Deno.test("observed usage selection prefers merged usage and selects each record once", () => {
  const firstAttempt = normalizeOpenAIUsage({ prompt_tokens: 1000, completion_tokens: 500 });
  const repairAttempt = normalizeOpenAIUsage({ prompt_tokens: 300, completion_tokens: 100 });
  const merged = mergeNormalizedUsage([firstAttempt, repairAttempt]);
  if (!merged) throw new Error("merge dropped usage");

  const selected = selectObservedUsage({ usage: merged, completedUsage: firstAttempt }, false);
  if (selected !== merged) throw new Error("non-aborted errors must select merged usage");
  if (selected.inputTokens !== 1300 || selected.outputTokens !== 600) {
    throw new Error("merged usage was not selected exactly once");
  }
});

Deno.test("observed usage selection prefers completed usage after abort and supports fallbacks", () => {
  const usage = normalizeOpenAIUsage({ prompt_tokens: 300, completion_tokens: 100 });
  const completedUsage = normalizeOpenAIUsage({ prompt_tokens: 1000, completion_tokens: 500 });

  const abortedSelection = selectObservedUsage({ usage, completedUsage }, true);
  if (abortedSelection !== completedUsage) throw new Error("aborted errors must select completed usage");
  if (abortedSelection.inputTokens !== 1000 || abortedSelection.outputTokens !== 500) {
    throw new Error("completed usage selection changed token counts");
  }

  if (selectObservedUsage({ completedUsage }, false) !== completedUsage) {
    throw new Error("non-aborted selection did not fall back to completed usage");
  }
  if (selectObservedUsage({ usage }, true) !== usage) {
    throw new Error("aborted selection did not fall back to usage");
  }
  if (selectObservedUsage(undefined, true) !== undefined) {
    throw new Error("missing usage should remain undefined");
  }
});
