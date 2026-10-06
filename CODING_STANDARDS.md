# Coding standards

Review rules for DebateLab diffs. They come from review findings on PRs #5 to #106 that the team accepted and fixed, and each rule links to a thread that produced it. A rule marked "single finding" came up once; weigh it below the rules reviewers raised repeatedly.

## Review steps

1. Map each changed file to its area below and read that area's file. Read [reviews.md](docs/standards/reviews.md) for every PR.
2. Check the diff against every rule in those files. A violation is a finding like any bug: give its severity, `file:line`, and the rule's link.
3. Done when every changed file has been checked against its area file, and the PR body has been checked against the diff.

Skip what lint, typecheck, the test suites, and `npm run docs:check` already catch. Spend the review on what they cannot see.

## Areas

- [Async work and client state](docs/standards/async-and-state.md): stores, pages, and hooks that await anything; stale responses, races with user actions, cancellation, timeouts.
- [Trust boundaries and validation](docs/standards/boundaries.md): `src/lib/ai/`, Edge handlers, anything parsing model or network output; request budgets, failing closed, honest controls, usage and cost records.
- [Tests](docs/standards/tests.md): any test file; tests that fail when the behavior they name breaks.
- [Database and migrations](docs/standards/database.md): `supabase/migrations/`, `supabase/tests/`, privileged database clients.
- [CI, secrets, and privacy](docs/standards/security.md): `.github/workflows/`, credentials, telemetry and error reporting.
- [UI, language, and accessibility](docs/standards/ui.md): components, pages, and `src/locales/`.
- [PR claims and documentation](docs/standards/reviews.md): the PR body, commit messages, and the documents a change must update.

## The rules reviewers raised most

1. A test must fail when the behavior it names breaks. Check both sides of every limit, and exercise behavior rather than matching source text. (about 29 findings)
2. An async result that writes state checks that it is still current when it lands. Read the target of a user action (debate, user, record) when the user acts, before any `await`. (about 17)
3. Validate untrusted data where it enters: model output, Edge responses, persisted browser state, request bodies. Reject or normalize it there, before anything renders or saves it. (about 15)
4. Every user-facing string goes through `t()` with keys in all three catalogs, and every control has an accessible name. (about 15)
5. A timeout or abort stops the work underneath it, not only the promise the caller awaits. (about 9)
6. When a read fails, the answer is "unknown". Persist nothing and report no success on a failed read or write. (6)
7. The owning document changes in the same PR as the behavior it describes. (7)
