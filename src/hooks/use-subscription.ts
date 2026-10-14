import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/supabase/AuthProvider';
import { readEntitlement, type SubscriptionTier } from '@debatelab/core/supabase/entitlement';

export type { SubscriptionTier };

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
  // The plan merges Stripe, App Store, promo and trial access on the server,
  // the same answer the AI functions enforce.
  const entitlement = await readEntitlement(supabase, userId);
  if (!entitlement) {
    console.warn('[useSubscription] Failed to load the plan');
    throw new Error('Could not load the plan');
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

  return {
    tier: entitlement.tier,
    hasStripeBilling: entitlement.hasStripeBilling,
    dailyLimit: entitlement.dailyLimit,
    dailyUsed: usageError ? 0 : count || 0,
    trialEndsAt: entitlement.trialEndsAt,
    gracePeriodEndsAt: entitlement.gracePeriodEndsAt,
  };
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
