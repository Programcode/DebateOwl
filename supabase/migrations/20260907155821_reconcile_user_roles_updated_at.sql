-- Production's legacy user_roles table predates the updated_at column used by
-- current admin and demo-code upserts. Newer environments already have it.
ALTER TABLE public.user_roles
ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
