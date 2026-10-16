# Pre-ship security pass

**Status:** In progress on branch `security/preship-pass`. Three audit agents report against the 25 items below; the consolidated findings land in this file.

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

Consolidated after the audits finish.
