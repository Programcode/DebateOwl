# AI tools

The single-shot coaching tools: Attack finds weaknesses in a pasted argument, Brainstorm returns ranked angles for a motion, Factoids researches a statement, and Ask is a streamed coaching chat with an optional citation mode.

## Sub-features

- `attack-run` analyses a pasted argument and returns weaknesses. Provider feature: `attack`.
- `brainstorm-run` returns ranked ideas for a motion. Provider feature: `brainstorm`.
- `factoids-run` finishes research and shows search suggestions. It drops unverified sources because there is no web key locally. Provider feature: `factoids`.
- `ask-stream` streams a coaching answer through `ai-stream`. Provider feature: `ask-stream`, recorded as an `ask` usage row.
- `ask-cited` uses the structured endpoint when citation mode is on. Provider feature: `ask`.

## How to get to it (user POV)

- Header links: `Attack` and `Ask`. `More` menu (desktop) or `Open menu` (mobile): `Brainstorm` and `Factoids`.
- Routes: `/app/attack`, `/app/brainstorm`, `/app/factoids`, `/app/ask`.

## Driving it with verify.sh + Playwright

Preconditions:

- Doctor passes. The user is signed in.

- **Attack.** On `/app/attack`, fill the field labelled `Your Argument *` and click `Find Weaknesses`. The text `FAKE-PROVIDER weakness` appears. `providerCall("attack").user` contains the argument.
- **Brainstorm.** On `/app/brainstorm`, fill the field labelled `Motion / Topic *` and click `Start Brainstorming`. The text `FAKE-PROVIDER idea 1` appears. `providerCall("brainstorm").user` contains `Motion: <motion>`.
- **Factoids.** On `/app/factoids`, fill the field labelled `Statement *` and click `Find Factoids`. The text `FAKE-PROVIDER search suggestion` appears.
- **Ask, streamed.** On `/app/ask`, fill the placeholder `Ask your debate coach...` and click the button named `Send message`. The text `FAKE-PROVIDER streamed answer: ...` appears. `fake.requests()` features contain `ask-stream` and not `ask`. `ai_requests` gets `{feature: "ask", status: "success"}`.
- **Ask, cited.** Click `#citation-mode` first, then send. The text `FAKE-PROVIDER answer` appears, and `providerCall("ask")` fired.

## Gotchas

- Ask silently falls back to the non-streaming path if streaming fails, so a visible answer alone does not prove streaming. Check the provider feature list.
- Factoids evidence locally shows only that the pipeline completes without inventing citations. It does not show real sources.
