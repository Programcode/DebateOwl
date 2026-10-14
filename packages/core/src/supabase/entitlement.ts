/**
 * The student's plan, read from effective_entitlement() (migration
 * 20261014123154_app_store_entitlements.sql). It merges Stripe, App Store,
 * promo, trial and legacy access into the highest active tier, so the
 * website, the app and the Edge Functions agree on one answer.
 */
export type SubscriptionTier = 'trial' | 'basic' | 'pro' | 'legacy_free' | 'expired';

export interface Entitlement {
  tier: SubscriptionTier;
  dailyLimit: number;
  canAccessProModels: boolean;
  /** stripe, app_store, promo, legacy or trial; null when nothing is active. */
  source: string | null;
  expiresAt: string | null;
  trialEndsAt: string | null;
  gracePeriodEndsAt: string | null;
  hasStripeBilling: boolean;
  /** A live App Store subscription, which only Apple's settings can cancel. */
  hasAppStoreSubscription: boolean;
}

interface RpcClient {
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

const TIERS: readonly string[] = ['trial', 'basic', 'pro', 'legacy_free', 'expired'];
const textOrNull = (value: unknown) => (typeof value === 'string' ? value : null);

/** The plan, or null when it can't be read right now. */
export async function readEntitlement(client: RpcClient, userId: string): Promise<Entitlement | null> {
  const { data, error } = await client.rpc('effective_entitlement', { p_user_id: userId });
  if (error) return null;
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
  if (!row || typeof row.tier !== 'string' || !TIERS.includes(row.tier) || typeof row.daily_limit !== 'number') return null;
  return {
    tier: row.tier as SubscriptionTier,
    dailyLimit: row.daily_limit,
    canAccessProModels: row.can_access_pro_models === true,
    source: textOrNull(row.source),
    expiresAt: textOrNull(row.expires_at),
    trialEndsAt: textOrNull(row.trial_ends_at),
    gracePeriodEndsAt: textOrNull(row.grace_period_ends_at),
    hasStripeBilling: row.has_stripe_billing === true,
    hasAppStoreSubscription: row.has_app_store_subscription === true,
  };
}
