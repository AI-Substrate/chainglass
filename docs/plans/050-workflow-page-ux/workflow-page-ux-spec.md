# Workflow Page UX

**Mode**: Full
📚 This specification incorporates findings from research-dossier.md and 5 workshops (001-005).

## Research Context

Research dossier (73 findings across 8 subagents) established:
- Existing infrastructure is rich: dnd-kit, SSE events, PanelShell, SDK, DI container, template service all installed
- Positional model (lines + ordered nodes) is fundamentally different from the deprecated DAG/workgraph model
- File-browser domain is the reference implementation for complex page architecture
- 15 prior learnings from Plans 039-049 inform gotchas and patterns
- 5 workshops resolved: canvas layout (HTML/CSS + dnd-kit, not ReactFlow), context indicator colors, per-instance config (already solved by node.yaml), undo/redo (Command Pattern), and doping system (7 demo scenarios)

## Summary

Build a visual workflow editor for the positional graph system. Users construct workflows by adding numbered lines and dragging work units (agent, code, human-input) onto them. The editor shows context flow between nodes, readiness gate status, and supports question/answer interactions. All changes persist immediately to disk with undo/redo support. The system integrates with the template/instance lifecycle (Plan 048) and real-time events for live updates. The old workgraph UI (Plan 022) is fully deprecated and removed.

## Goals

- **Visual workflow construction**: Users can create, view, and edit positional graph workflows through a line-based visual editor with drag-and-drop
- **Context awareness**: Users can see at a glance which context each node receives (global, inherited, explicit), what's blocking a node, and how data flows between nodes
- **Real-time collaboration**: Changes from CLI, agents, or other browser tabs appear instantly via SSE events
- **Immediate persistence**: Every mutation (add, move, delete, edit) saves to disk immediately — no "save" button needed
- **Filesystem is the sole source of truth**: No workflow state lives outside the filesystem. The UI reads from disk, caches in memory for performance (including undo snapshots), but the `.chainglass/` directory is the complete and only source of truth for every piece of data a workflow can have. If the browser crashes, nothing is lost.
- **Undo/redo**: Ctrl+Z / Ctrl+Shift+Z revert both UI state and filesystem writes
- **Template integration**: Users can create workflows from templates, save workflows as templates, and manage instances
- **Question/answer flows**: Users can respond to agent questions (text, single-choice, multi-choice, confirm) directly in the UI
- **Development enablement**: Repeatable `just dope` command populates sample workflows in various states for rapid UI development and testing
- **Clean deprecation**: Remove all workgraph UI code (Plan 022) and legacy workflow pages, replacing with positional graph equivalents

## Non-Goals

- **Agent execution**: Actually running agents/orchestration is out of scope — UX only (status display, not execution triggers beyond basic "Run" button wiring)
- **Flow control nodes**: Future node types (conditionals, loops) are out of scope but architecture must not preclude them
- **Mobile support**: Workflow editor is desktop-only (show "use desktop" message on mobile)
- **Zoom/minimap**: v1 uses scroll only at 100% zoom; zoom is a future enhancement
- **Bulk fixture reconfiguration**: Converting all old e2e test fixtures to new template system is deferred
- **Real agent integration**: Connecting the Run button to actual orchestration service is deferred to a future plan
- **Graph diffing**: Showing what changed between template versions is deferred

## Target Domains

| Domain | Status | Relationship | Role in This Feature |
|--------|--------|-------------|---------------------|
| workflow-ui | **NEW** | **create** | New business domain — owns workflow page, editor components, URL state, SDK contributions |
| _platform/positional-graph | existing | **consume** | Primary data provider — graph CRUD, status, templates, instances (no changes to domain) |
| _platform/events | existing | **modify** | Extend with WorkflowWatcherAdapter for .chainglass/data/ graph file changes |
| _platform/panel-layout | existing | **consume** | PanelShell, ExplorerPanel, LeftPanel, MainPanel (no changes) |
| _platform/sdk | existing | **consume** | Commands (undo, redo, save), keybindings, settings (no changes to domain) |
| _platform/workspace-url | existing | **consume** | workspaceHref, URL param state (no changes) |
| _platform/file-ops | existing | **consume** | IFileSystem for server actions (no changes) |
| _platform/workgraph | existing / deprecated | **remove** | Deprecate and remove all workgraph UI pages, API routes, and components |

### New Domain Sketches

#### workflow-ui [NEW]
- **Purpose**: Visual workflow editor for the positional graph system. Owns all UI components, pages, state management, and SDK contributions for workflow construction and monitoring.
- **Boundary Owns**: Workflow page routes, canvas component, node cards, line containers, work unit toolbox, undo/redo manager, workflow URL params, question/answer modal, node properties modal, workflow status bar, server actions for graph mutations, SSE subscription for workflow updates, SDK command contributions (undo, redo, save-as-template), doping script
- **Boundary Excludes**: Graph engine logic (positional-graph domain), template/instance lifecycle (positional-graph domain), event transport infrastructure (events domain), panel layout primitives (panel-layout domain), filesystem abstraction (file-ops domain)

## Complexity

- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=1, D=1, N=1, F=1, T=2
  - Surface Area (S=2): Many files across new feature folder, pages, components, server actions, tests, scripts
  - Integration (I=1): One external system (SSE events) + multiple internal domain integrations
  - Data/State (D=1): Uses existing schemas (graph.yaml, state.json, node.yaml) — no new schemas needed
  - Novelty (N=1): Some ambiguity in canvas interaction design, but workshops resolved key decisions
  - Non-Functional (F=1): Real-time performance (SSE latency), drag-drop responsiveness
  - Testing/Rollout (T=2): Needs unit tests (fakes), integration tests (real FS), and repeatable demo scenarios
- **Confidence**: 0.80
- **Assumptions**: All 5 infrastructure domains are stable and don't need changes (except events domain for watcher adapter)
- **Dependencies**: Plan 048 (templates) complete, positional-graph service stable, events domain operational
- **Risks**: Canvas interaction complexity may increase scope; workgraph deprecation may break unknown consumers
- **Phases**: ~6 phases (domain setup + doping → canvas core → context indicators → Q&A + properties → undo/redo + events → workgraph deprecation)

## Acceptance Criteria

### Canvas & Layout
1. **AC-01**: Workflow page accessible at `/workspaces/[slug]/workflows` (list) and `/workspaces/[slug]/workflows/[graphSlug]` (editor) — renders using PanelShell with left panel (work unit toolbox) and main panel (canvas). A temporary top bar contains a placeholder Run button (disabled, tooltip "Coming in future plan").
2. **AC-02**: Canvas renders lines as horizontal rows stacked top-to-bottom, numbered on the left edge, with node cards arranged left-to-right within each line
3. **AC-03**: Empty workflow shows centered "+" button; empty line shows dashed drop zone with placeholder text
4. **AC-04**: Users can add a new line via "Add Line" button — line appears with auto-generated label, graph.yaml updates immediately
5. **AC-05**: Lines display label (click-to-edit), settings gear, transition badge (auto/manual), and delete button

### Drag-and-Drop
6. **AC-06**: Right panel shows available work units grouped by type (Agent, Code, Human Input) with search/filter — always visible, loaded from IWorkUnitService.list(). This is the exclusive source for adding nodes to lines (no per-line add buttons).
7. **AC-07**: Users can drag a work unit from the right panel toolbox onto a line — during drag, lines glow subtly and in-place `[+]` drop zones appear between existing nodes and at the end of each line (drop zones appear without shifting existing node layout). On drop, node appears at drop position, graph.yaml + node.yaml written immediately, and context flow / dependency indicators update instantly.
8. **AC-08**: Users can drag nodes to reorder within a line or move between lines — position/line updates persist immediately. Dragging is only permitted on lines that are not currently running or already complete; active lines must be paused/stopped first. Future (not-yet-started) lines are always editable.
9. **AC-09**: Users can delete nodes via context menu or keyboard (Backspace when selected) — removal persists immediately. Same running-line restriction applies.

### Node Cards & Status
10. **AC-10**: Node cards display: type icon (🤖/⚙️/👤), unit name, description (truncated), status indicator (colored dot + label), and context badge (colored corner square)
11. **AC-11**: Node status colors match the 8 defined states: pending (gray), ready (blue), starting (blue pulse), agent-accepted (blue animated), waiting-question (purple), blocked-error (red), restart-pending (amber), complete (green)
12. **AC-12**: Blocked nodes show a gate chip indicating which of the 5 readiness gates is blocking (preceding lines, transition, serial neighbor, contextFrom, inputs) with human-readable message

### Context Flow
13. **AC-13**: Context badges on every node card show context source: green (new/global), blue (inherited from left), purple (explicit contextFrom), gray (non-agent)
14. **AC-14**: Nodes with `noContext: true` show a lock icon (🔒) on the title row
15. **AC-15**: Selecting a node reveals its dependency neighborhood: upstream input sources shown as full-color PCB-style traces (green=available, amber=waiting, red=error) routed in under-line channels; downstream consumers shown as muted gray dashed traces; unrelated nodes dim to ~40% opacity. A read-only properties panel appears in the right panel showing context source, inputs, outputs, and downstream consumers. Deselecting restores normal view.

### Node Properties & Configuration
16. **AC-16**: Double-clicking a node (or context menu → Edit) opens a modal with: unit info (read-only), node description (editable), orchestrator settings (execution mode, waitForPrevious, noContext, contextFrom), and input wiring configuration — all changes save to node.yaml
17. **AC-17**: Line transitions between lines show as auto (↓ arrow) or manual (🔒 gate button) — manual gate is clickable when preceding line is complete

### Question/Answer
18. **AC-18**: Nodes in `waiting-question` state show a clickable purple badge — clicking opens a Q&A modal supporting text input, single-choice (radio), multi-choice (checkboxes), and confirm (yes/no) — answer submits via answerQuestion() API
19. **AC-19**: All question types also support freeform text input alongside structured input (user can always type even with multiple choice)

### Template Integration
20. **AC-20**: Explorer temp bar shows template/instance breadcrumb when viewing an instance — "Template Name > Instance ID"
21. **AC-21**: "New from Template" opens a modal with composite slug: `{template-name}-{editable-middle}-{hash}` — template prefix and hash suffix are locked (non-editable), middle section is pre-filled with a suggestion but user-editable. Creates instance via ITemplateService.instantiate().
22. **AC-22**: "Save as Template" opens a modal with slug input pre-filled with current graph slug (user can edit). Warns on overwrite if template already exists. Saves via ITemplateService.saveFrom().
23. **AC-22b**: Workflow list page shows "New Blank Workflow" and "New from Template" buttons side by side — blank opens a modal with empty slug input (user must type), template opens a picker then the composite naming modal. All slugs validated as kebab-case (`^[a-z][a-z0-9-]*$`) with inline error feedback.

### Undo/Redo
23. **AC-23**: Ctrl+Z undoes the last mutation by restoring a pre-mutation snapshot of the workflow state (definition + node configs) back to disk; Ctrl+Shift+Z redoes. Uses in-memory snapshot pattern (not command pattern) — zero per-operation logic, every new feature gets undo for free. Max 50 snapshots (~5MB).
24. **AC-24**: Undo/redo buttons in toolbar show stack depth and are disabled when empty
25. **AC-25**: External changes (detected via SSE) invalidate the undo stack with a toast notification

### Real-Time Updates
26. **AC-26**: Changes from CLI (`cg wf` commands) or other browser tabs appear in the editor within 2 seconds via SSE events — no manual refresh needed
27. **AC-27**: WorkflowWatcherAdapter detects graph.yaml and state.json changes under `.chainglass/data/` and broadcasts via SSE

### Doping System
28. **AC-28**: `just dope` command creates 7+ demo workflows (blank, serial, running, question, error, complete, complex) in the current worktree's `.chainglass/data/workflows/`. Workflow list page loads them on navigate (no live SSE for list — manual refresh or navigate to see new workflows).
29. **AC-29**: `just dope clean` removes all demo workflows; `just dope <name>` creates a specific scenario; `just redope` cleans and recreates all. Scenarios are extensible — adding a new scenario is just adding a function to the SCENARIOS map.
30. **AC-30**: Demo workflows use committed sample work units from `.chainglass/units/sample-*` and cover all 8 node status states. Scenario list is expected to grow during implementation as edge cases are discovered — the goal is to validate every UI state through doping before real agents are wired.

### Workgraph Deprecation
31. **AC-31**: All Plan 022 workgraph UI pages (`/workspaces/[slug]/workgraphs/*`) are removed or redirect to new workflow pages
32. **AC-32**: Legacy API routes under `/api/workspaces/[slug]/workgraphs/` are removed
33. **AC-33**: Old `/workflow` demo page and `/workflows` + `/workflows/[slug]` placeholder pages are removed — all workflow UX is workspace-scoped
34. **AC-34**: WorkGraphWatcherAdapter and WorkGraphDomainEventAdapter are removed (replaced by new Workflow equivalents)

### Testing
35. **AC-35**: Unit tests cover: canvas rendering, node card states, drag-drop handlers, undo/redo manager, context badge computation, Q&A modal — using fake services (Constitution P4)
36. **AC-36**: Integration tests cover: server actions with real filesystem, graph mutation + state persistence round-trip, template instantiation from UI flow
37. **AC-37**: Demo scenarios (doping script) are validated by at least one automated test confirming all 7 scenarios create valid graph structures

## Risks & Assumptions

### Risks
1. **Canvas interaction complexity**: Custom HTML/CSS canvas with dnd-kit may need refinement for smooth UX — mitigated by building on proven kanban board patterns
2. **Workgraph deprecation breakage**: Unknown consumers of workgraph API routes may break — mitigated by search for all workgraph imports before removal
3. **SSE event latency**: Real-time updates depend on CentralWatcherService responsiveness — mitigated by existing proven infrastructure (Plan 045)
4. **Undo/redo edge cases**: Command Pattern inversions may fail if graph state is externally modified between operations — mitigated by stack invalidation on external changes
5. **Bundle size**: Removing ReactFlow dependency (150KB+) partially offsets new component code

### Assumptions
1. Plan 048 template/instance system is complete and stable (confirmed: 38/38 tasks, all tests pass)
2. IPositionalGraphService API is stable and sufficient for all UI operations
3. Existing sample work units (`.chainglass/units/sample-*`) are usable for demo scenarios
4. Events domain SSE infrastructure handles workflow-specific events without core changes (only adapter needed)
5. PanelShell layout system is sufficient for workflow page (no panel-layout domain changes needed)

## Open Questions

All open questions resolved in Clarification Session 2026-02-26. See `## Clarifications` section.

## Testing Strategy

- **Approach**: Full TDD (Red → Green → Refactor)
- **Mock Policy**: Avoid mocks entirely — use fakes with call tracking + return builders (Constitution P4). Use real data/fixtures for integration tests.
- **Rationale**: CS-4 feature with complex interactions (drag-drop, undo/redo, context computation). TDD ensures each component works correctly before integration.
- **Focus Areas**:
  - Canvas rendering with various graph states (empty, multi-line, complex)
  - Drag-drop handlers (toolbox → line, reorder, cross-line move)
  - Undo/redo manager (push, undo, redo, invalidation)
  - Context badge computation from readyDetail + ContextSourceResult
  - Q&A modal with all 4 question types
  - Server actions round-trip (graph mutation → persistence → load)
  - Doping script creates valid graph structures for all 7 scenarios
- **Excluded**: E2E browser tests (Playwright) — deferred. Visual regression tests — deferred.
- **Fakes Needed**:
  - `FakePositionalGraphService` — already exists or build from IPositionalGraphService contract
  - `FakeTemplateService` — already exists (Plan 048)
  - `FakeWorkUnitService` — build from IWorkUnitService contract
  - `FakeUndoRedoManager` — for canvas tests that don't need real undo
  - `FakeSSESource` — for testing real-time update subscription

## Documentation Strategy

- **Approach**: No new documentation
- **Rationale**: Internal UI feature — TypeScript types + JSDoc + workshop documents are sufficient. Existing `docs/how/workflow-templates.md` (Plan 048) covers template concepts. Code is self-documenting via interfaces and types.

## Clarifications

### Session 2026-02-26

**Q1: Workflow Mode** → **Full** (CS-4 feature, multiple phases, all gates required)

**Q2: Testing Strategy** → **Full TDD** with fakes (Constitution P4), no mocks. Red → Green → Refactor for all components.

**Q3: Mock Usage** → **Avoid mocks entirely** — fakes with call tracking + return builders. Real filesystem for integration tests.

**Q4: Documentation Strategy** → **No new documentation** — TypeScript types + JSDoc + existing workshop docs are sufficient.

**Q5: Domain Review** → **Boundary confirmed** as-is. workflow-ui is a leaf consumer with doping script included. No contracts exposed.

**Q6: Navigation structure** → **Workspace-scoped** — workflows live in worktrees, data is local to worktree (stored in .chainglass/, Git-managed). Routes: `/workspaces/[slug]/workflows` (list) and `/workspaces/[slug]/workflows/[graphSlug]` (editor).

**Q7: Explorer bar / Run button** → **No ExplorerPanel** for workflow page (future plan will extract explorer bar from file-browser into its own domain). Use a **temporary top bar** with a **placeholder Run button** (disabled, tooltip "Coming in future plan"). Future plan will standardize the explorer bar across all pages.

**Q8: Existing `/workflows` and `/workflows/[slug]` pages** → **Remove them all** — they're Plan 022 artifacts, replaced by workspace-scoped routes.

**Q9: New workflow creation flow** → **Both options** — "New Blank Workflow" + "New from Template" buttons side by side on the workflow list page.

**Q10: Naming — Create from Template** → Composite slug modal: `{template-name}-{editable-middle}-{hash}`. Template prefix and hash suffix are locked/non-editable. Middle section pre-filled with suggestion (e.g. date) but user can edit.

**Q11: Naming — Create New Blank** → Modal with empty slug input, user must type it. Inline kebab-case validation.

**Q12: Naming — Save as Template** → Modal with slug input pre-filled with current graph slug. User can edit. Warns on overwrite.

**Q13: Drag-and-Drop — Toolbox position** → **Right panel** (always visible), not left panel. No per-line add buttons. Nodes added exclusively by dragging from right panel.

**Q14: Drag-and-Drop — Drop zones** → When dragging starts, lines glow subtly and in-place `[+]` drop zones appear between existing nodes and at end of line. Drop zones appear without shifting existing node layout (overlay, not layout-expanding).

**Q15: Drag-and-Drop — Running line restriction** → Cannot drag/reorder/delete on lines that are currently running or already complete. Must pause/stop agents first. Future (not-yet-started) lines are always editable.

**Q16: Drop feedback** → On drop, context flow indicators and dependency badges update immediately to reflect new node's position.

## Workshop Opportunities

All 5 workshops have been completed pre-spec:

| Topic | Type | Status | Document |
|-------|------|--------|----------|
| Line-Based Canvas UX Design | UI Design | ✅ Complete | [workshops/001](workshops/001-line-based-canvas-ux-design.md) |
| Context Flow Indicator Design | UI Design | ✅ Complete | [workshops/002](workshops/002-context-flow-indicator-design.md) |
| Per-Instance Work Unit Configuration | Data Model | ✅ Complete | [workshops/003](workshops/003-per-instance-work-unit-configuration.md) |
| Undo/Redo Stack Architecture | Integration Pattern | ✅ Complete | [workshops/004](workshops/004-undo-redo-stack-architecture.md) |
| Sample Workflow & Doping System | CLI Flow | ✅ Complete | [workshops/005](workshops/005-sample-workflow-doping-system.md) |

### Key Workshop Decisions (Summary)

- **Canvas**: Custom HTML/CSS + dnd-kit (NOT ReactFlow). Lines are flexbox rows, nodes are sortable items. (W001)
- **Context badges**: Colored corner squares — green (new), blue (inherited), purple (explicit), gray (N/A). (W002)
- **Gate chips**: Colored chips on blocked nodes showing which of 5 gates is blocking. (W002)
- **Config**: Already solved — orchestratorSettings on node.yaml (per-instance), unit.yaml is shared/refreshable. (W003)
- **Undo/redo**: In-memory snapshot pattern — deep-clone state before each mutation, restore on Ctrl+Z. No per-operation inverse logic. 50 max, ~5MB. Invalidated on external changes. (W004, revised)
- **Doping**: 7 demo scenarios via `scripts/dope-workflows.ts`, invoked by `just dope`. (W005)
