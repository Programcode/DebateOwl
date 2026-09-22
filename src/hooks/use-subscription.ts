import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/supabase/AuthProvider';

export type SubscriptionTier = 'trial' | 'pro' | 'legacy_free' | 'expired';

interface SubscriptionState {
  tier: SubscriptionTier;
  isPro: boolean;
  isTrialActive: boolean;
  isExpired: boolean;
  hasStripeBilling: boolean;
  dailyLimit: number;
  dailyUsed: number;
  trialEndsAt: string | null;
  gracePeriodEndsAt: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

interface BillingRow {
  stripe_customer_id?: string | null;
  status?: string | null;
  current_period_end?: string | null;
}

type SubscriptionSnapshot = Omit<SubscriptionState, 'loading' | 'refresh' | 'isPro' | 'isTrialActive' | 'isExpired'>;

const SUBSCRIPTION_STALE_TIME_MS = 60_000;
const SIGNED_OUT_SNAPSHOT: SubscriptionSnapshot = {
  tier: 'trial',
  hasStripeBilling: false,
  dailyLimit: 5,
  dailyUsed: 0,
  trialEndsAt: null,
  gracePeriodEndsAt: null,
};
const SIGNED_IN_FALLBACK: SubscriptionSnapshot = {
  tier: 'expired',
  hasStripeBilling: false,
  dailyLimit: 0,
  dailyUsed: 0,
  trialEndsAt: null,
  gracePeriodEndsAt: null,
};

async function fetchSubscription(userId: string): Promise<SubscriptionSnapshot> {
  let snapshot = { ...SIGNED_IN_FALLBACK };

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
      const rawTier = (data.subscription_tier || 'trial') as SubscriptionTier;
      const limitOrDefault = (defaultLimit: number) => data.daily_limit_override ?? defaultLimit;
      const now = new Date();
      let billingRows: BillingRow[] = [];

      const { data: billingData, error: billingError } = await supabase
        .from('subscriptions')
        .select('stripe_customer_id, status, current_period_end')
        .eq('user_id', userId)
        .order('current_period_end', { ascending: false, nullsFirst: false })
        .limit(5);

      if (billingError) {
        console.warn('[useSubscription] Failed to load Stripe billing state:', billingError.message);
      } else {
        billingRows = billingData || [];
      }

      const activeStripeSubscription = billingRows.some((row) =>
        (row.status === 'active' || row.status === 'trialing') &&
        row.current_period_end &&
        new Date(row.current_period_end) > now
      );
      const promoEnd = data.grace_period_ends_at ? new Date(data.grace_period_ends_at) : null;
      const trialEnd = data.trial_ends_at ? new Date(data.trial_ends_at) : null;
      const hasActiveTrialGift = Boolean(trialEnd && now < trialEnd);

      snapshot = {
        ...snapshot,
        hasStripeBilling: billingRows.some((row) => Boolean(row.stripe_customer_id)),
        trialEndsAt: data.trial_ends_at,
        gracePeriodEndsAt: data.grace_period_ends_at,
      };

      if (rawTier === 'legacy_free') {
        snapshot.tier = promoEnd && now < promoEnd ? 'legacy_free' : hasActiveTrialGift ? 'trial' : 'expired';
        snapshot.dailyLimit = limitOrDefault(snapshot.tier === 'legacy_free' ? 50 : snapshot.tier === 'trial' ? 5 : 0);
      } else if (rawTier === 'pro' && ((promoEnd && now < promoEnd) || activeStripeSubscription)) {
        snapshot.tier = 'pro';
        snapshot.dailyLimit = limitOrDefault(50);
      } else if (rawTier === 'trial' && trialEnd && now < trialEnd) {
        snapshot.tier = 'trial';
        snapshot.dailyLimit = limitOrDefault(5);
      } else if (hasActiveTrialGift) {
        snapshot.tier = 'trial';
        snapshot.dailyLimit = limitOrDefault(5);
      } else {
        snapshot.dailyLimit = limitOrDefault(0);
      }
    }

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { count, error: usageError } = await supabase
      .from('ai_requests')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', todayStart.toISOString());
    if (usageError) {
      console.warn('[useSubscription] Failed to load daily usage:', usageError.message);
    }

    return { ...snapshot, dailyUsed: usageError ? 0 : count || 0 };
  } catch (error) {
    console.warn('[useSubscription] Failed to load:', error);
    throw error;
  }
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
  const { tier, dailyLimit, dailyUsed, trialEndsAt, gracePeriodEndsAt, hasStripeBilling } = snapshot;

  const isPro = tier === 'pro' || tier === 'legacy_free';
  const isTrialActive = tier === 'trial';
  const isExpired = tier === 'expired';

  return {
    tier,
    isPro,
    isTrialActive,
    isExpired,
    hasStripeBilling,
    dailyLimit,
    dailyUsed,
    trialEndsAt,
    gracePeriodEndsAt,
    loading: Boolean(userId) && query.isPending,
    refresh: async () => {
      if (!userId) return;
      await query.refetch();
    },
  };
}
