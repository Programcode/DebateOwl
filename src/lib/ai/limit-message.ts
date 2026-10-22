import i18n from '@/i18n';

export interface LimitDetails {
  code?: string;
  limit?: number;
  current?: number;
  units?: number;
}

/**
 * The translated explanation of a quota refusal. AISubscriptionError carries it
 * as its message, so a page that shows error.message directly is translated too;
 * the server's own reason is English only.
 */
export function subscriptionLimitMessage({ code, limit, current, units }: LimitDetails): string {
  if (code === 'trial_expired') return i18n.t('limitModal.trialEndedDesc');
  if (code === 'weekly_budget_reached') return i18n.t('limitModal.weeklyReachedDesc');
  const weight = units ?? 1;
  // A model heavier than the whole daily limit never fits, so waiting does not help.
  if (weight > 1 && typeof limit === 'number' && weight > limit) {
    return i18n.t('limitModal.weightedTooLargeDesc', { units: weight, limit });
  }
  const remaining = Math.max(0, (limit || 0) - (current || 0));
  // A weighted model can be refused while lighter requests still fit today.
  if (weight > 1 && remaining > 0) return i18n.t('limitModal.weightedDesc', { units: weight, remaining });
  return i18n.t('limitModal.limitReachedDesc', { current: current || 0, limit: limit || 0 });
}

/** Translated text for a refusal the server tagged with a code; otherwise the server's text. */
export function localizedLimitMessage(serverMessage: string, details: LimitDetails): string {
  return details.code ? subscriptionLimitMessage(details) : serverMessage;
}
