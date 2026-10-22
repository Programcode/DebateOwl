import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PricingModal } from '@/components/features/subscription/PricingModal';
import { restoreFromBackForwardCache } from '@/test/helpers/page-lifecycle';

const stripe = vi.hoisted(() => ({
  redirectToCheckout: vi.fn(async (_promoCode?: string) => undefined),
  redeemPromoCode: vi.fn(),
}));

vi.mock('@/lib/stripe', () => stripe);
vi.mock('@/hooks/use-subscription', () => ({ useSubscription: () => ({ tier: 'trial' }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

function renderModal(open = true) {
  const props = { onOpenChange: vi.fn() };
  const view = render(<PricingModal open={open} {...props} />);
  return { ...view, reopen: (next: boolean) => view.rerender(<PricingModal open={next} {...props} />) };
}

async function startCheckout() {
  fireEvent.click(screen.getByRole('button', { name: 'Upgrade Now' }));
  const redirecting = await screen.findByRole('button', { name: 'Redirecting...' });
  expect(redirecting).toBeDisabled();
}

// AUTH-16: Back from Stripe Checkout left Upgrade Now disabled, and closing
// and reopening the dialog did not clear it.
describe('PricingModal Upgrade Now', () => {
  beforeEach(() => stripe.redirectToCheckout.mockClear());

  it('works again after Back from Checkout restores the page', async () => {
    renderModal();
    await startCheckout();
    fireEvent.click(screen.getByRole('button', { name: 'Redirecting...' }));
    expect(stripe.redirectToCheckout).toHaveBeenCalledTimes(1);

    restoreFromBackForwardCache();
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade Now' }));
    await waitFor(() => expect(stripe.redirectToCheckout).toHaveBeenCalledTimes(2));
  });

  it('shows a fresh button after the dialog is closed and reopened', async () => {
    const { reopen } = renderModal();
    await startCheckout();

    reopen(false);
    reopen(true);
    expect(await screen.findByRole('button', { name: 'Upgrade Now' })).toBeEnabled();
  });

  it('sends one checkout request when reopened while the first is still loading', async () => {
    let finish!: () => void;
    stripe.redirectToCheckout.mockImplementationOnce(() => new Promise<undefined>((resolve) => { finish = () => resolve(undefined); }));
    const { reopen } = renderModal();
    await startCheckout();

    reopen(false);
    reopen(true);
    fireEvent.click(await screen.findByRole('button', { name: 'Redirecting...' }));
    expect(stripe.redirectToCheckout).toHaveBeenCalledTimes(1);
    finish();
  });
});
