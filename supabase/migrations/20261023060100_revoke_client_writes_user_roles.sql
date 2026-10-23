-- SC-08: roles are granted by Edge Functions (service role) and
-- handle_new_user (SECURITY DEFINER). Clients only read their own row
-- (SettingsPage). Without write grants, a permissive policy left on a hosted
-- project (DB-03) can no longer let a user change their own role.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_roles FROM anon, authenticated;
REVOKE SELECT ON TABLE public.user_roles FROM anon;
