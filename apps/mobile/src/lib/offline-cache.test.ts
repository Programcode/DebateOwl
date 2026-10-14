import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => new Map<string, string>());
// A Supabase client whose queries answer with the next queued result, for the modules that write.
const supabase = vi.hoisted(() => ({ results: [] as unknown[], from: () => undefined as unknown }));
vi.mock('./supabase', () => ({ supabase }));
const network = vi.hoisted(() => ({ listener: null as ((state: { isConnected: boolean; isInternetReachable: boolean }) => void) | null }));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => void storage.set(key, value),
    removeItem: async (key: string) => void storage.delete(key),
    getAllKeys: async () => [...storage.keys()],
    multiSet: async (pairs: [string, string][]) => pairs.forEach(([key, value]) => storage.set(key, value)),
    multiRemove: async (keys: string[]) => keys.forEach((key) => storage.delete(key)),
  },
}));

vi.mock('expo-network', () => ({
  addNetworkStateListener: (listener: typeof network.listener) => {
    network.listener = listener;
    return { remove: () => undefined };
  },
  getNetworkStateAsync: async () => ({ isConnected: true, isInternetReachable: true }),
}));

// A read that got no answer from the server, as supabase-js reports it (status 0). Set by load().
let offlineFailure: () => Promise<never>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function query(result: unknown): unknown {
  const builder: unknown = new Proxy({}, {
    get: (_target, prop) => (prop === 'then' ? (resolve: (value: unknown) => void) => resolve(result) : () => builder),
  });
  return builder;
}
supabase.from = () => query(supabase.results.shift() ?? { data: null, error: null, status: 200 });

// A fresh module per test: the owner and tickets are module state, as in the app.
async function load() {
  vi.resetModules();
  const cache = await import('./offline-cache');
  const status = await import('./network-status');
  const writers = { ...(await import('./debates')), ...(await import('./sources')), ...(await import('./flowcharts')) };
  offlineFailure = () => Promise.reject(cache.readFailed({ message: 'TypeError: Network request failed' }, 0));
  return { ...cache, ...status, ...writers };
}

beforeEach(() => {
  storage.clear();
  supabase.results = [];
});

describe('saved copies between accounts', () => {
  it('never answers account B from account A, and drops A on the switch', async () => {
    const { cachedRead, setCacheOwner } = await load();
    setCacheOwner('user-a');
    await cachedRead('user-a', 'sources', 'debate-1', async () => ['A secret source']);
    await expect(cachedRead('user-a', 'sources', 'debate-1', offlineFailure)).resolves.toEqual(['A secret source']);

    setCacheOwner('user-b');
    await expect(cachedRead('user-b', 'sources', 'debate-1', offlineFailure)).rejects.toThrow('TypeError: Network request failed');
    // A's own key is not readable either once B owns the cache.
    await expect(cachedRead('user-a', 'sources', 'debate-1', offlineFailure)).rejects.toThrow('TypeError: Network request failed');
    expect([...storage.keys()].some((key) => key.includes('user-a'))).toBe(false);
    expect([...storage.values()].some((value) => value.includes('A secret source'))).toBe(false);
  });

  it('removes every copy on sign-out and keeps them for the same account after a restart', async () => {
    let cache = await load();
    cache.setCacheOwner('user-a');
    await cache.cachedRead('user-a', 'debates', 'all', async () => ({ debates: ['motion'] }));

    // A restart signed in as the same account still reads its copies offline.
    cache = await load();
    cache.setCacheOwner('user-a');
    await expect(cache.cachedRead('user-a', 'debates', 'all', offlineFailure)).resolves.toEqual({ debates: ['motion'] });

    cache.setCacheOwner(null);
    cache.setCacheOwner('user-a');
    await expect(cache.cachedRead('user-a', 'debates', 'all', offlineFailure)).rejects.toThrow();
    expect([...storage.keys()].filter((key) => key !== 'debatelab.cache.v1.owner')).toEqual([]);
  });

  it('drops copies from a restart with a different account, even without a sign-out', async () => {
    let cache = await load();
    cache.setCacheOwner('user-a');
    await cache.cachedRead('user-a', 'result:case', 'case-1', async () => ({ title: 'A case' }));

    cache = await load();
    cache.setCacheOwner('user-b');
    await expect(cache.cachedRead('user-b', 'result:case', 'case-1', offlineFailure)).rejects.toThrow();
    expect([...storage.values()].some((value) => value.includes('A case'))).toBe(false);
  });

  it('does not keep an answer for A that lands after the switch to B', async () => {
    const { cachedRead, setCacheOwner } = await load();
    setCacheOwner('user-a');
    const slow = deferred<string[]>();
    const read = cachedRead('user-a', 'sources', 'debate-1', () => slow.promise);
    setCacheOwner('user-b');
    slow.resolve(['A late source']);
    await read;
    await cachedRead('user-b', 'sources', 'other', async () => []);
    expect([...storage.values()].some((value) => value.includes('A late source'))).toBe(false);
  });
});

describe('stale answers', () => {
  it('a slow answer never overwrites a newer saved copy', async () => {
    const { cachedRead, setCacheOwner } = await load();
    setCacheOwner('user-a');
    const slow = deferred<string>();
    const older = cachedRead('user-a', 'flowchart', 'map-1', () => slow.promise);
    await cachedRead('user-a', 'flowchart', 'map-1', async () => 'newer');
    slow.resolve('older');
    await older;
    await expect(cachedRead('user-a', 'flowchart', 'map-1', offlineFailure)).resolves.toBe('newer');
  });

  it('a read already running when a row is deleted does not bring its copy back', async () => {
    const { cachedRead, afterWrite, setCacheOwner } = await load();
    setCacheOwner('user-a');
    await cachedRead('user-a', 'result:case', 'case-1', async () => 'saved case');
    const slow = deferred<string>();
    const running = cachedRead('user-a', 'result:case', 'case-1', () => slow.promise);
    afterWrite('user-a', [{ group: 'result:case', key: 'case-1' }]);
    slow.resolve('saved case');
    await running;
    await expect(cachedRead('user-a', 'result:case', 'case-1', offlineFailure)).rejects.toThrow();
  });

  it('keeps a saved null apart from no copy', async () => {
    const { cachedRead, setCacheOwner } = await load();
    setCacheOwner('user-a');
    await cachedRead('user-a', 'source', 'gone', async () => null);
    await expect(cachedRead('user-a', 'source', 'gone', offlineFailure)).resolves.toBeNull();
  });
});

describe('offline', () => {
  it('answers from the copy without waiting on the network, and says so', async () => {
    const { cachedRead, setCacheOwner, watchNetwork, isKnownOffline } = await load();
    setCacheOwner('user-a');
    await cachedRead('user-a', 'chats', 'debate-1', async () => ['chat']);
    watchNetwork();
    network.listener?.({ isConnected: false, isInternetReachable: false });
    expect(isKnownOffline()).toBe(true);
    const never = vi.fn(() => new Promise<string[]>(() => undefined));
    await expect(cachedRead('user-a', 'chats', 'debate-1', never)).resolves.toEqual(['chat']);
    expect(never).not.toHaveBeenCalled();
  });

  it('drops the least recently fetched copies beyond a group limit', async () => {
    const { cachedRead, setCacheOwner } = await load();
    setCacheOwner('user-a');
    const now = vi.spyOn(Date, 'now');
    for (let i = 0; i < 21; i += 1) {
      now.mockReturnValue(1_000 + i);
      await cachedRead('user-a', 'sources', `debate-${i}`, async () => [i]);
    }
    now.mockRestore();
    await cachedRead('user-a', 'sources', 'flush', offlineFailure).catch(() => undefined);
    await expect(cachedRead('user-a', 'sources', 'debate-0', offlineFailure)).rejects.toThrow();
    await expect(cachedRead('user-a', 'sources', 'debate-20', offlineFailure)).resolves.toEqual([20]);
  });
});

describe('which failures fall back', () => {
  it('serves the copy when no answer came back from the server', async () => {
    const { cachedRead, setCacheOwner } = await load();
    setCacheOwner('user-a');
    await cachedRead('user-a', 'sources', 'debate-1', async () => ['source']);
    await expect(cachedRead('user-a', 'sources', 'debate-1', offlineFailure)).resolves.toEqual(['source']);
  });

  it('throws a refused session, a policy error or any other server answer instead of serving the copy', async () => {
    const { cachedRead, readFailed, setCacheOwner } = await load();
    setCacheOwner('user-a');
    await cachedRead('user-a', 'sources', 'debate-1', async () => ['source']);
    const refusals = [
      readFailed({ message: 'JWT expired' }, 401),
      readFailed({ message: 'permission denied for table sources' }, 403),
      readFailed({ message: 'Server error' }, 500),
      new Error('Flowchart rows did not check out'),
    ];
    for (const refusal of refusals) {
      await expect(cachedRead('user-a', 'sources', 'debate-1', () => Promise.reject(refusal))).rejects.toBe(refusal);
    }
  });
});

describe('the saved-copies notice', () => {
  it('stays while another screen still shows a copy, and goes when that copy is read from the server', async () => {
    const cache = await load();
    cache.setCacheOwner('user-a');
    await cache.cachedRead('user-a', 'source', 'source-1', async () => 'text');
    await cache.cachedRead('user-a', 'sources', 'debate-1', async () => ['source']);
    await cache.cachedRead('user-a', 'source', 'source-1', offlineFailure);
    const shown = () => cache.getOfflineStatus().savedCopies;
    expect(shown()).toBe(true);
    await cache.cachedRead('user-a', 'sources', 'debate-1', async () => ['source']);
    expect(shown()).toBe(true);
    await cache.cachedRead('user-a', 'source', 'source-1', async () => 'text');
    expect(shown()).toBe(false);
  });
});

describe('after a write', () => {
  const flowchartRow = (title: string) => ({ id: 'map-1', title, debate_id: 'debate-1', nodes: [], edges: [], created_at: '2026-10-14T10:00:00.000Z' });

  it('a read started before saving over a map cannot bring the old map back, and offline opens the saved one', async () => {
    const cache = await load();
    cache.setCacheOwner('user-a');
    supabase.results.push({ data: flowchartRow('Before'), error: null, status: 200 });
    await cache.fetchFlowchart('user-a', 'map-1');
    const slow = deferred<unknown>();
    const before = cache.cachedRead('user-a', 'flowchart', 'map-1', () => slow.promise);
    supabase.results.push({ data: [flowchartRow('After')], error: null, status: 200 });
    await expect(cache.updateFlowchart('user-a', 'map-1', { nodes: [], edges: [] })).resolves.toBe(true);
    slow.resolve({ title: 'Before' });
    await before;
    await expect(cache.cachedRead('user-a', 'flowchart', 'map-1', offlineFailure)).resolves.toMatchObject({ title: 'After' });
  });

  it('a change to a debate stops a list read already running for it, and leaves other debates alone', async () => {
    const { cachedRead, afterWrite, debateListScopes, setCacheOwner } = await load();
    setCacheOwner('user-a');
    await cachedRead('user-a', 'debate-lists', 'recent:debate-1:pro:5', async () => ['old']);
    await cachedRead('user-a', 'debate-lists', 'recent:debate-2:pro:5', async () => ['other']);
    const slow = deferred<string[]>();
    const running = cachedRead('user-a', 'debate-lists', 'recent:debate-1:pro:5', () => slow.promise);
    afterWrite('user-a', debateListScopes('debate-1', 'case'));
    slow.resolve(['old']);
    await running;
    await expect(cachedRead('user-a', 'debate-lists', 'recent:debate-1:pro:5', offlineFailure)).rejects.toThrow();
    await expect(cachedRead('user-a', 'debate-lists', 'recent:debate-2:pro:5', offlineFailure)).resolves.toEqual(['other']);
  });

  it('deleting a source drops it from the Library and the counts that held it', async () => {
    const cache = await load();
    cache.setCacheOwner('user-a');
    await cache.cachedRead('user-a', 'sources', 'debate-1', async () => [{ id: 'source-1', content: 'full text' }]);
    await cache.cachedRead('user-a', 'source', 'source-1', async () => ({ id: 'source-1', content: 'full text' }));
    await cache.cachedRead('user-a', 'debate-lists', 'counts:debate-1', async () => ({ sources: 1 }));
    await cache.cachedRead('user-a', 'debate-lists', 'source-counts:debate-1,debate-2', async () => ({ 'debate-1': 1 }));
    await cache.cachedRead('user-a', 'sources', 'debate-2', async () => [{ id: 'source-2' }]);
    supabase.results.push({ data: [{ debate_id: 'debate-1' }], error: null, status: 200 });
    await cache.removeSource('user-a', 'source-1');
    await cache.cachedRead('user-a', 'sources', 'flush', offlineFailure).catch(() => undefined);
    expect([...storage.values()].some((value) => value.includes('full text'))).toBe(false);
    await expect(cache.cachedRead('user-a', 'debate-lists', 'counts:debate-1', offlineFailure)).rejects.toThrow();
    await expect(cache.cachedRead('user-a', 'debate-lists', 'source-counts:debate-1,debate-2', offlineFailure)).rejects.toThrow();
    await expect(cache.cachedRead('user-a', 'sources', 'debate-2', offlineFailure)).resolves.toEqual([{ id: 'source-2' }]);
  });

  it('a delete whose row was already gone still drops every list and count that may hold it', async () => {
    const cache = await load();
    cache.setCacheOwner('user-a');
    await cache.cachedRead('user-a', 'sources', 'debate-1', async () => [{ id: 'source-1' }]);
    await cache.cachedRead('user-a', 'debate-lists', 'counts:debate-1', async () => ({ sources: 1 }));
    await cache.cachedRead('user-a', 'debate-lists', 'source-counts:debate-1', async () => ({ 'debate-1': 1 }));
    await cache.cachedRead('user-a', 'flowcharts', 'one-off', async () => [{ id: 'map-1' }]);
    await cache.cachedRead('user-a', 'debate-lists', 'prepare:debate-1:20', async () => [{ id: 'map-1' }]);
    // Deleted on the website first: the delete succeeds and returns no row.
    supabase.results.push({ data: [], error: null, status: 200 }, { data: [], error: null, status: 200 });
    await cache.removeSource('user-a', 'source-1');
    await cache.deleteFlowchart('user-a', 'map-1');
    await cache.cachedRead('user-a', 'sources', 'flush', offlineFailure).catch(() => undefined);
    for (const [group, key] of [['sources', 'debate-1'], ['debate-lists', 'counts:debate-1'], ['debate-lists', 'source-counts:debate-1'], ['flowcharts', 'one-off'], ['debate-lists', 'prepare:debate-1:20']] as const) {
      await expect(cache.cachedRead('user-a', group, key, offlineFailure), `${group} ${key}`).rejects.toThrow();
    }
  });

  it('switching debates changes the saved Current Debate, so an offline restart opens the new one', async () => {
    let cache = await load();
    cache.setCacheOwner('user-a');
    const row = (id: string, at: string) => ({ id, motion: id, settings: {}, instructions: '', last_activity_at: at, created_at: at });
    supabase.results.push(
      { data: [row('debate-1', '2026-10-14T10:00:00.000Z'), row('debate-2', '2026-10-13T10:00:00.000Z')], error: null, status: 200 },
      { data: { debate_id: 'debate-1' }, error: null, status: 200 },
    );
    await cache.fetchDebates('user-a');
    await cache.switchDebate('user-a', 'debate-2');
    await cache.cachedRead('user-a', 'sources', 'flush', offlineFailure).catch(() => undefined);

    cache = await load();
    cache.setCacheOwner('user-a');
    const offline = await cache.cachedRead<{ debates: { id: string }[]; currentId: string }>('user-a', 'debates', 'all', offlineFailure);
    expect(offline.currentId).toBe('debate-2');
    expect(offline.debates[0].id).toBe('debate-2');
  });
});
