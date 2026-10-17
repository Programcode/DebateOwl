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
const pendingSparringTurns = new Map<string, Promise<SparringTurnResult>>();
const pendingSparringScores = new Map<string, Promise<SparringScoreResponse>>();

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
  const requestKey = sparringRequestKey(inputResult.data, config, workspaceContext, debateId, voice);
  const pending = pendingSparringTurns.get(requestKey);
  if (pending) return pending;

  const request = generateSparringTurnOnce(inputResult.data, config, workspaceContext, debateId, voice, live);
  pendingSparringTurns.set(requestKey, request);
  try {
    return await request;
  } finally {
    if (pendingSparringTurns.get(requestKey) === request) pendingSparringTurns.delete(requestKey);
  }
}

async function generateSparringTurnOnce(
  input: SparringRespondInput,
  config: ProviderConfig,
  workspaceContext: WorkspaceToolContext | undefined,
  debateId: string | null,
  voice: boolean,
  live: LiveGeneration | undefined,
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
  const requestKey = sparringRequestKey(inputResult.data, config, workspaceContext, debateId);
  const pending = pendingSparringScores.get(requestKey);
  if (pending) return pending;

  const request = judgeSparringSessionOnce(inputResult.data, config, workspaceContext, debateId, live);
  pendingSparringScores.set(requestKey, request);
  try {
    return await request;
  } finally {
    if (pendingSparringScores.get(requestKey) === request) pendingSparringScores.delete(requestKey);
  }
}

async function judgeSparringSessionOnce(
  input: SparringScoreInput,
  config: ProviderConfig,
  workspaceContext: WorkspaceToolContext | undefined,
  debateId: string | null,
  live: LiveGeneration | undefined,
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
