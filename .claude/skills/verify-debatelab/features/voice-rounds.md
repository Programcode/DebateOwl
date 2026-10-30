# Voice rounds

Sparring and Crossfire can run as spoken rounds. The student speaks through the browser's speech recognition, and the words fill the draft box. The opponent's reply is read aloud. With an ElevenLabs key, the `voice` Edge Function produces that audio from server-signed segments. Without one, which is how the local stack runs, the function answers `503 voice_unavailable` once and the browser's own voice reads the replies. The judge receives measured delivery facts (words per minute, fillers, pauses) and is told it did not hear the round.

## Sub-features

- `voice-spar` runs a spoken Lincoln-Douglas round. The opponent is told the round is spoken (`SPOKEN ROUND:` in its system prompt). Each reply comes back as clean text plus signed voice segments, which may keep allowed audio tags such as `[sighs]` and drop invented ones. The browser voice reads the clean text, and no tag reaches the page or the saved round. The scorecard shows `Spoken delivery, measured` (test id `spoken-delivery`), and the saved user turns carry `delivery` measurements.
- `voice-cross` runs a spoken Crossfire exchange. The question arrives by microphone, the request carries `SPOKEN EXCHANGE:`, and the clean answer is read aloud. The Jev signal still attaches, and the debrief shows `spoken-delivery`.
- `voice-unavailable`: when the browser has no speech recognition or the microphone is blocked, the switch is replaced by the test id `voice-unavailable`. No recipe covers it; check it by hand in a browser with the microphone blocked.

## How to get to it (user POV)

- `/app/sparring` or `/app/crossfire`: the switch `Voice round` (test id `voice-mode`) on the setup form. The first time it is switched on, the notice `Before you turn on voice` explains where audio and text go. Click its `Turn on voice`.
- During the round, the microphone button (test id `voice-mic`) starts listening, and the page shows `Listening`.

## Driving it with verify.sh + Playwright

Preconditions:

- Doctor passes. The recipe `recipes/voice-rounds.spec.ts` covers both rounds: `bin/verify.sh drive recipes/voice-rounds`. The maintained spec is `e2e/full-stack/voice.spec.ts`.
- Browser automation has no microphone or speech service. `stubSpeech(page)` installs a scripted recogniser, browser voice, and microphone, and `recipes/fixtures.ts` re-exports it from `e2e/helpers/voice.ts`. Call it on the signed-in page before navigating to the tool, because init scripts apply from the next load. `say(page, words)` delivers a final recognition result. `spokenByBrowser(page)` returns everything the browser voice was asked to read.

- **Set up.** Fill the round as in [practice](./practice.md), click `voice-mode`, then `Turn on voice`, then `Start round` or `start-crossfire`, then `chooseForMotion(page, "create")`.
- **Speak a turn.** Click `voice-mic`, wait for `Listening`, `say(page, words)`. The draft (`Draft for <turn>`, or `crossfire-input`) has the words. Click `Submit speech` or `submit-turn`.
- **Let the opponent finish.** After each opponent reply, wait until the `voice` function has answered (once, `503 voice_unavailable`) and `spokenByBrowser(page)` equals the replies so far. Only then click `voice-mic` again.
- **End state, Sparring.** The verdict heading `Here is what happened in the room.` shows. `spoken-delivery` contains `Nobody listened for tone, confidence or volume`. After `Show transcript`, the page has no `[sighs]` or `[dramatic gasp]`. `sparring_sessions.turns` holds the clean replies, and the first user turn's `delivery` is `{wordCount: 10, fillerCount: 1}` for the scripted words. The `score` call's `system` contains `You did not hear this round`, and its `user` contains `"wordsPerMinute"`. `ai_requests` has no `voice_%` rows.
- **End state, Crossfire.** The answer is on the page with no `[scoffs]`, `spokenByBrowser` equals it, and the `crossfire` call's `user` contains `SPOKEN EXCHANGE:`. After `end-crossfire`, `crossfire-debrief` and `spoken-delivery` are visible.

## Gotchas

- Turning the microphone on while the opponent is still speaking stops its voice and abandons the pending `voice` request. A test that does not wait sees zero voice answers and a short `spokenByBrowser`.
- The fake opponent always adds `[sighs]` (allowed) and `[dramatic gasp]` (invented) in a spoken round, and Crossfire adds `[scoffs]`. Only fake mode asserts the exact tagged segment text. Live replies may carry no tag at all.
- Real ElevenLabs audio, its usage rows (`voice_*` in `ai_requests`), and its daily allowance are not provable locally. Neither mode sets an ElevenLabs key.
- The scripted recogniser returns exactly the words given, so `delivery` counts are deterministic. Real recognition can miss words, which the scorecard says.
