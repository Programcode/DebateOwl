import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Node, Edge } from 'reactflow';
import type { GenerateOutput } from '../ai/schemas/generate';
import type { AttackOutput } from '../ai/schemas/attack';
import type { BrainstormOutput } from '../ai/schemas/brainstorm';
import type { FactoidsOutput } from '../ai/schemas/factoids';
import type { AskOutput } from '../ai/schemas/ask';
import { supabase } from '@/lib/supabase/client';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  output?: AskOutput | GenerateOutput | AttackOutput | BrainstormOutput | FactoidsOutput;
}

export interface Source {
  id: string;
  title: string;
  content: string;
  type: 'url' | 'file' | 'text';
  origin?: string;
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

  savedCases: SavedItem<GenerateOutput>[];
  savedAttacks: SavedItem<AttackOutput>[];
  savedBrainstorms: SavedItem<BrainstormOutput>[];
  savedFactoids: SavedItem<FactoidsOutput>[];
  savedChats: SavedItem<Message[]>[];
  savedFlowcharts: SavedItem<FlowchartData>[];
  sourceLibrary: Source[];

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
  clearAskMessages: () => void;
  saveCurrentChat: (title: string) => Promise<void>;
  loadSavedChat: (id: string) => void;

  saveFlowchart: (title: string, data: FlowchartData) => Promise<void>;
  deleteSavedFlowchart: (id: string) => Promise<void>;

  addSource: (source: Omit<Source, 'id' | 'createdAt' | 'isActive'>) => Promise<void>;
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

async function getUserId() {
  const { data } = await supabase.auth.getUser();
  return data.user?.id || null;
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
  is_active: boolean;
  created_at: string;
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

      savedCases: [] as SavedItem<GenerateOutput>[],
      savedAttacks: [] as SavedItem<AttackOutput>[],
      savedBrainstorms: [] as SavedItem<BrainstormOutput>[],
      savedFactoids: [] as SavedItem<FactoidsOutput>[],
      savedChats: [] as SavedItem<Message[]>[],
      savedFlowcharts: [] as SavedItem<FlowchartData>[],
      sourceLibrary: [] as Source[],

      pendingFlowchartData: null as FlowchartData | null,
      setPendingFlowchartData: (data) => set({ pendingFlowchartData: data }),

      addSource: async (source) => {
        const localId = generateId();
        const localItem: Source = { ...source, id: localId, createdAt: Date.now(), isActive: true };
        set((state) => ({ sourceLibrary: [localItem, ...state.sourceLibrary] }));

        const userId = await getUserId();
        if (!userId) return;
        const { data } = await supabase
          .from('sources')
          .insert({
            user_id: userId,
            title: source.title,
            content: source.content,
            type: source.type,
            origin: source.origin || null,
            is_active: true,
          })
          .select('*')
          .single();

        if (data) {
          set((state) => ({
            sourceLibrary: state.sourceLibrary.map((s) =>
              s.id === localId
                ? {
                  id: data.id,
                  title: data.title,
                  content: data.content,
                  type: data.type,
                  origin: data.origin || undefined,
                  isActive: data.is_active,
                  createdAt: toTimestamp(data.created_at),
                }
                : s
            ),
          }));
        }
      },
      removeSource: async (id) => {
        set((state) => ({ sourceLibrary: state.sourceLibrary.filter((s) => s.id !== id) }));
        await supabase.from('sources').delete().eq('id', id);
      },
      toggleSource: async (id) => {
        const current = get().sourceLibrary.find((s) => s.id === id);
        if (!current) return;
        const nextValue = !current.isActive;
        set((state) => ({
          sourceLibrary: state.sourceLibrary.map((s) => s.id === id ? { ...s, isActive: nextValue } : s),
        }));
        await supabase.from('sources').update({ is_active: nextValue }).eq('id', id);
      },
      clearLibrary: async () => {
        set({ sourceLibrary: [] });
        await supabase.from('sources').delete().neq('id', '');
      },

      setGenerateResult: (result) => set({ generateResult: result }),
      setGenerateLoading: (loading) => set({ generateLoading: loading }),
      saveCurrentCase: async (title) => {
        const current = get().generateResult;
        if (!current) return;
        const localId = generateId();
        const localItem = { id: localId, data: current, createdAt: Date.now(), title };
        set((state) => ({ savedCases: [localItem, ...state.savedCases] }));

        const userId = await getUserId();
        if (!userId) return;
        const { data } = await supabase
          .from('cases')
          .insert({ user_id: userId, title, input: {}, output: current })
          .select('*')
          .single();
        if (data) {
          set((state) => ({
            savedCases: state.savedCases.map((item) =>
              item.id === localId
                ? { id: data.id, data: data.output, createdAt: toTimestamp(data.created_at), title: data.title }
                : item
            ),
          }));
        }
      },
      deleteSavedCase: async (id) => {
        set((state) => ({ savedCases: state.savedCases.filter((c) => c.id !== id) }));
        await supabase.from('cases').delete().eq('id', id);
      },
      loadSavedCase: (id) => {
        const item = get().savedCases.find((c) => c.id === id);
        if (item) set({ generateResult: item.data });
      },

      setAttackResult: (result) => set({ attackResult: result }),
      setAttackLoading: (loading) => set({ attackLoading: loading }),
      saveCurrentAttack: async (title) => {
        const current = get().attackResult;
        if (!current) return;
        const localId = generateId();
        const localItem = { id: localId, data: current, createdAt: Date.now(), title };
        set((state) => ({ savedAttacks: [localItem, ...state.savedAttacks] }));

        const userId = await getUserId();
        if (!userId) return;
        const { data } = await supabase
          .from('attacks')
          .insert({ user_id: userId, title, input: {}, output: current })
          .select('*')
          .single();
        if (data) {
          set((state) => ({
            savedAttacks: state.savedAttacks.map((item) =>
              item.id === localId
                ? { id: data.id, data: data.output, createdAt: toTimestamp(data.created_at), title: data.title }
                : item
            ),
          }));
        }
      },
      loadSavedAttack: (id) => {
        const item = get().savedAttacks.find((c) => c.id === id);
        if (item) set({ attackResult: item.data });
      },

      setBrainstormResult: (result) => set({ brainstormResult: result }),
      setBrainstormLoading: (loading) => set({ brainstormLoading: loading }),
      saveCurrentBrainstorm: async (title) => {
        const current = get().brainstormResult;
        if (!current) return;
        const localId = generateId();
        const localItem = { id: localId, data: current, createdAt: Date.now(), title };
        set((state) => ({ savedBrainstorms: [localItem, ...state.savedBrainstorms] }));

        const userId = await getUserId();
        if (!userId) return;
        const { data } = await supabase
          .from('brainstorms')
          .insert({ user_id: userId, title, input: {}, output: current })
          .select('*')
          .single();
        if (data) {
          set((state) => ({
            savedBrainstorms: state.savedBrainstorms.map((item) =>
              item.id === localId
                ? { id: data.id, data: data.output, createdAt: toTimestamp(data.created_at), title: data.title }
                : item
            ),
          }));
        }
      },
      loadSavedBrainstorm: (id) => {
        const item = get().savedBrainstorms.find((c) => c.id === id);
        if (item) set({ brainstormResult: item.data });
      },

      setFactoidsResult: (result) => set({ factoidsResult: result }),
      setFactoidsLoading: (loading) => set({ factoidsLoading: loading }),
      saveCurrentFactoids: async (title) => {
        const current = get().factoidsResult;
        if (!current) return;
        const localId = generateId();
        const localItem = { id: localId, data: current, createdAt: Date.now(), title };
        set((state) => ({ savedFactoids: [localItem, ...state.savedFactoids] }));

        const userId = await getUserId();
        if (!userId) return;
        const { data } = await supabase
          .from('factoids')
          .insert({ user_id: userId, title, input: {}, output: current })
          .select('*')
          .single();
        if (data) {
          set((state) => ({
            savedFactoids: state.savedFactoids.map((item) =>
              item.id === localId
                ? { id: data.id, data: data.output, createdAt: toTimestamp(data.created_at), title: data.title }
                : item
            ),
          }));
        }
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
      clearAskMessages: () => set({ askMessages: [] }),
      saveCurrentChat: async (title) => {
        const current = get().askMessages;
        if (current.length === 0) return;
        const localId = generateId();
        const localItem = { id: localId, data: current, createdAt: Date.now(), title };
        set((state) => ({ savedChats: [localItem, ...state.savedChats] }));

        const userId = await getUserId();
        if (!userId) return;
        const { data: chat } = await supabase
          .from('chats')
          .insert({ user_id: userId, title })
          .select('*')
          .single();

        if (!chat) return;

        const rows = current.map((m) => ({
          chat_id: chat.id,
          role: m.role,
          content: m.content,
          output: m.output || null,
          created_at: new Date(m.timestamp).toISOString(),
        }));
        await supabase.from('messages').insert(rows);

        set((state) => ({
          savedChats: state.savedChats.map((item) =>
            item.id === localId
              ? { id: chat.id, data: current, createdAt: toTimestamp(chat.created_at), title: chat.title }
              : item
          ),
        }));
      },
      loadSavedChat: (id) => {
        const item = get().savedChats.find((c) => c.id === id);
        if (item) set({ askMessages: item.data });
      },

      saveFlowchart: async (title, data) => {
        const localId = generateId();
        const localItem = { id: localId, data: data, createdAt: Date.now(), title };
        set((state) => ({ savedFlowcharts: [localItem, ...state.savedFlowcharts] }));

        const userId = await getUserId();
        if (!userId) return;
        const { data: saved } = await supabase
          .from('flowcharts')
          .insert({
            user_id: userId,
            title,
            nodes: data.nodes,
            edges: data.edges,
          })
          .select('*')
          .single();

        if (saved) {
          set((state) => ({
            savedFlowcharts: state.savedFlowcharts.map((item) =>
              item.id === localId
                ? {
                  id: saved.id,
                  data: { nodes: saved.nodes, edges: saved.edges },
                  createdAt: toTimestamp(saved.created_at),
                  title: saved.title
                }
                : item
            ),
          }));
        }
      },

      deleteSavedFlowchart: async (id) => {
        set((state) => ({ savedFlowcharts: state.savedFlowcharts.filter((c) => c.id !== id) }));
        await supabase.from('flowcharts').delete().eq('id', id);
      },

      hydrateFromServer: async () => {
        const [
          casesRes,
          attacksRes,
          brainstormsRes,
          factoidsRes,
          chatsRes,
          flowchartsRes,
          sourcesRes,
        ] = await Promise.all([
          supabase.from('cases').select('*').order('created_at', { ascending: false }),
          supabase.from('attacks').select('*').order('created_at', { ascending: false }),
          supabase.from('brainstorms').select('*').order('created_at', { ascending: false }),
          supabase.from('factoids').select('*').order('created_at', { ascending: false }),
          supabase.from('chats').select('*').order('created_at', { ascending: false }),
          supabase.from('flowcharts').select('*').order('created_at', { ascending: false }),
          supabase.from('sources').select('*').order('created_at', { ascending: false }),
        ]);

        const chatRows = (chatsRes.data || []) as SupabaseChatRow[];
        const chatIds = chatRows.map((c) => c.id);
        const messagesRes = chatIds.length
          ? await supabase.from('messages').select('*').in('chat_id', chatIds).order('created_at', { ascending: true })
          : { data: [] as SupabaseMessageRow[] };

        const caseRows = (casesRes.data || []) as SupabaseSavedRow<GenerateOutput>[];
        const serverCases = caseRows.map((row) => ({
          id: row.id,
          data: row.output,
          createdAt: toTimestamp(row.created_at),
          title: row.title,
        }));

        const attackRows = (attacksRes.data || []) as SupabaseSavedRow<AttackOutput>[];
        const serverAttacks = attackRows.map((row) => ({
          id: row.id,
          data: row.output,
          createdAt: toTimestamp(row.created_at),
          title: row.title,
        }));

        const brainstormRows = (brainstormsRes.data || []) as SupabaseSavedRow<BrainstormOutput>[];
        const serverBrainstorms = brainstormRows.map((row) => ({
          id: row.id,
          data: row.output,
          createdAt: toTimestamp(row.created_at),
          title: row.title,
        }));

        const factoidRows = (factoidsRes.data || []) as SupabaseSavedRow<FactoidsOutput>[];
        const serverFactoids = factoidRows.map((row) => ({
          id: row.id,
          data: row.output,
          createdAt: toTimestamp(row.created_at),
          title: row.title,
        }));

        const flowchartRows = (flowchartsRes.data || []) as SupabaseFlowchartRow[];
        const serverFlowcharts = flowchartRows.map((row) => ({
          id: row.id,
          data: { nodes: row.nodes, edges: row.edges },
          createdAt: toTimestamp(row.created_at),
          title: row.title,
        }));

        const messageMap = new Map<string, Message[]>();
        const messageRows = (messagesRes.data || []) as SupabaseMessageRow[];
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

        const sourceRows = (sourcesRes.data || []) as SupabaseSourceRow[];
        const serverSources = sourceRows.map((row) => ({
          id: row.id,
          title: row.title,
          content: row.content,
          type: row.type,
          origin: row.origin || undefined,
          isActive: row.is_active,
          createdAt: toTimestamp(row.created_at),
        }));

        const hasServerData = [
          serverCases.length,
          serverAttacks.length,
          serverBrainstorms.length,
          serverFactoids.length,
          serverChats.length,
          serverFlowcharts.length,
          serverSources.length,
        ].some((count) => count > 0);

        if (!hasServerData) return;

        set({
          savedCases: serverCases,
          savedAttacks: serverAttacks,
          savedBrainstorms: serverBrainstorms,
          savedFactoids: serverFactoids,
          savedChats: serverChats,
          savedFlowcharts: serverFlowcharts,
          sourceLibrary: serverSources,
        });
      },

      clearAllData: async () => {
        // SAFETY: Get current user ID - abort if not authenticated
        const userId = await getUserId();
        if (!userId) {
          throw new Error('Cannot delete data: No authenticated user');
        }

        // SAFETY: All deletes explicitly filter by user_id
        // This ensures only the current user's data is deleted, even if RLS fails
        await supabase.from('messages').delete().eq('user_id', userId);
        await supabase.from('chats').delete().eq('user_id', userId);
        await supabase.from('cases').delete().eq('user_id', userId);
        await supabase.from('attacks').delete().eq('user_id', userId);
        await supabase.from('brainstorms').delete().eq('user_id', userId);
        await supabase.from('factoids').delete().eq('user_id', userId);
        await supabase.from('flowcharts').delete().eq('user_id', userId);
        await supabase.from('sources').delete().eq('user_id', userId);
        await supabase.from('source_files').delete().eq('user_id', userId);
        await supabase.from('ai_requests').delete().eq('user_id', userId);
        await supabase.from('api_keys').delete().eq('user_id', userId);
        await supabase.from('user_settings').delete().eq('user_id', userId);

        // Clear local state
        set({
          savedCases: [],
          savedAttacks: [],
          savedBrainstorms: [],
          savedFactoids: [],
          savedChats: [],
          savedFlowcharts: [],
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
        sourceLibrary: [],
        generateResult: null,
        attackResult: null,
        brainstormResult: null,
        factoidsResult: null,
        askMessages: [],
      }),

      clearSession: () => set({
        generateResult: null,
        attackResult: null,
        brainstormResult: null,
        factoidsResult: null,
        askMessages: [],
        pendingFlowchartData: null,
      }),
    }),
    {
      name: 'debate-trainer-storage',
      storage: createJSONStorage(() => localStorage),
    }
  )
);
