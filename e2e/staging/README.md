# Stateful staging E2E

This directory is deliberately excluded from the ordinary `playwright.config.ts` suite and from `npm run verify`.

## Why it is separate

`auth.setup.ts` calls the deployed staging `demo-code-login` Edge Function. That operation is **stateful**:

- it reserves a use of the supplied demo code;
- it can create the demo user;
- it updates the demo user's role/settings;
- the live Sparring canary consumes AI provider quota and writes normal usage telemetry.

Do not run this suite on pull-request code merely because credentials happen to be available.

## Required environment

Provide these values through the shell or an approved secret store. Never commit them to the repository or print them in logs.

```text
E2E_STAGING_SUPABASE_URL
E2E_STAGING_ANON_KEY
E2E_STAGING_DEMO_CODE
```

The anon key is a browser credential, but keep the harness configurable so the test cannot silently point at the wrong project. The demo code is reusable access material and must be treated as a secret.

Optional:

```text
STAGING_PLAYWRIGHT_BASE_URL=http://localhost:8080
```

The frontend process is forced to `VITE_FORCE_SUPABASE_ENV=staging` by `playwright.staging.config.ts`.

## Run

Only after remote staging mutation has been explicitly authorized:

```bash
npx playwright install chromium
npm run test:e2e:staging
```

The setup exchanges the demo code for a real staging session and saves only the browser storage state under ignored `test-results/.auth/`. The authenticated project then verifies that the session survives reload and that one real Sparring opponent request can travel end to end.

## Pull-request safety

Do not add this config to ordinary pull-request CI with staging secrets. Pull-request code controls the test process and must not receive reusable staging credentials.
