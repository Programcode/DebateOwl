import type { ProviderConfig } from './providers/types';
import { GenerateOutputSchema, type GenerateInput, type GenerateOutput } from './schemas/generate';
import { AttackOutputSchema, type AttackOutput, type AttackInput } from './schemas/attack';
import type { BrainstormOutput, BrainstormInput } from './schemas/brainstorm';
import { FactoidsOutputSchema, type FactoidsOutput, type FactoidsInput } from './schemas/factoids';
import { AskOutputSchema, type AskOutput } from './schemas/ask';
import {
  SparringInputSchema,
  SparringScoreResponseSchema,
  SparringTurnResponseSchema,
  type SparringRespondInput,
  type SparringScoreInput,
  type SparringScoreResponse,
  type SparringTurnResponse,
} from './schemas/sparring';
import { useSettingsStore } from '../stores/settings-store';
import { useSessionStore } from '../stores/session-store';
import { activeDebateId, useDebateStore } from '../stores/debate-store';
import { parseDebateContextUsage, useDebateContextStore } from '../stores/debate-context-store';
import { currentDebateContextPlan } from '../debate/context-state';
import { requestSide, type DebateContextRequest } from '../../../supabase/functions/_shared/debate-context';
import { cleanGeneratedOutput, expectedContentionCount, transformGenerateResponse } from '@debatelab/core/ai/generate-output';
import { parseSourceAssessments } from '@debatelab/core/ai/source-assessments';
import {
  autoSavedSourceRow,
  parseDiscoveredSources,
  retainedDiscoveredSources,
  type DiscoveredSource,
  type ResultWithSources,
} from '@debatelab/core/ai/discovered-sources';
import { getActiveAccessToken, getActiveUserId, invokeAuthenticatedFunction, supabase } from '@/lib/supabase/client';
import { toast } from '@/hooks/use-toast';
import { captureException, captureProductEvent } from '@/lib/observability';
import { isAppLanguage, type AppLanguage } from '@/lib/languages';
import i18n from '@/i18n';
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
import type { WorkspaceToolContext } from '@/lib/workspace/tool-context';

export type { DiscoveredSource, ResultWithSources };
import { parseVoicePayload, type VoicePayload } from '@/lib/voice/payload';

// Request timeout in milliseconds (200 seconds)
export const REQUEST_TIMEOUT_MS = 200 * 1000;
export const CROSSFIRE_REQUEST_TIMEOUT_MS = 75 * 1000;
const MAX_CLIENT_ERROR_BODY_BYTES = 16_000;
const MAX_CLIENT_REQUEST_BODY_BYTES = 190_000;
const MAX_ASK_HISTORY_ITEMS = 8;
const MAX_ASK_HISTORY_CONTENT_BYTES = 6_000;
const MAX_ASK_HISTORY_TOTAL_BYTES = 48_000;
const MAX_ASK_MESSAGE_BYTES = 80_000;

interface AIRequestOptions<T = unknown> {
  includeActiveSources?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  transformResponse?: (data: unknown) => T;
  workspaceContext?: WorkspaceToolContext;
  /** Debate whose material grounds this request; null for one-off work. Defaults to the active debate. */
  debateId?: string | null;
  /**
   * Keep the Review choices after this request. Crossfire and Sparring show
   * Review once before a round, so its choices cover every turn; the request
   * that ends the round leaves this off and clears them.
   */
  keepContextChoices?: boolean;
  /** A voice round: ask for a reply the opponent's voice can perform. */
  voice?: boolean;
}

/**
 * The Current Debate context a request sends: IDs and preferences only. The
 * server loads and authorizes the text. One-off and Workspace requests send none.
 */
export function debateContextForRequest(
  feature: Parameters<typeof requestSide>[0],
  input: unknown,
  debateId: string | null,
  options: { includeSources?: boolean; workspace?: boolean } = {},
): DebateContextRequest | undefined {
  if (!debateId || options.workspace) return undefined;
  const record = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
  return currentDebateContextPlan(feature, requestSide(feature, record), debateId, { includeSources: options.includeSources }).request;
}

/**
 * A debate request that comes back 404 means the debate is gone, usually
 * deleted on another device. Reload the list so the app stops using it.
 */
export function refreshDebatesIfMissing(error: unknown, debateContext: DebateContextRequest | undefined): void {
  if (debateContext && error instanceof AIError && error.statusCode === 404) {
    void useDebateStore.getState().hydrate();
  }
}

function selectedOutputLanguage(): AppLanguage {
  const language = useSettingsStore.getState().outputLanguage;
  return isAppLanguage(language) ? language : 'en';
}

export function withOutputLanguage(input: Record<string, unknown>): Record<string, unknown> {
  return { ...input, language: selectedOutputLanguage() };
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function truncateUtf8(value: string, maxBytes: number): string {
  const encoded = new TextEncoder().encode(value);
  if (encoded.byteLength <= maxBytes) return value;
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (let end = maxBytes; end > Math.max(0, maxBytes - 4); end -= 1) {
    try {
      return decoder.decode(encoded.subarray(0, end));
    } catch {
      // Move to the prior complete UTF-8 code point.
    }
  }
  return '';
}

export function boundAskMessage(message: string): string {
  if (!isAskMessageWithinBudget(message)) {
    throw new AIError('Message is too large. Shorten it before sending.', { statusCode: 413 });
  }
  return message;
}

export function isAskMessageWithinBudget(message: string): boolean {
  return utf8ByteLength(message) <= MAX_ASK_MESSAGE_BYTES;
}

export function boundAskHistory(history: { role: 'user' | 'assistant'; content: string }[]) {
  let remaining = MAX_ASK_HISTORY_TOTAL_BYTES;
  return history.slice(-MAX_ASK_HISTORY_ITEMS).reverse().flatMap((message) => {
    if (remaining <= 0) return [];
    const content = truncateUtf8(message.content, Math.min(MAX_ASK_HISTORY_CONTENT_BYTES, remaining));
    remaining -= utf8ByteLength(content);
    return content ? [{ ...message, content }] : [];
  }).reverse();
}

function waitForAbortable<T>(operation: () => PromiseLike<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException('The request was canceled.', 'AbortError'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('The request was canceled.', 'AbortError'));
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve().then(operation).then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

// Enable debug logging in development
const DEBUG = import.meta.env.DEV;

/**
 * Base class for AI-related errors with structured information.
 */
export class AIError extends Error {
  readonly statusCode?: number;
  readonly requestId?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options?: { statusCode?: number; requestId?: string; details?: Record<string, unknown> }
  ) {
    super(message);
    this.name = 'AIError';
    this.statusCode = options?.statusCode;
    this.requestId = options?.requestId;
    this.details = options?.details;
  }
}

/**
 * Error for authentication failures (401/403).
 * User should re-authenticate.
 */
export class AIAuthError extends AIError {
  constructor(message: string = 'Authentication required. Please sign in again.', options?: { statusCode?: number; requestId?: string }) {
    super(message, options);
    this.name = 'AIAuthError';
  }
}

/**
 * Error for rate limit exceeded (429).
 */
export class AIRateLimitError extends AIError {
  readonly limit?: number;
  readonly current?: number;
  readonly retryAfter?: number;

  constructor(
    message: string = 'Rate limit exceeded. Please try again later.',
    options?: { statusCode?: number; requestId?: string; limit?: number; current?: number; retryAfter?: number }
  ) {
    super(message, { statusCode: options?.statusCode ?? 429, requestId: options?.requestId });
    this.name = 'AIRateLimitError';
    this.limit = options?.limit;
    this.current = options?.current;
    this.retryAfter = options?.retryAfter;
  }
}

/**
 * Error for subscription limit reached (402) or trial expired.
 */
export class AISubscriptionError extends AIError {
  readonly code?: string;
  readonly limit?: number;
  readonly current?: number;

  constructor(
    message: string = 'Subscription required.',
    options?: { statusCode?: number; requestId?: string; code?: string; limit?: number; current?: number }
  ) {
    super(message, { statusCode: options?.statusCode ?? 402, requestId: options?.requestId });
    this.name = 'AISubscriptionError';
    this.code = options?.code;
    this.limit = options?.limit;
    this.current = options?.current;
  }
}

/**
 * Error for model access restriction (403 upgrade_required).
 */
export class AIModelRestrictionError extends AIError {
  constructor(
    message: string = 'This model requires a Pro subscription.',
    options?: { requestId?: string }
  ) {
    super(message, { statusCode: 403, requestId: options?.requestId });
    this.name = 'AIModelRestrictionError';
  }
}

/**
 * Error for AI provider failures (OpenAI, Google, Anthropic API errors).
 */
export class AIProviderError extends AIError {
  readonly provider?: string;

  constructor(
    message: string,
    options?: { statusCode?: number; requestId?: string; provider?: string; details?: Record<string, unknown> }
  ) {
    super(message, options);
    this.name = 'AIProviderError';
    this.provider = options?.provider;
  }
}

/**
 * Error for invalid/malformed AI responses.
 */
export class AIResponseError extends AIError {
  constructor(message: string = 'Invalid response from AI service.', options?: { requestId?: string; details?: Record<string, unknown> }) {
    super(message, options);
    this.name = 'AIResponseError';
  }
}

/**
 * Custom error for request timeouts.
 */
export class TimeoutError extends AIError {
  constructor(message: string = 'Request timed out. Please try again.') {
    super(message, { statusCode: 408 });
    this.name = 'TimeoutError';
  }
}

/**
 * Type guards for error checking.
 */
export function isAIAuthError(error: unknown): error is AIAuthError {
  return error instanceof AIAuthError || (error instanceof Error && error.name === 'AIAuthError');
}

export function isAIRateLimitError(error: unknown): error is AIRateLimitError {
  return error instanceof AIRateLimitError || (error instanceof Error && error.name === 'AIRateLimitError');
}

export function isAIProviderError(error: unknown): error is AIProviderError {
  return error instanceof AIProviderError || (error instanceof Error && error.name === 'AIProviderError');
}

export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError || (error instanceof Error && error.name === 'TimeoutError');
}

export function isAISubscriptionError(error: unknown): error is AISubscriptionError {
  return error instanceof AISubscriptionError || (error instanceof Error && error.name === 'AISubscriptionError');
}

export function isAIModelRestrictionError(error: unknown): error is AIModelRestrictionError {
  return error instanceof AIModelRestrictionError || (error instanceof Error && error.name === 'AIModelRestrictionError');
}

export interface AIErrorClassification {
  errorName: string;
  statusCode?: number;
  shouldCaptureException: boolean;
}

/** Classifies AI failures into stable, privacy-safe telemetry fields. */
export function classifyAIError(error: unknown, userInitiatedAbort = false): AIErrorClassification {
  const statusCode = error instanceof AIError ? error.statusCode : undefined;
  const errorName = error instanceof Error ? error.name : 'UnknownError';

  if (userInitiatedAbort) return { errorName: 'AbortError', shouldCaptureException: false };
  if (isAIAuthError(error)) return { errorName: 'AIAuthError', statusCode, shouldCaptureException: false };
  if (isAIRateLimitError(error)) return { errorName: 'AIRateLimitError', statusCode, shouldCaptureException: false };
  if (isAISubscriptionError(error)) return { errorName: 'AISubscriptionError', statusCode, shouldCaptureException: false };
  if (isAIModelRestrictionError(error)) return { errorName: 'AIModelRestrictionError', statusCode, shouldCaptureException: false };
  if (isTimeoutError(error)) return { errorName: 'TimeoutError', statusCode, shouldCaptureException: true };
  if (error instanceof AIResponseError || (error instanceof Error && error.name === 'AIResponseError')) {
    return { errorName: 'AIResponseError', statusCode, shouldCaptureException: true };
  }
  if (isAIProviderError(error)) return { errorName: 'AIProviderError', statusCode, shouldCaptureException: true };

  return { errorName, statusCode, shouldCaptureException: true };
}

interface AIFailureReport {
  error: unknown;
  feature: 'generate' | 'attack' | 'brainstorm' | 'factoids' | 'ask' | 'sparring' | 'crossfire';
  provider: string;
  model: string;
  startTime: number;
  requestId: string;
  streaming?: boolean;
  userInitiatedAbort?: boolean;
}

/** Reports an AI failure without forwarding user-controlled error text. */
export function reportAIFailure(report: AIFailureReport): void {
  const classification = classifyAIError(report.error, report.userInitiatedAbort);
  const durationMs = Math.round(performance.now() - report.startTime);
  const properties = {
    feature: report.feature,
    ...(report.streaming === undefined ? {} : { streaming: report.streaming }),
    provider: report.provider,
    model: report.model,
    durationMs,
    errorName: classification.errorName,
    statusCode: classification.statusCode,
  };
  captureProductEvent('ai_request_failed', properties);

  if (classification.shouldCaptureException) {
    const safeError = new Error(classification.errorName);
    safeError.name = classification.errorName;
    captureException(safeError, { ...properties, requestId: report.requestId });
  }
}

async function callSupabaseAI<T = unknown>(
  feature: 'generate' | 'attack' | 'brainstorm' | 'factoids' | 'ask' | 'sparring' | 'crossfire',
  input: unknown,
  config: ProviderConfig,
  options: AIRequestOptions<T> = {},
): Promise<T> {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startTime = performance.now();

  const session = useSessionStore.getState();

  const debateId = options.debateId !== undefined ? options.debateId : activeDebateId();
  // Material never crosses debates, and one-off work uses none of it.
  const debateContext = debateContextForRequest(feature, input, debateId, {
    includeSources: options.includeActiveSources !== false,
    workspace: Boolean(options.workspaceContext),
  });
  // Servers from before Current Debate context read only this field.
  const sourceIds = debateContext?.sourceIds ?? [];

  const provider = 'openrouter';
  captureProductEvent('ai_request_started', {
    feature,
    provider,
    model: config.model,
  });

  const reportFailure = (error: unknown, userInitiatedAbort = false): void => {
    reportAIFailure({
      error,
      feature,
      provider,
      model: config.model,
      startTime,
      requestId,
      userInitiatedAbort,
    });
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abortFromCaller();
  else options.signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    const accessToken = getActiveAccessToken() ?? (
      await waitForAbortable(() => supabase.auth.getSession(), controller.signal)
    ).data.session?.access_token;

    if (DEBUG) {
      console.log(`[AI Request ${requestId}]`, {
        feature,
        provider,
        model: config.model,
        hasAccessToken: !!accessToken,
        activeSources: sourceIds.length,
      });
    }

    if (!accessToken) {
      throw new AIAuthError('Please sign in to use AI features', { requestId });
    }

    const requestBody = {
      feature,
      input,
      provider,
      model: config.model,
      temperature: config.temperature,
      reasoningEffort: config.reasoningEffort ?? 'low',
      sourceIds,
      ...(debateContext ? { debateContext } : {}),
      workspaceContext: options.workspaceContext,
      // Beside `input`, so a server from before voice rounds ignores it.
      ...(options.voice ? { voice: true } : {}),
    };

    if (utf8ByteLength(JSON.stringify(requestBody)) > MAX_CLIENT_REQUEST_BODY_BYTES) {
      throw new AIError('Request is too large. Shorten the input and try again.', { statusCode: 413, requestId });
    }

    const { data, error } = await invokeAuthenticatedFunction<Record<string, unknown>>('ai', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: requestBody,
      signal: controller.signal,
    });

    const elapsed = Math.round(performance.now() - startTime);

    // Log response in development
    if (DEBUG) {
      console.log(`[AI Response ${requestId}] ${elapsed}ms`, {
        hasData: !!data,
        hasOutput: !!data?.output,
        hasError: !!error,
        errorMessage: error?.message,
      });
    }

    // Handle Supabase function invoke errors
    if (error) {
      const errorPayload = await extractSupabaseErrorPayload(error);
      const errorDetails = mapAIError(error, requestId, provider, config.model, errorPayload);
      throw errorDetails;
    }

    // Handle response with error field (from edge function)
    if (data?.error) {
      const errorMessage = data.error as string;
      const errorCode = data.code as string | undefined;

      // Subscription errors (402 / trial expired / limit reached)
      if (errorCode === 'trial_expired' || errorCode === 'limit_reached') {
        throw new AISubscriptionError(errorMessage, {
          statusCode: 402,
          requestId,
          code: errorCode,
          limit: data.limit as number | undefined,
          current: data.current as number | undefined,
        });
      }

      // Model restriction (403 / upgrade_required)
      if (errorCode === 'upgrade_required') {
        throw new AIModelRestrictionError(errorMessage, { requestId });
      }

      // Rate limit error from edge function
      const normalizedErrorMessage = errorMessage.toLowerCase();
      if (data.limit !== undefined || normalizedErrorMessage.includes('rate limit') || normalizedErrorMessage.includes('limit exceeded')) {
        throw new AIRateLimitError(errorMessage, {
          requestId,
          limit: data.limit as number | undefined,
          current: data.current as number | undefined,
        });
      }

      // Provider error (OpenAI, Google, etc.)
      if (isProviderErrorMessage(errorMessage) || isProviderErrorCode(errorCode)) {
        throw new AIProviderError(errorMessage, {
          requestId,
          provider,
          details: { model: config.model, code: errorCode },
        });
      }

      // Generic error from edge function
      throw new AIError(errorMessage, { statusCode: 500, requestId });
    }

    // Validate response has expected output
    if (!data?.output) {
      throw new AIResponseError('AI response missing output field', { requestId, details: { data } });
    }

    const sourceAssessments = parseSourceAssessments(data.sourceAssessments);
    if (sourceAssessments.length > 0) {
      try {
        await session.applySourceAssessments(sourceAssessments);
      } catch {
        toast({
          title: i18n.t('aiClient.sourceSaveFailed'),
          description: i18n.t('aiClient.sourceAssessmentSaveFailed'),
          variant: 'destructive',
        });
      }
    }

    if (data.meta && typeof data.meta === 'object' && (data.meta as { truncated?: unknown }).truncated === true) {
      toast({
        title: i18n.t('aiClient.inputShortened'),
        description: i18n.t('aiClient.inputShortenedDesc'),
      });
    }

    const responseMeta = data.meta && typeof data.meta === 'object' && !Array.isArray(data.meta)
      ? data.meta as Record<string, unknown>
      : undefined;
    const resolvedModel = typeof responseMeta?.resolvedModel === 'string'
      ? responseMeta.resolvedModel
      : config.model;
    const response = options.transformResponse ? options.transformResponse(data) : data as T;
    if (debateContext) {
      // Review choices cover one request (or one round); the next starts from the defaults.
      const contextStore = useDebateContextStore.getState();
      contextStore.recordUsage(feature, parseDebateContextUsage(responseMeta?.debateContext));
      if (!options.keepContextChoices) contextStore.resetOverride(feature);
    }
    captureProductEvent('ai_request_succeeded', {
      feature,
      provider,
      model: resolvedModel,
      ...(resolvedModel !== config.model ? { requestedModel: config.model } : {}),
      durationMs: Math.round(performance.now() - startTime),
    });
    return response;
  } catch (err) {
    // Re-throw our custom errors
    if (err instanceof AIError) {
      refreshDebatesIfMissing(err, debateContext);
      reportFailure(err);
      throw err;
    }

    // Handle timeout
    if (err instanceof TimeoutError) {
      reportFailure(err);
      throw err;
    }

    // Handle abort (our timeout triggered)
    if (options.signal?.aborted) {
      const abortError = options.signal.reason instanceof Error
        ? options.signal.reason
        : new DOMException('The request was canceled.', 'AbortError');
      reportFailure(abortError, true);
      throw abortError;
    }

    if (err instanceof DOMException && err.name === 'AbortError') {
      const timeoutError = new TimeoutError();
      reportFailure(timeoutError);
      throw timeoutError;
    }

    // Wrap unknown errors
    const message = err instanceof Error ? err.message : 'Unknown error occurred';

    // Check if the error message indicates an abort/timeout
    if (message.includes('abort') || message.includes('signal')) {
      const timeoutError = new TimeoutError();
      reportFailure(timeoutError);
      throw timeoutError;
    }

    const wrappedError = new AIError(message, { requestId });
    reportFailure(wrappedError);
    throw wrappedError;
  } finally {
    clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}

/**
 * Parse Supabase FunctionsHttpError into appropriate AIError subclass.
 */
function getSupabaseErrorStatus(error: { context?: unknown }): number | undefined {
  const context = error.context;
  if (context && typeof context === 'object' && 'status' in context) {
    const status = (context as { status?: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return undefined;
}

async function extractSupabaseErrorPayload(error: { context?: unknown }): Promise<Record<string, unknown> | null> {
  const context = error.context;
  if (!context || typeof context !== 'object') return null;

  const responseLike = context as {
    clone?: () => { body?: ReadableStream<Uint8Array> | null; json?: () => Promise<unknown> };
    body?: ReadableStream<Uint8Array> | null;
    json?: () => Promise<unknown>;
  };

  const parser = responseLike.body
    ? responseLike
    : typeof responseLike.clone === 'function'
      ? responseLike.clone()
      : responseLike;

  try {
    if (parser.body) {
      const reader = parser.body.getReader();
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const remaining = MAX_CLIENT_ERROR_BODY_BYTES - totalBytes;
          if (remaining <= 0 || value.byteLength > remaining) {
            await reader.cancel('Error body exceeded its byte limit');
            return null;
          }
          chunks.push(value);
          totalBytes += value.byteLength;
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
      return payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
    }
    // Unit-test doubles may expose only json(). Real fetch Responses have a
    // stream and always take the bounded branch above.
    if (typeof parser.json !== 'function') return null;
    const payload = await parser.json();
    return payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

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
  options: Pick<AIRequestOptions, 'signal' | 'workspaceContext' | 'debateId' | 'voice'> = {},
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

export function mapAIError(
  error: { message: string; context?: unknown },
  requestId: string,
  provider: string,
  model: string,
  payload?: Record<string, unknown> | null
): AIError {
  const payloadMessage = typeof payload?.error === 'string' ? payload.error : undefined;
  const message = payloadMessage || error.message || 'Unknown error';
  const errorCode = typeof payload?.code === 'string' ? payload.code : undefined;

  // Detect abort/signal errors and treat as timeout
  if (message.includes('abort') || message.includes('signal')) {
    return new TimeoutError();
  }

  // Try to extract status code from error context or message
  let statusCode: number | undefined = getSupabaseErrorStatus(error);

  // Parse status from message patterns if status is missing
  if (message.includes('non-2xx') || message.includes('status code')) {
    // Common message: "Edge Function returned a non-2xx status code"
    // Check for hints in message
    if (message.includes('401') || message.includes('Unauthorized')) {
      statusCode = 401;
    } else if (message.includes('402')) {
      statusCode = 402;
    } else if (message.includes('403') || message.includes('Forbidden')) {
      statusCode = 403;
    } else if (message.includes('429') || message.includes('rate limit')) {
      statusCode = 429;
    } else if (message.includes('500') || message.includes('Internal')) {
      statusCode = 500;
    }
  }

  // Return appropriate error type based on status code
  if (statusCode === 401) {
    return new AIAuthError(
      'Authentication failed. Your session may have expired. Please sign in again.',
      { statusCode, requestId }
    );
  }

  if (statusCode === 402) {
    const code = typeof payload?.code === 'string' ? payload.code : undefined;
    return new AISubscriptionError(message, {
      statusCode,
      requestId,
      code,
      limit: typeof payload?.limit === 'number' ? payload.limit : undefined,
      current: typeof payload?.current === 'number' ? payload.current : undefined,
    });
  }

  if (statusCode === 403) {
    const code = typeof payload?.code === 'string' ? payload.code : undefined;
    // Could be auth failure or model restriction
    if (code === 'upgrade_required' || message.includes('model') || message.includes('upgrade')) {
      return new AIModelRestrictionError(message, { requestId });
    }
    return new AIAuthError(
      message || 'Access denied. Your session may have expired. Please sign in again.',
      { statusCode, requestId }
    );
  }

  if (statusCode === 429) {
    return new AIRateLimitError(message, {
      statusCode,
      requestId,
      limit: typeof payload?.limit === 'number' ? payload.limit : undefined,
      current: typeof payload?.current === 'number' ? payload.current : undefined,
    });
  }

  if (isProviderErrorMessage(message) || isProviderErrorCode(errorCode)) {
    return new AIProviderError(message, {
      statusCode: statusCode || 500,
      requestId,
      provider,
      details: { model, code: errorCode },
    });
  }

  // Default: return generic error with helpful message
  return new AIError(
    `AI service error: ${message}. Please try again.`,
    { statusCode: statusCode || 500, requestId }
  );
}

function isProviderErrorMessage(message: string): boolean {
  return /OpenAI|Anthropic|Google|Gemini/i.test(message);
}

function isProviderErrorCode(code?: string): boolean {
  return !!code && /quota|billing|api[_-]?key|provider|insufficient|overloaded|rate/i.test(code);
}

/**
 * Transforms AI brainstorm response to ensure all required fields exist.
 * This handles cases where the AI returns incomplete structures.
 */
function transformBrainstormResponse(response: Record<string, unknown>): BrainstormOutput {
  // Ensure required base fields exist
  const result: BrainstormOutput = {
    needsMoreInfo: Boolean(response.needsMoreInfo),
    clarifyingQuestions: Array.isArray(response.clarifyingQuestions) ? response.clarifyingQuestions : [],
    nextSteps: Array.isArray(response.nextSteps) ? response.nextSteps : [],
    warningsAndTradeoffs: Array.isArray(response.warningsAndTradeoffs) ? response.warningsAndTradeoffs : [],
  };

  // Helper to normalize an Idea object
  const normalizeIdea = (idea: unknown): { id: string; title: string; description: string; side: 'pro' | 'con' | 'neutral'; strength: 'strong' | 'moderate' | 'weak'; tradeoffs: string[]; relatedTo: string[] } | null => {
    if (!idea || typeof idea !== 'object') return null;
    const i = idea as Record<string, unknown>;
    return {
      id: String(i.id || `idea-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
      title: String(i.title || 'Untitled'),
      description: String(i.description || ''),
      side: (['pro', 'con', 'neutral'].includes(String(i.side)) ? i.side : 'neutral') as 'pro' | 'con' | 'neutral',
      strength: (['strong', 'moderate', 'weak'].includes(String(i.strength)) ? i.strength : 'moderate') as 'strong' | 'moderate' | 'weak',
      tradeoffs: Array.isArray(i.tradeoffs) ? i.tradeoffs.map(String) : [],
      relatedTo: Array.isArray(i.relatedTo) ? i.relatedTo.map(String) : [],
    };
  };

  const normalizeTopFiveItems = (items: unknown[]) => items
    .map((item: unknown, index) => {
      if (!item) return null;
      if (typeof item !== 'object') {
        const idea = normalizeIdea({ title: String(item || `Idea ${index + 1}`), description: String(item || '') });
        return idea ? { rank: index + 1, idea, whyTop: '' } : null;
      }
      const entry = item as Record<string, unknown>;
      const idea = normalizeIdea(entry.idea || entry);
      if (!idea) return null;
      return {
        rank: typeof entry.rank === 'number' ? entry.rank : index + 1,
        idea,
        whyTop: String(entry.whyTop || entry.rationale || entry.reason || ''),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  // Transform topFive if present
  if (response.topFive && Array.isArray(response.topFive)) {
    result.topFive = normalizeTopFiveItems(response.topFive);
  }

  // Transform mindmap if present
  if (response.mindmap && Array.isArray(response.mindmap)) {
    result.mindmap = response.mindmap
      .map((category: unknown) => {
        if (!category || typeof category !== 'object') return null;
        const c = category as Record<string, unknown>;
        const items = Array.isArray(c.items)
          ? c.items.map(normalizeIdea).filter((i): i is NonNullable<typeof i> => i !== null)
          : [];
        return {
          category: String(c.category || 'Uncategorized'),
          items,
        };
      })
      .filter((cat): cat is NonNullable<typeof cat> => cat !== null && cat.items.length > 0);
  }

  // Transform buckets if present
  if (response.buckets && Array.isArray(response.buckets)) {
    result.buckets = response.buckets
      .map((bucket: unknown) => {
        if (!bucket || typeof bucket !== 'object') return null;
        const b = bucket as Record<string, unknown>;
        const ideas = Array.isArray(b.ideas)
          ? b.ideas.map(normalizeIdea).filter((i): i is NonNullable<typeof i> => i !== null)
          : [];
        return {
          name: String(b.name || 'Unnamed Bucket'),
          ideas,
          keyInsight: String(b.keyInsight || ''),
        };
      })
      .filter((b): b is NonNullable<typeof b> => b !== null && b.ideas.length > 0);
  }

  if (!result.topFive?.length && !result.mindmap?.length && !result.buckets?.length) {
    const fallbackItems = [response.ideas, response.angles, response.recommendations, response.results]
      .find((value): value is unknown[] => Array.isArray(value));
    if (fallbackItems) {
      result.topFive = normalizeTopFiveItems(fallbackItems).slice(0, 5);
    }
  }

  return cleanGeneratedOutput(result);
}

/**
 * Validates the attack response at the trust boundary. Attack outputs were
 * previously cast without validation; now malformed provider responses fail
 * loudly instead of rendering unverified shapes.
 */
function validateAttackOutput(output: unknown): AttackOutput {
  const parsed = AttackOutputSchema.safeParse(output);
  if (!parsed.success) {
    throw new AIResponseError('AI response did not match the expected attack schema.', {
      details: { issues: parsed.error.issues },
    });
  }
  return parsed.data;
}

/** Validates the transformed generate response before it can be rendered or persisted alongside sources. */
function validateGenerateOutput(output: unknown): GenerateOutput {
  const parsed = GenerateOutputSchema.safeParse(output);
  if (!parsed.success) {
    throw new AIResponseError('AI response did not match the expected generate schema.', {
      details: { issues: parsed.error.issues },
    });
  }
  return parsed.data;
}

type AutosaveFeature = 'generate' | 'attack' | 'brainstorm' | 'factoids';

async function autosaveDiscoveredSources(sources: DiscoveredSource[], capturedVia: AutosaveFeature, debateId: string | null | undefined): Promise<void> {
  const targetDebateId = debateId !== undefined ? debateId : activeDebateId();
  // Every source belongs to one debate, so one-off research is not kept.
  if (!targetDebateId) return;
  const retainedSources = retainedDiscoveredSources(sources);
  if (retainedSources.length === 0) return;

  const session = useSessionStore.getState();
  for (const source of retainedSources) {
    try {
      await session.addSource({ ...autoSavedSourceRow(source, capturedVia), debateId: targetDebateId });
    } catch {
      toast({
        title: i18n.t('aiClient.sourceSaveFailed'),
        description: i18n.t('aiClient.sourceSaveFailedDesc', { title: source.title }),
        variant: 'destructive',
      });
    }
  }
  console.log(`[AI Client] Saved ${retainedSources.length} sources to library`);
}

export async function generateCase(input: GenerateInput, config: ProviderConfig, workspaceContext?: WorkspaceToolContext, debateId?: string | null): Promise<ResultWithSources<GenerateOutput>> {
  const inputWithLanguage = withOutputLanguage(input as unknown as Record<string, unknown>);
  const response = await callSupabaseAI<ResultWithSources<GenerateOutput>>('generate', inputWithLanguage, config, {
    workspaceContext,
    debateId,
    transformResponse: (rawData) => {
      const data = rawData as { output: unknown; discoveredSources?: unknown };
      const result = validateGenerateOutput(transformGenerateResponse(data.output as Record<string, unknown>));
      const expectedCount = expectedContentionCount(input.length);
      if (result.contentions.length !== expectedCount) {
        throw new AIResponseError('AI response did not contain the expected number of contentions.', {
          details: { expectedCount, actualCount: result.contentions.length },
        });
      }
      return { result, discoveredSources: parseDiscoveredSources(data.discoveredSources) };
    },
  });
  await autosaveDiscoveredSources(response.discoveredSources, 'generate', workspaceContext ? null : debateId);
  return response;
}

export async function attackCase(input: AttackInput, config: ProviderConfig, workspaceContext?: WorkspaceToolContext, debateId?: string | null): Promise<ResultWithSources<AttackOutput>> {
  const response = await callSupabaseAI<ResultWithSources<AttackOutput>>('attack', withOutputLanguage(input as unknown as Record<string, unknown>), config, {
    workspaceContext,
    debateId,
    transformResponse: (rawData) => {
      const data = rawData as { output: unknown; discoveredSources?: unknown };
      return {
        result: validateAttackOutput(data.output),
        discoveredSources: parseDiscoveredSources(data.discoveredSources),
      };
    },
  });
  await autosaveDiscoveredSources(response.discoveredSources, 'attack', workspaceContext ? null : debateId);
  return response;
}

export async function brainstorm(input: BrainstormInput, config: ProviderConfig, workspaceContext?: WorkspaceToolContext, debateId?: string | null): Promise<ResultWithSources<BrainstormOutput>> {
  const response = await callSupabaseAI<ResultWithSources<BrainstormOutput>>('brainstorm', withOutputLanguage(input as unknown as Record<string, unknown>), config, {
    workspaceContext,
    debateId,
    transformResponse: (rawData) => {
      const data = rawData as { output: unknown; discoveredSources?: unknown };
      return {
        result: transformBrainstormResponse(data.output as Record<string, unknown>),
        discoveredSources: parseDiscoveredSources(data.discoveredSources),
      };
    },
  });
  await autosaveDiscoveredSources(response.discoveredSources, 'brainstorm', workspaceContext ? null : debateId);
  return response;
}

export async function factoids(input: FactoidsInput, config: ProviderConfig, workspaceContext?: WorkspaceToolContext, debateId?: string | null): Promise<ResultWithSources<FactoidsOutput>> {
  const inputWithLanguage = withOutputLanguage({
    ...input,
    region: input.region?.trim() || 'Global',
    sourceCount: input.sourceCount || 5,
  });
  const response = await callSupabaseAI<ResultWithSources<FactoidsOutput>>('factoids', inputWithLanguage, config, {
    workspaceContext,
    debateId,
    transformResponse: (rawData) => {
      const data = rawData as { output: unknown; discoveredSources?: unknown };
      const parsed = FactoidsOutputSchema.safeParse(data.output);
      if (!parsed.success) {
        throw new AIResponseError('AI response did not match the expected factoids schema.', {
          details: { issues: parsed.error.issues },
        });
      }

      const allFactoids = parsed.data.factoids;
      const verifiedFactoids = allFactoids.filter((factoid) => factoid.citation.verified === 'verified');
      const returnedFactoids = verifiedFactoids.slice(0, input.sourceCount || 5);
      return {
        result: {
          ...parsed.data,
          factoids: returnedFactoids,
          filteredOutCount: Math.max(0, allFactoids.length - returnedFactoids.length),
        },
        discoveredSources: parseDiscoveredSources(data.discoveredSources),
      };
    },
  });
  await autosaveDiscoveredSources(response.discoveredSources, 'factoids', workspaceContext ? null : debateId);
  return response;
}

export interface AskChatOptions {
  citationMode?: boolean;
  webSearch?: boolean;
  prosConsMode?: boolean;
  argumentMapMode?: boolean;
  workspaceContext?: WorkspaceToolContext;
  /** Debate whose sources ground the answer; defaults to the active debate. */
  debateId?: string | null;
}

export async function askChat(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  mode: string,
  config: ProviderConfig,
  options: AskChatOptions = {}
): Promise<AskOutput> {
  return await callSupabaseAI<AskOutput>('ask', withOutputLanguage({
    message: boundAskMessage(message),
    history: boundAskHistory(history),
    mode,
    citationMode: Boolean(options.citationMode),
    webSearch: Boolean(options.webSearch),
    prosConsMode: Boolean(options.prosConsMode),
    argumentMapMode: Boolean(options.argumentMapMode),
  }), config, {
    workspaceContext: options.workspaceContext,
    debateId: options.debateId,
    transformResponse: (rawData) => {
      const data = rawData as { output: unknown };
      const parsed = AskOutputSchema.safeParse(data.output);
      if (!parsed.success) {
        throw new AIResponseError('AI response did not match the expected ask schema.', {
          details: { issues: parsed.error.issues },
        });
      }
      return parsed.data;
    },
  });
}

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
  return JSON.stringify([authScope, workspaceContext?.workspaceId ?? null, debateId, input, config.provider, config.model, config.temperature, config.reasoningEffort, voice]);
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

  const request = generateSparringTurnOnce(inputResult.data, config, workspaceContext, debateId, voice);
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

  const request = judgeSparringSessionOnce(inputResult.data, config, workspaceContext, debateId);
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
    transformResponse: (rawData) => validateSparringScoreResponse((rawData as { output: unknown }).output),
  });
}
