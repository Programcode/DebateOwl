BEGIN;
SELECT plan(9);

INSERT INTO auth.users (id) VALUES ('c7000000-0000-4000-8000-00000000000a');

SELECT ok(
  has_column_privilege('authenticated', 'public.user_settings', 'output_language', 'UPDATE'),
  'users can save their AI output language'
);
SELECT ok(
  has_column_privilege('authenticated', 'public.user_settings', 'language', 'UPDATE')
    AND has_column_privilege('authenticated', 'public.user_settings', 'theme', 'UPDATE')
    AND has_column_privilege('authenticated', 'public.user_settings', 'feature_configs', 'UPDATE')
    AND has_column_privilege('authenticated', 'public.user_settings', 'custom_system_prompt', 'UPDATE'),
  'users can save their other preferences'
);
SELECT ok(
  NOT has_column_privilege('authenticated', 'public.user_settings', 'subscription_tier', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.user_settings', 'daily_limit_override', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.user_settings', 'grace_period_ends_at', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.user_settings', 'trial_ends_at', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.user_settings', 'weekly_budget_override_usd', 'UPDATE')
    AND NOT has_column_privilege('authenticated', 'public.user_settings', 'weekly_budget_unlimited', 'UPDATE'),
  'users cannot change entitlement columns'
);
SELECT results_eq(
  $$SELECT weekly_budget_override_usd, weekly_budget_unlimited FROM public.user_settings
    WHERE user_id = 'c7000000-0000-4000-8000-00000000000a'$$,
  $$VALUES (NULL::numeric, false)$$,
  'a new account has no weekly budget override'
);
SELECT throws_ok(
  $$UPDATE public.user_settings SET weekly_budget_override_usd = -1
    WHERE user_id = 'c7000000-0000-4000-8000-00000000000a'$$,
  '23514',
  NULL,
  'a negative weekly budget override is rejected'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.user_settings', 'INSERT'),
  'users cannot insert settings rows'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.user_settings', 'DELETE'),
  'users cannot delete settings rows'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SELECT set_config('request.jwt.claim.sub', 'c7000000-0000-4000-8000-00000000000a', true);
SELECT throws_ok(
  $$UPDATE public.user_settings SET weekly_budget_unlimited = true
    WHERE user_id = 'c7000000-0000-4000-8000-00000000000a'$$,
  '42501',
  NULL,
  'a user cannot lift their own weekly cap'
);
SELECT throws_ok(
  $$UPDATE public.user_settings SET weekly_budget_override_usd = 1000
    WHERE user_id = 'c7000000-0000-4000-8000-00000000000a'$$,
  '42501',
  NULL,
  'a user cannot raise their own weekly cap'
);

SELECT * FROM finish();
ROLLBACK;
