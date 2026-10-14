import AsyncStorage from '@react-native-async-storage/async-storage';

import { isKnownOffline, setSavedCopiesShown } from './network-status';
import { createSerialQueue } from './serial-queue';

/**
 * Saved copies of what the app reads, so debates, sources, saved results and
 * past rounds stay readable without a connection. A read goes to the network
 * first and keeps a copy of the answer; when no answer comes back from the
 * server, or the device is known to be offline, the copy answers instead. A
 * server that answers with an error (a refused session, a policy, a bad
 * request) is not a connection problem, so that error is thrown as it is.
 * Nothing is written offline: saving waits for the network, and every write
 * that succeeds updates or drops the copies it changed (`afterWrite`).
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
  /** Judged Sparring rounds per debate, and each saved round. */
  'sparring-rounds': 20,
  sparring: 40,
} as const;

export type CacheGroup = keyof typeof LIMITS;

/** A copy larger than this is not kept; web storage holds about 5 MB in all. */
const MAX_ENTRY_CHARS = 512_000;

const PREFIX = 'debatelab.cache.v1';
const OWNER_KEY = `${PREFIX}.owner`;
const indexKey = (userId: string) => `${PREFIX}.index:${userId}`;
const entryKey = (userId: string, group: CacheGroup, key: string) => `${PREFIX}:${userId}:${group}:${key}`;

type Index = Record<string, { group: CacheGroup; at: number }>;

/**
 * A read that failed. `unreachable` when no answer came back from the server:
 * no connection, a DNS failure or a timeout. Only those fall back to a copy.
 */
export class ReadError extends Error {
  constructor(message: string, readonly unreachable: boolean) {
    super(message);
    this.name = 'ReadError';
  }
}

/**
 * The error to throw for a failed Supabase read. supabase-js answers a request
 * that never reached the server with status 0, and the server's own refusals
 * (401, 403, 404, 406, 5xx) with their HTTP status.
 */
export function readFailed(error: { message: string }, status: number): ReadError {
  return new ReadError(error.message, status === 0);
}

const isUnreachable = (cause: unknown) => cause instanceof ReadError && cause.unreachable;

/**
 * The failure to throw when several queries of one read failed: a server's
 * refusal wins over a query that got no answer, so a saved copy never hides it.
 */
export function pickFailure(causes: unknown[]): unknown {
  return causes.find((cause) => !isUnreachable(cause)) ?? causes[0];
}

/**
 * Promise.all for the queries of one read. It waits for all of them, so a
 * refusal from one is thrown even when another got no answer first.
 */
export async function readAll<T extends readonly unknown[] | []>(reads: T): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }> {
  const results = await Promise.allSettled(reads);
  const failures = results.flatMap((result) => (result.status === 'rejected' ? [result.reason as unknown] : []));
  if (failures.length > 0) throw pickFailure(failures);
  return results.map((result) => (result as PromiseFulfilledResult<unknown>).value) as { -readonly [K in keyof T]: Awaited<T[K]> };
}

const queue = createSerialQueue();
// undefined until the auth provider names the first owner, so that first call always checks storage.
let owner: string | null | undefined;
// Bumped on every owner change; work started for an earlier owner never writes.
let generation = 0;
// Every read takes a ticket when it starts. A copy is only replaced by an answer
// from a read that started later, so a slow answer never overwrites a newer one.
let tickets = 0;
const newest = new Map<string, number>();
// A write that changed several keys at once stops the reads of those keys that
// started before it. Kept only while such a read is still running.
let floors: { scope: CopyScope; ticket: number }[] = [];
const running = new Set<number>();
// The copies screens are showing right now instead of the server's answer, and
// who shows each: a screen's CopyHolder, or null for a read that named none. A
// key leaves when it is read from the server again, when a write drops it, or
// when the last screen showing it lets it go.
const shown = new Map<string, { group: CacheGroup; holders: Set<CopyHolder | null> }>();
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
  floors = [];
  shown.clear();
  setSavedCopiesShown(false);
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
    try {
      if (gen !== generation || userId !== owner || ticket < (newest.get(storageKey) ?? 0)) return;
      if (floors.some((floor) => floor.ticket > ticket && inScope(userId, floor.scope, group, storageKey))) return;
      newest.set(storageKey, ticket);
      await storeEntry(userId, group, storageKey, value);
    } finally {
      settle(ticket);
    }
  });
}

/** A read is done with its ticket; floors that no running read started before are dropped. */
function settle(ticket: number) {
  running.delete(ticket);
  const oldest = running.size > 0 ? Math.min(...running) : Infinity;
  floors = floors.filter((floor) => floor.ticket > oldest);
}

/** Stores a copy and drops the group's oldest beyond its limit. Runs inside the queue. */
async function storeEntry(userId: string, group: CacheGroup, storageKey: string, value: unknown) {
  const raw = JSON.stringify({ userId, value });
  const entries = await loadIndex(userId);
  if (raw.length > MAX_ENTRY_CHARS) {
    await removeEntries(userId, [storageKey]);
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
}

/** Removes copies and their index entries. Runs inside the queue. */
async function removeEntries(userId: string, storageKeys: string[]) {
  if (storageKeys.length === 0) return;
  const entries = await loadIndex(userId);
  for (const storageKey of storageKeys) delete entries[storageKey];
  await AsyncStorage.multiSet([[indexKey(userId), JSON.stringify(entries)]]);
  await AsyncStorage.multiRemove(storageKeys);
}

/**
 * The reads of one screen, or of one part of it, so the saved copies it shows
 * stop counting once it moves on. Each load takes a `mark()` and passes it to
 * its reads; the first of them to finish lets go of what the screen's earlier
 * loads showed, and a read from an earlier load finishing late no longer
 * counts. `release()` lets go of everything, for when the screen closes or
 * stops showing that data.
 */
export class CopyHolder {
  loads = 0;
  settled = 0;
  readonly keys = new Set<string>();

  mark(): CopyMark {
    return { holder: this, load: ++this.loads };
  }

  release() {
    this.settled = ++this.loads;
    letGo(this);
    setSavedCopiesShown(shown.size > 0);
  }
}

export interface CopyMark {
  holder: CopyHolder;
  load: number;
}

function letGo(holder: CopyHolder) {
  for (const storageKey of holder.keys) {
    const entry = shown.get(storageKey);
    entry?.holders.delete(holder);
    if (entry?.holders.size === 0) shown.delete(storageKey);
  }
  holder.keys.clear();
}

/** Whether a finished read of this load still counts for its screen; a newer load first lets go of the older ones' copies. */
function settleMark({ holder, load }: CopyMark): boolean {
  if (load < holder.settled) return false;
  if (load > holder.settled) {
    holder.settled = load;
    letGo(holder);
  }
  return true;
}

function noteShown(storageKey: string, group: CacheGroup, fromCopy: boolean, mark: CopyMark | undefined) {
  const counts = !mark || settleMark(mark);
  if (!fromCopy) shown.delete(storageKey);
  else if (counts) {
    const holder = mark?.holder ?? null;
    const entry = shown.get(storageKey) ?? { group, holders: new Set<CopyHolder | null>() };
    entry.holders.add(holder);
    shown.set(storageKey, entry);
    holder?.keys.add(storageKey);
  }
  setSavedCopiesShown(shown.size > 0);
}

/**
 * Reads through the network and keeps a copy for this account. Offline, or
 * when no answer came back from the server, answers from the copy; with no
 * copy, or when the server answered with an error, fails as the read did.
 * A screen passes its load's `mark` so a copy it shows stops counting once it moves on.
 */
export async function cachedRead<T>(userId: string, group: CacheGroup, key: string, load: () => Promise<T>, mark?: CopyMark): Promise<T> {
  const ticket = ++tickets;
  const gen = generation;
  const storageKey = entryKey(userId, group, key);
  running.add(ticket);
  if (isKnownOffline()) {
    const copy = await readCopy<T>(userId, group, key).catch(() => undefined);
    if (copy) {
      settle(ticket);
      if (gen === generation) noteShown(storageKey, group, true, mark);
      return copy.value;
    }
  }
  let value: T;
  try {
    value = await load();
  } catch (cause) {
    settle(ticket);
    if (!isUnreachable(cause)) throw cause;
    const copy = await readCopy<T>(userId, group, key).catch(() => undefined);
    if (!copy) throw cause;
    if (gen === generation) noteShown(storageKey, group, true, mark);
    return copy.value;
  }
  if (gen === generation) noteShown(storageKey, group, false, mark);
  writeCopy(userId, group, key, value, ticket, gen).catch(warn('Could not keep a saved copy'));
  return value;
}

/**
 * The copies a write changed: one `key`, or every key of the group that starts
 * with `prefix` and names the id `about` (a debate, `one-off` or a row), or
 * the whole group.
 */
export interface CopyScope {
  group: CacheGroup;
  key?: string;
  prefix?: string;
  about?: string;
}

const keyOf = (userId: string, group: CacheGroup, storageKey: string) => storageKey.slice(entryKey(userId, group, '').length);

function inScope(userId: string, scope: CopyScope, group: CacheGroup, storageKey: string): boolean {
  if (scope.group !== group) return false;
  const key = keyOf(userId, group, storageKey);
  if (scope.key !== undefined) return key === scope.key;
  return (!scope.prefix || key.startsWith(scope.prefix)) && (!scope.about || key.split(/[:,]/).includes(scope.about));
}

/**
 * Called after a write succeeded. Drops the copies it changed, so an offline
 * restart cannot show what was there before, and stops every read that
 * started before the write from saving its older answer.
 */
export function afterWrite(userId: string, scopes: CopyScope[]) {
  const gen = generation;
  if (userId !== owner) return;
  const ticket = ++tickets;
  for (const scope of scopes) {
    if (scope.key !== undefined) newest.set(entryKey(userId, scope.group, scope.key), ticket);
    else if (running.size > 0) floors.push({ scope, ticket });
  }
  for (const [storageKey, { group }] of shown) {
    if (scopes.some((scope) => inScope(userId, scope, group, storageKey))) shown.delete(storageKey);
  }
  setSavedCopiesShown(shown.size > 0);
  void queue(async () => {
    if (gen !== generation || userId !== owner) return;
    const entries = await loadIndex(userId);
    const dropped = Object.entries(entries)
      .filter(([storageKey, entry]) => scopes.some((scope) => inScope(userId, scope, entry.group, storageKey)))
      .map(([storageKey]) => storageKey);
    await removeEntries(userId, dropped);
  }).catch(warn('Could not drop saved copies'));
}

/**
 * Called after a write succeeded when the new value of one copy is known:
 * `update` gets the copy (undefined when there is none) and returns its
 * replacement, or undefined to drop it. Reads that started before this call
 * cannot save over it.
 */
export function updateCopy<T>(userId: string, group: CacheGroup, key: string, update: (copy: T | undefined) => T | undefined) {
  const storageKey = entryKey(userId, group, key);
  const gen = generation;
  if (userId !== owner) return;
  newest.set(storageKey, ++tickets);
  void queue(async () => {
    if (gen !== generation || userId !== owner) return;
    const raw = await AsyncStorage.getItem(storageKey);
    const entry = raw ? (JSON.parse(raw) as { userId?: unknown; value: T }) : null;
    const next = update(entry?.userId === userId ? entry.value : undefined);
    if (next === undefined) await removeEntries(userId, [storageKey]);
    else await storeEntry(userId, group, storageKey, next);
  }).catch(warn('Could not update a saved copy'));
}

