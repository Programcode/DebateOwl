# Tests

Part of the [coding standards](../../CODING_STANDARDS.md). [docs/testing.md](../testing.md) owns which gate proves what. This file covers how to write a single test. It was the largest group of findings: tests that passed whether or not the behavior worked.

## A test must be able to fail

Before you commit a test, break the code it covers and watch it fail. Reviewers caught these patterns:

- **Matching source text.** Reading a file and asserting it contains a string passes when the logic is wrong, and fails on reformatting. Exercise the behavior instead ([#9](https://github.com/Programcode/DebateOwl/pull/9#discussion_r3861496818), [#14](https://github.com/Programcode/DebateOwl/pull/14#discussion_r3894645049), [#11](https://github.com/Programcode/DebateOwl/pull/11#discussion_r3872004244)). Where a workflow or config file is the subject, parse it and assert the condition, the query, and the failure exit together ([#27](https://github.com/Programcode/DebateOwl/pull/27#discussion_r3898115828)).
- **Assertions anchored to nothing.** `return false;` occurs everywhere in a file. Anchor to the function that owns the guard ([#11](https://github.com/Programcode/DebateOwl/pull/11#discussion_r3872004273)).
- **Test data that never reaches the limit.** An aggregate cap test with inputs below the cap proves nothing ([#12](https://github.com/Programcode/DebateOwl/pull/12#discussion_r3893641309), [#13](https://github.com/Programcode/DebateOwl/pull/13#discussion_r3893649694)).
- **One side of a boundary.** Assert that 12 is accepted and 13 is rejected, with inputs that differ only in count, so a different rule cannot cause the rejection ([#13](https://github.com/Programcode/DebateOwl/pull/13#discussion_r3893649674)).
- **`&&` where you meant `||`.** A leak check that requires both fields to leak passes when one does ([#13](https://github.com/Programcode/DebateOwl/pull/13#discussion_r3893649704)).
- **Uncovered branches named in the title.** If the test name says "duplicate turns", assert the duplicate branch ([#12](https://github.com/Programcode/DebateOwl/pull/12#discussion_r3893641303), [#5](https://github.com/Programcode/DebateOwl/pull/5#discussion_r3835805782)).
- **`JSON.stringify` on an `Error`.** It drops `message` and `stack`, so a privacy check on the stringified call misses a leaked error. Destructure and check the error message directly ([#18](https://github.com/Programcode/DebateOwl/pull/18), single finding).
- **Superseded invariants.** After a later migration changes a constraint, assert against the migration in force ([#11](https://github.com/Programcode/DebateOwl/pull/11#discussion_r3872004255)).

## End-to-end assertions prove completion

A 200 status and some rendered text do not prove a flow finished.

- Wait for content that renders only after the state you are testing resolves. `body` is visible during the auth loading state ([#11](https://github.com/Programcode/DebateOwl/pull/11#discussion_r3872004087)).
- A streamed answer requires its final event, no error event, and no fallback request ([#68](https://github.com/Programcode/DebateOwl/pull/68#discussion_r4090563262)).
- Assert that the secondary call you claim to cover actually happened ([#68](https://github.com/Programcode/DebateOwl/pull/68#discussion_r4090563266)).
- Send the request a browser really sends. A CORS check with only an `Origin` header passed while Chromium blocked the real POST ([#68](https://github.com/Programcode/DebateOwl/pull/68#discussion_r4090563272)).

## Deterministic async tests

- Wait on conditions, not fixed sleeps ([#9](https://github.com/Programcode/DebateOwl/pull/9#discussion_r3861289865)). Lint blocks `waitForTimeout` in browser tests; a disable comment must name an observation window, a period in which something must not happen.
- Before asserting that something did not happen, drain pending work, or the negative assertion runs too early and always passes ([#9](https://github.com/Programcode/DebateOwl/pull/9#discussion_r3861496807)).
- Route mocks by request content, not by call order, so a retry does not shift every later response ([#11](https://github.com/Programcode/DebateOwl/pull/11#discussion_r3872004072)).
- Derive expected values from the loop index, not a counter the route handler mutates concurrently ([#13](https://github.com/Programcode/DebateOwl/pull/13#discussion_r3893649614)).
- Fixtures with dates compute them from `Date.now()`. A hard-coded expiry turned four invite tests red on 2026-09-27 ([#74](https://github.com/Programcode/DebateOwl/pull/74#issuecomment-5859465743)).
- Replace globals with `vi.stubGlobal`, which Vitest undoes after each test. A direct assignment to `window` leaks into later tests ([#13](https://github.com/Programcode/DebateOwl/pull/13#discussion_r3893649664)).
- Prefer accessible names or test IDs over positional locators such as `.first()` ([#11](https://github.com/Programcode/DebateOwl/pull/11#discussion_r3872004072)).

## Name what the test proves

A test that stubs the session and the network proves request construction, not backend behavior. Name it that way and keep fixture text neutral ([#65](https://github.com/Programcode/DebateOwl/pull/65#discussion_r4082499616)). AGENTS.md states the general rule: stub sessions prove rendering only.

## Mock providers follow the contract

The mock provider applies the same rules the real path does, such as the contention count per length ([#9](https://github.com/Programcode/DebateOwl/pull/9#discussion_r3861289845)). Otherwise tests and demos pass on output that production would reject.
