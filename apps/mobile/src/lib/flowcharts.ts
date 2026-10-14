import { readFlowchart, type FlowchartDocument } from '@debatelab/core/flowchart';

import { debateListScopes } from './debates';
import { afterWrite, cachedRead, readFailed, updateCopy } from './offline-cache';
import { supabase } from './supabase';

/**
 * Saved flowcharts, read and written the way the website's session store does
 * (saveFlowchart, deleteSavedFlowchart and hydrateFromServer in
 * src/lib/stores/session-store.ts): the React Flow nodes and edges as they are,
 * the title, the debate it belongs to (none for one-off work) and side
 * `neutral`. The app adds saving over a map it opened; the website only ever
 * saves new rows.
 */

export interface FlowchartSummary {
  id: string;
  title: string;
  createdAt: number;
}

export interface SavedFlowchart extends FlowchartSummary {
  debateId: string | null;
  doc: FlowchartDocument;
}

interface FlowchartRow {
  id: string;
  title: string;
  debate_id: string | null;
  nodes: unknown;
  edges: unknown;
  created_at: string;
}

const COLUMNS = 'id,title,debate_id,nodes,edges,created_at';

function fromRow(row: FlowchartRow): SavedFlowchart {
  return {
    id: row.id,
    title: row.title,
    debateId: row.debate_id ?? null,
    doc: readFlowchart(row.nodes, row.edges),
    createdAt: new Date(row.created_at).getTime(),
  };
}

/** The maps saved in one debate, or one-off maps for null, newest first, as the website's saved list shows them. */
export function fetchFlowchartList(userId: string, debateId: string | null): Promise<FlowchartSummary[]> {
  return cachedRead(userId, 'flowcharts', debateId ?? 'one-off', () => loadFlowchartList(userId, debateId));
}

async function loadFlowchartList(userId: string, debateId: string | null): Promise<FlowchartSummary[]> {
  const query = supabase.from('flowcharts').select('id,title,created_at').eq('user_id', userId);
  const { data, error, status } = await (debateId ? query.eq('debate_id', debateId) : query.is('debate_id', null)).order('created_at', { ascending: false });
  if (error) throw readFailed(error, status);
  return ((data ?? []) as { id: string; title: string; created_at: string }[]).map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: new Date(row.created_at).getTime(),
  }));
}

export function fetchFlowchart(userId: string, id: string): Promise<SavedFlowchart | null> {
  return cachedRead(userId, 'flowchart', id, () => loadFlowchart(userId, id));
}

async function loadFlowchart(userId: string, id: string): Promise<SavedFlowchart | null> {
  const { data, error, status } = await supabase.from('flowcharts').select(COLUMNS).eq('user_id', userId).eq('id', id).maybeSingle();
  if (error) throw readFailed(error, status);
  return data ? fromRow(data as FlowchartRow) : null;
}

/** The website's Save: a new row in the debate (or one-off when null). */
export async function insertFlowchart(userId: string, input: { title: string; debateId: string | null; doc: FlowchartDocument }): Promise<SavedFlowchart> {
  const { data, error } = await supabase
    .from('flowcharts')
    .insert({ user_id: userId, debate_id: input.debateId, side: 'neutral', title: input.title, nodes: input.doc.nodes, edges: input.doc.edges })
    .select(COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not save the flowchart');
  const saved = fromRow(data as FlowchartRow);
  afterWrite(userId, [{ group: 'flowcharts', key: saved.debateId ?? 'one-off' }, ...debateListScopes(saved.debateId, 'flowchart')]);
  updateCopy(userId, 'flowchart', saved.id, () => saved);
  return saved;
}

/** Saves over a map the app opened. Resolves false when the row is gone, for example deleted on the website. */
export async function updateFlowchart(userId: string, id: string, doc: FlowchartDocument): Promise<boolean> {
  const { data, error } = await supabase
    .from('flowcharts')
    .update({ nodes: doc.nodes, edges: doc.edges, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', id)
    .select(COLUMNS);
  if (error) throw new Error(error.message);
  const row = ((data ?? []) as FlowchartRow[])[0];
  // The saved copy becomes the map as saved, so offline it opens this version; a gone row drops it.
  updateCopy(userId, 'flowchart', id, () => (row ? fromRow(row) : undefined));
  return Boolean(row);
}

export async function deleteFlowchart(userId: string, id: string): Promise<void> {
  const { data, error } = await supabase.from('flowcharts').delete().eq('user_id', userId).eq('id', id).select('debate_id');
  if (error) throw new Error(error.message);
  const deletedFrom = ((data ?? []) as { debate_id: string | null }[]).map((row) => row.debate_id);
  afterWrite(userId, [
    { group: 'flowchart', key: id },
    ...deletedFrom.flatMap((debate) => [{ group: 'flowcharts' as const, key: debate ?? 'one-off' }, ...debateListScopes(debate, 'flowchart')]),
  ]);
}
