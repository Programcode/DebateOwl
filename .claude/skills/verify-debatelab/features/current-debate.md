# Current Debate

Each student works in one Current Debate at a time: a motion with its own Library sources and saved results. The header control starts or switches the debate, tools prefill its motion and use only its material, and a tool given a different motion asks first whether to start a debate for it or use it once. Nothing crosses debates. `src/lib/stores/debate-store.ts` owns this state, and the `debates` and `current_debates` tables hold it.

## Sub-features

- `debate-start` starts a debate from the header. The control's `aria-label` becomes `Current debate: <motion>`, and `debates` and `current_debates` get the row.
- `debate-offer` opens the dialog `Start a debate with this motion?` when a tool runs with a motion and no Current Debate exists. `Start debate` creates the debate and the run lands in it. `Not now, use it once` runs without one.
- `debate-once` opens the dialog `This is a different motion` when a Current Debate exists and the tool has another motion. `Use once without saving to a debate` runs with no debate material and saves nothing to a debate. `Create a new debate for this motion` switches to a new one.
- `debate-scope` keeps sources and results in their debate. The Library, the dashboard at `/app/debate`, History, and every AI request's system prompt see only the Current Debate's material.
- `debate-switch` switches back to an earlier debate through `Switch debate`, and the Library and History follow.
- `debate-tour` has a brand-new account start its first debate from the first onboarding step (`Start your first debate here.`).

## How to get to it (user POV)

- Header: the button with test id `current-debate-desktop` (desktop) or `current-debate-mobile` (mobile, on the second header row). It reads `Start debate` until a debate exists. After that it opens a dialog with `Start new debate` and `Switch debate`.
- Home (`/app`): the card with test id `home-current-debate`, which says `No current debate` for a new account.
- Every tool page shows the strip with test id `current-debate-strip` (`Working in: <motion>`), with a `Use once` button for one-off mode.
- The debate dashboard is `/app/debate`.
- A new account's onboarding tour starts on `/app` with a `Start debate` button in its first step.

## Driving it with verify.sh + Playwright

Preconditions:

- Doctor passes. The recipe `recipes/current-debate.spec.ts` covers every sub-feature: `bin/verify.sh drive recipes/current-debate`. The maintained specs are `e2e/full-stack/current-debate.spec.ts`, `first-run.spec.ts`, and `debate-context.spec.ts`.
- Helpers, re-exported from `recipes/fixtures.ts`: `startDebate(page, motion)`, `chooseForMotion(page, "create" | "once")`, and `debateControl(page)` (the visible header control on either viewport).

- **Start.** `await startDebate(page, motion)`. It clicks the header control, fills the dialog field labelled `Motion`, and clicks the dialog's `Start debate`. End state: `debateControl(page)` has `aria-label` `Current debate: <motion>`, and `current_debates.debate_id` for the user is that `debates` row.
- **Scope.** Add a source on `/app/library` with a unique marker (see [library-sources](./library-sources.md)); the test id `library-debate` names the motion. Run Brainstorm or Generate: the motion field already holds the debate's motion and no dialog opens. End state: the newest `providerCalls()` entry for the feature has this debate's marker in `system` and not another debate's. `sources.debate_id`, `cases.debate_id`, and `brainstorms.debate_id` point at the debate they were made in.
- **Offer.** With no debate, fill a tool's motion and submit. The dialog `Start a debate with this motion?` contains the motion. Click its `Start debate`. End state: the result shows, the strip reads `Working in: <motion>`, and `debates` holds exactly that motion.
- **Use once.** With a debate, submit a different motion. The dialog `This is a different motion` opens. `chooseForMotion(page, "once")`. End state: the provider call's `system` has no debate marker, and the header still names the old debate.
- **Dashboard.** `/app/debate`: `current-debate-motion` has the motion, `debate-side-pro` reads `In favor`, `debate-side-con` reads `Against`, and `debate-sources` and `debate-recent` list only this debate's work.
- **Switch.** Click `debateControl(page)`, then the dialog's `Switch debate`, then `Switch to <motion>`. End state: the Library shows only that debate's sources. In History, the `Brainstorms` and `Cases` tabs show only its results.
- **Tour.** Seed `debate-trainer-onboarding` with `hasCompletedOnboarding: false` once per session (see the recipe), sign in, and click the tooltip's `Start debate`. Fill `Motion`, click `Start debate`, click `[data-test-id="button-primary"]` twice, then `Get Started!`. End state: one `debates` row is current, and Generate opens prefilled with no dialog.

## Gotchas

- The motion dialogs open after the tool's submit button and before its AI request. Create the `aiResponse()` promise before the click, answer the dialog, then await it. Otherwise the wait times out with the dialog still open.
- `chooseForMotion` scopes itself to the two motion dialogs by name, because the next step may open its own dialog, such as the paywall `Free Trial Ended`.
- The Library's `Add Source` button is disabled until a Current Debate exists. Start one first.
- `getByRole("button", { name: "Start" })` also matches the header's `Start debate`. Use `exact: true` for other Start buttons, such as the speech timer's.
- In live mode, research can save web sources to the Library. Check the rows a recipe added by title rather than counting all of them.
- Debate context review (the `debate-context-control` line and its `Review` sheet with pins) is covered by `e2e/full-stack/debate-context.spec.ts`, not by a recipe.
