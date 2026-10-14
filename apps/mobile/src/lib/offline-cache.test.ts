import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => new Map<string, string>());
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

// A fresh module per test: the owner and tickets are module state, as in the app.
async function load() {
  vi.resetModules();
  const cache = await import('./offline-cache');
  const status = await import('./network-status');
  offlineFailure = () => Promise.reject(cache.readFailed({ message: 'TypeError: Network request failed' }, 0));
  return { ...cache, ...status };
}

beforeEach(() => {
  storage.clear();
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
    const { cachedRead, forgetCopy, setCacheOwner } = await load();
    setCacheOwner('user-a');
    await cachedRead('user-a', 'result:case', 'case-1', async () => 'saved case');
    const slow = deferred<string>();
    const running = cachedRead('user-a', 'result:case', 'case-1', () => slow.promise);
    forgetCopy('user-a', 'result:case', 'case-1');
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
