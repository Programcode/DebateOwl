# DebateLab agent guide

## Start here

- The repository is DebateLab. Never infer its directory from an old repository name.
- Run `git rev-parse --show-toplevel` and stay inside that returned worktree. On Adam's VPS, `/home/codex/Projects/DebateLab` is the primary checkout, but Superset and other agents use linked worktrees elsewhere.
- Before editing, inspect the branch and working tree. Preserve unrelated changes.
- Use Node 22, npm, and the committed `package-lock.json`. Install with `npm ci`.

## Parallel Superset workspaces

Each Superset workspace is a separate git worktree. `.superset/config.json` runs `npm ci` when it creates a workspace and starts the app through `./.superset/dev.sh`. That script allocates a port from `8080-8179` in `~/.superset/debatelab-ports/allocations.json`; `./.superset/teardown.sh` releases it.

The local Supabase stack still uses shared default ports and container names. In Superset, run the database gate through `./.superset/db-gate.sh`. It holds `~/.superset/debatelab-db.lock` while the stack runs and stops the stack afterward.

## System map

- `src/` is the React 18 and TypeScript client. Routes and lazy page entry points live in `src/App.tsx`.
- `src/lib/stores/` owns browser state and Supabase hydration. `src/lib/ai/client.ts` is the client AI boundary.
- `supabase/functions/` contains Deno Edge Functions. Shared auth, CORS, research, prompts, cost, and validation code lives in `supabase/functions/_shared/`.
- `supabase/migrations/` is the database history and schema source of truth.
- `src/lib/stores/debate-store.ts` owns the Current Debate: every source and saved result belongs to one debate or to one-off work, and nothing crosses debates.
- Collaborative Workspace is hidden. Its routes render only when `VITE_COLLABORATION_URL` is set, and production does not set it. Do not extend it unless Adam asks.
- `.github/workflows/` owns CI behavior. `vercel.json` owns production hosting: build output, SPA fallback, cache policy, and security headers.

## Deployment

The frontend is hosted on Vercel at `https://debate.pi-stack.org`. Merging to `main` starts a Vercel production deployment, so a merge ships the frontend. Supabase migrations and Edge Functions are not deployed by that merge; they are separate authorized operations.

## Normal ports

- Vite development server: `8080` by default outside Superset; Superset allocates `8080-8179` per worktree.
- Automated browser server: isolated `127.0.0.1:18080`, never an existing dev server.
- Local Supabase: CLI defaults beginning at `54321`. The stack is not parallel-safe across worktrees.

## Focused verification

Run the smallest relevant check first:

```bash
npm run docs:check
npm run lint
npm run typecheck
npm test -- --coverage
npm run test:collaboration
npm run test:edge
npm run build
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 npm run test:e2e
```

`npm run verify` runs the complete credential-free ladder, including desktop and mobile Chromium against a fresh Vite server.

When GitHub Actions cannot run (for example, the account is out of Actions minutes), run `npm run verify` and the database gate locally at the final head and record the exact results in the PR. A local pass is not a CI pass; say which one you have.

Database migrations and pgTAP policies use a separate Docker-backed gate. In Superset, use the locking wrapper:

```bash
./.superset/db-gate.sh
```

Outside Superset, run the underlying commands directly:

```bash
supabase db start
npm run test:db
supabase stop --no-backup
```

Supabase CLI 2.115 or newer is required. Do not run this gate concurrently from multiple worktrees. If this task starts the stack, stop it before finishing, including after failures when safe.

WebKit is a separate release smoke test:

```bash
npx playwright install --with-deps webkit
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 npm run test:e2e:webkit
```

## Hard boundaries

- Start bug fixes with a failing test or repeatable browser reproduction when a suitable test layer exists.
- Stub sessions prove rendering only. Do not call them authenticated backend proof.
- Never put staging or production credentials in jobs, logs, traces, screenshots, commits, comments, or docs. Two scoped exceptions reach jobs only through GitHub Actions secrets:
  - the protected staging values;
  - the dedicated production canary account (`PROD_CANARY_EMAIL` and `PROD_CANARY_PASSWORD`, a regular user capped at 10 AI requests a day), which Adam approved on 2026-09-24.

  Neither exception may appear in logs, traces, or screenshots. No other production credential may enter a job.
- Never substitute the production project when local or staging access is unavailable.
- Production deployments, data changes, migrations, Edge Function deployments, and secret changes require explicit authorization.
- A local pass proves only the local commit. Check the current-head GitHub run before calling CI green.
- A skipped staging job is not a pass. Report exactly which browser and staging checks ran.
- Do not weaken tests, RLS, authentication, branch protection, or required checks to make a run pass.

## Protected staging

Staging E2E requires all three values together: `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`, and `STAGING_DEMO_CODE`. The suite rejects the production project, disables browser captures, writes only uniquely named test data, and deletes only that data. Read [docs/testing.md](docs/testing.md) before running it and [docs/operations.md](docs/operations.md) before changing staging configuration.

## Documentation router

Open only what the task needs:

- [docs/architecture.md](docs/architecture.md): runtime boundaries, request flows, state, auth, billing, observability, PWA, and iOS.
- [docs/development.md](docs/development.md): setup, environment behavior, worktrees, and common workflows.
- [docs/testing.md](docs/testing.md): what each gate proves, browser matrices, staging, artifacts, and cleanup.
- [docs/operations.md](docs/operations.md): CI, Vercel hosting, staging, deployment, rollback, and live verification.
- [supabase/README.md](supabase/README.md): Edge Functions, shared backend modules, migrations, auth boundaries, and required secret names.
- [plans/README.md](plans/README.md): work in progress, the backlog, and shipped plans. Detailed plans live in `.hermes/plans/`. Revalidate every plan against current source before executing it.
- [docs/README.md](docs/README.md): complete documentation index and freshness labels.

When commands, ports, workflows, or runtime boundaries change, update the owning focused document in the same change. Do not copy large source trees, schemas, dependency lists, or model catalogs into documentation.
