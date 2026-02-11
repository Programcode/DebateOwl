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

        // Determine effective tier
        if (rawTier === 'legacy_free') {
          const graceEnd = data.grace_period_ends_at ? new Date(data.grace_period_ends_at) : null;
          if (graceEnd && now < graceEnd) {
            setTier('legacy_free');
            setDailyLimit(data.daily_limit_override ? Math.max(50, data.daily_limit_override) : 50);
          } else {
            setTier('expired');
            setDailyLimit(data.daily_limit_override || 0);
          }
        } else if (rawTier === 'pro') {
          setTier('pro');
          setDailyLimit(data.daily_limit_override ? Math.max(50, data.daily_limit_override) : 50);
        } else if (rawTier === 'trial') {
          const trialEnd = data.trial_ends_at ? new Date(data.trial_ends_at) : null;
          if (trialEnd && now < trialEnd) {
            setTier('trial');
            setDailyLimit(data.daily_limit_override ? Math.max(5, data.daily_limit_override) : 5);
          } else {
            setTier('expired');
            setDailyLimit(data.daily_limit_override || 0);
          }
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

      const { data: billingRow, error: billingError } = await supabase
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', user.id)
        .not('stripe_customer_id', 'is', null)
        .limit(1)
        .maybeSingle();

      if (billingError) {
        console.warn('[useSubscription] Failed to load Stripe billing state:', billingError.message);
        setHasStripeBilling(false);
      } else {
        setHasStripeBilling(Boolean(billingRow?.stripe_customer_id));
      }
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
