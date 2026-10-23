-- DB-03 (proposed, destructive): drop policies that no migration created.
--
-- The QA run on 22 Oct 2026 found policies on production that are not in
-- staging or in supabase/migrations, including duplicate permissive ones on
-- shared_items, user_roles and ai_requests, and two auth_rls_initplan
-- warnings on shared_items. The repo intends exactly these policies:
--
--   shared_items  none. Clients have no table grants; reads go through
--                 get_shared_item(code) and writes through the share Edge
--                 Function (20260819000000_security_hardening.sql).
--   user_roles    "user_roles_select_own" (SELECT own row).
--   ai_requests   "ai_requests_select_own" (SELECT own rows).
--
-- Every other policy on these tables is inert: the clients' table grants
-- (and, from 20261023060100, no write grant on user_roles) already block
-- what those policies would allow. Dropping them removes the advisor warnings
-- and the confusion. The policy names were in the QA snapshot, which is not
-- in the repo, so this drops by exclusion and prints each definition first.
-- Run on production only after checking the NOTICE output in a dry run
-- (BEGIN; ...; ROLLBACK;).

DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT pol.polname, cls.relname,
      pg_get_expr(pol.polqual, pol.polrelid) AS using_expr,
      pg_get_expr(pol.polwithcheck, pol.polrelid) AS check_expr
    FROM pg_policy AS pol
    JOIN pg_class AS cls ON cls.oid = pol.polrelid
    WHERE cls.relnamespace = 'public'::regnamespace
      AND (
        cls.relname = 'shared_items'
        OR (cls.relname = 'user_roles' AND pol.polname <> 'user_roles_select_own')
        OR (cls.relname = 'ai_requests' AND pol.polname <> 'ai_requests_select_own')
      )
  LOOP
    RAISE NOTICE 'dropping policy % on %: USING (%) WITH CHECK (%)',
      p.polname, p.relname, p.using_expr, p.check_expr;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.polname, p.relname);
  END LOOP;
END;
$$;
