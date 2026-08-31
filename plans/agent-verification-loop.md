# Agent verification loop

## Goal

Finish the missing verification path for DebateLab as of 2026-08-31. The
repository already has unit, coverage, lint, typecheck, and build gates. The
remaining work is to make the current browser suite green, run credential-free
browser checks in CI, add a protected real-session staging suite, and document
the exact verification ladder.

This plan owns verification code, Playwright configuration, CI wiring, and
verification documentation. Supabase schema/function synchronization belongs to
`plans/supabase-staging.md`.

## Verified current state

- `package.json:15-23` already defines `lint`, `typecheck`, `test`,
  `test:coverage`, `test:e2e`, and `verify`; it has no
  `test:e2e:staging` script. `verify` currently stops after the production build
  and must be extended after the browser command is reliable.
- `vitest.config.ts:10-44` already includes both `src` and
  `supabase/functions` tests and enforces the selected coverage scope. A local
  run on this checkout passed 84 files and 872 tests with 90.13% statements,
  82.23% branches, 91.18% functions, and 93.98% lines.
- `.github/workflows/deploy.yml:3-45` already triggers on pull requests and
  runs lint, typecheck, covered Vitest, and build. It does not install
  Playwright or run `test:e2e`.
- `playwright.config.ts:6-35` has desktop and mobile Chromium projects,
  failure screenshots, and a local Vite server. It does not have a staging
  setup project, WebKit coverage, or retained video. `e2e/helpers/auth.ts`
  injects a deliberately bogus JWT, so the existing authenticated page tests
  prove rendering only. `e2e/crossfire.spec.ts` and `e2e/sparring.spec.ts`
  intercept backend requests instead of reaching Supabase.
- `npm run test:e2e` discovers 112 tests. A run on the default `:8080` reused
  an incompatible/stale local server and produced 92 passes and 20 failures,
  including false 404s for `/app/crossfire` and `/app/sparring`. The same
  checkout passed all 112 tests on an isolated `:18081` Vite server. The
  remaining work is to make that isolation the documented and CI-safe default,
  not to delete tests or weaken their assertions.
- There is no `e2e/staging/` suite and no root `AGENTS.md`. The current
  `README.md` testing section does not document `npm run verify` or the
  protected staging suite.
- GitHub run `33398731147` did not start because the account has a payment or
  spending-limit problem. This is an external CI exception, not evidence that
  the code passed.
- Git history confirms the old Phase 0 work landed in `b3b1476`, while the
  current Crossfire and sparring routes landed in `f1ce741` and `0b94c9e`.

The Phase 0 work described in older revisions, including the Deno compatibility
shim, coverage CI, pull-request trigger, `verify` script, and removal of
`bun.lockb`, is complete and must not be planned again.

## Preconditions and isolation

The implementation agent must create its own feature branch in its own isolated
T3 Code worktree. Before editing, it must run:

```bash
pwd
git branch --show-current
git worktree list --porcelain
git status --short --branch
```

The worktree must not be the `main` checkout and must not overlap another plan
worktree. An unexpected dirty file, branch, or worktree is a stop condition.
Keep the browser artifacts under the existing ignored `test-results/` and
`playwright-report/` paths.

## Remaining work

### 1. Make the current browser suite reproducible

Files to inspect or change:

- `playwright.config.ts`
- the existing `e2e/*.spec.ts` files only if a future isolated run finds a
  real test defect

Run the suite on an unoccupied port with CI mode enabled so another local
preview cannot be reused:

```bash
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 npm run test:e2e
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 \
  npx playwright test e2e/crossfire.spec.ts e2e/sparring.spec.ts --project=desktop-chromium
```

Make local runs use an explicit, unoccupied port and do not silently reuse an
existing server from another checkout. Set `reuseExistingServer` to `false` or
provide an equally strict explicit opt-in for an already-verified server. Keep
the stub session limited to render
tests and keep deterministic request interception limited to the tests that
explicitly need it. The acceptance result is all 112 current tests passing on
the isolated server, with no removed routes, skipped flows, or assertion
downgrades.

### 2. Put credential-free browser proof in pull-request CI

Files:

- `.github/workflows/deploy.yml`
- `playwright.config.ts`
- `package.json` only if `verify` is extended after local browser proof is
  green

Install the Chromium dependency in the CI job, run the existing static/unit
gates, and run `npm run test:e2e` against the job-local Vite server. Upload
`test-results/` and `playwright-report/` on failure with a bounded retention
period. Configure Playwright to retain a trace, screenshot, and video on
failure. Keep PR jobs credential-free. They may execute PR-controlled tests and
must never receive staging or production service-role, provider, OAuth, or
demo-code secrets.

After the standalone browser command is green locally, extend `npm run verify`
to include it. The one-command contract must be documented in `AGENTS.md` and
must run all of these gates:

```bash
npm run lint
npm run typecheck
npm test -- --coverage
npm run build
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 npm run test:e2e
```

Do not claim a GitHub check passed while the account-level billing blocker is
present. If it remains, record the run URL and the exact external exception
while retaining successful local evidence.

### 3. Add a protected real-session staging suite

Files:

- `e2e/staging/auth.setup.ts`
- `e2e/staging/authed-flows.spec.ts`
- `playwright.config.ts`
- `.github/workflows/deploy.yml`
- `package.json` to add the dedicated `test:e2e:staging` script

The setup must use only the staging URL and anon key. It should POST the
protected test code to `demo-code-login`, pass the returned `tokenHash` and
email to the staging anon client's `verifyOtp({ type: 'magiclink' })`, set the
existing `localStorage['debate-supabase-env']='staging'` before app scripts run,
and save the resulting storage state under `test-results/.auth/`. It must never
use a service-role key in Playwright code, print a token, or fall back to
production.

Keep staging tests in a separate Playwright project named `staging`, and add
`"test:e2e:staging": "playwright test --project=staging"` to `package.json`.
Ordinary
`npm run test:e2e` runs the public and stubbed Chromium suite only. The staging
project is enabled only when its explicit environment variables are present.
Use names such as `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`,
`STAGING_DEMO_CODE`, and `PLAYWRIGHT_BASE_URL`; values stay in a local ignored
file or a protected GitHub environment. Do not assume this script or project
exists before implementing the listed config and script changes.

The first real flow should be bounded and reversible:

1. Authenticate against staging and prove `/app` survives a reload with the
   same user.
2. Save one uniquely named source and verify it can be read back after a
   reload.
3. Make one short real AI request through the current staging function path,
   then assert a non-empty response and no browser console error.
4. Clean up only records created by the dedicated staging test identity, using
   an operator-approved staging-only mechanism. Never run cleanup against the
   production ref.

Run it locally only after the staging plan has established the schema, current
functions, required secrets, and test code:

```bash
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 \
STAGING_SUPABASE_URL=<staging-url> \
STAGING_SUPABASE_ANON_KEY=<staging-anon-key> \
STAGING_DEMO_CODE=<staging-test-code> \
npm run test:e2e:staging
```

The CI staging job may run only from a protected environment on an authorized
`main` push or explicitly authorized main-branch dispatch. It must not run on
pull requests or arbitrary branch dispatches. The job should upload the same
failure artifacts without exposing secret-bearing logs.

### 4. Add the verification playbook

Files:

- `AGENTS.md` at the repository root
- the testing and verification section of `README.md`

Document Node 22, npm, the static/unit/build commands, the credential-free
browser command, the protected staging command, the localhost ports, and the
failure-artifact locations. Explain that a green local run is not a green
GitHub run while Actions billing is blocked. Require a failing reproduction for
bugs and require the agent to state when real staging or browser proof did not
run.

## Full acceptance gates

On the implementation branch, after all changes are complete:

```bash
npm ci
npx vitest run src/test/ai/sparring.test.ts supabase/functions/ai/sparring-persistence.test.ts
npx playwright install --with-deps chromium
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 npm run verify
```

WebKit is conditional. If the implementation adds a `webkit` project to
`playwright.config.ts`, install it and run
`CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 npx playwright test --project=webkit`
as an additional local/release smoke gate. Until that project is configured,
Chromium is the credential-free PR gate. The protected staging suite is also
required for a release that changes authenticated data or AI flows.
Capture the current-head CI result and artifact links. A billing-blocked CI run
is reported as an exception, never as a pass.

## Stop conditions

- The requested worktree is `main`, overlaps another T3 worktree, or has
  unexpected dirty files.
- A current browser test fails. Stop and fix or explicitly document the root
  cause; do not skip it, weaken it, or replace it with a render-only check.
- Staging variables, the dedicated test code, or the protected GitHub
  environment are absent. Do not guess credentials or use production.
- The staging suite would need provider billing, data deletion, OAuth changes,
  secret changes, or a hosted staging domain that Adam has not authorized.
- GitHub Actions remains unavailable for account billing reasons. Finish local
  verification and record the exception, but do not report CI as passed.

## Rollback

All repository changes are reversible. Revert the branch commit(s) that add the
Playwright project, CI steps, staging suite, or docs. Removing the staging
project configuration from CI does not alter Supabase. Keep failure artifacts
ignored and local.

If the staging suite has created test rows, remove only the dedicated staging
identity's rows through an explicitly approved staging-only cleanup path. Do not
run SQL, function deployment, secret changes, or cleanup against
`uziwdtkzofptihahfooo` as part of this plan.

## Authorization boundaries

- CI and local PR checks may read only public app inputs and mocked backends.
- Staging browser tests may use the staging anon key and dedicated test code;
  they may write only dedicated staging test data.
- Adam or an explicitly authorized operator supplies protected GitHub variables,
  provider values, OAuth configuration, and any staging cleanup authority.
- Applying migrations or deploying functions is not authorized by this plan;
  follow `plans/supabase-staging.md` and obtain explicit staging authorization.
- Production migrations, function deploys, secrets, data, billing, and deploys
  are out of scope and remain forbidden.
