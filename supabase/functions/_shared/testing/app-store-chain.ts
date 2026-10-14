// Test support: a self-made certificate chain shaped like Apple's (root,
// intermediate with Apple's WWDR OID, leaf with the App Store receipt-signing
// OID) and a signer for JWS in the App Store's format. Tests inject the root
// into the verifier; production code pins Apple's root and never sees it.
import "https://esm.sh/reflect-metadata@0.2.2";
import * as x509 from "https://esm.sh/@peculiar/x509@2.1.0";

const ALG = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" } as const;
const LEAF_OID = "1.2.840.113635.100.6.11.1";
const INTERMEDIATE_OID = "1.2.840.113635.100.6.2.1";
const DAY = 24 * 60 * 60 * 1000;

export interface ChainOptions {
  /** Leave the App Store OID off the leaf. */
  leafWithoutOid?: boolean;
  /** Leave Apple's WWDR OID off the intermediate. */
  intermediateWithoutOid?: boolean;
  /** Validity window of the leaf. */
  leafNotBefore?: Date;
  leafNotAfter?: Date;
}

export interface TestChain {
  rootDer: Uint8Array<ArrayBuffer>;
  /** Base64 DER of leaf, intermediate and root, as x5c carries them. */
  x5c: string[];
  leafKeys: CryptoKeyPair;
}

function base64(bytes: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  return base64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const marker = (oid: string) => new x509.Extension(oid, false, new Uint8Array([0x05, 0x00]));

export async function createTestChain(options: ChainOptions = {}): Promise<TestChain> {
  const now = Date.now();
  const rootKeys = await crypto.subtle.generateKey(ALG, true, ["sign", "verify"]) as CryptoKeyPair;
  const intermediateKeys = await crypto.subtle.generateKey(ALG, true, ["sign", "verify"]) as CryptoKeyPair;
  const leafKeys = await crypto.subtle.generateKey(ALG, true, ["sign", "verify"]) as CryptoKeyPair;

  const root = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "01",
    name: "CN=Test Root CA",
    notBefore: new Date(now - 365 * DAY),
    notAfter: new Date(now + 365 * DAY),
    signingAlgorithm: ALG,
    keys: rootKeys,
    extensions: [new x509.BasicConstraintsExtension(true, undefined, true)],
  });
  const intermediate = await x509.X509CertificateGenerator.create({
    serialNumber: "02",
    subject: "CN=Test WWDR CA",
    issuer: root.subject,
    notBefore: new Date(now - 365 * DAY),
    notAfter: new Date(now + 365 * DAY),
    signingAlgorithm: ALG,
    publicKey: intermediateKeys.publicKey,
    signingKey: rootKeys.privateKey,
    extensions: [
      new x509.BasicConstraintsExtension(true, 0, true),
      ...(options.intermediateWithoutOid ? [] : [marker(INTERMEDIATE_OID)]),
    ],
  });
  const leaf = await x509.X509CertificateGenerator.create({
    serialNumber: "03",
    subject: "CN=Test App Store Signing",
    issuer: intermediate.subject,
    notBefore: options.leafNotBefore ?? new Date(now - 30 * DAY),
    notAfter: options.leafNotAfter ?? new Date(now + 30 * DAY),
    signingAlgorithm: ALG,
    publicKey: leafKeys.publicKey,
    signingKey: intermediateKeys.privateKey,
    extensions: options.leafWithoutOid ? [] : [marker(LEAF_OID)],
  });

  return {
    rootDer: new Uint8Array(root.rawData),
    x5c: [leaf, intermediate, root].map((cert) => base64(cert.rawData)),
    leafKeys,
  };
}

/** Signs a payload as the App Store does: ES256 with the chain in x5c. */
export async function signJws(
  chain: TestChain,
  payload: Record<string, unknown>,
  header: Record<string, unknown> = {},
): Promise<string> {
  const encoder = new TextEncoder();
  const head = base64Url(encoder.encode(JSON.stringify({ alg: "ES256", x5c: chain.x5c, ...header })));
  const body = base64Url(encoder.encode(JSON.stringify(payload)));
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    chain.leafKeys.privateKey,
    encoder.encode(`${head}.${body}`),
  );
  return `${head}.${body}.${base64Url(signature)}`;
}

export const TEST_BUNDLE_ID = "com.adam.debatelab";
export const TEST_APP_APPLE_ID = 1234567890;
export const PRO_PRODUCT = "com.adam.debatelab.pro.monthly";

/** A JWSTransactionDecodedPayload for an active monthly subscription. */
export function transactionPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Date.now();
  return {
    transactionId: "2000000000000002",
    originalTransactionId: "2000000000000001",
    bundleId: TEST_BUNDLE_ID,
    productId: PRO_PRODUCT,
    purchaseDate: now - DAY,
    originalPurchaseDate: now - DAY,
    expiresDate: now + 29 * DAY,
    quantity: 1,
    type: "Auto-Renewable Subscription",
    inAppOwnershipType: "PURCHASED",
    signedDate: now,
    environment: "Production",
    transactionReason: "PURCHASE",
    ...overrides,
  };
}

/** A JWSRenewalInfoDecodedPayload for the transaction above. */
export function renewalPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    originalTransactionId: "2000000000000001",
    autoRenewProductId: PRO_PRODUCT,
    productId: PRO_PRODUCT,
    autoRenewStatus: 1,
    signedDate: Date.now(),
    environment: "Production",
    ...overrides,
  };
}

/** A responseBodyV2DecodedPayload wrapping signed transaction and renewal info. */
export function notificationPayload(
  data: Record<string, unknown>,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    notificationType: "SUBSCRIBED",
    subtype: "INITIAL_BUY",
    notificationUUID: "6a0e1f3c-2b1d-4e5f-9a8b-7c6d5e4f3a2b",
    version: "2.0",
    signedDate: Date.now(),
    data: {
      appAppleId: TEST_APP_APPLE_ID,
      bundleId: TEST_BUNDLE_ID,
      bundleVersion: "1",
      environment: "Production",
      status: 1,
      ...data,
    },
    ...overrides,
  };
}
