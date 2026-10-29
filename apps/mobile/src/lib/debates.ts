import { afterWrite, cachedRead, cachedReadFrom, pickFailure, readAll, readFailed, updateCopy, type CopyMark, type CopyScope } from './offline-cache';
import { supabase } from './supabase';

/**
 * The website's debate tables, read and written the way its debate store
 * (src/lib/stores/debate-store.ts) does, so the app and the website share one
 * Current Debate. The store itself stays in the website: it persists to
 * localStorage and uses the web Supabase client.
 */

export interface DebateSettings {
  format?: string;
  role?: string;
  judge?: string;
}

export interface Debate {
  id: string;
  motion: string;
  settings: DebateSettings;
  instructions: string;
  lastActivityAt: number;
  createdAt: number;
}

export const MAX_MOTION_LENGTH = 1200;
export const MAX_INSTRUCTIONS_LENGTH = 2000;
/** The website's free-text judge note; its prompts read it as "Judge expectations". */
export const MAX_JUDGE_LENGTH = 200;
/** How long a debate may sit without meaningful work before the app asks about it, as on the website. */
export const INACTIVE_DEBATE_MS = 5 * 24 * 60 * 60 * 1000;

export function isDebateInactive(debate: Pick<Debate, 'lastActivityAt'>, now = Date.now()): boolean {
  return now - debate.lastActivityAt > INACTIVE_DEBATE_MS;
}

/** The web DebateForm's formats, in its order. */
export const DEBATE_FORMATS = ['custom', 'bp', 'policy', 'classroom'] as const;
export type DebateFormat = (typeof DEBATE_FORMATS)[number];

/** The web DebateForm's roles, in its order, with its labels. */
export const DEBATE_ROLES = ['general', 'intro', 'r1', 'r2', 'conc'] as const;
export const ROLE_LABEL_KEYS: Record<(typeof DEBATE_ROLES)[number], string> = {
  general: 'debate.roleAny',
  intro: 'generateForm.roleIntro',
  r1: 'generateForm.roleR1',
  r2: 'generateForm.roleR2',
  conc: 'generateForm.roleConc',
};

const DEBATE_COLUMNS = 'id,motion,settings,instructions,last_activity_at,created_at';

interface DebateRow {
  id: string;
  motion: string;
  settings: unknown;
  instructions: string | null;
  last_activity_at: string;
  created_at: string;
}

function parseSettings(value: unknown): DebateSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const settings: DebateSettings = {};
  for (const key of ['format', 'role', 'judge'] as const) {
    if (typeof record[key] === 'string' && record[key]) settings[key] = record[key] as string;
  }
  return settings;
}

function fromRow(row: DebateRow): Debate {
  return {
    id: row.id,
    motion: row.motion,
    settings: parseSettings(row.settings),
    instructions: row.instructions ?? '',
    lastActivityAt: new Date(row.last_activity_at).getTime(),
    createdAt: new Date(row.created_at).getTime(),
  };
}

export function sortDebates(debates: Debate[]): Debate[] {
  return [...debates].sort((a, b) => b.lastActivityAt - a.lastActivityAt);
}

interface DebateList {
  debates: Debate[];
  currentId: string | null;
}

/** Keeps the saved debates list in step with a write, so an offline restart opens what the student chose. */
function keepInCopy(userId: string, change: (list: DebateList) => DebateList) {
  updateCopy<DebateList>(userId, 'debates', 'all', (copy) => copy && change(copy));
}

async function setCurrentPointer(userId: string, debateId: string) {
  const { error } = await supabase
    .from('current_debates')
    .upsert({ user_id: userId, debate_id: debateId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
  keepInCopy(userId, (list) => ({ ...list, currentId: list.debates.some((debate) => debate.id === debateId) ? debateId : list.currentId }));
}

/**
 * Every read and write below also filters on the user. Row level security is
 * the real boundary; the filter keeps a wrong session from mixing accounts.
 */

/** Every debate, newest activity first, and the current one when it is still in the list. Offline, the saved copy. */
export function fetchDebates(userId: string, onCopy?: (value: DebateList) => void): Promise<DebateList> {
  return cachedRead(userId, 'debates', 'all', () => loadDebates(userId), undefined, onCopy);
}

/** fetchDebates, saying whether the list is the saved copy rather than the server's answer. */
export function fetchDebatesFrom(userId: string, onCopy?: (value: DebateList) => void): Promise<{ value: DebateList; fromCopy: boolean }> {
  return cachedReadFrom(userId, 'debates', 'all', () => loadDebates(userId), undefined, onCopy);
}

async function loadDebates(userId: string): Promise<DebateList> {
  const [debatesResult, currentResult] = await Promise.all([
    supabase.from('debates').select(DEBATE_COLUMNS).eq('user_id', userId).order('last_activity_at', { ascending: false }),
    supabase.from('current_debates').select('debate_id').eq('user_id', userId).maybeSingle(),
  ]);
  const failures = [debatesResult, currentResult].flatMap((result) => (result.error ? [readFailed(result.error, result.status)] : []));
  if (failures.length > 0) throw pickFailure(failures);
  const debates = ((debatesResult.data ?? []) as DebateRow[]).map(fromRow);
  const currentId = (currentResult.data as { debate_id?: string } | null)?.debate_id ?? null;
  return {
    debates: sortDebates(debates),
    currentId: currentId && debates.some((debate) => debate.id === currentId) ? currentId : null,
  };
}

/** Creates a debate and makes it current, as the website's create dialog does. */
export async function createDebate(
  userId: string,
  input: { motion: string; settings: DebateSettings; instructions?: string },
): Promise<Debate> {
  const motion = input.motion.trim();
  if (!motion) throw new Error('A debate needs a motion');
  const { data, error } = await supabase
    .from('debates')
    .insert({
      user_id: userId,
      motion: motion.slice(0, MAX_MOTION_LENGTH),
      settings: input.settings,
      instructions: (input.instructions ?? '').trim().slice(0, MAX_INSTRUCTIONS_LENGTH),
    })
    .select(DEBATE_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not create debate');
  const debate = fromRow(data as DebateRow);
  keepInCopy(userId, (list) => ({ ...list, debates: sortDebates([debate, ...list.debates.filter((item) => item.id !== debate.id)]) }));
  await setCurrentPointer(userId, debate.id);
  return debate;
}

/** Makes a debate current. Choosing it also counts as activity, as on the website. */
export async function switchDebate(userId: string, debateId: string): Promise<number> {
  await setCurrentPointer(userId, debateId);
  const now = Date.now();
  // The website does not fail a switch when only this timestamp could not be saved.
  await supabase.from('debates').update({ last_activity_at: new Date(now).toISOString() })
    .eq('id', debateId)
    .eq('user_id', userId);
  // As the Debate provider shows it: the switch counts as activity even when the timestamp was not saved.
  keepInCopy(userId, (list) => ({ ...list, debates: sortDebates(list.debates.map((item) => (item.id === debateId ? { ...item, lastActivityAt: now } : item))) }));
  return now;
}

/** Saves a debate's motion, settings and instructions, as the website's Edit settings does. */
export async function updateDebate(
  userId: string,
  current: Debate,
  patch: { motion?: string; settings?: DebateSettings; instructions?: string },
): Promise<Debate> {
  const next: Debate = {
    ...current,
    ...(patch.motion !== undefined ? { motion: patch.motion.trim().slice(0, MAX_MOTION_LENGTH) || current.motion } : {}),
    ...(patch.settings !== undefined ? { settings: patch.settings } : {}),
    ...(patch.instructions !== undefined ? { instructions: patch.instructions.trim().slice(0, MAX_INSTRUCTIONS_LENGTH) } : {}),
  };
  const { error } = await supabase
    .from('debates')
    .update({ motion: next.motion, settings: next.settings, instructions: next.instructions, updated_at: new Date().toISOString() })
    .eq('id', current.id)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
  keepInCopy(userId, (list) => ({ ...list, debates: list.debates.map((item) => (item.id === next.id ? next : item)) }));
  return next;
}

/**
 * Deletes a debate. Its sources and saved work go with it (the database
 * cascades), as the website warns, so every copy that may hold them is dropped.
 */
export async function deleteDebate(userId: string, debateId: string): Promise<void> {
  const { error } = await supabase.from('debates').delete().eq('id', debateId).eq('user_id', userId);
  if (error) throw new Error(error.message);
  keepInCopy(userId, (list) => ({
    debates: list.debates.filter((item) => item.id !== debateId),
    currentId: list.currentId === debateId ? null : list.currentId,
  }));
  afterWrite(userId, [
    { group: 'sources', key: debateId },
    { group: 'sources', prefix: 'folders:' },
    { group: 'source' },
    { group: 'history', key: debateId },
    { group: 'debate-lists', about: debateId },
    { group: 'flowcharts', key: debateId },
    { group: 'chats', key: debateId },
    { group: 'sparring-rounds', about: debateId },
    // Saved documents do not say their debate in their keys, so all of them go.
    { group: 'result:case' },
    { group: 'result:attack' },
    { group: 'result:brainstorm' },
    { group: 'result:factoids' },
    { group: 'flowchart' },
    { group: 'chat' },
    { group: 'sparring' },
  ]);
}

/** "Continue" in the five-day check: the student is still preparing this debate. */
export async function continueDebate(userId: string, debateId: string): Promise<number> {
  const now = Date.now();
  const { error } = await supabase.from('debates').update({ last_activity_at: new Date(now).toISOString() }).eq('id', debateId).eq('user_id', userId);
  if (error) throw new Error(error.message);
  keepInCopy(userId, (list) => ({ ...list, debates: sortDebates(list.debates.map((item) => (item.id === debateId ? { ...item, lastActivityAt: now } : item))) }));
  return now;
}

/** Tables whose rows are a debate's saved results, as listed by the website's debate counts. */
const RESULT_TABLES = ['cases', 'attacks', 'brainstorms', 'factoids', 'chats', 'flowcharts', 'crossfires'] as const;
type ResultTable = (typeof RESULT_TABLES)[number];

export type DebateItemKind = 'case' | 'attack' | 'brainstorm' | 'factoids' | 'chat' | 'flowchart' | 'crossfire' | 'sparring';

const KIND_BY_TABLE: Record<ResultTable, DebateItemKind> = {
  cases: 'case',
  attacks: 'attack',
  brainstorms: 'brainstorm',
  factoids: 'factoids',
  chats: 'chat',
  flowcharts: 'flowchart',
  crossfires: 'crossfire',
};

/** The two sides a debate is prepared for. */
export type DebateSide = 'pro' | 'con';

/**
 * The saved sides that belong to each side's preparation. As on the website's
 * Current Debate page, 'both' counts for either side and neutral or side-less
 * work counts for neither.
 */
const SIDES_FOR: Record<DebateSide, string[]> = { pro: ['pro', 'both'], con: ['con', 'both'] };

export interface DebateCounts {
  sources: number;
  /** Saved results per side. */
  results: Record<DebateSide, number>;
  rounds: number;
}

async function countRows(userId: string, table: string, debateId: string, sides?: string[]): Promise<number> {
  let query = supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('debate_id', debateId);
  if (sides) query = query.in('side', sides);
  const { count, error, status } = await query;
  if (error) throw readFailed(error, status);
  return count ?? 0;
}

const sum = (counts: number[]) => counts.reduce((total, count) => total + count, 0);

/** Sources, saved results per side and Sparring rounds in one debate. One-off work has no debate and never counts. */
export function fetchDebateCounts(userId: string, debateId: string, mark?: CopyMark, onCopy?: (value: DebateCounts) => void): Promise<DebateCounts> {
  return cachedRead(userId, 'debate-lists', `counts:${debateId}`, () => loadDebateCounts(userId, debateId), mark, onCopy);
}

async function loadDebateCounts(userId: string, debateId: string): Promise<DebateCounts> {
  const [sources, rounds, pro, con] = await readAll([
    countRows(userId, 'sources', debateId),
    countRows(userId, 'sparring_sessions', debateId),
    readAll(RESULT_TABLES.map((table) => countRows(userId, table, debateId, SIDES_FOR.pro))),
    readAll(RESULT_TABLES.map((table) => countRows(userId, table, debateId, SIDES_FOR.con))),
  ]);
  return { sources, rounds, results: { pro: sum(pro), con: sum(con) } };
}

/** Library sources per debate, for the switcher's list. */
export function fetchSourceCounts(userId: string, debateIds: string[], mark?: CopyMark): Promise<Record<string, number>> {
  return cachedRead(userId, 'debate-lists', `source-counts:${debateIds.join(',')}`, () => loadSourceCounts(userId, debateIds), mark);
}

async function loadSourceCounts(userId: string, debateIds: string[]): Promise<Record<string, number>> {
  const counts = await readAll(debateIds.map((id) => countRows(userId, 'sources', id)));
  return Object.fromEntries(debateIds.map((id, index) => [id, counts[index]]));
}

export interface DebateItem {
  id: string;
  kind: DebateItemKind;
  title: string;
  createdAt: number;
}

async function fetchResultRows(userId: string, debateId: string, table: ResultTable, sides: string[] | null, limit: number): Promise<DebateItem[]> {
  let query = supabase
    .from(table)
    .select('id,title,created_at')
    .eq('user_id', userId)
    .eq('debate_id', debateId);
  if (sides) query = query.in('side', sides);
  const { data, error, status } = await query.order('created_at', { ascending: false }).limit(limit);
  if (error) throw readFailed(error, status);
  return ((data ?? []) as { id: string; title: string; created_at: string }[]).map((row): DebateItem => ({
    id: row.id,
    kind: KIND_BY_TABLE[table],
    title: row.title,
    createdAt: new Date(row.created_at).getTime(),
  }));
}

const newestFirst = (lists: DebateItem[][], limit: number) => lists.flat().sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);

/** The newest saved results and rounds for one side of a debate, like the website's side lists. */
export function fetchRecentWork(userId: string, debateId: string, side: DebateSide, limit: number, mark?: CopyMark, onCopy?: (value: DebateItem[]) => void): Promise<DebateItem[]> {
  return cachedRead(userId, 'debate-lists', `recent:${debateId}:${side}:${limit}`, () => loadRecentWork(userId, debateId, side, limit), mark, onCopy);
}

async function loadRecentWork(userId: string, debateId: string, side: DebateSide, limit: number): Promise<DebateItem[]> {
  const lists = await readAll([
    ...RESULT_TABLES.map((table) => fetchResultRows(userId, debateId, table, SIDES_FOR[side], limit)),
    (async () => {
      // The website lists a judged round under its motion and the side the student spoke, ordered by its last update.
      const { data, error, status } = await supabase
        .from('sparring_sessions')
        .select('id,motion,updated_at')
        .eq('user_id', userId)
        .eq('debate_id', debateId)
        .eq('user_side', side)
        .eq('status', 'complete')
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (error) throw readFailed(error, status);
      return ((data ?? []) as { id: string; motion: string; updated_at: string }[]).map((row): DebateItem => ({
        id: row.id,
        kind: 'sparring',
        title: row.motion,
        createdAt: new Date(row.updated_at).getTime(),
      }));
    })(),
  ]);
  return newestFirst(lists, limit);
}

/** The tables of work that opens as a document, whatever its side: what Spotlight indexes. */
const DOCUMENT_TABLES = ['cases', 'attacks', 'brainstorms', 'factoids'] as const satisfies readonly ResultTable[];

/**
 * A debate's newest documents of every side, neutral included (attacks and factoids save as
 * neutral), for Spotlight (spotlight-items.ts). Not kept offline: Spotlight is updated online only.
 */
export async function fetchDocumentsForSpotlight(userId: string, debateId: string, limit: number): Promise<DebateItem[]> {
  const lists = await readAll(DOCUMENT_TABLES.map((table) => fetchResultRows(userId, debateId, table, null, limit)));
  return newestFirst(lists, limit);
}

/** The Prepare tools' tables. */
const PREPARE_TABLES = ['cases', 'brainstorms', 'factoids', 'flowcharts'] as const satisfies readonly ResultTable[];
const PREPARE_KINDS = new Set<DebateItemKind>(PREPARE_TABLES.map((table) => KIND_BY_TABLE[table]));

/**
 * The saved counts and lists of one debate that a write changed: adding or
 * removing a source changes its counts; a saved result or round also changes
 * the recent work, and a Prepare result the Prepare list.
 */
export function debateListScopes(debateId: string | null, change: 'source' | DebateItemKind): CopyScope[] {
  // Work outside every debate has no counts, but History lists it.
  return debateId ? listScopes(debateId, change) : [{ group: 'history', key: 'one-off' }];
}

/**
 * The saved counts and lists a delete changed, from the debates its deleted
 * rows name. A delete that returned no row (the row was already gone, say
 * deleted on the website) does not say which debate held it, so every
 * debate's counts and lists of that kind are dropped.
 */
export function deletedListScopes(deletedFrom: (string | null)[], change: 'source' | DebateItemKind): CopyScope[] {
  return deletedFrom.length > 0 ? deletedFrom.flatMap((debateId) => debateListScopes(debateId, change)) : listScopes(undefined, change);
}

/** One debate's counts and lists, or every debate's when `debateId` is undefined. */
function listScopes(debateId: string | undefined, change: 'source' | DebateItemKind): CopyScope[] {
  const of = debateId ? `${debateId}:` : '';
  const scopes: CopyScope[] = [debateId ? { group: 'debate-lists', key: `counts:${debateId}` } : { group: 'debate-lists', prefix: 'counts:' }];
  // History lists a debate's work, but not its sources; a delete from an unknown debate may have been one-off, so every History copy goes.
  const history: CopyScope = debateId ? { group: 'history', key: debateId } : { group: 'history' };
  if (change === 'source') return [...scopes, { group: 'debate-lists', prefix: 'source-counts:', about: debateId }, ...(debateId ? [] : [history])];
  scopes.push(history, { group: 'debate-lists', prefix: `recent:${of}` });
  if (PREPARE_KINDS.has(change)) scopes.push({ group: 'debate-lists', prefix: `prepare:${of}` });
  return scopes;
}

/** A debate's saved Prepare results for both sides, newest first, for the Prepare tab. */
export function fetchPrepareWork(userId: string, debateId: string, limit: number, mark?: CopyMark, onCopy?: (value: DebateItem[]) => void): Promise<DebateItem[]> {
  return cachedRead(userId, 'debate-lists', `prepare:${debateId}:${limit}`, () => loadPrepareWork(userId, debateId, limit), mark, onCopy);
}

async function loadPrepareWork(userId: string, debateId: string, limit: number): Promise<DebateItem[]> {
  const lists = await readAll(PREPARE_TABLES.map((table) => fetchResultRows(userId, debateId, table, null, limit)));
  return newestFirst(lists, limit);
}
