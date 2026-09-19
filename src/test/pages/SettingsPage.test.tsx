import { cleanup, render, screen } from '@testing-library/react';
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
}));

vi.mock('@/lib/supabase/AuthProvider', () => ({
  useAuth: () => ({ user: null as { id: string; email: string } | null, signOut: vi.fn() }),
}));
vi.mock('@/lib/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/lib/stores/settings-store', () => ({ useSettingsStore: () => ({
  language: 'en', outputLanguage: 'en', theme: 'dark',
  setLanguage: vi.fn(), setOutputLanguage: vi.fn(), setTheme: vi.fn(),
}) }));
vi.mock('@/lib/stores/session-store', () => ({ useSessionStore: () => ({ clearSession: vi.fn(), clearAllData: vi.fn() }) }));
vi.mock('@/lib/stores/sparring-store', () => ({ useSparringStore: () => vi.fn() }));
vi.mock('@/components/features/subscription/PricingModal', () => ({ PricingModal: (): null => null }));
vi.mock('@/hooks/use-subscription', () => ({ useSubscription: () => mocks.subscription }));
vi.mock('@/lib/stripe', () => ({ redirectToPortal: vi.fn() }));

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
  });
});
