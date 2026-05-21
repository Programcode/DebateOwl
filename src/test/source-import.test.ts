import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSessionMock, invokeMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  invokeMock: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
    },
    functions: {
      invoke: invokeMock,
    },
  },
}));

const validImport = {
  title: 'Imported article',
  content: 'Readable source content',
  wordCount: 3,
  domain: 'example.com',
  excerpt: 'Readable source content',
  url: 'https://example.com/article',
};

describe('source import helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionMock.mockResolvedValue({ data: { session: { access_token: 'token-123' } } });
  });

  it('invokes import-source with auth and returns parsed data', async () => {
    invokeMock.mockResolvedValueOnce({ data: validImport, error: null });
    const { importSourceFromUrl } = await import('@/lib/source-import');

    await expect(importSourceFromUrl('https://example.com/article')).resolves.toEqual(validImport);
    expect(invokeMock).toHaveBeenCalledWith('import-source', {
      headers: { Authorization: 'Bearer token-123' },
      body: { url: 'https://example.com/article' },
    });
  });

  it('uses JSON edge error bodies instead of generic invoke messages', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          status: 422,
          text: async () => JSON.stringify({ error: 'This page did not contain enough readable text to import.' }),
        },
      },
    });
    const { importSourceFromUrl } = await import('@/lib/source-import');

    await expect(importSourceFromUrl('https://example.com/short')).rejects.toThrow(
      'This page did not contain enough readable text to import.'
    );
  });

  it('falls back to HTTP status when edge error body cannot be parsed', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { status: 429, text: async () => '{bad-json' },
      },
    });
    const { importSourceFromUrl } = await import('@/lib/source-import');

    await expect(importSourceFromUrl('https://example.com/limit')).rejects.toThrow('Request failed (HTTP 429)');
  });

  it('rejects invalid import response shapes', async () => {
    invokeMock.mockResolvedValueOnce({ data: { title: '' }, error: null });
    const { importSourceFromUrl } = await import('@/lib/source-import');

    await expect(importSourceFromUrl('https://example.com/bad')).rejects.toThrow('Imported source response was invalid');
  });
});
