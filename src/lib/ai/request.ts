import type { ProviderConfig } from './providers/types';
import { useSettingsStore } from '../stores/settings-store';
import { useSessionStore } from '../stores/session-store';
import { activeDebateId, useDebateStore } from '../stores/debate-store';
import { parseDebateContextUsage, useDebateContextStore } from '../stores/debate-context-store';
import { currentDebateContextPlan } from '../debate/context-state';
import { requestSide, type DebateContextRequest } from '../../../supabase/functions/_shared/debate-context';
import { getActiveAccessToken, invokeAuthenticatedFunction, invokeAuthenticatedFunctionWith, supabase } from '@/lib/supabase/client';
import { toast } from '@/hooks/use-toast';
import { captureException, captureProductEvent } from '@/lib/observability';
import { isAppLanguage, type AppLanguage } from '@/lib/languages';
import i18n from '@/i18n';
import { localizedLimitMessage } from './limit-message';
import type { WorkspaceToolContext } from '@/lib/workspace/tool-context';
import {
  AIError,
  AIAuthError,
  AIRateLimitError,
  AISubscriptionError,
  AIModelRestrictionError,
  AIProviderError,
  AIResponseError,
  TimeoutError,
  classifyAIError,
  mapAIError,
  isProviderErrorMessage,
  isProviderErrorCode,
} from './errors';
import { parseSourceAssessments } from './sources';
import { utf8ByteLength } from './text';
import { readLiveResponse, type LiveGeneration } from './live';

// Request timeout in milliseconds (200 seconds)
export const REQUEST_TIMEOUT_MS = 200 * 1000;
const MAX_CLIENT_ERROR_BODY_BYTES = 16_000;
const MAX_CLIENT_REQUEST_BODY_BYTES = 190_000;

export interface AIRequestOptions<T = unknown> {
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
  /** Show the answer while the model writes it. */
  live?: LiveGeneration;
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

export function selectedOutputLanguage(): AppLanguage {
  const language = useSettingsStore.getState().outputLanguage;
  return isAppLanguage(language) ? language : 'en';
}

export function withOutputLanguage(input: Record<string, unknown>): Record<string, unknown> {
  return { ...input, language: selectedOutputLanguage() };
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

export async function callSupabaseAI<T = unknown>(
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

    const live = options.live;
    const { data, error } = live
      ? await invokeAuthenticatedFunctionWith<Record<string, unknown>>('ai', {
        headers: { Authorization: `Bearer ${accessToken}` },
        body: { ...requestBody, stream: true },
        signal: controller.signal,
      }, (response) => readLiveResponse<Record<string, unknown>>(response, live, controller.signal))
      : await invokeAuthenticatedFunction<Record<string, unknown>>('ai', {
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
      if (errorCode === 'trial_expired' || errorCode === 'limit_reached' || errorCode === 'weekly_budget_reached') {
        const details = {
          code: errorCode,
          limit: typeof data.limit === 'number' ? data.limit : undefined,
          current: typeof data.current === 'number' ? data.current : undefined,
          units: typeof data.units === 'number' ? data.units : undefined,
        };
        throw new AISubscriptionError(localizedLimitMessage(errorMessage, details), { statusCode: 402, requestId, ...details });
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
