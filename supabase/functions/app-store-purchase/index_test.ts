import { assertEquals } from "jsr:@std/assert@1.0.19";
import {
  rejectedBearerCases,
  runBearerCases,
  TEST_ANON_KEY,
  TEST_SUPABASE_URL,
  TEST_USER,
} from "../_shared/testing/bearer-auth.ts";
import {
  createTestChain,
  renewalPayload,
  signJws,
  TEST_APP_APPLE_ID,
  TEST_BUNDLE_ID,
  transactionPayload,
} from "../_shared/testing/app-store-chain.ts";

for (const [key, value] of Object.entries({
  SUPABASE_URL: TEST_SUPABASE_URL,
  SUPABASE_ANON_KEY: TEST_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
})) Deno.env.set(key, value);

const { HttpError, requireUser } = await import("../_shared/auth.ts");
const { createHandler } = await import("./index.ts");
type PurchaseDeps = import("./index.ts").PurchaseDeps;
type ApplyArgs = import("../_shared/app-store.ts").ApplyArgs;
type ApplyResult = import("../_shared/app-store.ts").ApplyResult;

const chain = await createTestChain();
const config = { bundleId: TEST_BUNDLE_ID, environments: ["Production" as const], appAppleId: TEST_APP_APPLE_ID };
const PRO = { tier: "pro", state: "pro" as const, refusal: null, dailyLimit: 50, canAccessProModels: true, trialEndsAt: null, gracePeriodEndsAt: null };

function harness(result: ApplyResult = "applied", overrides: Partial<PurchaseDeps> = {}) {
  const applied: ApplyArgs[] = [];
  const handler = createHandler({
    roots: [chain.rootDer],
    config: () => config,
    authenticate: () => Promise.resolve({ id: TEST_USER.id }),
    apply: (args) => {
      applied.push(args);
      return Promise.resolve(result);
    },
    entitlement: () => Promise.resolve(PRO),
    ...overrides,
  });
  const post = (body: unknown) => handler(new Request("https://edge.test/app-store-purchase", {
    method: "POST",
    headers: { authorization: "Bearer token", "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  return { applied, post };
}

const ownTransaction = (overrides: Record<string, unknown> = {}) =>
  signJws(chain, transactionPayload({ appAccountToken: TEST_USER.id, ...overrides }));

Deno.test("app-store-purchase refuses missing, empty, non-Bearer and rejected tokens", async () => {
  const handler = createHandler({
    roots: [chain.rootDer],
    config: () => config,
    authenticate: async (req) => (await requireUser(req)).user,
    apply: () => Promise.reject(new Error("must not apply")),
    entitlement: () => Promise.reject(new Error("must not read")),
  });
  const send = (authorization?: string) => new Request("http://127.0.0.1/functions/v1/app-store-purchase", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(authorization === undefined ? {} : { Authorization: authorization }) },
    body: JSON.stringify({ signedTransaction: "x.y.z" }),
  });
  await runBearerCases(handler, send, rejectedBearerCases({
    required: { error: "Authentication required" },
    invalid: { error: "Invalid authentication token" },
  }));
});

Deno.test("a verified purchase of the caller's own is applied for the caller and returns the plan", async () => {
  const { applied, post } = harness();
  const response = await post({
    signedTransaction: await ownTransaction(),
    signedRenewalInfo: await signJws(chain, renewalPayload()),
  });
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { result: "applied", entitlement: PRO });
  assertEquals(applied.length, 1);
  assertEquals(applied[0].userId, TEST_USER.id);
  assertEquals(applied[0].transaction?.originalTransactionId, "2000000000000001");
  assertEquals(applied[0].renewal?.autoRenew, true);
  assertEquals(applied[0].notification, undefined);
});

Deno.test("a purchase made by another account cannot be claimed", async () => {
  for (const token of ["22222222-2222-4222-8222-222222222222", undefined]) {
    const { applied, post } = harness();
    const response = await post({ signedTransaction: await signJws(chain, transactionPayload({ appAccountToken: token })) });
    assertEquals(response.status, 403);
    assertEquals((await response.json()).code, "account_mismatch");
    assertEquals(applied.length, 0);
  }
});

Deno.test("an unverifiable purchase is refused before anything is applied", async () => {
  const other = await createTestChain();
  const cases: Array<[string, number, string]> = [
    [await signJws(other, transactionPayload({ appAccountToken: TEST_USER.id })), 400, "invalid_chain"],
    [await ownTransaction({ bundleId: "com.example.other" }), 400, "wrong_app"],
    [await ownTransaction({ environment: "Sandbox" }), 400, "wrong_environment"],
    [await ownTransaction({ type: "Non-Consumable" }), 422, "unsupported_product"],
    ["not-a-jws", 400, "malformed"],
    // A signature segment that is not base64url, and a date no Date can hold.
    [(await ownTransaction()).replace(/[^.]+$/, "not!base64"), 400, "malformed"],
    [await ownTransaction({ expiresDate: 1e20 }), 400, "malformed"],
  ];
  for (const [signedTransaction, status, code] of cases) {
    const { applied, post } = harness();
    const response = await post({ signedTransaction });
    assertEquals([response.status, (await response.json()).code], [status, code], code);
    assertEquals(applied.length, 0, code);
  }
});

Deno.test("renewal info for another subscription is refused", async () => {
  const { applied, post } = harness();
  const response = await post({
    signedTransaction: await ownTransaction(),
    signedRenewalInfo: await signJws(chain, renewalPayload({ originalTransactionId: "999" })),
  });
  assertEquals(response.status, 400);
  assertEquals(applied.length, 0);
});

Deno.test("a replayed purchase changes nothing and still returns the current plan", async () => {
  const { post } = harness("stale");
  const response = await post({ signedTransaction: await ownTransaction() });
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { result: "stale", entitlement: PRO });
});

Deno.test("an unknown product or a subscription owned by another user is refused", async () => {
  for (const [result, status, code] of [["unknown_product", 422, "unknown_product"], ["user_mismatch", 409, "account_mismatch"]] as const) {
    const { post } = harness(result);
    const response = await post({ signedTransaction: await ownTransaction() });
    assertEquals([response.status, (await response.json()).code], [status, code]);
  }
});

Deno.test("purchases wait for configuration instead of guessing it", async () => {
  const { AppStoreConfigError } = await import("../_shared/app-store.ts");
  const { applied, post } = harness("applied", {
    config: () => {
      throw new AppStoreConfigError("APP_STORE_BUNDLE_ID is not set");
    },
  });
  const response = await post({ signedTransaction: await ownTransaction() });
  assertEquals(response.status, 503);
  assertEquals(applied.length, 0);
});

Deno.test("a failed write is reported so the app can retry", async () => {
  const { post } = harness("applied", { apply: () => Promise.reject(new HttpError(500, "db down")) });
  const response = await post({ signedTransaction: await ownTransaction() });
  assertEquals(response.status, 500);
  assertEquals((await response.json()).code, "storage_failed");
});
