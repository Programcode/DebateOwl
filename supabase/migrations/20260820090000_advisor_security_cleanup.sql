-- Address actionable Supabase advisor warnings without changing the intended
-- public share capability. Trigger-only and internal helper functions should
-- never be callable through the Data API.

ALTER FUNCTION public.set_updated_at() SET search_path = public;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- increment_share_view's creating migration was removed from this chain in
-- commit aa3e592, so fresh databases never have the function, while databases
-- migrated before that commit still do. Guard the revoke so both histories
-- apply cleanly.
do $$
begin
  if to_regprocedure('public.increment_share_view(text)') is not null then
    REVOKE ALL ON FUNCTION public.increment_share_view(text) FROM PUBLIC, anon, authenticated;
  end if;
end $$;

REVOKE ALL ON FUNCTION public.require_admin() FROM PUBLIC, anon, authenticated;

-- Promo redemption is an authenticated user capability. Explicitly revoke
-- anon in addition to PUBLIC because existing role grants can otherwise leave
-- it callable through the exposed RPC endpoint.
REVOKE ALL ON FUNCTION public.redeem_promo_code_atomic(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_promo_code_atomic(text) TO authenticated;
