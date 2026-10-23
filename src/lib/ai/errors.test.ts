import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import {
  AIAuthError,
  AIModelRestrictionError,
  AINetworkError,
  AISubscriptionError,
  AIProviderError,
  AIServerError,
  AIUnknownError,
  TimeoutError,
  classifyAIError,
  mapAIError,
} from './errors';

describe('classifyAIError', () => {
  it('treats a fetch TypeError as a network failure and does not capture it', () => {
    const classification = classifyAIError(new TypeError('Failed to fetch'));
    expect(classification).toMatchObject({ errorName: 'AINetworkError', shouldCaptureException: false });
  });

  it('captures an unknown error under its own name with a privacy-safe cause type', () => {
    const classification = classifyAIError(new Error('student motion and private notes'));
    expect(classification).toMatchObject({
      errorName: 'AIUnknownError',
      shouldCaptureException: true,
      causeType: 'Error:Error',
    });
    expect(classification.causeType).not.toContain('student');
    expect(JSON.stringify(classification)).not.toContain('private notes');
  });

  it('keeps subscription, model and timeout failures on their existing names', () => {
    expect(classifyAIError(new AISubscriptionError('limit', { statusCode: 402 })).shouldCaptureException).toBe(false);
    expect(classifyAIError(new AISubscriptionError('limit', { statusCode: 402 })).errorName).toBe('AISubscriptionError');
    expect(classifyAIError(new AIModelRestrictionError('upgrade')).errorName).toBe('AIModelRestrictionError');
    expect(classifyAIError(new AIAuthError('no', { statusCode: 403 })).shouldCaptureException).toBe(false);
    expect(classifyAIError(new TimeoutError())).toMatchObject({ errorName: 'TimeoutError', shouldCaptureException: true });
  });

  it('reads invalid_output as a malformed answer, not a provider failure', async () => {
    const { isInvalidOutputError } = await import('./errors');
    const error = mapAIError({ message: 'failed', context: { status: 502 } }, 'req_1', 'openrouter', 'auto-pro', { error: 'The AI answer came back malformed. Please try again.', code: 'invalid_output', charged: false });
    expect(error.name).toBe('AIResponseError');
    expect(isInvalidOutputError(error)).toBe(true);
    expect(error.notCharged).toBe(true);
    expect(error.message).toBe(i18n.t('aiErrors.invalidOutput'));
  });

  it('keeps transient provider failures out of exception reports but still reports the rest', () => {
    const mapped = (payload: Record<string, unknown>, status: number) =>
      classifyAIError(mapAIError({ message: 'failed', context: { status } }, 'req_1', 'openrouter', 'auto-pro', payload));
    // A Claude outage, and a failure the server marked worth retrying.
    expect(mapped({ error: 'Anthropic Claude is temporarily unavailable.', code: 'provider_unavailable' }, 503)).toMatchObject({ errorName: 'AIProviderError', shouldCaptureException: false });
    expect(mapped({ error: 'AI request failed. Please try again.', code: 'provider_error', retryable: true }, 500)).toMatchObject({ errorName: 'AIProviderError', shouldCaptureException: false });
    // An answer that failed validation may be a bug.
    expect(mapped({ error: 'AI request failed. Please try again.', code: 'provider_error' }, 500)).toMatchObject({ errorName: 'AIProviderError', shouldCaptureException: true });
  });

  it('recognizes the other browser network messages and an offline navigator', () => {
    expect(classifyAIError(new TypeError('NetworkError when attempting to fetch resource')).errorName).toBe('AINetworkError');
    expect(classifyAIError(new TypeError('Load failed')).errorName).toBe('AINetworkError');
    expect(classifyAIError(new TypeError('Network error')).errorName).toBe('AINetworkError');
    const online = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    try {
      expect(classifyAIError(new Error('socket closed')).errorName).toBe('AINetworkError');
      expect(classifyAIError(new AISubscriptionError('limit', { statusCode: 402 })).errorName).toBe('AISubscriptionError');
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
    }
  });
});

describe('mapAIError', () => {
  it('maps a wrapped fetch failure to a network error without a status code', () => {
    const error = mapAIError(
      { message: 'Failed to send a request to the Edge Function', context: new TypeError('Failed to fetch') },
      'req-1',
      'openrouter',
      'm',
    );
    expect(error).toBeInstanceOf(AINetworkError);
    expect(error.statusCode).toBeUndefined();
    expect(classifyAIError(error).shouldCaptureException).toBe(false);
  });

  it('maps an unknown transport error without putting its message in the cause type', () => {
    const error = mapAIError({ message: 'student motion leaked' }, 'req-1', 'openrouter', 'm');
    expect(error).toBeInstanceOf(AIUnknownError);
    expect((error as AIUnknownError).causeType).toBe('Unknown:Unknown');
    expect((error as AIUnknownError).causeType).not.toContain('student');
    expect(classifyAIError(error).shouldCaptureException).toBe(true);
  });

  it('still maps 402, 403 and abort messages as before', () => {
    const limited = mapAIError(
      { message: 'Edge Function returned a non-2xx status code', context: { status: 402 } },
      'req-1',
      'openrouter',
      'm',
      { error: 'limit', code: 'limit_reached' },
    );
    expect(limited).toBeInstanceOf(AISubscriptionError);
    expect(limited.statusCode).toBe(402);

    const upgrade = mapAIError(
      { message: 'Edge Function returned a non-2xx status code', context: { status: 403 } },
      'req-1',
      'openrouter',
      'm',
      { code: 'upgrade_required', error: 'This model requires Pro' },
    );
    expect(upgrade).toBeInstanceOf(AIModelRestrictionError);

    const forbidden = mapAIError(
      { message: 'Edge Function returned a non-2xx status code', context: { status: 403 } },
      'req-1',
      'openrouter',
      'm',
      { error: 'Access denied' },
    );
    expect(forbidden).toBeInstanceOf(AIAuthError);

    expect(mapAIError({ message: 'The operation was aborted' }, 'req-1', 'openrouter', 'm')).toBeInstanceOf(TimeoutError);
  });

  it('keeps a provider_error 500 on AIProviderError and other 500s on AIServerError', () => {
    const provider = mapAIError(
      { message: 'Edge Function returned a non-2xx status code', context: { status: 500 } },
      'req-1',
      'openrouter',
      'm',
      { error: 'AI request failed. Please try again.', code: 'provider_error' },
    );
    expect(provider).toBeInstanceOf(AIProviderError);
    expect(provider.statusCode).toBe(500);
    expect(classifyAIError(provider).errorName).toBe('AIProviderError');

    const server = mapAIError(
      { message: 'Edge Function returned a non-2xx status code', context: { status: 500 } },
      'req-1',
      'openrouter',
      'm',
      { error: 'Unable to verify your quota. Please try again.' },
    );
    expect(server).toBeInstanceOf(AIServerError);
    expect(server.statusCode).toBe(500);
    expect(classifyAIError(server)).toMatchObject({ errorName: 'AIServerError', statusCode: 500, shouldCaptureException: true });
  });
});
