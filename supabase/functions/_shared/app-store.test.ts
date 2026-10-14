import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1.0.19";
import {
  APPLE_ROOTS,
  type AppStoreConfig,
  AppStoreConfigError,
  appStoreConfigFromEnv,
  AppStoreVerificationError,
  type VerificationCode,
  verifyNotification,
  verifyTransaction,
} from "./app-store.ts";
import { APPLE_ROOT_CA_G3_SHA256 } from "./apple-root-ca.ts";
import {
  createTestChain,
  notificationPayload,
  renewalPayload,
  signJws,
  TEST_APP_APPLE_ID,
  TEST_BUNDLE_ID,
  transactionPayload,
} from "./testing/app-store-chain.ts";

const config: AppStoreConfig = { bundleId: TEST_BUNDLE_ID, environments: ["Production"], appAppleId: TEST_APP_APPLE_ID };
const chain = await createTestChain();
const roots = [chain.rootDer];

async function rejectsWith(run: () => Promise<unknown>, code: VerificationCode) {
  const error = await assertRejects(run, AppStoreVerificationError);
  assertEquals(error.code, code);
}

async function signedNotification(data: Record<string, unknown> = {}, overrides: Record<string, unknown> = {}) {
  return await signJws(chain, notificationPayload({
    signedTransactionInfo: await signJws(chain, transactionPayload()),
    signedRenewalInfo: await signJws(chain, renewalPayload()),
    ...data,
  }, overrides));
}

Deno.test("the pinned root is Apple Root CA - G3", async () => {
  assertEquals(APPLE_ROOTS.length, 1);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", APPLE_ROOTS[0]));
  assertEquals(Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join(""), APPLE_ROOT_CA_G3_SHA256);
});

Deno.test("a notification signed through the pinned root verifies with its transaction and renewal info", async () => {
  const verified = await verifyNotification(await signedNotification(), config, roots);
  assertEquals(verified?.notificationType, "SUBSCRIBED");
  assertEquals(verified?.environment, "Production");
  assertEquals(verified?.transaction?.record.originalTransactionId, "2000000000000001");
  assertEquals(verified?.transaction?.record.familyShared, false);
  assertEquals(verified?.renewal?.autoRenew, true);
});

Deno.test("production verification pins Apple's root, so a self-made chain fails", async () => {
  await rejectsWith(async () => await verifyNotification(await signedNotification(), config, APPLE_ROOTS), "invalid_chain");
});

Deno.test("a chain from another root fails", async () => {
  const other = await createTestChain();
  await rejectsWith(async () => await verifyTransaction(await signJws(other, transactionPayload()), config, roots), "invalid_chain");
});

Deno.test("a valid outer payload cannot smuggle a transaction signed by another root", async () => {
  const other = await createTestChain();
  const jws = await signedNotification({ signedTransactionInfo: await signJws(other, transactionPayload()) });
  await rejectsWith(() => verifyNotification(jws, config, roots), "invalid_chain");
});

Deno.test("a pinned root in the third x5c slot is not enough when the intermediate is foreign", async () => {
  const other = await createTestChain();
  const mixed = { ...other, x5c: [other.x5c[0], other.x5c[1], chain.x5c[2]] };
  await rejectsWith(async () => await verifyTransaction(await signJws(mixed, transactionPayload()), config, roots), "invalid_chain");
});

Deno.test("certificates without Apple's App Store OIDs fail", async () => {
  for (const options of [{ leafWithoutOid: true }, { intermediateWithoutOid: true }]) {
    const marked = await createTestChain(options);
    await rejectsWith(
      async () => await verifyTransaction(await signJws(marked, transactionPayload()), config, [marked.rootDer]),
      "invalid_chain",
    );
  }
});

Deno.test("a leaf that was not valid at signedDate fails", async () => {
  const expired = await createTestChain({ leafNotBefore: new Date(Date.now() - 10 * 86_400_000), leafNotAfter: new Date(Date.now() - 86_400_000) });
  await rejectsWith(
    async () => await verifyTransaction(await signJws(expired, transactionPayload()), config, [expired.rootDer]),
    "invalid_chain",
  );
});

Deno.test("a chain that is not three certificates long fails", async () => {
  const short = { ...chain, x5c: chain.x5c.slice(0, 2) };
  await rejectsWith(async () => await verifyTransaction(await signJws(short, transactionPayload()), config, roots), "invalid_chain");
});

Deno.test("an algorithm other than ES256 fails before the chain is read", async () => {
  await rejectsWith(async () => await verifyTransaction(await signJws(chain, transactionPayload(), { alg: "none" }), config, roots), "invalid_signature");
});

Deno.test("a payload changed after signing fails", async () => {
  const [head, , signature] = (await signJws(chain, transactionPayload())).split(".");
  const forged = btoa(JSON.stringify(transactionPayload({ expiresDate: Date.now() + 1e12 }))).replace(/=+$/, "");
  await rejectsWith(() => verifyTransaction(`${head}.${forged}.${signature}`, config, roots), "invalid_signature");
});

Deno.test("a transaction for another bundle fails", async () => {
  await rejectsWith(
    async () => await verifyTransaction(await signJws(chain, transactionPayload({ bundleId: "com.example.other" })), config, roots),
    "wrong_app",
  );
});

Deno.test("a notification for another bundle or app id fails", async () => {
  await rejectsWith(async () => await verifyNotification(await signedNotification({ bundleId: "com.example.other" }), config, roots), "wrong_app");
  await rejectsWith(async () => await verifyNotification(await signedNotification({ appAppleId: 1 }), config, roots), "wrong_app");
});

Deno.test("signed data for an environment that is not allowed fails", async () => {
  await rejectsWith(async () => await verifyNotification(await signedNotification({ environment: "Sandbox" }), config, roots), "wrong_environment");
  await rejectsWith(
    async () => await verifyTransaction(await signJws(chain, transactionPayload({ environment: "Sandbox" })), config, roots),
    "wrong_environment",
  );
  await rejectsWith(
    async () => await verifyTransaction(await signJws(chain, transactionPayload({ environment: "Xcode" })), { ...config, environments: ["Sandbox"] }, roots),
    "wrong_environment",
  );
});

Deno.test("renewal info for another subscription fails", async () => {
  const jws = await signedNotification({ signedRenewalInfo: await signJws(chain, renewalPayload({ originalTransactionId: "999" })) });
  await rejectsWith(() => verifyNotification(jws, config, roots), "malformed");
});

Deno.test("a transaction that is not an auto-renewable subscription is unsupported", async () => {
  await rejectsWith(
    async () => await verifyTransaction(await signJws(chain, transactionPayload({ type: "Consumable" })), config, roots),
    "unsupported",
  );
});

Deno.test("appAccountToken and family sharing are read from the signed transaction", async () => {
  const token = "E0000000-0000-4000-8000-000000000030";
  const verified = await verifyTransaction(
    await signJws(chain, transactionPayload({ appAccountToken: token, inAppOwnershipType: "FAMILY_SHARED", revocationDate: Date.now(), revocationReason: 1 })),
    config,
    roots,
  );
  assertEquals(verified.appAccountToken, token.toLowerCase());
  assertEquals(verified.record.familyShared, true);
  assertEquals(verified.record.revocationReason, 1);
  await rejectsWith(
    async () => await verifyTransaction(await signJws(chain, transactionPayload({ appAccountToken: "not-a-uuid" })), config, roots),
    "malformed",
  );
});

Deno.test("a notification without app data is not for this service", async () => {
  const jws = await signJws(chain, { notificationType: "EXTERNAL_PURCHASE_TOKEN", notificationUUID: crypto.randomUUID(), signedDate: Date.now() });
  assertEquals(await verifyNotification(jws, config, roots), null);
});

Deno.test("configuration fails closed: a bundle id is required, and Production needs the app's Apple id", () => {
  const names = ["APP_STORE_BUNDLE_ID", "APP_STORE_ENVIRONMENTS", "APP_STORE_APP_APPLE_ID"];
  const saved = names.map((name) => Deno.env.get(name));
  const set = (values: Record<string, string | undefined>) => {
    for (const name of names) {
      const value = values[name];
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  };
  try {
    set({});
    assertThrows(appStoreConfigFromEnv, AppStoreConfigError);
    set({ APP_STORE_BUNDLE_ID: TEST_BUNDLE_ID });
    assertThrows(appStoreConfigFromEnv, AppStoreConfigError, "APP_STORE_APP_APPLE_ID");
    set({ APP_STORE_BUNDLE_ID: TEST_BUNDLE_ID, APP_STORE_ENVIRONMENTS: "Sandbox,Xcode" });
    assertThrows(appStoreConfigFromEnv, AppStoreConfigError);
    set({ APP_STORE_BUNDLE_ID: TEST_BUNDLE_ID, APP_STORE_ENVIRONMENTS: "Sandbox" });
    assertEquals(appStoreConfigFromEnv(), { bundleId: TEST_BUNDLE_ID, environments: ["Sandbox"], appAppleId: undefined });
    set({ APP_STORE_BUNDLE_ID: TEST_BUNDLE_ID, APP_STORE_ENVIRONMENTS: "Production, Sandbox", APP_STORE_APP_APPLE_ID: "1234567890" });
    assertEquals(appStoreConfigFromEnv(), { bundleId: TEST_BUNDLE_ID, environments: ["Production", "Sandbox"], appAppleId: 1234567890 });
  } finally {
    names.forEach((name, index) => saved[index] === undefined ? Deno.env.delete(name) : Deno.env.set(name, saved[index]!));
  }
});
