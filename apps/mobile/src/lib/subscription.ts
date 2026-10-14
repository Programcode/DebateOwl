import { readEntitlement, type SubscriptionTier } from '@debatelab/core/supabase/entitlement';

import { supabase } from './supabase';

/**
 * The plan and today's AI usage, read the way the website's useSubscription
 * (src/hooks/use-subscription.ts) reads them: the plan from
 * effective_entitlement, which also counts App Store subscriptions.
 */
export type { SubscriptionTier };

export interface Subscription {
  tier: SubscriptionTier;
  dailyLimit: number;
  dailyUsed: number;
  trialEndsAt: string | null;
}

export async function fetchSubscription(userId: string): Promise<Subscription> {
  const entitlement = await readEntitlement(supabase, userId);
  if (!entitlement) throw new Error('Could not load the plan');

  // Usage resets at midnight UTC.
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const { count, error: usageError } = await supabase
    .from('ai_requests')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', todayStart.toISOString());
  if (usageError) console.warn('Could not load daily usage:', usageError.message);

  return {
    tier: entitlement.tier,
    dailyLimit: entitlement.dailyLimit,
    dailyUsed: usageError ? 0 : count || 0,
    trialEndsAt: entitlement.trialEndsAt,
  };
}
