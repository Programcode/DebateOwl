# Library sources

Users save reference texts to their Library. The Library belongs to the Current Debate: each source has a `debate_id`, and the page shows only the Current Debate's sources (test id `library-debate` names the motion). Active sources ground AI requests: the Edge Function loads them server-side and puts them in the system prompt. Paused sources are excluded. Deletions persist across reloads.

## Sub-features

- `lib-add` adds a source with a title and content. It shows at once while it saves, then a toast `Saved <title> to the Library`; its toggle is on, and the banner `Grounding Active` shows.
- `lib-toggle` pauses a source through its switch, which keeps it out of prompts.
- `lib-offline` offline, the switch does not move and a toast says `You are offline. Reconnect and try again.` A write that fails online puts the switch back with a toast.
- `lib-dedupe` keeps one row per web page per debate. URLs match after normalizing (host without `www.`, no scheme, fragment, tracking parameters or trailing slash). Importing a page the debate has warns `This page is already in this debate's Library.` before any fetch; research refreshes the existing row instead of adding one.
- `lib-layout` on a phone the row's controls take their own line, so a long title gets the row's width and two lines.
- `lib-ground` includes only active sources' text in the `system` of later AI calls (Generate, Brainstorm, and others).
- `lib-delete` deletes a source. It stays gone after a reload and in the `sources` table.
- `lib-counts` the Current Debate summary on `/app` shows `<total> sources (<active> active)`, and Ask's `Using <n> sources` counts the same active sources.
- `lib-import` imports a web page by URL through the `import-source` Edge Function, which fetches the page itself (no Exa), so it works in both modes when the VPS has outbound internet.
- `lib-erase` has Settings → `Delete All My Data` remove this account's sources and nobody else's.

## How to get to it (user POV)

- Desktop: `More` → `Library`. Mobile: `Open menu` → `Library`. Or go to `/app/library`.
- Settings (`/app/settings`) → `Delete All My Data`, for the erase path.

## Driving it with verify.sh + Playwright

Preconditions:

- Doctor passes. The user is signed in (`signedIn` fixture). A Current Debate exists: `await startDebate(page, motion)`. Without one, `Add Source` stays disabled.

- **Add.** Click the button named `Add Source`. Fill the textbox named `Title` (exact), fill the textbox named `Content` (exact) with a unique marker, and click `Save to Library`. Leaving either empty shows an inline error under the field and moves focus to it. The switch named `Toggle <title>` is checked. `sources` has a row with `is_active: true` and the debate's `debate_id`.
- **Toggle.** Click the switch named `Toggle <title>`. It becomes not checked.
- **Offline toggle.** `page.context().setOffline(true)`, click the switch: the offline toast shows, the switch stays checked, and the row's `is_active` is unchanged. Set offline back to false.
- **Duplicate import.** Insert a URL source through `admin`, then import the same page with `?utm_source=x#top`: the duplicate warning shows and no `import-source` request is made.
- **Phone layout.** At a 360px viewport the title button is wider than 200px and the page has no sideways scroll.
- **Ground.** Go to `/app/brainstorm`; the motion is prefilled from the debate. Run it (see [ai-tools](./ai-tools.md)). `providerCall("brainstorm").system` contains the active marker and does not contain the paused marker.
- **Delete.** Click the button named `Delete <title>` (use `exact`). It deletes at once, with no confirmation, and a toast `Deleted <title>` offers `Undo`, which saves the source again. The switch count drops to 0, and stays 0 after `page.reload()`. `sources` no longer has the title.
- **Counts.** Insert 7 URL sources through `admin`, 5 with `is_active: true`. `/app` test id `home-current-debate` contains `7 sources (5 active)`; on `/app/ask` test id `debate-context-control` contains `Using 5 sources`.
- **Import.** In the add panel, fill `Import from URL` and click `Import URL`. The `Import preview` panel appears, then `Save imported source` stores a row whose `origin` is the URL.
- **Erase.** On Settings, click `Delete All My Data`. In the dialog, fill `Type your email to confirm` with `user.email` and click the dialog's `Delete All My Data`. The text `Data Deleted` appears, and `sources` for the user is `[]`.

## Gotchas

- Large pastes, up to about 250 KB, are expected to work because sources load server-side. A 413 error means that regressed.
- Another debate's sources are hidden, not deleted. To prove scoping across debates, see [current-debate](./current-debate.md).
- When proving `lib-erase`, create a second user with `createDemoUser` and show its rows survive. Otherwise "erased everything" is not distinguishable from "erased the right things".
