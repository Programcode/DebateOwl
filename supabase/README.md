# Supabase backend

**Status:** Current orientation. Function code, migrations, tests, and `supabase/config.toml` remain authoritative.

## Responsibilities

Supabase provides:

- user sessions and OAuth;
- PostgreSQL persistence and Row Level Security;
- debates and the per-user Current Debate (`debates`, `current_debates`, and the `attach_to_debate` RPC), plus RPCs, triggers, quotas, subscriptions, sharing, sparring, announcements, and usage accounting;
- Edge Functions that protect privileged credentials and integrate with external services;
- local migration replay and pgTAP policy tests.

Do not configure this backend by copying SQL or keys from documentation. Use checked-in migrations, CLI commands, protected environments, and explicit deployment authorization.

## Layout

```text
supabase/config.toml       local and function gateway configuration
supabase/functions/        Deno Edge Functions
supabase/functions/_shared shared auth, validation, prompts, research, and cost logic
supabase/migrations/       ordered database history
supabase/rollbacks/        down scripts for data migrations; never applied by db push
supabase/proposed/         destructive SQL awaiting authorization; never applied by db push
supabase/tests/            pgTAP database and policy tests
```

## Function groups

### AI and practice

- `ai`: authenticated endpoint for generate, attack, brainstorm, factoids, Ask, Crossfire, and sparring. It enforces supported providers and controls, access limits, research bounds, output validation, usage accounting, and sparring integrity. With `stream: true` it streams the model's output as server-sent events and ends with the same body as a JSON request (see `ai/stream.ts`). A streamed run holds its worker with `EdgeRuntime.waitUntil` until the last event is read. When the request sends a `resultKey`, the run's result is also written to `ai_run_results` before it is sent, so the browser can recover it after a dropped stream (`ai/run-results.ts`). Once a sparring scorecard is saved it sends a `sparring_scored` push to the scorer's phones (see [Push notifications](#push-notifications)).
- `ai-stream`: authenticated server-sent events endpoint for Ask. It emits deltas, a final event, or an error and records usage, holding its worker with `EdgeRuntime.waitUntil` until the stream closes.
- `voice`: authenticated text-to-speech for the opponent in voice rounds. It accepts one segment of at most 1,000 characters with the token `ai` signed for it, so it speaks only server-written text. It answers `voice_unavailable` without `ELEVENLABS_API_KEY`, enforces the per-user daily voice cap through `consume_daily_quota` under the `voice` key, calls ElevenLabs (`eleven_v4` for sparring, `eleven_v4_turbo` for Crossfire), and records each request in `ai_requests` as `voice_sparring` or `voice_crossfire`. Every failure is a JSON error with a code, and the browser then reads the reply with its own voice.

`ai/index.ts` is the entrypoint and dispatcher; `ai/features/` holds one handler per feature, `ai/provider.ts` the OpenRouter call, JSON repair, and the retry for a reply cut off at its cap (`_shared/output-caps.ts` holds the caps), `ai/request.ts` input hygiene, and `ai/runtime.ts` the environment and service clients. Each feature's prompt lives in `_shared/prompts/<feature>.ts`, with shared rules in `_shared/prompts/common.ts` and composition in `_shared/prompts/system.ts`.

Both endpoints accept an optional `debateContext` of IDs (`debateId`, `side`, `sourceIds`, `outputs`). `_shared/debate-context-loader.ts` loads the matching material with the service role, filtering every query by the caller's user ID and the one debate, and returns 404 for a debate the caller does not own before any quota is reserved. Requests without it still accept the legacy `sourceIds` field.

Both endpoints route every model inference through OpenRouter and enforce the shared ten-model Basic/Pro catalog. Basic accounts get Claude Haiku 5.5 (the default), GPT-6 Luna, and Muse Spark 1.3 Contributor; Claude Sonnet 5.5 is the Pro default and Claude Opus 5.5 runs only when picked; Pro-only models require active Pro access. Retired catalog IDs from older clients resolve to their successor before validation.

Claude runs only on DebateLab's own Anthropic key, added to OpenRouter as BYOK. [`_shared/provider-routing.ts`](functions/_shared/provider-routing.ts) sends `anthropic/*` requests with `provider: { only: ["anthropic"], allow_fallbacks: false }`, so Bedrock, Vertex, Azure and every other provider are never tried; other models keep OpenRouter's balanced routing. The request body cannot stop OpenRouter from serving Anthropic on its own credits when the key fails, so the key's **Shared capacity fallback** in OpenRouter must be set to "Never use shared capacity for any model on this provider". When a Claude call is refused, the endpoints answer 503 `provider_unavailable` and log `claude_unavailable`. Like any failed run that delivered nothing usable, the request gets back exactly the units it reserved (`refundQuotaReservation`; see the quota section of [docs/architecture.md](../docs/architecture.md)). Its row is logged with `cap_cost_usd` 0 only when nothing was paid for: no text written, no finished model call (a research step Claude refused in the same outage does not count), and no OpenRouter charge against the weekly cap. Jev routing and source-ranking rows are logged separately and keep their own cap cost. The Ask page does not resend a `provider_unavailable` stream failure through the plain endpoint. A Claude response whose usage shows `is_byok: false` or a `cost` above zero logs a `claude_not_byok` warning; past the monthly BYOK allowance, OpenRouter's BYOK fee also shows as cost.

The browser boundary is [`../src/lib/ai/client.ts`](../src/lib/ai/client.ts). Shared prompt, research, source-quality, cost, entitlement, CORS, and control logic lives in `_shared`.

### Content and sharing

- `import-source`: authenticated public-URL import with SSRF protection (resolved addresses checked against the IANA special-purpose ranges on every redirect, and the connection made to a checked address, not the hostname, so DNS cannot change in between), one 10-second deadline covering DNS, redirects and the body, content-type and 1 MB size limits, readable-text extraction, a daily quota, and logging.
- `share`: authenticated creation of share codes for supported saved content, with a 512 KB payload cap, expiry from 1 to 90 days (30 when omitted), and a daily quota of 50 per user.
- `workspace-invites`: part of the hidden Workspace. Authenticated workspace code and email invitation creation, rotation, revocation, and redemption. The handler keeps raw invite values and email addresses out of database calls and uses service-role-only transactional RPCs for limits and membership changes.
- `export-gdoc`: authenticated Google Docs export using a short-lived Google access token. It rejects refresh tokens.

### Authentication and administration

- `demo-code-login`: bounded pre-session access-code flow with normalized hashing, fail-closed attempt limits, atomic use consumption, server-owned demo-user bindings in Auth `app_metadata`, and a prohibition on granting administrator status.
- `admin`: authenticated administrator operations with server-side role checks, including redacted demo-code list/create/disable/reset actions.
- `announcements`: authenticated announcement listing and dismissal.
- `redeem-promo`: authenticated atomic promo redemption through `redeem_promo_code_atomic`. A `discount` code is claimed there too (it counts against `max_redemptions` and is single use per user) and must carry the Stripe promotion-code ID it stands for in `config.stripe_promotion_code`.
- `account`: authenticated data export and account deletion for the caller only. It never reads a user ID from the request. Deletion cancels Stripe subscriptions first and stops if that fails, then removes Storage objects, clears the user's workspaces, and deletes the auth user. It cannot cancel an App Store subscription; its response's `appStoreSubscriptionActive` tells the app to send the user to Apple's subscription settings. Export and the deletion plan use service-role-only RPCs. See [Account export and deletion](../docs/architecture.md#account-export-and-deletion).

### Billing

- `create-checkout`: authenticated Stripe Checkout creation. Price selection is server-controlled and redirects are validated. A promo code is claimed as the user through `redeem_promo_code_atomic` with `p_discount_only`, and the session applies only that code's `promo_` ID through `discounts`; Stripe's own promotion-code field is never enabled. Apply `20261024120100_discount_promo_claims.sql` before deploying it. It records the customer in `stripe_customers` before opening a session so that account deletion can stop its billing.
- `create-portal`: authenticated Stripe Billing Portal creation with customer ownership checks. Stripe failures answer with a fixed `portal_failed` error; Stripe's message stays in the log.
- `stripe-webhook`: Stripe-signature-validated subscription and invoice event handling. It claims each event in `webhook_events` before running handlers, reads subscription state from Stripe rather than the event payload, marks the claim complete, and lets a retry take over a claim left incomplete for 10 minutes. It needs the `webhook_events.completed_at` column, so apply `20261016120000_security_preship_hardening.sql` before deploying it.
- `app-store-notifications`: App Store Server Notifications V2 from Apple, with no Supabase session. It verifies the signed payload, and the transaction and renewal info inside it, against the pinned Apple Root CA - G3 (`_shared/apple-root-ca.ts`), checks bundle id, environment and, in Production, the app's Apple id, then applies them through `apply_app_store_transaction`, which records each notificationUUID once. It answers 200 for duplicates and data it does not use, 400 for data that fails verification, and 503 or 500 when it is unconfigured or the database fails, so Apple retries.
- `app-store-purchase`: authenticated. The app posts the signed transaction StoreKit returned, and optionally its renewal info. It is verified the same way and applied only when its `appAccountToken` equals the caller's user id. The answer is the caller's plan. It requires no browser Origin and uses the shared CORS headers.

Both App Store functions answer 503 `not_configured` until `APP_STORE_BUNDLE_ID` is set (and `APP_STORE_APP_APPLE_ID` when Production is allowed). Deploying them, setting those values, and pointing App Store Connect's notification URL at the function all need Adam's authorization. Tests inject a root they generate; production code has no setting that changes the trusted root.

Every quota and plan check resolves the plan with `resolveBillingState` (`_shared/billing-state.ts`) from `user_settings`, Stripe `subscriptions` and `app_store_subscriptions`; see [Billing and usage](../docs/architecture.md#billing-and-usage).

## Shared backend modules

[`functions/_shared/auth.ts`](functions/_shared/auth.ts) validates bearer tokens, creates user-scoped and service clients, enforces administrator roles, and formats JSON errors.

Other shared modules own:

- prompt construction and source bounds;
- research orchestration and source ranking;
- public URL validation;
- normalization of provider-reported usage and cost;
- control enforcement;
- crossfire response validation;
- audio-tag handling and signed voice tokens for voice rounds (`voice-tags.ts`, which the browser also imports, and `voice-token.ts`);
- the pinned OpenRouter Jev Decisions client, automatic model routing, semantic source decisions, and Crossfire signals;
- announcement input validation;
- push notifications through the Expo push service (`push.ts`).

Move code into `_shared` only when multiple functions use the same boundary or policy. Feature-specific behavior stays with its handler.

## Push notifications

The iOS app files its Expo push token through the `register_push_token` RPC (`20261014130000_push_tokens.sql`). The function writes only the caller's `auth.uid()`, moves a token to the current account when a second account signs in on the same phone, keeps one token per install and ten per account (one registration per account at a time, under an advisory lock), and turns a disabled token back on. Turning notifications off and signing out call `release_push_token` (sign-out with the account's own access token); the app keeps its local record until a release succeeds, and if it never does, the next account on the phone releases it. Each registration carries the ID of the app's local record, and a release withdraws that ID (`20261014200000_push_registration_withdrawal.sql`). Cancelling a request does not cancel its database statement, so a registration the app gave up on could otherwise commit after the release and keep the signed-out account's notifications on the phone. Registration refuses a withdrawn ID, and both functions hold the ID's advisory lock until they commit, so whichever runs second sees the other. `release_push_token` deletes only the rows its registration wrote, whichever account holds them, and the caller's own rows from the install that carry no registration ID (`20261014220000_push_release_by_registration.sql`); knowing the registration ID is the proof. The app never registers an ID again once it has sent a release for it, so a release that arrives late cannot delete a newer registration of the same token, whether the next account's or the same account's. Clients can read and delete only their own `push_tokens` rows and cannot insert or update them directly. `push_tickets` is service-role only and carries no user ID; deleting a token or an account deletes its tickets.

[`functions/_shared/push.ts`](functions/_shared/push.ts) sends through `https://exp.host/--/api/v2/push/send`, so the same code serves Expo Go, development and store builds. It reads tokens with the service role for the user IDs named by each notification, builds every message from the notification of the user who owns the token row, and drops rows for anyone else. Messages carry fixed, localized copy (`en`, `es`, `hu`, from the token's locale) and IDs only, never debate content, because they show on a lock screen. It sends in batches of 100, stores the tickets, turns a token off when a ticket or receipt says `DeviceNotRegistered`, and never throws into the request that triggered it. There is no scheduled receipts job: each send first reads the receipts that are at least 15 minutes old and forgets tickets older than Expo's 24-hour receipt window.

Wired triggers:

- `sparring_scored`: the `ai` function, after the scorecard is saved, through `EdgeRuntime.waitUntil` so the response does not wait for Expo.

Not wired yet:

- `trial_ending`: needs a scheduled job. `user_settings.trial_ends_at` holds the date, and no migration schedules anything yet. A daily pg_cron and pg_net call, or a VPS timer, would call a service-role path that selects users whose trial ends within a day and has not been notified, records that, and calls `deliverPush`.
- `announcements`: the hook point is `create-announcement` in [`functions/admin/index.ts`](functions/admin/index.ts). It needs a store method for `target_type = 'all'`, has to respect `starts_at` (a scheduled announcement sends when it starts, not when it is created) and `target_user_ids`, and should use fixed copy that points into the app rather than the administrator's title, under the lock-screen rule above.

Deploying push to a project is the migration first, then the `ai` function; neither needs a new secret. `EXPO_ACCESS_TOKEN` is optional and unset: it is needed only if enhanced push security is turned on for the Expo project. A token reaches a phone only once the app has an EAS project ID; see [`../apps/mobile/AGENTS.md`](../apps/mobile/AGENTS.md).

## Authentication boundary

Several entries in [`config.toml`](config.toml) set `verify_jwt = false`. This does not make those functions public. Their handlers perform their own request validation because they need one of these patterns:

- user bearer validation through shared auth helpers;
- administrator role validation;
- Stripe webhook signature verification;
- pre-session demo-code validation;
- short-lived Google token handling.

Do not remove handler authentication because the gateway setting looks permissive. Do not enable gateway verification without checking custom request flows and tests.

The effective gateway behavior for a function without an explicit config entry must be verified before documenting or changing it.

## CORS

Current handlers mostly define explicit origin allowlists. The exact list differs by endpoint and handler code is authoritative.

Relevant origins include the production site, bounded local development hosts, and the automated staging browser origin.

Do not use wildcard origins to hide a failed browser test. Before protected staging, verify `http://127.0.0.1:18080` for `demo-code-login`, `ai`, `ai-stream`, `admin`, and `announcements`.

## Migrations and database tests

Migration filenames define execution order. Never edit an applied migration to change production history; add a new forward migration.
When creating a table, sequence or function in `public`, grant only the Data API roles and operations it needs in the same migration, alongside RLS and its policies. Since `20261016120000_security_preship_hardening.sql`, tables and sequences that `postgres` creates in `public` grant `anon` and `authenticated` nothing by default, so a missing grant shows up as `permission denied`, not as an open table. Functions still get Postgres's global `PUBLIC EXECUTE`, so every new function needs its own `REVOKE ... FROM PUBLIC`. `supabase/tests/client_grants_test.sql` checks both.
Anything destructive (dropping a policy, function, index or column, deleting rows, or a constraint existing rows might break) goes in `supabase/proposed/` instead, with a header saying what it removes and what covers it; see [proposed/README.md](proposed/README.md).

Local gate:

```bash
npx supabase db start
npm run test:db
npx supabase stop --no-backup
```

Requirements:

- Docker
- Supabase CLI 2.121.0, pinned in `package.json` (`npm ci` installs it)
- exclusive ownership of the default local ports and containers

The stack begins at port `54321` and is not parallel-safe across worktrees. Coordinate before starting it. Stop the stack before finishing, including after failures when safe.

The database gate proves migration replay and pgTAP assertions locally. It does not prove staging or production state.

`20261014130000_push_tokens.sql` is additive: it creates `push_tokens`, `push_tickets`, `register_push_token` and `release_push_token`. `20261014200000_push_registration_withdrawal.sql` adds `push_tokens.registration_id` and the server-only `push_withdrawn_registrations`, and replaces both functions with versions that take the registration ID. `20261014220000_push_release_by_registration.sql` replaces `release_push_token(text, uuid, uuid)` with `release_push_token(uuid, uuid)`, which no longer deletes by token. See [Push notifications](#push-notifications).

`20261014123154_app_store_entitlements.sql` is additive: it creates `app_store_products` (with placeholder product ids), `app_store_subscriptions` (users read their own, only the service role writes) and `app_store_notifications` (service role only), `effective_entitlement()`, and `apply_app_store_transaction()` (service role only), and adds the App Store flag to `account_deletion_plan`. `supabase/tests/app_store_entitlements_test.sql` covers update ordering, idempotency and isolation, and the tier rules of `effective_entitlement()`, which nothing calls any more: the plan is resolved by `resolveBillingState`, whose App Store rules are pinned in `_shared/billing-state.test.ts`. A follow-up migration can drop the function. The plan readers treat a missing `app_store_subscriptions` table as no App Store rows, so the frontend and the AI functions keep working on a project without this migration. `account` needs it for the deletion plan's App Store flag; deploy it after the migration. The two App Store functions can follow later. Its timestamp is earlier than main's 2026-10-16 to 2026-10-24 migrations, so a project that already has those needs `supabase db push --include-all`.

`20260927170000_debate_context_pins.sql` is additive: it creates `debate_context_pins`, the saved results a student pins per debate, with RLS and a composite key to the owner's debate.

`20260926090100_legacy_debate_cleanup.sql` defines `private.purge_legacy_debate_material`, which deletes legacy results, chats, flowcharts, sparring rounds, and sources that belong to no debate and had no activity in the 30 days before `20260926090000_current_debates.sql` recorded its rollout time in `private.current_debate_rollout`. The migration does not call it, so applying it deletes nothing; legacy rows stay in the Unsorted view. Running the purge on a remote project is a separate, destructive step that needs explicit authorization for that environment. Work created after the rollout is never touched, however late it runs.

`20261022120000_opus_default_to_sonnet.sql` moves every saved Claude Opus 5.5 tool setting in `user_settings.feature_configs` to Claude Sonnet 5.5, because Opus was the Pro default and a saved row cannot tell a default from a pick. It first copies each changed row into `private.opus_default_backup` and skips users already there, so a second run changes nothing. Apply it only after the frontend that makes Sonnet the Pro default is live; otherwise an account that never saved settings still gets Opus on its first load. `supabase/rollbacks/20261022120000_opus_default_to_sonnet.down.sql` restores Opus wherever a tool still holds the Sonnet the migration wrote, and empties the backup. To roll back, copy it into `supabase/migrations` under a new timestamp. `scripts/test-opus-default-migration.sh`, part of `npm run test:db`, runs both twice against seeded rows.

`20261023120000_reconcile_admin_table_drift.sql` adds what the `admin` function writes to production's legacy `rate_limits` and `global_prompts` tables, which predate `20260204000000_admin_improvements.sql`: `updated_at` (backfilled from `created_at` only when the column is missing), `is_active` and `created_by` on `global_prompts`, and the unique keys the Set limit and Set prompt upserts infer. A key is skipped with a warning when duplicate rows would block it; the migration deletes nothing and a rerun changes nothing. `scripts/test-admin-table-drift-migration.sh`, part of `npm run test:db`, rebuilds the legacy shape in a rolled-back transaction and runs both admin writes against it.

## Adding an Edge Function

A new function needs more than its own folder. In the same PR:

1. Add a `[functions.<name>]` block to [`config.toml`](config.toml) with the intended `verify_jwt`.
2. Add it to the readiness loop in [`../.superset/db-gate.sh`](../.superset/db-gate.sh) (`for function_name in ...`) when the full-stack gate calls it, and to the matching loop in [`../.claude/skills/verify-debatelab/bin/verify.sh`](../.claude/skills/verify-debatelab/bin/verify.sh).
3. If it calls OpenRouter, Stripe or another paid provider, teach [`../e2e/full-stack/fake-openrouter.mjs`](../e2e/full-stack/fake-openrouter.mjs) to answer it. The fake rejects requests it doesn't recognize.
4. If it reads a new environment variable, add the name to `--allow-env` in the `test:edge` script in `package.json`, to [Environment and secrets](#environment-and-secrets), and to `EXPECTED_SECRETS` in [`../scripts/backend-status.mjs`](../scripts/backend-status.mjs) when every deployed project must hold it.
5. Describe it under [Function groups](#function-groups).

## Edge Function tests

Run:

```bash
npm run test:edge
```

The Deno suite covers shared modules, handler boundaries, control enforcement, research behavior, source validation, cost normalization, and persistence rules. The npm script grants only the permissions required by the test suite.

Run focused tests while changing one function, then run the complete Edge Function gate.

## Environment and secrets

Document names, never values. Depending on deployed features, server-side configuration includes categories such as:

- Supabase URL, anon key, and service-role key;
- `OPENROUTER_API_KEY` for all model requests, plus `OPENROUTER_API_URL`, which only the local full-stack gate sets to reach its fake provider (leave it unset everywhere else);
- `ELEVENLABS_API_KEY` for the opponent's voice, and optionally `ELEVENLABS_VOICE_ID` to replace the default voice; without the key, voice rounds use the browser's voice;
- research provider keys;
- Stripe secret, webhook secret, and price configuration, plus `STRIPE_API_URL`, which only the local full-stack gate sets so the `account` function reaches its fake Stripe (leave it unset everywhere else);
- `APP_STORE_BUNDLE_ID`, `APP_STORE_ENVIRONMENTS` (`Production`, `Sandbox`, or both, comma-separated; default `Production`) and `APP_STORE_APP_APPLE_ID` (required when Production is allowed) for the two App Store functions. None of them is a secret, and there is no Apple shared secret: StoreKit 2 data is verified by its signature. They are not in `backend:status`'s expected list until the App Store functions are deployed;
- demo-code hashing material;
- `WORKSPACE_INVITE_SECRET` for invite derivation, keyed hashes, and target-email encryption;
- `WORKSPACE_INVITE_MAILER_URL`, `WORKSPACE_INVITE_MAILER_TOKEN`, and `WORKSPACE_INVITE_BASE_URL` for the operator-supplied email relay, plus `WORKSPACE_INVITE_ALLOWED_ORIGINS` for an exact preview origin;
- sparring integrity material, which also signs voice tokens;
- Google export configuration;
- `EXPO_ACCESS_TOKEN`, optional and unset, only if enhanced push security is on for the Expo project;
- allowed origins and environment-specific application URLs.

Supabase injects `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Every deployed project, staging included, also needs:

- `OPENROUTER_API_KEY` and `EXA_API_KEY`, or AI features and web research fail;
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, or checkout, the billing portal, the webhook and account deletion fail (`stripe-webhook` fails at startup without them);
- `ELEVENLABS_API_KEY` for the opponent's voice, which otherwise falls back to the browser voice.

`DEMO_CODE_PEPPER` and `SPARRING_INTEGRITY_SECRET` fall back to a value derived from the service-role key. Demo-code login logs a warning when `DEMO_CODE_PEPPER` is missing and still accepts codes hashed with that fallback. The `WORKSPACE_INVITE_*` values serve only the hidden Workspace. `npm run backend:status -- --project-ref <ref>` lists which expected names a project lacks, without printing values.

Use `supabase secrets` or protected deployment configuration for server values. Never place server secrets in `VITE_*`, source files, docs, screenshots, traces, logs, or comments.

Jev uses the same `OPENROUTER_API_KEY` as every other model request; there is no separate TypeSafe credential. `npm run smoke:jev` exercises one fixed, sanitized typed decision against the live Decisions endpoint and incurs a negligible provider charge.

The invitation handler does not select a production email provider. Its default mail boundary sends `{ to, inviteUrl, idempotencyKey }` to the configured relay. The relay must deduplicate repeated acceptance of the same key, which stays stable across pending-delivery retries. The handler marks delivery only after relay acceptance and suppresses later sends only after that mark commits. Email creation fails before storing an invite when the three required mailer values are absent. The locked local gate alone sets `WORKSPACE_INVITE_MAILER_FORMAT=mailpit` and captures messages in local Supabase Mailpit; it makes no external mail request.

Public browser configuration in [`../src/lib/supabase/env.ts`](../src/lib/supabase/env.ts) is not a replacement for server authorization.

## Local, staging, and production

### Local

Use local Supabase for migration replay and pgTAP. Do not point local tests at a remote project.

### Staging

Protected staging must use a non-production project with matching anon key, current schema and functions, required provider access, a dedicated bounded demo code, correct CORS, and a protected main-only GitHub environment.

Read [`../docs/testing.md`](../docs/testing.md) before running staging.

### Production

Migrations, function deployments, secret changes, and data mutation require explicit authorization. Confirm the linked project, exact diff, current baseline, rollback path, and local evidence before any operation.

Read [`../docs/operations.md`](../docs/operations.md) before changing remote state.

## Deployment checklist

For an authorized backend change:

1. Confirm the current worktree and commit.
2. Resolve the linked Supabase project and environment, and run `npm run backend:status` to see what is pending there. See [`../docs/operations.md`](../docs/operations.md#backend-drift-check).
3. Inspect the exact migration or function diff.
4. Capture the remote baseline needed for rollback.
5. Run focused tests, `npm run test:edge`, and database tests when schema or RLS changes.
6. Verify CORS and handler authentication.
7. Apply one scoped operation.
8. Exercise the live endpoint or user-scoped database path.
9. Record the target, operation, result, and any exception without exposing secrets.

Stop when the target is ambiguous, rollback is unproven, or the operation exceeds authorization.
