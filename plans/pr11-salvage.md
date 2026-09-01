# PR #11 salvage list

PR #11 (`feature/sparring-verification-retention-loop`) was closed on 2026-08-31 as
superseded by #12 (Crossfire) and #13 (Sparring). The branch is retained, not deleted.

Four pieces exist only on that branch. Each should return as its own small PR.

## 1. Scope daily usage counters (highest value)

`supabase/migrations/20260827001000_scope_daily_usage_counters.sql`

Adds a `quota_key` column to `daily_usage_counters` and repoints the primary key to
`(user_id, usage_date, quota_key)`. `consume_daily_quota` gains a `p_quota_key`
parameter defaulting to `'ai'`, so existing callers are unaffected while
`import-source` can pass `'import_source'`.

Without it, importing a URL burns a user's normal AI allowance. Ship with the
matching `import-source` caller change.

## 2. Import-source SSRF rework

`supabase/functions/import-source/url-validation.ts`

The importer sends the validated URL as data to a fixed Exa contents endpoint
rather than connecting to the user-supplied host, which makes
`validateResolvedPublicHost` (DNS-rebinding recheck) unnecessary. Literal
private-address rejection stays as product policy.

Review carefully: this deletes a security control on the argument that the
threat model changed. Confirm the current `import-source/index.ts` on `main`
really never fetches the user host directly before merging.

## 3. Output-language privilege migration

`supabase/migrations/20260827000000_user_settings_output_language_privilege.sql`

Small, source-only, never applied.

## 4. Security review document

`security/reviews/2026-08-27-post-remediation-and-sparring.md`

Maps the August findings to the controls that answer them. Doc-only, no code risk.

## Recovering a file

Do not restore directly over the current checkout. For each item:

1. Create its own isolated T3 Code worktree and feature branch from current `origin/main`.
2. Verify `pwd`, `git branch --show-current`, `git status --short --untracked-files=all`, and `git worktree list` before editing.
3. Read the branch version with `git show origin/feature/sparring-verification-retention-loop:<path>` and compare it with current `main` before applying a reviewed patch. Never redirect it over an existing file.
4. Keep the four recoveries as four independent PRs. Do not combine migrations, function changes, privileges, and security documentation into one review.

## Verification by recovery

- Usage counters: add migration-level assertions, update the importer caller tests, run the relevant Deno tests, and prove AI and import quotas remain independent.
- Import-source SSRF rework: run URL-validation, resource-limit, and security-hardening tests; prove no code path connects to the submitted host before removing the DNS-rebinding check.
- Output-language privilege: add a migration assertion proving authenticated users can update only the intended column and cannot widen other `user_settings` privileges.
- Security review document: verify every claimed control against current code and migrations; do not copy historical claims that no longer match `main`.

Every code PR uses Node 22.x, npm, and the committed `package-lock.json`, then runs focused tests, `npm run verify`, applicable Deno checks/tests, and isolated browser proof with `CI=1` and an explicit free port. Inspect the final diff before committing.

## Authorization and completion

The execution prompt authorizes branches, commits, pushes, PRs, review replies, merge, and cleanup through the repository's full babysit workflow. It does not authorize destructive migrations, secrets, billing changes, or unrelated deployment work. Apply only required non-destructive Supabase follow-through after merge under the shared post-merge authorization, one scoped PR at a time, with baseline, rollback, and live verification.
