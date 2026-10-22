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
  type SparringDifficulty,
  type SparringFormat,
  type SparringScorecard,
  type SparringSide,
  type SparringSpeech,
} from '@/lib/ai/schemas/sparring';
import { buildSparringTurns, type SparringTurn } from '@/lib/sparring/formats';
import { captureProductEvent } from '@/lib/observability';
import type { SpeechDelivery } from '@/lib/voice/delivery';
import { useDebateStore } from './debate-store';
import { useDebateContextStore } from './debate-context-store';

export type SparringPhase = 'round' | 'judging' | 'complete';

export interface SparringSession {
  id: string;
  motion: string;
  userSide: SparringSide;
  format: SparringFormat;
  difficulty: SparringDifficulty;
  turns: SparringTurn[];
  speeches: SparringSpeech[];
  currentTurnIndex: number;
  phase: SparringPhase;
  draft: string;
  timerRemainingSeconds: number;
  timerRunning: boolean;
  timerDeadline: number | null;
  scorecard?: SparringScorecard;
  /** Debate the round attaches to once judged; null for one-off rounds. */
  debateId?: string | null;
  /** A voice round: the student speaks and the opponent answers aloud. */
  voice?: boolean;
  createdAt: number;
  updatedAt: number;
}

interface StartSessionInput {
  motion: string;
  userSide: SparringSide;
  format: SparringFormat;
  difficulty: SparringDifficulty;
  debateId?: string | null;
  voice?: boolean;
}

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
  resetTurnTimer: (now?: number) => void;
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

const SavedRowsSchema = z.array(z.object({
  id: z.string(),
  motion: z.string(),
  user_side: z.enum(['pro', 'con']),
  format: z.enum(['standard', 'ld', 'pf']).catch('standard'),
  difficulty: z.enum(['easy', 'medium', 'hard']).catch('medium'),
  turns: z.unknown(),
  final_evaluation: z.unknown(),
  status: z.string(),
  debate_id: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
}));

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
const MAX_SAVED_SESSIONS = 50;
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

function currentTurn(session: SparringSession): SparringTurn | undefined {
  return session.turns[session.currentTurnIndex];
}

function timerForTurn(turn: SparringTurn | undefined, now: number) {
  const duration = turn?.timeLimitSeconds ?? 0;
  const shouldRun = turn?.speaker === 'user';
  return {
    timerRemainingSeconds: duration,
    timerRunning: shouldRun,
    timerDeadline: shouldRun ? now + duration * 1000 : null,
  };
}

function advanceSession(session: SparringSession, now: number): SparringSession {
  const nextIndex = session.currentTurnIndex + 1;
  const nextTurn = session.turns[nextIndex];
  if (!nextTurn) {
    return {
      ...session,
      currentTurnIndex: session.turns.length,
      phase: 'judging',
      draft: '',
      timerRemainingSeconds: 0,
      timerRunning: false,
      timerDeadline: null,
      updatedAt: now,
    };
  }

  return {
    ...session,
    currentTurnIndex: nextIndex,
    draft: '',
    ...timerForTurn(nextTurn, now),
    updatedAt: now,
  };
}

function captureRoundCompletion(previous: SparringSession, next: SparringSession): void {
  if (previous.phase !== 'round' || next.phase !== 'judging') return;
  captureProductEvent('sparring_round_completed', {
    format: previous.format,
    roundIndex: previous.currentTurnIndex,
  });
}

function mergeSessions(local: SparringSession[], remote: SparringSession[]): SparringSession[] {
  const byId = new Map<string, SparringSession>();
  for (const session of [...local, ...remote]) {
    const current = byId.get(session.id);
    if (!current || current.updatedAt < session.updatedAt) byId.set(session.id, session);
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SAVED_SESSIONS);
}

function parseSavedRows(value: unknown): SparringSession[] {
  const parsedRows = SavedRowsSchema.safeParse(value);
  if (!parsedRows.success) return [];

  return parsedRows.data.flatMap((row): SparringSession[] => {
    const speeches = z.array(SparringSpeechSchema).max(12).safeParse(row.turns);
    const scorecard = SparringScorecardSchema.safeParse(row.final_evaluation);
    if (!speeches.success || !scorecard.success || row.status !== 'complete') return [];

    const turns = buildSparringTurns(row.format, row.user_side);
    const createdAt = new Date(row.created_at).getTime();
    const updatedAt = new Date(row.updated_at).getTime();
    return [{
      id: row.id,
      motion: row.motion,
      userSide: row.user_side,
      format: row.format,
      difficulty: row.difficulty,
      turns,
      speeches: speeches.data,
      currentTurnIndex: turns.length,
      phase: 'complete',
      draft: '',
      timerRemainingSeconds: 0,
      timerRunning: false,
      timerDeadline: null,
      scorecard: scorecard.data,
      debateId: row.debate_id ?? null,
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now(),
    }];
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
        const turns = buildSparringTurns(input.format, input.userSide);
        const session: SparringSession = {
          id: createId(),
          motion: input.motion.trim(),
          userSide: input.userSide,
          format: input.format,
          difficulty: input.difficulty,
          turns,
          speeches: [],
          currentTurnIndex: 0,
          phase: 'round',
          draft: '',
          ...timerForTurn(turns[0], now),
          debateId: input.debateId ?? null,
          ...(input.voice ? { voice: true } : {}),
          createdAt: now,
          updatedAt: now,
        };
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
        if (!session?.timerRunning || session.timerDeadline === null) return state;
        const remaining = Math.max(0, Math.ceil((session.timerDeadline - now) / 1000));
        if (remaining === session.timerRemainingSeconds) return state;
        return {
          currentSession: {
            ...session,
            timerRemainingSeconds: remaining,
            timerRunning: remaining > 0,
            timerDeadline: remaining > 0 ? session.timerDeadline : null,
          },
        };
      }),

      pauseTimer: (now = Date.now()) => set((state) => {
        const session = state.currentSession;
        if (!session?.timerRunning || session.timerDeadline === null) return state;
        const remaining = Math.max(0, Math.ceil((session.timerDeadline - now) / 1000));
        return { currentSession: { ...session, timerRemainingSeconds: remaining, timerRunning: false, timerDeadline: null } };
      }),

      resumeTimer: (now = Date.now()) => set((state) => {
        const session = state.currentSession;
        const turn = session ? currentTurn(session) : undefined;
        if (!session || session.phase !== 'round' || turn?.speaker !== 'user' || session.timerRunning || session.timerRemainingSeconds <= 0) return state;
        return { currentSession: { ...session, timerRunning: true, timerDeadline: now + session.timerRemainingSeconds * 1000 } };
      }),

      resetTurnTimer: (now = Date.now()) => set((state) => {
        const session = state.currentSession;
        const turn = session ? currentTurn(session) : undefined;
        if (!session || turn?.speaker !== 'user') return state;
        return { currentSession: { ...session, ...timerForTurn(turn, now) } };
      }),

      submitUserSpeech: (content, now = Date.now(), delivery = null) => {
        const session = get().currentSession;
        const turn = session ? currentTurn(session) : undefined;
        const cleanContent = content.trim();
        const deadlinePassed = session?.timerDeadline !== null
          && session?.timerDeadline !== undefined
          && session.timerDeadline <= now;
        if (!session || session.phase !== 'round' || turn?.speaker !== 'user' || !cleanContent || cleanContent.length > 6_000 || session.timerRemainingSeconds <= 0 || deadlinePassed) return null;
        const remaining = session.timerRunning && session.timerDeadline !== null
          ? Math.max(0, Math.ceil((session.timerDeadline - now) / 1000))
          : session.timerRemainingSeconds;
        const speech: SparringSpeech = {
          id: createId(),
          turnId: turn.id,
          speaker: 'user',
          side: turn.side,
          role: turn.label,
          content: cleanContent,
          createdAt: now,
          timeLimitSeconds: turn.timeLimitSeconds,
          timeUsedSeconds: Math.max(0, turn.timeLimitSeconds - remaining),
          ...(delivery ? { delivery } : {}),
        };
        const next = advanceSession({ ...session, speeches: [...session.speeches, speech] }, now);
        set({ currentSession: next });
        captureRoundCompletion(session, next);
        return next;
      },

      appendAiSpeech: (speech, now = Date.now()) => {
        const session = get().currentSession;
        const turn = session ? currentTurn(session) : undefined;
        const alreadyRecorded = session?.speeches.some((item) => item.id === speech.id || item.turnId === speech.turnId);
        if (!session || session.phase !== 'round' || turn?.speaker !== 'ai' || speech.turnId !== turn.id || alreadyRecorded) return null;
        const next = advanceSession({ ...session, speeches: [...session.speeches, speech] }, now);
        set({ currentSession: next });
        captureRoundCompletion(session, next);
        return next;
      },

      completeSession: (scorecard, now = Date.now()) => {
        const session = get().currentSession;
        if (!session || session.phase !== 'judging') return null;
        const completed: SparringSession = {
          ...session,
          phase: 'complete',
          scorecard,
          timerRemainingSeconds: 0,
          timerRunning: false,
          timerDeadline: null,
          updatedAt: now,
        };
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
