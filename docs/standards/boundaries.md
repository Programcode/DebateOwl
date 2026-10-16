# Trust boundaries and validation

Part of the [coding standards](../../CODING_STANDARDS.md). The client AI boundary is [`src/lib/ai/client.ts`](../../src/lib/ai/client.ts), and response validation lives in `src/lib/ai/sources.ts` and each `src/lib/ai/features/*.ts`; the server boundaries are the Edge Function handlers described in [supabase/README.md](../../supabase/README.md).

## Validate at the boundary, then trust the type

Model output, Edge responses, URLs, and request bodies are untrusted until a validator accepts them. Validate the complete shape where the data enters, before rendering, autosave, or a cast.

- Validate the whole output with its schema before saving sources. A count check plus a cast let malformed output through ([#9](https://github.com/Programcode/DebateLab/pull/9#discussion_r3861289852)).
- Normalize optional fields to their primitive types. An object in `qualityLabel` reached React as a child ([#5](https://github.com/Programcode/DebateLab/pull/5#discussion_r3835805775)).
- Use `validateUrl` for every URL you render as a link, and store the value it returns, not the input ([#17](https://github.com/Programcode/DebateLab/pull/17#discussion_r3896309984), [#17 review](https://github.com/Programcode/DebateLab/pull/17#issuecomment-5481176881)).
- Validate raw types before coercing. `Boolean("false")` is `true` ([#29](https://github.com/Programcode/DebateLab/pull/29#discussion_r3937934126)).
- Invalid client input returns a 4xx, never a 500 from a property access on `null` ([#13 review](https://github.com/Programcode/DebateLab/pull/13#issuecomment-5477866033)).
- When the client validates locally, apply the same rules as the server, so a request the client accepted does not fail as a generic error ([#12](https://github.com/Programcode/DebateLab/pull/12#discussion_r3893641258)).
- Send only values the server contract accepts. Local-only source IDs made every AI request fail with 400 ([#66](https://github.com/Programcode/DebateLab/pull/66#discussion_r4085167559)).
- Prefer a typed result over `as` casts at call sites. Unchecked casts hide shape drift ([#18](https://github.com/Programcode/DebateLab/pull/18), single finding).

## Model output can omit what the prompt asked for

The shared JSON rules tell the model to omit a part it cannot fill. Map an omitted field to its documented empty value instead of failing the request ([#12](https://github.com/Programcode/DebateLab/pull/12#discussion_r3893641334)). A response variant that does not match the operation is an error the UI can recover from, not a silent return that leaves the page pending ([#12](https://github.com/Programcode/DebateLab/pull/12#discussion_r3893641293)).

## Size limits are UTF-8 bytes

The Edge limit is on serialized bytes, so budget in bytes, across the whole serialized payload, before transport ([#66](https://github.com/Programcode/DebateLab/pull/66#discussion_r4085167588), [#12](https://github.com/Programcode/DebateLab/pull/12#discussion_r3893641325)).

- Do not silently shorten what the user typed. Reject it with a visible message, or keep the truncation marker so the server can report it ([#66](https://github.com/Programcode/DebateLab/pull/66#discussion_r4085302451)).
- A value exactly at the limit is allowed. Check the boundary with a test on each side ([#12](https://github.com/Programcode/DebateLab/pull/12#discussion_r3893641317)).
- Check `response.ok` before reading a body, and read bounded bodies inside the timeout ([#11](https://github.com/Programcode/DebateLab/pull/11#discussion_r3872004292)).

## Fail closed, and say "unknown" when you do not know

- A failed entitlement read is indeterminate. Treating it as "not Pro" persisted a downgrade of the user's model choice ([#47](https://github.com/Programcode/DebateLab/pull/47#discussion_r4054031767)).
- Check the result of every write before reporting success ([#63](https://github.com/Programcode/DebateLab/pull/63#discussion_r4081818967)). Lint rejects unhandled promises; a `void` in front of one is correct only when the promise cannot reject or handles its own errors and tells the user ([#63 outside diff](https://github.com/Programcode/DebateLab/pull/63)).
- Catch the specific error you expect (a missing file, a missing column) and rethrow the rest ([#5](https://github.com/Programcode/DebateLab/pull/5#discussion_r3835805773)).
- Read provider per-item status before falling back to a generic message ([#11](https://github.com/Programcode/DebateLab/pull/11#discussion_r3872004284)).
- A fix for a permission change covers every write path, not only the one that failed first ([#44](https://github.com/Programcode/DebateLab/pull/44#discussion_r4049229043)).

## Controls must be honest

A visible toggle or setting must change the request or deterministic post-processing. This is an existing team rule that reviewers enforced:

- `useActiveSources` did not change the opponent request ([#11](https://github.com/Programcode/DebateLab/pull/11#discussion_r3872004224)).
- Research instructions were attached when research returned nothing, inviting unsupported citations ([#5](https://github.com/Programcode/DebateLab/pull/5#discussion_r3835805784)).
- A privacy disclosure stays only while the code enforces it ([#22](https://github.com/Programcode/DebateLab/pull/22#discussion_r3896703404)).
- Tier defaults must reach every fallback path, not only a migration ([#47](https://github.com/Programcode/DebateLab/pull/47#discussion_r4054031797)).

## Usage and cost records

Every provider call that can bill gets recorded, including retries, repairs, research sub-calls, and cache-only usage. A request that did not complete records its observed usage with a null cost.

- Cache-only usage returned before pricing ([#5](https://github.com/Programcode/DebateLab/pull/5#discussion_r3835805777)). Repair attempts dropped the failed call's tokens ([#5 review](https://github.com/Programcode/DebateLab/pull/5#issuecomment-5379671525), [#9](https://github.com/Programcode/DebateLab/pull/9#discussion_r3861289886)).
- A stream that errors after its finish frame is incomplete ([#46](https://github.com/Programcode/DebateLab/pull/46#discussion_r4053914209)).

## Keep one copy of a contract

When two code paths implement the same privacy-sensitive payload or validation, move it to one helper. The two copies of the AI failure report had already drifted ([#18](https://github.com/Programcode/DebateLab/pull/18), single finding). Configuration that exists in two places (such as two CSP lists) changes together, with a test that compares them ([#15](https://github.com/Programcode/DebateLab/pull/15#discussion_r3894972424)).
