import { assertEquals } from "jsr:@std/assert@1.0.19";
import {
  forwardFetchToCurrentStub,
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
  STRIPE_SECRET_KEY: "sk_test_not_used",
  STRIPE_PRICE_ID: "price_test123",
})) Deno.env.set(key, value);

forwardFetchToCurrentStub();
const { handleRequest } = await import("./index.ts");

const send = (authorization?: string) =>
  new Request("http://127.0.0.1/functions/v1/create-checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization === undefined ? {} : { Authorization: authorization }),
    },
    body: JSON.stringify({}),
  });

Deno.test("create-checkout refuses missing, empty, non-Bearer and rejected tokens with the shared auth errors", async () => {
  await runBearerCases(handleRequest, send, rejectedBearerCases({ required: { error: "Authentication required" }, invalid: { error: "Invalid authentication token" } }));
});

Deno.test("create-checkout lets a valid token through to request validation", async () => {
  await runBearerCases(handleRequest, send, [{
    label: "valid token",
    authorization: `Bearer ${VALID_TOKEN}`,
    status: 400,
    body: { error: "Missing required fields: successUrl, cancelUrl" },
    authCalls: 1,
  }]);
});

// One Checkout with a promo code against fake Supabase and Stripe backends.
// Returns what the claim RPC and Stripe's session create were sent.
async function checkoutWithPromo(claim: unknown, expected: { status: number; body: unknown }) {
  const sent = { claims: [] as { body: unknown; authorization: string | null }[], sessions: [] as URLSearchParams[] };
  const request = (authorization?: string) =>
    new Request("http://127.0.0.1/functions/v1/create-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(authorization ? { Authorization: authorization } : {}) },
      body: JSON.stringify({
        successUrl: "https://debate.pi-stack.org/app/settings?checkout=success",
        cancelUrl: "https://debate.pi-stack.org/app/settings?checkout=canceled",
        promoCode: "SPRING",
      }),
    });
  await runBearerCases(handleRequest, request, [{
    label: "checkout with a promo code",
    authorization: `Bearer ${VALID_TOKEN}`,
    ...expected,
    authCalls: 1,
  }], (url, headers, init) => {
    if (url.origin === TEST_SUPABASE_URL) {
      if (url.pathname === "/rest/v1/subscriptions") return Response.json([]);
      if (url.pathname === "/rest/v1/rpc/redeem_promo_code_atomic") {
        sent.claims.push({ body: JSON.parse(String(init?.body)), authorization: headers.get("authorization") });
        return Response.json(claim);
      }
      if (url.pathname === "/rest/v1/stripe_customers") return new Response(null, { status: 201 });
    }
    if (url.hostname === "api.stripe.com") {
      if (url.pathname === "/v1/prices/price_test123") {
        return Response.json({ id: "price_test123", object: "price", active: true, type: "recurring" });
      }
      if (url.pathname === "/v1/customers/search") {
        return Response.json({ object: "search_result", data: [{ id: "cus_test", metadata: { user_id: TEST_USER.id } }] });
      }
      if (url.pathname === "/v1/checkout/sessions") {
        sent.sessions.push(new URLSearchParams(String(init?.body)));
        return Response.json({ id: "cs_test", object: "checkout.session", url: "https://checkout.stripe.test/cs_test" });
      }
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  return sent;
}

Deno.test("create-checkout applies exactly the claimed Stripe promotion code and never opens Stripe's promo field", async () => {
  const sent = await checkoutWithPromo(
    { success: true, promoType: "discount", stripePromotionCode: "promo_Spring1" },
    { status: 200, body: { url: "https://checkout.stripe.test/cs_test", priceId: "price_test123" } },
  );
  assertEquals(sent.claims, [{ body: { p_code: "SPRING", p_discount_only: true }, authorization: `Bearer ${VALID_TOKEN}` }]);
  assertEquals(sent.sessions.length, 1);
  assertEquals(sent.sessions[0].get("discounts[0][promotion_code]"), "promo_Spring1");
  assertEquals(sent.sessions[0].has("allow_promotion_codes"), false);
});

Deno.test("create-checkout refuses a promo code the claim RPC refuses, before any Checkout session", async () => {
  const sent = await checkoutWithPromo(
    { success: false, message: "Invalid or expired promo code" },
    { status: 400, body: { error: "Invalid or expired promo code", code: "promo_invalid" } },
  );
  assertEquals(sent.claims.length, 1);
  assertEquals(sent.sessions.length, 0);
});
