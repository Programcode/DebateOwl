// Supabase Edge Function: export everything a user owns, or delete the account.
//
// POST { action: "export" } returns the account and its rows as one JSON document.
// POST { action: "delete", confirmation } cancels Stripe billing, removes the
// user's Storage objects, clears their workspaces, then deletes the auth user.
// Foreign keys and the auth.users delete trigger remove every remaining row in
// that delete; see supabase/migrations/20261001100000_account_deletion_and_export.sql.
//
// Billing stops first, for every customer the database records and every one
// Stripe finds by metadata.user_id: open Checkout sessions expire and
// subscriptions are canceled immediately, without a refund. If Stripe cannot be
// reached, nothing is deleted and the user can try again.

import { createAdminClient, HttpError, jsonError, requireUser } from "../_shared/auth.ts";
import { createEdgeStripe } from "../_shared/stripe.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

export type AccountUser = { id: string; email?: string | null };
export type StorageObject = { bucket_id: string; name: string };
export type DeletionPlan = {
  stripe_customer_ids: string[];
  storage_objects: StorageObject[];
  /** Apple may still bill an App Store subscription; only the user can cancel it. */
  app_store_subscription_active: boolean;
};

export type AccountDeps = {
  authenticate: (req: Request) => Promise<AccountUser>;
  exportData: (userId: string) => Promise<unknown>;
  deletionPlan: (userId: string) => Promise<DeletionPlan>;
  /** Stops all billing for the user and returns how many subscriptions it canceled. */
  stopBilling: (userId: string, knownCustomerIds: string[]) => Promise<number>;
  removeStorageObjects: (objects: StorageObject[]) => Promise<void>;
  /** Clears rows that deliberately block a raw auth user delete. */
  prepareDeletion: (userId: string) => Promise<void>;
  deleteAuthUser: (userId: string) => Promise<void>;
};

/** The text a user types to confirm deletion: their email, or DELETE without one. */
export function deletionConfirmation(user: AccountUser) {
  return user.email || "DELETE";
}

// Subscriptions in these states no longer bill.
const ENDED_SUBSCRIPTION_STATUSES = new Set(["canceled", "incomplete_expired"]);

export type BillingApi = {
  searchCustomers: (userId: string) => AsyncIterable<{ id: string; deleted?: boolean | void; metadata?: Record<string, string> | null }>;
  listOpenCheckouts: (customerId: string) => AsyncIterable<{ id: string }>;
  expireCheckout: (sessionId: string) => Promise<unknown>;
  listSubscriptions: (customerId: string) => AsyncIterable<{ id: string; status: string }>;
  cancelSubscription: (subscriptionId: string) => Promise<unknown>;
};

function isMissing(error: unknown) {
  return (error as { code?: string }).code === "resource_missing";
}

async function listUnlessCustomerMissing<T>(items: AsyncIterable<T>): Promise<T[] | null> {
  const listed: T[] = [];
  try {
    for await (const item of items) listed.push(item);
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
  return listed;
}

/** Runs one Stripe change; a session or subscription that has disappeared needs none. */
async function unlessAlreadyGone(change: () => Promise<unknown>) {
  try {
    await change();
    return true;
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

export async function stopBillingFor(api: BillingApi, userId: string, knownCustomerIds: string[]) {
  // Recorded customers cover the minute Stripe search can lag a new customer;
  // search covers customers created before create-checkout recorded them.
  const customerIds = new Set(knownCustomerIds);
  for await (const customer of api.searchCustomers(userId)) {
    if (!customer.deleted && customer.metadata?.user_id === userId) customerIds.add(customer.id);
  }

  let canceled = 0;
  for (const customerId of [...customerIds].sort()) {
    // Listing reports resource_missing only when the customer itself is gone,
    // and a deleted customer has nothing left to bill.
    const sessions = await listUnlessCustomerMissing(api.listOpenCheckouts(customerId));
    if (sessions === null) continue;
    // An open Checkout session could otherwise start a subscription after deletion.
    for (const session of sessions) await unlessAlreadyGone(() => api.expireCheckout(session.id));

    const subscriptions = await listUnlessCustomerMissing(api.listSubscriptions(customerId));
    if (subscriptions === null) continue;
    for (const subscription of subscriptions) {
      if (ENDED_SUBSCRIPTION_STATUSES.has(subscription.status)) continue;
      if (await unlessAlreadyGone(() => api.cancelSubscription(subscription.id))) canceled += 1;
    }
  }
  return canceled;
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? body as Record<string, unknown> : {};
  } catch {
    throw new HttpError(400, "Request body must be valid JSON");
  }
}

export function createHandler(deps: AccountDeps) {
  return async (req: Request) => {
    const corsHeaders = getCorsHeaders(req.headers.get("origin"));
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
    if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });

    try {
      // The account is always the caller's own. No user id is read from the body.
      const user = await deps.authenticate(req);
      const body = await readBody(req);

      if (body.action === "export") {
        return Response.json(await deps.exportData(user.id), { headers: corsHeaders });
      }

      if (body.action === "delete") {
        if (body.confirmation !== deletionConfirmation(user)) {
          throw new HttpError(400, "The confirmation does not match, so the account was not deleted");
        }
        const plan = await deps.deletionPlan(user.id);
        const canceledSubscriptions = await deps.stopBilling(user.id, plan.stripe_customer_ids);
        await deps.removeStorageObjects(plan.storage_objects);
        await deps.prepareDeletion(user.id);
        await deps.deleteAuthUser(user.id);
        console.log(`[ACCOUNT] Deleted account ${user.id}`);
        // The server cannot cancel an App Store subscription, so the app sends
        // the user to Apple's subscription settings when this is true.
        return Response.json({
          deleted: true,
          canceledSubscriptions,
          appStoreSubscriptionActive: plan.app_store_subscription_active === true,
        }, { headers: corsHeaders });
      }

      throw new HttpError(400, 'action must be "export" or "delete"');
    } catch (error) {
      if (error instanceof HttpError) return jsonError(error, corsHeaders);
      console.error("[ACCOUNT] Error:", error instanceof Error ? error.message : "unknown");
      return jsonError(new HttpError(500, "Something went wrong. Please try again."), corsHeaders);
    }
  };
}

function liveDeps(): AccountDeps {
  const admin = createAdminClient();

  return {
    authenticate: async (req) => (await requireUser(req)).user,

    exportData: async (userId) => {
      const { data, error } = await admin.rpc("export_account_data", { p_user_id: userId });
      if (error) {
        console.error("[ACCOUNT] Export failed", error.code);
        throw new HttpError(500, "Could not export your data. Please try again.");
      }
      return data;
    },

    deletionPlan: async (userId) => {
      const { data, error } = await admin.rpc("account_deletion_plan", { p_user_id: userId });
      if (error) {
        console.error("[ACCOUNT] Deletion plan failed", error.code);
        throw new HttpError(500, "Could not delete your account. Please try again.");
      }
      return data as DeletionPlan;
    },

    stopBilling: async (userId, knownCustomerIds) => {
      const billingError = new HttpError(
        502,
        "Could not cancel your subscription, so your account was not deleted. Please try again.",
      );
      const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
      if (!secretKey) throw billingError;
      // Only the local full-stack gate sets this, to reach its fake Stripe.
      const stripe = createEdgeStripe(secretKey, Deno.env.get("STRIPE_API_URL"));
      try {
        return await stopBillingFor({
          searchCustomers: (user) => stripe.customers.search({ query: `metadata['user_id']:'${user}'`, limit: 100 }),
          listOpenCheckouts: (customer) => stripe.checkout.sessions.list({ customer, status: "open", limit: 100 }),
          expireCheckout: (sessionId) => stripe.checkout.sessions.expire(sessionId),
          listSubscriptions: (customer) => stripe.subscriptions.list({ customer, status: "all", limit: 100 }),
          cancelSubscription: (subscriptionId) => stripe.subscriptions.cancel(subscriptionId),
        }, userId, knownCustomerIds);
      } catch (error) {
        console.error("[ACCOUNT] Stripe cancellation failed", (error as { code?: string }).code ?? "unknown");
        throw billingError;
      }
    },

    removeStorageObjects: async (objects) => {
      const byBucket = new Map<string, string[]>();
      for (const object of objects) {
        byBucket.set(object.bucket_id, [...(byBucket.get(object.bucket_id) ?? []), object.name]);
      }
      for (const [bucket, names] of byBucket) {
        for (let start = 0; start < names.length; start += 100) {
          const { error } = await admin.storage.from(bucket).remove(names.slice(start, start + 100));
          if (error) {
            console.error("[ACCOUNT] Storage removal failed", error.message);
            throw new HttpError(500, "Could not delete your stored files, so your account was not deleted. Please try again.");
          }
        }
      }
    },

    prepareDeletion: async (userId) => {
      const { error } = await admin.rpc("prepare_account_deletion", { p_user_id: userId });
      if (error) {
        console.error("[ACCOUNT] Deletion preparation failed", error.code);
        throw new HttpError(500, "Could not delete your account. Please try again.");
      }
    },

    deleteAuthUser: async (userId) => {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) {
        console.error("[ACCOUNT] Auth user deletion failed", error.status ?? "unknown");
        throw new HttpError(500, "Could not delete your account. Please try again.");
      }
    },
  };
}

if (import.meta.main) {
  Deno.serve(createHandler(liveDeps()));
}
