# Account data: export and deletion

From Settings, a signed-in user can download everything saved to the account as one JSON file, or delete the account permanently. Both go through the `account` Edge Function, which acts only on the caller's own session and ignores any user id in the request. Deletion first checks Stripe for the user's customers and cancels any subscription, then removes every row that references the user. `Delete all my data` is the older, narrower erase: it keeps the account and removes its saved work.

## Sub-features

- `acct-export`: `Download my data` saves `debatelab-data-YYYY-MM-DD.json` with `format: "debatelab-account-export"`, the caller's `account` (`id`, `email`), and `data` (debates, sources, and saved results). Another account's rows never appear, even when the request names that account's id.
- `acct-delete`: `Delete account` opens `Delete your account?`. Its confirm button stays disabled until the field labelled `Type your email to confirm` holds the account email. After deletion, the toast reads `Account deleted` and the app returns to `/`. The auth user and every row mentioning its id, in the `public` and `private` schemas, are gone. Nobody else's rows change, and the old session gets `401`.
- `acct-erase`: `Delete all my data` with the same email confirmation shows `Data Deleted` and empties the account's sources and debates. A bystander's rows stay. This is covered by `e2e/full-stack/account-data.spec.ts`, not by a recipe.

## How to get to it (user POV)

- Settings: the gear link named `Settings` in the header, or `/app/settings`. `Download my data` is under `Your data` in the Account card. `Delete all my data` and `Delete account` are in the Danger Zone card.

## Driving it with verify.sh + Playwright

Preconditions:

- Doctor passes. The recipe `recipes/account-data.spec.ts` covers export and deletion: `bin/verify.sh drive recipes/account-data`. The maintained specs are `e2e/full-stack/account-deletion.spec.ts` and `account-data.spec.ts`.
- Each test creates a bystander with `createDemoUser(...)`, signs it in through its own browser context, and gives it a debate and a source. `deleteDemoUser(other)` runs in `finally`.

- **Export.** Start a debate and add a source (see [current-debate](./current-debate.md)). On `/app/settings`, wait for `page.waitForEvent("download")` while clicking `Download my data`. End state: the filename matches `^debatelab-data-\d{4}-\d{2}-\d{2}\.json$`. The JSON's `account.id` is the user's, `data.debates` and `data.sources` hold only this account's rows, and the bystander's marker is absent. Posting `{action: "export", userId: <bystander>}` with the user's token still returns the caller.
- **Delete.** First, show the guards hold. With no token, `delete` and `export` return `401`. With the user's token, `{action: "delete", confirmation: <bystander email>, userId: <bystander id>}` returns `400` and both users still exist. Then, on `/app/settings`, click `Delete account`. In the dialog, check the dialog's `Delete account` button is disabled, fill `Type your email to confirm` with `user.email`, and click it. End state: `Account deleted` shows and the URL is `/`. `admin.auth.admin.getUserById(userId)` returns no user, and a scan of every `public` and `private` table (through `COLLABORATION_DATABASE_URL`) finds no row mentioning the id. `fake.requests()` has exactly one `stripe-customer-search` for `metadata['user_id']:'<id>'`, the bystander's source survives, and the old token gets `401` from `export`.

## Gotchas

- Delete only the fixture's own demo user, whose email ends in `@fullstack.test`. The recipe asserts that before it clicks. Never point it at an account you did not create in the test.
- The fixture's teardown deletes the user again. That is a no-op after a successful deletion and still removes the demo code row.
- Locally, Stripe is the fake provider container (`STRIPE_API_URL` in `.superset/workspace-test.env`), and test accounts have no customers. Real Stripe cancellation is not provable here.
- The direct function calls take the session token from the `debate-auth-*` localStorage key. Keep that token out of evidence files.
