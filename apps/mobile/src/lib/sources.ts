import { SourceImportOutputSchema, type SourceImportOutput } from '@debatelab/core/ai/schemas/source-import';
import { getEdgeFunctionErrorMessage } from '@debatelab/core/supabase/edge-function-error';

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

/** One debate's sources, newest first, as the website's Library lists them by default. */
export async function fetchSources(userId: string, debateId: string): Promise<Source[]> {
  const { data, error } = await supabase
    .from('sources')
    .select(SOURCE_COLUMNS)
    .eq('user_id', userId)
    .eq('debate_id', debateId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as SourceRow[]).map(fromRow);
}

export async function fetchSource(userId: string, id: string): Promise<Source | null> {
  const { data, error } = await supabase
    .from('sources')
    .select(SOURCE_COLUMNS)
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? fromRow(data as SourceRow) : null;
}

/** Saves a source to a debate in the General folder, as the website's Library does. */
export async function addSource(
  userId: string,
  input: { title: string; content: string; type: SourceType; origin?: string | null; debateId: string },
): Promise<Source> {
  const folderResult = await supabase
    .from('source_folders')
    .upsert({ user_id: userId, name: DEFAULT_FOLDER }, { onConflict: 'user_id,name' });
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
      folder: DEFAULT_FOLDER,
      is_active: true,
      metadata: null,
    })
    .select(SOURCE_COLUMNS)
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not save the source');
  notifySourcesChanged();
  return fromRow(data as SourceRow);
}

export async function removeSource(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('sources').delete().eq('user_id', userId).eq('id', id);
  if (error) throw new Error(error.message);
  notifySourcesChanged();
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
