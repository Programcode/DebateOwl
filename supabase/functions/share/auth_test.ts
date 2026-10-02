import {
  rejectedBearerCases,
  runBearerCases,
  TEST_ANON_KEY,
  TEST_SUPABASE_URL,
  TEST_USER,
  VALID_TOKEN,
} from "../_shared/testing/bearer-auth.ts";

for (const [key, value] of Object.entries({
  SUPABASE_URL: TEST_SUPABASE_URL,
  SUPABASE_ANON_KEY: TEST_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
})) Deno.env.set(key, value);

const { handleRequest } = await import("./index.ts");

const send = (authorization?: string) =>
  new Request("http://127.0.0.1/functions/v1/share", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization === undefined ? {} : { Authorization: authorization }),
    },
    body: JSON.stringify({ itemType: "case", itemData: { motion: "This house would test" } }),
  });

Deno.test("share refuses missing, empty, non-Bearer and rejected tokens with the shared auth errors", async () => {
  await runBearerCases(handleRequest, send, rejectedBearerCases({ required: { error: "Authentication required" }, invalid: { error: "Invalid authentication token" } }));
});

Deno.test("share records the token's user as the creator", async () => {
  const creators: unknown[] = [];
  await runBearerCases(handleRequest, send, [{
    label: "valid token",
    authorization: `Bearer ${VALID_TOKEN}`,
    status: 200,
    body: { shareCode: "abc123", shareUrl: "https://debate.pi-stack.org/share/abc123", expiresAt: null },
    authCalls: 1,
  }], (url, _headers, init) => {
    if (url.pathname !== "/rest/v1/shared_items") throw new Error(`Unexpected request: ${url}`);
    creators.push((JSON.parse(String(init?.body)) as { created_by?: unknown }).created_by);
    return Response.json({ share_code: "abc123", expires_at: null }, { status: 201 });
  });
  if (JSON.stringify(creators) !== JSON.stringify([TEST_USER.id])) throw new Error(`creators: ${JSON.stringify(creators)}`);
});
