# Supabase staging environment + admin env switcher

## Goal

Have a parallel Supabase project (`debate-trainer-staging`) that mirrors prod's schema, so we can:
1. Test risky migrations / edge function changes without touching prod data.
2. Let admin users in the UI toggle the running app between prod and staging at runtime.

## What `supabase` CLI can and can't do

**Can do (verified 2026-05-19):**
- `supabase projects create <name> --org-id <id> --db-password <pw> --region <code>` — creates a new project under our org (`xfaxcdgescvjfckjsxqq` = Debate-Trainer). Returns a new project ref id and connection details.
- `supabase link --project-ref <ref>` — switch the local CLI context to a different project. Used to push migrations and deploy functions to staging.
- `supabase db push` — applies local migrations to whichever project is currently linked.
- `supabase functions deploy <name>` — deploys the local function code to the linked project.

**Can't do (manual steps):**
- Copy **secrets** (`OPENAI_API_KEY`, `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`, `EXA_API_KEY`, `STRIPE_*`) — must be set in the staging dashboard or via `supabase secrets set` per project.
- Copy **OAuth providers** (Google Sign-In is configured in the dashboard). Need to add the staging redirect URL to the Google OAuth client.
- Copy **data**. `supabase db dump` requires Docker; even if you run it, you usually don't want to copy real user data into staging. Better: seed with one test user.
- Configure **CORS** for the staging URL in the edge function code (the `ALLOWED_ORIGINS` arrays). If the staging frontend is hosted on a different URL, that URL must be added.

## Step-by-step staging clone

### 1. Create the project (5 min)

```bash
# Generate a strong password and save it locally first
STAGING_DB_PASSWORD=$(openssl rand -base64 32)
echo "$STAGING_DB_PASSWORD" > .staging-db-password.local    # gitignored

npx supabase projects create debate-trainer-staging \
  --org-id xfaxcdgescvjfckjsxqq \
  --db-password "$STAGING_DB_PASSWORD" \
  --region eu-north-1
```

Save the returned `Project Ref` — you'll need it everywhere below. Call it `STAGING_REF`.

### 2. Link & push migrations (5 min)

```bash
# Note current prod ref so we can switch back
PROD_REF=uziwdtkzofptihahfooo

# Switch to staging
npx supabase link --project-ref "$STAGING_REF"
npx supabase db push   # applies ALL local migrations from supabase/migrations/ to staging
```

If `db push` complains about missing migration history (it shouldn't on a fresh project, but just in case), repair it the same way we did for prod earlier.

### 3. Set secrets on staging (5 min, manual)

In the Supabase dashboard for `debate-trainer-staging` → **Project Settings → Edge Functions → Secrets**:

| Secret | Source |
|--------|--------|
| `OPENAI_API_KEY` | Same as prod, OR a separate dev key |
| `GOOGLE_API_KEY` | Same |
| `ANTHROPIC_API_KEY` | Same |
| `EXA_API_KEY` | Same |
| `STRIPE_SECRET_KEY` | **Use Stripe TEST key, not live** |
| `STRIPE_WEBHOOK_SECRET` | Generate a new test webhook in Stripe pointing at the staging webhook URL |
| `AI_DEFAULT_PROVIDER` | `google` |
| `AI_DEFAULT_MODEL` | `gemini-2.0-flash` |

### 4. Deploy edge functions to staging (5 min)

Still linked to staging:
```bash
npx supabase functions deploy ai
npx supabase functions deploy ai-stream
npx supabase functions deploy admin
npx supabase functions deploy share
npx supabase functions deploy export-gdoc
npx supabase functions deploy create-checkout
npx supabase functions deploy create-portal
npx supabase functions deploy stripe-webhook
npx supabase functions deploy redeem-promo
npx supabase functions deploy import-source
```

### 5. Update CORS allowlists in edge functions (one-time)

The `ALLOWED_ORIGINS` arrays in every edge function `index.ts` currently include `https://debate.pi-stack.org` and localhost variants. Add the staging frontend URL (e.g., `https://staging.debate.pi-stack.org` or whatever you pick). Commit that change to main.

### 6. Configure Google OAuth for staging (5 min, manual)

In Google Cloud Console → OAuth client used by Supabase Auth:
- Add the staging Supabase auth callback URL: `https://<staging-ref>.supabase.co/auth/v1/callback`
- Add the staging frontend URL to "Authorized redirect URIs"

Then in the staging Supabase dashboard → **Authentication → Providers → Google** → paste the same client ID/secret as prod (or a separate one if you want).

### 7. Switch local CLI back to prod (1 min)

```bash
npx supabase link --project-ref "$PROD_REF"
```

Verify: `npx supabase status` should show debate-trainer (prod) as linked.

## Admin-only env switcher in the UI

### Design

The Supabase URL and anon key are currently read from `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` at build time. To switch at runtime requires:

1. **Bundling both sets of credentials.** Add `VITE_SUPABASE_STAGING_URL` and `VITE_SUPABASE_STAGING_ANON_KEY` to `.env`. The staging anon key is safe to bundle (it's already public).

2. **A small env-resolver module** that reads `localStorage.getItem('debate-supabase-env')` on app start and exports the right URL/key.

3. **An admin-only UI toggle** in Settings → a new "Developer" card visible only when `is_admin = true`. Selecting "Staging" sets the localStorage flag and forces a full page reload (the supabase client and all auth state must be rebuilt).

### Hard truth: auth session does not survive the switch

The Supabase auth session is signed by the project's JWT secret. Switching projects = session is invalid. The user **will be logged out** and must re-sign-in to the other project.

We can't transparently switch users between projects unless:
- Both projects use the same auth provider (which they do — Google OAuth).
- The user is signed in to Google in their browser.
- The auth state in `localStorage` is cleared on switch so the new project performs a fresh sign-in.

That's an acceptable UX for an admin debugging tool, but worth being explicit.

### Files to create/touch

```
src/lib/supabase/env.ts          (NEW)  — reads/writes the env flag, exports URL/anon for the active env
src/lib/supabase/client.ts       (EDIT) — import from env.ts instead of import.meta.env directly
src/components/settings/
  AdminDeveloperPanel.tsx        (NEW)  — admin-only Settings card with the switcher
src/pages/SettingsPage.tsx       (EDIT) — render <AdminDeveloperPanel> when is_admin
.env.example                     (EDIT) — document the new VITE_SUPABASE_STAGING_* keys
```

### Behavior on switch

1. Confirm dialog: "Switch to Staging Supabase? You'll be signed out and need to sign in again on the staging project."
2. On confirm:
   - `supabase.auth.signOut()` (drops cookies)
   - `localStorage.removeItem('sb-<prod-ref>-auth-token')` and any cached tokens
   - `localStorage.setItem('debate-supabase-env', 'staging')`
   - `window.location.reload()`
3. App boots pointing at staging. User signs in. The Supabase auth session for staging is now stored under a different localStorage key (Supabase uses the project ref in the key by default), so there's no collision.

### Reversibility

To switch back to prod: same flow, set `'production'` (or just remove the key).

If the admin UI ever shows the wrong env or refuses to switch, the user can edit localStorage directly in DevTools and reload.

## Rollback / restore-to-here

This plan adds a staging Supabase project and a runtime switcher. Neither touches prod data or schema. To fully undo:

- Delete the staging project: `npx supabase projects delete <STAGING_REF>` (or via dashboard).
- Revert the frontend changes: `git revert <env-switcher-commits>`.

Prod (`uziwdtkzofptihahfooo`) is never modified by this plan.

## Acceptance criteria

- [ ] Staging project exists in the same org as prod.
- [ ] Staging has all migrations applied (`supabase migration list` shows alignment).
- [ ] Staging has all edge functions deployed.
- [ ] Staging has all required secrets set.
- [ ] Google OAuth works against staging (admin can sign in on staging).
- [ ] Admin user sees a "Developer" panel in Settings.
- [ ] Toggling the switch reloads the app, signs out, and the new auth signs in against the other project.
- [ ] Non-admin users do NOT see the switcher.

## Open questions to confirm before implementing

1. Where does the staging frontend live? Same Cloudflare tunnel + subdomain, or a separate Pi/deploy? This affects CORS and OAuth redirect URIs.
2. Do we want staging to use the same Google OAuth client as prod (simpler) or a separate one (more isolated)?
3. Do we want to seed staging with a known test user / test promo codes, or start truly empty?
