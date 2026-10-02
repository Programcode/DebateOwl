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
  new Request("http://127.0.0.1/functions/v1/redeem-promo", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization === undefined ? {} : { Authorization: authorization }),
    },
    body: JSON.stringify({ code: " spring " }),
  });

// The browser expects { success, message } from this function.
Deno.test("redeem-promo refuses missing, empty, non-Bearer and rejected tokens in its own error shape", async () => {
  await runBearerCases(handleRequest, send, rejectedBearerCases({
    required: { success: false, message: "Authentication required" },
    invalid: { success: false, message: "Invalid authentication token" },
  }));
});

Deno.test("redeem-promo redeems through a client scoped to the caller's token", async () => {
  const rpcCalls: Array<{ authorization: string | null; apikey: string | null; body: unknown }> = [];
  await runBearerCases(handleRequest, send, [{
    label: "valid token",
    authorization: `Bearer ${VALID_TOKEN}`,
    status: 200,
    body: { success: true, message: "Promo code applied!" },
    authCalls: 1,
  }], (url, headers, init) => {
    if (url.pathname !== "/rest/v1/rpc/redeem_promo_code_atomic") throw new Error(`Unexpected request: ${url}`);
    rpcCalls.push({
      authorization: headers.get("authorization"),
      apikey: headers.get("apikey"),
      body: JSON.parse(String(init?.body)),
    });
    return Response.json({ success: true, message: "Promo code applied!", promoType: "trial" });
  });
  const expected = JSON.stringify([{ authorization: `Bearer ${VALID_TOKEN}`, apikey: TEST_ANON_KEY, body: { p_code: "SPRING" } }]);
  if (JSON.stringify(rpcCalls) !== expected) throw new Error(`RPC calls: ${JSON.stringify(rpcCalls)}`);
});
