# DebateLab agent guide

## Runtime and install

- Use Node 22 and npm. The lockfile is `package-lock.json`.
- Start a clean checkout with `npm ci`.
- The development server normally uses port 8080. Automated browser verification owns `127.0.0.1:18080` and never reuses an existing server.
- Local Supabase development uses port 54321. Do not point staging checks at the production project.

## Parallel Superset workspaces

Each Superset workspace is a separate git worktree. `.superset/config.json` runs `npm ci` on create and `./.superset/dev.sh` for the Run button; `dev.sh` allocates a free port for this workspace from a shared `~/.superset/debatelab-ports/allocations.json` file (range 8080-8179) so several workspaces' dev servers never collide on the hardcoded `:8080` in `vite.config.ts`, and `./.superset/teardown.sh` releases that allocation on delete.

The local Supabase stack is not parallel-safe: `supabase/config.toml` sets no `project_id` or custom port block, so `supabase db start` always binds the CLI's default ports and container names. Run the DB gate through `./.superset/db-gate.sh` rather than calling `supabase db start` / `npm run test:db` directly whenever more than one workspace might be active - it takes an exclusive lock (`~/.superset/debatelab-db.lock`, up to 10 minutes) before starting the stack and stops it afterward.

## Verification ladder

Run the smallest relevant reproduction first, then the complete gate before a PR:

```bash
npm run lint
npm run typecheck
npm test -- --coverage
npm run test:edge
npm run build
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 npm run test:e2e
```

`npm run verify` runs that full credential-free ladder. It starts an isolated Vite server and executes the desktop and mobile Chromium projects. Browser failures stay in ignored `test-results/` and `playwright-report/` directories. CI uploads those directories for seven days when the browser step fails.

Database migrations and pgTAP policies have a separate Docker-backed gate. Supabase CLI 2.115 or newer is required so `CREATE INDEX CONCURRENTLY` runs outside the migration batch:

```bash
supabase db start
npm run test:db
supabase stop --no-backup
```

WebKit is an additional release smoke gate:

```bash
npx playwright install --with-deps webkit
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 npm run test:e2e:webkit
```

## Protected staging verification

The staging suite uses a real staging user and backend. It never uses a service-role key. Supply all three protected values together:

- `STAGING_SUPABASE_URL`
- `STAGING_SUPABASE_ANON_KEY`
- `STAGING_DEMO_CODE`

Then run:

```bash
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 \
STAGING_SUPABASE_URL=<staging-url> \
STAGING_SUPABASE_ANON_KEY=<staging-anon-key> \
STAGING_DEMO_CODE=<dedicated-test-code> \
npm run test:e2e:staging
```

The suite rejects the production project, checks that the anon key belongs to the supplied staging URL, authenticates through `demo-code-login`, proves session reload, writes and reads back one unique source, makes one bounded AI request, and deletes only that source. It saves temporary auth state under `test-results/.auth/`. Staging disables traces, screenshots, and video, and its workflow uploads no browser artifacts.

GitHub runs staging only for `main` push or a main-branch manual dispatch, through the protected `staging` environment, after the credential-free build job passes. Set the repository variable `STAGING_E2E_ENABLED=true` only after the protected environment has the three secrets, current staging functions, schema, provider secret, dedicated unlimited-use test code, and a main-only deployment rule. A skipped staging job is not a pass.

The staging origin `http://127.0.0.1:18080` must be deployed in the CORS allowlists for `demo-code-login`, `ai`, `ai-stream`, `admin`, and `announcements` before enabling the gate. Do not deploy those functions or apply migrations to an unverified project.

## Working rules

- Start bug fixes with a failing test or a repeatable browser reproduction when the repository has a suitable test layer.
- Keep stub sessions limited to render checks. Do not describe them as authenticated backend proof.
- Never put staging or production secrets in PR jobs, logs, traces, screenshots, commits, or comments.
- A local pass proves only the local commit. Inspect the current-head GitHub run before calling CI green. Account billing or spending-limit failures are external exceptions, not passing checks.
- State exactly which browser and staging checks ran. If credentials, provider access, or staging synchronization are missing, stop that gate and report it instead of substituting production or mocks.
