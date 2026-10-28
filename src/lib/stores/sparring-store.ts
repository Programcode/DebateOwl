import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { z } from 'zod';
import { supabase } from '@/lib/supabase/client';
import { restoredSessionsBlocked } from '@/lib/supabase/session-expiry';
import { currentUserId } from '@/lib/supabase/current-user';
import {
  SparringScorecardSchema,
  SparringSpeakerSchema,
  SparringSpeechSchema,
  SparringTurnSchema,
  type SparringScorecard,
  type SparringSpeech,
} from '@/lib/ai/schemas/sparring';
import { buildSparringTurns } from '@/lib/sparring/formats';
import { captureProductEvent } from '@/lib/observability';
import type { SpeechDelivery } from '@/lib/voice/delivery';
import { useDebateStore } from './debate-store';
import { useDebateContextStore } from './debate-context-store';

import {
  startSparringSession, tickSparringTimer, pauseSparringTimer, resumeSparringTimer,
  resetSparringTurnTimer, submitSparringSpeech, appendSparringAiSpeech, completeSparringSession,
  mergeSparringSessions as mergeSessions, parseSavedSparringRows as parseSavedRows,
  MAX_SAVED_SPARRING_SESSIONS as MAX_SAVED_SESSIONS,
  type SparringSession, type StartSparringInput as StartSessionInput,
} from '@debatelab/core/sparring/session';
export type { SparringSession, SparringPhase } from '@debatelab/core/sparring/session';

interface SparringStoreState {
  ownerUserId: string | null;
  currentSession: SparringSession | null;
  privateSessionBackup: SparringSession | null;
  savedSessions: SparringSession[];
  hydrated: boolean;
  /** False until saved history has loaded successfully; hydration can finish without it. */
  historyComplete: boolean;
  beginWorkspaceSession: () => void;
  endWorkspaceSession: () => void;
  startSession: (input: StartSessionInput) => SparringSession;
  restoreWorkspaceSession: (input: unknown) => boolean;
  setDraft: (draft: string) => void;
  tickTimer: (now?: number) => void;
  pauseTimer: (now?: number) => void;
  resumeTimer: (now?: number) => void;
  resetTurnTimer: () => void;
  submitUserSpeech: (content: string, now?: number, delivery?: SpeechDelivery | null) => SparringSession | null;
  appendAiSpeech: (speech: SparringSpeech, now?: number) => SparringSession | null;
  completeSession: (scorecard: SparringScorecard, now?: number) => SparringSession | null;
  attachSessionToDebate: (id: string, debateId: string) => Promise<void>;
  hydrateSavedSessions: () => Promise<void>;
  prepareForUser: (userId: string) => void;
  loadSavedSession: (id: string) => void;
  deleteSavedSession: (id: string) => Promise<void>;
  abandonSession: () => void;
  resetLocalData: () => void;
}

// Invalidates any remote hydration that was started for a previous auth state.
// AuthProvider calls resetLocalData before hydrating a different user.
let hydrationEpoch = 0;

const PersistedSparringSessionSchema = z.object({
  id: z.string(),
  motion: z.string(),
  userSide: z.enum(['pro', 'con']),
  format: z.enum(['standard', 'ld', 'pf']),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  turns: z.array(SparringTurnSchema.extend({ speaker: SparringSpeakerSchema })),
  speeches: z.array(SparringSpeechSchema),
  currentTurnIndex: z.number().int().nonnegative(),
  phase: z.enum(['round', 'judging', 'complete']),
  draft: z.string(),
  timerRemainingSeconds: z.number().nonnegative(),
  timerRunning: z.boolean(),
  timerDeadline: z.number().nullable(),
  scorecard: SparringScorecardSchema.optional(),
  debateId: z.string().nullable().optional(),
  voice: z.boolean().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const PersistedSparringStateSchema = z.object({
  ownerUserId: z.string().nullable().optional(),
  currentSession: PersistedSparringSessionSchema.nullable().optional(),
  privateSessionBackup: PersistedSparringSessionSchema.nullable().optional(),
  savedSessions: z.array(PersistedSparringSessionSchema).optional(),
});

type PersistedSparringState = Pick<SparringStoreState, 'ownerUserId' | 'currentSession' | 'privateSessionBackup' | 'savedSessions'>;
const PERSIST_DELAY_MS = 250;
let pendingStorageWrite: { name: string; value: string } | null = null;
let storageWriteTimer: ReturnType<typeof setTimeout> | null = null;

function flushPendingStorageWrite() {
  if (!pendingStorageWrite || typeof sessionStorage === 'undefined') return;
  sessionStorage.setItem(pendingStorageWrite.name, pendingStorageWrite.value);
  pendingStorageWrite = null;
  if (storageWriteTimer) clearTimeout(storageWriteTimer);
  storageWriteTimer = null;
}

function withoutVolatileDraftFields(value: string): string | null {
  try {
    const parsed = JSON.parse(value) as { state?: { currentSession?: { draft?: string; updatedAt?: number } | null } };
    if (parsed.state?.currentSession) {
      parsed.state.currentSession.draft = '';
      parsed.state.currentSession.updatedAt = 0;
    }
    return JSON.stringify(parsed);
  } catch {
    return null;
  }
}

const debouncedSessionStorage = {
  getItem: (name: string) => sessionStorage.getItem(name),
  setItem: (name: string, value: string) => {
    const persistedValue = sessionStorage.getItem(name);
    const draftOnlyChange = persistedValue !== null
      && withoutVolatileDraftFields(persistedValue) === withoutVolatileDraftFields(value);
    if (!draftOnlyChange) {
      if (storageWriteTimer) clearTimeout(storageWriteTimer);
      storageWriteTimer = null;
      pendingStorageWrite = null;
      sessionStorage.setItem(name, value);
      return;
    }
    pendingStorageWrite = { name, value };
    if (storageWriteTimer) clearTimeout(storageWriteTimer);
    storageWriteTimer = setTimeout(flushPendingStorageWrite, PERSIST_DELAY_MS);
  },
  removeItem: (name: string) => {
    if (pendingStorageWrite?.name === name) pendingStorageWrite = null;
    if (storageWriteTimer) clearTimeout(storageWriteTimer);
    storageWriteTimer = null;
    sessionStorage.removeItem(name);
  },
};

if (typeof window !== 'undefined') window.addEventListener('pagehide', flushPendingStorageWrite);

function rebuildSession(session: z.output<typeof PersistedSparringSessionSchema>): SparringSession {
  return {
    ...session,
    timerDeadline: session.timerDeadline ?? null,
    turns: buildSparringTurns(session.format, session.userSide),
  };
}

function migratePersistedSparringState(value: unknown): PersistedSparringState {
  const parsed = PersistedSparringStateSchema.safeParse(value);
  if (!parsed.success) return { ownerUserId: null, currentSession: null, privateSessionBackup: null, savedSessions: [] };
  return {
    ownerUserId: parsed.data.ownerUserId ?? null,
    currentSession: parsed.data.currentSession ? rebuildSession(parsed.data.currentSession) : null,
    privateSessionBackup: parsed.data.privateSessionBackup ? rebuildSession(parsed.data.privateSessionBackup) : null,
    savedSessions: (parsed.data.savedSessions ?? []).map(rebuildSession),
  };
}

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const segment = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${segment()}${segment()}-${segment()}-4${segment().slice(1)}-a${segment().slice(1)}-${segment()}${segment()}${segment()}`;
}

function captureRoundCompletion(previous: SparringSession, next: SparringSession): void {
  if (previous.phase !== 'round' || next.phase !== 'judging') return;
  captureProductEvent('sparring_round_completed', {
    format: previous.format,
    roundIndex: previous.currentTurnIndex,
  });
}

export const useSparringStore = create<SparringStoreState>()(
  persist(
    (set, get) => ({
      ownerUserId: null as string | null,
      currentSession: null as SparringSession | null,
      privateSessionBackup: null as SparringSession | null,
      savedSessions: [] as SparringSession[],
      hydrated: false,
      historyComplete: false,

      beginWorkspaceSession: () => set((state) => ({
        currentSession: null,
        privateSessionBackup: state.privateSessionBackup ?? state.currentSession,
      })),
      endWorkspaceSession: () => set((state) => ({
        currentSession: state.privateSessionBackup,
        privateSessionBackup: null,
      })),

      startSession: (input) => {
        const now = Date.now();
        const session = startSparringSession(input, createId(), now);
        set({ currentSession: session });
        return session;
      },

      restoreWorkspaceSession: (input) => {
        const parsed = PersistedSparringSessionSchema.safeParse(input);
        if (!parsed.success) return false;
        set({ currentSession: rebuildSession(parsed.data) });
        return true;
      },

      setDraft: (draft) => set((state) => state.currentSession
        ? { currentSession: { ...state.currentSession, draft, updatedAt: Date.now() } }
        : state),

      tickTimer: (now = Date.now()) => set((state) => {
        const session = state.currentSession;
        if (!session) return state;
        const next = tickSparringTimer(session, now);
        return next === session ? state : { currentSession: next };
      }),

      pauseTimer: (now = Date.now()) => set((state) => {
        const session = state.currentSession;
        if (!session) return state;
        const next = pauseSparringTimer(session, now);
        return next === session ? state : { currentSession: next };
      }),

      resumeTimer: (now = Date.now()) => set((state) => {
        const session = state.currentSession;
        if (!session) return state;
        const next = resumeSparringTimer(session, now);
        return next === session ? state : { currentSession: next };
      }),

      resetTurnTimer: () => set((state) => {
        const session = state.currentSession;
        if (!session) return state;
        const next = resetSparringTurnTimer(session);
        return next === session ? state : { currentSession: next };
      }),

      submitUserSpeech: (content, now = Date.now(), delivery = null) => {
        const session = get().currentSession;
        if (!session) return null;
        const next = submitSparringSpeech(session, content, { now, createId, delivery });
        if (!next) return null;
        set({ currentSession: next });
        captureRoundCompletion(session, next);
        return next;
      },

      appendAiSpeech: (speech, now = Date.now()) => {
        const session = get().currentSession;
        if (!session) return null;
        const next = appendSparringAiSpeech(session, speech, now);
        if (!next) return null;
        set({ currentSession: next });
        captureRoundCompletion(session, next);
        return next;
      },

      completeSession: (scorecard, now = Date.now()) => {
        const session = get().currentSession;
        if (!session) return null;
        const completed = completeSparringSession(session, scorecard, now);
        if (!completed) return null;
        set((state) => ({
          currentSession: completed,
          savedSessions: mergeSessions(state.savedSessions, [completed]),
        }));
        captureProductEvent('sparring_session_judged', {
          format: completed.format,
          winner: completed.scorecard.winner,
          speechCount: completed.speeches.length,
        });
        return completed;
      },

      attachSessionToDebate: async (id, debateId) => {
        const session = get().savedSessions.find((item) => item.id === id) ?? get().currentSession;
        const { error } = await supabase.rpc('attach_to_debate', {
          p_kind: 'sparring',
          p_id: id,
          p_debate_id: debateId,
          p_side: session?.id === id ? session.userSide : null,
        });
        if (error) throw new Error(error.message);
        const attach = (item: SparringSession) => item.id === id ? { ...item, debateId } : item;
        set((state) => ({
          savedSessions: state.savedSessions.map(attach),
          currentSession: state.currentSession ? attach(state.currentSession) : null,
        }));
      },

      prepareForUser: (userId) => {
        if (get().ownerUserId === userId) return;
        hydrationEpoch += 1;
        set({ ownerUserId: userId, currentSession: null, privateSessionBackup: null, savedSessions: [], hydrated: false, historyComplete: false });
      },

      hydrateSavedSessions: async () => {
        if (restoredSessionsBlocked()) return;
        if (get().hydrated) return;
        const epoch = hydrationEpoch;
        const userId = await currentUserId();
        if (epoch !== hydrationEpoch) return;
        if (!userId) {
          set({ hydrated: true });
          return;
        }
        const { data, error } = await supabase
          .from('sparring_sessions')
          .select('id,motion,user_side,format,difficulty,turns,final_evaluation,status,debate_id,created_at,updated_at')
          .order('updated_at', { ascending: false });
        if (epoch !== hydrationEpoch) return;
        if (error) {
          console.warn('[SparringStore] Failed to hydrate sparring history:', error.message);
          set({ hydrated: true });
          return;
        }
        set((state) => ({ savedSessions: mergeSessions(state.savedSessions, parseSavedRows(data)), hydrated: true, historyComplete: true }));
      },

      loadSavedSession: (id) => {
        const session = get().savedSessions.find((item) => item.id === id);
        if (session) set({ currentSession: { ...session } });
      },

      deleteSavedSession: async (id) => {
        const previous = get().savedSessions;
        set({ savedSessions: previous.filter((session) => session.id !== id) });
        const userId = await currentUserId();
        if (!userId) return;
        const { error } = await supabase.from('sparring_sessions').delete().eq('id', id);
        if (error) {
          set({ savedSessions: previous });
          throw new Error(error.message);
        }
      },

      abandonSession: () => {
        // The round is over, so its Review choices go with it.
        useDebateContextStore.getState().resetOverride('sparring');
        set({ currentSession: null });
      },
      resetLocalData: () => {
        hydrationEpoch += 1;
        set({ ownerUserId: null, currentSession: null, privateSessionBackup: null, savedSessions: [], hydrated: false, historyComplete: false });
      },
    }),
    {
      name: 'debate-sparring-storage',
      storage: createJSONStorage(() => debouncedSessionStorage),
      version: 4,
      migrate: (persistedState) => migratePersistedSparringState(persistedState),
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...migratePersistedSparringState(persistedState),
      }),
      partialize: (state) => ({
        ownerUserId: state.ownerUserId,
        currentSession: state.currentSession,
        privateSessionBackup: state.privateSessionBackup,
        savedSessions: state.savedSessions.slice(0, MAX_SAVED_SESSIONS),
      }),
    },
  ),
);

// A deleted debate takes its sessions with it on the server; mirror that locally.
useDebateStore.subscribe((state, previous) => {
  const removed = new Set(previous.debates.filter((debate) => !state.debates.some((next) => next.id === debate.id)).map((debate) => debate.id));
  if (removed.size === 0) return;
  useSparringStore.setState((current) => ({
    savedSessions: current.savedSessions.filter((session) => !session.debateId || !removed.has(session.debateId)),
    currentSession: current.currentSession?.debateId && removed.has(current.currentSession.debateId)
      ? { ...current.currentSession, debateId: null }
      : current.currentSession,
  }));
});
