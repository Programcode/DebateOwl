import { beforeEach, describe, expect, it, vi } from 'vitest';

import { sessionStorage } from './device-storage';

const store = vi.hoisted(() => {
  let seed = 0;
  // Each pending entry holds the next ciphertext write open until released.
  const held: Promise<void>[] = [];
  return {
    keys: new Map<string, string>(),
    ciphertexts: new Map<string, string>(),
    failNextKeyWrite: false,
    held,
    nextBytes: (length: number) => Uint8Array.from({ length }, (_, i) => (seed++ + i) & 255),
  };
});

vi.mock('expo-crypto', () => ({
  getRandomBytes: store.nextBytes,
  getRandomBytesAsync: async (length: number) => store.nextBytes(length),
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => store.keys.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    if (store.failNextKeyWrite) {
      store.failNextKeyWrite = false;
      throw new Error('Keychain unavailable');
    }
    store.keys.set(key, value);
  },
  deleteItemAsync: async (key: string) => void store.keys.delete(key),
}));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: async (key: string) => store.ciphertexts.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      await store.held.shift();
      store.ciphertexts.set(key, value);
    },
    removeItem: async (key: string) => void store.ciphertexts.delete(key),
  },
}));

/** Holds the next ciphertext write open, after its key is already in the Keychain. */
function holdNextCiphertextWrite() {
  let release!: () => void;
  store.held.push(new Promise<void>((resolve) => (release = resolve)));
  return release;
}

const KEY = 'sb-session';

describe('sessionStorage', () => {
  beforeEach(() => {
    store.keys.clear();
    store.ciphertexts.clear();
    store.held.length = 0;
    store.failNextKeyWrite = false;
  });

  it('leaves the last of two overlapping writes readable', async () => {
    const release = holdNextCiphertextWrite();
    const first = sessionStorage.setItem(KEY, 'first session');
    const second = sessionStorage.setItem(KEY, 'second session');
    await new Promise((resolve) => setTimeout(resolve, 0));
    release();
    await Promise.all([first, second]);

    expect(await sessionStorage.getItem(KEY)).toBe('second session');
  });

  it('answers a read issued during a pending write with that write', async () => {
    const release = holdNextCiphertextWrite();
    const write = sessionStorage.setItem(KEY, 'new session');
    const read = sessionStorage.getItem(KEY);
    await new Promise((resolve) => setTimeout(resolve, 0));
    release();
    await write;

    expect(await read).toBe('new session');
  });

  it('runs the next write after a failed one', async () => {
    store.failNextKeyWrite = true;
    const failed = sessionStorage.setItem(KEY, 'lost session');
    const next = sessionStorage.setItem(KEY, 'next session');

    await expect(failed).rejects.toThrow('Keychain unavailable');
    await next;
    expect(await sessionStorage.getItem(KEY)).toBe('next session');
  });
});
