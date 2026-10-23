import i18n from '@/i18n';
import { TRIAL_DAYS } from '@/lib/billing/plan';

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
  if (code === 'trial_ended' || code === 'trial_expired') return i18n.t('limitModal.trialEndedDesc', { days: TRIAL_DAYS });
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
  // A limit lowered during the day must not read "7 of 5 used".
  return i18n.t('limitModal.limitReachedDesc', { current: Math.min(current ?? limit, limit), limit });
}

/**
 * Why a Sparring round will not fit, from the browser's own count while the
 * server's answer is unknown. A round's cost is not always the model's weight
 * (an older server charges per call), so this names the round, not the model.
 */
export function shortfallMessage(units: number, remaining: number): string {
  if (remaining > 0) return i18n.t('limitModal.roundShortDesc', { units, remaining });
  return i18n.t('limitModal.limitReachedGenericDesc');
}
