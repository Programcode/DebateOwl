import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from '@/pages/SettingsPage';

const mocks = vi.hoisted(() => ({
  user: { id: 'admin-a', email: 'admin@example.com' } as { id: string; email: string } | null,
  role: vi.fn(),
}));
vi.mock('@/lib/supabase/AuthProvider', () => ({ useAuth: () => ({ user: mocks.user, signOut: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({
  SUPABASE_URL: 'https://example.invalid',
  supabase: {
    auth: { getSession: async (): Promise<{ data: { session: null } }> => ({ data: { session: null } }) },
    from: () => ({ select: () => ({ eq: (_: string, id: string) => ({
      abortSignal: () => ({ maybeSingle: () => mocks.role(id) }),
    }) }) }),
  },
}));
vi.mock('@/lib/stores/settings-store', () => ({ useSettingsStore: () => ({
  language: 'en', outputLanguage: 'en', theme: 'dark',
  setLanguage: vi.fn(), setOutputLanguage: vi.fn(), setTheme: vi.fn(),
}) }));
vi.mock('@/lib/stores/session-store', () => ({ useSessionStore: () => ({ clearSession: vi.fn(), clearAllData: vi.fn() }) }));
vi.mock('@/lib/stores/sparring-store', () => ({ useSparringStore: () => vi.fn() }));
vi.mock('@/components/features/subscription/PricingModal', () => ({ PricingModal: (): null => null }));
vi.mock('@/hooks/use-subscription', () => ({ useSubscription: () => ({
  tier: 'trial', loading: false, isPro: false, dailyUsed: 0, dailyLimit: 5,
}) }));
vi.mock('@/lib/stripe', () => ({ redirectToPortal: vi.fn() }));

const clients: QueryClient[] = [];
function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  clients.push(client);
  const ui = () => <QueryClientProvider client={client}><MemoryRouter><SettingsPage /></MemoryRouter></QueryClientProvider>;
  return { ...render(ui()), client, ui };
}
beforeEach(() => { mocks.user = { id: 'admin-a', email: 'admin@example.com' }; mocks.role.mockReset(); });
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.clear()); });

describe('Settings admin navigation', () => {
  it('shows pending state, then role-based navigation and keeps it on return', async () => {
    let resolve!: (value: { data: { role: string }; error: null }) => void;
    mocks.role.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const first = mount();
    expect(screen.getByRole('status', { name: 'Loading...' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open Admin Panel' })).not.toBeInTheDocument();
    await act(async () => { resolve({ data: { role: 'admin' }, error: null }); });
    expect(await screen.findByRole('link', { name: 'Open Admin Panel' })).toHaveAttribute('href', '/app/admin');
    first.unmount();
    mocks.role.mockReturnValue(new Promise(() => {}));
    mount(first.client);
    expect(screen.getByRole('link', { name: 'Open Admin Panel' })).toBeInTheDocument();
  });

  it('does not carry an admin role to another account or signed-out state', async () => {
    mocks.role.mockResolvedValue({ data: { role: 'admin' }, error: null });
    const view = mount();
    await screen.findByRole('link', { name: 'Open Admin Panel' });
    mocks.user = { id: 'member-b', email: 'member@example.com' };
    mocks.role.mockResolvedValue({ data: { role: 'user' }, error: null });
    view.rerender(view.ui());
    expect(screen.queryByRole('link', { name: 'Open Admin Panel' })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Loading...' })).not.toBeInTheDocument());
    mocks.user = null;
    view.rerender(view.ui());
    expect(screen.queryByRole('link', { name: 'Open Admin Panel' })).not.toBeInTheDocument();
  });

  it('hides cached admin navigation on a failed recheck and lets the user retry', async () => {
    mocks.role.mockResolvedValue({ data: { role: 'admin' }, error: null });
    const view = mount();
    await screen.findByRole('link', { name: 'Open Admin Panel' });
    mocks.role.mockResolvedValue({ data: null, error: new Error('offline') });
    await act(async () => { await view.client.invalidateQueries({ queryKey: ['admin-role'] }); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not check admin access.');
    expect(screen.queryByRole('link', { name: 'Open Admin Panel' })).not.toBeInTheDocument();
    mocks.role.mockResolvedValue({ data: { role: 'user' }, error: null });
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Open Admin Panel' })).not.toBeInTheDocument();
  });

  it('ignores a late admin response after an account change', async () => {
    let resolve!: (value: { data: { role: string }; error: null }) => void;
    mocks.role.mockReturnValueOnce(new Promise(done => { resolve = done; }));
    const view = mount();
    mocks.user = { id: 'member-b', email: 'member@example.com' };
    mocks.role.mockResolvedValue({ data: null, error: null });
    view.rerender(view.ui());
    await act(async () => { resolve({ data: { role: 'admin' }, error: null }); });
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Loading...' })).not.toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Open Admin Panel' })).not.toBeInTheDocument();
  });
});
