# Pre-ship security pass

**Status:** In progress. The fixes shipped on 2026-10-17: #148 merged as `f16e8a4`, migration `20261016120000` applied and all 14 Edge Functions redeployed on staging and production. The decisions under [Needs Adam](#needs-adam) are still open.

The checklist follows the shape of a 25-item pre-ship security pass run by parallel subagents. The source post could not be fetched (x.com returned 402), so the items below are a standard pre-ship list adapted to DebateLab's stack: Supabase Postgres and Auth, Deno Edge Functions, a Vite client on Vercel, OpenRouter, Exa, Stripe, ElevenLabs and Google export.

## Rules for every auditor

- Local only. Never run `supabase link`, `--linked`, `--project-ref`, `db push`, `functions deploy` or `secrets`, and never write to staging or production. Read-only `curl -sI` against `https://debate.pi-stack.org` is allowed.
- Use your own Docker-free local Supabase: `scripts/agent-stack.sh --name <unique> start`, then its `psql`, `test`, `advisors`, `reset` and `destroy`. Do not run `npm run test:db` against it (its concurrency scripts assume default ports) and do not use `./.superset/db-gate.sh` (it shares one lock and one Docker stack).
- No real AI, Exa, Stripe or ElevenLabs calls. Use `npm run test:edge` and the fake provider in `e2e/full-stack/fake-openrouter.mjs`.
- Report only. Do not change source. The one exception: for each database finding, write a pgTAP snippet that fails today and paste it into your report.
- A Pass needs evidence too: a file and line, or a command and its output.
- Hosted settings you cannot read (Supabase Auth dashboard, Google OAuth client, Vercel env, Stripe endpoint config, network restrictions) get the verdict "Needs Adam" with exactly what to check.
- Earlier reviews already list some issues: `plans/2026-10-08-ultracode-review-report.md` (sections 3, 9, 10, 11, 16) and `plans/2026-10-01-next-15.md` (items 1, 2, 4). Check whether each is still open at this head and say so rather than re-discovering it.

Severity: Critical (exploitable now, data or money at risk), High (exploitable with modest effort or a precondition), Medium (defence in depth missing where it matters), Low (hardening), Info.

Each item is reported as: number, verdict (Pass / Finding / Needs Adam), severity, evidence, reproduction, proposed fix, and whether the fix is clear or needs Adam's decision.

## The 25 items

### A. Database (Postgres, RLS, Auth config)

1. RLS is enabled on every table in every API-exposed schema, and no table, view or materialized view in `public` is reachable without it.
2. Policy correctness: every INSERT and UPDATE policy has a `WITH CHECK`; ownership columns cannot be reassigned; two real users cannot read or write each other's rows, and one user's debates do not leak into another debate. Prove with real queries as two signed-in users.
3. Grants: `anon` and `authenticated` privileges on tables, sequences, functions and schemas (including `private`), and default privileges for future objects.
4. Functions and views: every `SECURITY DEFINER` function sets `search_path`, checks the caller inside, and has `EXECUTE` revoked from roles that do not need it; views use `security_invoker`; Realtime publication membership exposes nothing private.
5. Storage buckets and `storage.objects` policies (public flags, path ownership, size and MIME limits), or confirmation that no bucket exists.
6. Auth configuration in `supabase/config.toml`: OTP length and expiry, email rate limits, sign-up, confirmations, `site_url` and `additional_redirect_urls`, minimum password rules, refresh token rotation. Hosted values are Needs Adam.
7. Entitlement integrity: a user cannot raise their own plan, role, quota, usage counters, promo redemptions or admin status through the API.
8. Personal data: which tables hold PII, whether account deletion removes or anonymises all of it, and retention of logs and audit rows.

### B. Edge Functions and server APIs

9. Authentication: every function has `verify_jwt = false`, so each one must validate the bearer token itself on every path before any work. Admin checks must come from the database or `app_metadata`, never `user_metadata`.
10. Authorization and IDOR: object IDs from the request (debates, shares, workspaces, invites, sources) are checked against the caller; service-role clients are used only after that check.
11. Input validation at the trust boundary: Zod or equivalent on every body, size limits on bodies and fields, enum allowlists for models, features and languages.
12. Rate limiting and brute force: demo-code login, promo redemption, invites, share links, account endpoints.
13. AI cost and abuse limits: daily quotas, max tokens, model allowlist, streaming accounting that charges once, prompt-injection impact on tools, and what an anonymous or free user can spend.
14. SSRF and outbound fetches: `import-source` and research fetches block private and link-local ranges, follow redirects safely, cap size and time, and resist DNS rebinding.
15. Webhooks: Stripe signature verification with tolerance, idempotency through `webhook_events`, and no trust in unsigned fields.
16. Secrets handling: keys only from env, never logged or returned, service-role key never sent to the client, Google tokens handled safely in `export-gdoc`.
17. Error leakage and server-side logging: responses do not leak stack traces, SQL or provider errors; logs do not record prompts, tokens, emails or keys beyond what is needed.
18. Edge Function CORS (`supabase/functions/_shared/`): exact origin allowlist, no reflected arbitrary origins with credentials, correct preflight handling.

### C. Frontend, hosting and supply chain

19. Secrets in the built client bundle: scan `dist/` after `npm run build` for `service_role`, `sk_`, `sk-or-`, Exa, Stripe, ElevenLabs or Google secrets. The Supabase URL and anon key are public by design.
20. Secrets in the repo and git history: `.env*` files, fixtures, docs and every commit (`gitleaks` or `trufflehog` if installed, otherwise `git log -p` with patterns).
21. Security headers on Vercel (`vercel.json`) and live: CSP, HSTS, frame options, referrer and permissions policy, and whether source maps are served in production.
22. Client auth and redirects: session storage, sign-out clearing state, open redirects through `next`/`redirect` parameters, `emailRedirectTo` and OAuth `redirectTo` values, Google OAuth redirect URIs (Needs Adam for the console), share-link exposure.
23. XSS: `dangerouslySetInnerHTML`, markdown rendering of model and imported content, `href` schemes such as `javascript:`, SVG and HTML in user content.
24. Dependencies: `npm audit` for the root and workspaces, Deno import pinning in `supabase/functions/deno.json`, lockfile integrity, abandoned or typo-squat packages.
25. CI and third-party scripts: GitHub Actions `permissions:`, pinned action SHAs, `pull_request_target`, secret exposure in logs; what Jam, PostHog and Sentry capture (session replay of inputs, tokens in URLs, PII).

## Findings

Three Opus auditors each worked in their own worktree, and each used its own Docker-free local Supabase (`scripts/agent-stack.sh`). Auditor A signed up two users through local Auth and probed every user-owned table through PostgREST with their real tokens. Auditor B ran every Edge Function under `functions serve`, with the fake model provider and a made-up Stripe signing secret. Auditor C built the bundle, compared `vercel.json` with the live headers using read-only requests, scanned all 2,998 commits with `gitleaks`, and ran `npm audit`. Nobody touched staging or production. The full reports were not committed; this section keeps what matters from them.

Verdicts: **Pass** means checked with evidence. **Fixed** means fixed on this branch with a test that failed before the fix. **Open** means a real finding that is not fixed here. **Needs Adam** means a hosted setting or a product decision.

### Summary

- **High, fixed:** promo brute force (7, 12), promo redemption lowering access (7), the Stripe webhook replay that restores Pro after cancellation (15), and remote images in model Markdown leaking student work (23).
- **Medium, fixed:**
  - the anon key could read operator system prompts (3);
  - unknown AI `feature` values cost quota and a Jev call (11);
  - the demo-code limiter failed open when there was no client IP (12);
  - raw provider, Stripe, Google and Postgres errors went to clients (17);
  - the CSP was wider than the app needs (21);
  - tool drafts survived sign-out (22).
- **Medium, open:**
  - failed AI calls keep their quota slot (13);
  - demo accounts get 999 Pro requests a day, with no cost cap (13);
  - webhooks wipe promo grants and downgrade on the first failed payment (15);
  - DNS rebinding in `import-source` (14);
  - a full Jina key survives in two local git tags (20);
  - Jam loads for every visitor (25).
- **Pass:** two-user isolation on every user-owned table, admin checks that come only from the database, no IDOR in any function, SSRF blocking (19 address forms and redirects), Stripe signature checks, no secrets in the bundle or the current tree, no script XSS, PKCE auth with no open redirect, and CI hardening.

### Fixed on this branch

- `supabase/migrations/20261016120000_security_preship_hardening.sql`, with pgTAP tests `promo_redemption_test.sql`, `client_grants_test.sql` and `account_deletion_demo_code_test.sql` (13 of their 16 assertions failed before the migration):
  - Promo redemption locks a user out after 5 failures in 15 minutes, serialised per user. Unknown, expired and exhausted codes get one answer. A promo never lowers a tier, end date or daily limit.
  - Client roles lose TRUNCATE, TRIGGER, REFERENCES and MAINTAIN on public tables. `global_prompts` and global `rate_limits` rows are server-only. `get_daily_usage`, `get_usage_by_user` and `get_active_rate_limits` are service-role only. Future tables and sequences grant clients nothing by default; functions keep Postgres's global `PUBLIC EXECUTE`, so each still needs its own revoke, which `client_grants_test.sql` enforces.
  - Account deletion removes the user's demo code and clears the IP addresses and fingerprints logged against it.
- Edge Functions, each change with a Deno test (`npm run test:edge`: 350 passed):
  - The Stripe webhook claims an event before running handlers and re-reads subscription state from Stripe, so neither a replay nor an out-of-order event can restore Pro after cancellation. `claim_webhook_event` and `complete_webhook_event` decide on the database clock, using the new `webhook_events.completed_at` column. A delivery that finds another one still processing gets a 409, so Stripe keeps retrying. Only an event seen completed counts as a duplicate. A claim abandoned for 10 minutes is taken over. `payment_succeeded` copies the status from Stripe instead of writing `active`. Covered by `webhook_claims_test.sql` and the billing journey, and checked against the private stack: first delivery, duplicate, in-flight claim and abandoned claim. Codex review rounds 1 and 2 found the in-flight, clock and released-claim cases.
  - `ai` authenticates before reading the body and rejects any feature outside the seven the client sends.
  - Errors to clients are fixed messages; provider, Stripe, Google and Postgres text stays in server logs.
  - `redeem-promo` validates its input and stops logging attempted codes.
  - The demo-code limiter counts callers with no IP or fingerprint together and ignores its own refusals.
  - `import-source` validates the URL before reserving quota.
  - `export-gdoc` no longer accepts LAN origins, and every CORS response sends `Vary: Origin`.
  - The prompt blocklist and research logs record lengths, not text.
  - `supabase-js` is pinned to 2.114.0 in all 13 imports.
- Client and hosting:
  - `src/components/ui/markdown.tsx` renders images as links.
  - `resetLocalData` clears tool drafts.
  - `vercel.json` has a narrower CSP, `form-action 'self'` and `X-Frame-Options: DENY`.
  - `scripts/check-build-boundaries.mjs` fails the build on source maps, server-secret patterns or a non-anon JWT in `dist/`.
  - Auth logs run only in development builds.
  - Sentry redacts share codes.
  - `tailwindcss-animate` moved to devDependencies, which clears every high from `npm audit --omit=dev`.

### A. Database

1. **RLS on every exposed table: Pass.** All 53 public tables have RLS on. `private` has no client USAGE. PostgREST exposes only `public` and `graphql_public`. The 13 tables with RLS and no policy are deny-all by design.
2. **Policy correctness: Pass, one Low open.**
   - Isolation: Alice's token against Bob's rows on 22 tables returned empty reads, refused writes and unchanged rows.
   - Owners can't be reassigned, and composite foreign keys stop cross-debate attachment.
   - *Open, Low:* the legacy `evidence_cards` and `source_files` accept another user's `source_id`. No code uses either table. Drop them once production row counts are confirmed (Needs Adam).
3. **Grants: Fixed (Medium).**
   - The anon key read `global_prompts`, the operator layer of the live system prompt, and global `rate_limits` rows.
   - Client roles held TRUNCATE, which bypasses RLS.
   - Default privileges gave every new object to clients.
   - *Open, Low:* anon can insert unbounded `keepalive_events` rows (a 1 MB row was accepted) and overwrite the heartbeat. An external monitor uses this path, so it needs Adam: replace it with a fixed-shape RPC.
4. **SECURITY DEFINER functions, views, Realtime: Fixed (Low).**
   - All 49 definer functions set `search_path` (37 to `''`).
   - Three admin reporting RPCs were executable by PUBLIC and anon, and only the `require_admin()` check inside them held. Fixed.
   - There are no views. The Realtime publication is empty.
5. **Storage: Pass locally, Needs Adam hosted.** No bucket and no storage policy in migrations, and the app never calls Storage. Confirm production has no dashboard-created bucket.
6. **Auth configuration: Needs Adam.** `config.toml` overrides only OTP length, `max_frequency = "1s"` and the email template. Password sign-up stays open at the API with a 6-character minimum, though the UI only offers OTP and Google. Six-digit OTPs valid for an hour allow about 360 guesses per IP-hour. See [Needs Adam](#needs-adam).
7. **Entitlement integrity: Fixed (High).**
   - Direct writes to tier, limit, role, quota, usage and promo rows were all refused.
   - The promo RPC could be brute-forced: 40 guesses took 1.3 s, and then the real code worked.
   - Redeeming a promo overwrote access: lifetime Pro dropped to trial, and a limit of 50 dropped to 15.
8. **Personal data: Fixed (Low); retention Needs Adam.**
   - Account deletion left the demo code's email and label, plus the attempt IPs and fingerprints. Fixed.
   - No purge exists for `demo_access_attempts`, `ai_requests`, expired shares or `auth.audit_log_entries`.

### B. Edge Functions

9. **Authentication: Pass.**
   - 13 functions rejected eight bad-token variants each: none, empty, garbage, the anon key, the service-role key, `alg:none`, a wrong signature and an expired token.
   - Revoked and deleted users were rejected.
   - Admin comes only from `user_roles`: setting `user_metadata` or `app_metadata` to admin still got 403.
   - *Fixed, Low:* `ai` parsed and logged the body before authenticating.
   - *Open, Low:* `share` has no `[functions.share]` block in `config.toml`, so its hosted `verify_jwt` is whatever was last deployed (Needs Adam).
10. **Authorization and IDOR: Pass.** Another user's debate, source or case IDs returned 404 before any quota use, and the provider received none of the victim's text. Voice tokens are HMAC-bound, and the portal, account and invite actors come from the token. *Info:* a demo code maps to one shared account per class (Needs Adam to confirm it is intended).
11. **Input validation: Fixed (Medium).**
    - Models, enums and languages are allowlisted. `ai` caps bodies at 200 KB.
    - An unknown `feature` cost a quota slot and a paid Jev routing call, and 190 KB `feature` strings were logged. Fixed.
    - `redeem-promo` crashed on a non-string code. Fixed.
    - *Open, Low:* several functions still call an unbounded `req.json()` after auth.
12. **Rate limits and brute force: Fixed (High).**
    - Promo brute force: fixed in SQL.
    - The demo-code limiter treated "no IP, no fingerprint" as not limited, and counted its own refusals. Fixed.
    - Rejected import URLs used up import quota. Fixed.
    - Needs Adam: what the hosted gateway puts in `X-Forwarded-For`.
13. **AI cost limits: Pass for concurrency and streaming; Medium open.**
    - 20 parallel calls with a limit of 5 gave exactly 5 successes. Streams charge once. `max_tokens` is set by the server.
    - *Open:* failed provider calls keep their slot. Demo logins set Pro with `daily_limit_override = 999` and there is no dollar cap (Needs Adam).
14. **SSRF: Pass.** 19 private, loopback, metadata and encoded-IP targets, plus redirects to them, were rejected, and the canary server saw 0 hits. Size and time caps hold. *Open, Medium, a recorded exception:* DNS rebinding needs an egress proxy (Needs Adam).
15. **Stripe webhook: Fixed (High); Medium open.**
    - The signature is checked on the raw body with a 300 s tolerance.
    - Re-delivering an `active` event after cancellation restored Pro, even though the response said `duplicate`. Fixed: claim first, apply Stripe's current state, and recover abandoned claims.
    - *Open:* `subscription.updated` clears promo grace dates, and `invoice.payment_failed` downgrades on the first failure. Both are product decisions (Needs Adam).
16. **Secrets handling: Pass.**
    - 1,245 function log lines held no key, token or test email. Keys come only from `Deno.env`.
    - *Open, Low:* signing keys fall back to the service-role key (`SPARRING_INTEGRITY_SECRET`, `DEMO_CODE_PEPPER`, voice tokens). Setting them is a secret change (Needs Adam).
17. **Error leakage and logging: Fixed (Medium).**
    - Raw OpenRouter bodies, Stripe and Google `details`, Postgres error text and JS engine messages reached clients. Fixed.
    - Promo codes, prompt text and research queries were logged. Fixed.
18. **CORS: Pass; Low fixed.**
    - No origin is reflected and no credentials header is sent.
    - `export-gdoc` allowed any `192.168.x.x` origin, and there was no `Vary: Origin`. Fixed.
    - Needs Adam: confirm hosted preflight with one `curl -X OPTIONS`. The preview-origin allowlist is already a recorded exception.

### C. Frontend, hosting and supply chain

19. **Bundle secrets: Pass.** `dist/` and all 137 live assets contain only the two anon JWTs, the PostHog project key and the Sentry DSN, all public by design. The build now fails if that changes.
20. **Repo and history: Pass for the tree; Medium open.**
    - `gitleaks` over 2,998 commits found only fixtures, anon keys and pricing snapshots, apart from one hit.
    - That hit is a full Jina key in commit `0504e4d9`. It is reachable only from the local tags `pre-part1-ship-2026-05-27` and `pre-part2-ship-2026-05-27` on this VPS; GitHub's versions were rewritten.
    - Needs Adam: revoke the key, confirm the other old keys were rotated (next-15 #1), and delete the two local tags.
21. **Headers: Fixed (Medium).**
    - `vercel.json` matched the live headers.
    - Fixed: `connect-src` listed OpenAI, Anthropic, Gemini, Jina and Google API hosts the client never calls, plus `*.supabase.co`. `img-src` allowed any HTTPS host. There was no `form-action`, and `X-Frame-Options` contradicted `frame-ancestors`.
    - Source maps are not served live, and the build now enforces that.
    - *Info:* `/.vite/manifest.json` and `bundle-graph.json` are public; the prerender and service-worker scripts read them.
    - *Needs Adam:* HSTS asks for `preload`, but `pi-stack.org` isn't on the list. Submit it or drop `preload`.
22. **Client auth and redirects: Pass; Medium fixed.**
    - PKCE, codes stripped from the URL, the provider token in sessionStorage only, no open redirect, and Stripe redirects checked on the server.
    - Tool drafts survived sign-out on a shared computer. Fixed.
    - Needs Adam: the Supabase redirect allowlist and the Google OAuth client's redirect URIs.
23. **XSS: Fixed (High).**
    - Model Markdown rendered remote images, so a prompt-injected source could leak case text through an image URL with no click. Fixed: images now render as links.
    - `javascript:`, `data:` and raw HTML were already neutralised, and there is no `dangerouslySetInnerHTML`.
24. **Dependencies: Fixed (Medium); Low open.**
    - Every npm high was build-time only. Fixed: `tailwindcss-animate` moved to dev, and `dompurify` updated.
    - The lockfile is clean.
    - 13 Edge Function imports used `esm.sh/@supabase/supabase-js@2`, so each deploy took whatever 2.x esm.sh served. Fixed: pinned to 2.114.0.
    - *Open, Low:* esm.sh builds still have no integrity check. Moving to `npm:` specifiers with a `deno.lock` needs a check that the deploy bundler honours the lock.
25. **CI and third-party scripts: Pass for CI; Medium open.**
    - Actions are SHA-pinned, `contents: read` is the default, there is no `pull_request_target`, and no untrusted text is interpolated.
    - Sentry and PostHog are privacy-first.
    - *Open:* Jam's recorder loads for every visitor from `*.jam.dev` without SRI, and publishes the user id. Loading it on demand changes how bug reports arrive (Needs Adam).

### Needs Adam

Hosted settings to check in the dashboards (read-only):

- Supabase Auth for production and staging:
  - Site URL and Redirect URLs: no wildcards.
  - OTP expiry (suggest 600 s) and length.
  - Rate limits.
  - CAPTCHA and leaked-password protection.
  - Minimum password length, or turn password sign-in off.
  - Refresh-token rotation.
- Google OAuth client: only the two Supabase callback URIs.
- Storage: no buckets.
- Realtime: public channel access off.
- `pg_graphql`: off if unused.
- Hosted Edge preflight for an evil origin.
- What `X-Forwarded-For` contains.
- `share`'s effective `verify_jwt`.
- The per-environment grants, using the read-only query in auditor A's report.

Decisions:

- Revoke the leaked Jina key and confirm the old provider keys were rotated (next-15 #1). Delete the two stale local tags.
- Demo-code sizing (999 Pro requests a day) and a per-user dollar cap.
- Quota refunds for failed provider calls.
- Webhook promo-grace wiping and the failed-payment grace period (ultracode §3).
- Required `SPARRING_INTEGRITY_SECRET` and `DEMO_CODE_PEPPER` instead of the service-role fallback.
- Replacing the anon keepalive table writes with an RPC.
- Dropping `evidence_cards`, `source_files` and `api_keys`.
- Jam on demand.
- An egress proxy for `import-source`.
- HSTS preload.
- A retention period for attempt and usage logs.

### Declarative schemas

`supabase --experimental db schema declarative generate` on a local replay wrote 122 files, with `--strict-coverage` clean. Each table file holds its RLS, policies and explicit per-role grants, including column grants, and `public/default_privileges.sql` holds the default ACL. That would have made findings 3 and 4 readable as a diff. This branch keeps `supabase/migrations/` as the source of truth. Adopting declarative files is a separate decision: run `generate` against production read-only, diff it against a local replay to settle the grant drift, then commit the tree.
