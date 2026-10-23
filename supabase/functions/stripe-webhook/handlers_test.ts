// Fixture Stripe events through the webhook handlers, against an in-memory
// PostgREST. Pins what each event writes, and that the result resolves to the
// state Settings and the AI functions show (QB-08, QB-13, QB-15).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.114.0";
import type { Stripe } from "../_shared/stripe.ts";
import { resolveBillingState } from "../_shared/billing-state.ts";
import { createWebhookHandlers } from "./handlers.ts";

type Row = Record<string, unknown>;

const NOW = new Date("2026-10-22T12:00:00.000Z");
const DAY_S = 24 * 60 * 60;
const nowS = Math.floor(NOW.getTime() / 1000);
const iso = (seconds: number) => new Date(seconds * 1000).toISOString();
const USER = "11111111-1111-4111-8111-111111111111";
const SUB = "sub_fixture";
const LIFETIME = "9999-12-31T23:59:59.999+00:00";

function assertEquals(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/** Applies eq. filters and records every write, the way supabase-js sends them. */
function fakeDatabase(tables: Record<string, Row[]>) {
  const writes: Array<{ table: string; method: string; body: Row }> = [];
  const matches = (row: Row, params: URLSearchParams) => {
    for (const [key, value] of params) {
      if (["select", "order", "limit", "on_conflict", "columns"].includes(key)) continue;
      const empty = row[key] === null || row[key] === undefined;
      if (value === "is.null") {
        if (!empty) return false;
      } else if (value === "not.is.null") {
        if (empty) return false;
      } else if (!value.startsWith("eq.") || String(row[key]) !== value.slice(3)) return false;
    }
    return true;
  };
  const fetchImpl = async (input: Request | URL | string, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(request.url);
    if (url.pathname.startsWith("/auth/v1/admin/users/")) {
      return Response.json({ id: url.pathname.split("/").pop(), email: "student@example.test" });
    }
    const table = url.pathname.match(/\/rest\/v1\/([a-z_]+)$/)?.[1];
    if (!table || !(table in tables)) throw new Error(`Unexpected request: ${request.method} ${url}`);
    const rows = tables[table];
    if (request.method === "GET") {
      const found = rows.filter((row) => matches(row, url.searchParams));
      if ((request.headers.get("accept") ?? "").includes("vnd.pgrst.object")) {
        return found.length === 1 ? Response.json(found[0]) : Response.json({ code: "PGRST116" }, { status: 406 });
      }
      return Response.json(found);
    }
    const body = await request.json() as Row;
    writes.push({ table, method: request.method, body });
    if (request.method === "PATCH") {
      for (const row of rows.filter((row) => matches(row, url.searchParams))) Object.assign(row, body);
    } else if (request.method === "POST") {
      const key = url.searchParams.get("on_conflict") ?? "id";
      const existing = rows.find((row) => row[key] === body[key]);
      if (existing) Object.assign(existing, body);
      else rows.push({ ...body });
    }
    return new Response(null, { status: 204 });
  };
  return { fetchImpl, writes };
}

function stripeSubscription(overrides: Partial<Stripe.Subscription>): Stripe.Subscription {
  return {
    id: SUB,
    status: "active",
    cancel_at_period_end: false,
    current_period_start: nowS - 10 * DAY_S,
    current_period_end: nowS + 20 * DAY_S,
    cancel_at: null,
    canceled_at: null,
    ended_at: null,
    trial_start: null,
    trial_end: null,
    items: { data: [{ price: { id: "price_fixture" }, quantity: 1 }] },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function setup(settings: Row, subscription: Row, stripeState: Stripe.Subscription) {
  const tables: Record<"user_settings" | "subscriptions", Row[]> = {
    user_settings: [{ user_id: USER, daily_limit_override: null, trial_ends_at: null, ...settings }],
    subscriptions: [{ user_id: USER, stripe_subscription_id: SUB, stripe_customer_id: "cus_fixture", ...subscription }],
  };
  const db = fakeDatabase(tables);
  const supabase = createClient("https://supabase.test", "service-role-key", {
    global: { fetch: db.fetchImpl as typeof fetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const stripe = {
    subscriptions: {
      retrieve: (id: string) => Promise.resolve(id === SUB ? stripeState : Promise.reject(new Error("unknown subscription"))),
      cancel: () => Promise.resolve({}),
    },
  };
  const handlers = createWebhookHandlers({ supabase, stripe, now: () => NOW });
  const state = () => resolveBillingState(tables.user_settings[0], tables.subscriptions, NOW);
  return { tables, writes: db.writes, handlers, state };
}

async function quietly<T>(run: () => Promise<T>): Promise<T> {
  const log = console.log;
  console.log = () => {};
  try {
    return await run();
  } finally {
    console.log = log;
  }
}

const ACTIVE_ROW = { status: "active", current_period_start: iso(nowS - 40 * DAY_S), current_period_end: iso(nowS - DAY_S), cancel_at_period_end: false };

Deno.test("invoice.payment_failed keeps Pro through the grace and does not touch the tier (QB-13)", async () => {
  // Stripe has already opened the new period when the renewal invoice fails.
  const failed = stripeSubscription({ status: "past_due", current_period_start: nowS - DAY_S, current_period_end: nowS + 29 * DAY_S });
  const { tables, writes, handlers, state } = setup({ subscription_tier: "pro", grace_period_ends_at: null }, ACTIVE_ROW, failed);
  await quietly(() => handlers.handle("invoice.payment_failed", { id: "in_fixture", subscription: SUB }));

  assertEquals(writes.filter((write) => write.table === "user_settings"), [], "user_settings writes");
  assertEquals(tables.user_settings[0].subscription_tier, "pro", "tier");
  assertEquals(tables.subscriptions[0].status, "past_due", "status");
  assertEquals(tables.subscriptions[0].current_period_start, iso(nowS - DAY_S), "period start");
  assertEquals(tables.subscriptions[0].payment_failed_at, NOW.toISOString(), "first failure recorded");
  const resolved = state();
  assertEquals([resolved.state, resolved.hasAccess, resolved.hasOpenSubscription], ["payment_failed", true, true], "resolved state");
});

Deno.test("a retried failure keeps the first failure's time, so the grace cannot restart", async () => {
  // Stripe left the subscription past due into a new period; the run of failures began 20 days ago.
  const firstFailure = iso(nowS - 20 * DAY_S);
  const failed = stripeSubscription({ status: "past_due", current_period_start: nowS - DAY_S, current_period_end: nowS + 29 * DAY_S });
  const { tables, handlers, state } = setup(
    { subscription_tier: "pro", grace_period_ends_at: null },
    { status: "past_due", current_period_start: iso(nowS - 31 * DAY_S), current_period_end: iso(nowS - DAY_S), payment_failed_at: firstFailure },
    failed,
  );
  await quietly(() => handlers.handle("invoice.payment_failed", { id: "in_fixture_2", subscription: SUB }));
  assertEquals(tables.subscriptions[0].payment_failed_at, firstFailure, "first failure kept");
  const resolved = state();
  assertEquals([resolved.state, resolved.hasAccess, resolved.refusal], ["payment_failed", false, "payment_failed"], "resolved state");
});

Deno.test("invoice.payment_succeeded clears the failure and restores Pro", async () => {
  const recovered = stripeSubscription({ status: "active" });
  const { tables, handlers, state } = setup(
    // The tier the old webhook wrote on the failure.
    { subscription_tier: "expired", grace_period_ends_at: null },
    { status: "past_due", current_period_start: iso(nowS - 10 * DAY_S), current_period_end: iso(nowS + 20 * DAY_S), payment_failed_at: iso(nowS - 3 * DAY_S) },
    recovered,
  );
  await quietly(() => handlers.handle("invoice.payment_succeeded", { id: "in_fixture_3", subscription: SUB }));
  assertEquals(tables.subscriptions[0].payment_failed_at, null, "failure cleared");
  assertEquals(tables.user_settings[0].subscription_tier, "pro", "tier restored");
  assertEquals(state().state, "pro", "resolved state");
});

Deno.test("customer.subscription.updated records cancel_at_period_end and keeps a promo grant (QB-15, QB-08)", async () => {
  const canceling = stripeSubscription({ cancel_at_period_end: true, cancel_at: nowS + 20 * DAY_S, canceled_at: nowS });
  const { tables, handlers, state } = setup(
    { subscription_tier: "pro", grace_period_ends_at: LIFETIME },
    { ...ACTIVE_ROW, current_period_end: iso(nowS + 20 * DAY_S) },
    canceling,
  );
  await quietly(() => handlers.handle("customer.subscription.updated", canceling));

  assertEquals(tables.subscriptions[0].cancel_at_period_end, true, "cancel_at_period_end");
  assertEquals(tables.subscriptions[0].cancel_at, iso(nowS + 20 * DAY_S), "cancel_at");
  assertEquals(tables.user_settings[0].grace_period_ends_at, LIFETIME, "promo grant");
  assertEquals(tables.user_settings[0].subscription_tier, "pro", "tier");
  // The card shows the Stripe plan's cancellation; the lifetime grant keeps Pro after it.
  assertEquals(state().state, "pro_canceling", "resolved state");
});

Deno.test("customer.subscription.updated for a Stripe-only plan shows Cancels on (QB-15)", async () => {
  const canceling = stripeSubscription({ cancel_at_period_end: true });
  const { handlers, state } = setup({ subscription_tier: "pro", grace_period_ends_at: null }, ACTIVE_ROW, canceling);
  await quietly(() => handlers.handle("customer.subscription.updated", canceling));
  const resolved = state();
  assertEquals([resolved.state, resolved.dateKind, resolved.date], ["pro_canceling", "cancels", iso(nowS + 20 * DAY_S)], "resolved state");
});

Deno.test("customer.subscription.deleted ends Stripe Pro with Stripe's end date (QB-14)", async () => {
  const ended = stripeSubscription({ status: "canceled", ended_at: nowS - 60, canceled_at: nowS - 3 * DAY_S });
  const { tables, handlers, state } = setup({ subscription_tier: "pro", grace_period_ends_at: null }, ACTIVE_ROW, ended);
  await quietly(() => handlers.handle("customer.subscription.deleted", ended));

  assertEquals(tables.subscriptions[0].status, "canceled", "status");
  assertEquals(tables.subscriptions[0].ended_at, iso(nowS - 60), "ended_at");
  assertEquals(tables.user_settings[0].subscription_tier, "expired", "tier");
  const resolved = state();
  assertEquals([resolved.state, resolved.refusal, resolved.date], ["subscription_ended", "subscription_ended", iso(nowS - 60)], "resolved state");
});

Deno.test("customer.subscription.deleted leaves a promo grant that ends later in place (QB-08)", async () => {
  const promoEnd = iso(nowS + 15 * DAY_S);
  const ended = stripeSubscription({ status: "canceled", ended_at: nowS });
  const { tables, writes, handlers, state } = setup({ subscription_tier: "pro", grace_period_ends_at: promoEnd }, ACTIVE_ROW, ended);
  await quietly(() => handlers.handle("customer.subscription.deleted", ended));

  assertEquals(writes.filter((write) => write.table === "user_settings"), [], "user_settings writes");
  assertEquals(tables.user_settings[0].subscription_tier, "pro", "tier");
  assertEquals(state().state, "pro", "resolved state");
});

Deno.test("checkout.session.completed grants Pro without wiping a promo grant (QB-08)", async () => {
  const active = stripeSubscription({});
  const { tables, writes, handlers } = setup({ subscription_tier: "pro", grace_period_ends_at: LIFETIME }, ACTIVE_ROW, active);
  await quietly(() => handlers.handle("checkout.session.completed", {
    id: "cs_fixture",
    mode: "subscription",
    subscription: SUB,
    customer: "cus_fixture",
    metadata: { user_id: USER },
  }));

  const settingsWrite = writes.find((write) => write.table === "user_settings");
  assertEquals(settingsWrite?.body.subscription_tier, "pro", "tier written");
  assertEquals("grace_period_ends_at" in (settingsWrite?.body ?? {}), false, "grace_period_ends_at left out of the write");
  assertEquals(tables.user_settings[0].grace_period_ends_at, LIFETIME, "promo grant");
});
