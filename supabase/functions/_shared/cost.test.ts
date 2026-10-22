import {
  calculateRequestCost,
  markIncompleteUsage,
  mergeNormalizedUsage,
  normalizeElevenLabsUsage,
  normalizeOpenRouterUsage,
  selectObservedUsage,
} from "./cost.ts";

Deno.test("OpenRouter usage uses its reported account cost, including zero", () => {
  const result = calculateRequestCost({
    provider: "openrouter",
    model: "z-ai/glm-5.3-flash",
    usage: normalizeOpenRouterUsage({ prompt_tokens: 1000, completion_tokens: 500, cost: 0 }),
  });
  if (result.costUsd !== 0) throw new Error(`zero cost was discarded: ${result.costUsd}`);
  if (result.inputTokens !== 1000 || result.outputTokens !== 500) throw new Error("token counts lost");
  if (result.costCalculationVersion !== "openrouter-usage-v1") throw new Error("wrong calculation version");
});

Deno.test("OpenRouter usage without a reported cost fails closed", () => {
  const result = calculateRequestCost({
    provider: "openrouter",
    model: "z-ai/glm-5.3-flash",
    usage: normalizeOpenRouterUsage({ prompt_tokens: 1000, completion_tokens: 500 }),
  });
  if (result.costUsd !== null) throw new Error(`missing cost was estimated: ${result.costUsd}`);
  if (result.inputTokens !== 1000) throw new Error("token counts lost");
});

Deno.test("cached and reasoning tokens are reported without double counting", () => {
  const result = calculateRequestCost({
    provider: "openrouter",
    model: "z-ai/glm-5.3-flash",
    usage: normalizeOpenRouterUsage({
      prompt_tokens: 1000,
      completion_tokens: 500,
      cost: 0.42,
      prompt_tokens_details: { cached_tokens: 400, cache_write_tokens: 100 },
      completion_tokens_details: { reasoning_tokens: 200 },
    }),
  });
  if (result.cachedInputTokens !== 400) throw new Error("cached tokens lost");
  if (result.cacheWriteTokens !== 100) throw new Error("cache write tokens lost");
  if (result.reasoningOutputTokens !== 200) throw new Error("reasoning tokens lost");
  // Reasoning is a subset of completion_tokens; it must not inflate the output total.
  if (result.outputTokens !== 500) throw new Error("reasoning tokens were double counted");
  if (result.costUsd !== 0.42) throw new Error("reported cost changed");
});

Deno.test("missing usage yields nulls instead of zeros", () => {
  const result = calculateRequestCost({ provider: "openrouter", model: "z-ai/glm-5.3-flash" });
  if (result.costUsd !== null || result.inputTokens !== null || result.outputTokens !== null) {
    throw new Error("absent usage was reported as zero");
  }
});

Deno.test("negative provider token counts are dropped, not billed", () => {
  const result = calculateRequestCost({
    provider: "openrouter",
    model: "z-ai/glm-5.3-flash",
    usage: normalizeOpenRouterUsage({ prompt_tokens: -5, completion_tokens: 500, cost: 0.1 }),
  });
  if (result.inputTokens !== null) throw new Error(`negative token count survived: ${result.inputTokens}`);
});

Deno.test("raw provider usage is preserved for audit", () => {
  const raw = { prompt_tokens: 10, completion_tokens: 5, cost: 0.01, provider_extra: "keep me" };
  const result = calculateRequestCost({
    provider: "openrouter",
    model: "z-ai/glm-5.3-flash",
    usage: normalizeOpenRouterUsage(raw),
  });
  if (result.rawUsage !== raw) throw new Error("raw usage was not preserved verbatim");
});

Deno.test("research sub-calls merge into one auditable usage record", () => {
  const merged = mergeNormalizedUsage([
    normalizeOpenRouterUsage({ prompt_tokens: 1000, completion_tokens: 500, cost: 0.2 }),
    normalizeOpenRouterUsage({ prompt_tokens: 300, completion_tokens: 100, cost: 0.05 }),
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
  const completeCost = calculateRequestCost({ provider: "openrouter", model: "z-ai/glm-5.3-flash", usage: complete });
  if (completeCost.costUsd !== 1) throw new Error(`complete merged cost was not retained: ${completeCost.costUsd}`);

  const missing = mergeNormalizedUsage([
    normalizeOpenRouterUsage({ prompt_tokens: 10, completion_tokens: 5, cost: 0.25 }),
    normalizeOpenRouterUsage({ prompt_tokens: 20, completion_tokens: 8 }),
  ]);
  if (missing?.reportedCostUsd !== undefined) throw new Error("missing sub-call cost was summed");
  const missingCost = calculateRequestCost({ provider: "openrouter", model: "z-ai/glm-5.3-flash", usage: missing });
  if (missingCost.costUsd !== null) throw new Error(`missing sub-call cost was estimated: ${missingCost.costUsd}`);

  const incomplete = mergeNormalizedUsage([
    normalizeOpenRouterUsage({ prompt_tokens: 10, completion_tokens: 5, cost: 0.25 }),
    { incomplete: true, raw: { aborted: true } },
  ]);
  if (!incomplete?.incomplete || incomplete.reportedCostUsd !== undefined) throw new Error("incomplete sub-call was billed");
  const incompleteCost = calculateRequestCost({ provider: "openrouter", model: "z-ai/glm-5.3-flash", usage: incomplete });
  if (incompleteCost.costUsd !== null) throw new Error(`incomplete merged cost was estimated: ${incompleteCost.costUsd}`);
});

Deno.test("incomplete merged usage keeps observed tokens but fails closed on cost", () => {
  const merged = mergeNormalizedUsage([
    normalizeOpenRouterUsage({ prompt_tokens: 1000, completion_tokens: 500, cost: 0.3 }),
    { incomplete: true },
  ]);
  if (!merged?.incomplete) throw new Error("incomplete marker was dropped");
  if (merged.inputTokens !== 1000 || merged.outputTokens !== 500) {
    throw new Error("observed token counts were dropped");
  }

  const result = calculateRequestCost({ provider: "openrouter", model: "z-ai/glm-5.3-flash", usage: merged });
  if (result.costUsd !== null) throw new Error("incomplete usage must not produce a known cost");
  if (result.inputTokens !== 1000 || result.outputTokens !== 500) {
    throw new Error("cost audit lost observed token counts");
  }
});

Deno.test("observed usage selection prefers merged usage and selects each record once", () => {
  const firstAttempt = normalizeOpenRouterUsage({ prompt_tokens: 1000, completion_tokens: 500, cost: 0.2 });
  const repairAttempt = normalizeOpenRouterUsage({ prompt_tokens: 300, completion_tokens: 100, cost: 0.05 });
  const merged = mergeNormalizedUsage([firstAttempt, repairAttempt]);
  if (!merged) throw new Error("merge dropped usage");

  const selected = selectObservedUsage({ usage: merged, completedUsage: firstAttempt }, false);
  if (selected !== merged) throw new Error("non-aborted errors must select merged usage");
  if (selected.inputTokens !== 1300 || selected.outputTokens !== 600) {
    throw new Error("merged usage was not selected exactly once");
  }
});

Deno.test("observed usage selection prefers completed usage after abort and supports fallbacks", () => {
  const usage = normalizeOpenRouterUsage({ prompt_tokens: 300, completion_tokens: 100, cost: 0.05 });
  const completedUsage = normalizeOpenRouterUsage({ prompt_tokens: 1000, completion_tokens: 500, cost: 0.2 });

  const abortedSelection = selectObservedUsage({ usage, completedUsage }, true);
  if (abortedSelection !== completedUsage) throw new Error("aborted errors must select completed usage");
  if (abortedSelection.inputTokens !== 1000 || abortedSelection.outputTokens !== 500) {
    throw new Error("completed usage selection changed token counts");
  }

  const incompleteUsage = mergeNormalizedUsage([usage, { incomplete: true, raw: { repair_cancelled: true } }]);
  if (!incompleteUsage) throw new Error("incomplete usage merge failed");
  const incompleteSelection = selectObservedUsage({ usage: incompleteUsage, completedUsage }, true);
  if (incompleteSelection !== incompleteUsage || !incompleteSelection.incomplete) {
    throw new Error("incomplete merged usage must take precedence after abort");
  }
  if (incompleteSelection.inputTokens !== 300 || incompleteSelection.outputTokens !== 100) {
    throw new Error("incomplete usage did not retain observed tokens");
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

Deno.test("incomplete stream usage preserves observations and fails closed without usage", () => {
  const raw = { prompt_tokens: 100, completion_tokens: 20, cost: 0.02 };
  const observed = normalizeOpenRouterUsage(raw);
  for (const usage of [observed, undefined]) {
    const marked = markIncompleteUsage(usage);
    const cost = calculateRequestCost({ provider: "openrouter", model: "z-ai/glm-5.3-flash", usage: marked });
    if (!marked.incomplete || cost.costUsd !== null) throw new Error("Partial work must remain unknown-cost");
    if (usage && (marked.raw !== raw || cost.inputTokens !== 100 || cost.outputTokens !== 20)) throw new Error("Observed usage changed");
  }
  if (observed.incomplete) throw new Error("Marker mutated original usage");
});

Deno.test("ElevenLabs speech is priced from billed characters at the snapshot rate", () => {
  const usage = normalizeElevenLabsUsage({ characters: 480, characterCostHeader: "500", requestId: "req_1" });
  const result = calculateRequestCost({ provider: "elevenlabs", model: "eleven_v4", usage });
  // The provider's own count wins over the characters sent.
  if (result.costUsd !== 0.04) throw new Error(`wrong cost: ${result.costUsd}`);
  if (result.pricingSnapshotId !== "elevenlabs-api-pricing-2026-10-01") throw new Error("wrong snapshot");
  if (result.pricingSourceUrl !== "https://elevenlabs.io/pricing/api") throw new Error("wrong source");
  if (result.costCalculationVersion !== "elevenlabs-characters-v1") throw new Error("wrong calculation version");
  if (result.inputTokens !== null || result.outputTokens !== null) throw new Error("speech has no tokens");
  if (result.rawUsage?.characters !== 480 || result.rawUsage?.request_id !== "req_1") throw new Error("raw usage lost");
});

Deno.test("ElevenLabs speech without a usable header is priced from the characters sent", () => {
  for (const header of [null, "", "abc", "-5"]) {
    const usage = normalizeElevenLabsUsage({ characters: 1_000, characterCostHeader: header, requestId: null });
    const result = calculateRequestCost({ provider: "elevenlabs", model: "eleven_v4_turbo", usage });
    if (result.costUsd !== 0.04) throw new Error(`wrong cost for header ${JSON.stringify(header)}: ${result.costUsd}`);
  }
});

Deno.test("ElevenLabs cost fails closed for an unlisted model, missing usage, or incomplete work", () => {
  const usage = normalizeElevenLabsUsage({ characters: 100, characterCostHeader: "100", requestId: null });
  const unlisted = calculateRequestCost({ provider: "elevenlabs", model: "eleven_v9", usage });
  if (unlisted.costUsd !== null || unlisted.pricingSourceUrl !== null) throw new Error("an unlisted model was priced");
  if (calculateRequestCost({ provider: "elevenlabs", model: "eleven_v4" }).costUsd !== null) throw new Error("missing usage was priced");
  if (calculateRequestCost({ provider: "elevenlabs", model: "eleven_v4", usage: { incomplete: true } }).costUsd !== null) throw new Error("incomplete work was priced");
});

Deno.test("the weekly cap counts OpenRouter credit spend, not BYOK provider charges", () => {
  // A BYOK Claude call: OpenRouter charges only its fee (0 here); the provider bills our own key.
  const byok = normalizeOpenRouterUsage({ prompt_tokens: 1500, completion_tokens: 600, cost: 0, is_byok: true });
  // A Claude call that fell back to OpenRouter credits counts in full.
  const credits = normalizeOpenRouterUsage({ prompt_tokens: 1500, completion_tokens: 600, cost: 0.012, is_byok: false });
  const gpt = normalizeOpenRouterUsage({ prompt_tokens: 1000, completion_tokens: 500, cost: 0.004 });
  if (calculateRequestCost({ provider: "openrouter", model: "anthropic/claude-opus-5.5", usage: byok }).capCostUsd !== 0) {
    throw new Error("a BYOK call counted toward the cap");
  }
  if (calculateRequestCost({ provider: "openrouter", model: "anthropic/claude-opus-5.5", usage: credits }).capCostUsd !== 0.012) {
    throw new Error("a credit-billed Claude call did not count");
  }
  const merged = calculateRequestCost({ provider: "openrouter", model: "openai/gpt-6-luna", usage: mergeNormalizedUsage([gpt, byok]) });
  if (Math.abs((merged.capCostUsd ?? -1) - 0.004) > 1e-12) throw new Error(`merged cap spend wrong: ${merged.capCostUsd}`);
});

Deno.test("a usage with a separate provider charge counts it toward the cap in full", () => {
  // Exa-style usage: a known charge with no separate cap figure.
  const research = { reportedCostUsd: 0.03 };
  const byok = normalizeOpenRouterUsage({ prompt_tokens: 10, completion_tokens: 10, cost: 0, is_byok: true });
  const merged = mergeNormalizedUsage([byok, research]);
  const result = calculateRequestCost({ provider: "openrouter", model: "anthropic/claude-haiku-5.5", usage: merged });
  if (Math.abs((result.capCostUsd ?? -1) - 0.03) > 1e-12) throw new Error(`research charge not counted: ${result.capCostUsd}`);
});

Deno.test("the cap counts the known part of a partly unknown request", () => {
  const known = normalizeOpenRouterUsage({ prompt_tokens: 10, completion_tokens: 10, cost: 0.5 });
  const unknown = normalizeOpenRouterUsage({ prompt_tokens: 10, completion_tokens: 10 });
  const partial = calculateRequestCost({ provider: "openrouter", model: "x", usage: mergeNormalizedUsage([known, unknown]) });
  if (partial.costUsd !== null) throw new Error("a partly unknown request got a full cost");
  if (partial.capCostUsd !== 0.5) throw new Error(`known part missing from the cap: ${partial.capCostUsd}`);
  if (calculateRequestCost({ provider: "openrouter", model: "x", usage: markIncompleteUsage(known) }).capCostUsd !== 0.5) {
    throw new Error("cancelled work dropped its known charge from the cap");
  }
  if (calculateRequestCost({ provider: "openrouter", model: "x", usage: unknown }).capCostUsd !== null) {
    throw new Error("a wholly unknown request got a cap figure");
  }
});

Deno.test("ElevenLabs voice cost counts toward the cap", () => {
  const usage = normalizeElevenLabsUsage({ characters: 1000, characterCostHeader: "1000", requestId: null });
  const result = calculateRequestCost({ provider: "elevenlabs", model: "eleven_v4_turbo", usage });
  if (result.capCostUsd !== result.costUsd || result.costUsd === null) throw new Error("voice cost missing from the cap");
});
