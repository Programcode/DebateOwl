# Journeys, AI surfaces, accessibility and Hungarian: findings

**Status:** Review evidence from 2026-10-08/09, for [the ranked report](../2026-10-08-ultracode-review-report.md). Not started.

77 findings: 2 high, 32 medium, 37 low, 5 nit and 1 refuted (listed last). An independent verifier re-checked every one.

Each entry has the final severity, where the problem lives, what the reviewer saw, why it happens, a suggested fix, the independent check and links to the screenshots and measurements in `.verify/ultracode-review-2026-10-08/`. Line numbers are against main at 40738ea.

Not covered by the journeys reviewer:

- Signing back in through the UI: admin has no demo code and email OTP would send mail; I re-entered with freshly minted sessions instead
- PDF and DOCX source file import (only .txt tried)
- Share: no UI to create a share link was found on results; /share/:code itself not exercised
- Google Docs export, Export PNG in Flowchart, Discuss, Open in Crossfire, voice input
- The pro account's inactivity gate (I observed the same component on expired and did not touch the shared pro account)
- Spanish and Hungarian UI, dark mode, tablet, small-mobile, iPhone
- Delete All My Data, Delete account, promo codes, admin controls (forbidden)
- Deep AI-tool behaviour (Attack, Factoids, Ask, Crossfire, Sparring), result quality, quota accounting of the timed-out Generate (AI lane)
- Real Stripe checkout success path (no Stripe on staging by design)

Not covered by the ai-surfaces reviewer:

- Voice mode (Crossfire/Sparring voice rounds, dictation): cannot be tested headless
- Google Docs export: needs Google OAuth
- A real mid-stream network drop: Chromium's context.setOffline(true) did not cut the open SSE connection (the stream finished), so the 'interrupted stream' UX was only reached by simulation
- Whether the stream-failure fallback double-charges on real traffic: inferred from code plus a simulation, not observed in staging usage logs
- Spanish/Hungarian output and UI: the account language must not be changed (owned by the i18n agent)
- 'Cheapest model' was assumed to be DeepSeek V4 Flash (a non-Pro flash model); pricing not verified. Auto Fast avoided because its routing varies
- Generate's 'web research option' does not exist as a form control: handleGenerate (supabase/functions/ai/features/generate.ts:36) always runs deepResearch, so there was nothing to toggle
- Rate-limit/quota refusal UX against the real server (only simulated with a faked 429)
- Every model in the selector, and medium/high reasoning (kept at the stored Low)
- Ask file attachments
- Discuss buttons against the real AI (simulated only, to save budget)
- WebKit/Safari

Not covered by the a11y-i18n reviewer:

- /app/admin (trial is not an admin; admin account owned by the journeys agent)
- A real /share/<code> page (only the not-found state was scanned)
- Sparring, Crossfire and Ask streaming/live regions during an actual round (no extra AI budget spent)
- Voice mode and ElevenLabs audio
- PDF/DOCX/Google Docs export text in hu/es
- Stripe checkout and pricing modal flows
- Login OTP and demo-code error texts in the browser (checked in code only; wrong codes were deliberately not sent)
- axe runs with the UI in hu/es (axe ran in English only)
- Spanish desktop overflow scan (es scanned on mobile only)
- Real screen-reader testing (NVDA, VoiceOver); findings come from DOM/ARIA and live-region mutation measurements
- WebKit and Firefox
- Collaborative Workspace and the iOS shell (out of scope)

### journeys-1: When the user lookup fails (offline or network blip), every save becomes local-only and the app still reports success

**Severity:** high · **Verdict:** confirmed · **Root cause:** `getuser-network-fallback-local-only-writes`

**Where**

- src/lib/stores/session-store.ts:288-291 (getUserId returns null on any getUser failure)
- src/lib/stores/session-store.ts:506-512 (addSource: no userId -> local-only insert, return)
- src/lib/stores/session-store.ts:767-789 (removeSource/toggleSource: skip server write when userId is null)
- src/pages/LibraryPage.tsx:217-226 (handleAdd shows 'Source Added' toast)
- Same pattern in ~23 getUserId() call sites: saveFlowchart (991-997), saveCurrentCase (816-823), folders, etc.
- /app/library

**What the reviewer saw**

Repro (20-offline-add.json): signed in as admin on /app/library, went offline with context.setOffline(true), added the manual source 'ZZ review offline source' and clicked Save to Library. The network log shows only 'FAILED GET /auth/v1/user net::ERR_INTERNET_DISCONNECTED'; no POST to /rest/v1/sources was made. The UI showed the toast 'Source Added. Your source is now available for grounding.' and the row appeared. Toggling a source offline flipped the switch (true) with no error. After going back online and reloading, the source was gone (afterReloadOfflineSource: 0) and the toggle had reverted (false). An 'Offline mode' pill is visible at the same time as the success toast (screenshot 20-offline-add.png). Root cause in code: getUserId() does `const { data } = await supabase.auth.getUser(); return data.user?.id || null;`, and every writer treats null as 'signed-out local mode', writing only to zustand state.

**Why it happens**

The store cannot tell 'signed out' apart from 'could not reach auth'. Every write path calls supabase.auth.getUser() (a network request), and on failure falls back to the local-only branch meant for signed-out use. The UI then shows its normal success toast.

**Suggested fix**

In session-store.ts, read the user id from the cached session (supabase.auth.getSession() or the AuthProvider user), not getUser(). If there is genuinely no user while the app is in an authenticated route, throw. Delete the 'no userId -> local only' branches for authenticated routes, or make them throw a NetworkError. In LibraryPage/Flowchart/Generate, wrap writes in try/catch and show an error toast with Retry instead of success. Optionally queue writes while offline and keep the form contents. Cover it with a unit test: getUser rejecting must make addSource reject, not resolve.

**Who it hits**

Any student on flaky school or phone networks who adds a source, saves a flowchart or saves a case during a blip is told it saved, then loses it on reload. It also silently skips server writes when getUser has a transient 5xx. Borderline critical (silent data loss); held at high because the 'Offline mode' pill is visible.

**Independent check**

Reproduced on admin /app/library: setOffline(true), added manual source 'ZZ review offline src' -> only GET /auth/v1/user failed (ERR_INTERNET_DISCONNECTED, twice), no POST /rest/v1/sources, toast 'Source Added. Your source is now available for grounding.' and row shown. Toggling a source offline flipped aria-checked true->false with no error. After online+reload the offline row was gone (0) and the switch was back to true. Code: session-store.ts:288-291 getUserId returns null on any getUser failure; addSource 506-512, removeSource 767-773, toggleSource 775-789 treat null as signed-out local mode.

**Evidence files**

[20-offline-add.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/20-offline-add.json), [20-offline-add.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/20-offline-add.png), [20-after-reload.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/20-after-reload.png), [s3-flows.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s3-flows.json), [s3-offline-add-toast.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s3-offline-add-toast.png)


### ai-surfaces-1: Ask chat leaves 0–143 px for messages: on phones the answer is invisible

**Severity:** high · **Verdict:** confirmed · **Root cause:** `ask-chat-fixed-height-card-on-phones` · **Same fix as:** mobile-visual-1

**Where**

- src/components/features/ask/AskChat.tsx:517 (Card h-[calc(100vh-14rem)] min-h-[400px] max-h-[800px])
- src/components/features/ask/AskChat.tsx:568-700 (shrink-0 composer: mode row, 4 toggles, ModelSelector with model and Reasoning, context control, input)
- route /app/ask

**What the reviewer saw**

I measured the message-pane height (the ScrollArea viewport) on an empty chat on each device:
- 1600x1000: 343 px.
- 1280x800: 143 px.
- 1024x700 laptop: 43 px.
- iPad: 321 px.
- Pixel 7 (412x839): 30 px.
- iPhone 14 (390x664): 0 px.
- iPhone SE (320x568): 0 px.

The always-visible composer (shrink-0) is 307 px tall on desktop and 439–571 px on phones, inside a card capped at 400–800 px (`ask-layout.json`).

During a real streamed answer on a Pixel 7, the mid-stream screenshot shows no message text at all, and the final screenshot shows only the bubble's bottom border. On desktop the empty-state copy is cut off mid-sentence. Adding the header 'Save' button squeezes the pane further. Even at 1600x1000 the pane stays at or below 343 px because of max-h-[800px].

**Why it happens**

The chat card has a fixed viewport-relative height. Every option control (4 switches, the model and Reasoning selects, the context strip) sits permanently in a shrink-0 footer inside that card, so the flex-1 message area gets whatever height is left, which is often none.

**Suggested fix**

In AskChat.tsx:
- Let the message list own the space: use min-h-0 flex-1 with a floor of at least 50–60% of the card.
- Move the mode/toggle/model controls into a collapsible 'Options' popover or sheet (one row on mobile).
- Show the context strip as a compact chip.
- On small screens drop the card height cap and use a full-height layout (100dvh minus the header), with the composer sticky at the bottom.

Check that the pane is at least 300 px on iPhone SE.

**Who it hits**

Every phone user of Ask, which is most students. The answer is unreadable while it streams and after. It is also cramped on 13-inch laptops.

**Independent check**

Code: AskChat.tsx:517 Card h-[calc(100vh-14rem)] min-h-[400px] max-h-[800px] with a shrink-0 composer block (AskChat.tsx:582-700). Re-measured on staging (empty chat, pro): message pane 143 px at 1280x800 (card 576, composer 307), 43 px at 1024x700, 46 px on Pixel 7 (composer 423), 0 px on iPhone 14 (card 440, composer 463) and 0 px on iPhone SE (card 400, composer 555). On desktop mid-stream only about 150 px of answer is visible (screenshot). Same cause and fix as mobile-visual-1; this finding adds the desktop/laptop numbers.

**Evidence files**

[ask-layout.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/ask-layout.json), [ask-long-mobile-DeepSeekV4Flash-mid-stream.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/ask-long-mobile-DeepSeekV4Flash-mid-stream.png), [ask-long-mobile-DeepSeekV4Flash-final.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/ask-long-mobile-DeepSeekV4Flash-final.png), [ask-layout-small-mobile.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/ask-layout-small-mobile.png), [explore-ask-desktop-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/explore-ask-desktop-light.png), [explore-ask-mobile-dark.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/explore-ask-mobile-dark.png), [misc-layout.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/misc-layout.json), [ask-layout-iphone.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/raw/ask-layout-iphone.png), [ask-layout-small-mobile.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/raw/ask-layout-small-mobile.png), [ask-layout-desktop.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/raw/ask-layout-desktop.png), [ask-desktop-midstream.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/raw/ask-desktop-midstream.png)


### journeys-2: 'Save' on a case reopened from History creates a duplicate case outside the debate that cannot be deleted where it lands

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `reopened-case-save-creates-unscoped-copy`

**Where**

- src/pages/GeneratePage.tsx:38 (recordedCaseId is component state, only set right after generation)
- src/pages/GeneratePage.tsx:395 (onSave shown when recordedCaseId is null)
- src/lib/stores/session-store.ts:816-833 (saveCurrentCase inserts a new cases row with no debate_id)
- src/components/features/debate/UnsortedWork.tsx (no delete action)
- /app/history -> Load case -> Save

**What the reviewer saw**

Steps (10-save-dup.json): History > Cases > Load the auto-recorded case. The Save button is visible (saveVisible: 1). Click Save, then Save in the 'Save case' dialog. The toast says 'Case Saved. Your case has been saved to history.' But the Cases tab still shows 1 case, and the copy appears only under 'One-off and unsorted work', which has no delete button (unsortedDeleteButtons: 0). The API afterwards showed two cases rows: e78bafe7 with the debate_id, and b32068f5 with debate_id null. The same happens after any reload or navigation, because recordedCaseId resets to null. Section regenerations after a reload are also not written back (GeneratePage.tsx:159 only updates when recordedCaseId is set). I removed the duplicate by attaching it to the debate and deleting it from Cases (11-attach-delete.json).

**Why it happens**

Whether the visible case is already saved is tracked in component state, not on the loaded item. loadSavedCase only sets generateResult, dropping the row id and debate. The legacy saveCurrentCase path predates Current Debate and inserts with no debate_id.

**Suggested fix**

Have loadSavedCase store the loaded row id and debate id in the session store (e.g. generateRecordId), and have GeneratePage hide Save, and send regenerations to updateRecordedResult, when that id is set. If Save remains (for one-off results), insert with activeDebateId(). Apply the same check to Attack, Brainstorm, Factoids and Ask, which have saveCurrent* paths.

**Who it hits**

Students who press the obvious Save button after reopening work get silent duplicates in a hidden 'unsorted' bucket. The toast says it went to History, but it is not in the debate's History.

**Independent check**

Inserted a case in admin's ZZ debate, History > Cases > Load -> Generate shows Save (count 1); Save -> toast 'Case Saved. Your case has been saved to history.' REST then had 2 cases rows: original with debate_id and a copy with debate_id null; Cases tab still lists 1. Code: GeneratePage.tsx:38/90/395 (recordedCaseId is component state, null after load), session-store.ts:816-833 saveCurrentCase inserts without debate_id; GeneratePage.tsx:159 regenerations only written back when recordedCaseId set. UnsortedWork has no delete (UnsortedWork.tsx).

**Evidence files**

[10-save-dup.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/10-save-dup.json), [10-save-dialog.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/10-save-dialog.png), [10-history-unsorted.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/10-history-unsorted.png), [11-attach-delete.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/11-attach-delete.json), [s4-case.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s4-case.json), [s4-history-after-save.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s4-history-after-save.png)


### journeys-3: No way to delete the Current Debate, the last debate, or any brainstorm, attack, factoid, chat, crossfire or unsorted item

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `missing-delete-paths`

**Where**

- src/components/features/debate/DebateDialogs.tsx:90-104 (trash only for non-current debates in DebatePicker, the only deleteDebate caller)
- src/lib/stores/session-store.ts:176,209 (only deleteSavedCase and deleteSavedFlowchart exist; no delete for attacks, brainstorms, factoids, chats, crossfires)
- src/pages/HistoryPage.tsx (trash only on Cases and Sparring tabs)
- src/components/features/debate/UnsortedWork.tsx (no delete)
- src/pages/CurrentDebatePage.tsx (no delete)

**What the reviewer saw**

grep shows deleteDebate is called only from DebatePicker, and that picker renders a Check icon instead of a trash button when debate.id === currentDebateId. A user with one debate (e.g. created with a typo, or as a test) can never delete it. A user with several can delete only the non-current ones, so one debate always remains. For cleanup I had to delete both review debates through the REST API. History shows a delete button only for cases and sparring sessions (aria snapshot 09-history.aria.txt). The brainstorm I generated has no delete anywhere in the UI, and neither do chats (which may hold personal text), attacks, factoids, crossfires or one-off items. The only remaining routes are 'Delete All My Data' or deleting the account.

**Why it happens**

Delete was built per feature, and the Current Debate rework only added debate deletion inside the Switch picker, excluding the current one. Result tables gained no delete methods.

**Suggested fix**

Add 'Delete debate' to the Current Debate page header (and the header menu) with the same confirmation, and leave the user with no current debate afterwards. Add a generic deleteRecordedResult(kind, id) to session-store backed by RLS-scoped deletes on attacks, brainstorms, factoids, chats and crossfires. Show a trash button with confirmation on every History row, Current Debate item row and UnsortedWork row.

**Who it hits**

Every user eventually has items they want gone. The gap is sharpest for students in the EU (privacy: chats) and for anyone whose first debate was a mistake.

**Independent check**

Code: deleteDebate's only caller is DebatePicker (DebateDialogs.tsx:44-104), which renders a Check instead of a trash for the current debate, so the current/only debate cannot be deleted from the UI. Stores have deletes only for cases, flowcharts, sparring sessions, folders (session-store.ts:176,209,216; sparring-store.ts:80); HistoryPage trash only on Cases and Sparring tabs (170, 337). My two ZZ brainstorms on admin had no UI delete and were removed via REST during cleanup. Some of this may be a product choice (one debate always current), but brainstorm/attack/factoid/chat deletion is genuinely absent.

**Evidence files**

[09-history.aria.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/09-history.aria.txt), [09-current-debate.aria.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/09-current-debate.aria.txt), [10-history-unsorted.aria.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/10-history-unsorted.aria.txt), [25-switch-no-debates.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/25-switch-no-debates.png), [s6-brain.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s6-brain.json)


### journeys-4: Library row trash and saved-flowchart delete act instantly, with no confirmation and no undo (the sheet, History and Clear All do confirm)

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `destructive-actions-without-confirm`

**Where**

- src/pages/LibraryPage.tsx:127-137 (row trash calls onRemove directly)
- src/pages/LibraryPage.tsx:409-416 (handleRemoveSource: no confirm, no undo)
- src/pages/LibraryPage.tsx:1025-1043 (the sheet's Delete uses an AlertDialog: inconsistent)
- src/pages/FlowchartPage.tsx:382-390 and 535-546 (Load dialog trash deletes immediately)
- /app/library row, /app/flowchart > Load

**What the reviewer saw**

05-library2.json: clicking 'Delete ZZ review notes file' in the row produced no alertdialog (alertAfterRowTrash: 0). The source disappeared and the toast said 'Deleted. Source removed.' with no Undo. The trash is 28x28 px, 8 px left of the 44x24 toggle on both desktop (x 1026 vs 1062) and Pixel 7 (x 270 vs 306; 21-mobile-a.json), so aiming for 'pause' can delete. 16-flowchart-save.json: Load > trash on 'ZZ review flowchart' deleted it at once (alertAfterDelete: 0; 'Flowchart deleted'; list shows 'No saved flowcharts yet'). Meanwhile deleting a flowchart node, a History case, Clear All and the sheet's Delete all ask first. handleRemoveSource also has no .catch, so a failed delete is an unhandled rejection with no message.

**Why it happens**

Each surface chose its own delete pattern. No shared 'destructive action' helper (confirm or undo toast) exists.

**Suggested fix**

Use one pattern everywhere. Prefer an optimistic delete with a sonner toast action 'Undo' (re-insert the row) for single items, and keep the AlertDialog for bulk actions. Apply it to LibraryPage SourceRow and FlowchartPage handleDeleteFlowchart, and add .catch with an error toast. Move the row trash into the sheet or an overflow menu, or put at least 16 px and a divider between it and the toggle on mobile.

**Who it hits**

Every Library user, especially on phones, where the delete icon sits beside the pause toggle. One mis-tap loses an imported source or a flowchart with no way back.

**Independent check**

Row trash on 'ZZ review src two' (28x28 at x=1026, 8px left of the 44x24 switch at x=1062) deleted instantly: alertdialog count 0, toast 'Deleted / Source removed.' with no Undo. Code: LibraryPage.tsx:127-137 and handleRemoveSource 409-416 (no confirm, no .catch, so a failed delete is an unhandled rejection with a success-free silence). Flowchart: Load dialog > trash on 'ZZ review fc' deleted it at once (alertdialog 0, toast 'Flowchart deleted', list empty). Code FlowchartPage.tsx:382-390, 535-546. Other deletes (History case, Clear All, sheet Delete, flowchart node) do confirm, so the pattern is inconsistent.

**Evidence files**

[05-library2.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/05-library2.json), [frames-row-trash](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/frames-row-trash), [21-m-library-row.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/21-m-library-row.png), [16-flowchart-save.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/16-flowchart-save.json), [16-after-delete.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/16-after-delete.png), [s3b-flows.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s3b-flows.json), [s3b-library-after-row-trash.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s3b-library-after-row-trash.png), [s3d-fcdelete.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s3d-fcdelete.json), [s3d-load-dialog.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s3d-load-dialog.png), [s3d-load-dialog-after-trash.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s3d-load-dialog-after-trash.png)


### journeys-6: Closing the 'Start new debate' dialog flashes a full 'Switch debate' dialog for about 200 ms

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `debate-dialog-content-keyed-on-nullable-store`

**Where**

- src/components/features/debate/DebateDialogs.tsx:130-157 (content is `dialog === 'create' ? <create/> : <switch/>` inside one Radix Dialog)
- Header 'Start debate' / Current debate menu > Start new debate, Home and Library Start debate buttons, the tour's Start debate

**What the reviewer saw**

CDP screencast frames-create-cancel: after clicking Cancel, frames 002 (t=105 ms) and 003 (t=137 ms) show an opaque 'Switch debate. Pick the motion you are preparing now.' dialog with the debate list and 'Start new debate', shrinking from the tall create form to the short picker before fading out. The same flash happens on Escape (frames-create-escape) and after a successful submit: trackMovement on submit reported the root `div#radix-:r3: "Switch debatePick the motion you are pre…"` as removed (02-tour-create.json). openDialog(null) flips the ternary to the switch branch while Radix runs its 200 ms exit animation.

**Why it happens**

The dialog body is chosen from a nullable store value that becomes null at the start of the close animation, so the fallback branch renders during the exit.

**Suggested fix**

Keep the last non-null dialog kind in a ref (const shown = dialog ?? lastDialogRef.current) and render from that, or use two separate Dialog components (one for create, one for switch), each with open={dialog === kind}. Check DebateMotionGate and other store-driven dialogs for the same pattern.

**Who it hits**

Every new user sees it on their very first action (creating a debate), and again on every create or cancel. It looks like the app opened the wrong dialog.

**Independent check**

rAF sampling after Cancel on 'Start new debate': h2 switches from 'Start new debate' (538px tall) to 'Switch debate' (186px) within one frame (t=69ms) while opacity is still 1, then fades out over ~190ms; same on Escape (t=18ms). Mid-close screenshot shows the Switch debate dialog ('You have no other debates yet.', 'Start new debate'). Code: DebateDialogs.tsx:131-157 ternary on dialog==='create' while openDialog(null) runs before Radix exit animation.

**Evidence files**

[002-t105.jpg](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/frames-create-cancel/002-t105.jpg), [003-t137.jpg](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/frames-create-cancel/003-t137.jpg), [frames-create-escape](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/frames-create-escape), [02-tour-create.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/02-tour-create.json), [s2-empty.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s2-empty.json), [s2-create-dialog-mid-close.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s2-create-dialog-mid-close.png)


### journeys-7: Selecting a Flowchart node pushes the canvas down 127 px under the cursor

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `flowchart-selection-panel-in-flow`

**Where**

- src/pages/FlowchartPage.tsx:714-745 (a 'Selected' panel is inserted above the canvas when selectedNode is set)
- src/pages/FlowchartPage.tsx:650-669 (Edit and Delete also appended to the header toolbar, which wraps to a second row)
- /app/flowchart

**What the reviewer saw**

15-flowchart2.json: 'Argument 2' node top moved from y=423 to y=550 after a single click (nodeYBeforeAfterClick [423.4, 550.4]). trackMovement reports #root resized +127 px. Two things are inserted on selection: the toolbar gains Edit and Delete and wraps, and a 'Selected <label> / description / Edit / Delete' strip appears between the stats bar and the canvas. Clicking empty canvas removes both, so the canvas jumps back up. Screenshot 14-flowchart-edit-thesis.png shows the panel after the first click of a double-click. Video 15-flowchart-node-click-shift.webm shows it live.

**Why it happens**

Selection state adds content in normal document flow above the canvas instead of overlaying it.

**Suggested fix**

Render the selected-node details as an overlay inside the ReactFlow container (a Panel at the top-right) or reserve its height permanently. Drop the duplicate Edit/Delete buttons from the header toolbar so it never wraps.

**Who it hits**

Anyone using Flowchart. Each click on a node makes the diagram jump away. Double-click-to-edit (as the thesis hint suggests) and drag start become unreliable.

**Independent check**

Clicking 'Argument 2' moved the node from y=423.4 to y=550.4; trackMovement reports #root resized +127px; clicking the pane returns it to 423.4. Clicking the thesis moved it 79px, which also made a real double-click on the thesis miss (the second click lands after the shift) so the edit dialog did not open on dblclick. Code: FlowchartPage.tsx:714-745 inserts the 'Selected' strip above the canvas; 650-669 adds Edit/Delete to the toolbar (desktop 1280 toolbar did not wrap, so the shift there comes from the strip alone).

**Evidence files**

[15-flowchart2.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/15-flowchart2.json), [15-flowchart-node-click-shift.webm](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/video/15-flowchart-node-click-shift.webm), [15-selected-duplicate-buttons.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/15-selected-duplicate-buttons.png), [14-flowchart-edit-thesis.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/14-flowchart-edit-thesis.png), [s3c-flows.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s3c-flows.json), [s3c-flowchart-node-selected.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s3c-flowchart-node-selected.png)


### journeys-8: Timer's global key handler resets a running speech on Escape and steals Space from focused buttons

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `timer-global-shortcuts-unscoped`

**Where**

- src/pages/TimerPage.tsx:249-272 (window keydown: Space toggles and preventDefault, Escape/R reset, arrows change speaker; only input and textarea are excluded)
- src/pages/TimerPage.tsx:372 (reset button aria-label uses timer.resetKey = 'R to reset')

**What the reviewer saw**

12-timer.json: started the Introductor timer (3:57 SPEAKING), opened the format dropdown, pressed Escape to close it, and the timer reset to '4:00 PAUSED' (afterEscapeCloseSelect). Escape is also how users close the header Current debate popover and language menu on this page. Focusing the 'Disable sound' button and pressing Space did not toggle sound (label unchanged) but paused the timer instead (3:58 PAUSED). The reset button's accessible name is 'R to reset' (aria snapshot 12-timer.aria.txt).

**Why it happens**

Shortcuts are bound on window with no check for event.defaultPrevented, open popovers or focused interactive elements, and Escape is used for a destructive action.

**Suggested fix**

Ignore events whose target is a button, select, [role=combobox|listbox|menu|option] or contenteditable, or when event.defaultPrevented is true. Drop Escape as a reset key (keep R). Ask before resetting a timer that is more than a few seconds in. Rename the reset button to 'Reset timer' and show 'R' as a hint.

**Who it hits**

Students timing a live speech: closing a menu wipes the countdown mid-round, and keyboard users cannot press buttons on this page.

**Independent check**

Started timer (3:58 SPEAKING), opened format Select, pressed Escape: listbox closed AND timer reset to '4:00 PAUSED'. Focused 'Disable sound' and pressed Space: label stayed 'Disable sound' and timer paused (3:59 PAUSED). Reset button accessible name is 'R to reset'. Code: TimerPage.tsx:249-272 (window keydown, only input/textarea excluded; Escape=reset), :372 aria-label uses timer.resetKey.

**Evidence files**

[12-timer.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/12-timer.json), [12-timer-select-open.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/12-timer-select-open.png), [12-timer-after-escape.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/12-timer-after-escape.png), [12-timer.aria.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/12-timer.aria.txt), [s3b-flows.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s3b-flows.json), [s3b-timer-select-open.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s3b-timer-select-open.png), [s3b-timer-after-escape.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s3b-timer-after-escape.png)


### journeys-9: Unsaved work is discarded silently: Flowchart canvas and running Timer reset on navigation; source sheet edits drop on Escape

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `page-local-work-state-no-draft`

**Where**

- src/pages/FlowchartPage.tsx:272-273 (canvas lives in useNodesState/useEdgesState, nothing persisted)
- src/pages/FlowchartPage.tsx:374-380 (Load replaces the canvas without asking)
- src/pages/TimerPage.tsx:132-141 (timer state is component state)
- src/pages/LibraryPage.tsx:917 (Sheet onOpenChange closes and discards sourceDraft with no dirty check)

**What the reviewer saw**

15-flowchart2.json: renamed the thesis to 'ZZ review thesis: ban homework' and added 'ZZ review node' (7 nodes), clicked Home, then Back: the canvas was back to the 6-node sample and the thesis edit was gone (afterNavThesisEdited: 0, afterNavNodes: 6). There was no warning and no autosave. 12-timer.json: timer at 3:56 SPEAKING, opened Library, came back: '4:00 PAUSED'. 05-library2.json: changed a source title in the detail sheet to '... EDITED', pressed Escape: the sheet closed and reopening showed the original title (reopenTitle unchanged), with no 'discard changes?' prompt. Loading a saved flowchart also replaces whatever is on the canvas without asking.

**Why it happens**

Work-in-progress lives in page-local React state with no draft persistence and no dirty checks, unlike the tool forms, which persist their inputs in the session store.

**Suggested fix**

Keep the flowchart draft (nodes, edges, loaded id) and the timer (format, speech index, deadline timestamp, running) in a zustand store, persisted to sessionStorage, so navigation and reload restore them. A deadline-based timer can keep running across routes. Add a dirty check to the source sheet ('Discard changes?') and to Flowchart Load when the canvas has unsaved edits.

**Who it hits**

Students building a flowchart or timing a speech who glance at the Library or History lose their work with no warning.

**Independent check**

Flowchart: added 'ZZ review node' (7 nodes), Home then Back -> 6 sample nodes, ZZ node gone, no warning. Timer: 3:58 SPEAKING -> Library -> Back -> '4:00 PAUSED'. Library sheet: title edited to '... EDITED', Escape closed with no prompt, reopen showed original title. Code: FlowchartPage.tsx:272-273, TimerPage.tsx:132-141, Library sheet onOpenChange.

**Evidence files**

[15-flowchart2.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/15-flowchart2.json), [15-after-nav.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/15-after-nav.png), [12-timer.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/12-timer.json), [05-library2.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/05-library2.json), [s3c-flows.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s3c-flows.json), [s3b-flows.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s3b-flows.json), [s3-flows.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s3-flows.json)


### journeys-10: On a phone, tapping the highlighted 'Start debate' in the first tour step skips the step instead of opening the dialog

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `tour-spotlight-blocks-touch`

**Where**

- src/components/features/onboarding/OnboardingTour.tsx:19-47 (step 1 spotlights the Home card whose Start debate button cannot be tapped through Joyride's overlay)
- src/components/features/onboarding/OnboardingTour.tsx:30 (code comment acknowledges: clicks pass the highlight only after a mouse move)
- src/pages/HomePage.tsx:109-120

**What the reviewer saw**

22-mobile-first-run.json (Pixel 7, fresh account, skipTour:false): step 1 spotlights the 'No current debate' card with its full-width blue 'Start debate' button. Tapping that button did not open the dialog (dialogAfterCardTap: 0). Instead the tour advanced: the page scrolled to the bottom and only a pulsing beacon sat on the Utilities > Library link, with no tooltip (22-m-after-card-tap.png, video 22-mobile-tour-tap-highlighted-start-debate.webm). Only the smaller Start debate button inside the tooltip works (23-mobile-first-run.json). Step 1 also shows three 'Start debate' buttons at once on desktop (nav, card, tooltip) (01-app-first-5.png).

**Why it happens**

Joyride's overlay intercepts the tap on the spotlighted element. An overlay click counts as advancing the step, and the next step then renders as a beacon.

**Suggested fix**

Set spotlightClicks: true on step 1, or disableOverlayClose: true with spotlightClicks, so the highlighted button works on touch. Remove the duplicate tooltip button. Set disableBeacon on all steps so an overlay tap can never leave a lone beacon.

**Who it hits**

Most students are on phones. Their first tap in the app does the wrong thing and drops them at the bottom of the page with an unexplained pulsing dot.

**Independent check**

Pixel 7, admin with no debates, tour step 1: elementFromPoint at the card's Start debate centre is DIV.react-joyride__spotlight; touchscreen.tap there opened no dialog (0) and the tour advanced (scrollY 573, beacon on Utilities > Library). 3 'Start debate' buttons visible at step 1. Code comment at OnboardingTour.tsx:30 acknowledges it.

**Evidence files**

[22-m-tour-step1.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/22-m-tour-step1.png), [22-m-after-card-tap.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/22-m-after-card-tap.png), [22-mobile-tour-tap-highlighted-start-debate.webm](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/video/22-mobile-tour-tap-highlighted-start-debate.webm), [22-mobile-first-run.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/22-mobile-first-run.json), [01-app-first-5.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/01-app-first-5.png), [s1-tour.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s1-tour.json), [s1-tour-step1-mobile.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s1-tour-step1-mobile.png), [s1-tour-after-card-tap-mobile.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s1-tour-after-card-tap-mobile.png)


### journeys-12: Expired users get no warning before submitting; pricing calls their state 'Free, Current'; checkout failure shows 'Request failed (HTTP 500)'

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `expired-state-not-surfaced-before-submit`

**Where**

- src/hooks/use-subscription-error.ts:32-33 (expiry surfaced only after a server 402)
- src/pages/GeneratePage.tsx (and every AI tool page: form fully enabled when tier is expired)
- src/components/features/subscription/PricingModal.tsx:43-50 (toast shows the raw error message), :99 ('Current' badge on Free)
- src/lib/stripe.ts:24 (getEdgeFunctionErrorMessage passes 'Request failed (HTTP 500)' through)

**What the reviewer saw**

18-expired.json, with the gate bypassed by a browser-only route rewrite: Home and Generate show no expired notice. The Generate form is fully enabled and lists every model, including ones tagged Pro. Only after clicking 'Generate Debate Case' (refused in 922 ms with a server 402) does a modal say 'Free Trial Ended. Your 3-day free trial has ended. Upgrade to Pro…'. Upgrade opens pricing, where 'Free $0/mo, Starter AI prep access…, 3-day free trial' is badged 'Current', though this user has no AI access. 'Upgrade Now' shows 'Redirecting…' (good), then the toast 'Checkout Error / Request failed (HTTP 500)' (18-expired-checkout-failed.png); staging has no Stripe by design, but the same copy would reach production users on any checkout failure. The console also logs the expected 402 as an error ('Failed to generate case: AISubscriptionError…'). Settings does say 'Expired. Your access has expired.' On the plus side, History, reading and PDF export still work for expired users.

**Why it happens**

Subscription state is available on the client (useSubscription has isExpired) but is not used to gate the tool UIs or the pricing copy. Edge-function error text is shown verbatim.

**Suggested fix**

When useSubscription().isExpired: show a persistent banner on Home and the tool pages ('Your trial ended. You can still read and export your work. Upgrade to run AI tools.'), and swap the submit buttons for 'Upgrade to use'. In PricingModal, label the expired state 'Trial ended' instead of 'Current'. Map checkout and portal failures to friendly copy ('We couldn't open checkout. Try again in a minute or contact us'), keeping the technical detail for Sentry only. Don't console.error expected 402s.

**Who it hits**

Every expired trial user, the people DebateLab most wants to convert. They fill in forms for nothing, then see contradictory plan copy and a raw HTTP error.

**Independent check**

Expired account (gate bypassed browser-side): /app/generate shows no expired notice (0 matches), Generate button enabled; click -> server 402 after ~1.5s -> modal 'Free Trial Ended...'. Upgrade -> pricing shows 'Free ... Current' with 'Starter AI prep access ... 3-day free trial' though the user has no AI access (PricingModal.tsx:99 unconditional badge). Console logs the expected 402 as error. Checkout error path (PricingModal.tsx:43-50 shows err.message, stripe.ts:24) verified in code only; I did not call create-checkout. The raw-message part shares raw-error-messages-forwarded-to-users. Used 1 AI request (refused).

**Evidence files**

[18-expired-generate.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/18-expired-generate.png), [18-expired-refusal.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/18-expired-refusal.png), [18-expired-pricing.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/18-expired-pricing.png), [18-expired-checkout-failed.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/18-expired-checkout-failed.png), [18-expired.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/18-expired.json), [s5-expired.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s5-expired.json), [s5-expired-generate.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s5-expired-generate.png), [s5-expired-limit-modal.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s5-expired-limit-modal.png), [s5-expired-pricing.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s5-expired-pricing.png)


### journeys-13: AI failures appear only in a 4-second toast; the results panel quietly returns to its 'Ready to Generate' empty state

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `ai-error-toast-only`

**Where**

- src/pages/GeneratePage.tsx:98-114 (errors shown only via toast, then loading cleared)
- src/hooks/use-toast.ts (sonner default 4 s duration, same for errors)
- src/lib/ai/client.ts:50 (REQUEST_TIMEOUT_MS = 200 s)
- Same pattern in Brainstorm/Attack/Factoids pages

**What the reviewer saw**

My first Generate run (07-generate-history.json, 07-generate-loading.png 'Reading the motion…') was still waiting at 200 s. When the script gave up at 240 s, the page showed the initial empty state 'Ready to Generate. Enter your motion…' with the button enabled and no error visible (07-error.png). The API showed no case row. This timing matches the 200 s client timeout firing a 'Request Timed Out' toast that disappears after 4 s. A student who looked away during the wait comes back to a screen that suggests nothing happened. A retry worked in 62 s (08-generate-retry.json). I could not see the toast text because my polling missed it, so confidence is medium on the exact copy. Whether a timed-out request still counts against quota belongs to the AI lane.

**Why it happens**

Error state is not part of the result area's state machine (empty, loading, result, error); it is a side-channel toast with the default auto-dismiss.

**Suggested fix**

Store the last error per tool in the session store and render an inline error card in the results column ('Generation timed out after 3 minutes. Your inputs are kept.' plus a Retry button) until the next submit. Give destructive toasts duration: Infinity or at least 10 s.

**Who it hits**

Anyone whose 1 to 3 minute AI request fails, likely on slow networks and with Pro models. They wait, then see a blank 'start' screen and may assume the app is broken.

**Independent check**

Intercepted the edge function POST with a browser-side 500 (no AI cost). Toast 'Generation Failed / AI service error: Internal error. Please try again.' at 1.5s, gone at 7s; results panel shows 'Ready to Generate' empty state with no inline error. Code: GeneratePage.tsx:98-114 (toast only), sonner default 4s (use-toast.ts, sonner.tsx sets no duration). Toast text 'AI service error: Internal error' also forwards a server message (see raw-error-messages-forwarded-to-users).

**Evidence files**

[07-generate-loading.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/07-generate-loading.png), [07-error.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/07-error.png), [08-generate-retry.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/08-generate-retry.json), [s4-case.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s4-case.json), [s4-generate-error-toast.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s4-generate-error-toast.png), [s4-generate-after-toast-gone.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s4-generate-after-toast-gone.png)


### ai-surfaces-2: No Stop/Cancel on any AI tool; Ask's only exit (Clear) wipes the conversation

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `ai-requests-not-cancellable`

**Where**

- src/pages/GeneratePage.tsx:76-118 (generateCase called without a signal)
- src/pages/AttackPage.tsx:35-60
- src/pages/BrainstormPage.tsx:34-58
- src/pages/FactoidsPage.tsx:34-58
- src/components/features/ask/AskChat.tsx:536-545 (only Save/Clear in the header)
- src/pages/AskPage.tsx:390-393 (handleClear aborts and clears everything)

**What the reviewer saw**

callSupabaseAI already accepts an AbortSignal (client.ts:516-518). None of generateCase, attackCase, brainstorm or factoids passes one, and no tool page renders a cancel control. The submit button is simply disabled for the whole request.

Measured real waits:
- Generate: 64 and 97 s.
- Regenerate: 67 s.
- Attack: 56 and 92 s.
- Brainstorm: 49 and 76 s.
- One Factoids run (DeepSeek V4 Flash) waited 130 s and then failed.

In Ask, Clear during a stream removed the question and the partial answer, with no toast (`ask-clear-desktop-DeepSeekV4Flash.json`, afterClear bubbles 0).

Code-inferred, not observed: a reload mid-Generate kills the client closure while the server finishes and logs usage. Because the loading flags are excluded from persistence (session-store.ts:1281-1291), the student loses the result and recordResult never runs, but the request still counts against the quota.

**Why it happens**

The tools never create an AbortController, and there is no Stop affordance. Ask's AbortController is only reachable through Clear, unmount, or a change of debate scope.

**Suggested fix**

Add a Stop button next to the loading state on all four tool pages. Wire it to an AbortController passed through generateCase/attackCase/brainstorm/factoids into callSupabaseAI (its signal option already exists), and say 'Stopped' rather than show an error.

In AskChat, swap the Send button for Stop while askLoading. Stopping should keep the question and any partial text, marked 'Stopped'. Edge functions already cancel upstream on client abort (ai-stream/index.ts:255-258).

**Who it hits**

Anyone who picked the wrong side, model or motion waits 1–2 minutes with no way out. A reload throws away a request the student is charged for.

**Independent check**

Code: generateCase/attackCase/brainstorm/factoids never pass an AbortSignal although callSupabaseAI accepts one (client.ts:513-518); no tool page renders a Stop control; AskChat's header only has Save/Clear and handleClear (AskPage.tsx:390-393) aborts and clears everything. Reproduced on Ask with an in-page fake stream: no Stop/Cancel button exists (count 0); Clear 1.5 s into the stream removed both the question and the partial answer, with no toast. The Generate no-cancel state is visible in gen-desktop-loading.png (disabled 'Generating Case...' only). Wait times and the reload-loses-result claim are the reviewer's; the latter is code-consistent (loading flags excluded from persistence, session-store.ts:1281-1291).

**Evidence files**

[ask-clear-desktop-DeepSeekV4Flash.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/ask-clear-desktop-DeepSeekV4Flash.json), [ask-clear-desktop-DeepSeekV4Flash-before-clear.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/ask-clear-desktop-DeepSeekV4Flash-before-clear.png), [ask-clear-desktop-DeepSeekV4Flash-after-clear.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/ask-clear-desktop-DeepSeekV4Flash-after-clear.png), [factoids-DeepSeekV4Flash.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/factoids-DeepSeekV4Flash.json), [ask-sim-desktop-all.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/ask-sim-desktop-all.json), [gen-desktop-loading.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/raw/gen-desktop-loading.png)


### ai-surfaces-3: Ask auto-scroll fights the reader and scrolls the whole page on every streamed chunk

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `ask-stream-rerender-and-autoscroll` · **Same fix as:** render-bundle-1

**Where**

- src/components/features/ask/AskChat.tsx:379-382
- src/pages/AskPage.tsx:369-377 (visibleMessages rebuilt every render)

**What the reviewer saw**

The useEffect deps are [messages], and AskPage builds a new array on every render (30 ms delta flushes). So `messagesEndRef.scrollIntoView({behavior:'smooth'})` runs on every chunk. scrollIntoView with the default block:'start' also scrolls the window.

- **Desktop:** the window scrolled to scrollY 140 during streaming, hiding the h1 and the debate strip. After a 400 px wheel-up the pane never left the bottom; samples read [547/547 … 692/692] and each chunk re-pinned it (`ask-long-desktop-default.json` scrollFight).
- **Pixel 7:** the user's wheel moved the page to scrollY 0, and auto-scroll pulled it back to 234, 304, 309 within about 300 ms, repeated on every chunk (`ask-long-mobile-DeepSeekV4Flash.json`).

**Why it happens**

The scroll effect is keyed on an array identity that changes on every render. It uses element.scrollIntoView, which scrolls every ancestor including the document, and there is no 'is the user at the bottom' check.

**Suggested fix**

Scroll only the Radix viewport: set `viewport.scrollTop = viewport.scrollHeight`, and only when the user was already within about 80 px of the bottom before the update (stick-to-bottom). Key the effect on message count plus the streaming text length, not the array. Use behavior 'auto' during streaming. Add a 'Jump to latest' pill when the user has scrolled up.

**Who it hits**

Every Ask user who tries to re-read earlier text while an answer streams. On phones the whole page keeps jumping.

**Independent check**

Code: AskChat.tsx:379-382 calls messagesEndRef.scrollIntoView({behavior:'smooth'}) on every [messages] change, and AskPage rebuilds visibleMessages every render (AskPage.tsx:334-343), so it fires on every 30 ms flush. Reproduced on desktop with an in-page fake SSE stream (nothing reached staging): window.scrollY went from 0 to 140 during streaming (h1 and the debate strip scrolled away). After a 400 px wheel-up inside the chat viewport, 10 samples over 1 s stayed pinned to the bottom (scrollTop 847/871, 871/895 ... 1217/1223). Same root cause and fix as render-bundle-1.

**Evidence files**

[ask-long-desktop-default.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/ask-long-desktop-default.json), [ask-long-mobile-DeepSeekV4Flash.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/ask-long-mobile-DeepSeekV4Flash.json), [ask-long-desktop-default-mid-stream.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/ask-long-desktop-default-mid-stream.png), [ask-stream-long-desktop.webm](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/ask-stream-long-desktop.webm), [ask-sim-desktop-all.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/ask-sim-desktop-all.json), [ask-desktop-midstream.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/raw/ask-desktop-midstream.png)


### ai-surfaces-4: Results wait behind ~18 sequential database writes after the AI has answered

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `tool-results-await-sequential-autosave`

**Where**

- src/lib/ai/client.ts:1238-1277 (autosaveDiscoveredSources awaits each source in turn)
- src/lib/ai/client.ts:1308, 1324, 1340, 1375 (awaited before the result is returned)
- src/lib/stores/session-store.ts:288-291 (getUserId calls supabase.auth.getUser, a network request, per write)
- src/lib/stores/session-store.ts:499-531 (addSource: getUser, then folder upsert, then insert)
- src/pages/GeneratePage.tsx:85-117 (recordInDebate awaited before setGenerateLoading(false) in finally)

**What the reviewer saw**

Generate (default model): the AI response body arrived at t=67,660 ms and the results became visible at t=68,964 ms. In between, 18 requests ran strictly one after another: 6× GET /auth/v1/user, 5× POST source_folders upsert, 5× POST sources, then POST cases (`generate-default-summary.json`).

Attack, Brainstorm and Factoids showed the same pattern: 18 requests and 1.3–1.8 s between the AI response and the 'complete' toast.

On this VPS link that is about 1.3 s. At student mobile round-trip times (150–300 ms) it is about 3–5 s of extra spinner after the AI has already answered.

**Why it happens**

Several bookkeeping steps happen inline and in sequence before the loading state ends: source auto-save, the folder upsert repeated per source, getUser per write, and recordResult.

**Suggested fix**

Return and render the result as soon as the AI response is parsed. Run the auto-save and record steps in the background without awaiting them. Insert all sources in one bulk insert, and upsert the folder once. Use the cached session user id (getActiveUserId) instead of auth.getUser() per write. Clear generateLoading before recording, and show the 'saved to debate' state once the save completes.

**Who it hits**

Every Generate/Attack/Brainstorm/Factoids run gets 1–5 s slower than it needs to be.

**Independent check**

Code: generateCase/attackCase/brainstorm/factoids (client.ts:1308,1324,1340,1375) await autosaveDiscoveredSources, which awaits each source in turn (client.ts:1247-1276). Each addSource calls getUserId() -> supabase.auth.getUser() (session-store.ts:288-291), then a source_folders upsert, then the insert (499-531). GeneratePage awaits recordInDebate before the 'complete' toast; the loading card only clears in finally (GeneratePage.tsx:85-117). Reproduced with a faked /functions/v1/ai response carrying 5 strong sources and every PostgREST write faked (120 ms each; nothing reached the database): after the AI body arrived at t=6875 ms, 16 requests ran strictly one after another (5 x [GET /auth/v1/user, POST source_folders, POST sources], then GET /auth/v1/user, POST cases) and the 'Generate complete' toast appeared at t=9064 ms, 2.2 s later. Real auth/v1/user RTT here was 35-55 ms. Load average about 10 during the run. The getUser part shares a fix with getuser-network-fallback-local-only-writes (use the cached session id), but the awaited serial loop and folder upsert per source are separate.

**Evidence files**

[generate-default-summary.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/generate-default-summary.json), [attack-default.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/attack-default.json), [brainstorm-default.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/brainstorm-default.json), [gen-sim-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/gen-sim-desktop.json), [gen-desktop-result.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/raw/gen-desktop-result.png)


### ai-surfaces-5: Every tool run auto-saves ~5 sources with no de-duplication; copies pile up and crowd the context

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `autosave-sources-no-dedup`

**Where**

- src/lib/ai/client.ts:1238-1277 (autosaveDiscoveredSources inserts each URL with no existence check)
- supabase/migrations (no unique constraint on sources(debate_id, origin))
- src/components/features/AutoSavedSourcesUndo.tsx (never rendered: ExportToolbar's showUndo is never passed)

**What the reviewer saw**

After my 8 tool runs in one debate, the debate had 43 sources: 3 seeded and 40 auto-saved by my runs. Exact-URL copies: the cepr.org 'Climate policy…' column 5×, an exa.ai library page 5×, Cities-Speak.pdf 3×, the hEART 2025 paper 3×, and four others 2× (`cleanup-read.json`). The Library UI lists 'Evaluating the effectiveness…' 5× and 'Climate policy may crowd out…' 5×.

One Factoids response alone saved the same report twice from two mirrors. Auto-saved strong/moderate sources are switched on (isActive), and across my runs the Review strip's 'items are left out to fit the request' count rose from 3 to 8 to 13.

The only undo control, AutoSavedSourcesUndo, is dead code. If it were wired up as written, it would delete every auto-saved source in the debate, not just this run's.

**Why it happens**

Discovered sources are inserted blindly on every run (and on every regenerate), with no client check, upsert or DB constraint on (user, debate, normalized origin).

**Suggested fix**

- Upsert auto-saved sources on (debate_id, normalized origin). Add a unique partial index plus `on conflict do update` for metadata/semantic.
- Or skip URLs the debate already has.
- Cap auto-saves per run.
- Delete AutoSavedSourcesUndo, or rewrite it to undo only the ids saved by the current run, and render it.

**Who it hits**

Every student who uses the tools more than once in a debate. The Library fills with duplicates, and the AI context budget goes to copies instead of the student's own sources.

**Independent check**

Code: autosaveDiscoveredSources inserts every retained source with no existence check (client.ts:1238-1277); migrations have no unique index on sources(debate_id, origin) (only idx_sources_user_id, init.sql:126). AutoSavedSourcesUndo is imported only by ExportToolbar and showUndo is never passed, so it never renders; as written it would delete every Auto-saved source in the Current Debate, not just this run's. Reproduced with faked writes: three Generate runs in the same debate returning the same 5 URLs issued 15 POST sources and 15 POST source_folders upserts, with no lookup first. I did not re-check the reviewer's staging duplicates (they deleted them).

**Evidence files**

[cleanup-read.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/cleanup-read.json), [library-autosaved-duplicates.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/library-autosaved-duplicates.png), [generate-cheap-summary.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/generate-cheap-summary.json), [generate-cheap-regenerating.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/generate-cheap-regenerating.png), [gen-sim-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/gen-sim-desktop.json)


### ai-surfaces-6: 'Regenerate section' re-runs the full deep research and the whole case, then keeps one section

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `regenerate-section-reruns-full-generate`

**Where**

- src/pages/GeneratePage.tsx:120-165 (handleRegenerateSection calls generateCase with the full input)
- supabase/functions/ai/features/generate.ts:26-60 (no section parameter; always deepResearch, JEV ranking and full generation)

**What the reviewer saw**

The regenerate request body was identical to a normal Generate. Its input keys were [motion, side, format, role, length, audience, tone, language], with no section field (`generate-cheap-summary.json` aiBodies).

It took 67 s, against 97 s for a full run on the same model. It auto-saved 5 more sources (duplicates) and counted as a full request. It also replaced the 'Researched sources' panel with sources from the new research, while the other sections still come from the earlier run (setDiscoveredSources at GeneratePage.tsx:159).

While one section regenerates, the whole form shows 'Generating Case...' and is disabled.

**Why it happens**

There is no section-level server operation. The client reuses full generation and throws away most of the output.

**Suggested fix**

Add a `section` field to the generate input. On the server, reuse the existing case and its research and prompt only for that section, then return just that section. Keep the original discoveredSources panel, or merge into it. Label the form state 'Regenerating Arguments…'.

**Who it hits**

Every regenerate click costs a full request (time, money and daily quota) and adds duplicate sources.

**Independent check**

Code: handleRegenerateSection (GeneratePage.tsx:120-165) calls generateCase with the full input and no section field; supabase/functions/ai/features/generate.ts has no section parameter. It replaces the Researched sources panel with the new run's sources (GeneratePage.tsx:159) while other sections stay from the first run, and autosaves the new sources again. Reproduced with a faked AI response: clicking 'Regenerate Arguments' sent POST /functions/v1/ai with feature=generate and input keys [motion, side, format, role, length, audience, tone, language], section null. While it ran the form submit button read 'Generating Case...' (generateLoading || regeneratingSection disables the form). Duration and cost claims are the reviewer's real-run numbers; I did not spend AI budget on them, but the identical request body implies a full deep-research run.

**Evidence files**

[generate-cheap-summary.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/generate-cheap-summary.json), [generate-cheap-regenerating.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/generate-cheap-regenerating.png), [generate-cheap-after-regen.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/generate-cheap-after-regen.png), [gen-sim-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/gen-sim-desktop.json), [gen-desktop-regenerating.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/raw/gen-desktop-regenerating.png)


### ai-surfaces-7: After leaving the page or reloading, a recorded Generate result loses its History link (Save comes back; regenerate stops saving; sources panel gone)

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `generate-recorded-id-in-component-state`

**Where**

- src/pages/GeneratePage.tsx:37-41 (recordedCaseId and resultDebateId are component state)
- src/pages/GeneratePage.tsx:94 and 395 (onSave hidden only while recordedCaseId is set)
- src/pages/GeneratePage.tsx:156 (updateRecordedResult only when recordedCaseId is set)
- src/lib/stores/session-store.ts:816-834 (saveCurrentCase always inserts)

**What the reviewer saw**

Observed:
- I started Generate, opened Library via client-side navigation after 4 s, and came back. The result landed and the cases row was inserted (created-rows: cases bd91c654), but the toolbar showed 'Save' and the 'Researched sources' panel was missing (`generate-cheap-summary.json`: after-nav-state saveBtn true, sourcesPanel false).
- After a reload, the result was shown with 'Save' visible and no sources panel.

Code-inferred, not exercised: clicking that Save inserts a second cases row (saveCurrentCase inserts unconditionally), and a regenerate after navigating or reloading does not update the recorded History row (updateRecordedResult is guarded by recordedCaseId).

**Why it happens**

The link between the on-screen result and its History row, plus the discovered sources, lives in page-local useState. The result itself lives in the persisted store, so the two drift apart on unmount or reload.

**Suggested fix**

Store recordedId, debateId and discoveredSources next to generateResult in the session store (persisted). Have recordResult set them. Hide Save whenever the result already has a recorded id. Apply the same fix to the other tools if they gain Save or regenerate.

**Who it hits**

Students who switch tabs while waiting or come back later: duplicate History entries, regenerated sections that are not saved, missing source provenance.

**Independent check**

Code: recordedCaseId, resultDebateId and discoveredSources are useState in GeneratePage (37-41, 62), while generateResult lives in the persisted session store. Remounting resets them, so onSave reappears (395) and updateRecordedResult is skipped on regenerate (156). saveCurrentCase always inserts a new cases row with debate_id unset (session-store.ts:816-834). Reproduced (writes faked): started Generate, client-navigated to Library after 1 s, went back after 6 s. The cases insert happened while away (writesDuringAway ends with 'cases'), yet on return the toolbar showed 'Save' and the 'Researched sources' panel was gone. Same after a reload. I did not click Save (it would insert a second row); that part is code-inferred.

**Evidence files**

[generate-cheap-summary.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/generate-cheap-summary.json), [generate-cheap-after-reload.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/generate-cheap-after-reload.png), [generate-cheap-back-while-loading.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/generate-cheap-back-while-loading.png), [gen-sim-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/gen-sim-desktop.json), [gen-desktop-after-nav.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/raw/gen-desktop-after-nav.png)


### ai-surfaces-8: AI error messages are raw server/SDK text, English-only, with no retry; client and server timeouts disagree

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `raw-error-messages-forwarded-to-users`

**Where**

- src/lib/ai/client.ts:898-990 (mapAIError: generic 'AI service error: ${message}. Please try again.'; the 'signal' check at :910 is case-sensitive)
- src/lib/ai/error-display.ts:18-65 (hard-coded English; returns error.message as-is)
- src/lib/ai/client.ts:50 (REQUEST_TIMEOUT_MS = 200 s) vs supabase/functions/ai/provider.ts:190 (REQUEST_BUDGET_MS = 130 s)
- src/pages/{Attack,Brainstorm,Factoids}Page.tsx catch blocks (no retry action)
- src/lib/ai/schemas/{generate,attack,factoids}.ts:5-6 (zod messages 'Motion is required' etc. in English)

**What the reviewer saw**

Toasts seen. The offline cases and the malformed 200 were simulated via a Playwright route abort or fake and never reached staging. The Signal timed out case was a real staging failure. The Crossfire case was a simulated failed turn.

- **Offline, all four tools:** 'Generation Failed / AI service error: Failed to send a request to the Edge Function. Please try again.'
- **Real staging failure, Factoids on DeepSeek V4 Flash after 130 s:** HTTP 500, shown as 'AI service error: Signal timed out.. Please try again.' (jargon plus a double period). The friendly timeout copy never fires, because 'Signal' does not match the lowercase 'signal' check.
- **Malformed AI output:** 'AI response did not contain the expected number of contentions.'
- **Crossfire failed turn:** 'Something went wrong — AI service error: Failed to send a request to the Edge Function.'
- **Ask's generic title:** 'Error'.

All of this text is English whatever the UI language. Only Ask and Crossfire offer Retry; Generate/Attack/Brainstorm/Factoids toasts have no action.

**Why it happens**

The error layer passes server, SDK and validator strings straight to users. There is no mapping from error class to translated copy, and the 'signal' check is case-sensitive. The client's 200 s timeout is longer than the server's 130 s budget, so the server's raw abort text reaches the user instead of the client's timeout message.

**Suggested fix**

- Map each error class (network/offline via navigator.onLine or FunctionsFetchError, timeout including server 'timed out', provider, invalid output, quota, rate limit) to i18n keys in getUserFacingAIError.
- Never append raw messages; log them only.
- Make the abort/timeout detection case-insensitive and also match 'timed out'.
- Have the server return a stable code (for example `timeout`).
- Set the client timeout just above the server budget (about 140 s).
- Add a Retry action to all four tool toasts.
- Translate the zod required-field messages.

**Who it hits**

Any failure in any tool. Students see developer jargon, in English even in Hungarian or Spanish UI, and must re-click the main button to try again.

**Independent check**

Code: mapAIError's abort check is case-sensitive (client.ts:910 includes('signal')), so the server's 'Signal timed out.' (AbortSignal.timeout at provider.ts:190-194, 130 s budget vs client REQUEST_TIMEOUT_MS 200 s at client.ts:50) falls to the generic `AI service error: ${message}. Please try again.`; getUserFacingAIError returns error.message for non-provider errors (error-display.ts:65); all copy is hard-coded English. Reproduced (routed /functions/v1/ai, never reached staging): offline Attack -> 'Attack Analysis Failed / AI service error: Failed to send a request to the Edge Function. Please try again.'; offline Factoids -> 'Research Failed / same text'; a 500 with {error:'Signal timed out.'} -> 'AI service error: Signal timed out.. Please try again.' (double period). None of these toasts has a Retry action (only Close). Same root cause as security-edge-3 for the pass-through; the case-insensitive timeout match, the 130/200 s mismatch and missing Retry on the four tool pages are additional fix points.

**Evidence files**

[sim-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/sim-desktop.json), [sim-generate-offline-desktop.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/sim-generate-offline-desktop.png), [sim-generate-malformed-desktop.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/sim-generate-malformed-desktop.png), [factoids-DeepSeekV4Flash.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/factoids-DeepSeekV4Flash.json), [crossfire-strip.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/crossfire-strip.png), [misc-tools.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/misc-tools.json), [offline-toast-attack.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/raw/offline-toast-attack.png), [timeout500-toast-attack.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/raw/timeout500-toast-attack.png)


### ai-surfaces-9: When an Ask stream fails before any text, a second, non-streaming request is sent silently; a partial stream is saved as a normal answer

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `ask-stream-fallback-and-partial-handling`

**Where**

- src/pages/AskPage.tsx:207-228 (catch: if no text yet, result = await askChat(...))
- src/pages/AskPage.tsx:214-225 (partial kept; toast and uncertainty share the key ask.streamInterrupted; no Retry)
- src/pages/AskPage.tsx:79-90 (the auto-record effect then saves the partial)

**What the reviewer saw**

Simulated via Playwright route fakes; none of these reached staging.
- **429 on /ai-stream:** the client immediately POSTs /functions/v1/ai as well (calls ['ai-stream','ai']). The user sees one 'Error / Daily limit reached' toast after two refused requests.
- **SSE error event before any delta:** same two calls.
- **Partial stream with no final event:** the partial is kept. The toast title is the full sentence 'The streamed response was interrupted before completion.' (same key as the uncertainty line). There is no Retry. The footer shows the requested model and '0.1s' as if the answer completed. The partial is then written to History (chats and messages POSTs were captured).

On real traffic, a server-side failure after the provider was called means a second paid call. A stream timeout (200 s) followed by the fallback can stretch the wait to about 400 s.

**Why it happens**

The fallback was designed for 'streaming unsupported', but it fires on any stream error, including refusals (402/429), provider errors and timeouts.

**Suggested fix**

- Fall back only when the stream endpoint is unreachable or unsupported (404/405, or no body).
- Never fall back on HTTP status refusals, 'error' SSE events or timeouts.
- Give the interrupted case its own title key, a Retry action, and a visible 'Incomplete' badge.
- Skip auto-recording (or mark incomplete) for interrupted answers, and don't stamp model or duration on them.

**Who it hits**

Quota refusals cost two quota checks. Provider failures can double-charge and double the wait. History holds truncated answers that look complete.

**Independent check**

Code: AskPage.tsx:207-228. Any stream error before the first delta (including AIRateLimitError, SSE 'error' events and the client TimeoutError, which is not a DOMException AbortError) falls through to a second, non-streaming askChat call. A partial stream is kept as a normal answer, the toast title and the uncertainty line share ask.streamInterrupted (en.json:420, a full sentence), and there is no Retry. Reproduced with an in-page fake SSE plus a routed /functions/v1/ai (no staging calls): a 429 from ai-stream produced 1 stream call + 1 non-stream call and no toast; an SSE error event before any delta did the same. A partial stream with no final event showed toast 'The streamed response was interrupted before completion.' as the title, the footer stamped the model and '2.0s' like a finished answer, and auto-record wrote POST chats x1 + POST messages x2 (writes were faked).

**Evidence files**

[ask-sim.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/ask-sim.json), [ask-sim-partial.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/ask-sim-partial.png), [ask-sim-ratelimit.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/ask-sim-ratelimit.png), [ask-sim-desktop-all.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/ask-sim-desktop-all.json), [ask-desktop-partial.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/raw/ask-desktop-partial.png)


### ai-surfaces-10: Discuss renders its summary as a code block with literal ** marks; its reply lands after Clear; text is English-only

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `discuss-sends-from-tool-page`

**Where**

- src/pages/GeneratePage.tsx:195-203
- src/pages/AttackPage.tsx:67-75
- src/pages/FactoidsPage.tsx:91-97
- src/pages/{Generate,Attack,Brainstorm,Factoids}Page.tsx handleDiscuss (askChat outside AskPage's request tracking; subscription modal state lives on the page that just unmounted)

**What the reviewer saw**

Simulated via route fakes (faked Generate result and faked Ask reply; never reached staging).

The Discuss template literal indents its lines by 4 spaces after a blank line. react-markdown therefore renders them as an indented code block. The user bubble contains <pre><code> with '**Thesis:** …', '**Arguments:**' and 'Can we refine this?' in monospace on a dark block that overflows the bubble (hasPre true, 4 literal '**').

Clicking Clear on Ask while the Discuss reply was in flight left the chat holding just the orphan reply 'FAKE DISCUSS REPLY (simulated)'.

The summary text ('I'd like to discuss…') is hard-coded English. Limit or model-restriction errors raised after navigate('/app/ask') set modal state on the unmounted tool page, so they would show nothing (code-inferred).

**Why it happens**

Indented multi-line template literals produce the markdown. Discuss fires its own askChat from the tool page instead of going through AskPage's send path (request id, abort, streaming, subscription modals).

**Suggested fix**

- Build the summary with an array join and no leading indentation, using i18n strings.
- Instead of calling askChat from the tool page, navigate to /app/ask with the prefilled message in router state, and let AskPage send it through handleSend (streaming, abort on Clear, its own modals).

**Who it hits**

Every Discuss click from Generate, Attack or Factoids shows a broken-looking message, and the reply can't be cancelled.

**Independent check**

Code: the Discuss template literal in GeneratePage.tsx:195-203 (same pattern in Attack/Factoids) indents lines with 4 spaces after a blank line, which Markdown renders as an indented code block. handleDiscuss calls askChat from the tool page outside AskPage's requestId/abort tracking, so Clear on Ask cannot cancel it. Reproduced (faked AI reply, held 3.5 s): the first Ask bubble contains a <pre> with '**Thesis:** ...', '**Arguments:**' and '1. ZZ claim 1' in monospace on a dark block (4 literal **). Clicking Clear before the reply arrived left the chat holding only 'FAKE DISCUSS REPLY (verifier)'. The English-only summary text is confirmed in code. The unmounted-page modal claim is code-inferred and plausible (subError state lives on the tool page).

**Evidence files**

[discuss-sim-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/discuss-sim-desktop.json), [discuss-user-bubble-desktop.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/discuss-user-bubble-desktop.png), [discuss-after-clear-desktop.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/discuss-after-clear-desktop.png), [gen-sim-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/gen-sim-desktop.json), [discuss-desktop-first-bubble.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/raw/discuss-desktop-first-bubble.png), [discuss-desktop-after-clear.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/raw/discuss-desktop-after-clear.png)


### ai-surfaces-11: Dashed loading card drops 10 px, blurs and flashes on every tool submit (Adam's dashed-border example)

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `motion-swap-translate-blur-on-state-swap`

**Where**

- src/pages/GeneratePage.tsx:384 and :399 (empty and loading cards both dashed, keyed separately, class motion-swap)
- src/pages/AttackPage.tsx:139
- src/pages/BrainstormPage.tsx:127
- src/pages/FactoidsPage.tsx:145
- src/index.css:349-351 and :932-942 (motion-swap: opacity 0, translateY(10px) scale(.99) blur(2px))
- src/components/ui/streaming-indicator.tsx:53 (a second motion-swap inside)

**What the reviewer saw**

Measured with a faked AI response: the click is real, and the AI request was intercepted so it never reached staging. Per-frame sampling of the results column after clicking Generate:
- t=61 ms: the dashed empty card at y=-1, opacity 1.
- t=125 ms: the new dashed loading card at y=11, opacity 0, transform matrix(0.99,…,0,10), blur 2px.
- Then it eases back: y=5.1 (opacity 0.49), 3.1, 1.7 … to 0 over about 300 ms.

The same dashed box visibly blinks out, drops about 10 px and slides back up. The loading-to-results swap then scrolls the page (scrollY 280 to 199) while results stagger in. The submit label also shifts 13.5 px sideways ('Generating Case...' with spinner). All four tools share this.

**Why it happens**

Two visually identical dashed containers are swapped by key. Each mount replays the motion-swap entrance (translateY, scale, blur and opacity from 0), and StreamingIndicator adds its own motion-swap.

**Suggested fix**

Keep one persistent dashed container across empty, loading and error states and crossfade only its inner content (opacity only, no translate or blur). Or drop motion-swap from the loading card. Remove the inner motion-swap in StreamingIndicator. Give the submit button content a fixed width, or keep the icon slot constant.

**Who it hits**

Every submit on the four core tools. It is exactly the 'moves down and back up when clicked' glitch Adam described.

**Independent check**

Code: the empty and loading cards are separate keyed elements that both carry motion-swap (GeneratePage.tsx:384 and :399; Attack 139, Brainstorm 127, Factoids 145), and @keyframes motion-swap starts at opacity 0, translateY(10px) scale(.99), blur(2px) (index.css:349-351, 932-943). Reproduced on desktop with a faked AI response, per-frame sampling of the results column after clicking Generate: empty dashed card at y=15, opacity 1 until t=91 ms; at t=140 ms the new dashed loading card is at y=27, opacity 0, matrix(0.99,0,0,0.99,0,10), blur(2px); it eases back (y 23.8, 21.1, 17.7, 16.1 ...) to y=15 by about 340 ms. The submit label 'Generating Case...' shifts 13.5 px sideways and resizes 27 px (trackMovement). Different mechanism from motion-polish-4 (dashed-hover-animation-restarts-entrance, the hover/marching-ants restart): deleting the hover rule does not stop this click-time dip, so it needs its own fix (one persistent container, opacity-only crossfade).

**Evidence files**

[generate-click-dashed-swap-desktop.webm](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/generate-click-dashed-swap-desktop.webm), [swap-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/swap-desktop.json), [swap-contact-sheet.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/swap-contact-sheet.png), [sim-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/sim-desktop.json), [gen-sim-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/gen-sim-desktop.json), [gen-desktop-before.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/raw/gen-desktop-before.png), [gen-desktop-loading.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/raw/gen-desktop-loading.png)


### ai-surfaces-12: Saved results can't be managed: Crossfire debriefs can't be reopened, and chats/attacks/brainstorms/factoids/crossfires can't be deleted

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `saved-results-missing-crossfire-and-delete`

**Where**

- src/pages/HistoryPage.tsx:137-144 (tabs: Cases, Chats, Attacks, Brainstorms, Factoids, Sparring; no Crossfire)
- src/pages/CurrentDebatePage.tsx:44 (canOpen = item.kind !== 'crossfire')
- src/pages/HistoryPage.tsx:160-340 (delete buttons only for cases and sparring)
- src/lib/stores/session-store.ts:176, 209 (only deleteSavedCase and deleteSavedFlowchart exist)

**What the reviewer saw**

My Crossfire round recorded a `crossfires` row (55b70273…) with the full debrief. History has no Crossfire tab, and the Current Debate page lists the item without a Load button, so the debrief can never be revisited once the student clicks 'Start another crossfire' or the local state is gone.

History offers Load but no Delete for Chats, Attacks, Brainstorms and Factoids, and the store has no delete action for those kinds or for crossfires. Every run is auto-recorded, so failed, duplicate or test runs (and the duplicates from finding 7) can't be removed except by deleting the whole debate. For cleanup I had to delete them through PostgREST.

**Why it happens**

Auto-recording was added for every tool, but the History and Current Debate surfaces only got load paths for some kinds and delete paths for two.

**Suggested fix**

Add a Crossfire tab and an openable item that restores the debrief view read-only. Add delete actions (store and UI, with a confirm dialog) for chats, attacks, brainstorms, factoids and crossfires. RLS 'for all' policies already allow owner deletes.

**Who it hits**

Students lose Crossfire feedback after one session and can't tidy their History.

**Independent check**

Code: HistoryPage tabs are Cases, Chats, Attacks, Brainstorms, Factoids, Sparring (HistoryPage.tsx:137-144); savedCrossfires is hydrated but never rendered except as a non-openable row (CurrentDebatePage.tsx:44 canOpen = kind !== 'crossfire'); delete UI and store actions exist only for cases, sparring and flowcharts (session-store.ts:176, 209). Verified on staging History: tab list has no Crossfire; Cases has 1 row with 1 delete button, Attacks 1 row with 0 delete buttons, Factoids 1 row with 0 delete buttons.

**Evidence files**

[crossfire.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/crossfire.json), [crossfire-debrief.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/crossfire-debrief.png), [history-desktop-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/history-desktop-light.png), [history-desktop-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/history-desktop-light.json), [misc-tools.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/misc-tools.json), [history-attacks-tab.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/raw/history-attacks-tab.png)


### ai-surfaces-14: An Ask exchange that finishes while offline is silently not recorded, and never retried when back online

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `getuser-network-fallback-local-only-writes` · **Same fix as:** integrity-money-1

**Where**

- src/lib/stores/session-store.ts:1299-1308 (syncAskChatNow: getUserId() returns null offline, then returns silently)
- src/pages/AskPage.tsx:79-90 (only re-runs when message count or loading changes)

**What the reviewer saw**

Real run, cheap model. I went offline (context.setOffline(true)) mid-stream. Chromium kept the open stream, and the 7,456-character answer completed while offline. The page then showed no toast; no chats or messages insert was ever made (created [] for this run); after going back online, still nothing. The exchange shows on screen but is missing from History and the Current Debate.

The console shows ERR_INTERNET_DISCONNECTED for the GET /auth/v1/user that syncAskChatNow uses. Compare the short run online, which recorded chats b5616632 and its messages.

**Why it happens**

syncAskChatNow uses a network getUser() call and treats its failure as 'signed out', exiting without an error or a retry. Nothing schedules a re-sync on reconnect.

**Suggested fix**

Use the cached session user id. On a failed write, keep the pending count and retry on the 'online' event, or show the existing 'Could not save this result to the debate' toast with Retry.

**Who it hits**

Students on flaky school wifi lose answers from History without knowing it.

**Independent check**

Code: syncAskChatNow returns silently when getUserId() (a supabase.auth.getUser network call) yields null (session-store.ts:1299-1308), and AskPage's auto-record effect (AskPage.tsx:79-90) only re-runs when message count or loading changes, so nothing retries on 'online'. Reproduced: fake SSE stream, context.setOffline(true) mid-stream; the answer finished on screen, GET /auth/v1/user failed with ERR_INTERNET_DISCONNECTED, no chats/messages write was attempted and no toast shown; 5 s after going back online still no write and no toast. Same cause as integrity-money-1 (syncAskChatNow is listed there); the missing online retry is the only extra piece.

**Evidence files**

[ask-offline-desktop-DeepSeekV4Flash.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/ask-offline-desktop-DeepSeekV4Flash.json), [ask-offline-desktop-DeepSeekV4Flash-after-offline.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/ask-offline-desktop-DeepSeekV4Flash-after-offline.png), [ask-sim-desktop-all.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/ask-sim-desktop-all.json)


### a11y-i18n-1: Timer page global shortcuts hijack Escape, Space and arrows: closing a dialog resets a running timer, Space on any button toggles the timer

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `timer-global-shortcuts-unscoped`

**Where**

- src/pages/TimerPage.tsx:249-272
- /app/timer

**What the reviewer saw**

The window keydown handler skips only input and textarea targets. For Space it calls preventDefault and toggleTimer; for KeyR and Escape it calls resetTimer; ArrowLeft/Right change the speech. Measured on staging as trial (desktop): after Start, timer at 3:57. Focus the header Language button and press Enter (dialog opens), then Escape to close it: timer goes to 4:00 PAUSED. Start again, focus the Language button, press Space: the dialog does not open and the timer pauses (SPEAKING→PAUSED). Focus 'Disable sound', press Space: sound is not toggled (label still 'Disable sound') and the timer toggles instead. Focus the format select, press ArrowRight: speech jumps from 3:59 Introductor to 6:00 Refutation 1. AppLayout's own Escape listener only closes the mobile menu; grep found no other global keydown handler.

**Why it happens**

The shortcut handler is on window and ignores everything except input/textarea. It does not check event.defaultPrevented, focused interactive elements (button, [role=combobox|switch|slider|option]) or open overlays, and Escape is bound to reset.

**Suggested fix**

In TimerPage.tsx, return early when e.defaultPrevented, when e.target is inside button, a, select, [role=combobox], [role=switch], [role=slider], [role=listbox], [role=dialog] or [contenteditable], or when any [role=dialog] or [data-radix-popper-content-wrapper] is open. Drop Escape from the reset keys (keep R). Optionally scope Space and arrows to when focus is on body or the timer card.

**Who it hits**

Every keyboard user on the Timer, and any user who presses Escape to close a dialog or select while timing a speech, loses the running time mid-speech. Space cannot press buttons on this page.

**Independent check**

Code TimerPage.tsx:249-272 (window keydown, skips only input/textarea; Escape and KeyR reset, Space preventDefault+toggle, arrows change speech). Reproduced on staging (trial, desktop): running 3:57 -> open Language dialog with Enter -> Escape -> '4:00 PAUSED' (reset). Space on focused Language button: dialog did not open, timer toggled. Space on 'Disable sound': label unchanged, timer toggled instead. ArrowRight on format combobox: jumped to '6:00 Refutation 1'.

**Evidence files**

[timer-escape-space-arrow-shortcuts.webm](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/keyboard/video/timer-escape-space-arrow-shortcuts.webm), [timer-after-escape-dialog.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/keyboard/timer-after-escape-dialog.png), [s2-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s2-light.json)


### a11y-i18n-2: Light-mode --primary fails AA: primary buttons 3.86:1, primary-coloured links 3.75:1

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `light-primary-token-too-light`

**Where**

- src/index.css:23-24 (--primary 200 98% 39% = #0284c5, --primary-foreground #f0f9ff)
- Every bg-primary button on /, /login, /share/*, /app, /app/attack, brainstorm, crossfire, factoids, flowchart, generate, library, settings, sparring, timer, ask
- text-primary links: /expocit/sources (20 links), /app/library (Change link, badges)

**What the reviewer saw**

axe color-contrast (serious), light mode only, desktop and mobile. #f0f9ff on #0284c5 = 3.85:1 (34 nodes across 15 routes, including the landing hero preview toggle at 11px, the Timer Start button and the Generate/Attack submit buttons). #0284c5 text on #f1f5f9 = 3.75:1 (42 nodes on /expocit/sources and /app/library). #0284c5 on #dfeef7 badge = 3.46:1. Dark mode passes (axe found none of these in dark).

**Why it happens**

One light-theme token is too light for white text and too light as text on the near-white background.

**Suggested fix**

Darken the light --primary in src/index.css to about hsl(200 98% 32%) (sky-700 #0369a1). This gives 5.57:1 with #f0f9ff and 5.42:1 as text on #f1f5f9. Keep --ring in sync and re-run axe on the route matrix.

**Who it hits**

All light-mode users (the default for many) see low-contrast text on the main call-to-action buttons and on links.

**Independent check**

Computed + axe on staging (light): #f0f9ff on #0284c5 = 3.85:1 on bg-primary buttons on /login (Google, Send code), /app, generate, library, settings, timer Start; #0284c5 text on #f1f5f9 = 3.75:1 (library link) and 3.46:1 on the #dfeef7 badge. Light --primary is src/index.css:23. Sky-700 #0369a1 gives 5.56:1 / 5.41:1. Dark passes.

**Evidence files**

[summary.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/axe/summary.txt), [trial-desktop-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/axe/trial-desktop-light.json), [anon-desktop-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/axe/anon-desktop-light.json), [anon-desktop-hu_login.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/raw/i18n/anon-desktop-hu_login.png), [s1-signed-out.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s1-signed-out.json), [s2-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s2-light.json)


### a11y-i18n-3: Form controls with no accessible name: Radix Select triggers, Factoids slider, Timer progress bar

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `select-triggers-unlabelled`

**Where**

- src/components/features/generate/GenerateForm.tsx:176,189 (Side, Speech role)
- src/components/features/brainstorm/BrainstormForm.tsx (side, output format selects)
- src/components/features/factoids/FactoidsForm.tsx:98,115 (Position, Source type) and :134-139 (Slider thumb)
- src/pages/LibraryPage.tsx:496 (folder filter, w-[160px]; the sort select at :547 is labelled)
- src/pages/FlowchartPage.tsx node-type select ('Support')
- src/pages/TimerPage.tsx:347 (<Progress>)

**What the reviewer saw**

axe button-name (critical): 16 nodes on /app/generate and /app/brainstorm, 8 on /app/factoids, 4 each on /app/library and /app/flowchart (all 4 theme/device combos). axe aria-input-field-name (serious): the Factoids slider span[role=slider]. axe aria-progressbar-name (serious): the Timer progress bar. In each case the visible <Label> has no htmlFor/id link to the SelectTrigger, and role=combobox does not take its name from its content. The keyboard walk confirms screen readers get only the value ('In favor', 'R1 - Rebuttal/Arg (6 min)').

**Why it happens**

shadcn <Label> is rendered without htmlFor, and <SelectTrigger> has no id or aria-labelledby. Slider's Label htmlFor points at the root, not the thumb. Progress has no label.

**Suggested fix**

Give each SelectTrigger an id and set Label htmlFor to it (or aria-labelledby). Pass aria-label to the Slider thumb (or aria-labelledby on Slider). Add aria-label={t('timer.displayLabel')} or similar to the Timer <Progress>. Add an aria-label to the Library folder filter. Fold into the axe route check from next-15 #14.

**Who it hits**

Screen-reader and voice-control users cannot tell which setting a dropdown controls on every Prepare tool form.

**Independent check**

Own axe run (trial, light, desktop): button-name 2 on /app/generate (OptionSelect, GenerateForm.tsx:35-50 used at :177,:190), 2 on /app/brainstorm (BrainstormForm.tsx:96-121), 2 on /app/factoids (FactoidsForm.tsx:98-122) + aria-input-field-name 1 (slider thumb, Label htmlFor targets the root at :134), 1 on /app/library (folder filter LibraryPage.tsx:495; the sort select is labelled), 1 on /app/flowchart (node-type select), aria-progressbar-name on /app/timer (TimerPage.tsx:347).

**Evidence files**

[summary.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/axe/summary.txt), [walk-trial-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/keyboard/walk-trial-desktop.json), [s2-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s2-light.json)


### a11y-i18n-4: Inactive-debate gate opens with focus on <body> behind the modal

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `alertdialog-without-cancel-no-initial-focus`

**Where**

- src/components/features/debate/DebateDialogs.tsx:186-205 (InactiveDebateGate AlertDialog, no AlertDialogCancel)
- Any /app route after 5 days without activity

**What the reviewer saw**

On staging as trial with the gate showing, document.activeElement was <body data-scroll-locked style='pointer-events:none'>, not inside the alertdialog. Radix AlertDialogContent's onOpenAutoFocus calls event.preventDefault() and then cancelRef.current?.focus() (node_modules/@radix-ui/react-alert-dialog/dist/index.mjs:58-60). This gate renders no AlertDialogCancel (DebateDialogs.tsx has 0 AlertDialogCancel), so focus goes nowhere. Escape is also blocked here by design (onEscapeKeyDown preventDefault). After Continue, focus stays on body.

**Why it happens**

An AlertDialog with no Cancel element gets no initial focus because Radix's built-in autofocus targets the Cancel ref.

**Suggested fix**

Pass onOpenAutoFocus to AlertDialogContent in InactiveDebateGate that focuses the Continue button (ref), or render Continue as AlertDialogCancel asChild. After continuing, move focus to the page h1 or main.

**Who it hits**

Keyboard and screen-reader users land on a blocking modal without its title being announced and have to Tab blindly into it. It shows to every returning student after 5 days away.

**Independent check**

Code: DebateDialogs.tsx:186-205 InactiveDebateGate renders no AlertDialogCancel (0 occurrences in file); Radix AlertDialogContent onOpenAutoFocus preventDefaults and focuses cancelRef only (node_modules/@radix-ui/react-alert-dialog/dist/index.mjs:58-60), so focus is left outside the dialog. (provisional)

**Evidence files**

[trial-gate-dialog-desktop.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/raw/trial-gate-dialog-desktop.png)


### a11y-i18n-5: Library source rows: Enter on the link and Space on the switch open the viewer instead (nested interactive role=button)

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `library-row-nested-interactive` · **Known in plan:** next-15 #14 (partly done: keyboard handlers exist, but the nesting and preventDefault remain)

**Where**

- src/pages/LibraryPage.tsx:69-79 (div role=button tabIndex=0 with onKeyDown preventDefault on Enter/Space)
- src/pages/LibraryPage.tsx:85 (inner external <a>), :128-145 (inner Delete button and Switch)
- /app/library

**What the reviewer saw**

On staging, trial, desktop: focus the inner source link and press Enter. No new tab opens; the source viewer dialog opens instead. Focus the inner 'Toggle …' switch and press Space: aria-checked stays true and the source viewer opens. The outer row's onKeyDown receives the bubbled key, calls preventDefault (which cancels the inner element's activation) and calls onOpen. axe nested-interactive (serious) flags both rows on all 4 combos. axe target-size also flags the inner link (truncated inline link under 24px tall). The Delete button inside the row is inferred to behave the same (Enter keydown bubbles and is prevented); I did not test it, to avoid deleting seeded data.

**Why it happens**

The whole row is a pseudo-button that contains real interactive controls, and its key handler does not check event.target === event.currentTarget.

**Suggested fix**

Make the title a real <button> that opens the viewer (or a stretched-link pattern) and keep the link, delete and switch as siblings outside it. As a stopgap, return early in onKeyDown when event.target !== event.currentTarget.

**Who it hits**

Keyboard users cannot open a source's original URL, switch a source on or off, or (by code) delete it from the Library list.

**Independent check**

Code LibraryPage.tsx:69-79: row div role=button onKeyDown preventDefaults Enter/Space for any bubbled target and opens the viewer; inner link (:85), Delete button (:128) and Switch (:139) are nested. Reproduced (trial, desktop): Space on the focused 'Toggle Teaching to the test…' switch left aria-checked=true and opened the source viewer; Enter on the inner source link opened the viewer, no new tab. axe nested-interactive on both rows. The same bubbling means Enter on the inner Delete button opens the viewer too (not tested, to protect seeded data). Fix: return early when event.target !== event.currentTarget, or restructure.

**Evidence files**

[kb-library-enter-on-link-desktop.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/keyboard/kb-library-enter-on-link-desktop.png), [kb-library-space-on-switch-desktop.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/keyboard/kb-library-space-on-switch-desktop.png), [dialogs-desktop.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/keyboard/dialogs-desktop.txt), [s3.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s3.json), [s3-library-switch-space.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s3-library-switch-space.png), [s2-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s2-light.json)


### a11y-i18n-6: Flowchart nodes cannot be edited or deleted with the keyboard

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `flowchart-selection-pointer-only`

**Where**

- src/pages/FlowchartPage.tsx:756-757 (onNodeClick sets selectedNode; onNodeDoubleClick opens edit)
- src/pages/FlowchartPage.tsx:714-745 (Selected panel with Edit/Delete only renders when selectedNode is set)
- /app/flowchart

**What the reviewer saw**

On staging, trial, desktop: Tab to the Thesis node (div role=button 'Thesis Your Thesis Click to edit…') and press Enter. React Flow draws its selected ring, but no 'Selected' panel appears, no dialog opens, and focus stays on the node. The custom selectedNode state is only set by mouse onNodeClick, so keyboard selection never shows Edit or Delete, and editing needs a double-click. The node copy says 'Click to edit'. Each node and each of the 5 edges is also a Tab stop (11 stops before the zoom controls).

**Why it happens**

App selection state is wired to pointer events instead of React Flow's selection state (onSelectionChange / node.selected).

**Suggested fix**

Drive selectedNode from onSelectionChange (or derive it from nodes.find(n => n.selected)) so Enter/Space selection shows the panel. Add an onKeyDown on the custom node (Enter opens openEditDialog). Consider edgesFocusable={false}.

**Who it hits**

Keyboard and switch users can add nodes but cannot change or remove any of them.

**Independent check**

Reproduced (trial, desktop): Tab focus on Thesis node, Enter -> React Flow adds 'selected' class but no 'Selected' panel, no dialog; mouse click shows the panel. FlowchartPage.tsx:756-757 wires selectedNode only to onNodeClick/onNodeDoubleClick.

**Evidence files**

[kb-flowchart-node-enter-desktop.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/keyboard/kb-flowchart-node-enter-desktop.png), [walk-trial-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/keyboard/walk-trial-desktop.json), [s2-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s2-light.json), [s2-flowchart-keyboard-enter.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s2-flowchart-keyboard-enter.png)


### a11y-i18n-7: Server and AI-client error messages appear in English under the Hungarian and Spanish UI

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `raw-error-messages-forwarded-to-users`

**Where**

- supabase/functions/import-source/index.ts:242-345 (English error strings) shown raw by src/pages/LibraryPage.tsx:252
- src/lib/supabase/edge-function-error.ts:2,44-49 (returns body.error or 'Request failed (HTTP n)')
- src/lib/ai/error-display.ts:31-63 (all getUserFacingAIError strings are English; used by 6 tool pages)
- src/lib/ai/client.ts:925-929, 989-992 ('Authentication failed…', 'AI service error: …. Please try again.')
- src/pages/GeneratePage.tsx:105-107 (error.message plus hard-coded ' uses')
- src/pages/LoginPage.tsx:57,89,110,123,143, src/components/features/subscription/PricingModal.tsx:47,73, src/pages/SettingsPage.tsx:113,130 (error.message as toast body)

**What the reviewer saw**

Live on staging: with trial UI set to Magyar, Library → Forrás Hozzáadása → URL https://debatelab-staging.vercel.app/favicon.png → URL importálása. import-source answered 415, and the toast showed the Hungarian title 'Import sikertelen' over the English body 'Only HTML and plain text pages can be imported from a URL.' The other paths are confirmed in code. They cover daily import limit, suspended account, timeouts, OTP and demo-code errors, checkout, portal, promo and AI provider/rate-limit messages.

**Why it happens**

Edge Functions return human English sentences instead of stable codes, and the client forwards error.message to toasts.

**Suggested fix**

Have Edge Functions return a machine code (e.g. code: 'unsupported_type', 'daily_limit', 'timeout') next to error. Map codes to i18n keys in getEdgeFunctionErrorMessage and getUserFacingAIError, falling back to a translated generic message rather than raw text. Remove the hard-coded ' uses' in GeneratePage.

**Who it hits**

Hungarian and Spanish students (the main audience) get English text exactly when something goes wrong.

**Independent check**

Reproduced: trial UI set to Magyar, Library -> 'Forrás Hozzáadása' -> URL https://debatelab-staging.vercel.app/favicon.png -> 'URL importálása': import-source returned 415 and the toast read 'Import sikertelen' over the English body 'Only HTML and plain text pages can be imported from a URL.' Nothing was created (still 2 sources). Code paths: LibraryPage.tsx:250-253 forwards error.message; edge-function-error.ts:44-49 returns body.error or 'Request failed (HTTP n)'; error-display.ts:31-63 English-only strings; GeneratePage.tsx:105 appends hard-coded ' uses'. Same cause and fix (stable error codes mapped to i18n keys) as raw-error-messages-forwarded-to-users. Language restored to English right after.

**Evidence files**

[hu-import-error-raw-english.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/i18n/hu-import-error-raw-english.png), [s4-hu-import.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s4-hu-import.json), [s4-hu-import-toast.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s4-hu-import-toast.png)


### a11y-i18n-8: document.title is 'DebateLab' on every route and overwrites the landing page's SEO title after hydration

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `no-per-route-document-title`

**Where**

- src/i18n.ts:22 (document.title = i18n.t('home.title'))
- src/lib/stores/settings-store.ts:370 (onRehydrateStorage calls applyAppLanguage on every load)
- index.html:9 (original title 'DebateLab by Pi-Stack | AI Debate Prep, Cases & Rebuttals')

**What the reviewer saw**

Every one of the 84 axe page scans (public and app, both languages tested) recorded document.title === 'DebateLab', including '/' signed out. Navigating /app → Library via keyboard leaves the title 'DebateLab'. No per-route title code exists (grep for document.title or Helmet finds only i18n.ts).

**Why it happens**

Language application sets one global title and there is no route-level title.

**Suggested fix**

Set a translated per-route title in RouteContent (App.tsx) from ROUTE_FALLBACKS labels, e.g. `${label} · DebateLab`, updated on pathname and language change. Stop applyAppLanguage from touching the title, and keep index.html's full SEO title for '/' (localized).

**Who it hits**

Screen-reader users get no page identity on navigation (WCAG 2.4.2), every tab and history entry reads 'DebateLab', and JS-rendering crawlers see 'DebateLab' instead of the marketing title on the landing page.

**Independent check**

Staging: document.title is 'DebateLab' on / (signed out, after load), /login, 404 and all 12 app routes scanned, although index.html:9 ships 'DebateLab by Pi-Stack | AI Debate Prep, Cases & Rebuttals'. Cause src/i18n.ts:22 in applyAppLanguage, called on rehydrate (settings-store.ts:370). Landing SEO title loss is the costlier half (crawlers that run JS see 'DebateLab').

**Evidence files**

[anon-desktop-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/axe/anon-desktop-light.json), [trial-desktop-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/axe/trial-desktop-light.json), [s1-signed-out.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s1-signed-out.json), [s2-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s2-light.json)


### a11y-i18n-9: Dark mode: Flowchart zoom controls are white-on-white and the minimap is a white box

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `reactflow-default-light-styles`

**Where**

- src/pages/FlowchartPage.tsx:132-148 (ControlButtons), :764 (MiniMap)
- /app/flowchart in dark mode

**What the reviewer saw**

Computed styles in dark mode: each .react-flow__controls-button has background rgb(254,254,254) and color rgb(248,250,252), with the Lucide icon stroke using currentColor, so the icons are invisible. The .react-flow__minimap background is rgb(255,255,255). The screenshot shows four blank white squares bottom-left and a white panel bottom-right on the dark canvas.

**Why it happens**

React Flow 11's default stylesheet hard-codes a light control background, while the icons inherit the dark theme's foreground colour. No theme override exists in index.css.

**Suggested fix**

Add theme overrides in src/index.css: .react-flow__controls-button { background: hsl(var(--card)); color: hsl(var(--foreground)); border-color: hsl(var(--border)); } and .react-flow__minimap { background: hsl(var(--card)); }, or pass className/style. Use maskColor on MiniMap.

**Who it hits**

Dark-mode users cannot see the zoom, fit and lock controls.

**Independent check**

Staging /app/flowchart, trial, colorScheme dark (html.dark): every .react-flow__controls-button background rgb(254,254,254) with color rgb(248,250,252) (icons invisible); .react-flow__minimap background rgb(255,255,255). Screenshot shows four blank white squares bottom-left and a white minimap box. No override in src/index.css.

**Evidence files**

[trial-desktop-dark_app_flowchart.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/raw/axe/trial-desktop-dark_app_flowchart.png), [flowchart-dark-controls.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/misc/flowchart-dark-controls.png), [flowchart-dark-minimap.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/misc/flowchart-dark-minimap.png), [s2-dark.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s2-dark.json), [s2-flowchart-dark.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s2-flowchart-dark.png)


### a11y-i18n-10: Timer display is a polite, atomic live region, so screen readers re-announce it every second

**Severity:** medium · **Verdict:** confirmed · **Root cause:** `timer-live-region-every-tick`

**Where**

- src/pages/TimerPage.tsx:329 (role=timer aria-live=polite aria-atomic=true)

**What the reviewer saw**

While running, the timer region mutated 6 times in 4.2 s and its full text ('3:56 SPEAKING Introductor') is atomic, so each tick queues a full announcement. role=timer is implicitly aria-live=off; the explicit polite overrides that.

**Why it happens**

aria-live was added to the ticking element itself.

**Suggested fix**

Remove aria-live/aria-atomic from the ticking display (keep role=timer). Add a separate sr-only polite region announcing only state changes: started, paused, 1 minute left, time up, speech changed.

**Who it hits**

A screen-reader user timing a speech hears constant chatter that drowns out everything else.

**Independent check**

Code TimerPage.tsx:329 role=timer aria-live=polite aria-atomic=true; staging DOM shows the same attributes and the text changes every second while running.

**Evidence files**

[dialogs-desktop.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/keyboard/dialogs-desktop.txt), [s2-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s2-light.json)


### journeys-5: The 'Still preparing this debate?' gate blocks every /app route, including Settings and Sign out, and cannot be dismissed

**Severity:** low (reviewer said medium) · **Verdict:** confirmed · **Root cause:** `inactive-gate-blocks-utility-routes`

**Where**

- src/components/features/debate/DebateDialogs.tsx:167-226 (InactiveDebateGate, onEscapeKeyDown preventDefault, open whenever the current debate is older than 5 days)
- src/components/layout/AppLayout.tsx:288 (rendered for every route under the app layout)
- src/lib/stores/debate-store.ts:26 (INACTIVE_DEBATE_MS = 5 days)

**What the reviewer saw**

18-expired.json, expired account (last activity 2026-10-02): the gate appeared on /app, /app/settings and /app/timer. Escape did not close it (gateAfterEscape: 1), and clicking the overlay did not close it either. On /app/settings, Sign out was not reachable (signOutReachable: 0), and neither were 'Download my data' and 'Delete account' (screenshot 18-expired-gate-settings.png). The wording: 'Still preparing this debate? <motion> Last activity 6 days ago. Choose how to continue.' with buttons Switch debate / Start new debate / Continue. The only way through is a write (Continue updates last_activity_at). I did not click it. The gate did not appear on /share/:code.

**Why it happens**

The gate is a modal mounted in the app layout with no route allow-list and no dismiss path, so a check about the debate blocks account and utility pages.

**Suggested fix**

Skip the gate on /app/settings, /app/timer, /app/history and /app/library (or only show it when a debate-scoped tool is opened). Let Escape or a close button mean 'not now' for the session (keep the 5-day reminder). Rename Continue to 'Keep working on this debate'. Consider a non-blocking banner on Home instead of a modal.

**Who it hits**

Every returning student after 5 days, i.e. most students between weekly club sessions. They must make a debate decision before they can even sign out of a shared school computer.

**Independent check**

Expired account's debate was continued by someone on 2026-10-08, so I simulated inactivity browser-side (route rewrite of the debates GET to last_activity_at = now-7d, no writes). Gate appeared on /app, /app/settings and /app/timer; Escape and an overlay click left it open (count 1); Sign out on /app/settings not clickable (trial click failed). Code: DebateDialogs.tsx:167-226 (onEscapeKeyDown preventDefault, no route allow-list), AppLayout.tsx:288. Downgraded to low: the gate is intentional and Continue is one click, but it should not block Settings/Sign out/Timer.

**Evidence files**

[18-expired-gate-app.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/18-expired-gate-app.png), [18-expired-gate-settings.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/18-expired-gate-settings.png), [18-expired.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/18-expired.json), [s5b-gate.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s5b-gate.json), [s5-expired-gate-settings.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s5-expired-gate-settings.png)


### journeys-11: Case PDF export: title overlaps the subtitle and long 'Target:' headings run off the page

**Severity:** low (reviewer said medium) · **Verdict:** partly · **Root cause:** `pdf-export-no-text-wrap-in-headers`

**Where**

- src/lib/pdf-export-utils.ts:109-121 (2-line 18pt title at y=18; subtitle at fixed y=28 overlaps the second line; 3+ lines overflow the 40 mm header)
- src/lib/pdf-export-utils.ts:303-310 (addSubsectionLabel uses doc.text without splitTextToSize)
- src/lib/pdf-export-utils.ts:438 (counters use addSubsectionLabel for the full target argument)

**What the reviewer saw**

Exported the generated case from History (09-case-export.pdf, 5 pages) and rendered it with pdf.js. Page 1 header: the motion 'ZZ review This House would ban homework' wraps and 'homework' is drawn over 'In favor • CUSTOM Format' (09-case-export-pdf-header-crop.png). Page 4 'Prepared Counters': 'Target: A ban just pushes families toward private tutoring and worsens inequality (China's Do…' and 'Target: Well-designed short homework has a real positive effect, so the fix is better design, no…' are cut at the page edge (09-case-export-pdf-p4-crop.png). Extracted text also ends at 'China's Do'. The DOCX of the same case is fine.

**Why it happens**

The header layout uses fixed y positions, and the subsection label helper skips text wrapping.

**Suggested fix**

In addHeader, compute the subtitle y from titleLines.length times the line height and grow the header rect to fit, or clamp the title to 2 lines with an ellipsis. In addSubsectionLabel, wrap with doc.splitTextToSize(label, contentWidth - indent), call checkPageBreak for the full block height, and advance y per line. Add a unit test with a 200-character motion and target that asserts no text x exceeds pageWidth - margin (this is a renderer, so a regression is easy to miss by eye).

**Who it hits**

Every student who prints or submits a case PDF, which is the main hand-in format. Long motions are normal, and the counters section loses words.

**Independent check**

Exported my seeded ZZ case PDF from Generate and read glyph positions with pdfjs-dist: Counters label 'Target: A ban just pushes ... as seen in o' starts at x=62.4 and ends at x=602.5 on a 595.3pt page and the rest of the sentence is missing (addSubsectionLabel, pdf-export-utils.ts:303-310, no splitTextToSize) - confirmed. Header: 2-line title second baseline y=71.7pt, subtitle (11pt) baseline y=79.4pt, so the subtitle caps start right at the title baseline: touching, and descenders (g,j,p,y) on line 2 would overlap; 'drawn over' is overstated for my motion. 3+ line titles would collide fully (fixed y=28mm). Severity low.

**Evidence files**

[09-case-export.pdf](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/09-case-export.pdf), [09-case-export-pdf-header-crop.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/09-case-export-pdf-header-crop.png), [09-case-export-pdf-p4-crop.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/09-case-export-pdf-p4-crop.png), [09-case-export.pdf.render.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/09-case-export.pdf.render.png), [09-case-export.pdf.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/09-case-export.pdf.txt), [s4-case.pdf.text.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s4-case.pdf.text.json), [s4-case.pdf](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s4-case.pdf)


### journeys-14: Each AI run auto-saves research into the Library with duplicates, and Smart sort buries the student's own sources

**Severity:** low (reviewer said medium) · **Verdict:** partly · **Root cause:** `autosave-sources-no-dedupe`

**Where**

- Auto-save of discovered sources into the 'Auto-saved' folder (AI tool path; src/components/features/AutoSavedSourcesUndo.tsx)
- src/pages/LibraryPage.tsx:343-350 (Smart sort ranks semantic metadata first, so manual sources sink)
- src/pages/LibraryPage.tsx:39 (600 px inner scroll list)

**What the reviewer saw**

Starting from my 2 hand-added sources, one Brainstorm and one Generate grew the debate's Library to 12 sources. 19-slow-toggle.json lists 4 exact duplicates (same title and URL): 'Homework Statistics | 2026 Edition' x2, 'Homework Statistics 2026: Insights from 2,000+ UK Students' x2, 'Homework Effectiveness: What the Research Shows | Future Proof' x2, 'Should Homework Be Banned Statistics (2026)…' x2. The Current Debate page lists the duplicate too (09-current-debate.aria.txt). With the default 'Smart' sort, my own 'ZZ review pasted text' and the Wikipedia import are the last two rows. A source added right after (20-offline-add.png) was not visible in the list without scrolling. The Brainstorm result offered no 'Undo auto-saved sources' button. The undo that exists (AutoSavedSourcesUndo) removes all auto-saved sources in the debate, not just the latest run's. The AI agent may also cover auto-save itself; this is about the Library journey.

**Why it happens**

Auto-save does not dedupe by URL within the debate. Smart sort favours rows with semantic metadata, which only auto-saved research has.

**Suggested fix**

Dedupe auto-saved sources by normalised URL per debate (upsert, or skip when the origin already exists). Default the Library sort to 'Date added (newest)', or pin user-added sources first. After a manual add or import, scroll to and highlight the new row. Scope 'Undo auto-saved sources' to the run that created them.

**Who it hits**

Every student who runs more than one tool. Their Library fills with repeated web pages and the evidence they pasted themselves drops out of sight.

**Independent check**

Code confirms: autosaveDiscoveredSources (ai/client.ts:1238-1276) inserts every retained source with no check for an existing origin in the debate, and there is no unique constraint on sources (only source_folders unique). Smart sort (LibraryPage.tsx:355-360) ranks by semantic metadata, so manual sources without it sink. AutoSavedSourcesUndo removes all Auto-saved sources of the debate, not the last run. I could not reproduce actual duplicates: two Brainstorm runs on admin (with 3 active manual sources) auto-saved nothing, and pro/trial have no duplicate origins. Downgraded to low.

**Evidence files**

[19-slow-toggle.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/19-slow-toggle.json), [19-library-after-tools.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/19-library-after-tools.png), [09-current-debate.aria.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/09-current-debate.aria.txt), [20-offline-add.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/20-offline-add.png), [s6-brain.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s6-brain.json)


### journeys-15: No-debate states disagree across pages and lead to dead ends (Library Clear All error, 'no other debates', History with nothing to do)

**Severity:** low · **Verdict:** confirmed · **Root cause:** `no-debate-empty-states-inconsistent`

**Where**

- src/pages/LibraryPage.tsx:466-484 (debate notice) + 560-581 (Clear All enabled) + 868-886 (No Sources Yet) + 897-913 (Grounding Disabled)
- src/components/features/debate/DebateDialogs.tsx:49-51 ('You have no other debates yet.' when there are none at all)
- src/pages/HistoryPage.tsx:107-108,135 (falls back to One-off and unsorted with no Start debate path)

**What the reviewer saw**

24-empty-states.json and screenshots, admin with no debates. /app/library shows three empty messages at once: a dashed 'Select or create a debate…' box with Start debate and Switch debate, a dashed 'No Sources Yet. Add sources to ground AI responses…' box, and a 'Grounding Disabled' card. Add Source is disabled, but New folder and Clear All are enabled. Clear All > confirm gives 'Error: Failed to clear sources' (25-keyboard.json). Switch debate opens a dialog saying 'You have no other debates yet.' /app/history shows 'One-off and unsorted work: Nothing outside your debates' with no hint to start a debate. /app/debate uses the EmptyState component and Home a dashed card, while tool pages show an inline 'No current debate. Results stay one-off until you start one. Start debate' strip: four different patterns for the same state.

**Why it happens**

Each page added its own no-debate handling during the Current Debate rework, with no shared component.

**Suggested fix**

Create one NoCurrentDebate component (icon, title, one primary 'Start debate', a secondary 'Switch' only when debates.length > 0) and use it on Home, Current Debate, Library and History. When no debate exists, hide Library's toolbar, stats and grounding card. Change the copy to 'You have no debates yet' when the list is empty.

**Who it hits**

Brand-new users, who meet all of these screens in their first minutes.

**Independent check**

Admin with no debates on /app/library: three dashed/empty blocks at once (debate notice, 'No Sources Yet', 'Grounding Disabled'); Add Source disabled but Clear All and New folder enabled; Clear All > confirm -> toast 'Error / Failed to clear sources' plus console.error DebateRequiredError. Switch debate dialog says 'You have no other debates yet.' with zero debates. /app/history shows only 'One-off and unsorted work: Nothing outside your debates' with no Start debate path.

**Evidence files**

[24-empty_app_library.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/24-empty_app_library.png), [24-empty_app_history.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/24-empty_app_history.png), [24-empty_app_debate.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/24-empty_app_debate.png), [25-switch-no-debates.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/25-switch-no-debates.png), [25-keyboard.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/25-keyboard.json), [24-empty-states.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/24-empty-states.json), [s2-empty.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s2-empty.json), [s2-empty-library.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s2-empty-library.png), [s2-empty-library-clearall-toast.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s2-empty-library-clearall-toast.png), [s2-empty-switch-dialog.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s2-empty-switch-dialog.png), [s2-empty-history.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s2-empty-history.png)


### journeys-16: Form dialogs swallow input: Flowchart Add Node and Save silently do nothing when empty, Enter never submits, labels are unlinked

**Severity:** low · **Verdict:** confirmed · **Root cause:** `form-dialogs-no-form-semantics`

**Where**

- src/pages/FlowchartPage.tsx:317-318 (handleSaveNode returns silently on empty label)
- src/pages/FlowchartPage.tsx:359-361 (handleSaveFlowchart returns silently on empty title)
- src/pages/FlowchartPage.tsx:562-646 (no <form>, no Cancel, <Label> without htmlFor)
- src/locales/en.json:1491 (Save Flowchart title placeholder is 'Node title...')
- src/components/features/debate/DebateForm.tsx:63-72 (motion is a textarea: Enter inserts a newline)
- src/pages/LibraryPage.tsx:691-708 (manual source Title/Content labels unlinked; validation only via toast)

**What the reviewer saw**

15-flowchart2.json and 16-flowchart-save.json: Add Node with an empty label leaves the dialog open with no message (addEmptyDialogStillOpen: 1). Enter in the label field does not submit (enterSubmitsAddNode: false). Save Flowchart with an empty title does nothing (saveEmptyStillOpen: 1), and Enter does not submit (enterSubmitsSave: false). The title textbox's accessible name is its placeholder 'Node title...' (saveDialogAria), and neither dialog has a Cancel button. In the create-debate dialog, Enter after typing the motion added '\n' (02-tour-create.json afterEnter). Library manual-source fields have accessible names only from placeholders ('Source title...'), and an empty save shows only a toast 'Title and content are required'.

**Why it happens**

These dialogs are built from loose inputs and onClick handlers instead of a <form> with labelled fields and inline validation like DebateForm's.

**Suggested fix**

Wrap each dialog body in <form onSubmit> so Enter submits. Link Label htmlFor to the input ids. Disable the primary button until valid, or show an inline role=alert message. Add a Cancel button. Fix the placeholder to 'Flowchart name…'. For the motion field, submit on Enter (Shift+Enter for a newline) or collapse newlines in normalizeMotion.

**Who it hits**

Keyboard and screen-reader users and anyone in a hurry: a click that does nothing looks broken.

**Independent check**

Flowchart Add Node: empty submit leaves dialog open with no message; Enter in label input does not submit; no Cancel button. Save Flowchart: empty title does nothing; input has placeholder 'Node title...' and 0 associated labels. Create-debate motion textarea: Enter inserted a newline. Code: FlowchartPage.tsx:317-318, 359-361, 562-646 (no <form>, Label without htmlFor), en.json flowchart.titlePlaceholder='Node title...', LibraryPage.tsx:704-718 unlinked labels.

**Evidence files**

[15-add-empty.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/15-add-empty.png), [16-save-dialog.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/16-save-dialog.png), [16-flowchart-save.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/16-flowchart-save.json), [02-tour-create.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/02-tour-create.json), [04-library-empty-save.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/04-library-empty-save.png), [s3c-flows.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s3c-flows.json), [s3-flows.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s3-flows.json)


### journeys-17: Flowchart editing rough edges: duplicate Edit/Delete buttons, blank Type when editing the thesis, new nodes dropped on top of others, no page h1

**Severity:** low · **Verdict:** confirmed · **Root cause:** `flowchart-toolbar-duplicates-and-thesis-type`

**Where**

- src/pages/FlowchartPage.tsx:650-669 and 731-743 (two Edit and two Delete buttons when a node is selected)
- src/pages/FlowchartPage.tsx:614-625 (Type select has no 'thesis' option, so editing the thesis shows an empty trigger)
- src/pages/FlowchartPage.tsx:337-347 (new node position is random)
- src/pages/FlowchartPage.tsx:489 (title is a CardTitle h3; the page has no h1, unlike other tools)

**What the reviewer saw**

With 'Argument 1' selected, there are 2 'Edit' and 2 'Delete' buttons (editButtons: 2, deleteButtons: 2; 15-selected-duplicate-buttons.png). Editing the thesis shows an empty Type combobox (15-edit-thesis-dialog.png; aria 'combobox' with no value). The added 'ZZ review node' landed overlapping Argument 1 and 2 (15-selected-duplicate-buttons.png). The h1 list on /app/flowchart is just the header 'DebateLab' (14-flowchart.json). The sample thesis says 'Click to edit', but a single click only selects. On a phone the toolbar takes 3 rows and the canvas starts below the fold (21-m-flowchart.png).

**Why it happens**

Toolbar and selection panel were both given node actions, the thesis type was left out of the editor, and placement uses Math.random.

**Suggested fix**

Keep node actions in one place (the selection panel overlay from journeys-7). Show the type as read-only 'Thesis' when editing the thesis. Place new nodes below the selected node, or at the viewport centre offset from existing ones. Use an h1 page title like the other tools and change the thesis hint to 'Double-click to edit'.

**Who it hits**

Flowchart users; small but constant friction.

**Independent check**

With a node selected: 2 'Edit' and 2 'Delete' buttons (toolbar + Selected strip). Editing the thesis shows an empty Type combobox (text ''), as the Select has no 'thesis' item (FlowchartPage.tsx:614-625). New node position random (337-347). Page h1s: only 'DebateLab' (title 'Argument Flowchart' is a CardTitle).

**Evidence files**

[15-selected-duplicate-buttons.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/15-selected-duplicate-buttons.png), [15-edit-thesis-dialog.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/15-edit-thesis-dialog.png), [21-m-flowchart.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/21-m-flowchart.png), [14-flowchart.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/14-flowchart.json), [s3c-flows.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s3c-flows.json), [s3c-flowchart-node-selected.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s3c-flowchart-node-selected.png), [s3c-flowchart-edit-thesis.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s3c-flowchart-edit-thesis.png)


### journeys-18: Focus is not returned after closing the global debate dialogs

**Severity:** low · **Verdict:** confirmed · **Root cause:** `debate-dialog-focus-not-restored` · **Known in plan:** next-15 #14

**Where**

- src/components/features/debate/DebateDialogs.tsx:125-160 (opened from the store, not a DialogTrigger, so Radix has no element to return focus to)
- src/components/features/debate/CurrentDebateMenu.tsx:31-36

**What the reviewer saw**

25-keyboard.json: focused the header 'Start debate', pressed Enter (dialog opened), then Escape: document.activeElement became BODY. The same happened after closing Switch debate from the Library link (focusAfterEscSwitch: BODY). Keyboard users are thrown back to the top of the page.

**Why it happens**

Store-driven dialogs bypass Radix's trigger-based focus restoration.

**Suggested fix**

Record document.activeElement in openDialog and restore it in DialogContent onCloseAutoFocus (event.preventDefault(); saved?.focus()). Apply the same to DebateMotionGate.

**Who it hits**

Keyboard and screen-reader users of the most common dialog.

**Independent check**

Focused header 'Start debate', Enter opened dialog, Escape -> document.activeElement is BODY. DebateDialogs is store-driven with no DialogTrigger. knownInPlan next-15 #14.

**Evidence files**

[25-keyboard.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/25-keyboard.json), [s2-empty.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s2-empty.json)


### journeys-19: Exports leave out sections shown on screen, brainstorm files never name the motion, and filenames are inconsistent

**Severity:** low · **Verdict:** confirmed · **Root cause:** `exports-omit-case-sections`

**Where**

- src/lib/pdf-export-utils.ts:426-443 (only likelyArguments from predictedOpponentCase; no definitions, strategic weaknesses or key clashes)
- src/lib/export-utils.ts:30-196 (DOCX case: same omissions)
- src/lib/pdf-export-utils.ts:539+ and export-utils.ts:294+ (brainstorm title is 'Brainstorm Results' with no motion)
- src/components/features/ExportToolbar.tsx:60-67 (PDF/DOCX buttons have no busy state)

**What the reviewer saw**

Rendered and extracted both case exports (09-case-export.pdf.txt, 09-case-export.docx.txt): 0 matches for 'definition', 'weakness' and 'clash', while the on-screen case shows Key Definitions, Strategic Weaknesses and Key Clashes (09-case-loaded.aria.txt). The brainstorm PDF and DOCX titles say only 'Brainstorm Results' (09-brainstorm-export.pdf.txt). Filenames: 'DebateCase_pro.pdf' and 'DebateCase_pro.docx' (no motion or date, so a second export collides), 'BrainstormResults.pdf' vs 'Brainstorm_2026-10-08.docx' for the same result. Format prints as the raw 'CUSTOM'. The PDF took 1.1 s to download with no spinner or toast (09-history-export.json pdfMs 1120).

**Why it happens**

PDF, DOCX and the on-screen view each render the output schema independently, with separate filename helpers.

**Suggested fix**

Drive the PDF and DOCX from one ordered section list matching GenerateResults. Put the motion in every export title. Name files '<kind>-<motion-slug>-<YYYY-MM-DD>.<ext>' through one helper. Localise the format label. Show a spinner on the clicked export button while jsPDF/docx load.

**Who it hits**

Students who export to study or hand in: missing sections and files that are hard to tell apart.

**Independent check**

My seeded case had keyDefinitions, strategicWeaknesses ('ZZ weakness...') and keyClashes ('ZZ clash...'); none of them appear in the exported PDF or DOCX text (0 matches), while GenerateResults.tsx:300-361 renders them. Filenames 'DebateCase_pro.pdf' / 'DebateCase_pro.docx' (no motion/date); brainstorm 'BrainstormResults.pdf' vs 'Brainstorm_<date>.docx' (pdf-export-utils.ts:592, export-utils.ts:369). PDF subtitle prints raw 'CUSTOM'. PDF/DOCX buttons have no busy state (ExportToolbar.tsx:60-67).

**Evidence files**

[09-case-export.docx.render.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/09-case-export.docx.render.png), [09-brainstorm-export.pdf.render.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/09-brainstorm-export.pdf.render.png), [09-case-export.pdf.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/09-case-export.pdf.txt), [09-history-export.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/09-history-export.json), [09-case-loaded.aria.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/09-case-loaded.aria.txt), [s4-case.pdf.text.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s4-case.pdf.text.json), [s4-case.docx.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s4-case.docx.txt), [s4-case.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s4-case.json)


### journeys-20: History is hard to scan: always opens on Cases, no counts, every item titled with the motion, no Flowcharts tab, tabs hidden on mobile

**Severity:** low · **Verdict:** partly · **Root cause:** `history-layout-predates-current-debate`

**Where**

- src/pages/HistoryPage.tsx:136 (Tabs defaultValue="cases")
- src/pages/HistoryPage.tsx:137-144 (tab labels without counts; no flowcharts or crossfire)
- src/pages/CurrentDebatePage.tsx:44 (crossfire items listed without Load)
- src/pages/CurrentDebatePage.tsx:52-55 vs HistoryPage ('Load' text, 'Open …' aria-label, 'Resume' for chats)

**What the reviewer saw**

With only a brainstorm saved, History opened on 'Saved Cases: No saved cases' (07/09 runs). Tabs show no counts. On Pixel 7 the tab list scrolls (635 px content in a 380 px box), with 'Brainsto…' cut off and Factoids/Sparring hidden (21-m-history.png, tabsScroll [635,380]). Every case and brainstorm is titled 'ZZ review This House would ban homework', so two cases differ only by timestamp (11-cases-two.png). Saved flowcharts and crossfires have no History tab. The Current Debate page lists crossfire items with no way to open them. Side labels mix 'PRO/CON' (History badge, Brainstorm) with 'In favor/Against' (Current Debate) and 'Pro/Con' (Sparring), next to a 'Pro' plan badge.

**Why it happens**

History predates Current Debate and still uses a fixed per-kind tab layout with titles taken from the motion.

**Suggested fix**

Default to the first non-empty tab (or one 'All' list sorted by date), with counts on the tabs. Title items '<Kind> · <side> · <time>', or use the case thesis or top idea. Add Flowcharts and Crossfire. Use one side vocabulary (In favor / Against). On mobile, use a Select or wrapping chips instead of a horizontally scrolling tab bar.

**Who it hits**

Anyone returning to find earlier work, which is the point of History.

**Independent check**

Pixel 7, pro: History tablist scrollWidth 635 vs clientWidth 380; Brainstorms tab spans 301-432, Factoids 432-540, Sparring 540-647 on a 412px viewport, so they are cut/hidden; opens on Cases (Tabs defaultValue="cases", HistoryPage.tsx:136). No counts and no Flowcharts/Crossfire tab confirmed in code (137-144). The 'every item titled with the motion' and label-mix points are true but are copy/design nits.

**Evidence files**

[09-history-default.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/09-history-default.png), [21-m-history.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/21-m-history.png), [11-cases-two.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/11-cases-two.png), [21-mobile-a.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/21-mobile-a.json), [s7-mobile.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s7-mobile.json), [s7-pro-history-mobile.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s7-pro-history-mobile.png)


### journeys-21: Copy and naming a 15-year-old will stumble on

**Severity:** low · **Verdict:** partly · **Root cause:** `copy-glossary-inconsistent`

**Where**

- src/locales/en.json:1590,1638,1641,1656 ('Source Library', 'Your Knowledge Base', 'Synced folders', 'Grounding Disabled')
- src/pages/LibraryPage.tsx:750 ('{{n}} sources' not pluralised: '1 sources')
- src/pages/TimerPage.tsx speech labels ('Introductor', 'Conclusor')
- src/components/features/debate/CurrentDebateStrip.tsx ('Use once')
- src/pages/HomePage.tsx:156 (Home h1 is just 'DebateLab', duplicating the header h1)
- src/locales/en.json:2243 ('You have no other debates yet.')

**What the reviewer saw**

One place has four names: nav 'Library', h1 'Source Library', card 'Your Knowledge Base', and stats 'Synced folders' / 'Grounding Active/Disabled' (04-library-*.png). The badge reads '1 sources' (23-m-library-after-add.png). The Timer's English UI uses 'Introductor (4m)', 'Conclusor (3m)' and 'R1 - Rebuttal/Arg' (12-timer.aria.txt). The 'Working in:' strip offers 'Change' and 'Use once' with no explanation of one-off mode. Home's main heading is just 'DebateLab' (01-app-first.aria.txt), giving two identical h1s. The Library sheet's 'Use for AI grounding' needs Save, while the row toggle applies at once.

**Why it happens**

Copy written at different times by feature, with no glossary and some machine-like terms.

**Suggested fix**

Settle on 'Library' / 'Sources' everywhere. Replace 'Synced folders' with 'Folders' and 'Grounding' with 'Used by AI'. Use i18next plurals for the source count. Rename the speech labels for English (e.g. 'Opening', 'Rebuttal 1', 'Rebuttal 2', 'Closing'; keep the Spanish names in es). Explain 'Use once' with a tooltip ('Run without saving to this debate'). Give Home a real h1 such as 'What do you want to work on?'. Run the copy through the es and hu catalogs too.

**Who it hits**

All users; first impressions and comprehension.

**Independent check**

Confirmed: badge renders '1 sources' (admin mobile with a filter; LibraryPage.tsx:750 concatenates count + 'sources', not i18n plural). Library card 'Your Knowledge Base' vs nav 'Library' vs stat 'Synced folders' seen in screenshot; Timer uses 'Introductor (4m)' / 'Conclusor (3m)'; Home h1 'DebateLab' duplicates the header h1 (AppLayout.tsx:185 + HomePage.tsx:155). The rest is subjective copy taste.

**Evidence files**

[04-library-add-form.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/04-library-add-form.png), [23-m-library-after-add.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/23-m-library-after-add.png), [12-timer.aria.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/12-timer.aria.txt), [01-app-first.aria.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/01-app-first.aria.txt), [s7b.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s7b.json), [s7-admin-library-1-sources.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s7-admin-library-1-sources.png), [s7-pro-library-mobile-rows.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s7-pro-library-mobile-rows.png), [s3b-timer-after-escape.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s3b-timer-after-escape.png)


### journeys-22: Settings tells every user they 'Signed in with Google' and offers 'Set Up Billing' to Pro users who don't need it

**Severity:** low · **Verdict:** confirmed · **Root cause:** `settings-account-copy-assumes-google`

**Where**

- src/locales/en.json:456 (accountDesc: 'Signed in with Google. API keys are managed securely on the server.')
- src/pages/SettingsPage.tsx:297 (shown unconditionally)
- src/pages/SettingsPage.tsx:175-177 (Pro without Stripe gets the 'Set Up Billing' primary button)

**What the reviewer saw**

17-settings.png: the admin seed account (not a Google sign-in) and the expired account both show 'Signed in with Google. API keys are managed securely on the server.' (18-expired.json settingsSub). Demo-code and email-code users get the same false statement, plus jargon about API keys. A Pro account with no Stripe subscription (promo or demo-code lifetime Pro) sees a prominent blue 'Set Up Billing' button, inviting a student to pay for access they already have.

**Why it happens**

Static copy from when Google was the only sign-in method, and an upgrade CTA keyed only on tier.

**Suggested fix**

Read user.app_metadata.provider (google, email, or the demo marker) and say 'Signed in with Google/email/demo code'. Drop the API-key sentence. For Pro without Stripe billing, show 'Pro (no payment needed)' and no billing button.

**Who it hits**

Every signed-in user who opens Settings; confusing for demo-code event users in particular.

**Independent check**

Admin (email seed account, Pro without Stripe) /app/settings shows 'Signed in with Google...' and a 'Set Up Billing' button. en.json:456, SettingsPage.tsx:175-177,297.

**Evidence files**

[17-settings.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/17-settings.png), [18-expired-settings.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/18-expired-settings.png), [s2-empty.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s2-empty.json), [s2-settings-admin.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s2-settings-admin.png)


### journeys-23: Library toggles and adds wait on 2 to 3 sequential network round trips before anything changes on screen

**Severity:** low · **Verdict:** confirmed · **Root cause:** `getuser-network-fallback-local-only-writes`

**Where**

- src/lib/stores/session-store.ts:775-789 (toggleSource: getUser request, then PATCH, then set)
- src/lib/stores/session-store.ts:499-534 (addSource: getUser, folder upsert, insert)
- src/lib/stores/session-store.ts:288-291 (getUserId hits /auth/v1/user every time)

**What the reviewer saw**

In-page pointerdown-to-aria-checked timing for the source toggle: median about 80 ms on the VPS's fast link (72-105 ms, 10 samples, load avg 1.7; 05-library2.json). Under fast-4G emulation it was about 350 ms (339-379, 4 samples, load avg 4; 19-slow-toggle.json). The request log shows GET /auth/v1/user then PATCH /rest/v1/sources for every toggle, and GET user, POST source_folders, POST sources for every add (04-library.json reqs). On phone networks the switch visibly lags behind the finger.

**Why it happens**

Writes are pessimistic, and each one re-fetches the user over the network.

**Suggested fix**

Take the user id from the cached session (this also fixes journeys-1). Make toggleSource and removeSource optimistic, rolling back with an error toast on failure. Skip the source_folders upsert when the folder is already known locally.

**Who it hits**

Everyone using the Library on mobile networks; the lag is small but felt on every toggle.

**Independent check**

Every toggle issues GET /auth/v1/user then PATCH /rest/v1/sources before the switch changes. pointer-to-aria-checked: 88-125ms (median ~92) unthrottled, 333-347ms (median ~340) on emulated fast-4G (4 samples each, load avg 12.6). Code session-store.ts:775-789 (pessimistic, set() after the write), 288-291 getUserId hits the network every call. Same fix as journeys-1 (cached session user id) removes one round trip; optimistic update is the second part.

**Evidence files**

[05-library2.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/05-library2.json), [19-slow-toggle.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/19-slow-toggle.json), [04-library.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/04-library.json), [s8-toggle.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s8-toggle.json)


### journeys-24: Mobile Library rows cut titles to about 12 characters and the stat cards push the list below the fold

**Severity:** low · **Verdict:** confirmed · **Root cause:** `library-row-desktop-layout-on-phones`

**Where**

- src/pages/LibraryPage.tsx:72-77 (fixed h-[84px] row) and 81-93 (title truncate beside the badge)
- src/pages/LibraryPage.tsx:584-597 (three stat cards stack on mobile)

**What the reviewer saw**

On Pixel 7 (21-m-library-row.png) titles read 'Should Homewo', 'Homework Statis', 'ZZ review Home'' and 'ZZ review pas…': identical-looking rows cannot be told apart, including the duplicates from journeys-14. Three stacked stat cards ('Total sources', 'Active sources', 'Synced folders') plus the toolbar push the first source to roughly 800 CSS px down (23-m-library-after-add.png).

**Why it happens**

A desktop-first single-line row with a fixed height, and stats laid out as full-width cards on small screens.

**Suggested fix**

On mobile, let the title wrap to two lines (line-clamp-2) with the type badge on the meta line, and drop the fixed height. Collapse the stats into one compact line ('12 sources · 11 active') or hide them under sm.

**Who it hits**

Mobile Library users, the majority of students.

**Independent check**

Pixel 7 (412px), pro library: title spans are 114px visible vs 258-376px content ('The hidden cost', 'Air quality after t', 'Car-free cores: v'), hard-cut beside the URL badge; first row starts at 931px with an 839px viewport (stat cards + toolbar above). Code LibraryPage.tsx:72-93 fixed h-[84px] single-line row, 584-597 stacked stat cards.

**Evidence files**

[21-m-library-row.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/21-m-library-row.png), [21-m-library-full.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/21-m-library-full.png), [23-m-library-after-add.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/23-m-library-after-add.png), [s7-mobile.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s7-mobile.json), [s7-pro-library-mobile.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s7-pro-library-mobile.png), [s7-pro-library-mobile-rows.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s7-pro-library-mobile-rows.png)


### ai-surfaces-15: Web-search Ask warns 'Input was shortened' when only the server's research context was trimmed

**Severity:** low · **Verdict:** partly · **Root cause:** `ask-research-trim-reported-as-input-truncation`

**Where**

- supabase/functions/ai/features/ask.ts:81-90 (markTruncated when web-search or URL context exceeds its budget)
- supabase/functions/ai/index.ts:223, 266 (meta.truncated)
- src/lib/ai/client.ts:644-649 (toast aiClient.inputShortened)

**What the reviewer saw**

Real run, Citations + Web search, with a one-sentence question. It waited 80.6 s with only typing dots and then showed the toast 'Input was shortened — The request was too large, so only the portion that fit was sent to the AI.' The trimming happens on research text the server fetched itself, not on anything the student wrote.

**Why it happens**

One `truncated` flag covers both user-input truncation and server research trimming.

**Suggested fix**

Only set meta.truncated for user input (sanitizeInput). Report research trimming as a separate field, or not at all.

**Who it hits**

Students using web search think their question was cut off.

**Independent check**

Code confirms the mislabel: ask.ts:81-90 calls ctx.markTruncated() when the server's own web-search or URL context exceeds MAX_ASK_CONTEXT_LENGTH (32,000) minus the base prompt, index.ts:223/266 turns that into meta.truncated, and client.ts:644-649 shows 'Input was shortened ... only the portion that fit was sent'. Not reproduced in my one real run (Ask + Web search, 1 AI request): HTTP 200, meta had no truncated flag, no toast. So it only fires when research is large (up to 4 pages x 4,000 chars plus ranked results); frequency unknown.

**Evidence files**

[ask-web-desktop-DeepSeekV4Flash.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/ask-web-desktop-DeepSeekV4Flash.json), [ask-web-desktop-DeepSeekV4Flash-final-full.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/ask-web-desktop-DeepSeekV4Flash-final-full.png), [websearch-real.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/websearch-real.json)


### ai-surfaces-16: Whitespace-only input sends a paid AI request (Attack, Factoids); Generate/Brainstorm offer to create a debate for a blank motion

**Severity:** low · **Verdict:** confirmed · **Root cause:** `blank-input-not-trimmed`

**Where**

- src/lib/ai/schemas/attack.ts:5 and factoids.ts:6 (min(1) without trim)
- src/lib/ai/schemas/generate.ts:5 and brainstorm.ts:5
- supabase/functions/ai/features/attack.ts:19 (no server check for empty caseText)

**What the reviewer saw**

Simulated: the request was intercepted in the browser and never reached staging. Filling the field with 4 spaces and submitting:
- **Attack and Factoids:** an AI request was sent (requestSent true).
- **Generate and Brainstorm:** the motion gate opened 'This is a different motion' and offered 'Create a new debate for this motion' for the blank motion.

Empty input is blocked correctly ('Case text is required').

**Why it happens**

The zod schemas don't trim before min(1), and the server doesn't reject blank required fields.

**Suggested fix**

Use z.string().trim().min(1, t(...)) for motion, caseText and claim. Have the server return 400 for blank required fields before deep research.

**Who it hits**

Occasional wasted quota and a confusing dialog.

**Independent check**

Code: schemas use z.string().min(1) without trim (attack.ts:5, factoids.ts:6, generate.ts:5, brainstorm.ts:5); the server attack handler starts deep research on whatever caseText it gets (features/attack.ts:19-25). Reproduced (requests aborted in the browser): four spaces in Attack and in Factoids sent POST /functions/v1/ai with caseText/claim '    '; in Generate and Brainstorm four spaces opened 'This is a different motion ... Create a new debate for this motion' for the blank motion.

**Evidence files**

[sim-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/sim-desktop.json), [sim-generate-whitespace-desktop.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/sim-generate-whitespace-desktop.png), [sim-attack-whitespace-desktop.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/sim-attack-whitespace-desktop.png), [misc-tools.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/misc-tools.json), [ws-attack.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/raw/ws-attack.png), [ws-generate.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/raw/ws-generate.png)


### ai-surfaces-17: An oversized Ask message is rejected and the typed text is wiped

**Severity:** low · **Verdict:** confirmed · **Root cause:** `ask-optimistic-input-clear` · **Same fix as:** integrity-money-11

**Where**

- src/components/features/ask/AskChat.tsx:402-409 (clears the input and files before onSend validates)
- src/pages/AskPage.tsx:150-158 (size check returns after the input was cleared)

**What the reviewer saw**

Free test: the size check ran in the browser and no request was sent. A 60,000-character message produced the toast 'Message is too large — …shorten your question before sending.', and the input value length was then 0. The text the student was told to shorten is gone, and attachments are cleared too.

**Why it happens**

Optimistic clearing in handleSubmit, while validation happens later in AskPage.

**Suggested fix**

Validate size in AskChat before clearing (export isAskMessageWithinBudget), or have onSend return a result and clear only on acceptance.

**Who it hits**

A student pasting a long text loses it.

**Independent check**

Code: AskChat.tsx:402-409 clears input and files right after onSend; the size check runs later in AskPage.tsx:145-151. Reproduced: filled 60,000 chars and pressed Enter; toast 'Message is too large' appeared, input length after = 0, no stream call. Same cause and fix as integrity-money-11 (which rated it medium; low is fair for this oversize-only slice).

**Evidence files**

[ask-sim.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/ask-sim.json), [ask-sim-oversize.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/ask-sim-oversize.png), [ask-sim-desktop-all.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/ask-sim-desktop-all.json), [ask-desktop-oversize.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/raw/ask-desktop-oversize.png)


### ai-surfaces-18: Ask's 'Save' button shows during streaming, then vanishes; clicking it saves a second, unsorted copy without the answer

**Severity:** low · **Verdict:** confirmed · **Root cause:** `ask-manual-save-duplicates-auto-record`

**Where**

- src/components/features/ask/AskChat.tsx:536-541 (Save shown while onSaveChat is set and messages exist)
- src/pages/AskPage.tsx:395 (onSaveChat cleared once askChatId is set)
- src/lib/stores/session-store.ts:955-983 (saveCurrentChat inserts a chat with no debate_id and doesn't set askChatId)

**What the reviewer saw**

Simulated via route fakes. Clicking Save 1 s into a streamed reply wrote:
- chats (debate_id null) plus messages [user] only;
- then auto-record wrote chats (debate 5eed0001…) plus messages [user, assistant].

Afterwards the Save button was gone (visibleDuring true, visibleAfter false), so the header changes layout mid-conversation.

**Why it happens**

There are two save paths (manual saveCurrentChat and the automatic syncAskChat) that don't know about each other. Save visibility depends on whether the async auto-record has completed.

**Suggested fix**

Remove the manual Save in debate scope, since auto-recording already covers it. Otherwise make it call syncAskChat and disable it while streaming.

**Who it hits**

Duplicate, partial chats in History, and a header that jumps.

**Independent check**

Code: AskChat.tsx:536-541 shows Save whenever onSaveChat is set and messages exist; AskPage passes onSaveChat only until askChatId is set (AskPage.tsx:395); saveCurrentChat inserts a chat without debate_id and never sets askChatId (session-store.ts:955-983). Reproduced with fake SSE and faked writes: Save was visible mid-stream and gone after the answer (header layout changes). Clicking Save 1 s into the stream wrote POST chats x1 + POST messages x1 (user only), then auto-record wrote POST chats x1 + POST messages x2: two chats for one exchange.

**Evidence files**

[ask-save-sim.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/ask-save-sim.json), [ask-save-during-stream.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/ask-save-during-stream.png), [ask-sim-desktop-all.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/ask-sim-desktop-all.json)


### ai-surfaces-19: Streaming bubble polish: the finished answer blinks and re-enters; the caret sits on its own line

**Severity:** low · **Verdict:** confirmed · **Root cause:** `ask-stream-bubble-remount`

**Where**

- src/pages/AskPage.tsx:169-176 and 246-256 (streaming message id stream_N replaced by a new message id)
- src/components/features/ask/AskChat.tsx:88 (message-enter on every bubble mount) and :114-123 (caret after the Markdown block)
- src/index.css:676-689

**What the reviewer saw**

Real run. When the stream ended, the final bubble (865 px tall) restarted at opacity 0 with transform translateY(12px) scale(0.97) and faded back in over about 300 ms: the whole answer flashes once.

Caret mid-stream: top 319 px against the last block's bottom at 310 px (tag UL), so the caret renders on a new line under the text rather than at its end. The layout-shift entries during streaming come from the caret jumping between lines.

**Why it happens**

Completing a stream replaces the bubble with a new React key, which replays the entry animation. The caret is a sibling of the block-level markdown.

**Suggested fix**

Give the final message the same id as the streaming message (or skip message-enter for streamed messages). Render the caret inside the last markdown block, or use a CSS ::after on the last child.

**Who it hits**

Every streamed Ask answer: a visible flicker at the end, and a caret that looks detached.

**Independent check**

Code: the streaming bubble has id stream_N (AskPage.tsx:169-176) and the final message gets a new generateId() (session-store.ts:941-946), so MessageBubble remounts and replays message-enter (AskChat.tsx:88, index.css:676-689). The caret span sits after the ReactMarkdown block wrapper (AskChat.tsx:114-123), so it wraps to its own line. Reproduced with fake SSE: when the stream ended the final bubble was at opacity 0, matrix(0.97,0,0,0.97,0,12) and faded back over about 200 ms; mid-stream the caret top was 411 px against the last block (UL) bottom at 401 px.

**Evidence files**

[ask-long-desktop-default.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/ask-long-desktop-default.json), [ask-stream-long-desktop.webm](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/ask-stream-long-desktop.webm), [ask-sim-desktop-all.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/ask-sim-desktop-all.json), [ask-desktop-midstream.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/raw/ask-desktop-midstream.png), [ask-desktop-after-stream.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/raw/ask-desktop-after-stream.png)


### ai-surfaces-20: Crossfire: composer collapses while the AI thinks, the clock runs during AI latency, and the empty-transcript copy is stale

**Severity:** low · **Verdict:** confirmed · **Root cause:** `crossfire-composer-unmounts-while-pending`

**Where**

- src/pages/CrossfirePage.tsx:961-970 (pending status replaces the composer card)
- src/pages/CrossfirePage.tsx:424-428 (timer keeps ticking while request.status is pending)
- src/pages/CrossfirePage.tsx transcript empty state (setup copy shown after the round started)

**What the reviewer saw**

Real round:
- Submitting a question shrank the page by 201 px (trackMovement: container resize -201.3), because the composer card is swapped for the 'The coach is thinking…' line and comes back after the answer.
- The 3:00 timer dropped to 2:50 while the AI answered and kept running during the (simulated) failed turn, so AI latency and errors eat the student's crossfire time.
- The empty transcript of an active round read 'Set a resolution and an argument to start a focused cross-examination.'

**Why it happens**

The pending state is rendered instead of the composer, not inside it. The round clock is wall time with no pause for AI or error states.

**Suggested fix**

Keep the composer mounted and disable it, with the thinking line above it. Pause or exclude AI-pending and error time from the round clock, as Sparring does for voice. Show 'Ask your first question' copy once the round is active.

**Who it hits**

Each turn jumps the layout; slow models or errors shorten the student's practice round.

**Independent check**

Code: expectedUserTurnKind returns null unless request.status is idle (crossfire/reducer.ts:216-221), so the composer Card unmounts while pending or failed (CrossfirePage.tsx:961-1000); endsAt is fixed at start (reducer.ts:101) and the clock ticks regardless (CrossfirePage.tsx:421-425); the empty transcript always shows crossfire.emptyDesc. Reproduced with a faked 4 s crossfire reply: the page container shrank 201.3 px on submit, the input was gone while pending (count 0) and came back after; timer 3:00 -> 2:58 at submit -> 2:55 after the answer; the active round's empty transcript read 'Set a resolution and an argument to start a focused cross-examination.' The clock running during AI latency is arguably a design choice, but it does eat student time.

**Evidence files**

[crossfire.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/crossfire.json), [crossfire-strip.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/crossfire-strip.png), [crossfire-sim.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/crossfire-sim.json), [crossfire-active-empty.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/raw/crossfire-active-empty.png), [crossfire-pending.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/raw/crossfire-pending.png)


### a11y-i18n-11: Global focus ring and input focus border are 1.89:1 in light mode

**Severity:** low (reviewer said medium) · **Verdict:** confirmed · **Root cause:** `light-primary-token-too-light`

**Where**

- src/index.css:524-529 (:focus-visible box-shadow hsl(var(--primary)/0.5))
- src/index.css:620-623 (input/textarea/select:focus border primary/0.5 !important, glow 0.1)

**What the reviewer saw**

Measured on staging (footer 'Terms' link, which has no ring classes of its own): box-shadow 0 0 0 2px rgb(241,245,249), 0 0 0 4px rgba(2,132,197,0.5). Blended ring rgb(122,188,223) against the #f1f5f9 background = 1.89:1. Input focus border rgba(2,132,197,0.5) is also 1.89:1, and its 3px glow at 10% is nearly invisible. Dark mode ring = 3.01:1 (borderline pass). Elements with their own solid ring-ring classes (header controls) are fine.

**Why it happens**

The focus ring uses a 50%-alpha primary for a soft glow look.

**Suggested fix**

Use solid hsl(var(--ring)) for the 2px ring (keep the glow as an extra layer), and a solid --ring border plus a 2px ring for focused inputs. With the darker primary from a11y-i18n-2 this reaches more than 3:1.

**Who it hits**

Keyboard users in light mode struggle to see where focus is on links, cards and text fields (WCAG 1.4.11).

**Independent check**

Staging computed (trial /app footer 'Terms', light, after transition): box-shadow 0 0 0 2px rgb(241,245,249), 0 0 0 4px rgba(2,132,197,0.5) -> blended ring vs background 1.89:1 (dark 3.02:1). Focused Generate input: border rgba(2,132,197,0.5), glow 10%. src/index.css:524-529 and :620-623. Downgraded to low: many controls carry their own focus-visible:ring-ring classes; the half-alpha global ring is the fallback. Fix: solid hsl(var(--ring)) for the ring plus the darker primary from a11y-i18n-2; input focus also overlaps global-important-input-focus-style.

**Evidence files**

[global-focus-ring-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/misc/global-focus-ring-light.png), [global-focus-ring-dark.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/misc/global-focus-ring-dark.png), [focus-input-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/misc/focus-input-light.png), [s2-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s2-light.json), [s2-focusring-terms.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s2-focusring-terms.png)


### a11y-i18n-12: Flowchart node colours fail contrast in both themes (white on emerald 2.53:1, chips around 2:1)

**Severity:** low · **Verdict:** confirmed · **Root cause:** `flowchart-500-fills-white-text`

**Where**

- src/pages/FlowchartPage.tsx nodeColors and CustomNode (bg-emerald-500/red-500/blue-500 with text-white, opacity-80 descriptions, strength chips)
- /app/flowchart

**What the reviewer saw**

axe color-contrast on /app/flowchart: 25 nodes in light and 18 in dark. Examples: #fff on #10b981 2.53:1 (node titles), #cff1e6 on #10b981 2.09:1 (descriptions, opacity-80 at 12px), #fff on #ef4444 3.76:1, #fff on #3b82f6 3.67:1, chips #f8fafc on #40c79a 2.03:1, legend counters (text-emerald-600 on #dae0e8 2.83:1, text-amber on dark 3.39:1). Node descriptions are 9-12px.

**Why it happens**

Tailwind 500-level fills are used with white text and an opacity-reduced description.

**Suggested fix**

Use the 700-level fills (emerald-700, red-700, blue-700) or dark text on 100-level fills. Drop opacity-80 on descriptions and raise them to at least 12px.

**Who it hits**

Node labels are hard to read for low-vision users and on classroom projectors.

**Independent check**

axe on staging /app/flowchart (trial, light): 19 color-contrast nodes, e.g. legend counters text-emerald-600 on #dae0e8 2.83:1, amber 2.39:1, red-600 3.63:1, blue-600 3.89:1; white on emerald-500 computes to 2.54:1, red-500 3.76:1. FlowchartPage.tsx:94-99 nodeColors, :178 opacity-80 description.

**Evidence files**

[summary.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/axe/summary.txt), [trial-desktop-dark_app_flowchart.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/raw/axe/trial-desktop-dark_app_flowchart.png), [s2-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s2-light.json)


### a11y-i18n-13: Focus is not returned to the opener after controlled dialogs and sheets close

**Severity:** low · **Verdict:** confirmed · **Root cause:** `controlled-dialog-no-focus-return` · **Known in plan:** next-15 #14

**Where**

- src/components/features/debate/DebateContextControl.tsx:108-109 (Review sheet, controlled, no trigger)
- src/components/features/debate/DebateDialogs.tsx (Switch/Create debate dialogs opened from the Current debate popover)
- src/pages/LibraryPage.tsx (source viewer dialog opened from a row)

**What the reviewer saw**

Keyboard tests on staging (desktop and mobile). Generate → Review → Escape: focus BODY. Current debate → Switch debate → Escape: focus BODY. Library row Enter → viewer → Escape: focus BODY. Uncontrolled ones work: the Language dialog, Current debate popover and Flowchart Load dialog return focus to their trigger, and the mobile menu returns to 'Open menu'.

**Why it happens**

Dialogs opened through store state have no Radix Trigger, so Radix has nothing to restore focus to.

**Suggested fix**

Store the opener element (document.activeElement) when opening, and focus it in onCloseAutoFocus (event.preventDefault(); ref.focus()). For the popover → dialog hand-off, focus the Current debate trigger.

**Who it hits**

Keyboard and screen-reader users are thrown to the top of the page after every Review, switch or source view.

**Independent check**

Reproduced (trial, desktop): Generate -> Review (Enter) -> Escape: activeElement BODY. Current debate popover -> Switch debate (Enter) -> Escape: BODY. Library row viewer (opened by keyboard) -> Escape: BODY. DebateContextControl.tsx:105-108 opens a controlled Sheet with no Trigger; no onCloseAutoFocus anywhere in src.

**Evidence files**

[dialogs-desktop.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/keyboard/dialogs-desktop.txt), [kb-switch-dialog-mobile.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/keyboard/kb-switch-dialog-mobile.png), [s2-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s2-light.json), [s3.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s3.json)


### a11y-i18n-14: No skip link: 8 Tab stops before page content on every app route

**Severity:** low · **Verdict:** confirmed · **Root cause:** `no-skip-link` · **Known in plan:** next-15 #14

**Where**

- src/components/layout/AppLayout.tsx:176-291 (no skip link before the header; <main> has no id)

**What the reviewer saw**

The keyboard walk on 9 routes starts logo → Home → Current debate → Library → History → Language → Theme → Settings before reaching content (8 stops). meta.skipLink was false on all 84 scanned pages.

**Why it happens**

Not implemented.

**Suggested fix**

Add a visually-hidden-until-focus 'Skip to content' link (translated) as the first child of AppLayout and the landing layout, targeting <main id='main' tabIndex={-1}>.

**Who it hits**

Keyboard users repeat 8 tabs on every page.

**Independent check**

Reproduced: Tab from the top of /app/generate visits DebateLab logo, Home, Current debate, Library, History, Language, Toggle theme, Settings (8 stops) before the page's first control; no skip link in the DOM. AppLayout.tsx:176-291, <main> at :291 has no id.

**Evidence files**

[walk-trial-desktop.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/keyboard/walk-trial-desktop.json), [s3.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s3.json)


### a11y-i18n-15: Placeholder text is the same colour as typed text, so empty fields look filled

**Severity:** low · **Verdict:** confirmed · **Root cause:** `theme-tokens-accent-muted-misassigned`

**Where**

- src/index.css:30 (light --muted-foreground 222 47% 11% equals --foreground) and :99 (dark --muted-foreground equals foreground)
- All inputs/textareas using placeholder:text-muted-foreground (login email, Attack textarea, Library fields)

**What the reviewer saw**

Computed on staging /app/generate: ::placeholder color rgb(15,23,41) equals the input text color rgb(15,23,41). In screenshots the login placeholder 'te@pelda.hu' and the Attack textarea placeholder look like entered values.

**Why it happens**

--muted-foreground was set equal to --foreground (likely to pass contrast), which removes all secondary-text hierarchy.

**Suggested fix**

Restore a distinct --muted-foreground of about 4.6:1 (e.g. light 215 19% 35%, dark 215 20% 70%), or at least give placeholders their own colour.

**Who it hits**

Students may skip a field that looks prefilled, or think an example motion is real input.

**Independent check**

Staging computed: /login email ::placeholder rgb(15,23,41) equals the input text colour rgb(15,23,41); same on the focused Generate input. src/index.css:30 light --muted-foreground 222 47% 11% = --foreground, dark :99 same. Screenshot: 'you@example.com' reads like a typed value.

**Evidence files**

[anon-desktop-hu_login.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/raw/i18n/anon-desktop-hu_login.png), [trial-laptop-hu_app_attack.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/raw/i18n/trial-laptop-hu_app_attack.png), [s1-signed-out.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s1-signed-out.json), [s1-login-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s1-login-light.png), [s2-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s2-light.json)


### a11y-i18n-16: Horizontal overflow at 320px: Current debate side cards (+69px) and Settings 'Upgrade to Pro' clipped

**Severity:** low · **Verdict:** confirmed · **Root cause:** `grid-items-min-width-auto-blowout`

**Where**

- src/pages/CurrentDebatePage.tsx:156,161 (grid gap-6 md:grid-cols-2 with no grid-cols-1/min-w-0; ItemRow truncate cannot shrink)
- src/pages/SettingsPage.tsx:204 (flex justify-between without wrap)
- /app/debate, /app/settings at 320px width

**What the reviewer saw**

At 320x640 (WCAG reflow width), /app/debate documentElement.scrollWidth = 389. The In favor, Against and Sources cards run off the right edge, with the '2 items' badge and 'Library' button clipped. /app/settings overflows by 14px and the 'Upgrade to Pro' button reads 'Upgrade to Pr'. Other routes checked (/app, generate, library, timer, flowchart, crossfire, sparring) do not overflow.

**Why it happens**

An implicit auto grid track grows to the min-content width of non-shrinking text, and the subscription row does not wrap.

**Suggested fix**

Use grid-cols-1 md:grid-cols-2 (minmax(0,1fr)) or add min-w-0 to the Cards. Add flex-wrap gap-3 to SettingsPage.tsx:204.

**Who it hits**

Users at 400% zoom or on very small phones get sideways scrolling and clipped controls.

**Independent check**

Staging at 320x640 (trial): /app/debate documentElement.scrollWidth 387 (cards In favor/Against/Sources/Recent run off the right edge), /app/settings 334. CurrentDebatePage.tsx:156,161 grid without grid-cols-1/min-w-0; SettingsPage.tsx:204 flex justify-between without wrap. 320px only (WCAG reflow); common 360+ phones were not measured here.

**Evidence files**

[reflow-320-debate-side-card.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/misc/reflow-320-debate-side-card.png), [reflow-320_app_settings.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/misc/reflow-320_app_settings.png), [s2-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s2-light.json), [s2-320-app-debate.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s2-320-app-debate.png), [s2-320-app-settings.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s2-320-app-settings.png)


### a11y-i18n-17: Heading and landmark structure: two h1s per app page, h1 skips to h3, no page h1 on Flowchart, no <main> on login/404/share

**Severity:** low · **Verdict:** confirmed · **Root cause:** `heading-landmark-structure`

**Where**

- src/components/layout/AppLayout.tsx:185 (h1 'DebateLab' in the header on every app page)
- src/components/ui/card.tsx:17-19 (CardTitle renders h3)
- src/pages/FlowchartPage.tsx (no h1)
- src/pages/LoginPage.tsx:149, src/pages/NotFound.tsx:7, src/pages/SharedPage.tsx:101-110 (no <main>; share error has no h1)

**What the reviewer saw**

Every app route has h1 'DebateLab' plus the page h1; /app has 'DebateLab' twice. axe heading-order (moderate) on all 14 app routes and '/' (CardTitle h3 directly under h1). /app/flowchart has only the header h1. axe landmark-one-main and region on /login, /zz-review-404 and /share/<bad>, plus page-has-heading-one on the share error state. AUD-001 fixed only the landing page.

**Why it happens**

The brand text is marked up as h1, and the card titles use a fixed h3.

**Suggested fix**

Change the header brand to a <span> or <p>. Make CardTitle accept an `as` prop (default h2) or render page section titles as h2. Give Flowchart an h1. Wrap Login, NotFound and the share states in <main>, and use an h1 in the share error card.

**Who it hits**

Screen-reader heading navigation is noisy and starts at the brand on every page.

**Independent check**

Staging: every app route has h1 'DebateLab' (AppLayout.tsx:185) plus the page h1; /app has two 'DebateLab' h1s; /app/flowchart has only the header h1 (no page h1 in FlowchartPage.tsx). axe heading-order on all 12 app routes scanned and on '/' (CardTitle renders h3, card.tsx:17-19). /login, /zz-review-404 and /share/<bad>: landmark-one-main + region; share error state page-has-heading-one (its only heading is h3 'Shared Content'). /login does have an h1 (AUD-003 fixed), so only the <main> part applies there.

**Evidence files**

[summary.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/axe/summary.txt), [s1-signed-out.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s1-signed-out.json), [s2-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s2-light.json)


### a11y-i18n-18: Client-side navigation gives no feedback to screen readers (focus stays on the link, title unchanged, nothing announced)

**Severity:** low · **Verdict:** confirmed · **Root cause:** `no-route-change-focus-announcement`

**Where**

- src/App.tsx:189-198 (RouteContent: no focus or announcement on pathname change)
- src/components/loading/RouteSkeleton.tsx:208 (announces only while a lazy chunk loads)

**What the reviewer saw**

On staging, focus the 'Library' nav link on /app and press Enter. The URL becomes /app/library, focus stays on the 'Library' link, document.title stays 'DebateLab', and a MutationObserver on all aria-live/status regions recorded 0 updates. The RouteSkeleton live text only appears the first time a chunk loads.

**Why it happens**

No route-change focus management.

**Suggested fix**

On pathname change in RouteContent, move focus to the page h1 (tabIndex=-1) or <main>, and/or announce the translated page name in a persistent sr-only polite region. Pair with the per-route title in a11y-i18n-8.

**Who it hits**

Screen-reader users cannot tell that a page changed.

**Independent check**

Reproduced: focus 'Library' nav link on /app, Enter -> URL /app/library, activeElement still 'A Library', title 'DebateLab', 0 mutations on aria-live/status/alert regions. App.tsx:185-198 RouteContent has no focus/announce logic.

**Evidence files**

[dialogs-desktop.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/keyboard/dialogs-desktop.txt), [s2-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s2-light.json)


### a11y-i18n-19: Brainstorm result cards show the raw enum 'strong / moderate / weak' in every language

**Severity:** low · **Verdict:** confirmed · **Root cause:** `brainstorm-strength-enum-untranslated`

**Where**

- src/components/features/brainstorm/BrainstormResults.tsx:50-53 ({strength} rendered directly)

**What the reviewer saw**

In the live Hungarian Brainstorm result (UI hu, output hu), each idea card shows a translated side badge ('MELLETTE', 'ELLENE', 'SEMLEGES') next to an English 'strong' or 'moderate' badge. Translations already exist for strength levels elsewhere (sourceQuality.levels.*).

**Why it happens**

An enum value is rendered without t().

**Suggested fix**

Render t(`brainstormResults.strength.${strength}`) and add en/es/hu keys (Erős, Mérsékelt, Gyenge / Fuerte, Moderada, Débil).

**Who it hits**

Every es/hu Brainstorm result shows English words in its top-5 cards.

**Independent check**

Code: BrainstormResults.tsx:39,51-53 renders idea.strength raw; prompt schema fixes it to English enum strong|moderate|weak (supabase/functions/_shared/prompts/brainstorm.ts:32), so it is English in every UI language. Not reproduced live to save AI budget; the code path is deterministic.

**Evidence files**

[ai-hu-result.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/i18n/ai-hu-result.png)


### a11y-i18n-20: Hungarian and Spanish catalogs copy English Title Case (194 hu, 203 es strings)

**Severity:** low · **Verdict:** confirmed · **Root cause:** `hu-es-catalog-title-case`

**Where**

- src/locales/hu.json (e.g. nav.howItWorks 'Hogyan Működik', faq.title 'Gyakran Ismételt Kérdések', historyPage 'Mentett Esetek', attack.emptyTitle 'Kegyetlen Mód', libraryPage.addSource 'Forrás Hozzáadása', 'Összes Törlése')
- src/locales/es.json (e.g. 'Preguntas Frecuentes', 'Cómo Funciona', 'Tu Caso Te Espera')

**What the reviewer saw**

A catalog scan counted multi-word strings in which every word of 3+ letters is capitalized: 194 in hu and 203 in es, including landing CTAs and headings, tool titles and toasts. Both languages use sentence case, so these read as machine translations. They are visible in the hu screenshots (Attack form, Library, History).

**Why it happens**

Translations followed the English capitalization.

**Suggested fix**

Convert hu and es values to sentence case (proper nouns excepted) in one catalog pass. A small lint in the i18n catalog check could flag 2+ capitalized words.

**Who it hits**

Every hu/es user, including on the landing page, sees non-native capitalization.

**Independent check**

Own scan of src/locales: 211 hu and 228 es short strings where every 3+ letter word is capitalised (a few false positives like 'Google Docs'). Examples: hu 'Hogyan Működik' (hu.json:19), 'Generálás Sikertelen', 'Kegyetlen Mód'; es 'Cómo Funciona' (es.json:19), 'Tu Caso Te Espera'.

**Evidence files**

[trial-laptop-hu_app_attack.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/raw/i18n/trial-laptop-hu_app_attack.png), [hu-import-error-raw-english.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/i18n/hu-import-error-raw-english.png)


### a11y-i18n-21: 404 page: grey slate-400 slab, 1.6:1 link in light mode, full-reload link to the marketing home

**Severity:** low · **Verdict:** confirmed · **Root cause:** `theme-tokens-accent-muted-misassigned`

**Where**

- src/pages/NotFound.tsx:7-13 (bg-muted, text-primary link, <a href='/'>)
- src/index.css:29 (light --muted 215 20% 65% = #94a3b8)

**What the reviewer saw**

In light mode the whole page is #94a3b8. axe measures the 'Return to Home' link #0284c5 on #94a3b8 at 1.6:1, and in dark #35bdf8 on #637288 at 2.27:1. The link is a plain <a href='/'> (full reload) and sends signed-in users to the landing page instead of /app. There is no <main> and the h1 is just '404'.

**Why it happens**

The page uses the --muted token, which in this theme is a mid-grey, as a page background.

**Suggested fix**

Use bg-background, a <main>, an h1 carrying the message, and a router <Link> to /app when signed in (/ otherwise), styled as a button.

**Who it hits**

Anyone following a stale link sees an unpolished, hard-to-read page.

**Independent check**

Staging /zz-review-404 light: page background rgb(148,163,184) (bg-muted = 215 20% 65%), 'Return to Home' #0284c5 on #94a3b8 = 1.6:1 (axe), plain <a href='/'> (full reload to the landing page even when signed in), no <main>. NotFound.tsx:7-13.

**Evidence files**

[anon-mobile-light_zz-review-404.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/raw/axe/anon-mobile-light_zz-review-404.png), [s1-signed-out.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s1-signed-out.json), [s1-404-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s1-404-light.png)


### a11y-i18n-22: History tabs are clipped mid-word on phones with no scroll affordance (worse in hu/es)

**Severity:** low · **Verdict:** confirmed · **Root cause:** `history-tabs-overflow-no-affordance`

**Where**

- src/pages/HistoryPage.tsx:137 (TabsList w-full justify-start overflow-x-auto)

**What the reviewer saw**

Pixel 7 English: tabs read 'Cases, Chats, Attacks, Brainsto…' cut at the edge. iPhone SE Hungarian: 'Esetek, Chatek, Támadá…', with Ötletelések, Tények and Vitapárbaj up to 373px off-screen. Spanish on Pixel 7: 'Lluvias de Ideas', 'Datos' and 'Sparring' off-screen. There is no fade, arrow or wrap to show more tabs exist.

**Why it happens**

A horizontally scrolling tab list with no affordance and no responsive layout.

**Suggested fix**

Wrap the tabs (flex-wrap h-auto), switch to a Select below sm, or add edge fade masks and scroll the active tab into view.

**Who it hits**

Mobile users may never find the Brainstorm, Facts or Sparring history.

**Independent check**

Staging English: Pixel 7 tablist scrollWidth 635 vs clientWidth 380, iPhone SE 635 vs 288; 'Brainsto' cut at the edge, Factoids and Sparring off-screen, no fade/arrow. HistoryPage.tsx:137. Hungarian/Spanish not re-measured (they are longer, so worse).

**Evidence files**

[trial-small-mobile-hu_app_history.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/raw/i18n/trial-small-mobile-hu_app_history.png), [trial-mobile-light_app_history.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/raw/axe/trial-mobile-light_app_history.png), [s3.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s3.json), [s3-history-tabs-mobile.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s3-history-tabs-mobile.png), [s3-history-tabs-small-mobile.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s3-history-tabs-small-mobile.png)


### a11y-i18n-23: Accessible names do not contain the visible label (WCAG 2.5.3)

**Severity:** low · **Verdict:** confirmed · **Root cause:** `aria-label-diverges-from-visible-text`

**Where**

- src/pages/CurrentDebatePage.tsx:53-56 (visible 'Load', aria-label 'Open {{title}}')
- src/components/features/debate/CurrentDebateMenu.tsx:47-55 (mobile trigger aria-label 'Current debate: motion' vs visible 'Current debate' + motion)
- src/pages/TimerPage.tsx:372 (reset button named 'R to reset')

**What the reviewer saw**

axe label-content-name-mismatch (serious): 16 nodes on /app/debate, and the mobile Current debate trigger on all 14 app routes (mobile). The Timer reset icon button reuses the keyboard hint as its name ('R to reset' / 'R az újraindításhoz').

**Why it happens**

aria-label strings were written independently of the visible text.

**Suggested fix**

Use 'Load {{title}}' (visible word first) or drop aria-label and add sr-only context. Name the mobile trigger by its visible text only. Give the reset button its own key (timer.reset 'Reset timer').

**Who it hits**

Voice-control users saying 'click Load' fail; screen-reader users hear odd names.

**Independent check**

axe label-content-name-mismatch (an experimental axe rule): 4 nodes on /app/debate ('Load' buttons named 'Open {{title}}', CurrentDebatePage.tsx:53-56) and the mobile Current debate trigger on Pixel 7 and iPhone SE (aria-label 'Current debate: <motion>' vs visible text, CurrentDebateMenu.tsx:47-55). Timer reset icon button is named 'R to reset' (TimerPage.tsx:372 reuses timer.resetKey, en.json:1426), confirmed in DOM. Low practical impact except the reset name.

**Evidence files**

[summary.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/axe/summary.txt), [s2-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s2-light.json), [s3.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s3.json)


### a11y-i18n-24: Other contrast failures: destructive buttons, blue-500 badges and the active timer format tab

**Severity:** low · **Verdict:** confirmed · **Root cause:** `tailwind-500-fills-and-destructive-token`

**Where**

- src/index.css:35-36 (--destructive/-foreground)
- /app/settings ('Free Trial' badge, white on #3b82f6 3.67:1)
- /app/timer active format tab (bg-blue-500)
- /app/library Clear All (text-destructive)
- /app/flowchart React Flow attribution (target-size)

**What the reviewer saw**

axe color-contrast. Settings destructive buttons (Delete All My Data, Delete account): light #fef1f1 on #db2424 4.44:1, dark #fef1f1 on #ef4343 3.43:1. Settings trial badge 3.67:1. Timer active tab: light #f0f9ff on #3b82f6 3.45:1, dark #082c45 on #3b82f6 3.92:1. Library 'Clear All' #db2424 on #f1f5f9 4.46:1. axe target-size flags the React Flow attribution link.

**Why it happens**

Tailwind 500-level fills and a slightly light destructive token.

**Suggested fix**

Darken the destructive token slightly (light 0 72% 45%, dark 0 70% 45%) and use blue-700 or the primary token for the badge and timer tab.

**Who it hits**

Low-vision users; small margin misses.

**Independent check**

axe on staging (trial, light): Settings 'Free Trial' badge #fff on #3b82f6 3.67:1, Settings destructive buttons #fef1f1 on #db2424 4.44:1, Timer active format tab #f0f9ff on #3b82f6 3.45:1, Library 'Clear All' #db2424 on #f1f5f9 4.46:1, React Flow attribution 52x12 target-size. Light destructive is a near miss (4.44 vs 4.5); dark computed 3.43:1.

**Evidence files**

[summary.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/axe/summary.txt), [s2-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s2-light.json)


### a11y-i18n-25: Ask chat scroll area cannot be reached by keyboard

**Severity:** low · **Verdict:** confirmed · **Root cause:** `ask-scroll-viewport-not-focusable`

**Where**

- src/components/features/ask/AskChat.tsx (Radix ScrollArea viewport)
- /app/ask

**What the reviewer saw**

axe scrollable-region-focusable (serious) on the Radix ScrollArea viewport (overflow: hidden scroll) on all 4 combos. The keyboard walk shows the viewport is not a Tab stop, and its content has no focusable children when the chat holds plain text.

**Why it happens**

The ScrollArea viewport is not focusable.

**Suggested fix**

Add tabIndex={0}, role='log' (or 'region') and an aria-label to the chat viewport so keyboard users can scroll long answers.

**Who it hits**

Keyboard-only users cannot scroll back through long coaching answers without a mouse.

**Independent check**

axe scrollable-region-focusable 1 on staging /app/ask (trial, light). AskChat.tsx:336 and :546 use Radix ScrollArea without a focusable viewport.

**Evidence files**

[summary.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/axe/summary.txt), [s2-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s2-light.json)


### a11y-i18n-26: No language switcher on /login, and first visits ignore the browser language

**Severity:** low · **Verdict:** confirmed · **Root cause:** `login-no-language-control`

**Where**

- src/pages/LoginPage.tsx (no LanguageSwitcher)
- src/i18n.ts:10-15 (lng 'en', no detection)
- src/lib/stores/settings-store.ts:208-209 (default language 'en')

**What the reviewer saw**

/login renders a bare card with no language control and no way back to the landing page (screenshot). grep finds no navigator.language or detector, so a Hungarian browser (locale hu-HU) gets English on a first visit until the user finds the globe on the landing navbar.

**Why it happens**

Language comes only from localStorage or the server.

**Suggested fix**

Add the LanguageSwitcher (and a home link) to the login card. Default a first visit to navigator.languages when it matches hu or es (product decision).

**Who it hits**

Hungarian and Spanish students opening a shared /login link see English with no way to switch.

**Independent check**

Staging /login (signed out): buttons are only Continue with Google, Email, Demo code, Send code; 0 links (no home link, no language switcher). Code: LoginPage.tsx has no LanguageSwitcher; src/i18n.ts:10-15 lng 'en', no navigator.language use anywhere in src; settings-store.ts:207 default 'en'. Browser-language default is a product decision.

**Evidence files**

[anon-desktop-hu_login.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/raw/i18n/anon-desktop-hu_login.png), [s1-signed-out.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s1-signed-out.json), [s1-login-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-C/s1-login-light.png)


### a11y-i18n-27: 'One-off results appear here' copy does not match behaviour: one-off results are not saved (borderline, journeys lane)

**Severity:** low · **Verdict:** partly · **Root cause:** `one-off-copy-promises-saving`

**Where**

- src/locales/en.json debate.unsortedEmptyDesc ('One-off results and older unsorted work appear here.')
- src/pages/BrainstormPage.tsx:44-47 (recordResult only when debateId is set)

**What the reviewer saw**

After a one-off Brainstorm on trial, History → 'One-off and unsorted work' still shows 'Nothing outside your debates. One-off results and older unsorted work appear here.' The result was only kept in local state.

**Why it happens**

Copy promises persistence that one-off mode does not provide.

**Suggested fix**

Change the empty-state copy (all three locales) to say one-off results are not saved, or persist one-off results with debate_id null.

**Who it hits**

Students expect to find a one-off result later and cannot.

**Independent check**

Code: Generate/Brainstorm/Attack/Factoids record a result only when debateId is set (GeneratePage.tsx:93, BrainstormPage.tsx:45, AttackPage.tsx:45, FactoidsPage.tsx:44), so their one-off results never reach History -> 'One-off and unsorted work', while UnsortedWork.tsx:105 says 'One-off results … appear here'. Partly: sparring sessions keep debateId null in one-off mode (sparring-store.ts:336), so some one-off work can appear; 'older unsorted work' is also accurate. Not reproduced live (would cost an AI call). Copy fix in en/es/hu is enough.

**Evidence files**

[leftover-check-history-oneoff.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/raw/leftover-check-history-oneoff.png)


### a11y-i18n-29: Small i18n strays: Sonner 'Notifications alt+T', hu 'AI' vs 'MI', English decimal point, fixed-width selects truncating Hungarian

**Severity:** low (reviewer said nit) · **Verdict:** confirmed · **Root cause:** `i18n-strays-library-defaults-and-tight-select-widths`

**Where**

- src/components/ui/sonner.tsx:13 (no containerAriaLabel)
- src/locales/hu.json langSwitcher.description/outputLanguage use 'AI' while 58 other strings use 'MI' (Settings says 'MI Kimeneti Nyelv', the dialog says 'AI kimenet nyelve')
- src/components/features/generate/GenerateResults.tsx:76, src/components/features/ask/AskChat.tsx:292 (toFixed gives '2.5' in hu/es)
- src/pages/LibraryPage.tsx:496 (w-[160px] folder filter shows 'Minden…'); Brainstorm side/format selects show 'Mindkét Oldal…', 'Az 5 Legjobb…'

**What the reviewer saw**

The toaster region aria-label is 'Notifications alt+T' with html lang=hu. The hu Language dialog screenshot shows 'AI kimenet nyelve'. The hu Library screenshot shows the folder filter truncated to 'Minden…'. The hu Brainstorm screenshot shows truncated select values.

**Why it happens**

Library defaults, inconsistent terminology, locale-unaware number formatting and fixed widths.

**Suggested fix**

Pass containerAriaLabel={t('common.notifications')}. Use 'MI' in langSwitcher.*. Format durations with formatNumber/Intl (maximumFractionDigits). Use min-w or w-auto on the selects.

**Who it hits**

Polish for hu/es users.

**Independent check**

Adam, all four symptoms are real on 40738ea and on staging. I checked three of them in a fresh harness session and the toFixed one from code only (I spent no AI). (1) Sonner: src/components/ui/sonner.tsx passes no containerAriaLabel, and sonner 2.0.8 builds the label as `${containerAriaLabel} ${hotkeyLabel}`. Signed out at / with hu and es, the label reads 'Notifications alt+T' while html lang is hu/es (signedout-i18n.json). Correction: there is no `common.notifications` key in any locale, so the fix needs a new key in all three files. (2) AI vs MI: hu.json has 58 strings with 'MI' and 5 with 'AI'. Only langSwitcher.description and langSwitcher.outputLanguage are in scope; the three workspaces.* strings belong to the hidden Workspace. hu-language-dialog.png shows the dialog's 'AI kimenet nyelve' and the hero's 'MI-alapú' on one screen. Settings uses 'MI Kimeneti Nyelv' (Title Case), so match the casing too. (3) Decimals, from code: GenerateResults.tsx:76 formats with toFixed into '{{value}} mp', which gives '2.5 mp' where Hungarian expects '2,5 mp'. AskChat.tsx:292 also hardcodes the unit 's' (hu should be 'mp'), so that spot has an untranslated unit as well as the wrong decimal mark. formatNumber already exists in src/lib/date-format.ts:88. I saw no saved result with a duration on Generate or Ask, so this part is code-verified, not seen in the browser. (4) Selects, measured as scrollHeight/scrollWidth against client size on the SelectValue span. Library folder filter (LibraryPage.tsx:496, w-[160px]) is a real fixed width: 'Minden mappa' (hu) and 'Todas las carpetas' (es) are clipped at every width I tried (375, 412, 768, 1024, 1280); 'All folders' (en) fits at 65px. Brainstorm is NOT a fixed-width problem, so the suggested min-w/w-auto will not fix it. The triggers are w-full inside `sm:grid-cols-2` (BrainstormForm.tsx:93). At lg (1024px and wider) the page's two-column layout puts the form in a card about 375px wide, so each select is 167px. English fits ('Explore Both Sides' at 123px). hu ('Mindkét Oldal Vizsgálata', 'Az 5 Legjobb Szög') and es ('Explorar Ambos Lados', 'Top 5 Mejores Ángulos') wrap to a second line, are clamped with an ellipsis, and the clipped value sits about 19px further right than the English one, a side effect of `[&>span]:line-clamp-1`. From 375 to 900px nothing clips. Fix: drop to one column when the card is narrow (for example `sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2`, or a container query), or use shorter strings. Rated low rather than nit: the truncation hits the two main Brainstorm controls on every desktop viewport and the Library filter at every width, in two of three languages. Related, outside the claim: 'Szög' is a geometric 'angle' calque (also in the empty-state 'Kreatív Szögek Feloldása'), and the hu strings use English-style Title Case.

**Evidence files**

[switch-dialog-Magyar.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/i18n/switch-dialog-Magyar.png), [hu-import-error-raw-english.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/i18n/hu-import-error-raw-english.png), [ai-hu-result.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/i18n/ai-hu-result.png), [signedout-i18n.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-4/signedout-i18n.json), [hu-language-dialog.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-4/hu-language-dialog.png), [es-language-dialog.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-4/es-language-dialog.png), [selects-measure.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-4/selects-measure.json), [selects-measure-en.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-4/selects-measure-en.json), [hu-library-folder-filter-412.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-4/hu-library-folder-filter-412.png), [hu-library-folder-filter-1280.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-4/hu-library-folder-filter-1280.png), [es-library-folder-filter-1280.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-4/es-library-folder-filter-1280.png), [hu-brainstorm-selects-1280.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-4/hu-brainstorm-selects-1280.png), [es-brainstorm-selects-1280.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-4/es-brainstorm-selects-1280.png), [en-brainstorm-selects-1280.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-4/en-brainstorm-selects-1280.png), [hu-brainstorm-selects-768.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-4/hu-brainstorm-selects-768.png)


### journeys-25: Tour completion is stored per browser only

**Severity:** nit · **Verdict:** confirmed · **Root cause:** `onboarding-state-device-scoped`

**Where**

- src/hooks/use-onboarding.ts:13-26 (persisted to localStorage 'debate-trainer-onboarding' only)
- src/App.tsx:201-210

**What the reviewer saw**

The completion flag lives only in localStorage and survives sign-out (17-settings-signout.json lsKeysAfter still includes debate-trainer-onboarding). An experienced student gets the full tour again on every new device or browser. A new student on a shared school computer where someone else finished the tour never sees it.

**Why it happens**

The onboarding state is device-scoped, not account-scoped.

**Suggested fix**

Store hasCompletedOnboarding in user_settings (already hydrated on sign-in) and key the local cache by user id.

**Who it hits**

Shared school computers and multi-device students.

**Independent check**

Code: use-onboarding.ts persists hasCompletedOnboarding only in localStorage 'debate-trainer-onboarding', not keyed by user; nothing removes it on sign-out (no matches in sign-out paths). Not browser-tested.

**Evidence files**

[17-settings-signout.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/17-settings-signout.json)


### journeys-26: Login page has no way back to the site and uses a generic sparkle icon instead of the DebateLab logo

**Severity:** nit · **Verdict:** confirmed · **Root cause:** `login-page-outside-public-layout`

**Where**

- src/pages/LoginPage.tsx (no logo link, no footer, no <main> landmark)

**What the reviewer saw**

After Sign out the app lands on /login (17-after-signout.png). The card shows a sparkle icon (the header uses the DebateLab tree logo), with no link to the home page, Terms or Privacy, and no <main> element (locator('main') timed out on /login in 17-settings-signout run). Signing out gives no confirmation; the page just changes.

**Why it happens**

The login page is a standalone card outside the public layout.

**Suggested fix**

Wrap it in <main>, use the real logo linked to '/', add a Terms and Privacy footer, and after sign-out show a 'You've signed out' line.

**Who it hits**

Everyone signing out on a shared device; minor brand inconsistency.

**Independent check**

Signed-out /login: 0 <main>, 0 links, 0 images; icon is lucide Sparkles (LoginPage.tsx:9,154), not the logo. #115 added only the h1.

**Evidence files**

[17-after-signout.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/journeys/raw/17-after-signout.png), [s7-mobile.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/s7-mobile.json), [s7-login.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-A/raw/s7-login.png)


### ai-surfaces-21: Export details: inconsistent file names, English-only and incomplete Generate clipboard, missing success toasts

**Severity:** nit · **Verdict:** partly · **Root cause:** `export-naming-and-feedback-inconsistent`

**Where**

- src/lib/pdf-export-utils.ts:446, 527, 592, 653
- src/components/features/generate/GenerateResults.tsx:89-107 (clipboard labels THESIS/FRAMEWORK/CONTENTION/Reasoning/Evidence/Impact; omits predicted opponent case, exordio and rebuttals)
- src/components/features/factoids/FactoidsResults.tsx:194-200 and GenerateResults handlePdfExport (no success toast)

**What the reviewer saw**

Downloads:
- PDF names: 'DebateCase_pro.pdf', 'AttackAnalysis_22.pdf' (22 is the critique score), 'BrainstormResults.pdf', 'ResearchFactoids.pdf'.
- DOCX names include the date ('Attack Analysis_2026-10-08.docx').

The Generate clipboard (simulated result) is 8,418 characters with English labels whatever the UI language. Attack and Brainstorm show 'exported to PDF!' toasts; Factoids and Generate PDF show none.

**Why it happens**

Each export was written separately, with no shared naming or feedback helper.

**Suggested fix**

Use one helper: `<Tool>_<motion-slug>_<YYYY-MM-DD>.<ext>`, and the same success or failure toast for every export. Use i18n labels in the clipboard text and include every section.

**Who it hits**

Minor confusion in students' Downloads folders, plus inconsistent feedback.

**Independent check**

Confirmed: PDF names DebateCase_<side>.pdf, AttackAnalysis_<score>.pdf, BrainstormResults.pdf, ResearchFactoids.pdf (pdf-export-utils.ts:446, 527, 592, 653); DOCX names differ (export-utils.ts:184 DebateCase_<suffix>.docx, 282/369/444 <Tool>_<date>.docx). On staging, Generate PDF downloaded 'DebateCase_pro.pdf' and DOCX 'DebateCase_pro.docx', neither with a success toast; the clipboard text uses hard-coded English labels and omits the predicted opponent case and exordio (GenerateResults.tsx:89-107). Correction: the DOCX name is 'AttackAnalysis_<date>.docx' (no space), and the Generate DOCX has no date.

**Evidence files**

[attack-default.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/attack-default.json), [factoids-default.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/factoids-default.json), [generate-export-sim.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/generate-export-sim.json), [misc-tools.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-B/misc-tools.json)


### a11y-i18n-28: debate.counts has no plural forms: '1 sources · 1 outputs' (en) and '1 fuentes · 1 resultados' (es)

**Severity:** nit · **Verdict:** confirmed · **Root cause:** `debate-counts-no-plural`

**Where**

- src/locales/en.json and es.json debate.counts
- src/pages/HomePage.tsx:136, src/pages/CurrentDebatePage.tsx:118, src/components/features/debate/CurrentDebateMenu.tsx:66

**What the reviewer saw**

Rendered through i18next with the repo catalogs: en '1 sources · 1 outputs', es '1 fuentes · 1 resultados'. hu '1 forrás · 1 eredmény' is correct (Hungarian does not inflect after numerals). Every other {{count}} key does have _one/_other variants (en 1 item, 1 message, 1 word all correct), so this is the only plural gap.

**Why it happens**

Two counts in one string, interpolated as plain variables.

**Suggested fix**

Split into debate.sourceCount and debate.outputCount with count-based _one/_other keys and join them.

**Who it hits**

Any debate with exactly one source or output.

**Independent check**

Catalog: en.json:2251 '{{sources}} sources · {{outputs}} outputs', es.json:2251 same shape, plain variables, no _one/_other; hu is fine.

**Evidence files**

[plural.mjs](/tmp/claude-1000/-home-codex-Projects-DebateLab/d2a5d372-2159-4dd7-985d-8ec353fdd260/scratchpad/review/a11y-i18n/plural.mjs)


### a11y-i18n-30: English startup shell and offline page; ~180 ms of English UI on a fresh device for hu users

**Severity:** nit · **Verdict:** confirmed · **Root cause:** `language-unknown-until-js-and-server-settings` · **Known in plan:** next-15 #15 (offline page)

**Where**

- index.html:150-155 ('Loading DebateLab', aria-label 'DebateLab is loading', lang='en')
- public/theme-init.js:6-9 ('Unable to load DebateLab', 'Reload')
- public/sw.js:79 (English offline page)

**What the reviewer saw**

Flash timing on staging with trial set to hu server-side. With hu cached locally (returning device): html lang en→hu at 194 ms, the English 'Loading DebateLab' shell shows from 198 to 229 ms, and no English UI text paints. With nothing cached (fresh device): the English UI paints at 473 ms and switches to Hungarian at 655 ms (about 180 ms of English) after hydrateFromServer. Single measurements at load average about 2.3.

**Why it happens**

Static HTML is English-only, and on a new device the language is only known after the server settings load.

**Suggested fix**

Have theme-init.js also read debate-trainer-settings.state.language, set documentElement.lang and swap the shell text from a three-language map. Localize the sw.js offline page.

**Who it hits**

A brief English flash for hu/es users, mainly on new devices.

**Independent check**

Adam, the code lines are confirmed: index.html:152-153 is the English 'Loading DebateLab' shell under <html lang=en>, public/theme-init.js:7-9 is the English bootstrap-error card, and public/sw.js:79 is the English offline page. knownInPlan (next-15 #15, plan line 137) covers only the sw.js offline page, not the shell or theme-init. Measurement: pro on desktop /app, with GET user_settings rewritten to language hu in my own browser and every non-GET to user_settings aborted (none were attempted). 3 runs per scenario, load average 2.9-3.5. (A) Device with en cached, server says hu: English app UI ('Home Start debate Library History') painted, then switched to Hungarian; the English window was 607, 114 and 43 ms, median 114 ms (the reviewer's 180 ms is within that range). The flip trails the user_settings response by 25-50 ms, so the window is the user_settings round trip after React's first paint. This happens for real after an OAuth redirect to /app on a new device, when the language was changed on another device, or after cleared storage. (B) Returning device with hu cached: the English 'Loading DebateLab' shell shows for about 150-180 ms with lang=en (179-357, 250-408, 264-412 ms). lang then flips to hu about 30-50 ms before the shell is replaced, so English text briefly sits under a Hungarian lang. No English app UI paints. The reviewer's theme-init fix (read the cached language, set lang, swap the shell text) covers only case B and does nothing for the case A window. Related, not a new finding: nothing reads navigator.language (i18n.ts sets lng 'en' and the settings store defaults to 'en'), so a first-time hu visitor gets English everywhere until they choose Magyar. A navigator.language default is the only lever for fresh devices. Code-level only, not measurable on staging because seed.mjs:234 gives the seeded pro a grace period until 9999: for a real Stripe pro user (tier pro, no grace), settings-store.ts hydrateFromServer awaits canAccessProModels (getUser plus a subscriptions query, serially) before applyAppLanguage. That adds two round trips to the case A window, and a null result from either returns early, so that session never applies the server language, theme or feature configs. Apply the language as soon as the settings data arrives.

**Evidence files**

[flash-log.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/a11y-i18n/i18n/flash/flash-log.txt), [flash-pro.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-4/flash-pro.json), [flash-pro-log.txt](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/verify-ux-4/flash-pro-log.txt)


### ai-surfaces-13: Sparring 'Category balance' radar was drawn as a small misplaced shape right after judging (observed once)

**Severity:** refuted (not a real problem) (reviewer said medium) · **Verdict:** refuted

**Where**

- src/components/features/sparring/SparringScorecard.tsx:89-99 (ResponsiveContainer > RadarChart with animated Radar)
- src/pages/SparringPage.tsx:52 (scorecard enters with motion-swap)

**What the reviewer saw**

Live round on desktop, screenshot about 3 s after the verdict: both data polygons appear as a ~50 px diamond to the left of the polar grid, near the 'Strategy' label, instead of over it.

Reopening the same round from History rendered correctly twice: desktop grid x=888 w=182 with polygons at x=906–1048, and mobile likewise (`history-*.json`). So it is tied to the first render after judging. I observed it once and have no reproduction rate.

**Why it happens**

Suspected: Recharts Radar animation started while the ResponsiveContainer was being measured or resized during the round-to-scorecard swap, leaving the polygons at the first measured geometry.

**Suggested fix**

Set isAnimationActive={false} on both Radar series (or key the chart on the measured width), and/or mount the chart after the motion-swap entrance ends.

**Who it hits**

The payoff screen of a sparring round can show a broken chart.

**Independent check**

Not reproduced. The reviewer saw it once and reopening the round rendered correctly. Code (SparringScorecard.tsx:89-99) is a standard Recharts ResponsiveContainer/RadarChart inside a motion-swap entrance; a mid-animation or resize race is plausible but there is no deterministic repro, and getting a fresh judged scorecard needs a full real Sparring round (several AI calls) or a hand-built session plus faked judge response, which I did not build. Default to refuted per the brief; the suggested isAnimationActive={false} is a cheap hardening if someone sees it again.

**Evidence files**

[sparring-scorecard-top.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/sparring-scorecard-top.png), [history-desktop-light.json](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/history-desktop-light.json), [history-sparring-radar-desktop-light.png](/home/codex/Projects/DebateLab/.verify/ultracode-review-2026-10-08/ai-surfaces/raw/history-sparring-radar-desktop-light.png)

