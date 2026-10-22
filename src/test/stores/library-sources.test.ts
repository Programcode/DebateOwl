import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setActiveAccessToken, supabase } from '@/lib/supabase/client';
import { DuplicateSourceError, isPendingSource, useSessionStore, type Source } from '@/lib/stores/session-store';
import { resetDebates, seedCurrentDebate, TEST_DEBATE_ID } from '@/test/helpers/debate';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

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

  it('puts back a deleted page with Undo, as a row that cannot be changed until it lands', async () => {
    const landed = deferred();
    const insert = vi.fn(() => ({ select: () => ({ single: async (): Promise<{ data: ReturnType<typeof insertedRow>; error: null }> => { await landed.promise; return { data: insertedRow(PAGE), error: null }; } }) }));
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'source_folders') return { upsert: async (): Promise<{ error: null }> => ({ error: null }) } as never;
      return { insert } as never;
    });

    const restore = useSessionStore.getState().addSource({ id: SAVED_ID, createdAt: 1, title: 'Homework', content: 'Text', type: 'url', origin: PAGE });
    await vi.waitFor(() => expect(insert).toHaveBeenCalledOnce());
    // Deleting it again now would race the restore and bring it back afterwards.
    const shown = useSessionStore.getState().sourceLibrary[0];
    expect(isPendingSource(shown)).toBe(true);
    await expect(useSessionStore.getState().removeSource(shown.id)).rejects.toThrow(/still saving/);

    landed.resolve();
    await restore;
    expect(useSessionStore.getState().sourceLibrary.map((item) => item.id)).toEqual([SAVED_ID]);
  });

  it('keeps one row when another action copies the row while it saves', async () => {
    const landed = deferred();
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
      if (table === 'source_folders') return { upsert: async (): Promise<{ error: null }> => ({ error: null }) } as never;
      return {
        select: () => ({ eq: () => ({ eq: async () => ({ data: [] as unknown[], error: null as null }) }) }),
        insert: () => ({ select: () => ({ single: async (): Promise<{ data: ReturnType<typeof insertedRow>; error: null }> => { await landed.promise; return { data: insertedRow(PAGE), error: null }; } }) }),
        // Switching the folder off rewrites every row in it, the saving one included.
        update: () => ({ eq: () => ({ eq: () => ({ eq: async () => ({ error: null as null }) }) }) }),
      } as never;
    });

    const add = useSessionStore.getState().addSource({ title: 'Homework', content: 'Text', type: 'url', origin: PAGE, folder: 'General' });
    await vi.waitFor(() => expect(useSessionStore.getState().sourceLibrary).toHaveLength(1));
    await useSessionStore.getState().setFolderActive('General', false);
    landed.resolve();
    await add;

    expect(useSessionStore.getState().sourceLibrary.map((item) => item.id)).toEqual([SAVED_ID]);
  });
});

describe('toggleSource with writes in flight', () => {
  function stubSources(update: () => Promise<{ error: { message: string } | null }>, staleRows: () => Promise<unknown[]> = async () => []) {
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => ({
      update: () => ({ eq: () => ({ eq: update }) }),
      select: () => ({
        order: async () => ({ data: table === 'sources' ? await staleRows() : [], error: null as null }),
      }),
    }) as never);
  }

  it('ends on what the server holds when two quick toggles both fail', async () => {
    useSessionStore.setState({ sourceLibrary: [source({ isActive: true })] });
    stubSources(async () => ({ error: { message: 'offline' } }));

    const off = useSessionStore.getState().toggleSource(SAVED_ID);
    const on = useSessionStore.getState().toggleSource(SAVED_ID);
    await expect(off).rejects.toThrow();
    await expect(on).rejects.toThrow();

    expect(useSessionStore.getState().sourceLibrary[0].isActive).toBe(true);
  });

  it('keeps a toggle that lands after a reload started but before it answers', async () => {
    useSessionStore.setState({ sourceLibrary: [source({ isActive: true })] });
    const read = deferred();
    stubSources(async () => ({ error: null }), async () => { await read.promise; return [{ ...insertedRow(PAGE), is_active: true }]; });

    const hydrate = useSessionStore.getState().hydrateFromServer();
    await useSessionStore.getState().toggleSource(SAVED_ID);
    read.resolve();
    await hydrate;
    expect(useSessionStore.getState().sourceLibrary.map((item) => item.isActive)).toEqual([false]);
  });

  it('keeps a saved toggle when a server reload that read the old value lands', async () => {
    useSessionStore.setState({ sourceLibrary: [source({ isActive: true })] });
    const written = deferred();
    const read = deferred();
    stubSources(async () => { await written.promise; return { error: null }; }, async () => { await read.promise; return [{
      ...insertedRow(PAGE), is_active: true,
    }]; });

    // The reload starts first and reads before the write lands.
    const hydrate = useSessionStore.getState().hydrateFromServer();
    const toggle = useSessionStore.getState().toggleSource(SAVED_ID);
    read.resolve();
    await hydrate;
    written.resolve();
    await toggle;
    expect(useSessionStore.getState().sourceLibrary.map((item) => item.isActive)).toEqual([false]);

  });
});

describe('other writes and the switch', () => {
  /** A Supabase update whose filters can chain any number of times, answering with `result()`. */
  function updateQuery(result: () => Promise<{ error: { message: string } | null }>) {
    const query = { eq: () => query, then: (done: (value: unknown) => unknown, fail: (reason: unknown) => unknown) => result().then(done, fail) };
    return query;
  }

  it('does not save a switch value with a metadata refresh while the switch write fails', async () => {
    useSessionStore.setState({ sourceLibrary: [source({ isActive: true })] });
    const toggleWrite = deferred();
    const payloads: Record<string, unknown>[] = [];
    vi.spyOn(supabase, 'from').mockImplementation(() => ({
      update: (payload: Record<string, unknown>) => {
        payloads.push(payload);
        return updateQuery(async () => {
          if ('is_active' in payload) { await toggleWrite.promise; return { error: { message: 'offline' } }; }
          return { error: null };
        });
      },
    }) as never);

    const toggle = useSessionStore.getState().toggleSource(SAVED_ID);
    await useSessionStore.getState().updateSource(SAVED_ID, { metadata: { url: PAGE, capturedVia: 'attack' } });
    toggleWrite.resolve();
    await expect(toggle).rejects.toThrow();

    expect(payloads.filter((payload) => 'metadata' in payload)).toEqual([{ metadata: { url: PAGE, capturedVia: 'attack' } }]);
    expect(useSessionStore.getState().sourceLibrary[0]).toMatchObject({ isActive: true, metadata: { capturedVia: 'attack' } });
  });

  it('keeps a folder switched on after a toggle when a reload that started earlier lands', async () => {
    useSessionStore.setState({ sourceLibrary: [source({ isActive: true, folder: 'General' })] });
    const read = deferred();
    vi.spyOn(supabase, 'from').mockImplementation((table: string) => ({
      update: () => updateQuery(async () => ({ error: null })),
      select: () => ({
        order: async () => {
          if (table !== 'sources') return { data: [] as unknown[], error: null as null };
          await read.promise;
          return { data: [{ ...insertedRow(PAGE), is_active: true }], error: null as null };
        },
      }),
    }) as never);

    const hydrate = useSessionStore.getState().hydrateFromServer();
    await useSessionStore.getState().toggleSource(SAVED_ID);
    await useSessionStore.getState().setFolderActive('General', true);
    read.resolve();
    await hydrate;

    expect(useSessionStore.getState().sourceLibrary.map((item) => item.isActive)).toEqual([true]);
  });
});
