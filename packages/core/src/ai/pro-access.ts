export interface BillingPeriod {
  status?: string | null;
  current_period_end?: string | null;
}

/**
 * Whether the student may use Pro models, from their user_settings row: a Pro
 * or legacy tier in its grace period, or a Pro tier with an active or trialing
 * subscription that has not ended. The website's settings store and the app
 * both pick the starting model with it. loadSubscriptions runs only for a Pro
 * tier outside its grace period; when it returns null, so does this.
 */
export async function canAccessProModels(
  settings: { subscription_tier?: unknown; grace_period_ends_at?: unknown },
  loadSubscriptions: () => Promise<readonly BillingPeriod[] | null>,
  now: Date = new Date(),
): Promise<boolean | null> {
  const tier = settings.subscription_tier;
  const graceEnd = typeof settings.grace_period_ends_at === 'string'
    ? new Date(settings.grace_period_ends_at)
    : null;
  if ((tier === 'pro' || tier === 'legacy_free') && graceEnd && graceEnd > now) return true;
  if (tier !== 'pro') return false;

  const subscriptions = await loadSubscriptions();
  if (!subscriptions) return null;
  return subscriptions.some((subscription) =>
    (subscription.status === 'active' || subscription.status === 'trialing')
    && !!subscription.current_period_end
    && new Date(subscription.current_period_end) > now
  );
}
