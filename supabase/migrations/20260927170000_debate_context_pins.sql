-- Saved results a student pins so every request in that debate reads them.
-- A pin belongs to one of the owner's debates through the composite key, so
-- it cannot point a request at another user's or another debate's material.
-- The pinned item itself is checked again when a request loads it.

CREATE TABLE public.debate_context_pins (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  debate_id uuid NOT NULL,
  item_kind text NOT NULL
    CHECK (item_kind IN ('case', 'attack', 'brainstorm', 'factoids', 'chat', 'crossfire', 'sparring')),
  item_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, debate_id, item_kind, item_id),
  CONSTRAINT debate_context_pins_debate_fkey FOREIGN KEY (user_id, debate_id)
    REFERENCES public.debates (user_id, id) ON DELETE CASCADE
);

CREATE INDEX debate_context_pins_debate_idx ON public.debate_context_pins (debate_id);

ALTER TABLE public.debate_context_pins ENABLE ROW LEVEL SECURITY;
CREATE POLICY debate_context_pins_own ON public.debate_context_pins
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Default privileges would also grant anon access and UPDATE; a pin is only
-- ever added or removed, so grant exactly that.
REVOKE ALL ON TABLE public.debate_context_pins FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.debate_context_pins TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.debate_context_pins TO service_role;
