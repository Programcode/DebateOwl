import type { ProviderConfig } from '../providers/types';
import {
  CrossfireAIInputSchema,
  CrossfireDebriefSchema,
  CrossfireReplySchema,
  CrossfireSignalInputSchema,
  CrossfireTurnSignalSchema,
  collectDebriefTurnIds,
  type CrossfireAIInput,
  type CrossfireDebrief,
  type CrossfireReply,
  type CrossfireSignalInput,
  type CrossfireTurnSignal,
} from '@/lib/crossfire/schemas';
import { parseVoicePayload, type VoicePayload } from '@/lib/voice/payload';
import { AIResponseError } from '../errors';
import { callSupabaseAI, withOutputLanguage, type AIRequestOptions } from '../request';

export const CROSSFIRE_REQUEST_TIMEOUT_MS = 75 * 1000;

function validateCrossfireTurnReferences(input: CrossfireAIInput, debrief: CrossfireDebrief): void {
  const validIds = new Set(input.transcript.map((turn) => turn.id));
  const invalidIds = collectDebriefTurnIds(debrief).filter((id) => !validIds.has(id));
  if (invalidIds.length > 0) {
    throw new AIResponseError('AI debrief referenced transcript turns that do not exist.', {
      details: { invalidTurnIds: Array.from(new Set(invalidIds)).slice(0, 12) },
    });
  }
}

export async function crossfire(
  rawInput: CrossfireAIInput,
  config: ProviderConfig,
  options: Pick<AIRequestOptions, 'signal' | 'workspaceContext' | 'debateId' | 'voice' | 'live' | 'quotaSession'> = {},
): Promise<(CrossfireReply & { signalToken?: string; voice?: VoicePayload }) | CrossfireDebrief> {
  const input = CrossfireAIInputSchema.safeParse(rawInput);
  if (!input.success) {
    throw new AIResponseError('Crossfire request did not match the expected schema.', {
      details: { issues: input.error.issues },
    });
  }

  return await callSupabaseAI<CrossfireReply | CrossfireDebrief>(
    'crossfire',
    withOutputLanguage({ ...input.data, transcript: serverTranscript(input.data.transcript) }),
    config,
    {
      includeActiveSources: input.data.config.useSourceLibrary,
      timeoutMs: CROSSFIRE_REQUEST_TIMEOUT_MS,
      signal: options.signal,
      workspaceContext: options.workspaceContext,
      debateId: options.debateId,
      voice: options.voice && input.data.operation === 'next-turn',
      live: options.live,
      // The round is charged once: every turn and the debrief name it.
      quotaSession: options.quotaSession,
      // Turns keep the round's Review choices; the debrief ends the round.
      keepContextChoices: input.data.operation === 'next-turn',
      transformResponse: (rawData) => {
        const data = rawData as { output: unknown; signalToken?: unknown; voice?: unknown };
        if (input.data.operation === 'next-turn') {
          const reply = CrossfireReplySchema.safeParse(data.output);
          if (!reply.success || reply.data.type !== input.data.expectedReply) {
            throw new AIResponseError('AI response did not match the expected Crossfire turn.', {
              details: reply.success
                ? { expectedReply: input.data.expectedReply, actualReply: reply.data.type }
                : { issues: reply.error.issues },
            });
          }
          // A missing or malformed voice payload only means the browser voice reads the reply.
          const voice = options.voice ? parseVoicePayload(data.voice) : undefined;
          const spoken = voice ? { ...reply.data, voice } : reply.data;
          if (data.signalToken === undefined) return spoken;
          if (typeof data.signalToken !== 'string' || !data.signalToken.trim() || data.signalToken.length > 128) {
            throw new AIResponseError('Crossfire signal token was invalid.');
          }
          return { ...spoken, signalToken: data.signalToken };
        }

        const debrief = CrossfireDebriefSchema.safeParse(data.output);
        if (!debrief.success) {
          throw new AIResponseError('AI response did not match the expected Crossfire debrief.', {
            details: { issues: debrief.error.issues },
          });
        }
        validateCrossfireTurnReferences(input.data, debrief.data);
        return debrief.data;
      },
    },
  );
}

// Turn signals and measured delivery facts are client annotations. The Edge
// Function accepts only the turn fields it signs and prompts with, so strip
// them from every request.
function serverTranscript(turns: CrossfireAIInput['transcript']) {
  return turns.map(({ signal: _signal, delivery: _delivery, ...turn }) => turn);
}

export async function crossfireSignal(
  rawInput: CrossfireSignalInput,
  config: ProviderConfig,
  options: Pick<AIRequestOptions, 'signal'> = {},
): Promise<CrossfireTurnSignal | undefined> {
  const input = CrossfireSignalInputSchema.safeParse(rawInput);
  if (!input.success) {
    throw new AIResponseError('Crossfire signal request did not match the expected schema.', { details: { issues: input.error.issues } });
  }
  return await callSupabaseAI<CrossfireTurnSignal | undefined>(
    'crossfire',
    withOutputLanguage({ operation: 'signal', ...input.data, transcript: serverTranscript(input.data.transcript) }),
    config,
    {
      includeActiveSources: false,
      debateId: null,
      timeoutMs: 5_000,
      signal: options.signal,
      transformResponse: (rawData) => {
        const output = (rawData as { output?: unknown }).output;
        if (!output || typeof output !== 'object' || Array.isArray(output) || !('signal' in output)) return undefined;
        const parsed = CrossfireTurnSignalSchema.safeParse((output as { signal: unknown }).signal);
        if (!parsed.success) throw new AIResponseError('Crossfire signal did not match the expected schema.', { details: { issues: parsed.error.issues } });
        const turns = [
          ...input.data.transcript,
          { id: `T${input.data.transcript.length + 1}`, kind: input.data.reply.type },
        ];
        const target = turns.find((turn) => turn.id === parsed.data.answerTurnId);
        if (!target || target.kind !== 'answer') throw new AIResponseError('Crossfire signal referenced an unknown or non-answer turn.');
        return parsed.data;
      },
    },
  );
}
