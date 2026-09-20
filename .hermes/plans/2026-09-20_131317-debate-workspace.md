# Debate workspace implementation plan

> For agentic workers: use `superpowers:executing-plans` or, when delegated execution is authorized, `superpowers:subagent-driven-development`. This is a master plan. Execute one reviewed slice at a time and keep its checkboxes current. Planning does not authorize implementation or deployment.

**Goal:** Give a school debate squad one persistent, collaborative place to prepare both sides of a motion, develop speeches, share evidence, use AI, practise, review feedback, and export its work.

**Architecture:** Keep Supabase as the authority for identity, workspace membership, metadata, durable documents, discussions, and audit records. Use Tiptap with Yjs for rich collaborative documents and a small self-hosted Hocuspocus service for authenticated synchronization, persistence acknowledgements, and serialized document commands. Keep existing personal tools working and connect them through an explicit workspace context.

**Tech stack:** Existing React 18, TypeScript, Vite 7, React Router 7, Zustand 5, TanStack Query 5, Tailwind 3, Radix components, Lucide, Zod 4, Supabase, Deno Edge Functions, Vitest, Playwright, and pgTAP. Proposed additions are pinned Tiptap/ProseMirror collaboration packages, Yjs, Hocuspocus, and an audited IndexedDB provider. Keep Node 22 and npm with the committed lockfile.

**Spec:** Sections 2 through 10 of this file are the product and technical specification. The complete request is captured here; implementation must not depend on the original conversation.

## 1. Audience, ownership, evidence, and boundaries

Owner: Adam. Audience: the implementation lead, bounded feature workers, security reviewer, release operator, and school pilot testers. Target repository: DebateLab. Planning checkout: `/home/codex/.t3/worktrees/DebateLab/debate-workspace-plan`, branch `plan/debate-workspace`, inspected base `b2ba178dee148d06d9bf89793f044add69d705b8`, dated 2026-09-20. A future executor must run `git rev-parse --show-toplevel`, inspect branch and status, and revalidate this plan against its current base before editing. Do not reuse paths from another checkout by assumption.

This deliverable is planning only. Implementation, commits, pushes, PR actions, deployment, production migrations, secrets, email delivery, and purchases are separate actions requiring the applicable authorization. A future implementation approval does not authorize production changes. Keep existing user changes and sibling worktrees intact. This task creates one Markdown file only.

Prerequisites for implementation are an authorized isolated checkout, Node 22, npm, Docker for database tests, Supabase CLI at least 2.115, and Deno as pinned by CI. Deployment additionally needs an approved long-lived WebSocket host, TLS and proxy configuration, a staging project, the Google OAuth application's approved redirect URIs, a secrets store, and an approved transactional email sender. Missing deployment credentials must not stop local implementation, but they block the corresponding live proof.

Human inputs needed before a real pilot are operational, not missing product design: approve the hosting cost/target, configure Google credentials and consent through private channels, approve invitation email sender/domain, identify a school test squad and access to two Google test accounts, and approve production release. Default retention and limits below are usable product decisions. Review school/privacy obligations with the operator before collecting students' real data. No paid editor purchase is assumed.

Source inspection establishes these facts:

- `src/App.tsx` lazy-loads route tools. `src/components/layout/AppLayout.tsx` owns the app navigation. Workspace navigation does not yet exist.
- `src/lib/stores/session-store.ts` owns personal results, saved chats, active sources, source folders, and hydration. Saved chat creation writes a chat and its messages; it is not a shared streaming conversation log. Do not turn this store into the workspace document database.
- `src/lib/supabase/AuthProvider.tsx` resets/hydrates personal state across account changes. It also removes historical locally persisted Google credentials. New workspace caches must participate in this account boundary.
- `src/lib/stores/sparring-store.ts` and `src/lib/crossfire/` hold separate practice state. `src/pages/HistoryPage.tsx` loads saved content into route-specific stores. Existing handoffs are useful affordances, not a collaboration model.
- `supabase/migrations/20260129000000_init.sql` establishes user-owned cases, attacks, brainstorms, factoids, chats, messages, sources, and source files. `supabase/migrations/20260520000001_idempotency_and_sharing.sql` adds snapshot sharing. `supabase/functions/share/index.ts` accepts supplied item data and creates share codes. Public snapshot links must never become workspace invitations or live document authorization.
- `supabase/migrations/20260822000001_source_provenance_metadata.sql` and `SourceProvenance` in the session store provide URL, source type, quality, query, and capture-origin fields worth preserving.
- `src/lib/source-file-import.ts` already uses Mammoth and PDF.js. Its DOCX path extracts plain text and truncates oversized extracted source text. That behavior is unsuitable for importing a student's complete formatted speech without a preview and explicit decision.
- `src/lib/export-utils.ts` dynamically imports `docx` and passes a short-lived Google provider token to `export-gdoc`. `src/lib/pdf-export-utils.ts` already owns PDF generation. `src/components/features/export/GoogleDriveAuthModal.tsx` currently requests Drive access through app sign-in. `supabase/functions/export-gdoc/index.ts` explicitly rejects browser refresh tokens and handles generate/attack/brainstorm/factoids output. There is no durable multiple-Google-account connector.
- `src/lib/ai/client.ts` is the browser AI boundary. It currently gathers active personal sources and autosaves discovered sources into the personal library. Workspace calls must use an explicit target to avoid leaking private sources or saving shared research into the wrong library.
- `supabase/functions/ai/index.ts`, `supabase/functions/ai-stream/index.ts`, and their `_shared` modules enforce auth, model controls, research, usage, and accounting. Keep these controls authoritative.
- The installed tree includes `docx`, `mammoth`, `react-markdown`, `jspdf`, and `jspdf-autotable`; it does not include a rich editor, CRDT, or collaboration server. `react-markdown` is a renderer, not a collaborative authoring solution.
- `src/locales/en.json`, `src/locales/es.json`, and `src/locales/hu.json` are the supported locale files. `docs/testing.md`, `docs/operations.md`, `.github/workflows/deploy.yml`, and `.github/workflows/staging-e2e.yml` define the actual verification and release boundaries. `plans/README.md` has historical status labels and must not override source evidence.

## 2. Product contract and executive decisions

The workspace is the squad. Do not add a permanent Team entity, opponent roster, organization hierarchy, or team-transfer workflow. Creating a workspace asks for a motion and optional short title, then atomically creates owner membership and eight files. The owner is an editor with one extra power, workspace deletion. All collaborators edit all files, invite people, and remove non-owner members. An assignee denotes responsibility, never access.

Each workspace has canonical sides `pro` and `con`. Spanish labels are `A favor` and `En contra`; English defaults are `For` and `Against`; Hungarian defaults are `Mellette` and `Ellene`. Store side identifiers, not translated labels. Each side begins with `Intro`, `R1`, `R2`, and a localized `Conclusion` default. Users may rename titles without altering document identity or side. Generated default names follow the workspace's initial language; changing app language does not rename user content.

Workspaces remain visible in an account's searchable list until that person hides them or loses access. Starting another workspace never alters earlier memberships. Hide is a per-user preference with an obvious Hidden filter and does not revoke membership. Archive is a shared reversible status that moves a completed debate out of Active and permits reading/export; any member can reopen it. Show explicit archive confirmation and preserve old work under All workspaces. Removal is a deliberate access action and is the exception to continued old-workspace access.

Files support rename, ordered placement within a side, move between sides, assignment, duplication, archive, and trash. Reorder uses a transaction over the side's ordered IDs with an expected metadata revision; retry visibly on concurrent reorder rather than overwriting. Integer positions are sufficient for dozens of files. Duplication copies current accepted content and citations into a new document ID, clears assignment, and records provenance; it does not copy active comments, proposals, or version history as if they happened on the duplicate. Archive keeps content and history. Trash lasts 30 days, is restorable by any member, and retains assignment when still valid. Permanent file purge is a scheduled retention operation after the recovery window, never a casual editor button. A citation to a trashed source keeps its immutable bibliographic snapshot.

Every member can remove another non-owner member, including themselves through an explicit access action, but ordinary navigation offers Hide rather than Leave. Nobody can remove the owner. An owner can transfer ownership to an existing member after that member accepts. The old owner remains an editor. Transfer atomically changes owner identity and validates both memberships. An owner deleting their account must transfer owned shared workspaces or explicitly delete them first. Use a database constraint/trigger to prevent raw account deletion from cascading shared work; do not rely on the Settings page alone. A forced administrative erasure needs an approved transfer/deletion runbook. Never silently assign ownership to the oldest member.

Workspace deletion is owner-only, with motion/title confirmation and a 30-day recovery window. Mark deleted and reject collaboration before acknowledging success. The owner can restore during that window. Members see an unavailable/deleted explanation, not a blank editor. After purge, content is gone according to the published retention policy and backup expiration; retain only minimized operational tombstones needed for idempotency and abuse handling.

Personal snippets and templates are independent account content. A snippet is a reusable fragment; a template is a named full speech structure. Both use the supported document schema and owner-only RLS. Inserting creates an independent copy, with no later synchronization. Saving selected workspace text to personal content requires an explicit action explaining that the user keeps that copy outside the squad. Never share a user's whole template library with teammates or AI automatically.

Non-goals: Google two-way synchronization, permanent teams, opposing-team collaboration, a generalized file drive, arbitrary third-party editor plugins, spreadsheet editing, LMS administration, live audio/video, and a new personal-skill scoring system. Practice feedback remains connected and useful, but this plan does not invent a cross-debate ranking algorithm.

## 3. Architecture and technical gate

### 3.1 Recommended editor and service boundary

Use Tiptap's open-source ProseMirror editor with Yjs and the Hocuspocus provider. Begin with paragraphs, headings, bold, italic, underline, strike, lists, blockquotes, links, tables, inline citation references, and the marks/nodes required by suggestions. Support Markdown paste, keyboard shortcuts, import, and export. The canonical content is a versioned structured editor document encoded in Yjs, not a Markdown string. A Markdown source view must apply an explicit reviewed replacement and warn about rich features it cannot represent. Do not run two independently mutable canonical formats.

Keep the editor behind a lazy workspace route and retain existing Tailwind/Radix/Lucide tokens. Use a document-focused layout, restrained motion, and readable dense controls. No design-system replacement, GSAP dependency, new icon family, or marketing-style page is needed.

Yjs handles concurrent edits and reconnection. Disable the editor's ordinary history extension and use collaboration-aware undo with local transaction origins. Undo must undo the current user's edits, not a teammate's recent insertion. Selection/cursor state uses awareness and expires on disconnect. Derive identity and display metadata from authenticated membership; never trust a browser-supplied user ID as attribution.

Hocuspocus runs as one separately deployable Node service initially. It owns document sessions and mutation ordering, not billing or a second account system. Supabase owns durable state. Deploy one active writer instance until the tested locking design permits more. Obtain a database advisory lock per loaded document with a dedicated database session; do not use transaction-pooling connections for session locks. Losing the lock/connection must terminate that document's writable session. This prevents split-brain during restarts and rolling deployment. Do not add Redis or a fleet before a measured need.

A small service is justified because character collaboration, durable acknowledgements, server-side proposal acceptance, authenticated attribution, and removal of connected users require more than ephemeral broadcast. Do not host this persistent document process in an ordinary request-limited Edge Function. Edge Functions remain the boundary for AI, Google, and external calls.

### 3.2 Persistence is a release gate

Do not display Saved when an update has only reached a socket. The gateway must persist the accepted binary update and an idempotent client mutation ID, with a server sequence and authenticated author, before emitting a durable acknowledgement. The client keeps pending local updates until that acknowledgement. Yjs synchronization messages alone do not prove database persistence. The technical spike must demonstrate the exact Hocuspocus hooks needed to validate, durably append, apply, and broadcast in that order, including synchronization-handshake updates. If available hooks cannot guarantee this without a fragile fork, stop and compare a maintained alternative provider/server or an approved managed collaboration service. Do not quietly ship debounced persistence with a misleading Saved label.

For each update, serialize by document, validate epoch and schema, authorize the current member, enforce byte/rate limits, apply to a bounded temporary document to validate resulting content, persist, then publish. Invalid state must never poison the live in-memory document. This costs work but closes the trust boundary. Deduplicate retries by document/epoch/client mutation ID; reject reuse with different payload bytes. Authenticated author identity comes from the connection, never Yjs client IDs. Use one small persisted update batch per client roughly every 100-250 ms, with a maximum one-second flush interval under typing. Tune from measurements without weakening durability.

Persist periodic compacted binary state plus update tail and a derived current JSON/text projection at the same sequence. Compaction locks the document, captures sequence N, writes a verified state at N, and prunes only tail entries at or below N after successful commit and backup policy checks. Never derive a fresh Y.Doc from JSON on every reload; that loses CRDT identities. User-visible history stores independent complete states and does not depend on keeping every low-level update forever.

Create automatic history versions after five minutes of changed durable content and when a document becomes idle for one minute, coalescing near-duplicates. Always create versions for named saves, before/after restoration, accepted proposals, and import. Keep automatic versions for 90 days, then a daily version for one year; keep named/import/restore versions until document purge. Show these rules in history. Deduplicate identical content hashes. Capture only durable content, never awareness.

Restore is a new recorded revision, not deletion of history. Acquire the document lock, compare the current sequence shown in the preview, create a pre-restore version, increment a document epoch, initialize the selected content in that new epoch, and reconnect clients. Outstanding old-epoch operations must not merge back and undo the restoration. Preserve their local draft in a recovery view and offer a new reviewed proposal/copy. This intentional epoch boundary also makes incompatible schema migration safe. Undo history resets with a clear notice after restore. Comments remain historical and show detached anchors; proposals against the prior epoch become stale. Never claim that old anchors automatically belong to restored text.

### 3.3 Alternatives and evidence

- Last-write-wins database updates cannot satisfy simultaneous character editing or collaborative undo. Reject them as the core editor protocol.
- OT is possible but requires an authoritative transform service and editor-specific operations. Yjs already covers offline merge and the chosen editor bindings; a custom OT engine adds risk without a product benefit.
- Supabase Broadcast transports events but is not a durable CRDT log, a merge algorithm, or a strict revocation mechanism. Use it only for minimal invalidation hints if useful. Do not build a custom collaborative provider just to avoid one service.
- A raw ProseMirror implementation gives control but requires more authoring UX work. Lexical or a maintained higher-level editor is the fallback if the spike fails compatibility or suggestion requirements. Switching is a conscious architecture review, not parallel implementation of several editors.
- Commercial Tiptap comments/history/tracked-change offerings must not be mistaken for features included in the open-source core. The snapshot extension is documented in a private registry. Implement the bounded product-specific review model below using stable editor APIs, or propose an explicitly priced dependency only after the spike proves maintaining it would be worse.

Primary documentation checked during planning: [Tiptap collaborative editing](https://tiptap.dev/docs/hocuspocus/guides/collaborative-editing), [Hocuspocus hooks](https://tiptap.dev/docs/hocuspocus/server/hooks), [Hocuspocus persistence](https://tiptap.dev/docs/hocuspocus/guides/persistence), [Tiptap snapshot extension](https://tiptap.dev/docs/collaboration/documents/snapshot), and [Yjs UndoManager](https://docs.yjs.dev/api/undo-manager). These support the selection, but exact package versions and hook ordering must be proven against locked versions in Phase 0. No package version is invented here.

## 4. Data model, APIs, and authorization

### 4.1 Additive schema

Use new workspace tables instead of making every existing personal table polymorphic. Workspace-owned rows survive the departure of their original contributor. Every content row has workspace ID, creator attribution, timestamps, and where mutable a revision. Composite foreign keys ensure child IDs belong to the supplied workspace. Index membership by user, active files by workspace/side/order, and versions/messages by parent and sequence. Generate migration names with `supabase migration new` during implementation.

Proposed relations:

- `workspaces`: ID, owner ID, motion, title, initial language, active/archived/deleted state, access epoch, revision, timestamps, deleted timestamp. Owner FK blocks accidental user cascade.
- `workspace_members`: workspace/user composite key, joined timestamp. No viewer/editor role column; all members edit. Removal deletes active membership and produces an audit event. `workspace_preferences`: workspace/user, hidden, last-opened, last-document; only that user edits preferences.
- `workspace_invites`: workspace, digest of random token/code, kind, optional encrypted target email and normalized email keyed hash, issuer, expiry, max uses, use count, revoked timestamp. Keep secret invite values and email targets outside general member-selectable views. Return an invitation code once at creation.
- `workspace_documents`: ID, workspace, side, title, order, assignee, state, epoch, latest durable sequence, schema version, import provenance, timestamps. Validate assignee membership in the same transaction; clear assignment on member removal.
- Private `document_states`, `document_updates`, and `document_versions`: binary Yjs state/tail, durable sequence, author, mutation ID, schema/epoch, hash, projections, and version metadata. Only the gateway writes raw CRDT state. Authorized member read APIs expose history previews, not unrestricted private-schema access.
- `workspace_threads` and `workspace_messages`: named thread, optional topic/document/side context, ordered append-only messages, requester and model attribution, request ID, streaming/final/interrupted status, bounded output. Use unique request/message IDs for retries. Human messages remain attributable; revisions show edited/deleted notices rather than silently rewriting chat history.
- `workspace_sources` and `workspace_source_folders`: copy the useful current source shape and provenance fields, plus canonical URL/content hash, bibliographic metadata, source revision, annotations, archived timestamp. Avoid a forced migration of private sources. Separate source annotations may be rows keyed to source and author when threads are needed.
- `workspace_comments` and `workspace_comment_replies`: document/epoch, relative-position anchors, quoted context, author, body, resolved state, timestamps; replies immutable except author's explicit edit with revision. Mentions are parsed member IDs, not free-form email lookups. `workspace_notifications`: recipient, event ID, read timestamp, minimal payload.
- `workspace_proposals` and `workspace_proposal_hunks`: document/epoch/base sequence/hash, human or AI origin, creator/request reference, selected content and relative anchors, original/replacement structured fragments, status, accept/reject actor and sequence. Store server-validated payloads, never executable editor commands supplied by a model.
- `personal_templates`: user ID, kind snippet/template, title, content/schema version, tags, revision, timestamps. No workspace ID. Independent copies on insert.
- `workspace_artifacts`: workspace, tool, author, immutable validated tool input/output snapshot, related document/version/source IDs, timestamps. Use for generated cases, attacks, brainstorms, factoids, flowcharts, practice snapshots, and feedback. Do not reuse a foreign user's private result ID as shared authorization.
- `workspace_audit_events`: append-only operation ID, authenticated actor, workspace/document, action, before/after revision IDs, timestamp. General events contain no document body or OAuth secrets. Detailed content stays in authorized history.
- Private `google_connections`: user, Google subject, display email, granted scopes, encrypted refresh token, token-key version, revoked/reauth status. Unique user/Google-subject pair. Private `google_oauth_attempts`: single-use state digest, PKCE verifier, initiating app user/session, nonce, permitted return route, expiry. Member-visible exports never expose these rows.

### 4.2 API contracts

Expose a small number of named operations, not a generic arbitrary-table mutation endpoint. Client inputs use Zod; server inputs are independently validated. Missing membership returns a uniform unavailable response without disclosing motion/title.

- `create_workspace({ motion, title, language, requestId })` atomically creates owner/member/eight defaults and returns workspace ID. Retrying returns the original workspace.
- `change_workspace_access({ workspaceId, action, targetUserId?, inviteId?, expectedRevision, requestId })` validates current membership and owner restrictions in one transaction. Code/email invite creation and redemption are server endpoints with rate limits and atomic use accounting.
- `update_workspace_document({ workspaceId, documentId, title?, side?, orderedIds?, assigneeId?, state?, expectedRevision, requestId })` handles metadata only. It cannot modify document content.
- Collaboration handshake sends a bearer credential in the authenticated protocol message, never a URL query string. Document identity includes document ID and epoch. Gateway resolves workspace membership itself. A client mutation carries mutation ID, epoch, bounded binary update, and expected schema version; durable acknowledgement returns mutation ID and server sequence.
- `restore_document({ documentId, versionId, expectedSequence, requestId })` and `decide_proposal({ proposalId, hunkIds, decision, expectedProposalRevision, requestId })` execute through the same serialized gateway authority as edits.
- Workspace AI request accepts workspace ID, thread ID, optional document/selection references, explicit context selections, operation, and request ID. It never accepts a browser-asserted membership or another account's personal-source payload as trusted context.
- Import/export accepts explicit connection ID for Google operations, target IDs, format/options, and idempotency key. The handler loads authorized content itself for workspace exports.

### 4.3 RLS and connected-client removal

Enable RLS on every exposed table and grant only required operations to `authenticated`; no workspace access for `anon`. Membership is queried from current database rows, not editable metadata or stale JWT claims. A narrowly scoped membership helper may need `SECURITY DEFINER` to avoid recursive membership RLS. Put it in a private schema, fix search path, qualify objects, verify `auth.uid()`, revoke PUBLIC/anon execution, and grant only the required call path. Security-invoker APIs remain the default. Every UPDATE checks both previous and resulting scope; immutable scope columns cannot be moved between workspaces.

Prevent direct member-table mutation, owner changes, invitation use-count updates, audit insertion, and proposal acceptance from browsers. Use audited transactional functions or handlers. Do not expose private CRDT tables, token ciphertext, or provider credentials through views. Views returning user data must be security-invoker or deliberately restricted.

The gateway checks current membership and epoch before each accepted update and each content delivery. Access-changing transactions increment workspace access epoch and write an outbox event. After removal commits, purge that user's subscriptions, awareness, queued outbound content, and writable sessions. Database authorization and the update append share a lock/order with membership mutation so a removed user cannot win a race after revocation. Broadcast delivery must use the same serialized access boundary or recheck membership before sending. Prove no new content after revocation acknowledgement with an already-connected hostile client, not only a fresh-login test. Existing downloaded text cannot be remotely erased; explain that fact in access management.

If Supabase Realtime is used for metadata invalidation, channels are private and topics include workspace ID/access epoch. Policies on `realtime.messages` require current membership and the exact topic; client publishing is denied unless a narrowly specified event needs it. Payloads contain opaque IDs/revisions only, never document/chat text, email addresses, or invite secrets. Rotate topics on access changes and fetch all actual content through fresh RLS. Supabase's documented channel-join authorization is not proof of immediate revocation. See [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization).

Email invites return the same message whether the address has an account. Redeem requires a logged-in user whose verified email matches the invite target. Do not use user metadata as email verification. Default email tokens have at least 128 bits entropy, are single use, and expire after seven days. Shareable workspace codes use at least 80 bits entropy, expire after 48 hours, and allow up to the remaining workspace member capacity. Any member can rotate/revoke codes. Removal rotates live codes to prevent immediate re-entry with a remembered code; an explicit new invite can restore membership. Limit invite creation to 20 per member/hour and 50 per workspace/day, redemption failures to 10 per actor/IP/15 minutes, and enforce workspace member cap 30. Use generic errors and avoid account enumeration through timing or search. Quotas fail closed if the limiter is unavailable.

The existing `clear_current_user_data()` clears personal session data. Extend its product copy and tests so clearing personal data never erases shared workspaces. Offer explicit personal template deletion and Google disconnect separately. Account deletion follows the owner-transfer rule and removes personal connector secrets and notifications while anonymizing retained shared authorship where legally appropriate.

## 5. Editing, suggestions, comments, and AI change safety

Human suggestion mode and AI suggestions share the same review object but differ in creation. A human toggles Suggesting in the editor; typing, deletion, and formatting produce visible pending hunks against accepted content, with author attribution. Teammates see suggested insertions/deletions and can reply. The editor may use marks/decorations and a temporary suggestion branch, but proposed text must not become accepted canonical content simply because it is rendered inline. Concurrent edits inside suggestions, IME composition, paste, lists, link changes, and overlap require spike coverage before adoption. Direct editing remains available to all members, so suggestion mode is a collaboration convention, not a permission restriction.

Comments use Yjs relative positions plus document epoch and quoted context. If the anchor range is deleted, show the comment under Detached comments with its quote. Do not attach it to arbitrary nearby text. Replies form one-level chronological threads; resolve/reopen is available to members and audited. Only the author edits their comment text; other members can resolve it and report abuse. Workspace mentions offer only current members, notify in-app once per event, and link to the specific thread. Email mention notifications are opt-in and never reveal content to a removed recipient.

AI has no document-write credential or tool. It returns schema-validated proposals. Each hunk shows original text, insertion/deletion/replacement, author/model, target file, and explanation. Users can accept/reject a hunk, selected independent hunks, or the whole proposal. Formatting and citation changes are visible in the diff. Rejecting changes no document. Whole-proposal acceptance is atomic; if any hunk is stale, accept none and explain which targets changed. Partial acceptance applies only selected valid non-overlapping hunks, with one auditable operation.

Acceptance acquires the same document lock as ordinary updates. Re-read membership, document epoch, proposal state, relative anchors, exact original structured fragment, and surrounding context/hash. If unrelated content moved, resolve the anchors and accept when the target is still exact. If target content changed, the anchor disappeared, the epoch changed, or another proposal overlaps, mark stale. Do not use fuzzy string replacement. Offer Regenerate against current text and Copy proposed text; a regeneration creates a fresh proposal and never implicitly accepts it. Compare proposal revision and use a unique decision operation ID so simultaneous reviewers accept at most once. Persist document update, decision, and audit attribution atomically; an accepted marker without its document edit is invalid.

Audit distinguishes model/requester, human acceptor, and resulting sequence. Server-applied proposals do not enter every client's local undo stack. Offer an explicit Revert accepted change action producing another reviewed inverse proposal; if its target changed, it is stale. A normal user's own typing still uses local collaboration-aware undo/redo. Do not promise that Ctrl-Z will revert arbitrary teammates' accepted proposals.

## 6. Shared chat, AI context, sources, and personal reuse

Workspace AI threads are shared, named, searchable, and grouped by purpose through optional labels such as Research, Drafting, and Coaching. Thread names remain user-editable. Show the whole-workspace visibility notice before first send. Persist a human message and request ID before generation; append a server-owned assistant message and checkpoints, then finalize or mark interrupted. Multiple human sends queue per thread with visible status so two clients cannot overwrite one response. Cancellation is explicit and attributed; allow the requester to cancel their run, and retain its partial response marked incomplete. A teammate arriving halfway through a stream receives persisted partial content and subsequent updates. Closing the initiating browser must not silently lose the shared conversation; if the chosen server execution cannot continue, persist interrupted state and offer retry.

Private Ask remains private. New workspace UI does not load the personal `askMessages` store. Explicitly copying a private conversation into a workspace previews exactly what will be shared. Tool invocations carry a discriminated context: private account, or workspace/thread/document/side. Route change, account change, or workspace change cancels stale client work and prevents late results from updating the new context.

AI context is assembled server-side from authorized, durable versions. Any workspace document/source/thread is eligible; eligibility does not mean every token is included. Default priority is instruction and selected fragment, current document, current thread's recent messages, pinned sources, then relevant passages from both sides and other named threads. Begin with deterministic full-text search and bounded excerpts; do not add a vector service before retrieval evaluation shows a need. Users see the selected documents/sources and omitted/truncated items, can pin/exclude context for this request, and can ask for another side explicitly.

Initial maximum input context is 24,000 tokens or 60% of the chosen model window, whichever is smaller, after reserving system instructions and output. Use a verified model-appropriate tokenizer or a conservative byte-bound fallback with server provider-limit protection. Allocate 40% to current document/selection, 25% to selected sources, 20% to recent thread context, and 15% to retrieved workspace passages; unused budget can flow to the next priority. Summaries carry source revision IDs and are invalidated after edits. No unsupported claim of complete-workspace review when material was omitted. Context manifests record IDs, revisions, hashes, token counts, and selection reasons without copying text into logs.

Treat imported text, evidence, chat, and AI-generated text as untrusted prompt data. They cannot change system instructions, authorize network requests, choose arbitrary provider models, or modify membership. Reuse `_shared` URL validation and research limits. Recheck membership before persisting/delivering an AI response. Quota and model entitlement are charged to the requesting user, never silently to the owner; shared visibility does not grant another member's Pro access. Add per-workspace request concurrency limits as abuse protection while retaining existing per-user accounting. A retry uses a new attempt under the original request lineage and must not duplicate a completed message or hide charge attribution.

Shared sources reuse current provenance concepts and quality warnings. Copy personal evidence into a workspace explicitly; preserve original source ID as provenance without granting private-row access. Organize through folders and tags, searchable title/content, and per-user context selection. Do not make a shared global `isActive` checkbox toggle everyone's AI context.

Deduplicate within a workspace by normalized public URL and exact normalized-content hash, offering Merge metadata or Keep separate when versions differ. Never deduplicate across users/workspaces in a way that reveals private content. Preserve query and captured-via values, original filename/URL, imported timestamp, extractor version, and warnings. Research findings are candidate evidence, not automatically verified facts. Source annotations distinguish a quoted passage from a teammate's interpretation.

Insert citations as structured source ID plus immutable bibliographic snapshot and optional locator/quote. Export uses stable document order to number citations and produces a deduplicated bibliography. Editing source metadata updates future insertions; existing citations show an update available and are refreshed deliberately. Deleting or archiving evidence cannot erase cited text or silently rewrite the bibliography. Citation links use validated safe URL schemes. Personal snippets/templates with citations carry the snapshot; insertion prompts to copy their evidence into the target workspace or keep a disclosed external citation.

## 7. Import, multiple Google accounts, and export

### 7.1 Import and trust boundary

Import Markdown, DOCX, and Google Docs into independent new DebateLab documents by default. Choose workspace/side and preview title, structure, formatting changes, unsupported items, and citations. Replacing an existing file is an explicit reviewed proposal with a pre-change version, never the default import action. Bulk import uses stable per-item IDs, progress, cancel, and retry without duplicate files.

Start with an 8 MB input limit matching the existing source importer, 32 MB decompressed DOCX limit, 1,000 ZIP entries, 200,000 document characters, and 10,000 nodes. Reject unsupported or oversized content with a useful export/split alternative; do not silently truncate speeches. Check extension, MIME, ZIP signatures, expansion ratio, parse time, depth, and link schemes. Run parsing in a worker with a cancel/time limit. Disable external XML entities and remote image fetching. Strip script/style/event handlers and unsupported embeds; sanitize imported HTML through a narrowly configured, audited sanitizer if the selected conversion path emits HTML. Mammoth's presence is not a sanitization guarantee. A new sanitizer dependency is justified by this trust boundary if schema-only conversion cannot avoid HTML safely.

Google import fetches a selected file through Google's APIs, not an arbitrary URL fetcher. Preserve original document ID, canonical original URL, title, account label, imported time, and revision marker where available. Do not expose the connector ID or OAuth token to teammates. Include all supported document tabs/sections in preview; let the user choose split files or one ordered file. Comments/suggestions from Google are imported only when the API and access grant expose them reliably; otherwise state exactly what was omitted before confirmation and preserve the original link. Default import is the accepted/current body; never claim full Google revision-history migration.

### 7.2 Google accounts are connectors, not app identities

Keep DebateLab sign-in separate from Link Google account. Linking a school account must not switch the app user, merge Supabase identities, or sign the user out. Use server-managed authorization-code OAuth with PKCE, state, nonce, exact redirect allowlist, ten-minute one-use attempts, and a binding to the initiating app user/session. Verify issuer, audience, subject, and verified email on the returned identity. Account labels are display data; Google subject is the stable connection identity.

Request `openid email` and the narrow `drive.file` access needed for user-selected files and exports. Use Google Picker to grant access to existing files; pasting an arbitrary private Docs URL does not grant access under `drive.file`. If access is absent, ask the user to select that file through Picker. Do not silently expand to full Drive or Gmail scopes. Native Capacitor uses the current supported external-browser Picker/OAuth path and app return handling, proved separately from desktop popups.

Store encrypted refresh tokens only server-side in a non-exposed schema or secrets vault. Encryption uses an approved server-held key and key version with a documented rotation procedure. The app receives connection ID, account label, and status only. Google Picker may require a short-lived access token in browser memory; mint/return it only for the selected connection, never persist it in localStorage/sessionStorage or analytics. Scrub query params and token-bearing errors. Serialize refresh per connection, preserve a valid refresh token if Google omits a replacement, atomically store replacements, and mark invalid grants as reconnect-required. Disconnect revokes the provider grant when possible and always removes local token material. A failed provider revocation must be disclosed without retaining a usable local credential.

Every import/export shows the account chooser, with the last-used account preselected but visible before confirmation. Reject another user's connection ID. Two Google accounts with the same-looking display name still remain distinguishable by email. The export recipient account belongs to the requesting user; exporting to school Drive does not automatically grant teammates Drive access. State this in the result. Never automatically send invitations or share exported Google files.

Primary sources: [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth), [web Picker](https://developers.google.com/workspace/drive/picker/guides/web-picker), and [desktop/mobile Picker](https://developers.google.com/workspace/drive/picker/guides/desktop-mobile-picker). Recheck current API and school-domain restrictions during the connector spike.

### 7.3 Export contract

Offer individual document and complete-workspace PDF, DOCX, Markdown, and Google Docs exports. PDF and Word are required completion gates; Markdown is useful portability. Export other useful workspace content through an optional appendix: sources/bibliography, selected chat threads, tool outputs, and practice feedback. Default packet contains accepted documents ordered A favor then En contra, then each side's explicit file order, then bibliography. Allow side selection, manual export ordering, cover page, motion, assignments, date, page numbers, and table of contents for multi-file packets. Exclude archived/trashed files by default and show their exclusion.

Take an immutable export manifest with exact durable document/source revisions before rendering. Concurrent edits cannot make the packet internally inconsistent. Default exports contain accepted content only. Offer an explicit Review copy with comments, suggestions, authors, and statuses in an appendix or visible markup; never silently accept suggestions to export. Pending proposals produce a clear count before download. Normal packets omit private invite data, account email, operational audit details, and personal templates not inserted into documents.

Build one workspace document-to-export representation shared by DOCX, PDF, Markdown, and Google renderers. Reuse installed `docx` and existing PDF/font infrastructure where fidelity permits. Preserve heading levels, lists, links, citation locators, tables, page breaks, and all English/Spanish/Hungarian glyphs. Never rasterize all text merely to get a screenshot-like PDF. Test copyable/searchable text, multi-page tables, long URLs, and font embedding. The converter may use the editor's canonical JSON directly; do not write separate ad hoc Markdown parsers per output.

Google export is a new copy and returns a durable file link; retry must not create unbounded duplicates. Persist an export job/request ID and provider file ID before content population. If a timeout occurs after creation, retry completes or reports that same file. Do not automatically delete the user's file on ambiguous errors. Downloads use safe normalized filenames and provide a fallback when browser download/popup permission fails. Large packets use a bounded server job in the already-approved service if browser measurements fail, not a new job platform by default.

## 8. Workspace experience and integration of current tools

Desktop uses a left file/side navigator, central document, and collapsible right panel for AI, evidence, comments, and history. Keep the motion and saved/offline state visible. The overview shows all eight default slots, assignees, last activity, unanswered comments, and pending proposals without requiring each file to open. New workspace creation reaches the first editable Intro directly, with an invite control and a clear switch to En contra. Avoid a project-setup wizard for information users do not need.

At phone widths, use one main pane at a time with Files, Write, Evidence, and Chat controls, and a contextual review sheet. Preserve selection when opening evidence or AI. Keep editing and accepting/rejecting a change available on mobile; do not hide essential functions behind desktop-only hover. Keyboard covers neither caret nor save status. iOS selection, composition, paste, external OAuth, and browser back behavior need real-device pilot checks beyond Chromium emulation.

Accessibility gates include labelled toolbar controls, headings/landmarks, visible focus, keyboard file reorder alternatives, focus restoration after dialogs, text labels alongside cursor colors, sufficiently large touch targets, 200% zoom without clipped controls, reduced motion, and screen-reader descriptions of changes. Announce save/disconnect and proposal results sparingly through live regions. Provide a linear diff view in addition to colorized inline markup.

Integrate current tools through an explicit context parameter and shared feature components. First add workspace actions that open the appropriate existing tool with motion, side, selected text, and source references, preserving a Return to workspace destination. Then embed those feature components in the workspace panel and store results as workspace artifacts. Do not mount entire route pages that depend on global private stores inside another page.

Mapping: Generate builds a draft proposal; Attack critiques selected speech and offers individual proposed improvements; Brainstorm produces a shared artifact and selected insert proposals; Factoids searches evidence into workspace sources; Ask uses named shared threads; Crossfire and Sparring start from a pinned speech revision and save a chosen feedback artifact; Flowchart builds an argument map from explicit selected content and saves a workspace-owned map; Timer runs in a compact panel with no shared ticking database row; Library opens the workspace evidence view with an explicit private-library copy action; History shows workspace activity/artifacts and preserves personal history separately. Existing sharing remains snapshot-based; workspace documents are never made public merely because a legacy Share control is present. Disable that inherited control until a deliberate snapshot preview can enforce the correct scope.

Practice attempts are private by default when launched as personal practice, even if their input came from a workspace. A clear Share feedback action copies the chosen attempt and scorecard into the workspace. Workspace group-practice mode explicitly says it is shared before recording. Personal improvement can later use the consenting user's attempts without exposing teammates' drafts or treating AI scores as validated assessments.

## 9. Offline behavior, performance, privacy, and operations

Store document drafts with an account/workspace/document/epoch key in IndexedDB, not the personal store's generic persisted state. Offline editing is available only for previously opened, locally cached documents. Show Offline, changes on this device; server Saved appears only after durable ack. Cache comments/history only as needed, and never cache OAuth secrets. Metadata actions, invitations, AI, proposal decisions, and version restore require connectivity; do not pretend queued destructive actions already succeeded.

On reconnect, reauthenticate and recheck membership/epoch before sending pending updates. Valid updates merge through Yjs. Removed-member changes cannot be uploaded; retain a clearly labelled recovery copy of already-held local content for that account, with manual export and discard, rather than deleting unsent writing. An epoch mismatch after restore opens a recovery comparison. Logout clears normal cached server content and offers export/discard for unsynced drafts; explicit forced logout locks pending recovery to the old account and never exposes it to the next signed-in account. Browser storage is not a secure boundary against someone controlling the same device; tell students to sign out on shared school computers. IndexedDB quota/eviction failure must show that local protection is unavailable while online durable saving can continue.

Initial engineering budgets: 30 members/workspace, 100 files/workspace, 200,000 characters/file, 20 concurrently typing clients/document, 2 MB maximum individual sync frame, 10 accepted update batches/client/second with burst 20, and bounded post-decode document memory. Reject oversized pastes before transmission and offer import/split. A full sync larger than one frame uses the tested protocol's chunking or fails with a recoverable message; never accept an unbounded compressed payload. Load only the active editor, page history/chat, and unload inactive documents after a bounded idle interval.

Pilot targets measured on a midrange phone and ordinary school Wi-Fi: local keystroke-to-paint p95 under 50 ms, remote visible edit p95 under 500 ms, durable ack p95 under one second in-region, opening a cached recent workspace under one second and a 50 KB cold document under two seconds after auth. No character loss after a gateway kill/restart once Saved was shown. Browser memory stays under 200 MB for an ordinary eight-file workspace. Record corpus/device/network alongside results. Slow external model responses do not block typing or navigation.

Observe durable-save latency, unacknowledged-update age, reconnects, denied writes, malformed updates, orphan anchors, stale proposal rate, export failures, Google refresh failures, AI context truncation, and queue backlog. Alert on persistence failures immediately and sustained acknowledgement p95 above five seconds. Reuse `src/lib/observability.ts`; log request IDs and error classes, never motion text, documents, chat, evidence excerpts, invite codes, Google account email, or tokens. Exclude authenticated editor DOM from session replay and diagnostic captures. Audit access changes, restores, trash/recovery, accepted proposals, and connector actions with minimal metadata.

Back up database state and verify restoration of binaries, versions, and connector-key references in an isolated environment. Encryption-key backup has a separate protected procedure. Retention jobs are idempotent and distinguish live updates from version history and deletion tombstones. A service health endpoint is not adequate backup proof.

## 10. Rollout, compatibility, and risk register

Use a server-owned workspace entitlement/rollout flag with separate create, edit, AI, Google, and import/export switches. Client flags control presentation only. Existing private routes and exports keep working during migration. No automatic conversion of old chats/sources/cases into shared content. Existing content enters a workspace only through a previewed Copy to workspace action. Keep compatibility with the previous deployed editor schema while clients reconnect; reject unsupported newer schemas with an update prompt before accepting writes.

Deploy additive schema before server code, then gateway/Edge Functions, then frontend. A canary squad runs first. Keep a rollback client able to read/export the new format before enabling creation. Rollback disables new writes and external operations, preserves durable state, allows supported read/export, and reverts app/service code only when schema-compatible. Never roll back by dropping new tables or deleting users' documents. Drain and acknowledge pending saves before service shutdown. Test a browser left open across upgrade and rollback.

Risks and stop conditions:

- Collaboration persistence hooks cannot enforce the save contract: stop Phase 0; choose a maintained alternative after evidence. No homemade replacement protocol under deadline.
- Human suggestion implementation breaks IME, rich marks, overlapping edits, or local undo: stop editor expansion; compare maintained/licensed solutions with an explicit cost decision. Do not remove suggestion mode from the final scope.
- Revoked users receive new content or accepted writes: security release blocker, including an existing connected client and queued traffic.
- Editor schema migration corrupts anchors or imports: freeze rollout, preserve binary backups, prove a reversible migration in an isolated database.
- Google school policy blocks app access: continue local/DOCX/Markdown paths, but label Google pilot blocked until school admin consent; never broaden scopes as a workaround without approval.
- Google token state can be confused across app accounts: block connector release until replay, CSRF, reconnect, and wrong-connection tests pass.
- Export loses Hungarian glyphs, tables, references, or accepted paragraphs: block the relevant export release; never silently provide a degraded packet.
- Service/database failure loses an acknowledged edit, applies an AI proposal twice, or marks an unapplied proposal accepted: data-loss blocker.
- Import bomb/XSS or foreign-workspace access succeeds: security blocker before any student pilot.
- Real hosting, sender, protected staging, or OAuth credentials absent: local work continues; live acceptance remains explicitly blocked. Production substitution is forbidden.
- Task scope drifts into a whole-app rewrite: keep private routes, extract only features needed by an integration slice, and leave unrelated cleanup out.

## 11. Execution sequence and reviewable slices

Each numbered slice is independently reviewable. Before implementation, write its focused test, run it and record the intended failure, implement only its behavior, rerun the focused check, inspect the diff, then run the required broader gate. Tests below are concrete scenarios, not permission to mock away auth or CRDT behavior. Proposed new paths are explicitly labelled; existing paths come from repository inspection. Create follow-on detailed slice plans only during authorized execution if a slice needs more than one PR. Do not prewrite an entire application in this master plan.

### Phase 0: prove the difficult boundaries

**P0.1 Editor and durability spike.** Proposed new paths: `src/lib/workspace/editor-schema.ts`, `src/test/workspace/collaboration.test.ts`, `services/collaboration/package.json`, `services/collaboration/src/server.ts`, and `services/collaboration/src/server.test.ts`. Modify existing `package.json` and `package-lock.json` only after dependency/license review. Keep the spike isolated from production routes.

- [ ] Resolve current compatible Tiptap/Yjs/Hocuspocus versions from official docs and package manifests, pin exact versions, inspect licenses, and verify React 18/Node 22 compatibility. Record rejected alternatives and extension licensing.
- [ ] Write a two-client actual-Y.Doc test that edits the same paragraph, changes list formatting, inserts a link, disconnects, reconnects, and checks identical structured results. Write a local undo test proving a teammate's text survives.
- [ ] Add a gateway test that forces database append failure, duplicates an update, and kills the process before and after durable ack. Assert no Saved acknowledgement before commit and no acknowledged loss after restart.
- [ ] Prove the full update interception path, including sync handshake. Record hook order from the selected version and ensure rejected mutations never appear to other clients.
- [ ] Add a restore-epoch test where an offline client's old tail returns. Assert the selected version remains current and old edits enter recovery.
- [ ] Run `npx vitest run src/test/workspace/collaboration.test.ts`; add and run a proposed root `test:collaboration` npm script for the real Node-service tests. No spike is accepted on a mocked Yjs merge.

**P0.2 Suggestions and import/export fidelity spike.** Proposed new paths: `src/test/workspace/review.test.ts`, `src/test/workspace/document-conversion.test.ts`, and small fixture files under `src/test/workspace/fixtures/` during implementation.

- [ ] Build one representative bilingual/hungarian speech fixture with headings, nested lists, links, a table, citation, and Unicode/IME edits.
- [ ] Test human suggested insert/delete/format, overlapping real edits, accepting one hunk, rejecting all, and undo/redo. Prove quote/comment anchors survive unrelated insertions and detach on deletion.
- [ ] Round-trip the fixture through supported Markdown, DOCX, and the PDF renderer. Compare structured semantics and extracted visible text, not binary file equality.
- [ ] Decide whether the open-source suggestion implementation is maintainable before committing the UI architecture. Record the tested ceiling and package choices in the implementation PR.

**Exit:** Architecture is selected using runnable evidence. A failed gate stops dependent work, not the entire vision. No live rollout yet.

### Phase 1: secure workspace foundation

**P1.1 Schema and membership.** New migration generated in existing `supabase/migrations/`; proposed tests `supabase/tests/workspaces_rls_test.sql` and `supabase/tests/workspace_lifecycle_test.sql`. Existing reference migration: `supabase/migrations/20260821100000_clear_current_user_data.sql`.

- [ ] Write pgTAP cases for owner, member, outsider, unauthenticated, removed member, forged IDs, cross-workspace child references, and owner-account deletion.
- [ ] Implement workspace/membership/doc metadata and atomic create with eight defaults. Test replayed request ID creates one workspace only.
- [ ] Implement metadata revisions, assignment validation/clear-on-removal, reorder, archive, trash/recovery, deletion and accepted ownership transfer.
- [ ] Assert non-owner deletion and direct owner/member escalation fail, all members can manage non-owner access, and clearing personal data preserves shared content.
- [ ] Run `./.superset/db-gate.sh`. Review policies and function grants against the attack matrix, including service-role handler checks separately from RLS.

**P1.2 Invites.** Proposed new paths `supabase/functions/workspace-invites/index.ts`, `supabase/functions/workspace-invites/index_test.ts`, and `supabase/tests/workspace_invites_test.sql`; update existing `supabase/config.toml` only with the required authentication contract.

- [ ] Write tests for expired/rotated code, wrong verified email, concurrent last-use redemption, replay, removed-user old code, uniform nonexistent-email response, and limiter failure.
- [ ] Implement hashed tokens, atomic redemption, cap/rate checks, and sender abstraction only at the real external mail call boundary. Local tests use a controlled sink and never send actual email.
- [ ] Verify invite acceptance returns existing membership idempotently and creates no permanent team entity.
- [ ] Run native Edge tests and database gate. Configure a real sender only under separate authorized staging work.

**P1.3 Workspace discovery and structure UI.** Modify `src/App.tsx`, `src/components/layout/AppLayout.tsx`, the three existing locale files, and relevant navigation tests. Proposed new paths `src/pages/WorkspacesPage.tsx`, `src/pages/WorkspacePage.tsx`, `src/lib/workspace/api.ts`, `src/lib/workspace/queries.ts`, `src/test/workspace/navigation.test.tsx`, and `e2e/workspaces.spec.ts`.

- [ ] Write a create/join/reopen-old-workspace UI test with two workspaces and different memberships; prove creating the second leaves the first accessible.
- [ ] Add lazy routes `/app/workspaces` and `/app/workspaces/:workspaceId`, searchable Active/Archived/Hidden/All views, overview assignments, and file controls. Use TanStack Query for server rows and component state for view selection.
- [ ] Add English, Spanish, Hungarian labels, mobile controls, loading/unavailable states, and keyboard reorder.
- [ ] Run focused Vitest tests plus the existing `src/test/components/AppLayout.test.tsx` and locale test, then browser tests. Mock sessions prove presentation only.

**Exit:** A secure workspace shell is usable behind an internal flag. Do not advertise collaborative drafting until Phase 2 passes.

### Phase 2: reliable collaborative drafting

**P2.1 Gateway persistence and access.** Proposed new paths `services/collaboration/src/persistence.ts`, `services/collaboration/src/auth.ts`, and their `.test.ts` siblings; new generated migrations for private document state/update/version tables. Extend the Phase 0 server.

- [ ] Turn the spike's red failure cases into permanent regression tests for append/ack ordering, advisory-lock loss, duplicate mutation, malformed update, cross-document identity, token expiry, and removal during editing.
- [ ] Implement durable sequence/state projection, per-document lock, pending replay, strict size limits, and authenticated author audit.
- [ ] Test a connected removed member cannot read newly typed text or deliver pending writes after access-change acknowledgement.
- [ ] Run service tests and pgTAP. Exercise process restart against a real local database under the documented exclusive stack lock.

**P2.2 Editor, presence, and offline recovery.** Proposed new paths `src/components/features/workspace/WorkspaceEditor.tsx`, `src/lib/workspace/collaboration.ts`, `src/lib/workspace/offline.ts`, `src/test/workspace/offline.test.ts`, and `e2e/workspace-collaboration.spec.ts`. Modify `src/lib/supabase/AuthProvider.tsx` for cache/session disposal and existing build-boundary test configuration as needed.

- [ ] Write tests for two simultaneous users, local-only undo, remote cursor identity, route/account switch, IME composition, a 30-second disconnect, IndexedDB failure, and a revoked offline user reconnecting.
- [ ] Integrate one editor per active file, awareness, explicit save states, unsaved recovery, and account-scoped cache clearing.
- [ ] Add real two-context browser tests and a test database account fixture with cleanup limited to generated IDs. Keep credentials and authenticated captures out of artifacts.
- [ ] Run focused tests, full credential-free verification, service tests, and the real collaboration harness. Measure the agreed latency/memory budgets.

**P2.3 History and recovery.** Proposed new paths `src/components/features/workspace/VersionHistory.tsx`, `services/collaboration/src/versions.ts`, corresponding tests under `src/test/workspace/` and the service test directory.

- [ ] Write tests for named version, automatic coalescing, restoration race, epoch mismatch, detached comments, and recovery before purge.
- [ ] Implement history preview, selected-version diff, restore as a new epoch, compaction, and retention jobs with idempotent checkpoints.
- [ ] Prove compaction produces the same state and never prunes updates above its captured sequence. Restore a backup in isolation.

**Exit:** A squad can write, reconnect, recover, and restore safely. This is a coherent internal pilot, not the complete Google Docs replacement.

### Phase 3: human review and reusable writing

**P3.1 Comments and mentions.** Proposed paths `src/components/features/workspace/CommentPanel.tsx`, `src/lib/workspace/comments.ts`, `src/test/workspace/comments.test.ts`, and generated comment/notification migration.

- [ ] Write cases for insert-before-anchor, deleted anchor, epoch restore, reply edit authorization, mention dedupe, and recipient removal before notification delivery.
- [ ] Implement threaded comments, resolution, member-only mention picker, and in-app notification inbox.
- [ ] Verify keyboard/screen-reader navigation, mobile selection retention, and no unauthorized notification payloads.

**P3.2 Suggestion mode and decisions.** Proposed paths `src/components/features/workspace/ProposalReview.tsx`, `src/lib/workspace/suggestions.ts`, `services/collaboration/src/proposals.ts`, and corresponding focused tests.

- [ ] Write the stale/overlap/concurrent accept test matrix from section 5 before implementing the decision API.
- [ ] Implement visible human suggestions and granular/whole review, audit, idempotency, rejection, and inverse-change proposals.
- [ ] Test acceptance failure halfway through the database transaction rolls back both content and status. Test a malicious client cannot mark a proposal accepted through direct table updates.
- [ ] Run service/DB/browser checks; replay the Phase 0 rich-text/IME corpus on desktop, mobile Chromium, and WebKit.

**P3.3 Personal snippets/templates.** Proposed paths `src/components/features/workspace/TemplatePicker.tsx`, `src/lib/workspace/templates.ts`, `src/test/workspace/templates.test.ts`, and generated owner-only template migration. Add a personal Templates section to existing `src/pages/LibraryPage.tsx` without changing private source behavior.

- [ ] Write tests that another collaborator cannot read the template library, insertion is a copy, later template edits do not rewrite a speech, and citations carry disclosed provenance.
- [ ] Implement save selection, save whole structure, rename/update/duplicate/delete personal item, and insertion preview.
- [ ] Run focused component/RLS tests and existing Library tests.

**Exit:** Human collaborative review and reusable personal writing are complete before AI proposal acceptance depends on them.

### Phase 4: shared knowledge and AI coworker

**P4.1 Shared sources.** Proposed paths `src/components/features/workspace/WorkspaceSources.tsx`, `src/lib/workspace/sources.ts`, `src/test/workspace/sources.test.ts`, and workspace source migrations. Reuse `src/lib/source-import.ts`, `src/lib/source-file-import.ts`, and `src/components/features/shared/SourceQualityList.tsx` through explicit targets.

- [ ] Write tests for private-to-shared copy, no cross-workspace dedupe leak, different versions of one URL, per-user source selection, source deletion with retained citations, and provenance preservation.
- [ ] Implement folders/tags, annotation, evidence insertion, bibliography preview, and source update notices.
- [ ] Verify existing private-library tests still pass.

**P4.2 Shared threads and bounded context.** Proposed paths `src/lib/workspace/chat.ts`, `src/components/features/workspace/WorkspaceChat.tsx`, `supabase/functions/_shared/workspace-context.ts`, `supabase/functions/_shared/workspace-context.test.ts`, and new chat migrations. Modify existing `src/lib/ai/client.ts`, `supabase/functions/ai/index.ts`, and `supabase/functions/ai-stream/index.ts` only at explicit context boundaries.

- [ ] Write tests for private-source exclusion, foreign thread/document IDs, membership removed during generation, context over limit, both-side retrieval, summary invalidation, interrupted stream, and two senders.
- [ ] Implement named shared threads, server-persisted requests/messages, one active generation per thread, reconnect replay, context manifest, and quota charged to requester.
- [ ] Preserve current provider/model/research/accounting controls and test the old private Ask path unchanged.
- [ ] Run existing AI/client/Ask tests, new context tests, native handlers, and authenticated multi-user staging when authorized.

**P4.3 AI document proposals.** Extend `services/collaboration/src/proposals.ts` and `src/components/features/workspace/ProposalReview.tsx`; proposed new `supabase/functions/_shared/workspace-proposals.ts` and tests.

- [ ] Write malformed/oversized proposal, invented citation, stale base, duplicate request, partial review, formatting-only change, and prompt-injection test cases.
- [ ] Implement AI draft/rewrite/critique output into the existing review system. The model receives no direct edit operation.
- [ ] Confirm the original document hash remains unchanged after generation and rejection; only authorized human acceptance changes it.

**Exit:** A squad researches, chats, and reviews AI help without private-content leaks or silent document changes.

### Phase 5: document portability and Google connectors

**P5.1 Local import/export.** Proposed paths `src/lib/workspace/document-import.ts`, `src/lib/workspace/document-export.ts`, `src/components/features/workspace/ImportDialog.tsx`, `src/components/features/workspace/ExportDialog.tsx`, and `src/test/workspace/document-io.test.ts`. Reuse existing export libraries and formatting utilities; retain old `src/lib/export-utils.ts` callers.

- [ ] Write corpus tests for Markdown/DOCX, compressed bombs, scripts/unsafe URLs, giant tables, imported loss notices, all locale glyphs, citation numbering, archived-file exclusion, and exports during live edits.
- [ ] Implement previewed independent-copy import and revision-manifest exports. Add Word/PDF document and workspace packet options plus review appendices.
- [ ] Open representative DOCX in Word or a compatible real application and inspect rendered PDF pages as well as extracted text. Record limitations explicitly.
- [ ] Run focused conversion tests, existing export tests, and the production bundle gate.

**P5.2 Multiple Google connectors.** Proposed paths `supabase/functions/google-connect/index.ts`, `supabase/functions/google-connect/index_test.ts`, `supabase/functions/_shared/google-connections.ts`, `src/lib/google-connections.ts`, and `src/components/features/export/GoogleAccountPicker.tsx`; new private token/attempt migrations. Modify existing auth modal and settings only where connector selection is needed.

- [ ] Write OAuth state replay, wrong app user/session, PKCE failure, wrong issuer/audience, expired callback, refresh race, omitted refresh-token replacement, revoked connection, and wrong connection-owner tests.
- [ ] Implement linking/disconnecting, encryption, scoped Picker token, account chooser, reconnect, and exact return-URI behavior. Keep app login separate.
- [ ] Prove two linked accounts can each be selected without changing DebateLab identity, including browser refresh and session switch.
- [ ] Run local handler/RLS tests. Real consent, refresh, revocation, and school-domain tests require separately supplied staging accounts and authorization.

**P5.3 Google import/export integration.** Proposed path `supabase/functions/import-gdoc/index.ts` with handler tests; modify existing `supabase/functions/export-gdoc/index.ts`, `src/lib/export-utils.ts`, `src/test/export-google-docs.test.ts`, and workspace import/export dialogs.

- [ ] Write selected-file authorization, all-tab preview, missing grant, account mismatch, provider timeout after file creation, and idempotent retry tests.
- [ ] Add workspace structured-document export and Google import using connection IDs. Preserve legacy private export compatibility until its UI migrates to the same account chooser.
- [ ] Verify original Google documents remain unchanged, two accounts remain separate, and exported files have the expected content and recipient account.

**Exit:** Students can move existing work in and final packets out with measured fidelity and explicit account choice.

### Phase 6: connected tools and release quality

**P6.1 Drafting/research integration.** Modify existing `src/pages/GeneratePage.tsx`, `src/pages/AttackPage.tsx`, `src/pages/BrainstormPage.tsx`, `src/pages/FactoidsPage.tsx`, `src/pages/AskPage.tsx`, and their feature components one tool per PR. Proposed shared contract path `src/lib/workspace/tool-context.ts` and `src/test/workspace/tool-context.test.ts`.

- [ ] For each tool, write a test that explicit workspace context reaches the server, results appear in that workspace, and private route state remains private.
- [ ] Start with prefilled handoff plus return link, then extract/embed the feature UI as necessary. Save immutable artifacts and offer reviewable insertion.
- [ ] Test switching workspaces mid-request and opening the old personal route immediately afterward.

**P6.2 Practice/map/history integration.** Modify existing `src/pages/CrossfirePage.tsx`, `src/pages/SparringPage.tsx`, `src/pages/FlowchartPage.tsx`, `src/pages/TimerPage.tsx`, `src/pages/HistoryPage.tsx`, and relevant existing tests in separate reviewable PRs.

- [ ] Write tests for pinned input revision, explicit feedback sharing, private practice visibility, shared map copy, and non-persistent timer ticks.
- [ ] Add workspace entry/return actions, artifacts, and later embedded controls without rewriting private stores wholesale.
- [ ] Prove every current tool has a usable workspace path; a collection of links that loses context is not completion.

**P6.3 Release hardening and pilot.** Modify existing `docs/architecture.md`, `docs/development.md`, `docs/testing.md`, `docs/operations.md`, `supabase/README.md`, `nginx.conf`, and `.github/workflows/deploy.yml` only as required. Proposed new operational guide `docs/workspaces.md` and end-to-end suite `e2e/staging/workspaces.spec.ts`.

- [ ] Add gateway CI/service startup, database fixtures, failure injection, CSP WebSocket/Picker origins, health/readiness, graceful shutdown, backups, and rollback instructions. Do not loosen CSP to broad wildcards.
- [ ] Run the complete journeys below with a canary squad, both browser contexts and actual devices. Fix observed task friction before widening rollout.
- [ ] Inspect current-head CI/review evidence and confirm release authorization before production operations. Record exact commit, enabled flags, migration/service versions, checks, and exceptions.

## 12. Verification commands and acceptance journeys

Use the repository's Node version on Adam's VPS:

```sh
export PATH=/home/codex/.nvm/versions/node/v22.23.2/bin:$PATH
npm run docs:check
npm run lint
npm run typecheck
npm test -- --coverage
npm run test:edge
npm run build
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 npm run test:e2e
npm run verify
./.superset/db-gate.sh
CI=1 PORT=18080 PLAYWRIGHT_BASE_URL=http://127.0.0.1:18080 npm run test:e2e:webkit
```

Do not redundantly run both every constituent and `verify` when nothing changed; the block lists existing supported commands and their full-gate shortcut. The service needs a proposed `npm run test:collaboration` command added in P0.1; it does not exist on the inspected base. The proposed focused test paths likewise become runnable only in their owning slices. Add new collaboration paths to selected coverage deliberately without reducing current thresholds to hide regressions.

`verify` proves docs, lint, types, selected coverage, native Edge tests, build, and desktop/mobile Chromium. It does not prove pgTAP, WebKit, staging, the new service, or production. The database wrapper owns stack cleanup even after failure. A real multi-client integration suite must hold the same exclusive database lock through setup, service execution, and teardown; implement that as an extension to the existing `.superset/db-gate.sh` workflow or a documented wrapper before relying on it. Never start a second stack in another worktree. Protected staging uses `npm run test:e2e:staging` only with all three existing staging values supplied privately, rejects production, and disables captures. Extend its cleanup to only the workspace IDs created by that run.

Required final journeys:

1. Create a motion workspace, reach eight default files, invite by code and by email, and join as a second student. Target under two minutes without coaching, excluding email delivery. Assign R1, open it from the overview, and verify both members can edit it. Create a new workspace with different collaborators and reopen the first from All.
2. Two students type in the same paragraph, insert evidence, use undo/redo, disconnect one device for 30 seconds, reconnect, reload, and compare results. Both converge; no acknowledged text disappears. Cursor labels identify the correct people.
3. Suggest a replacement, comment on it, reply and mention a teammate, accept one hunk, reject another, then restore an earlier version while the second client is offline. The offline edits cannot resurrect the pre-restore document silently.
4. Share research in a named thread, ask AI to critique both sides, inspect its context manifest, ask for a rewrite, and reject it. Original content remains exact. Accept a new proposal while another member changes the target; stale detection prevents overwritten writing. Two simultaneous accept clicks yield one edit.
5. Save a private reusable template, insert it into another workspace, and update the original template. The inserted speech remains unchanged and other members cannot browse the private library.
6. Import Markdown, DOCX, and a school Google Doc as new files; compare preview and final formatting. Link a personal Google account without changing the DebateLab login. Export through each account deliberately. Original Google files remain unchanged.
7. Export one speech and a complete PDF/Word packet in each locale. Confirm accepted-only content, file/side order, assignments, long tables, hyperlinks, citations, bibliography, selectable text, and Hungarian accents. Export a review appendix deliberately and verify comments/proposals are labelled.
8. Remove a connected member, rotate invitations, and test their online/offline clients, guessed IDs, old invitation, history, chat, source, and export access. All new access fails. Owner removal fails. Ownership transfer and owner account-deletion safeguards work at the database boundary.
9. Kill the gateway after Saved, restart it, fail a compaction write, fail Google after remote file creation, and interrupt AI streaming. Recover durable text, retry one export file, and show an interrupted shared response. Restore a backup into isolation.
10. Complete the create/edit/evidence/AI-review/export flows using only keyboard, screen reader, 200% zoom, mobile Chromium, and WebKit; include an actual iOS device pilot. No essential operation is hover-only or requires a desktop-width screen.

Every release PR needs current-head quality, database, browser, and new service checks as relevant. Read substantive review findings on the exact head; pending or rate-limited review is not a clear review. Local green results do not prove GitHub green. Report `verified`, `partially_verified`, or `blocked`, with which authenticated/live journeys actually ran. Final completion requires all eight explicit product areas, not merely a collaborative text field.

## 13. Requirement traceability

- [ ] Workspace belongs to one changing squad, no opponent and no permanent team: sections 2, 4; P1.1/P1.3; journey 1.
- [ ] Both sides, eight school defaults, custom files, assignment without permissions: sections 2, 8; P1.1/P1.3; journeys 1 and 7.
- [ ] Old workspaces remain findable when a new team forms: section 2; P1.3; journey 1.
- [ ] Code/email invitations, every member manages access, owner-only deletion: section 4; P1.1/P1.2; journeys 1 and 8.
- [ ] Character collaboration, presence/cursors, polished rich Markdown authoring, correct undo/redo: sections 3, 8, 9; P0.1/P2.1/P2.2; journeys 2 and 10.
- [ ] Saved history, version browsing/restoration, human suggestions, comments/replies/mentions: sections 3 and 5; P0.2/P2.3/P3.1/P3.2; journey 3.
- [ ] Rename/reorder/archive/delete/duplicate/recovery rules and assignments: section 2; P1.1/P1.3/P2.3; journeys 1, 3, and 8.
- [ ] AI may use documents, shared sources and workspace chats with safe bounded context: section 6; P4.1/P4.2; journey 4.
- [ ] AI writing/research/critique with explicit reviewable additions/deletions/replacements and human decisions: section 5; P3.2/P4.3; journey 4.
- [ ] Granular and whole proposals, concurrency, stale handling, audit attribution: sections 4 and 5; P2.1/P3.2/P4.3; journeys 4 and 9.
- [ ] Current tools connect to the workspace through a phased migration: section 8; P6.1/P6.2; journeys 4 and 10.
- [ ] Named shared workspace AI threads; outside chats stay private: section 6; P4.2; journeys 4 and 8.
- [ ] Shared evidence organization, annotations, provenance, dedupe, citation insertion, bibliography: sections 6 and 7; P4.1/P5.1; journeys 4 and 7.
- [ ] Personal snippets/templates stay private and reusable across workspaces: sections 2 and 6; P3.3; journey 5.
- [ ] Independent-copy Google Docs/DOCX/Markdown import and provenance: section 7; P0.2/P5.1/P5.3; journey 6.
- [ ] Multiple Google accounts with explicit per-operation selection and safe tokens: section 7; P5.2/P5.3; journeys 6 and 8.
- [ ] Useful content exports to PDF/Word, individual and workspace packets, formatting and review treatment: section 7; P5.1/P5.3; journey 7.
- [ ] Fast obvious creation, invitation, assignment, side switching, evidence insertion, AI review, export: sections 2 and 8; P1.3/P2.2/P4/P5/P6.3; journeys 1, 4, 7, and 10.
- [ ] English/Spanish/Hungarian, accessibility, responsive/mobile, offline/degraded recovery, performance: sections 8 and 9; every UI slice and P6.3; journeys 2, 7, 9, and 10.
- [ ] Privacy, abuse prevention, audit, observability, owner deletion, stale clients, invitations, AI races, import sanitation, token storage: sections 4 through 10; P0/P1/P2/P3.2/P4/P5/P6.3; journeys 8 and 9.
- [ ] Full vision delivered through coherent phases, with security gates, rollback, current-head verification, and separate deployment authority: sections 1, 10, 11, and 12.
