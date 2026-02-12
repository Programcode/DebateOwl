import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { getSessionMock, invokeMock } = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  invokeMock: vi.fn(),
}));

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
    },
    functions: {
      invoke: invokeMock,
    },
  },
}));

const loadStripeModule = async () => {
  vi.resetModules();
  return import('@/lib/stripe');
};

describe('stripe helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: 'token-123' } },
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('requires auth before checkout redirect', async () => {
    getSessionMock.mockResolvedValueOnce({ data: { session: null } });
    const { redirectToCheckout } = await loadStripeModule();

    await expect(redirectToCheckout()).rejects.toThrow('Please sign in to upgrade');
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('redirects to checkout and sends expected payload', async () => {
    invokeMock.mockResolvedValueOnce({ data: { url: `${window.location.origin}/checkout` }, error: null });
    const { redirectToCheckout } = await loadStripeModule();

    await redirectToCheckout('PROMO10');

    expect(invokeMock).toHaveBeenCalledWith('create-checkout', {
      headers: { Authorization: 'Bearer token-123' },
      body: expect.objectContaining({
        promoCode: 'PROMO10',
        successUrl: `${window.location.origin}/app/settings?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${window.location.origin}/app/settings?checkout=canceled`,
      }),
    });
  });

  it('includes configured Stripe price ID when present', async () => {
    vi.stubEnv('VITE_STRIPE_PRICE_ID', 'price_abc123');
    invokeMock.mockResolvedValueOnce({ data: { url: `${window.location.origin}/checkout-with-price` }, error: null });
    const { redirectToCheckout } = await loadStripeModule();

    await redirectToCheckout();

    expect(invokeMock).toHaveBeenCalledWith('create-checkout', {
      headers: { Authorization: 'Bearer token-123' },
      body: expect.objectContaining({
        priceId: 'price_abc123',
      }),
    });
  });

  it('parses edge-function error body from Response-like context', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          status: 400,
          text: async () => JSON.stringify({ error: 'Invalid checkout request' }),
        },
      },
    });
    const { redirectToCheckout } = await loadStripeModule();

    await expect(redirectToCheckout()).rejects.toThrow('Invalid checkout request');
  });

  it('falls back to HTTP status when edge-function error body is missing', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          status: 503,
        },
      },
    });
    const { redirectToCheckout } = await loadStripeModule();

    await expect(redirectToCheckout()).rejects.toThrow('Request failed (HTTP 503)');
  });

  it('uses a plain context body string error when present', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          body: JSON.stringify({ error: 'Body string error' }),
        },
      },
    });
    const { redirectToCheckout } = await loadStripeModule();

    await expect(redirectToCheckout()).rejects.toThrow('Body string error');
  });

  it('returns custom non-generic edge-function messages directly', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Billing backend is unavailable',
      },
    });
    const { redirectToCheckout } = await loadStripeModule();

    await expect(redirectToCheckout()).rejects.toThrow('Billing backend is unavailable');
  });

  it('falls back to a generic message when status and message are missing', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {},
    });
    const { redirectToCheckout } = await loadStripeModule();

    await expect(redirectToCheckout()).rejects.toThrow('Request failed');
  });

  it('handles invalid JSON in response text and still falls back to status', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          status: 502,
          text: async () => '{invalid-json',
        },
      },
    });
    const { redirectToCheckout } = await loadStripeModule();

    await expect(redirectToCheckout()).rejects.toThrow('Request failed (HTTP 502)');
  });

  it('throws when checkout URL is not returned', async () => {
    invokeMock.mockResolvedValueOnce({ data: {}, error: null });
    const { redirectToCheckout } = await loadStripeModule();

    await expect(redirectToCheckout()).rejects.toThrow('No checkout URL returned');
  });

  it('redirects to billing portal', async () => {
    invokeMock.mockResolvedValueOnce({ data: { url: `${window.location.origin}/portal` }, error: null });
    const { redirectToPortal } = await loadStripeModule();

    await redirectToPortal();

    expect(invokeMock).toHaveBeenCalledWith('create-portal', {
      headers: { Authorization: 'Bearer token-123' },
      body: { returnUrl: `${window.location.origin}/app/settings` },
    });
  });

  it('requires auth before portal redirect', async () => {
    getSessionMock.mockResolvedValueOnce({ data: { session: null } });
    const { redirectToPortal } = await loadStripeModule();

    await expect(redirectToPortal()).rejects.toThrow('Please sign in to manage subscription');
  });

  it('returns parsed redeem-promo errors without throwing', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          body: { error: 'Promo code already redeemed' },
        },
      },
    });
    const { redeemPromoCode } = await loadStripeModule();

    await expect(redeemPromoCode('USED-CODE')).resolves.toEqual({
      success: false,
      message: 'Promo code already redeemed',
    });
  });

  it('returns fallback redeem-promo error text when payload has no message', async () => {
    invokeMock.mockResolvedValueOnce({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          status: 429,
        },
      },
    });
    const { redeemPromoCode } = await loadStripeModule();

    await expect(redeemPromoCode('RATE-LIMIT')).resolves.toEqual({
      success: false,
      message: 'Request failed (HTTP 429)',
    });
  });

  it('returns redeem-promo success payload', async () => {
    invokeMock.mockResolvedValueOnce({
      data: { success: true, message: 'Promo applied' },
      error: null,
    });
    const { redeemPromoCode } = await loadStripeModule();

    await expect(redeemPromoCode('NEW-CODE')).resolves.toEqual({
      success: true,
      message: 'Promo applied',
    });
  });

  it('requires auth before redeeming promo codes', async () => {
    getSessionMock.mockResolvedValueOnce({ data: { session: null } });
    const { redeemPromoCode } = await loadStripeModule();

    await expect(redeemPromoCode('ANY')).rejects.toThrow('Please sign in to redeem a code');
  });
});
