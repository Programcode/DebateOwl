# AI tools

The single-shot coaching tools: Attack finds weaknesses in a pasted argument, Brainstorm returns ranked angles for a motion, Factoids researches a statement, and Ask is a streamed coaching chat with an optional citation mode.

## Sub-features

- `attack-run` analyses a pasted argument and returns weaknesses. Provider feature: `attack`.
- `brainstorm-run` returns ranked ideas for a motion. Provider feature: `brainstorm`.
- `factoids-run` finishes research and shows search suggestions. It drops unverified sources because there is no web key locally. Provider feature: `factoids`.
- `ask-stream` streams a coaching answer through `ai-stream`. Provider feature: `ask-stream`, recorded as an `ask` usage row.
- `ask-bubble` measures the student's own message (body, bold, and its time line, test id `message-meta`) against the blue bubble in light and dark: each is at least 4.5:1 (about 5.1 light, 6.7 dark). At 375 px in Hungarian the placeholder `Mit kérdeznél?` fits the field and the chat header wraps instead of overflowing (`recipes/ai-tools.spec.ts`).
- `ask-cited` uses the structured endpoint when citation mode is on. Provider feature: `ask`.

## How to get to it (user POV)

- Home cards under Tools. The phone tab bar lists Tools, not each tool.
- Routes: `/app/attack`, `/app/brainstorm`, `/app/factoids`, `/app/ask`.

## Driving it with verify.sh + Playwright

Preconditions:

- Doctor passes. The user is signed in.

- **Attack.** On `/app/attack`, fill the field labelled `Your argument *` and click `Find weaknesses`. The text `FAKE-PROVIDER weakness` appears. `providerCall("attack").user` contains the argument.
- **Brainstorm.** On `/app/brainstorm`, fill the field labelled `Motion / topic *` and click `Start brainstorming`. With no Current Debate, the dialog `Start a debate with this motion?` opens first: `chooseForMotion(page, "create")` (or `"once"`). The text `FAKE-PROVIDER idea 1` appears. `providerCall("brainstorm").user` contains `Motion: <motion>`, and the `brainstorms` row is filed in the new debate. With a Current Debate, the field is prefilled and no dialog opens unless the motion differs.
- **Factoids.** On `/app/factoids`, fill the field labelled `Statement *` and click `Find factoids`. The text `FAKE-PROVIDER search suggestion` appears.
- **Ask, streamed.** On `/app/ask`, fill the placeholder `Ask your debate coach…` and click the button named `Send message`. The text `FAKE-PROVIDER streamed answer: ...` appears. `fake.requests()` features contain `ask-stream` and not `ask`. `ai_requests` gets `{feature: "ask", status: "success"}`.
- **Ask, cut off.** Call `await fake.truncate("ask-stream")` and send. The stream ends with `finish_reason: "length"`, its `final` event's output carries `replyTruncated: true`, and the partial answer stays with `This answer hit its length limit and stops early...` under `Uncertainties:`. No `Response was interrupted` toast. Fake mode only.
- **Ask, cited.** Open the `Options` button above the message box, click `#citation-mode`, close it with Escape, then send. The text `FAKE-PROVIDER answer` appears, and `providerCall("ask")` fired.

- **Stop and errors.** While Ask answers, the send button becomes `Stop answering`; Stop keeps the partial reply and returns focus to the box, which stays editable throughout. A failed request leaves an `alert` above the box with `Retry`, which asks again without adding the question twice. The four form tools show one status line (`Reviewing your case…`, `Finding angles…`, `Searching for evidence…`, `Writing your case…`, or `Researching sources…` while web research runs) with a `Cancel` button until the model starts writing, then the live draft (see [live-generation](./live-generation.md)). Failures stay on the page with `Retry`.
- **Ask, cited and with web search.** These modes answer through the structured endpoint with live generation: the reply bubble fills with the answer's text as the model writes it, and citations, sources, and follow-ups appear when it finishes.
- **Discuss.** A result's `Discuss` button opens Ask, which sends the summary as the user's message through the streaming path.

## Gotchas

- Ask silently falls back to the non-streaming path if streaming fails, so a visible answer alone does not prove streaming. Check the provider feature list.
- Factoids evidence locally shows only that the pipeline completes without inventing citations. It does not show real sources.
- Attack, Factoids, and Ask take no motion, so they open no motion dialog. Brainstorm does (see [current-debate](./current-debate.md)).
- `ask-web` (`#web-search-mode`, inside `Options`) proves web sources only in live mode; fake mode records an `unverified` annotation.
