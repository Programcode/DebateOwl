import { useState, useEffect, useCallback, useRef } from 'react';
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
  const userId = user?.id;
  const [tier, setTier] = useState<SubscriptionTier>('trial');
  const [dailyLimit, setDailyLimit] = useState(5);
  const [dailyUsed, setDailyUsed] = useState(0);
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [gracePeriodEndsAt, setGracePeriodEndsAt] = useState<string | null>(null);
  const [hasStripeBilling, setHasStripeBilling] = useState(false);
  const [loading, setLoading] = useState(true);
  const latestUserIdRef = useRef<string | undefined>(userId);
  latestUserIdRef.current = userId;

  const load = useCallback(async () => {
    if (!userId) {
      setTier('trial');
      setDailyLimit(5);
      setDailyUsed(0);
      setTrialEndsAt(null);
      setGracePeriodEndsAt(null);
      setHasStripeBilling(false);
      setLoading(false);
      return;
    }

    try {
      // Fetch user settings for subscription info. `maybeSingle()` (not `single()`)
      // because a missing row is an expected state (e.g. new-account race with the
      // settings-creation trigger), not a query failure.
      const { data, error: settingsError } = await supabase
        .from('user_settings')
        .select('subscription_tier, daily_limit_override, trial_ends_at, grace_period_ends_at')
        .eq('user_id', userId)
        .maybeSingle();

      if (latestUserIdRef.current !== userId) return;

      if (settingsError) {
        // No explicit fallback here: leave the caller's fail-closed 'expired' default
        // in place rather than granting trial access on an unreadable settings row.
        console.warn('[useSubscription] Failed to load user settings:', settingsError.message);
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

        if (latestUserIdRef.current !== userId) return;

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
            setDailyLimit(limitOrDefault(50));
          } else if (hasActiveTrialGift) {
            setTier('trial');
            setDailyLimit(limitOrDefault(5));
          } else {
            setTier('expired');
            setDailyLimit(limitOrDefault(0));
          }
        } else if (rawTier === 'pro' && ((promoEnd && now < promoEnd) || activeStripeSubscription)) {
          setTier('pro');
          setDailyLimit(limitOrDefault(50));
        } else if (rawTier === 'trial') {
          if (trialEnd && now < trialEnd) {
            setTier('trial');
            setDailyLimit(limitOrDefault(5));
          } else {
            setTier('expired');
            setDailyLimit(limitOrDefault(0));
          }
        } else if (hasActiveTrialGift) {
          setTier('trial');
          setDailyLimit(limitOrDefault(5));
        } else {
          setTier('expired');
          setDailyLimit(limitOrDefault(0));
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
        .eq('user_id', userId)
        .gte('created_at', todayStart.toISOString());

      if (latestUserIdRef.current !== userId) return;
      setDailyUsed(count || 0);

      if (!data) setHasStripeBilling(false);
    } catch (err) {
      console.warn('[useSubscription] Failed to load:', err);
    } finally {
      if (latestUserIdRef.current === userId) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId) {
      setTier('expired');
      setDailyLimit(0);
      setDailyUsed(0);
      setTrialEndsAt(null);
      setGracePeriodEndsAt(null);
      setHasStripeBilling(false);
      setLoading(true);
    }
    void load();
  }, [load, userId]);

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
