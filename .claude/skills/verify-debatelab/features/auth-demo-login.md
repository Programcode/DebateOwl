# Demo-code sign-in

A visitor signs in with a demo access code on the Login page. The `demo-code-login` Edge Function creates or reuses a Pro account, the session survives a reload, and signing out sends protected routes back to `/login`.

## Sub-features

- `auth-demo-signin` signs in with a valid code and lands on `/app`.
- `auth-persist` keeps the session after a reload, and Settings shows the account email.
- `auth-reject` shows the alert `Demo code not found.` for an unknown code and stays on `/login`.
- `auth-signout` signs out from Settings, after which `/app/generate` redirects to `/login`.
- `auth-refresh` refreshes an expired access token before an AI request.
- `auth-session-expired` signs out a session the server revoked: the stored tokens are refused, so the app goes to `/login` and shows `Your session expired. Sign in again.` once (`recipes/auth.spec.ts`).
- `auth-email-link` opens the sign-in link from the email after a resend failed with 429. It lands on `/app` through `/auth/callback` without showing `/login` on the way, and the same link opened again shows `This sign-in link has expired or was already used. Send a new code.` on `/login` (`recipes/auth.spec.ts`).
- `auth-deep-link-email-code` opens `/app/generate` signed out, lands on `/login` (one `main`, an `h1`), sends a code, and sees `Resend in 0:NN` disabled. A wrong code shows `That code is wrong or has expired. Check it or send a new one.`. After the countdown it resends (`New code sent`, the old error gone), and the new code returns to `/app/generate` (`recipes/auth.spec.ts`).
- `auth-same-account-after-sign-out` signs out from Settings and signs the same account back in by email code: it lands on `/app`, not Settings. A session that ends by itself still returns the account to the page it left (`recipes/auth.spec.ts`).
- `auth-switch-account` signs out from Settings (the logout request has `scope=local`) and signs a second account in on the same `/login` page. It lands on `/app`, not on Settings, and gets its own onboarding tour. On phones the menu still opens and navigates while the tour shows (`recipes/auth.spec.ts`).

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
- **Email link.** Local email templates are code-only, so the recipe builds the link prod's email carries: `${LOCAL_SUPABASE_URL}/auth/v1/verify?token=pkce_<sha224(email + code)>&type=magiclink&redirect_to=<redirect_to of the /auth/v1/otp request>`. The `redirect_to` is `http://127.0.0.1:18081/auth/callback?sb_flow_id=<32 hex>`. Route `**/auth/v1/otp**` to a 429 before clicking `Resend code` to reproduce the failed resend.
- **Resend countdown.** After each send, `Resend code` is disabled and named `Resend in 0:NN` for a minute (or as long as a 429 asked). The deadline is in sessionStorage under `debatelab:otp-resend-until:<email>`; set it to `0` to end the wait, and the button turns back within a second (`expireResendCooldown` in `recipes/auth.spec.ts`). Sending again to the same address before then opens the code step without a request.
- **Switch account.** After `Sign out`, sign the second account in on the same `/login` page. `page.goto("/login")` drops the history state that the bug depended on. Create the second user with `createDemoUser` and delete it in `finally`.
- **Revoked session.** Signed in on `/app`, replace `access_token` in the `debate-auth-local` localStorage entry with a JWT the server refuses, `refresh_token` with `x`, and `expires_at` with now + 3000 s, then reload. Within a few seconds the URL matches `/login` and a `status` element says `Your session expired. Sign in again.`. A second reload no longer shows it.

## Gotchas

- A first sign-in on a new account starts the onboarding tour on `/app`. Its first step (`Welcome to DebateLab!`, `Start your first debate here.`) offers `Start debate`. The fixtures pre-seed `debate-trainer-onboarding` to skip it. The tour is tracked per account (store version 1, `completedUserIds`). A version 0 seed with `hasCompletedOnboarding: true` covers only the next account that signs in, so a second account in the same browser sees the tour. Interactive runs click `Skip Tour` (`[data-test-id="button-skip"]`). The tour itself is covered in [current-debate](./current-debate.md).
- Sessions are stored under the `debate-auth-local` localStorage key in local-preview mode. Don't reuse stub-session helpers (`e2e/helpers/auth.ts`). They fake auth and prove rendering only.
- Google sign-in is not wired to the local stack. Demo codes, email codes and the email link work here.
- The revoked-session check forces one token refresh before it signs out. An Auth outage (network error, 5xx, 429) keeps the session, and that path is covered by `src/test/auth/session-expiry.test.ts`, not by a recipe.
