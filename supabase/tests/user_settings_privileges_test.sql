BEGIN;
SELECT plan(5);

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
    AND NOT has_column_privilege('authenticated', 'public.user_settings', 'trial_ends_at', 'UPDATE'),
  'users cannot change entitlement columns'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.user_settings', 'INSERT'),
  'users cannot insert settings rows'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.user_settings', 'DELETE'),
  'users cannot delete settings rows'
);

SELECT * FROM finish();
ROLLBACK;
