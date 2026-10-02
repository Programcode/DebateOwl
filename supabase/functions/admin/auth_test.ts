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
  new Request("http://127.0.0.1/functions/v1/admin?action=announcements", {
    method: "GET",
    headers: authorization === undefined ? {} : { Authorization: authorization },
  });

Deno.test("admin refuses missing, empty, non-Bearer and rejected tokens with the shared auth errors", async () => {
  await runBearerCases(handleRequest, send, rejectedBearerCases({ required: { error: "Authentication required" }, invalid: { error: "Invalid authentication token" } }));
});

Deno.test("admin checks the role of the user the token belongs to", async () => {
  const roleQueries: string[] = [];
  await runBearerCases(handleRequest, send, [{
    label: "valid token, ordinary user",
    authorization: `Bearer ${VALID_TOKEN}`,
    status: 403,
    body: { error: "Admin access required" },
    authCalls: 1,
  }], (url) => {
    if (url.pathname !== "/rest/v1/user_roles") throw new Error(`Unexpected request: ${url}`);
    roleQueries.push(url.searchParams.get("user_id") ?? "");
    return Response.json({ role: "user" });
  });
  if (roleQueries.join() !== `eq.${TEST_USER.id}`) throw new Error(`role lookups: ${roleQueries.join()}`);
});
