# Practice

Live practice modes. Sparring runs a multi-speech round against an AI opponent and ends with a judged verdict saved to the account. Crossfire runs a question-and-answer exchange with Jev answer signals and ends with a debrief. Both are filed in the Current Debate (see [current-debate](./current-debate.md)), and both can run as spoken rounds (see [voice-rounds](./voice-rounds.md)).

## Sub-features

- `spar-round` starts a round with a chosen format, submits the user's speeches, and receives opponent speeches.
- `spar-verdict` judges the finished round. A `sparring_sessions` row reaches `status: complete`, with `side: pro` and the debate for its motion.
- `cross-turn` answers a user question with an AI response and attaches a Jev `Direct answer` signal.
- `cross-debrief` ends the session and shows the debrief. A `crossfires` row is filed in the debate for its resolution.
- `cross-ai-questions` reverses the roles: the AI asks (`mode-ai-questions-user`), the user answers, and the AI follows up.
- `cross-history` after leaving the page, `/app/history?tab=crossfire` lists the round (test id `history-crossfire-row`). `Open` shows test id `saved-crossfire` with the debrief (`saved-crossfire-debrief`) and transcript (`saved-crossfire-transcript`); `Delete Crossfire round: <resolution>` asks first and removes the row.
- `cross-daily-limit` with no AI requests left, the first AI turn is refused: the daily-limit dialog opens and the page stays in setup with no clock and no `end-crossfire`.
- `cross-end-early` ending a round before any exchange returns to setup with no error.
- `spar-daily-limit` Sparring setup warns (test id `sparring-request-shortfall`) when today's remaining requests are fewer than the round needs.

## How to get to it (user POV)

- Header links `Sparring` and `Crossfire`, or `/app/sparring` and `/app/crossfire`.
- Generate result → `Open in Crossfire`, which seeds Crossfire from a generated case.

## Driving it with verify.sh + Playwright

Preconditions:

- Doctor passes. The user is signed in. The recipe is `recipes/practice.spec.ts`.

- **Start a sparring round.** On `/app/sparring`, fill the field labelled `Motion`. Open the combobox named `Round format` and choose the option matching `Lincoln-Douglas · 5 speeches`. Click `Start round`. A new account has no Current Debate, so `Start a debate with this motion?` opens: `chooseForMotion(page, "create")`.
- **Speeches.** For each user turn, fill the textbox named `Draft for <turn>` (`Affirmative constructive`, `First affirmative rebuttal`, `Second affirmative rebuttal`) and click `Submit speech`. After each of the first two, the last `FAKE-PROVIDER opponent speech` is visible.
- **Verdict.** The heading `Here is what happened in the room.` and the text `FAKE-PROVIDER verdict: the user had the edge.` appear. `providerCall("sparring").user` contains `SPARRING ACTION:`. `sparring_sessions` statuses for the user equal `["complete"]`, and `select("side,debates(motion)")` gives `{side: "pro", debates: {motion}}`.
- **Start Crossfire.** On `/app/crossfire`, fill test id `crossfire-resolution` and `crossfire-argument`. Click `mode-question-ai` (or `mode-ai-questions-user`), then `start-crossfire`, then `chooseForMotion(page, "create")`.
- **Crossfire turn.** Fill `crossfire-input` and click `submit-turn`. The text `FAKE-PROVIDER crossfire answer` and `Direct answer` appear. `providerCall("crossfire")` and `providerCall("jev")` both fired.
- **Debrief.** Click `end-crossfire`. Test id `crossfire-debrief` is visible. `crossfires` for the user equals `[{title: <resolution>, debates: {motion: <resolution>}}]`.
- **Out of requests.** Through `admin`, set `user_settings.daily_limit_override` to N, upsert today's `daily_usage_counters` row (`quota_key: "ai"`, `request_count: N`; what the `ai` function checks), and insert N `ai_requests` rows (what the browser counts). Start Crossfire in `mode-ai-questions-user`: a `dialog` containing `N of N` opens and `start-crossfire` is back. On `/app/sparring`, `sparring-request-shortfall` says `You have no AI requests left today`.

## Gotchas

- Opponent speeches carry a server-signed integrity token. Scoring fails if the client drops it, so a verdict proves the round-trip.
- Jev is faked with a fixed confident answer. `Direct answer` proves the wiring, not the quality of the judgement.
- Sparring AI calls happen once per opponent turn. Keep the per-step wait near 30 s rather than one long wait for the verdict.
- The browser's remaining-requests count leaves out `rate_limited` and `jev_*` rows and cannot see global `rate_limits` rows, so it warns and never blocks. The `ai` function's 402 decides.
- In `mode-ai-questions-user` the opening question is requested as soon as the round starts, after the motion dialog. Create the `aiResponse(page, "crossfire", "next-turn")` promise before clicking `start-crossfire`.
