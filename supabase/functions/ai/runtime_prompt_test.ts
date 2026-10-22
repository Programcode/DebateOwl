// A missing global prompt is a normal empty result. .single() turns that into
// a PostgREST 406. maybeSingle leaves it as no row.

for (const [key, value] of Object.entries({
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
})) Deno.env.set(key, value);

const { getGlobalPrompt } = await import("./runtime.ts");

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

Deno.test("a missing global prompt is null and the lookup does not demand one object", async () => {
  const accepts: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    if (request.url.includes("/rest/v1/global_prompts")) {
      accepts.push(request.headers.get("Accept") ?? request.headers.get("accept") ?? "");
      return Response.json([]);
    }
    throw new Error(`Unexpected request: ${request.url}`);
  }) as typeof fetch;
  try {
    assertEquals(await getGlobalPrompt("generate"), null, "prompt");
  } finally {
    globalThis.fetch = originalFetch;
  }
  assertEquals(accepts.length, 2, "feature prompt, then the all prompt");
  assertEquals(accepts.every((accept) => !accept.includes("vnd.pgrst.object")), true, "Accept must not require a single object");
});
