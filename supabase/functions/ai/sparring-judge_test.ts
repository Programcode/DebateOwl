// The Sparring judge retries once inside the request when its first attempt
// gave no scorecard for a reason another try can fix, bills both attempts in
// one usage row, voids the first attempt's streamed draft, and does not
// retry a failure a retry cannot fix (the key's credit).

import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.19";

for (const [key, value] of Object.entries({
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  SPARRING_INTEGRITY_SECRET: "test-sparring-secret",
  OPENROUTER_API_KEY: "test-openrouter-key",
})) Deno.env.set(key, value);

const { handleSparring } = await import("./features/sparring.ts");
const { narrowSparringDatabase } = await import("./runtime.ts");
type FeatureContext = import("./features/types.ts").FeatureContext;
type SparringRequest = import("./sparring-persistence.ts").SparringRequest;

const MODEL = "anthropic/claude-sonnet-5.5";
const SCORECARD = JSON.stringify({
  action: "score",
  scorecard: {
    userScore: 1,
    aiScore: 1,
    categories: [
      { name: "Logic", userScore: 20, aiScore: 10, feedback: "Logic feedback" },
      { name: "Evidence", userScore: 20, aiScore: 15, feedback: "Evidence feedback" },
      { name: "Delivery", userScore: 20, aiScore: 14, feedback: "Delivery feedback" },
      { name: "Strategy", userScore: 20, aiScore: 13, feedback: "Strategy feedback" },
    ],
    overallFeedback: "The user controlled the comparison.",
  },
  keyMoments: ["The first clash"],
  improvementAreas: ["Make the warrant explicit"],
  winner: "user",
  verdict: "User edge",
});

const request = {
  action: "score",
  sessionId: "00000000-0000-4000-8000-000000000031",
  motion: "This house would regulate social media algorithms",
  userSide: "pro",
  format: "ld",
  difficulty: "medium",
  language: "en",
  speeches: [{
    id: "speech-1",
    turnId: "ld-1",
    speaker: "user",
    side: "pro",
    role: "Affirmative constructive",
    content: "Algorithms shape what people believe.",
    createdAt: 1,
    timeLimitSeconds: 360,
    timeUsedSeconds: 20,
  }],
} as unknown as SparringRequest;

type Reply = { content: string } | { status: number };

function install(replies: Reply[]) {
  const calls: Array<Record<string, unknown>> = [];
  const usageRows: Array<Record<string, unknown>> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.pathname.endsWith("/rest/v1/ai_requests")) {
      usageRows.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 201 });
    }
    if (url.href === "https://openrouter.ai/api/v1/chat/completions") {
      calls.push(JSON.parse(String(init?.body)));
      const reply = replies[Math.min(calls.length - 1, replies.length - 1)];
      if ("status" in reply) return Response.json({ error: { message: "upstream" } }, { status: reply.status });
      if (calls.at(-1)?.stream === true) {
        const frames = [
          { choices: [{ delta: { content: reply.content }, finish_reason: "stop" }] },
          { choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 } },
        ];
        return new Response(`${frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("")}data: [DONE]\n\n`, { headers: { "Content-Type": "text/event-stream" } });
      }
      return Response.json({ choices: [{ message: { content: reply.content }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 } });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;
  return { calls, usageRows, restore: () => { globalThis.fetch = originalFetch; } };
}

function context(events: string[]): FeatureContext {
  return {
    req: new Request("http://127.0.0.1/functions/v1/ai"),
    userId: "user-1",
    provider: "openrouter",
    model: MODEL,
    reasoningEffort: "low",
    workSignal: new AbortController().signal,
    voice: false,
    stream: { delta: () => {}, reset: () => events.push("reset"), phase: () => {} },
    input: {},
    sources: [],
    sourceAssessments: [],
    sourceDecisionCandidates: [],
    researchDeps: {} as FeatureContext["researchDeps"],
    startTime: Date.now(),
    researchUsageForLog: () => [],
    recordMainResult: (result) => result,
    buildSystemPromptFor: () => Promise.resolve("system"),
    markTruncated: () => {},
    respond: (payload) => Promise.resolve(Response.json(payload)),
  };
}

const savedScorecards: unknown[] = [];
const database = narrowSparringDatabase({
  from: () => {
    const query = {
      update: (row: Record<string, unknown>) => {
        savedScorecards.push(row.final_evaluation);
        return query;
      },
      eq: () => query,
      select: () => query,
      maybeSingle: () => Promise.resolve({ data: { id: request.sessionId }, error: null }),
    };
    return query;
  },
});

const options = { request, database, claimToken: "claim-token", onScoreSaved: () => {} };

Deno.test("the judge tries once more after a scorecard that fails the schema, and bills both attempts", async () => {
  const harness = install([{ content: JSON.stringify({ action: "score", scorecard: {} }) }, { content: SCORECARD }]);
  const events: string[] = [];
  savedScorecards.length = 0;
  const originalWarn = console.warn;
  console.warn = () => undefined;
  try {
    const response = await handleSparring(context(events), options);
    assertEquals(response.status, 200);
    assertEquals(harness.calls.length, 2);
    assertEquals(events, ["reset"], "the first attempt's draft was not voided");
    assertEquals(savedScorecards.length, 1);
    assertEquals(harness.usageRows.length, 1, "exactly one usage row for the run");
    assertEquals([harness.usageRows[0].input_tokens, harness.usageRows[0].output_tokens], [20, 10]);
  } finally {
    console.warn = originalWarn;
    harness.restore();
  }
});

Deno.test("a provider outage gets the retry; an exhausted key does not", async () => {
  const originalError = console.error;
  const originalWarn = console.warn;
  console.error = () => undefined;
  console.warn = () => undefined;
  try {
    const outage = install([{ status: 503 }, { content: SCORECARD }]);
    try {
      assertEquals((await handleSparring(context([]), options)).status, 200);
      assertEquals(outage.calls.length, 2);
    } finally {
      outage.restore();
    }

    const noCredit = install([{ status: 402 }, { content: SCORECARD }]);
    try {
      await assertRejects(() => handleSparring(context([]), options));
      assertEquals(noCredit.calls.length, 1, "a key out of credit was retried");
    } finally {
      noCredit.restore();
    }
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
});
