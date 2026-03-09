# Execution Log: Phase 6 — Question Chaining + History

## T001: Chain Resolver + Hook Cache

**Started**: 2026-03-08T00:25Z
**Completed**: 2026-03-08T00:28Z

Created `chain-resolver.ts`:
- `buildChainIndex(items)`: single O(N) scan → `parentToChildren` + `childToParent` maps (DYK-01)
- `resolveChain(questionId, items, fetchQuestion?)`: walks backwards to root, forward to leaves. Visited set for circular ref protection. MAX_CHAIN_DEPTH=50.
- `isPartOfChain(questionId, items)`: cheap boolean check for chain indicator
- `getPreviousQuestionId(question)`: convenience accessor

Added to hook (`use-question-popper.tsx`):
- `chainCacheRef = useRef<Map>()` cleared on refetch (DYK-04)
- `fetchSingleQuestion(id)` for API fallback
- `getChain(questionId)` exposed in context value

## T002: QuestionChainView

**Completed**: 2026-03-08T00:29Z

Created `question-chain-view.tsx`:
- Vertical timeline with turn connectors (colored dots per status)
- Current question highlighted with blue background + ring
- Loading spinner while chain resolves (DYK-05)
- Markdown description shown only for current turn
- Answer/clarification shown for resolved turns

## T003: QuestionHistoryList

**Completed**: 2026-03-08T00:30Z

Created `question-history-list.tsx`:
- `HistoryItemRow`: compact one-line rows — status dot, type pill (Q/A), source, truncated text, time-ago, expand chevron (DYK-02)
- `HistoryItemDetail`: expanded view with full text, markdown description, answer form for pending, chain view for chained questions
- Expand/collapse via click toggle

## T004: Enhance Overlay Panel with Tabs

**Completed**: 2026-03-08T00:31Z

Modified `question-popper-overlay-panel.tsx`:
- Added Outstanding / History tab toggle
- DYK-03: Smart tab default — Outstanding if `outstandingCount > 0`, else preserve last tab via `lastTabRef`
- Outstanding tab renders QuestionCards/AlertCards (existing behavior)
- History tab renders QuestionHistoryList
- Passes `getChain` and `allItems` to QuestionCard for chain support

## T005: Update QuestionCard with Chain Indicator

**Completed**: 2026-03-08T00:31Z

Modified `question-card.tsx`:
- Added "↩ follow-up" badge when `previousQuestionId` is set
- Added "View Thread" / "Hide Thread" toggle button when `isPartOfChain()` is true
- Expands `QuestionChainView` inline when toggled
- New optional props: `getChain`, `allItems` (backwards compatible)

## T006: Tests

**Completed**: 2026-03-08T00:32Z

Created `chain-resolver.test.tsx` — 10 tests:
- `buildChainIndex`: bidirectional maps, empty for unchained items (2 tests)
- `isPartOfChain`: detects parent and child membership (1 test)
- `resolveChain`: linear chain, standalone, missing links, API fallback, circular refs, root-forward (6 tests)
- `QuestionHistoryList`: compact rows expand on click (1 test)
- All tests have 5-field Test Docs

## Evidence

- Biome lint: clean (0 errors in our files)
- Tests: 5130 passed, 80 skipped (10 new from this phase)
- 360 test files passed, 10 skipped
