// Supabase Edge Function: App Store Server Notifications V2.
//
// Apple POSTs { signedPayload } here. The payload and the transaction and
// renewal info inside it are verified against Apple's pinned root before
// anything is read, then applied through apply_app_store_transaction, which
// records the notificationUUID so a retried delivery applies nothing twice.
//
// Every notification type that carries a signed transaction is applied the
// same way, because the transaction and renewal info are the subscription's
// whole state: SUBSCRIBED and DID_RENEW extend it, DID_CHANGE_RENEWAL_STATUS
// and DID_FAIL_TO_RENEW (with its billing grace period) update the renewal
// info, EXPIRED and GRACE_PERIOD_EXPIRED end it by date, and REFUND and REVOKE
// set its revocation.
//
// Answers: 200 once handled, including duplicates and data this service does
// not use, so Apple stops retrying; 400 for data that fails verification;
// 503 when the function is not configured and 500 when the database fails,
// so Apple retries later.

import { createAdminClient } from "../_shared/auth.ts";
import { BodyTooLargeError, discardRequestBody, readBoundedBody } from "../_shared/bounded-body.ts";
import {
  APPLE_ROOTS,
  type AppStoreConfig,
  AppStoreConfigError,
  appStoreConfigFromEnv,
  type ApplyTransaction,
  applyTransactionWith,
  AppStoreVerificationError,
  verifyNotification,
} from "../_shared/app-store.ts";

const MAX_BODY_BYTES = 64 * 1024;

export interface NotificationDeps {
  roots: readonly Uint8Array<ArrayBuffer>[];
  config: () => AppStoreConfig;
  apply: ApplyTransaction;
}

function reply(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status });
}

export function createHandler(deps: NotificationDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    let config: AppStoreConfig;
    try {
      config = deps.config();
    } catch (error) {
      if (!(error instanceof AppStoreConfigError)) throw error;
      console.error("[APP STORE] Not configured:", error.message);
      await discardRequestBody(req);
      return reply(503, { error: "not_configured" });
    }

    let signedPayload: unknown;
    try {
      signedPayload = (JSON.parse(await readBoundedBody(req, MAX_BODY_BYTES)) as Record<string, unknown> | null)?.signedPayload;
    } catch (error) {
      if (error instanceof BodyTooLargeError) return reply(413, { error: "too_large" });
      return reply(400, { error: "malformed" });
    }
    if (typeof signedPayload !== "string") return reply(400, { error: "malformed" });

    let notification;
    try {
      notification = await verifyNotification(signedPayload, config, deps.roots);
    } catch (error) {
      if (!(error instanceof AppStoreVerificationError)) throw error;
      if (error.code === "unsupported") return reply(200, { received: true, result: "ignored" });
      console.warn("[APP STORE] Notification rejected:", error.code);
      return reply(400, { error: error.code });
    }
    if (!notification) return reply(200, { received: true, result: "ignored" });

    try {
      const result = await deps.apply({
        userId: notification.transaction?.appAccountToken ?? null,
        transaction: notification.transaction?.record ?? null,
        renewal: notification.renewal,
        notification: {
          notificationUUID: notification.notificationUUID,
          notificationType: notification.notificationType,
          subtype: notification.subtype,
          environment: notification.environment,
          signedDate: notification.signedDate,
        },
      });
      console.log(`[APP STORE] ${notification.notificationType}${notification.subtype ? `/${notification.subtype}` : ""}: ${result}`);
      return reply(200, { received: true, result });
    } catch (error) {
      console.error("[APP STORE] Could not apply notification:", error instanceof Error ? error.message : "unknown");
      return reply(500, { error: "storage_failed" });
    }
  };
}

if (import.meta.main) {
  Deno.serve(createHandler({
    roots: APPLE_ROOTS,
    config: appStoreConfigFromEnv,
    apply: applyTransactionWith(createAdminClient()),
  }));
}
