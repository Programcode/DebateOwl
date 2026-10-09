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

Install the locked JavaScript tree with the Node version from `.nvmrc`:

```bash
nvm use
npm ci
```

The repository is an npm workspace: `npm ci` at the root installs the web app and every package under `packages/`, and links `@debatelab/core` into `node_modules`. Run every script from the root.

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

Automated browser tests always start a fresh server. `npm run verify` puts it on this worktree's port from `18100-18179` (`bash .superset/e2e-port.sh`); a bare Playwright run falls back to `127.0.0.1:18080`.

## Preview on the tailnet

A plain `npm run dev` talks to the production Supabase project unless the browser toggle says staging. For anything Adam opens from another device, run the staging preview instead:

```bash
npm run dev:preview -- --port 9201 --strictPort
```

`dev:preview` binds to `127.0.0.1` and sets `VITE_STAGING_PREVIEW=true`. In that mode Vite also accepts `*.ts.net` hostnames, so `tailscale serve` can forward to it however it was started. The app is then pinned to staging and calls Supabase at `/__staging-supabase` on its own origin, which Vite proxies to the staging project (see `stagingPreviewProxy` in [`vite.config.ts`](../vite.config.ts)). Requests stay same-origin, so Edge Function CORS lists need no preview entries. The staging strip shows, without the switch to production.

Two ports are involved. The dev server listens locally on a port in `9200-9299`. The `tailnet-preview` skill publishes it on a tailnet HTTPS port in `9100-9149`, and that HTTPS origin is what the browser sees. Staging Auth allows redirects to `https://codex-remote.tailab0ab3.ts.net:91*/**`, so Google sign-in returns to the preview only when the published port starts with `91`. If you run `tailscale serve` by hand, publish on `9100-9199`. Demo codes and email codes must be staging ones: staging has its own users.

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
- `packages/core/src/ai/schemas/` for response validation.

Platform-neutral code shared with the iOS app lives in [`packages/core/`](../packages/core/README.md). It mirrors `src/lib/` paths, and each old path re-exports it, so web code keeps importing `@/lib/...`. To add a module, put it under `packages/core/src/`, import siblings by relative path, leave a re-export at the old `src/lib/` path if web code used it, and follow the package's no-DOM rule. The stores, the AI client, and the i18n catalogs stay in `src/` for now.

Follow existing functional React, Zustand, Zod, and shadcn/Radix patterns. Reuse current helpers before adding another abstraction.

Run the closest unit or component test while changing behavior. Run lint, type checking, and build before handing work off.

## Mobile app

The iOS app lives in [`apps/mobile/`](../apps/mobile/AGENTS.md). The root `npm ci` installs it with every other workspace, and the root `lint` and `typecheck` cover it. Install its dependencies with `npx expo install <package>` from `apps/mobile`, and only native modules that Expo Go bundles.

### Screenshots on the VPS

The web export renders the app's screens in Chromium. It has no native tab bar, large titles, sheets or gestures, so it shows layout, copy and colour, not iOS behaviour.

```bash
npm run -w @debatelab/mobile export:web
PORT=<free port> npx tsx apps/mobile/scripts/screenshots.ts
```

Screenshots go to `.verify/mobile-shots/`: sign-in at iPhone and iPad sizes, light and dark, English and Hungarian. With `STAGING_DEMO_CODE` set, the script also signs in to staging, captures the five tabs, and checks that a cold start without a network keeps the user signed in, also after supabase-js's first auth event settles (about 30 seconds offline). Use the seeded Pro code from `~/.config/debatelab/staging-access.env` (see [staging.md](staging.md)), load it inside the command without printing it, and serve on `PORT=18080`: the deployed Edge Functions only accept browser calls from allowed origins such as `http://127.0.0.1:18080`.

### Expo Go on Adam's iPhone

The phone loads the app from a Metro dev server on the VPS over the tailnet. Start it through the `tailnet-preview` skill's `run` mode from the worktree, so it is tracked and cleaned up, with a free local port in `9200-9299`:

```bash
PREVIEW=~/.claude/skills/tailnet-preview/scripts/preview
HOST=$(tailscale status --self --json | jq -r .Self.DNSName | sed 's/\.$//')
cd apps/mobile
$PREVIEW run 9230 "debatelab mobile expo-go" -- env REACT_NATIVE_PACKAGER_HOSTNAME=$HOST CI=1 npx expo start --port 9230
```

`REACT_NATIVE_PACKAGER_HOSTNAME` makes Metro put the tailnet name in the manifest, so Expo Go fetches the bundle from `http://<host>:9230`. The firewall accepts all traffic on `tailscale0`, so the phone reaches that port directly. In Expo Go, enter `exp://<host>:9230` as the URL, or open that link in Safari. `CI=1` stops Expo waiting for keyboard input in the background. To check the server without a phone:

```bash
curl -s -H 'expo-platform: ios' http://127.0.0.1:9230/ | jq -r .launchAsset.url
```

The URL must start with `http://<host>:9230/`.

If iOS refuses the plain-HTTP bundle URL because of App Transport Security, there are two fallbacks. Set `REACT_NATIVE_PACKAGER_HOSTNAME` to the tailnet IP (`tailscale status --self --json | jq -r '.Self.TailscaleIPs[0]'`), since iOS allows plain HTTP to IP addresses on local networks. Or use the HTTPS URL that `run` publishes (`https://<host>:91xx`) by also setting `EXPO_PACKAGER_PROXY_URL=https://<host>:91xx`, so the manifest points at the HTTPS proxy.

Stop it with `$PREVIEW down "debatelab mobile expo-go"` when you are done.

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
P=$(bash .superset/e2e-port.sh) && CI=1 PORT=$P PLAYWRIGHT_BASE_URL=http://127.0.0.1:$P npm run test:e2e
```

Failure artifacts go to ignored `test-results/` and `playwright-report/`. Protected staging disables traces, screenshots, and video.

Read [testing.md](testing.md) before running WebKit or staging.

Agentic tests (`agentic/*.e2e.ts`, the e2e runner) drive the verification stack, never a dev server you started. Run them with `.claude/skills/verify-debatelab/bin/verify.sh e2e run` after `verify.sh up`. See [testing.md](testing.md#agentic-browser-tests).

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
