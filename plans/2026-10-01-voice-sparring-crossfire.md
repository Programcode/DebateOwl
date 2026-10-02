# Voice Sparring and Crossfire

**Status:** Shipped in #84 (merged 2026-10-02 as `791ccb0`). Kept as the record. Written 2026-10-01 against `main` at `fe6100a`. It records only the general choices. Implementation details are up to the implementer.

## Why

Sparring and Crossfire are typed today. The sparring scorecard admits it judges delivery "from the written speech, not audio". Real debate is spoken, so students should be able to practise out loud against an opponent who talks back.

## Adam's choices

- **Opponent voice: ElevenLabs Eleven v4, with the browser voice as fallback.** The opponent speaks through ElevenLabs `eleven_v4`; whether the Turbo variant is better for back-and-forth Crossfire is up to the implementer. If the key is missing, the user is over their cap, or the call fails, the browser's built-in `speechSynthesis` takes over and the round continues.
- **Use v4 expressively.** The opponent's AI responses should include inline audio tags such as `[sighs]`, `[laughs]`, `[pause]` and `[sarcastic]`, used the way a sharp human debater would: occasionally and with purpose, never every sentence. The tags must not show in the on-screen text or the saved transcript, and the browser fallback voice must not read them aloud.
- **Student speech: browser speech recognition.** This is the Web Speech API, which already powers dictation (`src/hooks/use-speech-to-text.ts`). Where it isn't supported, or microphone permission is denied, voice mode is hidden with a short reason and typing works as it does today.
- **Scope: Sparring and Crossfire.**

## Fixed constraints

- The ElevenLabs key lives only on the server. The browser asks DebateLab's backend for audio, and the backend enforces auth, a per-user daily voice cap and cost accounting, reusing the existing quota and cost code.
- Adam adds the `ELEVENLABS_API_KEY` secret himself. The implementer never creates, prints or changes secrets. Without the key, everything must work on the browser fallback, including tests.
- DebateLab never records or stores the student's audio. In Chrome, recognition audio goes to Google, and ElevenLabs receives the opponent's text, so the privacy page and a first-use notice must say both.
- Feedback states only measured facts: speaking time against the limit, words per minute, filler words (per language), long pauses and structure. It never claims to have heard tone, confidence or volume. Typed rounds keep today's wording.
- All new UI text exists in English, Spanish and Hungarian.
- Typed Sparring and Crossfire, saved sessions and Current Debate context keep working. Old saved sessions still load.

## Finish line

Push a branch, open a PR with the test evidence, and babysit it with the `babysit-pr` skill until it is ready to merge. Do not merge, deploy Edge Functions, apply migrations remotely, or touch secrets. Each of those needs Adam.

## References

- [Eleven v4 overview](https://elevenlabs.io/docs/overview/capabilities/text-to-speech/eleven-v4)
- [ElevenLabs models](https://elevenlabs.io/docs/overview/models)
