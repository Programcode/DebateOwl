import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1.0.19";
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

Deno.test("common JSON slips are repaired locally instead of paying for a retry", async () => {
  const { parseJsonFromText } = await import("./provider.ts");
  const parse = (text: string) => parseJsonFromText(text, "OpenRouter");
  assertEquals(parse('```JSON\n{"a":1}\n```'), { a: 1 });
  assertEquals(parse('```\n{"a":1}\n```'), { a: 1 });
  assertEquals(parse('Here you go: {"a":"x"} Note: {not json}'), { a: "x" });
  assertEquals(parse('Use {braces} like so. {"a":[1,2,],}'), { a: [1, 2] });
  assertEquals(parse('{"a":"line one\nline two\t!"}'), { a: "line one\nline two\t!" });
  assertEquals(parse('{"a":"keep , ] inside strings",}'), { a: "keep , ] inside strings" });
  // A broken outer object never yields one of its nested objects.
  assertThrows(() => parse('{"case": {"title": "x"}, oops}'));
  // A reply cut off mid-object is not completed, even around a fenced example.
  assertThrows(() => parse('{"contentions": [{"title": "x"}, {"title": "y"'));
  assertThrows(() => parse('{"response":"Example:\n```\n{"response":"inner"}\n```\nunfinished'));
  // Two objects that both parse leave the answer ambiguous.
  assertThrows(() => parse('Note: {} means omitted. Answer: {"response":"Use evidence."}'));
  assertThrows(() => parse('```\n{"response":"example"}\n```\nActually: {"response":"final"}'));
  assertThrows(() => parse("{note} ".repeat(9) + '{"response":"example"} {"response":"final"}'));
  // Past the span limit the reply is rejected, never accepted early.
  assertThrows(() => parse("{note} ".repeat(20) + '{"response":"only"}'));
  // A JSON-looking span that fails to parse may be the real answer, so no other span is trusted.
  assertThrows(() => parse('Example: {"type":"question","text":"example"}\n\nAnswer: {"type":"question","text":"Why "this"?"}'));
  assertThrows(() => parse('Note: {} means omitted. Answer: {"response": "Use evidence." oops}'));
  // An unescaped quote that closes the outer span early does not yield the nested object.
  assertThrows(() => parse('{"response": "He wrote "x} and left", "data": {"k": 1}}'));
  // An unclosed brace leaves the rest unread, so an earlier object is not trusted.
  assertThrows(() => parse('{"response":"example"} then { {"response":"final"}'));
  // Fence-like text inside valid JSON parses at once.
  const started = performance.now();
  assertEquals(parse(JSON.stringify({ a: "```" + " ".repeat(20_000) + "x" })), { a: "```" + " ".repeat(20_000) + "x" });
  assertEquals(performance.now() - started < 1_000, true);
});

Deno.test("a reply cut at its cap is retried once with a larger cap, keeping the strict json_schema", async () => {
  const { callAI } = await import("./provider.ts");
  const originalFetch = globalThis.fetch;
  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (_input: Request | URL | string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return Response.json({
      choices: [{ message: { content: '{"queries": ["a", "b' }, finish_reason: "length" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.01 },
    });
  }) as typeof fetch;
  try {
    const schema = { name: "follow_up_queries", schema: { type: "object" } };
    const error = await assertRejects(() =>
      callAI("openrouter", "openai/gpt-6-luna", "system", [{ role: "user", content: "hi" }], "low", "research", undefined, undefined, schema)
    ) as { usage?: { inputTokens?: number } };
    // One cut-off retry with a larger cap, never a repair-prompt retry on top.
    assertEquals(bodies.length, 2);
    for (const body of bodies) {
      assertEquals(body.response_format, { type: "json_schema", json_schema: { name: "follow_up_queries", strict: true, schema: { type: "object" } } });
    }
    assertEquals((bodies[1].max_tokens as number) > (bodies[0].max_tokens as number), true);
    // Both attempts are billed.
    assertEquals(error.usage?.inputTokens, 20);
  } finally { globalThis.fetch = originalFetch; }
});
