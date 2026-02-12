import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSubscriptionError } from '@/hooks/use-subscription-error';
import { AIModelRestrictionError, AISubscriptionError } from '@/lib/ai/client';

describe('useSubscriptionError', () => {
  it('handles trial-expired subscription errors', () => {
    const { result } = renderHook(() => useSubscriptionError());
    let handled = false;

    act(() => {
      handled = result.current.handleSubscriptionError(
        new AISubscriptionError('Trial expired', {
          code: 'trial_expired',
          limit: 5,
          current: 5,
        })
      );
    });

    expect(handled).toBe(true);
    expect(result.current.limitModalOpen).toBe(true);
    expect(result.current.limitModalVariant).toBe('trial_expired');
    expect(result.current.limitModalLimit).toBe(5);
    expect(result.current.limitModalCurrent).toBe(5);
  });

  it('defaults to limit_reached variant for generic subscription errors', () => {
    const { result } = renderHook(() => useSubscriptionError());
    let handled = false;

    act(() => {
      handled = result.current.handleSubscriptionError(
        new AISubscriptionError('Limit reached', {
          code: 'limit_reached',
        })
      );
    });

    expect(handled).toBe(true);
    expect(result.current.limitModalOpen).toBe(true);
    expect(result.current.limitModalVariant).toBe('limit_reached');
  });

  it('handles model-restriction errors', () => {
    const { result } = renderHook(() => useSubscriptionError());
    let handled = false;

    act(() => {
      handled = result.current.handleSubscriptionError(
        new AIModelRestrictionError('Upgrade required')
      );
    });

    expect(handled).toBe(true);
    expect(result.current.modelModalOpen).toBe(true);
  });

  it('returns false for non-subscription errors', () => {
    const { result } = renderHook(() => useSubscriptionError());
    let handled = false;

    act(() => {
      handled = result.current.handleSubscriptionError(new Error('Other failure'));
    });

    expect(handled).toBe(false);
    expect(result.current.limitModalOpen).toBe(false);
    expect(result.current.modelModalOpen).toBe(false);
  });

  it('exposes modal state setters', () => {
    const { result } = renderHook(() => useSubscriptionError());

    act(() => {
      result.current.setLimitModalOpen(true);
      result.current.setModelModalOpen(true);
      result.current.setPricingModalOpen(true);
    });

    expect(result.current.limitModalOpen).toBe(true);
    expect(result.current.modelModalOpen).toBe(true);
    expect(result.current.pricingModalOpen).toBe(true);
  });
});
