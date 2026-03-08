# Fix Tasks: Phase 6: Question Chaining + History

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Show conversation threads for root history items
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/components/question-history-list.tsx
- **Issue**: Historical detail only renders `QuestionChainView` when `previousQuestionId` exists. Root questions with follow-up children are still part of a conversation chain, but their history expansion hides that thread.
- **Fix**: Render `QuestionChainView` for every question detail row, or detect chain membership bidirectionally (for example via `isPartOfChain`). Let `QuestionChainView` keep its current single-item `null` return to avoid noise for standalone questions.
- **Patch hint**:
  ```diff
- const hasChain = !!item.question.previousQuestionId;
...
- {hasChain && <QuestionChainView questionId={item.questionId} getChain={getChain} />}
+ <QuestionChainView questionId={item.questionId} getChain={getChain} />
  ```

## Medium / Low Fixes

### FT-002: Load complete history in the overlay
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/hooks/use-question-popper.tsx, /Users/jordanknight/substrate/067-question-popper/apps/web/src/features/067-question-popper/lib/route-helpers.ts
- **Issue**: `fetchItems()` calls `/api/event-popper/list` with no override, but the route defaults to `limit=100`. Once the dataset grows beyond 100 events, History silently drops older entries.
- **Fix**: Back the History tab with a complete-history fetch. If the route does not already support an uncapped query, add an explicit `limit=all`/paging path and use it from the hook.
- **Patch hint**:
  ```diff
- const res = await fetch('/api/event-popper/list');
+ const res = await fetch('/api/event-popper/list?limit=all');
  ```
  ```diff
- const limit = limitStr ? Number.parseInt(limitStr, 10) : 100;
+ const limit =
+   limitStr === 'all'
+     ? Number.MAX_SAFE_INTEGER
+     : limitStr
+       ? Number.parseInt(limitStr, 10)
+       : 100;
  ```

### FT-003: Replace the mock-based resolver test and add direct Phase 6 coverage
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/chain-resolver.test.tsx, /Users/jordanknight/substrate/067-question-popper/test/unit/question-popper/ui-components.test.tsx
- **Issue**: The new resolver test uses `vi.fn()` despite the repo's fakes-only doctrine, and the Phase 6 evidence still does not directly verify `QuestionChainView`, `QuestionCard` thread toggling, History tab behavior, or AC-25 follow-up notifications.
- **Fix**: Replace the mock with a hand-rolled async fake that records calls, add direct UI tests for the new chain/history surfaces, and include or cite a real follow-up-question notification test/evidence path.
- **Patch hint**:
  ```diff
- const fetchFn = vi.fn().mockResolvedValue(missingA);
+ const fetchCalls: string[] = [];
+ const fetchFn = async (id: string) => {
+   fetchCalls.push(id);
+   return id === 'a' ? missingA : null;
+ };
...
- expect(fetchFn).toHaveBeenCalledWith('a');
+ expect(fetchCalls).toEqual(['a']);
  ```

### FT-004: Synchronize Phase 6 domain artifacts and evidence
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/067-question-popper/docs/domains/question-popper/domain.md, /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md, /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/tasks/phase-6-question-chaining-history/execution.log.md
- **Issue**: The domain doc is only partially updated, the Domain Manifest misses the resolver/test file mappings, and the execution log summarizes evidence without the concrete command output used in review.
- **Fix**: Add Phase 6 chain/history entries to Composition, Concepts, and Source Location; add the missing Domain Manifest entries; paste the exact Biome/Vitest commands and output snippets used to verify the phase.
- **Patch hint**:
  ```diff
+ | `chain-resolver.ts` | Resolve question threads and fetch missing ancestors | `QuestionOut`, Fetch API |
+ | `QuestionChainView` | Render ordered conversation timelines | `useQuestionPopper().getChain` |
+ | `QuestionHistoryList` | Render compact expandable history with thread detail | `QuestionChainView`, `AnswerForm` |
  ```
  ```diff
+ | `apps/web/src/features/067-question-popper/lib/chain-resolver.ts` | `question-popper` | internal |
+ | `test/unit/question-popper/chain-resolver.test.tsx` | `question-popper` | verification |
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review --phase "Phase 6: Question Chaining + History" --plan /Users/jordanknight/substrate/067-question-popper/docs/plans/067-question-popper/plan.md` and achieve zero HIGH/CRITICAL
