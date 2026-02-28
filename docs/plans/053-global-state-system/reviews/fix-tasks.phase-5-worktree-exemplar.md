# Fix Tasks: Phase 5: Worktree Exemplar

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Recompute phase-scoped review inputs
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews/_computed.diff
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/reviews/_manifest.txt
- **Issue**: Current diff/manifest captures broad unrelated working-tree changes and omits core Phase 5 files.
- **Fix**: Generate diff from Phase 5 commit window or explicit Phase 5 task file list; ensure manifest includes T001-T006 paths.
- **Patch hint**:
  ```diff
  - git --no-pager diff > reviews/_computed.diff
  + git --no-pager diff <phase5-base-commit>..<phase5-head-commit> > reviews/_computed.diff
  + git --no-pager diff --name-status <phase5-base-commit>..<phase5-head-commit> > reviews/_manifest.txt
  ```

### FT-002: Implement AC-39 event-driven publisher path
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/apps/web/src/features/041-file-browser/state/worktree-publisher.tsx
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-5-worktree-exemplar/execution.log.md
- **Issue**: Execution log documents temporary timer-based changed-file-count publishing.
- **Fix**: Publish `changed-file-count` from real file-change events (FileChangeHub/useFileChanges), update execution evidence, remove temporary behavior.
- **Patch hint**:
  ```diff
  - const timer = setInterval(() => publishCount(), 2000)
  + const { changes } = useFileChanges('*')
  + useEffect(() => publishCount(changes.length), [changes, slug, state])
  ```

### FT-003: Restore Full TDD audit trail for Phase 5
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-5-worktree-exemplar/execution.log.md
- **Issue**: RED→GREEN proof required by spec testing strategy is missing.
- **Fix**: Add failing-first test evidence, then passing evidence, and map each to AC-38..AC-41.
- **Patch hint**:
  ```diff
  + ## RED Evidence
  + <command + failing output>
  + ## GREEN Evidence
  + <command + passing output>
  + ## AC Mapping
  + AC-38 -> <test/evidence>
  ```

### FT-004: Align domain docs/map/registry for workgraph lifecycle
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/workgraph/domain.md
  - /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md
  - /Users/jordanknight/substrate/chainglass-048/docs/domains/registry.md
- **Issue**: Domain docs and topology/status tables conflict after web cleanup.
- **Fix**: Update consumers/dependencies/history in domain.md, and make map/registry statuses and edges consistent.
- **Patch hint**:
  ```diff
  - | Workgraph (Legacy) | ... | removed from web (Plan 050 Phase 7); CLI-only |
  + | Workgraph (Legacy) | ... | deprecated |
  + # note lifecycle in Created By / notes
  ```

## Medium / Low Fixes

### FT-005: Reconcile subtitle integration evidence
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/apps/web/app/(dashboard)/workspaces/[slug]/browser/browser-client.tsx
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-5-worktree-exemplar/execution.log.md
- **Issue**: Task/evidence says composed subtitle, current file shows `subtitle={diffStatsSubtitle}`.
- **Fix**: Implement composition in this file or update docs to point to actual composed location with proof.
- **Patch hint**:
  ```diff
  - subtitle={diffStatsSubtitle}
  + subtitle={<div className="flex items-center gap-2">{diffStatsSubtitle}<WorktreeStateSubtitle slug={slug} /></div>}
  ```

### FT-006: Bring tests in line with no-mock policy (or document exception)
- **Severity**: MEDIUM
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/worktree-publisher.test.tsx
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/global-state-system-spec.md (if policy exception needed)
- **Issue**: `vi.mock` use conflicts with declared test strategy constraints.
- **Fix**: Refactor to fake-driven approach without `vi.mock`, or explicitly revise policy with rationale.
- **Patch hint**:
  ```diff
  - vi.mock('@/features/045-live-file-events', ...)
  + // inject real provider/fake hub fixture and drive updates without module mocking
  ```

### FT-007: Add missing publisher behavior coverage and sync phase status
- **Severity**: MEDIUM/LOW
- **File(s)**:
  - /Users/jordanknight/substrate/chainglass-048/test/unit/web/state/worktree-publisher.test.tsx
  - /Users/jordanknight/substrate/chainglass-048/docs/plans/053-global-state-system/tasks/phase-5-worktree-exemplar/tasks.md
- **Issue**: Missing explicit rerender/unmount assertions; tasks status mismatch with execution log.
- **Fix**: Add update/cleanup assertions and align status metadata.
- **Patch hint**:
  ```diff
  + it('updates count on changes rerender', ...)
  + it('cleans up subscriptions on unmount', ...)
  - **Status**: Pending
  + **Status**: Complete
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
