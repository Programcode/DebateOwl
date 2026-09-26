# Library sources

Users save reference texts to their Library. Active sources ground AI requests: the Edge Function loads them server-side and puts them in the system prompt. Paused sources are excluded. Deletions persist across reloads.

## Sub-features

- `lib-add` adds a source with a title and content. It appears with its toggle on, and the banner `Grounding Active` shows.
- `lib-toggle` pauses a source through its switch, which keeps it out of prompts.
- `lib-ground` includes only active sources' text in the `system` of later AI calls (Generate, Brainstorm, and others).
- `lib-delete` deletes a source. It stays gone after a reload and in the `sources` table.
- `lib-erase` has Settings → `Delete All My Data` remove this account's sources and nobody else's.

## How to get to it (user POV)

- Desktop: `More` → `Library`. Mobile: `Open menu` → `Library`. Or go to `/app/library`.
- Settings (`/app/settings`) → `Delete All My Data`, for the erase path.

## Driving it with verify.sh + Playwright

Preconditions:

- Doctor passes. The user is signed in (`signedIn` fixture).

- **Add.** Click the button named `Add Source`. Fill the textbox named `Source title...`, fill the textbox named `Paste source content...` with a unique marker, and click `Save to Library`. The switch named `Toggle <title>` is checked. `sources` has a row with `is_active: true`.
- **Toggle.** Click the switch named `Toggle <title>`. It becomes not checked.
- **Ground.** Go to `/app/brainstorm` and run it (see [ai-tools](./ai-tools.md)). `providerCall("brainstorm").system` contains the active marker and does not contain the paused marker.
- **Delete.** Click the button named `Delete <title>` (use `exact`). The switch count drops to 0, and stays 0 after `page.reload()`. `sources` no longer has the title.
- **Erase.** On Settings, click `Delete All My Data`. In the dialog, fill `Type your email to confirm` with `user.email` and click the dialog's `Delete All My Data`. The text `Data Deleted` appears, and `sources` for the user is `[]`.

## Gotchas

- Large pastes, up to about 250 KB, are expected to work because sources load server-side. A 413 error means that regressed.
- When proving `lib-erase`, create a second user with `createDemoUser` and show its rows survive. Otherwise "erased everything" is not distinguishable from "erased the right things".
