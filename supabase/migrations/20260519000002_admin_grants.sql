-- Audit log for admin-issued trial/pro gifts.

CREATE TABLE IF NOT EXISTS public.admin_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  grant_type text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_grants_target_user_id_idx
  ON public.admin_grants (target_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_grants_admin_user_id_idx
  ON public.admin_grants (admin_user_id, created_at DESC);

ALTER TABLE public.admin_grants ENABLE ROW LEVEL SECURITY;

-- Only admins can read the audit log; writes happen via the service role
-- in the admin edge function, so no insert/update/delete policies are needed.
CREATE POLICY "Admins can view admin_grants"
  ON public.admin_grants
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = (SELECT auth.uid())
        AND user_roles.role = 'admin'
    )
  );
