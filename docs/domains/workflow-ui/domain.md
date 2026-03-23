# Domain: Workflow UI

**Slug**: workflow-ui
**Type**: business
**Created**: 2026-02-26
**Created By**: Plan 050 Workflow Page UX
**Status**: active
**C4 Diagram**: [C4 Component](../../c4/components/workflow-ui.md)

## Purpose

Visual workflow editor for the positional graph system. Users view and edit line-based workflows on a canvas with drag-and-drop from a toolbox, context flow indicators, Q&A modals for node questions, undo/redo, and real-time SSE updates from filesystem changes. Replaces the legacy workgraph UI (Plan 022) with a purpose-built editing experience.

## How to Use

### For Users

1. Navigate to **Workflows** in the workspace sidebar (or the Workflows card on the worktree page)
2. Select an existing workflow or create a new one (blank or from template)
3. Drag work units from the right toolbox onto lines in the canvas
4. Click a node to see its properties panel; click "Edit Properties..." to modify
5. When a node has a pending question (❓ badge), click it to open the Q&A modal
6. Use the ↶/↷ toolbar buttons to undo/redo structural changes
7. Changes save immediately to disk — other editors/CLI agents see them via SSE

### For Developers

- **Feature folder**: `apps/web/src/features/050-workflow-page/`
- **Server actions**: `apps/web/app/actions/workflow-actions.ts` — all mutations go through here
- **Pages**: `apps/web/app/(dashboard)/workspaces/[slug]/workflows/` — list + editor
- **Doping**: Run `just dope` to create demo workflows, `just redope` to reset them
- **Tests**: `test/unit/web/features/050-workflow-page/` — unit tests with FakePositionalGraphService
- **Key pattern**: Server Component loads data → passes to Client Component. Mutations via `'use server'` actions that resolve DI → call service → return result.

## Boundary

### Owns
- Workflow editor page (`/workspaces/[slug]/workflows/[graph]`) — canvas + toolbox + properties panel
- Workflow list page (`/workspaces/[slug]/workflows`) — browse available workflows
- Canvas components — line rows, node cards, drop zones, drag overlays, context flow indicators
- Toolbox panel — work unit catalog, drag sources
- Context flow indicators — PCB-style traces, context badges (green/blue/purple/gray), gate chips, select-to-reveal
- Properties panel — node detail view in right panel slot
- Q&A modal — 4 question types (text/single/multi/confirm) + always-on freeform
- Node edit modal — description, orchestratorSettings, input wiring
- Undo/redo system — in-memory snapshot stack (50 max), toolbar buttons with depth badges
- Naming modals — new blank, new from template, save as template with kebab-case validation
- SSE subscription — useWorkflowSSE hook with structural/status change discrimination
- Mutation lock — self-event suppression via isMutating ref
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
| `POST /api/.../execution` | REST API | Harness SDK, curl | Start workflow execution via WorkflowExecutionManager |
| `GET /api/.../execution` | REST API | Harness SDK, curl | Poll current execution status |
| `DELETE /api/.../execution` | REST API | Harness SDK, curl | Stop a running workflow |
| `POST /api/.../execution/restart` | REST API | Harness SDK, curl | Restart workflow (stop + reset + start) |
| `GET /api/.../detailed` | REST API | Harness SDK, curl | Per-node diagnostics via getReality() |

## Composition (Internal)

| Component | Role | Depends On |
|-----------|------|------------|
| Workflow list page | Browse workflows in workspace | IPositionalGraphService (list, getStatus) |
| Workflow editor page | Standalone layout: canvas + toolbox | IPositionalGraphService (load, getStatus), IWorkUnitService (list) |
| WorkflowCanvas | Line/node rendering from GraphStatusResult | WorkflowLine, WorkflowNodeCard, EmptyStates |
| WorkflowNodeCard | Node card with status, context badge, gate chips | context-badge.ts, gate-chip.tsx |
| WorkUnitToolbox | Right sidebar: grouped units with search | IWorkUnitService (list) via server action |
| NodePropertiesPanel | Right panel on node selection | related-nodes.ts, compute-available-sources.ts |
| ContextFlowIndicator | PCB-style upstream/downstream traces | related-nodes.ts |
| QAModal | 4 question types + freeform text | answerQuestion server action |
| NodeEditModal | Edit description, settings, input wiring | updateNodeConfig, setNodeInput server actions |
| UndoRedoManager | In-memory snapshot stack (50 max) | structuredClone |
| useWorkflowSSE | Real-time SSE subscription for active graph | WorkflowWatcherAdapter → SSE → hook |
| useWorkflowMutations | Centralized mutation dispatch + optimistic refresh | Server actions, undo/redo snapshot capture |
| NamingModal | New blank / new from template / save as template | createWorkflow, instantiateTemplate, saveAsTemplate actions |
| DropZone | In-place drop zones between nodes | dnd-kit |
| dope-workflows.ts | Demo scenario generation script | IPositionalGraphService (via script DI container) |

## Source Location

Primary: `apps/web/src/features/050-workflow-page/`
Supporting: `apps/web/src/features/074-workflow-execution/` — execution hook, button-state utility, manager types, registry persistence, resume-on-bootstrap recovery (shared with positional-graph domain)

| File/Area | Role | Notes |
|-----------|------|-------|
| `apps/web/src/features/050-workflow-page/components/` | UI components | Canvas, node card, toolbox, modals, panels, temp bar, drop zones |
| `apps/web/src/features/050-workflow-page/hooks/` | React hooks | useUndoRedo, useWorkflowSSE, useWorkflowMutations |
| `apps/web/src/features/050-workflow-page/lib/` | Pure logic | UndoRedoManager, context-badge, related-nodes, compute-available-sources |
| `apps/web/src/features/050-workflow-page/types.ts` | Shared types | WorkflowSnapshot, server action types |
| `apps/web/src/features/074-workflow-execution/hooks/` | Execution hook | useWorkflowExecution (hydration + SSE + action gating) |
| `apps/web/src/features/074-workflow-execution/execution-button-state.ts` | Button state utility | deriveButtonState() pure function |
| `apps/web/src/features/074-workflow-execution/execution-registry.types.ts` | Registry types | Zod schemas, `IExecutionRegistry`, `toRegistryEntry()` |
| `apps/web/src/features/074-workflow-execution/execution-registry.ts` | Registry I/O | read/write/remove with atomic writes, self-healing on corrupt files |
| `apps/web/src/features/074-workflow-execution/workflow-execution-manager.ts` | Execution manager | start/stop/restart/resume lifecycle, registry persistence, debounced iteration writes |
| `apps/web/app/(dashboard)/workspaces/[slug]/workflows/` | Route pages | List + editor server components |
| `apps/web/app/actions/workflow-actions.ts` | Server actions | 17 actions: load, list, create, mutations, Q&A, undo, SSE refresh |
| `packages/workflow/src/features/023-central-watcher-notifications/workflow-watcher.adapter.ts` | Watcher adapter | Filters graph.yaml/node.yaml/state.json changes, 200ms debounce |
| `apps/web/src/features/027-central-notify-events/workflow-domain-event-adapter.ts` | Domain event adapter | Routes to 'workflows' SSE channel |
| `scripts/dope-workflows.ts` | Doping script | 8 demo workflow scenarios |
| `test/unit/web/features/050-workflow-page/` | Unit tests | Canvas, node card, toolbox, Q&A modal, undo manager |
| `test/integration/dope-workflows.test.ts` | Doping validation test | Verifies all scenarios |

## Dependencies

### This Domain Depends On

| Domain/Package | What It Consumes | Notes |
|---------------|-----------------|-------|
| `_platform/positional-graph` | `IPositionalGraphService`, `ITemplateService`, `IInstanceService`, `IWorkUnitService` | All graph CRUD, status, templates |
| `_platform/file-ops` | `IFileSystem`, `IPathResolver` | Filesystem operations |
| `_platform/events` | `useChannelEvents('workflows')`, multiplexed SSE | Live editor updates (Plan 072) |
| `_platform/panel-layout` | ~~`PanelShell`~~ Not used — standalone layout | DYK Phase 2: dropped PanelShell |
| `_platform/workspace-url` | `workspaceHref`, param caches | URL state management |
| `_platform/sdk` | `IUSDK` | Commands and keybindings |
| `_platform/state` | `useGlobalState` | Subscribe to execution/state updates |
| `@chainglass/shared` | `IYamlParser`, Result types | Foundation utilities |

### Domains That Depend On This

- None (leaf business domain)

## Gotchas

- **Undo is blocked during execution**: `restoreSnapshot` rejects with E998 if any line is running/active — prevents fighting the orchestrator
- **Q&A delegates to WorkflowEvents**: `answerQuestion()` server action delegates to `IWorkflowEvents.answerQuestion()` which handles the 3-event handshake (answer + restart) internally. The server action is a single call.
- **SSE structural vs runtime**: `graph.yaml`/`node.yaml` changes invalidate undo + show toast. `state.json` changes (orchestrator writes) only trigger silent refresh. Don't treat them the same.
- **Mutation lock**: All mutation paths must wrap in `startMutation()`/`endMutation()` with `try/finally` — otherwise SSE self-event suppression breaks and you get infinite refresh loops
- **dnd-kit drop zones must always be mounted**: Conditional rendering breaks collision detection registration. Toggle visibility via CSS, not React conditionals.
- **Empty lines are "complete"**: The graph engine marks lines with 0 nodes as complete. Check `nodes.length === 0` before treating a line as truly done.
- **Web tsconfig path mapping**: `@chainglass/positional-graph` maps to `dist/` in `apps/web/tsconfig.json`. Rebuild the package (`pnpm --filter @chainglass/positional-graph build`) before typecheck if you change service interfaces.
- **Keyboard shortcuts dropped**: Ctrl+Z/Shift+Z were dropped to avoid conflicts with text inputs in modals. Undo/redo is toolbar-only.

## History

| Plan | What Changed | Date |
|------|-------------|------|
| Plan 050 Phase 1 | Domain formalized, DI wiring, fakes, doping system | 2026-02-26 |
| Plan 050 Phase 2 | Workflow list + editor pages, canvas/line/node components, server actions, toolbox, nav update | 2026-02-26 |
| Plan 050 Phase 3 | DnD toolbox→canvas, drop zones, node deletion, line management, naming modals, 11 mutation server actions | 2026-02-26 |
| Plan 050 Phase 4 | Context badges, gate chips, select-to-reveal traces, node properties panel, line transition gates | 2026-02-26 |
| Plan 050 Phase 5 | Q&A modal (4 types + freeform), node edit modal, UndoRedoManager, undo/redo toolbar buttons, snapshot server actions | 2026-02-27 |
| Plan 050 Phase 6 | WorkflowWatcherAdapter, WorkflowDomainEventAdapter, useWorkflowSSE hook, mutation lock, structural vs runtime change discrimination | 2026-02-27 |
| Plan 050 Phase 7 | Removed all Plan 022 workgraph UI (pages, API routes, feature folder, DI registrations, event adapters, tests). Workflows card replaces WorkGraphs on worktree page. | 2026-02-27 |
| Plan 061 Phase 3 | answerQuestion server action migrated to IWorkflowEvents delegation (single call replaces 2-step PGService handshake) | 2026-03-01 |
| Plan 072 Phase 5 | Migrated useWorkflowSSE from `useSSE` to `useChannelEvents('workflows')` via multiplexed SSE. Deleted legacy `useSSE` hook. | 2026-03-08 |
| Plan 074 Phase 4 | Run/Stop/Restart execution controls in toolbar, execution-aware node locking, undo/redo blocking during execution, live status display | 2026-03-15 |
| Plan 074 Phase 5 | Execution registry persistence for server restart recovery: registry types/Zod schema, sync atomic writes, resumeAll() with self-healing, debounced iteration persistence, SIGTERM best-effort persist | 2026-03-15 |
| Plan 076 P4-ST001 | Workflow execution REST API (5 Tier 1 endpoints: execution CRUD + detailed diagnostics) for harness/server-mode validation. Uses IOrchestrationService + auth() for API routes. | 2026-03-22 |
