import {
  rejectedBearerCases,
  runBearerCases,
  TEST_ANON_KEY,
  TEST_SUPABASE_URL,
  VALID_TOKEN,
} from "../_shared/testing/bearer-auth.ts";

for (const [key, value] of Object.entries({
  SUPABASE_URL: TEST_SUPABASE_URL,
  SUPABASE_ANON_KEY: TEST_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
})) Deno.env.set(key, value);

const { handleRequest } = await import("./index.ts");

const send = (authorization?: string) =>
  new Request("http://127.0.0.1/functions/v1/export-gdoc", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization === undefined ? {} : { Authorization: authorization }),
    },
    body: JSON.stringify({}),
  });

// The browser reads `error` and treats any 401 as "sign in again", so the
// function keeps its { error: "Unauthorized", details } shape.
Deno.test("export-gdoc refuses missing, empty, non-Bearer and rejected tokens in its own error shape", async () => {
  await runBearerCases(handleRequest, send, rejectedBearerCases({
    required: { error: "Unauthorized", details: "Authentication required" },
    invalid: { error: "Unauthorized", details: "Invalid authentication token" },
  }));
});

Deno.test("export-gdoc lets a valid token through to request validation", async () => {
  await runBearerCases(handleRequest, send, [{
    label: "valid token",
    authorization: `Bearer ${VALID_TOKEN}`,
    status: 400,
    body: { error: "Missing data" },
    authCalls: 1,
  }]);
});
