import { normalizeFolder } from '@debatelab/core/library';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

import { isKnownOffline } from './network-status';
import { copiesWritten, ReadError, updateCopy } from './offline-cache';
import { createSerialQueue } from './serial-queue';
import {
  addSource,
  DuplicateSourceError,
  fetchSource,
  fetchSources,
  notifySourcesChanged,
  setSourcesActive,
  updateSource,
  type Source,
  type SourcePatch,
  type SourceType,
} from './sources';
import { supabase } from './supabase';

/**
 * The writes that wait for the connection: new notes, source edits (title,
 * type, origin, text, folder) and Active switches. Every one of them goes
 * through this queue, online too, so they reach the server one at a time in
 * the order the student made them. A write that gets no answer from the
 * server (supabase-js status 0, or the device is offline) stays queued and is
 * sent again when the connection returns, when the app comes to the
 * foreground, or on launch. A write the server refuses (a policy, an expired
 * session, a bad request) is dropped: the caller still waiting gets the error,
 * and a replay nobody waits for is reported once (`subscribeQueueReports`).
 *
 * The queue belongs to one account, as the saved copies do: it is stored under
 * the user id, and every other account's queue is removed when the owner
 * changes, including signing out. Deletes, AI and every other write stay
 * online-only.
 */

/** A new note gets this id until it reaches the server; the row is then inserted with the id after the prefix. */
const LOCAL_PREFIX = 'local:';

export const isLocalSourceId = (id: string) => id.startsWith(LOCAL_PREFIX);

const PREFIX = 'debatelab.writes.v1';
const storageKey = (userId: string) => `${PREFIX}:${userId}`;

export type WriteStatus = 'saved' | 'queued';

/** What an offline note can carry; the Library's note sheet sets only some of it. */
export interface QueuedNoteInput {
  title: string;
  content: string;
  type: SourceType;
  origin?: string | null;
  debateId: string;
  folder?: string;
  isActive?: boolean;
}

/** Edits never carry the Active switch: that has its own writes, in their own order. */
export type QueuedPatch = Omit<SourcePatch, 'isActive'>;

interface Base {
  key: string;
  at: number;
  /** Got no answer once, or was made while others waited: the student sees it as waiting to sync. */
  waiting: boolean;
}
export interface QueuedAdd extends Base {
  kind: 'add';
  tempId: string;
  input: Required<Omit<QueuedNoteInput, 'origin'>> & { origin: string | null };
}
export interface QueuedEdit extends Base {
  kind: 'edit';
  debateId: string;
  sourceId: string;
  patch: QueuedPatch;
}
export interface QueuedActive extends Base {
  kind: 'active';
  debateId: string;
  ids: string[];
  isActive: boolean;
}
export type QueuedWrite = QueuedAdd | QueuedEdit | QueuedActive;

/** What screens draw from: the queue of one account and the notes that reached the server this session. */
export interface QueueSnapshot {
  owner: string | null | undefined;
  items: readonly QueuedWrite[];
  /** A synced note's temporary id, and the row the server saved. */
  synced: ReadonlyMap<string, Source>;
}

/** After a replay that nobody was waiting for: how many writes reached the server, and the ones it refused. */
export interface QueueReport {
  synced: number;
  dropped: { kind: QueuedWrite['kind']; title?: string }[];
}

interface Waiter {
  resolve: (status: WriteStatus) => void;
  reject: (cause: unknown) => void;
}

const storage = createSerialQueue();
// undefined until the first account is named, by the root layout or by a first write.
let owner: string | null | undefined;
let generation = 0;
let ready: Promise<void> = Promise.resolve();
let items: QueuedWrite[] = [];
/**
 * What the saved copies showed before the changes still queued for each source, field by
 * field (the earliest value only). A refused change puts these back with no network needed;
 * a saved one forgets them. Kept on the phone with the queue.
 */
type Restorable = Partial<Pick<Source, 'title' | 'content' | 'type' | 'origin' | 'folder' | 'isActive'>>;
type RestorableField = keyof Restorable;
let before: Record<string, Restorable> = {};
let synced = new Map<string, Source>();
let waiters = new Map<string, Waiter[]>();
let inFlight: string | null = null;
let snapshot: QueueSnapshot = { owner, items, synced };
let running: Promise<void> | null = null;
// While Clear all asks the server, nothing replays: a queued note must not land in a Library being cleared.
let paused = 0;
// Whether this account's stored queue has been read. Until it has, nothing is written over it.
let hydrated = false;
// Writes that wait for the connection, told "queued" once the save holding them has been tried.
let awaitingSave: { key: string; waiter: Waiter }[] = [];
// Saving the queue failed and has not worked since: the student has been told once.
let storageTroubled = false;
let retrySave: ReturnType<typeof setTimeout> | undefined;
const storageListeners = new Set<() => void>();

/** Called once when the queue could not be saved on the phone: changes then last only while the app is open. */
export function subscribeStorageTrouble(listener: () => void): () => void {
  storageListeners.add(listener);
  return () => {
    storageListeners.delete(listener);
  };
}
let again = false;
let keys = 0;

const listeners = new Set<() => void>();
const reportListeners = new Set<(report: QueueReport) => void>();

function warn(what: string) {
  return (cause: unknown) => console.warn(`${what}:`, cause instanceof Error ? cause.message : cause);
}

function emit() {
  snapshot = { owner, items, synced };
  listeners.forEach((listener) => listener());
}

export function subscribeQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getQueueSnapshot(): QueueSnapshot {
  return snapshot;
}

export function subscribeQueueReports(listener: (report: QueueReport) => void): () => void {
  reportListeners.add(listener);
  return () => {
    reportListeners.delete(listener);
  };
}

/** Saves the queue; resolves whether the phone kept it. */
function persist(): Promise<boolean> {
  const userId = owner;
  const gen = generation;
  const saved = items.map((item) => ({ ...item }));
  const savedBefore = { ...before };
  const confirming = awaitingSave;
  awaitingSave = [];
  if (!userId) return Promise.resolve(true);
  return storage(async () => {
    if (gen !== generation) return;
    // A stored queue that could not be read is never written over: it may hold unsynced work.
    if (!hydrated) throw new Error('The offline changes on this phone could not be read.');
    const write = () =>
      saved.length === 0
        ? AsyncStorage.removeItem(storageKey(userId))
        : AsyncStorage.setItem(storageKey(userId), JSON.stringify({ userId, items: saved, before: savedBefore }));
    // One retry for a passing storage error before anyone hears the change was not kept.
    await write().catch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      await write();
    });
  }).then(
    () => {
      const recovered = storageTroubled;
      storageTroubled = false;
      confirming.forEach(({ waiter }) => waiter.resolve('queued'));
      // Sending waited while the queue could not be stored; it can go on now.
      if (recovered && gen === generation) void replayOfflineQueue();
      return true;
    },
    (cause: unknown) => {
      warn('Could not keep the offline changes')(cause);
      // The changes stay queued and still sync once the phone can store them; until then nothing is
      // sent (a sent change could not be retired) and new writes are refused (adopt).
      confirming.forEach(({ waiter }) => waiter.resolve('queued'));
      if (gen !== generation || !hydrated) return false;
      // Told after the caller's own "saved on this phone" message, and for every change made meanwhile.
      if (!storageTroubled || confirming.length > 0) setTimeout(() => storageListeners.forEach((listener) => listener()), 0);
      storageTroubled = true;
      clearTimeout(retrySave);
      retrySave = setTimeout(() => {
        if (gen === generation) void persist();
      }, 5000);
      return false;
    },
  );
}

function parse(raw: string | null, userId: string): { items: QueuedWrite[]; before: Record<string, Restorable> } {
  const none = { items: [], before: {} };
  if (!raw) return none;
  try {
    const parsed = JSON.parse(raw) as { userId?: unknown; items?: unknown; before?: unknown };
    if (parsed.userId !== userId || !Array.isArray(parsed.items)) return none;
    return {
      items: (parsed.items as QueuedWrite[]).filter((item) => item && (item.kind === 'add' || item.kind === 'edit' || item.kind === 'active')),
      before: parsed.before && typeof parsed.before === 'object' && !Array.isArray(parsed.before) ? (parsed.before as Record<string, Restorable>) : {},
    };
  } catch {
    return none;
  }
}

/**
 * Reads the account's stored queue, once more after a passing failure. Writes from an earlier
 * launch go ahead of any made since; until a read succeeds nothing is written over the store.
 */
async function hydrate(userId: string, gen: number) {
  let raw: string | null;
  try {
    raw = await AsyncStorage.getItem(storageKey(userId)).catch(async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return AsyncStorage.getItem(storageKey(userId));
    });
  } catch (cause) {
    warn('Could not read the offline changes')(cause);
    return;
  }
  if (gen !== generation) return;
  const loaded = parse(raw, userId);
  hydrated = true;
  if (loaded.items.length === 0) return;
  // Nobody waits for writes from an earlier launch: they show as waiting until they sync.
  const known = new Set(items.map((item) => item.key));
  items = [...loaded.items.filter((item) => !known.has(item.key)).map((item) => ({ ...item, waiting: true })), ...items];
  before = { ...loaded.before, ...before };
  emit();
}

/**
 * Called with the signed-in account once auth has settled. Another account's
 * queue, or one left with no account, is removed; the same account after a
 * restart keeps its queue and sends it again.
 */
export function setQueueOwner(userId: string | null) {
  if (userId === owner) return;
  owner = userId;
  generation += 1;
  const gen = generation;
  const orphaned = waiters;
  waiters = new Map();
  orphaned.forEach((list) => list.forEach((waiter) => waiter.reject(new Error('The account changed before this change was saved.'))));
  items = [];
  before = {};
  synced = new Map();
  inFlight = null;
  emit();
  hydrated = false;
  awaitingSave = [];
  storageTroubled = false;
  clearTimeout(retrySave);
  ready = storage(async () => {
    const stale = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(`${PREFIX}:`) && (userId === null || key !== storageKey(userId)));
    if (stale.length > 0) await AsyncStorage.multiRemove(stale);
    if (!userId) return;
    await hydrate(userId, gen);
  }).catch(warn('Could not read the offline changes'));
}

/** A first write before the root layout named the owner adopts its account; a write for another account is refused. */
async function adopt(userId: string) {
  if (owner === undefined) setQueueOwner(userId);
  else if (owner !== userId) throw new Error('This change belongs to another account.');
  await ready;
  if (owner !== userId) throw new Error('This change belongs to another account.');
  // The stored queue could not be read at launch: read it again before any write, online ones too,
  // so nothing goes ahead of older unsynced work and nothing is written over it.
  if (!hydrated) {
    const gen = generation;
    ready = storage(() => hydrate(userId, gen)).catch(warn('Could not read the offline changes'));
    await ready;
    if (owner !== userId) throw new Error('This change belongs to another account.');
    if (!hydrated) throw new Error('The changes saved on this phone could not be read. Try again.');
  }
  // The phone cannot store the queue right now: a new change could not be kept, nor a sent one retired.
  if (storageTroubled) throw new Error('Changes cannot be saved on this phone right now. Try again.');
}

const isWaitingForNetwork = () => isKnownOffline() || items.some((item) => item.waiting);

function attach(key: string, waiter: Waiter, waiting: boolean) {
  if (waiting) {
    // Told "queued" once the queue holding it is saved (persist), never before.
    awaitingSave.push({ key, waiter });
    return;
  }
  waiters.set(key, [...(waiters.get(key) ?? []), waiter]);
}

function takeWaiters(key: string): Waiter[] {
  const list = waiters.get(key) ?? [];
  waiters.delete(key);
  return list;
}

/** Every write still queued waits for the connection; whoever waited for one hears that it is kept. */
function parkAll() {
  if (items.length === 0) return;
  items = items.map((item) => (item.waiting ? item : { ...item, waiting: true }));
  const parked = waiters;
  waiters = new Map();
  parked.forEach((list, key) => list.forEach((waiter) => awaitingSave.push({ key, waiter })));
  persist();
  emit();
}

function commit(next: QueuedWrite[]) {
  items = next;
  persist();
  emit();
  void replayOfflineQueue();
}

const newKey = () => `${Date.now().toString(36)}-${++keys}`;
const pendingAdd = (id: string) => items.find((item): item is QueuedAdd => item.kind === 'add' && item.tempId === id && item.key !== inFlight);
/** A synced note's temporary id names its row from then on. */
const realIdOf = (id: string) => synced.get(id)?.id ?? id;
/** A temporary id with no note behind it any more (deleted or refused) never reaches a query. */
const isGone = (id: string) => isLocalSourceId(id) && !items.some((item) => item.kind === 'add' && item.tempId === id);
const goneError = () => new Error('This note was not saved.');

/** The note as the Library shows it while it waits. */
function sourceOfAdd(item: QueuedAdd): Source {
  return {
    id: item.tempId,
    title: item.input.title,
    content: item.input.content,
    type: item.input.type,
    origin: item.input.origin,
    createdAt: item.at,
    useCount: 0,
    folder: item.input.folder,
    isActive: item.input.isActive,
    debateId: item.input.debateId,
    metadata: null,
  };
}

/** A patch applied the way updateSource writes it: blank title or text is ignored. */
function applyPatch<T extends Pick<Source, 'title' | 'content' | 'type' | 'origin' | 'folder'>>(source: T, patch: QueuedPatch): T {
  const next = { ...source };
  if (patch.title !== undefined && patch.title.trim()) next.title = patch.title.trim();
  if (patch.content !== undefined && patch.content.trim()) next.content = patch.content.trim();
  if (patch.type !== undefined) next.type = patch.type;
  if (patch.origin !== undefined) next.origin = patch.origin?.trim() || null;
  if (patch.folder !== undefined) next.folder = normalizeFolder(patch.folder);
  return next;
}

/** The offline copies show a queued change after a restart too. */
function updateSourceCopies(userId: string, debateId: string, ids: string[], change: (source: Source) => Source, remember: RestorableField[] = []) {
  const gen = generation;
  // The copy as it was, for each field not yet remembered for that source (see `before`).
  const keep = (source: Source) => {
    if (remember.length === 0 || isLocalSourceId(source.id) || gen !== generation) return source;
    const held: Restorable = { ...before[source.id] };
    let added = false;
    for (const field of remember) {
      if (field in held) continue;
      (held as Record<string, unknown>)[field] = source[field];
      added = true;
    }
    if (added) {
      before = { ...before, [source.id]: held };
      persist();
    }
    return source;
  };
  updateCopy<Source[]>(userId, 'sources', debateId, (list) => list?.map((source) => (ids.includes(source.id) ? change(keep(source)) : source)));
  for (const id of ids) {
    if (isLocalSourceId(id)) continue;
    // A saved null (a row that was gone) stays as it is.
    updateCopy<Source | null>(userId, 'source', id, (copy) => (copy ? change(keep(copy)) : copy === null ? null : undefined));
  }
}

/** The values a write saved for one source, as the server stores them (updateSource and setSourcesActive). */
function savedValues(item: QueuedWrite, id: string): Restorable {
  if (item.kind === 'active') return item.ids.includes(id) ? { isActive: item.isActive } : {};
  if (item.kind !== 'edit' || item.sourceId !== id) return {};
  const values: Restorable = {};
  const { title, content, type, origin, folder } = item.patch;
  if (title !== undefined && title.trim()) values.title = title.trim();
  if (content !== undefined && content.trim()) values.content = content.trim();
  if (type !== undefined) values.type = type;
  if (origin !== undefined) values.origin = origin?.trim() || null;
  if (folder !== undefined) values.folder = normalizeFolder(folder);
  return values;
}

/** The fields a write changes for each source it names. */
function touched(item: QueuedWrite): { id: string; fields: RestorableField[] }[] {
  if (item.kind === 'edit') return [{ id: item.sourceId, fields: Object.keys(item.patch) as RestorableField[] }];
  if (item.kind === 'active') return item.ids.map((id) => ({ id, fields: ['isActive'] }));
  return [];
}

/**
 * Settles what `before` holds for a write that left the queue: a refused one puts those
 * values back into the copies, unless a write still queued changes the same field (that
 * newer value is what shows); either way the fields no queued write touches are forgotten.
 */
function settleBefore(userId: string, item: QueuedWrite, refused: boolean) {
  const debateId = item.kind === 'add' ? item.input.debateId : item.debateId;
  let next = before;
  for (const { id, fields } of touched(item)) {
    const held = next[id];
    if (!held) continue;
    const stillQueued = new Set(items.flatMap((other) => touched(other).filter((one) => one.id === id).flatMap((one) => one.fields)));
    if (!refused) {
      // A saved write is the server's value now: a newer queued write that is refused goes back to it.
      const saved = savedValues(item, id);
      const advanced: Restorable = { ...held };
      for (const field of fields) if (stillQueued.has(field) && field in saved) (advanced as Record<string, unknown>)[field] = saved[field];
      next = { ...next, [id]: advanced };
    }
    const free = fields.filter((field) => field in held && !stillQueued.has(field));
    if (free.length === 0) continue;
    if (refused) {
      const restore = Object.fromEntries(free.map((field) => [field, held[field]])) as Restorable;
      updateSourceCopies(userId, debateId, [id], (source) => ({ ...source, ...restore }));
    }
    const current = next[id] ?? held;
    const left = Object.fromEntries(Object.entries(current).filter(([field]) => !free.includes(field as RestorableField))) as Restorable;
    next = { ...next };
    if (Object.keys(left).length > 0) next[id] = left;
    else delete next[id];
  }
  before = next;
}

/**
 * Saves a note to a debate, as addSource does. It shows at once; offline, or
 * when the server gives no answer, it waits under a temporary id and the row
 * is added once the connection is back.
 */
export async function queueAddSource(userId: string, input: QueuedNoteInput): Promise<{ status: WriteStatus; source: Source }> {
  await adopt(userId);
  const item: QueuedAdd = {
    kind: 'add',
    key: newKey(),
    at: Date.now(),
    waiting: isWaitingForNetwork(),
    tempId: `${LOCAL_PREFIX}${Crypto.randomUUID()}`,
    input: {
      title: input.title,
      content: input.content,
      type: input.type,
      origin: input.origin || null,
      debateId: input.debateId,
      folder: normalizeFolder(input.folder),
      isActive: input.isActive ?? true,
    },
  };
  const pending = sourceOfAdd(item);
  updateCopy<Source[]>(userId, 'sources', input.debateId, (list) => list && [pending, ...list.filter((source) => source.id !== pending.id)]);
  const status = new Promise<WriteStatus>((resolve, reject) => attach(item.key, { resolve, reject }, item.waiting));
  commit([...items, item]);
  const result = await status;
  return { status: result, source: (result === 'saved' && synced.get(item.tempId)) || pending };
}

/**
 * Saves the fields the student edited, as updateSource does. Several edits of
 * one source that have not been sent yet become one; an edit of a note that is
 * still waiting goes into the note itself.
 */
export async function queueUpdateSource(userId: string, debateId: string, sourceId: string, patch: QueuedPatch): Promise<WriteStatus> {
  const fields: QueuedPatch = {};
  for (const field of ['title', 'content', 'type', 'origin', 'folder'] as const) {
    if (patch[field] !== undefined) (fields as Record<string, unknown>)[field] = patch[field];
  }
  if (Object.keys(fields).length === 0) return 'saved';
  await adopt(userId);
  const id = realIdOf(sourceId);
  if (isGone(id)) throw goneError();
  updateSourceCopies(userId, debateId, [id], (source) => applyPatch(source, fields), Object.keys(fields) as RestorableField[]);
  return new Promise<WriteStatus>((resolve, reject) => {
    const waiter = { resolve, reject };
    const add = pendingAdd(id);
    if (add) {
      const input = applyPatch({ ...add.input }, fields);
      attach(add.key, waiter, add.waiting);
      commit(items.map((item) => (item === add ? { ...add, input } : item)));
      return;
    }
    const earlier = items.find((item): item is QueuedEdit => item.kind === 'edit' && item.sourceId === id && item.key !== inFlight);
    if (earlier) {
      attach(earlier.key, waiter, earlier.waiting);
      commit(items.map((item) => (item === earlier ? { ...earlier, patch: { ...earlier.patch, ...fields } } : item)));
      return;
    }
    const edit: QueuedEdit = { kind: 'edit', key: newKey(), at: Date.now(), waiting: isWaitingForNetwork(), debateId, sourceId: id, patch: fields };
    attach(edit.key, waiter, edit.waiting);
    commit([...items, edit]);
  });
}

/**
 * Turns sources on or off, as setSourcesActive does. A newer switch of a
 * source replaces the ones not sent yet; a note still waiting takes the value itself.
 */
export async function queueSetSourcesActive(userId: string, debateId: string, sourceIds: string[], isActive: boolean): Promise<WriteStatus> {
  if (sourceIds.length === 0) return 'saved';
  await adopt(userId);
  const ids = Array.from(new Set(sourceIds.map(realIdOf))).filter((id) => !isGone(id));
  if (ids.length === 0) throw goneError();
  updateSourceCopies(userId, debateId, ids, (source) => ({ ...source, isActive }), ['isActive']);
  return new Promise<WriteStatus>((resolve, reject) => {
    const waiter = { resolve, reject };
    const inherited: Waiter[] = [];
    // Earlier switches of the same sources that are not on their way yet are replaced by this one.
    let next = items.flatMap((item): QueuedWrite[] => {
      if (item.kind !== 'active' || item.key === inFlight || !item.ids.some((id) => ids.includes(id))) return [item];
      const left = item.ids.filter((id) => !ids.includes(id));
      if (left.length > 0) return [{ ...item, ids: left }];
      inherited.push(...takeWaiters(item.key));
      return [];
    });
    // A note that has not been sent yet is saved with the value.
    const folded: QueuedAdd[] = [];
    next = next.map((item) => {
      if (item.kind !== 'add' || item.key === inFlight || !ids.includes(item.tempId)) return item;
      const changed = { ...item, input: { ...item.input, isActive } };
      folded.push(changed);
      return changed;
    });
    const rest = ids.filter((id) => !folded.some((add) => add.tempId === id));
    items = next;
    if (rest.length === 0) {
      // Every source was a waiting note: the note's own write answers for the switch.
      const add = folded[0];
      for (const one of [waiter, ...inherited]) attach(add.key, one, add.waiting);
      commit(items);
      return;
    }
    const active: QueuedActive = { kind: 'active', key: newKey(), at: Date.now(), waiting: isWaitingForNetwork(), debateId, ids: rest, isActive };
    for (const one of [waiter, ...inherited]) attach(active.key, one, active.waiting);
    commit([...items, active]);
  });
}

/**
 * Clear all for a debate: lets a replay that is running finish and holds the queue while `clear`
 * asks the server; only once it succeeds are the debate's queued writes (its waiting notes, edits
 * and switches) dropped, so none comes back. A clear that fails keeps them, and the queue resumes.
 */
export async function clearQueuedDebate(userId: string, debateId: string, clear: () => Promise<void>): Promise<void> {
  await adopt(userId);
  paused += 1;
  try {
    if (running) await running.catch(() => undefined);
    await clear();
    if (owner === userId) dropDebateWrites(userId, debateId);
  } finally {
    paused -= 1;
    void replayOfflineQueue();
  }
}

function dropDebateWrites(userId: string, debateId: string) {
  const debateOf = (item: QueuedWrite) => (item.kind === 'add' ? item.input.debateId : item.debateId);
  const dropped = items.filter((item) => debateOf(item) === debateId);
  if (dropped.length === 0) return;
  items = items.filter((item) => debateOf(item) !== debateId);
  const forgotten = new Set(dropped.flatMap((item) => touched(item).map((one) => one.id)));
  before = Object.fromEntries(Object.entries(before).filter(([id]) => !forgotten.has(id)));
  updateCopy<Source[]>(userId, 'sources', debateId, (list) => list?.filter((source) => !isLocalSourceId(source.id)));
  dropped.forEach((item) => takeWaiters(item.key).forEach((waiter) => waiter.reject(new Error('The Library was cleared before this change was saved.'))));
  persist();
  emit();
}

/**
 * Removes a note that has not reached the server, as deleting it does. False
 * while the note is on its way: the caller asks again once it has synced.
 */
export function cancelQueuedSource(userId: string, tempId: string): boolean {
  if (owner !== userId) return false;
  const add = pendingAdd(tempId);
  if (!add) return false;
  const removed = dropWrites(tempId, add.key);
  updateCopy<Source[]>(userId, 'sources', add.input.debateId, (list) => list?.filter((source) => source.id !== tempId));
  removed.forEach((key) => takeWaiters(key).forEach((waiter) => waiter.reject(new Error('The note was deleted before it was saved.'))));
  persist();
  emit();
  return true;
}

/** Drops a note's write and every queued change to it; returns the keys of the writes that went. */
function dropWrites(tempId: string, addKey: string): string[] {
  const removed: string[] = [addKey];
  items = items.flatMap((item): QueuedWrite[] => {
    if (item.key === addKey || (item.kind === 'edit' && item.sourceId === tempId)) {
      if (item.key !== addKey) removed.push(item.key);
      return [];
    }
    if (item.kind === 'active' && item.ids.includes(tempId)) {
      const left = item.ids.filter((id) => id !== tempId);
      if (left.length > 0) return [{ ...item, ids: left }];
      removed.push(item.key);
      return [];
    }
    return [item];
  });
  return removed;
}

/**
 * Puts the server's version back into the saved copies a refused write changed when it was queued
 * (updateSourceCopies). The list copy is read again rather than dropped, so notes still waiting stay
 * visible offline (they show over it from the queue). A refused new note leaves the list copy.
 */
async function restoreRefused(userId: string, item: QueuedWrite): Promise<void> {
  const debateId = item.kind === 'add' ? item.input.debateId : item.debateId;
  if (item.kind === 'add') {
    updateCopy<Source[]>(userId, 'sources', debateId, (list) => list?.filter((source) => source.id !== item.tempId));
  }
  const ids = (item.kind === 'edit' ? [item.sourceId] : item.kind === 'active' ? item.ids : []).filter((id) => !isLocalSourceId(id));
  // A read that fails keeps the copy it had; the next read online replaces it.
  await Promise.all([fetchSources(userId, debateId), ...ids.map((id) => fetchSource(userId, id))]).catch(() => undefined);
}

/** Whether no answer came back from the server: those writes stay queued. */
function unanswered(cause: unknown): boolean {
  return cause instanceof ReadError && cause.unreachable;
}

/** Sends one write through the function the online path uses. A note returns its saved row. */
async function send(userId: string, item: QueuedWrite): Promise<Source | undefined> {
  if (item.kind === 'edit') {
    await updateSource(userId, item.debateId, item.sourceId, item.patch);
    return undefined;
  }
  if (item.kind === 'active') {
    await setSourcesActive(userId, item.debateId, item.ids, item.isActive);
    return undefined;
  }
  const id = item.tempId.slice(LOCAL_PREFIX.length);
  try {
    // The row gets the id after the prefix, so a note whose answer was lost is not added twice.
    return await addSource(userId, { ...item.input, id, createdAt: item.at });
  } catch (cause) {
    if (!(cause instanceof DuplicateSourceError)) throw cause;
    const existing = await fetchSource(userId, id);
    if (existing?.id !== id) throw cause;
    // The insert reached the server but its answer did not. Changes made since were folded into this
    // note, so the saved row may predate them: save the fields that differ before calling it synced.
    const { input } = item;
    const patch: SourcePatch = {};
    if (existing.title !== input.title) patch.title = input.title;
    if (existing.content !== input.content) patch.content = input.content;
    if (existing.type !== input.type) patch.type = input.type;
    if ((existing.origin ?? null) !== input.origin) patch.origin = input.origin;
    if (existing.folder !== input.folder) patch.folder = input.folder;
    if (existing.isActive !== input.isActive) patch.isActive = input.isActive;
    let saved = existing;
    if (Object.keys(patch).length > 0) {
      await updateSource(userId, input.debateId, id, patch);
      saved = { ...existing, ...patch };
    }
    // This path skips addSource's refresh of the saved copies, which still hold the note under its
    // temporary id: they take the row, once, so the note opens and edits offline after a restart.
    // A patch above drops the saved list (updateSource), so the list is also read back from the
    // server, which just answered; if that read fails, the swap keeps whatever list was saved.
    updateCopy<Source[]>(userId, 'sources', input.debateId, (list) => list && [saved, ...list.filter((source) => source.id !== item.tempId && source.id !== id)]);
    updateCopy<Source | null>(userId, 'source', id, () => saved);
    await fetchSources(userId, input.debateId).catch(() => undefined);
    notifySourcesChanged();
    return saved;
  }
}

/** The account's session, refreshed when it has expired, so a replay never goes out with a stale token. */
async function signedInAs(userId: string): Promise<boolean> {
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user.id === userId;
  } catch {
    return false;
  }
}

function describe(item: QueuedWrite): QueueReport['dropped'][number] {
  if (item.kind === 'add') return { kind: 'add', title: item.input.title };
  if (item.kind === 'edit') return { kind: 'edit', title: item.patch.title };
  return { kind: 'active' };
}

async function drain() {
  const userId = owner;
  const gen = generation;
  if (!userId || paused > 0 || storageTroubled) return;
  await ready;
  if (gen !== generation || items.length === 0 || paused > 0 || storageTroubled) return;
  if (isKnownOffline() || !(await signedInAs(userId))) {
    if (gen === generation) parkAll();
    return;
  }
  const report: QueueReport = { synced: 0, dropped: [] };
  while (gen === generation && items.length > 0) {
    if (isKnownOffline()) {
      parkAll();
      break;
    }
    const item = items[0];
    inFlight = item.key;
    let row: Source | undefined;
    let failure: { cause: unknown } | null = null;
    try {
      row = await send(userId, item);
    } catch (cause) {
      failure = { cause };
    }
    if (gen !== generation) return;
    inFlight = null;
    if (failure && unanswered(failure.cause)) {
      parkAll();
      break;
    }
    const done = takeWaiters(item.key);
    items = items.filter((other) => other.key !== item.key);
    if (!failure) {
      if (item.kind === 'add' && row) {
        synced = new Map(synced).set(item.tempId, row);
        const realId = row.id;
        // Changes queued while the note was on its way now name its row.
        items = items.map((other) => {
          if (other.kind === 'edit' && other.sourceId === item.tempId) return { ...other, sourceId: realId };
          if (other.kind === 'active' && other.ids.includes(item.tempId)) return { ...other, ids: other.ids.map((id) => (id === item.tempId ? realId : id)) };
          return other;
        });
      }
      persist();
      emit();
      done.forEach((waiter) => waiter.resolve('saved'));
      if (done.length === 0) report.synced += 1;
      // What a refused newer change goes back to is noted while the copies update, which may still be running.
      await copiesWritten();
      if (gen !== generation) break;
      settleBefore(userId, item, false);
      // A sent change the phone cannot retire would be sent again after a relaunch: stop until it can.
      if (!(await persist())) break;
    } else {
      console.warn('The server refused an offline change:', failure.cause instanceof Error ? failure.cause.message : failure.cause);
      const dependents = item.kind === 'add' ? dropWrites(item.tempId, item.key).slice(1) : [];
      const all = [...done, ...dependents.flatMap(takeWaiters)];
      persist();
      emit();
      all.forEach((waiter) => waiter.reject(failure.cause));
      if (done.length === 0) report.dropped.push(describe(item));
      // The saved copies still hold the refused change: put back what they showed before it,
      // which needs no network, then read the server's version over that when it answers.
      // Every other queued write stays visible; screens that showed the change read it again.
      // The values to put back are noted while the copies update, which may still be running.
      await copiesWritten();
      if (gen !== generation) break;
      settleBefore(userId, item, true);
      persist();
      await restoreRefused(userId, item);
      notifySourcesChanged();
    }
  }
  if (gen === generation && (report.synced > 0 || report.dropped.length > 0)) reportListeners.forEach((listener) => listener(report));
}

/**
 * Sends the queued writes, one at a time and in order. Called when the
 * connection returns, the app comes to the foreground, the account is known
 * at launch, and after every new write; a call while a replay runs makes it go round once more.
 */
export function replayOfflineQueue(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await drain().catch(warn('Could not send the offline changes'));
        // A trigger that came in meanwhile (the connection is back, a new write) gets one more pass.
      } while (again);
    } finally {
      // In the same tick as the last check of `again`, so no trigger falls between them.
      running = null;
    }
  })();
  return running;
}

/** One debate's sources with the queued changes on top: waiting notes first, then edits and switches in order. */
export function withQueuedWrites(state: QueueSnapshot, debateId: string, sources: Source[]): Source[] {
  if (state.items.length === 0) return sources;
  let next = sources;
  for (const item of state.items) {
    if (item.kind === 'add') {
      if (item.input.debateId !== debateId || next.some((source) => source.id === item.tempId || source.id === state.synced.get(item.tempId)?.id)) continue;
      next = [sourceOfAdd(item), ...next];
    } else if (item.debateId === debateId) {
      next = next.map((source) => applyItem(item, source));
    }
  }
  return next;
}

function applyItem(item: QueuedEdit | QueuedActive, source: Source): Source {
  if (item.kind === 'edit') return item.sourceId === source.id ? applyPatch(source, item.patch) : source;
  return item.ids.includes(source.id) ? { ...source, isActive: item.isActive } : source;
}

/** One source with its queued changes on top. */
export function withQueuedWrite(state: QueueSnapshot, source: Source): Source {
  let next = source;
  for (const item of state.items) if (item.kind !== 'add') next = applyItem(item, next);
  return next;
}

/** A note that waits to be saved, with its queued changes, or null when it is gone. */
export function queuedSource(state: QueueSnapshot, tempId: string): Source | null {
  const add = state.items.find((item): item is QueuedAdd => item.kind === 'add' && item.tempId === tempId);
  return add ? withQueuedWrite(state, sourceOfAdd(add)) : null;
}

/** The id that names a source now: a synced note's row id, otherwise the id itself. */
export function currentSourceId(state: QueueSnapshot, id: string): string {
  return state.synced.get(id)?.id ?? id;
}

/** The sources with a change that waits for the connection. */
export function waitingSourceIds(state: QueueSnapshot): Set<string> {
  const ids = new Set<string>();
  for (const item of state.items) {
    if (!item.waiting) continue;
    if (item.kind === 'add') ids.add(item.tempId);
    else if (item.kind === 'edit') ids.add(item.sourceId);
    else item.ids.forEach((id) => ids.add(id));
  }
  return ids;
}

/** How many changes wait for the connection. */
export function waitingCount(state: QueueSnapshot): number {
  return state.items.filter((item) => item.waiting).length;
}
