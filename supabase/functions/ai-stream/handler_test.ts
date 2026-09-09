const testEnvironment = {
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
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
            model: "gpt-5.4-mini",
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
