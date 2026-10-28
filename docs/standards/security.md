# CI, secrets, and privacy

Part of the [coding standards](../../CODING_STANDARDS.md). AGENTS.md "Hard boundaries" owns which credentials may enter a job. [docs/operations.md](../operations.md#secrets) owns secret names and rotation.

## Workflows

- `npm run lint` enforces SHA-pinned actions, `persist-credentials: false`, and a top-level `permissions:` block. Review what it cannot: each permission beyond `contents: read` is the smallest that works and has a comment saying why ([#27](https://github.com/Programcode/DebateLab/pull/27#discussion_r3898115822)).
- A job that loads protected secrets runs only on trusted refs. Check `github.ref == 'refs/heads/main'` for manual dispatch, and require `workflow_run.event == 'push'` for chained workflows, because a fork PR can have a branch named `main` ([#8](https://github.com/Programcode/DebateLab/pull/8#discussion_r3861144007), [#21](https://github.com/Programcode/DebateLab/pull/21#discussion_r3896484016)).
- A manual dispatch path enforces the same build gate as the automatic one ([#26](https://github.com/Programcode/DebateLab/pull/26#discussion_r3898040143)).
- Guard steps that depend on files an earlier conditional step creates ([#8](https://github.com/Programcode/DebateLab/pull/8#discussion_r3861005583)).

## Where credentials may go

- Never print an access code or token, even in a plan's example command ([#8](https://github.com/Programcode/DebateLab/pull/8#discussion_r3861005595)).
- Session state written by a test lives outside directories CI uploads as artifacts ([#11](https://github.com/Programcode/DebateLab/pull/11#discussion_r3872004119)).
- A suite that writes a real session into a browser restricts its base URL to loopback ([#21](https://github.com/Programcode/DebateLab/pull/21#discussion_r3896484019)).
- Documentation names the secret, never the account's email or password ([#68](https://github.com/Programcode/DebateLab/pull/68#discussion_r4095363422)).
- One secret, one purpose. Do not derive signing keys from the service-role key; rotating it would break every outstanding token ([#13](https://github.com/Programcode/DebateLab/pull/13#discussion_r3893649683)).
- An Edge Function that fetches a user-supplied URL connects only to an address it has just checked against the IANA special-purpose ranges, never to the hostname: `fetch` resolves the name again, so a DNS answer that changes in between (rebinding) would reach a blocked range. `import-source` dials the checked address with [`pinned-fetch.ts`](../../supabase/functions/import-source/pinned-fetch.ts), on every redirect hop. Citation verification does not fetch at all (`verifyUrl` in [`supabase/functions/_shared/research.ts`](../../supabase/functions/_shared/research.ts)). Closed finding [7] of the 2026-08-19 review.

## Recorded exceptions

These were raised in review, judged valid, and accepted on purpose. Changing them needs Adam's decision, not a reviewer's.

- Live provider keys reach same-repository PR jobs in `live-e2e.yml`. Adam accepted this on PR #68; the mitigation is dedicated low-limit keys ([#68](https://github.com/Programcode/DebateLab/pull/68#discussion_r4090563258)).
- The production canary account's credentials reach `prod-canary.yml` through Actions secrets, approved 2026-09-24 and recorded in AGENTS.md ([#68](https://github.com/Programcode/DebateLab/pull/68#discussion_r4090664336)).
- Manual canary runs can exhaust the account's daily quota; that shows as a quota error, not a false pass ([#68](https://github.com/Programcode/DebateLab/pull/68#discussion_r4093482054)).
- CodeRabbit rated the shared preview-origin allowlist from PR #95 as a high retained concern: an approved production preview runs unmerged code that can receive demo-session handoffs ([#95 security review](https://github.com/Programcode/DebateLab/pull/95)). [docs/operations.md](../operations.md#opt-in-previews) describes the current setup. This one has no recorded decision yet.

## Telemetry and error reports

[`src/lib/observability.ts`](../../src/lib/observability.ts) is the only path to PostHog and Sentry.

- Events use a closed allowlist of names, and string attributes accept only listed values. An open string field lets a caller send debate content ([#22](https://github.com/Programcode/DebateLab/pull/22#discussion_r3896703404)).
- Error boundaries report a fixed error with fixed context, never the caught error, whose message can contain user input ([#16](https://github.com/Programcode/DebateLab/pull/16#discussion_r3895854129)).
- Count only events that really happened. A route event fired before the auth redirect recorded denied access as a visit ([#16 review](https://github.com/Programcode/DebateLab/pull/16#issuecomment-5480853309)).
