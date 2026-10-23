-- SC-08: admin grants are written only by the admin Edge Function (service
-- role). Signed-in clients keep the admin-only read policy.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.admin_grants FROM anon, authenticated;
REVOKE SELECT ON TABLE public.admin_grants FROM anon;
