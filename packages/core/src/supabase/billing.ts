import {
  APP_STORE_BILLING_COLUMNS,
  appStoreBillingRows,
  isMissingTableError,
  resolveBillingState,
  type BillingAppStoreRow,
  type BillingSettingsRow,
  type BillingState,
  type BillingSubscriptionRow,
} from '../contract/billing-state';

/**
 * The rows an account's plan is resolved from, read the way the AI functions
 * read them (supabase/functions/_shared/entitlements.ts), so the website, the
 * iOS app and the server agree: user_settings, Stripe subscriptions and App
 * Store subscriptions, all through RLS for the signed-in user.
 */
export interface BillingRows {
  settings: BillingSettingsRow | null;
  subscriptions: (BillingSubscriptionRow & { stripe_customer_id?: string | null })[];
  appStore: BillingAppStoreRow[];
  /** The Stripe or App Store rows could not be read; settings alone decided. */
  partial: boolean;
}

interface QueryResult {
  data: unknown;
  error: { message: string; code?: string } | null;
}

/**
 * Reads `columns` from one of the signed-in user's tables, e.g.
 * `(table, columns) => supabase.from(table).select(columns).eq('user_id', userId)`.
 * Shared code stays free of supabase-js, so each app passes its own client this way.
 */
export type BillingQuery = (table: string, columns: string) => PromiseLike<QueryResult>;

const SETTINGS_COLUMNS = 'subscription_tier, daily_limit_override, trial_ends_at, grace_period_ends_at';

/**
 * The billing rows, or null when the settings row cannot be read. A caller
 * that already holds the user_settings row passes it, and it is not read again.
 */
export async function readBillingRows(query: BillingQuery, knownSettings?: BillingSettingsRow): Promise<BillingRows | null> {
  const [settings, stripe, store] = await Promise.all([
    knownSettings
      ? Promise.resolve<QueryResult>({ data: [knownSettings], error: null })
      : query('user_settings', SETTINGS_COLUMNS),
    // `*`: a client ships before migrations, so naming a new column would fail the read.
    query('subscriptions', '*'),
    query('app_store_subscriptions', APP_STORE_BILLING_COLUMNS),
  ]);
  if (settings.error) return null;
  const settingsRow = Array.isArray(settings.data) ? settings.data[0] ?? null : null;
  const storeFailed = Boolean(store.error) && !isMissingTableError(store.error);
  return {
    settings: settingsRow as BillingSettingsRow | null,
    subscriptions: !stripe.error && Array.isArray(stripe.data) ? stripe.data : [],
    appStore: store.error ? [] : appStoreBillingRows(store.data),
    partial: Boolean(stripe.error) || storeFailed,
  };
}

/**
 * The resolved plan, or null when it cannot be told: no settings row read, or
 * rows missing while what was read grants no access (the account may be paying).
 */
export async function readBillingState(query: BillingQuery): Promise<{ billing: BillingState; rows: BillingRows } | null> {
  const rows = await readBillingRows(query);
  if (!rows) return null;
  const billing = resolveBillingState(rows.settings, rows.subscriptions, new Date(), rows.appStore);
  if (rows.partial && !billing.hasAccess) return null;
  return { billing, rows };
}

/**
 * Whether the plan includes Pro models: true once the rows read prove Pro,
 * null when a "no" could be wrong because some rows could not be read.
 */
export async function readProModelAccess(query: BillingQuery, knownSettings?: BillingSettingsRow): Promise<boolean | null> {
  const rows = await readBillingRows(query, knownSettings);
  if (!rows) return null;
  if (resolveBillingState(rows.settings, rows.subscriptions, new Date(), rows.appStore).plan === 'pro') return true;
  return rows.partial ? null : false;
}
