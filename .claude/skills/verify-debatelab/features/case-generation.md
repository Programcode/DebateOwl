# Case generation

A signed-in user enters a motion on Generate and receives a structured debate case: thesis, framework, contentions, the predicted opponent case, and counters. The case can be saved to the account and reopened from History, or exported as PDF or DOCX.

## Sub-features

- `gen-create` generates a case from a motion. The `ai` Edge Function calls the provider and records `ai_requests` with `feature: generate, status: success`.
- `gen-grounded` includes active Library sources in the system prompt (see [library-sources](./library-sources.md)).
- `gen-error` shows `Generation Failed` on a provider error, and the button becomes enabled again for a retry.
- `gen-quota` shows the dialog `Daily Access Paused` when the account has no quota, without calling the provider.
- `gen-save` saves the case under a title into `cases`, and it appears in History, including from a fresh browser context.
- `gen-export` downloads a `.pdf` (starting with `%PDF`) and a `.docx` (starting with `PK`).

## How to get to it (user POV)

- The header link `Generate`, or the Home card with `data-tour="mode-generate"`, or `/app/generate`.
- History: `More` → `History` on desktop, `Open menu` → `History` on mobile, or `/app/history`.

## Driving it with verify.sh + Playwright

Preconditions:

- Doctor passes. The recipe `recipes/case-generation.spec.ts` covers every sub-feature below: `bin/verify.sh drive recipes/case-generation`.

- **Generate.** Fill the textbox named `Motion / Topic *` and click the button named `Generate Debate Case`. The text `FAKE-PROVIDER case thesis` and `FAKE-PROVIDER contention 3` appear, along with a toast `Generate complete`.
- **Provider side effect.** `providerCall("generate")`'s `user` contains `Motion: <motion>`. `ai_requests` for the user contains `{feature: "generate", status: "success"}`.
- **Save.** Click the button named `Save` (use `exact`), fill the dialog field labelled `Case title`, and click the dialog's `Save` button. `cases` for the user has exactly that title. `/app/history` shows the title.
- **Error.** Call `await fake.fail("generate", 500)` before generating. The text `Generation Failed` (use `exact`) appears. Clicking again then succeeds.
- **Quota.** Update `user_settings` to set `daily_limit_override: 0` through `admin`, then generate. The dialog shows `Daily Access Paused`. `fake.requests()` has no `generate` entry.
- **Export.** Wait for `page.waitForEvent("download")` while clicking the button named `PDF` or `DOCX` (use `exact`). Check the suggested filename's extension and the file's magic bytes.

## Gotchas

- The Generate page shows the heading `Ready to Generate` before the first run. Wait for it after navigating, because lazy route chunks load slowly on a cold Vite.
- `Save` appears both on the result toolbar and in the dialog. Scope the second click to `getByRole("dialog")`.
- The model label in the result header (for example `anthropic/claude-sonnet-5`) is the model the function requested. The answer itself came from the fake provider.
- `Google Docs` export needs Google OAuth and cannot be proven locally.
