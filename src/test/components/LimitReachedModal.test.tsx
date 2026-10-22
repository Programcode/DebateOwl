import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LimitReachedModal } from '@/components/features/subscription/LimitReachedModal';

const subscription = vi.hoisted(() => ({ isPro: false }));

vi.mock('@/hooks/use-subscription', () => ({
  useSubscription: () => ({ isPro: subscription.isPro, loading: false, tier: subscription.isPro ? 'pro' : 'trial' }),
}));

function renderModal(variant: 'limit_reached' | 'trial_expired' = 'limit_reached') {
  const onUpgrade = vi.fn();
  const onOpenChange = vi.fn();
  render(
    <LimitReachedModal
      open
      variant={variant}
      limit={50}
      current={50}
      onUpgrade={onUpgrade}
      onOpenChange={onOpenChange}
    />,
  );
  return { onUpgrade, onOpenChange };
}

describe('LimitReachedModal', () => {
  beforeEach(() => {
    subscription.isPro = false;
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

  it('still offers Pro when the trial has ended', () => {
    subscription.isPro = false;
    renderModal('trial_expired');
    expect(screen.getByRole('button', { name: 'Upgrade to Pro - $5/mo' })).toBeInTheDocument();
  });
});
