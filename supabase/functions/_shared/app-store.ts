// Verification of App Store signed data (JWS): App Store Server Notifications
// V2 and the signed transactions and renewal info StoreKit hands the app.
//
// The checks follow Apple's App Store Server Library (SignedDataVerifier in
// app-store-server-library-node, jws_verification.ts) in its offline mode:
//   - the header's alg is ES256 and x5c holds exactly three certificates;
//   - the leaf is signed by the intermediate and the intermediate by a pinned
//     root. The third x5c entry is never trusted, only the pinned root;
//   - the leaf carries Apple's OID 1.2.840.113635.100.6.11.1 and the
//     intermediate 1.2.840.113635.100.6.2.1 and is a CA;
//   - both certificates are valid at the payload's signedDate, within 60 s;
//   - the JWS signature verifies with the leaf key;
//   - bundle id, environment and, in Production, the app's Apple id match.
// It does not run Apple's optional OCSP revocation check.
//
// Roots come only from the caller. Production code passes APPLE_ROOTS; tests
// pass a root they generated. There is no environment variable for a root.

import "https://esm.sh/reflect-metadata@0.2.2";
import * as x509 from "https://esm.sh/@peculiar/x509@2.1.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { APPLE_ROOT_CA_G3_PEM } from "./apple-root-ca.ts";

export type AppStoreEnvironment = "Production" | "Sandbox";

export interface AppStoreConfig {
  bundleId: string;
  environments: readonly AppStoreEnvironment[];
  /** The app's Apple id, checked on Production notifications. */
  appAppleId?: number;
}

export type VerificationCode =
  | "malformed"
  | "invalid_signature"
  | "invalid_chain"
  | "wrong_app"
  | "wrong_environment"
  /** Signed correctly, but not an auto-renewable subscription. */
  | "unsupported";

export class AppStoreVerificationError extends Error {
  constructor(readonly code: VerificationCode, message: string) {
    super(message);
    this.name = "AppStoreVerificationError";
  }
}

export class AppStoreConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppStoreConfigError";
  }
}

const LEAF_OID = "1.2.840.113635.100.6.11.1";
const INTERMEDIATE_OID = "1.2.840.113635.100.6.2.1";
const MAX_SKEW_MS = 60_000;
const ENVIRONMENTS: readonly AppStoreEnvironment[] = ["Production", "Sandbox"];

/** DER bytes of the pinned Apple roots. */
export const APPLE_ROOTS: readonly Uint8Array<ArrayBuffer>[] = [new Uint8Array(new x509.X509Certificate(APPLE_ROOT_CA_G3_PEM).rawData)];

/**
 * Reads APP_STORE_BUNDLE_ID, APP_STORE_ENVIRONMENTS (comma-separated, default
 * Production) and APP_STORE_APP_APPLE_ID, which Production requires.
 */
export function appStoreConfigFromEnv(): AppStoreConfig {
  const bundleId = Deno.env.get("APP_STORE_BUNDLE_ID")?.trim();
  if (!bundleId) throw new AppStoreConfigError("APP_STORE_BUNDLE_ID is not set");
  const environments = (Deno.env.get("APP_STORE_ENVIRONMENTS") ?? "Production")
    .split(",").map((value) => value.trim()).filter(Boolean);
  if (!environments.length || !environments.every((value) => (ENVIRONMENTS as readonly string[]).includes(value))) {
    throw new AppStoreConfigError("APP_STORE_ENVIRONMENTS must list Production and/or Sandbox");
  }
  const rawAppleId = Deno.env.get("APP_STORE_APP_APPLE_ID")?.trim();
  const appAppleId = rawAppleId ? Number(rawAppleId) : undefined;
  if (rawAppleId && !Number.isSafeInteger(appAppleId)) throw new AppStoreConfigError("APP_STORE_APP_APPLE_ID must be a number");
  if (environments.includes("Production") && appAppleId === undefined) {
    throw new AppStoreConfigError("APP_STORE_APP_APPLE_ID is required when Production is allowed");
  }
  return { bundleId, environments: environments as AppStoreEnvironment[], appAppleId };
}

function base64UrlDecode(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  let binary: string;
  try {
    binary = atob(base64);
  } catch {
    throw new AppStoreVerificationError("malformed", "JWS segment is not base64url");
  }
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function decodeJson(segment: string): Record<string, unknown> {
  try {
    const value = JSON.parse(new TextDecoder().decode(base64UrlDecode(segment)));
    if (value && typeof value === "object" && !Array.isArray(value)) return value;
  } catch {
    // Reported below.
  }
  throw new AppStoreVerificationError("malformed", "JWS segment is not a JSON object");
}

function validAt(cert: x509.X509Certificate, at: number): boolean {
  return cert.notBefore.getTime() - MAX_SKEW_MS <= at && at <= cert.notAfter.getTime() + MAX_SKEW_MS;
}

async function signedBy(cert: x509.X509Certificate, issuer: x509.X509Certificate): Promise<boolean> {
  if (cert.issuer !== issuer.subject) return false;
  try {
    return await cert.verify({ publicKey: issuer.publicKey, signatureOnly: true });
  } catch {
    return false;
  }
}

/** Verifies a JWS signed by the App Store and returns its payload. */
export async function verifyAppStoreJws(jws: string, roots: readonly Uint8Array<ArrayBuffer>[]): Promise<Record<string, unknown>> {
  const parts = typeof jws === "string" ? jws.split(".") : [];
  if (parts.length !== 3 || parts.some((part) => !part)) throw new AppStoreVerificationError("malformed", "Not a compact JWS");
  const header = decodeJson(parts[0]);
  const payload = decodeJson(parts[1]);
  if (header.alg !== "ES256") throw new AppStoreVerificationError("invalid_signature", "JWS alg must be ES256");

  const chain = header.x5c;
  if (!Array.isArray(chain) || chain.length !== 3 || !chain.every((entry) => typeof entry === "string")) {
    throw new AppStoreVerificationError("invalid_chain", "x5c must hold three certificates");
  }
  let leaf: x509.X509Certificate;
  let intermediate: x509.X509Certificate;
  try {
    leaf = new x509.X509Certificate(chain[0]);
    intermediate = new x509.X509Certificate(chain[1]);
  } catch {
    throw new AppStoreVerificationError("invalid_chain", "x5c holds an unreadable certificate");
  }

  const signedDate = payload.signedDate;
  if (typeof signedDate !== "number" || !Number.isFinite(signedDate)) {
    throw new AppStoreVerificationError("malformed", "Payload has no signedDate");
  }

  const pinned = roots.map((der) => new x509.X509Certificate(der));
  let chainsToRoot = false;
  for (const root of pinned) {
    if (await signedBy(intermediate, root)) chainsToRoot = true;
  }
  if (!chainsToRoot || !(await signedBy(leaf, intermediate))) {
    throw new AppStoreVerificationError("invalid_chain", "Certificate chain does not lead to a pinned root");
  }
  const intermediateConstraints = intermediate.getExtension(x509.BasicConstraintsExtension);
  if (!leaf.getExtension(LEAF_OID) || !intermediate.getExtension(INTERMEDIATE_OID) || !intermediateConstraints?.ca) {
    throw new AppStoreVerificationError("invalid_chain", "Certificates lack Apple's App Store markers");
  }
  if (!validAt(leaf, signedDate) || !validAt(intermediate, signedDate)) {
    throw new AppStoreVerificationError("invalid_chain", "Certificate not valid at signedDate");
  }

  let key: CryptoKey;
  try {
    key = await leaf.publicKey.export({ name: "ECDSA", namedCurve: "P-256" }, ["verify"]);
  } catch {
    throw new AppStoreVerificationError("invalid_signature", "Leaf key is not P-256");
  }
  const valid = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    base64UrlDecode(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) throw new AppStoreVerificationError("invalid_signature", "JWS signature does not verify");
  return payload;
}

// ============================================================
// Decoded App Store data
// ============================================================

/** A verified auto-renewable subscription transaction, as apply_app_store_transaction takes it. */
export interface TransactionRecord {
  originalTransactionId: string;
  transactionId: string;
  productId: string;
  environment: AppStoreEnvironment;
  purchaseDate: string;
  expiresDate: string;
  signedDate: string;
  revocationDate?: string;
  revocationReason?: number;
  familyShared: boolean;
  /** Apple's isUpgraded: a newer transaction in the group replaces this one. */
  isUpgraded: boolean;
}

export interface RenewalRecord {
  signedDate: string;
  autoRenew: boolean;
  gracePeriodExpiresDate?: string;
}

export interface VerifiedTransaction {
  record: TransactionRecord;
  /** Lowercased appAccountToken, or null when the purchase set none. */
  appAccountToken: string | null;
}

export interface VerifiedNotification {
  notificationUUID: string;
  notificationType: string;
  subtype?: string;
  environment: AppStoreEnvironment;
  signedDate: string;
  transaction: VerifiedTransaction | null;
  renewal: RenewalRecord | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) throw new AppStoreVerificationError("malformed", `${field} is missing`);
  return value;
}

function time(value: unknown, field: string): string {
  const date = typeof value === "number" ? new Date(value) : null;
  // A finite number past Date's range gives an invalid date, which toISOString throws on.
  if (!date || Number.isNaN(date.getTime())) throw new AppStoreVerificationError("malformed", `${field} is missing or out of range`);
  return date.toISOString();
}

function optionalTime(value: unknown, field: string): string | undefined {
  return value === undefined || value === null ? undefined : time(value, field);
}

function checkEnvironment(value: unknown, config: AppStoreConfig): AppStoreEnvironment {
  if (!(config.environments as readonly unknown[]).includes(value)) {
    throw new AppStoreVerificationError("wrong_environment", "Signed data is for another environment");
  }
  return value as AppStoreEnvironment;
}

/**
 * Verifies a signed transaction. Only auto-renewable subscriptions for this
 * bundle in an allowed environment pass.
 */
export async function verifyTransaction(
  jws: string,
  config: AppStoreConfig,
  roots: readonly Uint8Array<ArrayBuffer>[],
): Promise<VerifiedTransaction> {
  const payload = await verifyAppStoreJws(jws, roots);
  if (payload.bundleId !== config.bundleId) throw new AppStoreVerificationError("wrong_app", "Transaction is for another app");
  const environment = checkEnvironment(payload.environment, config);
  if (payload.type !== "Auto-Renewable Subscription") {
    throw new AppStoreVerificationError("unsupported", "Transaction is not an auto-renewable subscription");
  }
  const token = payload.appAccountToken;
  if (token !== undefined && (typeof token !== "string" || !UUID.test(token))) {
    throw new AppStoreVerificationError("malformed", "appAccountToken is not a UUID");
  }
  const revocationReason = payload.revocationReason;
  return {
    appAccountToken: typeof token === "string" ? token.toLowerCase() : null,
    record: {
      originalTransactionId: text(payload.originalTransactionId, "originalTransactionId"),
      transactionId: text(payload.transactionId, "transactionId"),
      productId: text(payload.productId, "productId"),
      environment,
      purchaseDate: time(payload.purchaseDate, "purchaseDate"),
      expiresDate: time(payload.expiresDate, "expiresDate"),
      signedDate: time(payload.signedDate, "signedDate"),
      revocationDate: optionalTime(payload.revocationDate, "revocationDate"),
      revocationReason: typeof revocationReason === "number" ? revocationReason : undefined,
      familyShared: payload.inAppOwnershipType === "FAMILY_SHARED",
      isUpgraded: payload.isUpgraded === true,
    },
  };
}

/** Verifies signed renewal info belonging to the given subscription. */
export async function verifyRenewalInfo(
  jws: string,
  transaction: TransactionRecord,
  roots: readonly Uint8Array<ArrayBuffer>[],
): Promise<RenewalRecord> {
  const payload = await verifyAppStoreJws(jws, roots);
  if (payload.originalTransactionId !== transaction.originalTransactionId) {
    throw new AppStoreVerificationError("malformed", "Renewal info belongs to another subscription");
  }
  if (payload.environment !== transaction.environment) {
    throw new AppStoreVerificationError("wrong_environment", "Renewal info is for another environment");
  }
  return {
    signedDate: time(payload.signedDate, "signedDate"),
    autoRenew: payload.autoRenewStatus === 1,
    gracePeriodExpiresDate: optionalTime(payload.gracePeriodExpiresDate, "gracePeriodExpiresDate"),
  };
}

/**
 * Verifies an App Store Server Notification V2 signedPayload and the
 * transaction and renewal info inside it. Returns null for a notification
 * without app data (summary and external purchase notifications), which this
 * service does not use.
 */
export async function verifyNotification(
  signedPayload: string,
  config: AppStoreConfig,
  roots: readonly Uint8Array<ArrayBuffer>[],
): Promise<VerifiedNotification | null> {
  const payload = await verifyAppStoreJws(signedPayload, roots);
  const data = payload.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const appData = data as Record<string, unknown>;
  if (appData.bundleId !== config.bundleId) throw new AppStoreVerificationError("wrong_app", "Notification is for another app");
  const environment = checkEnvironment(appData.environment, config);
  if (environment === "Production" && appData.appAppleId !== config.appAppleId) {
    throw new AppStoreVerificationError("wrong_app", "Notification is for another app id");
  }
  const notificationUUID = text(payload.notificationUUID, "notificationUUID");
  if (!UUID.test(notificationUUID)) throw new AppStoreVerificationError("malformed", "notificationUUID is not a UUID");

  let transaction: VerifiedTransaction | null = null;
  let renewal: RenewalRecord | null = null;
  if (appData.signedTransactionInfo !== undefined) {
    transaction = await verifyTransaction(text(appData.signedTransactionInfo, "signedTransactionInfo"), config, roots);
    if (transaction.record.environment !== environment) {
      throw new AppStoreVerificationError("wrong_environment", "Transaction is for another environment");
    }
    if (appData.signedRenewalInfo !== undefined) {
      renewal = await verifyRenewalInfo(text(appData.signedRenewalInfo, "signedRenewalInfo"), transaction.record, roots);
    }
  }

  const subtype = payload.subtype;
  return {
    notificationUUID: notificationUUID.toLowerCase(),
    notificationType: text(payload.notificationType, "notificationType"),
    subtype: typeof subtype === "string" ? subtype : undefined,
    environment,
    signedDate: time(payload.signedDate, "signedDate"),
    transaction,
    renewal,
  };
}

// ============================================================
// Storing verified data
// ============================================================

export interface NotificationRecord {
  notificationUUID: string;
  notificationType: string;
  subtype?: string;
  environment: AppStoreEnvironment;
  signedDate: string;
}

export interface ApplyArgs {
  /** The verified appAccountToken, or the authenticated caller it matched. */
  userId: string | null;
  transaction: TransactionRecord | null;
  renewal: RenewalRecord | null;
  notification?: NotificationRecord | null;
}

/** What apply_app_store_transaction did; see its comment in the migration. */
export type ApplyResult = "applied" | "stale" | "duplicate" | "ignored" | "unknown_product" | "unlinked" | "user_mismatch";

export type ApplyTransaction = (args: ApplyArgs) => Promise<ApplyResult>;

/** Applies verified data with the service-role client. */
export function applyTransactionWith(client: SupabaseClient): ApplyTransaction {
  return async ({ userId, transaction, renewal, notification }) => {
    const { data, error } = await client.rpc("apply_app_store_transaction", {
      p_user_id: userId,
      p_transaction: transaction,
      p_renewal: renewal,
      p_notification: notification ?? null,
    });
    if (error) throw new Error(`apply_app_store_transaction failed: ${error.code ?? error.message}`);
    return data as ApplyResult;
  };
}
