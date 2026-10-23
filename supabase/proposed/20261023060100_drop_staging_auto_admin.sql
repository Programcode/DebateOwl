-- DB-04 (proposed, destructive, STAGING ONLY: brifeyypjauyusmkptkx).
--
-- staging_auto_admin() is left over from a trigger that was dropped by hand
-- on staging. It does not exist on production or anywhere in
-- supabase/migrations, so it must never be added to migrations. Run this by
-- hand in the staging SQL editor. Check first that no trigger still uses it:
--
--   SELECT tgname, tgrelid::regclass FROM pg_trigger t
--   JOIN pg_proc p ON p.oid = t.tgfoid WHERE p.proname = 'staging_auto_admin';
--
-- That query must return no rows; without CASCADE the drop fails otherwise.

DROP FUNCTION IF EXISTS public.staging_auto_admin();
