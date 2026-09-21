# Jev decisions for Crossfire, sources, and model routing

**Status:** Draft for written review

**Date:** 2026-09-21

**Owner:** DebateLab

## Goal

Use TypeSafe Jev through DebateLab's existing OpenRouter account for narrow,
typed judgments that improve three product flows:

1. show live coaching signals during Crossfire;
2. rank, retain, and track the sources that materially inform AI work;
3. offer `Auto Fast` and `Auto Pro` choices that resolve to a concrete writing
   model for each request.

Jev is an internal decision model. It never appears as a prose-writing model,
never receives a browser-visible credential, and never replaces deterministic
authorization, quota, validation, citation, or conflict checks.

## Product requirements

### Crossfire

- Every completed question-and-answer pair receives live coaching signals.
- The signals are:
  - answer quality: `direct`, `partial`, or `evasive`;
  - concession: `none`, `implicit`, or `explicit`;
  - follow-up opportunity: a probability from 0 to 1.
- Signals appear beneath the answer they evaluate and remain visible in the
  final transcript.
- The interface describes them as coaching judgments, not objective scores.
- A Jev failure must not discard or delay an otherwise valid Crossfire reply.

### Sources

- Jev evaluates candidate sources for relevance, evidence strength, and
  importance to the current request.
- Jev ordering is applied only after existing deterministic URL, source-type,
  quality-floor, and provenance rules.
- Active user sources are not deleted or silently deactivated because of a
  Jev decision.
- The prompt receives the strongest relevant sources first within the existing
  source-count and character budgets.
- After Generate completes, Jev identifies which retained sources materially
  informed the generated case.
- The product labels that result `Used in this case` and explains that it is a
  semantic model judgment, not an exact citation trace.
- Saved cases keep a bounded source-usage snapshot.
- The source library defaults to a `Smart` sort that places case-used sources
  first, followed by importance, evidence strength, existing deterministic
  quality, and recency.
- Existing sort choices remain available.
- Semantic metadata persists in the existing `sources.metadata` JSONB column.
  No schema migration is required.

### Automatic model routing

- The model picker adds `Auto Fast` and `Auto Pro` above the concrete models.
- `Auto Fast` is available to Basic and Pro accounts.
- GLM 5.3 Flash is the normal `Auto Fast` selection, including for Basic
  accounts. Manual GLM selection can retain its existing Pro restriction.
- Jev may divert `Auto Fast` to Luna, Gemini Flash, or DeepSeek Flash when the
  bounded request clearly fits one of those models better.
- `Auto Pro` remains Pro-only and routes among GPT-5.6 Sol, Claude Opus 5, and
  Claude Sonnet 5.
- Manual model choices continue to bypass Jev routing.
- OpenRouter requests, cost accounting, and admin reporting use the concrete
  resolved model.
- Responses expose both the requested selection and resolved model in bounded
  metadata.
- A routing failure falls back to GLM 5.3 Flash for `Auto Fast` and Claude
  Sonnet 5 for `Auto Pro`.
- The daily user quota is consumed once per product request. Internal Jev calls
  do not reserve additional daily quota.

## Architecture

### Shared Jev client

Create a small shared Deno module under `supabase/functions/_shared/` that:

- calls `POST https://openrouter.ai/api/alpha/decisions`;
- authenticates with the existing `OPENROUTER_API_KEY`;
- pins `typesafe/jev-1.13` so behavior cannot change without a code review;
- accepts only state plus `noul`, `choice`, and `score` questions;
- applies an eight-second timeout linked to the parent request signal;
- enforces the existing provider response byte limit;
- parses external JSON from `unknown` into narrow answer types;
- returns normalized usage and the actual returned model;
- allows an injected fetch function in tests without adding a runtime SDK.

One request batches all related questions for a decision. No question asks Jev
to generate text, count items, or create model identifiers.

### Failure policy

- Crossfire: return the valid reply with no signal.
- Source ranking: preserve deterministic source ordering and existing retention
  behavior.
- Source-use identification: return the case without use labels.
- Auto Fast: use GLM 5.3 Flash.
- Auto Pro: use Claude Sonnet 5 after the existing Pro entitlement check.
- Abort: propagate the caller's abort rather than running a fallback provider
  request after the user has canceled.
- Invalid Jev output: treat it as unavailable; never coerce malformed values.

### Usage accounting

The main product request keeps one normal `ai_requests` row using the resolved
writing model. Each completed Jev call adds a separate internal row using:

- provider: `openrouter`;
- model: `typesafe/jev-1.13`;
- feature: `jev_model_router`, `jev_source_ranking`,
  `jev_source_usage`, or `jev_crossfire_signals`.

This keeps cost and latency auditable without incrementing the daily quota a
second time. Failed calls with observed usage retain the existing incomplete
usage semantics.

## Model routing contract

### Selection types

Keep the concrete `MODEL_CATALOG` unchanged. Define virtual selections beside
it:

```ts
type AutoModelSelection = "auto-fast" | "auto-pro";
type ModelSelection = ModelCatalogEntry["id"] | AutoModelSelection;
```

Settings normalization accepts the two virtual values. Server validation keeps
virtual selections separate from concrete OpenRouter model IDs.

### Candidate criteria

`Auto Fast`:

- `z-ai/glm-5.3-flash`: default for ordinary structured DebateLab work and
  efficient long-context requests;
- `openai/gpt-5.6-luna`: short latency-sensitive conversation and simple
  coaching;
- `google/gemini-3.8-flash`: very long input, multilingual output, or a request
  whose dominant need is broad context handling;
- `deepseek/deepseek-v4-flash-0731`: logic-heavy analysis, adversarial attack,
  or structured reasoning at low cost.

`Auto Pro`:

- `openai/gpt-5.6-sol`: complex structured reasoning and reliable multi-part
  analysis;
- `anthropic/claude-opus-5`: nuanced rhetoric, adversarial critique, and
  demanding long-form writing;
- `anthropic/claude-sonnet-5`: balanced professional work and the fallback when
  no specialist clearly wins.

The Jev state contains the feature, requested language, controls, source count,
reasoning level, and bounded request text. It excludes credentials, user IDs,
and full source-library contents. A confidence below 0.55 uses the relevant
fallback.

### Entitlements and request sequence

1. Parse the requested selection without treating it as a concrete model.
2. Authenticate the user and resolve the current subscription.
3. Reject `Auto Pro` for non-Pro users with the existing upgrade response.
4. Reserve one daily quota unit.
5. Resolve an automatic selection through Jev or its fallback.
6. Apply the existing concrete-model allowlist and reasoning rules.
7. Call OpenRouter with the resolved model.
8. Log and return the resolved model plus the requested selection.

The streaming Ask handler follows the same sequence before opening the upstream
stream.

## Source decision contract

### Request source identity

The browser includes each active library source's stable ID in the authenticated
request. Prompt rendering continues to expose only bounded title, content,
origin, and type. The ID exists for assessment correlation and is not trusted
as authorization; the browser can only persist assessments through existing
user-scoped RLS.

Research-discovered sources use their normalized public URL as a temporary
correlation key until autosave creates a source row.

### Semantic fields

Extend source provenance with an optional nested object:

```ts
interface SourceSemanticMetadata {
  relevance: number;       // 0..1
  importance: 0 | 1 | 2 | 3;
  strength: 0 | 1 | 2 | 3;
  evaluatedAt: string;
  useCount: number;
  caseUseCount: number;
  lastUsedAt?: string;
  lastUsedInCase?: boolean;
}
```

All fields are parsed at the client boundary. Counts are non-negative integers,
probabilities are bounded, score levels are exact integers, and invalid nested
objects are discarded without discarding valid existing provenance.

`updateSource` persists `metadata` as well as editable source fields. Assessment
updates preserve existing URL, type, query, quality, and capture provenance.

### Ranking and retention

For each bounded source candidate, one Jev batch asks:

- whether it is relevant to the request;
- how strong its evidence is on a four-level rubric;
- how important it is to the requested output on a four-level rubric.

The application sorts candidates by relevance, importance, strength, existing
quality score, then stable original order. A relevance probability below 0.45
does not delete or deactivate an active source. It only moves the source below
better candidates. If all results fall below the threshold or Jev fails, the
existing deterministic order remains.

Automatically discovered sources are autosaved only when they pass the existing
non-weak quality floor and the semantic relevance threshold, or when post-output
usage identification marks them as used. This replaces the current behavior of
saving every discovered source while preserving the existing Undo action.

### Case-use identification

After Generate output has passed schema and control validation, one Jev batch
asks independently whether each retained source materially informed the case.
The application uses a probability above 0.70 for `Used in this case`; values
from 0.30 through 0.70 remain uncertain and do not receive the label.

The generated case metadata keeps a maximum of ten source snapshots containing
source ID when available, title, safe origin, importance, strength, and the
usage judgment. Saving the case therefore preserves the relationship without a
new table or migration.

## Crossfire signal contract

After the generative next-turn output passes its existing strict schema, the
server constructs the newest completed exchange by combining the transcript and
new reply. One batched Jev request asks:

- answer quality as `direct`, `partial`, or `evasive`;
- concession as `none`, `implicit`, or `explicit`;
- whether the exchange presents a useful follow-up opportunity.

The normalized response is:

```ts
interface CrossfireTurnSignal {
  answerTurnId: string;
  answerQuality: "direct" | "partial" | "evasive";
  answerQualityConfidence: number;
  concession: "none" | "implicit" | "explicit";
  concessionConfidence: number;
  followUpOpportunity: number;
}
```

The server derives the answer turn ID from the validated sequence. The client
never accepts signals for an unknown or non-answer turn. Retried replies replace
the pending reply and signal together; they cannot attach a fresh signal to an
old answer.

`CrossfireTurn` gains an optional signal. Draft schema version 1 remains valid
because the field is optional. The reducer owns signal attachment so restored,
retried, and newly received turns share one validation path.

## User interface

This is a targeted extension of the existing DebateLab interface. It introduces
no new visual system, icon package, motion language, or layout structure.

### Model picker

- Place `Auto Fast` and `Auto Pro` before concrete models.
- Add short descriptions inside their items.
- Show the existing Pro badge on `Auto Pro` and disable it for non-Pro users.
- Disable the separate reasoning selector for automatic selections because the
  router owns the concrete model and effective reasoning choice.
- Preserve keyboard behavior, accessible names, touch targets, and loading-time
  entitlement behavior.

### Crossfire

- Render signals beneath the answer text inside the existing transcript card.
- Use compact text labels with the current semantic color tokens.
- Show follow-up opportunity only when its probability exceeds 0.70.
- Provide accessible text that does not rely on color.
- Do not animate the signals independently from their turn card.

### Source library and result source lists

- Add `Smart`, `Most used`, `Importance`, and `Evidence strength` sort choices.
- Default to `Smart`.
- Show at most three compact semantic labels per row.
- `Used in this case` has priority over score labels.
- Add the usage explanation to the selected-source inspector.
- Reuse the same labels in researched-source result lists.
- Keep search, folders, active toggles, editing, deletion, and responsive layout
  unchanged.

All visible copy is added in English, Spanish, and Hungarian in the same change.

## Security and privacy

- `OPENROUTER_API_KEY` remains server-only.
- Jev receives only the bounded state required for its question set.
- Source IDs are correlation values, not authorization tokens.
- Existing RLS remains decisive for source writes.
- Jev cannot change subscriptions, consume extra quota, activate sources, delete
  sources, accept edits, or bypass model allowlists.
- Existing prompt-injection, SSRF, URL, citation, and source-quality controls
  remain deterministic.
- Logs contain request IDs, models, counts, timing, and error classes, not user
  prompts, transcripts, source bodies, or credentials.

## Verification

Development follows test-first cycles. Each production branch is preceded by a
test that fails for the missing behavior.

Required automated coverage:

- Jev request serialization, strict response parsing, batching, timeout, abort,
  malformed output, provider failure, and usage normalization;
- Auto Fast Basic access, GLM default, specialist diversion, low-confidence
  fallback, Auto Pro denial for Basic, Pro routing, concrete model logging, and
  streaming metadata;
- source identity bounds, semantic metadata parsing, preservation on update,
  sorting, fallback order, retention, autosave, source-use snapshots, and saved
  case reload;
- Crossfire signal normalization, turn association, reducer persistence, retry
  replacement, Jev failure without reply failure, and debrief compatibility;
- English, Spanish, and Hungarian key parity;
- keyboard and accessible-name coverage for model and source controls.

Required runtime verification:

- a minimal live Jev request through the configured OpenRouter key with no
  credential output;
- focused Deno and Vitest suites after each slice;
- real browser checks for desktop and mobile model selection, Sources smart
  ordering, Generate source-use labels, and both Crossfire modes with live
  signals;
- `npm run verify` on Node 22;
- final diff review, credential scan, and current-head GitHub CI and CodeRabbit
  review.

The pull request is pushed and babysat until its current head is green and has
no actionable review findings. It is not merged.

## Non-goals

- Replacing prose models with Jev.
- Letting Jev verify factual truth or citation authenticity.
- Changing source RLS or adding a source-usage database table.
- Changing the daily quota policy.
- Redesigning DebateLab.
- Deploying Edge Functions, migrations, or frontend code to production.
- Merging the pull request.

## Rollback

Reverting the feature commit restores manual model selection, deterministic
source ordering, and Crossfire without live signals. Existing source metadata
is additive JSON and can remain unread without affecting older clients. No
database rollback or destructive cleanup is required.

## References

- OpenRouter Decisions API:
  <https://openrouter.ai/docs/api/api-reference/alphadecisions/submit-a-decisions-questions-and-answers-request>
- OpenRouter Jev model page: <https://openrouter.ai/~typesafe/jev-latest>
- TypeSafe confidence guidance: <https://docs.typesafe.ai/confidence>
- DebateLab architecture: [`docs/architecture.md`](../../architecture.md)
- DebateLab testing: [`docs/testing.md`](../../testing.md)
