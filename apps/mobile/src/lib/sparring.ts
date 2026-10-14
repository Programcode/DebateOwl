import {
  SparringInputSchema,
  SparringScoreResponseSchema,
  SparringTurnResponseSchema,
  type SparringRespondInput,
  type SparringScorecard,
  type SparringScoreInput,
  type SparringSide,
  type SparringTurnResponse,
} from '@debatelab/core/ai/schemas/sparring';
import { parseSavedSparringRows, SPARRING_SESSION_COLUMNS, type SparringSession } from '@debatelab/core/sparring/session';
import * as Crypto from 'expo-crypto';

import { AIError, functionOutput, postFunction, PROVIDER } from './ai-request';
import type { FeatureConfig } from './feature-config';
import { sessionSlot } from './session-memory';
import { supabase } from './supabase';

/**
 * Typed Sparring, sent and saved as the website does it: generateSparringTurn
 * and judgeSparringSession in src/lib/ai/client.ts for the requests, and the
 * sparring store (src/lib/stores/sparring-store.ts) for the rest. The server
 * saves the round when it judges it; the app then files it in its debate and
 * reads, reopens and deletes saved rounds. Voice rounds need the development
 * build, so the requests never ask for a spoken reply.
 */

/** The model answered, but not in the shape the round needs. */
export class SparringResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SparringResponseError';
  }
}

interface RequestOptions {
  config: FeatureConfig;
  /** The debate the round belongs to; null for a one-off round. */
  debateId: string | null;
  signal?: AbortSignal;
}

/** The website's request body. A live round stays transcript-only, so its debate context carries no sources or results. */
function requestBody(input: SparringRespondInput | SparringScoreInput, options: RequestOptions) {
  const parsed = SparringInputSchema.safeParse(input);
  if (!parsed.success) throw new AIError('failed', 'Invalid sparring request.');
  return {
    feature: 'sparring',
    input: parsed.data,
    provider: PROVIDER,
    model: options.config.model,
    temperature: options.config.temperature,
    reasoningEffort: options.config.reasoningEffort,
    // Servers from before Current Debate context read only this field.
    sourceIds: [],
    ...(options.debateId ? { debateContext: { debateId: options.debateId, side: input.userSide, sourceIds: [], outputs: [] } } : {}),
  };
}

/** The opponent's speech for the current turn, with the token the server signed it with. */
export function sparringTurn(input: SparringRespondInput, options: RequestOptions): Promise<SparringTurnResponse['speech']> {
  return postFunction('ai', requestBody(input, options), options.signal, async (response) => {
    const { output } = await functionOutput(response);
    const parsed = SparringTurnResponseSchema.safeParse(output);
    if (!parsed.success) throw new SparringResponseError('AI response did not match the expected sparring turn schema.');
    return parsed.data.speech;
  });
}

/**
 * The judge's scorecard. The server saves the judged round to
 * sparring_sessions before it answers, and answers a repeated request with
 * the scorecard it saved.
 */
export function judgeSparring(input: SparringScoreInput, options: RequestOptions): Promise<SparringScorecard> {
  return postFunction('ai', requestBody(input, options), options.signal, async (response) => {
    const { output } = await functionOutput(response);
    const parsed = SparringScoreResponseSchema.safeParse(output);
    if (!parsed.success) throw new SparringResponseError('AI response did not match the expected sparring score schema.');
    return parsed.data.scorecard;
  });
}

/** Files a judged round in its debate under the side the student spoke, as the store's attachSessionToDebate. */
export async function attachSparring(id: string, debateId: string, side: SparringSide): Promise<void> {
  const { error } = await supabase.rpc('attach_to_debate', { p_kind: 'sparring', p_id: id, p_debate_id: debateId, p_side: side });
  if (error) throw new Error(error.message);
}

/** A saved, judged round; null when there is none or it does not check out. */
export async function fetchSparringRound(userId: string, id: string): Promise<SparringSession | null> {
  const { data, error } = await supabase.from('sparring_sessions').select(SPARRING_SESSION_COLUMNS).eq('user_id', userId).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? parseSavedSparringRows([data])[0] ?? null : null;
}

export interface SparringRoundSummary {
  id: string;
  motion: string;
  userSide: SparringSide;
  updatedAt: number;
}

/**
 * The judged rounds in one debate, or outside every debate when `debateId` is
 * null, newest first, as the website's history lists them.
 */
export async function fetchSparringRounds(userId: string, debateId: string | null, limit: number): Promise<SparringRoundSummary[]> {
  let query = supabase.from('sparring_sessions').select('id,motion,user_side,updated_at').eq('user_id', userId).eq('status', 'complete');
  query = debateId ? query.eq('debate_id', debateId) : query.is('debate_id', null);
  const { data, error } = await query.order('updated_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { id: string; motion: string; user_side: SparringSide; updated_at: string }[]).map((row) => ({
    id: row.id,
    motion: row.motion,
    userSide: row.user_side,
    updatedAt: new Date(row.updated_at).getTime(),
  }));
}

export async function deleteSparringRound(userId: string, id: string): Promise<void> {
  const { error } = await supabase.from('sparring_sessions').delete().eq('user_id', userId).eq('id', id);
  if (error) throw new Error(error.message);
}

/** A new round's id. The server takes it as the saved row's id, so it must be a UUID. */
export function newSparringId(): string {
  return Crypto.randomUUID();
}

/**
 * The unfinished round, kept for the session as the website keeps it in the
 * tab: leaving the screen and coming back continues it. It belongs to the
 * signed-in account and is forgotten when that changes.
 */
export const sparringDraft = sessionSlot<SparringSession | null>(() => null);
