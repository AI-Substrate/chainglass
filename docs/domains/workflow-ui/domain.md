# Domain: Workflow UI

**Slug**: workflow-ui
**Type**: business
**Created**: 2026-02-26
**Created By**: Plan 050 Workflow Page UX
**Status**: active

## Purpose

Visual workflow editor for the positional graph system. Users view and edit line-based workflows on a canvas with drag-and-drop from a toolbox, context flow indicators, undo/redo, and real-time filesystem-backed state. Replaces the legacy workgraph UI (Plan 022) with a purpose-built editing experience.

## Boundary

### Owns
- Workflow editor page (`/workspaces/[slug]/workflows/[graph]`) — canvas + toolbox + properties panel
- Workflow list page (`/workspaces/[slug]/workflows`) — browse available workflows
- Canvas components — line rows, node cards, drop zones, drag overlays
- Toolbox panel — work unit catalog, drag sources
- Context flow indicators — PCB-style traces, context badges, select-to-reveal
- Properties panel — node detail view in right panel slot
- Undo/redo system — in-memory snapshot stack (50 max)
- Workflow URL params — graph, line, node query params
- Doping system — `scripts/dope-workflows.ts`, demo scenario generation
- Justfile commands — `just dope`, `just redope`, `just dope clean`

### Does NOT Own
- Positional graph engine (IPositionalGraphService) — consumes from `_platform/positional-graph`
- Template/instance lifecycle (ITemplateService, IInstanceService) — consumes from `_platform/positional-graph`
- Work unit catalog (IWorkUnitService) — consumes from `_platform/positional-graph`
- Filesystem abstraction (IFileSystem, IPathResolver) — consumes from `_platform/file-ops`
- Panel layout shell (PanelShell) — consumes from `_platform/panel-layout`
- Event/SSE infrastructure — consumes from `_platform/events`
- URL infrastructure (workspaceHref) — consumes from `_platform/workspace-url`
- SDK surface (commands, keybindings) — consumes from `_platform/sdk`

## Contracts (Public Interface)

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| _None_ | — | — | Leaf consumer domain — no contracts exported |

## Composition (Internal)

| Component | Role | Depends On |
|-----------|------|------------|
| Workflow list page | Browse workflows in workspace | IPositionalGraphService (list, getStatus) |
| Workflow editor page | Standalone layout: canvas + toolbox | IPositionalGraphService (load, getStatus), IWorkUnitService (list) |
| WorkflowCanvas | Line/node rendering from GraphStatusResult | WorkflowLine, WorkflowNodeCard, EmptyStates |
| WorkUnitToolbox | Right sidebar: grouped units with search | IWorkUnitService (list) via server action |
| dope-workflows.ts | Demo scenario generation script | IPositionalGraphService (via script DI container) |

## Source Location

Primary: `apps/web/src/features/050-workflow-page/`

| File/Area | Role | Notes |
|-----------|------|-------|
| `apps/web/src/features/050-workflow-page/` | Feature folder | All UI components, hooks, types |
| `apps/web/app/(dashboard)/workspaces/[slug]/workflows/` | Route pages | List + editor server components |
| `apps/web/app/actions/workflow-actions.ts` | Server actions | loadWorkflow, listWorkflows, createWorkflow, listWorkUnits |
| `scripts/dope-workflows.ts` | Doping script | Demo workflow generation |
| `test/integration/dope-workflows.test.ts` | Doping validation test | Verifies all scenarios |
| `test/unit/web/features/050-workflow-page/` | Unit tests | Canvas, node card, toolbox, list rendering |

## Dependencies

### This Domain Depends On

| Domain/Package | What It Consumes | Notes |
|---------------|-----------------|-------|
| `_platform/positional-graph` | `IPositionalGraphService`, `ITemplateService`, `IInstanceService`, `IWorkUnitService` | All graph CRUD, status, templates |
| `_platform/file-ops` | `IFileSystem`, `IPathResolver` | Filesystem operations |
| `_platform/events` | `useSSE`, SSE infrastructure | Live editor updates |
| `_platform/panel-layout` | ~~`PanelShell`~~ Not used — standalone layout | DYK Phase 2: dropped PanelShell |
| `_platform/workspace-url` | `workspaceHref`, param caches | URL state management |
| `_platform/sdk` | `IUSDK` | Commands and keybindings |
| `@chainglass/shared` | `IYamlParser`, Result types | Foundation utilities |

### Domains That Depend On This

- None (leaf business domain)

## History

| Plan | What Changed | Date |
|------|-------------|------|
| Plan 050 Phase 1 | Domain formalized, DI wiring, fakes, doping system | 2026-02-26 |
| Plan 050 Phase 2 | Workflow list + editor pages, canvas/line/node components, server actions, toolbox, nav update | 2026-02-26 |
