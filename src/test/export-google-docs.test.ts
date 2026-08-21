import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerateOutput } from '@/lib/ai/schemas/generate';

const { getSessionMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  SUPABASE_URL: 'https://example.supabase.co',
  supabase: {
    auth: { getSession: getSessionMock },
  },
}));

import { exportCaseToGoogleDocs } from '@/lib/export-utils';

const validCase: GenerateOutput = {
  caseStructure: { thesis: 'Thesis', framework: 'Framework', keyDefinitions: [], burdenOfProof: 'Burden' },
  contentions: [],
  predictedOpponentCase: { likelyArguments: [], strategicWeaknesses: [], keyClashes: [] },
  counters: [],
  metadata: { side: 'pro', format: 'bp', generatedAt: '2026-01-01T00:00:00Z' },
};

describe('Google Docs export credential handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'app-token', provider_token: undefined } },
      error: null,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('uses the session-scoped provider token instead of stale local storage', async () => {
    localStorage.setItem('google_provider_token', 'stale-token');
    sessionStorage.setItem('google_provider_token', 'session-token');
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ documentUrl: 'https://docs.google.com/document/d/1' }), { status: 200 }));
    globalThis.fetch = fetchMock;

    await expect(exportCaseToGoogleDocs(validCase)).resolves.toEqual({
      success: true,
      documentUrl: 'https://docs.google.com/document/d/1',
    });

    const request = fetchMock.mock.calls[0]?.[1];
    expect(JSON.parse(String(request?.body))).toMatchObject({ accessToken: 'session-token' });
  });

  it('stores refreshed provider access tokens only for the browser session', async () => {
    sessionStorage.setItem('google_provider_token', 'session-token');
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      documentUrl: 'https://docs.google.com/document/d/1',
      newAccessToken: 'refreshed-token',
    }), { status: 200 }));

    await exportCaseToGoogleDocs(validCase);

    expect(sessionStorage.getItem('google_provider_token')).toBe('refreshed-token');
    expect(localStorage.getItem('google_provider_token')).toBeNull();
  });

  it('reports a specific error when the export request times out', async () => {
    vi.useFakeTimers();
    sessionStorage.setItem('google_provider_token', 'session-token');
    globalThis.fetch = vi.fn((_url, init) => new Promise<Response>((_resolve, reject) => {
      const signal = (init as RequestInit).signal;
      if (!signal) {
        reject(new Error('request was not abortable'));
        return;
      }
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    })) as typeof fetch;

    const exportPromise = exportCaseToGoogleDocs(validCase);
    await vi.advanceTimersByTimeAsync(30_000);

    await expect(exportPromise).resolves.toEqual({
      success: false,
      error: 'Google Docs export timed out. Please try again.',
    });
  });

  it('reports a specific error when the response body stalls past the deadline', async () => {
    vi.useFakeTimers();
    sessionStorage.setItem('google_provider_token', 'session-token');
    globalThis.fetch = vi.fn((_url, init) => {
      const signal = (init as RequestInit).signal;
      return Promise.resolve({
        ok: true,
        json: () => new Promise((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
      } as Response);
    }) as typeof fetch;

    const exportPromise = exportCaseToGoogleDocs(validCase);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(30_000);

    await expect(Promise.race([
      exportPromise,
      Promise.resolve({ pending: true }),
    ])).resolves.toEqual({
      success: false,
      error: 'Google Docs export timed out. Please try again.',
    });
  });
});
