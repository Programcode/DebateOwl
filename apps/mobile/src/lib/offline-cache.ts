import AsyncStorage from '@react-native-async-storage/async-storage';

import { isKnownOffline, noteNetworkRead, noteSavedCopy } from './network-status';
import { createSerialQueue } from './serial-queue';

/**
 * Saved copies of what the app reads, so debates, sources, saved results and
 * past rounds stay readable without a connection. A read goes to the network
 * first and keeps a copy of the answer; when the network fails, or the device
 * is known to be offline, the copy answers instead. Nothing is written
 * offline: saving waits for the network.
 *
 * The copies belong to one account. Each is stored under its user id and
 * checked against it when read, and all of them are removed when the account
 * changes, including signing out, before the next account's first read: every
 * storage step runs in one queue, behind the removal.
 */

/** How many copies each group keeps; the least recently fetched beyond that are dropped. */
const LIMITS = {
  /** The debates list with the Current Debate. */
  debates: 1,
  /** Counts and recent work per debate and side. */
  'debate-lists': 60,
  /** A debate's Library, with each source's text. */
  sources: 20,
  source: 60,
  'result:case': 40,
  'result:attack': 40,
  'result:brainstorm': 40,
  'result:factoids': 40,
  flowcharts: 20,
  flowchart: 40,
  chats: 20,
  chat: 40,
} as const;

export type CacheGroup = keyof typeof LIMITS;

/** A copy larger than this is not kept; web storage holds about 5 MB in all. */
const MAX_ENTRY_CHARS = 512_000;

const PREFIX = 'debatelab.cache.v1';
const OWNER_KEY = `${PREFIX}.owner`;
const indexKey = (userId: string) => `${PREFIX}.index:${userId}`;
const entryKey = (userId: string, group: CacheGroup, key: string) => `${PREFIX}:${userId}:${group}:${key}`;

type Index = Record<string, { group: CacheGroup; at: number }>;

const queue = createSerialQueue();
// undefined until the auth provider names the first owner, so that first call always checks storage.
let owner: string | null | undefined;
// Bumped on every owner change; work started for an earlier owner never writes.
let generation = 0;
// Every read takes a ticket when it starts. A copy is only replaced by an answer
// from a read that started later, so a slow answer never overwrites a newer one.
let tickets = 0;
const newest = new Map<string, number>();
let index: { userId: string; entries: Index } | null = null;

function warn(what: string) {
  return (cause: unknown) => console.warn(`${what}:`, cause instanceof Error ? cause.message : cause);
}

/**
 * Called by the auth provider before it adopts a session. Copies kept for
 * another account, or for no known account, are removed; the same account
 * after a restart keeps them.
 */
export function setCacheOwner(userId: string | null) {
  if (userId === owner) return;
  owner = userId;
  generation += 1;
  newest.clear();
  index = null;
  void queue(async () => {
    if ((await AsyncStorage.getItem(OWNER_KEY)) === userId && userId !== null) return;
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(`${PREFIX}:`) || key.startsWith(`${PREFIX}.index:`));
    if (keys.length > 0) await AsyncStorage.multiRemove(keys);
    if (userId) await AsyncStorage.setItem(OWNER_KEY, userId);
    else await AsyncStorage.removeItem(OWNER_KEY);
  }).catch(warn('Could not clear saved copies'));
}

async function loadIndex(userId: string): Promise<Index> {
  if (index?.userId === userId) return index.entries;
  let entries: Index = {};
  try {
    const raw = await AsyncStorage.getItem(indexKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) entries = parsed as Index;
  } catch {
    // An unreadable index starts again; its copies are dropped by the next account change.
  }
  index = { userId, entries };
  return entries;
}

/** The saved copy, or undefined when there is none. A saved null (a row that was gone) is a copy too. */
function readCopy<T>(userId: string, group: CacheGroup, key: string): Promise<{ value: T } | undefined> {
  return queue(async () => {
    if (userId !== owner) return undefined;
    const raw = await AsyncStorage.getItem(entryKey(userId, group, key));
    if (!raw || userId !== owner) return undefined;
    const entry = JSON.parse(raw) as { userId?: unknown; value: T };
    return entry.userId === userId ? { value: entry.value } : undefined;
  });
}

function writeCopy(userId: string, group: CacheGroup, key: string, value: unknown, ticket: number, gen: number): Promise<void> {
  const storageKey = entryKey(userId, group, key);
  return queue(async () => {
    if (gen !== generation || userId !== owner || ticket < (newest.get(storageKey) ?? 0)) return;
    newest.set(storageKey, ticket);
    const raw = JSON.stringify({ userId, value });
    const entries = await loadIndex(userId);
    if (raw.length > MAX_ENTRY_CHARS) {
      delete entries[storageKey];
      await AsyncStorage.multiSet([[indexKey(userId), JSON.stringify(entries)]]);
      await AsyncStorage.removeItem(storageKey);
      return;
    }
    entries[storageKey] = { group, at: Date.now() };
    const dropped = Object.entries(entries)
      .filter(([, entry]) => entry.group === group)
      .sort(([, a], [, b]) => b.at - a.at)
      .slice(LIMITS[group])
      .map(([droppedKey]) => droppedKey);
    for (const droppedKey of dropped) delete entries[droppedKey];
    await AsyncStorage.multiSet([[storageKey, raw], [indexKey(userId), JSON.stringify(entries)]]);
    if (dropped.length > 0) await AsyncStorage.multiRemove(dropped);
  });
}

/**
 * Reads through the network and keeps a copy for this account. Offline, or
 * when the read fails, answers from the copy; with no copy, fails as the read did.
 */
export async function cachedRead<T>(userId: string, group: CacheGroup, key: string, load: () => Promise<T>): Promise<T> {
  const ticket = ++tickets;
  const gen = generation;
  if (isKnownOffline()) {
    const copy = await readCopy<T>(userId, group, key).catch(() => undefined);
    if (copy) {
      noteSavedCopy();
      return copy.value;
    }
  }
  let value: T;
  try {
    value = await load();
  } catch (cause) {
    const copy = await readCopy<T>(userId, group, key).catch(() => undefined);
    if (!copy) throw cause;
    noteSavedCopy();
    return copy.value;
  }
  noteNetworkRead();
  writeCopy(userId, group, key, value, ticket, gen).catch(warn('Could not keep a saved copy'));
  return value;
}

/** Drops a copy after the row was deleted, and stops any read already running from saving it again. */
export function forgetCopy(userId: string, group: CacheGroup, key: string) {
  const storageKey = entryKey(userId, group, key);
  const gen = generation;
  newest.set(storageKey, ++tickets);
  void queue(async () => {
    if (gen !== generation || userId !== owner) return;
    const entries = await loadIndex(userId);
    delete entries[storageKey];
    await AsyncStorage.multiSet([[indexKey(userId), JSON.stringify(entries)]]);
    await AsyncStorage.removeItem(storageKey);
  }).catch(warn('Could not drop a saved copy'));
}
