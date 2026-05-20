# Top Users Email Fallback Plan

## Goal

Top Users should always show a readable email when available and only fall back to user ID when no email exists.

## Implementation Steps

1. Review `get_usage_by_user` SQL and Admin page mapping.
2. Ensure SQL joins auth/user metadata or cached profile data.
3. Return fields:
   - `user_id`
   - `email`
   - `display_name`
   - `request_count`
   - `last_request_at`
4. Frontend display order:
   - email
   - display name
   - shortened user ID
5. Add a tooltip or secondary text with user ID for admin debugging.

## Tests

- SQL/function test with email present.
- SQL/function test with missing email.
- Admin UI test that email wins over ID.

## Deployment

Apply SQL migration or function update, verify production RPC manually, then deploy frontend if needed.
