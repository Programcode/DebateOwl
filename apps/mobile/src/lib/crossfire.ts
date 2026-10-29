import { QUOTA_SESSION_KEY } from '@debatelab/core/ai/session-quota';
import {
  collectDebriefTurnIds,
  CrossfireConfigSchema,
  CrossfireDebriefSchema,
  CrossfireReplySchema,
  CrossfireTranscriptSchema,
  CrossfireTurnSignalSchema,
  type CrossfireAIInput,
  type CrossfireConfig,
  type CrossfireDebrief,
  type CrossfirePrefill,
  type CrossfireReply,
  type CrossfireState,
  type CrossfireTurn,
  type CrossfireTurnSignal,
} from '@debatelab/core/crossfire/schemas';
import type { DebateContextRequest } from '@debatelab/core/contract/debate-context';

import { parseVoicePayload, type VoicePayload } from '@debatelab/core/voice/payload';
import { abortError, AIError, functionOutput, postFunction, PROVIDER, responseExtras, type ResponseExtras } from './ai-request';
import { debateListScopes, deletedListScopes } from './debates';
import type { FeatureConfig } from './feature-config';
import { afterWrite, cachedRead, readFailed, type CopyMark } from './offline-cache';
import { sessionSlot } from './session-memory';
import { supabase } from './supabase';

/**
 * Typed Crossfire, sent and saved as the website does it: crossfire and
 * crossfireSignal in src/lib/ai/client.ts for the requests, and
 * CrossfirePage's recordResult call for the saved row. Voice rounds need the
 * development build; the requests here never ask for a spoken reply.
 */

/** The website's Crossfire deadlines: 75 s for a turn or the debrief, 5 s for a coaching signal. */
const TURN_TIMEOUT_MS = 75 * 1000;
const SIGNAL_TIMEOUT_MS = 5 * 1000;

/** The model answered, but not in the shape the round needs. Shown as an unreadable response. */
export class CrossfireResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrossfireResponseError';
  }
}

interface RequestOptions {
  config: FeatureConfig;
  language: string;
  /** Absent for one-off work. */
  debateContext?: DebateContextRequest;
  signal?: AbortSignal;
  /**
   * The round's id, sent beside `input` as the website's crossfire request
   * does (src/lib/ai/request.ts), so the server charges the round once
   * (SESSION_QUOTA) instead of every turn. Signals are not charged per round.
   */
  quotaSession?: string;
  /** A voice round: ask for a reply the opponent's voice can perform. */
  voice?: boolean;
}

// Turn signals and measured delivery facts are client annotations. The Edge
// Function accepts only the turn fields it signs and prompts with.
function serverTranscript(turns: CrossfireTurn[]) {
  return turns.map(({ signal: _signal, delivery: _delivery, ...turn }) => turn);
}

function requestBody(input: Record<string, unknown> & { transcript: CrossfireTurn[] }, options: RequestOptions) {
  return {
    feature: 'crossfire',
    ...(input.operation !== 'signal' && options.quotaSession && QUOTA_SESSION_KEY.test(options.quotaSession) ? { quotaSession: options.quotaSession } : {}),
    input: { ...input, transcript: serverTranscript(input.transcript), language: options.language },
    provider: PROVIDER,
    model: options.config.model,
    reasoningEffort: options.config.reasoningEffort,
    // Servers from before Current Debate context read only this field.
    sourceIds: options.debateContext?.sourceIds ?? [],
    ...(options.debateContext ? { debateContext: options.debateContext } : {}),
    // Beside `input`, as the website sends it, and only for turns: a server from before voice rounds ignores it.
    ...(options.voice && input.operation === 'next-turn' ? { voice: true } : {}),
  };
}

/** The Library sources a round may use: none unless the student turned grounding on. */
export function crossfireContext(context: DebateContextRequest | undefined, config: CrossfireConfig): DebateContextRequest | undefined {
  return context && !config.useSourceLibrary ? { ...context, sourceIds: [] } : context;
}

/**
 * A turn or debrief within the website's 75 s, counted from before the model
 * settings and Library context are read, so a stalled read times out like the
 * request. The caller's signal (leaving the screen) cancels it at any await.
 */
export async function withTurnDeadline<T>(signal: AbortSignal, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TURN_TIMEOUT_MS);
  const abortForCaller = () => controller.abort();
  signal.addEventListener('abort', abortForCaller);
  if (signal.aborted) controller.abort();
  try {
    if (controller.signal.aborted) throw abortError();
    return await work(controller.signal);
  } catch (error) {
    if (signal.aborted) throw abortError();
    if (timedOut) throw new AIError('timeout', 'The request took too long');
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abortForCaller);
  }
}

export type CrossfireNextTurn = CrossfireReply & { signalToken?: string; voice?: VoicePayload };

/** The opponent's next question or answer, checked as the website checks it. */
export function crossfireTurn(
  input: Extract<CrossfireAIInput, { operation: 'next-turn' }>,
  options: RequestOptions,
): Promise<{ reply: CrossfireNextTurn } & ResponseExtras> {
  return postFunction('ai', requestBody(input, options), options.signal, async (response) => {
    const { output, data } = await functionOutput(response);
    const reply = CrossfireReplySchema.safeParse(output);
    if (!reply.success || reply.data.type !== input.expectedReply) {
      throw new CrossfireResponseError('AI response did not match the expected Crossfire turn.');
    }
    const token: unknown = data.signalToken;
    if (token !== undefined && (typeof token !== 'string' || !token.trim() || token.length > 128)) {
      throw new CrossfireResponseError('Crossfire signal token was invalid.');
    }
    // A missing or malformed voice payload only means the device voice reads the reply.
    const voice = options.voice ? parseVoicePayload(data.voice) : undefined;
    return {
      reply: { ...reply.data, ...(typeof token === 'string' ? { signalToken: token } : {}), ...(voice ? { voice } : {}) },
      ...responseExtras(data),
    };
  }, TURN_TIMEOUT_MS);
}

/** The debrief at the end of a round. Every turn it cites must be in the transcript. */
export function crossfireDebrief(
  input: Extract<CrossfireAIInput, { operation: 'debrief' }>,
  options: RequestOptions,
): Promise<{ debrief: CrossfireDebrief } & ResponseExtras> {
  return postFunction('ai', requestBody(input, options), options.signal, async (response) => {
    const { output, data } = await functionOutput(response);
    const debrief = CrossfireDebriefSchema.safeParse(output);
    if (!debrief.success) throw new CrossfireResponseError('AI response did not match the expected Crossfire debrief.');
    const known = new Set(input.transcript.map((turn) => turn.id));
    if (collectDebriefTurnIds(debrief.data).some((id) => !known.has(id))) {
      throw new CrossfireResponseError('AI debrief referenced transcript turns that do not exist.');
    }
    return { debrief: debrief.data, ...responseExtras(data) };
  }, TURN_TIMEOUT_MS);
}

/**
 * The live coaching signal for an answer, asked for after a turn as the
 * website does: no debate material, a 5 s budget, and nothing at all when
 * the server has none to give.
 */
export function crossfireSignal(
  input: { config: CrossfireConfig; transcript: CrossfireTurn[]; reply: CrossfireReply; signalToken: string },
  options: Omit<RequestOptions, 'debateContext' | 'quotaSession'>,
): Promise<CrossfireTurnSignal | undefined> {
  return postFunction('ai', requestBody({ operation: 'signal', ...input }, options), options.signal, async (response) => {
    const { output } = await functionOutput(response);
    if (!output || typeof output !== 'object' || Array.isArray(output) || !('signal' in output)) return undefined;
    const parsed = CrossfireTurnSignalSchema.safeParse((output as { signal: unknown }).signal);
    if (!parsed.success) throw new CrossfireResponseError('Crossfire signal did not match the expected schema.');
    const turns = [...input.transcript, { id: `T${input.transcript.length + 1}`, kind: input.reply.type }];
    const target = turns.find((turn) => turn.id === parsed.data.answerTurnId);
    if (!target || target.kind !== 'answer') throw new CrossfireResponseError('Crossfire signal referenced an unknown or non-answer turn.');
    return parsed.data;
  }, SIGNAL_TIMEOUT_MS);
}

/**
 * Saves a finished round into its debate, as CrossfirePage's recordResult
 * call: the resolution as title, the config as input, and the transcript,
 * debrief and why it ended as output. Rounds have no side. Returns the row's id.
 */
export async function recordCrossfire(
  userId: string,
  debateId: string,
  round: Extract<CrossfireState, { phase: 'complete' }>,
): Promise<string> {
  const { data, error } = await supabase
    .from('crossfires')
    .insert({
      user_id: userId,
      debate_id: debateId,
      side: 'neutral',
      title: round.config.resolution.slice(0, 300) || 'Untitled',
      input: round.config,
      output: { turns: round.turns, debrief: round.debrief, endedReason: round.endedReason },
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Could not save the crossfire');
  afterWrite(userId, debateListScopes(debateId, 'crossfire'));
  return (data as { id: string }).id;
}

/** How many of the debate's Library sources are active, for the grounding switch's hint. */
export async function countActiveSources(userId: string, debateId: string): Promise<number> {
  const { count, error } = await supabase
    .from('sources')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('debate_id', debateId)
    .eq('is_active', true);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/**
 * The unfinished round, kept for the session as the website keeps its draft
 * in the browser: leaving the screen and coming back continues it. It
 * belongs to the signed-in account and is forgotten when that changes. The
 * debate is the one chosen when the round started; null for one-off rounds.
 */
export const crossfireDraft = sessionSlot<{ state: CrossfireState; debateId: string | null } | null>(() => null);

/**
 * What "Open in Crossfire" on a case or an attack hands the next Crossfire
 * screen, as the website's route state: taken once, when the screen opens.
 */
export const crossfirePrefill = sessionSlot<CrossfirePrefill | null>(() => null);

/** A saved round as it was recorded: the transcript with its signals and delivery, and the debrief. */
export interface SavedCrossfire {
  id: string;
  title: string;
  createdAt: number;
  config: CrossfireConfig | null;
  turns: CrossfireTurn[];
  debrief: CrossfireDebrief | null;
}

async function loadCrossfireRound(userId: string, id: string): Promise<SavedCrossfire | null> {
  const { data, error, status } = await supabase.from('crossfires').select('id,title,input,output,created_at').eq('user_id', userId).eq('id', id).maybeSingle();
  if (error) throw readFailed(error, status);
  if (!data) return null;
  const row = data as { id: string; title: string | null; input: unknown; output: unknown; created_at: string };
  const output = row.output && typeof row.output === 'object' ? (row.output as Record<string, unknown>) : {};
  // The website's own rows, read with its schemas; a part that does not parse is left out, not guessed.
  const turns = CrossfireTranscriptSchema.safeParse(output.turns);
  const debrief = CrossfireDebriefSchema.safeParse(output.debrief);
  const config = CrossfireConfigSchema.safeParse(row.input);
  return {
    id: row.id,
    title: row.title ?? '',
    createdAt: new Date(row.created_at).getTime(),
    config: config.success ? config.data : null,
    turns: turns.success ? turns.data : [],
    debrief: debrief.success ? debrief.data : null,
  };
}

/** A saved round, for reading it again from History or the Debate tab. */
export function fetchCrossfireRound(userId: string, id: string, mark?: CopyMark): Promise<SavedCrossfire | null> {
  return cachedRead(userId, 'crossfire', id, () => loadCrossfireRound(userId, id), mark);
}

/** Delete only this account's round and retire every offline copy its lists held. */
export async function deleteCrossfireRound(userId: string, id: string): Promise<void> {
  const { data, error } = await supabase.from('crossfires').delete().eq('user_id', userId).eq('id', id).select('debate_id');
  if (error) throw new Error(error.message);
  const deletedFrom = ((data ?? []) as { debate_id: string | null }[]).map((row) => row.debate_id);
  afterWrite(userId, [{ group: 'crossfire', key: id }, ...deletedListScopes(deletedFrom, 'crossfire')]);
}
