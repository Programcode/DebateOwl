import {
  forwardFetchToCurrentStub,
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
  STRIPE_SECRET_KEY: "sk_test_not_used",
})) Deno.env.set(key, value);

forwardFetchToCurrentStub();
const { handleRequest } = await import("./index.ts");

const send = (authorization?: string) =>
  new Request("http://127.0.0.1/functions/v1/create-portal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization === undefined ? {} : { Authorization: authorization }),
    },
    body: JSON.stringify({}),
  });

Deno.test("create-portal refuses missing, empty, non-Bearer and rejected tokens with the shared auth errors", async () => {
  await runBearerCases(handleRequest, send, rejectedBearerCases({ required: { error: "Authentication required" }, invalid: { error: "Invalid authentication token" } }));
});

Deno.test("create-portal lets a valid token through to request validation", async () => {
  await runBearerCases(handleRequest, send, [{
    label: "valid token",
    authorization: `Bearer ${VALID_TOKEN}`,
    status: 400,
    body: { error: "Missing returnUrl" },
    authCalls: 1,
  }]);
});

Deno.test("create-portal answers a Stripe failure with a fixed error, not Stripe's message", async () => {
  const sendWithReturnUrl = (authorization?: string) =>
    new Request("http://127.0.0.1/functions/v1/create-portal", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: authorization } : {}) },
      body: JSON.stringify({ returnUrl: "https://debateowl.com/app/settings" }),
    });
  await runBearerCases(handleRequest, sendWithReturnUrl, [{
    label: "Stripe rejects the portal session",
    authorization: `Bearer ${VALID_TOKEN}`,
    status: 400,
    body: { error: "Could not open the billing portal. Please try again.", code: "portal_failed" },
    authCalls: 1,
  }], (url) => {
    if (url.pathname.endsWith("/rest/v1/app_store_subscriptions")) return Response.json([]);
    if (url.pathname === "/rest/v1/subscriptions") return Response.json({ stripe_customer_id: "cus_leaky123" });
    if (url.hostname === "api.stripe.com" && url.pathname === "/v1/billing_portal/sessions") {
      return Response.json({
        error: { type: "invalid_request_error", message: "No configuration provided for customer cus_leaky123", param: "configuration" },
      }, { status: 400 });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
});
