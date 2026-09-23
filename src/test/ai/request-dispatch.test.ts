import { createElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

const sessionState = {
  sourceLibrary: [] as unknown[],
  hydrateFromServer: vi.fn(),
  resetLocalData: vi.fn(),
};

const settingsState = {
  customSystemPrompt: '',
  outputLanguage: 'en',
  hydrateFromServer: vi.fn(),
  resetLocalData: vi.fn(),
};

vi.mock('@/lib/stores/settings-store', () => ({
  useSettingsStore: Object.assign(
    (selector: (state: typeof settingsState) => unknown) => selector(settingsState),
    { getState: () => settingsState },
  ),
}));

vi.mock('@/lib/stores/session-store', () => ({
  useSessionStore: Object.assign(
    (selector: (state: typeof sessionState) => unknown) => selector(sessionState),
    { getState: () => sessionState },
  ),
}));

vi.mock('@/lib/stores/sparring-store', () => ({
  useSparringStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    hydrateSavedSessions: vi.fn(),
    prepareForUser: vi.fn(),
    resetLocalData: vi.fn(),
  }),
}));

vi.mock('@/lib/observability', () => ({
  captureException: vi.fn(),
  captureProductEvent: vi.fn(),
}));

import { askChat } from '@/lib/ai/client';
import { AuthProvider, useAuth } from '@/lib/supabase/AuthProvider';
import { setActiveAccessToken, supabase } from '@/lib/supabase/client';

afterEach(() => {
  setActiveAccessToken(null);
  vi.restoreAllMocks();
});

function AuthState() {
  const { loading, user } = useAuth();
  return createElement('span', { 'data-testid': 'auth-state' }, loading ? 'loading' : user?.id ?? 'signed-out');
}

it('dispatches the AI request without another session lookup', async () => {
  const getSession = vi.spyOn(supabase.auth, 'getSession')
    .mockResolvedValue({
      data: { session: { access_token: 'test-access-token', user: { id: 'user-1' } } },
      error: null,
    } as Awaited<ReturnType<typeof supabase.auth.getSession>>);
  vi.spyOn(supabase.auth, 'onAuthStateChange').mockReturnValue({
    data: { subscription: { id: 'test', callback: vi.fn(), unsubscribe: vi.fn() } },
  } as ReturnType<typeof supabase.auth.onAuthStateChange>);
  const fetchRequest = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
    output: {
      response: 'Request reached the AI function.',
      followUpQuestions: [],
      uncertainties: [],
    },
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));

  render(createElement(AuthProvider, null, createElement(AuthState)));
  await waitFor(() => expect(screen.getByTestId('auth-state')).toHaveTextContent('user-1'));
  const authInitializationLookups = getSession.mock.calls.length;

  const result = await askChat('Hello', [], 'general', {
    provider: 'openrouter',
    model: 'openai/gpt-5.6-luna',
    temperature: 0.7,
    reasoningEffort: 'low',
  });

  expect(fetchRequest).toHaveBeenCalledOnce();
  expect(result).toMatchObject({ response: 'Request reached the AI function.' });
  expect(getSession).toHaveBeenCalledTimes(authInitializationLookups);
});
