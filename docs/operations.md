# Operations and deployment

**Status:** Current. Workflow, hosting, and runtime configuration files remain authoritative.

## Authorization boundary

Reading state and running local checks are safe. Production deployment, production data mutation, migrations, Edge Function deployment, secret changes, billing changes, and destructive operations require explicit authorization for the concrete target and operation.

Never infer authorization from access. Never use production to replace missing local or staging setup.

## CI workflows

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) (the `Quality` workflow) owns credential-free quality plus pull-request database and browser tests. It does not deploy anything; Vercel does.

The quality job uses Node 22, `npm ci`, and Deno 2.9.6, then runs:

- `npm run docs:check`
- `npm run lint`
- `npm run typecheck`
- `npm test -- --coverage`
- `npm run test:edge`
- `npm run build`

Pull requests also start isolated local Supabase for pgTAP and run desktop plus mobile Chromium on port `18080`.

[`.github/workflows/live-e2e.yml`](../.github/workflows/live-e2e.yml) runs the local stack against real providers on pull requests and nightly. [`.github/workflows/model-matrix.yml`](../.github/workflows/model-matrix.yml) generates a case with every catalog model weekly and when AI code changes. [`.github/workflows/prod-canary.yml`](../.github/workflows/prod-canary.yml) checks production after each Vercel production deployment and daily. See [testing.md](testing.md) for all three. Both Supabase-starting jobs pull images from `public.ecr.aws`, because ghcr.io rate-limits shared runners.

[`.github/workflows/staging-e2e.yml`](../.github/workflows/staging-e2e.yml) owns protected staging. It accepts eligible successful main-branch `Quality` runs or a manual dispatch from `main`. It runs only when `STAGING_E2E_ENABLED=true` and all protected values exist.

## When GitHub Actions cannot run

If Actions jobs fail within 2 to 5 seconds with no runner and no logs, the account is usually out of Actions minutes or blocked by billing. Nothing ran, so nothing passed or failed. Until Actions is restored, run `npm run verify` and `./.superset/db-gate.sh` locally at the final head, record the exact results in the PR, and say that CI did not run. Do not describe a local pass as green CI.

## Frontend hosting on Vercel

Vercel builds and serves the frontend from the Git repository. Merging to `main` starts a production deployment to `https://debate.pi-stack.org`; pull requests may get preview deployments. The production canary runs after each successful Vercel `Production` deployment.

[`vercel.json`](../vercel.json) owns:

- the Vite build command and `dist` output;
- SPA fallback to `index.html`;
- no-cache headers for `index.html`, `theme-init.js`, and `sw.js`, and immutable caching for hashed `/assets/`;
- `noindex` headers for `/app`, `/login`, and `/share` routes;
- Content Security Policy and the other response security headers.

[`src/test/vercel-deployment-config.test.ts`](../src/test/vercel-deployment-config.test.ts) guards these rules. Update it together with `vercel.json`, and do not paste the full configuration into another guide.

A Vercel deploy ships only the frontend. Supabase migrations and Edge Functions are separate operations with their own authorization, so a frontend that depends on new schema must wait until that schema is applied to production.

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

`STAGING_E2E_ENABLED` has been `true` since 2026-09-18, and the job passed through 2026-09-23. Since then it has been skipped because the `Quality` run it waits for fails before any runner starts (see [When GitHub Actions cannot run](#when-github-actions-cannot-run)). Restoring Actions minutes restores the staging job; nothing in the workflow needs changing.

## Staging sync

Staging is project `debate-trainer-staging` (`brifeyypjauyusmkptkx`). Production is `debate-trainer` (`uziwdtkzofptihahfooo`). Every backend change goes to staging first, passes the staging browser suite, and only then goes to production. Steps 1 and 2 are read-only. Steps 3 and 4 change staging and need Adam's authorization each time.

1. Confirm the target. `supabase projects list` must show the staging ref under the staging name. Stop if a command, link, or environment variable points at the production ref.
2. Find what is pending. Run `npm run backend:status -- --project-ref brifeyypjauyusmkptkx --check` from a checkout of the commit you mean to ship. It compares staging with the committed tree and exits 1 when a migration is not applied. Where that script is not available, run its two read-only queries directly:

   ```bash
   supabase migration list --project-ref brifeyypjauyusmkptkx
   supabase functions list --project-ref brifeyypjauyusmkptkx
   ```

   A migration with a local version and no remote version is pending. A function whose folder changed (`git log -- supabase/functions/<name> supabase/functions/_shared`) after its remote `updated_at` is stale. Save both lists as the rollback baseline.
3. Apply migrations. Run `supabase db push --project-ref brifeyypjauyusmkptkx --dry-run` and check that it lists exactly the pending files from step 2. Then run it without `--dry-run`. Never use `--include-all` to paper over divergent history.
4. Deploy functions, one at a time, only the ones step 2 marked stale: `supabase functions deploy <name> --project-ref brifeyypjauyusmkptkx --use-api`. [`supabase/config.toml`](../supabase/config.toml) supplies each function's JWT setting. Never use `--prune`.
5. Verify. Rerun step 2; it must show nothing pending. Then start the staging browser suite: dispatch `Protected staging E2E` from `main` with `gh workflow run staging-e2e.yml --ref main`, or, when Actions cannot run, run it locally with the protected values as described in [testing.md](testing.md#protected-staging). For a manual check in the browser, an admin can switch the deployed frontend to staging from Settings and sign in there with a staging demo code. Google and email sign-in on staging work only if the staging Auth redirect URLs include the frontend origin.

Production then follows [Supabase changes](#supabase-changes) with the same list of migrations and functions.

## Switching the frontend to staging

[`src/lib/supabase/env.ts`](../src/lib/supabase/env.ts) reads the `debate-supabase-env` localStorage key once at startup. The value `staging` selects staging, and anything else selects production. Each project keeps its own auth session under `debate-auth-<env>`.

Admins see a **Developer** card in Settings that signs out, sets the key, and reloads. While staging is active, every page shows a staging strip with **Switch to Production**, and the Settings card is shown to everyone. A new staging session starts signed out, and an admin on production may not be an admin on staging, so the way back cannot depend on that role. The switch is a convenience, not an access control. Staging RLS and its separate user accounts are the boundary.

The switch only works while the `connect-src` directive in [`vercel.json`](../vercel.json) allows the staging project origin. Today the `*.supabase.co` wildcard covers it. If you narrow that wildcard, list both project origins explicitly.

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

- Frontend: promote the previous known-good Vercel production deployment, or revert the commit on `main` and let Vercel redeploy.
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

- Every Actions job fails in 2 to 5 seconds with no logs: Actions minutes or billing, not the code. Verify locally.
- Green local E2E plus staging failure: schema, functions, provider access, demo code, or CORS may differ.
- New frontend errors against Supabase right after a merge: the matching migration or function may not be applied to production yet.
- Function returns unauthorized after deploy: check handler auth and environment propagation before changing gateway settings.
- Browser works on one route only: check the `vercel.json` SPA rewrite and cache headers.
- Native callback fails while web works: check Capacitor scheme and Supabase redirect allowlist.

Read [testing.md](testing.md) for evidence rules and [`../supabase/README.md`](../supabase/README.md) for backend ownership.
