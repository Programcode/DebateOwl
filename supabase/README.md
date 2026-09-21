# Supabase backend

**Status:** Current orientation. Function code, migrations, tests, and `supabase/config.toml` remain authoritative.

## Responsibilities

Supabase provides:

- user sessions and OAuth;
- PostgreSQL persistence and Row Level Security;
- RPCs, triggers, quotas, subscriptions, sharing, sparring, announcements, and usage accounting;
- Edge Functions that protect privileged credentials and integrate with external services;
- local migration replay and pgTAP policy tests.

Do not configure this backend by copying SQL or keys from documentation. Use checked-in migrations, CLI commands, protected environments, and explicit deployment authorization.

## Layout

```text
supabase/config.toml       local and function gateway configuration
supabase/functions/        Deno Edge Functions
supabase/functions/_shared shared auth, validation, prompts, research, and cost logic
supabase/migrations/       ordered database history
supabase/tests/            pgTAP database and policy tests
```

## Function groups

### AI and practice

- `ai`: authenticated non-streaming endpoint for generate, attack, brainstorm, factoids, Ask, Crossfire, and sparring. It enforces supported providers and controls, access limits, research bounds, output validation, usage accounting, and sparring integrity.
- `ai-stream`: authenticated server-sent events endpoint for Ask. It emits deltas, a final event, or an error and records usage.

Both endpoints route every model inference through OpenRouter and enforce the shared ten-model Basic/Pro catalog. GPT-5.6 Luna is the Basic default; Pro-only models require active Pro access.

The browser boundary is [`../src/lib/ai/client.ts`](../src/lib/ai/client.ts). Shared prompt, research, source-quality, model-pricing, cost, and control logic lives in `_shared`.

### Content and sharing

- `import-source`: authenticated public-URL import with SSRF protection on redirects, timeout, content-type and size limits, readable-text extraction, quota checks, and logging.
- `share`: authenticated creation of expiring share codes for supported saved content.
- `workspace-invites`: authenticated workspace code and email invitation creation, rotation, revocation, and redemption. The handler keeps raw invite values and email addresses out of database calls and uses service-role-only transactional RPCs for limits and membership changes.
- `export-gdoc`: authenticated Google Docs export using a short-lived Google access token. It rejects refresh tokens.

### Authentication and administration

- `demo-code-login`: bounded pre-session access-code flow with normalized hashing, fail-closed attempt limits, atomic use consumption, server-owned demo-user bindings in Auth `app_metadata`, and a prohibition on granting administrator status.
- `admin`: authenticated administrator operations with server-side role checks, including redacted demo-code list/create/disable/reset actions.
- `announcements`: authenticated announcement listing and dismissal.
- `redeem-promo`: authenticated atomic promo redemption.

### Billing

- `create-checkout`: authenticated Stripe Checkout creation. Price selection is server-controlled and redirects are validated.
- `create-portal`: authenticated Stripe Billing Portal creation with customer ownership checks.
- `stripe-webhook`: Stripe-signature-validated subscription and invoice event handling with idempotency state.

## Shared backend modules

[`functions/_shared/auth.ts`](functions/_shared/auth.ts) validates bearer tokens, creates user-scoped and service clients, enforces administrator roles, and formats JSON errors.

Other shared modules own:

- prompt construction and source bounds;
- research orchestration and source ranking;
- public URL validation;
- model pricing and normalized cost calculations;
- control enforcement;
- crossfire response validation;
- announcement input validation.

Move code into `_shared` only when multiple functions use the same boundary or policy. Feature-specific behavior stays with its handler.

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

Relevant origins include the production site, bounded local development hosts, automated staging browser origin, and `capacitor://localhost` where native access is supported.

Do not use wildcard origins to hide a failed browser test. Before protected staging, verify `http://127.0.0.1:18080` for `demo-code-login`, `ai`, `ai-stream`, `admin`, and `announcements`.

## Migrations and database tests

Migration filenames define execution order. Never edit an applied migration to change production history; add a new forward migration.

Local gate:

```bash
supabase db start
npm run test:db
supabase stop --no-backup
```

Requirements:

- Docker
- Supabase CLI 2.115 or newer
- exclusive ownership of the default local ports and containers

The stack begins at port `54321` and is not parallel-safe across worktrees. Coordinate before starting it. Stop the stack before finishing, including after failures when safe.

The database gate proves migration replay and pgTAP assertions locally. It does not prove staging or production state.

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
- `OPENROUTER_API_KEY` for all model requests;
- research provider keys;
- Stripe secret, webhook secret, and price configuration;
- demo-code hashing material;
- `WORKSPACE_INVITE_SECRET` for invite derivation, keyed hashes, and target-email encryption;
- `WORKSPACE_INVITE_MAILER_URL`, `WORKSPACE_INVITE_MAILER_TOKEN`, and `WORKSPACE_INVITE_BASE_URL` for the operator-supplied email relay;
- sparring integrity material;
- Google export configuration;
- allowed origins and environment-specific application URLs.

Use `supabase secrets` or protected deployment configuration for server values. Never place server secrets in `VITE_*`, source files, docs, screenshots, traces, logs, or comments.

The invitation handler does not select an email provider. Its mail boundary sends `{ to, inviteUrl, idempotencyKey }` to the configured relay. The relay must deduplicate repeated acceptance of the same key, which stays stable across pending-delivery retries. The handler marks delivery only after relay acceptance and suppresses later sends only after that mark commits. Email creation fails before storing an invite when the three mailer values are absent. Local tests inject an in-memory sender and make no external mail request.

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
2. Resolve the linked Supabase project and environment.
3. Inspect the exact migration or function diff.
4. Capture the remote baseline needed for rollback.
5. Run focused tests, `npm run test:edge`, and database tests when schema or RLS changes.
6. Verify CORS and handler authentication.
7. Apply one scoped operation.
8. Exercise the live endpoint or user-scoped database path.
9. Record the target, operation, result, and any exception without exposing secrets.

Stop when the target is ambiguous, rollback is unproven, or the operation exceeds authorization.
