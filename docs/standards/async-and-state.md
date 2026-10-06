# Async work and client state

Part of the [coding standards](../../CODING_STANDARDS.md). Race conditions were the second most common finding: a response from earlier work landing after the user moved on.

## Capture the target when the user acts

Read the debate, user, or record ID at the moment of the click, and pass it through the async chain. Do not read a store again after an `await`, because the user may have switched debates or accounts while you waited.

- Clear All read the Current Debate after awaiting auth, so a switch during the wait deleted the other debate's sources ([#72](https://github.com/Programcode/DebateLab/pull/72#discussion_r4112813743)).
- Workspace research saved its sources into whichever personal debate was active when the response arrived ([#72](https://github.com/Programcode/DebateLab/pull/72#discussion_r4112813741)).
- A fallback that reads "the current debate" must respect one-off mode; use `activeDebateId()`, not `currentDebateId` ([#72](https://github.com/Programcode/DebateLab/pull/72#discussion_r4112813737)).

## Stale responses must not overwrite newer state

When a load and a write can overlap, give the write a counter or request key and have the load discard its result if the counter moved while it ran. This is the pattern `debate-store.ts` and the context pins use now.

- Hydration replaced a debate created while it was loading ([#72](https://github.com/Programcode/DebateLab/pull/72#discussion_r4112813746)). A pin load overwrote a pin change made during the read ([#75](https://github.com/Programcode/DebateLab/pull/75#issuecomment-5873019386)).
- A load that started before a dismissal brought the dismissed announcement back ([#19](https://github.com/Programcode/DebateLab/pull/19#discussion_r3896612965)).
- A failed optimistic write undoes only its own change. Restoring a snapshot taken earlier also reverts other writes that succeeded since ([#75](https://github.com/Programcode/DebateLab/pull/75#issuecomment-5873818351)).
- Count against the store's current state, not a value captured at render, so two quick clicks see each other ([#77](https://github.com/Programcode/DebateLab/pull/77#issuecomment-5877394644)).
- Errors tied to one item carry that item's ID and render only beside it ([#19](https://github.com/Programcode/DebateLab/pull/19#discussion_r3896430653)).

## Supersede in-flight work explicitly

Starting new work for the same slot aborts the old request and hides its output. Track ownership with a request identity and check it before every state update in `then`, `catch`, and `finally`.

- A clarify request started while a stream was running; the old stream later appended text and cleared the loading flag ([#9](https://github.com/Programcode/DebateLab/pull/9#discussion_r3861289857)).
- Cancel in-flight work on unmount as well as on clear and load ([#9](https://github.com/Programcode/DebateLab/pull/9#discussion_r3861496792)).
- Undo during a section regeneration was reverted when the regeneration landed. Drop a result if the record it targets changed after the work started ([#89](https://github.com/Programcode/DebateLab/pull/89#issuecomment-5951346940)).
- Key deduplication by a stable identity (user ID), not by a rotating access token ([#65](https://github.com/Programcode/DebateLab/pull/65#discussion_r4082668135)).

## React effects and refs

- Do not use an `active` closure flag in an effect that can return early without registering cleanup; a re-render can leave it `false` forever. Request-key refs already reject stale results ([#13](https://github.com/Programcode/DebateLab/pull/13#discussion_r3893649640)).
- Write refs that track the previous render inside an effect, not during render ([#20](https://github.com/Programcode/DebateLab/pull/20#discussion_r3896378571)).
- Derive view state from the same condition that chooses the rendered branch ([#20](https://github.com/Programcode/DebateLab/pull/20#discussion_r3896378587)).
- One-shot guards must flip after their first use ([#14](https://github.com/Programcode/DebateLab/pull/14#discussion_r3894645041)).

## Auth transitions and persisted state

- Persisted browser state records its owner. On sign-in, clear state whose owner differs or is missing. Do not use "was there a previous user" as the ownership check ([#13 review](https://github.com/Programcode/DebateLab/pull/13#issuecomment-5477866033)).
- Clear only the previous owner's data on an account switch, never the incoming user's ([#12](https://github.com/Programcode/DebateLab/pull/12#discussion_r3893641261)).
- Validate persisted state on every rehydrate. Zustand calls `migrate` only on a version change, so put validation in `merge` ([#13](https://github.com/Programcode/DebateLab/pull/13#discussion_r3893649636)).
- Do not serialize a whole store on every keystroke. Debounce drafts and cap stored history ([#13](https://github.com/Programcode/DebateLab/pull/13#discussion_r3893649632)).

## Timeouts and cancellation

A timeout that rejects the caller's promise but leaves the work running still spends money and CPU.

- Pass one `AbortSignal` through every layer of the work: research, Exa, model calls, body reads ([#5](https://github.com/Programcode/DebateLab/pull/5#discussion_r3835805781), [#9](https://github.com/Programcode/DebateLab/pull/9#discussion_r3861289875)). A `Promise.race` timeout without cancellation leaves a DOCX conversion running ([#63](https://github.com/Programcode/DebateLab/pull/63#discussion_r4081818971)).
- Start the deadline and listen to the caller's signal before the first `await`, including `getSession()` ([#13 review](https://github.com/Programcode/DebateLab/pull/13#issuecomment-5477866033), [#16](https://github.com/Programcode/DebateLab/pull/16#discussion_r3895854139)).
- Every external fetch has a bound, and anything that delays app startup has a fail-open timeout ([#5](https://github.com/Programcode/DebateLab/pull/5#discussion_r3835805765), [#21](https://github.com/Programcode/DebateLab/pull/21#discussion_r3896608554)).
- A promise that wraps a callback API settles on every outcome, including cancel. The Google Picker promise never settled on cancel and left the panel disabled ([#63](https://github.com/Programcode/DebateLab/pull/63#discussion_r4081818959)).
- After a caller abort, normalize the error to `AbortError` so callers do not report it as a failure ([#16](https://github.com/Programcode/DebateLab/pull/16#discussion_r3895854139)).
- Secondary work after the main result (such as source-usage checks) gets its own budget and must not lose a result that already finished ([#69](https://github.com/Programcode/DebateLab/pull/69#discussion_r4093476756)).
