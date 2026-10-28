import {
  AIError,
  AIResponseError,
  AIServerError,
  AIUnknownError,
  browserIsOffline,
  isAIAuthError,
  isAIModelRestrictionError,
  isAINetworkError,
  isAIProviderError,
  isAIRateLimitError,
  isAISubscriptionError,
  isBrowserNetworkFailure,
  isTimeoutError,
} from './errors';

/** Why an AI request failed, as one value from a closed set that is safe to send to telemetry. */
export type AIFailureCode =
  | 'limit_reached'
  | 'model_restricted'
  | 'auth_expired'
  | 'timeout'
  | 'network'
  | 'aborted'
  | 'provider_error'
  | 'invalid_response'
  | 'server_error'
  | 'unknown';

/** Where the request was when it failed: sending it, reading a streamed answer, or checking the answer. */
export type AIFailureStage = 'request' | 'stream' | 'parse';

/** What the student can do next. */
export type AIFailureRecovery = 'plan' | 'upgrade' | 'sign_in' | 'retry' | 'none';

// A DOMException is not an Error in every runtime, so check the name.
function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError';
}

function isResponseError(error: unknown): boolean {
  return error instanceof AIResponseError || (error instanceof Error && error.name === 'AIResponseError');
}

export function aiFailureCode(error: unknown, userInitiatedAbort = false): AIFailureCode {
  if (userInitiatedAbort || isAbort(error)) return 'aborted';
  // A 429 is the account's request rate, which is a limit the student hit too.
  if (isAISubscriptionError(error) || isAIRateLimitError(error)) return 'limit_reached';
  if (isAIModelRestrictionError(error)) return 'model_restricted';
  if (isAIAuthError(error)) return 'auth_expired';
  if (isTimeoutError(error)) return 'timeout';
  if (isResponseError(error)) return 'invalid_response';
  if (isAIProviderError(error)) return 'provider_error';
  if (isAINetworkError(error) || isBrowserNetworkFailure(error)) return 'network';
  if (error instanceof AIServerError || (error instanceof Error && error.name === 'AIServerError')) return 'server_error';
  if (error instanceof AIUnknownError) return 'unknown';
  if (!(error instanceof AIError) && browserIsOffline()) return 'network';
  if (error instanceof AIError && typeof error.statusCode === 'number' && error.statusCode >= 500) return 'server_error';
  return 'unknown';
}

/** The stage a caller saw, except that a rejected answer is always the parse stage. */
export function aiFailureStage(error: unknown, stage: AIFailureStage = 'request'): AIFailureStage {
  return isResponseError(error) ? 'parse' : stage;
}

/** The HTTP status that goes with a failure, when one is known and plausible. */
export function aiFailureHttpStatus(error: unknown): number | undefined {
  const status = error instanceof AIError ? error.statusCode : undefined;
  return Number.isInteger(status) && status! >= 100 && status! <= 599 ? status : undefined;
}

/**
 * The next step a failure offers. Limits open the plan dialog and a Pro model
 * the upgrade dialog, which every tool already mounts. A refused session needs
 * a fresh sign-in, because sending again would be refused the same way. A
 * request that is too large fails the same way on every try.
 */
export function aiFailureRecovery(error: unknown): AIFailureRecovery {
  if (isAISubscriptionError(error)) return 'plan';
  if (isAIModelRestrictionError(error)) return 'upgrade';
  switch (aiFailureCode(error)) {
    case 'auth_expired':
      return 'sign_in';
    case 'aborted':
      return 'none';
    default:
      return aiFailureHttpStatus(error) === 413 ? 'none' : 'retry';
  }
}
