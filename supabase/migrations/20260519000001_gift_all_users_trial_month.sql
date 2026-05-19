-- One-time gratuity: give every user an additional 30 days of trial access.
-- This includes users who are currently active, expired, trialing, or missing
-- a settings row. Paid/lifetime Pro access is not downgraded.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS gifted_trial_gratuity_2026_05 boolean NOT NULL DEFAULT false;

INSERT INTO public.user_settings (
  user_id,
  subscription_tier,
  trial_ends_at,
  daily_limit_override,
  gifted_trial_gratuity_2026_05
)
SELECT
  auth_users.id,
  'trial',
  now() + interval '30 days',
  10,
  true
FROM auth.users AS auth_users
LEFT JOIN public.user_settings AS us
  ON us.user_id = auth_users.id
WHERE us.user_id IS NULL;

UPDATE public.user_settings AS us
SET subscription_tier = CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.subscriptions AS sub
        WHERE sub.user_id = us.user_id
          AND sub.status IN ('active', 'trialing')
          AND sub.current_period_end > now()
      ) THEN 'pro'
      WHEN us.subscription_tier = 'pro'
        AND COALESCE(us.grace_period_ends_at, '-infinity'::timestamptz) > now()
        THEN 'pro'
      ELSE 'trial'
    END,
    trial_ends_at = GREATEST(COALESCE(us.trial_ends_at, now()), now()) + interval '30 days',
    daily_limit_override = CASE
      WHEN EXISTS (
        SELECT 1
        FROM public.subscriptions AS sub
        WHERE sub.user_id = us.user_id
          AND sub.status IN ('active', 'trialing')
          AND sub.current_period_end > now()
      ) OR (
        us.subscription_tier = 'pro'
        AND COALESCE(us.grace_period_ends_at, '-infinity'::timestamptz) > now()
      ) THEN COALESCE(us.daily_limit_override, 50)
      ELSE COALESCE(us.daily_limit_override, 10)
    END,
    gifted_trial_gratuity_2026_05 = true,
    updated_at = now()
WHERE us.gifted_trial_gratuity_2026_05 = false;
