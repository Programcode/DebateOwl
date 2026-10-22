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
      if (/\/consume_(daily|ai)_quota$/.test(url.pathname)) return Response.json([{ allowed: true, current_count: 1 }]);
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
