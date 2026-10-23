-- SC-08: promo codes are read and written by the admin and create-checkout
-- Edge Functions (service role) and redeem_promo_code_atomic (SECURITY
-- DEFINER). No client reads them, and RLS has no policy for them.
REVOKE ALL ON TABLE public.promo_codes FROM anon, authenticated;
