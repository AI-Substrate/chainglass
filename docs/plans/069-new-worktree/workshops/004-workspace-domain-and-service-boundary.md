# Workshop: Workspace Domain and Service Boundary

**Type**: Integration Pattern / Architecture Rules
**Plan**: 069-new-worktree
**Spec**: Pending — no spec file exists yet for this plan
**Created**: 2026-03-07T08:27:39.348Z
**Status**: Draft

**Related Documents**:
- [Research Dossier](../research-dossier.md)
- [001-new-worktree-naming-and-post-create-hook.md](./001-new-worktree-naming-and-post-create-hook.md)
- [002-main-sync-strategy-and-git-safety.md](./002-main-sync-strategy-and-git-safety.md)
- [003-create-flow-ux-and-recovery-states.md](./003-create-flow-ux-and-recovery-states.md)

**Domain Context**:
- **Primary Domain**: Proposed `workspace` domain centered in `packages/workflow`
- **Related Domains**: `file-browser`, `_platform/workspace-url`, `_platform/auth`

---

## Purpose

This workshop defines where the new worktree feature lives across web, workflow, and git infrastructure layers.

It prevents a common failure mode for this feature: letting sidebar code, Next.js pages, or git helpers absorb business logic that belongs in the workspace domain.

## Key Questions Addressed

- Which layer owns worktree creation as a business capability?
- Where should preview generation, naming allocation, sync policy, and hook execution live?
- Should we extend `IWorkspaceService`, `IGitWorktreeResolver`, or create new contracts?
- Which results belong in the domain layer versus the web layer?
- What file/module boundaries should architecture preserve?

---

## Decision Summary

| Topic | Recommendation | Why |
|------|----------------|-----|
| Public business entry point | Extend `IWorkspaceService` with worktree preview + create methods | Worktree creation is workspace lifecycle behavior |
| UI ownership | `apps/web` owns route, form, pending/error UI, and redirect | This is adapter/presentation work, not domain logic |
| Naming allocation | Workspace-domain internal helper/module | It is business policy tied to repo convention |
| Main sync policy | Workspace service orchestration over a git mutation contract | Sync rules are business decisions expressed through git operations |
| Read-only git discovery | Keep `IGitWorktreeResolver` read-only | The existing name and contract already fit detection/resolution |
| Mutating git operations | Add a new `IGitWorktreeManager` infrastructure contract | Creation/sync is a separate concern from discovery |
| Hook execution | Workspace-domain internal runner/adapter using `IProcessManager` | Hook policy belongs to workspace lifecycle, not to UI or generic git resolver |
| Redirect URL building | Keep in web layer via `_platform/workspace-url` | `packages/workflow` must not depend on `apps/web` |
| Sidebar refresh | Web concern, solved by navigation/remount strategy | Domain should return data, not UI cache instructions |

---

## Current Boundary Problem

Today the pieces exist, but the ownership line is incomplete:

- `DashboardSidebar` owns the visible Worktrees UI
- `WorkspaceNav` owns client-side list fetching and rendering
- `workspace-actions.ts` owns auth, form-action wiring, and cache revalidation
- `WorkspaceService` owns workspace lifecycle and context resolution
- `GitWorktreeResolver` owns read-only worktree discovery

What is missing is a clear home for **write-side worktree lifecycle**:

- preview a new worktree name
- sync main safely
- allocate final ordinal
- create branch + worktree
- run optional bootstrap hook
- return structured outcome

Without a boundary decision, the logic will sprawl across page code, actions, and git helpers.

---

## Recommended Layer Map

```mermaid
graph TD
    UI[DashboardSidebar / NewWorktreePage / Form]
    ACT[workspace-actions.ts]
    WS[IWorkspaceService / WorkspaceService]
    NAME[Worktree naming allocator]
    GITR[IGitWorktreeResolver]
    GITW[IGitWorktreeManager]
    HOOK[Workspace hook runner]
    PM[IProcessManager]
    URL[workspaceHref()]

    UI --> ACT
    ACT --> WS
    ACT --> URL
    WS --> NAME
    WS --> GITR
    WS --> GITW
    WS --> HOOK
    GITW --> PM
    HOOK --> PM
```

### Ownership by layer

| Layer | Owns | Does NOT Own |
|------|------|--------------|
| `apps/web` page/components | route, forms, copy, pending state, navigation, sidebar affordance | naming policy, git safety policy, hook policy |
| `workspace-actions.ts` | auth, Zod parsing, DI resolution, `useActionState` result shape, `revalidatePath()` | raw git commands, ordinal logic |
| `WorkspaceService` | orchestration and business rules | URL building, JSX, sidebar cache concerns |
| `IGitWorktreeResolver` | detection (`detectWorktrees`, `getMainRepoPath`) | fetch, pull, branch, worktree add |
| `IGitWorktreeManager` | sync + create mutations | UI messages, domain decision policy |
| Hook runner | secure execution of `.chainglass/new-worktree.sh` | sidebar behavior, URL decisions |

---

## Public Contracts

### Recommendation: extend `IWorkspaceService`

Do **not** add a new top-level public service for this feature yet.

Reason:

- the feature is still fundamentally about workspace lifecycle
- the service already owns workspace add/list/remove/getInfo/resolveContext
- keeping one public service avoids needless indirection in both CLI and web adapters

### Recommended additions

```ts
interface PreviewCreateWorktreeRequest {
  workspaceSlug: string;
  requestedName: string;
}

interface PreviewCreateWorktreeResult {
  success: boolean;
  errors: WorkspaceError[];
  preview?: WorktreeNamePreview;
  hookDetected?: boolean;
  mainRepoPath?: string;
}

interface CreateWorktreeRequest {
  workspaceSlug: string;
  requestedName: string;
}

interface CreateWorktreeResult {
  success: boolean;
  errors: WorkspaceError[];
  branchName?: string;
  worktreePath?: string;
  bootstrapStatus?: 'skipped' | 'succeeded' | 'failed';
  bootstrapLogTail?: string[];
}

interface IWorkspaceService {
  previewCreateWorktree(
    request: PreviewCreateWorktreeRequest
  ): Promise<PreviewCreateWorktreeResult>;

  createWorktree(
    request: CreateWorktreeRequest
  ): Promise<CreateWorktreeResult>;
}
```

### Why preview belongs here too

Workshop 003 recommends a best-effort preview card. That preview still depends on:

- workspace resolution
- main repo path
- naming policy
- hook detection

Those are workspace-domain concerns, not page concerns.

---

## Git Contract Split

### Keep `IGitWorktreeResolver` read-only

The existing resolver is correctly named for:

- discovering worktrees
- finding the main repo path
- resolving whether a path is main or linked worktree

It should stay focused on read-side behavior.

### Add `IGitWorktreeManager` for mutations

Recommended new infrastructure contract:

```ts
interface BranchDivergence {
  ahead: number;
  behind: number;
}

interface GitMutationResult {
  success: boolean;
  stderr?: string;
}

interface IGitWorktreeManager {
  getCurrentBranch(repoPath: string): Promise<string | null>;
  hasTrackedChanges(repoPath: string): Promise<boolean>;
  hasInProgressOperation(repoPath: string): Promise<boolean>;
  fetchMain(repoPath: string): Promise<GitMutationResult>;
  compareMainToOrigin(repoPath: string): Promise<BranchDivergence | null>;
  fastForwardMain(repoPath: string): Promise<GitMutationResult>;
  createWorktree(
    repoPath: string,
    args: { branchName: string; worktreePath: string; baseRef: string }
  ): Promise<GitMutationResult>;
}
```

### Why a new contract is better than extending the resolver

| Option | Verdict | Why |
|--------|---------|-----|
| Extend `IGitWorktreeResolver` | Reject | Turns a read-side resolver into a generic git kitchen sink |
| Add `IGitWorktreeManager` | Recommend | Cleanly separates discovery from mutation |
| Put raw git in `WorkspaceService` | Reject | Would make the business service process-aware and harder to test |

---

## Hook Execution Boundary

Workshop 001 settled the hook policy. This workshop settles where it lives.

### Recommendation

Keep hook policy in the workspace domain, but do not make it a broad shared platform contract yet.

#### Good split

- `WorkspaceService`
  - decides whether the hook should run
  - decides which script path is authoritative
  - interprets hook failure as non-blocking

- hook runner helper / adapter
  - runs `bash <hookPath>`
  - sets `cwd` and env
  - captures stdout/stderr
  - applies timeout

### Why not put the hook in the git manager

The hook is not a git concern.

It is:

- repo policy
- lifecycle policy
- post-create bootstrap behavior

Those decisions belong next to `createWorktree()`, not inside a git abstraction.

---

## Web Adapter Responsibilities

### `workspace-actions.ts`

The new action should own:

- `requireAuth()`
- Zod validation of `requestedName`
- DI resolution of `IWorkspaceService`
- mapping domain errors into `CreateWorktreePageState`
- `revalidatePath('/workspaces')` and workspace-specific revalidation
- deriving redirect URL via `workspaceHref()`

### What the action should NOT own

- git command order
- main sync policy
- ordinal scanning
- hook path resolution
- hook environment contract

That logic must stay in `packages/workflow`.

---

## Redirect Ownership

This workshop intentionally refines a tentative idea from Workshop 001.

### Rule

`packages/workflow` returns **domain data**, not web URLs.

That means `CreateWorktreeResult` should include:

- `branchName`
- `worktreePath`
- `bootstrapStatus`

And the web layer should derive:

```ts
const redirectTo = workspaceHref(workspaceSlug, '/browser', {
  worktree: result.worktreePath,
});
```

### Why

`workspaceHref()` lives in `_platform/workspace-url`, which is an `apps/web` concern.

Letting `packages/workflow` return redirect URLs would invert the domain dependency direction.

---

## Sidebar and File Browser Boundary

The `file-browser` domain is a consumer of created worktrees, not the owner of creation logic.

### `file-browser` may own

- sidebar plus-button rendering
- worktree list refresh implications
- landing experience in `/browser`
- worktree identity presentation after redirect

### `file-browser` must not own

- name allocation
- main sync safety
- hook execution
- raw git subprocess behavior

This keeps the business rule in one place even if the UI entry point later moves.

---

## Suggested File-Level Placement

### Web layer

| File | Responsibility |
|------|----------------|
| `apps/web/app/(dashboard)/workspaces/[slug]/new-worktree/page.tsx` | Full-page route |
| `apps/web/src/components/workspaces/new-worktree-form.tsx` | `useActionState` form |
| `apps/web/app/actions/workspace-actions.ts` | Preview/create action adapters |
| `apps/web/src/components/dashboard-sidebar.tsx` | Inline plus affordance |
| `apps/web/src/components/workspaces/workspace-nav.tsx` | Post-create consumption / no creation logic |

### Workspace domain

| File | Responsibility |
|------|----------------|
| `packages/workflow/src/interfaces/workspace-service.interface.ts` | Add preview/create contracts |
| `packages/workflow/src/services/workspace.service.ts` | Orchestrate preview/create |
| `packages/workflow/src/services/worktree-name.ts` | Normalize + allocate naming helpers |
| `packages/workflow/src/interfaces/git-worktree-manager.interface.ts` | New mutating git contract |
| `packages/workflow/src/adapters/git-worktree-manager.ts` or `resolvers/git-worktree-manager.ts` | Real implementation |
| `packages/workflow/src/services/worktree-bootstrap-runner.ts` | Hook execution helper |

This can be refactored later into a formal `workspace` domain folder, but the logical ownership should be preserved now.

---

## Architecture Options Compared

### Option A: Keep everything in the Server Action

**Reject**

Problems:

- business logic lives in web layer
- hard to test without Next.js-specific harnesses
- duplicates logic if CLI ever needs creation later
- violates the existing service-oriented boundary

### Option B: Extend `IWorkspaceService` and add a git mutator contract

**Recommend**

Benefits:

- matches current lifecycle ownership
- centralizes policy
- keeps web layer thin
- maintains DI/testability

### Option C: New standalone `IWorktreeCreationService`

**Not now**

This may become justified later if worktree lifecycle grows large enough to split from generic workspace lifecycle.

For v1, it introduces more public surface than needed.

---

## Tests by Boundary

### Workspace service tests

- preview happy path
- create happy path
- create with blocking sync error
- create with bootstrap warning
- domain error mapping

### Git manager tests

- current branch detection
- tracked-change detection
- divergence parsing
- ff-only success/failure
- worktree add success/failure

### Web action tests

- input validation
- auth guard
- page-state mapping
- redirect URL derivation

### UI tests

- plus button visibility
- full-page form render
- pending state
- bootstrap warning card

---

## Open Questions

### Q1: Should the hook runner be a public DI contract from day one?

**RESOLVED**: Not necessarily. Start as a workspace-domain helper/adapter unless another feature needs to call it independently.

### Q2: Should preview and create be separate public methods?

**RESOLVED**: Yes. Workshop 003 needs a best-effort preview surface, and create needs a stricter submit-time contract.

### Q3: Should `IGitWorktreeResolver` absorb write operations to avoid a new interface?

**RESOLVED**: No. Keep read-side and write-side git responsibilities separate.

### Q4: Should redirect URL generation happen in the domain result?

**RESOLVED**: No. Redirect belongs to the web adapter because `workspaceHref()` lives in `apps/web`.

---

## Quick Reference

### One-sentence boundary rule

```text
UI asks -> action validates -> workspace service decides -> git manager mutates -> web layer redirects
```

### Keep in workspace domain

- preview generation
- naming rules
- main sync policy
- worktree creation orchestration
- hook policy

### Keep in web layer

- route
- form
- banners/warnings
- redirect URL
- sidebar remount strategy

### Keep in git infrastructure

- fetch
- compare
- ff-only pull
- branch/worktree add

---

## Recommendation to Carry Forward

Treat this feature as the first explicit **workspace-domain lifecycle mutation** after basic workspace CRUD.

If we keep the boundary clean now, future worktree features can reuse the same structure:

- preview
- create
- remove
- bootstrap
- sync / inspect

If we blur the boundary now, every later worktree change will fight UI, action, and git code spread across three layers.
