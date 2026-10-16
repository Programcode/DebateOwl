import { rejectedBearerCases, runBearerCases, TEST_ANON_KEY, TEST_SUPABASE_URL, VALID_TOKEN } from "../_shared/testing/bearer-auth.ts";

for (const [key, value] of Object.entries({
  SUPABASE_URL: TEST_SUPABASE_URL,
  SUPABASE_ANON_KEY: TEST_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
})) Deno.env.set(key, value);
const { handleRequest } = await import("./index.ts");

Deno.test("ai authenticates before parsing malformed JSON", async () => {
  await runBearerCases(handleRequest, (authorization) => new Request("http://127.0.0.1/functions/v1/ai", {
    method: "POST", headers: authorization ? { Authorization: authorization } : {}, body: "{",
  }), rejectedBearerCases({ required: { error: "Authentication required" }, invalid: { error: "Invalid authentication token" } }));
});

Deno.test("ai rejects unknown, inherited and oversized features before quota or routing", async () => {
  for (const feature of ["zzz", "toString", "__proto__", "x".repeat(190_000)]) {
    await runBearerCases(handleRequest, (authorization) => new Request("http://127.0.0.1/functions/v1/ai", {
      method: "POST", headers: { Authorization: authorization! },
      body: JSON.stringify({ feature, model: "auto-fast", input: { message: "hello" } }),
    }), [{ label: `feature length ${feature.length}`, authorization: `Bearer ${VALID_TOKEN}`, status: 400, body: { error: "Unsupported feature" }, authCalls: 1 }]);
  }
});
