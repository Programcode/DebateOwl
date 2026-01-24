import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { GenerateOutput } from '../ai/schemas/generate';
import type { AttackOutput } from '../ai/schemas/attack';
import type { BrainstormOutput } from '../ai/schemas/brainstorm';
import type { FactoidsOutput } from '../ai/schemas/factoids';
import type { AskOutput } from '../ai/schemas/ask';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number; // Changed to number for easier persistence
  output?: AskOutput;
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

interface SessionState {
  // --- Current Active Session ---
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

  // --- Persistent History (Database) ---
  savedCases: SavedItem<GenerateOutput>[];
  savedAttacks: SavedItem<AttackOutput>[];
  savedBrainstorms: SavedItem<BrainstormOutput>[];
  savedFactoids: SavedItem<FactoidsOutput>[];
  savedChats: SavedItem<Message[]>[];
  sourceLibrary: Source[];

  // --- Actions ---
  setGenerateResult: (result: GenerateOutput | null) => void;
  setGenerateLoading: (loading: boolean) => void;
  saveCurrentCase: (title: string) => void;
  deleteSavedCase: (id: string) => void;
  loadSavedCase: (id: string) => void;

  setAttackResult: (result: AttackOutput | null) => void;
  setAttackLoading: (loading: boolean) => void;
  saveCurrentAttack: (title: string) => void;
  
  setBrainstormResult: (result: BrainstormOutput | null) => void;
  setBrainstormLoading: (loading: boolean) => void;
  saveCurrentBrainstorm: (title: string) => void;
  
  setFactoidsResult: (result: FactoidsOutput | null) => void;
  setFactoidsLoading: (loading: boolean) => void;
  saveCurrentFactoids: (title: string) => void;
  
  addAskMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  setAskLoading: (loading: boolean) => void;
  clearAskMessages: () => void;
  saveCurrentChat: (title: string) => void;
  loadSavedChat: (id: string) => void;

  addSource: (source: Omit<Source, 'id' | 'createdAt' | 'isActive'>) => void;
  removeSource: (id: string) => void;
  toggleSource: (id: string) => void;
  clearLibrary: () => void;
  
  clearSession: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

export const useSessionStore = create<SessionState>()(
  persist(
    (set, get) => ({
      // Active State
      generateResult: null,
      generateLoading: false,
      attackResult: null,
      attackLoading: false,
      brainstormResult: null,
      brainstormLoading: false,
      factoidsResult: null,
      factoidsLoading: false,
      askMessages: [],
      askLoading: false,

      // History State
      savedCases: [],
      savedAttacks: [],
      savedBrainstorms: [],
      savedFactoids: [],
      savedChats: [],
      sourceLibrary: [],

      // Source Library Actions
      addSource: (source) => set((state) => ({
        sourceLibrary: [
          { ...source, id: generateId(), createdAt: Date.now(), isActive: true },
          ...state.sourceLibrary
        ]
      })),
      removeSource: (id) => set((state) => ({
        sourceLibrary: state.sourceLibrary.filter(s => s.id !== id)
      })),
      toggleSource: (id) => set((state) => ({
        sourceLibrary: state.sourceLibrary.map(s => s.id === id ? { ...s, isActive: !s.isActive } : s)
      })),
      clearLibrary: () => set({ sourceLibrary: [] }),

      // Generate Actions
      setGenerateResult: (result) => set({ generateResult: result }),
      setGenerateLoading: (loading) => set({ generateLoading: loading }),
      saveCurrentCase: (title) => {
        const current = get().generateResult;
        if (!current) return;
        set((state) => ({
          savedCases: [
            { id: generateId(), data: current, createdAt: Date.now(), title },
            ...state.savedCases
          ]
        }));
      },
      deleteSavedCase: (id) => set((state) => ({
        savedCases: state.savedCases.filter(c => c.id !== id)
      })),
      loadSavedCase: (id) => {
        const item = get().savedCases.find(c => c.id === id);
        if (item) set({ generateResult: item.data });
      },

      // Attack Actions
      setAttackResult: (result) => set({ attackResult: result }),
      setAttackLoading: (loading) => set({ attackLoading: loading }),
      saveCurrentAttack: (title) => {
        const current = get().attackResult;
        if (!current) return;
        set((state) => ({
          savedAttacks: [
            { id: generateId(), data: current, createdAt: Date.now(), title },
            ...state.savedAttacks
          ]
        }));
      },

      // Brainstorm Actions
      setBrainstormResult: (result) => set({ brainstormResult: result }),
      setBrainstormLoading: (loading) => set({ brainstormLoading: loading }),
      saveCurrentBrainstorm: (title) => {
        const current = get().brainstormResult;
        if (!current) return;
        set((state) => ({
          savedBrainstorms: [
            { id: generateId(), data: current, createdAt: Date.now(), title },
            ...state.savedBrainstorms
          ]
        }));
      },

      // Factoids Actions
      setFactoidsResult: (result) => set({ factoidsResult: result }),
      setFactoidsLoading: (loading) => set({ factoidsLoading: loading }),
      saveCurrentFactoids: (title) => {
        const current = get().factoidsResult;
        if (!current) return;
        set((state) => ({
          savedFactoids: [
            { id: generateId(), data: current, createdAt: Date.now(), title },
            ...state.savedFactoids
          ]
        }));
      },

      // Ask Actions
      addAskMessage: (message) => set((state) => ({
        askMessages: [
          ...state.askMessages,
          { ...message, id: generateId(), timestamp: Date.now() },
        ],
      })),
      setAskLoading: (loading) => set({ askLoading: loading }),
      clearAskMessages: () => set({ askMessages: [] }),
      saveCurrentChat: (title) => {
        const current = get().askMessages;
        if (current.length === 0) return;
        set((state) => ({
          savedChats: [
            { id: generateId(), data: current, createdAt: Date.now(), title },
            ...state.savedChats
          ]
        }));
      },
      loadSavedChat: (id) => {
        const item = get().savedChats.find(c => c.id === id);
        if (item) set({ askMessages: item.data });
      },

      clearSession: () => set({
        generateResult: null,
        attackResult: null,
        brainstormResult: null,
        factoidsResult: null,
        askMessages: [],
      }),
    }),
    {
      name: 'debate-trainer-storage', // unique name
      storage: createJSONStorage(() => localStorage),
    }
  )
);