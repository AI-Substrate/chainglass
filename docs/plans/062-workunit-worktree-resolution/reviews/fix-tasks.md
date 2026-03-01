# Fix Tasks: Implementation

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Update Domain Manifest for All Changed Files
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/workunit-worktree-resolution-plan.md
- **Issue**: `## Domain Manifest` omits changed files (`agent-editor.tsx`, `code-unit-editor.tsx`, `user-input-editor.tsx`, `resolve-worktree-context.ts`).
- **Fix**: Add missing rows mapped to `058-workunit-editor` (classification `internal`) with concise rationale.
- **Patch hint**:
  ```diff
   | `apps/web/src/features/058-workunit-editor/components/workunit-editor.tsx` | `058-workunit-editor` | internal | Add `worktreePath?` prop, thread to save callbacks |
  +| `apps/web/src/features/058-workunit-editor/components/agent-editor.tsx` | `058-workunit-editor` | internal | Thread `worktreePath` into `saveUnitContent` |
  +| `apps/web/src/features/058-workunit-editor/components/code-unit-editor.tsx` | `058-workunit-editor` | internal | Thread `worktreePath` into `saveUnitContent` |
  +| `apps/web/src/features/058-workunit-editor/components/user-input-editor.tsx` | `058-workunit-editor` | internal | Thread `worktreePath` into `saveUnitContent` |
  +| `apps/web/src/features/058-workunit-editor/lib/resolve-worktree-context.ts` | `058-workunit-editor` | internal | Pure worktree validation helper introduced in this phase |
  ```

### FT-002: Add Verifiable Execution Evidence
- **Severity**: HIGH
- **File(s)**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/tasks/implementation/execution.log.md
- **Issue**: Verification claims (`just fft`, MCP checks, Playwright runs) are not backed by concrete output artifacts.
- **Fix**: Create/update execution log with timestamped commands, exit codes, and key output excerpts for each acceptance criterion claim.
- **Patch hint**:
  ```diff
  +## 2026-03-01 Verification Evidence
  +
  +### just fft
  +Command: just fft
  +Exit code: 0
  +Key output:
  +  [lint] ... PASS
  +  [typecheck] ... PASS
  +  [test] ... PASS
  +
  +### Next.js MCP
  +Command: nextjs_index(port=3001) + nextjs_call(get_errors)
  +Result: 0 compilation/runtime errors
  +
  +### Playwright
  +Command: browser_eval navigate/screenshot scenarios
  +Artifacts:
  +  - evidence/ac12-list.png
  +  - evidence/ac12-editor.png
  +  - evidence/ac12-missing-worktree-redirect.png
  ```

### FT-003: Remove Resolver Reinvention
- **Severity**: HIGH
- **File(s)**:
  - /Users/jordanknight/substrate/058-workunit-editor/apps/web/src/features/058-workunit-editor/lib/resolve-worktree-context.ts
  - /Users/jordanknight/substrate/058-workunit-editor/apps/web/app/actions/workunit-actions.ts
- **Issue**: New local resolver duplicates existing workspace-context capability (`resolveContextFromParams`) and risks semantic drift.
- **Fix**: Reuse/extend existing shared resolver method (with explicit no-fallback behavior if needed), then remove or minimize duplicate local logic.
- **Patch hint**:
  ```diff
  -import { resolveWorktreeContext } from '../../src/features/058-workunit-editor/lib/resolve-worktree-context';
   async function resolveWorkspaceContext(slug: string, worktreePath?: string): Promise<WorkspaceContext | null> {
     const container = getContainer();
     const workspaceService = container.resolve<IWorkspaceService>(WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE);
  -  const info = await workspaceService.getInfo(slug);
  -  if (!info) return null;
  -  return resolveWorktreeContext(info, worktreePath);
  +  // Reuse shared resolver capability; enforce no-fallback semantics here.
  +  return workspaceService.resolveContextFromParams(slug, worktreePath);
   }
  ```

## Medium / Low Fixes

### FT-004: Make Test Docs Rule-Compliant
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/058-workunit-editor/test/unit/web/actions/workunit-actions-worktree.test.ts
- **Issue**: Test Doc format is non-standard and omits required fields.
- **Fix**: Update tests to include the required 5 fields (`Why`, `Contract`, `Usage Notes`, `Quality Contribution`, `Worked Example`).
- **Patch hint**:
  ```diff
  -/**
  - * Test Doc:
  - * - Feature: ...
  - * - Scenario: ...
  - * - Tests: ...
  - * - Usage Notes: ...
  - */
  +/*
  +Test Doc:
  +- Why: Prevent regressions where work-unit CRUD resolves to the wrong workspace path.
  +- Contract: resolveWorktreeContext returns null for missing/invalid paths and returns a valid WorkspaceContext for known worktrees.
  +- Usage Notes: Call helper with WorkspaceInfo fixture containing both main + feature worktrees.
  +- Quality Contribution: Catches silent fallback and wrong-path resolution bugs.
  +- Worked Example: resolveWorktreeContext(info, '/workspace/feature-branch/') => context.worktreePath === '/workspace/feature-branch'.
  +*/
  ```

### FT-005: Add Action-Level Resolver Tests
- **Severity**: MEDIUM
- **File(s)**: /Users/jordanknight/substrate/058-workunit-editor/test/unit/web/actions/workunit-actions-worktree.test.ts
- **Issue**: Current tests cover helper only; they do not verify exported action behavior with DI fakes (including unknown slug).
- **Fix**: Add action-level tests for `listUnits`/`loadUnit` covering unknown slug, missing worktree, invalid worktree, valid worktree.
- **Patch hint**:
  ```diff
  +it('returns workspace-not-found error when slug is unknown via listUnits', async () => {
  +  // Arrange fake workspace service to return null for getInfo(slug)
  +  // Act
  +  const result = await listUnits('unknown-slug', '/workspace/feature-branch');
  +  // Assert
  +  expect(result.errors[0]?.code).toBe('E000');
  +});
  ```

### FT-006: Synchronize Flight Plan Status Markers
- **Severity**: LOW
- **File(s)**: /Users/jordanknight/substrate/058-workunit-editor/docs/plans/062-workunit-worktree-resolution/tasks/implementation/tasks.fltplan.md
- **Issue**: `T002` remains `[~]` while other artifacts mark completion.
- **Fix**: Update `T002` marker to `[x]` to match plan/tasks completion state.
- **Patch hint**:
  ```diff
  -- [~] T002: TDD GREEN — fix resolver + add worktreePath to 8 actions
  +- [x] T002: TDD GREEN — fix resolver + add worktreePath to 8 actions
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
