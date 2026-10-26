import i18n from '@/i18n';
import { type PromoResultCode } from '../../supabase/functions/_shared/promo-result';

/**
 * Codes the Edge Functions send beside their English text, and the catalog key
 * the browser shows for each. Quota and plan refusals have their own wording
 * (limit-message.ts).
 */
const SERVER_ERROR_KEYS: Record<string, string> = {
  unauthenticated: 'serverErrors.signInRequired',
  banned: 'serverErrors.banned',
  upgrade_required: 'modelModal.restrictedDesc',
  usage_check_failed: 'serverErrors.usageCheckFailed',
  access_check_failed: 'serverErrors.accessCheckFailed',
  no_active_subscription: 'settings.noSubscriptionDesc',
  portal_failed: 'serverErrors.portalFailed',
  already_subscribed: 'serverErrors.alreadySubscribed',
  promo_expired: 'serverErrors.promoExpired',
  promo_exhausted: 'serverErrors.promoExhausted',
  promo_applied: 'serverErrors.promoApplied',
  promo_discount_noted: 'serverErrors.promoDiscountNoted',
  promo_invalid: 'serverErrors.promoInvalid',
  promo_already_redeemed: 'serverErrors.promoAlreadyRedeemed',
  promo_too_many_attempts: 'serverErrors.promoTooManyAttempts',
  promo_unsupported: 'serverErrors.promoUnsupported',
  promo_missing: 'serverErrors.promoMissing',
  promo_failed: 'serverErrors.promoFailed',
} satisfies Record<PromoResultCode, string> & Record<string, string>;

/** Whether the browser has its own words for this code. */
export function isKnownServerErrorCode(code: unknown): code is string {
  return typeof code === 'string' && Object.prototype.hasOwnProperty.call(SERVER_ERROR_KEYS, code);
}

/**
 * The translated text for a server error code. An unknown or missing code
 * shows the fallback, usually the server's own English text.
 */
export function serverErrorMessage(code: unknown, fallback: string): string {
  return isKnownServerErrorCode(code) ? i18n.t(SERVER_ERROR_KEYS[code]) : fallback;
}
