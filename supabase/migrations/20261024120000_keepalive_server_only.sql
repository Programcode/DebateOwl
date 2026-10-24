-- Keepalive tables are server-only (security audit 2026-10-24, finding 4).
--
-- 20260820070000 recorded TO anon policies and GRANT ALL on keepalive_events
-- and keepalive_heartbeat, so the publishable key could insert unbounded
-- event rows, read them, and overwrite the heartbeat with no session.
--
-- The writer is the external monitor (Programcode/supabase-keepalive-monitor).
-- Its primary run, the VPS systemd timer, authenticates with the service
-- role, which keeps its grants and bypasses RLS, so it is unaffected. A
-- monitor configured with the publishable key gets 401/403 after this; give
-- it the service-role key for these projects.
--
-- Nothing is dropped except the anon policies; rows stay. To reopen, re-grant
-- and recreate the policies from 20260820070000.

REVOKE ALL ON TABLE public.keepalive_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.keepalive_heartbeat FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.keepalive_events_id_seq FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.keepalive_events TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.keepalive_heartbeat TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.keepalive_events_id_seq TO service_role;

-- With the grants gone these no longer match anyone; drop them so a later
-- blanket grant does not quietly reopen the tables.
DROP POLICY IF EXISTS "keepalive_events_anon_insert" ON public.keepalive_events;
DROP POLICY IF EXISTS "keepalive_events_anon_select" ON public.keepalive_events;
DROP POLICY IF EXISTS "keepalive_heartbeat_anon_insert" ON public.keepalive_heartbeat;
DROP POLICY IF EXISTS "keepalive_heartbeat_anon_select" ON public.keepalive_heartbeat;
DROP POLICY IF EXISTS "keepalive_heartbeat_anon_update" ON public.keepalive_heartbeat;

-- The monitor's keepalive_touch() RPC exists only in the hosted projects (its
-- bootstrap SQL creates it; no migration here does). Keep it service-role only.
DO $$
BEGIN
  IF to_regprocedure('public.keepalive_touch(text, jsonb)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.keepalive_touch(text, jsonb) FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.keepalive_touch(text, jsonb) TO service_role;
  END IF;
END;
$$;
