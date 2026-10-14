import type { SourceSemanticMetadata } from '@debatelab/core/ai/discovered-sources';
import { SourceImportOutputSchema, type SourceImportOutput } from '@debatelab/core/ai/schemas/source-import';
import { assessedSemantic, isAssessedSource, type SourceAssessmentUpdate } from '@debatelab/core/ai/source-assessments';
import { getEdgeFunctionErrorMessage } from '@debatelab/core/supabase/edge-function-error';

import { debateListScopes } from './debates';
import { afterWrite, cachedRead, readFailed } from './offline-cache';
import { supabase } from './supabase';

/**
 * Library sources, read and written the way the website's session store
 * (src/lib/stores/session-store.ts: addSource, removeSource) and
 * src/lib/source-import.ts do. A source belongs to one debate.
 */

export type SourceType = 'url' | 'file' | 'text';

export interface Source {
  id: string;
  title: string;
  content: string;
  type: SourceType;
  origin: string | null;
  createdAt: number;
  /** Results that used this source, from the website's source assessments. */
  useCount: number;
}

const SOURCE_COLUMNS = 'id,title,content,type,origin,metadata,created_at';
const DEFAULT_FOLDER = 'General';

interface SourceRow {
  id: string;
  title: string;
  content: string;
  type: string;
  origin: string | null;
  metadata: unknown;
  created_at: string;
}

function timesUsed(metadata: unknown): number {
  if (!metadata || typeof metadata !== 'object') return 0;
  const semantic = (metadata as { semantic?: { useCount?: unknown } }).semantic;
  const count = semantic?.useCount;
  return typeof count === 'number' && Number.isInteger(count) && count > 0 ? count : 0;
}

function fromRow(row: SourceRow): Source {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    type: row.type === 'url' || row.type === 'file' ? row.type : 'text',
    origin: row.origin || null,
    createdAt: new Date(row.created_at).getTime(),
    useCount: timesUsed(row.metadata),
  };
}

/**
 * Every read and write below also filters on the user. Row level security is
 * the real boundary; the filter keeps a wrong session from mixing accounts.
 */

/** One debate's sources, newest first, as the website's Library lists them by default. Offline, the saved copy. */
export function fetchSources(userId: string, debateId: string): Promise<Source[]> {
  return cachedRead(userId, 'sources', debateId, () => loadSources(userId, debateId));
}

async function loadSources(userId: string, debateId: string): Promise<Source[]> {
  const { data, error, status } = await supabase
    .from('sources')
    .select(SOURCE_COLUMNS)
    .eq('user_id', userId)
    .eq('debate_id', debateId)
    .order('created_at', { ascending: false });
  if (error) throw readFailed(error, status);
  return ((data ?? []) as SourceRow[]).map(fromRow);
}

export function fetchSource(userId: string, id: string): Promise<Source | null> {
  return cachedRead(userId, 'source', id, () => loadSource(userId, id));
}

async function loadSource(userId: string, id: string): Promise<Source | null> {
  const { data, error, status } = await supabase
    .from('sources')
    .select(SOURCE_COLUMNS)
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw readFailed(error, status);
  return data ? fromRow(data as SourceRow) : null;
}

/**
 * Saves a source to a debate, as the website's session store does: in the
 * General folder unless another is named, as the Library adds them, or in
 * Auto-saved with research metadata, as Generate and Attack keep their sources.
 */
export async function addSource(
  userId: string,
  input: {
    title: string;
    content: string;
    type: SourceType;
    origin?: string | null;
    debateId: string;
    folder?: string;
    isActive?: boolean;
    metadata?: Record<string, unknown> | null;
  },
): Promise<Source> {
  const folder = input.folder?.trim() || DEFAULT_FOLDER;
  const folderResult = await supabase
    .from('source_folders')
    .upsert({ user_id: userId, name: folder }, { onConflict: 'user_id,name' });
  if (folderResult.error) throw new Error(folderResult.error.message);
  const { data, error } = await supabase
    .from('sources')
    .insert({
      user_id: userId,
      debate_id: input.debateId,
      title: input.title,
      content: input.content,
      type: input.type,
      origin: input.origin || null,
      folder,
      is_active: input.isActive ?? true,
      metadata: input.metadata ?? null,
    })
    .select(SOURCE_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not save the source');
  afterWrite(userId, [{ group: 'sources', key: input.debateId }, ...debateListScopes(input.debateId, 'source')]);
  notifySourcesChanged();
  return fromRow(data as SourceRow);
}

/** The sources in one debate's folder, as the website's undo for auto-saved research finds them. */
export async function fetchSourceIdsInFolder(userId: string, debateId: string, folder: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('sources')
    .select('id')
    .eq('user_id', userId)
    .eq('debate_id', debateId)
    .eq('folder', folder);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string }[]).map((row) => row.id);
}

/** Removes a source; with a debate, only while the source is still in that debate. */
export async function removeSource(userId: string, id: string, debateId?: string): Promise<void> {
  const query = supabase.from('sources').delete().eq('user_id', userId).eq('id', id);
  const { data, error } = await (debateId ? query.eq('debate_id', debateId) : query).select('debate_id');
  if (error) throw new Error(error.message);
  // The deleted row names its debate, whose Library and counts change.
  const deletedFrom = ((data ?? []) as { debate_id: string }[]).map((row) => row.debate_id);
  afterWrite(userId, [{ group: 'source', key: id }, ...deletedFrom.flatMap((debate) => [{ group: 'sources' as const, key: debate }, ...debateListScopes(debate, 'source')])]);
  notifySourcesChanged();
}

/**
 * Saves the server's rankings onto the debate's Library sources a result
 * used, as the website's applySourceAssessments does. The debate is the one
 * the request was sent for, read when the student acted; a URL saved in
 * several debates is ranked only in that one. Once the request is cancelled
 * or replaced, nothing is written.
 */
export async function applySourceAssessments(userId: string, debateId: string, assessments: SourceAssessmentUpdate[], signal?: AbortSignal): Promise<void> {
  if (assessments.length === 0 || signal?.aborted) return;
  const { data, error } = await supabase
    .from('sources')
    .select('id,origin,metadata')
    .eq('user_id', userId)
    .eq('debate_id', debateId);
  if (signal?.aborted) return;
  if (error) throw new Error(error.message);
  type Row = { id: string; origin: string | null; metadata: { url?: string; semantic?: SourceSemanticMetadata } | null };
  const candidates = (data ?? []) as Row[];
  const updates = new Map<string, Row['metadata']>();
  for (const assessment of assessments.slice(0, 10)) {
    const source = candidates.find((candidate) => isAssessedSource(candidate, assessment));
    if (!source) continue;
    updates.set(source.id, { ...source.metadata, semantic: assessedSemantic(source.metadata?.semantic, assessment) });
  }
  if (updates.size === 0) return;
  const results = await Promise.all(
    Array.from(updates, ([id, metadata]) => supabase.from('sources').update({ metadata }).eq('user_id', userId).eq('debate_id', debateId).eq('id', id)),
  );
  // The Library and the source sheet show how often a source was used.
  afterWrite(userId, [{ group: 'sources', key: debateId }, ...Array.from(updates.keys(), (id) => ({ group: 'source' as const, key: id }))]);
  notifySourcesChanged();
  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error(failed.error.message);
}

/** The website rejects a URL that is already in the debate's Library. */
export function isDuplicateOrigin(sources: Source[], origin: string): boolean {
  const needle = origin.trim().toLowerCase();
  return Boolean(needle) && sources.some((source) => source.origin?.trim().toLowerCase() === needle);
}

/** Reads a page through the import-source Edge Function, which returns an editable draft. */
export async function importSourceFromUrl(url: string): Promise<SourceImportOutput> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const { data, error } = await supabase.functions.invoke('import-source', {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    body: { url },
  });
  if (error) throw new Error((await getEdgeFunctionErrorMessage(error)) || 'Failed to import source');
  const parsed = SourceImportOutputSchema.safeParse(data);
  if (!parsed.success) throw new Error('Imported source response was invalid');
  return parsed.data;
}

// Screens showing sources reload when another screen adds or removes one.
const listeners = new Set<() => void>();

export function subscribeSourcesChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifySourcesChanged() {
  listeners.forEach((listener) => listener());
}
