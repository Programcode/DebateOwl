import { AUTO_FAST, AUTO_PRO } from "./model-catalog.ts";
import {
  resolveModelSelection,
  type AutoModelRouterJev,
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

Deno.test("Auto Fast normally resolves to Claude Haiku for a Basic user", async () => {
  const resolved = await resolveModelSelection({
    requestedModel: AUTO_FAST,
    feature: "generate",
    input: { motion: "This house would subsidize public transit", language: "en" },
    canAccessProModels: false,
    callJevImpl: jevReturning(choiceResult("anthropic/claude-haiku-5.5")),
  });
  if (resolved.requestedModel !== AUTO_FAST || resolved.resolvedModel !== "anthropic/claude-haiku-5.5" || resolved.usedFallback) {
    throw new Error(`unexpected Auto Fast resolution: ${JSON.stringify(resolved)}`);
  }
});

Deno.test("Auto Fast can route long-context work to Muse Spark", async () => {
  const resolved = await resolveModelSelection({
    requestedModel: AUTO_FAST,
    feature: "attack",
    input: { caseText: "A very long multilingual case file requiring broad context handling" },
    canAccessProModels: false,
    callJevImpl: jevReturning(choiceResult("meta/muse-spark-1.3-contributor")),
  });
  if (resolved.resolvedModel !== "meta/muse-spark-1.3-contributor" || resolved.usedFallback) {
    throw new Error(`long-context route was not accepted: ${JSON.stringify(resolved)}`);
  }
});

Deno.test("Auto Fast falls back to Claude Haiku when Jev is uncertain or unavailable", async () => {
  const uncertain = await resolveModelSelection({
    requestedModel: AUTO_FAST,
    feature: "ask",
    input: { message: "Help me" },
    canAccessProModels: false,
    callJevImpl: jevReturning(choiceResult("openai/gpt-6-luna", 0.54)),
  });
  if (uncertain.resolvedModel !== "anthropic/claude-haiku-5.5" || !uncertain.usedFallback) throw new Error("uncertain route did not fall back");

  const unavailable = await resolveModelSelection({
    requestedModel: AUTO_FAST,
    feature: "ask",
    input: { message: "Help me" },
    canAccessProModels: false,
    callJevImpl: () => Promise.reject(Object.assign(new Error("provider unavailable"), { usage: { inputTokens: 9, outputTokens: 0 } })),
  });
  if (unavailable.resolvedModel !== "anthropic/claude-haiku-5.5" || !unavailable.usedFallback) throw new Error("failed route did not fall back");
  if (unavailable.jevUsage?.inputTokens !== 9) throw new Error("failed route usage was discarded");
});

Deno.test("Auto Fast ignores a Jev label outside its candidate set", async () => {
  const resolved = await resolveModelSelection({
    requestedModel: AUTO_FAST,
    feature: "generate",
    input: { motion: "Should cities ban cars?" },
    canAccessProModels: false,
    callJevImpl: jevReturning(choiceResult("anthropic/claude-opus-5.5")),
  });
  if (resolved.resolvedModel !== "anthropic/claude-haiku-5.5" || !resolved.usedFallback) throw new Error("unsupported label escaped candidate gate");
});

Deno.test("Auto Pro rejects Basic before calling Jev", async () => {
  const observed = { calls: 0 };
  try {
    await resolveModelSelection({
      requestedModel: AUTO_PRO,
      feature: "generate",
      input: { motion: "Should cities ban cars?" },
      canAccessProModels: false,
      callJevImpl: jevReturning(choiceResult("openai/gpt-6.1-sol"), observed),
    });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Pro")) throw error;
    if (observed.calls !== 0) throw new Error("Jev ran before Auto Pro entitlement rejection");
    return;
  }
  throw new Error("Basic Auto Pro request was accepted");
});

Deno.test("Auto Pro accepts only its approved smart-model pool", async () => {
  for (const model of ["anthropic/claude-sonnet-5.5", "openai/gpt-6.1-sol"]) {
    const resolved = await resolveModelSelection({
      requestedModel: AUTO_PRO,
      feature: "generate",
      input: { motion: "Complex international law motion" },
      canAccessProModels: true,
      callJevImpl: jevReturning(choiceResult(model)),
    });
    if (resolved.resolvedModel !== model || resolved.usedFallback) throw new Error(`approved Pro route rejected: ${model}`);
  }

  const outsidePool = await resolveModelSelection({
    requestedModel: AUTO_PRO,
    feature: "generate",
    input: { motion: "Complex international law motion" },
    canAccessProModels: true,
    callJevImpl: jevReturning(choiceResult("z-ai/glm-5.3-flash")),
  });
  if (outsidePool.resolvedModel !== "anthropic/claude-sonnet-5.5" || !outsidePool.usedFallback) {
    throw new Error("Auto Pro accepted a model outside its pool");
  }
});

Deno.test("Auto Pro never routes or falls back to Opus", async () => {
  const routedToOpus = await resolveModelSelection({
    requestedModel: AUTO_PRO,
    feature: "generate",
    input: { motion: "Complex international law motion" },
    canAccessProModels: true,
    callJevImpl: jevReturning(choiceResult("anthropic/claude-opus-5.5")),
  });
  if (routedToOpus.resolvedModel !== "anthropic/claude-sonnet-5.5" || !routedToOpus.usedFallback) {
    throw new Error(`Auto Pro accepted Opus: ${JSON.stringify(routedToOpus)}`);
  }

  const unavailable = await resolveModelSelection({
    requestedModel: AUTO_PRO,
    feature: "generate",
    input: { motion: "Complex international law motion" },
    canAccessProModels: true,
    callJevImpl: () => Promise.reject(new Error("provider unavailable")),
  });
  if (unavailable.resolvedModel !== "anthropic/claude-sonnet-5.5" || !unavailable.usedFallback) {
    throw new Error(`Auto Pro fell back to the wrong model: ${JSON.stringify(unavailable)}`);
  }
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
  const pending = resolveModelSelection({
    requestedModel: AUTO_FAST,
    feature: "attack",
    input: { caseText: "x".repeat(20_000) },
    canAccessProModels: false,
    signal: controller.signal,
    callJevImpl,
  });
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
