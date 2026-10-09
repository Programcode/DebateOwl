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

/** The web DebateForm's formats, in its order. */
export const DEBATE_FORMATS = ['custom', 'bp', 'policy', 'classroom'] as const;
export type DebateFormat = (typeof DEBATE_FORMATS)[number];

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

async function setCurrentPointer(userId: string, debateId: string) {
  const { error } = await supabase
    .from('current_debates')
    .upsert({ user_id: userId, debate_id: debateId, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}

/** Every debate, newest activity first, and the current one when it is still in the list. */
export async function fetchDebates(): Promise<{ debates: Debate[]; currentId: string | null }> {
  const [debatesResult, currentResult] = await Promise.all([
    supabase.from('debates').select(DEBATE_COLUMNS).order('last_activity_at', { ascending: false }),
    supabase.from('current_debates').select('debate_id').maybeSingle(),
  ]);
  if (debatesResult.error) throw new Error(debatesResult.error.message);
  if (currentResult.error) throw new Error(currentResult.error.message);
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
  input: { motion: string; settings: DebateSettings },
): Promise<Debate> {
  const motion = input.motion.trim();
  if (!motion) throw new Error('A debate needs a motion');
  const { data, error } = await supabase
    .from('debates')
    .insert({ user_id: userId, motion: motion.slice(0, MAX_MOTION_LENGTH), settings: input.settings, instructions: '' })
    .select(DEBATE_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not create debate');
  const debate = fromRow(data as DebateRow);
  await setCurrentPointer(userId, debate.id);
  return debate;
}

/** Makes a debate current. Choosing it also counts as activity, as on the website. */
export async function switchDebate(userId: string, debateId: string): Promise<number> {
  await setCurrentPointer(userId, debateId);
  const now = Date.now();
  // The website does not fail a switch when only this timestamp could not be saved.
  await supabase.from('debates').update({ last_activity_at: new Date(now).toISOString() }).eq('id', debateId);
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

export interface DebateCounts {
  sources: number;
  results: number;
  rounds: number;
}

async function countRows(table: string, debateId: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('debate_id', debateId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Sources, saved results and Sparring rounds in one debate. One-off work has no debate and never counts. */
export async function fetchDebateCounts(debateId: string): Promise<DebateCounts> {
  const [sources, rounds, ...results] = await Promise.all([
    countRows('sources', debateId),
    countRows('sparring_sessions', debateId),
    ...RESULT_TABLES.map((table) => countRows(table, debateId)),
  ]);
  return { sources, rounds, results: results.reduce((sum, count) => sum + count, 0) };
}

/** Library sources per debate, for the switcher's list. */
export async function fetchSourceCounts(debateIds: string[]): Promise<Record<string, number>> {
  const counts = await Promise.all(debateIds.map((id) => countRows('sources', id)));
  return Object.fromEntries(debateIds.map((id, index) => [id, counts[index]]));
}

export interface DebateItem {
  id: string;
  kind: DebateItemKind;
  title: string;
  createdAt: number;
}

/** The newest saved results and rounds in a debate, like the website's Recent work. */
export async function fetchRecentWork(debateId: string, limit: number): Promise<DebateItem[]> {
  const lists = await Promise.all([
    ...RESULT_TABLES.map(async (table) => {
      const { data, error } = await supabase
        .from(table)
        .select('id,title,created_at')
        .eq('debate_id', debateId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return ((data ?? []) as { id: string; title: string; created_at: string }[]).map((row): DebateItem => ({
        id: row.id,
        kind: KIND_BY_TABLE[table],
        title: row.title,
        createdAt: new Date(row.created_at).getTime(),
      }));
    }),
    (async () => {
      // The website lists a round under its motion and orders it by its last update.
      const { data, error } = await supabase
        .from('sparring_sessions')
        .select('id,motion,updated_at')
        .eq('debate_id', debateId)
        .order('updated_at', { ascending: false })
        .limit(limit);
      if (error) throw new Error(error.message);
      return ((data ?? []) as { id: string; motion: string; updated_at: string }[]).map((row): DebateItem => ({
        id: row.id,
        kind: 'sparring',
        title: row.motion,
        createdAt: new Date(row.updated_at).getTime(),
      }));
    })(),
  ]);
  return lists.flat().sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}
