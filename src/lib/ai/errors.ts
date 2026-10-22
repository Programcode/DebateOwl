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
  /** Quota units the refused request needed; above 1 for expensive models. */
  readonly units?: number;

  constructor(
    message: string = 'Subscription required.',
    options?: { statusCode?: number; requestId?: string; code?: string; limit?: number; current?: number; units?: number }
  ) {
    super(message, { statusCode: options?.statusCode ?? 402, requestId: options?.requestId });
    this.name = 'AISubscriptionError';
    this.code = options?.code;
    this.limit = options?.limit;
    this.current = options?.current;
    this.units = options?.units;
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
      units: typeof payload?.units === 'number' ? payload.units : undefined,
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

export function isProviderErrorMessage(message: string): boolean {
  return /OpenAI|Anthropic|Google|Gemini/i.test(message);
}

export function isProviderErrorCode(code?: string): boolean {
  return !!code && /quota|billing|api[_-]?key|provider|insufficient|overloaded|rate/i.test(code);
}
