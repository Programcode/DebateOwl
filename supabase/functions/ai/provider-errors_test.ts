import { assertEquals } from "jsr:@std/assert@1.0.19";
for (const [key, value] of Object.entries({
  SUPABASE_URL: "https://supabase.test", SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-key", OPENROUTER_API_KEY: "test-provider-key",
})) Deno.env.set(key, value);
const { handleRequest: ai } = await import("./index.ts");
const { handleRequest: stream } = await import("../ai-stream/index.ts");

Deno.test("AI JSON and SSE failures never expose provider response bodies", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Request | URL | string) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin === "https://supabase.test") {
      if (url.pathname === "/auth/v1/user") return Response.json({ id: "user-1", aud: "authenticated" });
      if (url.pathname.endsWith("/user_roles")) return Response.json({ role: "user" });
      if (url.pathname.endsWith("/user_settings")) return Response.json({ subscription_tier: "trial", daily_limit_override: 50, trial_ends_at: "2099-01-01", grace_period_ends_at: null });
      if (url.pathname.endsWith("/subscriptions")) return Response.json([]);
      if (url.pathname.endsWith("/rate_limits")) return Response.json({ limit_value: 50 });
      if (url.pathname.endsWith("/global_prompts")) return Response.json({ prompt_text: null });
      if (url.pathname.endsWith("/consume_daily_quota")) return Response.json([{ allowed: true, current_count: 1 }]);
      if (url.pathname.endsWith("/ai_requests")) return new Response(null, { status: 201 });
    }
    if (url.href === "https://openrouter.ai/api/v1/chat/completions") return new Response("PRIVATE_PROVIDER_BODY", { status: 400 });
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;
  try {
    for (const [handle, status, expected] of [
      [ai, 500, "AI request failed. Please try again."],
      [stream, 200, "AI streaming failed. Please try again."],
    ] as const) {
      const response = await handle(new Request("http://127.0.0.1/functions/v1/ai", {
        method: "POST", headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
        body: JSON.stringify({ feature: "ask", model: "openai/gpt-6-luna", input: { message: "A question", mode: "general", webSearch: false } }),
      }));
      assertEquals(response.status, status);
      const text = await response.text();
      assertEquals(text.includes("PRIVATE_PROVIDER_BODY"), false);
      assertEquals(text.includes(expected), true);
      assertEquals(text.includes('"code":"provider_error"'), true);
    }
  } finally { globalThis.fetch = originalFetch; }
});

Deno.test("a refused Claude call is not retried elsewhere, shows an outage, and gives the request back", async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  let failure: "http" | "chunk" | "chunk-after-text" = "http";
  let refunds = 0;
  const usageRows: Array<Record<string, unknown>> = [];
  const providerBodies: Array<Record<string, unknown>> = [];
  console.warn = () => undefined;
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin === "https://supabase.test") {
      if (url.pathname === "/auth/v1/user") return Response.json({ id: "user-1", aud: "authenticated" });
      if (url.pathname.endsWith("/user_roles")) return Response.json({ role: "user" });
      if (url.pathname.endsWith("/user_settings")) return Response.json({ subscription_tier: "trial", daily_limit_override: 50, trial_ends_at: "2099-01-01", grace_period_ends_at: null });
      if (url.pathname.endsWith("/subscriptions")) return Response.json([]);
      if (url.pathname.endsWith("/rate_limits")) return Response.json({ limit_value: 50 });
      if (url.pathname.endsWith("/global_prompts")) return Response.json({ prompt_text: null });
      if (url.pathname.endsWith("/consume_daily_quota")) return Response.json([{ allowed: true, current_count: 1 }]);
      if (url.pathname.endsWith("/refund_daily_quota")) {
        refunds += 1;
        return Response.json(0);
      }
      if (url.pathname.endsWith("/ai_requests")) {
        usageRows.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 201 });
      }
    }
    if (url.href === "https://openrouter.ai/api/v1/chat/completions") {
      providerBodies.push(JSON.parse(String(init?.body)));
      if (failure === "http") return new Response("PRIVATE_PROVIDER_BODY", { status: 402 });
      const text = failure === "chunk-after-text" ? 'data: {"choices":[{"delta":{"content":"{\\"resp"}}]}\n\n' : "";
      return new Response(`${text}data: {"error":{"message":"PRIVATE_PROVIDER_BODY"}}\n\n`, { headers: { "Content-Type": "text/event-stream" } });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;
  const send = (handle: typeof ai, extra: Record<string, unknown> = {}) => handle(new Request("http://127.0.0.1/functions/v1/ai", {
    method: "POST", headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
    body: JSON.stringify({ feature: "ask", model: "anthropic/claude-haiku-5.5", input: { message: "A question", mode: "general", webSearch: false }, ...extra }),
  }));
  try {
    for (const [label, kind, run] of [
      ["ai", "http", async () => {
        const response = await send(ai);
        assertEquals(response.status, 503);
        return await response.text();
      }],
      ...(["http", "chunk", "chunk-after-text"] as const).flatMap((kind) => [
        [`ai live ${kind}`, kind, async () => {
          const text = await (await send(ai, { stream: true })).text();
          assertEquals(text.includes('"status":503'), true);
          return text;
        }],
        [`ai-stream ${kind}`, kind, async () => {
          const response = await send(stream);
          assertEquals(response.status, 200);
          return await response.text();
        }],
      ] as const),
    ] as const) {
      failure = kind;
      refunds = 0;
      usageRows.length = 0;
      providerBodies.length = 0;
      const text = await run();
      assertEquals(text.includes("PRIVATE_PROVIDER_BODY"), false, label);
      assertEquals(text.includes("Anthropic Claude is temporarily unavailable. Please try again later."), true, label);
      assertEquals(text.includes('"code":"provider_unavailable"'), true, label);
      // A failure after the model wrote text keeps the request: the key already paid for it.
      assertEquals(refunds, kind === "chunk-after-text" ? 0 : 1, `${label} refunds only a failure before output`);
      assertEquals(usageRows.map((row) => row.error_code), ["claude_unavailable"], label);
      // Every attempt stays on the Anthropic route; nothing is retried on another model or provider.
      assertEquals(providerBodies.length > 0, true, label);
      for (const body of providerBodies) {
        assertEquals(body.model, "anthropic/claude-haiku-5.5", label);
        assertEquals(body.provider, { only: ["anthropic"], allow_fallbacks: false, require_parameters: true }, label);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
});
