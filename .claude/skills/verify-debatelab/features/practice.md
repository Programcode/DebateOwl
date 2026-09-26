# Practice

Live practice modes. Sparring runs a multi-speech round against an AI opponent and ends with a judged verdict saved to the account. Crossfire runs a question-and-answer exchange with Jev answer signals and ends with a debrief.

## Sub-features

- `spar-round` starts a round with a chosen format, submits the user's speeches, and receives opponent speeches.
- `spar-verdict` judges the finished round. A `sparring_sessions` row reaches `status: complete`.
- `cross-turn` answers a user question with an AI response and attaches a Jev `Direct answer` signal.
- `cross-debrief` ends the session and shows the debrief.

## How to get to it (user POV)

- Header links `Sparring` and `Crossfire`, or `/app/sparring` and `/app/crossfire`.
- Generate result → `Open in Crossfire`, which seeds Crossfire from a generated case.

## Driving it with verify.sh + Playwright

Preconditions:

- Doctor passes. The user is signed in.

- **Start a sparring round.** On `/app/sparring`, fill the field labelled `Motion`. Open the combobox named `Round format` and choose the option matching `Lincoln-Douglas · 5 speeches`. Click `Start round`.
- **Speeches.** For each user turn, fill the textbox named `Draft for <turn>` (`Affirmative constructive`, `First affirmative rebuttal`, `Second affirmative rebuttal`) and click `Submit speech`. After each of the first two, the last `FAKE-PROVIDER opponent speech` is visible.
- **Verdict.** The text `FAKE-PROVIDER verdict: the user had the edge.` appears. `providerCall("sparring").user` contains `SPARRING ACTION:`. `sparring_sessions` statuses for the user equal `["complete"]`.
- **Start Crossfire.** On `/app/crossfire`, fill test id `crossfire-resolution` and `crossfire-argument`. Click `mode-question-ai`, then `start-crossfire`.
- **Crossfire turn.** Fill `crossfire-input` and click `submit-turn`. The text `FAKE-PROVIDER crossfire answer` and `Direct answer` appear. `providerCall("crossfire")` and `providerCall("jev")` both fired.
- **Debrief.** Click `end-crossfire`. Test id `crossfire-debrief` is visible.

## Gotchas

- Opponent speeches carry a server-signed integrity token. Scoring fails if the client drops it, so a verdict proves the round-trip.
- Jev is faked with a fixed confident answer. `Direct answer` proves the wiring, not the quality of the judgement.
- Sparring AI calls happen once per opponent turn. Keep the per-step wait near 30 s rather than one long wait for the verdict.
