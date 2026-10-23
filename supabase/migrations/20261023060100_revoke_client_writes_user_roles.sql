-- SC-08: roles are written only by the admin and demo-code-login Edge
-- Functions (service role). Clients only read their own row
-- (SettingsPage). Without write grants, a permissive policy left on a hosted
-- project (DB-03) can no longer let a user change their own role.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.user_roles FROM anon, authenticated;
REVOKE SELECT ON TABLE public.user_roles FROM anon;
