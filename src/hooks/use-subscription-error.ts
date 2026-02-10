import { useState, useCallback } from 'react';
import { isAISubscriptionError, isAIModelRestrictionError, type AISubscriptionError } from '@/lib/ai/client';

interface SubscriptionErrorState {
  limitModalOpen: boolean;
  limitModalVariant: 'limit_reached' | 'trial_expired';
  limitModalLimit?: number;
  limitModalCurrent?: number;
  modelModalOpen: boolean;
  pricingModalOpen: boolean;
  setLimitModalOpen: (open: boolean) => void;
  setModelModalOpen: (open: boolean) => void;
  setPricingModalOpen: (open: boolean) => void;
  handleSubscriptionError: (error: unknown) => boolean;
}

/**
 * Hook that detects subscription/model errors and opens the appropriate modal.
 * Returns true if the error was a subscription error (handled), false otherwise.
 */
export function useSubscriptionError(): SubscriptionErrorState {
  const [limitModalOpen, setLimitModalOpen] = useState(false);
  const [limitModalVariant, setLimitModalVariant] = useState<'limit_reached' | 'trial_expired'>('limit_reached');
  const [limitModalLimit, setLimitModalLimit] = useState<number>();
  const [limitModalCurrent, setLimitModalCurrent] = useState<number>();
  const [modelModalOpen, setModelModalOpen] = useState(false);
  const [pricingModalOpen, setPricingModalOpen] = useState(false);

  const handleSubscriptionError = useCallback((error: unknown): boolean => {
    if (isAISubscriptionError(error)) {
      const subError = error as AISubscriptionError;
      if (subError.code === 'trial_expired') {
        setLimitModalVariant('trial_expired');
      } else {
        setLimitModalVariant('limit_reached');
      }
      setLimitModalLimit(subError.limit);
      setLimitModalCurrent(subError.current);
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
    modelModalOpen,
    pricingModalOpen,
    setLimitModalOpen,
    setModelModalOpen,
    setPricingModalOpen,
    handleSubscriptionError,
  };
}
