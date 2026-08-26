# Agent Verification Loop

Goal: make DebateLab verifiable by agents end to end, so bugs are caught inside the development loop instead of by users on production.

Basis: Theo's thesis that coding is solved and the verification layer is not. This repo proves the point. Agents here can already write code well. What they cannot do today is prove their work: the e2e suite uses fake JWTs, coverage thresholds never fire, four backend test files never execute, PRs gate on nothing, and there is no way for an agent to hold a real authenticated session. This plan closes those gaps in five phases.

## Current state, verified 2026-08-26

What exists:

- Commands: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:coverage`, `npm run test:e2e`, `npm run build`.
- CI (`.github/workflows/deploy.yml`): on push to main only. Runs lint, typecheck, vitest, build, then pushes a multi-arch image to Docker Hub (`adamgaborjaniszabo/debate-trainer:latest`). VPS pickup happens off-repo.
- Vitest: ~63 test files, ~630 cases under `src/test`. Coverage thresholds (90/80/89/90) configured over 8 audited modules, enforced only when `--coverage` is passed manually.
- Playwright: two render-smoke specs, Chromium-only, auto-starts `npm run dev` on :8080. Auth is a stubbed localStorage session with a bogus token, good only for render checks.
- Supabase: 12 edge functions, manual CLI deploys, currently linked to prod project `uziwdtkzofptihahfooo`. A staging project `brifeyypjauyusmkptkx` exists and its anon creds ship in `src/lib/supabase/env.ts`, but migrations, functions, secrets, and CORS were never applied or verified. The env switcher (`setActiveEnv`) has zero callers.

What is broken or missing, ranked by risk:

1. `vitest.config.ts:11` includes only `src/**`, so the 28 cases in `supabase/functions/**/*.test.ts` (prompt-builder, source-quality, url-validation, native-cors) never run anywhere.
2. Coverage gates never run in CI; `deploy.yml` invokes bare `npm test`.
3. No `pull_request` trigger, so PRs merge ungated.
4. Edge function handlers (Stripe checkout, portal, webhook, redeem-promo, admin) have zero automated execution. Money paths ride on review alone.
5. No real authenticated path in e2e. `demo-code-login` works server-side but nothing in `src/` calls it, no tooling mints codes, no seed users exist.
6. Staging Supabase is created but almost certainly empty; every function's `ALLOWED_ORIGINS` lacks a staging origin.
7. No WebKit/Firefox projects although `plans/smoke-test-checklist.md` names Safari streaming as the likeliest breakage.
8. TypeScript `strict: false`; typecheck is a weak signal. ESLint has `no-unused-vars` off.
9. Observability dead in the Docker path: Sentry DSN unset at build time and nginx CSP omits the Sentry/PostHog origins that `vercel.json` allows.
10. README drift: wrong repo name, Pi/port-3001 hosting story, obsolete `VITE_SUPABASE_*` guidance. Dual lockfiles: `package-lock.json` canonical, stale `bun.lockb` tracked.

## Target outcome

One command an agent runs on any branch:

```
npm run verify
```

runs lint, typecheck, unit tests with enforced coverage, build, and e2e against a real staging environment with a real session, and produces pass/fail plus failure evidence (trace, screenshot, video). CI enforces the same on every PR. When an agent cannot verify something, the repo tells it why and what to build next, via AGENTS.md.

## Phase 0: Make the checks that exist actually run

Small, high-leverage, no new infrastructure.

### Task 0.1: Include Supabase function tests in vitest

- Modify: `vitest.config.ts:11`
- Change include to `["src/**/*.{test,spec}.{ts,tsx}", "supabase/functions/**/*.{test,spec}.{ts,tsx}"]`.
- Risk: those tests may use Deno-flavored imports. Run `npx vitest run supabase/functions` first. If a test fails on Deno globals, either shim in `src/test/setup.ts` or move the tested pure logic into `_shared/` modules importable by both. Do not weaken assertions to make them pass.
- Verify: `npx vitest run supabase/functions` exits 0 with 28+ passing cases.

### Task 0.2: Enforce coverage in CI

- Modify: `.github/workflows/deploy.yml`
- Change the test step to `npm test -- --coverage`. Thresholds in `vitest.config.ts` then fail the job on regression. Keep the inline TODO comment accurate afterward.
- Verify: push a branch with a deliberate assertion deletion, confirm the workflow goes red, revert.

### Task 0.3: Gate pull requests

- Modify: `.github/workflows/deploy.yml`
- Add `pull_request:` trigger (any branch) running lint, typecheck, tests with coverage, and build. Docker push steps stay behind the existing secrets check so PR runs never publish.
- Verify: open a draft PR with a failing test, confirm required checks fail, then fix.

### Task 0.4: Lockfile hygiene

- Delete `bun.lockb` (stale, unused by CI/Docker/Vercel, all npm). Optionally gitignore it. One-line decision, removes drift bait.

### Task 0.5: Umbrella verify script

- Modify: `package.json` scripts.
- Add `"verify": "npm run lint && npm run typecheck && npm test -- --coverage && npm run build"`. E2E joins in Phase 3 once it needs no human.

## Phase 1: Write down how to verify (AGENTS.md)

Agents need the playbook in the repo. Create `AGENTS.md` at root:

- Canonical commands (the ones above), node 22, npm, ports 8080/54321.
- Environment model: creds resolve in `src/lib/supabase/env.ts` from `localStorage['debate-supabase-env']`, prod vs staging refs, what IS_STAGING changes.
- Verification ladder: static checks, unit, coverage, build, e2e smoke, e2e authed flows (once Phase 3 lands), then manual browser only for visual judgment.
- Rule: if a change cannot be verified because tooling is missing, stop and propose the missing piece rather than merging blind. This encodes Theo's "agent notices it can't test, then builds the missing piece".
- Evidence rule: attach trace/screenshot output or state plainly that verification did not happen. Never claim untested work passed.
- Fix README.md drift in the same commit: repo name, Hetzner + port 8080 + cloudflared story, remove `VITE_SUPABASE_URL/ANON_KEY` guidance, correct workflow filename.

Verify: fresh-agent test, give a subagent only AGENTS.md and ask it to describe how to run and verify the app. It should answer correctly without reading other files.

## Phase 2: Finish staging so agents have a safe sandbox

Staging project `brifeyypjauyusmkptkx` exists. Everything below targets it, never prod.

### Task 2.1: Audit staging state

- `npx supabase link --project-ref brifeyypjauyusmkptkx`, then `npx supabase migration list` and a probe request to one function URL.
- Record what exists. Expect: empty.

### Task 2.2: Apply schema and functions

- `npx supabase db push` (all 19 migrations).
- `npx supabase functions deploy` each of the 12 functions.
- Set non-provider secrets: `SUPABASE_SERVICE_ROLE_KEY` handled by platform; set `DEMO_CODE_PEPPER` to a staging-only random value.
- Provider keys (`OPENAI_API_KEY`, `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`, `EXA_API_KEY`): Adam supplies values via `supabase secrets set`; never through chat, never in files. Stripe keys deferred until payment flows get e2e coverage.

### Task 2.3: CORS for staging callers

- Each function hardcodes an `ALLOWED_ORIGINS` array including `localhost:8080/5173/54321`. Localhost already covers the agent loop, so no change strictly required for Phase 3. If a hosted staging domain is wanted later (e.g. `debate-staging.pi-stack.org` via cloudflared), add it to every array in the same commit. Adam owns the tunnel route.

### Task 2.4: Deterministic env for tests

- Modify `src/lib/supabase/env.ts`: read `import.meta.env.VITE_FORCE_SUPABASE_ENV` as initial default for the active env (localStorage still wins). Build-time override, no runtime UI needed.
- Verify: `VITE_FORCE_SUPABASE_ENV=staging npm run dev`, check network tab hits `brifeyypjauyusmkptkx.supabase.co`.

### Task 2.5: Seed script

- Create `scripts/seed-staging.ts`: uses service-role key from `STAGING_SERVICE_ROLE_KEY` env var (read at runtime, never committed). Creates one test user, mints a demo access code row with `sha256(pepper:code)` matching the staged `DEMO_CODE_PEPPER`, and writes the plaintext code only to `.env.e2e` (gitignored, mode 600) for local e2e use. The script never prints secrets; automated CI runs consume masked GitHub secret values instead of minting codes.
- Document in AGENTS.md. Rollback: staging is disposable; wipe and re-run.

## Phase 3: Real authenticated e2e, the actual bug catcher

This is the phase that catches Peter's-truncated-text-class bugs: things invisible in code review.

### Task 3.1: Auth setup project

- Create `e2e/auth.setup.ts`: calls `demo-code-login` on staging with the seeded code, completes `verifyOtp({ type: 'magiclink' })` via the staging anon client, saves valid storageState to `test-results/.auth/staging.json`.
- Modify `playwright.config.ts`: add a `setup` project depending on nothing, authed projects depend on it with `use: { storageState }`. Public specs stay storage-free.
- Env needed in CI/local: `STAGING_URL`, seeded demo code. Values come from the seed step; store locally in `.env.e2e` (gitignored).

### Task 3.2: First real flow specs

- Create `e2e/authed-flows.spec.ts` covering, in order of value:
  1. Login persists across reload; user menu shows the test identity.
  2. Ask: submit a prompt, assert streamed tokens arrive (SSE works, error boundary silent).
  3. History: conversation appears after the ask; reload keeps it.
  4. Sources: import `https://example.com`, assert it lands in the library.
  5. Share: share a session, open the public URL logged-out, assert content renders.
- Cost control: pin these specs to the cheapest provider/model via the staging `AI_DEFAULT_MODEL` secret; three short conversations per run is cents.

### Task 3.3: Browser breadth and failure evidence

- Add `webkit` project to `playwright.config.ts` (Safari parity, the checklist's known risk). Install deps once: `npx playwright install --with-deps webkit`.
- Config: `video: 'on'`, `trace: 'retain-on-failure'`, screenshot on failure.
- CI: upload `playwright-artifacts` on failure; add `test:e2e` to the PR workflow (public smoke at minimum; authed flows require the staging secrets as GitHub secrets).
- Extend `npm run verify` with e2e once green locally.

## Phase 4: Prove it, observe it

- Evidence convention in AGENTS.md: agents attach traces/screenshots via `gh pr comment` uploads or link CI artifacts. Never commit media to the repo.
- Observability: pass `VITE_SENTRY_DSN` as a Docker build arg in `deploy.yml`; align `nginx.conf` CSP `connect-src` with `vercel.json` (add `*.ingest.sentry.io`, `eu.i.posthog.com`). Prod errors become visible to agents fixing incidents instead of invisible to everyone.
- Commit the VPS pickup step: whatever pulls `debate-trainer:latest` on codex-remote (watchtower or systemd timer) gets a compose/unit file in-repo, making the last invisible hop observable and re-runnable. Adam confirms which mechanism runs today before we codify it.
- Optional, decide explicitly: Vercel PR previews (project still linked) would give every PR a live URL humans and agents can poke. Conflicts with Docker-as-canonical unless kept preview-only.

## Phase 5: The autonomous loop

Only after Phases 0-3 are green:

- Nightly full-suite cron on codex-remote (tmux or systemd timer): `npm run verify` + authed e2e against staging, failures reported with artifacts. Fits Adam's watchdog pattern: execute safe diagnosis automatically, alert with evidence.
- Bug intake rule in AGENTS.md: every bug report becomes a failing repro test first, fix second. Mirrors Theo's claim that speced bugs plus minimal verification get solved by frontier agents.
- Later candidates, not committed here: deno check/lint of `supabase/functions` in CI, incremental `strict: true` tsconfig ramp, CodeRabbit re-run against the new baseline.

## Who does what

Agent-executable: all of Phase 0, AGENTS.md, README fixes, seed script, e2e code, config changes, docs.

Adam-only:

- Provide staging provider secret values via `supabase secrets set` (never chat, never files).
- Choose and disclose the VPS image-pickup mechanism.
- Decide: delete `bun.lockb`, enable Vercel previews or not, staging tunnel domain or localhost-only.
- Approve any GitHub settings change making PR checks required/branch protection.

Secret handling rules: service-role and pepper values only via env vars or `supabase secrets set`; `.env*` stays gitignored; no secret ever printed in logs, commits, or PR comments; staging secrets distinct from prod.

## Acceptance test for the whole plan

On a fresh clone, an agent with only AGENTS.md and `.env.e2e`:

1. Runs `npm ci && npm run verify`, all green including coverage gates.
2. Makes a deliberate bug (break the share page render), runs verify, watches e2e fail with a saved trace naming the broken page.
3. Opens a PR; CI independently reproduces the red gate.
4. Reverts, everything green again.

That loop, repeated hundreds of times, is the verification layer. Bugs die in the loop instead of on production.

## Risks and rollback

- Flaky authed e2e erodes trust fast. Mitigation: retries only in CI, tight selectors, staging pinned cheap model, quarantine-and-fix policy for flaky specs within 48h.
- Staging drift (migrations applied out of order, secrets rotated silently). Mitigation: seed script is idempotent; AGENTS.md documents refresh procedure; staging is disposable by design.
- Provider cost runaway from scheduled e2e. Mitigation: daily-limit override caps the demo user; nightly cron is the only scheduled consumer.
- Phase 0 coverage enforcement may immediately redden CI if the 81.56% branches baseline dipped since the TODO was written. Mitigation: run `npm test -- --coverage` locally first; fix gaps before merging the workflow change, not by lowering thresholds.
- Rollback: every phase is additive config plus docs. Reverting the workflow edit restores old CI; deleting the e2e auth setup restores smoke-only; staging can be wiped without touching prod. Nothing here writes to prod except the eventual nginx/Sentry header alignment, which ships through the normal gated pipeline.
