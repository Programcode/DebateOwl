-- SC-08: redemptions are written by redeem_promo_code_atomic (SECURITY
-- DEFINER) and read by create-checkout (service role). Signed-in clients keep
-- read access to their own rows.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_promos FROM anon, authenticated;
REVOKE SELECT ON TABLE public.user_promos FROM anon;
