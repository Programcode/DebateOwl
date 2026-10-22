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
  STRIPE_SECRET_KEY: "sk_test_not_used",
})) Deno.env.set(key, value);

const { handleRequest, subscriptionStillPaid } = await import("./index.ts");

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

Deno.test("subscriptionStillPaid blocks only an active or trialing period that has not ended", () => {
  const future = "2099-01-01T00:00:00.000Z";
  const past = "2000-01-01T00:00:00.000Z";
  const now = Date.parse("2026-10-22T00:00:00.000Z");
  if (!subscriptionStillPaid({ status: "active", current_period_end: future }, now)) throw new Error("active future");
  if (!subscriptionStillPaid({ status: "trialing", current_period_end: future }, now)) throw new Error("trialing future");
  if (subscriptionStillPaid({ status: "active", current_period_end: past }, now)) throw new Error("active past");
  if (subscriptionStillPaid({ status: "canceled", current_period_end: future }, now)) throw new Error("canceled");
  if (subscriptionStillPaid({ status: "past_due", current_period_end: future }, now)) throw new Error("past_due");
  if (subscriptionStillPaid(null, now)) throw new Error("missing row");
});

const sendCheckout = (authorization?: string) =>
  new Request("http://127.0.0.1/functions/v1/create-checkout", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(authorization === undefined ? {} : { Authorization: authorization }),
    },
    body: JSON.stringify({
      successUrl: "https://debate.pi-stack.org/app/settings?checkout=success",
      cancelUrl: "https://debate.pi-stack.org/app/settings?checkout=canceled",
    }),
  });

Deno.test("create-checkout refuses a second purchase while Pro is still paid", async () => {
  const calls: string[] = [];
  await runBearerCases(handleRequest, sendCheckout, [{
    label: "already subscribed",
    authorization: `Bearer ${VALID_TOKEN}`,
    status: 409,
    body: { error: "You already have an active Pro subscription.", code: "ALREADY_SUBSCRIBED" },
    authCalls: 1,
  }], (url) => {
    calls.push(url.pathname);
    if (url.pathname.endsWith("/rest/v1/subscriptions")) {
      return Response.json({ status: "active", current_period_end: "2099-01-01T00:00:00.000Z" });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  if (calls.some((path) => path.includes("stripe") || path.includes("checkout"))) {
    throw new Error(`Stripe was contacted: ${calls.join(", ")}`);
  }
});

Deno.test("create-checkout fails closed when the subscription lookup errors", async () => {
  await runBearerCases(handleRequest, sendCheckout, [{
    label: "lookup failed",
    authorization: `Bearer ${VALID_TOKEN}`,
    status: 503,
    body: { error: "Could not confirm your subscription. Try again in a moment." },
    authCalls: 1,
  }], (url) => {
    if (url.pathname.endsWith("/rest/v1/subscriptions")) {
      return Response.json({ message: "db down" }, { status: 500 });
    }
    throw new Error(`Unexpected request: ${url}`);
  });
});
