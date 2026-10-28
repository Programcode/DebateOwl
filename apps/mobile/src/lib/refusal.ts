import type { FeatureTab } from '@debatelab/core/ai/feature-configs';
import type { TFunction } from 'i18next';

import { AIError, type AIErrorDetails } from './ai-request';

/**
 * The website's limit-reached and model-restricted dialogs
 * (LimitReachedModal, ModelRestrictedModal, limit-message.ts): which one a
 * refusal opens, and its words. The app shows them as a sheet (app/limit.tsx).
 */

/** The website's TRIAL_DAYS (src/config/site.json pricing.trialDays). */
const TRIAL_DAYS = 3;

/** trial_expired is what functions older than the other access codes sent; it reads as trial_ended. */
export type LimitVariant = 'limit_reached' | 'trial_ended' | 'payment_failed' | 'subscription_ended' | 'weekly_budget_reached';

/** The dialog a refusal code opens, as the website's variantForCode. */
export function limitVariant(code: string | undefined): LimitVariant {
  if (code === 'trial_expired' || code === 'trial_ended') return 'trial_ended';
  if (code === 'payment_failed' || code === 'subscription_ended' || code === 'weekly_budget_reached') return code;
  return 'limit_reached';
}

export const LIMIT_TITLES: Record<LimitVariant, string> = {
  limit_reached: 'limitModal.limitReached',
  trial_ended: 'limitModal.trialEnded',
  payment_failed: 'limitModal.paymentFailed',
  subscription_ended: 'limitModal.subscriptionEnded',
  weekly_budget_reached: 'limitModal.weeklyReached',
};

/** The website's subscriptionLimitMessage: the same explanation in every tool. */
export function limitMessage(t: TFunction, { code, limit, current, units }: AIErrorDetails): string {
  const variant = limitVariant(code);
  if (variant === 'trial_ended') return t('limitModal.trialEndedDesc', { days: TRIAL_DAYS });
  if (variant === 'payment_failed') return t('limitModal.paymentFailedDesc');
  if (variant === 'subscription_ended') return t('limitModal.subscriptionEndedDesc');
  if (variant === 'weekly_budget_reached') return t('limitModal.weeklyReachedDesc');
  // An admin can set an account's limit to zero; "0 of 0 used" would explain nothing.
  if (limit === 0) return t('limitModal.zeroLimitDesc');
  if (typeof limit !== 'number') return t('limitModal.limitReachedGenericDesc');
  const weight = units ?? 1;
  // A model heavier than the whole daily limit never fits, so waiting does not help.
  if (weight > 1 && weight > limit) return t('limitModal.weightedTooLargeDesc', { units: weight, limit });
  const remaining = Math.max(0, limit - (current || 0));
  // A weighted model can be refused while lighter requests still fit today.
  if (weight > 1 && remaining > 0) return t('limitModal.weightedDesc', { units: weight, remaining });
  // A limit lowered during the day must not read "7 of 5 used".
  return t('limitModal.limitReachedDesc', { current: Math.min(current ?? limit, limit), limit });
}

/** The route parameters of the limit sheet for a refusal, or null when the error is not one. */
export function refusalParams(error: unknown, feature: FeatureTab): Record<string, string> | null {
  if (!(error instanceof AIError)) return null;
  const { details } = error;
  if (error.kind === 'modelRestricted') return { kind: 'model', feature };
  if (error.kind !== 'limitReached' && error.kind !== 'trialExpired') return null;
  return {
    kind: 'limit',
    feature,
    code: details.code ?? (error.kind === 'trialExpired' ? 'trial_ended' : 'limit_reached'),
    ...(details.limit !== undefined ? { limit: String(details.limit) } : {}),
    ...(details.current !== undefined ? { current: String(details.current) } : {}),
    ...(details.units !== undefined ? { units: String(details.units) } : {}),
  };
}

/**
 * Opens the website's dialog for a refusal as the limit sheet, instead of an
 * inline error. Returns false when the error is not a refusal.
 */
export function openRefusal(router: { push: (href: { pathname: '/limit'; params: Record<string, string> }) => void }, error: unknown, feature: FeatureTab): boolean {
  const params = refusalParams(error, feature);
  if (!params) return false;
  router.push({ pathname: '/limit', params });
  return true;
}
