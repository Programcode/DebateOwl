import {
  mockGenerateCase,
  mockAttackCase,
  mockBrainstorm,
  mockFactoids,
  mockAsk,
  mockGenerateSparringTurn,
  mockJudgeSparringSession,
} from './providers/mock-provider';
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
import type { SourceProvenance } from '../stores/session-store';
import { supabase } from '@/lib/supabase/client';
import { toast } from '@/hooks/use-toast';

// Request timeout in milliseconds (200 seconds)
export const REQUEST_TIMEOUT_MS = 200 * 1000;

/** A web source discovered during research, with auditable ranking metadata from the edge function. */
export interface DiscoveredSource extends Omit<SourceProvenance, 'url'> {
  title: string;
  url: string;
  content?: string;
}

/** Feature result plus the researched sources that informed it. */
export interface ResultWithSources<T> {
  result: T;
  discoveredSources: DiscoveredSource[];
}

/**
 * Parses the discovered-sources payload at the trust boundary: only
 * well-formed entries with a title and URL survive; anything else is dropped.
 */
function parseDiscoveredSources(value: unknown): DiscoveredSource[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item): DiscoveredSource[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];

    const candidate: Record<string, unknown> = {};
    for (const [key, fieldValue] of Object.entries(item)) candidate[key] = fieldValue;

    const title = typeof candidate.title === 'string' ? candidate.title.trim() : '';
    const url = typeof candidate.url === 'string' ? candidate.url.trim() : '';
    if (!title || !url) return [];

    const source: DiscoveredSource = { title, url };
    if (typeof candidate.content === 'string') source.content = candidate.content;

    if (typeof candidate.sourceType === 'string' && candidate.sourceType.trim()) {
      source.sourceType = candidate.sourceType.trim();
    }

    if (typeof candidate.qualityScore === 'number' && Number.isFinite(candidate.qualityScore) &&
      candidate.qualityScore >= 0 && candidate.qualityScore <= 100) {
      source.qualityScore = candidate.qualityScore;
    }

    if (candidate.qualityLabel === 'strong' || candidate.qualityLabel === 'moderate' || candidate.qualityLabel === 'weak') {
      source.qualityLabel = candidate.qualityLabel;
    }

    if (typeof candidate.query === 'string' && candidate.query.trim()) {
      source.query = candidate.query.trim();
    }

    return [source];
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

async function callSupabaseAI(
  feature: 'generate' | 'attack' | 'brainstorm' | 'factoids' | 'ask' | 'sparring',
  input: unknown,
  config: ProviderConfig
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startTime = performance.now();

  const settings = useSettingsStore.getState();
  const session = useSessionStore.getState();

  const activeSources = feature === 'sparring'
    ? []
    : session.sourceLibrary
      .filter((s) => s.isActive)
      .map((s) => ({ title: s.title, content: s.content, origin: s.origin, type: s.type }));

  const provider = config.provider === 'lovable' ? 'openai' : config.provider;
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  // Log request details in development
  if (DEBUG) {
    console.log(`[AI Request ${requestId}]`, {
      feature,
      provider,
      model: config.model,
      hasAccessToken: !!accessToken,
      activeSources: activeSources.length,
    });
  }

  // Require authentication for AI features
  if (!accessToken) {
    throw new AIAuthError('Please sign in to use AI features', { requestId });
  }

  const requestBody = {
    feature,
    input,
    provider,
    model: config.model,
    temperature: config.temperature,
    customSystemPrompt: settings.customSystemPrompt || null,
    sources: activeSources,
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const { data, error } = await supabase.functions.invoke('ai', {
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

    if (data.meta && typeof data.meta === 'object' && (data.meta as { truncated?: unknown }).truncated === true) {
      toast({
        title: 'Input was shortened',
        description: 'The request was too large, so only the portion that fit was sent to the AI.',
      });
    }

    return data;
  } catch (err) {
    // Re-throw our custom errors
    if (err instanceof AIError) {
      throw err;
    }

    // Handle timeout
    if (err instanceof TimeoutError) {
      throw err;
    }

    // Handle abort (our timeout triggered)
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new TimeoutError();
    }

    // Wrap unknown errors
    const message = err instanceof Error ? err.message : 'Unknown error occurred';

    // Check if the error message indicates an abort/timeout
    if (message.includes('abort') || message.includes('signal')) {
      throw new TimeoutError();
    }

    throw new AIError(message, { requestId });
  } finally {
    clearTimeout(timeoutId);
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
    clone?: () => { json?: () => Promise<unknown> };
    json?: () => Promise<unknown>;
  };

  const parser = typeof responseLike.clone === 'function'
    ? responseLike.clone()
    : responseLike;

  if (typeof parser.json !== 'function') return null;

  try {
    const payload = await parser.json();
    return payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
  } catch {
    return null;
  }
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

function cleanGeneratedString(value: string) {
  return value
    .replace(/[—–]/g, ', ')
    .replace(/\b(Magnitude|Probability|Timeframe):\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function cleanGeneratedOutput<T>(value: T): T {
  if (typeof value === 'string') return cleanGeneratedString(value) as T;
  if (Array.isArray(value)) return value.map(cleanGeneratedOutput) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, cleanGeneratedOutput(child)])
    ) as T;
  }
  return value;
}

/**
 * Transforms AI generate response from various formats to the expected GenerateOutput schema.
 * This handles cases where the AI returns a different structure than requested.
 */
function transformGenerateResponse(response: Record<string, unknown>): GenerateOutput {
  // If already in correct format, return as-is (with exordio preserved)
  if (response.caseStructure && response.contentions && response.predictedOpponentCase && response.counters && response.metadata) {
    // Ensure exordio is properly structured if present
    const result = response as unknown as GenerateOutput;
    if (response.exordio && typeof response.exordio === 'object') {
      const ex = response.exordio as Record<string, unknown>;
      result.exordio = {
        hook: String(ex.hook || ''),
        transition: String(ex.transition || ''),
      };
    }
    return cleanGeneratedOutput(result);
  }

  // Transform from wrong format to correct format
  const wrongFormatContentions = response.contentions as Array<{
    title?: string;
    claim?: string;
    points?: string[];
    evidence?: string[] | string;
    analysis?: string;
    reasoning?: string;
    impact?: string;
  }> || [];

  const transformedContentions = wrongFormatContentions.map((c, i) => ({
    id: String(i + 1),
    claim: c.claim || c.title || 'Argument',
    reasoning: c.reasoning || c.analysis || (Array.isArray(c.points) ? c.points.join(' ') : ''),
    evidence: Array.isArray(c.evidence) ? c.evidence.join(' ') : (c.evidence || ''),
    needsSource: false,
    sourceQuery: '',
    impact: c.impact || c.analysis || '',
  }));

  // Transform rebuttals to counters
  const rebuttals = (response.rebuttals as Array<{ attack?: string; response?: string }>) || [];
  const counters = rebuttals.map(r => ({
    targetArgument: r.attack || '',
    counterpoint: r.response || '',
    rebuttal: r.response || '',
  }));

  // Transform potentialWeaknesses to predictedOpponentCase
  const weaknesses = (response.potentialWeaknesses as string[]) || [];

  const result: GenerateOutput = {
    caseStructure: {
      thesis: (response.thesis as string) || (response.title as string) || '',
      framework: 'General framework',
      keyDefinitions: [],
      burdenOfProof: 'We must prove that ' + ((response.thesis as string) || '').slice(0, 50),
    },
    contentions: transformedContentions.length > 0 ? transformedContentions : [{
      id: '1',
      claim: 'Main argument',
      reasoning: 'Reasoning here',
      evidence: 'Evidence here',
      needsSource: false,
      sourceQuery: '',
      impact: 'Impact here',
    }],
    predictedOpponentCase: {
      likelyArguments: weaknesses.slice(0, 3),
      strategicWeaknesses: weaknesses,
      keyClashes: ['Main clash point'],
    },
    counters: counters.length > 0 ? counters : [{
      targetArgument: 'Opponent argument',
      counterpoint: 'Our counter',
      rebuttal: 'Rebuttal text',
    }],
    metadata: {
      side: (response.side as 'pro' | 'con') || 'pro',
      format: 'custom',
      generatedAt: new Date().toISOString(),
    },
  };

  // Preserve exordio if present in the original response
  if (response.exordio && typeof response.exordio === 'object') {
    const ex = response.exordio as Record<string, unknown>;
    result.exordio = {
      hook: String(ex.hook || ''),
      transition: String(ex.transition || ''),
    };
  }

  return cleanGeneratedOutput(result);
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

type AutosaveFeature = 'generate' | 'attack' | 'brainstorm';

async function autosaveDiscoveredSources(sources: DiscoveredSource[], capturedVia: AutosaveFeature): Promise<void> {
  if (sources.length === 0) return;

  const session = useSessionStore.getState();
  for (const source of sources) {
    try {
      await session.addSource({
        title: source.title,
        content: source.content ?? '',
        type: 'url',
        origin: source.url,
        folder: 'Auto-saved',
        isActive: source.qualityLabel === 'strong' || source.qualityLabel === 'moderate',
        metadata: {
          url: source.url,
          ...(source.sourceType !== undefined ? { sourceType: source.sourceType } : {}),
          ...(source.qualityScore !== undefined ? { qualityScore: source.qualityScore } : {}),
          ...(source.qualityLabel !== undefined ? { qualityLabel: source.qualityLabel } : {}),
          ...(source.query !== undefined ? { query: source.query } : {}),
          capturedVia,
        },
      });
    } catch {
      toast({
        title: 'Source save failed',
        description: `Could not save "${source.title}" to your library.`,
        variant: 'destructive',
      });
    }
  }
  console.log(`[AI Client] Saved ${sources.length} sources to library`);
}

function expectedContentionCount(length: GenerateInput['length']): number {
  switch (length) {
    case 'standard':
      return 3;
    case 'comprehensive':
      return 4;
    case 'brief':
    default:
      return 2;
  }
}

export async function generateCase(input: GenerateInput, config: ProviderConfig): Promise<ResultWithSources<GenerateOutput>> {
  if (config.provider === 'mock') {
    return { result: await mockGenerateCase(input.motion, input.side, input.length), discoveredSources: [] };
  }
  // Inject global language into input for the edge function
  const language = useSettingsStore.getState().outputLanguage;
  const inputWithLanguage = { ...input, language } as Record<string, unknown>;
  const data = await callSupabaseAI('generate', inputWithLanguage, config) as { output: unknown; discoveredSources?: unknown };
  const result = validateGenerateOutput(transformGenerateResponse(data.output as Record<string, unknown>));
  const expectedCount = expectedContentionCount(input.length);
  if (result.contentions.length !== expectedCount) {
    throw new AIResponseError('AI response did not contain the expected number of contentions.', {
      details: { expectedCount, actualCount: result.contentions.length },
    });
  }

  const discovered = parseDiscoveredSources(data.discoveredSources);
  await autosaveDiscoveredSources(discovered, 'generate');

  return {
    result,
    discoveredSources: discovered,
  };
}

export async function attackCase(input: AttackInput, config: ProviderConfig): Promise<ResultWithSources<AttackOutput>> {
  if (config.provider === 'mock') return { result: await mockAttackCase(input.caseText), discoveredSources: [] };
  const data = await callSupabaseAI('attack', input as Record<string, unknown>, config) as { output: unknown; discoveredSources?: unknown };
  const result = validateAttackOutput(data.output);
  const discovered = parseDiscoveredSources(data.discoveredSources);
  await autosaveDiscoveredSources(discovered, 'attack');

  return {
    result,
    discoveredSources: discovered,
  };
}

export async function brainstorm(input: BrainstormInput, config: ProviderConfig): Promise<ResultWithSources<BrainstormOutput>> {
  if (config.provider === 'mock') return { result: await mockBrainstorm(input.motion, input.outputMode), discoveredSources: [] };
  const data = await callSupabaseAI('brainstorm', input as Record<string, unknown>, config) as { output: unknown; discoveredSources?: unknown };
  const discovered = parseDiscoveredSources(data.discoveredSources);
  await autosaveDiscoveredSources(discovered, 'brainstorm');

  return {
    result: transformBrainstormResponse(data.output as Record<string, unknown>),
    discoveredSources: discovered,
  };
}

export async function factoids(input: FactoidsInput, config: ProviderConfig): Promise<FactoidsOutput> {
  if (config.provider === 'mock') return mockFactoids(input.claim);
  // Inject global language into input for the edge function
  const language = useSettingsStore.getState().outputLanguage;
  const inputWithLanguage = {
    ...input,
    region: input.region?.trim() || 'Global',
    sourceCount: input.sourceCount || 5,
    language,
  } as Record<string, unknown>;
  const data = await callSupabaseAI('factoids', inputWithLanguage, config) as { output: unknown };
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
    ...parsed.data,
    factoids: returnedFactoids,
    filteredOutCount: Math.max(0, allFactoids.length - returnedFactoids.length),
  };
}

export interface AskChatOptions {
  citationMode?: boolean;
  webSearch?: boolean;
  prosConsMode?: boolean;
  argumentMapMode?: boolean;
}

export async function askChat(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  mode: string,
  config: ProviderConfig,
  options: AskChatOptions = {}
): Promise<AskOutput> {
  const output = config.provider === 'mock'
    ? await mockAsk(message, mode)
    : (await callSupabaseAI('ask', {
      message,
      history,
      mode,
      citationMode: Boolean(options.citationMode),
      webSearch: Boolean(options.webSearch),
      prosConsMode: Boolean(options.prosConsMode),
      argumentMapMode: Boolean(options.argumentMapMode),
    }, config) as { output: unknown }).output;
  const parsed = AskOutputSchema.safeParse(output);
  if (!parsed.success) {
    throw new AIResponseError('AI response did not match the expected ask schema.', {
      details: { issues: parsed.error.issues },
    });
  }
  return parsed.data;
}

function sparringLanguage(language: string): string {
  return language.trim() || useSettingsStore.getState().outputLanguage;
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
const pendingSparringTurns = new Map<string, Promise<SparringTurnResponse>>();
const pendingSparringScores = new Map<string, Promise<SparringScoreResponse>>();

async function sparringRequestKey(
  input: SparringRespondInput | SparringScoreInput,
  config: ProviderConfig,
): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const authScope = data.session?.user?.id ?? data.session?.access_token ?? 'signed-out';
  return JSON.stringify([authScope, input, config.provider, config.model, config.temperature]);
}

/** Generate the opponent's next speech for a validated sparring turn. */
export async function generateSparringTurn(
  input: SparringRespondInput,
  config: ProviderConfig,
): Promise<SparringTurnResponse> {
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
  const requestKey = await sparringRequestKey(inputResult.data, config);
  const pending = pendingSparringTurns.get(requestKey);
  if (pending) return pending;

  const request = generateSparringTurnOnce(inputResult.data, config);
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
): Promise<SparringTurnResponse> {
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

  if (config.provider === 'mock') {
    return validateSparringTurnResponse(await mockGenerateSparringTurn(inputResult.data));
  }

  const data = await callSupabaseAI('sparring', inputResult.data, config) as { output: unknown };
  return validateSparringTurnResponse(data.output);
}

/** Judge a completed sparring session and return its validated scorecard. */
export async function judgeSparringSession(
  input: SparringScoreInput,
  config: ProviderConfig,
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
  const requestKey = await sparringRequestKey(inputResult.data, config);
  const pending = pendingSparringScores.get(requestKey);
  if (pending) return pending;

  const request = judgeSparringSessionOnce(inputResult.data, config);
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

  if (config.provider === 'mock') {
    return validateSparringScoreResponse(await mockJudgeSparringSession(inputResult.data));
  }

  const data = await callSupabaseAI('sparring', inputResult.data, config) as { output: unknown };
  return validateSparringScoreResponse(data.output);
}
