import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { StorePurchaseResult, StoreTransaction } from './store-kit';

type Answer = { status: number; body: Record<string, unknown> };
type Session = { user: { id: string }; access_token: string } | null;

const env = vi.hoisted(() => ({
  native: null as unknown,
  session: null as Session,
  respond: (): Promise<Answer> => Promise.resolve({ status: 200, body: {} }),
  posts: [] as { token: string; body: Record<string, unknown> }[],
}));

vi.mock('expo', () => ({ requireOptionalNativeModule: () => null }));
vi.mock('./store-kit', async (original) => ({ ...(await original<typeof import('./store-kit')>()), storeKit: () => env.native }));
vi.mock('./supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: env.session } }) } } }));
vi.mock('./supabase-config', () => ({ supabaseProject: { url: 'https://project.example', anonKey: 'anon' } }));
vi.mock('react-native', () => ({ AppState: { addEventListener: () => ({ remove: () => {} }) } }));
vi.mock('expo/fetch', () => ({
  fetch: async (_url: string, init: { headers: Record<string, string>; body: string }) => {
    env.posts.push({ token: init.headers.Authorization, body: JSON.parse(init.body) as Record<string, unknown> });
    const answer = await env.respond();
    return { ok: answer.status >= 200 && answer.status < 300, status: answer.status, json: async () => answer.body };
  },
}));

const { buy, deliverPending, restore, startPurchaseListener } = await import('./purchases');

const USER_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const USER_B = 'bbbbbbbb-0000-4000-8000-000000000002';
const ACCOUNT_A = { user: { id: USER_A }, access_token: 'token-a' };
const ACCOUNT_B = { user: { id: USER_B }, access_token: 'token-b' };
const APPLIED: Answer = { status: 200, body: { result: 'applied', entitlement: { tier: 'pro', state: 'active', dailyLimit: 50, canAccessProModels: true } } };
const NOT_CONFIGURED: Answer = { status: 503, body: { error: 'In-app purchases are not available yet.', code: 'not_configured' } };

// Transaction ids stay unique across tests: purchases.ts remembers what it finished in this run.
let nextId = 0;
function transaction(userId: string): StoreTransaction {
  nextId += 1;
  return { transactionId: `t${nextId}`, productId: 'com.pistack.debateowl.pro.monthly', signedTransaction: `jws-${nextId}`, appAccountToken: userId, expiresAt: null };
}

/** StoreKit as the module behaves: a purchase stays in unfinished() until finish(). */
function fakeStore() {
  const store = {
    unfinishedList: [] as StoreTransaction[],
    finished: [] as string[],
    listeners: [] as ((transaction: StoreTransaction) => void)[],
    /** What Apple's sheet answers; by default a completed purchase. */
    sheet: (_token: string): Promise<StorePurchaseResult> => Promise.resolve({ status: 'cancelled' }),
    purchase: async (_productId: string, token: string) => {
      const result = await store.sheet(token);
      if (result.status === 'purchased') store.unfinishedList.push(result);
      return result;
    },
    finish: async (id: string) => {
      store.finished.push(id);
      store.unfinishedList = store.unfinishedList.filter((entry) => entry.transactionId !== id);
    },
    unfinished: async () => [...store.unfinishedList],
    currentEntitlements: async () => [],
    sync: async () => {},
    addListener: (_event: string, listener: (transaction: StoreTransaction) => void) => (store.listeners.push(listener), { remove: () => {} }),
  };
  store.sheet = (token) => Promise.resolve({ status: 'purchased', ...transaction(token) });
  return store;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => (resolve = res));
  return { promise, resolve };
}

let store: ReturnType<typeof fakeStore>;

beforeEach(() => {
  store = fakeStore();
  env.native = store;
  env.session = ACCOUNT_A;
  env.posts.length = 0;
  env.respond = () => Promise.resolve(APPLIED);
});

describe('buying a subscription', () => {
  it('finishes the transaction only after the server accepted it', async () => {
    const answer = deferred<Answer>();
    env.respond = () => answer.promise;
    const bought = buy('pro', USER_A);
    await vi.waitFor(() => expect(env.posts).toHaveLength(1));
    expect(env.posts[0]).toMatchObject({ token: 'Bearer token-a', body: { signedTransaction: expect.stringMatching(/^jws-/) } });
    expect(store.finished).toEqual([]);

    answer.resolve(APPLIED);
    await expect(bought).resolves.toEqual({ kind: 'purchased', plan: { tier: 'pro', state: 'active', dailyLimit: 50, canAccessProModels: true } });
    expect(store.finished).toHaveLength(1);
    expect(store.unfinishedList).toEqual([]);
  });

  it('keeps the transaction while the server is not configured, and delivers it once it is', async () => {
    env.respond = () => Promise.resolve(NOT_CONFIGURED);
    await expect(buy('basic', USER_A)).resolves.toEqual({ kind: 'unavailable' });
    expect(store.finished).toEqual([]);
    expect(store.unfinishedList).toHaveLength(1);

    env.respond = () => Promise.resolve(APPLIED);
    await expect(deliverPending(USER_A)).resolves.toBe(1);
    expect(store.unfinishedList).toEqual([]);
  });

  it('keeps the transaction when the server fails', async () => {
    env.respond = () => Promise.resolve({ status: 500, body: { code: 'storage_failed' } });
    await expect(buy('pro', USER_A)).resolves.toEqual({ kind: 'failed', reason: 'server', code: 'storage_failed' });
    expect(store.finished).toEqual([]);
  });

  it('sends nothing for Ask to Buy or a cancelled sheet', async () => {
    store.sheet = () => Promise.resolve({ status: 'pending' });
    await expect(buy('pro', USER_A)).resolves.toEqual({ kind: 'pending' });
    store.sheet = () => Promise.resolve({ status: 'cancelled' });
    await expect(buy('pro', USER_A)).resolves.toEqual({ kind: 'cancelled' });
    expect(env.posts).toEqual([]);
  });

  it('is unavailable without the native module', async () => {
    env.native = null;
    await expect(buy('pro', USER_A)).resolves.toEqual({ kind: 'unavailable' });
    await expect(restore(USER_A)).resolves.toEqual({ kind: 'unavailable' });
    await expect(deliverPending(USER_A)).resolves.toBe(0);
    expect(() => startPurchaseListener(() => USER_A)()).not.toThrow();
  });
});

describe('delivering unfinished transactions', () => {
  it('sends each one once when launch and an update event both deliver', async () => {
    const bought = transaction(USER_A);
    store.unfinishedList.push(bought);
    const answer = deferred<Answer>();
    env.respond = () => answer.promise;

    startPurchaseListener(() => USER_A);
    store.listeners.forEach((listener) => listener(bought));
    const third = deliverPending(USER_A);
    await vi.waitFor(() => expect(env.posts).toHaveLength(1));
    answer.resolve(APPLIED);
    await third;

    expect(env.posts).toHaveLength(1);
    expect(store.finished).toHaveLength(1);
  });

  it('sends a new signed version of a transaction it already delivered, such as a refund', async () => {
    const bought = transaction(USER_A);
    store.unfinishedList.push(bought);
    env.respond = () => Promise.resolve(APPLIED);
    await deliverPending(USER_A);
    expect(env.posts).toHaveLength(1);

    startPurchaseListener(() => USER_A);
    const refunded = { ...bought, signedTransaction: `${bought.signedTransaction}-revoked` };
    store.listeners.forEach((listener) => listener(refunded));
    await vi.waitFor(() => expect(env.posts).toHaveLength(2));
    // The same version again is not.
    store.listeners.forEach((listener) => listener(refunded));
    await deliverPending(USER_A);
    expect(env.posts).toHaveLength(2);
  });

  it('does not send a purchase under the account that signed in while the sheet was open', async () => {
    const sheet = deferred<StorePurchaseResult>();
    let opened = false;
    store.sheet = () => ((opened = true), sheet.promise);
    const bought = buy('pro', USER_A);
    await vi.waitFor(() => expect(opened).toBe(true));

    env.session = ACCOUNT_B;
    sheet.resolve({ status: 'purchased', ...transaction(USER_A) });
    await expect(bought).resolves.toEqual({ kind: 'failed', reason: 'accountChanged' });
    // The new account's own deliveries skip it too.
    await expect(deliverPending(USER_B)).resolves.toBe(0);
    expect(env.posts).toEqual([]);
    expect(store.finished).toEqual([]);

    // Back on the buyer's account, it goes through.
    env.session = ACCOUNT_A;
    await expect(deliverPending(USER_A)).resolves.toBe(1);
    expect(env.posts).toMatchObject([{ token: 'Bearer token-a' }]);
  });
});
