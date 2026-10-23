import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PricingModal } from '@/components/features/subscription/PricingModal';
import { restoreFromBackForwardCache } from '@/test/helpers/page-lifecycle';

const stripe = vi.hoisted(() => ({
  redirectToCheckout: vi.fn(async (_promoCode?: string) => undefined),
  redirectToPortal: vi.fn(async () => undefined),
  redeemPromoCode: vi.fn(),
}));

const TRIAL = { tier: 'trial', billingState: 'trial', billingDate: null as string | null, hasOpenSubscription: false, hasStripeBilling: false, loading: false };
let subscription: Record<string, unknown> = TRIAL;

vi.mock('@/lib/stripe', () => stripe);
vi.mock('@/hooks/use-subscription', () => ({ useSubscription: () => subscription }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

function renderModal(open = true) {
  const props = { onOpenChange: vi.fn() };
  const view = render(<PricingModal open={open} {...props} />);
  return { ...view, reopen: (next: boolean) => view.rerender(<PricingModal open={next} {...props} />) };
}

async function startCheckout() {
  fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Pro' }));
  const redirecting = await screen.findByRole('button', { name: 'Redirecting...' });
  expect(redirecting).toBeDisabled();
}

// AUTH-16: Back from Stripe Checkout left the upgrade button disabled, and closing
// and reopening the dialog did not clear it.
describe('PricingModal upgrade button', () => {
  beforeEach(() => {
    subscription = TRIAL;
    stripe.redirectToCheckout.mockClear();
  });

  it('works again after Back from Checkout restores the page', async () => {
    renderModal();
    await startCheckout();
    fireEvent.click(screen.getByRole('button', { name: 'Redirecting...' }));
    expect(stripe.redirectToCheckout).toHaveBeenCalledTimes(1);

    restoreFromBackForwardCache();
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Pro' }));
    await waitFor(() => expect(stripe.redirectToCheckout).toHaveBeenCalledTimes(2));
  });

  it('shows a fresh button after the dialog is closed and reopened', async () => {
    const { reopen } = renderModal();
    await startCheckout();

    reopen(false);
    reopen(true);
    expect(await screen.findByRole('button', { name: 'Upgrade to Pro' })).toBeEnabled();
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

// QB-16: the dialog follows the account's state. Anyone a Stripe subscription
// can still bill goes to the portal; nobody on Pro is offered Upgrade.
describe('PricingModal per billing state', () => {
  const stateOf = (overrides: Record<string, unknown>) => ({ ...TRIAL, ...overrides });
  const CASES = [
    { name: 'trial', state: stateOf({}), button: 'Upgrade to Pro', current: 'plan-trial', portal: false },
    { name: 'trial ended with extended access', state: stateOf({ tier: 'expired', billingState: 'extended_access' }), button: 'Upgrade to Pro', current: null, portal: false },
    { name: 'active Pro', state: stateOf({ tier: 'pro', billingState: 'pro', hasOpenSubscription: true, hasStripeBilling: true }), button: 'Manage Subscription', current: 'plan-pro', portal: true },
    { name: 'Pro set to cancel', state: stateOf({ tier: 'pro', billingState: 'pro_canceling', billingDate: '2026-11-22T00:00:00Z', hasOpenSubscription: true, hasStripeBilling: true }), button: 'Manage Subscription', current: 'plan-pro', portal: true },
    { name: 'past due in the grace', state: stateOf({ tier: 'pro', billingState: 'payment_failed', hasOpenSubscription: true, hasStripeBilling: true }), button: 'Manage Subscription', current: 'plan-pro', portal: true },
    { name: 'past due after the grace', state: stateOf({ tier: 'expired', billingState: 'payment_failed', hasOpenSubscription: true, hasStripeBilling: true }), button: 'Manage Subscription', current: null, portal: true },
    { name: 'subscription ended', state: stateOf({ tier: 'expired', billingState: 'subscription_ended', hasStripeBilling: true }), button: 'Resubscribe', current: null, portal: false },
    { name: 'legacy free in its grace', state: stateOf({ tier: 'legacy_free', billingState: 'legacy_free' }), button: 'Upgrade to Pro', current: null, portal: false },
    { name: 'promo Pro without Stripe', state: stateOf({ tier: 'pro', billingState: 'pro' }), button: 'Set Up Billing', current: 'plan-pro', portal: false },
  ];

  beforeEach(() => {
    stripe.redirectToCheckout.mockClear();
    stripe.redirectToPortal.mockClear();
  });

  it.each(CASES)('$name: one right next step and the right plan marked current', async ({ state, button, current, portal }) => {
    subscription = state;
    renderModal();
    for (const other of ['Upgrade to Pro', 'Manage Subscription', 'Resubscribe', 'Set Up Billing'].filter((name) => name !== button)) {
      expect(screen.queryByRole('button', { name: other })).not.toBeInTheDocument();
    }
    for (const plan of ['plan-trial', 'plan-pro']) {
      const badge = screen.getByTestId(plan).querySelector('h3 + *');
      expect(badge?.textContent === 'Current').toBe(plan === current);
    }
    fireEvent.click(screen.getByRole('button', { name: button }));
    await waitFor(() => expect(portal ? stripe.redirectToPortal : stripe.redirectToCheckout).toHaveBeenCalledTimes(1));
    expect(portal ? stripe.redirectToCheckout : stripe.redirectToPortal).not.toHaveBeenCalled();
  });
});
