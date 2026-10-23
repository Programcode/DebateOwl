import i18n from '@/i18n';

export interface LimitDetails {
  code?: string;
  limit?: number;
  current?: number;
  units?: number;
}

/**
 * Codes the AI functions refuse an account's access or quota with. trial_expired
 * is what functions deployed before trial_ended, payment_failed and
 * subscription_ended sent for all three; it reads as trial_ended.
 */
const SUBSCRIPTION_REFUSAL_CODES = new Set([
  'limit_reached',
  'weekly_budget_reached',
  'trial_ended',
  'trial_expired',
  'payment_failed',
  'subscription_ended',
]);

export function isSubscriptionRefusalCode(code: unknown): code is string {
  return typeof code === 'string' && SUBSCRIPTION_REFUSAL_CODES.has(code);
}

/**
 * The translated explanation of a quota refusal, the same in every tool.
 * AISubscriptionError carries it as its message, so a page that shows
 * error.message directly is translated too. The server's own reason is English
 * only and never shown, even when the refusal carries no code.
 */
export function subscriptionLimitMessage({ code, limit, current, units }: LimitDetails): string {
  if (code === 'trial_ended' || code === 'trial_expired') return i18n.t('limitModal.trialEndedDesc');
  if (code === 'payment_failed') return i18n.t('limitModal.paymentFailedDesc');
  if (code === 'subscription_ended') return i18n.t('limitModal.subscriptionEndedDesc');
  if (code === 'weekly_budget_reached') return i18n.t('limitModal.weeklyReachedDesc');
  // An admin can set an account's limit to zero; "0 of 0 used" would explain nothing.
  if (limit === 0) return i18n.t('limitModal.zeroLimitDesc');
  if (typeof limit !== 'number') return i18n.t('limitModal.limitReachedGenericDesc');
  const weight = units ?? 1;
  // A model heavier than the whole daily limit never fits, so waiting does not help.
  if (weight > 1 && weight > limit) {
    return i18n.t('limitModal.weightedTooLargeDesc', { units: weight, limit });
  }
  const remaining = Math.max(0, limit - (current || 0));
  // A weighted model can be refused while lighter requests still fit today.
  if (weight > 1 && remaining > 0) return i18n.t('limitModal.weightedDesc', { units: weight, remaining });
  return i18n.t('limitModal.limitReachedDesc', { current: current ?? limit, limit });
}

/**
 * The same text for a round the browser can tell will not fit before asking
 * the server: Sparring warns with it while the server's quota answer is unknown.
 */
export function shortfallMessage(units: number, remaining: number): string {
  if (remaining > 0 && units > 1) return i18n.t('limitModal.weightedDesc', { units, remaining });
  return i18n.t('limitModal.limitReachedGenericDesc');
}
