# Research Report: New worktree creation flow

**Generated**: 2026-03-07T07:55:15.273Z  
**Research Query**: "Research how to add an always-visible plus button next to Worktrees, open a full-page new-worktree flow, create a new worktree from `main` using the naming convention derived from `~/substrate/new-worktree.sh`, optionally run `.chainglass/new-worktree.sh` from the main worktree, and then navigate into the created worktree."  
**Mode**: Plan-Associated  
**Location**: `docs/plans/069-new-worktree/research-dossier.md`  
**FlowSpace**: Available  
**Harness**: Not found  
**Findings**: 60+ findings synthesized across implementation, dependency, pattern, testing, contract, documentation, prior-learning, and domain-boundary investigations

## Executive Summary

### What It Does
Today the app can discover, list, switch, and decorate existing git worktrees, but it cannot create them. Worktree navigation is driven by a shared `?worktree=` URL contract, a sidebar fetch to `/api/workspaces?include=worktrees`, and service-layer worktree discovery inside `packages/workflow`.

### Business Purpose
This feature would let a user stay inside Chainglass while spinning up a new branch/worktree from `main`, applying the existing ordinal naming convention, and immediately landing in the new worktree’s workspace-scoped UI. It closes a clear product gap between "I can see worktrees" and "I can bootstrap a new one from the product itself."

### Key Insights
1. **No create-worktree implementation exists today** — the repo only supports registration, detection, listing, and worktree-aware navigation.
2. **The safest post-create target is `/browser?worktree=...`** — the legacy `/worktree` route is now a redirect shim, and not every workspace page is truly worktree-aware.
3. **This feature exposes a missing workspace lifecycle boundary** — the sidebar should trigger the flow, but business logic belongs in a workspace/worktree management service, not in file-browser or panel-layout.

### Quick Stats
- **Primary files reviewed**: ~20 directly, plus plan/domain documents
- **Key service/interface layers**: workspace service, workspace context resolver, git worktree resolver, process manager, workspace URL helper
- **Test areas reviewed**: git worktree resolver, workspace context, worktree picker, worktree-aware action validation
- **Complexity**: Medium-High
- **Prior Learnings surfaced**: 10 directly relevant discoveries
- **Domains involved**: 4 existing domains directly, 1 missing-but-strongly-indicated workspace domain

## Harness Status

No `docs/project-rules/harness.md` exists in this repo, so there is no formal Boot → Interact → Observe agent harness documented for this feature area.

- **Observed validation state**:
  - FlowSpace code intelligence is available and was used for codebase research.
  - Next.js MCP servers were discoverable, but they did not provide a trustworthy, feature-specific runtime view for this branch during research.
  - No connected browser session was available for runtime error inspection.
- **Implication**: this report is grounded primarily in static code, domain docs, plan history, and test patterns rather than a validated live app session.
- **Workshop opportunity**: if this feature moves to implementation, consider running `/harness-v2 --create` so future work can validate the actual runtime flow end-to-end.

## How It Currently Works

### Entry Points

| Entry Point | Type | Location | Purpose |
|------------|------|----------|---------|
| Worktrees section in dashboard sidebar | UI composition | `apps/web/src/components/dashboard-sidebar.tsx` | Renders the current "Worktrees" group inside the workspace sidebar |
| WorkspaceNav client list | Client component | `apps/web/src/components/workspaces/workspace-nav.tsx` | Fetches workspace/worktree data and renders worktree rows, stars, and activity badges |
| Workspace detail page | Server page | `apps/web/app/(dashboard)/workspaces/[slug]/page.tsx` | Lists worktrees and provides links into workspace-scoped pages |
| Workspaces API | Route handler | `apps/web/app/api/workspaces/route.ts` | Returns workspace list, optionally enriched with worktrees and preferences |
| Workspace service | Service | `packages/workflow/src/services/workspace.service.ts` | Provides `getInfo()`, `resolveContext()`, and `resolveContextFromParams()` |
| Git worktree resolver | Infrastructure boundary | `packages/workflow/src/resolvers/git-worktree.resolver.ts` | Detects worktrees via `git worktree list --porcelain` |
| External naming reference | Script | `/Users/jordanknight/substrate/new-worktree.sh` | Shows current branch/worktree naming and creation convention outside the app |

### Core Execution Flow

1. **Sidebar or page needs worktree data**
   - Files:
     - `apps/web/src/components/workspaces/workspace-nav.tsx`
     - `apps/web/app/(dashboard)/workspaces/[slug]/page.tsx`
   - What happens:
     - `WorkspaceNav` issues a client fetch to `/api/workspaces?include=worktrees`.
     - The workspace detail page loads worktree info server-side through `workspaceService.getInfo(slug)`.

2. **The API enriches each workspace with worktree metadata**
   - File:
     - `apps/web/app/api/workspaces/route.ts`
   - What happens:
     - The route authenticates the user.
     - It calls `workspaceService.list()`.
     - When `include=worktrees`, it calls `workspaceService.getInfo(ws.slug)` for each workspace and serializes `worktrees`, `hasGit`, and preferences.

3. **Workspace service delegates worktree discovery**
   - Files:
     - `packages/workflow/src/services/workspace.service.ts`
     - `packages/workflow/src/interfaces/workspace-service.interface.ts`
   - What happens:
     - `getInfo()` delegates to the workspace context resolver.
     - `resolveContextFromParams(slug, worktreePath?)` maps the URL query param to a known worktree and builds `WorkspaceContext`.
   - Important caveat:
     - `resolveContextFromParams()` can still fall back to the main workspace path; Plan 062 introduced a stricter helper for mutations precisely because this behavior is unsafe for write flows.

4. **Git worktrees are discovered from the repo, not from registry persistence**
   - Files:
     - `packages/workflow/src/resolvers/git-worktree.resolver.ts`
     - `packages/workflow/src/interfaces/git-worktree-resolver.interface.ts`
   - What happens:
     - The resolver checks git version support.
     - It runs `git worktree list --porcelain`.
     - It parses each worktree block into a `Worktree` object.

5. **UI navigation is built around the shared `?worktree=` contract**
   - Files:
     - `apps/web/src/lib/workspace-url.ts`
     - `apps/web/src/lib/params/workspace.params.ts`
     - `docs/domains/_platform/workspace-url/domain.md`
   - What happens:
     - `workspaceHref()` constructs `/workspaces/{slug}/{subPath}?worktree={absolute-path}`.
     - The worktree path is the canonical selector for all workspace-scoped pages.

6. **Workspace-scoped pages consume the selected worktree**
   - Files:
     - `apps/web/app/(dashboard)/workspaces/[slug]/browser/page.tsx`
     - `apps/web/app/(dashboard)/workspaces/[slug]/samples/page.tsx`
     - `apps/web/app/(dashboard)/workspaces/[slug]/workflows/page.tsx`
     - `apps/web/app/(dashboard)/workspaces/[slug]/work-units/...`
   - What happens:
     - Pages read `searchParams.worktree`.
     - They load worktree-specific data or redirect if the param is missing, depending on feature maturity.

### Data Flow

```mermaid
graph LR
    A[DashboardSidebar / Workspace Detail] --> B[/api/workspaces?include=worktrees]
    B --> C[WorkspaceService.getInfo]
    C --> D[WorkspaceContextResolver]
    D --> E[GitWorktreeResolver]
    E --> F[git worktree list --porcelain]
    B --> G[WorkspaceNav rows]
    G --> H[workspaceHref with worktree query]
    H --> I[/workspaces/slug/browser?worktree=path]
    I --> J[WorkspaceProvider + BrowserPage]
```

### State Management

- **WorkspaceNav local state**
  - `workspaces`: client-side cached list from `/api/workspaces?include=worktrees`
  - `expanded`: expanded workspace slugs in the non-workspace sidebar view
  - `loading`: first-fetch status
- **Workspace-scoped context**
  - `WorkspaceProvider` in `[slug]/layout.tsx` provides workspace identity, worktree preferences, and client-side worktree identity updates
- **Worktree activity**
  - `useWorktreeActivity()` polls `/api/worktree-activity` every 30 seconds to decorate worktree rows with cross-worktree badges

## Architecture & Design

### Component Map

#### Core Components
- **DashboardSidebar** — `apps/web/src/components/dashboard-sidebar.tsx`
  - Responsibility: renders workspace chrome, tools, Worktrees section header, and footer actions
  - Why relevant: the requested plus button belongs here or immediately beneath it

- **WorkspaceNav** — `apps/web/src/components/workspaces/workspace-nav.tsx`
  - Responsibility: fetches workspace/worktree data and renders both sidebar worktree views
  - Why relevant: this is where worktree rows appear today and where post-create refresh pressure will land

- **WorkspaceAddForm** — `apps/web/src/components/workspaces/workspace-add-form.tsx`
  - Responsibility: canonical full-page create-form pattern using `useActionState`
  - Why relevant: best UI/action pattern to copy for a full-page new-worktree screen

- **WorkspaceService** — `packages/workflow/src/services/workspace.service.ts`
  - Responsibility: workspace lifecycle service for list/add/remove/info/context/preferences
  - Why relevant: most natural existing service boundary to extend with create-worktree orchestration

- **GitWorktreeResolver** — `packages/workflow/src/resolvers/git-worktree.resolver.ts`
  - Responsibility: git worktree discovery via `IProcessManager`
  - Why relevant: existing git abstraction closest to where create-worktree command support belongs

- **IProcessManager** — `packages/shared/src/interfaces/process-manager.interface.ts`
  - Responsibility: process spawning and exit management
  - Why relevant: app-wide command execution contract already used by git worktree detection

- **External naming scripts** — `/Users/jordanknight/substrate/new-worktree.sh`, `/Users/jordanknight/github/tools/scripts/plan-ordinal.py`
  - Responsibility: current out-of-app naming and sibling worktree convention
  - Why relevant: app must port or carefully wrap this behavior without shelling out to `new-worktree.sh`

### Design Patterns Identified

1. **Full-page creation, modal destruction**
   - `apps/web/app/(dashboard)/workspaces/page.tsx` uses a page-level creation form.
   - `workspace-remove-button.tsx` uses a modal for destructive confirmation.
   - Implication: the requested full-page new-worktree flow matches existing create patterns.

2. **Server Action + `useActionState`**
   - `workspace-actions.ts` + `workspace-add-form.tsx`
   - Pattern:
     - validate with Zod
     - preserve fields on error
     - return `ActionState`
     - `revalidatePath(...)` on success

3. **DI service + infra resolver split**
   - Web layer delegates to `IWorkspaceService`.
   - Workspace service delegates to context resolver / git resolver.
   - Git resolver delegates to `IProcessManager`.

4. **Canonical worktree routing contract**
   - Use `workspaceHref(slug, subPath, { worktree })`
   - Avoid inventing a second route parameter or path segment for active worktree selection

5. **Strict mutation validation precedents**
   - Plan 062 added a stricter worktree resolver for mutations because fallback-to-main caused real bugs
   - This is the right precedent for any create-worktree flow

### System Boundaries

- **Internal boundaries**
  - `apps/web`: page/layout/sidebar/action adapters
  - `packages/workflow`: workspace entities, services, context resolution, git worktree resolver
  - `packages/shared`: process abstraction and shared infrastructure

- **External interfaces**
  - Git CLI (`git worktree list`, eventually `git worktree add`)
  - External ordinal logic in `plan-ordinal.py`
  - Optional repo-local bootstrap hook `.chainglass/new-worktree.sh`

- **Integration points**
  - Sidebar worktree refresh
  - URL redirect into new worktree
  - Optional hook execution from the main worktree’s version of the script

## Dependencies & Integration

### What This Depends On

#### Internal Dependencies

| Dependency | Type | Purpose | Risk if Changed |
|------------|------|---------|-----------------|
| `_platform/workspace-url` | Required | Build canonical redirect URLs with `?worktree=` | Redirect/navigation breakage |
| `WorkspaceService` | Required | Workspace lifecycle + context/service entry point | No stable business API for creation |
| `GitWorktreeResolver` | Required | Git worktree command boundary | No safe git integration |
| `IProcessManager` | Required | Spawn git processes | Command execution failures |
| `DashboardSidebar` / `WorkspaceNav` | Required | Surface trigger + render created worktree | UX breakage or stale sidebar |
| `WorkspaceProvider` | Required | Display updated worktree identity after redirect | Header/title inconsistencies |

#### External Dependencies

| Service/Library | Version/Contract | Purpose | Criticality |
|-----------------|------------------|---------|-------------|
| Git CLI | `>= 2.13` | Worktree discovery today, creation tomorrow | High |
| `plan-ordinal.py` | External script, not in repo | Cross-branch ordinal computation reference | High if invoked directly, Medium if behavior is ported |
| Repo-local `.chainglass/new-worktree.sh` | Optional shell hook | Post-create bootstrap | Medium |
| Filesystem | Absolute path + sibling worktree layout | Create worktree path, inspect hook, optional file copy/bootstrap | High |

### What Depends on This

#### Direct Consumers

| Consumer | Current relationship | Implication after create |
|----------|----------------------|--------------------------|
| `WorkspaceNav` | Displays worktree rows from one client fetch | Must refresh or remount to show new worktree |
| Workspace detail page | Lists worktrees from `workspaceService.getInfo()` | Should reflect new worktree after revalidation |
| Browser page | Reads `?worktree=` and loads selected worktree | Best post-create landing target |
| Samples / Workflows / Work Units | Use the same `?worktree=` contract | Must continue to receive canonical new worktree path |
| Worktree activity API | Validates worktree paths against known worktrees | New worktree becomes discoverable once listed |

#### Indirect Consumers

- `WorkspaceProvider` and the sidebar header: updated branch/title once redirected
- Terminal/activity overlays: worktree-scoped defaults if the new worktree becomes the active context
- Any future worktree-scoped feature that depends on `WorkspaceInfo.worktrees[]`

### Integration Architecture

The cleanest architecture is:

1. **UI trigger** in `DashboardSidebar` or `WorkspaceNav`
2. **Full-page route** under `/workspaces/[slug]/...`
3. **Server Action or route handler** in web layer for auth/validation
4. **New workspace-domain service method** on `IWorkspaceService`
5. **Git execution** delegated to `IGitWorktreeResolver` + `IProcessManager`
6. **Redirect** via `workspaceHref(slug, '/browser', { worktree: newPath })`

## Quality & Testing

### Current Test Coverage

- **Unit Tests**
  - `test/unit/workflow/git-worktree-resolver.test.ts`
    - Strong coverage for `git worktree list --porcelain` parsing and support checks
  - `test/unit/web/features/041-file-browser/worktree-picker.test.tsx`
    - Covers filter, select, and star patterns for worktree list UI
  - `test/unit/web/features/041-file-browser/workspace-context.test.tsx`
    - Covers workspace/worktree identity context behavior
  - `test/unit/web/actions/workunit-actions-worktree.test.ts`
    - Covers strict worktree validation helper introduced in Plan 062

- **Integration / E2E History**
  - Plan 018 documented browser-verified navigation for worktree landing flows
  - Plan 062 documented Playwright verification for strict worktree-aware editor flows

### Test Strategy Analysis

Best patterns to reuse:

1. **Pure helper TDD**
   - Plan 062’s strict `resolveWorktreeContext()` tests are the best precedent for create-worktree validation helpers.

2. **Client form behavior tests**
   - `WorkspaceAddForm` and `WorktreePicker` show the preferred UI testing style for create flows and worktree list interaction.

3. **DI-backed service tests with fakes**
   - `GitWorktreeResolver` already uses fake process infrastructure; a create-worktree service can follow the same approach.

### Known Issues & Technical Debt

| Issue | Severity | Location | Impact |
|-------|----------|----------|--------|
| No create-worktree behavior exists | High | service/resolver/web layers | Entire feature must be added end-to-end |
| Sidebar uses one-shot client fetch | High | `workspace-nav.tsx` | Newly created worktree may not appear immediately |
| `resolveContextFromParams()` still falls back to main | High | `workspace.service.ts` | Unsafe precedent for mutations |
| No integration test for page → action → service → redirect creation flow | Medium | testing gap | Higher regression risk |
| Resolver behavior duplicated across features | Medium | workspace/workflow/workunit actions | Drift risk for future worktree-aware mutations |

### Performance Characteristics

- **Current list performance**: acceptable for discovery because sidebar fetches one enriched list and activity polling is separate
- **Likely bottlenecks for create flow**:
  - ordinal scan across branches if done dynamically
  - git worktree creation subprocess
  - optional post-create hook execution
- **Scalability consideration**:
  - sidebar refresh should avoid a heavy polling loop; a post-create targeted refresh is sufficient

## Modification Considerations

### ✅ Safe to Modify

1. **Add a dedicated full-page route under `[slug]`**
   - Existing route family already supports workspace-scoped pages
   - Low coupling to current behavior

2. **Add a create-worktree server action next to existing workspace actions**
   - Follows established auth/validation/revalidation pattern

3. **Add a plus affordance to the Worktrees section header**
   - The request maps cleanly to existing sidebar composition
   - The sidebar currently lacks this action, but the insertion point is obvious

### ⚠️ Modify with Caution

1. **`WorkspaceNav` refresh behavior**
   - Risk: new worktree not visible after success
   - Mitigation: explicitly refresh the sidebar state or remount the component after creation

2. **`resolveContextFromParams()`**
   - Risk: fallback-to-main behavior accidentally reused in a mutation path
   - Mitigation: use the Plan 062 strict-validation model for any creation-related write flow

3. **Legacy `/worktree` route**
   - Risk: placing the new page under a deprecated redirect segment will create confusing routing
   - Mitigation: create a sibling route such as `/workspaces/[slug]/new-worktree` or `/workspaces/[slug]/worktrees/new`

### 🚫 Danger Zones

1. **Putting git creation logic in client components**
   - Risk: security, auth, and OS command execution violations
   - Alternative: keep commands behind web action/service/resolver boundaries

2. **Silently falling back to `main` when target worktree is invalid**
   - Risk: writes happen in the wrong checkout
   - Alternative: strict validation + explicit error/redirect

3. **Running `.chainglass/new-worktree.sh` from the created worktree instead of `main`**
   - Risk: wrong script version, inconsistent bootstrap behavior
   - Alternative: resolve and execute the main worktree’s version only

4. **Depending permanently on external script paths**
   - Risk: environment-specific runtime dependency
   - Alternative: port naming/ordinal logic into a repo-owned service or adapter

### Extension Points

1. **`WorkspaceAddForm` pattern**
   - Best precedent for a full-page creation form using `useActionState`

2. **`WorktreePicker`**
   - Reusable if the page needs selection, preview, or comparison UI around worktrees

3. **`workspaceHref()`**
   - Best redirect builder for landing in the created worktree

4. **`IProcessManager` + `GitWorktreeResolver`**
   - Best extension seam for git command support

## Prior Learnings (From Previous Implementations)

These are the most relevant discoveries surfaced from prior plan work.

### 📚 Prior Learning PL-01: Worktree scope lives in `?worktree=`
**Source**: `docs/plans/018-agents-workspace-data-model/.../001-subtask-worktree-landing-page.md`  
**Original Type**: decision  
**What They Found**: Worktree-scoped pages standardized on `?worktree=<encoded-path>` instead of path segments.  
**Why This Matters Now**: The new page and post-create redirect should preserve this contract instead of inventing a new selector.  
**Action for Current Work**: Use `workspaceHref()` and continue passing the absolute worktree path as the canonical query param.

### 📚 Prior Learning PL-02: Missing `?worktree=` should redirect, not silently fall back
**Source**: `docs/plans/062-workunit-worktree-resolution/workunit-worktree-resolution-plan.md`  
**Original Type**: decision  
**What They Found**: Silent fallback to the main workspace caused incorrect mutations.  
**Why This Matters Now**: A create-worktree route should validate its workspace/main context explicitly and redirect or error clearly when required inputs are missing.  
**Action for Current Work**: Follow the strict redirect/validation precedent from Plan 062 for creation flows.

### 📚 Prior Learning PL-03: Worktree pages must be dynamic
**Source**: Plan 018 worktree landing subtask  
**Original Type**: gotcha  
**What They Found**: Worktree-scoped pages require `export const dynamic = 'force-dynamic'` to avoid stale DI/container behavior and incorrect context resolution.  
**Why This Matters Now**: The new full-page creation screen will sit under the same workspace route family.  
**Action for Current Work**: Mark the page dynamic.

### 📚 Prior Learning PL-04: Async route params must be awaited
**Source**: Plan 018 worktree landing subtask  
**Original Type**: gotcha  
**What They Found**: Next.js App Router params/searchParams are async in this app’s current pattern.  
**Why This Matters Now**: The new page will need both `slug` and possibly existing `worktree` query state.  
**Action for Current Work**: Follow the existing `await params` / `await searchParams` pattern used by workspace pages.

### 📚 Prior Learning PL-05: Sidebar active-state logic must check both pathname and query param
**Source**: Plan 018 worktree landing subtask  
**Original Type**: insight  
**What They Found**: Worktree highlighting breaks if selection logic checks only the pathname.  
**Why This Matters Now**: A new route and post-create redirect must keep active-state logic coherent.  
**Action for Current Work**: Preserve the current `pathname + searchParams.get('worktree')` selection model.

### 📚 Prior Learning PL-06: React Query additions to `WorkspaceNav` can break tests if providers are missing
**Source**: `docs/plans/059-fix-agents/tasks/phase-4-cross-worktree-left-menu/tasks.md`  
**Original Type**: gotcha  
**What They Found**: Adding `useWorktreeActivity()` caused tests to fail until `QueryClientProvider` wrappers were added.  
**Why This Matters Now**: Any create-worktree refresh logic that adds more client-side state or data hooks may require test harness updates.  
**Action for Current Work**: Update sidebar-related tests alongside UI changes.

### 📚 Prior Learning PL-07: Lazy-loading and targeted refresh beat full recursive rescans
**Source**: Plan 041 file-browser research  
**Original Type**: insight  
**What They Found**: Large workspaces perform best when the UI refreshes only what it needs.  
**Why This Matters Now**: A full worktree refresh after creation should be targeted, not an always-on heavy rescan loop.  
**Action for Current Work**: Refresh workspace/worktree lists after successful creation rather than adding broad polling.

### 📚 Prior Learning PL-08: Path validation must remain explicit
**Source**: Plan 041 file-browser security work  
**Original Type**: decision  
**What They Found**: File and worktree paths need explicit containment/traversal validation.  
**Why This Matters Now**: The post-create hook path and any optional bootstrap behavior must be resolved safely.  
**Action for Current Work**: Validate all filesystem paths against trusted roots before reading/executing anything.

### 📚 Prior Learning PL-09: State identifiers should use slugs, not raw filesystem paths
**Source**: Plan 053 worktree state exemplar  
**Original Type**: insight  
**What They Found**: Raw paths are poor state identifiers because they contain separators and environment-specific values.  
**Why This Matters Now**: If creation emits UI state/events, use workspace slug + worktree path only where necessary, and avoid path-shaped internal IDs.  
**Action for Current Work**: Keep path usage at the URL and service boundary; use stable IDs elsewhere.

### 📚 Prior Learning PL-10: Compose with existing slots instead of replacing them
**Source**: Plan 053 state exemplar  
**Original Type**: insight  
**What They Found**: New sidebar metadata should compose with existing UI surfaces, not overwrite them.  
**Why This Matters Now**: The new plus button should fit the Worktrees header without displacing collapse state, labels, or existing activity behavior.  
**Action for Current Work**: Add the button as a small adjacent affordance rather than reworking the section structure.

### Prior Learnings Summary

| ID | Type | Source | Key Insight | Action |
|----|------|--------|-------------|--------|
| PL-01 | decision | Plan 018 | `?worktree=` is the canonical scope selector | Reuse URL contract |
| PL-02 | decision | Plan 062 | Missing worktree should not silently target main | Use strict validation |
| PL-03 | gotcha | Plan 018 | Worktree pages must be dynamic | Mark page dynamic |
| PL-04 | gotcha | Plan 018 | Async params/searchParams must be awaited | Follow existing page pattern |
| PL-05 | insight | Plan 018 | Selection state must include query param | Preserve current active-state logic |
| PL-06 | gotcha | Plan 059 | Sidebar data hooks need test provider support | Update tests with UI changes |
| PL-07 | insight | Plan 041 | Prefer targeted refresh over broad rescans | Refresh intentionally after create |
| PL-08 | decision | Plan 041 | Path validation is non-negotiable | Validate hook/script paths |
| PL-09 | insight | Plan 053 | Stable IDs beat filesystem paths | Avoid path-shaped internal IDs |
| PL-10 | insight | Plan 053 | Compose, don’t replace existing sidebar UI | Add a small inline plus affordance |

## Domain Context

### Existing Domains Relevant to This Research

| Domain | Relationship | Relevant Contracts | Key Components |
|--------|-------------|-------------------|----------------|
| `file-browser` | Direct UI edge, not owner | `WorktreePicker`, `WorkspaceProvider`, `useWorkspaceContext` | Worktree picker, workspace context, browser page |
| `_platform/workspace-url` | Direct | `workspaceHref()`, `workspaceParams`, `workspaceParamsCache` | shared URL builder and `worktree` query param |
| `_platform/auth` | Direct web guard | `requireAuth()` | server action / route protection |
| `_platform/panel-layout` | Tangential boundary | layout shell only | useful for UI conventions, but not owner of dashboard sidebar |

### Domain Map Position

This feature sits across three layers:

1. **Composition/UI edge**
   - dashboard sidebar
   - workspace navigation
   - full-page form route

2. **Business lifecycle**
   - workspace/worktree creation policy
   - ordinal naming
   - validation of source/target/main worktree
   - optional post-create hook policy

3. **Infrastructure execution**
   - git command execution
   - filesystem inspection
   - redirect construction

### Potential Domain Actions

- **Formalize a `workspace` business domain**
  - Strongly indicated by current code in `packages/workflow`
  - Best owner for workspace/worktree lifecycle behavior
- **Do not extend file-browser to own creation logic**
  - It owns presentation and worktree-aware browsing, not workspace lifecycle
- **Keep `_platform/workspace-url` as a consumed contract**
  - It should remain the redirect/query-param boundary, not the owner of creation behavior

## Critical Discoveries

### 🚨 Critical Finding 01: There is no in-repo create-worktree capability today
**Impact**: Critical  
**Source**: IA-09, DC-02, DB-05  
**What**: No current page, action, service, or resolver creates a git worktree. The repo only detects and lists worktrees.  
**Why It Matters**: This feature must add new behavior at the UI, action, service, resolver, and test layers.  
**Required Action**: Treat this as a full feature addition, not a small UI tweak.

### 🚨 Critical Finding 02: Sidebar worktree data is a one-shot client fetch
**Impact**: Critical  
**Source**: IA-02, DC-04  
**What**: `WorkspaceNav` loads `/api/workspaces?include=worktrees` once on mount and stores it locally.  
**Why It Matters**: A successful create flow will not automatically appear in the existing sidebar state.  
**Required Action**: Design an explicit post-create refresh/remount/redirect strategy for the sidebar.

### 🚨 Critical Finding 03: `resolveContextFromParams()` is too forgiving for mutations
**Impact**: Critical  
**Source**: IA-04, QT-02, PL-02  
**What**: The service-level helper may fall back to the main workspace path. Plan 062 added a stricter mutation helper because that behavior caused incorrect writes.  
**Why It Matters**: Create-worktree logic must never "helpfully" target main when validation fails.  
**Required Action**: Use strict validation for all creation-related write paths.

### 🚨 Critical Finding 04: The old worktree landing page is no longer the right home
**Impact**: High  
**Source**: IA-05, IA-06, DE-05  
**What**: `apps/web/app/(dashboard)/workspaces/[slug]/worktree/page.tsx` immediately redirects and is effectively deprecated.  
**Why It Matters**: A new full-page create route should be a new sibling under `[slug]`, not additional complexity inside a legacy shim.  
**Required Action**: Create a dedicated route such as `/workspaces/[slug]/new-worktree` or `/workspaces/[slug]/worktrees/new`.

### 🚨 Critical Finding 05: Naming logic currently depends on external, cross-branch ordinal scanning
**Impact**: High  
**Source**: IA-08, DE-02, DB-07  
**What**: `new-worktree.sh` relies on `plan-ordinal.py` to avoid ordinal collisions across branches.  
**Why It Matters**: A local-only scan would regress current behavior and create naming collisions.  
**Required Action**: Port or wrap the cross-branch ordinal algorithm deliberately; do not replace it with a naive local counter.

### 🚨 Critical Finding 06: The optional post-create hook is a business-policy concern, not a raw git concern
**Impact**: High  
**Source**: user requirement, DB-07  
**What**: The requested `.chainglass/new-worktree.sh` hook must always execute the version from the main worktree.  
**Why It Matters**: This is not just filesystem execution — it is policy about source-of-truth and bootstrap order.  
**Required Action**: Keep hook lookup/execution in the workspace lifecycle service, not in the sidebar or raw git resolver.

### 🚨 Critical Finding 07: This feature reveals a missing workspace domain boundary
**Impact**: High  
**Source**: DB-04, DB-05  
**What**: The current repo has strong workspace lifecycle code in `packages/workflow`, but no explicit `workspace` business domain is formalized in `docs/domains`.  
**Why It Matters**: Without a clear owner, logic will be tempted to leak into file-browser or UI components.  
**Required Action**: Treat workspace/worktree creation as workspace-domain behavior, even if formal domain extraction happens later.

## Supporting Documentation

### Related Documentation

- `docs/domains/file-browser/domain.md`
  - Clarifies that file-browser owns the worktree picker and workspace context UI, but **not** workspace lifecycle or git worktree resolution
- `docs/domains/_platform/workspace-url/domain.md`
  - Defines `workspaceHref()` and the shared `worktree` param contract
- `docs/domains/_platform/panel-layout/domain.md`
  - Important boundary reminder: panel-layout does not own the dashboard sidebar
- `docs/plans/018-agents-workspace-data-model/.../001-subtask-worktree-landing-page.md`
  - History of the old worktree landing page and worktree-scoped navigation patterns
- `docs/plans/059-fix-agents/tasks/phase-4-cross-worktree-left-menu/tasks.md`
  - History of sidebar worktree activity and the React Query/testing gotcha
- `docs/plans/062-workunit-worktree-resolution/workunit-worktree-resolution-plan.md`
  - Strongest precedent for strict worktree-aware mutation behavior

### Key Code Comments

- `apps/web/app/actions/workunit-actions.ts`
  - Documents why the workunit editor intentionally avoids the fallback behavior from `resolveContextFromParams()`
- `packages/workflow/src/resolvers/git-worktree.resolver.ts`
  - Documents minimum git version support, porcelain parsing, and graceful degradation

### Historical Context

- **Plan 018** created a dedicated worktree landing page because sidebar navigation needed a workspace-scoped hub.
- **Later work** redirected that landing page to browser, meaning the current product now treats browser as the safest generic worktree landing surface.
- **Plan 059** extended the sidebar with cross-worktree activity dots, making the Worktrees section a more active product surface.
- **Plan 062** hardened mutation safety by explicitly rejecting missing/invalid worktree context rather than falling back to main.

## Recommendations

### If Modifying This System

1. **Add a dedicated full-page route**
   - Recommended path: `/workspaces/[slug]/new-worktree`
   - Reason: clean sibling to current workspace pages, avoids the deprecated `/worktree` shim

2. **Use the existing web mutation pattern**
   - Add a create-worktree action alongside `workspace-actions.ts`
   - Use `useActionState` for the form
   - Revalidate workspace pages and explicitly refresh/remount sidebar data

3. **Redirect into browser on success**
   - Recommended target: `workspaceHref(slug, '/browser', { worktree: newPath })`
   - Reason: browser is the most clearly worktree-aware landing page today

### If Extending This System

1. **Extend `IWorkspaceService` with a create-worktree contract**
   - Keep naming, validation, and hook policy at the service boundary

2. **Extend `IGitWorktreeResolver` or add a sibling git creation service**
   - Keep raw git command execution out of UI/web adapters

3. **Follow Plan 062’s strict mutation validation model**
   - Never silently target the main workspace when validation fails

### If Refactoring This System

1. **Formalize the missing `workspace` domain**
   - The feature is a strong trigger for domain extraction from `packages/workflow`

2. **Unify worktree resolution semantics across features**
   - Today samples/workspace actions and workunit editor use different strictness levels

3. **Consider porting external ordinal logic into repo-owned code**
   - Reduces environment-specific coupling and makes testing easier

## External Research Opportunities

No external research gaps were identified during codebase exploration.

Remaining open items are **product and implementation decisions**, not web-knowledge gaps:

- exact route naming (`/new-worktree` vs `/worktrees/new`)
- whether ordinal logic is ported into the repo or wrapped as a trusted tool
- whether bootstrap behavior beyond naming/hook execution should include copying `.fs2` or `.env.local`

## Appendix: File Inventory

### Core Files

| File | Purpose | Lines |
|------|---------|-------|
| `apps/web/src/components/dashboard-sidebar.tsx` | Workspace chrome and Worktrees section header | 329 |
| `apps/web/src/components/workspaces/workspace-nav.tsx` | Client worktree list + star/activity UI | 349 |
| `apps/web/app/(dashboard)/workspaces/[slug]/page.tsx` | Workspace detail page with worktree rows | 184 |
| `apps/web/app/(dashboard)/workspaces/page.tsx` | Full-page create-workspace pattern | 93 |
| `apps/web/src/components/workspaces/workspace-add-form.tsx` | `useActionState` create-form pattern | 93 |
| `apps/web/app/actions/workspace-actions.ts` | Workspace server actions and mutation patterns | 577 |
| `apps/web/app/api/workspaces/route.ts` | Workspace/worktree list API | 110 |
| `packages/workflow/src/services/workspace.service.ts` | Workspace lifecycle service | 320+ |
| `packages/workflow/src/resolvers/git-worktree.resolver.ts` | Git worktree discovery boundary | 298 |
| `packages/shared/src/interfaces/process-manager.interface.ts` | Process spawning contract | 167 |
| `/Users/jordanknight/substrate/new-worktree.sh` | External naming/worktree-creation convention reference | 86 |
| `/Users/jordanknight/github/tools/scripts/plan-ordinal.py` | External ordinal allocation reference | 260+ |

### Test Files

- `test/unit/workflow/git-worktree-resolver.test.ts`
- `test/unit/web/features/041-file-browser/worktree-picker.test.tsx`
- `test/unit/web/features/041-file-browser/workspace-context.test.tsx`
- `test/unit/web/actions/workunit-actions-worktree.test.ts`

### Configuration / Domain Files

- `docs/domains/registry.md`
- `docs/domains/domain-map.md`
- `docs/domains/file-browser/domain.md`
- `docs/domains/_platform/workspace-url/domain.md`
- `docs/domains/_platform/panel-layout/domain.md`

## Next Steps

Because no external research is needed, the recommended next step is to turn this into a concrete feature spec.

1. Run `/plan-1b-specify "Add a full-page new worktree flow with a sidebar plus button, strict workspace-domain creation logic, optional main-worktree hook execution, and redirect into /browser?worktree=..."`
2. If you want to settle route naming, bootstrap scope, or domain ownership first, run `/plan-2c-workshop "new worktree flow route + domain design"`
3. After specification, continue to architecture/implementation planning

---

**Research Complete**: 2026-03-07T07:55:15.273Z  
**Report Location**: `docs/plans/069-new-worktree/research-dossier.md`
