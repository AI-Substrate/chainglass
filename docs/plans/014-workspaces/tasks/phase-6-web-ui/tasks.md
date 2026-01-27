# Phase 6: Web UI – Tasks & Alignment Brief

**Spec**: [../../workspaces-spec.md](../../workspaces-spec.md)
**Plan**: [../../workspaces-plan.md](../../workspaces-plan.md)
**Date**: 2026-01-27

---

## Executive Briefing

### Purpose

This phase implements the web interface for workspace and sample management. It integrates workspace navigation into the left sidebar, provides workspace list and detail pages, and enables sample CRUD operations through a visual interface. This completes the user-facing experience by complementing the CLI commands from Phase 5 with a full web UI.

### What We're Building

A complete web interface for workspace management:

1. **API Routes** (Next.js Route Handlers)
   - `GET/POST /api/workspaces` - List and create workspaces
   - `GET/DELETE /api/workspaces/[slug]` - Get info and remove workspace
   - `GET/POST /api/workspaces/[slug]/samples` - List and create samples for worktree
   - `DELETE /api/workspaces/[slug]/samples/[sampleSlug]` - Delete sample

2. **Navigation Integration**
   - "Workspaces" section in left sidebar with expandable workspace list
   - Worktree expansion showing branches/worktrees per workspace
   - Context selection persisted in URL query parameter

3. **Pages**
   - `/workspaces` - List view with add workspace form
   - `/workspaces/[slug]` - Workspace detail with worktree list
   - `/workspaces/[slug]/samples` - Sample list for selected worktree with create/delete

### User Value

Users get a visual interface to:
- See all registered workspaces at a glance in the sidebar
- Navigate between workspaces and their git worktrees
- Create and manage samples without touching the CLI
- Switch worktree context to view different branches' data
- Benefit from server-side data (browser refresh maintains state)

### Example

**Sidebar Navigation:**
```
├── Home
├── Workflows
├── Workspaces ▼
│   ├── chainglass ▼
│   │   ├── main
│   │   ├── 014-workspaces ✓ (selected)
│   │   └── feature/new-ui
│   └── other-project
├── Agents
└── ...
```

**Add Workspace Form:**
```
┌────────────────────────────────────────┐
│ Add Workspace                          │
├────────────────────────────────────────┤
│ Name:  [My Project              ]      │
│ Path:  [/home/user/my-project   ]      │
│                        [Add Workspace] │
└────────────────────────────────────────┘
```

---

## Objectives & Scope

### Objective

Implement web UI for workspace and sample management as specified in the plan, integrating with Phase 4 services via DI container.

**Acceptance Criteria from Spec:**
- [ ] AC-14: Workspaces appear in left menu
- [ ] AC-15: Worktrees expandable under each workspace
- [ ] AC-16: Context selection works (worktree picker persists in URL)
- [ ] AC-17: Add workspace from web UI
- [ ] AC-18: Remove workspace from web UI
- [ ] AC-19: Sample list page shows samples for selected worktree
- [ ] AC-20: Sample create form works
- [ ] AC-21: Sample delete action works
- [ ] AC-24: Server-side data (browser refresh works)

### Goals

- ✅ Create `/api/workspaces` route (GET, POST) with Zod validation
- ✅ Create `/api/workspaces/[slug]` route (GET, DELETE)
- ✅ Create `/api/workspaces/[slug]/samples` route (GET, POST) with worktree context
- ✅ Create `/api/workspaces/[slug]/samples/[sampleSlug]` route (DELETE)
- ✅ Add "Workspaces" to NAV_ITEMS in navigation-utils.ts
- ✅ Create WorkspaceNav component with workspace list and worktree expansion
- ✅ Integrate WorkspaceNav in dashboard sidebar
- ✅ Create /workspaces page with list view and add form
- ✅ Create /workspaces/[slug] page with detail view and worktree list
- ✅ Implement worktree context selection (URL query parameter)
- ✅ Create /workspaces/[slug]/samples page with sample list
- ✅ Add sample create form component
- ✅ Add sample delete action with confirmation
- ✅ Implement add workspace form
- ✅ Implement remove workspace action with confirmation

### Non-Goals (Scope Boundaries)

- ❌ CLI command modifications (Phase 5 complete)
- ❌ Workspace data editing (create and delete only for MVP)
- ❌ Real-time updates via WebSocket/SSE (polling or refresh sufficient)
- ❌ Drag-and-drop workspace reordering
- ❌ Batch operations (single-item CRUD only)
- ❌ Client-side state management (server-side per spec)
- ❌ Mobile-specific layouts (desktop-first, responsive follows existing patterns)
- ❌ Sample content preview (just metadata display)
- ❌ Authentication/authorization (not in scope per spec)

---

## Architecture Map

### Component Diagram

<!-- Status: grey=pending, orange=in-progress, green=completed, red=blocked -->
<!-- Updated by plan-6 during implementation -->

```mermaid
flowchart TD
    classDef pending fill:#9E9E9E,stroke:#757575,color:#fff
    classDef inprogress fill:#FF9800,stroke:#F57C00,color:#fff
    classDef completed fill:#4CAF50,stroke:#388E3C,color:#fff
    classDef blocked fill:#F44336,stroke:#D32F2F,color:#fff

    style APIRoutes fill:#E3F2FD,stroke:#90CAF9
    style Navigation fill:#E8F5E9,stroke:#81C784
    style Pages fill:#FFF3E0,stroke:#FFB74D
    style Components fill:#F3E5F5,stroke:#BA68C8

    subgraph APIRoutes["API Routes"]
        T001["T001: /api/workspaces (GET, POST)"]:::pending
        T002["T002: /api/workspaces/[slug] (GET, DELETE)"]:::pending
        T003["T003: /api/workspaces/[slug]/samples (GET, POST)"]:::pending
        T004["T004: /api/workspaces/[slug]/samples/[sampleSlug] (DELETE)"]:::pending
        
        T001 --> T002 --> T003 --> T004
    end

    subgraph Navigation["Navigation Integration"]
        T005["T005: Add Workspaces to NAV_ITEMS"]:::pending
        T006["T006: WorkspaceNav component"]:::pending
        T007["T007: Sidebar integration"]:::pending
        
        T004 --> T005 --> T006 --> T007
    end

    subgraph Pages["Page Components"]
        T008["T008: /workspaces list page"]:::pending
        T009["T009: /workspaces/[slug] detail page"]:::pending
        T010["T010: Worktree context selection"]:::pending
        T011["T011: /workspaces/[slug]/samples page"]:::pending
        
        T007 --> T008 --> T009 --> T010 --> T011
    end

    subgraph Components["Form Components"]
        T012["T012: Sample create form"]:::pending
        T013["T013: Sample delete action"]:::pending
        T014["T014: Add workspace form"]:::pending
        T015["T015: Remove workspace action"]:::pending
        
        T011 --> T012 --> T013 --> T014 --> T015
    end

    subgraph Files["Files"]
        F_API1["/apps/web/app/api/workspaces/route.ts"]:::pending
        F_API2["/apps/web/app/api/workspaces/[slug]/route.ts"]:::pending
        F_API3["/apps/web/app/api/workspaces/[slug]/samples/route.ts"]:::pending
        F_API4["/apps/web/app/api/workspaces/[slug]/samples/[sampleSlug]/route.ts"]:::pending
        F_NAV["/apps/web/src/lib/navigation-utils.ts"]:::pending
        F_COMP1["/apps/web/src/components/workspaces/workspace-nav.tsx"]:::pending
        F_SIDE["/apps/web/src/components/dashboard-sidebar.tsx"]:::pending
        F_PAGE1["/apps/web/app/(dashboard)/workspaces/page.tsx"]:::pending
        F_PAGE2["/apps/web/app/(dashboard)/workspaces/[slug]/page.tsx"]:::pending
        F_PAGE3["/apps/web/app/(dashboard)/workspaces/[slug]/samples/page.tsx"]:::pending
        F_COMP2["/apps/web/src/components/workspaces/sample-create-form.tsx"]:::pending
        F_COMP3["/apps/web/src/components/workspaces/workspace-add-form.tsx"]:::pending
    end

    T001 -.-> F_API1
    T002 -.-> F_API2
    T003 -.-> F_API3
    T004 -.-> F_API4
    T005 -.-> F_NAV
    T006 -.-> F_COMP1
    T007 -.-> F_SIDE
    T008 -.-> F_PAGE1
    T009 -.-> F_PAGE2
    T010 -.-> F_PAGE2
    T011 -.-> F_PAGE3
    T012 -.-> F_COMP2
    T014 -.-> F_COMP3
```

### Task-to-Component Mapping

<!-- Status: ⬜ Pending | 🟧 In Progress | ✅ Complete | 🔴 Blocked -->

| Task | Component(s) | Files | Status | Comment |
|------|-------------|-------|--------|---------|
| T001 | Workspaces API | /apps/web/app/api/workspaces/route.ts | ⬜ Pending | GET list, POST add with Zod validation |
| T002 | Workspace Detail API | /apps/web/app/api/workspaces/[slug]/route.ts | ⬜ Pending | GET info with worktrees, DELETE remove |
| T003 | Samples API | /apps/web/app/api/workspaces/[slug]/samples/route.ts | ⬜ Pending | GET/POST with worktree context from query |
| T004 | Sample Delete API | /apps/web/app/api/workspaces/[slug]/samples/[sampleSlug]/route.ts | ⬜ Pending | DELETE single sample |
| T005 | Navigation Utils | /apps/web/src/lib/navigation-utils.ts | ⬜ Pending | Add "Workspaces" NavItem |
| T006 | WorkspaceNav | /apps/web/src/components/workspaces/workspace-nav.tsx | ⬜ Pending | Collapsible workspace + worktree list |
| T007 | Sidebar Integration | /apps/web/src/components/dashboard-sidebar.tsx | ⬜ Pending | Mount WorkspaceNav in sidebar |
| T008 | Workspaces List Page | /apps/web/app/(dashboard)/workspaces/page.tsx | ⬜ Pending | Server component with list + form |
| T009 | Workspace Detail Page | /apps/web/app/(dashboard)/workspaces/[slug]/page.tsx | ⬜ Pending | Workspace info + worktree picker |
| T010 | Worktree Context | Multiple | ⬜ Pending | URL ?worktree= param, shared state |
| T011 | Samples Page | /apps/web/app/(dashboard)/workspaces/[slug]/samples/page.tsx | ⬜ Pending | Sample list + create form |
| T012 | Sample Create Form | /apps/web/src/components/workspaces/sample-create-form.tsx | ⬜ Pending | Client component with form |
| T013 | Sample Delete | Multiple | ⬜ Pending | Delete button with confirmation |
| T014 | Workspace Add Form | /apps/web/src/components/workspaces/workspace-add-form.tsx | ⬜ Pending | Client component with form |
| T015 | Workspace Remove | Multiple | ⬜ Pending | Delete button with confirmation |

---

## Tasks

| Status | ID | Task | CS | Type | Dependencies | Absolute Path(s) | Validation | Subtasks | Notes |
|--------|------|------|-----|------|--------------|------------------|------------|----------|-------|
| [ ] | T001 | Create `/api/workspaces` route with GET (list) and POST (add) handlers, Zod validation, DI container integration | 2 | Core | – | /home/jak/substrate/014-workspaces/apps/web/app/api/workspaces/route.ts | GET returns workspace list; POST adds workspace, returns 201 | – | Per Medium Discovery 10; use `dynamic = 'force-dynamic'` |
| [ ] | T002 | Create `/api/workspaces/[slug]` route with GET (info + worktrees) and DELETE (remove) handlers | 2 | Core | T001 | /home/jak/substrate/014-workspaces/apps/web/app/api/workspaces/[slug]/route.ts | GET returns workspace info with worktrees; DELETE returns 204 | – | Use WorkspaceService.getInfo() from Phase 4 |
| [ ] | T003 | Create `/api/workspaces/[slug]/samples` route with GET (list) and POST (add), worktree from `?worktree=` query param | 2 | Core | T002 | /home/jak/substrate/014-workspaces/apps/web/app/api/workspaces/[slug]/samples/route.ts | GET returns samples for worktree; POST creates sample | – | Build WorkspaceContext from slug + worktree path |
| [ ] | T004 | Create `/api/workspaces/[slug]/samples/[sampleSlug]` route with DELETE handler | 1 | Core | T003 | /home/jak/substrate/014-workspaces/apps/web/app/api/workspaces/[slug]/samples/[sampleSlug]/route.ts | DELETE returns 204 on success | – | |
| [ ] | T005 | Add "Workspaces" NavItem to NAV_ITEMS in navigation-utils.ts | 1 | Setup | – | /home/jak/substrate/014-workspaces/apps/web/src/lib/navigation-utils.ts | Workspaces appears in sidebar nav | – | Use FolderOpen or similar icon from lucide-react |
| [ ] | T006 | Create WorkspaceNav component with workspace list and worktree expansion | 3 | Core | T001, T002 | /home/jak/substrate/014-workspaces/apps/web/src/components/workspaces/workspace-nav.tsx | Shows workspaces, expands to show worktrees, highlights selected | – | Server component fetching from API; use Collapsible from shadcn |
| [ ] | T007 | Integrate WorkspaceNav in dashboard-sidebar.tsx below main nav items | 2 | Integration | T006 | /home/jak/substrate/014-workspaces/apps/web/src/components/dashboard-sidebar.tsx | WorkspaceNav visible in sidebar on all dashboard pages | – | AC-14, AC-15 |
| [ ] | T008 | Create /workspaces list page with workspace table and add form integration | 2 | Core | T001, T014 | /home/jak/substrate/014-workspaces/apps/web/app/(dashboard)/workspaces/page.tsx | Lists all workspaces; add form creates new workspace | – | Server component; revalidates on mutation |
| [ ] | T009 | Create /workspaces/[slug] detail page with workspace info and worktree list | 2 | Core | T002 | /home/jak/substrate/014-workspaces/apps/web/app/(dashboard)/workspaces/[slug]/page.tsx | Shows workspace name, path, worktrees with branches | – | AC-15; links to /samples for each worktree |
| [ ] | T010 | Implement worktree context selection via URL `?worktree=` query parameter | 2 | Core | T009 | /home/jak/substrate/014-workspaces/apps/web/app/(dashboard)/workspaces/[slug]/page.tsx, /home/jak/substrate/014-workspaces/apps/web/app/(dashboard)/workspaces/[slug]/samples/page.tsx | Selected worktree persists across navigation; default to main worktree | – | AC-16; use searchParams in server components |
| [ ] | T011 | Create /workspaces/[slug]/samples page with sample list for selected worktree | 2 | Core | T003, T010 | /home/jak/substrate/014-workspaces/apps/web/app/(dashboard)/workspaces/[slug]/samples/page.tsx | Lists samples for worktree; shows empty state if none | – | AC-19; uses ?worktree= param |
| [ ] | T012 | Create sample create form component with name and description fields | 2 | Core | T003 | /home/jak/substrate/014-workspaces/apps/web/src/components/workspaces/sample-create-form.tsx | Form POSTs to /api/workspaces/[slug]/samples; shows success/error | – | AC-20; client component with 'use client' |
| [ ] | T013 | Add sample delete action with confirmation dialog | 1 | Core | T004 | /home/jak/substrate/014-workspaces/apps/web/src/components/workspaces/sample-delete-button.tsx | Delete button calls API; confirms before delete; removes from list | – | AC-21; use AlertDialog from shadcn |
| [ ] | T014 | Create workspace add form component with name and path fields | 2 | Core | T001 | /home/jak/substrate/014-workspaces/apps/web/src/components/workspaces/workspace-add-form.tsx | Form POSTs to /api/workspaces; shows success/error; clears on success | – | AC-17; client component |
| [ ] | T015 | Add workspace remove action with confirmation dialog | 1 | Core | T002 | /home/jak/substrate/014-workspaces/apps/web/src/components/workspaces/workspace-remove-button.tsx | Delete button calls API; confirms before delete; redirects to /workspaces | – | AC-18; use AlertDialog from shadcn |

---

## Alignment Brief

### Prior Phases Review

#### Phase 1: Workspace Entity + Registry Adapter + Contract Tests (COMPLETE)

**Deliverables Available to Phase 6:**
- `Workspace` entity at `/home/jak/substrate/014-workspaces/packages/workflow/src/entities/workspace.ts`
- `IWorkspaceRegistryAdapter` interface with `load`, `save`, `list`, `remove`, `exists` methods
- `WorkspaceRegistryAdapter` for real filesystem I/O to `~/.config/chainglass/workspaces.json`
- `FakeWorkspaceRegistryAdapter` for testing
- Error codes E074-E081 with factory functions

**Key Patterns Established:**
- Private constructor + static `create()` factory method
- `toJSON()` for serialization (no `fromJSON()` - adapter handles deserialization)
- Slug generation using `slugify` npm package

**Lessons Learned:**
- Path validation with absolute path requirement, no traversal, tilde expansion
- `expandTilde()` extracted to IPathResolver for reuse

---

#### Phase 2: WorkspaceContext Resolution + Worktree Discovery (COMPLETE)

**Deliverables Available to Phase 6:**
- `WorkspaceContext` interface with `workspaceSlug`, `workspacePath`, `worktreePath`, `worktreeBranch`, `isMainWorktree`
- `IWorkspaceContextResolver` interface with `resolveFromPath()` method
- `WorkspaceContextResolver` for real resolution from filesystem paths
- `GitWorktreeResolver` for `git worktree list --porcelain` parsing
- `Worktree` type with path, branch, isMain, isBare, isDetached

**Key Patterns Established:**
- Context resolution walks up directory tree to find registered workspace
- Sort workspaces by path length descending before matching (handles overlapping workspaces)
- Graceful degradation when git unavailable or version < 2.13

**Dependencies Exported:**
- `WorkspaceContext` is required parameter for all sample operations in Phase 6

---

#### Phase 3: Sample Domain (Exemplar) (COMPLETE)

**Deliverables Available to Phase 6:**
- `Sample` entity at `/home/jak/substrate/014-workspaces/packages/workflow/src/entities/sample.ts`
- `ISampleAdapter` interface with `load`, `save`, `list`, `remove`, `exists` methods
- `SampleAdapter` for real filesystem I/O to `<worktree>/.chainglass/data/samples/`
- `FakeSampleAdapter` for testing
- `WorkspaceDataAdapterBase` abstract class for domain adapters
- Error codes E082-E089 for sample errors

**Key Patterns Established:**
- Per-worktree data storage in `<worktree>/.chainglass/data/samples/<slug>.json`
- `ensureStructure()` creates directories on first write
- Composite key pattern in fake: `${worktreePath}|${slug}` for isolation

---

#### Phase 4: Service Layer + DI Integration (COMPLETE)

**Deliverables Available to Phase 6:**
- `IWorkspaceService` interface with `add`, `list`, `remove`, `getInfo`, `resolveContext` methods
- `WorkspaceService` implementation at `/home/jak/substrate/014-workspaces/packages/workflow/src/services/workspace.service.ts`
- `ISampleService` interface with `add`, `list`, `get`, `delete` methods
- `SampleService` implementation at `/home/jak/substrate/014-workspaces/packages/workflow/src/services/sample.service.ts`
- `WORKSPACE_DI_TOKENS` in `packages/shared/src/di-tokens.ts`
- Container registration in `packages/workflow/src/container.ts`

**Key Patterns Established:**
- Services return Result types (never throw)
- Defense in depth: service validates for UX, adapter validates as safety net
- `IGitWorktreeResolver` interface + `FakeGitWorktreeResolver` for proper DI

**Discoveries:**
- DYK-P4-01: Service result types should extend BaseResult with errors[] array
- DYK-P4-02: Create separate WORKSPACE_DI_TOKENS (not extend WORKFLOW_DI_TOKENS)
- DYK-P4-03: GitWorktreeResolver needs interface for DI
- DYK-P4-04: Defense in depth for path validation (both layers validate)
- DYK-P4-05: Extract createDefaultContext() to shared fixture

---

#### Phase 5: CLI Commands (COMPLETE)

**Deliverables Available to Phase 6:**
- `cg workspace add/list/remove/info` commands in `/home/jak/substrate/014-workspaces/apps/cli/src/commands/workspace.command.ts`
- `cg sample add/list/info/delete` commands in `/home/jak/substrate/014-workspaces/apps/cli/src/commands/sample.command.ts`
- `--workspace-path` flag for context override
- `--json` flag for machine-readable output
- `--allow-worktree` flag for explicit worktree registration

**Key Patterns Established:**
- Commander.js command group pattern with subcommands
- DI container resolution from CLI entry point
- Confirmation prompts for destructive operations (with `--force` skip)

---

### Critical Findings Affecting This Phase

**Critical Discovery 01: Split Storage Architecture**
- Global registry: `~/.config/chainglass/workspaces.json`
- Per-worktree data: `<worktree>/.chainglass/data/samples/`
- **Impact on Phase 6**: API routes must coordinate both - workspace registry for list/add/remove, worktree context for sample operations

**Critical Discovery 02: WorkspaceDataAdapterBase Pattern**
- Domain adapters require WorkspaceContext for all operations
- **Impact on Phase 6**: Sample API routes must construct WorkspaceContext from URL params (slug + worktree path)

**High Discovery 08: DI Container Registration Pattern**
- Use useFactory pattern; child containers for isolation
- **Impact on Phase 6**: Web container must register workspace/sample services (update `di-container.ts`)

**Medium Discovery 10: Web API Route Pattern**
- Use `dynamic = 'force-dynamic'` for all routes
- Zod validation for request bodies
- Lazy container resolution
- **Impact on Phase 6**: All API routes follow this pattern

---

### ADR Decision Constraints

**ADR-0004: Dependency Injection Container Architecture**
- Constrains: useFactory pattern, child container isolation
- Addressed by: T001-T004 (API routes resolve services via DI container)

---

### Invariants & Guardrails

- **Server-side data only**: No client-side state for workspace/sample data (AC-24)
- **Zod validation**: All API request bodies validated before processing
- **Error codes in responses**: Return structured errors with E074-E089 codes
- **Result types**: Services never throw; check `.success` before using data

---

### Inputs to Read

| File | Purpose |
|------|---------|
| /home/jak/substrate/014-workspaces/apps/web/src/lib/di-container.ts | DI container pattern for web app |
| /home/jak/substrate/014-workspaces/apps/web/src/lib/navigation-utils.ts | NAV_ITEMS pattern for sidebar |
| /home/jak/substrate/014-workspaces/apps/web/src/components/dashboard-sidebar.tsx | Sidebar structure |
| /home/jak/substrate/014-workspaces/apps/web/app/api/health/route.ts | API route pattern example |
| /home/jak/substrate/014-workspaces/packages/workflow/src/services/workspace.service.ts | WorkspaceService API |
| /home/jak/substrate/014-workspaces/packages/workflow/src/services/sample.service.ts | SampleService API |
| /home/jak/substrate/014-workspaces/packages/shared/src/di-tokens.ts | WORKSPACE_DI_TOKENS |

---

### Visual Alignment Aids

#### System Flow Diagram

```mermaid
flowchart LR
    subgraph Browser["Browser"]
        UI[Web UI Pages]
        Forms[Form Components]
    end
    
    subgraph NextJS["Next.js Server"]
        Routes[API Routes]
        DI[DI Container]
    end
    
    subgraph Services["Service Layer"]
        WS[WorkspaceService]
        SS[SampleService]
    end
    
    subgraph Adapters["Adapters"]
        WRA[WorkspaceRegistryAdapter]
        SA[SampleAdapter]
        GWR[GitWorktreeResolver]
    end
    
    subgraph Storage["Storage"]
        Registry["~/.config/chainglass/workspaces.json"]
        Samples["<worktree>/.chainglass/data/samples/"]
    end
    
    UI --> Routes
    Forms --> Routes
    Routes --> DI
    DI --> WS
    DI --> SS
    WS --> WRA
    WS --> GWR
    SS --> SA
    WRA --> Registry
    SA --> Samples
```

#### Sequence Diagram: Add Workspace

```mermaid
sequenceDiagram
    actor User
    participant Form as WorkspaceAddForm
    participant API as /api/workspaces
    participant DI as DI Container
    participant WS as WorkspaceService
    participant Adapter as WorkspaceRegistryAdapter
    participant FS as FileSystem

    User->>Form: Enter name, path
    Form->>API: POST /api/workspaces
    API->>DI: resolve(WORKSPACE_SERVICE)
    DI-->>API: WorkspaceService
    API->>WS: add(name, path)
    WS->>WS: validatePath(path)
    WS->>Adapter: save(workspace)
    Adapter->>FS: writeFile(workspaces.json)
    FS-->>Adapter: success
    Adapter-->>WS: ok(workspace)
    WS-->>API: Result<Workspace>
    API-->>Form: 201 { workspace }
    Form-->>User: Success message
```

#### Sequence Diagram: List Samples for Worktree

```mermaid
sequenceDiagram
    actor User
    participant Page as SamplesPage
    participant API as /api/workspaces/[slug]/samples
    participant DI as DI Container
    participant WS as WorkspaceService
    participant SS as SampleService
    participant SA as SampleAdapter

    User->>Page: Navigate to /workspaces/chainglass/samples?worktree=/path
    Page->>API: GET /api/workspaces/chainglass/samples?worktree=/path
    API->>DI: resolve(WORKSPACE_SERVICE)
    API->>DI: resolve(SAMPLE_SERVICE)
    API->>WS: getInfo(slug)
    WS-->>API: WorkspaceInfo with worktrees
    API->>API: Build WorkspaceContext from slug + worktree
    API->>SS: list(context)
    SS->>SA: list(context)
    SA-->>SS: Sample[]
    SS-->>API: Result<Sample[]>
    API-->>Page: 200 { samples: [...] }
    Page-->>User: Render sample list
```

---

### Test Plan

**Approach**: Lightweight testing (integration tests only, no unit tests for thin API routes)

| Test | Type | Description | Fixtures |
|------|------|-------------|----------|
| Workspace API list | Integration | GET /api/workspaces returns list | FakeWorkspaceRegistryAdapter |
| Workspace API add | Integration | POST /api/workspaces creates workspace | Clean registry |
| Workspace API remove | Integration | DELETE /api/workspaces/[slug] removes | Pre-seeded workspace |
| Sample API list | Integration | GET returns samples for worktree | FakeSampleAdapter |
| Sample API create | Integration | POST creates sample | Clean worktree data |
| WorkspaceNav render | Component | Renders workspace list with worktrees | Mock fetch |
| Worktree context | E2E | URL param persists across navigation | Browser automation |

---

### Step-by-Step Implementation Outline

1. **T001**: Create `/api/workspaces/route.ts` with Zod schemas and DI resolution
2. **T002**: Create `/api/workspaces/[slug]/route.ts` for detail and remove
3. **T003**: Create `/api/workspaces/[slug]/samples/route.ts` with worktree context
4. **T004**: Create sample delete route
5. **T005**: Add Workspaces to NAV_ITEMS
6. **T006**: Build WorkspaceNav with Collapsible and Link components
7. **T007**: Mount WorkspaceNav in DashboardSidebar
8. **T008**: Create workspaces list page
9. **T009**: Create workspace detail page with worktree list
10. **T010**: Implement worktree URL param handling
11. **T011**: Create samples page for worktree
12. **T012**: Create sample form component
13. **T013**: Add sample delete with AlertDialog
14. **T014**: Create workspace add form
15. **T015**: Add workspace remove with AlertDialog

---

### Commands to Run

```bash
# Development
cd /home/jak/substrate/014-workspaces
pnpm dev                    # Start web dev server

# Type checking
just typecheck              # Verify no type errors

# Testing
just test                   # Run all tests
pnpm test --filter @chainglass/web  # Web package only

# Linting
just lint                   # Run biome linter

# Full quality check (before marking phase complete)
just check                  # lint + typecheck + test

# Build verification
just build                  # Build all packages
```

---

### Risks & Unknowns

| Risk | Severity | Mitigation |
|------|----------|------------|
| DI container not configured for web workspace services | Medium | Update `di-container.ts` early in T001; verify resolution before implementing routes |
| Worktree context construction from URL params may be complex | Low | Follow Phase 5 CLI pattern for context resolution |
| Sidebar integration may affect existing layout | Low | Mount WorkspaceNav as separate section below main nav |
| Zod validation schemas may not match service expectations | Low | Derive schemas from entity types; test with invalid inputs |

---

### Ready Check

- [x] Prior phases reviewed (Phases 1-5 complete)
- [x] Critical discoveries mapped to tasks
- [x] ADR constraints mapped to tasks (ADR-0004: DI container pattern)
- [ ] DI container tokens available for workspace services
- [ ] Worktree context construction approach validated
- [ ] API route pattern understood (dynamic, Zod, DI)

**Blocker Check**: Need to verify WORKSPACE_DI_TOKENS are properly exported and web container can register workspace services.

---

## Phase Footnote Stubs

_Populated during implementation by plan-6a-update-progress._

| ID | Footnote | Referenced By |
|----|----------|---------------|
| | | |

---

## Evidence Artifacts

Implementation will write:
- `execution.log.md` in this directory
- API route files in `/apps/web/app/api/workspaces/`
- Component files in `/apps/web/src/components/workspaces/`
- Page files in `/apps/web/app/(dashboard)/workspaces/`

---

## Discoveries & Learnings

_Populated during implementation by plan-6. Log anything of interest to your future self._

| Date | Task | Type | Discovery | Resolution | References |
|------|------|------|-----------|------------|------------|
| | | | | | |

**Types**: `gotcha` | `research-needed` | `unexpected-behavior` | `workaround` | `decision` | `debt` | `insight`

**What to log**:
- Things that didn't work as expected
- External research that was required
- Implementation troubles and how they were resolved
- Gotchas and edge cases discovered
- Decisions made during implementation
- Technical debt introduced (and why)
- Insights that future phases should know about

_See also: `execution.log.md` for detailed narrative._

---

## Directory Layout

```
docs/plans/014-workspaces/
├── workspaces-spec.md
├── workspaces-plan.md
└── tasks/
    ├── phase-1-workspace-entity-registry-adapter-contract-tests/
    │   ├── tasks.md
    │   └── execution.log.md
    ├── phase-2-workspacecontext-resolution/
    │   ├── tasks.md
    │   └── execution.log.md
    ├── phase-3-sample-domain-exemplar/
    │   ├── tasks.md
    │   └── execution.log.md
    ├── phase-4-service-layer-di-integration/
    │   ├── tasks.md
    │   └── execution.log.md
    ├── phase-5-cli-commands/
    │   ├── tasks.md
    │   └── execution.log.md
    └── phase-6-web-ui/
        ├── tasks.md           ← THIS FILE
        └── execution.log.md   ← Created by plan-6
```

---

**STOP**: Do **not** edit code. Await explicit **GO** to proceed with implementation.

**Next step**: Run `/plan-6-implement-phase --phase "Phase 6: Web UI" --plan "/home/jak/substrate/014-workspaces/docs/plans/014-workspaces/workspaces-plan.md"` after GO approval.
