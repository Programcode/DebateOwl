-- Stripe Subscription & Promo Code Schema Migration
-- Adds tables for subscriptions, promo codes, and user promo tracking.
-- Updates user_settings with subscription tier and limit fields.

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE subscription_status AS ENUM (
  'active', 'trialing', 'past_due', 'canceled',
  'incomplete', 'incomplete_expired', 'unpaid'
);

CREATE TYPE promo_type AS ENUM (
  'extended_trial', 'extra_limit', 'discount', 'free_month'
);

-- ============================================================
-- TABLES
-- ============================================================

-- Subscriptions: syncs Stripe status to our DB for fast access
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text UNIQUE,
  stripe_subscription_id text UNIQUE,
  status subscription_status NOT NULL,
  price_id text,
  quantity integer,
  cancel_at_period_end boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  current_period_start timestamptz NOT NULL,
  current_period_end timestamptz NOT NULL,
  ended_at timestamptz,
  cancel_at timestamptz,
  canceled_at timestamptz,
  trial_start timestamptz,
  trial_end timestamptz
);

-- Promo codes: manages partner/demo codes
CREATE TABLE public.promo_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  type promo_type NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_redemptions integer,
  redemptions_count integer DEFAULT 0,
  expires_at timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- User promos: tracks which user redeemed which code
CREATE TABLE public.user_promos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  promo_code_id uuid NOT NULL REFERENCES public.promo_codes(id) ON DELETE CASCADE,
  applied_at timestamptz DEFAULT now(),
  UNIQUE(user_id, promo_code_id)
);

-- ============================================================
-- USER_SETTINGS UPDATES
-- ============================================================

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS subscription_tier text DEFAULT 'trial'
    CHECK (subscription_tier IN ('trial', 'pro', 'legacy_free', 'expired')),
  ADD COLUMN IF NOT EXISTS daily_limit_override integer,
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS grace_period_ends_at timestamptz;

-- Set trial_ends_at for the handle_new_user trigger
-- New users get 3-day trial from account creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_settings (user_id, trial_ends_at)
  VALUES (new.id, now() + interval '3 days')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON public.subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON public.subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_promo_codes_code ON public.promo_codes(code);
CREATE INDEX IF NOT EXISTS idx_user_promos_user_id ON public.user_promos(user_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_promos ENABLE ROW LEVEL SECURITY;

-- Users can view their own subscription
CREATE POLICY "subscriptions_select_own" ON public.subscriptions
  FOR SELECT USING (user_id = (SELECT auth.uid()));

-- Promo codes: no public read (validated via edge function with service role)
-- No policies = only service role can access

-- Users can view their own promo redemptions
CREATE POLICY "user_promos_select_own" ON public.user_promos
  FOR SELECT USING (user_id = (SELECT auth.uid()));

-- ============================================================
-- EXISTING USER GRACE PERIOD MIGRATION
-- Sets all current users to legacy_free with 30-day grace period
-- ============================================================

UPDATE public.user_settings
SET subscription_tier = 'legacy_free',
    grace_period_ends_at = now() + interval '30 days'
WHERE subscription_tier IS NULL OR subscription_tier = 'trial';
