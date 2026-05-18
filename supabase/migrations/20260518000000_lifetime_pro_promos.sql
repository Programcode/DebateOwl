-- Add lifetime Pro promo codes.
-- Lifetime access is represented as subscription_tier='pro' with a far-future
-- grace_period_ends_at, so it does not require Stripe billing.

ALTER TYPE promo_type ADD VALUE IF NOT EXISTS 'lifetime_pro';
