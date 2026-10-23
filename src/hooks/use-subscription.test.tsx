import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const orders: { table: string; column: string }[] = [];
let rateLimitResult: { data: { limit_value: number } | null; error: { message: string } | null } = {
  data: { limit_value: 12 },
  error: null,
};

const ACTIVE_TRIAL: Record<string, unknown> = { subscription_tier: 'trial', daily_limit_override: null, trial_ends_at: '2099-01-01T00:00:00.000Z', grace_period_ends_at: null };
let settingsRow: Record<string, unknown> = ACTIVE_TRIAL;
let subscriptionRows: Record<string, unknown>[] = [];

// ai_usage_today: the server's weighted counter, the only source of the count.
let usageToday: { data: number | null; error: { message: string } | null } = { data: 1, error: null };

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
      ? { data: settingsRow, error: null }
      : table === 'rate_limits' ? rateLimitResult : { data: null, error: null }),
    then: (resolve: (value: unknown) => void, reject?: (reason: unknown) => void) => Promise.resolve(
      table === 'subscriptions'
        ? { data: subscriptionRows, error: null }
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
    usageToday = { data: 1, error: null };
    settingsRow = ACTIVE_TRIAL;
    subscriptionRows = [];
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

  // QB-03: Settings counted logged ai_requests rows when the counter could not
  // be read, a number the server does not enforce. Unknown is shown as nothing.
  it('leaves the count unknown when the counter cannot be read, instead of counting rows', async () => {
    usageToday = { data: null, error: { message: 'function not found' } };
    const { result } = renderHook(() => useSubscription(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.dailyLimit).toBe(12);
    expect(result.current.remainingToday).toBeNull();
  });
});

// The hook resolves the same state as the AI functions (billing-state.ts);
// these pin the rows it reads and what it hands Settings.
describe('useSubscription billing states', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const at = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString();

  beforeEach(() => {
    rateLimitResult = { data: null, error: null };
    usageToday = { data: 0, error: null };
    subscriptionRows = [];
  });

  async function load() {
    const { result } = renderHook(() => useSubscription(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    return result.current;
  }

  it('shows an override on an expired trial as extended access, not Expired (QB-02)', async () => {
    settingsRow = { subscription_tier: 'trial', daily_limit_override: 5, trial_ends_at: at(-1), grace_period_ends_at: null };
    const state = await load();
    expect(state.billingState).toBe('extended_access');
    expect(state.dailyLimit).toBe(5);
    expect(state.remainingToday).toBe(5);
  });

  it('keeps a past-due payer on Pro with the portal, even with the tier the old webhook wrote (QB-13)', async () => {
    settingsRow = { subscription_tier: 'expired', daily_limit_override: null, trial_ends_at: at(-30), grace_period_ends_at: null };
    subscriptionRows = [{ stripe_customer_id: 'cus_1', status: 'past_due', current_period_start: at(-2), current_period_end: at(28) }];
    const state = await load();
    expect(state.billingState).toBe('payment_failed');
    expect(state.billingDateKind).toBe('grace_ends');
    expect(state.isPro).toBe(true);
    expect(state.dailyLimit).toBe(50);
    expect(state.hasOpenSubscription).toBe(true);
  });

  it('reads cancel_at_period_end and dates a plan set to cancel (QB-15)', async () => {
    const periodEnd = at(10);
    settingsRow = { subscription_tier: 'pro', daily_limit_override: null, trial_ends_at: null, grace_period_ends_at: null };
    subscriptionRows = [{ stripe_customer_id: 'cus_1', status: 'active', current_period_start: at(-20), current_period_end: periodEnd, cancel_at_period_end: true }];
    const state = await load();
    expect(state.billingState).toBe('pro_canceling');
    expect(state.billingDate).toBe(periodEnd);
    expect(state.billingDateKind).toBe('cancels');
  });

  it('dates a former subscription and gives no access (QB-14)', async () => {
    const endedAt = at(-3);
    settingsRow = { subscription_tier: 'expired', daily_limit_override: null, trial_ends_at: at(-60), grace_period_ends_at: null };
    subscriptionRows = [{ stripe_customer_id: 'cus_1', status: 'canceled', current_period_start: at(-33), current_period_end: at(-3), ended_at: endedAt }];
    const state = await load();
    expect(state.billingState).toBe('subscription_ended');
    expect(state.billingDate).toBe(endedAt);
    expect(state.dailyLimit).toBe(0);
    expect(state.hasOpenSubscription).toBe(false);
  });
});
