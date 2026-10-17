import type { ProviderConfig } from '../providers/types';
import {
  SparringInputSchema,
  SparringScoreResponseSchema,
  SparringTurnResponseSchema,
  type SparringRespondInput,
  type SparringScoreInput,
  type SparringScoreResponse,
  type SparringTurnResponse,
} from '../schemas/sparring';
import { getActiveAccessToken, getActiveUserId } from '@/lib/supabase/client';
import type { WorkspaceToolContext } from '@/lib/workspace/tool-context';
import { parseVoicePayload, type VoicePayload } from '@/lib/voice/payload';
import { AIResponseError } from '../errors';
import { callSupabaseAI, selectedOutputLanguage } from '../request';
import type { LiveGeneration } from '../live';

function sparringLanguage(language: string): string {
  return language.trim() || selectedOutputLanguage();
}

function validateSparringTurnResponse(output: unknown): SparringTurnResponse {
  const parsed = SparringTurnResponseSchema.safeParse(output);
  if (!parsed.success) {
    throw new AIResponseError('AI response did not match the expected sparring turn schema.', {
      details: { issues: parsed.error.issues },
    });
  }
  return parsed.data;
}

function validateSparringScoreResponse(output: unknown): SparringScoreResponse {
  const parsed = SparringScoreResponseSchema.safeParse(output);
  if (!parsed.success) {
    throw new AIResponseError('AI response did not match the expected sparring score schema.', {
      details: { issues: parsed.error.issues },
    });
  }
  return parsed.data;
}

// Page navigation can unmount and remount the sparring screen while a provider
// request is still running. Keep identical work process-wide so the returning
// screen joins the original promise instead of consuming a second AI request.
export type SparringTurnResult = SparringTurnResponse & { voice?: VoicePayload };

/** A running request and everyone following its live text, including screens that rejoin it. */
interface PendingSparring<T> {
  request: Promise<T>;
  watchers: Set<LiveGeneration>;
  draft?: Record<string, unknown>;
}
const pendingSparringTurns = new Map<string, PendingSparring<SparringTurnResult>>();
const pendingSparringScores = new Map<string, PendingSparring<SparringScoreResponse>>();

/** Runs a request once per key. A caller that joins it gets the draft so far and every later one. */
async function sharedSparringRequest<T>(
  pending: Map<string, PendingSparring<T>>,
  key: string,
  live: LiveGeneration | undefined,
  run: (live: LiveGeneration) => Promise<T>,
): Promise<T> {
  const existing = pending.get(key);
  if (existing) {
    if (live) {
      existing.watchers.add(live);
      if (existing.draft) live.onDraft(existing.draft);
    }
    return existing.request;
  }
  const entry = { watchers: new Set(live ? [live] : []) } as PendingSparring<T>;
  entry.request = run({
    onDraft: (draft) => {
      entry.draft = draft;
      entry.watchers.forEach((watcher) => watcher.onDraft(draft));
    },
    onPhase: (phase) => entry.watchers.forEach((watcher) => watcher.onPhase?.(phase)),
  });
  pending.set(key, entry);
  try {
    return await entry.request;
  } finally {
    if (pending.get(key) === entry) pending.delete(key);
  }
}

function sparringRequestKey(
  input: SparringRespondInput | SparringScoreInput,
  config: ProviderConfig,
  workspaceContext?: WorkspaceToolContext,
  debateId: string | null = null,
  voice = false,
): string {
  const authScope = getActiveUserId() ?? getActiveAccessToken() ?? 'signed-out';
  return JSON.stringify([authScope, workspaceContext?.workspaceId ?? null, debateId, input, config.provider, config.model, config.reasoningEffort, voice]);
}

/** Generate the opponent's next speech for a validated sparring turn. */
export async function generateSparringTurn(
  input: SparringRespondInput,
  config: ProviderConfig,
  workspaceContext?: WorkspaceToolContext,
  /** The debate this round belongs to; null for a one-off round. */
  debateId: string | null = null,
  /** A voice round: the reply also carries segments the opponent's voice can perform. */
  voice = false,
  live?: LiveGeneration,
): Promise<SparringTurnResult> {
  const requestInput: SparringRespondInput = {
    ...input,
    language: sparringLanguage(input.language),
  };
  const inputResult = SparringInputSchema.safeParse(requestInput);
  if (!inputResult.success || inputResult.data.action !== 'respond') {
    throw new AIResponseError('Invalid sparring turn request.', {
      details: { issues: inputResult.success ? [{ message: 'Expected respond action.' }] : inputResult.error.issues },
    });
  }
  const respondInput = inputResult.data;
  const requestKey = sparringRequestKey(respondInput, config, workspaceContext, debateId, voice);
  return await sharedSparringRequest(pendingSparringTurns, requestKey, live, (shared) =>
    generateSparringTurnOnce(respondInput, config, workspaceContext, debateId, voice, shared));
}

async function generateSparringTurnOnce(
  input: SparringRespondInput,
  config: ProviderConfig,
  workspaceContext: WorkspaceToolContext | undefined,
  debateId: string | null,
  voice: boolean,
  live: LiveGeneration,
): Promise<SparringTurnResult> {
  const requestInput: SparringRespondInput = {
    ...input,
    language: sparringLanguage(input.language),
  };
  const inputResult = SparringInputSchema.safeParse(requestInput);
  if (!inputResult.success || inputResult.data.action !== 'respond') {
    throw new AIResponseError('Invalid sparring turn request.', {
      details: { issues: inputResult.success ? [{ message: 'Expected respond action.' }] : inputResult.error.issues },
    });
  }

  return await callSupabaseAI<SparringTurnResult>('sparring', inputResult.data, config, {
    workspaceContext,
    debateId,
    voice,
    live,
    // Turns keep the round's Review choices; judging ends the round.
    keepContextChoices: true,
    transformResponse: (rawData) => {
      const data = rawData as { output: unknown; voice?: unknown };
      const response = validateSparringTurnResponse(data.output);
      // A missing or malformed voice payload only means the browser voice reads the speech.
      const payload = voice ? parseVoicePayload(data.voice) : undefined;
      return payload ? { ...response, voice: payload } : response;
    },
  });
}

/** Judge a completed sparring session and return its validated scorecard. */
export async function judgeSparringSession(
  input: SparringScoreInput,
  config: ProviderConfig,
  workspaceContext?: WorkspaceToolContext,
  /** The debate this round belongs to; null for a one-off round. */
  debateId: string | null = null,
  live?: LiveGeneration,
): Promise<SparringScoreResponse> {
  const requestInput: SparringScoreInput = {
    ...input,
    language: sparringLanguage(input.language),
  };
  const inputResult = SparringInputSchema.safeParse(requestInput);
  if (!inputResult.success || inputResult.data.action !== 'score') {
    throw new AIResponseError('Invalid sparring score request.', {
      details: { issues: inputResult.success ? [{ message: 'Expected score action.' }] : inputResult.error.issues },
    });
  }
  const scoreInput = inputResult.data;
  const requestKey = sparringRequestKey(scoreInput, config, workspaceContext, debateId);
  return await sharedSparringRequest(pendingSparringScores, requestKey, live, (shared) =>
    judgeSparringSessionOnce(scoreInput, config, workspaceContext, debateId, shared));
}

async function judgeSparringSessionOnce(
  input: SparringScoreInput,
  config: ProviderConfig,
  workspaceContext: WorkspaceToolContext | undefined,
  debateId: string | null,
  live: LiveGeneration,
): Promise<SparringScoreResponse> {
  const requestInput: SparringScoreInput = {
    ...input,
    language: sparringLanguage(input.language),
  };
  const inputResult = SparringInputSchema.safeParse(requestInput);
  if (!inputResult.success || inputResult.data.action !== 'score') {
    throw new AIResponseError('Invalid sparring score request.', {
      details: { issues: inputResult.success ? [{ message: 'Expected score action.' }] : inputResult.error.issues },
    });
  }

  return await callSupabaseAI<SparringScoreResponse>('sparring', inputResult.data, config, {
    workspaceContext,
    debateId,
    live,
    transformResponse: (rawData) => validateSparringScoreResponse((rawData as { output: unknown }).output),
  });
}
