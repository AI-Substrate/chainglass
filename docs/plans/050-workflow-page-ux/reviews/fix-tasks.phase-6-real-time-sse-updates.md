# Fix Tasks: Phase 6: Real-Time SSE Updates

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Guarantee mutation lock release and complete suppression coverage
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx
- **Issue**: `startMutation()` is not reliably paired with `endMutation()` and some write paths bypass suppression entirely.
- **Fix**: Introduce a shared helper (e.g., `withMutationLock`) that wraps every disk-writing path in `try/finally` and use it for drag/drop mutations, add/remove line, set line label, undo/redo, Q&A submit, and node config/input saves.
- **Patch hint**:
  ```diff
  - startMutation();
  - await mutations.removeNode(nodeId);
  - endMutation();
  + startMutation();
  + try {
  +   await mutations.removeNode(nodeId);
  + } finally {
  +   endMutation();
  + }
  ```

### FT-002: Prevent dropped structural events in useWorkflowSSE
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/hooks/use-workflow-sse.ts
- **Issue**: Hook handles only `latest` message and then clears queue, which can drop structure events and miss undo invalidation/toast.
- **Fix**: Process all queued messages for active `graphSlug`; preserve whether any structure event occurred and dispatch structure/status callbacks with debounce semantics before clearing.
- **Patch hint**:
  ```diff
  - const latest = messages[messages.length - 1];
  - if (!latest || latest.graphSlug !== graphSlug) return;
  - if (latest.changeType === 'structure') { ... } else { ... }
  + const relevant = messages.filter((m) => m.graphSlug === graphSlug);
  + const hasStructure = relevant.some((m) => m.changeType === 'structure');
  + const hasStatus = relevant.some((m) => m.changeType === 'status');
  + if (hasStructure) { ... }
  + if (hasStatus) { ... }
    clearMessages();
  ```

### FT-003: Add missing workflow SSE hook test coverage
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/050-workflow-page/use-workflow-sse.test.ts
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-6-real-time-sse-updates/tasks.md
- **Issue**: T007 declares hook/integration test coverage, but `use-workflow-sse.test.ts` is missing.
- **Fix**: Add tests for graphSlug filtering, structure-vs-status handling, debounce timing, self-event suppression, and (if feasible) <=2s end-to-end expectation for AC-26.
- **Patch hint**:
  ```diff
  + describe('useWorkflowSSE', () => {
  +   it('handles structure events for active graph only', () => { ... });
  +   it('suppresses events during mutation lock', () => { ... });
  +   it('debounces status updates separately from structure', () => { ... });
  + });
  ```

### FT-004: Bring watcher adapter tests into doctrine compliance
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/test/unit/workflow/workflow-watcher-adapter.test.ts
- **Issue**: Tests use forbidden `vi.fn()` mocks and real sleeps, conflicting with `R-TEST-007` and `R-TEST-005`.
- **Fix**: Replace mocks with explicit fake callback collectors and switch debounce assertions to fake timers; add required 5-field Test Doc blocks.
- **Patch hint**:
  ```diff
  - const callback = vi.fn();
  - await new Promise((r) => setTimeout(r, 10));
  - expect(callback).toHaveBeenCalledTimes(1);
  + const calls: unknown[] = [];
  + const callback = (event: unknown) => { calls.push(event); };
  + await vi.advanceTimersByTimeAsync(10);
  + expect(calls).toHaveLength(1);
  ```

### FT-005: Record Full TDD evidence in execution log
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-6-real-time-sse-updates/execution.log.md
- **Issue**: Execution log contains only header metadata, with no RED/GREEN/REFACTOR evidence or test output.
- **Fix**: Add per-task TDD sections (T001–T007) with failing test command/output, passing command/output, and refactor notes.
- **Patch hint**:
  ```diff
  + ## T004: useWorkflowSSE
  + - RED: pnpm vitest test/unit/web/features/050-workflow-page/use-workflow-sse.test.ts -t "..."
  + - GREEN: pnpm vitest test/unit/web/features/050-workflow-page/use-workflow-sse.test.ts
  + - REFACTOR: ...
  ```

## Medium / Low Fixes

### FT-006: Remove unrelated Plan 053 review artifacts from Phase 6 scope
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews/fix-tasks.phase-4-react-integration.md
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews/review.phase-4-react-integration.md
- **Issue**: Unrelated files were included in Phase 6 commit/diff.
- **Fix**: Split these into their own plan/phase commit context and keep Phase 6 diff scoped to its dossier files.

### FT-007: Update stale domain artifacts for workflow SSE changes
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/events/domain.md
  - /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md
  - /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md
- **Issue**: Domain contracts/history/map metadata lag Phase 6 implementation.
- **Fix**: Add workflow channel/adapters to events docs, add workflow-ui Phase 6 history/dependency notes, and refresh domain-map events node/summary.

### FT-008: Complete Domain Manifest traceability for touched files
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md
- **Issue**: Not all changed files map cleanly through `## Domain Manifest`.
- **Fix**: Add missing touched files to manifest entries or document explicit exclusions for plan/review artifact files.

### FT-009: Consolidate legacy/new SSE hook behavior as deprecation proceeds
- **Severity**: LOW
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/hooks/use-workflow-sse.ts
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/022-workgraph-ui/use-workgraph-sse.ts
- **Issue**: Similar SSE consumer logic now exists in two hooks with diverging queue semantics.
- **Fix**: Align behavior or extract shared helper while executing Phase 7 deprecation/removal work.

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
