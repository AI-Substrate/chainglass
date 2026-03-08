# Fix Tasks: Phase 2: Implement Workspace Orchestration

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Wire runtime worktree-creation dependencies end-to-end
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/services/workspace.service.ts`, `/Users/jordanknight/substrate/069-new-worktree/apps/web/src/lib/di-container.ts`, `/Users/jordanknight/substrate/069-new-worktree/apps/cli/src/lib/container.ts`
- **Issue**: `WorkspaceService` relies on a post-construction bootstrap-runner setter with an `any` cast, `previewCreateWorktree()` hard-codes `hasBootstrapHook = false`, and the runtime web/CLI containers still construct the service with the old 3-argument signature.
- **Fix**: Inject a typed bootstrap-runner dependency through DI (constructor or equivalent typed factory), register `IGitWorktreeManager` and the runner in the runtime containers, and use that dependency for preview hook detection and create-time execution.
- **Patch hint**:
  ```diff
  - new WorkspaceService(registryAdapter, contextResolver, gitResolver)
  + const workspaceService = new WorkspaceService(
  +   registryAdapter,
  +   contextResolver,
  +   gitResolver,
  +   gitWorktreeManager,
  +   worktreeBootstrapRunner,
  + )
  + return workspaceService
  
  - let hasBootstrapHook = false
  + const hasBootstrapHook = await worktreeBootstrapRunner.hasHook(mainRepoPath)
  ```

### FT-002: Preserve structured git conflict output
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/adapters/git-worktree-manager.adapter.ts`
- **Issue**: `execGit()` always returns `stderr: ''`, so branch/path conflicts from `git worktree add` degrade into generic `git-failure` results.
- **Fix**: Preserve stderr or equivalent combined buffered output from the process manager and use it when classifying `branch-exists` / `path-exists` outcomes.
- **Patch hint**:
  ```diff
  - const bufferedOutput = this.processManager.getProcessOutput?.(handle.pid) ?? '';
  - if (bufferedOutput && !stdout) {
  -   stdout = bufferedOutput;
  - }
  - return { success, stdout, stderr: '' };
  + const bufferedOutput = this.processManager.getProcessOutput?.(handle.pid) ?? '';
  + if (bufferedOutput) {
  +   stdout = stdout || bufferedOutput;
  +   stderr = stderr || bufferedOutput;
  + }
  + return { success, stdout, stderr };
  ```

### FT-003: Return refreshed previews for create-time conflicts
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/services/workspace.service.ts`
- **Issue**: When the allocated branch/path conflicts during create-time work, the service returns a generic blocked error without `refreshedPreview`.
- **Fix**: Re-fetch ordinal sources after a create-time conflict, recompute the preview, and include that preview in the blocked result so the caller can preserve the original request and present an updated suggestion.
- **Patch hint**:
  ```diff
  - if (createResult.status !== 'created') {
  -   return {
  -     status: 'blocked',
  -     errors: [WorkspaceErrors.gitError(mainRepoPath, createResult.detail ?? 'Worktree creation failed')],
  -   };
  - }
  + if (createResult.status === 'branch-exists' || createResult.status === 'path-exists') {
  +   const refreshedSources = await this.fetchOrdinalSources(mainRepoPath);
  +   const refreshedPreview = await this.buildPreview(request.requestedName, mainRepoPath, refreshedSources);
  +   return {
  +     status: 'blocked',
  +     errors: [WorkspaceErrors.gitError(mainRepoPath, createResult.detail ?? 'Worktree creation conflict')],
  +     refreshedPreview,
  +   };
  + }
  ```

### FT-004: Harden bootstrap hook containment validation
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/services/worktree-bootstrap-runner.ts`
- **Issue**: The containment check uses `startsWith()` on the realpath, which can be bypassed by sibling `.chainglass-*` paths.
- **Fix**: Use a path-relative boundary check (`path.relative()` or equivalent) so only descendants of the real `.chainglass` directory are executable.
- **Patch hint**:
  ```diff
  + import path from 'node:path';
  - if (!realHookPath.startsWith(realChainglassDir)) {
  + const relative = path.relative(realChainglassDir, realHookPath);
  + if (relative.startsWith('..') || path.isAbsolute(relative)) {
        return { outcome: 'failed', logTail: 'Security: ...' };
      }
  ```

### FT-005: Restore the planned Phase 2 safety-critical test coverage
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/069-new-worktree/test/unit/workflow/workspace-service.test.ts`, `/Users/jordanknight/substrate/069-new-worktree/test/contracts/git-worktree-manager.contract.ts`, `/Users/jordanknight/substrate/069-new-worktree/test/contracts/git-worktree-manager.contract.test.ts`, `/Users/jordanknight/substrate/069-new-worktree/test/unit/workflow/git-worktree-manager.test.ts`, `/Users/jordanknight/substrate/069-new-worktree/test/unit/workflow/worktree-bootstrap-runner.test.ts`
- **Issue**: The high-risk preview/create, git-manager, and bootstrap behavior is either untested or covered only by a fake-only shape contract.
- **Fix**: Add manager/bootstrap unit tests, add preview/create orchestration tests, and run the contract suite against the real adapter with assertions for the new methods and blocked outcomes.
- **Patch hint**:
  ```diff
  + describe('previewCreateWorktree()', () => {
  +   it('returns refreshed naming and hook metadata', async () => { /* ... */ })
  + })
  + describe('createWorktree()', () => {
  +   it('blocks on dirty main before create', async () => { /* ... */ })
  +   it('returns refreshedPreview on naming conflict', async () => { /* ... */ })
  +   it('returns created with failed bootstrap status', async () => { /* ... */ })
  + })
  
  + gitWorktreeManagerContractTests('GitWorktreeManagerAdapter', () => createRealManager())
  ```

### FT-006: Reconcile the Phase 2 Domain Manifest with the actual diff
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-plan.md`
- **Issue**: Several touched Phase 2 files are missing from `## Domain Manifest`.
- **Fix**: Add every touched file to the manifest with the correct domain/classification/rationale.
- **Patch hint**:
  ```diff
  | `/Users/jordanknight/substrate/069-new-worktree/docs/domains/workspace/domain.md` | workspace | contract | Keep the workspace domain contracts and concepts in sync with the implementation |
  +| `/Users/jordanknight/substrate/069-new-worktree/docs/c4/README.md` | workspace | cross-domain | Keep the C4 navigation hub linked to the new workspace component diagram |
  +| `/Users/jordanknight/substrate/069-new-worktree/docs/domains/registry.md` | workspace | cross-domain | Register the newly extracted workspace domain |
  +| `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/container.ts` | workspace | cross-domain | Keep package-level DI aligned with the workspace create-worktree surface |
  +| `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/adapters/index.ts` | workspace | internal | Export the new git worktree manager adapter |
  +| `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/index.ts` | workspace | cross-domain | Re-export Phase 2 workspace surface for package consumers |
  +| `/Users/jordanknight/substrate/069-new-worktree/test/unit/workflow/worktree-name.test.ts` | workspace | internal | Verify naming allocator behavior |
  ```

## Medium / Low Fixes

### FT-007: Sync workspace domain docs and diagrams to Phase 2
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/069-new-worktree/docs/domains/workspace/domain.md`, `/Users/jordanknight/substrate/069-new-worktree/docs/domains/domain-map.md`, `/Users/jordanknight/substrate/069-new-worktree/docs/c4/components/workspace.md`
- **Issue**: The workspace docs introduce the domain, but they do not yet describe the new Phase 2 internals and updated contract surface.
- **Fix**: Add a Plan 069 Phase 2 history row, include `worktree-name.ts` / `WorktreeBootstrapRunner` in Composition and Source Location, advertise `IGitWorktreeManager` in the domain map, and expand the workspace C4 diagram with the new internal components and relationships.
- **Patch hint**:
  ```diff
  - | `WorkspaceService` | Lifecycle facade for register/list/remove/info/context/preferences/create-worktree | ... |
  + | `WorkspaceService` | Lifecycle facade for register/list/remove/info/context/preferences/create-worktree | ... |
  + | `WorktreeName` allocator | Computes canonical ordinal names from branch/plan inputs | `IGitWorktreeManager` reads |
  + | `WorktreeBootstrapRunner` | Detects, validates, and executes `.chainglass/new-worktree.sh` | `IProcessManager`, `IFileSystem` |
  + | `GitWorktreeManagerAdapter` | Preflight-checks, syncs, and creates worktrees | `IProcessManager` |
  ```

### FT-008: Bring the execution log evidence in line with verified results
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-2-implement-workspace-orchestration/execution.log.md`
- **Issue**: The log claims broader test/manual coverage than the review could verify from concrete transcripts.
- **Fix**: Attach exact command output / CI references for the broader checks, or narrow the evidence section to the verified commands/results.
- **Patch hint**:
  ```diff
  - - Full suite: **356 test files passed, 5014 tests passed, 0 failures**
  + - Command: `pnpm test`
  + - Result: [paste exact verified output or CI link]
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
