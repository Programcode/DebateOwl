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

## Collaboration service tests

```bash
npm run test:collaboration
```

This runs the Node collaboration service with real Hocuspocus providers and Yjs documents. It covers durable acknowledgement ordering, reconnect sync, duplicate delivery, schema and size rejection, PostgreSQL adapter behavior, proposal decision rollback, writer serialization, stale epochs, and process-kill recovery. It does not prove a deployed service.

## Edge Function tests

```bash
npm run test:edge
```

This uses Deno directly for `supabase/functions/`, including tests that import deployed handler boundaries and remote Deno modules. The npm script declares the allowed filesystem, environment, and loopback-network permissions.

A browser-oriented Vitest pass does not replace native Deno tests. The stream accounting handler tests use synthetic OpenRouter responses and inspect audit inserts for complete, interrupted, and truncated streams. The permission list includes the OpenRouter key name because the handler reads it, but these tests require no real provider credentials.

### Live Jev contract smoke

```bash
OPENROUTER_API_KEY=... npm run smoke:jev
```

This sends one tiny typed choice to OpenRouter's Decisions endpoint using the pinned `typesafe/jev-1.13` model. It prints only the returned model, answer labels, latency, and token counts; it never prints the key or submitted state. The command makes a negligible billable live request and is separate from the credential-free `verify` gate.

## Production build

```bash
npm run build
```

This proves the Vite production bundle compiles and then walks the emitted Vite manifest to reject feature-only PDF, DOCX, chart, ReactFlow, export, and Admin modules from the static `index.html` dependency graph. It does not prove authentication, database behavior, provider access, or production deployment.

## Production service-worker smoke

```bash
npm run test:sw
```

Run this after `npm run build`. It serves `dist/` through Vite preview and proves that a v2 worker cache upgrades to v3 and claims the page, a first-visited route and its display logo reload offline, an unvisited route shows recovery UI, an intent-prefetched route opens offline, and private API paths do not enter Cache Storage. It uses a stub session and blocks external requests, so it is not authenticated backend or deployed-host proof.

## Credential-free browser gate

```bash
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 npm run test:e2e
```

Playwright starts a new Vite server on `127.0.0.1:18080` and runs:

- desktop Chromium at 1280 by 800
- mobile Chromium using the Pixel 5 device profile

The server is never reused. CI uses retries and two workers. On failure, traces, screenshots, videos, and the HTML report stay in ignored `test-results/` and `playwright-report/` directories. CI may upload those credential-free artifacts for diagnosis.

`e2e/hungarian-parity.spec.ts` is the focused Hungarian browser contract. On desktop and mobile Chromium it checks persisted `<html lang="hu">`, public and authenticated page chrome, route titles, onboarding, saved-chat empty state, Library controls, Timer semantics, localized close labels, and runtime errors. It deliberately does not reject arbitrary English text because source titles, user content, model names, and citations may legitimately remain in their source language.

`src/test/i18n.test.ts` requires identical key sets and non-empty values across all three catalogs. Its explicit identity allowlist is limited to values that should remain canonical, such as product names, file formats, prices, model-facing abbreviations, and debate-format codes. A matching key set and a passing allowlist test prove catalog structure, not Hungarian grammar or natural phrasing.

The speech unit test proves that Hungarian selects `recognition.lang = 'hu-HU'`. Credential-free browser automation has no real microphone or speech service, so it does not prove recognition accuracy or hardware support.

AI client and Edge tests prove that every request path carries a validated language and that prompts require Hungarian output. Provider responses are mocked; only an authorized protected-staging run can prove that a live provider follows the instruction across every prose field.

## Full credential-free gate

```bash
npm run verify
```

The gate runs, in order:

1. documentation checks
2. lint
3. type checking
4. selected-scope coverage
5. collaboration service tests
6. native Edge Function tests
7. production build
8. production service-worker offline smoke
9. desktop and mobile Chromium

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

The wrapper acquires `~/.superset/debatelab-db.lock`, starts full local Supabase, runs `npm run test:db`, then holds the same lock while a controlled Mailpit relay, collaboration process, fake model provider, and Vite client run the real-Auth desktop/mobile workspace and full-stack feature journeys. Pull requests run this same gate in the `database-tests` job and retain its logs and browser traces on failure. It stops every owned process and the stack on exit, including after failure. Outside Superset, run only the database portion with:

```bash
supabase db start
npm run test:db
supabase stop --no-backup
```

The stack replays migrations and runs pgTAP tests. The browser portion creates isolated local users and deletes them, captures mail only in local Mailpit, restarts the collaboration process, and proves recovery and revocation. `CREATE INDEX CONCURRENTLY` requires the stated CLI floor so it runs outside the migration batch.

### Full-stack feature journeys

The same gate serves every Edge Function and runs `e2e/full-stack/` on desktop and mobile Chromium. Only the paid model provider is replaced: [`e2e/full-stack/fake-openrouter.mjs`](../e2e/full-stack/fake-openrouter.mjs) runs as a `node:22-alpine` container on the Supabase Docker network, and the functions reach it through `OPENROUTER_API_URL`. Real code handles everything else: Auth, demo-code sign-in, RLS, quota, source loading, prompt building, output validation, streaming, and persistence.

Each test signs in through the Login page with a fresh demo code and deletes that user afterwards. The specs cover:

- sign-in, reload, sign-out, a rejected code, and an expired token that refreshes before an AI request;
- case generation grounded in a 250 KB Library source, provider failure with retry, a zero quota, and a saved case that a fresh browser loads from History;
- Attack, Brainstorm, Factoids, streamed Ask (it fails if the client falls back to the non-streaming path), and Ask with citations;
- a judged Lincoln-Douglas sparring round and a Crossfire debrief;
- Library activation and deletion, output-language sync across devices, and flowchart saves;
- admin announcements seen by another user, denied admin access, and a public share link.

Tests assert the rendered result, what the Edge Function sent upstream (read back from the fake provider), and the resulting database rows. They also fail on any uncaught page error or horizontal page overflow. The fake provider rejects prompts it does not recognize, so a prompt change must update it.

These journeys do not prove live provider behavior, web research (the local stack has no search key), Jev decisions (the fake returns 503 and callers use their fallbacks), Stripe, or Google export.

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
