// The plan resolver the AI functions and the Settings card share. Each state
// the QA report found shown or refused wrongly (QB-02, QB-13, QB-14, QB-15)
// is pinned here with the rows that produced it.

import {
  appStoreBillingRows,
  type BillingAppStoreRow,
  type BillingSettingsRow,
  type BillingSubscriptionRow,
  PAYMENT_GRACE_DAYS,
  planDailyLimit,
  resolveBillingState,
} from "./billing-state.ts";

const NOW = new Date("2026-10-22T12:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(NOW.getTime() + days * DAY).toISOString();
const LIMITS = { pro: 50, basic: 20, trial: 5 };

function settings(overrides: BillingSettingsRow): BillingSettingsRow {
  return { subscription_tier: "trial", daily_limit_override: null, trial_ends_at: null, grace_period_ends_at: null, ...overrides };
}

function check(
  name: string,
  row: BillingSettingsRow | null,
  subscriptions: BillingSubscriptionRow[],
  expected: { state: string; access: boolean; refusal?: string | null; limit: number; date?: string | null; dateKind?: string | null; open?: boolean },
  appStore: BillingAppStoreRow[] = [],
) {
  Deno.test(name, () => {
    const result = resolveBillingState(row, subscriptions, NOW, appStore);
    const actual = {
      state: result.state,
      access: result.hasAccess,
      refusal: result.refusal,
      limit: planDailyLimit(result, row?.daily_limit_override, LIMITS),
      date: result.date,
      dateKind: result.dateKind,
      open: result.hasOpenSubscription,
    };
    const wanted = {
      state: expected.state,
      access: expected.access,
      refusal: expected.refusal ?? null,
      limit: expected.limit,
      date: expected.date ?? null,
      dateKind: expected.dateKind ?? null,
      open: expected.open ?? false,
    };
    if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
      throw new Error(`expected ${JSON.stringify(wanted)}\n     got ${JSON.stringify(actual)}`);
    }
  });
}

check("a running trial", settings({ trial_ends_at: at(2) }), [], { state: "trial", access: true, limit: 5, date: at(2), dateKind: "ends" });

check("an expired trial with no override has no access", settings({ trial_ends_at: at(-1) }), [], {
  state: "trial_ended", access: false, refusal: "trial_ended", limit: 0,
});

check("an expired trial with an override is extended access, not expired (QB-02)", settings({ trial_ends_at: at(-1), daily_limit_override: 5 }), [], {
  state: "extended_access", access: true, limit: 5,
});

check("the extra_limit promo (an override with no trial) is extended access too", settings({ subscription_tier: "expired", daily_limit_override: 15 }), [], {
  state: "extended_access", access: true, limit: 15,
});

check("an override of 0 grants nothing", settings({ trial_ends_at: at(-1), daily_limit_override: 0 }), [], {
  state: "trial_ended", access: false, refusal: "trial_ended", limit: 0,
});

check("Stripe Pro that renews", settings({ subscription_tier: "pro" }), [
  { status: "active", current_period_start: at(-10), current_period_end: at(20), cancel_at_period_end: false },
], { state: "pro", access: true, limit: 50, date: at(20), dateKind: "renews", open: true });

check("Stripe Pro set to cancel (QB-15)", settings({ subscription_tier: "pro" }), [
  { status: "active", current_period_start: at(-10), current_period_end: at(20), cancel_at_period_end: true },
], { state: "pro_canceling", access: true, limit: 50, date: at(20), dateKind: "cancels", open: true });

check("a past-due payer keeps Pro during the grace (QB-13)", settings({ subscription_tier: "pro", trial_ends_at: at(-40) }), [
  { status: "past_due", current_period_start: at(-3), current_period_end: at(27) },
], { state: "payment_failed", access: true, limit: 50, date: at(PAYMENT_GRACE_DAYS - 3), dateKind: "grace_ends", open: true });

check("the grace also covers rows the old webhook downgraded to expired", settings({ subscription_tier: "expired" }), [
  { status: "past_due", current_period_start: at(-1), current_period_end: at(29) },
], { state: "payment_failed", access: true, limit: 50, date: at(PAYMENT_GRACE_DAYS - 1), dateKind: "grace_ends", open: true });

check("a past-due payer after the grace is refused with payment_failed", settings({ subscription_tier: "pro" }), [
  { status: "past_due", current_period_start: at(-PAYMENT_GRACE_DAYS - 1), current_period_end: at(15) },
], { state: "payment_failed", access: false, refusal: "payment_failed", limit: 0, open: true });

check("the grace counts from the first failure, not a newer period start", settings({ subscription_tier: "pro" }), [
  { status: "past_due", current_period_start: at(-1), current_period_end: at(29), payment_failed_at: at(-PAYMENT_GRACE_DAYS - 1) },
], { state: "payment_failed", access: false, refusal: "payment_failed", limit: 0, open: true });

check("unpaid (Stripe stopped retrying) gets no grace", settings({ subscription_tier: "pro" }), [
  { status: "unpaid", current_period_start: at(-2), current_period_end: at(28) },
], { state: "payment_failed", access: false, refusal: "payment_failed", limit: 0, open: true });

check("a former subscriber is told the subscription ended, with its date (QB-14)", settings({ subscription_tier: "expired", trial_ends_at: at(-60) }), [
  { status: "canceled", current_period_start: at(-40), current_period_end: at(-10), ended_at: at(-10), canceled_at: at(-12) },
], { state: "subscription_ended", access: false, refusal: "subscription_ended", limit: 0, date: at(-10), dateKind: "ended" });

check("promo Pro outlives a canceled subscription (QB-08)", settings({ subscription_tier: "pro", grace_period_ends_at: at(20) }), [
  { status: "canceled", current_period_start: at(-40), current_period_end: at(-10), ended_at: at(-10) },
], { state: "pro", access: true, limit: 50, date: at(20), dateKind: "ends" });

check("a renewing Stripe plan shows its renewal over a promo grant it overlaps", settings({ subscription_tier: "pro", grace_period_ends_at: at(20) }), [
  { status: "active", current_period_start: at(-1), current_period_end: at(29) },
], { state: "pro", access: true, limit: 50, date: at(29), dateKind: "renews", open: true });

check("a cancelling Stripe plan inside a longer promo grant shows the promo", settings({ subscription_tier: "pro", grace_period_ends_at: "9999-12-31T23:59:59.999Z" }), [
  { status: "active", current_period_start: at(-1), current_period_end: at(29), cancel_at_period_end: true },
], { state: "pro", access: true, limit: 50, open: true });

check("lifetime promo Pro shows no end date", settings({ subscription_tier: "pro", grace_period_ends_at: "9999-12-31T23:59:59.999Z", daily_limit_override: 50 }), [], {
  state: "pro", access: true, limit: 50,
});

check("legacy free in its grace period", settings({ subscription_tier: "legacy_free", grace_period_ends_at: at(5) }), [], {
  state: "legacy_free", access: true, limit: 50, date: at(5), dateKind: "ends",
});

check("legacy free after its grace has no access", settings({ subscription_tier: "legacy_free", grace_period_ends_at: at(-5) }), [], {
  state: "trial_ended", access: false, refusal: "trial_ended", limit: 0,
});

check("after the payment grace, the payer's own running trial still applies (QB-17)", settings({ subscription_tier: "pro", trial_ends_at: at(1) }), [
  { status: "past_due", current_period_start: at(-PAYMENT_GRACE_DAYS - 1), current_period_end: at(15) },
], { state: "trial", access: true, limit: 5, date: at(1), dateKind: "ends", open: true });

check("a paid Stripe period counts whatever the tier says (old downgrade, gift trial to a payer)", settings({ subscription_tier: "trial", trial_ends_at: at(2) }), [
  { status: "active", current_period_start: at(-10), current_period_end: at(20) },
], { state: "pro", access: true, limit: 50, date: at(20), dateKind: "renews", open: true });

check("a row past due before the failure was stamped keeps its older period start", settings({ subscription_tier: "expired" }), [
  { status: "past_due", current_period_start: at(-PAYMENT_GRACE_DAYS - 1), current_period_end: at(15), payment_failed_at: at(-1) },
], { state: "payment_failed", access: false, refusal: "payment_failed", limit: 0, open: true });

check("a missing settings row fails closed", null, [], { state: "trial_ended", access: false, refusal: "trial_ended", limit: 0 });

// App Store subscriptions from the iOS app, the rules the pgTAP suite pinned
// for effective_entitlement() (supabase/tests/app_store_entitlements_test.sql).
const store = (overrides: BillingAppStoreRow): BillingAppStoreRow => ({
  tier: "pro", expires_at: at(20), grace_period_expires_at: null, revoked_at: null, upgraded: false, auto_renew: true, ...overrides,
});

check("App Store Pro renews like Stripe Pro", settings({}), [], { state: "pro", access: true, limit: 50, date: at(20), dateKind: "renews" }, [store({})]);

check("App Store Pro with auto-renew off is set to cancel", settings({}), [], {
  state: "pro_canceling", access: true, limit: 50, date: at(20), dateKind: "cancels",
}, [store({ auto_renew: false })]);

check("App Store Basic outranks a running trial", settings({ trial_ends_at: at(5) }), [], {
  state: "basic", access: true, limit: 20, date: at(20), dateKind: "renews",
}, [store({ tier: "basic" })]);

check("an override replaces Basic's daily limit", settings({ daily_limit_override: 7 }), [], {
  state: "basic", access: true, limit: 7, date: at(20), dateKind: "renews",
}, [store({ tier: "basic" })]);

check("Pro outranks Basic", settings({}), [], { state: "pro", access: true, limit: 50, date: at(10), dateKind: "renews" }, [
  store({ tier: "basic", expires_at: at(30) }),
  store({ expires_at: at(10) }),
]);

check("of two Pro rows the later expiry shows", settings({}), [], { state: "pro", access: true, limit: 50, date: at(30), dateKind: "renews" }, [
  store({ expires_at: at(10) }),
  store({ expires_at: at(30) }),
]);

check("legacy free in its grace outranks App Store Basic", settings({ subscription_tier: "legacy_free", grace_period_ends_at: at(15) }), [], {
  state: "legacy_free", access: true, limit: 50, date: at(15), dateKind: "ends",
}, [store({ tier: "basic" })]);

check("a revoked App Store row grants nothing", settings({ trial_ends_at: at(-1) }), [], {
  state: "trial_ended", access: false, refusal: "trial_ended", limit: 0,
}, [store({ revoked_at: at(-1) })]);

check("an upgraded App Store row grants nothing until its replacement arrives", settings({ trial_ends_at: at(-1) }), [], {
  state: "trial_ended", access: false, refusal: "trial_ended", limit: 0,
}, [store({ upgraded: true })]);

check("an expired App Store row grants nothing", settings({ trial_ends_at: at(-1) }), [], {
  state: "trial_ended", access: false, refusal: "trial_ended", limit: 0,
}, [store({ expires_at: at(-1) })]);

check("Apple's billing grace keeps App Store Pro", settings({}), [], { state: "pro", access: true, limit: 50, date: at(3), dateKind: "renews" }, [
  store({ expires_at: at(-1), grace_period_expires_at: at(3) }),
]);

check("Stripe Pro that ends later shows its own renewal", settings({ subscription_tier: "pro" }), [
  { status: "active", current_period_start: at(-1), current_period_end: at(29) },
], { state: "pro", access: true, limit: 50, date: at(29), dateKind: "renews", open: true }, [store({ expires_at: at(10) })]);

check("App Store Pro outlasting Stripe Pro shows the App Store renewal", settings({ subscription_tier: "pro" }), [
  { status: "active", current_period_start: at(-20), current_period_end: at(10) },
], { state: "pro", access: true, limit: 50, date: at(25), dateKind: "renews", open: true }, [store({ expires_at: at(25) })]);

Deno.test("App Store rows keep the embedded product tier and drop malformed values", () => {
  const rows = appStoreBillingRows([
    { expires_at: at(1), grace_period_expires_at: null, revoked_at: null, upgraded: false, auto_renew: true, app_store_products: { tier: "basic" } },
    { expires_at: at(2), upgraded: "yes", auto_renew: "no", app_store_products: [{ tier: "pro" }] },
    { expires_at: 5, app_store_products: null },
    null,
  ]);
  const wanted = [
    { tier: "basic", expires_at: at(1), grace_period_expires_at: null, revoked_at: null, upgraded: false, auto_renew: true },
    { tier: "pro", expires_at: at(2), grace_period_expires_at: null, revoked_at: null, upgraded: false, auto_renew: null },
    { tier: null, expires_at: null, grace_period_expires_at: null, revoked_at: null, upgraded: false, auto_renew: null },
  ];
  if (JSON.stringify(rows) !== JSON.stringify(wanted)) throw new Error(`got ${JSON.stringify(rows)}`);
  if (appStoreBillingRows({}).length !== 0) throw new Error("a non-array is no rows");
});
