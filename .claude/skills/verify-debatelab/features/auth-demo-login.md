# Demo-code sign-in

A visitor signs in with a demo access code on the Login page. The `demo-code-login` Edge Function creates or reuses a Pro account, the session survives a reload, and signing out sends protected routes back to `/login`.

## Sub-features

- `auth-demo-signin` signs in with a valid code and lands on `/app`.
- `auth-persist` keeps the session after a reload, and Settings shows the account email.
- `auth-reject` shows the alert `Demo code not found.` for an unknown code and stays on `/login`.
- `auth-signout` signs out from Settings, after which `/app/generate` redirects to `/login`.
- `auth-refresh` refreshes an expired access token before an AI request.

## How to get to it (user POV)

- Open `/login`, or any `/app/*` route while signed out (it redirects).
- In Settings (`/app/settings`, or the gear link named `Settings` in the header), choose `Sign out`.

## Driving it with verify.sh + Playwright

Preconditions:

- Doctor passes. For interactive runs, `bin/verify.sh user` has printed a `DEMO_CODE`. Scripted runs get one from the `user` fixture.

- **Sign in.** Go to `/login`, click the tab named `Demo code`, and fill the textbox named `Demo code`. Then click the button named `Sign in with demo code`. The URL becomes `/app`. This is the `signIn()` helper in `e2e/full-stack/stack.ts`.
- **Account row.** Read `user_settings` through `admin` for `await user.userId()`. It shows `subscription_tier: "pro"` and `daily_limit_override: 999`.
- **Persist.** Reload the page. The URL stays `/app`. On `/app/settings`, the page shows `user.email`.
- **Reject.** On a signed-out page, submit `DEMO-ZZZZ-ZZZZ`. The element with role `alert` has the text `Demo code not found.`, and the URL still matches `/login`.
- **Sign out.** On `/app/settings`, click the button named `Sign out`, then go to `/app/generate`. The URL matches `/login`.

## Gotchas

- A first sign-in on a new account starts the onboarding tour on `/app`. The fixtures pre-seed `debate-trainer-onboarding` to skip it. Interactive runs click `[data-test-id="button-skip"]`.
- Sessions are stored under the `debate-auth-local` localStorage key in local-preview mode. Don't reuse stub-session helpers (`e2e/helpers/auth.ts`). They fake auth and prove rendering only.
- Google sign-in is not wired to the local stack. Only demo codes work here.
