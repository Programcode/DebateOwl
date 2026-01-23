// src/lib/stores/session-store.ts
import { create } from 'zustand';
import type { GenerateOutput } from '../ai/schemas/generate';
import type { AttackOutput } from '../ai/schemas/attack';
import type { BrainstormOutput } from '../ai/schemas/brainstorm';
import type { FactoidsOutput } from '../ai/schemas/factoids';
import type { AskOutput } from '../ai/schemas/ask';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface SessionState {
  // Generate feature state
  generateResult: GenerateOutput | null;
  generateLoading: boolean;
  
  // Attack feature state
  attackResult: AttackOutput | null;
  attackLoading: boolean;
  
  // Brainstorm feature state
  brainstormResult: BrainstormOutput | null;
  brainstormLoading: boolean;
  
  // Factoids feature state
  factoidsResult: FactoidsOutput | null;
  factoidsLoading: boolean;
  
  // Ask feature state
  askMessages: Message[];
  askLoading: boolean;
  
  // Actions
  setGenerateResult: (result: GenerateOutput | null) => void;
  setGenerateLoading: (loading: boolean) => void;
  
  setAttackResult: (result: AttackOutput | null) => void;
  setAttackLoading: (loading: boolean) => void;
  
  setBrainstormResult: (result: BrainstormOutput | null) => void;
  setBrainstormLoading: (loading: boolean) => void;
  
  setFactoidsResult: (result: FactoidsOutput | null) => void;
  setFactoidsLoading: (loading: boolean) => void;
  
  addAskMessage: (message: Omit<Message, 'id' | 'timestamp'>) => void;
  setAskLoading: (loading: boolean) => void;
  clearAskMessages: () => void;
  
  // Clear all
  clearSession: () => void;
}

const generateId = () => Math.random().toString(36).substring(2, 9);

export const useSessionStore = create<SessionState>((set) => ({
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
  
  setGenerateResult: (result) => set({ generateResult: result }),
  setGenerateLoading: (loading) => set({ generateLoading: loading }),
  
  setAttackResult: (result) => set({ attackResult: result }),
  setAttackLoading: (loading) => set({ attackLoading: loading }),
  
  setBrainstormResult: (result) => set({ brainstormResult: result }),
  setBrainstormLoading: (loading) => set({ brainstormLoading: loading }),
  
  setFactoidsResult: (result) => set({ factoidsResult: result }),
  setFactoidsLoading: (loading) => set({ factoidsLoading: loading }),
  
  addAskMessage: (message) => set((state) => ({
    askMessages: [
      ...state.askMessages,
      { ...message, id: generateId(), timestamp: new Date() },
    ],
  })),
  setAskLoading: (loading) => set({ askLoading: loading }),
  clearAskMessages: () => set({ askMessages: [] }),
  
  clearSession: () => set({
    generateResult: null,
    attackResult: null,
    brainstormResult: null,
    factoidsResult: null,
    askMessages: [],
  }),
}));
