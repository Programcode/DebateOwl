import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const orders: { table: string; column: string }[] = [];
let rateLimitResult: { data: { limit_value: number } | null; error: { message: string } | null } = {
  data: { limit_value: 12 },
  error: null,
};

// ai_usage_today: the server's counter. Missing (an older server) by default.
let usageToday: { data: number | null; error: { message: string } | null } = { data: null, error: { message: 'function not found' } };

function builder(table: string) {
  let column = '';
  const api = {
    select: () => api,
    eq: () => api,
    gte: () => api,
    neq: () => api,
    not: () => api,
    order: (next: string) => {
      column = next;
      orders.push({ table, column: next });
      return api;
    },
    limit: () => api,
    maybeSingle: () => Promise.resolve(table === 'user_settings'
      ? { data: { subscription_tier: 'trial', daily_limit_override: null, trial_ends_at: '2099-01-01T00:00:00.000Z', grace_period_ends_at: null }, error: null }
      : table === 'rate_limits' ? rateLimitResult : { data: null, error: null }),
    then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) => Promise.resolve(
      table === 'subscriptions'
        ? { data: [], error: null }
        : table === 'ai_requests'
          ? { count: 1, error: null }
          : { data: null, error: null },
    ).then(resolve, reject),
  };
  return api;
}

vi.mock('@/lib/supabase/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: (table: string) => builder(table),
    rpc: (name: string) => Promise.resolve(name === 'ai_usage_today' ? usageToday : { data: null, error: { message: 'unexpected rpc' } }),
  },
}));

import { useSubscription } from './use-subscription';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useSubscription rate limits', () => {
  beforeEach(() => {
    orders.length = 0;
    rateLimitResult = { data: { limit_value: 12 }, error: null };
    usageToday = { data: null, error: { message: 'function not found' } };
  });

  it('reads the account limit ordered by created_at and uses it', async () => {
    const { result } = renderHook(() => useSubscription(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    const rateOrders = orders.filter((order) => order.table === 'rate_limits');
    expect(rateOrders.length).toBeGreaterThan(0);
    expect(rateOrders.every((order) => order.column === 'created_at')).toBe(true);
    expect(orders.some((order) => order.column === 'updated_at')).toBe(false);
    expect(result.current.dailyLimit).toBe(12);
    expect(result.current.remainingToday).toBe(11);
  });

  it('logs a lookup error and leaves the remaining count unknown', async () => {
    rateLimitResult = { data: null, error: { message: 'column rate_limits.updated_at does not exist' } };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = renderHook(() => useSubscription(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(warn).toHaveBeenCalledWith('[useSubscription] rate_limits lookup failed:', 'column rate_limits.updated_at does not exist');
    expect(result.current.remainingToday).toBeNull();
    warn.mockRestore();
  });

  it('counts what the server charged, not one per logged call', async () => {
    // A Sparring round logs a row per call (1 here) but was charged as 3 units
    // on a weighted model; refunds and per-round charging only show in the counter.
    usageToday = { data: 3, error: null };
    const { result } = renderHook(() => useSubscription(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dailyUsed).toBe(3);
    expect(result.current.remainingToday).toBe(9);
  });
});
