import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Source } from './sources';

const storage = vi.hoisted(() => new Map<string, string>());
const net = vi.hoisted(() => ({ offline: false, user: 'user-a' as string | null, uuids: 0 }));
// supabase-js answers a request that never reached the server with status 0; readFailed marks it unreachable.
// The saved copies, kept in memory so a test can see what an offline relaunch would show.
const copies = vi.hoisted(() => new Map<string, unknown>());
const pending = vi.hoisted(() => ({ chain: Promise.resolve() as Promise<void> }));
const cache = vi.hoisted(() => ({
  ReadError: class ReadError extends Error {
    constructor(message: string, readonly unreachable: boolean) {
      super(message);
    }
  },
  // Copy updates run later, one at a time, as the real cache's do.
  updateCopy: (_userId: string, group: string, key: string, update: (copy: unknown) => unknown) => {
    pending.chain = pending.chain.then(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2));
      copies.set(`${group}:${key}`, update(copies.get(`${group}:${key}`)));
    });
  },
  copiesWritten: () => pending.chain,
}));
const sources = vi.hoisted(() => ({
  addSource: vi.fn(),
  updateSource: vi.fn(),
  setSourcesActive: vi.fn(),
  fetchSource: vi.fn(),
  fetchSources: vi.fn(),
  notifySourcesChanged: vi.fn(),
  DuplicateSourceError: class DuplicateSourceError extends Error {},
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => void storage.set(key, value),
    removeItem: async (key: string) => void storage.delete(key),
    getAllKeys: async () => [...storage.keys()],
    multiRemove: async (keys: string[]) => keys.forEach((key) => storage.delete(key)),
  },
}));
vi.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++net.uuids}` }));
vi.mock('./network-status', () => ({ isKnownOffline: () => net.offline }));
vi.mock('./offline-cache', () => cache);
vi.mock('./sources', () => sources);
vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: net.user ? { user: { id: net.user } } : null } }) } },
}));

const noAnswer = () => new cache.ReadError('TypeError: Network request failed', true);
const refused = () => new cache.ReadError('new row violates row-level security policy', false);

function row(id: string, input: { title: string; content: string; debateId: string }): Source {
  return { id, title: input.title, content: input.content, type: 'text', origin: null, createdAt: 1, useCount: 0, folder: 'General', isActive: true, debateId: input.debateId, metadata: null };
}

// A fresh module per test: the owner and the queue are module state, as in the app.
async function load(owner: string | null = 'user-a') {
  vi.resetModules();
  const queue = await import('./offline-queue');
  if (owner !== undefined) queue.setQueueOwner(owner);
  return queue;
}

/** What reached the server, in order. */
function sent(): string[] {
  const calls: [number, string][] = [
    ...sources.addSource.mock.calls.map((call, i) => [sources.addSource.mock.invocationCallOrder[i], `add ${call[1].id} ${call[1].title}`] as [number, string]),
    ...sources.updateSource.mock.calls.map((call, i) => [sources.updateSource.mock.invocationCallOrder[i], `edit ${call[2]} ${JSON.stringify(call[3])}`] as [number, string]),
    ...sources.setSourcesActive.mock.calls.map((call, i) => [sources.setSourcesActive.mock.invocationCallOrder[i], `active ${call[2].join(',')} ${call[3]}`] as [number, string]),
  ];
  return calls.sort((a, b) => a[0] - b[0]).map(([, call]) => call);
}

beforeEach(async () => {
  // Copy updates a previous test started finish before this one begins.
  await pending.chain;
  pending.chain = Promise.resolve();
  storage.clear();
  copies.clear();
  net.offline = false;
  net.user = 'user-a';
  net.uuids = 0;
  vi.clearAllMocks();
  sources.addSource.mockImplementation(async (_userId: string, input: { id: string; title: string; content: string; debateId: string }) => row(input.id, input));
  sources.updateSource.mockResolvedValue(undefined);
  sources.setSourcesActive.mockResolvedValue(undefined);
  sources.fetchSources.mockResolvedValue([]);
  sources.fetchSource.mockResolvedValue(null);
});

describe('offline queue', () => {
  it('keeps writes made offline and sends them in order once the connection is back', async () => {
    const queue = await load();
    const reports: unknown[] = [];
    queue.subscribeQueueReports((report) => reports.push(report));
    net.offline = true;
    const note = await queue.queueAddSource('user-a', { title: 'Note', content: 'Text', type: 'text', debateId: 'd1' });
    await expect(queue.queueUpdateSource('user-a', 'd1', 's1', { title: 'Renamed' })).resolves.toBe('queued');
    await expect(queue.queueSetSourcesActive('user-a', 'd1', ['s2'], false)).resolves.toBe('queued');
    expect(note.status).toBe('queued');
    expect(sent()).toEqual([]);
    expect(queue.waitingCount(queue.getQueueSnapshot())).toBe(3);

    net.offline = false;
    await queue.replayOfflineQueue();
    expect(sent()).toEqual(['add uuid-1 Note', 'edit s1 {"title":"Renamed"}', 'active s2 false']);
    expect(queue.getQueueSnapshot().items).toEqual([]);
    expect(reports).toEqual([{ synced: 3, dropped: [] }]);
  });

  it('sends only the last switch of a source and one merged edit, without reordering other sources', async () => {
    const queue = await load();
    net.offline = true;
    await queue.queueSetSourcesActive('user-a', 'd1', ['a', 'b'], false);
    await queue.queueSetSourcesActive('user-a', 'd1', ['c'], false);
    await queue.queueUpdateSource('user-a', 'd1', 'a', { title: 'First' });
    await queue.queueSetSourcesActive('user-a', 'd1', ['a'], true);
    await queue.queueUpdateSource('user-a', 'd1', 'a', { title: 'Second', content: 'Body' });
    await queue.queueSetSourcesActive('user-a', 'd1', ['c'], true);

    net.offline = false;
    await queue.replayOfflineQueue();
    expect(sent()).toEqual(['active b false', 'edit a {"title":"Second","content":"Body"}', 'active a true', 'active c true']);
  });

  it('keeps a write that got no answer, and drops one the server refused with the error to the caller', async () => {
    const queue = await load();
    const reports: unknown[] = [];
    queue.subscribeQueueReports((report) => reports.push(report));
    sources.updateSource.mockRejectedValueOnce(noAnswer());
    await expect(queue.queueUpdateSource('user-a', 'd1', 's1', { title: 'Kept' })).resolves.toBe('queued');
    expect(queue.waitingSourceIds(queue.getQueueSnapshot())).toEqual(new Set(['s1']));

    sources.setSourcesActive.mockRejectedValueOnce(refused());
    // Behind a waiting write, a new one waits too and is reported once a replay drops it.
    await expect(queue.queueSetSourcesActive('user-a', 'd1', ['s2'], false)).resolves.toBe('queued');
    await queue.replayOfflineQueue();
    expect(reports).toEqual([{ synced: 1, dropped: [{ kind: 'active' }] }]);
    expect(queue.getQueueSnapshot().items).toEqual([]);
    expect(sources.notifySourcesChanged).toHaveBeenCalled();
    // The saved copies that showed the refused switch are read back from the server, so a relaunch offline never shows it.
    expect(sources.fetchSources).toHaveBeenCalledWith('user-a', 'd1');
    expect(sources.fetchSource).toHaveBeenCalledWith('user-a', 's2');

    // Online with nothing waiting, a refusal reaches the caller and nothing stays queued.
    sources.updateSource.mockRejectedValueOnce(refused());
    await expect(queue.queueUpdateSource('user-a', 'd1', 's1', { title: 'Refused' })).rejects.toThrow('row-level security');
    expect(queue.getQueueSnapshot().items).toEqual([]);
  });

  it('drops the writes queued for a debate once Clear all succeeds, and keeps them when it fails', async () => {
    const queue = await load();
    copies.set('sources:d1', [row('s1', { title: 'Kept', content: 'Text', debateId: 'd1' })]);
    net.offline = true;
    const note = queue.queueAddSource('user-a', { title: 'Waiting note', content: 'Text', type: 'text', debateId: 'd1' });
    await note;
    await queue.queueUpdateSource('user-a', 'd2', 's9', { title: 'Other debate' });
    // A clear the server refuses keeps everything queued.
    await expect(queue.clearQueuedDebate('user-a', 'd1', async () => { throw new Error('clear failed'); })).rejects.toThrow('clear failed');
    expect(queue.getQueueSnapshot().items).toHaveLength(2);
    net.offline = true;
    await queue.clearQueuedDebate('user-a', 'd1', async () => undefined);
    await cache.copiesWritten();
    expect(queue.getQueueSnapshot().items.map((item) => item.kind === 'add' ? item.input.debateId : item.debateId)).toEqual(['d2']);
    expect((copies.get('sources:d1') as Source[]).map((item) => item.id)).toEqual(['s1']);

    net.offline = false;
    await queue.replayOfflineQueue();
    expect(sources.addSource).not.toHaveBeenCalled();
    expect(sent()).toEqual(['edit s9 {"title":"Other debate"}']);
  });

  it('puts back what the copies showed before a refused change, even when the server cannot be read again', async () => {
    const queue = await load();
    copies.set('sources:d1', [row('s1', { title: 'Old', content: 'Text', debateId: 'd1' })]);
    copies.set('source:s1', row('s1', { title: 'Old', content: 'Text', debateId: 'd1' }));
    net.offline = true;
    await queue.queueUpdateSource('user-a', 'd1', 's1', { title: 'New' });
    await cache.copiesWritten();
    expect((copies.get('sources:d1') as Source[])[0].title).toBe('New');

    // Back online the server refuses it, and the connection goes again before it can be read back.
    sources.updateSource.mockRejectedValueOnce(refused());
    sources.fetchSources.mockRejectedValueOnce(noAnswer());
    sources.fetchSource.mockRejectedValueOnce(noAnswer());
    net.offline = false;
    await queue.replayOfflineQueue();
    await cache.copiesWritten();
    expect((copies.get('sources:d1') as Source[])[0].title).toBe('Old');
    expect((copies.get('source:s1') as Source).title).toBe('Old');
  });

  it('puts back the old value even when the refusal comes before the copies have updated', async () => {
    const queue = await load();
    copies.set('sources:d1', [row('s1', { title: 'Old', content: 'Text', debateId: 'd1' })]);
    copies.set('source:s1', row('s1', { title: 'Old', content: 'Text', debateId: 'd1' }));
    // Online: the server refuses at once, while the copy update that notes "Old" is still waiting.
    sources.updateSource.mockRejectedValueOnce(refused());
    sources.fetchSources.mockRejectedValueOnce(noAnswer());
    sources.fetchSource.mockRejectedValueOnce(noAnswer());
    await expect(queue.queueUpdateSource('user-a', 'd1', 's1', { title: 'New' })).rejects.toThrow('row-level security');
    // The caller hears the refusal first; the copies are put back right after.
    await queue.replayOfflineQueue();
    await cache.copiesWritten();
    expect((copies.get('sources:d1') as Source[])[0].title).toBe('Old');
    expect((copies.get('source:s1') as Source).title).toBe('Old');
  });

  it('puts back the last saved value, not the first, when a later change to the same field is refused', async () => {
    const queue = await load();
    copies.set('sources:d1', [row('s1', { title: 'Old', content: 'Text', debateId: 'd1' })]);
    copies.set('source:s1', row('s1', { title: 'Old', content: 'Text', debateId: 'd1' }));
    let saveFirst: () => void = () => undefined;
    sources.updateSource.mockImplementationOnce(() => new Promise<void>((resolve) => { saveFirst = resolve; }));
    const first = queue.queueUpdateSource('user-a', 'd1', 's1', { title: 'First' });
    await new Promise((resolve) => setTimeout(resolve, 10));
    // Queued while "First" is on its way, so it is a write of its own.
    sources.updateSource.mockRejectedValueOnce(refused());
    sources.fetchSources.mockRejectedValueOnce(noAnswer());
    sources.fetchSource.mockRejectedValueOnce(noAnswer());
    const second = queue.queueUpdateSource('user-a', 'd1', 's1', { title: 'Second' });
    saveFirst();
    await expect(first).resolves.toBe('saved');
    await expect(second).rejects.toThrow('row-level security');
    await queue.replayOfflineQueue();
    await cache.copiesWritten();
    expect((copies.get('sources:d1') as Source[])[0].title).toBe('First');
  });

  it('saves a waiting note with its later edits and switch, under the id after its temporary prefix', async () => {
    const queue = await load();
    net.offline = true;
    const { source } = await queue.queueAddSource('user-a', { title: 'Draft', content: 'Text', type: 'text', debateId: 'd1' });
    expect(queue.isLocalSourceId(source.id)).toBe(true);
    await queue.queueUpdateSource('user-a', 'd1', source.id, { title: 'Final' });
    await queue.queueSetSourcesActive('user-a', 'd1', [source.id], false);
    expect(queue.withQueuedWrites(queue.getQueueSnapshot(), 'd1', [])).toMatchObject([{ id: source.id, title: 'Final', isActive: false }]);

    net.offline = false;
    await queue.replayOfflineQueue();
    expect(sent()).toEqual(['add uuid-1 Final']);
    expect(sources.addSource.mock.calls[0][1]).toMatchObject({ id: 'uuid-1', isActive: false });
    expect(queue.currentSourceId(queue.getQueueSnapshot(), source.id)).toBe('uuid-1');
  });

  it('saves changes folded into a note whose insert landed but whose answer was lost', async () => {
    const queue = await load();
    copies.set('sources:d1', []);
    net.offline = true;
    const { source } = await queue.queueAddSource('user-a', { title: 'Draft', content: 'Text', type: 'text', debateId: 'd1' });
    await queue.queueUpdateSource('user-a', 'd1', source.id, { title: 'Final' });
    await queue.queueSetSourcesActive('user-a', 'd1', [source.id], false);
    // The first insert reached the server as "Draft"; this replay's insert is refused as a duplicate.
    sources.addSource.mockRejectedValueOnce(new sources.DuplicateSourceError('duplicate key'));
    sources.fetchSource.mockResolvedValueOnce(row('uuid-1', { title: 'Draft', content: 'Text', debateId: 'd1' }));

    net.offline = false;
    await queue.replayOfflineQueue();
    expect(sources.updateSource).toHaveBeenCalledWith('user-a', 'd1', 'uuid-1', { title: 'Final', isActive: false });
    expect(queue.getQueueSnapshot().items).toHaveLength(0);
    // No refresh follows this path, so the saved copies take the row: the note opens offline after a restart.
    await cache.copiesWritten();
    expect((copies.get('sources:d1') as Source[]).map((item) => item.id)).toEqual(['uuid-1']);
    expect((copies.get('source:uuid-1') as Source).title).toBe('Final');
    // updateSource drops the saved list, so the list is read back from the server.
    expect(sources.fetchSources).toHaveBeenCalledWith('user-a', 'd1');
  });

  it('sends a change made while its note is on the way with the row id', async () => {
    const queue = await load();
    let answer!: () => void;
    sources.addSource.mockImplementationOnce(
      (_userId: string, input: { id: string; title: string; content: string; debateId: string }) =>
        new Promise((resolve) => {
          answer = () => resolve(row('row-1', input));
        }),
    );
    const adding = queue.queueAddSource('user-a', { title: 'Note', content: 'Text', type: 'text', debateId: 'd1' });
    await vi.waitFor(() => expect(sources.addSource).toHaveBeenCalled());
    const editing = queue.queueUpdateSource('user-a', 'd1', 'local:uuid-1', { content: 'More' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    answer();
    await expect(adding).resolves.toMatchObject({ status: 'saved', source: { id: 'row-1' } });
    await expect(editing).resolves.toBe('saved');
    expect(sent()).toEqual(['add uuid-1 Note', 'edit row-1 {"content":"More"}']);
  });

  it('drops the changes to a note the server refused', async () => {
    const queue = await load();
    net.offline = true;
    const { source } = await queue.queueAddSource('user-a', { title: 'Refused note', content: 'Text', type: 'text', debateId: 'd1' });
    await queue.queueSetSourcesActive('user-a', 'd1', [source.id, 's9'], false);
    sources.addSource.mockRejectedValueOnce(refused());
    net.offline = false;
    const reports: unknown[] = [];
    queue.subscribeQueueReports((report) => reports.push(report));
    await queue.replayOfflineQueue();
    expect(sent()).toEqual(['add uuid-1 Refused note', 'active s9 false']);
    expect(reports).toEqual([{ synced: 1, dropped: [{ kind: 'add', title: 'Refused note' }] }]);
    await expect(queue.queueUpdateSource('user-a', 'd1', source.id, { title: 'Too late' })).rejects.toThrow();
    expect(sources.updateSource).not.toHaveBeenCalled();
  });

  it('belongs to one account: a restart keeps it, another account removes it and never sends it', async () => {
    let queue = await load('user-a');
    net.offline = true;
    await queue.queueUpdateSource('user-a', 'd1', 's1', { title: 'A only' });
    await vi.waitFor(() => expect([...storage.keys()]).toEqual(['debatelab.writes.v1:user-a']));

    // Same account after a restart: sent once online.
    queue = await load('user-a');
    net.offline = false;
    sources.updateSource.mockRejectedValueOnce(noAnswer());
    await queue.replayOfflineQueue();
    expect(queue.waitingCount(queue.getQueueSnapshot())).toBe(1);

    // Another account signs in on the same phone.
    vi.clearAllMocks();
    queue = await load('user-b');
    net.user = 'user-b';
    await queue.replayOfflineQueue();
    expect(sent()).toEqual([]);
    expect([...storage.keys()]).toEqual([]);
    await expect(queue.queueUpdateSource('user-a', 'd1', 's1', { title: 'Stale screen' })).rejects.toThrow('another account');
  });

  it('waits while the session belongs to no one or another account', async () => {
    const queue = await load('user-a');
    net.offline = true;
    await queue.queueUpdateSource('user-a', 'd1', 's1', { title: 'Later' });
    net.offline = false;
    net.user = null;
    await queue.replayOfflineQueue();
    expect(sent()).toEqual([]);
    net.user = 'user-a';
    await queue.replayOfflineQueue();
    expect(sent()).toEqual(['edit s1 {"title":"Later"}']);
  });
});
