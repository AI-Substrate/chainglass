# Fix Tasks: Phase 3: Drag-and-Drop + Persistence

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Implement and isolate Phase 3 deliverables
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-3-drag-drop-persistence/tasks.md
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_manifest.phase-3-drag-drop-persistence.txt
- **Issue**: Required Phase 3 implementation/test files are not present in the captured diff; tasks remain unchecked.
- **Fix**: Implement T001-T009 and ensure the phase diff only contains Phase 3 scope files.
- **Patch hint**:
  ```diff
  - M apps/web/src/features/041-file-browser/hooks/use-flowspace-search.ts
  - A apps/web/src/lib/server/flowspace-search-action.ts
  + M apps/web/app/actions/workflow-actions.ts
  + A apps/web/src/features/050-workflow-page/hooks/use-workflow-mutations.ts
  + A test/unit/web/features/050-workflow-page/workflow-dnd.test.tsx
  + A test/unit/web/features/050-workflow-page/naming-modal.test.tsx
  + A test/unit/web/features/050-workflow-page/use-workflow-mutations.test.tsx
  ```

### FT-002: Add Full TDD execution evidence for Phase 3
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-3-drag-drop-persistence/execution.log.md
- **Issue**: No RED→GREEN evidence or command output exists for Phase 3 tasks/ACs.
- **Fix**: Add per-task RED command/result, GREEN command/result, and AC verification mapping.
- **Patch hint**:
  ```diff
  + ### T003: DnD toolbox → line
  + RED: pnpm vitest test/unit/web/features/050-workflow-page/workflow-dnd.test.tsx -t "shows drop zones on drag"  # fails
  + GREEN: pnpm vitest test/unit/web/features/050-workflow-page/workflow-dnd.test.tsx  # passes
  + AC Mapping: AC-07
  ```

### FT-003: Resolve domain traceability/orphan-file failures
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_manifest.phase-3-drag-drop-persistence.txt
- **Issue**: Snapshot includes orphan/out-of-phase files not mapped in Plan 050 Domain Manifest.
- **Fix**: Split unrelated changes (Plan 049/051/runtime-data) from Phase 3 review, or explicitly map every changed file to a domain/phase.
- **Patch hint**:
  ```diff
  - A docs/plans/051-flowspace-search/
  - A apps/web/src/lib/server/flowspace-search-action.ts
  + M apps/web/src/features/050-workflow-page/components/workflow-canvas.tsx
  + M apps/web/src/features/050-workflow-page/components/workflow-line.tsx
  ```

### FT-004: Enforce contract-only imports across domains
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/041-file-browser/hooks/use-flowspace-search.ts
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/lib/server/flowspace-search-action.ts
- **Issue**: Imports use internal panel-layout path `@/features/_platform/panel-layout/types`.
- **Fix**: Import from public barrel/contracts only.
- **Patch hint**:
  ```diff
  - import type { FlowSpaceAvailability, FlowSpaceSearchMode, FlowSpaceSearchResult } from '@/features/_platform/panel-layout/types';
  + import type { FlowSpaceAvailability, FlowSpaceSearchMode, FlowSpaceSearchResult } from '@/features/_platform/panel-layout';
  ```

### FT-005: Add required per-test Test Doc blocks
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/test/unit/web/features/041-file-browser/flowspace-search-action.test.ts
- **Issue**: Multiple `it(...)` tests lack required 5-field Test Doc comments.
- **Fix**: Add Test Doc blocks inside each test case or update doctrine if rule changed.
- **Patch hint**:
  ```diff
  it('extracts file path from callable node_id', () => {
  +  /*
  +  Test Doc:
  +  - Why: ...
  +  - Contract: ...
  +  - Usage Notes: ...
  +  - Quality Contribution: ...
  +  - Worked Example: ...
  +  */
     // assertions...
  });
  ```

## Medium / Low Fixes

### FT-006: Update workflow-ui domain history currency
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/domains/workflow-ui/domain.md
- **Issue**: History stops at Phase 2 while Phase 3 snapshot includes workflow-ui touches.
- **Fix**: Add a Phase 3 history row and update composition notes as needed.

### FT-007: Remove mixed-plan artifacts from Phase 3 review scope
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_manifest.phase-3-drag-drop-persistence.txt
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/049-ux-enhancements/feature-2-file-filter/reviews/review.md
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/051-flowspace-search
- **Issue**: Mixed-plan artifacts reduce deterministic phase auditability.
- **Fix**: Re-run review on an isolated worktree or produce separate manifests/reviews per plan.

### FT-008: Align interface names with doctrine
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/_platform/panel-layout/types.ts
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/041-file-browser/hooks/use-flowspace-search.ts
- **Issue**: Interface names do not follow required `I*` naming convention.
- **Fix**: Rename to `IFlowSpaceSearchResult` and `IUseFlowspaceSearchReturn` (or convert to type aliases if policy allows).

### FT-009: Normalize drag overlay behavior
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/050-workflow-page/components/workflow-editor.tsx
- **Issue**: DragOverlay appears for toolbox drags but not canvas-node drags.
- **Fix**: Add overlay for canvas-node drags or explicitly document intended behavior.

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
