// Supabase Edge Function: record an App Store purchase for the signed-in user.
//
// After a StoreKit purchase, or when it restores purchases, the app POSTs
// { signedTransaction, signedRenewalInfo? } (the JWS representations StoreKit
// gives it) with the user's bearer token. The transaction is verified against
// Apple's pinned root, its appAccountToken must equal the caller's user id
// (the app sets it to that at purchase), and it is applied through the same
// apply_app_store_transaction as App Store Server Notifications. The answer is
// the caller's plan afterwards.
//
// The app is not a browser, so no Origin is required; CORS headers are the
// shared ones and allow nothing new.

import { createAdminClient, HttpError, requireUser } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { BodyTooLargeError, readBoundedBody } from "../_shared/bounded-body.ts";
import { getSubscriptionInfo, type SubscriptionInfo } from "../_shared/entitlements.ts";
import {
  APPLE_ROOTS,
  type AppStoreConfig,
  AppStoreConfigError,
  appStoreConfigFromEnv,
  type ApplyTransaction,
  applyTransactionWith,
  AppStoreVerificationError,
  type RenewalRecord,
  verifyRenewalInfo,
  verifyTransaction,
} from "../_shared/app-store.ts";

const MAX_BODY_BYTES = 32 * 1024;

export interface PurchaseDeps {
  roots: readonly Uint8Array<ArrayBuffer>[];
  config: () => AppStoreConfig;
  authenticate: (req: Request) => Promise<{ id: string }>;
  apply: ApplyTransaction;
  entitlement: (userId: string) => Promise<SubscriptionInfo>;
}

export function createHandler(deps: PurchaseDeps) {
  return async (req: Request): Promise<Response> => {
    const corsHeaders = getCorsHeaders(req.headers.get("origin"));
    const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: corsHeaders });
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

    let userId: string;
    try {
      userId = (await deps.authenticate(req)).id;
    } catch (error) {
      if (!(error instanceof HttpError)) throw error;
      return reply(error.status, { error: error.message });
    }

    let config: AppStoreConfig;
    try {
      config = deps.config();
    } catch (error) {
      if (!(error instanceof AppStoreConfigError)) throw error;
      console.error("[APP STORE] Not configured:", error.message);
      return reply(503, { error: "In-app purchases are not available yet.", code: "not_configured" });
    }

    let body: Record<string, unknown> | null;
    try {
      body = JSON.parse(await readBoundedBody(req, MAX_BODY_BYTES));
    } catch (error) {
      if (error instanceof BodyTooLargeError) return reply(413, { error: "The request is too large.", code: "too_large" });
      return reply(400, { error: "The request body must be JSON.", code: "malformed" });
    }
    const signedTransaction = body?.signedTransaction;
    const signedRenewalInfo = body?.signedRenewalInfo;
    if (typeof signedTransaction !== "string" || (signedRenewalInfo !== undefined && typeof signedRenewalInfo !== "string")) {
      return reply(400, { error: "signedTransaction is required.", code: "malformed" });
    }

    let renewal: RenewalRecord | null = null;
    let transaction;
    try {
      transaction = await verifyTransaction(signedTransaction, config, deps.roots);
      if (signedRenewalInfo) renewal = await verifyRenewalInfo(signedRenewalInfo, transaction.record, deps.roots);
    } catch (error) {
      if (!(error instanceof AppStoreVerificationError)) throw error;
      console.warn("[APP STORE] Purchase rejected:", error.code);
      if (error.code === "unsupported") return reply(422, { error: "This product is not a subscription.", code: "unsupported_product" });
      return reply(400, { error: "The purchase could not be verified.", code: error.code });
    }

    // Only the account that made the purchase can claim it: the token is part
    // of the signed transaction, so another user cannot forward it.
    if (transaction.appAccountToken !== userId.toLowerCase()) {
      console.warn("[APP STORE] Purchase belongs to another account");
      return reply(403, { error: "This purchase belongs to another account.", code: "account_mismatch" });
    }

    let result;
    try {
      result = await deps.apply({ userId, transaction: transaction.record, renewal });
    } catch (error) {
      console.error("[APP STORE] Could not apply purchase:", error instanceof Error ? error.message : "unknown");
      return reply(500, { error: "Could not record the purchase. Please try again.", code: "storage_failed" });
    }
    if (result === "unknown_product") return reply(422, { error: "This product is not sold here.", code: "unknown_product" });
    if (result === "user_mismatch") return reply(409, { error: "This purchase belongs to another account.", code: "account_mismatch" });
    if (result !== "applied" && result !== "stale") {
      console.error("[APP STORE] Unexpected purchase result:", result);
      return reply(500, { error: "Could not record the purchase. Please try again.", code: "storage_failed" });
    }

    const plan = await deps.entitlement(userId);
    return reply(200, { result, entitlement: plan });
  };
}

if (import.meta.main) {
  Deno.serve(createHandler({
    roots: APPLE_ROOTS,
    config: appStoreConfigFromEnv,
    authenticate: async (req) => (await requireUser(req)).user,
    apply: applyTransactionWith(createAdminClient()),
    entitlement: getSubscriptionInfo,
  }));
}
