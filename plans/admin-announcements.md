# Admin announcements plan

**Status as of 2026-08-31:** Not implemented. This plan covers the missing announcement feature only.

## Goal

Let an administrator publish a short, dismissible in-app announcement to every authenticated user or to a bounded list of selected users. A user should see an active announcement after entering the app and after navigating to another app page until they dismiss it.

## Prerequisites and isolation

- Use Node 22.x as declared in `package.json`, npm, and the checked-in `package-lock.json`.
- Work in this plan's own isolated T3 Code worktree and feature branch. Before editing, run `pwd`, `git branch --show-current`, `git status --short --untracked-files=all`, and `git worktree list`. Confirm the worktree is not `main` and is not another plan worktree.
- Preserve every pre-existing dirty or untracked change. Do not reset, clean, checkout, or edit files outside this plan's scope.
- Verify the intended Supabase target before staging operations. Production migrations, Edge Function deployment, and publishing announcement content or audiences require Adam's explicit approval.
- Before browser checks, confirm port `18080` is unoccupied. With `CI=1`, the current `playwright.config.ts` starts a fresh Vite server instead of reusing another checkout.

## Current verified baseline

- `acaac0d` is the current `main`/`origin/main` head. `src/pages/AdminPage.tsx` has Usage Analytics, User Management, Promo Codes, and Subscribers tabs, but no announcement state, controls, or API calls.
- `supabase/functions/admin/index.ts` authenticates a Bearer token, checks `user_roles.role = 'admin'`, and uses the service-role client for existing admin actions. Its current actions do not include announcements.
- `supabase/migrations/20260204000000_admin_improvements.sql` creates `user_roles` and the existing admin/RLS foundation. No migration or table named `admin_announcements` or `user_announcement_dismissals` exists.
- `src/components/layout/AppLayout.tsx` renders the authenticated shell and `Outlet`, but it does not fetch or render announcements. `src/App.tsx` mounts it for all `/app/*` routes.
- `src/test/pages/AdminPage.test.tsx` covers the existing admin dashboard and grant-trial flow. There is no announcement unit or browser test.

## Remaining scope

Implement the feature as an additive migration, admin actions in the existing admin function, RLS-backed user reads/dismissals, an Admin page section, and a small layout/banner component. Use the existing `admin` function only for admin operations. The normal user path should use the authenticated Supabase client under RLS, so it does not turn the admin-only function into a mixed-privilege endpoint.

Do not add email delivery, push notifications, a second admin function, localStorage-only dismissal state, hard-delete behavior, or unrelated admin dashboard cleanup.

## Likely files

- Create: `supabase/migrations/20260831000000_admin_announcements.sql`
- Modify: `supabase/functions/admin/index.ts`
- Modify: `src/pages/AdminPage.tsx`
- Modify: `src/components/layout/AppLayout.tsx`
- Create: `src/hooks/use-announcements.ts`
- Create: `src/components/announcements/AnnouncementBanner.tsx`
- Modify: `src/test/pages/AdminPage.test.tsx`
- Create: `src/test/announcements/use-announcements.test.ts`
- Create: `src/test/components/AnnouncementBanner.test.tsx`
- Create: `e2e/announcements.spec.ts`

## Data and security design

1. Add `public.admin_announcements` with UUID primary key, non-empty bounded `title` and `body`, `target_type` (`all` or `users`), `target_user_ids uuid[]` defaulting to an empty array, `starts_at`, nullable `expires_at`, `is_active`, `created_by` referencing `auth.users` with `ON DELETE SET NULL`, and `created_at`/`updated_at` timestamps. Enforce that `all` has no target IDs and `users` has at least one target ID; reject an expiry before the start.
2. Add `public.user_announcement_dismissals` with an announcement foreign key and an `auth.users` foreign key, both cascading on deletion, `dismissed_at`, and primary key `(announcement_id, user_id)`. Add indexes for active announcements and user dismissals.
3. Enable RLS. Authenticated users may select only active, currently scheduled announcements targeted to them and with no matching dismissal. They may insert a dismissal only for their own `user_id`. Do not grant authenticated users update/delete access. The service role retains the admin function's server-side access.
4. In `admin/index.ts`, add a GET action named `announcements` for listing and POST actions named `create-announcement` and `deactivate-announcement`. Re-check the current admin role for each mutation, validate lengths, dates, target type, and target UUIDs, set `created_by` from the JWT user, and use `is_active = false` for reversible deactivation. Never return service credentials or internal policy errors.

## Sequenced implementation

### 1. Add the additive schema and RLS policies

Create the migration above. Keep the policy predicate responsible for audience, schedule, active state, and dismissal filtering. Include comments explaining that the migration is additive and that deactivation is preferred to deletion for auditability.

### 2. Add admin API actions

Extend `supabase/functions/admin/index.ts` using its existing auth and response conventions. List active and inactive rows for admins, create a validated announcement, and deactivate by UUID. Return stable JSON fields needed by the Admin page, including target IDs, status, and timestamps.

### 3. Add user read/dismiss behavior

Implement `use-announcements.ts` with an authenticated Supabase query and a dismiss mutation. Refresh on authenticated mount and pathname changes so an announcement appears after login and on the next page navigation. Treat a duplicate dismissal as success, and keep a failed network request non-fatal to the rest of the app.

### 4. Render the announcement in the shell

Add `AnnouncementBanner.tsx` with accessible title/body, close button, loading/error-safe behavior, and a layout that works on desktop and mobile. Render it from `AppLayout.tsx` without disrupting `Outlet`, navigation, or the existing auth boundary. Do not render stale, expired, inactive, or already dismissed announcements.

### 5. Add the admin controls

Add an Announcements tab or section to `AdminPage.tsx`. Reuse the existing authenticated admin request helpers and loaded user list for a bounded target selector. Support composing title/body, all-users versus selected-users targeting, optional start/expiry, listing status and use metadata, and reversible deactivation. Do not display or allow arbitrary SQL, service-role data, or a hard-delete button.

### 6. Add focused coverage and browser proof

Cover schema-facing request and dismissal behavior with the existing Supabase mock style, including audience filtering, schedule, dismissal idempotency, and unauthorized mutation handling. Cover Admin page create/list/deactivate requests and selected-user payloads. Cover banner rendering and dismissal. Add an authenticated Playwright flow that stubs the auth/data calls, verifies the banner on an app route, dismisses it, navigates, and confirms it does not reappear.

## Verification

Run the focused tests first:

```bash
npm test -- --run src/test/pages/AdminPage.test.tsx src/test/announcements/use-announcements.test.ts src/test/components/AnnouncementBanner.test.tsx
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 npm run test:e2e -- e2e/announcements.spec.ts
deno check supabase/functions/admin/index.ts
deno test --allow-read --allow-env=EXA_API_KEY --allow-net=127.0.0.1 supabase/functions/
```

Then run the repository gates on the implementation branch:

```bash
npm run lint
npm run typecheck
npm test
npm run build
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 npm run test:e2e
```

Inspect the migration and final diff. Confirm no policy grants a non-admin write to announcements and no dismissal write can name another user.

## Acceptance criteria

- An authenticated admin can create an announcement for all users or a validated selected-user list, and a non-admin receives `403` for every admin action.
- An active, scheduled all-user announcement appears only to authenticated users who have not dismissed it. A targeted announcement appears only to listed users. Before-start and expired announcements do not appear.
- Dismissal persists in `user_announcement_dismissals`; refreshing or changing routes does not show the same announcement again. Repeating the dismissal is harmless.
- Admins can list active/inactive announcements and deactivate one without destroying its record. The user path cannot update or delete announcement rows.
- The UI remains usable at desktop and mobile widths, has an accessible dismiss control, and does not break existing authenticated routes.
- Existing role checks, AI quota enforcement, subscription behavior, and admin actions remain unchanged.

## Rollout, rollback, and authorization

Apply the additive migration to staging first, verify policies with an admin and two ordinary test users, deploy the changed admin function if needed, then deploy the frontend. Production migration, function deployment, and public announcement content/audience require Adam's explicit approval for that environment. Do not run a migration against a target project until the linked project and current migration state are confirmed.

Rollback the feature by reverting the frontend/admin-function release and deactivating any published announcements. Keep the additive tables and rows for auditability. Dropping them or deleting announcement data is out of scope and requires a separate explicit approval after all code references are gone.
