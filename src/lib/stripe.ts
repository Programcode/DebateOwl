import { supabase } from '@/lib/supabase/client';
import { readEdgeFunctionError } from '@/lib/supabase/edge-function-error';
import { getWebAppRedirectUrl, openExternalUrl } from '@/lib/native';
import i18n from '@/i18n';
import { serverErrorMessage } from '@/lib/server-errors';
import { type PromoResultCode, promoResultCode } from '../../supabase/functions/_shared/promo-result';

/** A billing call that failed, with its message in the interface language and the server's code. */
export class BillingError extends Error {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'BillingError';
    this.code = code;
  }
}

/**
 * The portal's refusal for an account Stripe has no subscription for. A
 * create-portal deployed before its codes sends only the English text.
 */
export function isNoActiveSubscription(error: unknown): boolean {
  if (error instanceof BillingError && error.code === 'no_active_subscription') return true;
  return error instanceof Error && error.message.toLowerCase().includes('no active subscription');
}

/** A failed billing function call as a BillingError: a known code translated, else the server's text, else the fallback. */
async function billingError(error: unknown, fallbackKey: string): Promise<BillingError> {
  const { message, code, status } = await readEdgeFunctionError(error);
  if (status === 401) return new BillingError(i18n.t('serverErrors.sessionExpired'), code);
  return new BillingError(serverErrorMessage(code, message || i18n.t(fallbackKey)), code);
}

/**
 * Redirect user to Stripe Checkout for Pro subscription.
 */
export async function redirectToCheckout(promoCode?: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new BillingError(i18n.t('serverErrors.signInRequired'), 'unauthenticated');

  const checkoutBody = {
    successUrl: `${getWebAppRedirectUrl('/app/settings')}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${getWebAppRedirectUrl('/app/settings')}?checkout=canceled`,
    promoCode,
  };

  const { data, error } = await supabase.functions.invoke('create-checkout', {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: checkoutBody,
  });

  if (error) throw await billingError(error, 'pricingModal.checkoutErrorDesc');
  if (!data?.url) throw new BillingError(i18n.t('pricingModal.checkoutErrorDesc'));

  await openExternalUrl(data.url);
}

/**
 * Redirect user to Stripe Customer Portal for subscription management.
 */
export async function redirectToPortal(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new BillingError(i18n.t('serverErrors.signInRequired'), 'unauthenticated');

  const { data, error } = await supabase.functions.invoke('create-portal', {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: {
      returnUrl: getWebAppRedirectUrl('/app/settings'),
    },
  });

  if (error) throw await billingError(error, 'serverErrors.portalFailed');
  if (!data?.url) throw new BillingError(i18n.t('serverErrors.portalFailed'));

  await openExternalUrl(data.url);
}

/**
 * Redeem a promo code for the current user. The message is in the interface
 * language when the answer is one the browser knows, else the server's text.
 * A discount answers `promo_discount_noted`: it is claimed, and Checkout
 * applies it when the same code is sent with the upgrade.
 */
export async function redeemPromoCode(code: string): Promise<{ success: boolean; message: string; code?: PromoResultCode }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new BillingError(i18n.t('serverErrors.signInRequired'), 'unauthenticated');

  const { data, error } = await supabase.functions.invoke('redeem-promo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { code },
  });

  if (error) {
    // redeem-promo answers a refusal with { success, message } rather than { error }.
    const { message, body, status } = await readEdgeFunctionError(error);
    if (status === 401) return { success: false, message: i18n.t('serverErrors.sessionExpired') };
    const fallback = (typeof body?.message === 'string' && body.message) || message || i18n.t('pricingModal.redeemErrorDesc');
    return { success: false, message: serverErrorMessage(promoResultCode(body), fallback) };
  }
  const result = data as { success: boolean; message: string; code?: string };
  const resultCode = promoResultCode(result);
  return { success: result.success, message: serverErrorMessage(resultCode, result.message), code: resultCode };
}
