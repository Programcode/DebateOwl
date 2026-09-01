# Supabase staging synchronization and switcher verification

## Goal

Finish the existing `debate-trainer-staging` project without recreating it or
replacing the existing runtime environment resolver. The remaining code work is
the admin-only environment switcher. The remaining operational work is applying
the two pending migrations and synchronizing the deployed functions and their
JWT settings, both of which need Adam's explicit authorization.

## Verified current state (2026-09-01, `79b65ca`)

`src/lib/supabase/env.ts` exports the `getActiveEnv`/`setActiveEnv` resolver and
the `debate-supabase-env` localStorage key. The staging browser suite shipped in
PR #21 and was hardened in PR #26/#27: `e2e/staging/auth.setup.ts` performs real
`demo-code-login` + `verifyOtp` authentication against staging, and the
`staging` Playwright project is gated behind a protected main-only job.

The staging migration sync (step 2 of the original plan) and the function/gateway
sync (step 3) are operational steps requiring Adam's explicit authorization, not
code work. They are tracked in the rollout section below.

The only unshipped code is the admin-only environment switcher.

## Remaining work: admin environment switcher

Preserve `getActiveEnv` and `setActiveEnv` in `src/lib/supabase/env.ts` and
restore an admin-only control around them. The likely files are
`src/components/features/settings/AdminDeveloperPanel.tsx` (new) and
`src/pages/SettingsPage.tsx` (render it only after the existing `isAdmin` check
succeeds). The control must sign out before switching, call `setActiveEnv`, and
reload. Reuse the existing translations in `src/locales/en.json`,
`src/locales/es.json`, and `src/locales/hu.json` when they match the UI.

Do not add `VITE_FORCE_SUPABASE_ENV` to the product runtime by default. The
staging Playwright setup can set
`localStorage['debate-supabase-env']='staging'` before app scripts run. Add a
staging-only build-time selector in `src/lib/supabase/env.ts` only if that
browser setup is demonstrably insufficient, and reject production values in
that test-only path.

Add focused tests in `src/test/supabase/env.test.ts` and
`src/test/components/AdminDeveloperPanel.test.tsx` (or extend the existing
settings-page test if that is the repository's established location). Cover
production default, localStorage staging selection, admin visibility, cancel,
sign-out, reload behavior, and the selected auth storage key. If a separate
test-only build selector is added, cover its staging-only validation there. Do
not expose service-role credentials in tests.

## Full acceptance gates

Repository gates must pass on the implementation branch before any remote
staging mutation:

```bash
npm ci
npm run lint
npm run typecheck
npx vitest run src/test/supabase/env.test.ts src/test/components/AdminDeveloperPanel.test.tsx
deno check supabase/functions/*/index.ts
npm test -- --coverage
npm run build
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 npm run test:e2e
```

Then, with explicit staging authorization and the migration/function baseline
captured:

```bash
npx supabase migration list --project-ref "$STAGING_REF" --output-format json
npx supabase functions list --project-ref "$STAGING_REF" --output-format json
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 npm run test:e2e:staging
```

The release record must include the current branch/commit, both remote lists,
the preflight results, the real authenticated browser evidence, and any CI
billing exception. It must not include secrets.

## Stop conditions

- Either ref is ambiguous, the CLI is linked to production, or a command would
  touch `uziwdtkzofptihahfooo`.
- The migration dry-run includes anything other than the two 20260830 files,
  detects divergent history, or asks for an unsafe repair.
- A migration, function deployment, secret change, OAuth change, or cleanup is
  attempted without explicit staging authorization.
- A required staging secret name is missing, a provider request is not
  configured, or the demo-code test identity is unavailable. Do not substitute
  production credentials or a real user.
- Function slugs, JWT flags, source hashes, or CORS results do not match the
  local contract.
- The requested hosted staging hostname or Google OAuth redirect has not been
  chosen and approved.
- Browser proof is only a mocked render, or the real staging path fails. Stop
  and retain the trace/screenshot/video instead of reporting success.

## Rollback

The two migrations are additive. If a staging regression appears, stop using
the affected sparring path and leave the columns/functions in place while the
implementation is corrected. A hand-written down migration, `DROP`, or
`TRUNCATE` requires a separate explicit staging authorization and a reviewed
rollback script. Do not edit migration history to hide a failed apply.

For function regressions, capture the current version/source-hash baseline and
redeploy the previously verified commit's exact function names to staging:

```bash
npx supabase functions deploy <function-name> --project-ref "$STAGING_REF" --use-api
```

Do not use `--prune`, delete the project, rotate secrets, or deploy the rollback
to production. Frontend changes to the existing switcher roll back through the
normal branch revert; changing the localStorage flag back to production and
reloading is the user-level recovery path.

## Authorization boundaries

- Read-only project, migration, function, secret-name, preflight, and status
  checks may run with secret-safe output.
- Applying migrations, deploying functions, creating test data, changing CORS,
  setting secrets, configuring OAuth, and staging cleanup require Adam's
  explicit authorization for the staging project.
- Provider keys, service-role keys, OAuth secrets, and demo-code plaintext stay
  in protected environment storage. They never enter the repository or chat.
- No command in this plan may migrate, deploy, seed, delete, or change secrets
  on production. Production remains a read-only comparison target only.
