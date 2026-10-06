# PR claims and documentation

Part of the [coding standards](../../CODING_STANDARDS.md). Check the PR body and commit messages against the diff, the same way you check the code.

## Claims match the diff

PR bodies and commit messages are evidence. The second-pass reviews on #34 to #38 blocked two PRs for claims the diff contradicted.

- A claim of scope must survive the diff. "Nothing here is staging-dependent" is false when the diff removes the staging flag ([#37](https://github.com/Programcode/DebateLab/pull/37#issuecomment-5561106629)). "On every page" is false when the diff edits one file ([#38](https://github.com/Programcode/DebateLab/pull/38#issuecomment-5561106726)).
- A deletion shows the search behind it, covering dynamic imports, string-built paths, `e2e/`, and `page.evaluate` access that typecheck cannot see ([#34](https://github.com/Programcode/DebateLab/pull/34#issuecomment-5561106288), [#36](https://github.com/Programcode/DebateLab/pull/36#issuecomment-5561106513)).
- "No behavior change" holds for every input. `Response.json(undefined)` throws where `JSON.stringify` did not ([#36](https://github.com/Programcode/DebateLab/pull/36#issuecomment-5561106513)).
- Test counts in the commit and the PR body agree and come from the final head ([#35](https://github.com/Programcode/DebateLab/pull/35#issuecomment-5561106411)).
- Proof that used stubs says so: "This proves client dispatch only; it is not authenticated provider proof." ([#65](https://github.com/Programcode/DebateLab/pull/65#issuecomment-5795646211))

## Documents change with the code

The owning document changes in the same PR as the behavior it describes ([docs/README.md](../README.md#maintenance-rule) names the owners). Reviewers found a plan with two statuses for one feature, a release checklist missing `test:edge`, a migration marked applied in one file and pending in another, and new ports with no documentation ([#17](https://github.com/Programcode/DebateLab/pull/17#discussion_r3896181597), [#26](https://github.com/Programcode/DebateLab/pull/26#discussion_r3897947143), [#63](https://github.com/Programcode/DebateLab/pull/63#discussion_r4081818982)). Commands in plans run on the pinned CLI version ([#29](https://github.com/Programcode/DebateLab/pull/29#discussion_r3937934134)).

## The diff holds only this change

A diff full of unrelated files usually means the branch was cut from a stale local `main`. A branch like that once put 20 plan files into a PR, and all three review findings landed on them ([#29](https://github.com/Programcode/DebateLab/pull/29#issuecomment-5546554434)).
