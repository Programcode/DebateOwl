import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSubscription } from '@/hooks/use-subscription';

interface MockResponses {
  userSettings: {
    subscription_tier?: string;
    daily_limit_override?: number;
    trial_ends_at?: string | null;
    grace_period_ends_at?: string | null;
  } | null;
  usageCount: number | null;
  billingData: { stripe_customer_id?: string | null } | null;
  billingError: { message: string } | null;
  throwOnUserSettings: boolean;
}

const {
  mockAuthState,
  mockResponses,
  fromMock,
} = vi.hoisted(() => {
  const mockAuthState = { user: null as { id: string } | null };
  const mockResponses: MockResponses = {
    userSettings: null,
    usageCount: 0,
    billingData: null,
    billingError: null,
    throwOnUserSettings: false,
  };

  const fromMock = vi.fn((table: string) => {
    if (table === 'user_settings') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => {
              if (mockResponses.throwOnUserSettings) {
                throw new Error('user_settings failed');
              }
              return { data: mockResponses.userSettings };
            }),
          })),
        })),
      };
    }

    if (table === 'ai_requests') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            gte: vi.fn(async () => ({ count: mockResponses.usageCount })),
          })),
        })),
      };
    }

    if (table === 'subscriptions') {
      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            not: vi.fn(() => ({
              limit: vi.fn(() => ({
                maybeSingle: vi.fn(async () => ({
                  data: mockResponses.billingData,
                  error: mockResponses.billingError,
                })),
              })),
            })),
          })),
        })),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return { mockAuthState, mockResponses, fromMock };
});

vi.mock('@/lib/supabase/AuthProvider', () => ({
  useAuth: () => mockAuthState,
}));

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: fromMock,
  },
}));

describe('useSubscription', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthState.user = null;
    mockResponses.userSettings = null;
    mockResponses.usageCount = 0;
    mockResponses.billingData = null;
    mockResponses.billingError = null;
    mockResponses.throwOnUserSettings = false;
  });

  it('returns non-loading default state when user is not signed in', async () => {
    const { result } = renderHook(() => useSubscription());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tier).toBe('trial');
    expect(result.current.hasStripeBilling).toBe(false);
    expect(result.current.dailyLimit).toBe(5);
    expect(result.current.dailyUsed).toBe(0);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it('loads active trial state with minimum trial limit and billing enabled', async () => {
    mockAuthState.user = { id: 'user-1' };
    mockResponses.userSettings = {
      subscription_tier: 'trial',
      daily_limit_override: 2,
      trial_ends_at: '2099-12-31T00:00:00.000Z',
      grace_period_ends_at: null,
    };
    mockResponses.usageCount = 3;
    mockResponses.billingData = { stripe_customer_id: 'cus_123' };

    const { result } = renderHook(() => useSubscription());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tier).toBe('trial');
    expect(result.current.isTrialActive).toBe(true);
    expect(result.current.isExpired).toBe(false);
    expect(result.current.dailyLimit).toBe(5);
    expect(result.current.dailyUsed).toBe(3);
    expect(result.current.hasStripeBilling).toBe(true);
    expect(result.current.trialEndsAt).toBe('2099-12-31T00:00:00.000Z');
  });

  it('uses pro override when it is above the minimum threshold', async () => {
    mockAuthState.user = { id: 'user-pro' };
    mockResponses.userSettings = {
      subscription_tier: 'pro',
      daily_limit_override: 80,
    };

    const { result } = renderHook(() => useSubscription());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tier).toBe('pro');
    expect(result.current.dailyLimit).toBe(80);
    expect(result.current.isPro).toBe(true);
  });

  it('handles legacy_free grace-period transitions on refresh', async () => {
    mockAuthState.user = { id: 'user-legacy' };
    mockResponses.userSettings = {
      subscription_tier: 'legacy_free',
      daily_limit_override: 20,
      grace_period_ends_at: '2099-01-01T00:00:00.000Z',
    };

    const { result } = renderHook(() => useSubscription());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.tier).toBe('legacy_free');
    });

    expect(result.current.isPro).toBe(true);
    expect(result.current.dailyLimit).toBe(50);

    mockResponses.userSettings = {
      subscription_tier: 'legacy_free',
      daily_limit_override: 20,
      grace_period_ends_at: '2000-01-01T00:00:00.000Z',
    };

    await act(async () => {
      await result.current.refresh();
    });

    expect(result.current.tier).toBe('expired');
    expect(result.current.isExpired).toBe(true);
    expect(result.current.dailyLimit).toBe(20);
  });

  it('expires legacy_free users without a grace period end date', async () => {
    mockAuthState.user = { id: 'legacy-no-grace' };
    mockResponses.userSettings = {
      subscription_tier: 'legacy_free',
      daily_limit_override: undefined,
      grace_period_ends_at: null,
    };

    const { result } = renderHook(() => useSubscription());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tier).toBe('expired');
    expect(result.current.dailyLimit).toBe(0);
  });

  it('handles expired trial and missing billing row', async () => {
    mockAuthState.user = { id: 'user-expired' };
    mockResponses.userSettings = {
      subscription_tier: 'trial',
      daily_limit_override: 2,
      trial_ends_at: '2000-01-01T00:00:00.000Z',
    };
    mockResponses.usageCount = 7;

    const { result } = renderHook(() => useSubscription());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tier).toBe('expired');
    expect(result.current.dailyLimit).toBe(2);
    expect(result.current.dailyUsed).toBe(7);
    expect(result.current.hasStripeBilling).toBe(false);
  });

  it('treats trial with no trial end date as expired', async () => {
    mockAuthState.user = { id: 'user-no-trial-end' };
    mockResponses.userSettings = {
      subscription_tier: 'trial',
      daily_limit_override: 0,
      trial_ends_at: null,
    };

    const { result } = renderHook(() => useSubscription());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tier).toBe('expired');
    expect(result.current.isExpired).toBe(true);
    expect(result.current.dailyLimit).toBe(0);
  });

  it('uses active trial override when above default minimum', async () => {
    mockAuthState.user = { id: 'trial-override' };
    mockResponses.userSettings = {
      subscription_tier: 'trial',
      daily_limit_override: 12,
      trial_ends_at: '2099-01-01T00:00:00.000Z',
    };

    const { result } = renderHook(() => useSubscription());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tier).toBe('trial');
    expect(result.current.dailyLimit).toBe(12);
  });

  it('falls back to expired for unknown subscription tiers', async () => {
    mockAuthState.user = { id: 'user-unknown-tier' };
    mockResponses.userSettings = {
      subscription_tier: 'enterprise',
      daily_limit_override: 13,
    };

    const { result } = renderHook(() => useSubscription());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tier).toBe('expired');
    expect(result.current.dailyLimit).toBe(13);
  });

  it('falls back to no billing when billing lookup returns an error', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockAuthState.user = { id: 'user-2' };
    mockResponses.userSettings = {
      subscription_tier: 'pro',
      daily_limit_override: 10,
    };
    mockResponses.billingError = { message: 'billing read failed' };

    const { result } = renderHook(() => useSubscription());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tier).toBe('pro');
    expect(result.current.dailyLimit).toBe(50);
    expect(result.current.hasStripeBilling).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      '[useSubscription] Failed to load Stripe billing state:',
      'billing read failed'
    );

    warnSpy.mockRestore();
  });

  it('handles unexpected load failures and clears loading state', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    mockAuthState.user = { id: 'user-3' };
    mockResponses.throwOnUserSettings = true;

    const { result } = renderHook(() => useSubscription());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.tier).toBe('trial');
    expect(result.current.hasStripeBilling).toBe(false);
    expect(warnSpy).toHaveBeenCalledWith(
      '[useSubscription] Failed to load:',
      expect.any(Error)
    );

    warnSpy.mockRestore();
  });
});
