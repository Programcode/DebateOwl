import { fetch } from 'expo/fetch';
import { AppState } from 'react-native';

import { payloadOf, untilAborted } from './ai-request';
import { createSerialQueue } from './serial-queue';
import { storeKit, storeKitErrorCode, type StoreProduct, type StorePurchaseResult, type StoreTransaction } from './store-kit';
import { supabase } from './supabase';
import { supabaseProject } from './supabase-config';

/**
 * In-app subscriptions through StoreKit 2. Apple takes the money; the
 * app-store-purchase Edge Function verifies the signed transaction and
 * applies it to the account, the same way App Store Server Notifications do.
 *
 * A transaction is finished only after the server has accepted it. Until
 * then StoreKit keeps it in Transaction.unfinished, and deliverPending sends
 * it again on launch, on return to the foreground and on every transaction
 * update, so a purchase whose request was lost (offline, the app killed, the
 * server not configured yet) still reaches the account. The server is
 * idempotent, so sending one twice is harmless; sending it while the server
 * cannot take it and then finishing it would lose it.
 *
 * Every purchase carries the buyer's user id as its appAccountToken, and the
 * server refuses a transaction whose token is not the caller's. So a
 * transaction is only ever sent for the account in its token, and only while
 * that account is still the one signed in: Apple's sheet can stay open for
 * minutes, long enough for someone to sign out and another to sign in.
 */

/** The App Store Connect product ids, one subscription group. */
export const PRODUCT_IDS = {
  basic: 'com.pistack.debateowl.basic.monthly',
  pro: 'com.pistack.debateowl.pro.monthly',
} as const;

export type PurchaseTier = keyof typeof PRODUCT_IDS;

/** The plan the server reports after applying a purchase (getSubscriptionInfo in supabase/functions/_shared/entitlements.ts). */
export interface PurchasedPlan {
  tier: string;
  state: string;
  dailyLimit: number;
  canAccessProModels: boolean;
}

/**
 * Why a purchase did not reach the account:
 * - accountChanged: another account is signed in now; the transaction waits for its own.
 * - network: no answer in time. It stays unfinished and is sent again later.
 * - rejected: the server refused it (verification, another account's purchase, an unknown product).
 * - server: the server failed; it is sent again later.
 * - store: StoreKit itself failed; `code` says how (see store-kit.ts).
 */
export type PurchaseFailure = 'accountChanged' | 'network' | 'rejected' | 'server' | 'store';

export type PurchaseOutcome =
  | { kind: 'purchased'; plan: PurchasedPlan | null }
  /** Ask to Buy, or a payment that needs action: the transaction arrives later through deliverPending. */
  | { kind: 'pending' }
  | { kind: 'cancelled' }
  /** No StoreKit in this build (Expo Go, the web preview), or the server is not configured for the App Store yet. */
  | { kind: 'unavailable' }
  | { kind: 'failed'; reason: PurchaseFailure; code?: string };

export type RestoreOutcome =
  /**
   * `applied` counts this account's subscriptions the server took. `otherAccount`
   * counts those this Apple ID holds for another account, or for none (an offer
   * code redeemed in the App Store app, Family Sharing): they are never sent.
   */
  | { kind: 'restored'; applied: number; otherAccount: number; plan: PurchasedPlan | null }
  | { kind: 'cancelled' }
  | { kind: 'unavailable' }
  | { kind: 'failed'; reason: PurchaseFailure; code?: string };

type Delivery = { ok: true; plan: PurchasedPlan | null } | { ok: false; reason: PurchaseFailure | 'unavailable'; code?: string };

// One request may take this long before it counts as a network failure; the
// transaction stays unfinished and is sent again.
const REQUEST_BUDGET_MS = 20_000;

// One delivery at a time, so a purchase's own request, a launch's
// deliverPending and an update event never send the same transaction at once.
const serial = createSerialQueue();

// What the server answered for each signed transaction it took in this run of
// the app, so a version a queued deliverPending already sent is not sent again.
// Keyed by the signed version, not the id: StoreKit signs the same transaction
// again when it changes (a refund, a new expiry), and that version must be sent.
const delivered = new Map<string, PurchasedPlan | null>();

function planOf(payload: Record<string, unknown> | null): PurchasedPlan | null {
  const plan = payload?.entitlement;
  if (!plan || typeof plan !== 'object') return null;
  const { tier, state, dailyLimit, canAccessProModels } = plan as Record<string, unknown>;
  if (typeof tier !== 'string' || typeof state !== 'string' || typeof dailyLimit !== 'number') return null;
  return { tier, state, dailyLimit, canAccessProModels: canAccessProModels === true };
}

/** Whether this transaction was bought for `userId`. One without a token, or with another account's, is never sent. */
function belongsTo(transaction: StoreTransaction, userId: string): boolean {
  return transaction.appAccountToken !== null && transaction.appAccountToken === userId.toLowerCase();
}

/** Sends one transaction as `userId`, only if that account is still the one signed in. */
async function post(transaction: StoreTransaction, userId: string): Promise<Delivery> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_BUDGET_MS);
  try {
    const { data } = await untilAborted(supabase.auth.getSession(), controller.signal);
    const session = data.session;
    if (!session || session.user.id !== userId) return { ok: false, reason: 'accountChanged' };
    const body: Record<string, string> = { signedTransaction: transaction.signedTransaction };
    if (transaction.signedRenewalInfo) body.signedRenewalInfo = transaction.signedRenewalInfo;
    const response = await fetch(`${supabaseProject.url}/functions/v1/app-store-purchase`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: supabaseProject.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await untilAborted(payloadOf(response), controller.signal);
    if (response.ok) return { ok: true, plan: planOf(payload) };
    const code = typeof payload?.code === 'string' ? payload.code : undefined;
    if (response.status === 503 && code === 'not_configured') return { ok: false, reason: 'unavailable' };
    // 401 too: the session read above was the account's, so its token was refused; it is sent again once it refreshes.
    if (response.status >= 500 || response.status === 401) return { ok: false, reason: 'server', code };
    return { ok: false, reason: 'rejected', code };
  } catch {
    // Offline, or past the budget: the transaction stays unfinished either way.
    return { ok: false, reason: 'network' };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Sends one transaction and finishes it once the server has it. Runs inside
 * the serial queue. A finish that fails leaves it in Transaction.unfinished,
 * and sending it again is harmless.
 */
async function deliver(transaction: StoreTransaction, userId: string): Promise<Delivery> {
  const version = transaction.signedTransaction;
  // The server already has this version: only finish it, in case the last finish failed.
  const result: Delivery = delivered.has(version) ? { ok: true, plan: delivered.get(version) ?? null } : await post(transaction, userId);
  if (!result.ok) return result;
  delivered.set(version, result.plan);
  await storeKit()
    ?.finish(transaction.transactionId)
    .catch((cause: unknown) => console.warn('Could not finish an App Store transaction:', storeKitErrorCode(cause) ?? cause));
  return result;
}

async function signedInAs(userId: string): Promise<boolean> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id === userId;
}

/** The store's products for both tiers, or null without StoreKit or when the App Store does not list both. */
export async function loadProducts(): Promise<Record<PurchaseTier, StoreProduct> | null> {
  const native = storeKit();
  if (!native) return null;
  const products = await native.products(Object.values(PRODUCT_IDS));
  const basic = products.find((product) => product.id === PRODUCT_IDS.basic);
  const pro = products.find((product) => product.id === PRODUCT_IDS.pro);
  return basic && pro ? { basic, pro } : null;
}

/**
 * Buys `tier` for `userId`: Apple's sheet, then the server, then finish. The
 * sheet waits for the student, so only the request and finish wait in the
 * queue. A cancelled sheet is quiet; anything that keeps the transaction
 * unfinished is sent again later by deliverPending.
 */
export async function buy(tier: PurchaseTier, userId: string): Promise<PurchaseOutcome> {
  const native = storeKit();
  if (!native) return { kind: 'unavailable' };
  // The purchase is made out to `userId`, so it must be the account on screen.
  if (!(await signedInAs(userId))) return { kind: 'failed', reason: 'accountChanged' };
  let result: StorePurchaseResult;
  try {
    result = await native.purchase(PRODUCT_IDS[tier], userId);
  } catch (cause) {
    return { kind: 'failed', reason: 'store', code: storeKitErrorCode(cause) };
  }
  if (result.status === 'cancelled') return { kind: 'cancelled' };
  if (result.status === 'pending') return { kind: 'pending' };
  const transaction: StoreTransaction = result;
  const delivery = await serial(() => deliver(transaction, userId));
  if (delivery.ok) return { kind: 'purchased', plan: delivery.plan };
  if (delivery.reason === 'unavailable') return { kind: 'unavailable' };
  return { kind: 'failed', reason: delivery.reason, code: delivery.code };
}

/**
 * Sends every unfinished transaction bought for `userId`, one at a time, and
 * finishes those the server took. Returns how many it applied. Stops at the
 * first failure that would fail the rest too (offline, server not configured,
 * account changed); a refused one is left and the next is tried.
 */
export function deliverPending(userId: string): Promise<number> {
  const native = storeKit();
  if (!native) return Promise.resolve(0);
  return serial(async () => {
    let applied = 0;
    // Read inside the queue, so a run queued behind another sees what that one finished.
    for (const transaction of await native.unfinished()) {
      if (!belongsTo(transaction, userId)) continue;
      const result = await deliver(transaction, userId);
      if (result.ok) applied += 1;
      else if (result.reason !== 'rejected') break;
    }
    return applied;
  });
}

/**
 * Restore purchases: AppStore.sync() (it may ask for the Apple ID password),
 * then sends each current subscription bought for `userId`.
 */
export async function restore(userId: string): Promise<RestoreOutcome> {
  const native = storeKit();
  if (!native) return { kind: 'unavailable' };
  try {
    await native.sync();
  } catch (cause) {
    const code = storeKitErrorCode(cause);
    if (code === 'ERR_CANCELLED') return { kind: 'cancelled' };
    return { kind: 'failed', reason: 'store', code };
  }
  return serial(async (): Promise<RestoreOutcome> => {
    let entitlements: StoreTransaction[];
    try {
      entitlements = await native.currentEntitlements();
    } catch (cause) {
      return { kind: 'failed', reason: 'store', code: storeKitErrorCode(cause) };
    }
    let applied = 0;
    let plan: PurchasedPlan | null = null;
    const own = entitlements.filter((transaction) => belongsTo(transaction, userId));
    for (const transaction of own) {
      // Not deliver(): a restore sends even what this run already sent, since the server may have lost it.
      const result = await post(transaction, userId);
      if (!result.ok) {
        if (result.reason === 'rejected') continue;
        return result.reason === 'unavailable' ? { kind: 'unavailable' } : { kind: 'failed', reason: result.reason, code: result.code };
      }
      applied += 1;
      plan = result.plan ?? plan;
      await native.finish(transaction.transactionId).catch(() => {});
    }
    // Only a purchase made out to another account counts as theirs; one without a token belongs to no account yet.
    const otherAccount = entitlements.filter((transaction) => transaction.appAccountToken !== null && !belongsTo(transaction, userId)).length;
    return { kind: 'restored', applied, otherAccount, plan };
  });
}

/** Apple's Manage Subscriptions sheet. False without StoreKit or when it could not be shown. */
export async function manageSubscriptions(): Promise<boolean> {
  const native = storeKit();
  if (!native) return false;
  return native.showManageSubscriptions().then(
    () => true,
    () => false,
  );
}

/**
 * A transaction StoreKit reports as updated: sent even when this run already
 * delivered its id, because an update can be a new signed version of the same
 * transaction (a refund, a revocation, a changed expiry), which the server
 * should have before App Store Server Notifications bring it.
 */
function deliverUpdate(transaction: StoreTransaction, userId: string): Promise<void> {
  if (!belongsTo(transaction, userId)) return Promise.resolve();
  return serial(async () => {
    // A version the server already took this run was finished then; an update repeating it needs nothing.
    if (delivered.has(transaction.signedTransaction)) return;
    await deliver(transaction, userId);
  });
}

/**
 * For the root layout: delivers unfinished transactions now and whenever the
 * app returns to the foreground, and each transaction update as it comes (a
 * renewal, an approved Ask to Buy, a refund, a purchase on another device),
 * for whoever `getUserId` says is signed in. Returns the unsubscribe. Updates
 * that arrive while nobody is signed in stay unfinished until the buyer signs
 * in again; a finished one comes back as a current entitlement on Restore.
 */
export function startPurchaseListener(getUserId: () => string | null): () => void {
  const native = storeKit();
  if (!native) return () => {};
  const run = () => {
    const userId = getUserId();
    if (!userId) return;
    deliverPending(userId).catch((cause: unknown) => console.warn('Could not deliver App Store purchases:', storeKitErrorCode(cause) ?? cause));
  };
  const updates = native.addListener('onTransactionUpdate', (transaction) => {
    const userId = getUserId();
    if (!userId) return;
    deliverUpdate(transaction, userId).catch((cause: unknown) => console.warn('Could not deliver an App Store update:', storeKitErrorCode(cause) ?? cause));
  });
  const foreground = AppState.addEventListener('change', (state) => {
    if (state === 'active') run();
  });
  run();
  return () => {
    updates.remove();
    foreground.remove();
  };
}
