import { describe, expect, it } from 'vitest';
import { AIProviderError } from '@/lib/ai/client';
import { getUserFacingAIError } from '@/lib/ai/error-display';

describe('getUserFacingAIError', () => {
  it('shows a concise provider quota message', () => {
    const error = new AIProviderError(
      'OpenAI error: { "error": { "message": "You exceeded your current quota", "code": "insufficient_quota" } }',
      { provider: 'openai' }
    );

    expect(getUserFacingAIError(error)).toBe('OpenAI quota exceeded. Please inform the site admin.');
  });

  it('returns a safe generic message for unknown provider errors', () => {
    const error = new AIProviderError('OpenAI error: brand new provider failure', { provider: 'openai' });

    expect(getUserFacingAIError(error)).toBe('The AI provider returned an unexpected error. Please try again later.');
  });

  it('falls back to the original non-provider error message', () => {
    expect(getUserFacingAIError(new Error('Unexpected edge case'))).toBe('Unexpected edge case');
  });
});
