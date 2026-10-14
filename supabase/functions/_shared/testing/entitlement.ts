// Test support: the rows effective_entitlement() returns through PostgREST
// (/rest/v1/rpc/effective_entitlement), for handler tests that need a plan.
// The tier rules themselves are tested in supabase/tests/app_store_entitlements_test.sql.

export type TestTier = "trial" | "basic" | "pro" | "legacy_free" | "expired";

const DEFAULTS: Record<TestTier, { daily_limit: number; can_access_pro_models: boolean; source: string | null }> = {
  pro: { daily_limit: 50, can_access_pro_models: true, source: "stripe" },
  legacy_free: { daily_limit: 50, can_access_pro_models: true, source: "legacy" },
  basic: { daily_limit: 20, can_access_pro_models: false, source: "app_store" },
  trial: { daily_limit: 5, can_access_pro_models: false, source: "trial" },
  expired: { daily_limit: 0, can_access_pro_models: false, source: null },
};

export function entitlementRows(tier: TestTier, overrides: Record<string, unknown> = {}): Record<string, unknown>[] {
  return [{
    tier,
    ...DEFAULTS[tier],
    expires_at: null,
    trial_ends_at: null,
    grace_period_ends_at: null,
    has_stripe_billing: false,
    has_app_store_subscription: false,
    ...overrides,
  }];
}

export const ENTITLEMENT_PATH = "/rest/v1/rpc/effective_entitlement";
