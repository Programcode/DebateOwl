-- When a subscription's current run of failed payments began. Additive only.
--
-- A past-due subscription keeps Pro for a grace period while Stripe retries
-- the invoice (supabase/functions/_shared/billing-state.ts). The grace is
-- counted from this time, not from the billing period, so a subscription that
-- Stripe leaves past due across several periods cannot reopen the grace each
-- period. The Stripe webhook sets it on the first invoice.payment_failed and
-- clears it when a payment succeeds or the subscription is active again.
-- NULL means no failure is recorded; rows from before this column fall back
-- to the period start.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS payment_failed_at timestamptz;

COMMENT ON COLUMN public.subscriptions.payment_failed_at IS
  'Start of the current run of failed payments; set by the Stripe webhook, cleared on recovery. Bounds the past-due Pro grace.';
