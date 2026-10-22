import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ProviderConfig } from '@/lib/ai/providers/types';

// Start checks today's quota first. The answer can arrive after the student
// has switched accounts; it must never open the first account's round for the second.

const mocks = vi.hoisted(() => ({
  user: { id: 'user-a' } as { id: string } | null,
  releaseCheck: null as ((refusal: null) => void) | null,
}));

vi.mock('@/lib/supabase/AuthProvider', () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock('@/lib/supabase/client', () => ({
  supabase: { auth: { getUser: vi.fn(async () => ({ data: { user: null } })) } },
}));

vi.mock('@/lib/ai/client', () => ({
  generateSparringTurn: vi.fn(() => new Promise(() => undefined)),
  judgeSparringSession: vi.fn(),
  isAISubscriptionError: () => false,
  isAIModelRestrictionError: () => false,
}));

vi.mock('@/hooks/use-session-quota', () => ({
  useSessionQuota: () => ({
    units: 1,
    remaining: 4,
    blocked: null as string | null,
    // Held until the test releases it, like a slow quota check.
    checkBeforeStart: () => new Promise<null>((resolve) => { mocks.releaseCheck = resolve; }),
  }),
}));

const CONFIG: ProviderConfig = { provider: 'mock', model: 'local' };
const SETTINGS = { outputLanguage: 'en' as const, featureConfigs: {} as Record<string, ProviderConfig | undefined>, getFeatureConfig: (): ProviderConfig => CONFIG };

vi.mock('@/lib/stores/settings-store', () => ({
  useSettingsStore: (selector: (state: typeof SETTINGS) => unknown) => selector(SETTINGS),
}));

vi.mock('@/components/ModelSelector', () => ({
  ModelSelector: () => <div aria-label="Selected model">Local test model</div>,
}));

import SparringPage from '@/pages/SparringPage';
import { useSparringStore } from '@/lib/stores/sparring-store';
import { enableOneOffMode } from '@/test/helpers/debate';

function page() {
  return <MemoryRouter initialEntries={['/app/sparring']}><SparringPage /></MemoryRouter>;
}

async function pressStart() {
  const view = render(page());
  fireEvent.change(screen.getByLabelText('Motion'), { target: { value: 'This House would make public transport free.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Start round' }));
  await waitFor(() => expect(mocks.releaseCheck).not.toBeNull());
  return view;
}

describe('Sparring Start after the quota check', () => {
  beforeEach(() => {
    enableOneOffMode();
    vi.stubGlobal('scrollTo', vi.fn());
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    sessionStorage.clear();
    useSparringStore.setState({ currentSession: null });
    mocks.user = { id: 'user-a' };
    mocks.releaseCheck = null;
  });

  it('opens the round when the same account is still signed in', async () => {
    await pressStart();
    await act(async () => mocks.releaseCheck?.(null));
    expect(await screen.findByText('Round in progress')).toBeInTheDocument();
  });

  it('does not open the first account\'s round after a switch to another account', async () => {
    const view = await pressStart();
    // Account B signs in while A's quota check is still out; neither has a round.
    mocks.user = { id: 'user-b' };
    view.rerender(page());
    await act(async () => mocks.releaseCheck?.(null));

    expect(useSparringStore.getState().currentSession).toBeNull();
    expect(screen.queryByText('Round in progress')).not.toBeInTheDocument();
    // B can still start a round of their own.
    expect(screen.getByRole('button', { name: 'Start round' })).toBeEnabled();
  });
});
