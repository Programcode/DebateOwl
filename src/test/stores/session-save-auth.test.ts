import { afterEach, describe, expect, it, vi } from 'vitest';
import { setActiveAccessToken, supabase } from '@/lib/supabase/client';
import { currentUserId } from '@/lib/supabase/current-user';
import { useSessionStore } from '@/lib/stores/session-store';
import { resetDebates, seedCurrentDebate, TEST_DEBATE_ID } from '@/test/helpers/debate';

const DEBATE_ID = TEST_DEBATE_ID;

function sourceRow() {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    title: 'School wifi notes',
    content: 'The packet was lost.',
    type: 'text',
    origin: null as string | null,
    folder: 'General',
    metadata: null as null,
    debate_id: DEBATE_ID,
    is_active: true,
    created_at: '2026-10-22T00:00:00.000Z',
  };
}

describe('saves when the Auth server is down', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    setActiveAccessToken(null, null);
    resetDebates();
    useSessionStore.setState({ sourceLibrary: [], sourceFolders: ['General'], savedCases: [] });
  });

  it('uses the local session when getUser fails', async () => {
    setActiveAccessToken(null, null);
    vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({
      data: { user: null },
      error: { message: 'Auth unavailable', name: 'AuthRetryableFetchError', status: 503 },
    } as never);
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({
      data: { session: { user: { id: 'user-1' } } },
      error: null,
    } as never);

    await expect(currentUserId()).resolves.toBe('user-1');
    expect(supabase.auth.getUser).toHaveBeenCalled();
  });

  it('writes a source to the database instead of pretending a local copy was saved', async () => {
    setActiveAccessToken('token', 'user-1');
    seedCurrentDebate();
    const getUser = vi.spyOn(supabase.auth, 'getUser').mockRejectedValue(new Error('503'));
    const insert = vi.fn(() => ({
      select: () => ({
        single: async (): Promise<{ data: ReturnType<typeof sourceRow>; error: null }> => ({ data: sourceRow(), error: null }),
      }),
    }));
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'source_folders') {
        return { upsert: async (): Promise<{ error: null }> => ({ error: null }) } as never;
      }
      if (table === 'sources') return { insert } as never;
      throw new Error(`unexpected table ${table}`);
    });

    await useSessionStore.getState().addSource({ title: 'School wifi notes', content: 'The packet was lost.', type: 'text' });

    expect(getUser).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalledOnce();
    expect(useSessionStore.getState().sourceLibrary.map((source) => source.id)).toEqual([sourceRow().id]);
  });

  it('reports failure instead of keeping a source that only exists in the browser', async () => {
    setActiveAccessToken(null, null);
    seedCurrentDebate();
    vi.spyOn(supabase.auth, 'getUser').mockResolvedValue({ data: { user: null }, error: null } as never);
    vi.spyOn(supabase.auth, 'getSession').mockResolvedValue({ data: { session: null }, error: null } as never);
    const from = vi.spyOn(supabase, 'from');

    await expect(useSessionStore.getState().addSource({
      title: 'School wifi notes',
      content: 'The packet was lost.',
      type: 'text',
    })).rejects.toThrow(/Sign in to save this source/);

    expect(from).not.toHaveBeenCalled();
    expect(useSessionStore.getState().sourceLibrary).toEqual([]);
  });
});
