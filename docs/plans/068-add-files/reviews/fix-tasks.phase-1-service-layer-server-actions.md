# Fix Tasks: Phase 1: Service Layer & Server Actions

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Resolve trusted worktree roots inside the new CRUD server actions
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/068-add-files/apps/web/app/actions/file-actions.ts`
- **Issue**: `createFile`, `createFolder`, `deleteItem`, and `renameItem` currently trust the caller-provided `worktreePath`. That means the path-security layer is anchored to a user-controlled base instead of the workspace/worktree selected by `slug`.
- **Fix**: Mirror the existing `fileExists()` / `pathExists()` pattern in the same file: resolve `IWorkspaceService`, fetch workspace info from `slug`, derive `trustedRoot` from the known worktrees, and pass `trustedRoot` into the service call. Treat the incoming `worktreePath` only as a selector for an allowed worktree.
- **Patch hint**:
  ```diff
  + const workspaceService = container.resolve<IWorkspaceService>(
  +   WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  + );
  + const info = await workspaceService.getInfo(slug);
  + const trustedRoot = info?.worktrees.find((w) => w.path === worktreePath)?.path ?? info?.path;
  - return createFileService({ worktreePath, dirPath, fileName, fileSystem, pathResolver });
  + return createFileService({ worktreePath: trustedRoot, dirPath, fileName, fileSystem, pathResolver });
  ```

### FT-002: Make folder creation validate a real parent before any recursive mkdir
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/services/file-mutation-actions.ts`
- **Issue**: `createFolderService()` calls `mkdir(resolved.absolutePath, { recursive: true })` after a helper that only `realpath()`-checks the immediate parent path when that exact path already exists. If an earlier ancestor is a symlink and the immediate parent is missing, Node follows the symlink and creates outside the workspace.
- **Fix**: Validate the actual parent directory separately (or walk to the nearest existing ancestor and `realpath()`-check it), require that parent to exist, then create only the final folder segment with non-recursive mkdir.
- **Patch hint**:
  ```diff
  - const resolved = await resolveAndValidatePath(worktreePath, relativePath, fileSystem, pathResolver);
  - if ('ok' in resolved) return resolved;
  - await fileSystem.mkdir(resolved.absolutePath, { recursive: true });
  + const parentRelative = dirPath;
  + const parentResolved = await resolveAndValidatePath(worktreePath, parentRelative, fileSystem, pathResolver);
  + if ('ok' in parentResolved) return parentResolved;
  + if (!(await fileSystem.exists(parentResolved.absolutePath))) {
  +   return { ok: false, error: 'security', message: `Parent directory missing: ${dirPath}` };
  + }
  + const resolved = await resolveAndValidatePath(worktreePath, relativePath, fileSystem, pathResolver);
  + if ('ok' in resolved) return resolved;
  + await fileSystem.mkdir(resolved.absolutePath);
  ```

## Medium / Low Fixes

### FT-003: Add lightweight server-action regression coverage
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/068-add-files/apps/web/app/actions/file-actions.ts`, `/Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/file-actions.server-actions.test.ts` (new)
- **Issue**: The plan promised lightweight wiring tests for server actions, but none were added. That left auth/DI/root-trust behavior unverified.
- **Fix**: Add focused tests for the four new actions that verify `requireAuth()` runs, DI resolution occurs, trusted-root resolution is applied, and a malicious `worktreePath` cannot widen the workspace boundary.
- **Patch hint**:
  ```diff
  + describe('createFile server action', () => {
  +   it('derives the trusted root from slug before delegating', async () => {
  +     // Arrange a workspace with a known worktree and a hostile incoming worktreePath.
  +     // Assert the delegated service receives the trusted root, not the hostile path.
  +   });
  + });
  ```

### FT-004: Add a symlinked-ancestor regression test and consolidate the helper later
- **Severity**: LOW
- **File(s)**: `/Users/jordanknight/substrate/068-add-files/test/unit/web/features/041-file-browser/file-mutation-actions.test.ts`, `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/services/file-mutation-actions.ts`, `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/services/file-actions.ts`, `/Users/jordanknight/substrate/068-add-files/apps/web/src/features/041-file-browser/services/upload-file.ts`
- **Issue**: The new path-security helper duplicates existing same-domain logic, and there is no regression test covering the symlinked-ancestor folder-create case.
- **Fix**: First add the missing regression test for folder creation through a symlinked ancestor. After the blocking fixes land, consider extracting one shared file-browser path-security helper used by read/save/upload/mutation services.
- **Patch hint**:
  ```diff
  + it('rejects createFolder when an existing ancestor is a symlink outside the worktree', async () => {
  +   // Arrange: /workspace/link -> /outside, request createFolder({ dirPath: 'link/nested', folderName: 'child' })
  +   // Assert: { ok: false, error: 'security' }
  + });
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Lightweight server-action tests added
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
