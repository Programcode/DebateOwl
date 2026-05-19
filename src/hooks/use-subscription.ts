import { useState, useEffect, useCallback } from 'react';
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

export function useSubscription(): SubscriptionState {
  const { user } = useAuth();
  const [tier, setTier] = useState<SubscriptionTier>('trial');
  const [dailyLimit, setDailyLimit] = useState(5);
  const [dailyUsed, setDailyUsed] = useState(0);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [gracePeriodEndsAt, setGracePeriodEndsAt] = useState<string | null>(null);
  const [hasStripeBilling, setHasStripeBilling] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setHasStripeBilling(false);
      setLoading(false);
      return;
    }

    try {
      // Fetch user settings for subscription info
      const { data } = await supabase
        .from('user_settings')
        .select('subscription_tier, daily_limit_override, trial_ends_at, grace_period_ends_at')
        .eq('user_id', user.id)
        .single();

      if (data) {
        const rawTier = (data.subscription_tier || 'trial') as SubscriptionTier;
        const now = new Date();
        let billingRows: BillingRow[] = [];

        const { data: billingData, error: billingError } = await supabase
          .from('subscriptions')
          .select('stripe_customer_id, status, current_period_end')
          .eq('user_id', user.id)
          .order('current_period_end', { ascending: false })
          .limit(5);

        if (billingError) {
          console.warn('[useSubscription] Failed to load Stripe billing state:', billingError.message);
          setHasStripeBilling(false);
        } else {
          billingRows = billingData || [];
          setHasStripeBilling(billingRows.some((row) => Boolean(row.stripe_customer_id)));
        }

        const activeStripeSubscription = billingRows.some((row) =>
          (row.status === 'active' || row.status === 'trialing') &&
          row.current_period_end &&
          new Date(row.current_period_end) > now
        );

        const promoEnd = data.grace_period_ends_at ? new Date(data.grace_period_ends_at) : null;
        const trialEnd = data.trial_ends_at ? new Date(data.trial_ends_at) : null;
        const hasActiveTrialGift = Boolean(trialEnd && now < trialEnd);

        // Determine effective tier
        if (rawTier === 'legacy_free') {
          if (promoEnd && now < promoEnd) {
            setTier('legacy_free');
            setDailyLimit(data.daily_limit_override ? Math.max(50, data.daily_limit_override) : 50);
          } else if (hasActiveTrialGift) {
            setTier('trial');
            setDailyLimit(data.daily_limit_override ? Math.max(5, data.daily_limit_override) : 5);
          } else {
            setTier('expired');
            setDailyLimit(data.daily_limit_override || 0);
          }
        } else if (rawTier === 'pro' && ((promoEnd && now < promoEnd) || activeStripeSubscription)) {
          setTier('pro');
          setDailyLimit(data.daily_limit_override ? Math.max(50, data.daily_limit_override) : 50);
        } else if (rawTier === 'trial') {
          if (trialEnd && now < trialEnd) {
            setTier('trial');
            setDailyLimit(data.daily_limit_override ? Math.max(5, data.daily_limit_override) : 5);
          } else {
            setTier('expired');
            setDailyLimit(data.daily_limit_override || 0);
          }
        } else if (hasActiveTrialGift) {
          setTier('trial');
          setDailyLimit(data.daily_limit_override ? Math.max(5, data.daily_limit_override) : 5);
        } else {
          setTier('expired');
          setDailyLimit(data.daily_limit_override || 0);
        }

        setTrialEndsAt(data.trial_ends_at);
        setGracePeriodEndsAt(data.grace_period_ends_at);
      }

      // Count today's usage (UTC)
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const { count } = await supabase
        .from('ai_requests')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', todayStart.toISOString());

      setDailyUsed(count || 0);

      if (!data) setHasStripeBilling(false);
    } catch (err) {
      console.warn('[useSubscription] Failed to load:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

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
    loading,
    refresh: load,
  };
}
