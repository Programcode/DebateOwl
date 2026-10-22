import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { mapAIError, AISubscriptionError } from './errors';

describe('quota refusals are translated, not the server reason', () => {
  const refuse = (payload: Record<string, unknown>) =>
    mapAIError({ message: 'Edge Function returned a non-2xx status code', context: { status: 402 } }, 'req-1', 'openrouter', 'm', payload);

  it('uses the catalog text for the weekly cap', () => {
    const error = refuse({ error: "You've reached this week's AI usage allowance.", code: 'weekly_budget_reached' });
    expect(error).toBeInstanceOf(AISubscriptionError);
    expect(error.message).toBe(i18n.t('limitModal.weeklyReachedDesc'));
  });

  it('says a model heavier than the whole daily limit never fits', () => {
    const error = refuse({ error: 'This model counts as 5 requests', code: 'limit_reached', limit: 3, current: 0, units: 5 });
    expect(error.message).toBe(i18n.t('limitModal.weightedTooLargeDesc', { units: 5, limit: 3 }));
    expect(error.message).not.toMatch(/midnight/);
  });

  it('keeps the weighted message when lighter requests still fit', () => {
    const error = refuse({ error: 'x', code: 'limit_reached', limit: 50, current: 47, units: 5 });
    expect(error.message).toBe(i18n.t('limitModal.weightedDesc', { units: 5, remaining: 3 }));
  });

  it('keeps the server text when the refusal carries no code', () => {
    expect(refuse({ error: 'Server text' }).message).toBe('Server text');
  });
});
