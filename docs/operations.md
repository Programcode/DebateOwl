# Operations and deployment

**Status:** Current. Workflow, packaging, and runtime configuration files remain authoritative.

## Authorization boundary

Reading state and running local checks are safe. Production deployment, production data mutation, migrations, Edge Function deployment, secret changes, billing changes, and destructive operations require explicit authorization for the concrete target and operation.

Never infer authorization from access. Never use production to replace missing local or staging setup.

## CI workflows

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) owns credential-free quality, pull-request database and browser tests, asset upload, and conditional Docker packaging.

The quality job uses Node 22, `npm ci`, and Deno 2.9.6, then runs:

- `npm run docs:check`
- `npm run lint`
- `npm run typecheck`
- `npm test -- --coverage`
- `npm run test:edge`
- `npm run build`

Pull requests also start isolated local Supabase for pgTAP and run desktop plus mobile Chromium on port `18080`.

Non-PR runs upload `dist/` briefly and may build a `linux/amd64` and `linux/arm64` Docker image when registry credentials are present. A successful quality run does not by itself prove that an image was pushed.

[`.github/workflows/live-e2e.yml`](../.github/workflows/live-e2e.yml) runs the local stack against real providers on pull requests and nightly. [`.github/workflows/model-matrix.yml`](../.github/workflows/model-matrix.yml) generates a case with every catalog model weekly and when AI code changes. [`.github/workflows/prod-canary.yml`](../.github/workflows/prod-canary.yml) checks production after each Vercel production deployment and daily. See [testing.md](testing.md) for all three. Both Supabase-starting jobs pull images from `public.ecr.aws`, because ghcr.io rate-limits shared runners.

[`.github/workflows/staging-e2e.yml`](../.github/workflows/staging-e2e.yml) owns protected staging. It accepts eligible successful main-branch quality runs or a manual dispatch from `main`. It runs only when `STAGING_E2E_ENABLED=true` and all protected values exist.

## Production image

[`Dockerfile`](../Dockerfile) has two stages:

1. Node 22 Alpine installs the locked dependency tree and runs the production build.
2. Nginx Alpine serves the resulting `dist/` directory on port 80.

[`nginx.conf`](../nginx.conf) owns:

- SPA fallback routing;
- cache policy for HTML, runtime configuration, hashed assets, and media;
- crawler restrictions for authenticated routes;
- sensitive-file and hidden-path blocking;
- Content Security Policy and response security headers.

Update documentation when these files change. Do not paste their full configuration into another guide.

## Staging contract

Protected staging requires:

- a project that is not production;
- a matching anon key;
- current migrations and required Edge Functions;
- required provider secrets;
- a dedicated bounded demo code;
- a protected GitHub environment with a main-only deployment rule;
- deployed CORS support for `http://127.0.0.1:18080` on the tested functions.

The staging browser suite disables trace, screenshot, and video capture. It creates uniquely named data and deletes only what it created.

Do not enable the staging repository variable before every prerequisite is present. A skipped staging job is not a pass.

## Supabase changes

Before applying a migration or deploying a function:

1. resolve the linked project and confirm whether it is local, staging, or production;
2. inspect the exact migration or function diff;
3. capture the current remote baseline needed for rollback;
4. run the relevant local tests;
5. confirm CORS and authentication behavior;
6. apply one scoped operation;
7. verify the live result before continuing.

Stop when the project target is ambiguous, rollback is unproven, or the operation exceeds authorization.

Destructive statements such as `DROP` or `TRUNCATE`, secret rotation, project deletion, and broad unrelated function deployment always need separate explicit approval.

## Edge Function deployment boundaries

[`supabase/config.toml`](../supabase/config.toml) disables gateway JWT verification for functions that authenticate or validate requests in their own handlers. Deployment must preserve those handler checks.

Auth patterns include:

- bearer validation through shared helpers for user and admin APIs;
- Stripe signature validation for webhooks;
- bounded pre-session validation for demo-code login;
- short-lived Google token validation for Docs export.

A successful deploy command proves upload only. Verify the behavior through the real endpoint or protected staging flow.

## CORS

Current functions mostly use local explicit origin allowlists. The exact list can differ by endpoint. Treat handler code as the source of truth.

Before enabling protected browser staging, verify `http://127.0.0.1:18080` for `demo-code-login`, `ai`, `ai-stream`, `admin`, and `announcements`. Do not broaden origins to `*` merely to make a test pass.

Native requests may use `capacitor://localhost`. Local development origins must remain bounded to intended ports and hosts.

## Secrets

Secret names may be documented; values may not. Server-side categories include:

- Supabase service credentials;
- AI provider credentials;
- research provider credentials;
- Stripe API and webhook credentials;
- demo-code hashing material;
- sparring integrity material;
- Google export configuration.

Never place server secrets in `VITE_*`, screenshots, traces, logs, comments, commits, or documentation.

GitHub Actions secrets: `LIVE_OPENROUTER_API_KEY` and `LIVE_EXA_API_KEY` for live provider tests, and `PROD_CANARY_EMAIL` and `PROD_CANARY_PASSWORD` for the production canary account. The public anon key is the `PROD_SUPABASE_ANON_KEY` repository variable. To rotate the canary password, set it with the Supabase Auth admin API and pipe it into `gh secret set` over stdin.

Vercel build variables for Sentry source maps: `SENTRY_AUTH_TOKEN` (an organization token with release and source map upload scope), `SENTRY_ORG` and `SENTRY_PROJECT` (slugs). When all three are set, [`vite.config.ts`](../vite.config.ts) builds hidden source maps, uploads them for the release, and deletes them from `dist/`. When any is missing, the build emits no source maps. A failed upload logs an error but does not fail the build. The release is `VERCEL_GIT_COMMIT_SHA` (then `GITHUB_SHA`, then `git rev-parse HEAD`), and the Sentry environment is `VERCEL_ENV`, so preview deployments report as `preview`. Both need Vercel's system environment variables enabled.

## Rollback

Choose rollback before changing production:

- Frontend image: retain the prior known-good image digest or deployment reference.
- Edge Function: retain the deployed source or artifact baseline and its environment assumptions.
- Migration: prefer forward corrective migrations. Do not assume an irreversible schema or data change can be rolled back.
- Configuration: record the prior value without exposing secrets.

After rollback, verify the user-visible flow and relevant backend state. A process restart alone is not proof.

## Live verification

Match verification to the change:

- frontend: load the deployed route and complete the affected browser flow;
- auth: use the intended environment and prove session refresh or callback behavior;
- database: query only the expected rows and prove RLS with user-scoped access;
- Edge Function: call the deployed endpoint with the intended auth class;
- billing: use the authorized test or staging mode and inspect webhook state;
- CORS: issue the browser-origin request that previously failed.

Do not expose protected data in artifacts. Record the commit, environment, operation, and result.

## Incident clues

- Green quality plus missing image: Docker credentials may have been absent, so packaging was skipped.
- Green local E2E plus staging failure: schema, functions, provider access, demo code, or CORS may differ.
- Function returns unauthorized after deploy: check handler auth and environment propagation before changing gateway settings.
- Browser works on one route only: check Nginx SPA fallback and cache behavior.
- Native callback fails while web works: check Capacitor scheme and Supabase redirect allowlist.

Read [testing.md](testing.md) for evidence rules and [`../supabase/README.md`](../supabase/README.md) for backend ownership.
