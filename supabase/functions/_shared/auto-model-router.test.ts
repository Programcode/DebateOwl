import {
  AUTO_FAST,
  AUTO_PRO,
  isAutoModelSelection,
} from "./model-catalog.ts";
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

Deno.test("Auto Fast is a Basic selection and Auto Pro is Pro-only", () => {
  if (!isAutoModelSelection(AUTO_FAST) || !isAutoModelSelection(AUTO_PRO)) throw new Error("auto selections missing");
  if (AUTO_FAST !== "auto-fast" || AUTO_PRO !== "auto-pro") throw new Error("auto IDs changed");
});

Deno.test("Auto Fast normally resolves to GLM for a Basic user", async () => {
  const resolved = await resolveModelSelection({
    requestedModel: AUTO_FAST,
    feature: "generate",
    input: { motion: "This house would subsidize public transit", language: "en" },
    canAccessProModels: false,
    callJevImpl: jevReturning(choiceResult("z-ai/glm-5.3-flash")),
  });
  if (resolved.requestedModel !== AUTO_FAST || resolved.resolvedModel !== "z-ai/glm-5.3-flash" || resolved.usedFallback) {
    throw new Error(`unexpected Auto Fast resolution: ${JSON.stringify(resolved)}`);
  }
});

Deno.test("Auto Fast can route logic-heavy work to DeepSeek Flash", async () => {
  const resolved = await resolveModelSelection({
    requestedModel: AUTO_FAST,
    feature: "attack",
    input: { caseText: "A long causal chain requiring adversarial logical analysis" },
    canAccessProModels: false,
    callJevImpl: jevReturning(choiceResult("deepseek/deepseek-v4-flash-0731")),
  });
  if (resolved.resolvedModel !== "deepseek/deepseek-v4-flash-0731" || resolved.usedFallback) {
    throw new Error(`logic-heavy route was not accepted: ${JSON.stringify(resolved)}`);
  }
});

Deno.test("Auto Fast falls back to GLM when Jev is uncertain or unavailable", async () => {
  const uncertain = await resolveModelSelection({
    requestedModel: AUTO_FAST,
    feature: "ask",
    input: { message: "Help me" },
    canAccessProModels: false,
    callJevImpl: jevReturning(choiceResult("openai/gpt-5.6-luna", 0.54)),
  });
  if (uncertain.resolvedModel !== "z-ai/glm-5.3-flash" || !uncertain.usedFallback) throw new Error("uncertain route did not fall back");

  const unavailable = await resolveModelSelection({
    requestedModel: AUTO_FAST,
    feature: "ask",
    input: { message: "Help me" },
    canAccessProModels: false,
    callJevImpl: () => Promise.reject(new Error("provider unavailable")),
  });
  if (unavailable.resolvedModel !== "z-ai/glm-5.3-flash" || !unavailable.usedFallback) throw new Error("failed route did not fall back");
});

Deno.test("Auto Fast ignores a Jev label outside its candidate set", async () => {
  const resolved = await resolveModelSelection({
    requestedModel: AUTO_FAST,
    feature: "generate",
    input: { motion: "Should cities ban cars?" },
    canAccessProModels: false,
    callJevImpl: jevReturning(choiceResult("anthropic/claude-opus-5")),
  });
  if (resolved.resolvedModel !== "z-ai/glm-5.3-flash" || !resolved.usedFallback) throw new Error("unsupported label escaped candidate gate");
});

Deno.test("Auto Pro rejects Basic before calling Jev", async () => {
  const observed = { calls: 0 };
  try {
    await resolveModelSelection({
      requestedModel: AUTO_PRO,
      feature: "generate",
      input: { motion: "Should cities ban cars?" },
      canAccessProModels: false,
      callJevImpl: jevReturning(choiceResult("openai/gpt-5.6-sol"), observed),
    });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("Pro")) throw error;
    if (observed.calls !== 0) throw new Error("Jev ran before Auto Pro entitlement rejection");
    return;
  }
  throw new Error("Basic Auto Pro request was accepted");
});

Deno.test("Auto Pro accepts only its approved smart-model pool", async () => {
  for (const model of ["openai/gpt-5.6-sol", "anthropic/claude-opus-5", "anthropic/claude-sonnet-5"]) {
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
    callJevImpl: jevReturning(choiceResult("meta/muse-spark-1.3")),
  });
  if (outsidePool.resolvedModel !== "anthropic/claude-sonnet-5" || !outsidePool.usedFallback) {
    throw new Error("Auto Pro accepted a model outside its pool");
  }
});

Deno.test("manual model selections bypass Jev", async () => {
  const observed = { calls: 0 };
  const resolved = await resolveModelSelection({
    requestedModel: "google/gemini-3.8-flash",
    feature: "ask",
    input: { message: "Hi" },
    canAccessProModels: false,
    callJevImpl: jevReturning(choiceResult("z-ai/glm-5.3-flash"), observed),
  });
  if (resolved.resolvedModel !== "google/gemini-3.8-flash" || resolved.requestedModel !== "google/gemini-3.8-flash") {
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
    if (!(error instanceof Error) || !error.message.includes("User cancelled routing")) throw error;
    if (JSON.stringify(observed.state).length > 8_200) throw new Error("routing state exceeded its bound");
    return;
  }
  throw new Error("routing cancellation was converted to a fallback");
});
