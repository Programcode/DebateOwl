import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '@/i18n';
import SettingsPage from '@/pages/SettingsPage';

const mocks = vi.hoisted(() => ({
  subscription: {
    tier: 'trial',
    loading: false,
    isPro: false,
    dailyUsed: 4,
    dailyLimit: 5,
    trialEndsAt: '2026-10-01T00:00:00.000Z',
    hasStripeBilling: false,
    refresh: vi.fn(),
  },
  redirectToPortal: vi.fn(),
  user: null as { id: string; email: string } | null,
  signOut: vi.fn(),
  deleteAccount: vi.fn(),
  downloadAccountData: vi.fn(),
}));

vi.mock('@/lib/supabase/AuthProvider', () => ({
  useAuth: () => ({ user: mocks.user, signOut: mocks.signOut }),
}));
vi.mock('@/lib/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/lib/stores/settings-store', () => ({ useSettingsStore: () => ({
  language: 'en', outputLanguage: 'en', theme: 'dark',
  setLanguage: vi.fn(), setOutputLanguage: vi.fn(), setTheme: vi.fn(),
}) }));
vi.mock('@/lib/stores/session-store', () => ({ useSessionStore: () => ({ clearSession: vi.fn(), clearAllData: vi.fn() }) }));
vi.mock('@/lib/stores/sparring-store', () => ({ useSparringStore: () => vi.fn() }));
vi.mock('@/components/features/subscription/PricingModal', () => ({
  PricingModal: ({ open }: { open: boolean }) => open ? <div>Pricing open</div> : null,
}));
vi.mock('@/hooks/use-subscription', () => ({ useSubscription: () => mocks.subscription }));
vi.mock('@/lib/stripe', () => ({ redirectToPortal: mocks.redirectToPortal }));
vi.mock('@/lib/account', () => ({ deleteAccount: mocks.deleteAccount, downloadAccountData: mocks.downloadAccountData }));

function renderSettings() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter><SettingsPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  await i18n.changeLanguage('en');
  Object.assign(mocks.subscription, { tier: 'trial', loading: false, hasStripeBilling: false });
  mocks.redirectToPortal.mockReset().mockResolvedValue(undefined);
  mocks.user = null;
  mocks.signOut.mockReset().mockResolvedValue(undefined);
  mocks.deleteAccount.mockReset().mockResolvedValue(undefined);
  mocks.downloadAccountData.mockReset().mockResolvedValue(undefined);
});

afterEach(() => cleanup());

describe('Settings subscription card', () => {
  it.each([
    ['trial', false, 'Free Trial', 'AI access is active. Usage limits may apply.', 'Upgrade to Pro'],
    ['pro', true, 'Pro', 'AI access is active. Usage limits may apply.', 'Manage Subscription'],
    ['expired', false, 'Expired', 'Your access has expired. Upgrade to continue using AI tools.', 'Upgrade to Pro'],
  ])('shows non-numeric access status for %s users', (tier, hasStripeBilling, badge, status, action) => {
    Object.assign(mocks.subscription, { tier, hasStripeBilling });

    renderSettings();

    expect(screen.getByText(badge)).toBeInTheDocument();
    expect(screen.getByText(status)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: action })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText('4 / 5 uses')).not.toBeInTheDocument();
    expect(screen.queryByText(/Resets in/)).not.toBeInTheDocument();
    if (tier === 'trial') expect(screen.getByText('Ends 01/10/2026')).toBeInTheDocument();
  });

  it('does not claim access is active while the subscription is loading', () => {
    Object.assign(mocks.subscription, { loading: true });

    renderSettings();

    expect(screen.getByText('Loading...')).toBeInTheDocument();
    expect(screen.queryByText('AI access is active. Usage limits may apply.')).not.toBeInTheDocument();
    expect(screen.queryByText('Free Trial')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upgrade to Pro' })).not.toBeInTheDocument();
  });

  it('opens the upgrade flow', () => {
    Object.assign(mocks.subscription, { tier: 'expired' });
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'Upgrade to Pro' }));

    expect(screen.getByText('Pricing open')).toBeInTheDocument();
  });

  it('opens billing management for Stripe-backed Pro users', async () => {
    Object.assign(mocks.subscription, { tier: 'pro', hasStripeBilling: true });
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'Manage Subscription' }));

    await waitFor(() => expect(mocks.redirectToPortal).toHaveBeenCalledOnce());
  });
});

describe('Settings account controls', () => {
  const student = { id: '11111111-1111-4111-8111-111111111111', email: 'student@example.test' };

  function openDeleteAccount() {
    mocks.user = student;
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Delete account' }));
    const confirm = screen.getAllByRole('button', { name: 'Delete account' }).at(-1)!;
    return { confirm, input: screen.getByLabelText('Type your email to confirm') };
  }

  it('downloads the account data', async () => {
    mocks.user = student;
    renderSettings();

    fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));

    await waitFor(() => expect(mocks.downloadAccountData).toHaveBeenCalledTimes(1));
  });

  it('deletes the account only after the email is typed exactly', async () => {
    const { confirm, input } = openDeleteAccount();
    expect(confirm).toBeDisabled();

    fireEvent.change(input, { target: { value: 'STUDENT@example.test' } });
    expect(confirm).toBeDisabled();

    fireEvent.change(input, { target: { value: student.email } });
    fireEvent.click(confirm);

    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledTimes(1));
    expect(mocks.deleteAccount).toHaveBeenCalledWith(student.email);
  });

  it('keeps the user signed in when deletion fails', async () => {
    mocks.deleteAccount.mockRejectedValue(new Error('Could not cancel your subscription'));
    const { confirm, input } = openDeleteAccount();

    fireEvent.change(input, { target: { value: student.email } });
    fireEvent.click(confirm);

    await waitFor(() => expect(confirm).toBeEnabled());
    expect(mocks.deleteAccount).toHaveBeenCalledTimes(1);
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Delete your account?' })).toBeInTheDocument();
  });
});
