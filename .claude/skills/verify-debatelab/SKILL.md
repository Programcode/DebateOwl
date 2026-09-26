---
name: verify-debatelab
description: Launch and drive the real DebateLab web app (React client + local Supabase Auth/Postgres/Edge Functions + fake model provider) to prove a user-facing feature works, with screenshots, ARIA snapshots, provider calls, and database rows as evidence. Use when asked to verify, demo, reproduce, or screenshot DebateLab behavior in a browser, or before calling a DebateLab UI/Edge Function change done.
---

# Verify DebateLab

DebateLab is a web app. The surface a user touches is the browser client at `/login` and `/app/*`, backed by Supabase Auth, Postgres/RLS, and Deno Edge Functions. This skill runs all of that locally. Only the paid model provider is swapped out, for `e2e/full-stack/fake-openrouter.mjs`. You then drive the app with Playwright.

Everything goes through one helper, run from the repository root (`git rev-parse --show-toplevel`):

```bash
H=.claude/skills/verify-debatelab/bin/verify.sh
$H up            # start the stack; add --collab to also start the Workspaces collaboration service
$H doctor        # read-only: is this instance ours, local, and healthy?
$H drive <recipe> [--project desktop-chromium|mobile-chromium]
$H user [label]  # mint a demo-code login for interactive driving
$H down          # stop everything `up` started; evidence stays
```

## Safety rules, read first

- **Plain `npm run dev` talks to the PRODUCTION Supabase project** (`src/lib/supabase/env.ts` falls back to production). Never sign in or submit forms on a dev server you started yourself. Drive only the `up` instance. It sets `VITE_LOCAL_PREVIEW=true`, and `doctor` proves the client resolved to `http://127.0.0.1:54321`.
- The Docker container `debatelab` on `127.0.0.1:8080` is Adam's deployed app. Never drive it, restart it, or point tests at it.
- The local Supabase stack uses fixed ports (54321+) and shared container names, so only one worktree can run it at a time. `up` takes `~/.superset/debatelab-db.lock` (the lock `.superset/db-gate.sh` uses) and refuses to start if the lock is held, if any `supabase_*` container is running, or if port 18081 or 18090 is busy. Don't work around a refusal. Another worktree owns the stack.
- Recipes abort any request to `*.supabase.co` and fail the test if one is attempted.
- Never print values from `.verify/state/` (`drive.env`, `function.env`). They are local test keys, but treat them as secrets.

## Launch

`$H up` takes 1–3 minutes on a warm Docker cache. It runs these steps in order:

1. `supabase start`, which replays `supabase/migrations/`.
2. Writes the function env from `.superset/workspace-test.env`.
3. Starts the fake provider container `debatelab-fake-openrouter` (`127.0.0.1:18090`) on the stack network.
4. `supabase functions serve --no-verify-jwt`.
5. Starts Vite on `http://127.0.0.1:18081` in local-preview mode.

It is ready when it prints `READY http://127.0.0.1:18081`. Port 18081 is fixed because it is the only local origin the Edge Function CORS list (`supabase/functions/_shared/cors.ts`) and the invite fixture allow.

Vite serves the working tree live, so uncommitted edits to `src/` apply on reload. Changes to `supabase/functions/` are picked up by `functions serve`. A new migration needs `down` then `up`.

If `up` fails, it tears itself down and prints the log directory (`.verify/logs/<run-id>/`: `supabase.log`, `functions.log`, `vite.log`, `collaboration.log`).

## Doctor

Run `$H doctor` first whenever anything looks off. It exits 0 only when all of these hold:

- The stack lock is held by this run's holder process.
- Port 18081 is served by this run's Vite process group.
- Vite's served `src/lib/supabase/env.ts` has `VITE_LOCAL_PREVIEW: "true"` and the local API URL.
- The Edge Functions process is alive, and `demo-code-login` answers CORS for the app origin.
- The fake provider answers.
- The Supabase containers for this worktree's project id are running.

It also prints the commit the stack started at and whether there are uncommitted changes. `drive` runs doctor itself and refuses a failing stack. Recovery for any failed check is `$H down && $H up`.

## Drive

**Scripted (preferred for proof).** Recipes are Playwright specs in `.claude/skills/verify-debatelab/recipes/`. They import from `./fixtures`, which re-exports `e2e/full-stack/stack.ts` and adds the following:

- A fresh demo-code user per test, signed in through the real Login page and `demo-code-login`, and deleted afterwards. Use the `signedIn` fixture for the page and `user` for `user.email` and `await user.userId()`.
- `admin`: a service-role client for reading rows as a second view.
- `fake` / `providerCall(feature)`: what the Edge Function actually sent upstream. Use `fake.fail(feature, status)` to force a provider error.
- `MARK` (`"FAKE-PROVIDER"`): every fake answer contains it, so assert on `${MARK} ...` text.
- `evidence`: `step(line)`, `aria(name, locator?)`, `shot(name)` and `json(name, value)`.
- Automatic failure on any uncaught page error, horizontal overflow, or remote Supabase request.

```bash
$H drive case-generation                              # both projects
$H drive case-generation --project desktop-chromium   # one viewport
```

To prove a feature without a recipe, copy `recipes/case-generation.spec.ts` to `recipes/<feature>.spec.ts` and use the selectors from the matching file in `features/`. Recipes are maintained files. Keep the ones worth keeping.

**Interactive.** Run `$H user` to mint a code. It prints `DEMO_CODE=...`, and `down` deletes that user. Then point a browser tool (Playwright MCP `browser_navigate` etc.) at `http://127.0.0.1:18081/login`, choose the `Demo code` tab, fill the `Demo code` textbox, and click `Sign in with demo code`. Save your own screenshots into `.verify/artifacts/<run-id>/`. A new account shows the onboarding tour on `/app`: click `[data-test-id="button-skip"]`. Interactive runs have no remote-Supabase guard. Doctor's local-mode check is what protects you.

Selectors: use accessible names and roles as the feature files list them (`getByRole("button", { name: "Generate Debate Case" })`). Crossfire is the exception and uses `data-testid`. Never use coordinates.

## Evidence

Each drive writes to `.verify/artifacts/<UTC-timestamp>-<recipe>/` and prints `EVIDENCE <dir>`:

- `<project>/<test-slug>/`: `run.json` (commit, project, URL), `steps.log` (user actions in order), `*.aria.yml`, `*.png` and `*.json` (provider calls, DB rows).
- `playwright/`: the full trace (`npx playwright show-trace .../trace.zip`) and the final screenshot.
- `report.json`: the pass/fail result.

A proof must meet these standards:

- Drive the real user path: the Login page, visible buttons and the real Edge Functions. Never use store setters or direct function calls to produce the visible result.
- Capture the action and the resulting state. Record `step()` for each user action, and take an ARIA snapshot or screenshot before and after.
- Verify side effects as well as the screen: the `providerCall(...)` payload, and the rows in `ai_requests`, `cases`, `sources`, `sparring_sessions` and so on, read through `admin`.
- Mocks are allowed only at the model-provider boundary, which is the fake provider. Everything else is real.

These things are **not proven locally**, and must not be reported as verified:

- Live model output quality.
- Web research and citations (no Exa key, so Factoids drops every unverified source).
- Real Jev judgement (the fake always answers confidently).
- Stripe Checkout and the portal.
- Google Docs export.
- Anything about staging, production, or the deployed host.

For those, see `docs/testing.md` (the live-provider gate and the production canary).

## Cleanup

`$H down` does the following:

1. Deletes users minted by `user`.
2. Kills only the process groups it recorded (functions, Vite, collaboration).
3. Removes `debatelab-fake-openrouter`.
4. Runs `supabase stop --no-backup` (the local DB is wiped).
5. Kills the lock holder and releases the lock if it is still ours.
6. Deletes `.verify/state/`.

It never touches `.verify/artifacts/` or `.verify/logs/`, and it is safe to run twice. Run it after every session, including failed ones. Never kill processes by name, and never run `supabase stop` for a stack you didn't start. After `down`, `docker ps` should show no `supabase_*` and no `debatelab-fake-openrouter` containers, and `~/.superset/debatelab-db.lock` should be gone.

`.verify/` is gitignored. Delete old artifact directories by hand when they are no longer needed.

## Feature map

`features/README.md` indexes the maintained per-feature recipes, with entry points, selectors and end states. A proof that drives one entry point is incomplete when the map lists others.

## Gotchas

- The fake provider rejects prompts it doesn't recognize. If a prompt change makes a feature fail with a provider error, update `e2e/full-stack/fake-openrouter.mjs`. Don't mock around it.
- Once, the fake-provider container was SIGKILLed about 20 seconds after `up`, and the cause was never found. Doctor catches this, and `drive` refuses to run until you `down && up`.
- Demo-code users are Pro with a daily limit of 999. To test quota or tier paths, change `user_settings` through `admin` inside the recipe, as `e2e/full-stack/case-generation.spec.ts` does.
- `.superset/db-gate.sh` and this skill share the lock. While your stack is up, the gate in any worktree waits (for up to 600 s) and then fails. Don't leave the stack up.
