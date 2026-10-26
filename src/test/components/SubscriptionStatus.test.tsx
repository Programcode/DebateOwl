import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SubscriptionStatus, type SubscriptionStatusProps } from '@/components/features/subscription/SubscriptionStatus';

function renderStatus(props: Partial<SubscriptionStatusProps>) {
  render(
    <SubscriptionStatus
      billingState="trial"
      billingDate={null}
      billingDateKind={null}
      hasOpenSubscription={false}
      hasStripeBilling={false}
      dailyLimit={5}
      portalLoading={false}
      onManage={vi.fn()}
      onUpgrade={vi.fn()}
      {...props}
    />,
  );
}

const DATE = '2026-11-22T12:00:00.000Z';

// Each state's badge, the date beside it, the sentence below, and the one button.
const CASES: Array<{
  name: string;
  props: Partial<SubscriptionStatusProps>;
  badge: string;
  date: string | null;
  text: RegExp;
  button: string;
}> = [
  { name: 'trial', props: { billingState: 'trial', billingDate: DATE, billingDateKind: 'ends' }, badge: 'Free Trial', date: 'Ends on 22 Nov 2026', text: /AI access is active/, button: 'Upgrade to Pro' },
  {
    // QB-02: an override on an expired trial works, so it is not "Expired".
    name: 'extended access',
    props: { billingState: 'extended_access', dailyLimit: 10 },
    badge: 'Extended access',
    date: null,
    text: /Extended access is active: 10 AI uses a day\./,
    button: 'Upgrade to Pro',
  },
  {
    name: 'Pro renewing',
    props: { billingState: 'pro', billingDate: DATE, billingDateKind: 'renews', hasOpenSubscription: true, hasStripeBilling: true, dailyLimit: 50 },
    badge: 'Pro',
    date: 'Renews on 22 Nov 2026',
    text: /AI access is active/,
    button: 'Manage subscription',
  },
  {
    // QB-15: a plan set to cancel says so.
    name: 'Pro set to cancel',
    props: { billingState: 'pro_canceling', billingDate: DATE, billingDateKind: 'cancels', hasOpenSubscription: true, hasStripeBilling: true, dailyLimit: 50 },
    badge: 'Pro',
    date: 'Cancels on 22 Nov 2026',
    text: /AI access is active/,
    button: 'Manage subscription',
  },
  {
    // QB-13: the portal, never a second Checkout.
    name: 'past due in grace',
    props: { billingState: 'payment_failed', billingDate: DATE, billingDateKind: 'grace_ends', hasOpenSubscription: true, hasStripeBilling: true, dailyLimit: 50 },
    badge: 'Payment failed',
    date: null,
    text: /Payment failed: update your payment method to keep Pro\. Pro access continues until 22 Nov 2026/,
    button: 'Manage subscription',
  },
  {
    name: 'past due after grace',
    props: { billingState: 'payment_failed', hasOpenSubscription: true, hasStripeBilling: true, dailyLimit: 0 },
    badge: 'Payment failed',
    date: null,
    text: /update your payment method to restore AI access/,
    button: 'Manage subscription',
  },
  {
    // QB-14: a former subscriber is not told their free trial ended.
    name: 'subscription ended',
    props: { billingState: 'subscription_ended', billingDate: DATE, billingDateKind: 'ended', hasStripeBilling: true, dailyLimit: 0 },
    badge: 'Expired',
    date: null,
    text: /Your Pro subscription ended on 22 Nov 2026\. Resubscribe/,
    button: 'Resubscribe',
  },
  { name: 'trial ended', props: { billingState: 'trial_ended', dailyLimit: 0 }, badge: 'Expired', date: null, text: /Your access has expired/, button: 'Upgrade to Pro' },
  {
    name: 'legacy free',
    props: { billingState: 'legacy_free', billingDate: DATE, billingDateKind: 'ends', dailyLimit: 50 },
    badge: 'Legacy Free',
    date: 'Ends on 22 Nov 2026',
    text: /AI access is active/,
    button: 'Upgrade to Pro',
  },
  {
    name: 'lifetime promo Pro',
    props: { billingState: 'pro', dailyLimit: 50 },
    badge: 'Pro',
    date: null,
    text: /^Your Pro access comes from a promo code, so billing is optional\.$/,
    button: 'Set up billing',
  },
  {
    // QA round 3: a dated promo said nothing about where Pro came from.
    name: 'promo Pro with an end date',
    props: { billingState: 'pro', billingDate: DATE, billingDateKind: 'ends', dailyLimit: 50 },
    badge: 'Pro',
    date: 'Ends on 22 Nov 2026',
    text: /comes from a promo code and runs until 22 Nov 2026\. Billing is optional until then/,
    button: 'Set up billing',
  },
];

describe('SubscriptionStatus', () => {
  it.each(CASES)('$name', ({ props, badge, date, text, button }) => {
    renderStatus(props);
    expect(screen.getByText(badge, { exact: true })).toBeInTheDocument();
    if (date) expect(screen.getByTestId('billing-date')).toHaveTextContent(date);
    else expect(screen.queryByTestId('billing-date')).not.toBeInTheDocument();
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((element) => element.textContent)).toEqual([button]);
  });
});
