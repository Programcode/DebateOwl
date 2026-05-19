# Admin Trial Gifts Plan

## Goal

Give admins an in-app control to grant one-month trial/pro access instead of relying on one-off production SQL.

## Data Model

Prefer using existing `user_settings` fields:

- `subscription_tier`
- `trial_ends_at`
- `daily_limit_override`
- `grace_period_ends_at`

Add audit table `admin_grants`:

- `id uuid primary key`
- `admin_user_id uuid not null`
- `target_user_id uuid not null`
- `grant_type text not null`
- `starts_at timestamptz not null`
- `ends_at timestamptz not null`
- `notes text`
- `created_at timestamptz default now()`

## Backend

1. Add admin edge function action `grant_trial`.
2. Validate target user exists.
3. Set `subscription_tier = 'trial'`, `trial_ends_at = now() + interval '1 month'`, and an appropriate daily limit.
4. Insert audit record.
5. Return updated user subscription status.

## Frontend

1. Add Admin page action on user rows: "Gift trial".
2. Confirm duration and optional note in a dialog.
3. Show current trial/pro/grace date in European date format.
4. Refresh user list after grant.

## Tests

- Admin function rejects non-admins.
- Grant updates the right user only.
- Admin UI calls the action and renders updated dates.

## Deployment

Run migration for audit table, deploy admin function, then frontend.
