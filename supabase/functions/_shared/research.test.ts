import {
  applyFactoidsVerification,
  buildDiscoveredSources,
  buildResearchContext,
  deepResearch,
  emptyResearchContext,
  exaGetContents,
  exaSearch,
  fetchJsonWithTimeout,
  getResearchSources,
  MAX_PROVIDER_ERROR_BODY_CHARS,
  MAX_PROVIDER_RESPONSE_BYTES,
  type ResearchContext,
} from "./research.ts";

function ctxWith(overrides: Partial<ResearchContext>): ResearchContext {
  return { ...emptyResearchContext(), ...overrides };
}

Deno.test("empty research does not render a research context block", () => {
  const rendered = buildResearchContext(ctxWith({
    searches: [{ query: "empty search", results: "" }],
  }));
  if (rendered !== "") throw new Error(`empty research rendered unexpected context: ${rendered}`);
});

Deno.test("factoid citations backed by strong or moderate fetched sources stay verified", () => {
  const research = ctxWith({
    readContent: [
      { url: "https://data.gov/report", title: "Report", content: "x", result: { query: "q", sourceType: "government", qualityScore: 80, qualityLabel: "strong", qualityReasons: [] } },
    ],
    verifiedUrls: new Set(["https://data.gov/report"]),
  });
  const output = {
    factoids: [{ citation: { url: "https://data.gov/report", verified: "pending" } }],
  };
  applyFactoidsVerification(output, research);
  if (output.factoids[0].citation.verified !== "verified") throw new Error("strong source should stay citable");
});

Deno.test("factoid citations pointing at weak fetched sources are downgraded to unverified", () => {
  const research = ctxWith({
    readContent: [
      { url: "https://reddit.com/r/thread", title: "Thread", content: "x", result: { query: "q", sourceType: "social", qualityScore: 10, qualityLabel: "weak", qualityReasons: [] } },
    ],
    verifiedUrls: new Set(["https://reddit.com/r/thread"]),
  });
  const output = {
    factoids: [{ citation: { url: "https://reddit.com/r/thread", verified: "pending" } }],
  };
  applyFactoidsVerification(output, research);
  if (output.factoids[0].citation.verified !== "unverified") throw new Error("quality floor violated: weak source kept verified");
});

Deno.test("factoid citations to unknown urls become unverified", () => {
  const output = { factoids: [{ citation: { url: "https://example.com/made-up", verified: "pending" } }] };
  applyFactoidsVerification(output, emptyResearchContext());
  if (output.factoids[0].citation.verified !== "unverified") throw new Error("unknown url must not be verified");
});

Deno.test("citable sources exclude weak results even when nothing else was fetched", () => {
  const research = ctxWith({
    rankedResults: [
      { title: "Weak", url: "https://forum.example/a", query: "", sourceType: "social", qualityScore: 5, qualityLabel: "weak", qualityReasons: [] },
      { title: "Solid", url: "https://gov.example/data", query: "", sourceType: "government", qualityScore: 75, qualityLabel: "strong", qualityReasons: ["government source"] },
    ],
  });
  const sources = getResearchSources(research);
  if (sources.length !== 1 || sources[0].url !== "https://gov.example/data") {
    throw new Error(`expected only the non-weak source, got ${JSON.stringify(sources.map((s) => s.url))}`);
  }
});

Deno.test("discovered sources keep ranking provenance including the originating query", () => {
  const research = ctxWith({
    readContent: [
      { url: "https://gov.example/data", title: "Data", content: "long content", result: { query: "policy statistics 2026", sourceType: "government", qualityScore: 82, qualityLabel: "strong", qualityReasons: ["government source"] } },
    ],
  });
  const discovered = buildDiscoveredSources(research);
  if (discovered.length !== 1) throw new Error("expected one discovered source");
  const item = discovered[0];
  if (item.qualityLabel !== "strong" || item.sourceType !== "government" || item.qualityScore !== 82) {
    throw new Error(`quality metadata missing: ${JSON.stringify(item)}`);
  }
  if (item.query !== "policy statistics 2026") throw new Error("originating query missing from provenance");
});

Deno.test("fetched pages without ranking metadata fail closed to unverified", () => {
  const research = ctxWith({
    readContent: [{ url: "https://unknown.example/page", title: "Page", content: "x" }],
    verifiedUrls: new Set(["https://unknown.example/page"]),
  });
  const output = { factoids: [{ citation: { url: "https://unknown.example/page", verified: "pending" } }] };
  applyFactoidsVerification(output, research);
  if (output.factoids[0].citation.verified !== "unverified") {
    throw new Error("unranked fetched page must not verify");
  }
});

Deno.test("malformed factoid entries fail closed without throwing", () => {
  const output = {
    factoids: [
      null,
      "not an object",
      42,
      [],
      { citation: null },
      { citation: { url: "https://example.com/untrusted", verified: "verified" } },
    ],
  };

  applyFactoidsVerification(output, emptyResearchContext());

  const citation = (output.factoids[5] as { citation: { verified?: string } }).citation;
  if (citation.verified !== "unverified") throw new Error("malformed citation must not remain verified");
});

async function assertStalledJsonReadCancels(
  request: (signal: AbortSignal) => Promise<unknown>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  let bodyStartedResolve!: () => void;
  let bodyAbortedResolve!: () => void;
  const bodyStarted = new Promise<void>((resolve) => bodyStartedResolve = resolve);
  const bodyAborted = new Promise<void>((resolve) => bodyAbortedResolve = resolve);

  globalThis.fetch = ((_input: Request | URL | string, init?: RequestInit) => Promise.resolve({
    ok: true,
    json: () => {
      bodyStartedResolve();
      return new Promise<never>((_resolve, reject) => {
        const onAbort = () => {
          bodyAbortedResolve();
          reject(init?.signal?.reason ?? new DOMException("The operation was aborted", "AbortError"));
        };
        if (init?.signal?.aborted) onAbort();
        else init?.signal?.addEventListener("abort", onAbort, { once: true });
      });
    },
  } as unknown as Response)) as typeof fetch;

  try {
    const caller = new AbortController();
    const pending = request(caller.signal);
    await Promise.race([
      bodyStarted,
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error("response body was not read")), 100)),
    ]);
    caller.abort(new DOMException("Test cancellation", "AbortError"));

    const bodyCancelled = await Promise.race([
      bodyAborted.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
    ]);
    if (!bodyCancelled) throw new Error("stalled response body was not cancelled");

    const settled = await Promise.race([
      pending.then(() => "resolved", () => "rejected"),
      new Promise<string>((resolve) => setTimeout(() => resolve("still pending"), 100)),
    ]);
    if (settled !== "rejected") throw new Error(`request did not reject after cancellation: ${settled}`);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

Deno.test("Exa search keeps caller cancellation active during JSON body read", async () => {
  const previousApiKey = Deno.env.get("EXA_API_KEY");
  Deno.env.set("EXA_API_KEY", "test-key");
  try {
    await assertStalledJsonReadCancels((signal) => exaSearch("stalled search body", signal));
  } finally {
    if (previousApiKey === undefined) Deno.env.delete("EXA_API_KEY");
    else Deno.env.set("EXA_API_KEY", previousApiKey);
  }
});

Deno.test("Exa search sends supported first-class filter fields", async () => {
  const originalFetch = globalThis.fetch;
  const previousApiKey = Deno.env.get("EXA_API_KEY");
  let requestBody: Record<string, unknown> | undefined;
  Deno.env.set("EXA_API_KEY", "test-key");
  globalThis.fetch = ((_input: Request | URL | string, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Promise.resolve(new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
  }) as typeof fetch;

  try {
    await exaSearch({
      query: "official energy data",
      includeDomains: ["*.gov", "worldbank.org"],
      excludeDomains: ["reddit.com"],
      startPublishedDate: "2024-01-01T00:00:00.000Z",
      category: "news",
    });
    if (!requestBody) throw new Error("search body was not captured");
    if (requestBody.numResults !== 10) throw new Error("numResults was not sent in Exa's supported casing");
    if (!Array.isArray(requestBody.includeDomains) || !requestBody.includeDomains.includes("*.gov")) {
      throw new Error("includeDomains was not sent");
    }
    if (requestBody.startPublishedDate !== "2024-01-01T00:00:00.000Z") {
      throw new Error("startPublishedDate was not sent");
    }
    const contents = requestBody.contents as { text?: { maxCharacters?: number } } | undefined;
    if (contents?.text?.maxCharacters !== 10000) throw new Error("contents maxCharacters used unsupported casing");
    if ("num_results" in requestBody) throw new Error("legacy snake_case field leaked into request");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousApiKey === undefined) Deno.env.delete("EXA_API_KEY");
    else Deno.env.set("EXA_API_KEY", previousApiKey);
  }
});

Deno.test("Exa contents keeps caller cancellation active during JSON body read", async () => {
  const previousApiKey = Deno.env.get("EXA_API_KEY");
  Deno.env.set("EXA_API_KEY", "test-key");
  try {
    await assertStalledJsonReadCancels((signal) => exaGetContents("https://example.com/stalled", signal));
  } finally {
    if (previousApiKey === undefined) Deno.env.delete("EXA_API_KEY");
    else Deno.env.set("EXA_API_KEY", previousApiKey);
  }
});

Deno.test("Exa contents sends the documented maxCharacters field", async () => {
  const originalFetch = globalThis.fetch;
  const previousApiKey = Deno.env.get("EXA_API_KEY");
  let requestBody: Record<string, unknown> | undefined;
  Deno.env.set("EXA_API_KEY", "test-key");
  globalThis.fetch = ((_input: Request | URL | string, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return Promise.resolve(new Response(JSON.stringify({ results: [{ text: "content" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
  }) as typeof fetch;

  try {
    await exaGetContents("https://example.com/report");
    const text = requestBody?.text as { maxCharacters?: number; max_characters?: number } | undefined;
    if (text?.maxCharacters !== 8000) throw new Error("contents maxCharacters was not sent");
    if (text?.max_characters !== undefined) throw new Error("legacy contents casing leaked into request");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousApiKey === undefined) Deno.env.delete("EXA_API_KEY");
    else Deno.env.set("EXA_API_KEY", previousApiKey);
  }
});

Deno.test("filtered research retries without domain filters when Exa returns no results", async () => {
  const originalFetch = globalThis.fetch;
  const previousApiKey = Deno.env.get("EXA_API_KEY");
  const bodies: Array<Record<string, unknown>> = [];
  Deno.env.set("EXA_API_KEY", "test-key");
  globalThis.fetch = ((_input: Request | URL | string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    bodies.push(body);
    const filtered = Array.isArray(body.includeDomains);
    return Promise.resolve(new Response(JSON.stringify({
      results: filtered ? [] : [{
        title: "Official procurement guidance",
        url: "https://gsa.gov/policy/procurement",
        text: "Official government procurement policy and supporting evidence with detailed methodology.",
      }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
  }) as typeof fetch;

  try {
    const result = await deepResearch("federal procurement reform", "United States", {
      provider: "openrouter",
      model: "test-model",
      reasoningEffort: "low",
      callModel: async () => ({ output: { queries: [] } }),
    }, {
      maxFollowUpQueries: 0,
      maxUrlsToRead: 0,
      maxSeedQueries: 1,
      overallTimeoutMs: 1000,
      preferredSourceType: "government",
    });
    if (bodies.length !== 2) throw new Error(`expected filtered request and fallback, got ${bodies.length}`);
    if (!Array.isArray(bodies[0].includeDomains)) throw new Error("first request was not domain-filtered");
    if (bodies[1].includeDomains !== undefined) throw new Error("fallback retained includeDomains");
    if (!result.rankedResults.some((item) => item.url?.includes("gsa.gov"))) throw new Error("fallback result was lost");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousApiKey === undefined) Deno.env.delete("EXA_API_KEY");
    else Deno.env.set("EXA_API_KEY", previousApiKey);
  }
});

Deno.test("JSON body timeout cancels a read that stalled after headers", async () => {
  const originalFetch = globalThis.fetch;
  let bodyStartedResolve!: () => void;
  let bodyAbortedResolve!: () => void;
  const bodyStarted = new Promise<void>((resolve) => bodyStartedResolve = resolve);
  const bodyAborted = new Promise<void>((resolve) => bodyAbortedResolve = resolve);

  globalThis.fetch = ((_input: Request | URL | string, init?: RequestInit) => Promise.resolve({
    ok: true,
    json: () => {
      bodyStartedResolve();
      return new Promise<never>((_resolve, reject) => {
        const onAbort = () => {
          bodyAbortedResolve();
          reject(init?.signal?.reason ?? new DOMException("The operation was aborted", "AbortError"));
        };
        if (init?.signal?.aborted) onAbort();
        else init?.signal?.addEventListener("abort", onAbort, { once: true });
      });
    },
  } as unknown as Response)) as typeof fetch;

  try {
    const startedAt = performance.now();
    const pending = fetchJsonWithTimeout("https://api.exa.ai/search", {}, 5);
    await Promise.race([
      bodyStarted,
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error("response body was not read")), 100)),
    ]);
    const settled = await Promise.race([
      pending.then(() => "resolved", () => "rejected"),
      new Promise<string>((resolve) => setTimeout(() => resolve("still pending"), 100)),
    ]);
    if (settled !== "rejected") throw new Error(`JSON body timeout did not settle: ${settled}`);
    const bodyCancelled = await Promise.race([
      bodyAborted.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
    ]);
    if (!bodyCancelled) throw new Error("timeout did not cancel the response body");
    if (performance.now() - startedAt > 100) throw new Error("JSON body timeout exceeded bound");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("JSON helper aborts a loopback response body read", async () => {
  let bodyReadStartedResolve!: () => void;
  let releaseStalledPull!: () => void;
  let bodyReadStarted = false;
  const bodyStarted = new Promise<void>((resolve) => bodyReadStartedResolve = resolve);
  const stalledPull = new Promise<void>((resolve) => releaseStalledPull = resolve);
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!bodyReadStarted) {
        bodyReadStarted = true;
        controller.enqueue(encoder.encode('{"partial":'));
        bodyReadStartedResolve();
      }
      return stalledPull;
    },
    cancel() {
      releaseStalledPull();
    },
  });
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0 },
    () => new Response(body, { headers: { "content-type": "application/json" } }),
  );

  try {
    const address = server.addr;
    if (address.transport !== "tcp") throw new Error("loopback test server did not use TCP");
    const caller = new AbortController();
    const pending = fetchJsonWithTimeout(
      `http://${address.hostname}:${address.port}/stalled-json`,
      {},
      5000,
      caller.signal,
    );
    await Promise.race([
      bodyStarted,
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error("response body was not read")), 500)),
    ]);
    caller.abort(new DOMException("Test cancellation", "AbortError"));

    const settled = await Promise.race([
      pending.then(() => "resolved", () => "rejected"),
      new Promise<string>((resolve) => setTimeout(() => resolve("still pending"), 500)),
    ]);
    if (settled !== "rejected") throw new Error(`loopback JSON read did not reject: ${settled}`);
  } finally {
    releaseStalledPull();
    await server.shutdown();
    await server.finished;
  }
});

Deno.test("JSON helper consumes non-OK error bodies within the same timeout", async () => {
  const originalFetch = globalThis.fetch;
  let bodyStartedResolve!: () => void;
  const bodyStarted = new Promise<void>((resolve) => bodyStartedResolve = resolve);

  globalThis.fetch = ((_input: Request | URL | string) => Promise.resolve({
    ok: false,
    status: 429,
    text: () => {
      bodyStartedResolve();
      return Promise.resolve("provider throttled");
    },
  } as unknown as Response)) as typeof fetch;

  try {
    const result = await fetchJsonWithTimeout(
      "https://api.example.test/provider",
      {},
      50,
      undefined,
    );
    await Promise.race([
      bodyStarted,
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error("non-OK body was not read")), 100)),
    ]);
    if (result.response.status !== 429 || result.errorBody !== "provider throttled") {
      throw new Error(`non-OK body was not preserved: ${JSON.stringify(result)}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("JSON helper rejects a successful provider body over the byte cap", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((_input: Request | URL | string) => Promise.resolve(
    new Response(JSON.stringify({ payload: "x".repeat(MAX_PROVIDER_RESPONSE_BYTES) }), {
      headers: { "content-type": "application/json" },
    }),
  )) as typeof fetch;

  try {
    const result = await fetchJsonWithTimeout("https://api.example.test/oversized", {}, 500);
    throw new Error(`oversized provider response unexpectedly resolved: ${JSON.stringify(result)}`);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("exceeds")) {
      throw new Error(`unexpected oversized response error: ${String(error)}`);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("JSON helper accepts a successful provider body exactly at the byte cap", async () => {
  const originalFetch = globalThis.fetch;
  const prefix = '{"payload":"';
  const suffix = '"}';
  const body = `${prefix}${"x".repeat(MAX_PROVIDER_RESPONSE_BYTES - prefix.length - suffix.length)}${suffix}`;
  globalThis.fetch = ((_input: Request | URL | string) => Promise.resolve(
    new Response(body, { headers: { "content-type": "application/json" } }),
  )) as typeof fetch;

  try {
    const result = await fetchJsonWithTimeout<{ payload: string }>("https://api.example.test/exact", {}, 500);
    if (result.data?.payload.length !== MAX_PROVIDER_RESPONSE_BYTES - prefix.length - suffix.length) {
      throw new Error("exact-limit response body was not preserved");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("JSON helper truncates non-OK provider bodies to the error character cap", async () => {
  const originalFetch = globalThis.fetch;
  const errorText = "provider failure ".repeat(MAX_PROVIDER_ERROR_BODY_CHARS);
  globalThis.fetch = ((_input: Request | URL | string) => Promise.resolve(
    new Response(errorText, { status: 503 }),
  )) as typeof fetch;

  try {
    const result = await fetchJsonWithTimeout("https://api.example.test/error", {}, 500);
    if (result.errorBody?.length !== MAX_PROVIDER_ERROR_BODY_CHARS) {
      throw new Error(`error body was not capped: ${result.errorBody?.length ?? 0}`);
    }
    if (!result.errorBody?.startsWith("provider failure")) throw new Error("error body prefix was lost");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("research timeout stays bounded and marks accounting incomplete", async () => {
  let providerCompletedAt: number | undefined;
  let timeoutMarked = false;
  const deps = {
    provider: "openrouter" as const,
    model: "test-model",
    reasoningEffort: "low" as const,
    onTimeout: () => {
      timeoutMarked = true;
    },
    callModel: () => new Promise<{ output: unknown }>((resolve) => {
      // Simulate a dependency that ignores AbortSignal. The caller must not
      // wait for this work, and its late result must stay detached.
      setTimeout(() => {
        providerCompletedAt = Date.now();
        resolve({ output: { queries: [] } });
      }, 100);
    }),
  };

  const startedAt = performance.now();
  await deepResearch("test claim", "", deps, {
    maxFollowUpQueries: 1,
    maxUrlsToRead: 0,
    maxSeedQueries: 0,
    overallTimeoutMs: 5,
  });
  const researchReturnedAt = Date.now();
  if (performance.now() - startedAt > 80) throw new Error("non-cooperative work delayed timeout return");
  if (!timeoutMarked) throw new Error("timeout accounting was not marked incomplete");

  await new Promise((resolve) => setTimeout(resolve, 120));
  if (providerCompletedAt === undefined || providerCompletedAt <= researchReturnedAt) {
    throw new Error("late non-cooperative work did not remain detached");
  }
});
