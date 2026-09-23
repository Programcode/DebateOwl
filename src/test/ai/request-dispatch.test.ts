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
  sessionState.sourceLibrary = [];
  settingsState.customSystemPrompt = '';
  vi.restoreAllMocks();
});

function AuthState() {
  const { loading, user } = useAuth();
  return createElement('span', { 'data-testid': 'auth-state' }, loading ? 'loading' : user?.id ?? 'signed-out');
}

it('calls the AI fetch boundary without another session lookup', async () => {
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
      response: 'Mock AI response.',
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
  expect(result).toMatchObject({ response: 'Mock AI response.' });
  expect(getSession).toHaveBeenCalledTimes(authInitializationLookups);
});

it('maps a rejected fetch through the Edge Function error contract', async () => {
  setActiveAccessToken('test-access-token');
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

  await expect(askChat('Hello', [], 'general', {
    provider: 'openrouter',
    model: 'openai/gpt-5.6-luna',
    temperature: 0.7,
    reasoningEffort: 'low',
  })).rejects.toMatchObject({
    name: 'AIError',
    message: 'AI service error: Failed to send a request to the Edge Function. Please try again.',
    statusCode: 500,
  });
});

it('keeps large Ask context below the Edge Function request limit', async () => {
  setActiveAccessToken('test-access-token');
  sessionState.sourceLibrary = [{
    id: 'local_source_legacy',
    title: 'Local source',
    content: 'local only',
    type: 'text',
    isActive: true,
  }, ...Array.from({ length: 12 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    title: `Source ${index}`,
    content: 'source context '.repeat(3_000),
    type: 'text',
    isActive: true,
  }))];
  settingsState.customSystemPrompt = '界'.repeat(50_000);
  const history = Array.from({ length: 12 }, (_, index) => ({
    role: index % 2 === 0 ? 'user' as const : 'assistant' as const,
    content: '界'.repeat(20_000),
  }));

  let sentBody = '';
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
    sentBody = String(init?.body ?? '');
    if (new TextEncoder().encode(sentBody).byteLength > 200_000) {
      return new Response(JSON.stringify({ error: 'Request body exceeds 200000 bytes' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({
      output: { response: 'Mock AI response.', followUpQuestions: [], uncertainties: [] },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });

  await expect(askChat('界'.repeat(20_000), history, 'clarify', {
    provider: 'openrouter',
    model: 'openai/gpt-5.6-luna',
    temperature: 0.7,
    reasoningEffort: 'low',
  })).resolves.toMatchObject({ response: 'Mock AI response.' });

  const body = JSON.parse(sentBody) as {
    customSystemPrompt: string;
    input: { history: Array<{ content: string }>; message: string };
    sourceIds: string[];
    sources?: unknown;
  };
  expect(new TextEncoder().encode(sentBody).byteLength).toBeLessThanOrEqual(200_000);
  expect(body.sourceIds).toHaveLength(10);
  expect(body.sourceIds).not.toContain('local_source_legacy');
  expect(body.sources).toBeUndefined();
  expect(body.input.history).toHaveLength(8);
  expect(body.input.history.every((message) => new TextEncoder().encode(message.content).byteLength <= 6_000)).toBe(true);
  expect(body.input.history.reduce((total, message) => total + new TextEncoder().encode(message.content).byteLength, 0)).toBeLessThanOrEqual(48_000);
  expect(new TextEncoder().encode(body.input.message).byteLength).toBeLessThanOrEqual(80_000);
  expect(new TextEncoder().encode(body.customSystemPrompt).byteLength).toBeLessThanOrEqual(32_000);
});

it('rejects an oversized multibyte Ask message instead of shortening it silently', async () => {
  setActiveAccessToken('test-access-token');
  const fetchRequest = vi.spyOn(globalThis, 'fetch');

  await expect(askChat('😀'.repeat(30_000), [], 'clarify', {
    provider: 'openrouter',
    model: 'openai/gpt-5.6-luna',
    temperature: 0.7,
    reasoningEffort: 'low',
  })).rejects.toMatchObject({
    name: 'AIError',
    message: 'Message is too large. Shorten it before sending.',
    statusCode: 413,
  });

  expect(fetchRequest).not.toHaveBeenCalled();
});
