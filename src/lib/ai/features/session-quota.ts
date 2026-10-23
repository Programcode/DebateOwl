import type { ProviderConfig } from '../providers/types';
import { getActiveAccessToken, invokeAuthenticatedFunction } from '@/lib/supabase/client';
import { AIModelRestrictionError, AISubscriptionError, type AIError } from '../errors';
import { isSubscriptionRefusalCode, localizedLimitMessage } from '../limit-message';

/** What a new Crossfire or Sparring round costs, and whether today's quota covers it. */
export interface SessionQuota {
  allowed: boolean;
  /** Why the server would refuse: limit_reached, weekly_budget_reached, trial_ended, payment_failed, subscription_ended (trial_expired from older functions), upgrade_required, banned. */
  code?: string;
  limit?: number;
  current?: number;
  /** Quota units the whole round costs: one use, weighted by the model. */
  units: number;
}

/** How long Start waits for the quota check before going ahead without it. */
export const QUOTA_CHECK_TIMEOUT_MS = 8_000;

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Asks the server what a round on this model costs and what is left today,
 * without reserving anything. Null when it cannot tell (signed out, offline,
 * or a server from before session charging); the round's own requests are
 * still checked, so null never blocks a start.
 */
export async function checkSessionQuota(feature: 'crossfire' | 'sparring', config: ProviderConfig): Promise<SessionQuota | null> {
  const accessToken = getActiveAccessToken();
  if (!accessToken) return null;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // A stalled check must not hold Start: past the timeout the answer is unknown.
  const timedOut = new Promise<null>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, QUOTA_CHECK_TIMEOUT_MS);
  });
  try {
    const answer = await Promise.race([
      invokeAuthenticatedFunction<Record<string, unknown>>('ai', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { feature, model: config.model, quotaCheck: true },
        signal: controller.signal,
      }),
      timedOut,
    ]);
    if (!answer) return null;
    const { data, error } = answer;
    const quota = !error && data?.quota && typeof data.quota === 'object' ? data.quota as Record<string, unknown> : null;
    if (!quota || typeof quota.allowed !== 'boolean') return null;
    return {
      allowed: quota.allowed,
      code: typeof quota.code === 'string' ? quota.code : undefined,
      limit: numberOrUndefined(quota.limit),
      current: numberOrUndefined(quota.current),
      units: numberOrUndefined(quota.units) ?? 1,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Requests left today by this check, or null when unknown. */
export function sessionQuotaRemaining(quota: SessionQuota | null | undefined): number | null {
  if (!quota || quota.limit === undefined || quota.current === undefined) return null;
  return Math.max(0, quota.limit - quota.current);
}

/** The error a refused round would have met, for the same limit dialog every tool uses. */
export function sessionQuotaError(quota: SessionQuota | null | undefined): AIError | null {
  if (!quota || quota.allowed) return null;
  if (quota.code === 'upgrade_required') return new AIModelRestrictionError('This model requires a Pro subscription.');
  if (!isSubscriptionRefusalCode(quota.code)) return null;
  const details = { code: quota.code, limit: quota.limit, current: quota.current, units: quota.units };
  return new AISubscriptionError(localizedLimitMessage('', details), { statusCode: 402, ...details });
}
