# Proposed destructive SQL

**Status:** Proposals only. Nothing in this directory is applied by `supabase db push`, `db reset` or CI.

Each file here drops or constrains something that already exists on a hosted project, so it needs Adam's explicit authorization for each environment. To apply one, check the target project first, read the file's header, and run it by hand in the SQL editor (or copy it into `supabase/migrations/` under a new timestamp if it should become history). Every statement is guarded with `IF EXISTS` or a catalog check, so running a file twice changes nothing the second time.
