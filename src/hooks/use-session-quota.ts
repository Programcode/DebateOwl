import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { checkSessionQuota, isAISubscriptionError, sessionQuotaError, sessionQuotaRemaining, type AIError } from '@/lib/ai/client';
import type { ProviderConfig } from '@/lib/ai/providers/types';
import { useAuth } from '@/lib/supabase/AuthProvider';

export interface SessionQuotaState {
  /** Quota units a whole round costs on this model, or null while unknown. */
  units: number | null;
  /** AI requests left today, or null while unknown. */
  remaining: number | null;
  /** Why a new round would be refused (daily limit, weekly allowance, trial ended), translated; null when it fits or is unknown. */
  blocked: string | null;
  /** Reads the quota again; the error a new round would meet, or null when it fits or is unknown. */
  checkBeforeStart: () => Promise<AIError | null>;
}

/**
 * What a new Crossfire or Sparring round costs on this model and whether
 * today's quota covers it, from the server. Never blocks on an unknown answer:
 * the round's own requests are still checked.
 */
export function useSessionQuota(feature: 'crossfire' | 'sparring', config: ProviderConfig, enabled = true): SessionQuotaState {
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['session-quota', user?.id, feature, config.model],
    queryFn: () => checkSessionQuota(feature, config),
    enabled: enabled && Boolean(user?.id),
    staleTime: 15_000,
  });
  const { refetch } = query;
  const checkBeforeStart = useCallback(async () => sessionQuotaError((await refetch()).data ?? null), [refetch]);
  const quota = query.data ?? null;
  const refusal = sessionQuotaError(quota);
  return {
    units: quota?.units ?? null,
    remaining: sessionQuotaRemaining(quota),
    blocked: isAISubscriptionError(refusal) ? refusal.message : null,
    checkBeforeStart,
  };
}
