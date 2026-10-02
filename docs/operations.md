# Operations and deployment

**Status:** Current. Workflow, hosting, and runtime configuration files remain authoritative.

## Authorization boundary

Reading state and running local checks are safe. Production deployment, production data mutation, migrations, Edge Function deployment, secret changes, billing changes, and destructive operations require explicit authorization for the concrete target and operation.

Never infer authorization from access. Never use production to replace missing local or staging setup.

## CI workflows

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) (the `Quality` workflow) owns credential-free quality and the pull-request browser smoke set. It does not deploy anything; Vercel does.

The quality job uses Node 22, `npm ci`, and Deno 2.9.6, then runs:

- `npm run docs:check`
- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run test:collaboration`
- `npm run test:edge`
- `npm run build`

On pull requests a parallel `browser-smoke` job runs the Playwright tests tagged `@smoke` (about 30) on desktop Chromium, port `18080`, with the browser download cached. [`.github/workflows/browser-nightly.yml`](../.github/workflows/browser-nightly.yml) runs the full desktop and mobile suite nightly and on demand. Pull requests that change only `docs/`, `plans/`, or Markdown skip `Quality` and run [`.github/workflows/docs.yml`](../.github/workflows/docs.yml), which runs `npm run docs:check` alone.

[`.github/workflows/database.yml`](../.github/workflows/database.yml) starts isolated local Supabase for pgTAP and the full-stack browser journeys. It takes about 20 minutes, so it runs on pull requests and `main` pushes only when they change the backend, the stores or clients that talk to it, or the gate itself (the `paths` list in the file), plus weekly and on demand.

[`.github/workflows/live-e2e.yml`](../.github/workflows/live-e2e.yml) runs the local stack against real providers nightly and on pull requests that change AI or research code. [`.github/workflows/model-matrix.yml`](../.github/workflows/model-matrix.yml) generates a case with every catalog model weekly and when AI code changes. [`.github/workflows/prod-canary.yml`](../.github/workflows/prod-canary.yml) checks production after each Vercel production deployment and daily. See [testing.md](testing.md) for all three. Both Supabase-starting jobs pull images from `public.ecr.aws`, because ghcr.io rate-limits shared runners.

[`.github/workflows/staging-e2e.yml`](../.github/workflows/staging-e2e.yml) owns protected staging. It accepts eligible successful main-branch `Quality` runs or a manual dispatch from `main`. It runs only when `STAGING_E2E_ENABLED=true` and all protected values exist.

## When GitHub Actions cannot run

If Actions jobs fail within 2 to 5 seconds with no runner and no logs, the account is usually out of Actions minutes or blocked by billing. Nothing ran, so nothing passed or failed. Until Actions is restored, run `npm run verify` and `./.superset/db-gate.sh` locally at the final head, record the exact results in the PR, and say that CI did not run. Do not describe a local pass as green CI.

## Frontend hosting on Vercel

Vercel builds and serves the frontend from the Git repository. Merging to `main` starts a production deployment to `https://debate.pi-stack.org`; pull requests get two preview deployments (see [Per-PR previews](#per-pr-previews)). For a staging-pinned preview on the tailnet, use `npm run dev:preview` (see [development.md](development.md#preview-on-the-tailnet)). The production canary runs after each successful Vercel `Production` deployment.

[`vercel.json`](../vercel.json) owns:

- the Vite build command and `dist` output;
- SPA fallback to `index.html`;
- no-cache headers for `index.html`, `theme-init.js`, and `sw.js`, and immutable caching for hashed `/assets/`;
- `noindex` headers for `/app`, `/login`, and `/share` routes;
- Content Security Policy and the other response security headers, including the `Permissions-Policy` that allows the microphone for the app's own origin only.

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

`STAGING_E2E_ENABLED` has been `true` since 2026-09-18. The job runs after every successful `Quality` run from a push to `main`. Quality runs from pull requests also trigger it, and those show as skipped by design. Check the latest real result with `gh run list --workflow staging-e2e.yml` and `npm run ci:failures -- <run-id>`, not this page. The run uploads no artifact, so the job log is the only evidence.

## Staging sync

Staging is project `debate-trainer-staging` (`brifeyypjauyusmkptkx`). Production is `debate-trainer` (`uziwdtkzofptihahfooo`). Every backend change goes to staging first, passes the staging browser suite, and only then goes to production. Steps 1 and 2 are read-only. Steps 3 and 4 change staging and need Adam's authorization each time.

1. Confirm the target. `supabase projects list` must show the staging ref under the staging name. Stop if a command, link, or environment variable points at the production ref.
2. Find what is pending. Run `npm run backend:status -- --project-ref brifeyypjauyusmkptkx --check` from a checkout of the commit you mean to ship. It compares staging with the committed tree and exits 1 when a migration is not applied. It also lists expected function secrets the project lacks (names only) and prints the Auth site URL and redirect allowlist. Where that script is not available, run its two read-only queries directly:

   ```bash
   supabase migration list --project-ref brifeyypjauyusmkptkx
   supabase functions list --project-ref brifeyypjauyusmkptkx
   ```

   A migration with a local version and no remote version is pending. A function whose folder changed (`git log -- supabase/functions/<name> supabase/functions/_shared`) after its remote `updated_at` is stale. Save both lists as the rollback baseline.
3. Apply migrations. Run `supabase db push --project-ref brifeyypjauyusmkptkx --dry-run` and check that it lists exactly the pending files from step 2. Then run it without `--dry-run`. Never use `--include-all` to paper over divergent history.
4. Deploy functions, one at a time, only the ones step 2 marked stale: `supabase functions deploy <name> --project-ref brifeyypjauyusmkptkx --use-api`. [`supabase/config.toml`](../supabase/config.toml) supplies each function's JWT setting. Never use `--prune`.
5. Verify. Rerun step 2; it must show nothing pending. Then start the staging browser suite: dispatch `Protected staging E2E` from `main` with `gh workflow run staging-e2e.yml --ref main`, or, when Actions cannot run, run it locally with the protected values as described in [testing.md](testing.md#protected-staging). For a manual check in the browser, an admin can switch the deployed frontend to staging from Settings and sign in there with a staging demo code. Google and email sign-in on staging work only if the staging Auth redirect URLs include the frontend origin. Since 2026-10-02 they include tailnet previews (`https://codex-remote.tailab0ab3.ts.net:91*/**`); see [development.md](development.md#preview-on-the-tailnet).

Production then follows [Supabase changes](#supabase-changes) with the same list of migrations and functions.

## Switching the frontend to staging

[`src/lib/supabase/env.ts`](../src/lib/supabase/env.ts) reads the `debate-supabase-env` localStorage key once at startup. The value `staging` selects staging, and anything else selects production. Each project keeps its own auth session under `debate-auth-<env>`.

Admins see a **Developer** card in Settings that signs out, sets the key, and reloads. The app's persisted stores are shared by both projects, so the switch also clears this project's stored session, its Google token, and all user-specific local data, including saved results and form drafts. It waits at most 4 seconds for the sign-out request, so an unresponsive project cannot block it. Other open tabs clear their own session storage, including their Google token, and reload as soon as the key changes, so no tab keeps talking to the old project while sharing stores with the new one. The strip publishes its height as `--staging-banner-height`, and the landing navigation and app header sit below it. While staging is active, every page shows a staging strip with **Switch to Production**, and the Settings card is shown to everyone. A new staging session starts signed out, and an admin on production may not be an admin on staging, so the way back cannot depend on that role. The switch is a convenience, not an access control. Staging RLS and its separate user accounts are the boundary.

A build can pin one project with the `VITE_SUPABASE_ENV` build variable (`production` or `staging`; any other non-empty value fails the build). A pinned build ignores the localStorage key, hides the Settings card and the strip's **Switch to Production** button, and does not reload when another tab switches. The strip still shows on a pinned staging build. The staging Vercel project uses this so each PR gets a staging preview; see [Per-PR previews](#per-pr-previews).

The switch only works while the `connect-src` directive in [`vercel.json`](../vercel.json) allows the staging project origin. Today the `*.supabase.co` wildcard covers it. If you narrow that wildcard, list both project origins explicitly.

## Per-PR previews

Each pull request gets two Vercel previews, one per Supabase project, and both rebuild on every push:

- `debate-navigator` (the production Vercel project) builds previews with no `VITE_SUPABASE_ENV`, so they use production unless the saved toggle says staging. Production's Auth redirect allowlist must include `https://debate-navigator-*-adam-gaborjanis-projects.vercel.app/**` for Google sign-in to return to the preview.
- `debatelab-staging` builds the same repository with `VITE_SUPABASE_ENV=staging`. Staging's Auth redirect allowlist must include `https://debatelab-staging-*-adam-gaborjanis-projects.vercel.app/**`. Its production deployment tracks `main`.

Edge Function CORS and the demo-code sign-in redirect accept these hosts through `isAllowedOrigin()` in [`supabase/functions/_shared/cors.ts`](../supabase/functions/_shared/cors.ts). Previews can call functions only after both projects run a function build that includes it.

The staging project's name must not start with `debate-navigator-`, or production's allowlist pattern would also match it. A production preview runs unmerged frontend code with real production sessions and data, so use the staging preview unless the change needs production data. A staging preview runs against whatever backend staging has; if the PR changes migrations or Edge Functions, sync staging first (see [Staging sync](#staging-sync)).

## Backend drift check

`npm run backend:status` shows what the current commit has that a Supabase project lacks. It inspects the project the Supabase CLI resolves, which is `SUPABASE_PROJECT_ID` when that is set and the linked project otherwise; `npm run backend:status -- --project-ref <ref>` inspects another one. It runs `supabase migration list`, `supabase functions list` and `supabase secrets list`, reads the Auth site URL and redirect allowlist from the Management API with the CLI's access token (`SUPABASE_ACCESS_TOKEN`, or the `access-token` file in `SUPABASE_HOME`, default `~/.supabase`), and changes no schema, data, functions, or secrets. It prints secret names only, never values or digests. To connect to the database, the CLI creates its usual short-lived login role.

The comparison uses the committed tree at `HEAD`, so commit or stash local edits first. It reports:

- migrations on this commit that the project has not applied, and applied migrations the commit does not have;
- functions that are not deployed, or that were deployed before the last commit that touched them or a file they import;
- functions whose deployed `verify_jwt` differs from [`supabase/config.toml`](../supabase/config.toml);
- deployed functions that the commit does not have.

Function change dates come from first-parent git history, which dates a merged change by its merge. A function deployed from a branch before its merge therefore shows as changed until it is redeployed from `main`. The reverse is not caught: a function deployed from an out-of-date checkout gets a fresh deploy date and looks current. Deploy functions only from an up-to-date `main`. A shallow clone skips the function date check.

`--check` exits 1 when a migration on this commit is not applied, and exit code 2 means the check itself failed. A scheduled CI step could use it against production, but it would need a Supabase access token and database access in GitHub Actions. That is a production credential, which the hard boundaries in [`AGENTS.md`](../AGENTS.md) do not allow in jobs, so it waits for Adam's decision.

`workspace-invites` is not deployed to production, because Collaborative Workspace is hidden there. Expect it in the not-deployed list.

## Supabase changes

Before applying a migration or deploying a function:

1. run `npm run backend:status` on the commit you are deploying and confirm that the pending list matches what you are about to apply;
2. resolve the linked project and confirm whether it is local, staging, or production;
3. inspect the exact migration or function diff;
4. capture the current remote baseline needed for rollback;
5. run the relevant local tests;
6. confirm CORS and authentication behavior;
7. apply one scoped operation;
8. verify the live result before continuing, then rerun `npm run backend:status` to confirm nothing you meant to ship is still pending.

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

Voice rounds span three independent steps, and the frontend works at every stage of them. The frontend alone (a merge) offers voice rounds that speak with the browser's voice. Deploying `ai` adds audio tags and signed segments to voice replies; deploying `voice` adds the endpoint, which answers `voice_unavailable` until `ELEVENLABS_API_KEY` is set. Deploy `ai` and `voice` together, since they share the token code. Once the key is set, check one Sparring and one Crossfire reply in a real browser, and confirm `voice_sparring` and `voice_crossfire` rows with a cost in `ai_requests`. Removing the key returns every round to the browser voice without a deploy.

## CORS

Current functions mostly use local explicit origin allowlists. The exact list can differ by endpoint. Treat handler code as the source of truth.

Before enabling protected browser staging, verify `http://127.0.0.1:18080` for `demo-code-login`, `ai`, `ai-stream`, `admin`, and `announcements`. Do not broaden origins to `*` merely to make a test pass.

Native requests may use `capacitor://localhost`. Local development origins must remain bounded to intended ports and hosts.

## Secrets

Secret names may be documented; values may not. Server-side categories include:

- Supabase service credentials;
- AI provider credentials;
- the ElevenLabs credential for the opponent's voice (`ELEVENLABS_API_KEY`);
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

- Frontend: promote the previous known-good Vercel production deployment (about 10 seconds), or revert the commit on `main` and let Vercel redeploy (one to two minutes). The Vercel project is `debate-navigator`. `vercel inspect debate.pi-stack.org` shows the live deployment, `vercel ls debate-navigator --environment production --status READY` lists the earlier ones, and `vercel rollback <previous-deployment-url> --yes` switches back. On Adam's VPS, `~/ops/rollback/rollback vercel debate-navigator` does all three. After a rollback, Vercel stops putting new `main` deployments live until one is promoted with `vercel promote <deployment-url>`, so promote the fixed deployment once it is ready. A frontend rollback does not touch Supabase: if the bad change came with a migration or function deploy, the old frontend must still work with the new backend.
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
- New frontend errors against Supabase right after a merge: the matching migration or function may not be applied to production yet. Run `npm run backend:status` from the linked checkout.
- Function returns unauthorized after deploy: check handler auth and environment propagation before changing gateway settings.
- Browser works on one route only: check the `vercel.json` SPA rewrite and cache headers.
- Native callback fails while web works: check Capacitor scheme and Supabase redirect allowlist.

Read [testing.md](testing.md) for evidence rules and [`../supabase/README.md`](../supabase/README.md) for backend ownership.
