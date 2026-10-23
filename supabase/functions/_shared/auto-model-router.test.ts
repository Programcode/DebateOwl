import { AUTO_FAST, AUTO_PRO } from "./model-catalog.ts";
import {
  FAST_CANDIDATES,
  PRO_CANDIDATES,
  resolveModelSelection,
  routeAmongCandidates,
  type AutoModelRouterJev,
  type ResolveModelSelectionArgs,
} from "./auto-model-router.ts";
import type { JevDecisionResult } from "./jev.ts";

function choiceResult(choice: string, confidence = 0.9): JevDecisionResult {
  return {
    model: "typesafe/jev-1.13",
    answers: {
      model: {
        type: "choice",
        choice,
        confidence,
        probabilities: { [choice]: confidence },
      },
    },
  };
}

function jevReturning(result: JevDecisionResult, observed?: { calls: number; state?: unknown }): AutoModelRouterJev {
  return (args) => {
    if (observed) {
      observed.calls += 1;
      observed.state = args.state;
    }
    return Promise.resolve(result);
  };
}

const HAIKU = "anthropic/claude-haiku-5.5";
const SONNET = "anthropic/claude-sonnet-5.5";
// A two-model pool to exercise the Jev routing path, which the live Auto pools
// (one Claude model each) skip.
const TEST_POOL = { [HAIKU]: "default", [SONNET]: "harder work" };

function poolArgs(overrides: Partial<ResolveModelSelectionArgs> = {}): ResolveModelSelectionArgs {
  return { requestedModel: AUTO_PRO, feature: "generate", input: { motion: "Should cities ban cars?" }, canAccessProModels: true, ...overrides };
}

Deno.test("Auto pools route only to Claude, so Auto never bills OpenRouter credits", () => {
  for (const id of [...Object.keys(FAST_CANDIDATES), ...Object.keys(PRO_CANDIDATES)]) {
    if (!id.startsWith("anthropic/")) throw new Error(`non-Anthropic Auto candidate: ${id}`);
  }
  if (Object.hasOwn(PRO_CANDIDATES, "anthropic/claude-opus-5.5")) throw new Error("Auto Pro must not route to Opus");
});

Deno.test("Auto Fast resolves to Claude Haiku for a Basic user without a Jev call", async () => {
  const observed = { calls: 0 };
  const resolved = await resolveModelSelection({
    requestedModel: AUTO_FAST,
    feature: "generate",
    input: { motion: "This house would subsidize public transit", language: "en" },
    canAccessProModels: false,
    callJevImpl: jevReturning(choiceResult("meta/muse-spark-1.3-contributor"), observed),
  });
  if (resolved.requestedModel !== AUTO_FAST || resolved.resolvedModel !== HAIKU || resolved.usedFallback || resolved.jev) {
    throw new Error(`unexpected Auto Fast resolution: ${JSON.stringify(resolved)}`);
  }
  if (observed.calls !== 0) throw new Error("single-candidate Auto Fast called Jev");
});

Deno.test("Auto Pro resolves to Claude Sonnet without a Jev call and never to Opus", async () => {
  const observed = { calls: 0 };
  const resolved = await resolveModelSelection(poolArgs({ callJevImpl: jevReturning(choiceResult("anthropic/claude-opus-5.5"), observed) }));
  if (resolved.resolvedModel !== SONNET || resolved.usedFallback) throw new Error(`unexpected Auto Pro resolution: ${JSON.stringify(resolved)}`);
  if (observed.calls !== 0) throw new Error("single-candidate Auto Pro called Jev");
});

Deno.test("Auto Pro rejects Basic before calling Jev", async () => {
  const observed = { calls: 0 };
  try {
    await resolveModelSelection(poolArgs({ canAccessProModels: false, callJevImpl: jevReturning(choiceResult(SONNET), observed) }));
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Pro")) throw error;
    if (observed.calls !== 0) throw new Error("Jev ran before Auto Pro entitlement rejection");
    return;
  }
  throw new Error("Basic Auto Pro request was accepted");
});

Deno.test("manual model selections bypass Jev", async () => {
  const observed = { calls: 0 };
  const resolved = await resolveModelSelection({
    requestedModel: "openai/gpt-6-luna",
    feature: "ask",
    input: { message: "Hi" },
    canAccessProModels: false,
    callJevImpl: jevReturning(choiceResult("z-ai/glm-5.3-flash"), observed),
  });
  if (resolved.resolvedModel !== "openai/gpt-6-luna" || resolved.requestedModel !== "openai/gpt-6-luna") {
    throw new Error("manual selection changed");
  }
  if (observed.calls !== 0) throw new Error("manual selection called Jev");
});

Deno.test("a multi-model pool accepts a confident Jev choice from the pool", async () => {
  const resolved = await routeAmongCandidates(poolArgs({ callJevImpl: jevReturning(choiceResult(SONNET)) }), TEST_POOL, HAIKU);
  if (resolved.resolvedModel !== SONNET || resolved.usedFallback || !resolved.jev) throw new Error(`pool route rejected: ${JSON.stringify(resolved)}`);
});

Deno.test("a multi-model pool falls back when Jev is uncertain or unavailable", async () => {
  const uncertain = await routeAmongCandidates(poolArgs({ callJevImpl: jevReturning(choiceResult(SONNET, 0.54)) }), TEST_POOL, HAIKU);
  if (uncertain.resolvedModel !== HAIKU || !uncertain.usedFallback) throw new Error("uncertain route did not fall back");

  const unavailable = await routeAmongCandidates(poolArgs({
    callJevImpl: () => Promise.reject(Object.assign(new Error("provider unavailable"), { usage: { inputTokens: 9, outputTokens: 0 } })),
  }), TEST_POOL, HAIKU);
  if (unavailable.resolvedModel !== HAIKU || !unavailable.usedFallback) throw new Error("failed route did not fall back");
  if (unavailable.jevUsage?.inputTokens !== 9) throw new Error("failed route usage was discarded");
});

Deno.test("a multi-model pool ignores a Jev label outside the pool", async () => {
  for (const label of ["anthropic/claude-opus-5.5", "meta/muse-spark-1.3-contributor", "openai/gpt-6.1-sol"]) {
    const resolved = await routeAmongCandidates(poolArgs({ callJevImpl: jevReturning(choiceResult(label)) }), TEST_POOL, HAIKU);
    if (resolved.resolvedModel !== HAIKU || !resolved.usedFallback) throw new Error(`label outside the pool escaped: ${label}`);
  }
});

Deno.test("router bounds state and propagates caller cancellation", async () => {
  const observed = { calls: 0, state: undefined as unknown };
  const controller = new AbortController();
  const callJevImpl: AutoModelRouterJev = (args) => {
    observed.calls += 1;
    observed.state = args.state;
    return new Promise((_resolve, reject) => {
      const onAbort = () => reject(args.signal?.reason ?? new DOMException("Aborted", "AbortError"));
      if (args.signal?.aborted) onAbort();
      else args.signal?.addEventListener("abort", onAbort, { once: true });
    });
  };
  const pending = routeAmongCandidates(poolArgs({
    feature: "attack",
    input: { caseText: "x".repeat(20_000) },
    signal: controller.signal,
    callJevImpl,
  }), TEST_POOL, HAIKU);
  controller.abort(new DOMException("User cancelled routing", "AbortError"));
  try {
    await pending;
  } catch (error) {
    if (!error || typeof error !== "object" || !("message" in error) || !String(error.message).includes("User cancelled routing")) throw error;
    if (JSON.stringify(observed.state).length > 8_200) throw new Error("routing state exceeded its bound");
    return;
  }
  throw new Error("routing cancellation was converted to a fallback");
});

Deno.test("Auto charges its most expensive candidate, so Auto Pro costs what Sonnet costs", async () => {
  const { quotaUnitsFor } = await import("./usage-limits.ts");
  // Written out by hand, not read from the table under test.
  const ownUnits: Record<string, number> = { "anthropic/claude-haiku-5.5": 1, "anthropic/claude-sonnet-5.5": 2, "anthropic/claude-opus-5.5": 5 };
  for (const [selection, pool] of [[AUTO_FAST, FAST_CANDIDATES], [AUTO_PRO, PRO_CANDIDATES]] as const) {
    const expected = Math.max(...Object.keys(pool).map((id) => ownUnits[id] ?? 1));
    if (quotaUnitsFor(selection) !== expected) throw new Error(`${selection} reserves ${quotaUnitsFor(selection)}, its pool's most expensive candidate costs ${expected}`);
  }
  if (quotaUnitsFor(AUTO_PRO) !== 2) throw new Error(`Auto Pro reserves ${quotaUnitsFor(AUTO_PRO)}; its only candidate, Sonnet, costs 2`);
});
