# Staging

**Current.** The one place that says how to reach staging, what is on it, and how it stays in sync with `main`.

Staging is the Supabase project `brifeyypjauyusmkptkx` (named "DebateOwl Staging" in the dashboard). Production is `uziwdtkzofptihahfooo` ("DebateOwl"). Scripts identify projects by ref only; the names are display labels and can change. Staging has its own users, data, and secrets. Nothing on staging can read or write production.

## Get in

**On your phone or laptop, for a PR.** A pull request does not get a Vercel preview unless someone requests one ([operations.md](operations.md#opt-in-previews)). The preview to open is `debatelab-staging`: it is pinned to staging, whatever the browser's saved toggle says. Previews sit behind Vercel login, so sign in to Vercel once on each device. The permanent staging site is `https://debatelab-staging.vercel.app`, built from `main`.

**Sign in.** Two ways:

- Adam: **Continue with Google** with your own account. The seed made that account an admin on Pro with three debates.
- Agents and tests: a staging demo code. The seeded Pro debater's code is `STAGING_SEED_PRO_CODE` in `~/.config/debatelab/staging-access.env` on the VPS (mode 600). Never paste it into GitHub, docs, or screenshots.

A production account, demo code, or email code does not work on staging, and a staging one does not work on production.

**Without a PR.** `npm run dev:preview` runs your working tree pinned to staging on the tailnet ([development.md](development.md#preview-on-the-tailnet)). Use it for uncommitted changes.

## What is on it

`node scripts/staging/seed.mjs` creates invented accounts and content. Every row has a fixed id, and a rerun restores the seed without duplicating it. The sync reruns the seed after each new commit on `main`.

| Account | Plan | Content |
| --- | --- | --- |
| `seed-admin@staging.debatelab.test` | Pro, admin | none; creates the demo code |
| `seed-pro@staging.debatelab.test` | Pro | 3 debates, demo code `STAGING_SEED_PRO_CODE` |
| `seed-trial@staging.debatelab.test` | Trial, 5 days left at seeding | 1 debate |
| `seed-expired@staging.debatelab.test` | Expired trial | 1 debate |
| `STAGING_OWNER_EMAIL` (Adam's Google address) | Pro, admin | 3 debates |

The debates cover private cars in city centres, platform liability for misinformation, and standardised testing. Each has two or three sources and two or three saved results. Between them they cover cases, attacks, brainstorms, and factoids, and the liability debate also has an Ask chat. Seeded ids start with `5eed`. The fixtures live in [`scripts/staging/fixtures.mjs`](../scripts/staging/fixtures.mjs); all of the text is made up.

A demo code turns its account into lifetime Pro when used, so the trial and expired accounts have none. To try those plans:

- Adam, on any device: `node scripts/staging/seed.mjs --owner-tier trial` (or `expired`) on the VPS, then reload. The next seed run, at the latest the next merge to `main`, puts the account back on Pro, or run `--owner-tier pro`.
- Agents: `node scripts/staging/seed.mjs --session trial > "$tmp/session.json"` prints a session for any seeded account (`admin`, `pro`, `trial`, `expired`, `owner`) without sending mail. Put it in the `debate-auth-staging` localStorage key before the app loads, as [`e2e/staging/auth.setup.ts`](../e2e/staging/auth.setup.ts) does. It holds live tokens: keep it in a mode-600 file and delete it afterwards.

Staging deliberately has no Stripe or ElevenLabs secrets. Checkout, the billing portal, `stripe-webhook`, and the Stripe part of account deletion fail on staging, and voice rounds fall back to the browser voice. AI requests and web research use staging's own OpenRouter and Exa keys.

## How it stays in sync

A user systemd timer on Adam's VPS, `debatelab-staging-sync.timer`, runs [`ops/staging-sync/run.sh`](../ops/staging-sync/run.sh) every 5 minutes. When `origin/main` has a commit it has not synced, it:

1. checks that commit out in a dedicated clone at `~/ops/debatelab-staging-sync/repo` (it never runs `npm install`);
2. runs [`scripts/staging-sync.mjs`](../scripts/staging-sync.mjs), which refuses unless the Supabase CLI can see `brifeyypjauyusmkptkx` (by ref, so renaming the project in the dashboard doesn't break it) and `SUPABASE_PROJECT_ID`, if set, is that same ref, passes `--project-ref brifeyypjauyusmkptkx` to every CLI call, applies pending migrations, deploys new or changed Edge Functions except the hidden `workspace-invites`, and then checks that nothing is left pending. A function counts as changed when git has changed it since its last deploy, or when the source staging runs (from `supabase functions download`) differs byte for byte from the commit. The second check catches an older checkout deployed by hand;
3. reruns the seed;
4. sets the `staging-sync` commit status on that commit, and opens or comments on the GitHub issue **Staging is out of sync with main** when anything fails. A later successful sync closes the issue.

An already-synced commit is rechecked hourly, so drift from a hand deploy also shows up. A failed commit is retried hourly. The script stops instead of pushing when staging has a migration the commit lacks. It never deletes a function: one that is deployed on staging but gone from the commit fails the sync until someone runs `supabase functions delete <name> --project-ref brifeyypjauyusmkptkx`. `workspace-invites` is the exception, because it is hidden and never deployed.

`Protected staging E2E` waits for a successful `staging-sync` status on its commit before testing, and the timer holds any sync while a browser job is running. It runs daily and on demand, on `main`'s head. If `main` moves past the commit while it waits, the run skips: staging then runs the newer backend, which the next daily run or a dispatch tests. If no status arrives within 20 minutes, it fails with a pointer to this page.

PRs that change `supabase/migrations/` or `supabase/functions/` get a comment saying their staging preview still runs `main`'s backend. Those changes reach staging only after merge. To try them before then, use the `verify-debatelab` skill against a local stack.

### The credential and its blast radius

The timer uses the Supabase CLI login already on the VPS (`~/.supabase/access-token`). It is a classic personal access token for Adam's account, so it reaches production too. The scripts' ref checks keep the sync itself on staging, but they are not a security boundary. Anyone who can merge to `main` can change those scripts, and the timer will run the new code with that token within 5 minutes. A malicious or broken merge could read or change production, including its database and secrets. Today that is the same trust as the other agents on the VPS that use this token, and only Adam merges to `main`.

To shrink it, replace the token with a Supabase scoped token limited to the staging project `brifeyypjauyusmkptkx` (Database and Edge Functions read-write) and pass it to the service as `SUPABASE_ACCESS_TOKEN`. Then a bad merge can touch staging only.

### Operate it

```bash
systemctl --user list-timers debatelab-staging-sync.timer      # next run
journalctl --user -u debatelab-staging-sync -n 100 --no-pager  # last runs
systemctl --user start debatelab-staging-sync.service          # sync now
node scripts/staging-sync.mjs --dry-run                        # what a sync would do, from your checkout
npm run backend:status -- --project-ref brifeyypjauyusmkptkx   # read-only drift report
bash ops/staging-sync/install.sh                               # after changing run.sh or the units
```

The unit's `PATH` names `~/.nvm/versions/node/v24.20.0/bin`, where `node` and `supabase` live. If nvm drops that version, the service fails before it can report, so update the unit and rerun `install.sh`. State lives in `~/ops/debatelab-staging-sync/state/` (`last-ok`, `last-failed`); delete a file to force a rerun.

## Rules

- Production is never a fallback. When staging access fails, stop.
- Staging browser tests create uniquely named data and delete only what they created ([testing.md](testing.md#protected-staging)).
- To run the staging browser suite locally, use the seeded Pro code as `STAGING_DEMO_CODE`, and rerun the seed afterwards to restore that account's Current Debate. The CI code exists only as a GitHub secret. The copy in `~/.config/debatelab/staging-e2e.env` expired on 2026-09-10.
- `VERCEL_STAGING_BYPASS` (GitHub `staging` environment, and the VPS access file) lets CI and agents open protected `debatelab-staging` previews with the `x-vercel-protection-bypass` header. Treat it like the demo codes.
