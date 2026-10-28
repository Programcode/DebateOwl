import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

import { AIError, payloadOf, postFunction } from './ai-request';
import { useAuth } from './auth';
import { fetchFeatureConfig } from './feature-config';

/**
 * What a new Crossfire or Sparring round costs and whether today's uses
 * cover it, asked the way the website's checkSessionQuota asks: the ai
 * function with `quotaCheck`, which reserves nothing. Crossfire runs on
 * Ask's model settings, Sparring on its own.
 */

export interface SessionQuota {
  allowed: boolean;
  /** Why the server would refuse: a limit or access code, or upgrade_required. */
  code?: string;
  limit?: number;
  current?: number;
  /** Uses the whole round costs: one, weighted by the model. */
  units: number;
}

type RoundFeature = 'crossfire' | 'sparring';

/** How long Start waits for the check before going ahead without it, as on the website. */
const QUOTA_CHECK_TIMEOUT_MS = 8_000;

const numberOrUndefined = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);

/** Null when the server cannot tell (offline, or a server from before round charging); the round's own requests are still checked. */
export async function checkSessionQuota(userId: string, feature: RoundFeature): Promise<SessionQuota | null> {
  try {
    const config = await fetchFeatureConfig(userId, feature === 'crossfire' ? 'ask' : 'sparring');
    return await postFunction('ai', { feature, model: config.model, quotaCheck: true }, undefined, async (response) => {
      const data = await payloadOf(response);
      const quota = data?.quota && typeof data.quota === 'object' ? (data.quota as Record<string, unknown>) : null;
      if (!quota || typeof quota.allowed !== 'boolean') return null;
      return {
        allowed: quota.allowed,
        code: typeof quota.code === 'string' ? quota.code : undefined,
        limit: numberOrUndefined(quota.limit),
        current: numberOrUndefined(quota.current),
        units: numberOrUndefined(quota.units) ?? 1,
      };
    }, QUOTA_CHECK_TIMEOUT_MS);
  } catch {
    return null;
  }
}

/** Uses left today by this check, or null when unknown. */
export function sessionQuotaRemaining(quota: SessionQuota | null): number | null {
  if (!quota || quota.limit === undefined || quota.current === undefined) return null;
  return Math.max(0, quota.limit - quota.current);
}

/** The refusal a round would meet, as the error the limit sheet reads; null when it fits or is unknown. */
export function sessionQuotaRefusal(quota: SessionQuota | null): AIError | null {
  if (!quota || quota.allowed) return null;
  if (quota.code === 'upgrade_required') return new AIError('modelRestricted', 'This model requires a Pro subscription.');
  const trial = quota.code === 'trial_ended' || quota.code === 'trial_expired';
  return new AIError(trial ? 'trialExpired' : 'limitReached', 'Not enough AI uses today', { code: quota.code, limit: quota.limit, current: quota.current, units: quota.units });
}

/** The round's cost while its setup is on screen, read again whenever the screen comes back into view. */
export function useSessionQuota(feature: RoundFeature) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [quota, setQuota] = useState<SessionQuota | null>(null);
  const reads = useRef(0);

  const check = useCallback(async (): Promise<SessionQuota | null> => {
    const read = ++reads.current;
    if (!userId) return null;
    const next = await checkSessionQuota(userId, feature);
    if (read === reads.current) setQuota(next);
    return next;
  }, [feature, userId]);

  useFocusEffect(
    useCallback(() => {
      void check();
    }, [check]),
  );

  return { quota, check };
}
