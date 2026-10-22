// Live generation through the real ai entrypoint: a `stream: true` request
// gets the provider's tokens as events and ends with the same body a plain
// request returns, a repair retry voids the streamed text, failures arrive as
// a result with their status, and streamed usage is still billed.

const environment = {
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  SPARRING_INTEGRITY_SECRET: "test-sparring-secret",
  OPENROUTER_API_KEY: "test-openrouter-key",
};
for (const [key, value] of Object.entries(environment)) Deno.env.set(key, value);

const { handleRequest } = await import("./index.ts");
const { readOpenRouterStream } = await import("./provider.ts");
const { outputTokenLimit, REPLY_TOKEN_CAPS, TRUNCATION_RETRY_FACTOR } = await import("../_shared/output-caps.ts");

const USER = "user-1";
const SESSION = "5e551000-0000-4000-8000-000000000002";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const USAGE = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.000001 };

/** One provider reply: text to stream (or return whole), or an HTTP failure. */
type ProviderReply = { content: string; finishReason?: string } | { status: number };

interface Harness {
  providerBodies: Array<Record<string, unknown>>;
  usageRows: Array<Record<string, unknown>>;
  restore: () => void;
}

function sseBody(content: string, finishReason = "stop"): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const chunks: string[] = [": OPENROUTER PROCESSING\n\n"];
  for (let index = 0; index < content.length; index += 7) {
    chunks.push(`data: ${JSON.stringify({ choices: [{ delta: { content: content.slice(index, index + 7) } }] })}\n\n`);
  }
  chunks.push(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finishReason }] })}\n\n`);
  chunks.push(`data: ${JSON.stringify({ choices: [], usage: USAGE })}\n\n`, "data: [DONE]\n\n");
  return new ReadableStream({
    start(controller) {
      // Split events across reads, as a network does.
      const joined = chunks.join("");
      for (let index = 0; index < joined.length; index += 23) controller.enqueue(encoder.encode(joined.slice(index, index + 23)));
      controller.close();
    },
  });
}

function install(replies: ProviderReply[]): Harness {
  const originalFetch = globalThis.fetch;
  const harness: Harness = { providerBodies: [], usageRows: [], restore: () => { globalThis.fetch = originalFetch; } };
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin === "https://supabase.test") {
      if (url.pathname === "/auth/v1/user") return jsonResponse({ id: USER, aud: "authenticated" });
      if (url.pathname.includes("/rest/v1/user_roles")) return jsonResponse({ role: "user" });
      if (url.pathname.includes("/rest/v1/user_settings")) return jsonResponse({ subscription_tier: "trial", daily_limit_override: 50, trial_ends_at: "2099-01-01T00:00:00.000Z", grace_period_ends_at: null });
      if (url.pathname.includes("/rest/v1/subscriptions")) return jsonResponse([]);
      if (url.pathname.includes("/rest/v1/rate_limits")) {
        if ((url.searchParams.get("order") ?? "").includes("updated_at")) throw new Error(`rate_limits must not order by updated_at: ${url.search}`);
        return jsonResponse({ limit_value: 50 });
      }
      if (/\/rest\/v1\/rpc\/consume_(daily|ai)_quota$/.test(url.pathname)) return jsonResponse([{ allowed: true, current_count: 1 }]);
      if (url.pathname.endsWith("/rest/v1/rpc/claim_ai_session_quota")) return jsonResponse([{ allowed: true, charged: true, units: 1, current_count: 1 }]);
      if (/\/rest\/v1\/rpc\/refund_(daily_quota|ai_session_quota)$/.test(url.pathname)) return jsonResponse(1);
      if (url.pathname.includes("/rest/v1/global_prompts")) return jsonResponse({ prompt_text: null });
      if (url.pathname.includes("/rest/v1/ai_requests")) {
        const row = JSON.parse(String(init?.body));
        harness.usageRows.push(Array.isArray(row) ? row[0] : row);
        return new Response(null, { status: 201 });
      }
      throw new Error(`Unhandled Supabase request: ${url}`);
    }
    if (url.href === "https://openrouter.ai/api/v1/chat/completions") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      harness.providerBodies.push(body);
      const reply = replies[Math.min(harness.providerBodies.length - 1, replies.length - 1)];
      if ("status" in reply) return jsonResponse({ error: { message: "Provider overloaded" } }, reply.status);
      if (body.stream === true) return new Response(sseBody(reply.content, reply.finishReason), { headers: { "Content-Type": "text/event-stream" } });
      return jsonResponse({ choices: [{ message: { content: reply.content }, finish_reason: reply.finishReason ?? "stop" }], usage: USAGE });
    }
    throw new Error(`Unhandled request: ${url}`);
  }) as typeof fetch;
  return harness;
}

const respondInput = {
  sessionId: SESSION,
  motion: "This House would make public transport free",
  userSide: "pro",
  format: "ld",
  difficulty: "medium",
  language: "en",
  action: "respond",
  speeches: [{
    id: "user-1",
    turnId: "ld-1",
    speaker: "user",
    side: "pro",
    role: "Affirmative constructive",
    content: "Free fares remove the price barrier.",
    createdAt: 1_700_000_000_000,
    timeLimitSeconds: 360,
    timeUsedSeconds: 120,
  }],
  currentTurn: { id: "ld-2", label: "Negative constructive", side: "con", kind: "constructive", timeLimitSeconds: 420 },
};

const REPLY = JSON.stringify({
  action: "respond",
  speech: { content: "Free fares sound generous. Who pays for the buses? \"Nobody\" is not an answer.", strategy: "Press the funding gap.", targetedPoints: ["price barrier"] },
});

function aiRequest(stream: boolean): Request {
  return new Request("http://127.0.0.1/functions/v1/ai", {
    method: "POST",
    headers: { Authorization: "Bearer test-user-token", "Content-Type": "application/json" },
    body: JSON.stringify({ model: "openai/gpt-6-luna", feature: "sparring", input: respondInput, ...(stream ? { stream: true } : {}) }),
  });
}

type StreamEvent = { event: string; data: Record<string, unknown> };

async function readEvents(response: Response): Promise<StreamEvent[]> {
  const text = await response.text();
  return text.split("\n\n").flatMap((block) => {
    const event = /^event: (.+)$/m.exec(block)?.[1];
    const data = /^data: (.+)$/m.exec(block)?.[1];
    return event && data ? [{ event, data: JSON.parse(data) }] : [];
  });
}

Deno.test("a streamed request sends tokens as they arrive and ends with the plain request's body", async () => {
  const plainHarness = install([{ content: REPLY }]);
  let plainBody: unknown;
  try {
    const plain = await handleRequest(aiRequest(false));
    plainBody = await plain.json();
    assert(plain.status === 200, `plain status ${plain.status}`);
    assert(plainHarness.providerBodies[0].stream === undefined, "a plain request asked the provider to stream");
  } finally {
    plainHarness.restore();
  }

  const harness = install([{ content: REPLY }]);
  try {
    const response = await handleRequest(aiRequest(true));
    assert(response.status === 200, `stream status ${response.status}`);
    assert(response.headers.get("Content-Type")?.startsWith("text/event-stream"), "not an event stream");
    const events = await readEvents(response);
    assert(harness.providerBodies[0].stream === true, "the provider was not asked to stream");

    const deltas = events.filter((event) => event.event === "delta");
    assert(deltas.length > 5, `expected token-sized deltas, got ${deltas.length}`);
    assert(deltas.map((event) => event.data.text).join("") === REPLY, "the streamed text is not the provider's text");
    assert(events[0].event === "phase" && events[0].data.phase === "writing", "the first event is not the writing phase");

    const results = events.filter((event) => event.event === "result");
    assert(results.length === 1 && events.at(-1)?.event === "result", "the stream must end with exactly one result");
    assert(results[0].data.status === 200, `result status ${results[0].data.status}`);
    assert(JSON.stringify(results[0].data.body) === JSON.stringify(plainBody), "the streamed result differs from the plain body");

    const usage = harness.usageRows.find((row) => row.feature === "sparring");
    assert(usage?.status === "success", "the streamed request was not logged as a success");
    assert(usage.input_tokens === 10 && usage.output_tokens === 5, `streamed usage was not billed: ${JSON.stringify(usage)}`);
  } finally {
    harness.restore();
  }
});

Deno.test("a repair retry voids the streamed text and bills both attempts", async () => {
  const harness = install([{ content: "Sure! Here is the speech: it is not JSON at all" }, { content: REPLY }]);
  try {
    const events = await readEvents(await handleRequest(aiRequest(true)));
    const resetAt = events.findIndex((event) => event.event === "reset");
    assert(resetAt > 0, "no reset event before the retry");
    const after = events.slice(resetAt + 1).filter((event) => event.event === "delta").map((event) => event.data.text).join("");
    assert(after === REPLY, "the text after the reset is not the repaired answer");
    assert(events.at(-1)?.event === "result" && events.at(-1)?.data.status === 200, "the repaired request did not succeed");
    assert(harness.providerBodies.length === 2, "expected one repair retry");
    const usage = harness.usageRows.find((row) => row.feature === "sparring");
    assert(usage?.input_tokens === 20 && usage.output_tokens === 10, `both attempts were not billed: ${JSON.stringify(usage)}`);
  } finally {
    harness.restore();
  }
});

Deno.test("a reply cut off at its cap is retried once with a larger cap and both attempts are billed", async () => {
  const cutOff = { content: REPLY.slice(0, 60), finishReason: "length" };
  // Basic accounts always reason at low effort.
  const firstCap = outputTokenLimit(REPLY_TOKEN_CAPS.sparringSpeech, "low", 128_000);
  const retryCap = outputTokenLimit(REPLY_TOKEN_CAPS.sparringSpeech * TRUNCATION_RETRY_FACTOR, "low", 128_000);
  for (const stream of [false, true]) {
    const harness = install([cutOff, { content: REPLY }]);
    try {
      const response = await handleRequest(aiRequest(stream));
      if (stream) {
        const events = await readEvents(response);
        assert(events.some((event) => event.event === "reset"), "the cut-off text was not voided");
        assert(events.at(-1)?.event === "result" && events.at(-1)?.data.status === 200, "the retried stream did not succeed");
      } else {
        assert(response.status === 200, `the retried request returned ${response.status}`);
      }
      const caps = harness.providerBodies.map((body) => body.max_tokens);
      assert(caps.length === 2 && caps[0] === firstCap && caps[1] === retryCap, `unexpected caps: ${JSON.stringify(caps)}`);
      const usage = harness.usageRows.find((row) => row.feature === "sparring");
      assert(usage?.input_tokens === 20 && usage.output_tokens === 10, `both attempts were not billed: ${JSON.stringify(usage)}`);
    } finally {
      harness.restore();
    }
  }

  // A second cut-off fails the request instead of retrying again.
  const harness = install([cutOff, cutOff, { content: REPLY }]);
  try {
    const response = await handleRequest(aiRequest(false));
    assert(response.status >= 500, `a twice cut-off reply returned ${response.status}`);
    assert(harness.providerBodies.length === 2, `expected one retry, got ${harness.providerBodies.length - 1}`);
  } finally {
    harness.restore();
  }
});

Deno.test("a provider failure ends the stream with the same error a plain request returns", async () => {
  const harness = install([{ status: 503 }]);
  try {
    const response = await handleRequest(aiRequest(true));
    assert(response.status === 200, "the stream itself opened");
    const events = await readEvents(response);
    const result = events.at(-1);
    assert(result?.event === "result" && result.data.status === 500, `expected a 500 result, got ${JSON.stringify(result)}`);
    const body = result.data.body as { error?: unknown; code?: unknown };
    assert(body.code === "provider_error", `expected the provider_error code, got ${JSON.stringify(body)}`);
    assert(!String(body.error).includes("OpenRouter"), "the provider's error text reached the client");
    assert(harness.usageRows.some((row) => row.feature === "sparring" && row.status === "error"), "the failure was not logged");
  } finally {
    harness.restore();
  }
});

Deno.test("checks before the feature still answer with plain JSON and their status", async () => {
  const harness = install([{ content: REPLY }]);
  try {
    const request = new Request("http://127.0.0.1/functions/v1/ai", {
      method: "POST",
      headers: { Authorization: "Bearer test-user-token", "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openai/gpt-6-luna", feature: "sparring", input: { ...respondInput, action: "nonsense" }, stream: true }),
    });
    const response = await handleRequest(request);
    assert(response.status === 400, `expected 400, got ${response.status}`);
    assert(response.headers.get("Content-Type")?.includes("application/json"), "a rejected request was streamed");
    assert(harness.providerBodies.length === 0, "the provider was called for an invalid request");
  } finally {
    harness.restore();
  }
});

Deno.test("frame overhead does not count against the answer's size cap", async () => {
  // OpenRouter repeats ids, model, and provider in every token's frame, so a
  // long but ordinary answer streams several times its own size.
  const padding = "x".repeat(700);
  const encoder = new TextEncoder();
  const tokens = 2_000;
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent === tokens) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: USAGE })}\n\ndata: [DONE]\n\n`));
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ id: padding, choices: [{ delta: { content: "word " } }] })}\n\n`));
      sent += 1;
    },
  });
  const ignore = { delta: () => {}, reset: () => {}, phase: () => {} };
  const { text } = await readOpenRouterStream(body, ignore, new AbortController().signal);
  assert(text.length === tokens * 5, `the answer was cut: ${text.length}`);
});
