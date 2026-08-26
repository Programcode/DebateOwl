# Post-remediation source validation — 2026-08-27

## Scope and limitations

This is a source-backed validation record for the repository state on `feature/sparring-verification-retention-loop`. It is **not** a new Codex Security scanner result and it is **not** a live penetration test of staging or production.

The baseline is the committed 2026-08-19 Codex Security scan (`security/scans/2026-08-19-codex-security-06d93a47`), which reported 11 findings: 2 high, 8 medium, and 1 low.

The user explicitly prohibited applying migrations, deploying Edge Functions, setting Supabase secrets, or otherwise mutating staging/production Supabase during this branch. Therefore:

- database-policy conclusions below are based on migration/function/client source;
- branch migrations are **unapplied**;
- branch Edge Function changes are **undeployed**;
- no claim is made that staging or production currently contains branch-only backend fixes;
- the opt-in stateful staging E2E suite was prepared but not executed.

## Original August findings

| # | Original finding | Source status | Evidence / note |
|---|---|---|---|
| 1 | Users can self-assign paid entitlements and restore expired trials | **Remediated in existing source** | `20260819000000_security_hardening.sql` revokes authenticated INSERT/DELETE and unrestricted UPDATE on `user_settings`, grants only preference-column updates, and AI entitlement readers fail closed for a missing settings row. |
| 2 | Users can delete or forge the usage ledger that enforces AI quotas | **Remediated in existing source** | The hardening migration removes client writes to `ai_requests` and introduces the service-role-only atomic `consume_daily_quota` RPC. |
| 3 | Anonymous users can enumerate all active shared items | **Remediated in existing source** | Public table SELECT is removed; `get_shared_item(p_share_code)` exposes only a possessed, non-expired capability and updates its view count atomically. `SharedPage` calls this RPC. |
| 4 | Anonymous callers can create arbitrary shared items | **Remediated in existing source** | Direct anon/authenticated access to `shared_items` is revoked; the `share` Edge Function requires a valid user before inserting and generates share codes server-side. |
| 5 | SECURITY DEFINER analytics functions are exposed too broadly | **Remediated in existing source** | Sensitive analytics RPCs call `require_admin()`. `20260820090000_advisor_security_cleanup.sql` revokes public/anon/authenticated execution from internal SECURITY DEFINER helpers as appropriate. |
| 6 | Promo redemption accepts a caller-selected beneficiary | **Remediated in existing source** | The UUID-taking RPC is dropped. `redeem_promo_code_atomic(text)` derives `v_user_id := auth.uid()`, and the Edge Function invokes it through the caller-authenticated client. |
| 7 | Source importer can be DNS-rebound into private network targets | **Remediated on this branch, not deployed** | `import-source` no longer performs a network request to the user-controlled hostname. The validated URL is sent as data to the fixed `https://api.exa.ai/contents` egress endpoint. Tests assert the importer has exactly one executable fetch destination. |
| 8 | Citation verification performs blind requests to model-provided URLs | **Remediated in existing source** | `_shared/research.ts::verifyUrl` deliberately performs no network request to model-provided citation URLs; unsupported verification remains explicitly false. |
| 9 | Source importer can consume an unbounded/slow response body after headers | **Remediated on this branch, not deployed** | `readBoundedText` enforces both a 1 MB byte cap and a body-read deadline, including streamed bodies whose headers already arrived. The fixed Exa egress response is consumed through this helper. |
| 10 | Concurrent requests can race past the daily quota | **Remediated in existing source; correctness strengthened on this branch** | Existing source uses service-role-only atomic UPSERT reservation. This branch additionally scopes counters by `quota_key` so source imports cannot consume the independently configured AI allowance. The scoping migration is unapplied. |
| 11 | Unknown model IDs can bypass Pro-model gating / provider assumptions | **Remediated in existing source** | `MODEL_PROVIDERS` is a positive allowlist and `providerForModel` rejects unsupported model/provider combinations before provider work. |

## Branch-specific security findings and fixes

### 1. Cross-account exposure of locally persisted Sparring transcripts

**Finding:** Sparring sessions were persisted in browser storage but initially were not cleared on sign-out or account changes. A second user on the same browser profile could inherit the previous account's local practice transcripts.

**Fix:** `AuthProvider` now clears `useSparringStore` when:

- the session becomes unauthenticated;
- the authenticated user ID changes;
- explicit sign-out runs.

`src/test/stores/sparring-store.test.ts` covers the clearing operation.

### 2. Untrusted persisted Sparring state

**Finding:** browser-persisted session data is user-controlled and could contain malformed shapes.

**Fix:** the persisted session list is re-parsed through `SparringSessionSchema`; malformed entries are dropped and `activeSessionId` is retained only when it references a validated session.

### 3. Dishonest source-grounding control

**Finding:** an early Sparring UI revision exposed a per-round “Use active sources” switch while the shared AI client always attached active Source Library items. Turning the switch off would not have changed the request.

**Fix:** the false OFF control was removed. Sparring now states that active Source Library items are factual grounding and links users to the Library to manage that selection.

### 4. Preference persistence conflicted with the entitlement hardening model

**Finding:** the browser settings store still used `upsert`, which requires INSERT privilege even on conflict, while the security hardening migration intentionally revoked authenticated INSERT on `user_settings`. In addition, `output_language` was omitted from the allowed preference-column UPDATE grant.

**Fix in branch source:** 

- settings persistence now performs UPDATE on the already-provisioned row, scoped to the current user;
- `20260827000000_user_settings_output_language_privilege.sql` grants UPDATE on only `output_language` to authenticated users.

**Deployment status:** the migration is unapplied, so deployed environments do not gain this branch-only privilege until separately authorized.

### 5. Import quota and AI quota shared one counter namespace

**Finding:** the atomic counter removed the race condition, but `daily_usage_counters` had only `(user_id, usage_date)`. Import requests and normal AI requests have different configured limits yet incremented the same row, causing one workload to consume the other's allowance.

**Fix in branch source:** `20260827001000_scope_daily_usage_counters.sql` adds `quota_key`, changes the primary key to `(user_id, usage_date, quota_key)`, gives existing two-argument callers a default `ai` namespace, and makes the importer pass `import_source`.

**Deployment status:** unapplied.

## Search / provenance trust-boundary changes reviewed

The branch closes the previously deferred Search Quality work:

- Exa government/public-sector restrictions are request `includeDomains` fields rather than `site:` query text.
- Academic and news preferences use Exa category fields.
- Filtered zero-result searches retry unfiltered to avoid silent recall collapse.
- Factoids preserves consulted-source provenance separately from verified evidence.
- Weak consulted sources remain visible as fallback context but cannot become verified Factoids evidence.
- A handler-boundary test imports the actual `supabase/functions/ai/index.ts` entrypoint under loopback shims and mocks Supabase/Exa/model network boundaries.

The source importer is also aligned to a fixed Exa egress boundary and bounded provider-response consumption.

## Verification artifacts added

Security-relevant regression coverage includes:

- `src/test/security-hardening.test.ts`
- `src/test/import-source-egress.test.ts`
- `supabase/functions/import-source/resource-limits.test.ts`
- `supabase/functions/import-source/url-validation.test.ts`
- `supabase/functions/_shared/research-exa-filters.test.ts`
- `supabase/functions/ai/source-quality.test.ts`
- `supabase/functions/ai/handler-research.test.ts`
- `src/test/stores/sparring-store.test.ts`
- `src/test/ai/factoids-provenance.test.ts`
- deterministic Playwright Sparring flow/recovery tests.

## Remaining uncertainty before deployment

The branch should not be described as production-remediated until the following occur under explicit authorization:

1. run the full repository verification gate successfully;
2. review/apply the branch migrations in a controlled environment;
3. deploy the changed Edge Functions;
4. run the stateful authenticated staging suite;
5. validate effective RLS/GRANT/RPC privileges against the actual remote database;
6. run a fresh official security scan against the deployment candidate.

Until then, branch-only backend remediations are repository source, not active Supabase controls.
