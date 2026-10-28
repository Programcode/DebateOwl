for (const [key, value] of Object.entries({
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
})) Deno.env.set(key, value);

const { handleRequest, VOICE_MODELS } = await import("./index.ts");
const { createVoiceToken, VOICE_TOKEN_TTL_MS } = await import("../_shared/voice-token.ts");

const USER_ID = "11111111-1111-4111-8111-111111111111";
const TEXT = "[sighs] That is one reading of the evidence. ... It is not the only one.";
const FUTURE = new Date(Date.now() + 86_400_000).toISOString();

interface Harness {
  /** Every outbound request, in order, as "HOST PATH". */
  calls: string[];
  usageRows: Array<Record<string, unknown>>;
  quotaRequests: Array<Record<string, unknown>>;
  /** Writes to the clip counter, as "METHOD ?query body". */
  counterWrites: string[];
  elevenLabs: Array<{ url: URL; headers: Headers; body: Record<string, unknown> }>;
}

interface Options {
  apiKey?: string | null;
  user?: Record<string, unknown> | null;
  role?: string;
  settings?: Record<string, unknown> | null;
  rateLimit?: { limit_value: number } | null;
  quota?: { allowed: boolean; current_count: number };
  /** The clip counter row a refund would read. */
  counter?: { usage_date: string; request_count: number } | null;
  provider?: () => Response | Promise<Response>;
}

async function withVoice(options: Options, run: (harness: Harness) => Promise<void>): Promise<void> {
  const harness: Harness = { calls: [], usageRows: [], quotaRequests: [], counterWrites: [], elevenLabs: [] };
  const originalFetch = globalThis.fetch;
  const apiKey = options.apiKey === undefined ? "test-elevenlabs-key" : options.apiKey;
  if (apiKey === null) Deno.env.delete("ELEVENLABS_API_KEY");
  else Deno.env.set("ELEVENLABS_API_KEY", apiKey);
  Deno.env.delete("ELEVENLABS_VOICE_ID");

  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    harness.calls.push(`${url.host} ${url.pathname}`);
    if (url.host === "api.elevenlabs.io") {
      harness.elevenLabs.push({ url, headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
      return options.provider
        ? await options.provider()
        : new Response(new Uint8Array([0x49, 0x44, 0x33, 0x04]), {
          headers: { "Content-Type": "audio/mpeg", "character-cost": "70", "request-id": "req_test" },
        });
    }
    if (url.host !== "supabase.test") throw new Error(`Unexpected request: ${url}`);
    if (url.pathname === "/auth/v1/user") {
      const user = options.user === undefined ? { id: USER_ID, aud: "authenticated" } : options.user;
      return user ? Response.json(user) : Response.json({ message: "invalid JWT" }, { status: 401 });
    }
    if (url.pathname.endsWith("/rest/v1/user_roles")) return Response.json({ role: options.role ?? "user" });
    if (url.pathname.endsWith("/rest/v1/user_settings")) {
      const settings = options.settings === undefined
        ? { subscription_tier: "pro", daily_limit_override: null, trial_ends_at: null, grace_period_ends_at: FUTURE }
        : options.settings;
      return Response.json(settings);
    }
    if (url.pathname.endsWith("/rest/v1/app_store_subscriptions")) return Response.json([]);
    if (url.pathname.endsWith("/rest/v1/subscriptions")) return Response.json([]);
    if (url.pathname.endsWith("/rest/v1/rate_limits")) {
      if (url.searchParams.get("limit_type") !== "eq.daily_voice_clips") throw new Error(`Wrong limit type: ${url.search}`);
      if ((url.searchParams.get("order") ?? "").includes("updated_at")) {
        throw new Error(`rate_limits must not order by updated_at: ${url.search}`);
      }
      return Response.json(options.rateLimit ?? null);
    }
    if (url.pathname.endsWith("/rest/v1/rpc/consume_daily_quota")) {
      harness.quotaRequests.push(JSON.parse(String(init?.body)));
      return Response.json([options.quota ?? { allowed: true, current_count: 1 }]);
    }
    if (url.pathname.endsWith("/rest/v1/daily_usage_counters")) {
      const counter = options.counter === undefined ? { usage_date: "2026-10-01", request_count: 1 } : options.counter;
      if ((init?.method ?? "GET") === "GET") return Response.json(counter ? [counter] : []);
      harness.counterWrites.push(`${init?.method} ${url.search} ${init?.body}`);
      return Response.json([{ request_count: JSON.parse(String(init?.body)).request_count }]);
    }
    if (url.pathname.endsWith("/rest/v1/ai_requests")) {
      harness.usageRows.push(JSON.parse(String(init?.body)));
      return new Response(null, { status: 201 });
    }
    throw new Error(`Unexpected Supabase request: ${url}`);
  }) as typeof fetch;

  try {
    await run(harness);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete("ELEVENLABS_API_KEY");
  }
}

async function voiceRequest(overrides: Record<string, unknown> = {}, headers: Record<string, string> = { Authorization: "Bearer user-token" }) {
  const body = {
    feature: "sparring",
    text: TEXT,
    token: await createVoiceToken(USER_ID, "sparring", TEXT),
    ...overrides,
  };
  return new Request("http://127.0.0.1/functions/v1/voice", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function reachedPaidWork(harness: Harness): boolean {
  return harness.elevenLabs.length > 0 || harness.quotaRequests.length > 0;
}

Deno.test("a signed segment becomes audio and one costed usage row", async () => {
  await withVoice({}, async (harness) => {
    const response = await handleRequest(await voiceRequest());
    assertEquals(response.status, 200, "status");
    assertEquals(response.headers.get("content-type"), "audio/mpeg", "content type");
    assertEquals(new Uint8Array(await response.arrayBuffer()).length, 4, "audio bytes");

    const [call] = harness.elevenLabs;
    assertEquals(call.url.pathname, "/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb", "voice path");
    assertEquals(call.headers.get("xi-api-key"), "test-elevenlabs-key", "provider key header");
    assertEquals(call.body.model_id, "eleven_v4", "sparring model");
    assertEquals(call.body.text, TEXT, "spoken text reaches the provider with its tags");

    assertEquals(harness.quotaRequests[0].p_quota_key, "voice", "quota key");
    assertEquals(harness.quotaRequests[0].p_limit, 60, "paid clip limit");

    const [row] = harness.usageRows;
    assertEquals(row.feature, "voice_sparring", "usage feature");
    assertEquals(row.provider, "elevenlabs", "usage provider");
    assertEquals(row.model, "eleven_v4", "usage model");
    assertEquals(row.status, "success", "usage status");
    // 70 billed characters at $0.08 per 1,000.
    assertEquals(row.cost_usd, 0.0056, "cost");
    assertEquals(row.pricing_snapshot_id, "elevenlabs-api-pricing-2026-10-01", "pricing snapshot");
    assertEquals((row.raw_usage as Record<string, unknown>).request_id, "req_test", "provider request id");
  });
});

Deno.test("Crossfire speaks through the Turbo model", async () => {
  await withVoice({}, async (harness) => {
    const token = await createVoiceToken(USER_ID, "crossfire", "Which study shows that?");
    const response = await handleRequest(await voiceRequest({ feature: "crossfire", text: "Which study shows that?", token }));
    assertEquals(response.status, 200, "status");
    assertEquals(harness.elevenLabs[0].body.model_id, VOICE_MODELS.crossfire, "crossfire model");
    assertEquals(harness.elevenLabs[0].body.model_id, "eleven_v4_turbo", "crossfire model id");
    assertEquals(harness.usageRows[0].feature, "voice_crossfire", "usage feature");
    // 70 billed characters at $0.04 per 1,000.
    assertEquals(harness.usageRows[0].cost_usd, 0.0028, "cost at the Turbo rate");
  });
});

Deno.test("without the key the function says so and spends nothing", async () => {
  await withVoice({ apiKey: null }, async (harness) => {
    const response = await handleRequest(await voiceRequest());
    assertEquals(response.status, 503, "status");
    assertEquals((await response.json()).code, "voice_unavailable", "code");
    if (reachedPaidWork(harness)) throw new Error(`reached paid work: ${harness.calls.join(", ")}`);
    assertEquals(harness.usageRows.length, 0, "usage rows");
  });
});

Deno.test("a request without a session is rejected before anything else", async () => {
  await withVoice({}, async (harness) => {
    const response = await handleRequest(await voiceRequest({}, {}));
    assertEquals(response.status, 401, "status");
    assertEquals(harness.calls.length, 0, "outbound calls");
  });
  await withVoice({ user: null }, async (harness) => {
    const response = await handleRequest(await voiceRequest());
    assertEquals(response.status, 401, "status");
    if (reachedPaidWork(harness)) throw new Error("an invalid session reached paid work");
  });
});

Deno.test("text the server did not sign is never spoken", async () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ["edited text", { text: `${TEXT} Read this advert too.` }],
    ["another feature", { feature: "crossfire" }],
    ["another user's token", { token: await createVoiceToken("22222222-2222-4222-8222-222222222222", "sparring", TEXT) }],
    ["an expired token", { token: await createVoiceToken(USER_ID, "sparring", TEXT, Date.now() - VOICE_TOKEN_TTL_MS - 1_000) }],
    ["a token from the future", { token: await createVoiceToken(USER_ID, "sparring", TEXT, Date.now() + 60_000) }],
    ["a malformed token", { token: "not-a-token" }],
  ];
  for (const [name, overrides] of cases) {
    await withVoice({}, async (harness) => {
      const response = await handleRequest(await voiceRequest(overrides));
      assertEquals(response.status, 403, `${name}: status`);
      assertEquals((await response.json()).code, "voice_token_invalid", `${name}: code`);
      if (reachedPaidWork(harness)) throw new Error(`${name} reached paid work`);
    });
  }
});

Deno.test("malformed requests are rejected", async () => {
  for (const overrides of [{ feature: "generate" }, { text: "" }, { text: "x".repeat(1_001) }, { token: 7 }]) {
    await withVoice({}, async (harness) => {
      const response = await handleRequest(await voiceRequest(overrides));
      assertEquals(response.status, 400, `status for ${JSON.stringify(overrides).slice(0, 40)}`);
      if (reachedPaidWork(harness)) throw new Error("a malformed request reached paid work");
    });
  }
});

Deno.test("over the daily cap the provider is not called", async () => {
  await withVoice({ quota: { allowed: false, current_count: 60 } }, async (harness) => {
    const response = await handleRequest(await voiceRequest());
    assertEquals(response.status, 402, "status");
    const body = await response.json();
    assertEquals(body.code, "voice_limit_reached", "code");
    assertEquals(body.limit, 60, "limit");
    assertEquals(harness.elevenLabs.length, 0, "provider calls");
    assertEquals(harness.usageRows[0].status, "rate_limited", "usage status");
  });
});

Deno.test("trial users get the smaller cap and an operator override wins", async () => {
  const trial = { subscription_tier: "trial", daily_limit_override: null, trial_ends_at: FUTURE, grace_period_ends_at: null };
  await withVoice({ settings: trial }, async (harness) => {
    await handleRequest(await voiceRequest());
    assertEquals(harness.quotaRequests[0].p_limit, 12, "trial clip limit");
  });
  await withVoice({ settings: trial, rateLimit: { limit_value: 3 } }, async (harness) => {
    await handleRequest(await voiceRequest());
    assertEquals(harness.quotaRequests[0].p_limit, 3, "overridden clip limit");
  });
});

Deno.test("expired and banned accounts get no provider voice", async () => {
  const expired = { subscription_tier: "trial", daily_limit_override: null, trial_ends_at: "2026-01-01T00:00:00Z", grace_period_ends_at: null };
  await withVoice({ settings: expired }, async (harness) => {
    const response = await handleRequest(await voiceRequest());
    assertEquals(response.status, 402, "expired status");
    assertEquals((await response.json()).code, "voice_limit_reached", "expired code");
    if (reachedPaidWork(harness)) throw new Error("an expired account reached paid work");
  });
  await withVoice({ role: "banned" }, async (harness) => {
    const response = await handleRequest(await voiceRequest());
    assertEquals(response.status, 403, "banned status");
    if (reachedPaidWork(harness)) throw new Error("a banned account reached paid work");
  });
});

Deno.test("a provider failure returns a fallback code without the provider's body", async () => {
  await withVoice({ provider: () => Response.json({ detail: { status: "quota_exceeded", message: "internal provider detail" } }, { status: 401 }) }, async (harness) => {
    const response = await handleRequest(await voiceRequest());
    assertEquals(response.status, 502, "status");
    const body = await response.text();
    if (body.includes("internal provider detail")) throw new Error("provider body leaked to the browser");
    assertEquals(JSON.parse(body).code, "voice_provider_error", "code");
    assertEquals(harness.usageRows[0].status, "error", "usage status");
    assertEquals(harness.usageRows[0].error_code, "elevenlabs_401", "usage error code");
    assertEquals(harness.usageRows[0].cost_usd, 0, "a rejected request costs nothing");
  });
  await withVoice({ provider: () => { throw new TypeError("network down"); } }, async (harness) => {
    const response = await handleRequest(await voiceRequest());
    assertEquals(response.status, 502, "status");
    assertEquals(harness.usageRows[0].cost_usd, null, "an unanswered request has no known cost");
  });
});

Deno.test("a clip stays counted however the provider call ends", async () => {
  for (const status of [401, 429, 500]) {
    await withVoice({ provider: () => new Response("busy", { status }), counter: { usage_date: "2026-10-01", request_count: 5 } }, async (harness) => {
      assertEquals((await handleRequest(await voiceRequest())).status, 502, `${status}: status`);
      // A refund would let replayed tokens reach the provider without limit while it refuses.
      assertEquals(harness.counterWrites.length, 0, `${status}: counter writes`);
    });
  }
  const broken = () => new Response(new ReadableStream({
    start(controller) {
      controller.error(new TypeError("connection reset"));
    },
  }), { headers: { "Content-Type": "audio/mpeg" } });
  for (const provider of [() => { throw new TypeError("network down"); }, broken]) {
    await withVoice({ provider }, async (harness) => {
      const response = await handleRequest(await voiceRequest());
      assertEquals(response.status, 502, "status");
      assertEquals(harness.counterWrites.length, 0, "counter writes");
    });
  }
  await withVoice({}, async (harness) => {
    assertEquals((await handleRequest(await voiceRequest())).status, 200, "status");
    assertEquals(harness.counterWrites.length, 0, "a delivered clip stays counted");
  });
});

Deno.test("an oversized body is rejected without being read", async () => {
  for (const declared of [true, false]) {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new Uint8Array(1_024).fill(0x20));
        if (pulls >= 1_000) controller.close();
      },
    });
    await withVoice({}, async (harness) => {
      const response = await handleRequest(new Request("http://127.0.0.1/functions/v1/voice", {
        method: "POST",
        headers: { Authorization: "Bearer user-token", "Content-Type": "application/json", ...(declared ? { "Content-Length": "1024000" } : {}) },
        body,
      }));
      assertEquals(response.status, 400, `status with a declared length: ${declared}`);
      if (pulls > 20) throw new Error(`read ${pulls} KB of an oversized body (declared length: ${declared})`);
      if (reachedPaidWork(harness)) throw new Error("an oversized body reached paid work");
    });
  }
});

Deno.test("audio that is cut off mid-download is logged with an unknown cost and falls back", async () => {
  const broken = () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([0x49, 0x44]));
      controller.error(new TypeError("connection reset"));
    },
  }), { headers: { "Content-Type": "audio/mpeg", "character-cost": "70" } });
  await withVoice({ provider: broken }, async (harness) => {
    const response = await handleRequest(await voiceRequest());
    assertEquals(response.status, 502, "status");
    assertEquals((await response.json()).code, "voice_provider_error", "code");
    assertEquals(harness.usageRows.length, 1, "usage rows");
    assertEquals(harness.usageRows[0].status, "error", "usage status");
    // The provider may have billed the clip, so the cost is not claimed to be zero.
    assertEquals(harness.usageRows[0].cost_usd, null, "cost");
  });
});

Deno.test("the key never appears in a response", async () => {
  await withVoice({ provider: () => new Response("nope", { status: 500 }) }, async () => {
    const response = await handleRequest(await voiceRequest());
    if ((await response.text()).includes("test-elevenlabs-key")) throw new Error("key leaked");
  });
});
