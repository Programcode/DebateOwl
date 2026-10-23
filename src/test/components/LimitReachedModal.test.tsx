import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LimitReachedModal, type LimitModalVariant } from '@/components/features/subscription/LimitReachedModal';

const subscription = vi.hoisted(() => ({
  isPro: false,
  billingState: 'trial' as string,
  billingDate: null as string | null,
}));

vi.mock('@/hooks/use-subscription', () => ({
  useSubscription: () => ({
    isPro: subscription.isPro,
    loading: false,
    tier: subscription.isPro ? 'pro' : 'trial',
    billingState: subscription.billingState,
    billingDate: subscription.billingDate,
  }),
}));

function renderModal(variant: LimitModalVariant = 'limit_reached') {
  const onUpgrade = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <MemoryRouter initialEntries={['/app/brainstorm']}>
      <Routes>
        <Route path="/app/brainstorm" element={(
          <LimitReachedModal
            open
            variant={variant}
            limit={50}
            current={50}
            onUpgrade={onUpgrade}
            onOpenChange={onOpenChange}
          />
        )} />
        <Route path="/app/settings" element={<p>Settings page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return { onUpgrade, onOpenChange };
}

describe('LimitReachedModal', () => {
  beforeEach(() => {
    subscription.isPro = false;
    subscription.billingState = 'trial';
    subscription.billingDate = null;
  });

  it('offers Pro when a free plan hits the daily cap', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Upgrade to Pro - $5/mo' })).toBeInTheDocument();
  });

  it('does not sell Pro again when a paying student hits the daily cap', async () => {
    subscription.isPro = true;
    const { onUpgrade, onOpenChange } = renderModal();
    expect(screen.queryByRole('button', { name: 'Upgrade to Pro - $5/mo' })).not.toBeInTheDocument();
    expect(screen.queryByText('More AI prep access + high reasoning')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onUpgrade).not.toHaveBeenCalled();
  });

  it.each(['trial_expired', 'trial_ended'] as const)('still offers Pro when the trial has ended (%s)', (variant) => {
    renderModal(variant);
    expect(screen.getByRole('heading', { name: 'Free Trial Ended' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upgrade to Pro - $5/mo' })).toBeInTheDocument();
  });

  it('sends a failed payment to Settings instead of a second Checkout', () => {
    // QB-13: a past-due subscription is still being retried; Checkout would bill twice.
    subscription.isPro = false;
    subscription.billingState = 'payment_failed';
    const { onUpgrade, onOpenChange } = renderModal('payment_failed');
    expect(screen.getByRole('heading', { name: 'Payment Failed' })).toBeInTheDocument();
    expect(screen.queryByText(/free trial/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Upgrade to Pro/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Update payment method' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onUpgrade).not.toHaveBeenCalled();
    expect(screen.getByText('Settings page')).toBeInTheDocument();
  });

  it('tells a former subscriber when Pro ended and offers to resubscribe', () => {
    // QB-14: not "Your 3-day free trial has ended".
    subscription.billingState = 'subscription_ended';
    subscription.billingDate = '2026-10-01T12:00:00.000Z';
    const { onUpgrade } = renderModal('subscription_ended');
    expect(screen.getByRole('heading', { name: 'Pro Subscription Ended' })).toBeInTheDocument();
    expect(screen.getByText(/Your Pro subscription ended on 01\/10\/2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resubscribe' }));
    expect(onUpgrade).toHaveBeenCalled();
  });
});
