import {
  boundOutputDigests,
  digestOutput,
  isDebateContextOutputKind,
  MAX_CONTEXT_OUTPUTS,
  MAX_CONTEXT_SOURCES,
  selectDefaultOutputs,
  type DebateContextFeature,
  type DebateContextOutputKind,
  type DebateContextRequest,
  type DebateContextSide,
  type DebateOutputCandidate,
  type DebateOutputRef,
} from '@debatelab/core/contract/debate-context';

import { supabase } from './supabase';

/**
 * The Current Debate material a request sends: IDs only, picked the way the
 * website's planDebateContext (src/lib/debate/context.ts) picks them with no
 * Review choices. Pins come from debate_context_pins, as on the website;
 * if they cannot be read, the automatic selection is used. The server loads
 * and checks the text.
 */

const RESULT_TABLES = {
  case: 'cases',
  attack: 'attacks',
  brainstorm: 'brainstorms',
  factoids: 'factoids',
  chat: 'chats',
  crossfire: 'crossfires',
} as const satisfies Partial<Record<DebateContextOutputKind, string>>;
type ResultKind = keyof typeof RESULT_TABLES;
const RESULT_KINDS = Object.keys(RESULT_TABLES) as ResultKind[];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sideOf(value: unknown): DebateContextSide | null {
  return value === 'pro' || value === 'con' || value === 'both' || value === 'neutral' ? value : null;
}

function rowsOf<T>(result: { data: unknown; error: { message: string } | null }): T[] {
  if (result.error) throw new Error(result.error.message);
  return (result.data ?? []) as T[];
}

/**
 * The stored text of one saved result, in the shape digestOutput reads. Like
 * every read here it filters on the user, except messages, which have no user
 * column and belong to a chat from the user's own list.
 */
async function outputData(userId: string, ref: DebateOutputRef): Promise<unknown> {
  if (ref.kind === 'chat') {
    const result = await supabase.from('messages').select('role,content').eq('chat_id', ref.id).order('created_at', { ascending: true });
    return rowsOf(result);
  }
  if (ref.kind === 'sparring') {
    const result = await supabase
      .from('sparring_sessions')
      .select('user_side,final_evaluation')
      .eq('user_id', userId)
      .eq('id', ref.id)
      .maybeSingle();
    if (result.error) throw new Error(result.error.message);
    const row = result.data as { user_side?: unknown; final_evaluation?: unknown } | null;
    return { userSide: row?.user_side, scorecard: row?.final_evaluation };
  }
  const result = await supabase.from(RESULT_TABLES[ref.kind]).select('output').eq('user_id', userId).eq('id', ref.id).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return (result.data as { output?: unknown } | null)?.output;
}

/**
 * `side` is the side the request prepares, as the website's requestSide
 * picks it. `excludeChatId` is the chat open in Ask: it is already the
 * conversation.
 */
export async function buildDebateContext(
  userId: string,
  debateId: string,
  feature: DebateContextFeature,
  side: DebateContextSide,
  excludeChatId: string | null = null,
): Promise<DebateContextRequest> {
  const [sources, pins, sparring, ...results] = await Promise.all([
    supabase.from('sources').select('id,is_active').eq('user_id', userId).eq('debate_id', debateId).order('created_at', { ascending: false }),
    supabase.from('debate_context_pins').select('item_kind,item_id').eq('user_id', userId).eq('debate_id', debateId),
    supabase.from('sparring_sessions').select('id,user_side,updated_at').eq('user_id', userId).eq('debate_id', debateId),
    ...RESULT_KINDS.map((kind) =>
      supabase.from(RESULT_TABLES[kind]).select('id,side,created_at').eq('user_id', userId).eq('debate_id', debateId)),
  ]);

  const sourceIds = rowsOf<{ id: string; is_active: boolean }>(sources)
    .filter((source) => source.is_active && UUID.test(source.id))
    .slice(0, MAX_CONTEXT_SOURCES)
    .map((source) => source.id);

  // Pins are optional; the website falls back to the automatic selection when they cannot be read.
  const pinnedKeys = new Set(
    pins.error ? [] : ((pins.data ?? []) as { item_kind: unknown; item_id: unknown }[]).flatMap((row) =>
      isDebateContextOutputKind(row.item_kind) && typeof row.item_id === 'string' ? [`${row.item_kind}:${row.item_id}`] : []),
  );

  const candidates: DebateOutputCandidate[] = [];
  RESULT_KINDS.forEach((kind, index) => {
    for (const row of rowsOf<{ id: string; side: unknown; created_at: string }>(results[index])) {
      if (!UUID.test(row.id) || (kind === 'chat' && row.id === excludeChatId)) continue;
      candidates.push({ kind, id: row.id, side: sideOf(row.side), createdAt: new Date(row.created_at).getTime(), pinned: pinnedKeys.has(`${kind}:${row.id}`) });
    }
  });
  for (const row of rowsOf<{ id: string; user_side: unknown; updated_at: string }>(sparring)) {
    if (!UUID.test(row.id)) continue;
    candidates.push({ kind: 'sparring', id: row.id, side: sideOf(row.user_side), createdAt: new Date(row.updated_at).getTime(), pinned: pinnedKeys.has(`sparring:${row.id}`) });
  }

  const sent = selectDefaultOutputs(candidates, feature, side).slice(0, MAX_CONTEXT_OUTPUTS);
  // Results with nothing usable yet, such as an unjudged round, are not sent.
  const digests = await Promise.all(sent.map(async (ref) => ({ ...ref, digest: digestOutput(ref.kind, await outputData(userId, ref)) })));
  const empty = new Set(boundOutputDigests(digests).empty.map((item) => `${item.kind}:${item.id}`));

  return {
    debateId,
    side,
    sourceIds,
    outputs: sent.filter((ref) => !empty.has(`${ref.kind}:${ref.id}`)),
  };
}
