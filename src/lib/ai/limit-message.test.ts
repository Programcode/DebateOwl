import { describe, expect, it } from 'vitest';
import i18n from '@/i18n';
import { mapAIError, AISubscriptionError } from './errors';
import { getUserFacingAIError } from './error-display';
import { sessionQuotaError } from './features/session-quota';
import { subscriptionLimitMessage } from './limit-message';

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

  // QB-06: a 402 without a code once showed "Edge Function returned a non-2xx status code".
  it('never shows the server text, even when the refusal carries no code', () => {
    const error = refuse({ error: 'Server text' });
    expect(error.message).toBe(i18n.t('limitModal.limitReachedGenericDesc'));
    expect(getUserFacingAIError(error)).not.toMatch(/Server text|non-2xx/);
  });

  it('explains a zero limit instead of "0 of 0 used"', () => {
    expect(refuse({ error: 'x', code: 'limit_reached', limit: 0, current: 0 }).message).toBe(i18n.t('limitModal.zeroLimitDesc'));
  });
});

// QB-06: the one-shot tools (Generate, Attack, Ask, Brainstorm, Factoids) meet a
// refusal through mapAIError; Crossfire and Sparring also meet it before Start
// through the quota check. Both must read exactly as the limit dialog does.
describe('a refusal reads the same in every mode', () => {
  const REFUSALS = [
    { code: 'limit_reached', limit: 5, current: 5, units: 1 },
    { code: 'limit_reached', limit: 50, current: 47, units: 5 },
    { code: 'weekly_budget_reached', limit: 50, current: 20, units: 1 },
    { code: 'trial_ended', limit: 0, current: 0, units: 1 },
    { code: 'payment_failed', limit: 0, current: 0, units: 1 },
    { code: 'subscription_ended', limit: 0, current: 0, units: 1 },
  ];

  it.each(REFUSALS)('$code ($current of $limit, $units units)', (details) => {
    const dialog = subscriptionLimitMessage(details);
    const oneShot = mapAIError({ message: 'Edge Function returned a non-2xx status code', context: { status: 402 } }, 'r', 'openrouter', 'm', { error: 'English server reason', ...details });
    const beforeStart = sessionQuotaError({ allowed: false, ...details });
    expect(oneShot.message).toBe(dialog);
    expect(beforeStart?.message).toBe(dialog);
    expect(getUserFacingAIError(oneShot)).toBe(dialog);
  });
});
