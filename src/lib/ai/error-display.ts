import i18n from '@/i18n';
import { AIProviderError, isAISubscriptionError } from './client';
import { subscriptionLimitMessage } from './limit-message';

const PROVIDER_LABELS: Record<string, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  gemini: 'Google',
};

function providerLabel(provider?: string, message = ''): string {
  if (provider && PROVIDER_LABELS[provider]) return PROVIDER_LABELS[provider];
  if (/openai/i.test(message)) return 'OpenAI';
  if (/anthropic|claude/i.test(message)) return 'Anthropic';
  if (/google|gemini/i.test(message)) return 'Google';
  return i18n.t('aiErrors.genericProvider', 'AI provider');
}

/** The limit dialog's explanation, also used where a page shows the error inline. */
export { subscriptionLimitMessage };

export function getUserFacingAIError(error: unknown): string {
  if (isAISubscriptionError(error)) return subscriptionLimitMessage(error);

  if (error instanceof AIProviderError || (error instanceof Error && error.name === 'AIProviderError')) {
    const provider = providerLabel((error as AIProviderError).provider, error.message);
    const raw = error.message;
    const normalized = raw.toLowerCase();

    if (
      normalized.includes('insufficient_quota') ||
      normalized.includes('insufficient-quota') ||
      normalized.includes('exceeded your current quota') ||
      normalized.includes('quota') ||
      normalized.includes('billing details')
    ) {
      return i18n.t('aiErrors.quota', { provider, defaultValue: '{{provider}} quota exceeded. Please inform the site admin.' });
    }

    if (
      normalized.includes('invalid_api_key') ||
      normalized.includes('invalid api key') ||
      normalized.includes('incorrect api key') ||
      normalized.includes('api key') ||
      normalized.includes('unauthorized')
    ) {
      return i18n.t('aiErrors.config', { provider, defaultValue: '{{provider}} is not configured correctly. Please inform the site admin.' });
    }

    if (normalized.includes('rate limit') || normalized.includes('rate_limit') || normalized.includes('too many requests')) {
      return i18n.t('aiErrors.rateLimit', { provider, defaultValue: '{{provider}} rate limit exceeded. Please try again later.' });
    }

    if (
      normalized.includes('overloaded') ||
      normalized.includes('temporarily unavailable') ||
      normalized.includes('service unavailable') ||
      normalized.includes('503')
    ) {
      return i18n.t('aiErrors.unavailable', { provider, defaultValue: '{{provider}} is temporarily unavailable. Please try again later.' });
    }

    if (normalized.includes('content policy') || normalized.includes('safety') || normalized.includes('blocked')) {
      return i18n.t('aiErrors.safety', { provider, defaultValue: '{{provider}} blocked this request for safety reasons. Try rephrasing your input.' });
    }

    return i18n.t('aiErrors.unexpectedProvider', 'The AI provider returned an unexpected error. Please try again later.');
  }

  return error instanceof Error ? error.message : i18n.t('aiErrors.unexpected', 'An unexpected error occurred');
}
