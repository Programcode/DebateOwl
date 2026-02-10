import { supabase } from '@/lib/supabase/client';

const STRIPE_PRICE_ID = import.meta.env.VITE_STRIPE_PRICE_ID || '';
if (!STRIPE_PRICE_ID) {
  console.warn('[Stripe] VITE_STRIPE_PRICE_ID is not set — checkout will not work');
}

function getEdgeFunctionErrorMessage(error: unknown): string {
  if (!error) return 'Request failed';

  // Supabase functions errors often include a `context` with `status` and `body`.
  // We prefer returning the function's JSON `{ error: "..." }` if present.
  const err = error as {
    message?: unknown;
    context?: { status?: unknown; body?: unknown };
  };

  const context = err.context;
  const body = context?.body;
  const status = typeof context?.status === 'number' ? context.status : undefined;

  let bodyObj: unknown = undefined;
  if (typeof body === 'string' && body) {
    try {
      bodyObj = JSON.parse(body);
    } catch {
      bodyObj = undefined;
    }
  } else if (body && typeof body === 'object') {
    bodyObj = body;
  }

  const bodyError = bodyObj && typeof bodyObj === 'object' && 'error' in bodyObj
    ? (bodyObj as { error?: unknown }).error
    : undefined;

  if (typeof bodyError === 'string' && bodyError.trim()) return bodyError;

  const msg = typeof err.message === 'string' ? err.message : '';
  if (msg && msg !== 'Edge Function returned a non-2xx status code') return msg;

  if (status) return `Request failed (HTTP ${status})`;
  return 'Request failed';
}

/**
 * Redirect user to Stripe Checkout for Pro subscription.
 */
export async function redirectToCheckout(promoCode?: string): Promise<void> {
  if (!STRIPE_PRICE_ID) {
    throw new Error('Stripe checkout is not configured. Set VITE_STRIPE_PRICE_ID and restart the dev server.');
  }

  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Please sign in to upgrade');

  const { data, error } = await supabase.functions.invoke('create-checkout', {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: {
      priceId: STRIPE_PRICE_ID,
      successUrl: `${window.location.origin}/app/settings?checkout=success`,
      cancelUrl: `${window.location.origin}/app/settings?checkout=canceled`,
      promoCode,
    },
  });

  if (error) throw new Error(getEdgeFunctionErrorMessage(error) || 'Failed to create checkout session');
  if (!data?.url) throw new Error('No checkout URL returned');

  window.location.href = data.url;
}

/**
 * Redirect user to Stripe Customer Portal for subscription management.
 */
export async function redirectToPortal(): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Please sign in to manage subscription');

  const { data, error } = await supabase.functions.invoke('create-portal', {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: {
      returnUrl: `${window.location.origin}/app/settings`,
    },
  });

  if (error) throw new Error(getEdgeFunctionErrorMessage(error) || 'Failed to create portal session');
  if (!data?.url) throw new Error('No portal URL returned');

  window.location.href = data.url;
}

/**
 * Redeem a promo code for the current user.
 */
export async function redeemPromoCode(code: string): Promise<{ success: boolean; message: string }> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Please sign in to redeem a code');

  const { data, error } = await supabase.functions.invoke('redeem-promo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: { code },
  });

  if (error) return { success: false, message: getEdgeFunctionErrorMessage(error) || 'Failed to redeem code' };
  return data as { success: boolean; message: string };
}
