// The one place that decides what plan an account is on. The AI functions
// (through entitlements.ts) and the browser (src/hooks/use-subscription.ts)
// both call resolveBillingState, so the server's refusal and the Settings card
// always describe the same state. No imports: the browser bundles this file.

/** The subscription_status values Stripe can still bill or retry. */
export const OPEN_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set(["active", "trialing", "past_due", "unpaid", "paused"]);

/**
 * How long a past-due subscription keeps Pro, counted from the first failed
 * payment (subscriptions.payment_failed_at, which the webhook sets once and
 * clears on recovery). Stripe retries the invoice for about two weeks with its
 * default Smart Retries; when the retries run out it marks the subscription
 * canceled or unpaid (Dashboard > Billing > Subscriptions and emails >
 * "Manage failed payments"), and the webhook moves the account on from there.
 * If that setting leaves the subscription past due instead, access still ends
 * here: the grace does not restart with each new period. When the period
 * start is earlier (a row past due before the column existed) it counts from
 * that instead; never from current_period_end, which Stripe has already moved
 * a whole period ahead by the time the renewal fails.
 */
export const PAYMENT_GRACE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * - trial: the free trial (or a gift trial) is running.
 * - extended_access: no plan, but daily_limit_override grants AI uses. Admins
 *   set it for expired trials on purpose, and the extra_limit promo writes it
 *   with no trial at all; both are deliberate grants, not leaks (QB-02).
 * - pro / pro_canceling: Stripe Pro (renewing or set to cancel at period end),
 *   or promo Pro.
 * - payment_failed: a Stripe subscription is past due or unpaid. Pro access
 *   continues for PAYMENT_GRACE_DAYS while Stripe retries (`hasAccess`).
 * - legacy_free: pre-billing accounts in their grace period.
 * - trial_ended / subscription_ended: no access. subscription_ended means the
 *   account once paid through Stripe, so it is told to resubscribe rather than
 *   that a free trial ended.
 */
export type BillingStateName =
  | "trial"
  | "extended_access"
  | "pro"
  | "pro_canceling"
  | "payment_failed"
  | "legacy_free"
  | "trial_ended"
  | "subscription_ended";

/** Why the AI functions refuse an account with no access. The client localizes each. */
export type AccessRefusalCode = "trial_ended" | "payment_failed" | "subscription_ended";

/** The daily-limit default and model access a state gets before overrides. */
export type BillingPlan = "pro" | "trial" | "none";

export interface BillingSettingsRow {
  subscription_tier?: string | null;
  daily_limit_override?: number | null;
  trial_ends_at?: string | null;
  grace_period_ends_at?: string | null;
}

export interface BillingSubscriptionRow {
  status?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
  ended_at?: string | null;
  canceled_at?: string | null;
  payment_failed_at?: string | null;
}

/**
 * - ends: a trial, a promo Pro grant or a legacy grace period ends then.
 * - renews / cancels: a Stripe Pro period ends then and renews, or does not.
 * - grace_ends: a past-due payer keeps Pro until then.
 * - ended: the Stripe subscription ended then.
 */
export type BillingDateKind = "ends" | "renews" | "cancels" | "grace_ends" | "ended";

export interface BillingState {
  state: BillingStateName;
  plan: BillingPlan;
  /** True when the account may use AI today (before quota). */
  hasAccess: boolean;
  /** Set when hasAccess is false: the code the AI functions refuse with. */
  refusal: AccessRefusalCode | null;
  /** The settings tier the old code reported: the client's tier mirror and checkout confirmation read it. */
  tier: "trial" | "pro" | "legacy_free" | "expired";
  /** The date the Settings card shows, and what it means (null for lifetime promo Pro). */
  date: string | null;
  dateKind: BillingDateKind | null;
  /** A Stripe subscription can still bill: offer Manage subscription, never a second Checkout. */
  hasOpenSubscription: boolean;
}

// Lifetime promo codes store 9999-12-31; there is no end date to show.
const LIFETIME_AFTER = Date.UTC(9000, 0, 1);

function time(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function latest(rows: BillingSubscriptionRow[], key: (row: BillingSubscriptionRow) => number | null): BillingSubscriptionRow | null {
  let best: BillingSubscriptionRow | null = null;
  let bestTime = -Infinity;
  for (const row of rows) {
    const value = key(row) ?? -Infinity;
    if (best === null || value > bestTime) {
      best = row;
      bestTime = value;
    }
  }
  return best;
}

/** When a past-due subscription stops granting Pro. */
export function paymentGraceEndsAt(row: BillingSubscriptionRow): number | null {
  // The earlier of the two: a row that was already past due before the
  // webhook stamped payment_failed_at keeps its older period start.
  const starts = [time(row.payment_failed_at), time(row.current_period_start)].filter((value): value is number => value !== null);
  return starts.length ? Math.min(...starts) + PAYMENT_GRACE_DAYS * DAY_MS : null;
}

/**
 * Resolves an account's plan from its user_settings row and its Stripe
 * subscription rows. First match wins:
 *   1. Stripe Pro (an active or trialing period not yet over, whatever the tier);
 *   2. promo Pro (tier pro, grace_period_ends_at in the future);
 *   3. legacy_free in its grace period;
 *   4. a past-due or unpaid subscription inside the payment grace (Pro);
 *   5. a running free or gift trial (trial_ends_at in the future);
 *   6. extended access (daily_limit_override above 0);
 *   7. no access: payment_failed while a subscription is still past due or
 *      unpaid, subscription_ended when one has ended, otherwise trial_ended.
 *
 * Trial fallback after a failed payment (QB-17): the webhook leaves
 * trial_ends_at alone, so someone who subscribed during their free trial and
 * then failed a payment keeps Pro through the grace (4 comes before 5). If the
 * grace ends while their own free trial is still running, they fall back to
 * that trial's limits until it ends: the trial was theirs before they paid,
 * and a failed payment does not take it away.
 */
export function resolveBillingState(
  settings: BillingSettingsRow | null,
  subscriptions: BillingSubscriptionRow[] | null | undefined,
  now: Date = new Date(),
): BillingState {
  const rows = subscriptions ?? [];
  const nowMs = now.getTime();
  const hasOpenSubscription = rows.some((row) => typeof row.status === "string" && OPEN_SUBSCRIPTION_STATUSES.has(row.status));
  const result = (
    state: BillingStateName,
    plan: BillingPlan,
    tier: BillingState["tier"],
    dated: [BillingDateKind, string | null | undefined] | null,
    refusal: AccessRefusalCode | null = null,
  ): BillingState => ({
    state,
    plan,
    hasAccess: refusal === null,
    refusal,
    tier,
    date: dated?.[1] ?? null,
    dateKind: dated?.[1] ? dated[0] : null,
    hasOpenSubscription,
  });

  // A settings row exists for every account (on_auth_user_created). A missing
  // one is untrusted, so it gets no access instead of a fresh trial.
  if (!settings) return result("trial_ended", "none", "expired", null, "trial_ended");

  const tier = settings.subscription_tier || "trial";
  const promoEnd = time(settings.grace_period_ends_at);
  const trialEnd = time(settings.trial_ends_at);
  const override = settings.daily_limit_override;

  // Stripe Pro counts whatever the tier says, and comes before a promo grant
  // (QB-08 keeps both) so the card shows the renewal date the payer is billed on. Only the webhook (service role)
  // writes subscriptions rows, while the tier can lag it: an invoice paid
  // before its subscription.updated event arrives, an account the old webhook
  // downgraded on a failed payment, or an admin gift trial given to a payer.
  {
    const current = latest(
      rows.filter((row) => (row.status === "active" || row.status === "trialing") && (time(row.current_period_end) ?? 0) > nowMs),
      (row) => time(row.current_period_end),
    );
    if (current) {
      return current.cancel_at_period_end
        ? result("pro_canceling", "pro", "pro", ["cancels", current.current_period_end])
        : result("pro", "pro", "pro", ["renews", current.current_period_end]);
    }
  }

  if (tier === "pro" && promoEnd !== null && nowMs < promoEnd) {
    return result("pro", "pro", "pro", promoEnd >= LIFETIME_AFTER ? null : ["ends", settings.grace_period_ends_at]);
  }
  if (tier === "legacy_free" && promoEnd !== null && nowMs < promoEnd) {
    return result("legacy_free", "pro", "legacy_free", ["ends", settings.grace_period_ends_at]);
  }

  const failing = latest(rows.filter((row) => row.status === "past_due" || row.status === "unpaid"), paymentGraceEndsAt);
  const graceEnd = failing ? paymentGraceEndsAt(failing) : null;
  if (failing?.status === "past_due" && graceEnd !== null && nowMs < graceEnd) {
    return result("payment_failed", "pro", "pro", ["grace_ends", new Date(graceEnd).toISOString()]);
  }

  if (trialEnd !== null && nowMs < trialEnd) return result("trial", "trial", "trial", ["ends", settings.trial_ends_at]);

  if (typeof override === "number" && override > 0) return result("extended_access", "none", "expired", null);

  if (failing) return result("payment_failed", "none", "expired", null, "payment_failed");
  const ended = latest(rows.filter((row) => row.status === "canceled"), (row) => time(row.ended_at ?? row.canceled_at ?? row.current_period_end));
  if (ended) {
    return result("subscription_ended", "none", "expired", ["ended", ended.ended_at ?? ended.canceled_at ?? ended.current_period_end], "subscription_ended");
  }
  return result("trial_ended", "none", "expired", null, "trial_ended");
}

/** The daily AI limit before rate_limits rows: the override, else the plan's default. */
export function planDailyLimit(state: Pick<BillingState, "plan">, override: number | null | undefined, defaults: { pro: number; trial: number }): number {
  if (typeof override === "number") return override;
  return state.plan === "pro" ? defaults.pro : state.plan === "trial" ? defaults.trial : 0;
}
