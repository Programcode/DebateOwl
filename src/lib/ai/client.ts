import { mockGenerateCase, mockAttackCase, mockBrainstorm, mockFactoids, mockAsk } from './providers/mock-provider';
import type { ProviderConfig } from './providers/types';
import type { GenerateInput, GenerateOutput } from './schemas/generate';
import type { AttackOutput, AttackInput } from './schemas/attack';
import type { BrainstormOutput, BrainstormInput } from './schemas/brainstorm';
import type { FactoidsOutput, FactoidsInput } from './schemas/factoids';
import type { AskOutput } from './schemas/ask';
import { useSettingsStore } from '../stores/settings-store';
import { useSessionStore } from '../stores/session-store';
import { supabase } from '@/lib/supabase/client';

// Request timeout in milliseconds (200 seconds)
const REQUEST_TIMEOUT_MS = 200 * 1000;

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

/**
 * Wraps a promise with a timeout. Rejects with TimeoutError if the promise
 * doesn't resolve within the specified time.
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError());
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

async function callSupabaseAI(
  feature: 'generate' | 'attack' | 'brainstorm' | 'factoids' | 'ask',
  input: Record<string, unknown>,
  config: ProviderConfig
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startTime = performance.now();

  const settings = useSettingsStore.getState();
  const session = useSessionStore.getState();

  const activeSources = session.sourceLibrary
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

  try {
    // Wrap the API call with timeout
    const invokePromise = supabase.functions.invoke('ai', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body: requestBody,
    });

    const { data, error } = await withTimeout(invokePromise, REQUEST_TIMEOUT_MS);
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
      const errorDetails = parseSupabaseError(error, requestId);
      throw errorDetails;
    }

    // Handle response with error field (from edge function)
    if (data?.error) {
      const errorMessage = data.error as string;

      // Rate limit error from edge function
      if (data.limit !== undefined || errorMessage.includes('rate limit') || errorMessage.includes('limit exceeded')) {
        throw new AIRateLimitError(errorMessage, {
          requestId,
          limit: data.limit as number | undefined,
          current: data.current as number | undefined,
        });
      }

      // Provider error (OpenAI, Google, etc.)
      if (errorMessage.includes('OpenAI') || errorMessage.includes('Google') || errorMessage.includes('Anthropic')) {
        throw new AIProviderError(errorMessage, { requestId, provider, details: { model: config.model } });
      }

      // Generic error from edge function
      throw new AIError(errorMessage, { statusCode: 500, requestId });
    }

    // Validate response has expected output
    if (!data?.output) {
      throw new AIResponseError('AI response missing output field', { requestId, details: { data } });
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

    // Wrap unknown errors
    const message = err instanceof Error ? err.message : 'Unknown error occurred';
    throw new AIError(message, { requestId });
  }
}

/**
 * Parse Supabase FunctionsHttpError into appropriate AIError subclass.
 */
function parseSupabaseError(error: { message: string; context?: { status?: number } }, requestId: string): AIError {
  const message = error.message || 'Unknown error';
  // Try to extract status code from error context or message
  let statusCode: number | undefined;

  // Check for status in error context (Supabase v2)
  if (error.context?.status) {
    statusCode = error.context.status;
  }

  // Parse status from message patterns
  if (message.includes('non-2xx') || message.includes('status code')) {
    // Common message: "Edge Function returned a non-2xx status code"
    // Check for hints in message
    if (message.includes('401') || message.includes('Unauthorized')) {
      statusCode = 401;
    } else if (message.includes('403') || message.includes('Forbidden')) {
      statusCode = 403;
    } else if (message.includes('429') || message.includes('rate limit')) {
      statusCode = 429;
    } else if (message.includes('500') || message.includes('Internal')) {
      statusCode = 500;
    }
  }

  // Return appropriate error type based on status code
  if (statusCode === 401 || statusCode === 403) {
    return new AIAuthError(
      'Authentication failed. Your session may have expired. Please sign in again.',
      { statusCode, requestId }
    );
  }

  if (statusCode === 429) {
    return new AIRateLimitError('Too many requests. Please wait and try again.', { statusCode, requestId });
  }

  // Default: return generic error with helpful message
  return new AIError(
    `AI service error: ${message}. Please try again.`,
    { statusCode: statusCode || 500, requestId }
  );
}

/**
 * Transforms AI generate response from various formats to the expected GenerateOutput schema.
 * This handles cases where the AI returns a different structure than requested.
 */
function transformGenerateResponse(response: Record<string, unknown>): GenerateOutput {
  // If already in correct format, return as-is
  if (response.caseStructure && response.contentions && response.predictedOpponentCase && response.counters && response.metadata) {
    return response as unknown as GenerateOutput;
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

  return {
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

  // Transform topFive if present
  if (response.topFive && Array.isArray(response.topFive)) {
    result.topFive = response.topFive
      .map((item: unknown) => {
        if (!item || typeof item !== 'object') return null;
        const t = item as Record<string, unknown>;
        const idea = normalizeIdea(t.idea);
        if (!idea) return null;
        return {
          rank: typeof t.rank === 'number' ? t.rank : 0,
          idea,
          whyTop: String(t.whyTop || ''),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
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

  return result;
}

export async function generateCase(input: GenerateInput, config: ProviderConfig): Promise<GenerateOutput> {
  if (config.provider === 'mock') return mockGenerateCase(input.motion, input.side);
  const data = await callSupabaseAI('generate', input as Record<string, unknown>, config) as { output: unknown; discoveredSources?: { title: string; url: string; content: string }[] };

  // Auto-save discovered sources to library
  if (data.discoveredSources && data.discoveredSources.length > 0) {
    const session = useSessionStore.getState();
    for (const source of data.discoveredSources) {
      await session.addSource({
        title: source.title,
        content: source.content,
        type: 'url',
        origin: source.url,
      });
    }
    console.log(`[AI Client] Saved ${data.discoveredSources.length} sources to library`);
  }

  return transformGenerateResponse(data.output as Record<string, unknown>);
}

export async function attackCase(input: AttackInput, config: ProviderConfig): Promise<AttackOutput> {
  if (config.provider === 'mock') return mockAttackCase(input.caseText);
  const data = await callSupabaseAI('attack', input as Record<string, unknown>, config) as { output: unknown };
  return data.output as AttackOutput;
}

export async function brainstorm(input: BrainstormInput, config: ProviderConfig): Promise<BrainstormOutput> {
  if (config.provider === 'mock') return mockBrainstorm(input.motion, input.outputMode);
  const data = await callSupabaseAI('brainstorm', input as Record<string, unknown>, config) as { output: unknown; discoveredSources?: { title: string; url: string; content: string }[] };

  // Auto-save discovered sources to library
  if (data.discoveredSources && data.discoveredSources.length > 0) {
    const session = useSessionStore.getState();
    for (const source of data.discoveredSources) {
      await session.addSource({
        title: source.title,
        content: source.content,
        type: 'url',
        origin: source.url,
      });
    }
    console.log(`[AI Client] Saved ${data.discoveredSources.length} sources to library`);
  }

  return transformBrainstormResponse(data.output as Record<string, unknown>);
}

export async function factoids(input: FactoidsInput, config: ProviderConfig): Promise<FactoidsOutput> {
  if (config.provider === 'mock') return mockFactoids(input.claim);
  const data = await callSupabaseAI('factoids', input as Record<string, unknown>, config) as { output: unknown };
  return data.output as FactoidsOutput;
}

export async function askChat(
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[],
  mode: string,
  config: ProviderConfig
): Promise<AskOutput> {
  if (config.provider === 'mock') return mockAsk(message, mode);
  const data = await callSupabaseAI('ask', { message, history, mode }, config) as { output: unknown };
  return data.output as AskOutput;
}
