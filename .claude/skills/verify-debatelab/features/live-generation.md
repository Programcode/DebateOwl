# Live generation

Every AI answer appears while the model writes it. Generate, Attack, Brainstorm, and Factoids show a live draft: the result's own sections fill in token by token with a caret where text is arriving, under a `Writing live` bar with `Cancel`. Ask fills its reply bubble, a Crossfire opponent's turn and a Sparring opponent's speech appear in place as they are written, and the Crossfire debrief and Sparring scorecard fill in section by section. When the answer is complete, the finished result replaces the draft.

## Sub-features

- `live-generate`: Generate's draft shows `Case structure` and later sections before the result, then the full result and its toolbar replace it.
- `live-cancel`: `Cancel` on the draft stops the request; no draft, result, or error stays on the page.
- `live-tools`: Attack, Brainstorm, Factoids, and cited Ask each ask for live generation and receive an event stream.
- `live-practice`: Crossfire turns and debriefs and Sparring speeches and scorecards ask for live generation (checked in `recipes/practice.spec.ts` with `expectStreamed`).

## How to get to it (user POV)

- Run any AI tool: `/app/generate`, `/app/attack`, `/app/brainstorm`, `/app/factoids`, `/app/ask` with `Options` turned on, `/app/crossfire`, `/app/sparring`.
- Plain Ask (no options) keeps its own streaming endpoint, `ai-stream` (see [ai-tools](./ai-tools.md)).

## Driving it with verify.sh + Playwright

Preconditions:

- Doctor passes. The user is signed in. `startDebate(page, motion)` avoids the motion dialog.

- **Draft.** Click `Generate debate case`. `getByTestId("live-draft")` appears, holding a region named `Case structure`, one `live-caret`, and a `Cancel` button. It disappears when the result renders.
- **Request.** The page's `ai` request body has `stream: true`. The response is `text/event-stream`: `phase` events (`research`, `writing`, `checking`), many `delta` events with the model's raw text, an optional `reset` when a repair retry starts the answer again, and exactly one final `result` event `{status, body}` holding what a plain request would return. Read it with `readAIResponse(response)`.
- **Provider.** `expectStreamed(["generate"])`: every provider call for the feature had `stream: true`. Research sub-calls (`research-decision`, `research-queries`) are never streamed.
- **Errors.** Checks before the feature (auth, input, quota, model access) still answer with plain JSON and their real status. A failure after streaming starts arrives as a `result` with the error status, which the client turns into the same error a plain request gets.

## Gotchas

- In fake mode the Generate draft is on screen for about a second; short replies (Crossfire turns, Sparring speeches) finish too fast to catch reliably, so prove them with `expectStreamed`, not by waiting for the draft.
- A server from before live generation ignores `stream: true` and answers with JSON. The client accepts both, so a visible result alone does not prove streaming; check the content type or `expectStreamed`.
- Never call `response.json()` on an `ai` response; use `readAIResponse` or `aiResponse`.
- In voice rounds the live text has audio tags removed, as the finished reply does.
