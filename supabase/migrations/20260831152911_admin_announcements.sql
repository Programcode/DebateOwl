-- Admin-created announcements with per-user, database-backed dismissal state.

CREATE TABLE public.admin_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  body text NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 5000),
  target_type text NOT NULL CHECK (target_type IN ('all', 'users')),
  target_user_ids uuid[],
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_announcements_target_shape CHECK (
    (target_type = 'all' AND target_user_ids IS NULL)
    OR
    (target_type = 'users' AND target_user_ids IS NOT NULL AND cardinality(target_user_ids) > 0)
  ),
  CONSTRAINT admin_announcements_valid_window CHECK (
    expires_at IS NULL OR expires_at > starts_at
  )
);

CREATE TABLE public.user_announcement_dismissals (
  announcement_id uuid NOT NULL REFERENCES public.admin_announcements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, user_id)
);

CREATE INDEX admin_announcements_active_window_idx
  ON public.admin_announcements (starts_at, expires_at);
CREATE INDEX admin_announcements_target_users_idx
  ON public.admin_announcements USING gin (target_user_ids)
  WHERE target_type = 'users';
CREATE INDEX user_announcement_dismissals_user_idx
  ON public.user_announcement_dismissals (user_id, dismissed_at DESC);

ALTER TABLE public.admin_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_announcement_dismissals ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_announcements FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.user_announcement_dismissals FROM PUBLIC, anon, authenticated;

GRANT SELECT (id, title, body, starts_at, expires_at, created_at)
  ON TABLE public.admin_announcements TO authenticated;
GRANT SELECT, INSERT ON TABLE public.user_announcement_dismissals TO authenticated;
GRANT ALL ON TABLE public.admin_announcements TO service_role;
GRANT ALL ON TABLE public.user_announcement_dismissals TO service_role;
GRANT SELECT ON TABLE public.user_roles TO service_role;

CREATE POLICY "Users read active targeted announcements"
  ON public.admin_announcements
  FOR SELECT
  TO authenticated
  USING (
    starts_at <= now()
    AND (expires_at IS NULL OR expires_at > now())
    AND (
      target_type = 'all'
      OR (SELECT auth.uid()) = ANY(target_user_ids)
    )
  );

CREATE POLICY "Users read their announcement dismissals"
  ON public.user_announcement_dismissals
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid()));

CREATE POLICY "Users dismiss visible announcements"
  ON public.user_announcement_dismissals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.admin_announcements AS announcement
      WHERE announcement.id = announcement_id
    )
  );
