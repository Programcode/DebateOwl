import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Node, Edge } from 'reactflow';
import type { GenerateOutput, GenerateInput } from '../ai/schemas/generate';
import type { AttackOutput, AttackInput } from '../ai/schemas/attack';
import type { BrainstormOutput, BrainstormInput } from '../ai/schemas/brainstorm';
import type { FactoidsOutput, FactoidsInput } from '../ai/schemas/factoids';
import type { AskOutput } from '../ai/schemas/ask';
import { supabase } from '@/lib/supabase/client';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  output?: AskOutput | GenerateOutput | AttackOutput | BrainstormOutput | FactoidsOutput;
}

interface StreamingAskMessage {
  id: string;
  role: 'assistant';
  content: string;
  timestamp: number;
  isStreaming: true;
}

/** Auditable provenance for sources captured from AI research or imports. */
export interface SourceProvenance {
  url?: string;
  sourceType?: string;
  qualityScore?: number;
  qualityLabel?: 'strong' | 'moderate' | 'weak';
  query?: string;
  /** Which flow captured this source, e.g. 'generate' | 'brainstorm' | 'ask' | 'factoids'. */
  capturedVia?: string;
}

export interface Source {
  id: string;
  title: string;
  content: string;
  type: 'url' | 'file' | 'text';
  origin?: string;
  folder?: string;
  metadata?: SourceProvenance;
  createdAt: number;
  isActive: boolean;
}

interface SavedItem<T> {
  id: string;
  data: T;
  createdAt: number;
  title: string;
}

export interface FlowchartData {
  nodes: Node[]; // Keeping any for now to avoid ReactFlow dependency here, but could be stricter
  edges: Edge[];
}

interface SessionState {
  generateResult: GenerateOutput | null;
  generateLoading: boolean;

  attackResult: AttackOutput | null;
  attackLoading: boolean;

  brainstormResult: BrainstormOutput | null;
  brainstormLoading: boolean;

  factoidsResult: FactoidsOutput | null;
  factoidsLoading: boolean;

  askMessages: Message[];
  askLoading: boolean;
  askStreamingAssistant: StreamingAskMessage | null;

  savedCases: SavedItem<GenerateOutput>[];
  savedAttacks: SavedItem<AttackOutput>[];
  savedBrainstorms: SavedItem<BrainstormOutput>[];
  savedFactoids: SavedItem<FactoidsOutput>[];
  savedChats: SavedItem<Message[]>[];
  savedFlowcharts: SavedItem<FlowchartData>[];
  autosavedCases: SavedItem<GenerateOutput>[];
  autosavedAttacks: SavedItem<AttackOutput>[];
  autosavedBrainstorms: SavedItem<BrainstormOutput>[];
  autosavedFactoids: SavedItem<FactoidsOutput>[];
  sourceFolders: string[];
  sourceLibrary: Source[];

  // Persisted Form State
  generateForm: Partial<GenerateInput>;
  attackForm: Partial<AttackInput>;
  brainstormForm: Partial<BrainstormInput>;
  factoidsForm: Partial<FactoidsInput>;

  setGenerateForm: (data: Partial<GenerateInput>) => void;
  setAttackForm: (data: Partial<AttackInput>) => void;
  setBrainstormForm: (data: Partial<BrainstormInput>) => void;
  setFactoidsForm: (data: Partial<FactoidsInput>) => void;

  setGenerateResult: (result: GenerateOutput | null) => void;
  setGenerateLoading: (loading: boolean) => void;
  saveCurrentCase: (title: string) => Promise<void>;
  deleteSavedCase: (id: string) => Promise<void>;
  loadSavedCase: (id: string) => void;

  setAttackResult: (result: AttackOutput | null) => void;
  setAttackLoading: (loading: boolean) => void;
  saveCurrentAttack: (title: string) => Promise<void>;
  loadSavedAttack: (id: string) => void;

  setBrainstormResult: (result: BrainstormOutput | null) => void;
  setBrainstormLoading: (loading: boolean) => void;
  saveCurrentBrainstorm: (title: string) => Promise<void>;
  loadSavedBrainstorm: (id: string) => void;

  setFactoidsResult: (result: FactoidsOutput | null) => void;
  setFactoidsLoading: (loading: boolean) => void;
  saveCurrentFactoids: (title: string) => Promise<void>;
  loadSavedFactoids: (id: string) => void;

  addAskMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  setAskLoading: (loading: boolean) => void;
  setAskStreamingAssistant: (message: StreamingAskMessage | null) => void;
  appendAskStreamingDelta: (text: string) => void;
  clearAskMessages: () => void;
  saveCurrentChat: (title: string) => Promise<void>;
  loadSavedChat: (id: string) => void;

  saveFlowchart: (title: string, data: FlowchartData) => Promise<void>;
  deleteSavedFlowchart: (id: string) => Promise<void>;

  addSource: (source: Omit<Source, 'id' | 'createdAt' | 'isActive'> & { isActive?: boolean }) => Promise<void>;
  createSourceFolder: (folder: string) => Promise<void>;
  updateSource: (id: string, patch: Partial<Omit<Source, 'id' | 'createdAt'>>) => Promise<void>;
  renameSourceFolder: (oldName: string, newName: string) => Promise<void>;
  deleteSourceFolder: (name: string, mode: 'empty-only' | 'move-to-general') => Promise<void>;
  setFolderActive: (folder: string, isActive: boolean) => Promise<void>;
  removeSource: (id: string) => Promise<void>;
  toggleSource: (id: string) => Promise<void>;
  clearLibrary: () => Promise<void>;

  hydrateFromServer: () => Promise<void>;
  clearAllData: () => Promise<void>;
  resetLocalData: () => void;
  clearSession: () => void;

  pendingFlowchartData: FlowchartData | null;
  setPendingFlowchartData: (data: FlowchartData | null) => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

const toTimestamp = (value: string | number) => {
  if (typeof value === 'number') return value;
  return new Date(value).getTime();
};

function mergeFormState<T extends Record<string, unknown>>(current: Partial<T>, partial: Partial<T>): Partial<T> {
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(partial)) {
    const currentValue = next[key];
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      currentValue &&
      typeof currentValue === 'object' &&
      !Array.isArray(currentValue)
    ) {
      next[key] = { ...currentValue, ...value };
    } else {
      next[key] = value;
    }
  }
  return next as Partial<T>;
}

function settledData<T>(label: string, result: PromiseSettledResult<{ data?: T | null; error?: { message?: string } | null }>): T | null {
  if (result.status === 'rejected') {
    console.warn(`[SessionStore] Failed to hydrate ${label}:`, result.reason);
    return null;
  }
  if (result.value.error) {
    console.warn(`[SessionStore] Failed to hydrate ${label}:`, result.value.error.message || result.value.error);
    return null;
  }
  return result.value.data ?? null;
}

function mergeSavedItems<T>(localItems: SavedItem<T>[], serverItems: SavedItem<T>[]) {
  const merged = new Map<string, SavedItem<T>>();
  [...localItems, ...serverItems].forEach((item) => {
    merged.set(item.id, item);
  });
  return Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt);
}

function mergeSources(localSources: Source[], serverSources: Source[]) {
  const merged = new Map<string, Source>();
  [...localSources, ...serverSources].forEach((source) => {
    merged.set(source.id, { ...source, folder: normalizeFolder(source.folder) });
  });
  return Array.from(merged.values()).sort((a, b) => b.createdAt - a.createdAt);
}

function normalizeFolder(folder?: string | null) {
  const trimmed = folder?.trim();
  return trimmed || 'General';
}

function mergeSourceFolders(currentFolders: string[], sources: Source[] = []) {
  return Array.from(new Set([
    'General',
    ...currentFolders.map(normalizeFolder),
    ...sources.map((source) => normalizeFolder(source.folder)),
  ])).sort((a, b) => a.localeCompare(b));
}

async function getUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
}

type EqQuery = {
  eq: (column: string, value: unknown) => unknown;
};

async function applyUserScopedIdFilter(query: EqQuery, userId: string | null, id: string): Promise<unknown> {
  if (userId) {
    const scoped = query.eq('user_id', userId);
    if (scoped && typeof (scoped as EqQuery).eq === 'function') {
      return (scoped as EqQuery).eq('id', id);
    }
  }
  return query.eq('id', id);
}

async function applyUserScopedColumnFilter(query: EqQuery, userId: string | null, column: string, value: string): Promise<unknown> {
  if (userId) {
    const scoped = query.eq('user_id', userId);
    if (scoped && typeof (scoped as EqQuery).eq === 'function') {
      return (scoped as EqQuery).eq(column, value);
    }
  }
  return query.eq(column, value);
}

function throwOnWriteError(result: unknown, action: string): void {
  if (!result || typeof result !== 'object' || !('error' in result)) return;
  const error = (result as { error?: { message?: string } | null }).error;
  if (error) throw new Error(`[SessionStore] Failed to ${action}: ${error.message || 'Unknown error'}`);
}

interface SupabaseSavedRow<T> {
  id: string;
  title: string;
  output: T;
  created_at: string;
}

interface SupabaseFlowchartRow {
  id: string;
  title: string;
  nodes: Node[];
  edges: Edge[];
  created_at: string;
}

interface SupabaseChatRow {
  id: string;
  title: string;
  created_at: string;
}

interface SupabaseMessageRow {
  id: string;
  chat_id: string;
  role: 'user' | 'assistant';
  content: string;
  output: AskOutput | GenerateOutput | AttackOutput | BrainstormOutput | FactoidsOutput | null;
  created_at: string;
}

interface SupabaseSourceRow {
  id: string;
  title: string;
  content: string;
  type: 'url' | 'file' | 'text';
  origin: string | null;
  folder?: string | null;
  is_active: boolean;
  metadata?: unknown | null;
  created_at: string;
}

interface SupabaseSourceFolderRow {
  id: string;
  name: string;
  created_at: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSourceProvenance(value: unknown): SourceProvenance | undefined {
  if (!isRecord(value)) return undefined;

  const provenance: SourceProvenance = {};
  if (typeof value.url === 'string') provenance.url = value.url;
  if (typeof value.sourceType === 'string') provenance.sourceType = value.sourceType;
  if (typeof value.qualityScore === 'number' && Number.isFinite(value.qualityScore)) {
    provenance.qualityScore = value.qualityScore;
  }
  if (value.qualityLabel === 'strong' || value.qualityLabel === 'moderate' || value.qualityLabel === 'weak') {
    provenance.qualityLabel = value.qualityLabel;
  }
  if (typeof value.query === 'string') provenance.query = value.query;
  if (typeof value.capturedVia === 'string') provenance.capturedVia = value.capturedVia;

  return Object.keys(provenance).length > 0 ? provenance : undefined;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      generateResult: null as GenerateOutput | null,
      generateLoading: false,
      attackResult: null as AttackOutput | null,
      attackLoading: false,
      brainstormResult: null as BrainstormOutput | null,
      brainstormLoading: false,
      factoidsResult: null as FactoidsOutput | null,
      factoidsLoading: false,
      askMessages: [] as Message[],
      askLoading: false,
      askStreamingAssistant: null as StreamingAskMessage | null,

      savedCases: [] as SavedItem<GenerateOutput>[],
      savedAttacks: [] as SavedItem<AttackOutput>[],
      savedBrainstorms: [] as SavedItem<BrainstormOutput>[],
      savedFactoids: [] as SavedItem<FactoidsOutput>[],
      savedChats: [] as SavedItem<Message[]>[],
      savedFlowcharts: [] as SavedItem<FlowchartData>[],
      autosavedCases: [] as SavedItem<GenerateOutput>[],
      autosavedAttacks: [] as SavedItem<AttackOutput>[],
      autosavedBrainstorms: [] as SavedItem<BrainstormOutput>[],
      autosavedFactoids: [] as SavedItem<FactoidsOutput>[],
      sourceFolders: ['General'] as string[],
      sourceLibrary: [] as Source[],

      generateForm: {},
      attackForm: {},
      brainstormForm: {},
      factoidsForm: {},

      setGenerateForm: (data) => set((state) => ({ generateForm: mergeFormState(state.generateForm, data) })),
      setAttackForm: (data) => set((state) => ({ attackForm: mergeFormState(state.attackForm, data) })),
      setBrainstormForm: (data) => set((state) => ({ brainstormForm: mergeFormState(state.brainstormForm, data) })),
      setFactoidsForm: (data) => set((state) => ({ factoidsForm: mergeFormState(state.factoidsForm, data) })),

      pendingFlowchartData: null as FlowchartData | null,
      setPendingFlowchartData: (data) => set({ pendingFlowchartData: data }),

      addSource: async (source) => {
        const folder = normalizeFolder(source.folder);
        const isActive = source.isActive ?? true;
        const localItem: Source = { ...source, folder, id: generateId(), createdAt: Date.now(), isActive };
        const userId = await getUserId();
        if (!userId) {
          set((state) => ({
            sourceFolders: mergeSourceFolders(state.sourceFolders, [localItem]),
            sourceLibrary: [localItem, ...state.sourceLibrary],
          }));
          return;
        }

        const folderResult = await supabase
          .from('source_folders')
          .upsert({ user_id: userId, name: folder }, { onConflict: 'user_id,name' });
        throwOnWriteError(folderResult, 'save source folder');
        const { data, error } = await supabase
          .from('sources')
          .insert({
            user_id: userId,
            title: source.title,
            content: source.content,
            type: source.type,
            origin: source.origin || null,
            folder,
            is_active: isActive,
            metadata: source.metadata ?? null,
          })
          .select('*')
          .single();
        throwOnWriteError({ error }, 'save source');
        if (!data) throw new Error('[SessionStore] Failed to save source: No record returned');

        const savedSource: Source = {
          id: data.id,
          title: data.title,
          content: data.content,
          type: data.type,
          origin: data.origin || undefined,
          folder: normalizeFolder(data.folder || localItem.folder),
          metadata: parseSourceProvenance(data.metadata),
          isActive: data.is_active,
          createdAt: toTimestamp(data.created_at),
        };
        set((state) => ({
          sourceFolders: mergeSourceFolders(state.sourceFolders, [savedSource]),
          sourceLibrary: [savedSource, ...state.sourceLibrary],
        }));
      },
      createSourceFolder: async (folder) => {
        const normalized = normalizeFolder(folder);
        set((state) => ({
          sourceFolders: mergeSourceFolders([...state.sourceFolders, normalized], state.sourceLibrary),
        }));
        const userId = await getUserId();
        if (!userId) return;
        await supabase
          .from('source_folders')
          .upsert({ user_id: userId, name: normalized }, { onConflict: 'user_id,name' });
      },
      updateSource: async (id, patch) => {
        const current = get().sourceLibrary.find((s) => s.id === id);
        if (!current) return;

        const normalizedPatch: Partial<Omit<Source, 'id' | 'createdAt'>> = { ...patch };
        if (patch.folder !== undefined) {
          normalizedPatch.folder = normalizeFolder(patch.folder);
        }
        if (patch.origin !== undefined) {
          normalizedPatch.origin = patch.origin.trim() || undefined;
        }
        const nextSource: Source = {
          ...current,
          ...normalizedPatch,
          title: normalizedPatch.title?.trim() || current.title,
          content: normalizedPatch.content?.trim() || current.content,
        };

        const previousFolders = get().sourceFolders;
        set((state) => ({
          sourceFolders: mergeSourceFolders(state.sourceFolders, [nextSource]),
          sourceLibrary: state.sourceLibrary.map((source) => source.id === id ? nextSource : source),
        }));

        try {
          const userId = await getUserId();
          if (!userId) return;
          if (nextSource.folder) {
            const folderResult = await supabase
              .from('source_folders')
              .upsert({ user_id: userId, name: nextSource.folder }, { onConflict: 'user_id,name' });
            throwOnWriteError(folderResult, 'save source folder');
          }
          const result = await applyUserScopedIdFilter(
            supabase.from('sources').update({
              title: nextSource.title,
              content: nextSource.content,
              type: nextSource.type,
              origin: nextSource.origin || null,
              folder: nextSource.folder || 'General',
              is_active: nextSource.isActive,
            }),
            userId,
            id,
          );
          throwOnWriteError(result, 'update source');
        } catch (error) {
          set((state) => ({
            sourceFolders: previousFolders,
            sourceLibrary: state.sourceLibrary.map((source) => source.id === id ? current : source),
          }));
          throw error;
        }
      },
      renameSourceFolder: async (oldName, newName) => {
        const from = normalizeFolder(oldName);
        const to = normalizeFolder(newName);
        if (from === 'General' || from === to) return;

        const applyRename = (): void => {
          set((state) => {
            const renamedSources = state.sourceLibrary.map((source) =>
              normalizeFolder(source.folder) === from ? { ...source, folder: to } : source
            );
            return {
              sourceFolders: mergeSourceFolders(
                state.sourceFolders.map((folder) => normalizeFolder(folder) === from ? to : folder),
                renamedSources,
              ),
              sourceLibrary: renamedSources,
            };
          });
        };

        const userId = await getUserId();
        if (!userId) return applyRename();
        const folderResult = await supabase
          .from('source_folders')
          .upsert({ user_id: userId, name: to }, { onConflict: 'user_id,name' });
        throwOnWriteError(folderResult, 'create renamed source folder');
        throwOnWriteError(
          await applyUserScopedColumnFilter(supabase.from('sources').update({ folder: to }), userId, 'folder', from),
          'move sources to renamed folder',
        );
        throwOnWriteError(
          await applyUserScopedColumnFilter(supabase.from('source_folders').delete(), userId, 'name', from),
          'delete renamed source folder',
        );
        applyRename();
      },
      deleteSourceFolder: async (name, mode) => {
        const folder = normalizeFolder(name);
        if (folder === 'General') return;
        const affected = get().sourceLibrary.filter((source) => normalizeFolder(source.folder) === folder);
        if (affected.length > 0 && mode === 'empty-only') {
          throw new Error('Folder is not empty');
        }

        const applyDelete = (): void => {
          set((state) => ({
            sourceFolders: mergeSourceFolders(
              state.sourceFolders.filter((existing) => normalizeFolder(existing) !== folder),
              state.sourceLibrary.map((source) =>
                normalizeFolder(source.folder) === folder ? { ...source, folder: 'General' } : source
              ),
            ).filter((existing) => existing !== folder),
            sourceLibrary: state.sourceLibrary.map((source) =>
              normalizeFolder(source.folder) === folder ? { ...source, folder: 'General' } : source
            ),
          }));
        };

        const userId = await getUserId();
        if (!userId) return applyDelete();
        if (affected.length > 0) {
          throwOnWriteError(
            await applyUserScopedColumnFilter(supabase.from('sources').update({ folder: 'General' }), userId, 'folder', folder),
            'move sources from deleted folder',
          );
        }
        throwOnWriteError(
          await applyUserScopedColumnFilter(supabase.from('source_folders').delete(), userId, 'name', folder),
          'delete source folder',
        );
        applyDelete();
      },
      setFolderActive: async (folder, isActive) => {
        const normalized = normalizeFolder(folder);
        const userId = await getUserId();
        if (userId) {
          throwOnWriteError(
            await applyUserScopedColumnFilter(supabase.from('sources').update({ is_active: isActive }), userId, 'folder', normalized),
            'update source folder activity',
          );
        }
        set((state) => ({
          sourceLibrary: state.sourceLibrary.map((source) =>
            normalizeFolder(source.folder) === normalized ? { ...source, isActive } : source
          ),
        }));
      },
      removeSource: async (id) => {
        const userId = await getUserId();
        if (userId) {
          const result = await applyUserScopedIdFilter(supabase.from('sources').delete(), userId, id);
          throwOnWriteError(result, 'delete source');
        }
        set((state) => ({ sourceLibrary: state.sourceLibrary.filter((source) => source.id !== id) }));
      },
      toggleSource: async (id) => {
        const current = get().sourceLibrary.find((source) => source.id === id);
        if (!current) return;
        const nextValue = !current.isActive;
        const userId = await getUserId();
        if (userId) {
          throwOnWriteError(
            await applyUserScopedIdFilter(supabase.from('sources').update({ is_active: nextValue }), userId, id),
            'toggle source activity',
          );
        }
        set((state) => ({
          sourceLibrary: state.sourceLibrary.map((source) => source.id === id ? { ...source, isActive: nextValue } : source),
        }));
      },
      clearLibrary: async () => {
        const userId = await getUserId();
        if (!userId) {
          throw new Error('Cannot clear library: No authenticated user');
        }
        set({ sourceLibrary: [], sourceFolders: ['General'] });
        await supabase.from('sources').delete().eq('user_id', userId);
        await supabase.from('source_folders').delete().eq('user_id', userId);
        await supabase
          .from('source_folders')
          .upsert({ user_id: userId, name: 'General' }, { onConflict: 'user_id,name' });
      },

      setGenerateResult: (result) => {
        set({ generateResult: result });
        if (result) {
          const motion = get().generateForm?.motion || result.caseStructure?.thesis?.slice(0, 80) || 'Untitled';
          const item: SavedItem<GenerateOutput> = { id: generateId(), data: result, createdAt: Date.now(), title: motion };
          set((state) => ({ autosavedCases: [item, ...state.autosavedCases].slice(0, 3) }));
        }
      },
      setGenerateLoading: (loading) => set({ generateLoading: loading }),
      saveCurrentCase: async (title) => {
        const current = get().generateResult;
        if (!current) return;
        const localItem = { id: generateId(), data: current, createdAt: Date.now(), title };
        const userId = await getUserId();
        if (!userId) {
          set((state) => ({ savedCases: [localItem, ...state.savedCases] }));
          return;
        }
        const { data, error } = await supabase
          .from('cases')
          .insert({ user_id: userId, title, input: {}, output: current })
          .select('*')
          .single();
        throwOnWriteError({ error }, 'save case');
        if (!data) throw new Error('[SessionStore] Failed to save case: No record returned');
        const savedItem = { id: data.id, data: data.output, createdAt: toTimestamp(data.created_at), title: data.title };
        set((state) => ({ savedCases: [savedItem, ...state.savedCases] }));
      },
      deleteSavedCase: async (id) => {
        set((state) => ({ savedCases: state.savedCases.filter((c) => c.id !== id) }));
        const userId = await getUserId();
        await applyUserScopedIdFilter(supabase.from('cases').delete(), userId, id);
      },
      loadSavedCase: (id) => {
        const item = get().savedCases.find((c) => c.id === id);
        if (item) set({ generateResult: item.data });
      },

      setAttackResult: (result) => {
        set({ attackResult: result });
        if (result) {
          const item: SavedItem<AttackOutput> = { id: generateId(), data: result, createdAt: Date.now(), title: result.overallAssessment?.summary?.slice(0, 60) || 'Attack' };
          set((state) => ({ autosavedAttacks: [item, ...state.autosavedAttacks].slice(0, 3) }));
        }
      },
      setAttackLoading: (loading) => set({ attackLoading: loading }),
      saveCurrentAttack: async (title) => {
        const current = get().attackResult;
        if (!current) return;
        const localItem = { id: generateId(), data: current, createdAt: Date.now(), title };
        const userId = await getUserId();
        if (!userId) {
          set((state) => ({ savedAttacks: [localItem, ...state.savedAttacks] }));
          return;
        }
        const { data, error } = await supabase
          .from('attacks')
          .insert({ user_id: userId, title, input: {}, output: current })
          .select('*')
          .single();
        throwOnWriteError({ error }, 'save attack');
        if (!data) throw new Error('[SessionStore] Failed to save attack: No record returned');
        const savedItem = { id: data.id, data: data.output, createdAt: toTimestamp(data.created_at), title: data.title };
        set((state) => ({ savedAttacks: [savedItem, ...state.savedAttacks] }));
      },
      loadSavedAttack: (id) => {
        const item = get().savedAttacks.find((c) => c.id === id);
        if (item) set({ attackResult: item.data });
      },

      setBrainstormResult: (result) => {
        set({ brainstormResult: result });
        if (result) {
          const item: SavedItem<BrainstormOutput> = { id: generateId(), data: result, createdAt: Date.now(), title: 'Brainstorm' };
          set((state) => ({ autosavedBrainstorms: [item, ...state.autosavedBrainstorms].slice(0, 3) }));
        }
      },
      setBrainstormLoading: (loading) => set({ brainstormLoading: loading }),
      saveCurrentBrainstorm: async (title) => {
        const current = get().brainstormResult;
        if (!current) return;
        const localItem = { id: generateId(), data: current, createdAt: Date.now(), title };
        const userId = await getUserId();
        if (!userId) {
          set((state) => ({ savedBrainstorms: [localItem, ...state.savedBrainstorms] }));
          return;
        }
        const { data, error } = await supabase
          .from('brainstorms')
          .insert({ user_id: userId, title, input: {}, output: current })
          .select('*')
          .single();
        throwOnWriteError({ error }, 'save brainstorm');
        if (!data) throw new Error('[SessionStore] Failed to save brainstorm: No record returned');
        const savedItem = { id: data.id, data: data.output, createdAt: toTimestamp(data.created_at), title: data.title };
        set((state) => ({ savedBrainstorms: [savedItem, ...state.savedBrainstorms] }));
      },
      loadSavedBrainstorm: (id) => {
        const item = get().savedBrainstorms.find((c) => c.id === id);
        if (item) set({ brainstormResult: item.data });
      },

      setFactoidsResult: (result) => {
        set({ factoidsResult: result });
        if (result) {
          const item: SavedItem<FactoidsOutput> = { id: generateId(), data: result, createdAt: Date.now(), title: 'Factoids' };
          set((state) => ({ autosavedFactoids: [item, ...state.autosavedFactoids].slice(0, 3) }));
        }
      },
      setFactoidsLoading: (loading) => set({ factoidsLoading: loading }),
      saveCurrentFactoids: async (title) => {
        const current = get().factoidsResult;
        if (!current) return;
        const localItem = { id: generateId(), data: current, createdAt: Date.now(), title };
        const userId = await getUserId();
        if (!userId) {
          set((state) => ({ savedFactoids: [localItem, ...state.savedFactoids] }));
          return;
        }
        const { data, error } = await supabase
          .from('factoids')
          .insert({ user_id: userId, title, input: {}, output: current })
          .select('*')
          .single();
        throwOnWriteError({ error }, 'save factoids');
        if (!data) throw new Error('[SessionStore] Failed to save factoids: No record returned');
        const savedItem = { id: data.id, data: data.output, createdAt: toTimestamp(data.created_at), title: data.title };
        set((state) => ({ savedFactoids: [savedItem, ...state.savedFactoids] }));
      },
      loadSavedFactoids: (id) => {
        const item = get().savedFactoids.find((c) => c.id === id);
        if (item) set({ factoidsResult: item.data });
      },

      addAskMessage: (message) => set((state) => ({
        askMessages: [
          ...state.askMessages,
          { ...message, id: generateId(), timestamp: Date.now() },
        ],
      })),
      setAskLoading: (loading) => set({ askLoading: loading }),
      setAskStreamingAssistant: (message) => set({ askStreamingAssistant: message }),
      appendAskStreamingDelta: (text) => set((state) => ({
        askStreamingAssistant: state.askStreamingAssistant
          ? { ...state.askStreamingAssistant, content: `${state.askStreamingAssistant.content}${text}` }
          : state.askStreamingAssistant,
      })),
      clearAskMessages: () => set({ askMessages: [], askStreamingAssistant: null, askLoading: false }),
      saveCurrentChat: async (title) => {
        const current = get().askMessages;
        if (current.length === 0) return;
        const localItem = { id: generateId(), data: current, createdAt: Date.now(), title };
        const userId = await getUserId();
        if (!userId) {
          set((state) => ({ savedChats: [localItem, ...state.savedChats] }));
          return;
        }
        const { data: chat, error } = await supabase
          .from('chats')
          .insert({ user_id: userId, title })
          .select('*')
          .single();
        throwOnWriteError({ error }, 'save chat');
        if (!chat) throw new Error('[SessionStore] Failed to save chat: No record returned');

        const rows = current.map((message) => ({
          chat_id: chat.id,
          role: message.role,
          content: message.content,
          output: message.output || null,
          created_at: new Date(message.timestamp).toISOString(),
        }));
        const messagesResult = await supabase.from('messages').insert(rows);
        throwOnWriteError(messagesResult, 'save chat messages');
        const savedItem = { id: chat.id, data: current, createdAt: toTimestamp(chat.created_at), title: chat.title };
        set((state) => ({ savedChats: [savedItem, ...state.savedChats] }));
      },
      loadSavedChat: (id) => {
        const item = get().savedChats.find((c) => c.id === id);
        if (item) set({ askMessages: item.data });
      },

      saveFlowchart: async (title, data) => {
        const localItem = { id: generateId(), data, createdAt: Date.now(), title };
        const userId = await getUserId();
        if (!userId) {
          set((state) => ({ savedFlowcharts: [localItem, ...state.savedFlowcharts] }));
          return;
        }
        const { data: saved, error } = await supabase
          .from('flowcharts')
          .insert({
            user_id: userId,
            title,
            nodes: data.nodes,
            edges: data.edges,
          })
          .select('*')
          .single();
        throwOnWriteError({ error }, 'save flowchart');
        if (!saved) throw new Error('[SessionStore] Failed to save flowchart: No record returned');
        const savedItem = {
          id: saved.id,
          data: { nodes: saved.nodes, edges: saved.edges },
          createdAt: toTimestamp(saved.created_at),
          title: saved.title,
        };
        set((state) => ({ savedFlowcharts: [savedItem, ...state.savedFlowcharts] }));
      },

      deleteSavedFlowchart: async (id) => {
        set((state) => ({ savedFlowcharts: state.savedFlowcharts.filter((c) => c.id !== id) }));
        const userId = await getUserId();
        await applyUserScopedIdFilter(supabase.from('flowcharts').delete(), userId, id);
      },

      hydrateFromServer: async () => {
        const results = await Promise.allSettled([
          supabase.from('cases').select('*').order('created_at', { ascending: false }),
          supabase.from('attacks').select('*').order('created_at', { ascending: false }),
          supabase.from('brainstorms').select('*').order('created_at', { ascending: false }),
          supabase.from('factoids').select('*').order('created_at', { ascending: false }),
          supabase.from('chats').select('*').order('created_at', { ascending: false }),
          supabase.from('flowcharts').select('*').order('created_at', { ascending: false }),
          supabase.from('sources').select('*').order('created_at', { ascending: false }),
          supabase.from('source_folders').select('*').order('created_at', { ascending: true }),
        ]);

        const [
          casesRes,
          attacksRes,
          brainstormsRes,
          factoidsRes,
          chatsRes,
          flowchartsRes,
          sourcesRes,
          sourceFoldersRes,
        ] = results;

        const casesData = settledData<SupabaseSavedRow<GenerateOutput>[]>('cases', casesRes);
        const attacksData = settledData<SupabaseSavedRow<AttackOutput>[]>('attacks', attacksRes);
        const brainstormsData = settledData<SupabaseSavedRow<BrainstormOutput>[]>('brainstorms', brainstormsRes);
        const factoidsData = settledData<SupabaseSavedRow<FactoidsOutput>[]>('factoids', factoidsRes);
        const chatsData = settledData<SupabaseChatRow[]>('chats', chatsRes);
        const flowchartsData = settledData<SupabaseFlowchartRow[]>('flowcharts', flowchartsRes);
        const sourcesData = settledData<SupabaseSourceRow[]>('sources', sourcesRes);
        const sourceFoldersData = settledData<SupabaseSourceFolderRow[]>('source_folders', sourceFoldersRes);

        const chatRows = chatsData || [];
        const chatIds = chatRows.map((c) => c.id);
        const messagesRes = chatIds.length
          ? settledData<SupabaseMessageRow[]>('messages', await Promise.allSettled([
            supabase.from('messages').select('*').in('chat_id', chatIds).order('created_at', { ascending: true })
          ]).then(([result]) => result))
          : [];

        const caseRows = casesData || [];
        const serverCases = caseRows.map((row) => ({
          id: row.id,
          data: row.output,
          createdAt: toTimestamp(row.created_at),
          title: row.title,
        }));

        const attackRows = attacksData || [];
        const serverAttacks = attackRows.map((row) => ({
          id: row.id,
          data: row.output,
          createdAt: toTimestamp(row.created_at),
          title: row.title,
        }));

        const brainstormRows = brainstormsData || [];
        const serverBrainstorms = brainstormRows.map((row) => ({
          id: row.id,
          data: row.output,
          createdAt: toTimestamp(row.created_at),
          title: row.title,
        }));

        const factoidRows = factoidsData || [];
        const serverFactoids = factoidRows.map((row) => ({
          id: row.id,
          data: row.output,
          createdAt: toTimestamp(row.created_at),
          title: row.title,
        }));

        const flowchartRows = flowchartsData || [];
        const serverFlowcharts = flowchartRows.map((row) => ({
          id: row.id,
          data: { nodes: row.nodes, edges: row.edges },
          createdAt: toTimestamp(row.created_at),
          title: row.title,
        }));

        const messageMap = new Map<string, Message[]>();
        const messageRows = messagesRes || [];
        messageRows.forEach((row) => {
          const list = messageMap.get(row.chat_id) || [];
          list.push({
            id: row.id,
            role: row.role,
            content: row.content,
            timestamp: toTimestamp(row.created_at),
            output: row.output || undefined,
          });
          messageMap.set(row.chat_id, list);
        });

        const serverChats = chatRows.map((row) => ({
          id: row.id,
          title: row.title,
          createdAt: toTimestamp(row.created_at),
          data: messageMap.get(row.id) || [],
        }));

        const sourceRows = sourcesData || [];
        const sourceFolderRows = sourceFoldersData || [];
        const serverSources = sourceRows.map((row) => ({
          id: row.id,
          title: row.title,
          content: row.content,
          type: row.type,
          origin: row.origin || undefined,
          folder: normalizeFolder(row.folder),
          metadata: parseSourceProvenance(row.metadata),
          isActive: row.is_active,
          createdAt: toTimestamp(row.created_at),
        }));
        const serverSourceFolders = sourceFolderRows.map((row) => normalizeFolder(row.name));

        const hasServerData = [
          serverCases.length,
          serverAttacks.length,
          serverBrainstorms.length,
          serverFactoids.length,
          serverChats.length,
          serverFlowcharts.length,
          serverSources.length,
          serverSourceFolders.length,
        ].some((count) => count > 0);

        if (!hasServerData) return;

        set((state) => ({
          savedCases: mergeSavedItems(state.savedCases, serverCases),
          savedAttacks: mergeSavedItems(state.savedAttacks, serverAttacks),
          savedBrainstorms: mergeSavedItems(state.savedBrainstorms, serverBrainstorms),
          savedFactoids: mergeSavedItems(state.savedFactoids, serverFactoids),
          savedChats: mergeSavedItems(state.savedChats, serverChats),
          savedFlowcharts: mergeSavedItems(state.savedFlowcharts, serverFlowcharts),
          sourceFolders: mergeSourceFolders([...state.sourceFolders, ...serverSourceFolders], serverSources),
          sourceLibrary: mergeSources(state.sourceLibrary, serverSources),
        }));
      },

      clearAllData: async () => {
        // SAFETY: Get current user ID - abort if not authenticated
        const userId = await getUserId();
        if (!userId) {
          throw new Error('Cannot delete data: No authenticated user');
        }

        const { error } = await supabase.rpc('clear_current_user_data');
        throwOnWriteError({ error }, 'delete data');

        // Clear local state only after the atomic server erase succeeds.
        set({
          savedCases: [],
          savedAttacks: [],
          savedBrainstorms: [],
          savedFactoids: [],
          savedChats: [],
          savedFlowcharts: [],
          autosavedCases: [],
          autosavedAttacks: [],
          autosavedBrainstorms: [],
          autosavedFactoids: [],
          sourceFolders: ['General'],
          sourceLibrary: [],
        });
      },
      resetLocalData: () => set({
        savedCases: [],
        savedAttacks: [],
        savedBrainstorms: [],
        savedFactoids: [],
        savedChats: [],
        savedFlowcharts: [],
        sourceFolders: ['General'],
        sourceLibrary: [],
        generateResult: null,
        attackResult: null,
        brainstormResult: null,
        factoidsResult: null,
        askMessages: [],
        askStreamingAssistant: null,
      }),

      clearSession: () => set({
        generateResult: null,
        attackResult: null,
        brainstormResult: null,
        factoidsResult: null,
        askMessages: [],
        askStreamingAssistant: null,
        pendingFlowchartData: null,
        generateForm: {},
        attackForm: {},
        brainstormForm: {},
        factoidsForm: {},
      }),
    }),
    {
      name: 'debate-trainer-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: ({
        generateLoading,
        attackLoading,
        brainstormLoading,
        factoidsLoading,
        askLoading,
        askStreamingAssistant,
        pendingFlowchartData,
        ...persisted
      }) => persisted,
    }
  )
);
