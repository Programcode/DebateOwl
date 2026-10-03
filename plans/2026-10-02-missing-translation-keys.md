# Missing translation keys

**Status:** Backlog. Found on 2026-10-02 by the agentic Hungarian checks (`agentic/hungarian.e2e.ts`). Recheck the list against current source before starting.

## Problem

Components call `t('some.key', 'English fallback')`, but 88 of those literal keys are in no catalog. i18next then renders the inline English fallback, so Spanish and Hungarian users see English in toasts, confirmation dialogs, Library folder actions, Flowchart controls, the Google Drive dialog, and more. `src/test/i18n.test.ts` cannot catch this: it compares key sets between catalogs, and these keys are missing from all three.

The agentic suite found the first four on every main page (`themeToggle.toggle`, `sparring.setup.speakingOrder`, `modelSelector.label`, `modelSelector.selectFor`), and they are fixed. A scan of `src/` for literal `t()` keys absent from `src/locales/en.json` (plural `_one`/`_other` forms count as present) finds the rest.

## Plan

1. Add a unit test next to `src/test/i18n.test.ts` that scans `src/` (excluding `src/test/`) for literal `t('a.b')` keys and fails when one is missing from `en.json`, allowing plural suffixes. Dynamic keys such as ``t(`nav.${x}`)`` are out of its reach.
2. Add every missing key to `en.json` with the current fallback text, then to `es.json` and `hu.json` with real translations. Keep the inline fallbacks or drop them, but do it consistently.
3. Verify with the unit test, `e2e/hungarian-parity.spec.ts`, and `verify.sh e2e run agentic/hungarian.e2e.ts`. For toasts and dialogs the main-page checks never open, also run `verify.sh e2e explore "Use the Library, History and Flowchart and report any English text" --session student --agent hungarian`.

## Missing keys (88, listed per file)

- `src/components/OfflineIndicator.tsx`: `offlineIndicator.label`
- `src/components/ThemeToggle.tsx`: `themeToggle.current`
- `src/components/features/ExportToolbar.tsx`: `common.discuss`
- `src/components/features/ask/AskChat.tsx`: `askChat.save`
- `src/components/features/brainstorm/BrainstormResults.tsx`: `brainstormResults.noIdeasDesc`, `brainstormResults.noIdeasTitle`
- `src/components/features/export/GoogleDriveAuthModal.tsx`: `googleDriveAuth.connect`, `googleDriveAuth.description`, `googleDriveAuth.failedDesc`, `googleDriveAuth.failedTitle`, `googleDriveAuth.redirecting`, `googleDriveAuth.scopeNote`, `googleDriveAuth.title`
- `src/components/features/factoids/FactoidsResults.tsx`: `factoidsResults.noVerified`, `factoidsResults.useSuggestion`
- `src/components/features/generate/GenerateResults.tsx`: `generateResults.copiedToClipboard`, `generateResults.copyFailed`, `generateResults.undo`
- `src/pages/AskPage.tsx`: `ask.chatSaved`, `ask.chatSavedDesc`, `ask.retryableFailedDesc`, `ask.saveFailed`, `ask.saveFailedDesc`, `common.retry`
- `src/pages/AttackPage.tsx`: `attack.complete`, `attack.completeDesc`
- `src/pages/BrainstormPage.tsx`: `brainstorm.complete`, `brainstorm.completeDesc`
- `src/pages/FactoidsPage.tsx`: `factoids.complete`, `factoids.completeDesc`, `factoids.saveFailed`
- `src/pages/FlowchartPage.tsx`: `flowchart.autoLayout`, `flowchart.edgeAttack`, `flowchart.edgeRebuttal`, `flowchart.edgeSupport`, `flowchart.exportFailedToast`, `flowchart.selectedNode`
- `src/pages/GeneratePage.tsx`: `ask.saveFailed`, `ask.saveFailedDesc`, `generate.caseTitle`, `generate.complete`, `generate.completeDesc`, `generate.noUndo`, `generate.regenerateUnavailable`, `generate.regenerateUnavailableDesc`, `generate.regenerated`, `generate.regeneratedDesc`, `generate.saveCase`, `generate.undone`, `generate.undoneDesc`
- `src/pages/HistoryPage.tsx`: `common.deleted`, `historyPage.caseDeleted`, `historyPage.deleteCaseDesc`, `historyPage.deleteCaseTitle`, `historyPage.deleteFailed`
- `src/pages/LibraryPage.tsx`: `common.clear`, `common.copied`, `common.copy`, `common.deleted`, `libraryPage.activateFolder`, `libraryPage.clearSuccess`, `libraryPage.copyFailed`, `libraryPage.deactivateFolder`, `libraryPage.deleteFolderDesc`, `libraryPage.deleteFolderTitle`, `libraryPage.deleteSourceDesc`, `libraryPage.deleteSourceTitle`, `libraryPage.folderActions`, `libraryPage.folderActionsDesc`, `libraryPage.folderActivated`, `libraryPage.folderActivatedDesc`, `libraryPage.folderDeactivated`, `libraryPage.folderDeactivatedDesc`, `libraryPage.folderDeleted`, `libraryPage.folderDeletedDesc`, `libraryPage.folderMergeConfirm`, `libraryPage.folderRenamed`, `libraryPage.folderRenamedDesc`, `libraryPage.noMatchingSources`, `libraryPage.noMatchingSourcesDesc`, `libraryPage.renameFolder`, `libraryPage.sourceCopied`, `libraryPage.sourceDeleted`, `libraryPage.sourceUpdated`, `libraryPage.sourceUpdatedDesc`, `libraryPage.typeLabel`, `libraryPage.untitledSource`, `libraryPage.useForGrounding`, `libraryPage.useForGroundingDesc`
- `src/pages/TimerPage.tsx`: `timer.disableSound`, `timer.enableSound`
