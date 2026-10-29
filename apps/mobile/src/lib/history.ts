import { SparringScorecardSchema, SparringSpeechSchema } from '@debatelab/core/ai/schemas/sparring';

import { debateListScopes, type DebateItem, type DebateItemKind } from './debates';
import { afterWrite, cachedRead, readAll, readFailed, type CopyMark, type CopyScope } from './offline-cache';
import { supabase } from './supabase';

/**
 * The website's History page (src/pages/HistoryPage.tsx) and its unsorted
 * view (src/components/features/debate/UnsortedWork.tsx), read from the same
 * tables. A debate shows six lists; work outside every debate is one list of
 * every kind, plus Library sources, that can be added to a debate. Offline,
 * both answer from their saved copies.
 */

export type HistoryTab = 'cases' | 'chats' | 'attacks' | 'brainstorms' | 'factoids' | 'sparring';

/** The website's tabs, in its order. */
export const HISTORY_TABS: readonly { key: HistoryTab; kind: DebateItemKind }[] = [
  { key: 'cases', kind: 'case' },
  { key: 'chats', kind: 'chat' },
  { key: 'attacks', kind: 'attack' },
  { key: 'brainstorms', kind: 'brainstorm' },
  { key: 'factoids', kind: 'factoids' },
  { key: 'sparring', kind: 'sparring' },
];

export interface HistoryItem extends DebateItem {
  /** The side a case was generated for, as the website's case badge reads it. */
  side?: string;
  messageCount?: number;
  sparring?: { format: string; userSide: 'pro' | 'con'; score: { user: number; ai: number } };
  /** The motion saved with the work, for the suggested debate. */
  motion?: string;
}

export type HistoryLists = Record<HistoryTab, HistoryItem[]>;

/** One-off work, or a Library source, outside every debate. */
export type UnsortedEntry = HistoryItem | { kind: 'source'; id: string; title: string; createdAt: number };

/** The website keeps the 50 newest rounds (MAX_SAVED_SESSIONS in its sparring store). */
const MAX_ROUNDS = 50;

const TABLES: Record<Exclude<DebateItemKind, 'sparring'>, string> = {
  case: 'cases',
  attack: 'attacks',
  brainstorm: 'brainstorms',
  factoids: 'factoids',
  chat: 'chats',
  flowchart: 'flowcharts',
  crossfire: 'crossfires',
};

/** Tables whose saved output may carry the motion, read where the website reads it: output.metadata.motion. */
const WITH_OUTPUT = new Set(['cases', 'attacks', 'brainstorms', 'factoids', 'crossfires']);

const time = (value: string) => new Date(value).getTime();

/**
 * Every read below filters on the user. Row level security is the real
 * boundary; the filter keeps a wrong session from mixing accounts.
 */

type Scope = { debateId: string } | { unsorted: true };

function inScope<Q extends { eq: (column: string, value: string) => Q; is: (column: string, value: null) => Q }>(query: Q, scope: Scope): Q {
  return 'debateId' in scope ? query.eq('debate_id', scope.debateId) : query.is('debate_id', null);
}

async function fetchRows(userId: string, kind: Exclude<DebateItemKind, 'sparring' | 'chat'>, scope: Scope): Promise<HistoryItem[]> {
  const table = TABLES[kind];
  const columns = [
    'id,title,created_at',
    ...(WITH_OUTPUT.has(table) ? ['motion:output->metadata->>motion'] : []),
    ...(kind === 'case' ? ['case_side:output->metadata->>side'] : []),
  ].join(',');
  const query = supabase.from(table).select(columns).eq('user_id', userId);
  const { data, error, status } = await inScope(query, scope).order('created_at', { ascending: false });
  if (error) throw readFailed(error, status);
  return ((data ?? []) as unknown as { id: string; title: string; created_at: string; motion?: string | null; case_side?: string | null }[]).map((row) => ({
    id: row.id,
    kind,
    title: row.title,
    createdAt: time(row.created_at),
    ...(row.motion ? { motion: row.motion } : {}),
    ...(row.case_side ? { side: row.case_side } : {}),
  }));
}

/** Chats with their message count, as the website's chat list shows them. */
async function fetchChatRows(userId: string, scope: Scope): Promise<HistoryItem[]> {
  const query = supabase.from('chats').select('id,title,created_at,messages(count)').eq('user_id', userId);
  const { data, error, status } = await inScope(query, scope).order('created_at', { ascending: false });
  if (error) throw readFailed(error, status);
  return ((data ?? []) as { id: string; title: string; created_at: string; messages: { count: number }[] }[]).map((row) => ({
    id: row.id,
    kind: 'chat',
    title: row.title,
    createdAt: time(row.created_at),
    messageCount: row.messages[0]?.count ?? 0,
  }));
}

interface RoundRow {
  id: string;
  motion: string;
  user_side: string;
  format: string;
  turns: unknown;
  final_evaluation: unknown;
  updated_at: string;
}

/**
 * Finished Sparring rounds, as the website's sparring store keeps them: a
 * round counts only when it is complete and its speeches and scorecard read.
 */
async function fetchRounds(userId: string, scope: Scope): Promise<HistoryItem[]> {
  const query = supabase
    .from('sparring_sessions')
    .select('id,motion,user_side,format,turns,final_evaluation,status,updated_at')
    .eq('user_id', userId)
    .eq('status', 'complete');
  const { data, error, status } = await inScope(query, scope).order('updated_at', { ascending: false }).limit(MAX_ROUNDS);
  if (error) throw readFailed(error, status);
  return ((data ?? []) as RoundRow[]).flatMap((row): HistoryItem[] => {
    const turns = Array.isArray(row.turns) && row.turns.length <= 12 ? row.turns : null;
    const scorecard = SparringScorecardSchema.safeParse(row.final_evaluation);
    const side = row.user_side === 'pro' || row.user_side === 'con' ? row.user_side : null;
    if (!side || !turns?.every((turn) => SparringSpeechSchema.safeParse(turn).success) || !scorecard.success) return [];
    return [{
      id: row.id,
      kind: 'sparring',
      title: row.motion,
      motion: row.motion,
      createdAt: time(row.updated_at),
      sparring: {
        format: row.format,
        userSide: side,
        score: { user: scorecard.data.userScore, ai: scorecard.data.aiScore },
      },
    }];
  });
}

/** The six lists of one debate. Offline, the saved copy. */
export function fetchDebateHistory(userId: string, debateId: string, mark?: CopyMark, onCopy?: (value: HistoryLists) => void): Promise<HistoryLists> {
  return cachedRead(userId, 'history', debateId, () => loadDebateHistory(userId, debateId), mark, onCopy);
}

async function loadDebateHistory(userId: string, debateId: string): Promise<HistoryLists> {
  const scope = { debateId };
  const [cases, chats, attacks, brainstorms, factoids, sparring] = await readAll([
    fetchRows(userId, 'case', scope),
    fetchChatRows(userId, scope),
    fetchRows(userId, 'attack', scope),
    fetchRows(userId, 'brainstorm', scope),
    fetchRows(userId, 'factoids', scope),
    fetchRounds(userId, scope),
  ]);
  return { cases, chats, attacks, brainstorms, factoids, sparring };
}

/** Work of every kind and Library sources that belong to no debate, newest first. Offline, the saved copy. */
export function fetchUnsortedWork(userId: string, mark?: CopyMark, onCopy?: (value: UnsortedEntry[]) => void): Promise<UnsortedEntry[]> {
  return cachedRead(userId, 'history', 'one-off', () => loadUnsortedWork(userId), mark, onCopy);
}

async function loadUnsortedWork(userId: string): Promise<UnsortedEntry[]> {
  const scope = { unsorted: true } as const;
  const lists = await readAll([
    fetchRows(userId, 'case', scope),
    fetchRows(userId, 'attack', scope),
    fetchRows(userId, 'brainstorm', scope),
    fetchRows(userId, 'factoids', scope),
    fetchChatRows(userId, scope),
    fetchRows(userId, 'flowchart', scope),
    fetchRows(userId, 'crossfire', scope),
    fetchRounds(userId, scope),
    (async (): Promise<UnsortedEntry[]> => {
      const { data, error, status } = await supabase
        .from('sources')
        .select('id,title,created_at')
        .eq('user_id', userId)
        .is('debate_id', null)
        .order('created_at', { ascending: false });
      if (error) throw readFailed(error, status);
      return ((data ?? []) as { id: string; title: string; created_at: string }[]).map((row) => ({
        kind: 'source' as const,
        id: row.id,
        title: row.title,
        createdAt: time(row.created_at),
      }));
    })(),
  ]);
  return lists.flat<UnsortedEntry[][]>().sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Adds one-off work or a source to one of the student's debates through the
 * website's attach_to_debate function, as the session store's attachItem and
 * the sparring store's attachSessionToDebate do. The function checks that the
 * debate and the item belong to the signed-in account and that the item is in
 * no debate yet. It acts for whoever holds the session, so the session must
 * still be the account the screen showed this work for. Afterwards the saved
 * copies that showed the item outside every debate, or the debate without it,
 * are dropped.
 */
export async function attachToDebate(userId: string, entry: UnsortedEntry, debateId: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (data.session?.user.id !== userId) throw new Error('The signed-in account changed');
  const { error } = await supabase.rpc('attach_to_debate', {
    p_kind: entry.kind,
    p_id: entry.id,
    p_debate_id: debateId,
    // A saved round keeps the side the student spoke, as attachSessionToDebate passes it.
    ...(entry.kind === 'sparring' && 'sparring' in entry && entry.sparring ? { p_side: entry.sparring.userSide } : {}),
  });
  if (error) throw new Error(error.message);
  afterWrite(userId, [...attachedCopies(entry.kind, entry.id, debateId), ...debateListScopes(debateId, entry.kind), ...debateListScopes(null, entry.kind)]);
}

/** The item's own copy and the per-debate lists it left (one-off) and joined. */
function attachedCopies(kind: UnsortedEntry['kind'], id: string, debateId: string): CopyScope[] {
  switch (kind) {
    case 'case':
    case 'attack':
    case 'brainstorm':
    case 'factoids':
      return [{ group: `result:${kind}`, key: id }];
    case 'chat':
      return [{ group: 'chat', key: id }, { group: 'chats', key: 'one-off' }, { group: 'chats', key: debateId }];
    case 'flowchart':
      return [{ group: 'flowchart', key: id }, { group: 'flowcharts', key: 'one-off' }, { group: 'flowcharts', key: debateId }];
    case 'source':
      return [{ group: 'source', key: id }, { group: 'sources', key: debateId }];
    case 'sparring':
      // The round lists are keyed `<debate or one-off>:<limit>`, as sparring.ts reads them.
      return [{ group: 'sparring', key: id }, { group: 'sparring-rounds', prefix: 'one-off:' }, { group: 'sparring-rounds', prefix: `${debateId}:` }];
    case 'crossfire':
      return [];
  }
}
