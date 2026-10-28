import { useState, useCallback } from 'react';
import { isAISubscriptionError, isAIModelRestrictionError, type AISubscriptionError } from '@/lib/ai/client';
import type { LimitModalVariant } from '@/components/features/subscription/LimitReachedModal';

interface SubscriptionErrorState {
  limitModalOpen: boolean;
  limitModalVariant: LimitModalVariant;
  limitModalLimit?: number;
  limitModalCurrent?: number;
  limitModalUnits?: number;
  modelModalOpen: boolean;
  pricingModalOpen: boolean;
  setLimitModalOpen: (open: boolean) => void;
  setModelModalOpen: (open: boolean) => void;
  setPricingModalOpen: (open: boolean) => void;
  handleSubscriptionError: (error: unknown) => boolean;
}

const ACCESS_VARIANTS: ReadonlySet<string> = new Set(['trial_ended', 'payment_failed', 'subscription_ended', 'weekly_budget_reached']);

function variantForCode(code: string | undefined): LimitModalVariant {
  // Functions deployed before the separate access codes send trial_expired.
  if (code === 'trial_expired') return 'trial_ended';
  return code && ACCESS_VARIANTS.has(code) ? code as LimitModalVariant : 'limit_reached';
}

/**
 * Hook that detects subscription/model errors and opens the appropriate modal.
 * Returns true if the error was a subscription error (handled), false otherwise.
 */
export function useSubscriptionError(): SubscriptionErrorState {
  const [limitModalOpen, setLimitModalOpen] = useState(false);
  const [limitModalVariant, setLimitModalVariant] = useState<LimitModalVariant>('limit_reached');
  const [limitModalLimit, setLimitModalLimit] = useState<number>();
  const [limitModalCurrent, setLimitModalCurrent] = useState<number>();
  const [limitModalUnits, setLimitModalUnits] = useState<number>();
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [pricingModalOpen, setPricingModalOpen] = useState(false);

  const handleSubscriptionError = useCallback((error: unknown): boolean => {
    if (isAISubscriptionError(error)) {
      const subError = error as AISubscriptionError;
      setLimitModalVariant(variantForCode(subError.code));
      setLimitModalLimit(subError.limit);
      setLimitModalCurrent(subError.current);
      setLimitModalUnits(subError.units);
      setLimitModalOpen(true);
      return true;
    }

    if (isAIModelRestrictionError(error)) {
      setModelModalOpen(true);
      return true;
    }

    return false;
  }, []);

  return {
    limitModalOpen,
    limitModalVariant,
    limitModalLimit,
    limitModalCurrent,
    limitModalUnits,
    modelModalOpen,
    pricingModalOpen,
    setLimitModalOpen,
    setModelModalOpen,
    setPricingModalOpen,
    handleSubscriptionError,
  };
}
