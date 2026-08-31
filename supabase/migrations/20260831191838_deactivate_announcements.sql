-- Allow admins to end delivery without deleting the announcement or its
-- per-user dismissal history.

ALTER TABLE public.admin_announcements
  ADD COLUMN deactivated_at timestamptz;

DROP POLICY "Users read active targeted announcements"
  ON public.admin_announcements;

CREATE POLICY "Users read active targeted announcements"
  ON public.admin_announcements
  FOR SELECT
  TO authenticated
  USING (
    deactivated_at IS NULL
    AND starts_at <= now()
    AND (expires_at IS NULL OR expires_at > now())
    AND (
      target_type = 'all'
      OR (SELECT auth.uid()) = ANY(target_user_ids)
    )
  );
