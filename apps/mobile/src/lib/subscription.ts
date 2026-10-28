import { readBillingState } from '@debatelab/core/supabase/billing';
import { planDailyLimit, type BillingDateKind, type BillingStateName } from '@debatelab/core/contract/billing-state';

import { billingQuery, supabase } from './supabase';

/**
 * The plan and today's AI usage, read the way the website's useSubscription
 * (src/hooks/use-subscription.ts) reads them: the plan from the resolver the
 * AI functions use (billing-state.ts), which also counts App Store
 * subscriptions, and usage from the server's own counter.
 */
export type SubscriptionTier = 'trial' | 'basic' | 'pro' | 'legacy_free' | 'expired';

export interface Subscription {
  tier: SubscriptionTier;
  billingState: BillingStateName;
  billingDate: string | null;
  billingDateKind: BillingDateKind | null;
  dailyLimit: number;
  /** Charged AI units today, or null when the counter cannot be read. */
  dailyUsed: number | null;
  trialEndsAt: string | null;
}

// The server's tier defaults (supabase/functions/_shared/usage-limits.ts).
const DEFAULT_LIMITS = { pro: 50, basic: 20, trial: 5 };

export async function fetchSubscription(userId: string): Promise<Subscription> {
  const read = await readBillingState(billingQuery(userId));
  if (!read) throw new Error('Could not load the plan');
  const { billing, rows } = read;

  let dailyLimit = planDailyLimit(billing, rows.settings?.daily_limit_override, DEFAULT_LIMITS);
  // A per-account rate_limits row replaces the plan's limit on the server too.
  if (billing.hasAccess) {
    const { data: ownLimit } = await supabase
      .from('rate_limits')
      .select('limit_value')
      .eq('user_id', userId)
      .eq('limit_type', 'daily_requests')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (typeof ownLimit?.limit_value === 'number') dailyLimit = ownLimit.limit_value;
  }

  // Model-weighted units, one charge per Crossfire or Sparring round, refunds
  // given back: what the server enforces. Resets at midnight UTC.
  const { data: used, error: usageError } = await supabase.rpc('ai_usage_today');
  if (usageError) console.warn('Could not load daily usage:', usageError.message);

  return {
    tier: billing.tier,
    billingState: billing.state,
    billingDate: billing.date,
    billingDateKind: billing.dateKind,
    dailyLimit,
    dailyUsed: !usageError && typeof used === 'number' ? used : null,
    trialEndsAt: rows.settings?.trial_ends_at ?? null,
  };
}
