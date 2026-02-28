# Fix Tasks: Phase 7: Workgraph Deprecation + Cleanup

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Re-scope computed diff to Phase 7 only
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/reviews/_computed.diff
- **Issue**: Computed diff includes unrelated Plan 053 review artifacts.
- **Fix**: Regenerate `_computed.diff` from a Phase 7-only commit/file scope and ensure no `docs/plans/053-*` paths are present.
- **Patch hint**:
  ```diff
  - diff --git a/docs/plans/053-global-state-system/reviews/_computed.diff b/docs/plans/053-global-state-system/reviews/_computed.diff
  - diff --git a/docs/plans/053-global-state-system/reviews/_manifest.txt b/docs/plans/053-global-state-system/reviews/_manifest.txt
  + # Phase 7 computed diff contains only Plan 050 Phase 7 files
  ```

### FT-002: Align T009 completion with quality gate evidence
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-7-workgraph-deprecation-cleanup/execution.log.md, /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-7-workgraph-deprecation-cleanup/tasks.md
- **Issue**: T009 is marked complete without evidence of a passing `just fft`; execution log records failing tests.
- **Fix**: Run and record `just fft` output (or approved waiver with explicit blocked state) and update task status/evidence accordingly.
- **Patch hint**:
  ```diff
  - **Status**: Completed
  + **Status**: Blocked (pending clean `just fft` evidence or approved waiver)
  
  - - `pnpm test` → 323 passed, 2 failed ...
  + - `just fft` → <paste output and final status>
  + - If waived: <link waiver + rationale + residual risk>
  ```

### FT-003: Add explicit Full TDD evidence trail
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/tasks/phase-7-workgraph-deprecation-cleanup/execution.log.md
- **Issue**: Phase declares Full TDD, but RED→GREEN→REFACTOR steps are not explicitly documented.
- **Fix**: Add concise TDD evidence entries per major task cluster (or explicitly record approved strategy exception for deletion phase).
- **Patch hint**:
  ```diff
  + ## T00X: TDD Evidence (Phase 7)
  + - RED: <failing test command + key output>
  + - GREEN: <passing command + key output>
  + - REFACTOR: <final regression command + key output>
  ```

### FT-004: Update workgraph domain contract doc to post-removal state
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/workgraph/domain.md
- **Issue**: Domain doc still lists web UI/API/event consumers removed by Phase 7.
- **Fix**: Remove web-side consumer references, keep CLI consumers, and add Phase 7 history row.
- **Patch hint**:
  ```diff
  - | Web UI (feature 022) | All 3 service interfaces | ... |
  - | Web API routes | IWorkGraphService, IWorkNodeService, IWorkUnitService | ... |
  - | Event adapters (features 023, 027) | WorkGraphChangedEvent | ... |
  + | CLI (`apps/cli/`) | IWorkGraphService, IWorkNodeService, IWorkUnitService | `cg wg`, `cg unit` |
  + | Plan 050 Phase 7 | Web consumers removed; domain is CLI-only consumer-facing | 2026-02-27 |
  ```

## Medium / Low Fixes

### FT-005: Refresh events domain doc to remove stale workgraph-era references
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/domains/_platform/events/domain.md
- **Issue**: Stale examples reference `WorkGraphWatcherAdapter` / `useWorkGraphSSE`.
- **Fix**: Update examples/history to current workflow-era adapters and hooks.
- **Patch hint**:
  ```diff
  - - **Business-domain watcher adapters** (e.g., `WorkGraphWatcherAdapter`)
  - - **Business-domain SSE consumer hooks** (e.g., `useWorkGraphSSE`)
  + - **Business-domain watcher adapters** (e.g., `WorkflowWatcherAdapter`)
  + - **Business-domain SSE consumer hooks** (e.g., workflow UI SSE hooks)
  ```

### FT-006: Reconcile domain-map, registry taxonomy, and Phase 7 manifest coverage
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/chainglass-048/docs/domains/domain-map.md, /Users/jordanknight/substrate/chainglass-048/docs/domains/registry.md, /Users/jordanknight/substrate/chainglass-048/docs/plans/050-workflow-page-ux/workflow-page-ux-plan.md
- **Issue**: Domain map representation and summary are inconsistent for workgraph; registry status uses non-canonical label; plan manifest under-covers Phase 7 files.
- **Fix**: Make map/table/registry consistent and add missing Phase 7 domain manifest entries.
- **Patch hint**:
  ```diff
  - | Workgraph (Legacy) | _platform/workgraph | ... | removed from web (Plan 050 Phase 7); CLI-only |
  + | Workgraph (Legacy) | _platform/workgraph | ... | deprecated |
  
  + Notes: removed from web in Plan 050 Phase 7; CLI-only consumer remains.
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
