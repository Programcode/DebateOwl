# Supabase staging synchronization and switcher verification

## Goal

Finish the existing `debate-trainer-staging` project without recreating it or
replacing the existing runtime environment resolver. As of 2026-08-31 the
remaining work is to apply the two latest migrations, synchronize the 11
deployed functions and their JWT settings, prove the required staging secrets
and auth path, and verify the existing switcher safely.

## Verified current state

- `supabase projects list` reports both `debate-trainer`
  (`uziwdtkzofptihahfooo`) and `debate-trainer-staging`
  (`brifeyypjauyusmkptkx`) as `ACTIVE_HEALTHY`. The staging project was
  created on 2026-05-20 in the same organization and is not the linked local
  project.
- The local repository has 23 migration files. A read-only
  `npx supabase migration list --project-ref brifeyypjauyusmkptkx` shows 21
  applied migrations and exactly these two missing migrations:
  `20260830000000_complete_sparring_sessions` and
  `20260830000001_index_sparring_sessions_concurrently`.
- The local repository has 11 deployable functions. Staging has all 11 active,
  but its versions predate the current checkout for several functions. Its
  current `verify_jwt` values also differ from `supabase/config.toml` for
  `export-gdoc`, `create-checkout`, `create-portal`, `import-source`, and
  `redeem-promo`. The sync must correct both code and gateway settings.
- `supabase secrets list --project-ref brifeyypjauyusmkptkx` reports 16 secret
  names, including the provider keys, `DEMO_CODE_PEPPER`, Google OAuth values,
  and Supabase platform values. `STRIPE_SECRET_KEY` and
  `STRIPE_WEBHOOK_SECRET` are absent. Secret-name presence does not prove that a
  provider request or OAuth flow works. Do not print or copy any value.
- `src/lib/supabase/env.ts` already contains the production and staging URL/key
  pairs and localStorage selection through `getActiveEnv` and `setActiveEnv`.
  `src/lib/supabase/client.ts` uses the selected environment's auth storage key.
  `src/pages/SettingsPage.tsx` has the existing `isAdmin` gate, but `rg`
  confirms that nothing on current `main` calls `setActiveEnv`. The exact
  `VITE_FORCE_SUPABASE_ENV` and `AdminDeveloperPanel.tsx` identifiers are not
  present. Preserve the resolver and gate while restoring the admin-only UI;
  use the existing localStorage mechanism for E2E unless a separate forced
  build-time selector is proven necessary.
- Function CORS responses already accept `http://localhost:8080` and return the
  expected origin for staging preflight requests. No hosted staging hostname
  has been approved, so do not add a speculative domain to the function code.
- Git history contains the earlier switcher implementation in `e1e2143`; the
  current `main` checkout retains its resolver groundwork but not that exact
  panel. The backend/client contracts include Crossfire and sparring changes
  from `f1ce741` and `0b94c9e`.

Project creation, full-clone work, and the resolver groundwork are complete and
must not be repeated. The admin UI around that resolver is still required.

## Preconditions and isolation

The implementation agent must work from its own isolated T3 Code worktree and
feature branch. It must not use the `main` checkout or another plan's
worktree. Before edits or remote commands, run:

```bash
pwd
git branch --show-current
git worktree list --porcelain
git status --short --branch
```

Stop if the worktree or branch is wrong, if unrelated dirty state is present,
or if either project ref does not match the verified values above. Use explicit
`--project-ref` arguments. Do not relink the checkout to production.

## Remaining work

### 1. Capture a safe remote baseline

Read-only commands:

```bash
STAGING_REF=brifeyypjauyusmkptkx
PROD_REF=uziwdtkzofptihahfooo
npx supabase projects list --output-format json
npx supabase migration list --project-ref "$STAGING_REF" --output-format json
npx supabase functions list --project-ref "$STAGING_REF" --output-format json
npx supabase secrets list --project-ref "$STAGING_REF" --output-format json
```

Record only project status, migration IDs, function slugs/versions/JWT flags,
secret names, and timestamps. Never record key values, tokens, connection
strings, or auth credentials. Confirm the dry-run below lists only the two
missing migration IDs before applying anything.

### 2. Apply the two missing migrations to staging

Files reviewed:

- `supabase/migrations/20260830000000_complete_sparring_sessions.sql`
- `supabase/migrations/20260830000001_index_sparring_sessions_concurrently.sql`

The first migration adds the shipped sparring columns, policies, clear-marker
fence, and service-role claim functions. The second adds the user/update index
outside a transaction. These are additive changes needed by the current
sparring client and must run in timestamp order.

Dry-run and apply, targeting staging explicitly:

```bash
npx supabase db push --project-ref "$STAGING_REF" --dry-run
npx supabase db push --project-ref "$STAGING_REF"
npx supabase migration list --project-ref "$STAGING_REF" --output-format json
```

The dry-run must name only `20260830000000` and `20260830000001`. The final
list must show all 23 local IDs applied with no divergent or unexpected remote
rows. If the dry-run proposes an earlier migration, a history repair, a role
change, or any production ref, stop for review. `db push` is the only staging
data/schema mutation in this step and requires Adam's explicit authorization.

### 3. Synchronize current function code and gateway settings

Local function sources are the 11 directories under `supabase/functions/`:

```text
admin
ai
ai-stream
create-checkout
create-portal
demo-code-login
export-gdoc
import-source
redeem-promo
share
stripe-webhook
```

After the migration succeeds, deploy exactly those names to staging without
pruning anything:

```bash
npx supabase functions deploy \
  admin ai ai-stream create-checkout create-portal demo-code-login \
  export-gdoc import-source redeem-promo share stripe-webhook \
  --project-ref "$STAGING_REF" --use-api
npx supabase functions list --project-ref "$STAGING_REF" --output-format json
```

Verify that all 11 are `ACTIVE`, the deployment timestamps and source hashes
are current for the implementation commit, and `verify_jwt` matches the local
`supabase/config.toml` contract. Do not use `--prune`, deploy to `PROD_REF`,
or redeploy unrelated functions after the evidence check. Function deployment
is a staging mutation and requires Adam's explicit authorization.

### 4. Verify secrets and browser CORS without changing them

The operator must compare the staging secret-name list with what the current
browser-facing functions require: `OPENAI_API_KEY`, `GOOGLE_API_KEY`,
`ANTHROPIC_API_KEY`, `EXA_API_KEY`, `DEMO_CODE_PEPPER`, Google OAuth
configuration, and the Supabase platform values. If a required name is absent,
stop and have Adam supply a staging-only value through the Supabase dashboard or
`supabase secrets set`. Never paste a secret into a file, command output,
commit, PR, or chat, and do not copy production provider values by default.

Check the already-supported local caller without mutating data:

```bash
for fn in admin ai ai-stream create-checkout create-portal demo-code-login \
  export-gdoc import-source redeem-promo share; do
  /usr/bin/curl -sS -D - -o /dev/null -X OPTIONS \
    "https://brifeyypjauyusmkptkx.supabase.co/functions/v1/$fn" \
    -H 'Origin: http://localhost:8080'
done
```

Each response must be 200 or 204 and return
`Access-Control-Allow-Origin: http://localhost:8080`. A hosted staging URL is
not part of this plan. If Adam later chooses one, stop and obtain the exact
hostname plus OAuth redirect approval before editing every affected function's
allowlist.

`stripe-webhook` is server-to-server and is intentionally excluded from this
browser CORS loop. Its staging `STRIPE_SECRET_KEY` and
`STRIPE_WEBHOOK_SECRET` are currently missing. If Stripe behavior is in scope,
Adam must provide staging-only Stripe test credentials and configure a test
webhook endpoint. Verify it with a signed Stripe test event and the resulting
database state, not with a browser preflight or a fabricated 200/204 response.

### 5. Implement and prove the staging auth path and admin switcher

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

Then use the protected test identity and code prepared for the verification
plan. The real browser setup belongs in `e2e/staging/auth.setup.ts` and must
call the staging `demo-code-login` function followed by anon-client
`verifyOtp({ type: 'magiclink' })`. Before the app loads, set the existing
`localStorage['debate-supabase-env']` key to `staging`. It must not use
production or a service-role key. Acceptance requires:

1. The test identity can authenticate on staging and remains authenticated
   after a page reload.
2. One bounded source read/write and one short AI request reach staging and
   return the expected response, with no browser console error.
3. A staging admin account sees `Developer` in
   `src/components/features/settings/AdminDeveloperPanel.tsx`; a non-admin
   account does not.
4. Confirming the panel switch signs out, updates
   `localStorage['debate-supabase-env']`, reloads, and uses the other project's
   auth storage key. Cancel leaves the current environment unchanged.

The staging browser flow may run locally or from the protected main-only job
described in `plans/agent-verification-loop.md`. It must never receive staging
secrets on pull-request jobs.

## Full acceptance gates

Repository gates must pass on the implementation branch before any remote
staging mutation:

```bash
npm ci
npm run lint
npm run typecheck
npx vitest run src/test/ai/sparring.test.ts supabase/functions/ai/sparring-persistence.test.ts
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
