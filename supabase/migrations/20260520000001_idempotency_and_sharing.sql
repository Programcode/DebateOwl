-- Add durable idempotency and share-code uniqueness guarantees.

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.shared_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_code text NOT NULL UNIQUE,
  item_type text NOT NULL,
  item_data jsonb NOT NULL,
  title text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  view_count integer NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS shared_items_share_code_key
  ON public.shared_items(share_code);

ALTER TABLE public.shared_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shared_items'
      AND policyname = 'shared_items_select_public'
  ) THEN
    CREATE POLICY "shared_items_select_public" ON public.shared_items
      FOR SELECT USING (expires_at IS NULL OR expires_at > now());
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'shared_items'
      AND policyname = 'shared_items_insert_own_or_anonymous'
  ) THEN
    CREATE POLICY "shared_items_insert_own_or_anonymous" ON public.shared_items
      FOR INSERT WITH CHECK (created_by IS NULL OR created_by = (SELECT auth.uid()));
  END IF;
END;
$$;
