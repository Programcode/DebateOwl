import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  SparringSessionSchema,
  type SparringScorecard,
  type SparringSession,
  type SparringSetup,
  type SparringTurn,
} from '@/lib/ai/schemas/sparring';

const MAX_SAVED_SESSIONS = 30;

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function parsePersistedSessions(value: unknown): SparringSession[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((candidate) => {
      const parsed = SparringSessionSchema.safeParse(candidate);
      return parsed.success ? [parsed.data] : [];
    })
    .slice(0, MAX_SAVED_SESSIONS);
}

interface SparringState {
  sessions: SparringSession[];
  activeSessionId: string | null;
  startSession: (setup: SparringSetup) => SparringSession;
  addTurn: (sessionId: string, turn: Omit<SparringTurn, 'id' | 'createdAt'>) => SparringTurn;
  completeSession: (sessionId: string, scorecard: SparringScorecard) => void;
  setActiveSession: (sessionId: string | null) => void;
  deleteSession: (sessionId: string) => void;
  clearSparringHistory: () => void;
}

export const useSparringStore = create<SparringState>()(
  persist(
    (set) => ({
      sessions: [],
      activeSessionId: null,

      startSession: (setup) => {
        const now = Date.now();
        const session: SparringSession = {
          id: makeId('spar'),
          setup,
          turns: [],
          status: 'active',
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({
          sessions: [session, ...state.sessions].slice(0, MAX_SAVED_SESSIONS),
          activeSessionId: session.id,
        }));
        return session;
      },

      addTurn: (sessionId, turn) => {
        const created: SparringTurn = {
          ...turn,
          id: makeId('turn'),
          createdAt: Date.now(),
        };
        set((state) => ({
          sessions: state.sessions.map((session) => session.id === sessionId
            ? { ...session, turns: [...session.turns, created], updatedAt: Date.now() }
            : session),
        }));
        return created;
      },

      completeSession: (sessionId, scorecard) => {
        set((state) => ({
          sessions: state.sessions.map((session) => session.id === sessionId
            ? { ...session, scorecard, status: 'complete', updatedAt: Date.now() }
            : session),
        }));
      },

      setActiveSession: (activeSessionId) => set({ activeSessionId }),

      deleteSession: (sessionId) => set((state) => ({
        sessions: state.sessions.filter((session) => session.id !== sessionId),
        activeSessionId: state.activeSessionId === sessionId ? null : state.activeSessionId,
      })),

      clearSparringHistory: () => set({ sessions: [], activeSessionId: null }),
    }),
    {
      name: 'debatelab-sparring',
      partialize: (state) => ({ sessions: state.sessions, activeSessionId: state.activeSessionId }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<SparringState> | undefined;
        const sessions = parsePersistedSessions(saved?.sessions);
        const activeSessionId = typeof saved?.activeSessionId === 'string' && sessions.some((session) => session.id === saved.activeSessionId)
          ? saved.activeSessionId
          : null;
        return { ...current, sessions, activeSessionId };
      },
    },
  ),
);

export function getSparringSession(sessionId: string | null): SparringSession | null {
  if (!sessionId) return null;
  return useSparringStore.getState().sessions.find((session) => session.id === sessionId) ?? null;
}
