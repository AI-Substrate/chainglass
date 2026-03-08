# Domain: Workspace

**Slug**: workspace
**Type**: business
**Created**: 2026-03-07
**Created By**: extracted from existing codebase (Plan 069)
**Status**: active
**C4 Diagram**: [C4 Component](../../c4/components/workspace.md)

## Purpose

Workspace lifecycle and identity management. This domain registers named workspace roots, resolves which workspace and worktree a request is operating in, discovers git worktree topology, and stores workspace- and worktree-level preferences that other features rely on for consistent behavior.

Without this domain, every workspace-scoped feature would need to reimplement path resolution, worktree lookup, and preference persistence. Formalizing it gives future plans a single place to discuss canonical-main behavior, worktree lifecycle rules, and shared workspace identity.

## Concepts

| Concept | Entry Point | What It Does |
|---------|-------------|-------------|
| Register and manage workspaces | `IWorkspaceService` | Adds, lists, removes, and inspects registered workspaces. |
| Resolve active workspace context | `IWorkspaceContextResolver` | Turns a path or slug/worktree selection into the active workspace/worktree context. |
| Discover worktree topology | `IGitWorktreeResolver` | Detects linked worktrees and identifies the canonical main checkout. |
| Create worktree from canonical main | `IWorkspaceService.createWorktree` | Previews and creates new git worktrees from refreshed local main with ordinal naming and optional bootstrap hook. |
| Mutate git worktree state | `IGitWorktreeManager` | Preflight-checks, syncs, and creates git worktrees — the write-side counterpart to the read-only resolver. |
| Customize workspace and worktree identity | `IWorkspaceService.updatePreferences` | Persists emoji, color, starring, ordering, and per-worktree visual preferences. |

### Register and Manage Workspaces

This is the main lifecycle facade consumers reach for first. It handles registration, listing, removal, info lookup, and the web-safe `resolveContextFromParams()` path that routes and actions use to derive trusted workspace scope.

```typescript
import { WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';

const workspaceService = container.resolve<IWorkspaceService>(WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE);
const result = await workspaceService.add('Chainglass', '/Users/me/chainglass');
```

### Resolve Active Workspace Context

Consumers use this when they need to answer “which workspace/worktree is this path or request targeting?” It is the domain’s scoping primitive for workspace-aware features, and it keeps path matching rules consistent across the app.

```typescript
const resolver = container.resolve<IWorkspaceContextResolver>(
  WORKSPACE_DI_TOKENS.WORKSPACE_CONTEXT_RESOLVER
);
const ctx = await resolver.resolveFromPath(process.cwd());
```

### Discover Worktree Topology

This concept abstracts git-specific worktree detection away from callers. It handles porcelain parsing, version gating, and main-repo detection so higher layers can reason about worktrees without shelling out directly.

```typescript
const gitResolver = container.resolve<IGitWorktreeResolver>(
  WORKSPACE_DI_TOKENS.GIT_WORKTREE_RESOLVER
);
const mainRepoPath = await gitResolver.getMainRepoPath(currentPath);
const worktrees = await gitResolver.detectWorktrees(mainRepoPath ?? currentPath);
```

### Customize Workspace and Worktree Identity

Workspace-scoped UI and settings depend on this concept to keep names, emoji, color, starring, ordering, and per-worktree overrides in one place. The same persisted preference shape is reused by settings pages, workspace cards, sidebar nav, and worktree identity UI.

```typescript
await workspaceService.updatePreferences('chainglass', {
  starred: true,
  worktreePreferences: {
    [worktreePath]: { emoji: '🌿', color: 'green', terminalTheme: 'dark' },
  },
});
```

### Create Worktree from Canonical Main

This concept owns the full lifecycle of creating a new git worktree: previewing the computed name/path, syncing canonical main, allocating the next ordinal, creating the worktree, and optionally running the bootstrap hook. The result is a discriminated union that lets callers distinguish a successful creation (with informational bootstrap status) from a blocked attempt (with structured errors).

```typescript
const preview = await workspaceService.previewCreateWorktree({
  workspaceSlug: 'chainglass',
  requestedName: 'my-feature',
});
// preview.branchName → "069-my-feature", preview.worktreePath → "/repos/069-my-feature"

const result = await workspaceService.createWorktree({
  workspaceSlug: 'chainglass',
  requestedName: 'my-feature',
});
if (result.status === 'created') {
  // result.worktreePath, result.branchName, result.bootstrapStatus.outcome
}
```

### Mutate Git Worktree State

This concept separates git write operations from the read-only worktree resolver. It handles preflight checks on the main branch, fetching and fast-forwarding from origin, and the actual `git worktree add` command. The service orchestrator calls these methods in sequence; the manager stays focused on git plumbing.

```typescript
const manager = container.resolve<IGitWorktreeManager>(
  WORKSPACE_DI_TOKENS.GIT_WORKTREE_MANAGER
);
const status = await manager.checkMainStatus(mainRepoPath);
if (status.status === 'clean') {
  await manager.syncMain(mainRepoPath);
  await manager.createWorktree(mainRepoPath, '069-my-feature', '/repos/069-my-feature');
}
```

## Boundary

### Owns
- Workspace registration and unregistration lifecycle
- Workspace entity state, preference defaults, slug generation, and immutable preference updates
- Workspace/worktree context resolution from filesystem paths and URL/worktree selections
- Git worktree discovery and canonical main-checkout identification
- Workspace-scoped preference storage for visual identity, starring, ordering, SDK settings, and per-worktree overrides
- Workspace pages, sidebar/worktree navigation, API routes, server actions, and CLI commands that directly expose workspace lifecycle behavior
- Client-side workspace identity publishing via `WorkspaceProvider` and `useWorkspaceContext`

### Does NOT Own
- URL construction and search-param parsing for workspace routes — owned by `_platform/workspace-url`
- File browsing, editing, diffing, and browser landing experiences — owned by `file-browser`
- Workflow, work unit, sample, terminal, and agent payloads — those domains consume `WorkspaceContext` but own their own data and actions
- Generic SSE transport and worktree activity aggregation — owned by `_platform/events` or the consuming business domain
- Generic workspace-scoped storage helpers such as `workspace-data-adapter-base` — shared infrastructure used by multiple domains
- Raw filesystem and process primitives — consumed via infrastructure adapters, not owned as workspace business logic

## Contracts (Public Interface)

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `IWorkspaceService` | Interface | Web pages, server actions, API routes, CLI commands, workflow/workunit/file actions | Primary lifecycle facade for register/list/remove/info/context/preferences/create-worktree |
| `IWorkspaceContextResolver` | Interface | DI containers, contract tests, future workspace orchestration flows | Resolves workspace/worktree scope from filesystem paths or slugs |
| `IGitWorktreeResolver` | Interface | `WorkspaceService`, `WorkspaceContextResolver`, DI containers, contract tests | Detects worktree topology and canonical main repository path |
| `IGitWorktreeManager` | Interface | `WorkspaceService` (Phase 2), DI containers, contract tests | Preflight-checks, syncs, and creates git worktrees — write-side counterpart to resolver |
| `WorkspaceContext`, `WorkspaceInfo`, `Worktree` | Types | workflow-ui, 058-workunit-editor, samples, agents, API routes | Typed representation of active workspace/worktree scope and discovered topology |
| `CreateWorktreeResult`, `PreviewCreateWorktreeResult`, `BootstrapStatus` | Types | Web server actions, new-worktree page (Phase 3) | Discriminated union result types for worktree creation lifecycle |
| `Workspace`, `WorkspacePreferences`, `WorktreeVisualPreferences` | Entity + types | Workspace pages, file-browser identity UI, settings/worktree popovers | Persisted workspace metadata and visual/worktree preference state |
| `WorkspaceProvider`, `useWorkspaceContext` | React provider + hook | file-browser, terminal, dashboard sidebar, workspace attention wrapper | Publishes current workspace/worktree identity into the client tree |
| `WORKSPACE_EMOJI_PALETTE`, `WORKSPACE_COLOR_PALETTE` | Constants | EmojiPicker, ColorPicker, settings UIs | Curated visual identity palette for workspace preferences |

## Composition (Internal)

| Component | Role | Depends On |
|-----------|------|------------|
| `WorkspaceService` | Lifecycle facade for register/list/remove/info/context/preferences/create-worktree | `IWorkspaceRegistryAdapter`, `IWorkspaceContextResolver`, `IGitWorktreeResolver`, `IGitWorktreeManager`, `WorktreeBootstrapRunner` |
| `WorkspaceContextResolver` | Maps paths to workspace/worktree context with longest-match behavior | `IWorkspaceRegistryAdapter`, `IGitWorktreeResolver`, `IFileSystem` |
| `GitWorktreeResolver` | Runs git commands and parses worktree porcelain output | `IProcessManager` |
| `GitWorktreeManagerAdapter` | Runs git write commands for preflight, sync, worktree creation, and branch/plan listing | `IProcessManager` |
| `WorktreeNameAllocator` | Pure functions for slug normalization, ordinal scanning, and name building | None (pure functions, receives data as input) |
| `WorktreeBootstrapRunner` | Detects, validates, and executes `.chainglass/new-worktree.sh` post-create hook | `IProcessManager`, `IFileSystem` |
| `WorkspaceRegistryAdapter` | Persists global workspace registry and preference updates | `IFileSystem`, `IPathResolver` |
| `Workspace` entity | Defines metadata, slugging, defaults, and immutable preference updates | `slugify`, workspace palette constants |
| Workspace pages + nav | Render workspace list/detail/worktree switching surfaces | `IWorkspaceService`, `workspaceHref`, `WorkspaceProvider` |
| Workspace actions + routes | Handle authenticated mutations and workspace JSON responses | `IWorkspaceService`, `requireAuth`, `revalidatePath` |
| `WorkspaceProvider` | Derives active worktree identity from persisted preferences | `WorkspacePreferences`, `WorktreeVisualPreferences` |
| CLI workspace commands | Expose add/list/info/remove from terminal workflows | `IWorkspaceService` |

## Source Location

Primary: `packages/workflow/src/` + `apps/web/app/(dashboard)/workspaces/` + `apps/web/src/components/workspaces/` + `apps/web/src/features/041-file-browser/hooks/use-workspace-context.tsx` + `apps/cli/src/commands/`

| File | Role | Notes |
|------|------|-------|
| `packages/workflow/src/entities/workspace.ts` | Workspace entity + preferences | Slug generation, defaults, immutable preference updates |
| `packages/workflow/src/interfaces/workspace-service.interface.ts` | Service contract | Main public lifecycle interface |
| `packages/workflow/src/interfaces/workspace-context.interface.ts` | Context + worktree contracts | `WorkspaceContext`, `WorkspaceInfo`, `Worktree`, resolver contract |
| `packages/workflow/src/interfaces/git-worktree-resolver.interface.ts` | Git worktree contract | Public abstraction for worktree discovery |
| `packages/workflow/src/interfaces/git-worktree-manager.interface.ts` | Git worktree mutation contract | Public abstraction for worktree creation (Plan 069) |
| `packages/workflow/src/interfaces/workspace-registry-adapter.interface.ts` | Registry adapter contract | Persistence boundary for workspace registry |
| `packages/workflow/src/services/workspace.service.ts` | Domain service | Register/list/remove/info/context/preferences/create-worktree |
| `packages/workflow/src/services/worktree-name.ts` | Naming allocator | Pure functions for ordinal allocation and slug normalization (Plan 069) |
| `packages/workflow/src/services/worktree-bootstrap-runner.ts` | Bootstrap runner | Detects, validates, and executes post-create hook (Plan 069) |
| `packages/workflow/src/resolvers/workspace-context.resolver.ts` | Context resolver | Path-to-workspace/worktree lookup |
| `packages/workflow/src/resolvers/git-worktree.resolver.ts` | Git adapter (read) | `git worktree list --porcelain`, `rev-parse` |
| `packages/workflow/src/adapters/git-worktree-manager.adapter.ts` | Git adapter (write) | Preflight, sync, create worktree, branch listing (Plan 069) |
| `packages/workflow/src/adapters/workspace-registry.adapter.ts` | Registry persistence | Stores `~/.config/chainglass/workspaces.json` |
| `packages/workflow/src/errors/workspace-errors.ts` | Domain errors | Workspace/worktree-specific error codes |
| `packages/workflow/src/constants/workspace-palettes.ts` | Visual identity constants | Curated emoji/color sets |
| `apps/web/app/actions/workspace-actions.ts` | Workspace actions | Add/remove workspace, worktree star, identity preference updates |
| `apps/web/app/actions/sdk-settings-actions.ts` | Preference persistence bridge | Stores workspace-scoped SDK settings and MRU |
| `apps/web/app/api/workspaces/route.ts` | Workspace list API | Optional `?include=worktrees` enrichment |
| `apps/web/app/api/workspaces/[slug]/route.ts` | Workspace detail API | Full workspace info by slug |
| `apps/web/app/(dashboard)/workspaces/page.tsx` | Workspace list page | Server-rendered list + add form |
| `apps/web/app/(dashboard)/workspaces/[slug]/page.tsx` | Workspace detail page | Worktree list, metadata, navigation entrypoint |
| `apps/web/src/components/workspaces/workspace-nav.tsx` | Sidebar/worktree navigation | Workspace and worktree switching UI |
| `apps/web/src/components/workspaces/workspace-add-form.tsx` | Registration form | Client mutation surface for add |
| `apps/web/src/components/workspaces/workspace-remove-button.tsx` | Removal UI | Client mutation surface for remove |
| `apps/web/src/features/041-file-browser/hooks/use-workspace-context.tsx` | Client provider + hook | Workspace/worktree identity bridge |
| `apps/cli/src/commands/workspace.command.ts` | CLI controller | `cg workspace add/list/info/remove` |

## Dependencies

### This Domain Depends On
- `_platform/file-ops` — `IFileSystem`, `IPathResolver` for registry I/O and path checks
- `_platform/workspace-url` — `workspaceHref`, `workspaceParams` for workspace-scoped web links and worktree selection
- `_platform/auth` — `requireAuth` and authenticated workspace pages/actions
- Shared process-manager infrastructure — git command execution for worktree discovery (not yet formalized as a standalone domain)

### Domains That Depend On This
- `file-browser` — resolves workspace/worktree context, visual preferences, and client identity
- `workflow-ui` — scopes workflow mutations and route actions with `WorkspaceContext`
- `058-workunit-editor` — validates worktree selection against `WorkspaceInfo` and `WorkspaceContext`
- `terminal` — consumes workspace identity and workspace-scoped page loading
- `agents` — uses workspace/worktree context for scoped agent pages and session lookup

## History

| Plan | What Changed | Date |
|------|-------------|------|
| *(extracted)* | Domain formalized from existing registry, context resolution, worktree discovery, pages, nav, and provider hooks | 2026-03-07 |
| Plan 069 | Workspace named as the business domain for new worktree creation planning | 2026-03-07 |
| Plan 069 Phase 1 | Added IGitWorktreeManager interface, preview/create types on IWorkspaceService, FakeGitWorktreeManager, contract test scaffold, DI token | 2026-03-07 |
| Plan 069 Phase 2 | Implemented naming allocator, GitWorktreeManagerAdapter, WorktreeBootstrapRunner, full create-worktree orchestration in WorkspaceService, DI wiring in all containers | 2026-03-07 |
