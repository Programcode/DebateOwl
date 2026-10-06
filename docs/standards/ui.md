# UI, language, and accessibility

Part of the [coding standards](../../CODING_STANDARDS.md). [docs/architecture.md](../architecture.md#language-behavior) owns how interface and AI-output language work. [docs/testing.md](../testing.md) owns the Hungarian parity checks.

## Every string is translated

- Every user-facing string, including toasts, errors, and accessible names, uses a `t()` key that exists in `en.json`, `es.json`, and `hu.json`. An inline English fallback is not a translation: Spanish and Hungarian users see it ([#11](https://github.com/Programcode/DebateLab/pull/11#discussion_r3872004217), [#43](https://github.com/Programcode/DebateLab/pull/43#discussion_r4048412531)). `src/test/i18n.test.ts` only compares catalogs with each other, so it cannot catch a key missing from all three. [plans/2026-10-02-missing-translation-keys.md](../../plans/2026-10-02-missing-translation-keys.md) adds the check that can.
- Store a translation key or error kind in state and translate at render time. English strings stored in state stay English after a reload ([#12](https://github.com/Programcode/DebateLab/pull/12#discussion_r3893641290)).
- A key that receives `count` needs `_one` and `_other` forms in every catalog ([#12](https://github.com/Programcode/DebateLab/pull/12#discussion_r3893641263)).
- Use the localized feature name everywhere in a catalog: "Interrogatorio", "Keresztkérdezés" ([#12](https://github.com/Programcode/DebateLab/pull/12#discussion_r3893641268), [#13 review](https://github.com/Programcode/DebateLab/pull/13#issuecomment-5477866033)).

## Accessible names

- Icon-only links and buttons get an `aria-label`. The nav label hides below `xl`, which left the link nameless ([#13](https://github.com/Programcode/DebateLab/pull/13#discussion_r3894071703)).
- Repeated row actions include the row's name ("Delete <title>"), so screen readers and role queries can tell them apart ([#19](https://github.com/Programcode/DebateLab/pull/19#discussion_r3896430613)).
- A label for a group of buttons uses `role="group"` and `aria-labelledby` ([#11](https://github.com/Programcode/DebateLab/pull/11#discussion_r3872004206)).
- Lists rendered from model output use index keys, because model strings can repeat ([#11](https://github.com/Programcode/DebateLab/pull/11#discussion_r3872004180)).

## Motion

When `shouldReduceMotion` is true, render a static element. Passing the flag to the phase but not to `initial`/`animate` still animates ([#20](https://github.com/Programcode/DebateLab/pull/20#discussion_r3896378557)).

## Tell the user when the app refuses

- When a store action rejects input (too long, expired, invalid), the UI shows why. A submit button that silently does nothing looks broken ([#13](https://github.com/Programcode/DebateLab/pull/13#discussion_r3893649646)).
- Clear a composer only after the handler accepts the message, so a rejected draft is not lost ([#66 outside diff](https://github.com/Programcode/DebateLab/pull/66)).
- Enforce rules such as deadlines in the store, and add the UI guard as a second layer ([#13](https://github.com/Programcode/DebateLab/pull/13#discussion_r3893649625)).

## Pending actions

- Keep a confirmation dialog open while its request is pending, and close it only on success. Radix closes on click unless you call `preventDefault()` ([#26](https://github.com/Programcode/DebateLab/pull/26#discussion_r3897947151)).
- Side effects such as scrolling run on a success signal, not on "loading became false" ([#20](https://github.com/Programcode/DebateLab/pull/20#discussion_r3896378580)).
- Open a new tab within the click handler. After an awaited request the user activation has expired and popup blockers drop the tab. Show a fallback link ([#63](https://github.com/Programcode/DebateLab/pull/63#discussion_r4081818952)).
- Close the mobile menu on every navigation inside the persistent layout, including the logo link ([#20](https://github.com/Programcode/DebateLab/pull/20#discussion_r3896378566)).
