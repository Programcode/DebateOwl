import { assertEquals } from "jsr:@std/assert@1.0.19";
import {
  createTestChain,
  notificationPayload,
  renewalPayload,
  signJws,
  TEST_APP_APPLE_ID,
  TEST_BUNDLE_ID,
  transactionPayload,
} from "../_shared/testing/app-store-chain.ts";

for (const [key, value] of Object.entries({
  SUPABASE_URL: "https://supabase.test",
  SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
})) Deno.env.set(key, value);

const { createHandler } = await import("./index.ts");
const { APPLE_ROOTS, AppStoreConfigError } = await import("../_shared/app-store.ts");
type NotificationDeps = import("./index.ts").NotificationDeps;
type ApplyArgs = import("../_shared/app-store.ts").ApplyArgs;
type ApplyResult = import("../_shared/app-store.ts").ApplyResult;

const chain = await createTestChain();
const config = { bundleId: TEST_BUNDLE_ID, environments: ["Production" as const], appAppleId: TEST_APP_APPLE_ID };
const USER = "e0000000-0000-4000-8000-000000000030";

function harness(results: ApplyResult[] = ["applied"], overrides: Partial<NotificationDeps> = {}) {
  const applied: ApplyArgs[] = [];
  const handler = createHandler({
    roots: [chain.rootDer],
    config: () => config,
    apply: (args) => {
      applied.push(args);
      return Promise.resolve(results[applied.length - 1] ?? "applied");
    },
    ...overrides,
  });
  const post = (body: unknown) => handler(new Request("https://edge.test/app-store-notifications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
  return { applied, post };
}

async function signedNotification(
  type: string,
  subtype: string | undefined,
  transaction: Record<string, unknown> = {},
  data: Record<string, unknown> = {},
) {
  return await signJws(chain, notificationPayload({
    signedTransactionInfo: await signJws(chain, transactionPayload({ appAccountToken: USER, ...transaction })),
    signedRenewalInfo: await signJws(chain, renewalPayload()),
    ...data,
  }, { notificationType: type, subtype, notificationUUID: crypto.randomUUID() }));
}

Deno.test("each subscription notification type applies its signed transaction for the token's user", async () => {
  const types: Array<[string, string | undefined, Record<string, unknown>]> = [
    ["SUBSCRIBED", "INITIAL_BUY", {}],
    ["DID_RENEW", undefined, {}],
    ["DID_CHANGE_RENEWAL_STATUS", "AUTO_RENEW_DISABLED", {}],
    ["DID_FAIL_TO_RENEW", "GRACE_PERIOD", {}],
    ["EXPIRED", "VOLUNTARY", { expiresDate: Date.now() - 1000 }],
    ["GRACE_PERIOD_EXPIRED", undefined, { expiresDate: Date.now() - 1000 }],
    ["REFUND", undefined, { revocationDate: Date.now(), revocationReason: 0 }],
    ["REVOKE", undefined, { revocationDate: Date.now(), inAppOwnershipType: "FAMILY_SHARED" }],
  ];
  for (const [type, subtype, transaction] of types) {
    const { applied, post } = harness();
    const response = await post({ signedPayload: await signedNotification(type, subtype, transaction) });
    assertEquals(response.status, 200, type);
    assertEquals(await response.json(), { received: true, result: "applied" }, type);
    assertEquals(applied.length, 1, type);
    assertEquals(applied[0].userId, USER, type);
    assertEquals(applied[0].notification?.notificationType, type, type);
    assertEquals(applied[0].notification?.subtype, subtype, type);
    assertEquals(applied[0].renewal?.autoRenew, true, type);
  }
  const { applied, post } = harness();
  await post({ signedPayload: await signedNotification("REFUND", undefined, { revocationDate: 1_800_000_000_000, revocationReason: 1 }) });
  assertEquals(applied[0].transaction?.revocationDate, new Date(1_800_000_000_000).toISOString());
  const revoke = harness();
  await revoke.post({ signedPayload: await signedNotification("REVOKE", undefined, { revocationDate: Date.now(), inAppOwnershipType: "FAMILY_SHARED" }) });
  assertEquals(revoke.applied[0].transaction?.familyShared, true);
});

Deno.test("a redelivered notification is acknowledged without being applied twice", async () => {
  const { applied, post } = harness(["applied", "duplicate"]);
  const signedPayload = await signedNotification("DID_RENEW", undefined);
  assertEquals((await (await post({ signedPayload })).json()).result, "applied");
  const again = await post({ signedPayload });
  assertEquals(again.status, 200);
  assertEquals((await again.json()).result, "duplicate");
  assertEquals(applied[0].notification?.notificationUUID, applied[1].notification?.notificationUUID);
});

Deno.test("an unknown product or an unlinked purchase is acknowledged so Apple stops retrying", async () => {
  for (const result of ["unknown_product", "unlinked"] as const) {
    const { post } = harness([result]);
    const response = await post({ signedPayload: await signedNotification("SUBSCRIBED", "INITIAL_BUY", { productId: "com.example.unknown" }) });
    assertEquals(response.status, 200);
    assertEquals((await response.json()).result, result);
  }
});

Deno.test("a transaction without appAccountToken is passed on unlinked", async () => {
  const { applied, post } = harness(["unlinked"]);
  const response = await post({ signedPayload: await signedNotification("DID_RENEW", undefined, { appAccountToken: undefined }) });
  assertEquals(response.status, 200);
  assertEquals(applied[0].userId, null);
});

Deno.test("a notification that fails verification is refused and applies nothing", async () => {
  const other = await createTestChain();
  const forged = await signJws(other, notificationPayload({ signedTransactionInfo: await signJws(other, transactionPayload()) }));
  const cases: Array<[string, string]> = [
    [forged, "invalid_chain"],
    [await signedNotification("DID_RENEW", undefined, {}, { bundleId: "com.example.other" }), "wrong_app"],
    [await signedNotification("DID_RENEW", undefined, {}, { environment: "Sandbox" }), "wrong_environment"],
    ["not-a-jws", "malformed"],
  ];
  for (const [signedPayload, code] of cases) {
    const { applied, post } = harness();
    const response = await post({ signedPayload });
    assertEquals([response.status, (await response.json()).error], [400, code], code);
    assertEquals(applied.length, 0, code);
  }
});

Deno.test("production pins Apple's root, so a test-signed notification is refused", async () => {
  const { applied, post } = harness(["applied"], { roots: APPLE_ROOTS });
  const response = await post({ signedPayload: await signedNotification("DID_RENEW", undefined) });
  assertEquals(response.status, 400);
  assertEquals(applied.length, 0);
});

Deno.test("a notification without app data is acknowledged and ignored", async () => {
  const { applied, post } = harness();
  const signedPayload = await signJws(chain, {
    notificationType: "EXTERNAL_PURCHASE_TOKEN",
    notificationUUID: crypto.randomUUID(),
    signedDate: Date.now(),
  });
  const response = await post({ signedPayload });
  assertEquals(response.status, 200);
  assertEquals((await response.json()).result, "ignored");
  assertEquals(applied.length, 0);
});

Deno.test("a database failure or missing configuration asks Apple to retry later", async () => {
  const failing = harness(["applied"], { apply: () => Promise.reject(new Error("db down")) });
  assertEquals((await failing.post({ signedPayload: await signedNotification("DID_RENEW", undefined) })).status, 500);
  const unconfigured = harness(["applied"], {
    config: () => {
      throw new AppStoreConfigError("APP_STORE_BUNDLE_ID is not set");
    },
  });
  assertEquals((await unconfigured.post({ signedPayload: await signedNotification("DID_RENEW", undefined) })).status, 503);
  assertEquals(unconfigured.applied.length, 0);
});

Deno.test("a body without signedPayload is refused", async () => {
  const { post } = harness();
  assertEquals((await post({})).status, 400);
  assertEquals((await post("not json")).status, 400);
});
