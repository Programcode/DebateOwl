BEGIN;
SELECT plan(12);

INSERT INTO auth.users (id, email) VALUES
  ('a6000000-0000-4000-8000-000000000001', 'first@example.test'),
  ('a6000000-0000-4000-8000-000000000002', 'second@example.test'),
  ('a6000000-0000-4000-8000-000000000003', 'third@example.test');
INSERT INTO public.promo_codes (code, type, config, is_active, max_redemptions) VALUES
  ('A6TWOSEATS', 'discount', '{"stripe_promotion_code":"promo_A6Two"}', true, 2),
  ('A6NOSTRIPE', 'discount', '{}', true, NULL),
  ('A6FREEMONTH', 'free_month', '{"days":30}', true, NULL);

CREATE FUNCTION pg_temp.claim(p_user uuid, p_code text, p_discount_only boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  RETURN public.redeem_promo_code_atomic(p_code, p_discount_only);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.claim(uuid, text, boolean) TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', true);

SELECT is(
  pg_temp.claim('a6000000-0000-4000-8000-000000000001', 'a6twoseats') ->> 'stripePromotionCode',
  'promo_A6Two',
  'claiming a discount returns the Stripe promotion code it stands for'
);
SELECT is(
  pg_temp.claim('a6000000-0000-4000-8000-000000000001', 'A6TWOSEATS', true) ->> 'stripePromotionCode',
  'promo_A6Two',
  'Checkout asking again for a held discount gets the same id'
);
SELECT is(
  pg_temp.claim('a6000000-0000-4000-8000-000000000002', 'A6TWOSEATS') ->> 'success',
  'true',
  'the last seat under the cap can be claimed'
);
SELECT is(
  pg_temp.claim('a6000000-0000-4000-8000-000000000003', 'A6TWOSEATS'),
  jsonb_build_object('success', false, 'message', 'Invalid or expired promo code'),
  'a claim past max_redemptions is refused like an unknown code'
);
SELECT is(
  pg_temp.claim('a6000000-0000-4000-8000-000000000003', 'A6TWOSEATS', true) ->> 'success',
  'false',
  'Checkout cannot claim a discount past its cap either'
);
SELECT is(
  pg_temp.claim('a6000000-0000-4000-8000-000000000001', 'A6TWOSEATS', true) ->> 'stripePromotionCode',
  'promo_A6Two',
  'a user who claimed before the cap still gets the id at Checkout'
);
SELECT is(
  pg_temp.claim('a6000000-0000-4000-8000-000000000002', 'A6NOSTRIPE') ->> 'message',
  pg_temp.claim('a6000000-0000-4000-8000-000000000002', 'A6NOSUCHCODE') ->> 'message',
  'a discount row without a Stripe promotion code answers like an unknown code'
);
SELECT is(
  pg_temp.claim('a6000000-0000-4000-8000-000000000003', 'A6FREEMONTH', true) ->> 'success',
  'false',
  'the Checkout path refuses a non-discount code'
);
RESET ROLE;

SELECT is(
  (SELECT redemptions_count FROM public.promo_codes WHERE code = 'A6TWOSEATS'),
  2,
  'redemptions_count equals the cap: repeat calls by a holder do not count again'
);
SELECT is(
  (SELECT count(*) FROM public.user_promos up JOIN public.promo_codes pc ON pc.id = up.promo_code_id
   WHERE pc.code = 'A6TWOSEATS'),
  2::bigint,
  'each claimed seat is recorded in user_promos'
);
SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.user_promos up JOIN public.promo_codes pc ON pc.id = up.promo_code_id
              WHERE pc.code = 'A6FREEMONTH')
    AND NOT EXISTS (SELECT 1 FROM public.user_settings
                    WHERE user_id = 'a6000000-0000-4000-8000-000000000003' AND subscription_tier = 'pro'),
  'a non-discount code sent through Checkout grants nothing'
);
SELECT is(
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'redeem_promo_code_atomic'),
  1::bigint,
  'one redeem_promo_code_atomic, so PostgREST can resolve the call'
);

SELECT * FROM finish();
ROLLBACK;
