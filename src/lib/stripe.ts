import { supabase } from '@/lib/supabase/client';

const STRIPE_PRICE_ID = import.meta.env.VITE_STRIPE_PRICE_ID || '';

/**
 * Redirect user to Stripe Checkout for Pro subscription.
 */
export async function redirectToCheckout(promoCode?: string): Promise<void> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error('Please sign in to upgrade');

  const { data, error } = await supabase.functions.invoke('create-checkout', {
    headers: { Authorization: `Bearer ${accessToken}` },
    body: {
      priceId: STRIPE_PRICE_ID,
      successUrl: `${window.location.origin}/settings?checkout=success`,
      cancelUrl: `${window.location.origin}/settings?checkout=canceled`,
      promoCode,
    },
  });

  if (error) throw new Error(error.message || 'Failed to create checkout session');
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
      returnUrl: `${window.location.origin}/settings`,
    },
  });

  if (error) throw new Error(error.message || 'Failed to create portal session');
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

  if (error) return { success: false, message: error.message || 'Failed to redeem code' };
  return data as { success: boolean; message: string };
}
