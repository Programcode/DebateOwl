-- DB-05: cover foreign keys that had no index starting with their columns.
-- Without one, deleting a user (auth.users cascades and SET NULLs), a source,
-- a promo code, a share or a workspace document scans the whole child table.
-- Skipped: global_prompts, promo_codes and curated_sources created_by, which
-- reference admin authors on tables with a handful of rows.
--
-- Plain CREATE INDEX: the CLI runs each migration file in a transaction, so
-- CONCURRENTLY is not available. Each build briefly blocks writes to its
-- table; every table here is small or, for the hidden workspace feature,
-- empty in production.

-- squawk-ignore-file require-concurrent-index-creation

CREATE INDEX IF NOT EXISTS source_files_source_id_idx ON public.source_files (source_id);
CREATE INDEX IF NOT EXISTS source_files_user_id_idx ON public.source_files (user_id);
CREATE INDEX IF NOT EXISTS api_keys_user_id_idx ON public.api_keys (user_id);
CREATE INDEX IF NOT EXISTS user_promos_promo_code_id_idx ON public.user_promos (promo_code_id);
CREATE INDEX IF NOT EXISTS shared_items_created_by_idx ON public.shared_items (created_by);
CREATE INDEX IF NOT EXISTS demo_access_codes_created_by_idx ON public.demo_access_codes (created_by);

CREATE INDEX IF NOT EXISTS workspace_audit_events_version_id_idx ON public.workspace_audit_events (version_id);
CREATE INDEX IF NOT EXISTS workspace_document_state_document_idx ON private.workspace_document_state (workspace_id, document_id);
CREATE INDEX IF NOT EXISTS workspace_document_updates_author_id_idx ON private.workspace_document_updates (author_id);
CREATE INDEX IF NOT EXISTS workspace_document_updates_document_idx ON private.workspace_document_updates (workspace_id, document_id);
CREATE INDEX IF NOT EXISTS workspace_versions_created_by_idx ON public.workspace_versions (created_by);
CREATE INDEX IF NOT EXISTS workspace_proposals_author_id_idx ON public.workspace_proposals (author_id);
CREATE INDEX IF NOT EXISTS workspace_comments_author_id_idx ON public.workspace_comments (author_id);
CREATE INDEX IF NOT EXISTS workspace_comments_resolved_by_idx ON public.workspace_comments (resolved_by);
CREATE INDEX IF NOT EXISTS workspace_comment_replies_author_id_idx ON public.workspace_comment_replies (author_id);
CREATE INDEX IF NOT EXISTS workspace_comment_replies_workspace_id_idx ON public.workspace_comment_replies (workspace_id);
CREATE INDEX IF NOT EXISTS workspace_notifications_actor_id_idx ON public.workspace_notifications (actor_id);
CREATE INDEX IF NOT EXISTS workspace_notifications_document_idx ON public.workspace_notifications (workspace_id, document_id);
CREATE INDEX IF NOT EXISTS workspace_sources_created_by_idx ON public.workspace_sources (created_by);
CREATE INDEX IF NOT EXISTS workspace_threads_created_by_idx ON public.workspace_threads (created_by);
CREATE INDEX IF NOT EXISTS workspace_thread_messages_author_id_idx ON public.workspace_thread_messages (author_id);
CREATE INDEX IF NOT EXISTS workspace_thread_messages_thread_idx ON public.workspace_thread_messages (workspace_id, thread_id);
CREATE INDEX IF NOT EXISTS workspace_artifacts_document_idx ON public.workspace_artifacts (workspace_id, document_id);
