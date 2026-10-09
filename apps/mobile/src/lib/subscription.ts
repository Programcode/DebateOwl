import { supabase } from './supabase';

/**
 * The plan and today's AI usage, computed exactly as the website's
 * useSubscription (src/hooks/use-subscription.ts) does. That hook is not
 * shared yet because it changes with in-app purchase.
 */
export type SubscriptionTier = 'trial' | 'pro' | 'legacy_free' | 'expired';

export interface Subscription {
  tier: SubscriptionTier;
  dailyLimit: number;
  dailyUsed: number;
  trialEndsAt: string | null;
}

interface BillingRow {
  status?: string | null;
  current_period_end?: string | null;
}

export async function fetchSubscription(userId: string): Promise<Subscription> {
  const snapshot: Subscription = { tier: 'expired', dailyLimit: 0, dailyUsed: 0, trialEndsAt: null };

  const { data, error: settingsError } = await supabase
    .from('user_settings')
    .select('subscription_tier, daily_limit_override, trial_ends_at, grace_period_ends_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (settingsError) throw new Error(settingsError.message);

  if (data) {
    const rawTier = (data.subscription_tier || 'trial') as SubscriptionTier;
    const limitOrDefault = (defaultLimit: number) => (data.daily_limit_override as number | null) ?? defaultLimit;
    const now = new Date();

    const { data: billingData, error: billingError } = await supabase
      .from('subscriptions')
      .select('status, current_period_end')
      .eq('user_id', userId)
      .order('current_period_end', { ascending: false, nullsFirst: false })
      .limit(5);
    if (billingError) console.warn('Could not load billing state:', billingError.message);
    const billingRows: BillingRow[] = billingError ? [] : billingData ?? [];

    const activeStripeSubscription = billingRows.some((row) =>
      (row.status === 'active' || row.status === 'trialing') &&
      row.current_period_end &&
      new Date(row.current_period_end) > now,
    );
    const promoEnd = data.grace_period_ends_at ? new Date(data.grace_period_ends_at as string) : null;
    const trialEnd = data.trial_ends_at ? new Date(data.trial_ends_at as string) : null;
    const hasActiveTrialGift = Boolean(trialEnd && now < trialEnd);
    snapshot.trialEndsAt = (data.trial_ends_at as string | null) ?? null;

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

  // Usage resets at midnight UTC.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count, error: usageError } = await supabase
    .from('ai_requests')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', todayStart.toISOString());
  if (usageError) console.warn('Could not load daily usage:', usageError.message);

  return { ...snapshot, dailyUsed: usageError ? 0 : count || 0 };
}
