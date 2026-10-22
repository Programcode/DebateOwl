// Session charging and refunds through the real ai entrypoint: a Crossfire or
// Sparring round reserves quota through the session ledger, a call that runs
// on a session that already paid is never refunded, a run cancelled before
// the student saw a usable answer is refunded, and one that streamed a real
// answer is not. The ledger's SQL is covered by supabase/tests/ai_quota_sessions_test.sql.

import { assertEquals } from "jsr:@std/assert@1.0.19";

for (const [key, value] of Object.entries({
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  SPARRING_INTEGRITY_SECRET: "test-sparring-secret",
  OPENROUTER_API_KEY: "test-openrouter-key",
})) Deno.env.set(key, value);

const { handleRequest } = await import("./index.ts");
const { REFUND_MAX_DELIVERED_CHARS } = await import("../_shared/usage-limits.ts");

const SPARRING_SESSION = "5e551000-0000-4000-8000-000000000009";

interface Harness {
  rpcs: Array<{ name: string; body: Record<string, unknown> }>;
  usageRows: Array<Record<string, unknown>>;
  /** What claim_ai_session_quota answers. */
  claim: Record<string, unknown>;
  /** The provider's reply: text, an HTTP failure, or text then a stream that never ends. */
  reply: { content: string } | { status: number } | { hangAfter: string };
}

const harness: Harness = { rpcs: [], usageRows: [], claim: {}, reply: { content: "" } };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function hangingStream(text: string, signal: AbortSignal | null | undefined): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (let index = 0; index < text.length; index += 20) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text.slice(index, index + 20) } }] })}\n\n`));
      }
      // The model keeps "thinking" until the request is cancelled.
      signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true });
    },
  });
}

const originalFetch = globalThis.fetch;
function install() {
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin === "https://supabase.test") {
      if (url.pathname === "/auth/v1/user") return json({ id: "user-1", aud: "authenticated" });
      if (url.pathname.endsWith("/user_roles")) return json({ role: "user" });
      if (url.pathname.endsWith("/user_settings")) return json({ subscription_tier: "trial", daily_limit_override: null, trial_ends_at: "2099-01-01T00:00:00.000Z", grace_period_ends_at: null });
      if (url.pathname.endsWith("/subscriptions")) return json([]);
      if (url.pathname.endsWith("/rate_limits")) return json(null);
      if (url.pathname.endsWith("/global_prompts")) return json({ prompt_text: null });
      if (url.pathname.includes("/rest/v1/rpc/")) {
        const name = url.pathname.split("/").at(-1)!;
        harness.rpcs.push({ name, body: JSON.parse(String(init?.body ?? "{}")) });
        if (name === "consume_ai_quota") return json([{ allowed: true, current_count: 1, denied_by: null }]);
        if (name === "claim_ai_session_quota") return json([harness.claim]);
        if (name === "refund_daily_quota") return json(0);
        if (name === "refund_ai_session_quota") return json(1);
        if (name === "peek_ai_quota") return json([{ current_count: 3, week_spend_usd: 0 }]);
        if (name === "sparring_request_started_at") return json(new Date().toISOString());
      }
      if (url.pathname.endsWith("/ai_requests")) {
        harness.usageRows.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 201 });
      }
      throw new Error(`Unexpected Supabase request: ${url}`);
    }
    if (url.href === "https://openrouter.ai/api/v1/chat/completions") {
      const body = JSON.parse(String(init?.body));
      const reply = harness.reply;
      if ("status" in reply) return json({ error: { message: "Provider overloaded" } }, reply.status);
      if ("hangAfter" in reply) return new Response(hangingStream(reply.hangAfter, init?.signal), { headers: { "Content-Type": "text/event-stream" } });
      if (body.stream) {
        const usage = { prompt_tokens: 10, completion_tokens: 5, cost: 0.000001 };
        return new Response(
          `data: ${JSON.stringify({ choices: [{ delta: { content: reply.content }, finish_reason: "stop" }] })}\n\ndata: ${JSON.stringify({ choices: [], usage })}\n\ndata: [DONE]\n\n`,
          { headers: { "Content-Type": "text/event-stream" } },
        );
      }
      return json({ choices: [{ message: { content: reply.content }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.000001 } });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;
}

function reset(reply: Harness["reply"], claim: Record<string, unknown> = { allowed: true, charged: true, units: 1, current_count: 1, denied_by: null }) {
  harness.rpcs.length = 0;
  harness.usageRows.length = 0;
  harness.reply = reply;
  harness.claim = claim;
}

const rpcNames = () => harness.rpcs.map((call) => call.name).filter((name) => name !== "sparring_request_started_at");

function send(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
  return handleRequest(new Request("http://127.0.0.1/functions/v1/ai", {
    method: "POST",
    headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
    body: JSON.stringify({ model: "openai/gpt-6-luna", ...body }),
    signal,
  }));
}

const crossfireInput = {
  operation: "next-turn",
  config: {
    resolution: "This House would ban homework",
    argument: "Homework widens gaps between students with and without support at home.",
    mode: "ai-questions-user",
    style: "cooperative",
    durationSeconds: 180,
    useSourceLibrary: false,
    seedQuestions: [],
  },
  transcript: [],
  expectedReply: "question",
  language: "en",
};
const CROSSFIRE_REPLY = JSON.stringify({ type: "question", text: "Who checks that the gap closes without homework?" });

const sparringInput = {
  action: "respond",
  sessionId: SPARRING_SESSION,
  motion: "This House would make public transport free",
  userSide: "pro",
  format: "ld",
  difficulty: "medium",
  language: "en",
  speeches: [{
    id: "user-1", turnId: "ld-1", speaker: "user", side: "pro", role: "Affirmative constructive",
    content: "Free fares remove the price barrier.", createdAt: 1_700_000_000_000, timeLimitSeconds: 360, timeUsedSeconds: 120,
  }],
  currentTurn: { id: "ld-2", label: "Negative constructive", side: "con", kind: "constructive", timeLimitSeconds: 420 },
};
const SPARRING_REPLY = JSON.stringify({
  action: "respond",
  speech: { content: "Who pays for the buses?", strategy: "Press the funding gap.", targetedPoints: ["price barrier"] },
});

Deno.test("a Crossfire round with a session id is charged through the session ledger", async () => {
  install();
  try {
    reset({ content: CROSSFIRE_REPLY });
    const response = await send({ feature: "crossfire", input: crossfireInput, quotaSession: "crossfire-1700000000000" });
    assertEquals(response.status, 200);
    assertEquals(rpcNames(), ["claim_ai_session_quota"]);
    const claim = harness.rpcs[0].body;
    assertEquals([claim.p_feature, claim.p_session_key, claim.p_units, claim.p_limit], ["crossfire", "crossfire-1700000000000", 1, 5]);

    // An older client without a session id pays per call, as before.
    reset({ content: CROSSFIRE_REPLY });
    assertEquals((await send({ feature: "crossfire", input: crossfireInput })).status, 200);
    assertEquals(rpcNames(), ["consume_ai_quota"]);

    // A malformed id is refused before anything is reserved.
    reset({ content: CROSSFIRE_REPLY });
    assertEquals((await send({ feature: "crossfire", input: crossfireInput, quotaSession: "bad id with spaces" })).status, 400);
    assertEquals(rpcNames(), []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("a Sparring round is charged per round by its own session id", async () => {
  install();
  try {
    reset({ content: SPARRING_REPLY });
    assertEquals((await send({ feature: "sparring", input: sparringInput })).status, 200);
    assertEquals(rpcNames(), ["claim_ai_session_quota"]);
    assertEquals([harness.rpcs.at(-1)!.body.p_feature, harness.rpcs.at(-1)!.body.p_session_key], ["sparring", SPARRING_SESSION]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("a failed call refunds the session only when it was the call that paid", async () => {
  const originalError = console.error;
  console.error = () => undefined;
  install();
  try {
    // The opening call paid and failed: the session gives its units back.
    reset({ status: 500 });
    const paid = await send({ feature: "sparring", input: sparringInput });
    assertEquals(paid.status, 500);
    assertEquals((await paid.json()).charged, false);
    assertEquals(rpcNames(), ["claim_ai_session_quota", "refund_ai_session_quota"]);

    // A later call ran on a session that had already paid: nothing to give back,
    // and the student was not charged for it either.
    reset({ status: 500 }, { allowed: true, charged: false, units: 0, current_count: 1, denied_by: null });
    const free = await send({ feature: "sparring", input: sparringInput });
    assertEquals(free.status, 500);
    assertEquals((await free.json()).charged, false);
    assertEquals(rpcNames(), ["claim_ai_session_quota"]);
    assertEquals(harness.usageRows.at(-1)?.error_code, "provider_error");
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});

Deno.test("a streamed run the browser cancels is refunded only before a usable answer", async () => {
  const originalError = console.error;
  console.error = () => undefined;
  install();
  try {
    for (const [label, delivered, refunded] of [
      ["cancelled after a few characters", 40, true],
      ["cancelled after a real answer", REFUND_MAX_DELIVERED_CHARS + 60, false],
    ] as const) {
      reset({ hangAfter: `{"response":"${"x".repeat(delivered)}` });
      const controller = new AbortController();
      const response = await send({ feature: "ask", input: { message: "A question", mode: "general", webSearch: false }, stream: true }, controller.signal);
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let seen = "";
      while (!seen.includes(`${"x".repeat(delivered)}`)) {
        const { value, done } = await reader.read();
        if (done) break;
        seen += decoder.decode(value, { stream: true }).replace(/event: delta\ndata: \{"text":"(.*)"\}\n\n/g, "$1");
      }
      // Reload or close the tab mid-answer.
      await reader.cancel();
      for (let wait = 0; wait < 50 && harness.usageRows.length === 0; wait += 1) await new Promise((resolve) => setTimeout(resolve, 10));
      assertEquals(rpcNames(), refunded ? ["consume_ai_quota", "refund_daily_quota"] : ["consume_ai_quota"], label);
      assertEquals([harness.usageRows.at(-1)?.status, harness.usageRows.at(-1)?.error_code], ["cancelled", "aborted"], label);
    }
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
  }
});

Deno.test("a quota check reports a round's cost and what is left without reserving", async () => {
  install();
  try {
    reset({ content: "" });
    const response = await send({ feature: "sparring", quotaCheck: true });
    assertEquals(response.status, 200);
    assertEquals((await response.json()).quota, { allowed: true, limit: 5, current: 3, units: 1 });
    assertEquals(rpcNames(), ["peek_ai_quota"]);

    // A model the plan cannot use is refused with a code the page can translate.
    reset({ content: "" });
    const { quota } = await (await send({ feature: "crossfire", quotaCheck: true, model: "deepseek/deepseek-v4-pro-0813" })).json();
    assertEquals([quota.allowed, quota.code, quota.units], [false, "upgrade_required", 2]);
    assertEquals(rpcNames(), []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
