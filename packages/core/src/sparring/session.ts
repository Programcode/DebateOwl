import { z } from 'zod';
import {
  SparringScorecardSchema,
  SparringSpeechSchema,
  type SparringDifficulty,
  type SparringFormat,
  type SparringScorecard,
  type SparringSide,
  type SparringSpeech,
} from '../ai/schemas/sparring';
import { buildSparringTurns, type SparringTurn } from './formats';

/**
 * A Sparring round and its moves: whose turn it is, the speaking clock, the
 * speeches, and judging. The website's sparring store and the app both keep
 * a round with these. Each move returns the same object when nothing changes,
 * and null when the move is not allowed.
 */

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

export interface StartSparringInput {
  motion: string;
  userSide: SparringSide;
  format: SparringFormat;
  difficulty: SparringDifficulty;
  debateId?: string | null;
  voice?: boolean;
}

export const MAX_SPARRING_SPEECH_CHARS = 6_000;
export const MAX_SAVED_SPARRING_SESSIONS = 50;

export function currentSparringTurn(session: SparringSession): SparringTurn | undefined {
  return session.turns[session.currentTurnIndex];
}

/** The clock for a turn: the student's turns start running at once; the opponent's have none. */
export function timerForTurn(turn: SparringTurn | undefined, now: number) {
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

export function startSparringSession(input: StartSparringInput, id: string, now: number): SparringSession {
  const turns = buildSparringTurns(input.format, input.userSide);
  return {
    id,
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
}

/** Recounts the running clock from its deadline. The same object while the whole seconds left have not changed. */
export function tickSparringTimer(session: SparringSession, now: number): SparringSession {
  if (!session.timerRunning || session.timerDeadline === null) return session;
  const remaining = Math.max(0, Math.ceil((session.timerDeadline - now) / 1000));
  if (remaining === session.timerRemainingSeconds) return session;
  return {
    ...session,
    timerRemainingSeconds: remaining,
    timerRunning: remaining > 0,
    timerDeadline: remaining > 0 ? session.timerDeadline : null,
  };
}

export function pauseSparringTimer(session: SparringSession, now: number): SparringSession {
  if (!session.timerRunning || session.timerDeadline === null) return session;
  const remaining = Math.max(0, Math.ceil((session.timerDeadline - now) / 1000));
  return { ...session, timerRemainingSeconds: remaining, timerRunning: false, timerDeadline: null };
}

export function resumeSparringTimer(session: SparringSession, now: number): SparringSession {
  const turn = currentSparringTurn(session);
  if (session.phase !== 'round' || turn?.speaker !== 'user' || session.timerRunning || session.timerRemainingSeconds <= 0) return session;
  return { ...session, timerRunning: true, timerDeadline: now + session.timerRemainingSeconds * 1000 };
}

/** Starts the student's turn again with its full time. */
export function resetSparringTurnTimer(session: SparringSession, now: number): SparringSession {
  const turn = currentSparringTurn(session);
  if (turn?.speaker !== 'user') return session;
  return { ...session, ...timerForTurn(turn, now) };
}

/**
 * Records the student's speech and moves to the next turn. Null when it is
 * not the student's turn, the text is empty or too long, or the time is up.
 */
export function submitSparringSpeech(
  session: SparringSession,
  content: string,
  options: { now: number; createId: () => string; delivery?: SparringSpeech['delivery'] | null },
): SparringSession | null {
  const { now, delivery = null } = options;
  const turn = currentSparringTurn(session);
  const cleanContent = content.trim();
  const deadlinePassed = session.timerDeadline !== null && session.timerDeadline <= now;
  if (session.phase !== 'round' || turn?.speaker !== 'user' || !cleanContent || cleanContent.length > MAX_SPARRING_SPEECH_CHARS || session.timerRemainingSeconds <= 0 || deadlinePassed) return null;
  const remaining = session.timerRunning && session.timerDeadline !== null
    ? Math.max(0, Math.ceil((session.timerDeadline - now) / 1000))
    : session.timerRemainingSeconds;
  const speech: SparringSpeech = {
    id: options.createId(),
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
  return advanceSession({ ...session, speeches: [...session.speeches, speech] }, now);
}

/** Records the opponent's speech for the current turn, once. Null for any other turn. */
export function appendSparringAiSpeech(session: SparringSession, speech: SparringSpeech, now: number): SparringSession | null {
  const turn = currentSparringTurn(session);
  const alreadyRecorded = session.speeches.some((item) => item.id === speech.id || item.turnId === speech.turnId);
  if (session.phase !== 'round' || turn?.speaker !== 'ai' || speech.turnId !== turn.id || alreadyRecorded) return null;
  return advanceSession({ ...session, speeches: [...session.speeches, speech] }, now);
}

/** The judged round. Null unless the round is waiting for its judge. */
export function completeSparringSession(session: SparringSession, scorecard: SparringScorecard, now: number): (SparringSession & { scorecard: SparringScorecard }) | null {
  if (session.phase !== 'judging') return null;
  return {
    ...session,
    phase: 'complete',
    scorecard,
    timerRemainingSeconds: 0,
    timerRunning: false,
    timerDeadline: null,
    updatedAt: now,
  };
}

/** How long the opponent's typed speech would take aloud, at 140 words a minute. */
export function estimateAiTimeUsedSeconds(content: string, limit: number) {
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  return Math.min(limit, Math.max(1, Math.round((words / 140) * 60)));
}

/** One list of saved rounds, the newest copy of each, newest first. */
export function mergeSparringSessions(local: SparringSession[], remote: SparringSession[]): SparringSession[] {
  const byId = new Map<string, SparringSession>();
  for (const session of [...local, ...remote]) {
    const current = byId.get(session.id);
    if (!current || current.updatedAt < session.updatedAt) byId.set(session.id, session);
  }
  return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SAVED_SPARRING_SESSIONS);
}

/** The sparring_sessions columns a saved round is read from. */
export const SPARRING_SESSION_COLUMNS = 'id,motion,user_side,format,difficulty,turns,final_evaluation,status,debate_id,created_at,updated_at';

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

/** Judged rounds from sparring_sessions rows. Rows that are unfinished or do not check out are left out. */
export function parseSavedSparringRows(value: unknown): SparringSession[] {
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
