import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/supabase/AuthProvider';
import {
  planDailyLimit,
  resolveBillingState,
  type BillingDateKind,
  type BillingStateName,
  type BillingSubscriptionRow,
} from '../../supabase/functions/_shared/billing-state';

export type SubscriptionTier = 'trial' | 'pro' | 'legacy_free' | 'expired';
export type { BillingDateKind, BillingStateName };

// The server's tier defaults (supabase/functions/_shared/usage-limits.ts).
const DEFAULT_LIMITS = { pro: 50, trial: 5 };

interface SubscriptionState {
  tier: SubscriptionTier;
  /** The state the server resolves too (billing-state.ts); Settings shows it. */
  billingState: BillingStateName;
  /** The date that goes with the state: trial end, renewal, cancellation, payment grace end, or when Pro ended. */
  billingDate: string | null;
  billingDateKind: BillingDateKind | null;
  /** A Stripe subscription can still bill, so the next step is Manage subscription, not Checkout. */
  hasOpenSubscription: boolean;
  isPro: boolean;
  isTrialActive: boolean;
  isExpired: boolean;
  hasStripeBilling: boolean;
  dailyLimit: number;
  dailyUsed: number;
  /** AI requests left today, or null while it is unknown (loading, failed read, signed out). Never block on null. */
  remainingToday: number | null;
  trialEndsAt: string | null;
  gracePeriodEndsAt: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  /** Re-reads usage and returns what is left today, or null when it cannot be read. */
  checkRemainingToday: () => Promise<number | null>;
}

interface BillingRow extends BillingSubscriptionRow {
  stripe_customer_id?: string | null;
}

type SubscriptionSnapshot = Omit<SubscriptionState, 'loading' | 'refresh' | 'checkRemainingToday' | 'isPro' | 'isTrialActive' | 'isExpired' | 'remainingToday'> & {
  usageKnown: boolean;
};

const SUBSCRIPTION_STALE_TIME_MS = 60_000;
const SIGNED_OUT_SNAPSHOT: SubscriptionSnapshot = {
  tier: 'trial',
  billingState: 'trial',
  billingDate: null,
  billingDateKind: null,
  hasOpenSubscription: false,
  hasStripeBilling: false,
  dailyLimit: 5,
  dailyUsed: 0,
  usageKnown: false,
  trialEndsAt: null,
  gracePeriodEndsAt: null,
};
const SIGNED_IN_FALLBACK: SubscriptionSnapshot = {
  tier: 'expired',
  billingState: 'trial_ended',
  billingDate: null,
  billingDateKind: null,
  hasOpenSubscription: false,
  hasStripeBilling: false,
  dailyLimit: 0,
  dailyUsed: 0,
  usageKnown: false,
  trialEndsAt: null,
  gracePeriodEndsAt: null,
};

async function fetchSubscription(userId: string): Promise<SubscriptionSnapshot> {
  let snapshot = { ...SIGNED_IN_FALLBACK };
  let hasAccess = false;

  try {
    const { data, error: settingsError } = await supabase
      .from('user_settings')
      .select('subscription_tier, daily_limit_override, trial_ends_at, grace_period_ends_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (settingsError) {
      console.warn('[useSubscription] Failed to load user settings:', settingsError.message);
      throw new Error(settingsError.message);
    }

    if (data) {
      let billingRows: BillingRow[] = [];

      const { data: billingData, error: billingError } = await supabase
        .from('subscriptions')
        // `*`: the frontend ships on merge, before migrations, so naming a new
        // column (payment_failed_at) would fail this read until it lands.
        .select('*')
        .eq('user_id', userId)
        .order('current_period_end', { ascending: false, nullsFirst: false })
        .limit(10);

      if (billingError) {
        console.warn('[useSubscription] Failed to load Stripe billing state:', billingError.message);
      } else {
        billingRows = billingData || [];
      }

      // The same resolver the AI functions use, so Settings never says
      // "Expired" to an account the server serves (QB-02).
      const billing = resolveBillingState(data, billingRows);
      hasAccess = billing.hasAccess;
      snapshot = {
        ...snapshot,
        tier: billing.tier,
        billingState: billing.state,
        billingDate: billing.date,
        billingDateKind: billing.dateKind,
        hasOpenSubscription: billing.hasOpenSubscription,
        dailyLimit: planDailyLimit(billing, data.daily_limit_override, DEFAULT_LIMITS),
        hasStripeBilling: billingRows.some((row) => Boolean(row.stripe_customer_id)),
        trialEndsAt: data.trial_ends_at,
        gracePeriodEndsAt: data.grace_period_ends_at,
      };
    }

    // The server lets a per-account rate_limits row replace the plan's limit
    // (getConfiguredDailyLimit). Global rows are server-only, so the remaining
    // count is an estimate: warn with it, and let the server's 402 decide.
    let limitKnown = true;
    // An account with no access is refused before the server reads rate_limits.
    if (data && hasAccess) {
      const { data: ownLimit, error: limitError } = await supabase
        .from('rate_limits')
        .select('limit_value')
        .eq('user_id', userId)
        .eq('limit_type', 'daily_requests')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (limitError) {
        console.warn('[useSubscription] rate_limits lookup failed:', limitError.message);
        limitKnown = false;
      }
      else if (typeof ownLimit?.limit_value === 'number') snapshot.dailyLimit = ownLimit.limit_value;
    }

    // The server's own counter: model-weighted units, one charge per Crossfire
    // or Sparring round, refunds given back.
    const counted = await readAIUsageToday();
    if (counted !== null) {
      return { ...snapshot, dailyUsed: counted, usageKnown: limitKnown && Boolean(data) };
    }

    // A server from before ai_usage_today: count today's usage rows. Refused
    // calls and the jev_* helper steps inside a call log rows too, but use no quota.
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { count, error: usageError } = await supabase
      .from('ai_requests')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', todayStart.toISOString())
      .neq('status', 'rate_limited')
      .not('feature', 'like', 'jev_%');
    if (usageError) {
      console.warn('[useSubscription] Failed to load daily usage:', usageError.message);
    }

    return { ...snapshot, dailyUsed: usageError ? 0 : count || 0, usageKnown: !usageError && limitKnown && Boolean(data) };
  } catch (error) {
    console.warn('[useSubscription] Failed to load:', error);
    throw error;
  }
}

/** Today's charged AI units from the server's counter, or null when it cannot be read. */
async function readAIUsageToday(): Promise<number | null> {
  try {
    const { data, error } = await supabase.rpc('ai_usage_today');
    return !error && typeof data === 'number' ? data : null;
  } catch {
    return null;
  }
}

function remainingRequests(snapshot: SubscriptionSnapshot, usageKnown: boolean): number | null {
  if (!usageKnown) return null;
  return Math.max(0, snapshot.dailyLimit - snapshot.dailyUsed);
}

export function useSubscription(): SubscriptionState {
  const { user } = useAuth();
  const userId = user?.id;
  const query = useQuery({
    queryKey: ['subscription', userId],
    queryFn: () => fetchSubscription(userId!),
    enabled: Boolean(userId),
    staleTime: SUBSCRIPTION_STALE_TIME_MS,
  });
  const snapshot = userId
    ? query.isError ? SIGNED_IN_FALLBACK : query.data ?? SIGNED_IN_FALLBACK
    : SIGNED_OUT_SNAPSHOT;
  const { tier, billingState, billingDate, billingDateKind, hasOpenSubscription, dailyLimit, dailyUsed, trialEndsAt, gracePeriodEndsAt, hasStripeBilling } = snapshot;
  const usageKnown = Boolean(userId) && !query.isError && snapshot.usageKnown;

  const isPro = tier === 'pro' || tier === 'legacy_free';
  const isTrialActive = tier === 'trial';
  const isExpired = tier === 'expired';

  return {
    tier,
    billingState,
    billingDate,
    billingDateKind,
    hasOpenSubscription,
    isPro,
    isTrialActive,
    isExpired,
    hasStripeBilling,
    dailyLimit,
    dailyUsed,
    remainingToday: remainingRequests(snapshot, usageKnown),
    trialEndsAt,
    gracePeriodEndsAt,
    loading: Boolean(userId) && query.isPending,
    refresh: async () => {
      if (!userId) return;
      await query.refetch();
    },
    checkRemainingToday: async () => {
      if (!userId) return null;
      const result = await query.refetch();
      return result.isError || !result.data ? null : remainingRequests(result.data, result.data.usageKnown);
    },
  };
}
