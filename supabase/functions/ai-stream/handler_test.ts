const testEnvironment = {
  SUPABASE_URL: "https://supabase.test",
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
  }], "general");
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
      if (url.pathname.includes("/rest/v1/rpc/consume_daily_quota")) {
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
          model: "z-ai/glm-5.3-flash",
          input: {
            message: "¿Cómo respondo a este argumento?",
            history: [],
            mode: "general",
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

    const messages = providerRequest?.messages as Array<{ role: string; content: string }> | undefined;
    if (providerRequest?.model !== "z-ai/glm-5.3-flash") {
      throw new Error(`unexpected OpenRouter model: ${String(providerRequest?.model)}`);
    }
    const streamOptions = providerRequest?.stream_options as { include_usage?: unknown } | undefined;
    if (streamOptions?.include_usage !== true) {
      throw new Error("streaming handler did not request terminal usage");
    }
    const system = messages?.find((message) => message.role === "system")?.content ?? "";
    assertIncludes(system, "Answer in clear Markdown that can stream smoothly token by token.");
    assertIncludes(system, "Follow any explicit output-language instruction.");
    assertIncludes(system, "Otherwise match the language used by the user.");
    assertIncludes(system, "Never invent facts, statistics, citations, or sources.");
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
            model: "z-ai/glm-5.3-flash",
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
