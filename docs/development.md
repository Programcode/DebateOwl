# Development guide

**Status:** Current. Commands are owned by [`package.json`](../package.json).

## Work in the assigned checkout

Run:

```bash
git rev-parse --show-toplevel
git branch --show-current
git status --short --branch
```

The first command is the active repository root. Stay there. Superset sessions are linked worktrees and may live under `~/.superset/worktrees/`, not `/home/codex/Projects/DebateLab`.

Never overwrite unrelated changes. Do not switch to the primary checkout because an old note names it.

## Prerequisites

- Node.js 22.x
- npm and `package-lock.json`
- Deno 2.x for Edge Function tests
- Docker and Supabase CLI 2.115 or newer for database work
- Playwright browser binaries for browser gates
- Xcode and CocoaPods or Swift Package Manager support for native iOS work

Install the locked JavaScript tree:

```bash
npm ci
```

## Start the client

Outside Superset, start Vite directly:

```bash
npm run dev
```

[`vite.config.ts`](../vite.config.ts) defaults to port `8080` and maps `@` to `src/`. Superset's Run action calls `./.superset/dev.sh`, which allocates an available port from `8080-8179` for the current worktree and releases it through `./.superset/teardown.sh`. Do not assume a Superset workspace uses `8080`.

For another explicit local port:

```bash
npm run dev -- --host 127.0.0.1 --port 8081
```

Automated browser tests own `127.0.0.1:18080` by default and always start a fresh server.

## Environment behavior

The checked-in [`.env.example`](../.env.example) contains optional client observability variables:

- `VITE_SENTRY_DSN`
- `VITE_POSTHOG_KEY`
- `VITE_POSTHOG_HOST`

Production builds also read the Sentry build variables `SENTRY_AUTH_TOKEN`, `SENTRY_ORG` and `SENTRY_PROJECT`. Local builds leave them unset and skip source map upload. See [operations.md](operations.md#secrets).

The frontend Supabase environment is resolved by [`src/lib/supabase/env.ts`](../src/lib/supabase/env.ts), not by those variables. Public browser configuration is distinct from server secrets.

Never put service-role keys, AI provider keys, Stripe secrets, webhook secrets, demo-code peppers, or integrity secrets in Vite variables. Any `VITE_*` value can reach the browser bundle.

## Client workflow

The main entry points are:

- [`src/main.tsx`](../src/main.tsx) for startup and platform integration.
- [`src/App.tsx`](../src/App.tsx) for routes and top-level providers.
- `src/pages/` for route-level composition.
- `src/components/features/` for feature UI.
- `src/lib/stores/` for state and Supabase hydration.
- [`src/lib/ai/client.ts`](../src/lib/ai/client.ts) for AI requests.
- `src/lib/ai/schemas/` for response validation.

Follow existing functional React, Zustand, Zod, and shadcn/Radix patterns. Reuse current helpers before adding another abstraction.

Run the closest unit or component test while changing behavior. Run lint, type checking, and build before handing work off.

## Collaboration service

The local PostgreSQL-backed Hocuspocus service lives under `services/collaboration/`. It backs the collaborative Workspace, which is hidden and on hold; its routes register only when `VITE_COLLABORATION_URL` is set. Run its focused tests with:

```bash
npm run test:collaboration
```

Start it only with explicit local Supabase values for `COLLABORATION_DATABASE_URL`, `COLLABORATION_PORT`, `COLLABORATION_ALLOWED_ORIGINS`, `SUPABASE_URL`, and `SUPABASE_ANON_KEY`. The service binds loopback, takes one PostgreSQL session advisory lock per loaded document epoch, and closes sessions on access or restore notifications. It is not a production deployment.

## Edge Function workflow

Edge Functions live under [`supabase/functions/`](../supabase/functions/). Shared server code belongs in `_shared` only when at least two functions use the same boundary or policy.

Run native Deno tests with:

```bash
npm run test:edge
```

These tests intentionally use Deno permissions declared in the npm script. Do not broaden permissions just to make a test pass.

Handler authentication remains necessary where [`supabase/config.toml`](../supabase/config.toml) disables gateway JWT verification. See [`../supabase/README.md`](../supabase/README.md) for function groups and auth boundaries.

## Database workflow

Migrations live in [`supabase/migrations/`](../supabase/migrations/) and run in filename order. Database and policy tests live under [`supabase/tests/`](../supabase/tests/).

In a Superset workspace, use the repository's locking wrapper:

```bash
./.superset/db-gate.sh
```

Outside Superset, run the underlying commands directly:

```bash
supabase db start
npm run test:db
supabase stop --no-backup
```

The default local stack begins at port `54321` and uses shared container names, so it is not parallel-safe across worktrees. The wrapper holds `~/.superset/debatelab-db.lock` through database tests and the real-Auth collaboration browser journey, and stops the stack and owned processes on exit. Outside Superset, coordinate ownership before starting it. The agent that starts the stack stops it before finishing, including after failures when safe.

Never point local tests at staging or production. Never apply a migration to an unverified project.

## Browser workflow

[`playwright.config.ts`](../playwright.config.ts) starts Vite on an isolated port and refuses to reuse an existing server.

```bash
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 npm run test:e2e
```

Failure artifacts go to ignored `test-results/` and `playwright-report/`. Protected staging disables traces, screenshots, and video.

Read [testing.md](testing.md) before running WebKit or staging.

## iOS workflow

```bash
npm run ios:build
npm run ios:open
```

The Capacitor build uses a relative Vite base and syncs `dist/` into the native project. [`capacitor.config.ts`](../capacitor.config.ts) owns the app ID, app name, schemes, and native settings.

Do not hand-edit generated package documentation. Make native configuration changes through Capacitor or Xcode as appropriate.

## Documentation workflow

Run:

```bash
npm run docs:check
```

The checker includes new Markdown by default. It validates supported local link forms and rejects actionable retired checkout paths. It does not validate remote URLs, Markdown syntax, or heading fragments.

When a command or boundary changes, update the focused document that owns it. Avoid duplicating source trees, schema listings, dependency catalogs, or model lists.

## Troubleshooting

### The wrong repository path appears

Run `git rev-parse --show-toplevel`. Use that result. Do not trust a copied `cd` command over the current worktree.

### Port 8080 is busy

Choose a free explicit development port. Do not point browser automation at an unrelated server.

### Browser tests attach to old state

Use the required `CI=1`, `PORT`, and `PLAYWRIGHT_BASE_URL` values. Playwright sets `reuseExistingServer: false`.

### Local Supabase will not start

Check whether another worktree owns the default containers or ports. Coordinate and stop the existing local stack rather than deleting containers blindly.

### Authentication works in one environment only

Check the active client environment and environment-specific browser storage. Do not copy production sessions into staging or alter server authorization to hide a client configuration error.

### A staging test is missing

All three staging values must be present together. Partial configuration is rejected. A disabled or skipped staging workflow is not a pass.
