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
-- Write policies on these tables are inert: clients hold no INSERT, UPDATE
-- or DELETE grant on them (user_roles from 20261023060100), and no grant at
-- all on shared_items. SELECT policies are not: signed-in users keep SELECT
-- on user_roles and ai_requests, so a legacy permissive SELECT policy there
-- is live until this runs (anon lost SELECT in 20261023060100 and
-- 20261023060800). Read the NOTICE lines with that in mind.
--
-- The policy names were in the QA snapshot, which is not in the repo, so
-- this drops by exclusion and prints each definition first. It stops before
-- dropping anything if a policy it means to keep is missing, since dropping
-- the rest would then leave signed-in users unable to read their own role
-- (SettingsPage and the curated_sources admin policies depend on it). Do a
-- dry run first (BEGIN; ...; ROLLBACK;).

DO $$
DECLARE
  p record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'user_roles' AND policyname = 'user_roles_select_own')
    OR NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'ai_requests' AND policyname = 'ai_requests_select_own') THEN
    RAISE EXCEPTION 'user_roles_select_own or ai_requests_select_own is missing; recreate it before dropping the others';
  END IF;

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
