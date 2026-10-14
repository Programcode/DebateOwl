import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Sent = {
  name: string;
  args: Record<string, unknown>;
  headers: Record<string, string>;
  signal?: AbortSignal;
};
type Session = { user: { id: string }; access_token: string } | null;

const server = vi.hoisted(() => ({
  sent: [] as Sent[],
  session: null as Session,
  respond: (_request: Sent): Promise<{ error: { message: string } | null }> => Promise.resolve({ error: null }),
  storage: new Map<string, string>(),
}));

function builder(request: Sent) {
  const query = {
    setHeader: (name: string, value: string) => ((request.headers[name] = value), query),
    abortSignal: (signal: AbortSignal) => ((request.signal = signal), query),
    then: <T>(onFulfilled: (value: { error: { message: string } | null }) => T, onRejected?: (cause: unknown) => T) => {
      server.sent.push(request);
      const aborted = { error: { message: 'AbortError' } };
      if (request.signal?.aborted) return Promise.resolve(aborted).then(onFulfilled, onRejected);
      // As with fetch, aborting ends the request for the app; the server may still act on it.
      const answer = new Promise<{ error: { message: string } | null }>((resolve, reject) => {
        request.signal?.addEventListener('abort', () => resolve(aborted), { once: true });
        server.respond(request).then(resolve, reject);
      });
      return answer.then(onFulfilled, onRejected);
    },
  };
  return query;
}

vi.mock('./supabase', () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: server.session } }) },
    rpc: (name: string, args: Record<string, unknown>) => builder({ name, args, headers: {} }),
  },
}));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => server.storage.get(key) ?? null,
    setItem: async (key: string, value: string) => void server.storage.set(key, value),
    removeItem: async (key: string) => void server.storage.delete(key),
  },
}));
vi.mock('./device-storage', () => ({ getInstallId: async () => 'install-1' }));
vi.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));
vi.mock('expo', () => ({ isRunningInExpoGo: () => false }));
vi.mock('expo/fetch', () => ({ fetch: vi.fn() }));
vi.mock('expo-constants', () => ({ default: { easConfig: { projectId: 'project' }, expoConfig: null } }));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-notifications', () => ({
  IosAuthorizationStatus: { PROVISIONAL: 3 },
  setNotificationHandler: () => {},
  getPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
  requestPermissionsAsync: async () => ({ granted: true, canAskAgain: true }),
  getExpoPushTokenAsync: async () => ({ data: TOKEN }),
}));

const TOKEN = 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]';
const KEY = 'debatelab.push-registration';
const ACCOUNT_A = { user: { id: 'user-a' }, access_token: 'token-a' };
const ACCOUNT_B = { user: { id: 'user-b' }, access_token: 'token-b' };

const { enablePush, forgetPushOnSignOut, readPushState, refreshPush } = await import('./push');

function deferred() {
  let resolve!: (value: { error: { message: string } | null }) => void;
  const promise = new Promise<{ error: { message: string } | null }>((res) => (resolve = res));
  return { promise, resolve };
}

describe('push token removal on sign-out', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    server.sent.length = 0;
    server.storage.clear();
    server.session = ACCOUNT_A;
    server.respond = () => Promise.resolve({ error: null });
  });
  afterEach(() => vi.useRealTimers());

  it('removes a registration that lands after its account signed out, with that account\'s token', async () => {
    const registration = deferred();
    server.respond = (request) => (request.name === 'register_push_token' ? registration.promise : Promise.resolve({ error: null }));
    const enabled = enablePush('user-a', 'en');
    await vi.waitFor(() => expect(server.sent.map((request) => request.name)).toContain('register_push_token'));

    // Sign-out stops waiting after five seconds while the registration is still out.
    const signOut = forgetPushOnSignOut('user-a', 'token-a');
    await vi.advanceTimersByTimeAsync(5_000);
    await signOut;
    server.session = null;

    registration.resolve({ error: null });
    await expect(enabled).resolves.toBe('on');
    await vi.waitFor(() => expect(server.storage.has(KEY)).toBe(false));
    const registered = server.sent.find((request) => request.name === 'register_push_token');
    const removal = server.sent.find((request) => request.name === 'release_push_token');
    expect(removal).toMatchObject({
      args: { p_token: TOKEN, p_installation_id: 'install-1', p_registration: registered?.args.p_registration },
      headers: { Authorization: 'Bearer token-a' },
    });
    expect(removal?.signal?.aborted).toBe(false);
  });

  it('keeps the registration when the removal fails, and the next account releases the token', async () => {
    server.storage.set(KEY, JSON.stringify({ userId: 'user-a', token: TOKEN, id: 'registration-a', confirmed: true }));
    server.respond = () => Promise.resolve({ error: { message: 'offline' } });
    await forgetPushOnSignOut('user-a', 'token-a');
    expect(server.storage.has(KEY)).toBe(true);

    server.session = ACCOUNT_B;
    server.respond = () => Promise.resolve({ error: null });
    await refreshPush('user-b', 'en');
    expect(server.sent.at(-1)).toMatchObject({
      name: 'release_push_token',
      args: { p_token: TOKEN, p_registration: 'registration-a' },
      headers: { Authorization: 'Bearer token-b' },
    });
    expect(server.storage.has(KEY)).toBe(false);
  });

  it('keeps a registration that commits after sign-out removed the rows from reaching the next account', async () => {
    // A small model of the database: rows, and the registrations a release withdrew.
    const db = { rows: [] as { token: unknown; userId: string; registration: unknown }[], withdrawn: new Set<unknown>() };
    const callers: Record<string, string> = { 'Bearer token-a': 'user-a', 'Bearer token-b': 'user-b' };
    const apply = (request: Sent) => {
      const caller = callers[request.headers.Authorization];
      const args = request.args;
      if (request.name === 'register_push_token') {
        if (db.withdrawn.has(args.p_registration)) return { error: { message: 'withdrawn' } };
        db.rows = db.rows.filter((row) => row.token !== args.p_token);
        db.rows.push({ token: args.p_token, userId: caller, registration: args.p_registration });
      } else if (request.name === 'release_push_token') {
        if (args.p_registration) db.withdrawn.add(args.p_registration);
        db.rows = db.rows.filter((row) => row.token !== args.p_token && row.registration !== args.p_registration);
      }
      return { error: null };
    };
    // The registration reaches the database but commits only when the test says so.
    const commit = deferred();
    server.respond = (request) =>
      request.name === 'register_push_token' ? commit.promise.then(() => apply(request)) : Promise.resolve(apply(request));

    const enabled = enablePush('user-a', 'en');
    await vi.waitFor(() => expect(server.sent.map((request) => request.name)).toContain('register_push_token'));
    // The app gives up on it; cancelling the request does not cancel the statement.
    const failed = expect(enabled).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(20_000);
    await failed;

    await forgetPushOnSignOut('user-a', 'token-a');
    server.session = null;
    commit.resolve({ error: null });
    await vi.advanceTimersByTimeAsync(0);

    server.session = ACCOUNT_B;
    await refreshPush('user-b', 'en');
    expect(db.rows).toEqual([]);
  });

  it('removes a first registration whose answer was lost', async () => {
    server.respond = (request) =>
      Promise.resolve({ error: request.name === 'register_push_token' ? { message: 'Network request failed' } : null });
    await expect(enablePush('user-a', 'en')).rejects.toThrow('Network request failed');
    await expect(readPushState('user-a')).resolves.toBe('off');

    // The server may have stored the row before the answer was lost.
    await forgetPushOnSignOut('user-a', 'token-a');
    expect(server.sent.at(-1)).toMatchObject({ name: 'release_push_token', headers: { Authorization: 'Bearer token-a' } });
    expect(server.storage.has(KEY)).toBe(false);
  });
});
