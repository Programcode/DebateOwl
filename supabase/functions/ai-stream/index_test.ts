function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

for (const [key, value] of Object.entries({
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  OPENROUTER_API_KEY: "test-openrouter-key",
})) Deno.env.set(key, value);

const { handleRequest } = await import("./index.ts");

type Scenario = "complete" | "audit-error" | "truncated" | "cut-off" | "cut-off-empty" | "provider-error" | "provider-error-after-finish" | "aborted" | "aborted-after-finish";

const usage = {
  prompt_tokens: 12,
  completion_tokens: 7,
  total_tokens: 19,
  cost: 0.0019,
};

function request(signal?: AbortSignal): Request {
  return new Request("http://127.0.0.1/functions/v1/ai-stream", {
    method: "POST",
    signal,
    headers: { Authorization: "Bearer test-user-token", "Content-Type": "application/json" },
    body: JSON.stringify({
      feature: "ask",
      model: "openai/gpt-6-luna",
      input: { message: "Hello", mode: "general" },
    }),
  });
}

function framesFor(scenario: Exclude<Scenario, "aborted">): string {
  const usageFrame = `data: ${JSON.stringify({ choices: [], usage })}\n\n`;
  if (scenario === "complete" || scenario === "audit-error") {
    return [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Hello" } }] })}\n\n`,
      usageFrame,
      "data: [DONE]\n\n",
    ].join("");
  }
  if (scenario === "truncated") {
    return [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Partial" } }] })}\n\n`,
      usageFrame,
    ].join("");
  }
  // Stopped at max_tokens: after some text, or after reasoning only.
  if (scenario === "cut-off" || scenario === "cut-off-empty") {
    return [
      ...(scenario === "cut-off" ? [`data: ${JSON.stringify({ choices: [{ delta: { content: "Partial" } }] })}\n\n`] : []),
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "length" }] })}\n\n`,
      usageFrame,
      "data: [DONE]\n\n",
    ].join("");
  }
  if (scenario === "provider-error-after-finish") {
    return [
      usageFrame,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
      `data: ${JSON.stringify({ error: { message: "provider exploded" } })}\n\n`,
    ].join("");
  }
  return [
    usageFrame,
    `data: ${JSON.stringify({ error: { message: "provider exploded" } })}\n\n`,
  ].join("");
}

async function runScenario(scenario: Scenario) {
  const rows: Array<Record<string, unknown>> = [];
  let providerCalls = 0;
  let providerStartedResolve = () => {};
  const providerStarted = new Promise<void>((resolve) => providerStartedResolve = resolve);
  const originalFetch = globalThis.fetch;
  const encoder = new TextEncoder();

  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));

    if (url.origin === "https://supabase.test") {
      if (url.pathname === "/auth/v1/user") return jsonResponse({ id: "user-1", aud: "authenticated" });
      if (url.pathname.includes("/rest/v1/user_roles")) return jsonResponse({ role: "user" });
      if (url.pathname.includes("/rest/v1/user_settings")) {
        return jsonResponse({
          subscription_tier: "trial",
          daily_limit_override: 50,
          trial_ends_at: "2099-01-01T00:00:00.000Z",
          grace_period_ends_at: null,
        });
      }
      if (url.pathname.endsWith("/rest/v1/app_store_subscriptions")) return Response.json([]);
      if (url.pathname.includes("/rest/v1/subscriptions")) return Response.json([]);
      if (url.pathname.includes("/rest/v1/rate_limits")) {
        if ((url.searchParams.get("order") ?? "").includes("updated_at")) throw new Error(`rate_limits must not order by updated_at: ${url.search}`);
        return jsonResponse({ limit_value: 50 });
      }
      if (/\/rest\/v1\/rpc\/consume_(daily|ai)_quota$/.test(url.pathname)) {
        return jsonResponse([{ allowed: true, current_count: 1 }]);
      }
      if (url.pathname.includes("/rest/v1/ai_requests")) {
        rows.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
        return scenario === "audit-error"
          ? jsonResponse({ code: "PGRST204", message: "Missing audit column" }, 400)
          : new Response(null, { status: 201 });
      }
      throw new Error(`Unexpected Supabase request: ${url}`);
    }

    if (url.href !== "https://openrouter.ai/api/v1/chat/completions") {
      throw new Error(`Unexpected request: ${url}`);
    }
    providerCalls += 1;
    if (scenario !== "aborted" && scenario !== "aborted-after-finish") {
      return new Response(framesFor(scenario), { headers: { "Content-Type": "text/event-stream" } });
    }

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "Partial" } }] })}\n\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [], usage })}\n\n`));
        if (scenario === "aborted-after-finish") {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`));
        }
        providerStartedResolve();
        init?.signal?.addEventListener("abort", () => {
          if (scenario === "aborted-after-finish") controller.close();
          else controller.error(new DOMException("Upstream aborted", "AbortError"));
        }, { once: true });
      },
      pull() {
        return new Promise<void>(() => {});
      },
    });
    return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
  }) as typeof fetch;

  try {
    const caller = new AbortController();
    const response = await handleRequest(request(caller.signal));
    const bodyPromise = response.text();
    if (scenario === "aborted" || scenario === "aborted-after-finish") {
      await providerStarted;
      if (scenario === "aborted-after-finish") {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      caller.abort();
    }
    return { body: await bodyPromise, providerCalls, rows };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

Deno.test("OpenRouter stream accounting bills only completed work", async () => {
  for (const scenario of ["complete", "audit-error", "cut-off", "truncated", "cut-off-empty", "provider-error", "provider-error-after-finish", "aborted", "aborted-after-finish"] as const) {
    const result = await runScenario(scenario);
    if (result.providerCalls !== 1) throw new Error(`${scenario}: expected one provider call, got ${result.providerCalls}`);
    if (result.rows.length !== 1) throw new Error(`${scenario}: expected one audit insert, got ${result.rows.length}`);

    const row = result.rows[0];
    if (row.provider !== "openrouter") throw new Error(`${scenario}: wrong provider ${String(row.provider)}`);
    if (row.input_tokens !== usage.prompt_tokens || row.output_tokens !== usage.completion_tokens) {
      throw new Error(`${scenario}: observed token counts were lost: ${JSON.stringify(row)}`);
    }
    const rawUsage = row.raw_usage as Record<string, unknown> | null;
    if (rawUsage?.prompt_tokens !== usage.prompt_tokens || rawUsage?.completion_tokens !== usage.completion_tokens) {
      throw new Error(`${scenario}: raw provider usage was lost: ${JSON.stringify(row)}`);
    }

    if (scenario === "complete" || scenario === "audit-error" || scenario === "cut-off") {
      if (row.status !== "success" || row.cost_usd !== usage.cost || !result.body.includes("event: final")) {
        throw new Error(`complete stream was not billed: ${JSON.stringify(row)}\n${result.body}`);
      }
      // A partial answer is kept and flagged; a full one is not.
      if (result.body.includes('"replyTruncated":true') !== (scenario === "cut-off")) {
        throw new Error(`${scenario}: wrong cut-off flag\n${result.body}`);
      }
      continue;
    }

    const expectedStatus = scenario === "aborted" || scenario === "aborted-after-finish" ? "cancelled" : "error";
    if (row.status !== expectedStatus || row.cost_usd !== null || result.body.includes("event: final")) {
      throw new Error(`${scenario} stream was billed or completed: ${JSON.stringify(row)}\n${result.body}`);
    }
    if (scenario !== "aborted" && scenario !== "aborted-after-finish" && !result.body.includes("event: error")) {
      throw new Error(`${scenario} stream did not emit an SSE error: ${result.body}`);
    }
  }
});
