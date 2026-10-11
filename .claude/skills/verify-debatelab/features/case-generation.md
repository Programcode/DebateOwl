# Case generation

A signed-in user enters a motion on Generate and receives a structured debate case: thesis, framework, contentions, the predicted opponent case, and counters. The case can be saved to the account and reopened from History, or exported as PDF or DOCX.

## Sub-features

- `gen-create` generates a case from the Current Debate's motion. The `ai` Edge Function calls the provider and records `ai_requests` with `feature: generate, status: success`. The case is filed in the debate automatically (`cases.debate_id`, `side: pro`); there is no Save button in a debate.
- `gen-grounded` includes active Library sources in the system prompt (see [library-sources](./library-sources.md)).
- `gen-error` shows `Generation Failed` on a provider error, and the button becomes enabled again for a retry.
- `gen-quota` shows the dialog `Daily Access Paused` when the account has no quota, without calling the provider.
- `gen-save` saves a one-off case (the motion dialog answered with `Not now, use it once`) under a title into `cases` with `debate_id: null`. It appears in History under `One-off and unsorted work`, including from a fresh browser context.
- `gen-regenerate` regenerates one section. Only that section shows the overlay `Regenerating <section>…`; the rest of the case and the result toolbar stay on screen, and every regenerate button and the form's submit button are disabled until it finishes.
- `gen-export` downloads a `.pdf` (starting with `%PDF`) and a `.docx` (starting with `PK`).

## How to get to it (user POV)

- The header link `Generate`, or the Home card with `data-tour="mode-generate"`, or `/app/generate`.
- History: `More` → `History` on desktop, `Open menu` → `History` on mobile, or `/app/history`.

## Driving it with verify.sh + Playwright

Preconditions:

- Doctor passes. The recipe `recipes/case-generation.spec.ts` covers every sub-feature below: `bin/verify.sh drive recipes/case-generation`.

- **Start the debate.** `await startDebate(page, motion)`. On `/app/generate`, the textbox named `Motion / Topic *` already holds the motion.
- **Generate.** Click the button named `Generate Debate Case`. The text `FAKE-PROVIDER case thesis` and `FAKE-PROVIDER contention 3` appear, along with a toast `Generate complete`. Without a Current Debate, fill the motion yourself and answer the dialog `Start a debate with this motion?` with `chooseForMotion`.
- **Provider side effect.** `providerCall("generate")`'s `user` contains `Motion: <motion>`. `ai_requests` for the user contains `{feature: "generate", status: "success"}`.
- **Filed in the debate.** `cases` for the user is one row whose `debates(motion)` is the motion. On a fresh browser context, `/app/history` shows it as a heading in the `Cases` tab panel, and `Load` reopens it.
- **Save (one-off).** Generate with no debate and choose `chooseForMotion(page, "once")`. Click the button named `Save` (use `exact`), fill the dialog field labelled `Case title`, and click the dialog's `Save` button. `cases` for the user is `[{title, debate_id: null}]`. On a fresh browser context, `/app/history` shows `One-off and unsorted work` with a list item holding the title.
- **Error.** Call `await fake.fail("generate", 500)`, start the debate, and generate. An `alert` holding `Generation Failed` stays above the results with a `Retry` button; clicking `Retry` succeeds and removes it.
- **Cancel.** While a generation runs, the results column shows `Writing your case…` and a `Cancel` button. Cancel stops the request and shows no error.
- **Quota.** Update `user_settings` to set `daily_limit_override: 0` through `admin`, start the debate, then generate. The dialog shows `Daily Access Paused`. `fake.requests()` has no `generate` entry.
- **Regenerate a section.** After generating, click the button named `Regenerate Arguments` (the section titles are `Case Structure`, `Arguments`, `Predicted Opponent Case`, `Prepared Counters`). Hold the request with `page.route("**/functions/v1/ai", ...)` to check the in-flight state: a `status` with `Regenerating Arguments` is visible and `Regenerate Case Structure` is disabled. The toast `Section regenerated` follows. A full generation shows no toast: the result appears in place (and scrolls into view on phones).
- **Export.** Wait for `page.waitForEvent("download")` while clicking the button named `PDF` or `DOCX` (use `exact`). Check the suggested filename's extension and the file's magic bytes.

## Gotchas

- While any generation is running, the form's submit button reads `Generating Case...`, not `Generate Debate Case`. Find it by `[data-tour="generate-button"]` then.

- The Generate page shows the heading `Ready to Generate` before the first run. Wait for it after navigating, because lazy route chunks load slowly on a cold Vite.
- `Save` appears both on the result toolbar and in the dialog. Scope the second click to `getByRole("dialog")`. The toolbar `Save` exists only for one-off results.
- A case filed in a debate is titled with the motion, which the header control also shows (truncated and hidden). Look for it inside the History panel, not with a page-wide `getByText`.
- The client files a result after it renders. Wait for the result on screen (and the row, if the next step reloads) before a `page.goto`, or the reload can drop it.
- The model label in the result header (for example `anthropic/claude-opus-5.5`) is the model the function requested. The answer itself came from the fake provider.
- `Google Docs` export needs Google OAuth and cannot be proven locally.
