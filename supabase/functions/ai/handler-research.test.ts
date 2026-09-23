function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const environment = {
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  SPARRING_INTEGRITY_SECRET: "test-sparring-secret",
  EXA_API_KEY: "test-exa-key",
  OPENROUTER_API_KEY: "test-openrouter-key",
};

for (const [key, value] of Object.entries(environment)) Deno.env.set(key, value);

const { handleRequest } = await import("./index.ts");
const { handleRequest: handleStreamRequest } = await import("../ai-stream/index.ts");
const { MAX_REQUEST_OUTPUT_TOKENS, MODEL_CATALOG } = await import("../_shared/model-catalog.ts");

Deno.test("AI handlers reject malformed controls before quota or provider work", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input: Request | URL | string) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    calls.push(url.href);
    if (url.origin === "https://supabase.test" && url.pathname === "/auth/v1/user") {
      return jsonResponse({ id: "user-1", aud: "authenticated" });
    }
    throw new Error(`Malformed controls reached unexpected work: ${url}`);
  }) as typeof fetch;

  try {
    const response = await handleRequest(new Request("http://127.0.0.1/functions/v1/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        feature: "ask",
        model: "openai/gpt-5.6-luna",
        input: { message: "Question", mode: "\u200Bgeneral", citationMode: "false" },
      }),
    }));
    if (response.status !== 400) throw new Error(`non-streaming handler returned ${response.status}`);
    if (!(await response.text()).includes("ask.citationMode")) throw new Error("non-streaming error hid the invalid control");
    if (calls.length !== 0) throw new Error(`non-streaming validation performed remote work: ${calls.join(", ")}`);

    for (const [feature, input] of [
      ["ask", { message: "Question", mode: "general", language: "zz" }],
      ["crossfire", {
        operation: "next-turn",
        config: {
          resolution: "Cities should ban cars.",
          argument: "Cars cause congestion.",
          mode: "ai-questions-user",
          style: "cooperative",
          durationSeconds: 180,
          useSourceLibrary: false,
          seedQuestions: [],
        },
        transcript: [],
        expectedReply: "question",
        language: "zz",
      }],
    ] as const) {
      const languageResponse = await handleRequest(new Request("http://127.0.0.1/functions/v1/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feature, model: "openai/gpt-5.6-luna", input }),
      }));
      if (languageResponse.status !== 400) throw new Error(`${feature} invalid language returned ${languageResponse.status}`);
      if (!(await languageResponse.text()).includes(`${feature}.language`)) throw new Error(`${feature} invalid language was accepted`);
      if (calls.length !== 0) throw new Error(`${feature} language validation performed remote work: ${calls.join(", ")}`);
    }

    const streamResponse = await handleStreamRequest(new Request("http://127.0.0.1/functions/v1/ai-stream", {
      method: "POST",
      headers: {
        Authorization: "Bearer test-user-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        feature: "ask",
        model: "openai/gpt-5.6-luna",
        input: { message: "Question", mode: "general", citationMode: "false" },
      }),
    }));
    if (streamResponse.status !== 400) throw new Error(`streaming handler returned ${streamResponse.status}`);
    if (!(await streamResponse.text()).includes("ask.citationMode")) throw new Error("streaming error hid the invalid control");
    const observedCalls: string[] = Array.from(calls);
    if (observedCalls.length !== 1 || !observedCalls[0].includes("/auth/v1/user")) {
      throw new Error(`streaming validation performed quota or provider work: ${observedCalls.join(", ")}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("factoids handler carries Exa filters and consulted-source metadata across the request boundary", async () => {
  const originalFetch = globalThis.fetch;
  const exaSearchBodies: Array<Record<string, unknown>> = [];
  let providerCalls = 0;
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen: () => {} }, handleRequest);
  const serverAddress = server.addr as Deno.NetAddr;

  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));

    if (url.hostname === "127.0.0.1" && url.port === String(serverAddress.port)) {
      return originalFetch(input, init);
    }

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
      if (url.pathname.includes("/rest/v1/rate_limits")) return jsonResponse({ limit_value: 50 });
      if (url.pathname.includes("/rest/v1/rpc/consume_daily_quota")) {
        return jsonResponse([{ allowed: true, current_count: 1 }]);
      }
      if (url.pathname.includes("/rest/v1/global_prompts")) return jsonResponse({ prompt_text: null });
      if (url.pathname.includes("/rest/v1/ai_requests")) return new Response(null, { status: 201 });
      throw new Error(`Unhandled Supabase request: ${url}`);
    }

    if (url.href === "https://api.exa.ai/search") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      exaSearchBodies.push(body);
      return jsonResponse({
        results: [{
          title: "Official energy statistics",
          url: "https://energy.gov/reports/solar-costs-2024",
          text: "Official government statistics report showing a 42 percent cost reduction in solar energy.",
          publishedDate: "2024-06-01T00:00:00.000Z",
        }],
      });
    }

    if (url.href === "https://api.exa.ai/contents") {
      return jsonResponse({
        results: [{
          url: "https://energy.gov/reports/solar-costs-2024",
          text: "Official government statistics report showing a 42 percent cost reduction in solar energy.",
        }],
      });
    }

    if (url.href === "https://openrouter.ai/api/v1/chat/completions") {
      providerCalls += 1;
      const content = providerCalls === 1
        ? { queries: [] }
        : {
          factoids: [{
            id: "fact-1",
            shortClaim: "Solar costs fell by 42 percent",
            keyFigure: "42%",
            context: "The official report compares the relevant period.",
            limitations: "The result depends on the measured market segment.",
            citation: {
              title: "Official energy statistics",
              publisher: "Department of Energy",
              date: "2024",
              url: "https://energy.gov/reports/solar-costs-2024",
              verified: "pending",
            },
            howToUse: "Use this as a bounded cost trend.",
            relevanceScore: 92,
          }],
          searchSuggestions: [],
          warnings: [],
          verificationStatus: "pending",
        };
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify(content) } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.000001 },
      });
    }

    throw new Error(`Unhandled request: ${url}`);
  }) as typeof fetch;

  try {
    const response = await originalFetch(`http://127.0.0.1:${serverAddress.port}`, {
      method: "POST",
      headers: {
        Authorization: "Bearer test-user-token",
        "Content-Type": "application/json",
        Origin: "http://localhost:8080",
      },
      body: JSON.stringify({
        feature: "factoids",
        model: "openai/gpt-5.6-luna",
        input: {
          claim: "solar energy costs",
          direction: "for",
          region: "United States",
          sourceType: "government",
          timeframe: "2024-2026",
          sourceCount: 5,
        },
      }),
    });

    if (response.status !== 200) throw new Error(`handler returned ${response.status}: ${await response.text()}`);
    const payload = await response.json() as {
      output?: { factoids?: Array<{ citation?: { verified?: string } }> };
      discoveredSources?: Array<{ url?: string; qualityLabel?: string; sourceType?: string; query?: string }>;
    };
    if (payload.output?.factoids?.[0]?.citation?.verified !== "verified") {
      throw new Error("handler did not verify a fetched non-weak citation");
    }
    const source = payload.discoveredSources?.[0];
    if (source?.qualityLabel !== "strong" || source.sourceType !== "government" || !source.query) {
      throw new Error(`consulted-source provenance missing: ${JSON.stringify(source)}`);
    }
    if (exaSearchBodies.length === 0) throw new Error("handler never called Exa search");
    for (const body of exaSearchBodies) {
      const query = typeof body.query === "string" ? body.query : "";
      if (query.includes("site:")) throw new Error(`site operator leaked into Exa query: ${query}`);
      if (!Array.isArray(body.includeDomains) || !body.includeDomains.includes("energy.gov")) {
        throw new Error(`government includeDomains missing: ${JSON.stringify(body)}`);
      }
      if (body.startPublishedDate !== "2024-01-01T00:00:00.000Z") {
        throw new Error(`published-date filter missing: ${JSON.stringify(body)}`);
      }
      if (body.endPublishedDate !== "2026-12-31T23:59:59.999Z") {
        throw new Error(`published-date upper bound missing: ${JSON.stringify(body)}`);
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
    await server.shutdown();
  }
});

Deno.test("Ask marks only surviving URL and research context as available", async () => {
  const originalFetch = globalThis.fetch;
  let scenario: "empty-search" | "empty-url" | "trimmed" = "empty-search";
  const providerBodies: Array<Record<string, unknown>> = [];

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
      if (url.pathname.includes("/rest/v1/rate_limits")) return jsonResponse({ limit_value: 50 });
      if (url.pathname.includes("/rest/v1/rpc/consume_daily_quota")) {
        return jsonResponse([{ allowed: true, current_count: 1 }]);
      }
      if (url.pathname.includes("/rest/v1/global_prompts")) return jsonResponse({ prompt_text: null });
      if (url.pathname.includes("/rest/v1/ai_requests")) return new Response(null, { status: 201 });
      throw new Error(`Unhandled Supabase request: ${url}`);
    }

    if (url.href === "https://api.exa.ai/search") {
      return scenario === "trimmed"
        ? jsonResponse({ results: [{ title: "Official government evidence report", url: "https://energy.gov/reports/evidence-2026", text: "Official government statistics and evidence report.", publishedDate: "2026-01-01T00:00:00.000Z" }] })
        : jsonResponse({ results: [] });
    }
    if (url.href === "https://api.exa.ai/contents") return jsonResponse({ results: [] });

    if (url.href === "https://openrouter.ai/api/v1/chat/completions") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      providerBodies.push(body);
      const messages = body.messages as Array<{ content?: unknown }> | undefined;
      const userContent = messages?.at(-1)?.content;
      if (typeof userContent === "string" && userContent.startsWith("User message:")) {
        return jsonResponse({
          choices: [{ message: { content: JSON.stringify({ shouldSearch: true, query: "current debate evidence" }) } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        });
      }
      if (typeof userContent === "string" && userContent.startsWith("Claim:")) {
        return jsonResponse({
          choices: [{ message: { content: JSON.stringify({ queries: [] }) } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        });
      }
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify({ response: "ok", followUpQuestions: [], uncertainties: [] }) } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });
    }

    throw new Error(`Unhandled request: ${url}`);
  }) as typeof fetch;

  const runAsk = async (input: Record<string, unknown>) => {
    providerBodies.length = 0;
    const response = await handleRequest(new Request("http://127.0.0.1/functions/v1/ai", {
      method: "POST",
      headers: { Authorization: "Bearer test-user-token", "Content-Type": "application/json" },
      body: JSON.stringify({ feature: "ask", model: "openai/gpt-5.6-luna", input }),
    }));
    if (response.status !== 200) throw new Error(`Ask handler returned ${response.status}: ${await response.text()}`);
    const mainRequest = providerBodies.find((body) => {
      const messages = body.messages as Array<{ content?: unknown }> | undefined;
      const lastMessage = messages?.at(-1);
      return typeof lastMessage?.content === "string" && lastMessage.content.startsWith("Message:");
    });
    if (!mainRequest) throw new Error("Ask main provider request was not captured");
    const messages = mainRequest.messages as Array<{ role?: string; content?: unknown }>;
    return {
      system: String(messages.find((message) => message.role === "system")?.content ?? ""),
      user: String(messages.at(-1)?.content ?? ""),
      body: await response.json(),
    };
  };

  try {
    const emptySearch = await runAsk({ message: "What is current evidence?", mode: "general", citationMode: true });
    if (!emptySearch.user.includes("Research Context: NONE")) throw new Error("empty search was marked available");
    if (emptySearch.user.includes("WEB RESEARCH RESULTS") || emptySearch.system.includes("RESEARCH CITATION RULES:")) {
      throw new Error("empty search context leaked into the Ask provider prompt");
    }

    scenario = "empty-url";
    const emptyUrl = await runAsk({ message: "Read https://example.com/empty", mode: "general", citationMode: false });
    if (!emptyUrl.user.includes("Research Context: NONE") || emptyUrl.user.includes("WEB PAGE CONTEXT:")) {
      throw new Error("empty URL fetch was marked as usable context");
    }

    scenario = "trimmed";
    const untrimmed = await runAsk({ message: "What evidence is available?", mode: "general", citationMode: true });
    if (untrimmed.body.output.searchInfo.sources.length === 0) {
      throw new Error("trimming fixture must provide a citable source before trimming");
    }
    const trimmed = await runAsk({ message: "x".repeat(50_000), mode: "general", citationMode: true });
    if (!trimmed.user.includes("Research Context: NONE") || trimmed.system.includes("RESEARCH CITATION RULES:")) {
      throw new Error("trimmed research remained marked as available");
    }
    if (trimmed.body.output.searchInfo.sources.length !== 0 || (trimmed.body.output.citations?.length ?? 0) !== 0) {
      throw new Error("trimmed research leaked into response sources or fallback citations");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function supabaseTestResponse(url: URL): Response | undefined {
  if (url.origin !== "https://supabase.test") return undefined;
  if (url.pathname === "/auth/v1/user") return jsonResponse({ id: "user-1", aud: "authenticated" });
  if (url.pathname.includes("/rest/v1/user_roles")) return jsonResponse({ role: "user" });
  if (url.pathname.includes("/rest/v1/user_settings")) return jsonResponse({
    subscription_tier: (globalThis as typeof globalThis & { __testTier?: string }).__testTier || "trial",
    daily_limit_override: 50,
    trial_ends_at: "2099-01-01T00:00:00.000Z",
    grace_period_ends_at: null,
  });
  if (url.pathname.includes("/rest/v1/subscriptions")) return jsonResponse([{ status: "active", current_period_end: "2099-01-01T00:00:00.000Z" }]);
  if (url.pathname.includes("/rest/v1/rate_limits")) return jsonResponse({ limit_value: 50 });
  if (url.pathname.includes("/rest/v1/rpc/consume_daily_quota")) return jsonResponse([{ allowed: true, current_count: 1 }]);
  if (url.pathname.includes("/rest/v1/global_prompts")) return jsonResponse({ prompt_text: null });
  if (url.pathname.includes("/rest/v1/ai_requests")) return new Response(null, { status: 201 });
  throw new Error(`Unhandled Supabase request: ${url}`);
}

function askRequest(model: string, reasoningEffort?: string): Request {
  return new Request("http://127.0.0.1/functions/v1/ai", {
    method: "POST",
    headers: { Authorization: "Bearer test-user-token", "Content-Type": "application/json" },
    body: JSON.stringify({
      feature: "ask",
      model,
      ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
      input: { message: "How can I compare two policies?", mode: "general" },
    }),
  });
}

Deno.test("AI handler ranks stable library sources and returns bounded assessments", async () => {
  const originalFetch = globalThis.fetch;
  const providerBodies: Array<Record<string, unknown>> = [];
  const sourceA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const sourceB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin === "https://supabase.test" && url.pathname.includes("/rest/v1/sources")) {
      if (url.searchParams.get("user_id") !== "eq.user-1" || url.searchParams.get("is_active") !== "eq.true") {
        throw new Error(`source lookup was not user scoped: ${url}`);
      }
      return jsonResponse([
        { id: sourceA, title: "Source A", content: "Evidence A", type: "text", metadata: { qualityLabel: "strong", qualityScore: 90 } },
        { id: sourceB, title: "Source B", content: "Evidence B", type: "text", metadata: { qualityLabel: "strong", qualityScore: 80 } },
      ]);
    }
    const supabaseResponse = supabaseTestResponse(url);
    if (supabaseResponse) return supabaseResponse;
    if (url.href === "https://openrouter.ai/api/alpha/decisions") {
      const body = JSON.parse(String(init?.body)) as { questions: Record<string, { type: string; criteria?: readonly string[] }> };
      const answers: Record<string, unknown> = {};
      for (const [id, question] of Object.entries(body.questions)) {
        const second = id.startsWith("source_1_");
        if (question.type === "noul") {
          answers[id] = { type: "noul", noul: second ? 0.95 : 0.7 };
        } else {
          const criteria = question.criteria ?? ["None", "Low", "Medium", "High"];
          const score = second ? 3 : 1;
          answers[id] = {
            type: "score",
            score,
            confidence: 0.9,
            probabilities: Object.fromEntries(criteria.map((_, index) => [String(index), index === score ? 0.9 : 0.03])),
            legend: Object.fromEntries(criteria.map((label, index) => [String(index), label])),
          };
        }
      }
      return jsonResponse({ model: "typesafe/jev-1.13", answers, usage: { input_tokens: 10, output_tokens: 0, cost: 0.000001 } });
    }
    if (url.href === "https://openrouter.ai/api/v1/chat/completions") {
      providerBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify({ response: "ok", followUpQuestions: [], uncertainties: [] }) } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.000001 },
      });
    }
    throw new Error(`Unhandled request: ${url}`);
  }) as typeof fetch;

  try {
    const response = await handleRequest(new Request("http://127.0.0.1/functions/v1/ai", {
      method: "POST",
      headers: { Authorization: "Bearer test-user-token", "Content-Type": "application/json" },
      body: JSON.stringify({
        feature: "ask",
        model: "openai/gpt-5.6-luna",
        input: { message: "Compare the evidence", mode: "general", webSearch: false },
        sourceIds: [sourceA, sourceB],
      }),
    }));
    if (response.status !== 200) throw new Error(`source-ranking request returned ${response.status}: ${await response.text()}`);
    const payload = await response.json() as { sourceAssessments?: Array<{ id?: string; importance?: number }> };
    if (payload.sourceAssessments?.map((item) => item.id).join(",") !== `${sourceA},${sourceB}`) throw new Error("stable source IDs were not returned");
    if (payload.sourceAssessments?.[1]?.importance !== 3) throw new Error("semantic assessment was not returned");
    const providerText = JSON.stringify(providerBodies);
    if (providerText.indexOf("Source B") > providerText.indexOf("Source A")) throw new Error("semantic source order did not reach the provider prompt");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Crossfire returns newest-exchange signals without making them a reply dependency", async () => {
  const originalFetch = globalThis.fetch;
  let decisionFails = false;
  let decisionCalls = 0;
  const claimedSignalKeys = new Set<string>();
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin === "https://supabase.test" && url.pathname.includes("/rest/v1/rpc/consume_daily_quota")) {
      const body = JSON.parse(String(init?.body ?? "{}")) as { p_quota_key?: string };
      if (body.p_quota_key?.startsWith("crossfire_signal:")) {
        const allowed = !claimedSignalKeys.has(body.p_quota_key);
        claimedSignalKeys.add(body.p_quota_key);
        return jsonResponse([{ allowed, current_count: 1 }]);
      }
    }
    const supabaseResponse = supabaseTestResponse(url);
    if (supabaseResponse) return supabaseResponse;
    if (url.href === "https://openrouter.ai/api/v1/chat/completions") {
      const body = JSON.parse(String(init?.body)) as { messages?: Array<{ content?: string }> };
      const prompt = body.messages?.at(-1)?.content ?? "";
      const output = prompt.includes('must be type "question"')
        ? { type: "question", text: "What follows from that concession?" }
        : { type: "answer", text: "The evidence directly supports the claim." };
      return jsonResponse({ choices: [{ message: { content: JSON.stringify(output) } }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.000001 } });
    }
    if (url.href === "https://openrouter.ai/api/alpha/decisions") {
      decisionCalls += 1;
      if (decisionFails) return jsonResponse({ error: "unavailable" }, 500);
      return jsonResponse({
        model: "typesafe/jev-1.13",
        answers: {
          answer_quality: { type: "choice", choice: "direct", confidence: 0.9, probabilities: { direct: 0.9, partial: 0.08, evasive: 0.02 } },
          concession: { type: "choice", choice: "implicit", confidence: 0.8, probabilities: { none: 0.15, implicit: 0.8, explicit: 0.05 } },
          follow_up: { type: "noul", noul: 0.82 },
        },
        usage: { input_tokens: 10, output_tokens: 0, cost: 0.000001 },
      });
    }
    throw new Error(`Unhandled request: ${url}`);
  }) as typeof fetch;

  const config = (mode: "question-ai" | "ai-questions-user") => ({ resolution: "Cities should ban cars.", argument: "Cars cause congestion.", mode, style: "cooperative", durationSeconds: 180, useSourceLibrary: false, seedQuestions: [] });
  const request = (mode: "question-ai" | "ai-questions-user", transcript: unknown[], expectedReply: "question" | "answer") => handleRequest(new Request("http://127.0.0.1/functions/v1/ai", {
    method: "POST",
    headers: { Authorization: "Bearer test-user-token", "Content-Type": "application/json" },
    body: JSON.stringify({
      feature: "crossfire",
      model: "openai/gpt-5.6-luna",
      input: {
        operation: "next-turn",
        config: config(mode),
        transcript,
        expectedReply,
      },
    }),
  }));
  const requestSignal = (mode: "question-ai" | "ai-questions-user", transcript: unknown[], reply: { type: "question" | "answer"; text: string }, signalToken: string) => handleRequest(new Request("http://127.0.0.1/functions/v1/ai", {
    method: "POST",
    headers: { Authorization: "Bearer test-user-token", "Content-Type": "application/json" },
    body: JSON.stringify({ feature: "crossfire", model: "openai/gpt-5.6-luna", input: { operation: "signal", config: config(mode), transcript, reply, signalToken } }),
  }));

  try {
    const questionTranscript = [{ id: "T1", sequence: 1, speaker: "user", kind: "question", text: "What evidence supports that?", createdAt: 1 }];
    const questionAi = await request("question-ai", questionTranscript, "answer");
    const questionAiPayload = await questionAi.json() as { output?: { type?: string; text?: string }; signalToken?: string; signal?: unknown };
    if (questionAi.status !== 200 || questionAiPayload.output?.type !== "answer" || !questionAiPayload.signalToken || questionAiPayload.signal !== undefined) {
      throw new Error(`question-ai reply was delayed by signal work: ${JSON.stringify(questionAiPayload)}`);
    }
    if (decisionCalls !== 0) throw new Error("main Crossfire reply waited for Jev");
    const questionSignal = await requestSignal("question-ai", questionTranscript, questionAiPayload.output as { type: "answer"; text: string }, questionAiPayload.signalToken);
    const questionSignalPayload = await questionSignal.json() as { output?: { signal?: { answerTurnId?: string; answerQuality?: string } } };
    if (questionSignalPayload.output?.signal?.answerTurnId !== "T2" || questionSignalPayload.output.signal.answerQuality !== "direct") throw new Error(`question-ai signal missing: ${JSON.stringify(questionSignalPayload)}`);
    const replayedSignal = await requestSignal("question-ai", questionTranscript, questionAiPayload.output as { type: "answer"; text: string }, questionAiPayload.signalToken);
    if (replayedSignal.status !== 409 || Number(decisionCalls) !== 1) throw new Error("replayed Crossfire signal token reached Jev");
    const forgedSignal = await requestSignal("question-ai", questionTranscript, questionAiPayload.output as { type: "answer"; text: string }, "forged-token");
    if (forgedSignal.status !== 403) throw new Error("forged Crossfire signal token was accepted");

    const answerTranscript = [
      { id: "T1", sequence: 1, speaker: "ai", kind: "question", text: "Would costs rise?", createdAt: 1 },
      { id: "T2", sequence: 2, speaker: "user", kind: "answer", text: "Some costs may rise.", createdAt: 2 },
    ];
    const aiQuestionsUser = await request("ai-questions-user", answerTranscript, "question");
    const aiQuestionsPayload = await aiQuestionsUser.json() as { output?: { type?: string; text?: string }; signalToken?: string };
    if (aiQuestionsUser.status !== 200 || aiQuestionsPayload.output?.type !== "question" || !aiQuestionsPayload.signalToken) throw new Error(`ai-questions-user reply missing: ${JSON.stringify(aiQuestionsPayload)}`);
    const decisionCallsBeforeReplayRace = decisionCalls;
    const racedSignals = await Promise.all(Array.from({ length: 4 }, () => requestSignal("ai-questions-user", answerTranscript, aiQuestionsPayload.output as { type: "question"; text: string }, aiQuestionsPayload.signalToken!)));
    if (racedSignals.filter((response) => response.status === 200).length !== 1 || racedSignals.filter((response) => response.status === 409).length !== 3) {
      throw new Error(`concurrent signal token claim was not atomic: ${racedSignals.map((response) => response.status).join(",")}`);
    }
    if (decisionCalls !== decisionCallsBeforeReplayRace + 1) throw new Error("concurrent Crossfire signal replays reached Jev");
    const answerSignalPayload = await racedSignals.find((response) => response.status === 200)!.json() as { output?: { signal?: { answerTurnId?: string; concession?: string } } };
    if (answerSignalPayload.output?.signal?.answerTurnId !== "T2" || answerSignalPayload.output.signal.concession !== "implicit") throw new Error(`ai-questions-user signal missing: ${JSON.stringify(answerSignalPayload)}`);

    decisionFails = true;
    const fallbackTranscript = [{ id: "T1", sequence: 1, speaker: "user", kind: "question", text: "What is the fallback evidence?", createdAt: 3 }];
    const fallbackReply = await request("question-ai", fallbackTranscript, "answer");
    const fallbackReplyPayload = await fallbackReply.json() as { output?: { type: "answer"; text: string }; signalToken?: string };
    if (!fallbackReplyPayload.output || !fallbackReplyPayload.signalToken) throw new Error("fallback Crossfire reply token missing");
    const fallback = await requestSignal("question-ai", fallbackTranscript, fallbackReplyPayload.output, fallbackReplyPayload.signalToken);
    const fallbackPayload = await fallback.json() as { output?: { signal?: unknown } };
    if (fallback.status !== 200 || fallbackPayload.output?.signal !== undefined) throw new Error(`failed optional signal returned invalid output: ${JSON.stringify(fallbackPayload)}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("AI handlers use strict OpenRouter routing and server-side reasoning tiers", async () => {
  const originalFetch = globalThis.fetch;
  const originalTier = (globalThis as typeof globalThis & { __testTier?: string }).__testTier;
  const openRouterBodies: Array<Record<string, unknown>> = [];
  const decisionBodies: Array<Record<string, unknown>> = [];
  const testState = globalThis as typeof globalThis & { __testTier?: string };
  const requestForModel = (model: string, tier: "trial" | "pro", effort = "high") => {
    testState.__testTier = tier;
    return handleRequest(askRequest(model, effort));
  };

  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const supabaseResponse = supabaseTestResponse(url);
    if (supabaseResponse) return supabaseResponse;
    if (url.href === "https://openrouter.ai/api/alpha/decisions") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      decisionBodies.push(body);
      const questions = body.questions as Record<string, { criteria: Record<string, string> }>;
      const labels = Object.keys(questions.model.criteria);
      const choice = labels.includes("z-ai/glm-5.3-flash") ? "z-ai/glm-5.3-flash" : "openai/gpt-5.6-sol";
      return jsonResponse({
        model: "typesafe/jev-1.13",
        answers: {
          model: {
            type: "choice",
            choice,
            confidence: 0.97,
            probabilities: Object.fromEntries(labels.map((label) => [label, label === choice ? 0.97 : 0.01])),
          },
        },
        usage: { input_tokens: 20, output_tokens: 0, cost: 0.00000084 },
      });
    }
    if (url.href === "https://openrouter.ai/api/v1/chat/completions") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      openRouterBodies.push(body);
      return jsonResponse({
        choices: [{ message: { content: "{}" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.001 },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  try {
    const unknown = await handleRequest(askRequest("provider/unknown-model", "low"));
    if (unknown.status !== 400 || openRouterBodies.length !== 0) throw new Error("unknown model reached routing");

    for (const entry of MODEL_CATALOG) {
      const response = await requestForModel(entry.id, entry.isProOnly ? "pro" : "trial");
      if (response.status !== 200) throw new Error(`${entry.id} returned ${response.status}: ${await response.text()}`);
    }
    for (const effort of ["low", "medium", "high"]) {
      const response = await requestForModel("anthropic/claude-sonnet-5", "pro", effort);
      if (response.status !== 200) throw new Error(`Pro ${effort} returned ${response.status}: ${await response.text()}`);
    }
    for (const model of ["deepseek/deepseek-v4-flash-0731", "deepseek/deepseek-v4-pro-0813", "z-ai/glm-5.3-flash"]) {
      const response = await requestForModel(model, "pro", "medium");
      if (response.status !== 200) throw new Error(`Pro medium ${model} returned ${response.status}: ${await response.text()}`);
    }

    const manualGlmBasic = await requestForModel("z-ai/glm-5.3-flash", "trial");
    if (manualGlmBasic.status !== 403) throw new Error("manual GLM unexpectedly bypassed the Basic gate");
    const autoFastBasic = await requestForModel("auto-fast", "trial");
    if (autoFastBasic.status !== 200) throw new Error(`Basic Auto Fast returned ${autoFastBasic.status}: ${await autoFastBasic.text()}`);
    const autoFastPayload = await autoFastBasic.json();
    if (autoFastPayload.meta?.requestedModel !== "auto-fast" || autoFastPayload.meta?.resolvedModel !== "z-ai/glm-5.3-flash") {
      throw new Error(`Auto Fast metadata was wrong: ${JSON.stringify(autoFastPayload.meta)}`);
    }
    const autoProBasic = await requestForModel("auto-pro", "trial");
    if (autoProBasic.status !== 403) throw new Error("Basic Auto Pro was accepted");
    const autoPro = await requestForModel("auto-pro", "pro");
    if (autoPro.status !== 200) throw new Error(`Pro Auto Pro returned ${autoPro.status}: ${await autoPro.text()}`);
    const autoProPayload = await autoPro.json();
    if (autoProPayload.meta?.resolvedModel !== "openai/gpt-5.6-sol") {
      throw new Error(`Auto Pro metadata was wrong: ${JSON.stringify(autoProPayload.meta)}`);
    }

    if (openRouterBodies.length !== MODEL_CATALOG.length + 8) throw new Error(`unexpected OpenRouter call count: ${openRouterBodies.length}`);
    if (decisionBodies.length !== 2) throw new Error(`unexpected Decisions call count: ${decisionBodies.length}`);
    for (let index = 0; index < MODEL_CATALOG.length; index += 1) {
      const entry = MODEL_CATALOG[index];
      const body = openRouterBodies[index];
      if (body.model !== entry.id) throw new Error(`wrong routed model: ${String(body.model)}`);
      if (body.max_tokens !== MAX_REQUEST_OUTPUT_TOKENS) throw new Error(`output cap was not enforced for ${entry.id}`);
      const reasoning = body.reasoning as Record<string, unknown>;
      const provider = body.provider as Record<string, unknown>;
      if (reasoning.effort !== (entry.isProOnly ? "high" : "low")) throw new Error(`tier effort was not enforced for ${entry.id}`);
      if (reasoning.exclude !== true || provider.require_parameters !== true) throw new Error(`strict reasoning route missing for ${entry.id}`);
      if ((body.response_format as Record<string, unknown>)?.type !== "json_object") throw new Error(`JSON response format missing for ${entry.id}`);
      if (entry.supportsTemperature !== ("temperature" in body)) throw new Error(`temperature support mismatch for ${entry.id}`);
    }
    for (const [offset, effort] of ["low", "medium", "high"].entries()) {
      const body = openRouterBodies[MODEL_CATALOG.length + offset];
      if ((body.reasoning as Record<string, unknown>).effort !== effort) throw new Error(`Pro effort ${effort} was not forwarded`);
    }
    for (const offset of [3, 4, 5]) {
      const body = openRouterBodies[MODEL_CATALOG.length + offset];
      if ((body.reasoning as Record<string, unknown>).effort !== "low") throw new Error("unsupported Pro medium was not lowered");
    }
    if (openRouterBodies.at(-2)?.model !== "z-ai/glm-5.3-flash") throw new Error("Auto Fast did not call GLM");
    if (openRouterBodies.at(-1)?.model !== "openai/gpt-5.6-sol") throw new Error("Auto Pro did not call Sol");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalTier === undefined) delete testState.__testTier;
    else testState.__testTier = originalTier;
  }
});

Deno.test("streaming OpenRouter usage records zero and missing costs distinctly", async () => {
  const originalFetch = globalThis.fetch;
  const usageRows: Array<Record<string, unknown>> = [];
  const streamBodies: Array<Record<string, unknown>> = [];
  let includeUsage = true;
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const supabaseResponse = supabaseTestResponse(url);
    if (supabaseResponse) {
      if (url.pathname.includes("/rest/v1/ai_requests")) {
        usageRows.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      }
      return supabaseResponse;
    }
    if (url.href === "https://openrouter.ai/api/v1/chat/completions") {
      streamBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      const frames = [
        `data: ${JSON.stringify({ choices: [{ delta: { content: "Hello" } }] })}\n\n`,
        ...(includeUsage ? [`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3, cost: 0 } })}\n\n`] : []),
        "data: [DONE]\n\n",
      ].join("");
      return new Response(frames, { headers: { "Content-Type": "text/event-stream" } });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const testState = globalThis as typeof globalThis & { __testTier?: string };
  const originalTier = testState.__testTier;
  testState.__testTier = "trial";
  try {
    const withZero = await handleStreamRequest(new Request("http://127.0.0.1/functions/v1/ai-stream", {
      method: "POST",
      headers: { Authorization: "Bearer test-user-token", "Content-Type": "application/json" },
      body: JSON.stringify({ feature: "ask", model: "openai/gpt-5.6-luna", input: { message: "Hello", mode: "general" } }),
    }));
    await withZero.text();
    if (streamBodies[0]?.max_tokens !== MAX_REQUEST_OUTPUT_TOKENS) throw new Error("stream output cap was not enforced");
    if (usageRows.at(-1)?.cost_usd !== 0) throw new Error(`zero stream cost was not logged: ${JSON.stringify(usageRows.at(-1))}`);

    includeUsage = false;
    const withoutUsage = await handleStreamRequest(new Request("http://127.0.0.1/functions/v1/ai-stream", {
      method: "POST",
      headers: { Authorization: "Bearer test-user-token", "Content-Type": "application/json" },
      body: JSON.stringify({ feature: "ask", model: "openai/gpt-5.6-luna", input: { message: "Hello", mode: "general" } }),
    }));
    await withoutUsage.text();
    if (usageRows.at(-1)?.cost_usd !== null) throw new Error(`missing stream cost was estimated: ${JSON.stringify(usageRows.at(-1))}`);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalTier === undefined) delete testState.__testTier;
    else testState.__testTier = originalTier;
  }
});

Deno.test("streaming rejects provider errors and incomplete EOFs, while accepting a tail finish reason", async () => {
  const originalFetch = globalThis.fetch;
  const usageRows: Array<Record<string, unknown>> = [];
  let frames = "";
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const supabaseResponse = supabaseTestResponse(url);
    if (supabaseResponse) {
      if (url.pathname.includes("/rest/v1/ai_requests")) usageRows.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return supabaseResponse;
    }
    if (url.href === "https://openrouter.ai/api/v1/chat/completions") {
      return new Response(frames, { headers: { "Content-Type": "text/event-stream" } });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const request = () => new Request("http://127.0.0.1/functions/v1/ai-stream", {
    method: "POST",
    headers: { Authorization: "Bearer test-user-token", "Content-Type": "application/json" },
    body: JSON.stringify({ feature: "ask", model: "openai/gpt-5.6-luna", input: { message: "Hello", mode: "general" } }),
  });

  const testState = globalThis as typeof globalThis & { __testTier?: string };
  const originalTier = testState.__testTier;
  testState.__testTier = "trial";
  try {
    frames = `data: ${JSON.stringify({ error: { message: "provider exploded" } })}`;
    const providerError = await (await handleStreamRequest(request())).text();
    if (providerError.includes("event: final") || !providerError.includes("event: error") || !providerError.includes("provider exploded")) {
      throw new Error(`provider error was not surfaced as an SSE error: ${providerError}`);
    }
    if (usageRows.at(-1)?.cost_usd !== null) throw new Error("provider error published a cost");

    frames = `data: ${JSON.stringify({ choices: [{ delta: { content: "partial" } }] })}\n\n`;
    const incomplete = await (await handleStreamRequest(request())).text();
    if (incomplete.includes("event: final") || !incomplete.includes("event: error") || !incomplete.includes("ended before completion")) {
      throw new Error(`incomplete EOF was treated as success: ${incomplete}`);
    }
    if (usageRows.at(-1)?.cost_usd !== null) throw new Error("incomplete EOF published a cost");

    frames = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "complete" } }] })}`,
      `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}`,
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 2, completion_tokens: 1, cost: 0.25 } })}`,
    ].join("\n");
    const finished = await (await handleStreamRequest(request())).text();
    if (!finished.includes("event: final") || finished.includes("event: error")) throw new Error(`tail finish reason was rejected: ${finished}`);
    if (usageRows.at(-1)?.cost_usd !== 0.25) throw new Error("tail usage was not logged");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalTier === undefined) delete testState.__testTier;
    else testState.__testTier = originalTier;
  }
});

Deno.test("cancelled streams keep observed cost unknown", async () => {
  const originalFetch = globalThis.fetch;
  const usageRows: Array<Record<string, unknown>> = [];
  const encoder = new TextEncoder();
  let providerStartedResolve!: () => void;
  const providerStarted = new Promise<void>((resolve) => providerStartedResolve = resolve);
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const supabaseResponse = supabaseTestResponse(url);
    if (supabaseResponse) {
      if (url.pathname.includes("/rest/v1/ai_requests")) usageRows.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return supabaseResponse;
    }
    if (url.href === "https://openrouter.ai/api/v1/chat/completions") {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "partial" } }] })}\n\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 2, completion_tokens: 1, cost: 0.25 } })}\n\n`));
          providerStartedResolve();
          init?.signal?.addEventListener("abort", () => controller.error(new DOMException("Upstream aborted", "AbortError")), { once: true });
        },
        pull() {
          return new Promise<void>(() => {});
        },
      });
      return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const testState = globalThis as typeof globalThis & { __testTier?: string };
  const originalTier = testState.__testTier;
  testState.__testTier = "trial";
  const caller = new AbortController();
  try {
    const response = await handleStreamRequest(new Request("http://127.0.0.1/functions/v1/ai-stream", {
      method: "POST",
      headers: { Authorization: "Bearer test-user-token", "Content-Type": "application/json" },
      body: JSON.stringify({ feature: "ask", model: "openai/gpt-5.6-luna", input: { message: "Hello", mode: "general" } }),
      signal: caller.signal,
    }));
    const read = response.text();
    await providerStarted;
    await new Promise((resolve) => setTimeout(resolve, 5));
    caller.abort();
    await read;
    const row = usageRows.at(-1);
    if (row?.status !== "cancelled" || row.cost_usd !== null) throw new Error(`cancelled stream was billed: ${JSON.stringify(row)}`);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalTier === undefined) delete testState.__testTier;
    else testState.__testTier = originalTier;
  }
});

Deno.test("cancelled JSON repair keeps observed tokens but makes the total cost unknown", async () => {
  const originalFetch = globalThis.fetch;
  const usageRows: Array<Record<string, unknown>> = [];
  const caller = new AbortController();
  let providerCalls = 0;
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const supabaseResponse = supabaseTestResponse(url);
    if (supabaseResponse) {
      if (url.pathname.includes("/rest/v1/ai_requests")) usageRows.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return supabaseResponse;
    }
    if (url.href === "https://openrouter.ai/api/v1/chat/completions") {
      providerCalls += 1;
      if (providerCalls === 1) {
        return jsonResponse({
          choices: [{ message: { content: "not valid JSON" } }],
          usage: { prompt_tokens: 11, completion_tokens: 7, cost: 0.25 },
        });
      }
      caller.abort(new DOMException("Repair cancelled", "AbortError"));
      throw new DOMException("Repair cancelled", "AbortError");
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const testState = globalThis as typeof globalThis & { __testTier?: string };
  const originalTier = testState.__testTier;
  testState.__testTier = "trial";
  try {
    const response = await handleRequest(new Request("http://127.0.0.1/functions/v1/ai", {
      method: "POST",
      headers: { Authorization: "Bearer test-user-token", "Content-Type": "application/json" },
      body: JSON.stringify({ feature: "ask", model: "openai/gpt-5.6-luna", input: { message: "Hello", mode: "general" } }),
      signal: caller.signal,
    }));
    if (response.status !== 500) throw new Error(`cancelled repair returned ${response.status}`);
    if (providerCalls !== 2) throw new Error(`expected initial and repair calls, got ${providerCalls}`);
    const row = usageRows.at(-1);
    if (row?.cost_usd !== null || row.input_tokens !== 11 || row.output_tokens !== 7) {
      throw new Error(`cancelled repair accounting was not incomplete: ${JSON.stringify(row)}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalTier === undefined) delete testState.__testTier;
    else testState.__testTier = originalTier;
  }
});

Deno.test("stream terminal events stop an open upstream promptly", async () => {
  const originalFetch = globalThis.fetch;
  const usageRows: Array<Record<string, unknown>> = [];
  const encoder = new TextEncoder();
  let scenario: "done" | "error" = "done";
  let upstreamCancelled: Promise<void> = Promise.resolve();
  let resolveUpstreamCancelled = () => {};
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const supabaseResponse = supabaseTestResponse(url);
    if (supabaseResponse) {
      if (url.pathname.includes("/rest/v1/ai_requests")) usageRows.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return supabaseResponse;
    }
    if (url.href === "https://openrouter.ai/api/v1/chat/completions") {
      upstreamCancelled = new Promise<void>((resolve) => resolveUpstreamCancelled = resolve);
      const payload = scenario === "done"
        ? [
          `data: ${JSON.stringify({ choices: [{ delta: { content: "complete" } }] })}\n\n`,
          `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 2, completion_tokens: 1, cost: 0.25 } })}\n\n`,
          "data: [DONE]\n\n",
        ].join("")
        : `data: ${JSON.stringify({ error: { message: "provider exploded" } })}\n\n`;
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(payload));
          init?.signal?.addEventListener("abort", () => {
            resolveUpstreamCancelled();
            controller.error(new DOMException("Upstream aborted", "AbortError"));
          }, { once: true });
        },
        pull() {
          return new Promise<void>(() => {});
        },
        cancel() {
          resolveUpstreamCancelled();
        },
      });
      return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
    }
    throw new Error(`Unexpected request: ${url}`);
  }) as typeof fetch;

  const request = (signal?: AbortSignal) => new Request("http://127.0.0.1/functions/v1/ai-stream", {
    method: "POST",
    headers: { Authorization: "Bearer test-user-token", "Content-Type": "application/json" },
    body: JSON.stringify({ feature: "ask", model: "openai/gpt-5.6-luna", input: { message: "Hello", mode: "general" } }),
    signal,
  });
  const withTimeout = async <T>(promise: Promise<T>, label: string): Promise<T> => await Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), 100)),
  ]);

  const testState = globalThis as typeof globalThis & { __testTier?: string };
  const originalTier = testState.__testTier;
  testState.__testTier = "trial";
  try {
    const doneCaller = new AbortController();
    const doneRead = (await handleStreamRequest(request(doneCaller.signal))).text();
    let doneText: string;
    try {
      doneText = await withTimeout(doneRead, "DONE stream");
    } catch (error) {
      doneCaller.abort();
      await doneRead;
      throw error;
    }
    if (!doneText.includes("event: final") || doneText.includes("event: error")) throw new Error(`DONE stream did not succeed: ${doneText}`);
    await withTimeout(upstreamCancelled, "DONE upstream cancellation");
    if (usageRows.at(-1)?.cost_usd !== 0.25) throw new Error("complete DONE stream lost its reported cost");

    scenario = "error";
    const errorText = await withTimeout((await handleStreamRequest(request())).text(), "error stream");
    if (errorText.includes("event: final") || !errorText.includes("provider exploded")) throw new Error(`provider error was not emitted: ${errorText}`);
    await withTimeout(upstreamCancelled, "error upstream cancellation");
    if (usageRows.at(-1)?.cost_usd !== null) throw new Error("provider error published a cost");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalTier === undefined) delete testState.__testTier;
    else testState.__testTier = originalTier;
  }
});
