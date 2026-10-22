import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setActiveAccessToken, supabase } from '@/lib/supabase/client';
import { DuplicateSourceError, isPendingSource, useSessionStore, type Source } from '@/lib/stores/session-store';
import { resetDebates, seedCurrentDebate, TEST_DEBATE_ID } from '@/test/helpers/debate';

const SAVED_ID = '33333333-3333-4333-8333-333333333333';
const PAGE = 'https://www.motherly.com/homework-should-be-banned/';

function source(patch: Partial<Source> = {}): Source {
  return {
    id: SAVED_ID,
    title: 'Why Homework Should Be Banned | Motherly',
    content: 'Text',
    type: 'url',
    origin: PAGE,
    folder: 'Auto-saved',
    debateId: TEST_DEBATE_ID,
    isActive: true,
    createdAt: 1,
    ...patch,
  };
}

function insertedRow(origin: string) {
  return {
    id: SAVED_ID,
    title: 'Homework',
    content: 'Text',
    type: 'url',
    origin,
    folder: 'General',
    metadata: null as null,
    debate_id: TEST_DEBATE_ID,
    is_active: true,
    created_at: '2026-10-22T00:00:00.000Z',
  };
}

beforeEach(() => {
  setActiveAccessToken('token', 'user-1');
  seedCurrentDebate();
});

afterEach(() => {
  vi.restoreAllMocks();
  setActiveAccessToken(null, null);
  resetDebates();
  useSessionStore.setState({ sourceLibrary: [], sourceFolders: ['General'] });
});

describe('toggleSource', () => {
  it('puts the switch back and rejects when the write fails', async () => {
    useSessionStore.setState({ sourceLibrary: [source()] });
    const network = new TypeError('Failed to fetch');
    vi.spyOn(supabase, 'from').mockImplementation(() => ({
      update: () => ({ eq: () => ({ eq: async () => { throw network; } }) }),
    }) as never);

    const toggle = useSessionStore.getState().toggleSource(SAVED_ID);
    // It moves at once, before the server answers.
    expect(useSessionStore.getState().sourceLibrary[0].isActive).toBe(false);
    await expect(toggle).rejects.toBe(network);
    expect(useSessionStore.getState().sourceLibrary[0].isActive).toBe(true);
  });

  it('puts the switch back when the server refuses the update', async () => {
    useSessionStore.setState({ sourceLibrary: [source({ isActive: false })] });
    vi.spyOn(supabase, 'from').mockImplementation(() => ({
      update: () => ({ eq: () => ({ eq: async (): Promise<{ error: { message: string } }> => ({ error: { message: 'permission denied' } }) }) }),
    }) as never);

    await expect(useSessionStore.getState().toggleSource(SAVED_ID)).rejects.toThrow();
    expect(useSessionStore.getState().sourceLibrary[0].isActive).toBe(false);
  });
});

describe('addSource keeps one row per web page in a debate', () => {
  it('refuses a page this debate already has, before any write', async () => {
    useSessionStore.setState({ sourceLibrary: [source()] });
    const from = vi.spyOn(supabase, 'from');

    const add = useSessionStore.getState().addSource({
      title: 'Homework again',
      content: 'Text',
      type: 'url',
      origin: 'https://motherly.com/homework-should-be-banned?utm_source=exa#top',
    });
    await expect(add).rejects.toBeInstanceOf(DuplicateSourceError);
    await expect(add).rejects.toMatchObject({ existingId: SAVED_ID });
    expect(from).not.toHaveBeenCalled();
    expect(useSessionStore.getState().sourceLibrary).toHaveLength(1);
  });

  it('refuses a page the server already has for this debate, and drops the shown row', async () => {
    const insert = vi.fn();
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table !== 'sources') throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({ eq: () => ({ eq: async () => ({ data: [{ id: SAVED_ID, origin: null as string | null, metadata: { url: PAGE } }], error: null as null }) }) }),
        insert,
      } as never;
    });

    await expect(useSessionStore.getState().addSource({
      title: 'Homework',
      content: 'Text',
      type: 'url',
      origin: 'http://motherly.com/homework-should-be-banned',
    })).rejects.toBeInstanceOf(DuplicateSourceError);
    expect(insert).not.toHaveBeenCalled();
    expect(useSessionStore.getState().sourceLibrary).toEqual([]);
  });

  it('shows the row while it saves, then swaps in the saved row', async () => {
    let finishInsert!: () => void;
    const inserted = new Promise<void>((resolve) => { finishInsert = resolve; });
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'source_folders') return { upsert: async (): Promise<{ error: null }> => ({ error: null }) } as never;
      return {
        select: () => ({ eq: () => ({ eq: async () => ({ data: [] as unknown[], error: null as null }) }) }),
        insert: () => ({ select: () => ({ single: async (): Promise<{ data: ReturnType<typeof insertedRow>; error: null }> => { await inserted; return { data: insertedRow(PAGE), error: null }; } }) }),
      } as never;
    });

    const add = useSessionStore.getState().addSource({ title: 'Homework', content: 'Text', type: 'url', origin: PAGE });
    await vi.waitFor(() => expect(useSessionStore.getState().sourceLibrary).toHaveLength(1));
    expect(isPendingSource(useSessionStore.getState().sourceLibrary[0])).toBe(true);

    finishInsert();
    await add;
    expect(useSessionStore.getState().sourceLibrary.map((item) => item.id)).toEqual([SAVED_ID]);
  });

  it('puts back a deleted page with Undo without calling it a duplicate', async () => {
    const insert = vi.fn(() => ({ select: () => ({ single: async (): Promise<{ data: ReturnType<typeof insertedRow>; error: null }> => ({ data: insertedRow(PAGE), error: null }) }) }));
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'source_folders') return { upsert: async (): Promise<{ error: null }> => ({ error: null }) } as never;
      return { insert } as never;
    });

    await useSessionStore.getState().addSource({ id: SAVED_ID, createdAt: 1, title: 'Homework', content: 'Text', type: 'url', origin: PAGE });
    expect(insert).toHaveBeenCalledOnce();
    expect(useSessionStore.getState().sourceLibrary.map((item) => item.id)).toEqual([SAVED_ID]);
  });
});
