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
      if (url.pathname.endsWith("/rate_limits")) {
        if ((url.searchParams.get("order") ?? "").includes("updated_at")) throw new Error(`rate_limits must not order by updated_at: ${url.search}`);
        return Response.json({ limit_value: 50 });
      }
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

Deno.test("a refused Claude call is not retried elsewhere, shows an outage, and gives the request back", async () => {
  const originalFetch = globalThis.fetch;
  const originalWarn = console.warn;
  let failure: "http" | "chunk" | "chunk-after-text" | "chunk-charged" | "error-frame-charged" | "repair" | "after-research" | "ok" = "http";
  let tier = "trial";
  // consume_ai_quota reservations and refund_daily_quota refunds, in units.
  const reservedUnits: number[] = [];
  const refundedUnits: number[] = [];
  const usageRows: Array<Record<string, unknown>> = [];
  let clientAbort: AbortController | undefined;
  const providerBodies: Array<Record<string, unknown>> = [];
  console.warn = () => undefined;
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin === "https://supabase.test") {
      if (url.pathname === "/auth/v1/user") return Response.json({ id: "user-1", aud: "authenticated" });
      if (url.pathname.endsWith("/user_roles")) return Response.json({ role: "user" });
      if (url.pathname.endsWith("/user_settings")) return Response.json({ subscription_tier: tier, daily_limit_override: 50, trial_ends_at: "2099-01-01", grace_period_ends_at: null });
      if (url.pathname.endsWith("/subscriptions")) return Response.json(tier === "pro" ? [{ status: "active", current_period_end: "2099-01-01T00:00:00.000Z" }] : []);
      if (url.pathname.endsWith("/rate_limits")) return Response.json({ limit_value: 50 });
      if (url.pathname.endsWith("/global_prompts")) return Response.json({ prompt_text: null });
      if (url.pathname.endsWith("/consume_ai_quota")) {
        reservedUnits.push(JSON.parse(String(init?.body)).p_units);
        return Response.json([{ allowed: true, current_count: 1, denied_by: null }]);
      }
      if (url.pathname.endsWith("/refund_daily_quota")) {
        refundedUnits.push(JSON.parse(String(init?.body)).p_units);
        return Response.json(0);
      }
      if (url.pathname.endsWith("/ai_requests")) {
        usageRows.push(JSON.parse(String(init?.body)));
        return new Response(null, { status: 201 });
      }
    }
    if (url.href === "https://openrouter.ai/api/v1/chat/completions") {
      const body = JSON.parse(String(init?.body));
      providerBodies.push(body);
      const usage = { prompt_tokens: 10, completion_tokens: 5, cost: 0, is_byok: true };
      if (failure === "ok" && body.stream) {
        return new Response(`data: {"choices":[{"delta":{"content":"ok"},"finish_reason":"stop"}],"usage":${JSON.stringify(usage)}}\n\ndata: [DONE]\n\n`, { headers: { "Content-Type": "text/event-stream" } });
      }
      if (failure === "ok") return Response.json({ choices: [{ message: { content: JSON.stringify({ response: "ok", followUpQuestions: [], uncertainties: [] }) } }], usage });
      // A completed attempt with invalid JSON, then a refused repair retry.
      const repairRetry = JSON.stringify(body.messages).includes("JSON REPAIR INSTRUCTION");
      if (failure === "repair" && !repairRetry) return Response.json({ choices: [{ message: { content: "not json" } }], usage });
      // The research search decision (on Haiku) succeeds before the main call is refused.
      const searchDecision = JSON.stringify(body.messages).includes("User message:");
      if (failure === "after-research" && searchDecision) return Response.json({ choices: [{ message: { content: JSON.stringify({ shouldSearch: false, query: "" }) } }], usage });
      if (failure === "http" || failure === "repair" || failure === "after-research") return new Response("PRIVATE_PROVIDER_BODY", { status: 402 });
      const text = failure === "chunk-after-text" ? 'data: {"choices":[{"delta":{"content":"{\\"resp"}}]}\n\n' : "";
      // Usage arrives before the error: free on the BYOK key, or a charge on OpenRouter credits.
      if (failure === "error-frame-charged") {
        // The charge arrives on the error frame itself, not in a frame before it.
        return new Response('data: {"error":{"message":"PRIVATE_PROVIDER_BODY"},"usage":{"prompt_tokens":10,"completion_tokens":0,"cost":0.25,"is_byok":false}}\n\n', { headers: { "Content-Type": "text/event-stream" } });
      }
      const cost = failure === "chunk-charged" ? 0.25 : 0;
      const charge = `data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":0,"cost":${cost},"is_byok":${cost === 0}}}\n\n`;
      return new Response(`${text}${charge}data: {"error":{"message":"PRIVATE_PROVIDER_BODY"}}\n\n`, { headers: { "Content-Type": "text/event-stream" } });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;
  const send = (handle: typeof ai, extra: Record<string, unknown> = {}, model = "anthropic/claude-haiku-5.5") => handle(new Request("http://127.0.0.1/functions/v1/ai", {
    method: "POST", headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
    body: JSON.stringify({ feature: "ask", model, input: { message: "A question", mode: "general", webSearch: false }, ...extra }),
  }));
  try {
    for (const [label, kind, run] of [
      ...(["http", "repair"] as const).map((kind) => [`ai ${kind}`, kind, async () => {
        const response = await send(ai);
        assertEquals(response.status, 503);
        return await response.text();
      }] as const),
      ...(["after-research", "http"] as const).map((kind) => [`ai research ${kind}`, kind, async () => {
        // In a full outage ("http") the Haiku research step is refused too, which is no paid work.
        const response = await send(ai, { input: { message: "What is the latest evidence?", mode: "general", citationMode: true } });
        assertEquals(response.status, 503);
        return await response.text();
      }] as const),
      ...(["http", "chunk", "chunk-after-text", "chunk-charged", "error-frame-charged"] as const).flatMap((kind) => [
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
      reservedUnits.length = 0;
      refundedUnits.length = 0;
      usageRows.length = 0;
      providerBodies.length = 0;
      const text = await run();
      assertEquals(text.includes("PRIVATE_PROVIDER_BODY"), false, label);
      assertEquals(text.includes("Anthropic Claude is temporarily unavailable. Please try again later."), true, label);
      assertEquals(text.includes('"code":"provider_unavailable"'), true, label);
      // A failure after the model wrote text keeps the request: the key already paid for it.
      // The repair case already completed a paid attempt before the retry failed.
      // OpenRouter credits already charged also keep the request counted.
      const refunded = !(kind === "chunk-after-text" || kind === "chunk-charged" || kind === "error-frame-charged" || kind === "repair" || kind === "after-research");
      assertEquals(refundedUnits, refunded ? [1] : [], `${label} refunds only a failure before output`);
      assertEquals(usageRows.map((row) => row.error_code), ["claude_unavailable"], label);
      // A refunded request adds nothing to the weekly cap; a charged one keeps its charge.
      if (refunded) assertEquals(usageRows[0].cap_cost_usd, 0, label);
      if (kind === "chunk-charged" || kind === "error-frame-charged") assertEquals(usageRows[0].cap_cost_usd, 0.25, label);
      // Every attempt stays on the Anthropic route; nothing is retried on another model or provider.
      assertEquals(providerBodies.length > 0, true, label);
      for (const body of providerBodies) {
        assertEquals(body.model, "anthropic/claude-haiku-5.5", label);
        assertEquals(body.provider, { only: ["anthropic"], allow_fallbacks: false, require_parameters: true }, label);
      }
    }

    // Neither a successful Claude answer nor a failure on another model gives a request back.
    refundedUnits.length = 0;
    failure = "ok";
    assertEquals((await send(ai)).status, 200);
    assertEquals((await (await send(stream)).text()).includes("event: final"), true);
    failure = "http";
    assertEquals((await send(ai, {}, "openai/gpt-6-luna")).status, 500);
    assertEquals(refundedUnits, []);

    // A cancelled request is never refunded, even when the refusal raced the abort:
    // the client goes away after the 402 was read, as the handler starts its error path.
    failure = "http";
    clientAbort = new AbortController();
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      if (String(args[0]).startsWith("[ERROR]")) clientAbort?.abort();
      originalError(...args);
    };
    await (await ai(new Request("http://127.0.0.1/functions/v1/ai", {
      method: "POST", headers: { Authorization: "Bearer test-token", "Content-Type": "application/json" },
      body: JSON.stringify({ feature: "ask", model: "anthropic/claude-haiku-5.5", input: { message: "A question", mode: "general", webSearch: false } }),
      signal: clientAbort.signal,
    }))).text().catch(() => "");
    console.error = originalError;
    assertEquals(clientAbort.signal.aborted, true);
    assertEquals(usageRows.at(-1)?.error_code, "claude_unavailable");
    assertEquals(refundedUnits, []);
    clientAbort = undefined;

    // The refund gives back exactly the weighted units consume_ai_quota reserved.
    tier = "pro";
    for (const [model, units] of [["anthropic/claude-haiku-5.5", 1], ["anthropic/claude-sonnet-5.5", 2], ["anthropic/claude-opus-5.5", 5]] as const) {
      for (const [label, handle] of [["ai", ai], ["ai-stream", stream]] as const) {
        reservedUnits.length = 0;
        refundedUnits.length = 0;
        await (await send(handle, {}, model)).text();
        assertEquals(reservedUnits, [units], `${label} ${model} reserves its weight`);
        assertEquals(refundedUnits, [units], `${label} ${model} refunds what it reserved`);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    console.warn = originalWarn;
  }
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
