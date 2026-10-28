BEGIN;
SELECT plan(7);

INSERT INTO auth.users (id, email) VALUES
  ('a4000000-0000-4000-8000-00000000000a', 'guesser@example.test'),
  ('a4000000-0000-4000-8000-00000000000b', 'bystander@example.test'),
  ('a5000000-0000-4000-8000-00000000000a', 'lifer@example.test');
INSERT INTO public.promo_codes (code, type, config, is_active, expires_at) VALUES
  ('WINTER', 'free_month', '{"days":30}', true, NULL),
  ('OLDCODE', 'free_month', '{"days":30}', true, now() - interval '1 day'),
  ('A5LIFER', 'lifetime_pro', '{"limit":50}', true, NULL),
  ('A5TRIAL7', 'extended_trial', '{"days":7}', true, NULL),
  ('A5EXTRA15', 'extra_limit', '{"limit":15}', true, NULL);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

-- Guessing: an expired real code answers like a code that does not exist.
SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-00000000000a', true);
SELECT is(
  public.redeem_promo_code_atomic('OLDCODE') ->> 'message',
  public.redeem_promo_code_atomic('NOSUCHCODE') ->> 'message',
  'an expired code cannot be told apart from an unknown one'
);
SELECT public.redeem_promo_code_atomic('GUESS' || n) FROM generate_series(1, 20) AS n;
SELECT is(
  public.redeem_promo_code_atomic('WINTER') ->> 'success',
  'false',
  'after repeated failed guesses the right code is refused too'
);
SELECT is(
  public.redeem_promo_code_atomic('GUESS99') ->> 'message',
  public.redeem_promo_code_atomic('WINTER') ->> 'message',
  'a locked-out caller gets the same answer for valid and invalid codes'
);

SELECT set_config('request.jwt.claim.sub', 'a4000000-0000-4000-8000-00000000000b', true);
SELECT is(
  public.redeem_promo_code_atomic('WINTER') ->> 'success',
  'true',
  'another user is not locked out by the guesser'
);

-- Stacking: a later, smaller grant never lowers an earlier one.
SELECT set_config('request.jwt.claim.sub', 'a5000000-0000-4000-8000-00000000000a', true);
SELECT public.redeem_promo_code_atomic('A5LIFER');
SELECT public.redeem_promo_code_atomic('A5TRIAL7');
SELECT public.redeem_promo_code_atomic('A5EXTRA15');
RESET ROLE;

SELECT is(
  (SELECT subscription_tier FROM public.user_settings WHERE user_id = 'a5000000-0000-4000-8000-00000000000a'),
  'pro',
  'a lifetime Pro user who redeems an extended_trial code stays Pro'
);
SELECT is(
  (SELECT daily_limit_override FROM public.user_settings WHERE user_id = 'a5000000-0000-4000-8000-00000000000a'),
  50,
  'an extra_limit code never lowers a higher daily limit'
);
SELECT is(
  (SELECT grace_period_ends_at FROM public.user_settings WHERE user_id = 'a5000000-0000-4000-8000-00000000000a'),
  '9999-12-31T23:59:59.999Z'::timestamptz,
  'lifetime access keeps its end date'
);

SELECT * FROM finish();
ROLLBACK;
