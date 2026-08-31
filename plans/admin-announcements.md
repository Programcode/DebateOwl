# Admin Announcements Plan

## Goal

Allow admins to send a one-time dismissible announcement to all users or selected users. Users should see it on login or next page change.

## Data Model

Create `admin_announcements`:

- `id uuid primary key`
- `title text not null`
- `body text not null`
- `target_type text check in ('all', 'users')`
- `target_user_ids uuid[] null`
- `starts_at timestamptz default now()`
- `expires_at timestamptz null`
- `deactivated_at timestamptz null`
- `created_by uuid not null`
- `created_at timestamptz default now()`

Create `user_announcement_dismissals`:

- `announcement_id uuid references admin_announcements(id)`
- `user_id uuid not null`
- `dismissed_at timestamptz default now()`
- primary key `(announcement_id, user_id)`

## Backend

1. Add admin endpoints to existing `admin` edge function:
   - create announcement.
   - list announcements.
   - deactivate an announcement without deleting dismissal history.
   - explicitly delete an announcement when permanent removal is intended.
2. Add authenticated non-admin endpoint:
   - fetch active announcements for current user.
   - dismiss announcement.
3. Enforce admin status server-side using `user_roles`.

## Frontend

1. Add Admin page section for composing announcements.
2. Add user selector for targeted sends.
3. Add global announcement banner/modal in `AppLayout`.
4. Store dismissed state in Supabase, not only localStorage.

## Tests

- RLS/admin endpoint tests, including deactivation and dismissal-history retention.
- Admin UI tests for create/list/deactivate/delete.
- Layout test for showing and dismissing an announcement.

## Deployment

Apply migration, deploy admin function, then deploy frontend.
