# Testing and verification

**Status:** Current. Test selection is owned by [`vitest.config.ts`](../vitest.config.ts), [`playwright.config.ts`](../playwright.config.ts), and the npm scripts in [`package.json`](../package.json).

## Verification rule

Run the smallest reproduction first. Expand only when the changed behavior or a failure justifies it. A command passing proves the current local commit only.

Do not describe a stub session as authenticated backend proof. Do not describe a skipped staging job as passing.

## Documentation

```bash
npm run docs:check
```

This checks maintained Markdown for supported local-link failures and actionable retired checkout paths. It does not validate remote URLs, Markdown syntax, factual freshness, or heading anchors.

Focused checker test:

```bash
npx vitest run src/test/docs/check-docs.test.ts
```

## Lint and types

```bash
npm run lint
npm run typecheck
```

Lint checks repository ESLint rules. Type checking uses `tsconfig.app.json` and emits no files. Neither command replaces runtime tests.

## Unit and component tests

```bash
npm test
npm test -- --coverage
```

Vitest runs tests selected by [`vitest.config.ts`](../vitest.config.ts). The coverage gate is deliberately selected-scope coverage for audited runtime modules, not a claim that every maintained file is measured.

Run one test file while iterating:

```bash
npx vitest run src/test/security/url-validation.test.ts
```

For a bug, watch the reproduction fail for the expected reason before implementing the fix.

## Edge Function tests

```bash
npm run test:edge
```

This uses Deno directly for `supabase/functions/`, including tests that import deployed handler boundaries and remote Deno modules. The npm script declares the allowed filesystem, environment, and loopback-network permissions.

A browser-oriented Vitest pass does not replace native Deno tests. The stream accounting handler tests use synthetic OpenRouter responses and inspect audit inserts for complete, interrupted, and truncated streams. The permission list includes the OpenRouter key name because the handler reads it, but these tests require no real provider credentials.

## Production build

```bash
npm run build
```

This proves the Vite production bundle compiles. It does not prove authentication, database behavior, provider access, or production deployment.

## Credential-free browser gate

```bash
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 npm run test:e2e
```

Playwright starts a new Vite server on `127.0.0.1:18080` and runs:

- desktop Chromium at 1280 by 800
- mobile Chromium using the Pixel 5 device profile

The server is never reused. CI uses retries and two workers. On failure, traces, screenshots, videos, and the HTML report stay in ignored `test-results/` and `playwright-report/` directories. CI may upload those credential-free artifacts for diagnosis.

## Full credential-free gate

```bash
npm run verify
```

The gate runs, in order:

1. documentation checks
2. lint
3. type checking
4. selected-scope coverage
5. native Edge Function tests
6. production build
7. desktop and mobile Chromium

It does not start local Supabase, run pgTAP, run WebKit, or use protected staging.

## Database and RLS gate

Requirements:

- Docker
- Supabase CLI 2.115 or newer
- exclusive ownership of the local Supabase ports and containers

In Superset, run:

```bash
./.superset/db-gate.sh
```

The wrapper acquires `~/.superset/debatelab-db.lock`, starts the stack, runs `npm run test:db`, and stops the stack on exit, including after a test failure. Outside Superset, run:

```bash
supabase db start
npm run test:db
supabase stop --no-backup
```

The stack replays migrations and runs pgTAP tests. `CREATE INDEX CONCURRENTLY` requires the stated CLI floor so it runs outside the migration batch.

The local stack begins at port `54321` and is not parallel-safe across worktrees. The task that starts it must stop it before finishing or abandoning the run. Use `supabase stop --no-backup` unless another active task explicitly owns the same stack.

Never substitute a staging or production project for this gate.

## WebKit release smoke

Install the browser when needed:

```bash
npx playwright install --with-deps webkit
```

Run:

```bash
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 npm run test:e2e:webkit
```

This is the Safari-engine smoke gate. State explicitly when it did not run.

## Protected staging

Staging requires all three protected values:

- `STAGING_SUPABASE_URL`
- `STAGING_SUPABASE_ANON_KEY`
- `STAGING_DEMO_CODE`

Partial configuration fails during Playwright config loading.

```bash
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 \
STAGING_SUPABASE_URL=<staging-url> \
STAGING_SUPABASE_ANON_KEY=<staging-anon-key> \
STAGING_DEMO_CODE=<dedicated-test-code> \
npm run test:e2e:staging
```

The suite:

- rejects the production project;
- verifies that the anon key belongs to the supplied staging URL;
- authenticates through `demo-code-login`;
- proves session reload;
- writes and reads one uniquely named source;
- makes one bounded AI request;
- deletes only the source it created.

Temporary auth state lives under `test-results/.auth/`. The staging projects disable traces, screenshots, and video because browser captures can retain authenticated data.

The GitHub staging workflow runs only after an eligible main-branch quality result or a main-branch manual dispatch, and only when `STAGING_E2E_ENABLED=true`. The protected environment must already contain current secrets, functions, schema, provider access, a dedicated test code, and a main-only deployment rule.

A skipped staging workflow is not a pass. Missing credentials or provider access is a blocker, not permission to use production or mocks.

## CI evidence

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) runs documentation, lint, type, coverage, Edge Function, and build checks. Pull requests also run database and Chromium jobs.

[`.github/workflows/staging-e2e.yml`](../.github/workflows/staging-e2e.yml) owns protected staging conditions.

Before calling CI green:

1. identify the current head commit;
2. inspect the workflow run for that commit;
3. wait for every required check to reach a terminal state;
4. report billing, minutes, provider, or infrastructure failures as external exceptions rather than passes.

## What each result does not prove

- Render test: no authenticated backend proof.
- Unit test: no browser integration proof.
- Build: no runtime or provider proof.
- Local browser pass: no current-head CI proof.
- Credential-free E2E: no staging synchronization proof.
- Staging pass: no authorization to deploy or mutate production.
