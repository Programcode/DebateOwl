-- Documents objects that already exist in production but were never captured
-- as migration files in this repo (applied out-of-band at some point between
-- 2026-06-03 and 2026-06-04, alongside a batch edge-function deploy from a
-- different local checkout). This file is a reconciliation, not a change:
-- every object below already exists in production. It is recorded as
-- "applied" via `supabase migration repair --status applied` rather than run
-- through `db push`, since re-running CREATE POLICY against existing
-- policies would error. Written from a live `supabase db dump --linked`
-- taken 2026-08-20.

CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Curated debate-evidence sources (wiki/NDCA/curated), admin-managed.
CREATE TABLE IF NOT EXISTS "public"."curated_sources" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "title" text NOT NULL,
    "content" text NOT NULL,
    "url" text,
    "source_type" text DEFAULT 'wiki'::text NOT NULL,
    "topic_tags" text[] DEFAULT '{}'::text[],
    "is_active" boolean DEFAULT true,
    "created_by" uuid REFERENCES auth.users(id),
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    CONSTRAINT "curated_sources_source_type_check" CHECK (source_type = ANY (ARRAY['wiki'::text, 'ndca'::text, 'curated'::text]))
);
CREATE INDEX IF NOT EXISTS "idx_curated_sources_active" ON "public"."curated_sources" USING btree (is_active) WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS "idx_curated_sources_source_type" ON "public"."curated_sources" USING btree (source_type) WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS "idx_curated_sources_topic_tags" ON "public"."curated_sources" USING gin (topic_tags);
ALTER TABLE "public"."curated_sources" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read active curated sources" ON "public"."curated_sources";
CREATE POLICY "Authenticated users can read active curated sources" ON "public"."curated_sources" FOR SELECT TO authenticated USING (is_active = true);
DROP POLICY IF EXISTS "Admins can insert curated sources" ON "public"."curated_sources";
CREATE POLICY "Admins can insert curated sources" ON "public"."curated_sources" FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = (SELECT auth.uid()) AND user_roles.role = 'admin'::text));
DROP POLICY IF EXISTS "Admins can update curated sources" ON "public"."curated_sources";
CREATE POLICY "Admins can update curated sources" ON "public"."curated_sources" FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = (SELECT auth.uid()) AND user_roles.role = 'admin'::text));
DROP POLICY IF EXISTS "Admins can delete curated sources" ON "public"."curated_sources";
CREATE POLICY "Admins can delete curated sources" ON "public"."curated_sources" FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_roles.user_id = (SELECT auth.uid()) AND user_roles.role = 'admin'::text));
GRANT ALL ON TABLE "public"."curated_sources" TO anon, authenticated, service_role;

-- Demo/trial access codes (email-gated sign-in without a full account) and
-- their attempt log for rate limiting. Backs the `demo-code-login` edge
-- function (source recovered separately via `supabase functions download`).
CREATE TABLE IF NOT EXISTS "public"."demo_access_codes" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "code_hash" text NOT NULL UNIQUE,
    "label" text NOT NULL,
    "email" text NOT NULL UNIQUE,
    "role" text DEFAULT 'user'::text NOT NULL,
    "expires_at" timestamptz,
    "max_uses" integer,
    "use_count" integer DEFAULT 0 NOT NULL,
    "created_by" uuid REFERENCES auth.users(id) ON DELETE SET NULL,
    "last_used_at" timestamptz,
    "disabled_at" timestamptz,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT "demo_access_codes_max_uses_check" CHECK ((max_uses IS NULL) OR (max_uses > 0)),
    CONSTRAINT "demo_access_codes_role_check" CHECK (role = ANY (ARRAY['user'::text, 'admin'::text, 'banned'::text])),
    CONSTRAINT "demo_access_codes_use_count_check" CHECK (use_count >= 0)
);
CREATE INDEX IF NOT EXISTS "demo_access_codes_created_at_idx" ON "public"."demo_access_codes" USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS "demo_access_codes_email_idx" ON "public"."demo_access_codes" USING btree (email);
ALTER TABLE "public"."demo_access_codes" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE "public"."demo_access_codes" TO service_role;

CREATE TABLE IF NOT EXISTS "public"."demo_access_attempts" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "code_hash" text,
    "ip_address" inet,
    "browser_fingerprint" text,
    "success" boolean DEFAULT false NOT NULL,
    "failure_reason" text,
    "created_at" timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "demo_access_attempts_recent_fingerprint_idx" ON "public"."demo_access_attempts" USING btree (browser_fingerprint, created_at DESC);
CREATE INDEX IF NOT EXISTS "demo_access_attempts_recent_ip_idx" ON "public"."demo_access_attempts" USING btree (ip_address, created_at DESC);
ALTER TABLE "public"."demo_access_attempts" ENABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE "public"."demo_access_attempts" TO service_role;

-- Per-user evidence library (claim/quote/citation cards), optionally linked
-- to an imported source.
CREATE TABLE IF NOT EXISTS "public"."evidence_cards" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    "source_id" uuid REFERENCES public.sources(id) ON DELETE SET NULL,
    "claim" text NOT NULL,
    "quote" text NOT NULL,
    "citation" text,
    "url" text,
    "tags" text[] DEFAULT '{}'::text[] NOT NULL,
    "strength" text DEFAULT 'medium'::text NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT "evidence_cards_strength_check" CHECK (strength = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text]))
);
CREATE INDEX IF NOT EXISTS "idx_evidence_cards_source_id" ON "public"."evidence_cards" USING btree (source_id);
CREATE INDEX IF NOT EXISTS "idx_evidence_cards_tags" ON "public"."evidence_cards" USING gin (tags);
CREATE INDEX IF NOT EXISTS "idx_evidence_cards_user_id" ON "public"."evidence_cards" USING btree (user_id);
CREATE OR REPLACE TRIGGER "evidence_cards_set_updated_at" BEFORE UPDATE ON "public"."evidence_cards" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();
ALTER TABLE "public"."evidence_cards" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "evidence_cards_own" ON "public"."evidence_cards";
CREATE POLICY "evidence_cards_own" ON "public"."evidence_cards" TO authenticated
  USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
GRANT ALL ON TABLE "public"."evidence_cards" TO anon, authenticated, service_role;

-- AI-judged sparring/practice-debate sessions.
CREATE TABLE IF NOT EXISTS "public"."sparring_sessions" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    "user_id" uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    "motion" text NOT NULL,
    "user_side" text NOT NULL,
    "persona" text NOT NULL,
    "turns" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "judge_comments" jsonb DEFAULT '[]'::jsonb NOT NULL,
    "final_evaluation" jsonb,
    "status" text DEFAULT 'in_progress'::text NOT NULL,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "updated_at" timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT "sparring_sessions_persona_check" CHECK (persona = ANY (ARRAY['aggressive'::text, 'analytical'::text, 'values'::text, 'coach'::text])),
    CONSTRAINT "sparring_sessions_status_check" CHECK (status = ANY (ARRAY['in_progress'::text, 'complete'::text])),
    CONSTRAINT "sparring_sessions_user_side_check" CHECK (user_side = ANY (ARRAY['pro'::text, 'con'::text]))
);
ALTER TABLE "public"."sparring_sessions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users own sessions" ON "public"."sparring_sessions";
CREATE POLICY "Users own sessions" ON "public"."sparring_sessions" USING ((SELECT auth.uid()) = user_id);
GRANT ALL ON TABLE "public"."sparring_sessions" TO anon, authenticated, service_role;

-- Uptime/keepalive pinger tables (external monitor + a single-row-per-source
-- heartbeat), unrelated to app features.
CREATE SEQUENCE IF NOT EXISTS "public"."keepalive_events_id_seq" START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
CREATE TABLE IF NOT EXISTS "public"."keepalive_events" (
    "id" bigint NOT NULL DEFAULT nextval('public.keepalive_events_id_seq'::regclass) PRIMARY KEY,
    "created_at" timestamptz DEFAULT now() NOT NULL,
    "source" text NOT NULL,
    "details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
ALTER SEQUENCE "public"."keepalive_events_id_seq" OWNED BY "public"."keepalive_events"."id";
ALTER TABLE "public"."keepalive_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "keepalive_events_anon_insert" ON "public"."keepalive_events";
CREATE POLICY "keepalive_events_anon_insert" ON "public"."keepalive_events" FOR INSERT TO anon WITH CHECK (source = 'external-keepalive-monitor'::text);
DROP POLICY IF EXISTS "keepalive_events_anon_select" ON "public"."keepalive_events";
CREATE POLICY "keepalive_events_anon_select" ON "public"."keepalive_events" FOR SELECT TO anon USING (source = 'external-keepalive-monitor'::text);
GRANT ALL ON TABLE "public"."keepalive_events" TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS "public"."keepalive_heartbeat" (
    "id" text NOT NULL PRIMARY KEY,
    "touched_at" timestamptz DEFAULT now() NOT NULL,
    "source" text,
    "details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
ALTER TABLE "public"."keepalive_heartbeat" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "keepalive_heartbeat_anon_insert" ON "public"."keepalive_heartbeat";
CREATE POLICY "keepalive_heartbeat_anon_insert" ON "public"."keepalive_heartbeat" FOR INSERT TO anon WITH CHECK (id = ANY (ARRAY['external-keepalive'::text, 'rpc-keepalive'::text]));
DROP POLICY IF EXISTS "keepalive_heartbeat_anon_select" ON "public"."keepalive_heartbeat";
CREATE POLICY "keepalive_heartbeat_anon_select" ON "public"."keepalive_heartbeat" FOR SELECT TO anon USING (id = ANY (ARRAY['external-keepalive'::text, 'rpc-keepalive'::text]));
DROP POLICY IF EXISTS "keepalive_heartbeat_anon_update" ON "public"."keepalive_heartbeat";
CREATE POLICY "keepalive_heartbeat_anon_update" ON "public"."keepalive_heartbeat" FOR UPDATE TO anon
  USING (id = ANY (ARRAY['external-keepalive'::text, 'rpc-keepalive'::text])) WITH CHECK (id = ANY (ARRAY['external-keepalive'::text, 'rpc-keepalive'::text]));
GRANT ALL ON TABLE "public"."keepalive_heartbeat" TO anon, authenticated, service_role;
