# Fix Tasks: Phase 3: Build the Full-Page Create Flow

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Add targeted create-flow form-state tests
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/069-new-worktree/test/unit/web/components/new-worktree-form.test.tsx, /Users/jordanknight/substrate/069-new-worktree/apps/web/src/components/workspaces/new-worktree-form.tsx
- **Issue**: The phase dossier required targeted tests for the four `CreateWorktreePageState` variants, but no such test file was added.
- **Fix**: Add a fake-friendly test seam (if required), then write state-focused component tests for `idle`, `blocking_error`, `created`, and `created_with_bootstrap_error`. Assert preview rendering, preserved `requestedName`, warning/log-tail rendering, and presence of the recovery action.
- **Patch hint**:
  ```diff
  + // test/unit/web/components/new-worktree-form.test.tsx
  + describe('NewWorktreeForm', () => {
  +   it('renders the idle preview state', () => { /* Test Doc + assertions */ });
  +   it('preserves the requested name on blocking_error', () => { /* ... */ });
  +   it('renders the bootstrap warning recovery state', () => { /* ... */ });
  +   it('renders the created state without testing window.location.assign', () => { /* ... */ });
  + });
  ```

### FT-002: Record phase-specific verification evidence
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-3-build-the-full-page-create-flow/execution.log.md
- **Issue**: The execution log shows generic repo-level test passes, but it does not include concrete evidence for the new preview, blocking-error, bootstrap-warning, or success-navigation behaviors.
- **Fix**: Add targeted component-test output and/or explicit manual verification notes with observed results for the phase-critical UI states and navigation destination.
- **Patch hint**:
  ```diff
   ## Evidence
  + - Command: `pnpm test -- --run test/unit/web/components/new-worktree-form.test.tsx` — exit 0
  + - Manual: Submitted a blocked create request and confirmed the page preserved `requestedName`, showed the blocking message, and refreshed preview details.
  + - Manual: Forced a bootstrap failure and confirmed the warning card displayed log output plus an `Open Worktree Anyway` action.
  + - Manual: Verified successful create navigated to `/workspaces/<slug>/browser?worktree=<path>`.
  ```

## Medium / Low Fixes

### FT-003: Sync workspace domain docs with the Phase 3 surface
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/069-new-worktree/docs/domains/workspace/domain.md
- **Issue**: The workspace domain docs stop at Plan 069 Phase 2 and do not mention the new route/form or the newly exported naming helpers used for live preview.
- **Fix**: Add a Phase 3 history row, update Source Location/Composition for the route and form, and extend Concepts/Contracts to mention the client-safe naming helper surface.
- **Patch hint**:
  ```diff
   | Plan 069 Phase 2 | Implemented naming allocator, GitWorktreeManagerAdapter, WorktreeBootstrapRunner, full create-worktree orchestration in WorkspaceService, DI wiring in all containers | 2026-03-07 |
  +| Plan 069 Phase 3 | Added the full-page new-worktree route, create-worktree page-state/server-action adapter, and client live-preview form surface | 2026-03-08 |
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
