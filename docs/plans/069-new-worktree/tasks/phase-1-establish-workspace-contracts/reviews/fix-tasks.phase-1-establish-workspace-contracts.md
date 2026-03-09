# Fix Tasks: Phase 1: Establish Workspace Contracts

Apply in order. Re-run review after fixes.

## Critical / High Fixes

### FT-001: Add typed blocked/error path to the preview contract
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/interfaces/workspace-service.interface.ts`, `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/interfaces/index.ts`, `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/index.ts`, `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/services/workspace.service.ts`
- **Issue**: `PreviewCreateWorktreeResult` is happy-path only, so expected preview failures cannot be returned as typed domain results.
- **Fix**: Redesign the preview surface as a discriminated result (or workspace-style `success/errors` wrapper), then update the barrel exports and temporary `WorkspaceService` stub to match the revised contract.
- **Patch hint**:
  ```diff
- export interface PreviewCreateWorktreeResult {
-   normalizedSlug: string;
-   ordinal: number;
-   branchName: string;
-   worktreePath: string;
-   hasBootstrapHook: boolean;
- }
+ export type PreviewCreateWorktreeResult =
+   | {
+       status: 'previewed';
+       normalizedSlug: string;
+       ordinal: number;
+       branchName: string;
+       worktreePath: string;
+       hasBootstrapHook: boolean;
+     }
+   | {
+       status: 'blocked';
+       errors: WorkspaceError[];
+     };
  ```

### FT-002: Turn the git-manager scaffold into a real parity contract
- **Severity**: HIGH
- **File(s)**: `/Users/jordanknight/substrate/069-new-worktree/test/contracts/git-worktree-manager.contract.ts`, `/Users/jordanknight/substrate/069-new-worktree/test/contracts/git-worktree-manager.contract.test.ts`
- **Issue**: The current suite only shape-checks `status`, so Phase 2 could ship a real adapter that misses the documented safety/conflict taxonomy and still passes the parity suite.
- **Fix**: Expand the shared contract tests to cover the documented blocked states (`dirty`, `ahead`, `diverged`, `lock-held`, `no-main-branch`), sync states (`synced`, `already-up-to-date`, `fetch-failed`, `fast-forward-failed`), create outcomes (`created`, `branch-exists`, `path-exists`, generic failure), and any shared error-propagation guarantees.
- **Patch hint**:
  ```diff
- it('should return a MainStatusResult from checkMainStatus', async () => {
-   const manager = createManager();
-   const result = await manager.checkMainStatus('/fake/repo');
-   expect(typeof result.status).toBe('string');
- });
+ it.each(['dirty', 'ahead', 'diverged', 'lock-held', 'no-main-branch'])(
+   'returns %s when the manager is arranged for that preflight state',
+   async (status) => {
+     await ctx.arrangeMainStatus(status);
+     await expect(ctx.createManager().checkMainStatus('/fake/repo'))
+       .resolves.toMatchObject({ status });
+   }
+ );
  ```

## Medium / Low Fixes

### FT-003: Sync the domain map with the Phase 1 write-side surface
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/069-new-worktree/docs/domains/domain-map.md`
- **Issue**: The workspace node and Domain Health Summary still document only the older read-side/public UI surface.
- **Fix**: Add `IGitWorktreeManager` and the preview/create worktree contract surface to the workspace node label and health-summary row.
- **Patch hint**:
  ```diff
- workspace["🗂️ workspace<br/>IWorkspaceService<br/>IWorkspaceContextResolver<br/>IGitWorktreeResolver<br/>useWorkspaceContext"]:::new
+ workspace["🗂️ workspace<br/>IWorkspaceService<br/>IGitWorktreeManager<br/>Preview/Create worktree types<br/>IWorkspaceContextResolver<br/>IGitWorktreeResolver<br/>useWorkspaceContext"]:::new
  ```

### FT-004: Update the workspace C4 component diagram for the mutation boundary
- **Severity**: MEDIUM
- **File(s)**: `/Users/jordanknight/substrate/069-new-worktree/docs/c4/components/workspace.md`
- **Issue**: The new diagram omits the worktree-creation mutation path and uses generic relationship verbs instead of concrete contracts.
- **Fix**: Add the mutation-side component(s) and relabel relationships with actual contracts / entry points from the workspace domain definition.
- **Patch hint**:
  ```diff
- Component(service, "WorkspaceService", "Domain Service", "Registers workspaces, resolves<br/>info/context, and updates<br/>workspace preferences")
- Component(gitResolver, "GitWorktreeResolver", "Git Adapter", "Discovers linked worktrees and<br/>canonical main checkout from git")
+ Component(service, "WorkspaceService", "Domain Service", "Registers workspaces, resolves<br/>info/context, updates preferences,<br/>and orchestrates create-worktree")
+ Component(gitResolver, "GitWorktreeResolver", "Git Adapter", "Discovers linked worktrees and<br/>canonical main checkout from git")
+ Component(gitManager, "GitWorktreeManagerAdapter", "Git Adapter", "Preflight-checks main,<br/>syncs canonical main,<br/>and creates worktrees")
...
- Rel(actionsRoutes, service, "Invokes")
- Rel(service, gitResolver, "Reads worktree state from")
+ Rel(actionsRoutes, service, "IWorkspaceService")
+ Rel(service, gitResolver, "IGitWorktreeResolver")
+ Rel(service, gitManager, "IGitWorktreeManager")
  ```

### FT-005: Repair phase traceability for touched public/doc surfaces
- **Severity**: LOW
- **File(s)**: `/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/new-worktree-plan.md`, `/Users/jordanknight/substrate/069-new-worktree/docs/plans/069-new-worktree/tasks/phase-1-establish-workspace-contracts/tasks.md`
- **Issue**: The phase diff touches `packages/workflow/src/index.ts`, `docs/domains/registry.md`, and `docs/c4/README.md`, but the Domain Manifest / task paths do not mention them.
- **Fix**: Add those files to the Domain Manifest and phase task dossier if they remain part of this phase, so the `no orphan files` check passes.
- **Patch hint**:
  ```diff
  | `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/interfaces/index.ts` | workspace | contract | Re-export new workspace contracts for consumers |
+ | `/Users/jordanknight/substrate/069-new-worktree/packages/workflow/src/index.ts` | workspace | cross-domain | Re-export new workspace contracts from the package entrypoint |
+ | `/Users/jordanknight/substrate/069-new-worktree/docs/domains/registry.md` | workspace | cross-domain | Register the workspace domain documentation update |
+ | `/Users/jordanknight/substrate/069-new-worktree/docs/c4/README.md` | workspace | cross-domain | Link the new workspace component diagram from the C4 hub |
  ```

## Re-Review Checklist

- [ ] All critical/high fixes applied
- [ ] Re-run `/plan-7-v2-code-review` and achieve zero HIGH/CRITICAL
