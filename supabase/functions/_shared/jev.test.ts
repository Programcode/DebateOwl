import {
  callJev,
  type JevQuestion,
} from "./jev.ts";

const QUESTIONS = {
  directness: {
    type: "choice",
    instructions: "How directly does the answer address the question?",
    criteria: {
      direct: "Fully answers it",
      partial: "Answers only part",
      evasive: "Avoids it",
    },
  },
  concession: {
    type: "noul",
    instructions: "Does the answer concede the challenged claim?",
    criteria: { true: "Concedes it", false: "Does not concede it" },
  },
  strength: {
    type: "score",
    instructions: "How strong is the evidence?",
    criteria: ["Weak", "Useful", "Decisive"],
  },
} as const satisfies Record<string, JevQuestion>;

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function validResponse() {
  return {
    model: "typesafe/jev-1.13",
    answers: {
      directness: {
        type: "choice",
        choice: "direct",
        confidence: 0.91,
        probabilities: { direct: 0.91, partial: 0.07, evasive: 0.02 },
      },
      concession: { type: "noul", noul: 0.12 },
      strength: {
        type: "score",
        score: 1.6,
        confidence: 0.84,
        probabilities: { "0": 0.05, "1": 0.3, "2": 0.65 },
        legend: { "0": "Weak", "1": "Useful", "2": "Decisive" },
      },
    },
    usage: { input_tokens: 41, output_tokens: 0, cost: 0.00000172 },
  };
}

async function rejectsWith(operation: () => Promise<unknown>, expected: string): Promise<void> {
  try {
    await operation();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(expected)) throw new Error(`expected ${JSON.stringify(expected)} in ${JSON.stringify(message)}`);
    return;
  }
  throw new Error(`expected rejection containing ${JSON.stringify(expected)}`);
}

Deno.test("Jev sends the pinned model and parses typed answers", async () => {
  let capturedUrl = "";
  let capturedBody: Record<string, unknown> = {};
  let authorization = "";
  const fetchImpl: typeof fetch = (input, init) => {
    capturedUrl = String(input);
    capturedBody = JSON.parse(String(init?.body));
    authorization = new Headers(init?.headers).get("Authorization") ?? "";
    return Promise.resolve(jsonResponse(validResponse()));
  };

  const result = await callJev({
    state: { feature: "crossfire", text: "Question and answer" },
    questions: QUESTIONS,
    apiKey: "test-openrouter-key",
    fetchImpl,
  });

  if (capturedUrl !== "https://openrouter.ai/api/alpha/decisions") throw new Error(`unexpected URL: ${capturedUrl}`);
  if (capturedBody.model !== "typesafe/jev-1.13") throw new Error(`unexpected model: ${String(capturedBody.model)}`);
  if (authorization !== "Bearer test-openrouter-key") throw new Error("authorization header missing");
  if (result.answers.directness.type !== "choice" || result.answers.directness.choice !== "direct") {
    throw new Error("choice answer was not parsed");
  }
  if (result.answers.concession.type !== "noul" || result.answers.concession.noul !== 0.12) {
    throw new Error("noul answer was not parsed");
  }
  if (result.answers.strength.type !== "score" || result.answers.strength.score !== 1.6) {
    throw new Error("score answer was not parsed");
  }
  if (result.model !== "typesafe/jev-1.13") throw new Error("returned model missing");
  if (result.usage?.inputTokens !== 41 || result.usage.reportedCostUsd !== 0.00000172) {
    throw new Error(`usage was not normalized: ${JSON.stringify(result.usage)}`);
  }
});

Deno.test("Jev rejects a choice outside the submitted labels", async () => {
  const response = validResponse();
  response.answers.directness.choice = "invented";
  await rejectsWith(() => callJev({
    state: "state",
    questions: QUESTIONS,
    apiKey: "test-key",
    fetchImpl: () => Promise.resolve(jsonResponse(response)),
  }), "directness");
});

Deno.test("Jev rejects probabilities outside zero to one", async () => {
  const response = validResponse();
  response.answers.directness.probabilities.direct = 1.2;
  await rejectsWith(() => callJev({
    state: "state",
    questions: QUESTIONS,
    apiKey: "test-key",
    fetchImpl: () => Promise.resolve(jsonResponse(response)),
  }), "directness");
});

Deno.test("Jev rejects a score outside the submitted rubric", async () => {
  const response = validResponse();
  response.answers.strength.score = 3;
  await rejectsWith(() => callJev({
    state: "state",
    questions: QUESTIONS,
    apiKey: "test-key",
    fetchImpl: () => Promise.resolve(jsonResponse(response)),
  }), "strength");
});

Deno.test("Jev rejects a response missing a submitted answer", async () => {
  const response = validResponse();
  delete (response.answers as Record<string, unknown>).concession;
  await rejectsWith(() => callJev({
    state: "state",
    questions: QUESTIONS,
    apiKey: "test-key",
    fetchImpl: () => Promise.resolve(jsonResponse(response)),
  }), "concession");
});

Deno.test("Jev bounds successful response bodies", async () => {
  const oversized = "x".repeat(1_048_577);
  await rejectsWith(() => callJev({
    state: "state",
    questions: QUESTIONS,
    apiKey: "test-key",
    fetchImpl: () => Promise.resolve(new Response(oversized, { status: 200 })),
  }), "1048576");
});

Deno.test("Jev reports bounded provider errors", async () => {
  await rejectsWith(() => callJev({
    state: "state",
    questions: QUESTIONS,
    apiKey: "test-key",
    fetchImpl: () => Promise.resolve(new Response("provider unavailable", { status: 503 })),
  }), "503");
});

Deno.test("Jev timeout aborts an in-flight fetch", async () => {
  let observedAbort = false;
  const fetchImpl: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
    const onAbort = () => {
      observedAbort = true;
      reject(init?.signal?.reason ?? new DOMException("Aborted", "AbortError"));
    };
    if (init?.signal?.aborted) onAbort();
    else init?.signal?.addEventListener("abort", onAbort, { once: true });
  });

  await rejectsWith(() => callJev({
    state: "state",
    questions: QUESTIONS,
    apiKey: "test-key",
    fetchImpl,
    timeoutMs: 5,
  }), "timed out");
  if (!observedAbort) throw new Error("timeout did not abort fetch");
});

Deno.test("Jev propagates caller cancellation", async () => {
  const controller = new AbortController();
  const fetchImpl: typeof fetch = (_input, init) => new Promise((_resolve, reject) => {
    const onAbort = () => reject(init?.signal?.reason ?? new DOMException("Aborted", "AbortError"));
    if (init?.signal?.aborted) onAbort();
    else init?.signal?.addEventListener("abort", onAbort, { once: true });
  });
  const pending = callJev({
    state: "state",
    questions: QUESTIONS,
    apiKey: "test-key",
    fetchImpl,
    signal: controller.signal,
  });
  controller.abort(new DOMException("User cancelled", "AbortError"));
  await rejectsWith(() => pending, "User cancelled");
});
