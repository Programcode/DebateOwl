import { findSavedPage, normalizeSourceUrl, savedSourceUrl } from '@debatelab/core/source-url';
import { autoSavedSourceRow, type DiscoveredSource } from '@debatelab/core/ai/discovered-sources';
import type { SourceSemanticMetadata } from '@debatelab/core/ai/discovered-sources';
import { SourceImportOutputSchema, type SourceImportOutput } from '@debatelab/core/ai/schemas/source-import';
import { assessedSemantic, isAssessedSource, type SourceAssessmentUpdate } from '@debatelab/core/ai/source-assessments';
import { getEdgeFunctionErrorMessage } from '@debatelab/core/supabase/edge-function-error';
import { GENERAL_FOLDER, libraryFolders, normalizeFolder } from '@debatelab/core/library';

import { debateListScopes, deletedListScopes } from './debates';
import { afterWrite, cachedRead, readAll, readFailed, type CopyMark, type CopyScope } from './offline-cache';
import { createSerialQueue, type SerialQueue } from './serial-queue';
import { supabase } from './supabase';

/**
 * Library sources, read and written the way the website's session store
 * (src/lib/stores/session-store.ts: addSource, updateSource, removeSource,
 * toggleSource, the folder actions and clearLibrary) and
 * src/lib/source-import.ts do. A source belongs to one debate.
 */

export type SourceType = 'url' | 'file' | 'text';

/** What the website keeps on a source: research provenance and the server's rankings. */
export type SourceMetadata = Record<string, unknown> & { semantic?: SourceSemanticMetadata; qualityScore?: number; url?: string };

export interface Source {
  id: string;
  title: string;
  content: string;
  type: SourceType;
  origin: string | null;
  createdAt: number;
  /** Results that used this source, from the website's source assessments. */
  useCount: number;
  folder: string;
  /** Whether the AI grounds its answers in it. */
  isActive: boolean;
  debateId: string | null;
  metadata: SourceMetadata | null;
}

const SOURCE_COLUMNS = 'id,title,content,type,origin,folder,is_active,metadata,debate_id,created_at';

interface SourceRow {
  id: string;
  title: string;
  content: string;
  type: string;
  origin: string | null;
  folder?: string | null;
  is_active?: boolean | null;
  metadata: unknown;
  debate_id?: string | null;
  created_at: string;
}

function timesUsed(metadata: unknown): number {
  if (!metadata || typeof metadata !== 'object') return 0;
  const semantic = (metadata as { semantic?: { useCount?: unknown } }).semantic;
  const count = semantic?.useCount;
  return typeof count === 'number' && Number.isInteger(count) && count > 0 ? count : 0;
}

function metadataOf(value: unknown): SourceMetadata | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as SourceMetadata) : null;
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
    folder: normalizeFolder(row.folder),
    isActive: row.is_active !== false,
    debateId: row.debate_id ?? null,
    metadata: metadataOf(row.metadata),
  };
}

/** Saved copies from before folders and the Active switch lack those fields. */
function withDefaults(source: Source): Source {
  return {
    ...source,
    folder: normalizeFolder(source.folder),
    isActive: source.isActive !== false,
    debateId: source.debateId ?? null,
    metadata: source.metadata ?? null,
  };
}

/**
 * Every read and write below also filters on the user. Row level security is
 * the real boundary; the filter keeps a wrong session from mixing accounts.
 */

/** One debate's sources, newest first, as the website's Library lists them by default. Offline, the saved copy. */
export function fetchSources(userId: string, debateId: string, mark?: CopyMark): Promise<Source[]> {
  return cachedRead(userId, 'sources', debateId, () => loadSources(userId, debateId), mark).then((sources) => sources.map(withDefaults));
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

export function fetchSource(userId: string, id: string, mark?: CopyMark): Promise<Source | null> {
  return cachedRead(userId, 'source', id, () => loadSource(userId, id), mark).then((source) => source && withDefaults(source));
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
 * Undo after a delete passes the old `id` and `createdAt`, so the row comes back in its place.
 */
export async function addSource(
  userId: string,
  input: {
    id?: string;
    createdAt?: number;
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
  const folder = normalizeFolder(input.folder);
  const folderResult = await supabase
    .from('source_folders')
    .upsert({ user_id: userId, name: folder }, { onConflict: 'user_id,name' });
  if (folderResult.error) throw new Error(folderResult.error.message);
  const { data, error } = await supabase
    .from('sources')
    .insert({
      ...(input.id ? { id: input.id, created_at: new Date(input.createdAt ?? Date.now()).toISOString() } : {}),
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
  if (error?.code === '23505') throw new DuplicateSourceError();
  if (error || !data) throw new Error(error?.message ?? 'Could not save the source');
  afterWrite(userId, [{ group: 'sources', key: input.debateId }, FOLDER_COPIES, ...debateListScopes(input.debateId, 'source')]);
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
  // The deleted row names its debate, whose Library and counts change. With no row, every Library may hold it.
  const deletedFrom = ((data ?? []) as { debate_id: string | null }[]).map((row) => row.debate_id);
  const libraries: CopyScope[] = deletedFrom.length > 0
    ? deletedFrom.flatMap((debate) => (debate ? [{ group: 'sources' as const, key: debate }] : []))
    : [{ group: 'sources' }];
  afterWrite(userId, [{ group: 'source', key: id }, ...libraries, FOLDER_COPIES, ...deletedListScopes(deletedFrom, 'source')]);
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

/** The Library's folder lists, one per debate; any folder change drops them all. */
const FOLDER_COPIES: CopyScope = { group: 'sources', prefix: 'folders:' };

/**
 * One debate's folders, as the website's Library lists them: the account's
 * folder names without those only other debates use, and every folder this
 * debate's sources are in. Offline, the saved copy.
 */
export function fetchFolders(userId: string, debateId: string, mark?: CopyMark): Promise<string[]> {
  return cachedRead(userId, 'sources', `folders:${debateId}`, () => loadFolders(userId, debateId), mark);
}

async function loadFolders(userId: string, debateId: string): Promise<string[]> {
  const [names, used] = await readAll([
    (async () => {
      const { data, error, status } = await supabase.from('source_folders').select('name').eq('user_id', userId).order('created_at', { ascending: true });
      if (error) throw readFailed(error, status);
      return ((data ?? []) as { name: string }[]).map((row) => row.name);
    })(),
    (async () => {
      const { data, error, status } = await supabase.from('sources').select('folder,debate_id').eq('user_id', userId);
      if (error) throw readFailed(error, status);
      return (data ?? []) as { folder: string | null; debate_id: string | null }[];
    })(),
  ]);
  return libraryFolders(
    [GENERAL_FOLDER, ...names],
    used.filter((row) => row.debate_id === debateId),
    used.filter((row) => row.debate_id !== debateId).map((row) => normalizeFolder(row.folder)),
  );
}

async function saveFolderName(userId: string, name: string) {
  const { error } = await supabase.from('source_folders').upsert({ user_id: userId, name }, { onConflict: 'user_id,name' });
  if (error) throw new Error(error.message);
}

/** Saves an empty folder, as the website's New folder does. */
export async function createFolder(userId: string, name: string): Promise<string> {
  const folder = normalizeFolder(name);
  await saveFolderName(userId, folder);
  afterWrite(userId, [FOLDER_COPIES]);
  notifySourcesChanged();
  return folder;
}

/** Whether a source outside this debate (another debate's, or an unsorted one) is in the folder. */
async function folderUsedElsewhere(userId: string, debateId: string, folder: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('sources')
    .select('id')
    .eq('user_id', userId)
    .eq('folder', folder)
    .or(`debate_id.is.null,debate_id.neq.${debateId}`)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** The copies a folder change touches: this debate's Library, every open source and the folder lists. */
function folderChangeScopes(debateId: string): CopyScope[] {
  return [{ group: 'sources', key: debateId }, { group: 'source' }, FOLDER_COPIES];
}

/**
 * Renames a folder, or merges it into one that exists, as the website does:
 * only this debate's sources move, and the old name stays while another debate uses it.
 */
export async function renameFolder(userId: string, debateId: string, oldName: string, newName: string): Promise<void> {
  const from = normalizeFolder(oldName);
  const to = normalizeFolder(newName);
  if (from === GENERAL_FOLDER || from === to) return;
  const usedElsewhere = await folderUsedElsewhere(userId, debateId, from);
  await saveFolderName(userId, to);
  const moved = await supabase.from('sources').update({ folder: to }).eq('user_id', userId).eq('debate_id', debateId).eq('folder', from);
  if (moved.error) throw new Error(moved.error.message);
  if (!usedElsewhere) {
    const removed = await supabase.from('source_folders').delete().eq('user_id', userId).eq('name', from);
    if (removed.error) throw new Error(removed.error.message);
  }
  afterWrite(userId, folderChangeScopes(debateId));
  notifySourcesChanged();
}

/** Deletes a folder; this debate's sources in it move to General, as on the website. */
export async function deleteFolder(userId: string, debateId: string, name: string): Promise<void> {
  const folder = normalizeFolder(name);
  if (folder === GENERAL_FOLDER) return;
  const usedElsewhere = await folderUsedElsewhere(userId, debateId, folder);
  const moved = await supabase.from('sources').update({ folder: GENERAL_FOLDER }).eq('user_id', userId).eq('debate_id', debateId).eq('folder', folder);
  if (moved.error) throw new Error(moved.error.message);
  if (!usedElsewhere) {
    const removed = await supabase.from('source_folders').delete().eq('user_id', userId).eq('name', folder);
    if (removed.error) throw new Error(removed.error.message);
  }
  afterWrite(userId, folderChangeScopes(debateId));
  notifySourcesChanged();
}

// Every change to whether sources are on reaches the server in the order the
// student made it, as the website's source switch queue does.
const activeWrites: SerialQueue = createSerialQueue();

/**
 * Turns sources on or off for AI grounding: one source's switch, or every
 * source shown in a folder (the website's Activate and Deactivate).
 */
export function setSourcesActive(userId: string, debateId: string, ids: string[], isActive: boolean): Promise<void> {
  if (ids.length === 0) return Promise.resolve();
  return activeWrites(async () => {
    const { error } = await supabase.from('sources').update({ is_active: isActive }).eq('user_id', userId).eq('debate_id', debateId).in('id', ids);
    if (error) throw new Error(error.message);
    afterWrite(userId, [{ group: 'sources', key: debateId }, ...ids.map((id) => ({ group: 'source' as const, key: id }))]);
  });
}

export type SourcePatch = Partial<Pick<Source, 'title' | 'content' | 'type' | 'origin' | 'folder' | 'isActive'>>;

/**
 * Saves the fields the student edited, and only those, as the website's
 * source sheet does, so a switch or research refresh meanwhile is kept.
 */
export async function updateSource(userId: string, debateId: string, id: string, patch: SourcePatch): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.title !== undefined && patch.title.trim()) row.title = patch.title.trim();
  if (patch.content !== undefined && patch.content.trim()) row.content = patch.content.trim();
  if (patch.type !== undefined) row.type = patch.type;
  if (patch.origin !== undefined) row.origin = patch.origin?.trim() || null;
  if (patch.folder !== undefined) row.folder = normalizeFolder(patch.folder);
  if (patch.isActive !== undefined) row.is_active = patch.isActive;
  if (Object.keys(row).length === 0) return;
  const write = async () => {
    if (typeof row.folder === 'string') await saveFolderName(userId, row.folder);
    const { error } = await supabase.from('sources').update(row).eq('user_id', userId).eq('debate_id', debateId).eq('id', id);
    if (error) throw new Error(error.message);
  };
  await (patch.isActive !== undefined ? activeWrites(write) : write());
  afterWrite(userId, [{ group: 'sources', key: debateId }, { group: 'source', key: id }, ...(row.folder ? [FOLDER_COPIES] : [])]);
  notifySourcesChanged();
}

/** Deletes every source in one debate's Library, as the website's Clear all does. Other debates keep theirs. */
export async function clearLibrary(userId: string, debateId: string): Promise<void> {
  const { error } = await supabase.from('sources').delete().eq('user_id', userId).eq('debate_id', debateId);
  if (error) throw new Error(error.message);
  afterWrite(userId, [{ group: 'source' }, ...folderChangeScopes(debateId), ...debateListScopes(debateId, 'source')]);
  notifySourcesChanged();
}

export class DuplicateSourceError extends Error {
  constructor() {
    super('This page is already in the debate Library.');
    this.name = 'DuplicateSourceError';
  }
}

/** Refresh research metadata while preserving the student's title, folder and active choice. */
export async function saveResearchedSource(userId: string, debateId: string, source: DiscoveredSource, capturedVia: string, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return false;
  const { data, error } = await supabase.from('sources')
    .select('id,origin,metadata,content').eq('user_id', userId).eq('debate_id', debateId);
  if (error) throw new Error(error.message);
  if (signal?.aborted) return false;
  const candidates = ((data ?? []) as { id: string; origin: string | null; metadata: Record<string, unknown> & { url?: string } | null; content: string }[])
    .map((row) => ({ ...row, origin: row.origin ?? undefined, metadata: row.metadata ?? undefined, debateId }));
  const existing = findSavedPage(candidates, debateId, source.url);
  const row = autoSavedSourceRow(source, capturedVia);
  if (existing) {
    const { error: updateError } = await supabase.from('sources').update({
      metadata: { ...existing.metadata, ...row.metadata },
      ...(!existing.content.trim() && source.content ? { content: source.content } : {}),
    }).eq('user_id', userId).eq('debate_id', debateId).eq('id', existing.id);
    if (updateError) throw new Error(updateError.message);
    afterWrite(userId, [{ group: 'sources', key: debateId }, { group: 'source', key: existing.id }, ...debateListScopes(debateId, 'source')]);
    notifySourcesChanged();
    return false;
  }
  try {
    await addSource(userId, { ...row, debateId });
    return true;
  } catch (cause) {
    if (cause instanceof DuplicateSourceError) return false;
    throw cause;
  }
}

/** The website rejects a URL that is already in the debate's Library. */
export function isDuplicateOrigin(sources: Source[], origin: string): boolean {
  const key = normalizeSourceUrl(origin);
  return key !== null && sources.some((source) => savedSourceUrl({ origin: source.origin ?? undefined }) === key);
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
