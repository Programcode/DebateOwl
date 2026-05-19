-- One-time gift: give currently expired users 30 more trial days.
-- The gifted_trial_2026_05 marker prevents this migration from granting the
-- gift more than once if it is reapplied in a local/dev environment.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS gifted_trial_2026_05 boolean NOT NULL DEFAULT false;

UPDATE public.user_settings AS us
SET subscription_tier = 'trial',
    trial_ends_at = now() + interval '30 days',
    grace_period_ends_at = NULL,
    daily_limit_override = COALESCE(us.daily_limit_override, 10),
    gifted_trial_2026_05 = true,
    updated_at = now()
WHERE us.gifted_trial_2026_05 = false
  AND NOT EXISTS (
    SELECT 1
    FROM public.subscriptions AS sub
    WHERE sub.user_id = us.user_id
      AND sub.status IN ('active', 'trialing')
      AND sub.current_period_end > now()
  )
  AND (
    us.subscription_tier = 'expired'
    OR (us.subscription_tier = 'trial' AND COALESCE(us.trial_ends_at, '-infinity'::timestamptz) <= now())
    OR (us.subscription_tier = 'legacy_free' AND COALESCE(us.grace_period_ends_at, '-infinity'::timestamptz) <= now())
    OR (us.subscription_tier = 'pro' AND COALESCE(us.grace_period_ends_at, '-infinity'::timestamptz) <= now())
  );
