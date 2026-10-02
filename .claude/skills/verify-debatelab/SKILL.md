---
name: verify-debatelab
description: Launch and drive the real DebateLab web app (React client + local Supabase Auth/Postgres/Edge Functions, with either a fake model provider or real OpenRouter pinned to the cheap meta/muse-spark-1.3-contributor model plus real Exa research) to prove a user-facing feature works, with screenshots, ARIA snapshots, provider calls, and database rows as evidence. Use when asked to verify, demo, reproduce, or screenshot DebateLab behavior in a browser, or before calling a DebateLab UI/Edge Function change done.
---

# Verify DebateLab

DebateLab is a web app. The surface a user touches is the browser client at `/login` and `/app/*`, backed by Supabase Auth, Postgres/RLS, and Deno Edge Functions. This skill runs all of that locally and drives it with Playwright. It has two modes:

- **Fake (default, free).** `e2e/full-stack/fake-openrouter.mjs` answers every model call with canned text. Proves wiring, rows, and UI, not model behavior.
- **Live (`up --live`, costs money).** The same container becomes a recording proxy to real OpenRouter. It rewrites every chat call to `meta/muse-spark-1.3-contributor` (override with `VERIFY_LIVE_MODEL`), records OpenRouter's reply model as proof, and stops forwarding after `--max-calls` (default 400). Edge Functions also get a real Exa key, so web research and verified citations are real.

Everything goes through one helper, run from the repository root (`git rev-parse --show-toplevel`):

```bash
H=.claude/skills/verify-debatelab/bin/verify.sh
$H up            # fake mode; add --collab to also start the Workspaces collaboration service
$H up --live [--max-calls N]   # real OpenRouter (pinned) + real Exa
$H doctor        # read-only: is this instance ours, local, and healthy?
$H drive <all|recipes/<name>|e2e/<path>> [--project desktop-chromium|mobile-chromium] [-g <title regex>]
$H user [label]  # mint a demo-code login for interactive driving
$H e2e <run|explore|list|cache> [args]  # agentic tests in agentic/ and explorations (TesterArmy e2e)
$H down          # stop everything `up` started; evidence stays
```

## Safety rules, read first

- **Plain `npm run dev` talks to the PRODUCTION Supabase project** (`src/lib/supabase/env.ts` falls back to production). Never sign in or submit forms on a dev server you started yourself. Drive only the `up` instance. It sets `VITE_LOCAL_PREVIEW=true`, and `doctor` proves the client resolved to `http://127.0.0.1:54321`.
- The Docker container `debatelab` on `127.0.0.1:8080` is Adam's deployed app. Never drive it, restart it, or point tests at it.
- The local Supabase stack uses fixed ports (54321+) and shared container names, so only one worktree can run it at a time. `up` takes `~/.superset/debatelab-db.lock` (the lock `.superset/db-gate.sh` uses) and refuses to start if the lock is held, if any `supabase_*` container is running, or if port 18081 or 18090 is busy. Don't work around a refusal. Another worktree owns the stack.
- Recipes abort any request to `*.supabase.co` and fail the test if one is attempted.
- Never print values from `.verify/state/` (`drive.env`, `function.env`). They are local test keys, but treat them as secrets.

## Live mode keys and cost

`up --live` reads keys from the environment or from `~/.config/debatelab/live-verify.env` (override with `VERIFY_LIVE_KEYS_FILE`; keep it `chmod 600`):

```bash
LIVE_OPENROUTER_API_KEY=...   # required
LIVE_EXA_API_KEY=...          # required
STRIPE_TEST_SECRET_KEY=sk_test_...   # optional; live keys are refused
STRIPE_TEST_PRICE_ID=price_...       # required with the Stripe key
```

It prints nothing about the values. Ask Adam before the first live run: it spends money and sends prompts to a contributor model that may use them for training, so never put real user data in a live run. Costs: Muse Spark 1.3 contributor is $0.10 per million prompt tokens and $0.20 per million completion tokens, so a full `drive all` is cents of model spend. Exa bills per search and is usually the larger part. Jev decisions go to `/api/alpha/decisions` with Jev's own model and are not pinned. `doctor` shows `live calls used N/max`; once the cap is hit the proxy answers 429 and tests fail rather than spend more.

## Launch

`$H up` takes 1–3 minutes on a warm Docker cache. It runs these steps in order:

1. `supabase start`, which replays `supabase/migrations/`.
2. Writes the function env from `.superset/workspace-test.env`.
3. Starts the fake provider container `debatelab-fake-openrouter` (`127.0.0.1:18090`) on the stack network.
4. `supabase functions serve --no-verify-jwt`.
5. Starts Vite on `http://127.0.0.1:18081` in local-preview mode.

It is ready when it prints `READY http://127.0.0.1:18081`. Port 18081 is fixed: the Edge Function CORS list (`supabase/functions/_shared/cors.ts`) allows it for the local full-stack gate, and it stays clear of the dev server (8080) and the credential-free browser run (18080), which the list also allows.

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

**Scripted (preferred for proof).** Recipes are Playwright specs in `.claude/skills/verify-debatelab/recipes/`. They import from `./fixtures`, which re-exports `e2e/full-stack/stack.ts` and `e2e/helpers/voice.ts` and adds the following:

- A fresh demo-code user per test, signed in through the real Login page and `demo-code-login`, and deleted afterwards. Use the `signedIn` fixture for the page and `user` for `user.email` and `await user.userId()`. The user has seen the onboarding tour and has no Current Debate.
- The Current Debate helpers: `startDebate(page, motion)` starts one from the header, `chooseForMotion(page, "create" | "once")` answers the motion dialog, and `debateControl(page)` is the visible header control on either viewport.
- The voice helpers: `stubSpeech(page)` installs a scripted microphone, recogniser and browser voice; `say(page, words)` speaks; `spokenByBrowser(page)` reads back what the browser voice said.
- `admin`: a service-role client for reading rows as a second view.
- `fake` / `providerCall(feature)`: what the Edge Function actually sent upstream. Use `fake.fail(feature, status)` to force a provider error.
- `aiResponse(page, feature, operation?)`: the parsed body of the next `ai` Edge Function response. Assert that its fields reach the screen, never on model wording, so a recipe passes in both modes. `LIVE` and `AI_TIMEOUT` (30 s fake, 240 s live) let a recipe branch where a check only makes sense live, and a fake-mode branch adds an `unverified` annotation instead of passing silently.
- `expectProviderCalls([...])`: what reached the provider. Each test writes `provider-calls.json`, and in live mode the fixture fails the test if any chat call was answered by a model other than the pin.
- `evidence`: `step(line)`, `aria(name, locator?)`, `shot(name)` and `json(name, value)`.
- Automatic failure on any uncaught page error, horizontal overflow, or remote Supabase request.

Every result, source and practice round belongs to a Current Debate or is explicitly one-off. A tool given a motion when no debate exists opens `Start a debate with this motion?`; a motion that differs from the Current Debate's opens `This is a different motion`. Both open after the submit click and before the AI request, so create the `aiResponse()` promise, click, answer with `chooseForMotion`, then await. Or call `startDebate` first, after which tools prefill its motion and open no dialog. The Library's `Add Source` is disabled until a debate exists. See `features/current-debate.md`.

```bash
$H drive all                                           # every recipe, both viewports
$H drive recipes/ai-tools --project desktop-chromium   # one file, one viewport
$H drive e2e/full-stack/billing                        # a maintained full-stack spec
$H drive e2e/workspace-collaboration                   # starts its own collaboration process; do not use up --collab
$H drive e2e/live/ --project desktop-chromium          # live mode only
```

Fake mode also runs `e2e/full-stack/`. Live mode runs the recipes, `e2e/live/`, and only the provider-free `e2e/full-stack/` tests (the config's `grepInvert` skips the ones asserting fake text).

To prove a feature without a recipe, copy `recipes/case-generation.spec.ts` to `recipes/<feature>.spec.ts` and use the selectors from the matching file in `features/`. Recipes are maintained files. Keep the ones worth keeping.

**Interactive.** Run `$H user` to mint a code. It prints `DEMO_CODE=...`, and `down` deletes that user. Then point a browser tool (Playwright MCP `browser_navigate` etc.) at `http://127.0.0.1:18081/login`, choose the `Demo code` tab, fill the `Demo code` textbox, and click `Sign in with demo code`. Save your own screenshots into `.verify/artifacts/<run-id>/`. A new account shows the onboarding tour on `/app`. Its first step offers `Start debate`; to skip the tour, click `Skip Tour` (`[data-test-id="button-skip"]`). Then start a debate from the header (`Start debate`, test id `current-debate-desktop` or `current-debate-mobile`) or answer the motion dialog the first tool opens: `Start debate` files the work in a new debate, `Not now, use it once` keeps it one-off. Interactive runs have no remote-Supabase guard. Doctor's local-mode check is what protects you.

Selectors: use accessible names and roles as the feature files list them (`getByRole("button", { name: "Generate Debate Case" })`). The exceptions use `data-testid`: Crossfire's controls, the Current Debate control, strip and dashboard, and the voice controls (`voice-mode`, `voice-mic`). Use `exact: true` for short names such as `Start` or `Save`, because the header's `Start debate` also matches `Start`. Never use coordinates.

## Agentic tests and exploration

`$H e2e` runs [e2e](https://e2e.tester.army/docs) against this stack: an AI agent drives goals and judges screens, and exact assertions pin the result. The tests are `agentic/*.e2e.ts`, the config is `e2e.config.ts`, and the API is in the `e2e` skill (`.claude/skills/e2e/SKILL.md`). docs/testing.md, under "Agentic browser tests", says what the suite covers and what a pass proves.

```bash
$H e2e run                                                  # the suite, desktop and mobile targets
$H e2e run agentic/hungarian.e2e.ts --target mobile         # one file, one viewport
$H e2e explore "Use Brainstorm and Attack on one motion and report anything off" --session student --agent coach
$H e2e cache ls                                             # recorded agent flows in agentic/replay
```

- `e2e` runs `doctor` first and refuses a broken stack, like `drive`. It turns e2e telemetry off and prints `EVIDENCE <dir>`, which holds `summary.md`, `report.json`, and per-attempt screenshots, traces, and failure videos.
- The testing agent uses its own model: `openai/gpt-6-luna` on OpenRouter (`E2E_AGENT_MODEL` overrides it), with the key from `OPENROUTER_API_KEY`, `LIVE_OPENROUTER_API_KEY`, or the live keys file. It needs this key in fake mode too. A recorded `agent.act` replays for free; every `agent.assert` and every exploration step is a model call. Without a key, agent tests skip.
- `--session student` starts an exploration signed in as a fresh demo user, minted by `agentic/sessions.e2e.ts`. `--agent` picks a persona: `first-timer`, `coach`, `edge-input`, or `hungarian`. `--target mobile` explores the phone-sized viewport.
- Explorations report `issue` (functional) and `warning` (cosmetic) findings, and exit 1 when there is an issue. Treat a finding as a lead: the stack serves Vite dev, so a route that is still compiling can look dead, and fake mode answers every motion with free-transport text. Prove a finding with a repro test tagged `repro` before you report it as a bug.
- Several explorations can run at once (a bug bash), because each gets its own evidence directory. They share this one stack, so give each a different area.

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

What each mode proves:

- Fake mode does not prove model output, web research and citations (no Exa key, so Factoids drops every unverified source), or real Jev judgement. The affected tests add an `unverified` annotation. URL import (`import-source`) fetches the page directly in both modes, so it needs outbound internet but no key.
- Live mode proves those with one cheap model. It does not prove how the production models (per-feature routing in `supabase/functions/_shared/`) behave, and model text varies run to run.
- Neither mode proves Stripe Checkout or the billing portal UI, real Stripe cancellation on account deletion (the fake container answers the customer search), ElevenLabs voice audio (no key, so the browser voice reads replies), Google sign-in, Google Docs export, or anything about staging, production, or the deployed host.

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

- Live runs are slow: sparring and crossfire take several minutes each because the model must reason. Use `-g` to run one test while iterating.
- The fake provider rejects prompts it doesn't recognize. If a prompt change makes a feature fail with a provider error, update `e2e/full-stack/fake-openrouter.mjs`. Don't mock around it.
- Once, the fake-provider container was SIGKILLed about 20 seconds after `up`, and the cause was never found. Doctor catches this, and `drive` refuses to run until you `down && up`.
- Demo-code users are Pro with a daily limit of 999. To test quota or tier paths, change `user_settings` through `admin` inside the recipe, as `e2e/full-stack/case-generation.spec.ts` does.
- A `waitForResponse` timeout right after a submit click usually means a motion dialog is open. See the Current Debate note under Drive.
- The client files a result in its debate after it renders. A `page.goto` straight after the `ai` response can drop it; wait for the result on screen (and its row, if the next step reloads) first.
- In a voice round, wait for the opponent's reply to finish (`spokenByBrowser`) before clicking `voice-mic` again; speaking over it abandons the voice request. `recipes/voice-rounds.spec.ts` shows the wait.
- Account deletion is irreversible. `recipes/account-data.spec.ts` deletes only its own `@fullstack.test` demo user and checks that before clicking.
- `.superset/db-gate.sh` and this skill share the lock. While your stack is up, the gate in any worktree waits (for up to 600 s) and then fails. Don't leave the stack up.
