import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Node, Edge } from 'reactflow';
import type { GenerateOutput, GenerateInput } from '../ai/schemas/generate';
import type { AttackOutput, AttackInput } from '../ai/schemas/attack';
import type { BrainstormOutput, BrainstormInput } from '../ai/schemas/brainstorm';
import type { FactoidsOutput, FactoidsInput } from '../ai/schemas/factoids';
import type { AskOutput } from '../ai/schemas/ask';
import { supabase } from '@/lib/supabase/client';
import i18n from '@/i18n';
import { activeDebateId, useDebateStore, type DebateSide } from './debate-store';
import { assessedSemantic, isAssessedSource, type SourceAssessmentUpdate } from '@debatelab/core/ai/source-assessments';

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
export interface SourceSemanticMetadata {
  relevance: number;
  importance: 0 | 1 | 2 | 3;
  strength: 0 | 1 | 2 | 3;
  evaluatedAt: string;
  useCount: number;
  caseUseCount: number;
  lastUsedAt?: string;
  lastUsedInCase?: boolean;
}

export interface SourceProvenance {
  url?: string;
  sourceType?: string;
  qualityScore?: number;
  qualityLabel?: 'strong' | 'moderate' | 'weak';
  query?: string;
  /** Which flow captured this source, e.g. 'generate' | 'brainstorm' | 'ask' | 'factoids'. */
  capturedVia?: string;
  semantic?: SourceSemanticMetadata;
}

export interface Source {
  id: string;
  title: string;
  content: string;
  type: 'url' | 'file' | 'text';
  origin?: string;
  folder?: string;
  metadata?: SourceProvenance;
  /** The one debate this source belongs to; null only for unsorted legacy sources. */
  debateId?: string | null;
  createdAt: number;
  isActive: boolean;
}

export interface SavedItem<T> {
  id: string;
  data: T;
  createdAt: number;
  title: string;
  /** Null for one-off work and unsorted legacy material. */
  debateId?: string | null;
  side?: DebateSide | null;
}

/** Tool results that DebateLab records automatically inside a debate. */
export type ResultKind = 'case' | 'attack' | 'brainstorm' | 'factoids' | 'crossfire';
/** Everything that can later be attached from one-off or Unsorted into a debate. */
export type AttachKind = ResultKind | 'chat' | 'flowchart' | 'source';

const RESULT_TABLES = {
  case: 'cases',
  attack: 'attacks',
  brainstorm: 'brainstorms',
  factoids: 'factoids',
  crossfire: 'crossfires',
} as const;

const RESULT_LISTS = {
  case: 'savedCases',
  attack: 'savedAttacks',
  brainstorm: 'savedBrainstorms',
  factoids: 'savedFactoids',
  crossfire: 'savedCrossfires',
} as const;

const ATTACH_LISTS = { ...RESULT_LISTS, chat: 'savedChats', flowchart: 'savedFlowcharts', source: 'sourceLibrary' } as const;

export interface RecordResultInput {
  title: string;
  input: unknown;
  output: unknown;
  debateId: string;
  side: DebateSide;
}

export interface FlowchartData {
  nodes: Node[]; // Keeping any for now to avoid ReactFlow dependency here, but could be stricter
  edges: Edge[];
}

export interface SessionState {
  generateResult: GenerateOutput | null;
  generateLoading: boolean;
  /** The Generate section being regenerated; kept here so it survives leaving the page. */
  generateRegeneratingSection: string | null;

  attackResult: AttackOutput | null;
  attackLoading: boolean;

  brainstormResult: BrainstormOutput | null;
  brainstormLoading: boolean;

  factoidsResult: FactoidsOutput | null;
  factoidsLoading: boolean;

  askMessages: Message[];
  askLoading: boolean;
  askStreamingAssistant: StreamingAskMessage | null;
  /** Server chat that the current Ask conversation is being recorded into. */
  askChatId: string | null;
  /** Debate that `askChatId` belongs to; null for an unsorted chat. */
  askChatDebateId: string | null;
  askPersistedCount: number;

  savedCases: SavedItem<GenerateOutput>[];
  savedAttacks: SavedItem<AttackOutput>[];
  savedBrainstorms: SavedItem<BrainstormOutput>[];
  savedFactoids: SavedItem<FactoidsOutput>[];
  savedChats: SavedItem<Message[]>[];
  savedFlowcharts: SavedItem<FlowchartData>[];
  savedCrossfires: SavedItem<unknown>[];
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
  setGenerateRegeneratingSection: (section: string | null) => void;
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

  saveFlowchart: (title: string, data: FlowchartData, debateId?: string | null) => Promise<void>;

  recordResult: (kind: ResultKind, input: RecordResultInput) => Promise<string>;
  updateRecordedResult: (kind: ResultKind, id: string, output: unknown) => Promise<void>;
  attachItem: (kind: AttachKind, id: string, debateId: string, side?: DebateSide) => Promise<void>;
  /** Records new Ask messages: into the loaded chat, or a new chat in `debateId`. */
  syncAskChat: (debateId: string | null) => Promise<void>;
  deleteSavedFlowchart: (id: string) => Promise<void>;

  addSource: (source: Omit<Source, 'id' | 'createdAt' | 'isActive'> & { isActive?: boolean }) => Promise<void>;
  createSourceFolder: (folder: string) => Promise<void>;
  updateSource: (id: string, patch: Partial<Omit<Source, 'id' | 'createdAt'>>) => Promise<void>;
  applySourceAssessments: (assessments: SourceAssessmentUpdate[]) => Promise<void>;
  renameSourceFolder: (oldName: string, newName: string) => Promise<void>;
  deleteSourceFolder: (name: string, mode: 'empty-only' | 'move-to-general') => Promise<void>;
  setFolderActive: (folder: string, isActive: boolean) => Promise<void>;
  removeSource: (id: string) => Promise<void>;
  toggleSource: (id: string) => Promise<void>;
  clearLibrary: () => Promise<void>;

  hydrateFromServer: () => Promise<void>;
  /**
   * This page load's server hydration: `partial` when a saved-result list
   * failed to load and may be missing results. Not persisted.
   */
  serverHydration: 'pending' | 'partial' | 'complete';
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

interface DebateColumns {
  debate_id?: string | null;
  side?: DebateSide | null;
}

interface SupabaseSavedRow<T> extends DebateColumns {
  id: string;
  title: string;
  output: T;
  created_at: string;
}

interface SupabaseFlowchartRow extends DebateColumns {
  id: string;
  title: string;
  nodes: Node[];
  edges: Edge[];
  created_at: string;
}

interface SupabaseChatRow extends DebateColumns {
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
  debate_id?: string | null;
  created_at: string;
}

interface SupabaseSourceFolderRow {
  id: string;
  name: string;
  created_at: string;
}

/** Thrown when a source would be saved without a debate to belong to. */
export class DebateRequiredError extends Error {
  constructor() {
    super('Select or create a debate before adding sources');
    this.name = 'DebateRequiredError';
  }
}

function savedFromRow<T>(row: SupabaseSavedRow<T>): SavedItem<T> {
  return {
    id: row.id,
    data: row.output,
    createdAt: toTimestamp(row.created_at),
    title: row.title,
    debateId: row.debate_id ?? null,
    side: row.side ?? null,
  };
}

function markDebateActivity(debateId: string | null | undefined) {
  if (debateId) useDebateStore.getState().markActivity(debateId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseSourceProvenance(value: unknown): SourceProvenance | undefined {
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
  if (isRecord(value.semantic)) {
    const semantic = value.semantic;
    const relevance = semantic.relevance;
    const importance = semantic.importance;
    const strength = semantic.strength;
    const evaluatedAt = semantic.evaluatedAt;
    const useCount = semantic.useCount;
    const caseUseCount = semantic.caseUseCount;
    if (
      typeof relevance === 'number' && Number.isFinite(relevance) && relevance >= 0 && relevance <= 1 &&
      Number.isInteger(importance) && typeof importance === 'number' && importance >= 0 && importance <= 3 &&
      Number.isInteger(strength) && typeof strength === 'number' && strength >= 0 && strength <= 3 &&
      typeof evaluatedAt === 'string' && Number.isFinite(Date.parse(evaluatedAt)) &&
      Number.isInteger(useCount) && typeof useCount === 'number' && useCount >= 0 &&
      Number.isInteger(caseUseCount) && typeof caseUseCount === 'number' && caseUseCount >= 0 &&
      (semantic.lastUsedAt === undefined || typeof semantic.lastUsedAt === 'string') &&
      (semantic.lastUsedInCase === undefined || typeof semantic.lastUsedInCase === 'boolean')
    ) {
      provenance.semantic = {
        relevance,
        importance: importance as 0 | 1 | 2 | 3,
        strength: strength as 0 | 1 | 2 | 3,
        evaluatedAt,
        useCount,
        caseUseCount,
        ...(typeof semantic.lastUsedAt === 'string' ? { lastUsedAt: semantic.lastUsedAt } : {}),
        ...(typeof semantic.lastUsedInCase === 'boolean' ? { lastUsedInCase: semantic.lastUsedInCase } : {}),
      };
    }
  }

  return Object.keys(provenance).length > 0 ? provenance : undefined;
}

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      generateResult: null as GenerateOutput | null,
      generateLoading: false,
      generateRegeneratingSection: null as string | null,
      attackResult: null as AttackOutput | null,
      attackLoading: false,
      brainstormResult: null as BrainstormOutput | null,
      brainstormLoading: false,
      factoidsResult: null as FactoidsOutput | null,
      factoidsLoading: false,
      askMessages: [] as Message[],
      askLoading: false,
      askStreamingAssistant: null as StreamingAskMessage | null,
      askChatId: null as string | null,
      askChatDebateId: null as string | null,
      askPersistedCount: 0,

      savedCases: [] as SavedItem<GenerateOutput>[],
      savedAttacks: [] as SavedItem<AttackOutput>[],
      savedBrainstorms: [] as SavedItem<BrainstormOutput>[],
      savedFactoids: [] as SavedItem<FactoidsOutput>[],
      savedChats: [] as SavedItem<Message[]>[],
      savedFlowcharts: [] as SavedItem<FlowchartData>[],
      savedCrossfires: [] as SavedItem<unknown>[],
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
      serverHydration: 'pending',
      setPendingFlowchartData: (data) => set({ pendingFlowchartData: data }),

      addSource: async (source) => {
        const folder = normalizeFolder(source.folder);
        const isActive = source.isActive ?? true;
        // An omitted debate means the tool's scope, which is none in one-off mode.
        const debateId = source.debateId !== undefined ? source.debateId : activeDebateId();
        if (!debateId) throw new DebateRequiredError();
        const localItem: Source = { ...source, folder, debateId, id: generateId(), createdAt: Date.now(), isActive };
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
            debate_id: debateId,
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
          debateId: data.debate_id ?? debateId,
          isActive: data.is_active,
          createdAt: toTimestamp(data.created_at),
        };
        set((state) => ({
          sourceFolders: mergeSourceFolders(state.sourceFolders, [savedSource]),
          sourceLibrary: [savedSource, ...state.sourceLibrary],
        }));
        markDebateActivity(debateId);
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
              metadata: nextSource.metadata ?? null,
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
      applySourceAssessments: async (assessments) => {
        if (assessments.length === 0) return;
        const previous = get().sourceLibrary;
        const debateId = activeDebateId();
        if (!debateId) return;
        // A URL can be saved in several debates; only this debate's copy was used.
        const candidates = previous.filter((source) => source.debateId === debateId);
        const updates = new Map<string, Source>();
        for (const assessment of assessments.slice(0, 10)) {
          const source = candidates.find((candidate) => isAssessedSource(candidate, assessment));
          if (!source) continue;
          updates.set(source.id, {
            ...source,
            metadata: { ...source.metadata, semantic: assessedSemantic(source.metadata?.semantic, assessment) },
          });
        }
        if (updates.size === 0) return;
        set((state) => ({ sourceLibrary: state.sourceLibrary.map((source) => updates.get(source.id) ?? source) }));
        try {
          const userId = await getUserId();
          if (!userId) return;
          await Promise.all(Array.from(updates.values()).map(async (source) => {
            const result = await applyUserScopedIdFilter(
              supabase.from('sources').update({ metadata: source.metadata ?? null }),
              userId,
              source.id,
            );
            throwOnWriteError(result, 'update source assessment');
          }));
        } catch (error) {
          set({ sourceLibrary: previous });
          throw error;
        }
      },
      // Folders are per account, but renaming or deleting one only moves the
      // Current Debate's sources. The folder name survives while another debate uses it.
      renameSourceFolder: async (oldName, newName) => {
        const from = normalizeFolder(oldName);
        const to = normalizeFolder(newName);
        if (from === 'General' || from === to) return;
        const debateId = useDebateStore.getState().currentDebateId;
        if (!debateId) throw new DebateRequiredError();
        const inThisDebate = (source: Source) => source.debateId === debateId && normalizeFolder(source.folder) === from;
        const usedElsewhere = get().sourceLibrary.some((source) => source.debateId !== debateId && normalizeFolder(source.folder) === from);

        const applyRename = (): void => {
          set((state) => {
            const renamedSources = state.sourceLibrary.map((source) => inThisDebate(source) ? { ...source, folder: to } : source);
            const folders = usedElsewhere
              ? [...state.sourceFolders, to]
              : state.sourceFolders.map((folder) => normalizeFolder(folder) === from ? to : folder);
            return { sourceFolders: mergeSourceFolders(folders, renamedSources), sourceLibrary: renamedSources };
          });
        };

        const userId = await getUserId();
        if (!userId) return applyRename();
        const folderResult = await supabase
          .from('source_folders')
          .upsert({ user_id: userId, name: to }, { onConflict: 'user_id,name' });
        throwOnWriteError(folderResult, 'create renamed source folder');
        throwOnWriteError(
          await supabase.from('sources').update({ folder: to }).eq('user_id', userId).eq('debate_id', debateId).eq('folder', from),
          'move sources to renamed folder',
        );
        if (!usedElsewhere) {
          throwOnWriteError(
            await applyUserScopedColumnFilter(supabase.from('source_folders').delete(), userId, 'name', from),
            'delete renamed source folder',
          );
        }
        applyRename();
      },
      deleteSourceFolder: async (name, mode) => {
        const folder = normalizeFolder(name);
        if (folder === 'General') return;
        const debateId = useDebateStore.getState().currentDebateId;
        if (!debateId) throw new DebateRequiredError();
        const inThisDebate = (source: Source) => source.debateId === debateId && normalizeFolder(source.folder) === folder;
        const affected = get().sourceLibrary.filter(inThisDebate);
        const usedElsewhere = get().sourceLibrary.some((source) => source.debateId !== debateId && normalizeFolder(source.folder) === folder);
        if (affected.length > 0 && mode === 'empty-only') {
          throw new Error('Folder is not empty');
        }

        const applyDelete = (): void => {
          set((state) => {
            const movedSources = state.sourceLibrary.map((source) => inThisDebate(source) ? { ...source, folder: 'General' } : source);
            const folders = mergeSourceFolders(state.sourceFolders, movedSources);
            return {
              sourceFolders: usedElsewhere ? folders : folders.filter((existing) => normalizeFolder(existing) !== folder),
              sourceLibrary: movedSources,
            };
          });
        };

        const userId = await getUserId();
        if (!userId) return applyDelete();
        if (affected.length > 0) {
          throwOnWriteError(
            await supabase.from('sources').update({ folder: 'General' }).eq('user_id', userId).eq('debate_id', debateId).eq('folder', folder),
            'move sources from deleted folder',
          );
        }
        if (!usedElsewhere) {
          throwOnWriteError(
            await applyUserScopedColumnFilter(supabase.from('source_folders').delete(), userId, 'name', folder),
            'delete source folder',
          );
        }
        applyDelete();
      },
      setFolderActive: async (folder, isActive) => {
        const normalized = normalizeFolder(folder);
        const debateId = useDebateStore.getState().currentDebateId;
        if (!debateId) throw new DebateRequiredError();
        const userId = await getUserId();
        if (userId) {
          throwOnWriteError(
            await supabase.from('sources').update({ is_active: isActive })
              .eq('user_id', userId).eq('debate_id', debateId).eq('folder', normalized),
            'update source folder activity',
          );
        }
        set((state) => ({
          sourceLibrary: state.sourceLibrary.map((source) =>
            source.debateId === debateId && normalizeFolder(source.folder) === normalized ? { ...source, isActive } : source
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
        // The Library belongs to the Current Debate; other debates keep their sources.
        // Read it before any wait so a switch mid-clear cannot redirect the delete.
        const debateId = useDebateStore.getState().currentDebateId;
        if (!debateId) throw new DebateRequiredError();
        const userId = await getUserId();
        if (!userId) {
          throw new Error('Cannot clear library: No authenticated user');
        }
        throwOnWriteError(
          await supabase.from('sources').delete().eq('user_id', userId).eq('debate_id', debateId),
          'clear debate sources',
        );
        set((state) => ({ sourceLibrary: state.sourceLibrary.filter((source) => source.debateId !== debateId) }));
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
      setGenerateRegeneratingSection: (section) => set({ generateRegeneratingSection: section }),
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
          const item: SavedItem<BrainstormOutput> = { id: generateId(), data: result, createdAt: Date.now(), title: i18n.t('generatedArtifacts.brainstormTitle') };
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
          const item: SavedItem<FactoidsOutput> = { id: generateId(), data: result, createdAt: Date.now(), title: i18n.t('generatedArtifacts.factoidsTitle') };
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
      clearAskMessages: () => set({ askMessages: [], askStreamingAssistant: null, askLoading: false, askChatId: null, askChatDebateId: null, askPersistedCount: 0 }),
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
        // Continuing a chat appends to it where it already lives; an unsorted
        // chat stays unsorted until the user attaches it.
        if (item) set({ askMessages: item.data, askChatId: item.id, askChatDebateId: item.debateId ?? null, askPersistedCount: item.data.length });
      },

      saveFlowchart: async (title, data, debateId = activeDebateId()) => {
        const localItem = { id: generateId(), data, createdAt: Date.now(), title, debateId, side: 'neutral' as const };
        const userId = await getUserId();
        if (!userId) {
          set((state) => ({ savedFlowcharts: [localItem, ...state.savedFlowcharts] }));
          return;
        }
        const { data: saved, error } = await supabase
          .from('flowcharts')
          .insert({
            user_id: userId,
            debate_id: debateId,
            side: 'neutral',
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
          debateId: saved.debate_id ?? null,
          side: saved.side ?? null,
        };
        set((state) => ({ savedFlowcharts: [savedItem, ...state.savedFlowcharts] }));
        markDebateActivity(debateId);
      },

      recordResult: async (kind, { title, input, output, debateId, side }) => {
        const userId = await getUserId();
        if (!userId) throw new Error('[SessionStore] Sign in to save results to a debate');
        const { data, error } = await supabase
          .from(RESULT_TABLES[kind])
          .insert({ user_id: userId, debate_id: debateId, side, title: title.slice(0, 300) || 'Untitled', input: input ?? {}, output })
          .select('id,title,output,created_at,debate_id,side')
          .single();
        throwOnWriteError({ error }, `save ${kind} to debate`);
        if (!data) throw new Error(`[SessionStore] Failed to save ${kind}: No record returned`);
        const item = savedFromRow(data as SupabaseSavedRow<unknown>);
        const list = RESULT_LISTS[kind];
        set((state) => ({ [list]: [item, ...(state[list] as SavedItem<unknown>[])] }) as Partial<SessionState>);
        markDebateActivity(debateId);
        return item.id;
      },

      updateRecordedResult: async (kind, id, output) => {
        const userId = await getUserId();
        if (!userId) return;
        throwOnWriteError(
          await applyUserScopedIdFilter(supabase.from(RESULT_TABLES[kind]).update({ output }), userId, id),
          `update ${kind}`,
        );
        const list = RESULT_LISTS[kind];
        set((state) => ({
          [list]: (state[list] as SavedItem<unknown>[]).map((item) => item.id === id ? { ...item, data: output } : item),
        }) as Partial<SessionState>);
      },

      attachItem: async (kind, id, debateId, side) => {
        const { error } = await supabase.rpc('attach_to_debate', {
          p_kind: kind,
          p_id: id,
          p_debate_id: debateId,
          ...(side ? { p_side: side } : {}),
        });
        throwOnWriteError({ error }, `attach ${kind} to debate`);
        const list = ATTACH_LISTS[kind];
        set((state) => ({
          [list]: (state[list] as Array<{ id: string; side?: DebateSide | null }>).map((item) =>
            item.id === id ? { ...item, debateId, ...(kind !== 'source' ? { side: side ?? item.side ?? null } : {}) } : item),
        }) as Partial<SessionState>);
        markDebateActivity(debateId);
      },

      syncAskChat: (debateId): Promise<void> => {
        // Serialized so two quick replies cannot create two chats.
        askSyncQueue = askSyncQueue.catch((): void => undefined).then((): Promise<void> => syncAskChatNow(debateId));
        return askSyncQueue;
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
          supabase.from('crossfires').select('id,title,output,created_at,debate_id,side').order('created_at', { ascending: false }),
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
          crossfiresRes,
        ] = results;

        const casesData = settledData<SupabaseSavedRow<GenerateOutput>[]>('cases', casesRes);
        const attacksData = settledData<SupabaseSavedRow<AttackOutput>[]>('attacks', attacksRes);
        const brainstormsData = settledData<SupabaseSavedRow<BrainstormOutput>[]>('brainstorms', brainstormsRes);
        const factoidsData = settledData<SupabaseSavedRow<FactoidsOutput>[]>('factoids', factoidsRes);
        const chatsData = settledData<SupabaseChatRow[]>('chats', chatsRes);
        const flowchartsData = settledData<SupabaseFlowchartRow[]>('flowcharts', flowchartsRes);
        const sourcesData = settledData<SupabaseSourceRow[]>('sources', sourcesRes);
        const sourceFoldersData = settledData<SupabaseSourceFolderRow[]>('source_folders', sourceFoldersRes);
        const crossfiresData = settledData<SupabaseSavedRow<unknown>[]>('crossfires', crossfiresRes);

        const chatRows = chatsData || [];
        const chatIds = chatRows.map((c) => c.id);
        const messagesRes = chatIds.length
          ? settledData<SupabaseMessageRow[]>('messages', await Promise.allSettled([
            supabase.from('messages').select('*').in('chat_id', chatIds).order('created_at', { ascending: true })
          ]).then(([result]) => result))
          : [];

        const flowchartRows = flowchartsData || [];
        const serverFlowcharts = flowchartRows.map((row) => ({
          id: row.id,
          data: { nodes: row.nodes, edges: row.edges },
          createdAt: toTimestamp(row.created_at),
          title: row.title,
          debateId: row.debate_id ?? null,
          side: row.side ?? null,
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
          debateId: row.debate_id ?? null,
          side: row.side ?? null,
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
          debateId: row.debate_id ?? null,
          isActive: row.is_active,
          createdAt: toTimestamp(row.created_at),
        }));
        const serverSourceFolders = sourceFolderRows.map((row) => normalizeFolder(row.name));

        // The server is the source of truth for signed-in users. Replacing (not
        // merging) keeps purged legacy rows and other accounts' rows out of
        // debates; a list whose query failed keeps its last known state.
        set((state) => ({
          savedCases: casesData ? casesData.map(savedFromRow) : state.savedCases,
          savedAttacks: attacksData ? attacksData.map(savedFromRow) : state.savedAttacks,
          savedBrainstorms: brainstormsData ? brainstormsData.map(savedFromRow) : state.savedBrainstorms,
          savedFactoids: factoidsData ? factoidsData.map(savedFromRow) : state.savedFactoids,
          savedCrossfires: crossfiresData ? crossfiresData.map(savedFromRow) : state.savedCrossfires,
          savedChats: chatsData ? serverChats : state.savedChats,
          savedFlowcharts: flowchartsData ? serverFlowcharts : state.savedFlowcharts,
          sourceFolders: mergeSourceFolders([...(sourceFoldersData ? [] : state.sourceFolders), ...serverSourceFolders], sourcesData ? serverSources : state.sourceLibrary),
          sourceLibrary: sourcesData ? serverSources : state.sourceLibrary,
          serverHydration: casesData && attacksData && brainstormsData && factoidsData && chatsData && crossfiresData ? 'complete' : 'partial',
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
          savedCrossfires: [],
          autosavedCases: [],
          autosavedAttacks: [],
          autosavedBrainstorms: [],
          autosavedFactoids: [],
          sourceFolders: ['General'],
          sourceLibrary: [],
          askChatId: null,
          askChatDebateId: null,
          askPersistedCount: 0,
        });
      },
      resetLocalData: () => set({
        serverHydration: 'pending',
        savedCases: [],
        savedAttacks: [],
        savedBrainstorms: [],
        savedFactoids: [],
        savedChats: [],
        savedFlowcharts: [],
        savedCrossfires: [],
        autosavedCases: [],
        autosavedAttacks: [],
        autosavedBrainstorms: [],
        autosavedFactoids: [],
        askChatId: null,
        askChatDebateId: null,
        askPersistedCount: 0,
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
        askChatId: null,
        askChatDebateId: null,
        askPersistedCount: 0,
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
      // v1 scopes saved work and sources to debates. Drop lists persisted by
      // older clients: the server replaces them on hydrate, and keeping them
      // would resurrect purged legacy rows and debate-less sources.
      version: 1,
      migrate: (persistedState) => {
        const state = { ...(persistedState as Record<string, unknown>) };
        for (const key of [
          'savedCases', 'savedAttacks', 'savedBrainstorms', 'savedFactoids', 'savedChats', 'savedFlowcharts',
          'autosavedCases', 'autosavedAttacks', 'autosavedBrainstorms', 'autosavedFactoids', 'sourceLibrary', 'sourceFolders',
          // An open pre-upgrade conversation would otherwise be copied into the first debate.
          'askMessages',
        ]) delete state[key];
        return state as unknown as SessionState;
      },
      partialize: ({
        generateLoading,
        generateRegeneratingSection,
        attackLoading,
        brainstormLoading,
        factoidsLoading,
        askLoading,
        askStreamingAssistant,
        pendingFlowchartData,
        serverHydration,
        ...persisted
      }) => persisted,
    }
  )
);

let askSyncQueue: Promise<void> = Promise.resolve();

async function syncAskChatNow(debateId: string | null): Promise<void> {
  const get = useSessionStore.getState;
  const set = useSessionStore.setState;
  const { askMessages, askChatId, askChatDebateId, askPersistedCount } = get();
  if (askMessages.length === 0 || askPersistedCount >= askMessages.length) return;
  if (!askChatId && !debateId) return;
  const userId = await getUserId();
  if (!userId) return;
  // Clearing or replacing the conversation while a write is in flight must not
  // hand this chat or its count to the next conversation.
  const sameConversation = () => {
    const current = get().askMessages;
    return askMessages.every((message, index) => current[index] === message);
  };
  let chatId = askChatId;
  let chatDebateId = askChatId ? askChatDebateId : debateId;
  if (!chatId) {
    const title = askMessages.find((message) => message.role === 'user')?.content.slice(0, 60) || 'Chat';
    const { data: chat, error } = await supabase
      .from('chats')
      .insert({ user_id: userId, debate_id: debateId, side: 'neutral', title })
      .select('id,title,created_at,debate_id,side')
      .single();
    throwOnWriteError({ error }, 'save chat to debate');
    if (!chat) throw new Error('[SessionStore] Failed to save chat: No record returned');
    chatId = chat.id as string;
    chatDebateId = debateId;
    set((state) => ({
      ...(sameConversation() ? { askChatId: chatId, askChatDebateId: debateId } : {}),
      savedChats: [{ id: chatId!, title: chat.title, createdAt: toTimestamp(chat.created_at), data: askMessages, debateId, side: 'neutral' }, ...state.savedChats],
    }));
  }
  const pending = askMessages.slice(askPersistedCount);
  const result = await supabase.from('messages').insert(pending.map((message) => ({
    chat_id: chatId,
    role: message.role,
    content: message.content,
    output: message.output || null,
    created_at: new Date(message.timestamp).toISOString(),
  })));
  throwOnWriteError(result, 'save chat messages');
  set((state) => ({
    ...(state.askChatId === chatId && sameConversation() ? { askPersistedCount: askPersistedCount + pending.length } : {}),
    savedChats: state.savedChats.map((chat) => chat.id === chatId ? { ...chat, data: askMessages } : chat),
  }));
  markDebateActivity(chatDebateId);
}

function removedDebateIds(debates: Array<{ id: string }>, previous: Array<{ id: string }>): Set<string> {
  return new Set(previous.filter((debate) => !debates.some((next) => next.id === debate.id)).map((debate) => debate.id));
}

// A change of scope (another debate, or one-off mode on or off) starts a fresh
// Ask conversation, and a deleted debate takes its local work with it (the
// server already cascaded it).
const askScope = (state: { oneOff: boolean; currentDebateId: string | null }) => state.oneOff ? null : state.currentDebateId;
useDebateStore.subscribe((state, previous) => {
  const removed = removedDebateIds(state.debates, previous.debates);
  const session = useSessionStore.getState();
  const scope = askScope(state);
  const openChatStays = session.askChatId !== null && session.askChatDebateId !== null
    && session.askChatDebateId === scope && !removed.has(session.askChatDebateId);
  const leftAskScope = session.askMessages.length > 0 && !openChatStays
    && (scope !== askScope(previous) || (session.askChatDebateId !== null && removed.has(session.askChatDebateId)));
  if (removed.size === 0 && !leftAskScope) return;
  const keep = <T extends { debateId?: string | null }>(list: T[]) => list.filter((item) => !item.debateId || !removed.has(item.debateId));
  useSessionStore.setState((current) => ({
    ...(removed.size > 0 ? {
      savedCases: keep(current.savedCases),
      savedAttacks: keep(current.savedAttacks),
      savedBrainstorms: keep(current.savedBrainstorms),
      savedFactoids: keep(current.savedFactoids),
      savedChats: keep(current.savedChats),
      savedFlowcharts: keep(current.savedFlowcharts),
      savedCrossfires: keep(current.savedCrossfires),
      sourceLibrary: keep(current.sourceLibrary),
    } : {}),
    ...(leftAskScope ? { askMessages: [], askStreamingAssistant: null, askLoading: false, askChatId: null, askChatDebateId: null, askPersistedCount: 0 } : {}),
  }));
});
