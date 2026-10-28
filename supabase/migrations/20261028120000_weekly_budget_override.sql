-- Per-account override of the weekly AI spend cap (WEEKLY_AI_BUDGET_USD in
-- supabase/functions/_shared/usage-limits.ts), set the same way as
-- daily_limit_override: by an admin or service-role SQL, never by the user.
--
-- Additive only. Both columns default to "no override", so every existing
-- account keeps the global cap. checkRateLimit and peekRateLimit in
-- _shared/entitlements.ts read them and pass the effective cap to
-- consume_ai_quota and claim_ai_session_quota, which are unchanged.
--
-- Precedence: weekly_budget_unlimited = true skips the weekly check; otherwise
-- a non-NULL weekly_budget_override_usd replaces the global cap (0 refuses
-- every request that week); otherwise the global cap applies.
--
-- No grant change: 20260819000000_security_hardening.sql revoked table-level
-- INSERT and UPDATE on user_settings from anon and authenticated and granted
-- UPDATE only on named preference columns, so new columns are server-only.
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS weekly_budget_override_usd numeric,
  ADD COLUMN IF NOT EXISTS weekly_budget_unlimited boolean NOT NULL DEFAULT false;

-- consume_ai_quota raises on a negative cap, which would fail every request
-- for the account instead of refusing it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.user_settings'::regclass
      AND conname = 'user_settings_weekly_budget_override_usd_check'
  ) THEN
    ALTER TABLE public.user_settings
      ADD CONSTRAINT user_settings_weekly_budget_override_usd_check
      CHECK (weekly_budget_override_usd IS NULL OR weekly_budget_override_usd >= 0);
  END IF;
END;
$$;

COMMENT ON COLUMN public.user_settings.weekly_budget_override_usd IS
  'Weekly AI spend cap in USD for this account, replacing WEEKLY_AI_BUDGET_USD. NULL = global cap; 0 = refused all week. Admin or service role only.';
COMMENT ON COLUMN public.user_settings.weekly_budget_unlimited IS
  'When true, this account skips the weekly AI spend cap; the daily limit still applies. Admin or service role only.';
