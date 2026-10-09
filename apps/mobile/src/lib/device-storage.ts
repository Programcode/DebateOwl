import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupportedStorage } from '@supabase/supabase-js';
import * as aesjs from 'aes-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

// Reads, writes and removes run one at a time per key. Two overlapping writes
// could otherwise leave the key from one and the ciphertext from the other,
// which reads as signed out. supabase-js writes on sign-in and every refresh.
const queues = new Map<string, Promise<unknown>>();

function queued<T>(key: string, work: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();
  // A failed operation must not block the ones after it.
  const next = previous.then(work, work);
  queues.set(key, next);
  const release = () => {
    if (queues.get(key) === next) queues.delete(key);
  };
  void next.then(release, release);
  return next;
}

/**
 * Supabase's LargeSecureStore pattern: a session can be larger than the
 * Keychain handles well, so the session is AES-256-CTR encrypted into
 * AsyncStorage and only the key, fresh on every write, goes in the Keychain.
 */
export const sessionStorage: SupportedStorage = {
  getItem: (key) => queued(key, async () => {
    const ciphertext = await AsyncStorage.getItem(key);
    const keyHex = await SecureStore.getItemAsync(key);
    if (!ciphertext || !keyHex) return null;
    try {
      const cipher = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(keyHex), new aesjs.Counter(1));
      return aesjs.utils.utf8.fromBytes(cipher.decrypt(aesjs.utils.hex.toBytes(ciphertext)));
    } catch {
      // A key and ciphertext from different writes (an interrupted write) read as signed out.
      return null;
    }
  }),
  setItem: (key, value) => queued(key, async () => {
    // getRandomBytes falls back to Math.random in development builds; the async
    // version always uses the native generator.
    const keyBytes = await Crypto.getRandomBytesAsync(32);
    const cipher = new aesjs.ModeOfOperation.ctr(keyBytes, new aesjs.Counter(1));
    const ciphertext = aesjs.utils.hex.fromBytes(cipher.encrypt(aesjs.utils.utf8.toBytes(value)));
    await SecureStore.setItemAsync(key, aesjs.utils.hex.fromBytes(keyBytes));
    await AsyncStorage.setItem(key, ciphertext);
  }),
  removeItem: (key) => queued(key, async () => {
    await AsyncStorage.removeItem(key);
    await SecureStore.deleteItemAsync(key);
  }),
};

const INSTALL_ID_KEY = 'debatelab.install-id';

/** A random id for this install. Demo-code sign-in sends it for rate limiting, as the web sends a per-tab id. */
export async function getInstallId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(INSTALL_ID_KEY);
  if (existing) return existing;
  const id = Crypto.randomUUID();
  await SecureStore.setItemAsync(INSTALL_ID_KEY, id);
  return id;
}
