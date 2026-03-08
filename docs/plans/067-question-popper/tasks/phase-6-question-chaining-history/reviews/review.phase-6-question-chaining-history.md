# Code Review: Phase 6: Question Chaining + History

**Plan**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md
**Spec**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/question-popper-spec.md
**Phase**: Phase 6: Question Chaining + History
**Date**: 2026-03-08
**Reviewer**: Automated (plan-7-v2)
**Testing Approach**: Lightweight

## A) Verdict

**REQUEST_CHANGES**

Blocking issues remain in the Phase 6 history experience, and the supporting test/domain artifacts are not yet synchronized with what shipped.

**Key failure areas**:
- **Implementation**: Expanded history entries do not show the thread for root questions that already have follow-up children, so AC-27 is incomplete.
- **Domain compliance**: `question-popper/domain.md` and the plan Domain Manifest are not fully updated for the new Phase 6 files and capabilities.
- **Testing**: AC-25 still has no concrete verification evidence, and the new UI coverage is too shallow to prove the thread/history behaviors end-to-end.
- **Doctrine**: `test/unit/question-popper/chain-resolver.test.tsx` uses `vi.fn()` despite the repository's fakes-only testing rule, and the targeted Biome check is not clean.

## B) Summary

Phase 6 adds the planned chain/history surfaces and does not appear to reinvent an existing domain capability, but it is not review-ready yet. The most important defect is in historical question expansion: root questions with descendants do not render their conversation thread because `QuestionHistoryList` only shows `QuestionChainView` when `previousQuestionId` is present. The overlay is also still backed by `/api/event-popper/list` without overriding the route's default `limit=100`, so AC-26 fails once a workspace grows beyond 100 events. Testing evidence is partial: the targeted resolver test passes, but there is still no direct proof for AC-25 and the changed test file violates the repo's no-mocks doctrine. Domain documentation was only partially updated; `docs/domains/question-popper/domain.md` and the plan's Domain Manifest are out of sync with the new Phase 6 files.

## C) Checklist

**Testing Approach: Lightweight**

- [x] Core validation tests present
- [ ] Critical paths covered
- [ ] Key verification points documented

Universal (all approaches):
- [x] Only in-scope files changed
- [ ] Linters/type checks clean
- [ ] Domain compliance checks pass

## D) Findings Table

| ID | Severity | File:Lines | Category | Summary | Recommendation |
|----|----------|------------|----------|---------|----------------|
| F001 | HIGH | /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/components/question-history-list.tsx:193-214 | correctness | Historical root questions hide their conversation thread because history detail only renders `QuestionChainView` for follow-up nodes. | Render thread UI for any question that participates in a chain, not only nodes with `previousQuestionId`. |
| F002 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/hooks/use-question-popper.tsx:121-133 | correctness | The history tab fetches `/api/event-popper/list` without overriding the route's default `limit=100`, so older items disappear once the workspace exceeds 100 events. | Back history with a complete-history fetch (`limit=all`/paging) before populating `items`. |
| F003 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/chain-resolver.test.tsx:204-244<br/>/Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-6-question-chaining-history/execution.log.md:71-75 | testing | Phase 6 still lacks direct evidence for AC-25 and only has shallow UI coverage for the thread/history behaviors. | Add explicit component/integration coverage for `QuestionChainView`, `QuestionCard` thread toggle, History tab behavior, and follow-up notification behavior, then record the actual command output. |
| F004 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/chain-resolver.test.tsx:147-163 | doctrine | The new resolver test uses `vi.fn().mockResolvedValue(...)`, which violates the repository's fakes-only testing rule; the same file also fails the targeted Biome check. | Replace the mock with a small hand-rolled async fake, assert via captured state, and re-run Biome on the changed Phase 6 files. |
| F005 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md:34-82,98-139 | domain-md | The domain reference still omits the new chain/history pieces from Composition, Concepts, and Source Location. | Update `question-popper/domain.md` to document `chain-resolver.ts`, `QuestionChainView`, `QuestionHistoryList`, and the hook/history capabilities introduced in Phase 6. |
| F006 | MEDIUM | /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md:67-103 | orphan | The plan Domain Manifest does not map the new resolver file or its Phase 6 test file, so changed-file traceability is incomplete. | Add explicit Domain Manifest entries (or a covering glob) for `chain-resolver.ts` and `chain-resolver.test.tsx`. |

## E) Detailed Findings

### E.1) Implementation Quality

- **F001 (HIGH)** — `/Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/components/question-history-list.tsx:193-214`
  - `HistoryItemDetail` computes `hasChain` as `!!item.question.previousQuestionId`, then only renders `QuestionChainView` when that value is true.
  - That means expanding the first/root question in a thread never shows its descendants, even though the root is part of the conversation chain.
  - This is a direct AC-27 miss because the historical detail view is supposed to show the conversation chain for questions.

- **F002 (MEDIUM)** — `/Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/hooks/use-question-popper.tsx:121-133`
  - `fetchItems()` still calls `/api/event-popper/list` with no query string.
  - The list route documents a default limit of 100 items, so the History tab silently truncates older entries once the dataset grows beyond that window.
  - No material auth, input-validation, or cross-domain import regressions were found in the Phase 6 source changes.

### E.2) Domain Compliance

| Check | Status | Details |
|-------|--------|---------|
| File placement | ✅ | New Phase 6 files live under `apps/web/src/features/067-question-popper/` and `test/unit/question-popper/`, which matches the `question-popper` domain. |
| Contract-only imports | ✅ | No cross-domain internal import violations were found in the Phase 6 source changes. |
| Dependency direction | ✅ | The business domain continues to consume infrastructure (`@chainglass/shared`, route helpers, fetch/SSE) without introducing infra → business dependencies. |
| Domain.md updated | ❌ | `docs/domains/question-popper/domain.md` has the Phase 6 history row, but Composition/Concepts/Source Location are not synchronized with the new chain/history files. |
| Registry current | ✅ | No new domain was introduced in Phase 6, and `docs/domains/registry.md` remains correct for the existing `question-popper` registration. |
| No orphan files | ❌ | The plan Domain Manifest still omits `apps/web/src/features/067-question-popper/lib/chain-resolver.ts` and `test/unit/question-popper/chain-resolver.test.tsx`. |
| Map nodes current | ✅ | Phase 6 did not add a new domain or a new cross-domain contract edge, so the existing topology remains valid for this phase. |
| Map edges current | ✅ | No new inter-domain edges were added, and no unlabeled edge was introduced by the Phase 6 changes. |
| No circular business deps | ✅ | No new business → business dependency was introduced. |
| Concepts documented | ⚠️ | A Concepts table exists, but it does not yet cover the new history/thread entry points (`getChain`, history browsing, thread rendering). |

- **F005 (MEDIUM)** — `/Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md:34-82,98-139`
  - The document records Phase 6 in History but still describes the pre-Phase-6 UI surface.
  - The missing entries make it harder to understand the new chain/history behavior from the domain definition alone.

- **F006 (MEDIUM)** — `/Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md:67-103`
  - The Domain Manifest is missing explicit mappings for the new resolver file and the Phase 6 test file.
  - That breaks the intended file → domain traceability for this review.

### E.3) Anti-Reinvention

| New Component | Existing Match? | Domain | Status |
|--------------|----------------|--------|--------|
| `chain-resolver.ts` | None | — | ✅ Proceed |
| `question-chain-view.tsx` | None | — | ✅ Proceed |
| `question-history-list.tsx` | None | — | ✅ Proceed |

### E.4) Testing & Evidence

**Coverage confidence**: 41%

| AC | Confidence | Evidence |
|----|------------|----------|
| AC-24 | 58 | `test/unit/question-popper/chain-resolver.test.tsx` verifies ordered chain resolution, missing-link handling, fetch fallback, and cycle protection; however, there is still no direct component assertion proving `QuestionChainView` / `QuestionCard` render the prior question and answer above the current question. |
| AC-25 | 15 | The phase doc says follow-up notifications were already satisfied by prior behavior, but Phase 6 provides no concrete command output or test that exercises `previousQuestionId` and proves the same toast / indicator / SSE behavior. |
| AC-26 | 42 | `QuestionPopperOverlayPanel` and `QuestionHistoryList` implement the History view, and the targeted Vitest run passed, but there is no mixed alert/question ordering assertion and the hook still uses the list route's default 100-item window. |
| AC-27 | 48 | One test expands a history row and sees `Answered:`, but there is no coverage for chained-history detail, no second-click collapse assertion, and the current implementation misses the root-question thread case described in F001. |

- **F003 (MEDIUM)** — `/Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/chain-resolver.test.tsx:204-244` + `/Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-6-question-chaining-history/execution.log.md:71-75`
  - The changed tests prove the pure resolver behavior and one basic history-row expansion.
  - They do not directly verify `QuestionChainView`, `QuestionCard` thread toggling, History tab ordering/metadata, or follow-up notification behavior.
  - The execution log records summary claims, not the concrete output needed to back AC-25/26/27 with confidence.

### E.5) Doctrine Compliance

- **F004 (MEDIUM)** — `/Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/chain-resolver.test.tsx:147-163`
  - The test uses `vi.fn().mockResolvedValue(...)`, which conflicts with `docs/project-rules/rules.md` (R-TEST-007) and Constitution Principle 4 (`fakes over mocks`).
  - The targeted command below also shows that Biome is not clean for the changed Phase 6 files because this file needs formatting.

### E.6) Harness Live Validation

N/A — no harness configured (`docs/project-rules/harness.md` is absent).

## F) Coverage Map

| AC | Description | Evidence | Confidence |
|----|-------------|----------|------------|
| AC-24 | When a question has `previousQuestionId`, the overlay shows the previous question and its answer above the current question as a sequential thread. | Resolver tests prove ordering logic and fetch fallback; no direct component test yet proves the rendered thread UI. | 58 |
| AC-25 | Follow-up questions trigger their own toast notification and indicator update just like first-time questions. | Only phase-doc narrative exists for this behavior; no direct Phase 6 test or command transcript proves it. | 15 |
| AC-26 | The overlay includes a way to view all past items newest-first with source, text, type, status, and age. | History tab/list implementation exists, but no mixed-item ordering assertion exists and the hook still fetches only the route's default 100-item window. | 42 |
| AC-27 | Clicking a historical item expands it to show full detail, including any conversation chain for questions. | One row-expansion test passes, but root questions with descendants currently do not show their thread in history. | 48 |

**Overall coverage confidence**: 41%

## G) Commands Executed

```bash
git --no-pager diff --stat
git --no-pager diff --staged --stat
git --no-pager status --short
git --no-pager log --oneline -12
git --no-pager diff ec620df..HEAD > /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-6-question-chaining-history/reviews/_computed.diff
git --no-pager diff --name-status ec620df..HEAD
pnpm vitest run test/unit/question-popper/chain-resolver.test.tsx --reporter=dot
pnpm exec biome check apps/web/src/features/067-question-popper/components/question-card.tsx apps/web/src/features/067-question-popper/components/question-chain-view.tsx apps/web/src/features/067-question-popper/components/question-history-list.tsx apps/web/src/features/067-question-popper/components/question-popper-overlay-panel.tsx apps/web/src/features/067-question-popper/hooks/use-question-popper.tsx apps/web/src/features/067-question-popper/lib/chain-resolver.ts test/unit/question-popper/chain-resolver.test.tsx
```

## H) Handover Brief

> Copy this section to the implementing agent. It has no context on the review —
> only context on the work that was done before the review.

**Review result**: REQUEST_CHANGES

**Plan**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md
**Spec**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/question-popper-spec.md
**Phase**: Phase 6: Question Chaining + History
**Tasks dossier**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-6-question-chaining-history/tasks.md
**Execution log**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-6-question-chaining-history/execution.log.md
**Review file**: /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-6-question-chaining-history/reviews/review.phase-6-question-chaining-history.md

### Files Reviewed

| File (absolute path) | Status | Domain | Action Needed |
|---------------------|--------|--------|---------------|
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/components/answer-form.tsx | Modified | question-popper | None |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/components/question-card.tsx | Modified | question-popper | Add direct thread-toggle regression coverage |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/components/question-chain-view.tsx | Created | question-popper | Add direct render coverage |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/components/question-history-list.tsx | Created | question-popper | Fix root-question thread rendering |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/components/question-popper-overlay-panel.tsx | Modified | question-popper | Re-verify History tab behavior after history-fetch fix |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/hooks/use-question-popper.tsx | Modified | question-popper | Fetch complete history |
| /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/lib/chain-resolver.ts | Created | question-popper | Keep behavior aligned with the expanded tests |
| /Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md | Modified | question-popper docs | Sync Phase 6 composition/concepts/source location |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-6-question-chaining-history/execution.log.md | Created | phase artifact | Replace narrative evidence with exact command output |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-6-question-chaining-history/tasks.fltplan.md | Created | phase artifact | None |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-6-question-chaining-history/tasks.md | Created | phase artifact | None |
| /Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/chain-resolver.test.tsx | Created | question-popper verification | Replace `vi.fn`, expand coverage, and make Biome clean |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md | Existing | plan artifact | Add missing Domain Manifest entries |

### Required Fixes (if REQUEST_CHANGES)

| # | File (absolute path) | What To Fix | Why |
|---|---------------------|-------------|-----|
| 1 | /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/components/question-history-list.tsx | Render `QuestionChainView` for any question that is part of a chain, including root questions with descendants. | AC-27 is currently unmet for expanded root questions. |
| 2 | /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/hooks/use-question-popper.tsx | Fetch the complete event history instead of relying on the list route's default 100-item window. | AC-26 requires all past items, not just the newest 100. |
| 3 | /Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/chain-resolver.test.tsx | Remove `vi.fn()`, add direct UI / notification coverage for AC-24/25/26/27, and make the targeted Biome check pass. | Current evidence is shallow and the test file violates the repository's testing doctrine. |
| 4 | /Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md<br/>/Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md<br/>/Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-6-question-chaining-history/execution.log.md | Synchronize Phase 6 domain documentation, Domain Manifest entries, and execution evidence with the implementation. | Domain traceability and review evidence are incomplete. |

### Domain Artifacts to Update (if any)

| File (absolute path) | What's Missing |
|---------------------|----------------|
| /Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md | Composition / Concepts / Source Location entries for chain resolver, chain view, history list, and hook history capability |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md | Domain Manifest coverage for `apps/web/src/features/067-question-popper/lib/chain-resolver.ts` and `test/unit/question-popper/chain-resolver.test.tsx` |
| /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-6-question-chaining-history/execution.log.md | Exact Biome/Vitest commands and output snippets supporting the Phase 6 claims |

### Next Step

/plan-6-v2-implement-phase --plan /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md --phase 'Phase 6: Question Chaining + History'
