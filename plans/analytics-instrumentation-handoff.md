# Handoff prompt: activate analytics and error tracking

Paste everything below the line into a fresh agent session with the DebateLab
repo as the working directory.

---

You are working in `/home/codex/Projects/DebateLab`, a Vite + React + TypeScript
SPA (shadcn/ui, Tailwind, Zustand, Supabase backend, Capacitor iOS wrapper).

## The situation

DebateLab ships twelve tools under `/app` and currently collects **zero product
analytics and zero crash reports in production**. Both libraries are already
installed and wired, but inert:

- `src/lib/observability.ts` exports `initializeObservability`,
  `captureProductEvent`, and `captureException`. All three are gated on
  `import.meta.env.VITE_SENTRY_DSN` / `VITE_POSTHOG_KEY` being set.
- `src/main.tsx:26` already calls `initializeObservability()`, so Sentry and
  PostHog boot with no code change the moment the env vars exist.
- `captureProductEvent` has **zero callers** in the entire codebase. Verify with
  `grep -rn captureProductEvent src/`.
- `captureException` is likewise unused.
- `vercel env ls` returns "No Environment Variables found for
  adam-gaborjanis-projects/debate-navigator", so nothing is set in the deployed
  environment either.

So: nobody knows which of the twelve tools are actually used, and production
exceptions vanish silently.

## Your job, in two parts

### Part 1: turn the pipes on (no code change)

The variables are already documented in `.env.example`:

```
VITE_SENTRY_DSN=
VITE_POSTHOG_KEY=
VITE_POSTHOG_HOST=https://eu.i.posthog.com
```

Do this:

1. Ask Adam for the Sentry DSN and PostHog project key. **Do not invent
   placeholder values, do not print the values back in chat, and do not write
   them into any tracked file.** A Sentry DSN is technically public but treat it
   as a secret in transit anyway.
2. Add all three to Vercel for the production, preview, and development
   environments (`vercel env add VITE_POSTHOG_KEY production`, etc.). Reading
   values from stdin avoids them landing in shell history.
3. Confirm with `vercel env ls` that the names are present. That command prints
   names only, not values, so its output is safe to show.
4. **Do not trigger a deploy yourself.** Report that a redeploy is required for
   the new build-time vars to take effect and let Adam authorize it.

No CSP work is needed. Both `vercel.json` and `nginx.conf` already allow
`https://*.ingest.sentry.io https://*.sentry.io https://eu.i.posthog.com
https://*.posthog.com` in `connect-src`. If you touch CSP for any reason, the two
files must stay byte-compatible; `src/test/vercel-deployment-config.test.ts`
enforces that they agree.

### Part 2: instrument the events that answer real questions

Add roughly a dozen `captureProductEvent` calls. Resist adding more. Every event
should be one you can name the decision it informs.

**The chokepoint.** `src/lib/ai/client.ts:289` defines
`async function callSupabaseAI(feature, input, config, options)` where `feature`
is `'generate' | 'attack' | 'brainstorm' | 'factoids' | 'ask' | 'sparring' |
'crossfire'`. Every non-streaming AI call in the app funnels through it. It
already computes `requestId`, `startTime`, `provider`, `config.model`, and
`elapsed = Math.round(performance.now() - startTime)`. Instrument here rather
than in each of the eight exported entry points (`generateCase:974`,
`attackCase:999`, `brainstorm:1012`, `factoids:1024`, `askChat:1059`,
`crossfire:543`, `generateSparringTurn:1126`, `judgeSparringSession:1177`).

Emit:

- `ai_request_started` with `{ feature, provider, model }`
- `ai_request_succeeded` with `{ feature, provider, model, durationMs }`
- `ai_request_failed` with `{ feature, provider, model, durationMs, errorName,
  statusCode }`

For the failure case, classify using the existing exported predicates rather
than string matching: `isAIAuthError:265`, `isAIRateLimitError:269`,
`isAIProviderError:273`, `isTimeoutError:277`, `isAISubscriptionError:281`,
`isAIModelRestrictionError:285`. All error classes extend `AIError` (line 145)
which carries `statusCode`, `requestId`, and `details`.

Then route genuinely unexpected failures to Sentry via `captureException`.
Expected states are not bugs: skip auth errors, rate limits, subscription and
model-restriction errors, and user-initiated aborts. Do send provider errors,
`AIResponseError`, and unknown wrapped errors. `RouteErrorBoundary` in
`src/App.tsx:58` currently only calls `console.error` in `componentDidCatch`;
add `captureException` there too.

**Streaming path.** `askChat` bypasses `callSupabaseAI` when streaming is
available. See `src/lib/ai/streaming.ts` (`isAskStreamingSupported:25`,
`streamAskChat:72`). Instrument that path separately with the same three event
names and `{ feature: 'ask', streaming: true }` so streamed and non-streamed Ask
usage stay comparable.

**Tool opened.** One event, `tool_opened`, with `{ tool }` derived from the
route. Twelve routes live in `src/App.tsx:118-130`: generate, attack, brainstorm,
factoids, ask, crossfire, history, library, timer, sparring, flowchart, settings,
admin. Prefer a single subscription to router location changes over pasting a
call into twelve page components.

**Export used.** `content_exported` with `{ format, tool }`. Export helpers live
in `src/lib/export-utils.ts` (docx and Google Docs, lines 39-596) and
`src/lib/pdf-export-utils.ts` (lines 261-653). Both sets return
`Promise<boolean>`; only count an export when the promise resolves truthy.

**Sparring.** `sparring_round_completed` with `{ format, roundIndex }` and
`sparring_session_judged`. The store is `src/lib/stores/sparring-store.ts`.

### Privacy rules, non-negotiable

- Never put user content in event properties. No motions, no case text, no chat
  messages, no source titles, no email addresses. Counts, enum values, booleans,
  and durations only.
- PostHog is already configured defensively in `observability.ts`:
  `autocapture: false`, `capture_pageview: false`,
  `disable_session_recording: true`, `persistence: "memory"`. Do not relax any of
  those.
- Sentry is initialized with `sendDefaultPii: false`. Leave it.
- If you add `posthog.identify`, use the Supabase user id only. The precedent is
  `setJamUserId` in `src/lib/jam-metadata.ts`, called from
  `src/lib/supabase/AuthProvider.tsx:109` and `:129`. Reset identity on sign-out;
  the auth listener is at `AuthProvider.tsx:146`.
- The privacy policy at `src/pages/PrivacyPage.tsx` renders from
  `src/locales/en.json` under `privacyPage`. Section `p7` currently says only
  "We use analytics to improve service quality." Once real product analytics and
  error tracking are live, that sentence should name the processors. Flag this to
  Adam as a copy change requiring his sign-off; there are three locales
  (`en.json`, `hu.json`, `es.json`) and they must stay in sync. Do not silently
  rewrite legal copy.

### Tests

There is no observability test file yet. Add `src/test/observability.test.ts`
following the conventions of the existing suite (vitest with `globals: true`,
jsdom, setup at `src/test/setup.ts`). Cover at minimum:

- `captureProductEvent` is a no-op when `VITE_POSTHOG_KEY` is unset, and calls
  through when set.
- The error classifier maps each `AIError` subclass to the expected
  `errorName` and decides correctly whether it reaches Sentry.
- No event payload contains free-text user input.

`src/lib/ai/client.ts` is inside the coverage `include` list in
`vitest.config.ts` with thresholds of statements 90, branches 80, functions 89,
lines 90. Your new branches in that file are measured, so cover them or the gate
fails. Existing client tests to model on: `src/test/ai/client.test.ts`,
`src/test/ai/client-branches.test.ts`, `src/test/ai/streaming.test.ts`.

### Verification

Run `npm run verify`. It chains lint, typecheck, `vitest run --coverage`, and
build, and it is the only real gate right now.

**GitHub Actions cannot allocate runners on this repository** because of an
account billing state, so CI will report failure regardless of code quality. Do
not chase it, do not try to fix the workflow, and do not treat a red check as
evidence about your change. Local `npm run verify` passing on a clean tree is the
standard.

Also confirm the manual behavior: with the env vars absent, the app must build
and run exactly as before, with no console noise and no network calls to Sentry
or PostHog.

### Boundaries

- Do not commit, push, open or update a PR, merge, or deploy without Adam's
  explicit authorization for that specific action.
- Do not paste secret values into chat, into a file, or into a commit.
- Note that `plans/pr11-salvage.md` is currently staged but uncommitted. Leave it
  alone. Stage only files you actually changed.
- If you find something else broken, report it. Do not fix it as part of this
  task.

### Report format

When done, report in this order: outcome classified as verified /
partially_verified / blocked / not_applicable, then changed files, then checks
run with their results, then remaining risk, then the next action Adam needs to
take (which will be at minimum: authorize the Vercel redeploy, and decide on the
privacy policy wording).
