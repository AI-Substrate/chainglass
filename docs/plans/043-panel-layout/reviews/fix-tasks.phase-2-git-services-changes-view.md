# Fix Tasks: Phase 2: Git Services + Changes View

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Harden fileExists workspace trust boundary
- **Severity**: HIGH
- **File(s)**: /home/jak/substrate/041-file-browser/apps/web/app/actions/file-actions.ts
- **Issue**: `fileExists` trusts client-provided `worktreePath` and can be abused for path existence probing outside authorized workspace.
- **Fix**: Resolve workspace root from `slug` via trusted server-side source (`IWorkspaceService`) and validate `filePath` against that root only.
- **Patch hint**:
  ```diff
  - export async function fileExists(slug: string, worktreePath: string, filePath: string): Promise<boolean> {
  + export async function fileExists(slug: string, _worktreePath: string, filePath: string): Promise<boolean> {
  +   const workspaceService = container.resolve<IWorkspaceService>(WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE);
  +   const workspace = await workspaceService.getWorkspaceBySlug(slug);
  +   if (!workspace) return false;
  +   const trustedRoot = workspace.absolutePath;
  -   const absolutePath = pathResolver.resolvePath(worktreePath, filePath);
  +   const absolutePath = pathResolver.resolvePath(trustedRoot, filePath);
  -   if (!realPath.startsWith(worktreePath + path.default.sep) && realPath !== worktreePath) {
  +   if (!realPath.startsWith(trustedRoot + path.default.sep) && realPath !== trustedRoot) {
        return false;
      }
  ```

### FT-002: Add explicit AC-22 verification evidence
- **Severity**: HIGH
- **File(s)**:
  - /home/jak/substrate/041-file-browser/test/unit/web/features/041-file-browser/changes-view.test.tsx
  - /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/tasks/phase-2-git-services-changes-view/execution.log.md
- **Issue**: Review found no explicit evidence that context menu behavior in ChangesView matches tree view (AC-22).
- **Fix**: Add focused tests for context menu actions and record concrete passing output in execution log.
- **Patch hint**:
  ```diff
  + it('shows context menu actions matching FileTree', async () => {
  +   // assert Copy Full Path / Copy Relative Path / Copy Content / Download
  + });
  +
  + ## Evidence
  + - pnpm vitest test/unit/web/features/041-file-browser/changes-view.test.tsx
  + - ✓ context menu parity tests passed
  ```

## Medium / Low Fixes

### FT-003: Resolve phase scope/orphan mismatch for directory-listing
- **Severity**: MEDIUM
- **File(s)**:
  - /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/panel-layout-plan.md
  - /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/tasks/phase-2-git-services-changes-view/tasks.md
- **Issue**: `directory-listing.ts` changed but is not represented in phase manifest/tasks scope.
- **Fix**: Either explicitly add this file to Phase 2 scope with rationale/tests or move/revert change into the correct phase artifact set.
- **Patch hint**:
  ```diff
  + | `apps/web/src/features/041-file-browser/services/directory-listing.ts` | file-browser | internal | DYK-P2-02: tree shows all files via readDir |
  ```

### FT-004: Align domain map edge lifecycle state
- **Severity**: MEDIUM
- **File(s)**: /home/jak/substrate/041-file-browser/docs/domains/domain-map.md
- **Issue**: Health summary and edge diagram disagree on whether file-browser → panel-layout dependency is active.
- **Fix**: Keep both sections consistent (either active with labeled edge, or planned with summary adjusted).
- **Patch hint**:
  ```diff
  - %% fileBrowser -->|"PanelShell..."| panels
  + fileBrowser -->|"PanelShell<br/>ExplorerPanel<br/>LeftPanel · MainPanel"| panels
  ```

### FT-005: Upgrade evidence quality for phase completion
- **Severity**: MEDIUM
- **File(s)**: /home/jak/substrate/041-file-browser/docs/plans/043-panel-layout/tasks/phase-2-git-services-changes-view/execution.log.md
- **Issue**: Evidence is narrative-only and still says full-suite verification pending.
- **Fix**: Run required quality command(s) and append exact command + output excerpts.
- **Patch hint**:
  ```diff
  - - Full suite verification pending (run at commit time)
  + - Command: just fft
  + - Result: pass (lint/typecheck/test)
  + - Key output: ...
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
