const testEnvironment = {
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  OPENROUTER_API_KEY: "test-openrouter-key",
};

for (const [key, value] of Object.entries(testEnvironment)) {
  Deno.env.set(key, value);
}

const { buildMessages, handleRequest } = await import("./index.ts");

function assertIncludes(text: string, expected: string) {
  if (!text.includes(expected)) {
    throw new Error(`Expected response to include "${expected}", got: ${text}`);
  }
}

Deno.test("streaming Ask message construction keeps Markdown output and mode guidance", () => {
  const messages = buildMessages("Question", [{
    role: "user",
    content: "Earlier",
  }], "general", "hu");
  const system =
    messages.find((message) => message.role === "system")?.content ?? "";

  assertIncludes(
    system,
    "Answer in clear Markdown that can stream smoothly token by token.",
  );
  assertIncludes(
    system,
    "Mode guidance: Give a direct coaching answer with concrete debate tactics",
  );
  assertIncludes(system, "Language: Hungarian (hu) - Write ALL output in this language.");
  if (messages[messages.length - 1]?.content !== "Question") {
    throw new Error("current Ask message was not preserved");
  }
});

Deno.test("streaming Ask forwards the shared prompt and returns provider SSE", async () => {
  const originalFetch = globalThis.fetch;
  let providerRequest: Record<string, unknown> | undefined;
  const upstream = [
    'data: {"choices":[{"delta":{"content":"Szia"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":" Adam"}}]}\n\n',
    'data: {"usage":{"prompt_tokens":4,"completion_tokens":2,"total_tokens":6}}\n\n',
    "data: [DONE]\n\n",
  ].join("");

  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));

    if (url.origin === "https://supabase.test") {
      if (url.pathname === "/auth/v1/user") {
        return new Response(JSON.stringify({ id: "user-1", aud: "authenticated" }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.pathname.includes("/rest/v1/user_roles")) {
        return new Response(JSON.stringify({ role: "user" }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.pathname.includes("/rest/v1/user_settings")) {
        return new Response(JSON.stringify({
          subscription_tier: "trial",
          daily_limit_override: 50,
          trial_ends_at: "2099-01-01T00:00:00.000Z",
          grace_period_ends_at: null,
        }), { headers: { "Content-Type": "application/json" } });
      }
      if (url.pathname.includes("/rest/v1/rate_limits")) {
        return new Response(JSON.stringify({ limit_value: 50 }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      if (/\/rest\/v1\/rpc\/consume_(daily|ai)_quota$/.test(url.pathname)) {
        return new Response(JSON.stringify([{ allowed: true, current_count: 1 }]), {
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.pathname.includes("/rest/v1/ai_requests")) {
        return new Response(null, { status: 201 });
      }
      throw new Error(`Unexpected Supabase request: ${url}`);
    }

    if (url.href === "https://openrouter.ai/api/v1/chat/completions") {
      if (new Headers(init?.headers).get("Authorization") !== "Bearer test-openrouter-key") {
        throw new Error("streaming handler did not use OPENROUTER_API_KEY");
      }
      providerRequest = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(upstream, {
        headers: { "Content-Type": "text/event-stream" },
      });
    }

    if (url.href === "https://openrouter.ai/api/alpha/decisions") {
      return new Response(JSON.stringify({
        model: "typesafe/jev-1.13",
        answers: {
          model: {
            type: "choice",
            choice: "anthropic/claude-haiku-5.5",
            confidence: 0.96,
            probabilities: {
              "anthropic/claude-haiku-5.5": 0.96,
              "openai/gpt-6-luna": 0.02,
              "meta/muse-spark-1.3-contributor": 0.02,
            },
          },
        },
        usage: { input_tokens: 15, output_tokens: 0, cost: 0.00000063 },
      }), { headers: { "Content-Type": "application/json" } });
    }

    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  try {
    const response = await handleRequest(
      new Request("http://127.0.0.1/functions/v1/ai-stream", {
        method: "POST",
        headers: {
          Authorization: "Bearer test-user-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          feature: "ask",
          model: "auto-fast",
          input: {
            message: "¿Cómo respondo a este argumento?",
            history: [],
            mode: "general",
            language: "hu",
          },
        }),
      }),
    );

    if (response.status !== 200) {
      throw new Error(`streaming handler returned ${response.status}: ${await response.text()}`);
    }
    if (!response.headers.get("Content-Type")?.startsWith("text/event-stream")) {
      throw new Error("streaming handler did not return SSE");
    }

    const body = await response.text();
    assertIncludes(body, 'event: delta\ndata: {"text":"Szia"}');
    assertIncludes(body, 'event: delta\ndata: {"text":" Adam"}');
    assertIncludes(body, "event: final");
    assertIncludes(body, '"response":"Szia Adam"');
    assertIncludes(body, '"requestedModel":"auto-fast"');
    assertIncludes(body, '"resolvedModel":"anthropic/claude-haiku-5.5"');

    const messages = providerRequest?.messages as Array<{
      role: string;
      content: string | Array<{ text: string; cache_control?: unknown }>;
    }> | undefined;
    if (providerRequest?.model !== "anthropic/claude-haiku-5.5") {
      throw new Error(`unexpected OpenRouter model: ${String(providerRequest?.model)}`);
    }
    const streamOptions = providerRequest?.stream_options as { include_usage?: unknown } | undefined;
    if (streamOptions?.include_usage !== true) {
      throw new Error("streaming handler did not request terminal usage");
    }
    const routing = providerRequest?.provider;
    if (!routing || typeof routing !== "object" || Array.isArray(routing)) throw new Error("provider preferences were missing");
    const preferences = routing as Record<string, unknown>;
    if (preferences.require_parameters !== true) throw new Error("parameter support was not required");
    if (JSON.stringify(preferences.only) !== '["anthropic"]' || preferences.allow_fallbacks !== false) {
      throw new Error(`streamed Claude was not pinned to Anthropic without fallbacks: ${JSON.stringify(preferences)}`);
    }
    if ("sort" in preferences || "order" in preferences) {
      throw new Error(`sort/order disables OpenRouter balanced routing: ${JSON.stringify(preferences)}`);
    }
    const systemContent = messages?.find((message) => message.role === "system")?.content;
    if (!Array.isArray(systemContent) || !systemContent.some((part) => part.cache_control)) {
      throw new Error("Anthropic system prompt was sent without a cache breakpoint");
    }
    const system = systemContent.map((part) => part.text).join("");
    assertIncludes(system, "Answer in clear Markdown that can stream smoothly token by token.");
    assertIncludes(system, "Follow any explicit output-language instruction.");
    assertIncludes(system, "Otherwise match the language used by the user.");
    assertIncludes(system, "Never invent facts, statistics, citations, or sources.");
    assertIncludes(system, "Language: Hungarian (hu) - Write ALL output in this language.");
    if (messages?.at(-1)?.content !== "¿Cómo respondo a este argumento?") {
      throw new Error("provider did not receive the current Ask message");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("streaming Ask rejects advanced modes and toggles before quota or provider work", async () => {
  const cases = [
    {
      label: "clarify mode",
      input: { mode: "clarify", citationMode: false },
      error: "clarify mode",
    },
    {
      label: "summarize mode",
      input: { mode: "summarize", citationMode: false },
      error: "summarize mode",
    },
    {
      label: "proscons mode",
      input: { mode: "proscons", citationMode: false },
      error: "proscons mode",
    },
    {
      label: "argumentmap mode",
      input: { mode: "argumentmap", citationMode: false },
      error: "argumentmap mode",
    },
    {
      label: "citation mode",
      input: { mode: "general", citationMode: true },
      error: "model/mode combination",
    },
    {
      label: "web search",
      input: { mode: "general", citationMode: false, webSearch: true },
      error: "model/mode combination",
    },
    {
      label: "pros and cons",
      input: { mode: "general", citationMode: false, prosConsMode: true },
      error: "model/mode combination",
    },
    {
      label: "argument map",
      input: { mode: "general", citationMode: false, argumentMapMode: true },
      error: "model/mode combination",
    },
    {
      label: "invalid language",
      input: { mode: "general", language: "zz" },
      error: "ask.language",
    },
  ];
  const originalFetch = globalThis.fetch;

  try {
    for (const testCase of cases) {
      const calls: string[] = [];
      globalThis.fetch = (async (input: Request | URL | string) => {
        const url = new URL(
          input instanceof Request ? input.url : String(input),
        );
        calls.push(url.href);
        if (
          url.origin === "https://supabase.test" &&
          url.pathname === "/auth/v1/user"
        ) {
          return new Response(
            JSON.stringify({ id: "user-1", aud: "authenticated" }),
            { headers: { "Content-Type": "application/json" } },
          );
        }
        throw new Error(`${testCase.label} reached unexpected work: ${url}`);
      }) as typeof fetch;

      const response = await handleRequest(
        new Request("http://127.0.0.1/functions/v1/ai-stream", {
          method: "POST",
          headers: {
            Authorization: "Bearer test-user-token",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            feature: "ask",
            model: "openai/gpt-6-luna",
            input: { message: "Question", ...testCase.input },
          }),
        }),
      );
      if (response.status !== 400) {
        throw new Error(`${testCase.label} returned ${response.status}`);
      }
      assertIncludes(await response.text(), testCase.error);
      if (calls.length !== 1 || !calls[0].includes("/auth/v1/user")) {
        throw new Error(
          `${testCase.label} performed quota or provider work: ${
            calls.join(", ")
          }`,
        );
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
