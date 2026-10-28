import { describe, expect, it, vi } from 'vitest';

const session = vi.hoisted(() => ({ resolve: (_token: string) => {} }));
const fetchMock = vi.hoisted(() => vi.fn());

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: () => new Promise((resolve) => (session.resolve = (token) => resolve({ data: { session: { access_token: token } } }))) } },
}));
vi.mock('expo/fetch', () => ({ fetch: fetchMock }));

import { askOnce } from './ask';

describe('askOnce', () => {
  it('never sends the request when Ask is left while the session is still being read', async () => {
    const controller = new AbortController();
    const request = askOnce({
      message: 'Why ban homework?',
      mode: 'general',
      history: [],
      options: { citationMode: false, webSearch: false, prosConsMode: false, argumentMapMode: false },
      config: { model: 'test-model', reasoningEffort: 'low' },
      language: 'en',
    }, controller.signal);
    controller.abort();
    session.resolve('token');
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
