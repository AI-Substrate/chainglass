# Workflow Page UX Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-26
**Spec**: [workflow-page-ux-spec.md](workflow-page-ux-spec.md)
**Status**: IN PROGRESS (Phase 1 complete)

## Summary

Build a visual workflow editor for the positional graph system as a new `workflow-ui` business domain. The editor uses a custom HTML/CSS + dnd-kit canvas (not ReactFlow) to render lines as horizontal rows with draggable node cards. Context flow indicators, readiness gates, Q&A modals, and in-memory snapshot undo/redo provide a rich editing experience. A doping system (`just dope`) populates demo workflows for UI development. Real-time SSE updates keep the active workflow in sync with CLI/agent changes. The deprecated workgraph UI (Plan 022) and associated legacy pages/routes are fully removed.

**Cross-cutting principle: Opportunistic workgraph removal** — when touching any file that contains workgraph code, clean it out at that time rather than leaving it for Phase 7. Phase 7 handles whatever remains after all other phases.

## Target Domains

| Domain | Status | Relationship | Role |
|--------|--------|-------------|------|
| workflow-ui | **NEW** | create | New business domain — owns workflow page, editor, toolbox, undo/redo, doping |
| _platform/positional-graph | existing | consume | Graph CRUD, status, templates, instances (register in web DI) |
| _platform/events | existing | modify | Extend with WorkflowWatcherAdapter for active workflow SSE |
| _platform/panel-layout | existing | modify | Extend PanelShell with optional right panel prop |
| _platform/sdk | existing | consume | Commands (undo, redo), keybindings |
| _platform/workspace-url | existing | consume | URL param state |
| _platform/file-ops | existing | consume | IFileSystem for server actions |
| _platform/workgraph | deprecated | remove | Delete all UI pages, API routes, event adapters |

## Domain Manifest

| File | Domain | Classification | Rationale |
|------|--------|---------------|-----------|
| `docs/domains/workflow-ui/domain.md` | workflow-ui | contract | New domain definition |
| `docs/domains/registry.md` | workflow-ui | cross-domain | Add workflow-ui entry |
| `docs/domains/domain-map.md` | workflow-ui | cross-domain | Add workflow-ui node + edges |
| `apps/web/app/(dashboard)/workspaces/[slug]/workflows/page.tsx` | workflow-ui | internal | Workflow list page |
| `apps/web/app/(dashboard)/workspaces/[slug]/workflows/[graphSlug]/page.tsx` | workflow-ui | internal | Workflow editor page |
| `apps/web/src/features/050-workflow-page/` | workflow-ui | internal | Feature folder (all components) |
| `apps/web/app/actions/workflow-actions.ts` | workflow-ui | internal | Server actions for graph mutations |
| `scripts/dope-workflows.ts` | workflow-ui | internal | Demo workflow generator |
| `justfile` | workflow-ui | cross-domain | Add dope/redope commands |
| `apps/web/src/lib/di-container.ts` | workflow-ui | cross-domain | Register positional-graph services |
| `apps/web/src/features/_platform/panel-layout/components/panel-shell.tsx` | _platform/panel-layout | cross-domain | ~~Add right panel prop~~ Not modified — standalone layout used instead |
| `packages/workflow/src/features/023-central-watcher-notifications/workflow-watcher.adapter.ts` | _platform/events | cross-domain | New watcher adapter for workflow files |
| `apps/web/src/features/027-central-notify-events/workflow-domain-event-adapter.ts` | _platform/events | cross-domain | New domain event adapter for workflow SSE |
| `packages/positional-graph/src/fakes/fake-positional-graph-service.ts` | _platform/positional-graph | cross-domain | Fake for UI testing |
| `packages/positional-graph/src/fakes/index.ts` | _platform/positional-graph | cross-domain | Fake barrel export |
| `packages/positional-graph/src/index.ts` | _platform/positional-graph | cross-domain | Re-export fakes for consumers |
| `apps/web/tsconfig.json` | workflow-ui | cross-domain | Path mapping for positional-graph DI imports |
| `docs/domains/_platform/positional-graph/domain.md` | _platform/positional-graph | contract | Add workflow-ui as consumer |
| `test/integration/dope-workflows.test.ts` | workflow-ui | test | Doping script validation |
| `test/unit/web/features/050-workflow-page/*.test.tsx` | workflow-ui | test | Phase 2 rendering/state unit tests |
| `apps/web/src/features/050-workflow-page/types.ts` | workflow-ui | internal | Shared types for server actions and client components |
| `apps/web/src/lib/navigation-utils.ts` | workflow-ui | cross-domain | Update workflow nav href |

## Key Findings

| # | Impact | Finding | Action |
|---|--------|---------|--------|
| 01 | Critical | IPositionalGraphService + ITemplateService NOT registered in web DI container — no server actions can call them | Register `registerPositionalGraphServices()` in web bootstrap (Phase 1) |
| 02 | Critical | FakePositionalGraphService does NOT exist — no test doubles for the 50+ method service | Build fake with call tracking + return builders (Phase 1) |
| 03 | Critical | Workgraph blast radius: 18+ files outside Plan 022 feature folder reference workgraph (DI container, event adapters, navigation, params) | Map all references, update in dedicated deprecation phase (Phase 7) |
| 04 | High | PanelShell only supports left+main — no right panel. Workflow editor needs main+right for toolbox/properties | Extend PanelShell with optional `right` prop (Phase 2) |
| 05 | High | @xyflow/react used by 13+ files (Plan 011 workflow components beyond Plan 022) — cannot fully remove ReactFlow yet | Keep @xyflow/react as dependency; only remove Plan 022 usage. Plan 011 components stay until migrated separately |
| 06 | High | SSE watcher only has WorkGraphWatcherAdapter — need new WorkflowWatcherAdapter for positional graph file changes | Create new adapter in events domain (Phase 6) |
| 07 | High | Navigation sidebar already has "Workflows" item pointing to `/workgraphs` — just update href | Simple href update in Phase 7 |
| 08 | Medium | Existing API routes at `/api/workspaces/[slug]/workgraphs/` follow clean pattern (container.resolve → service.method) — reuse for new workflow routes | Follow same pattern for new server actions |

## Phases

### Phase 1: Domain Setup + Foundations

**Objective**: Create the workflow-ui domain, register backend services in web DI, build FakePositionalGraphService, and create the doping system.
**Domain**: workflow-ui (new) + _platform/positional-graph (consume)
**Delivers**:
- New domain docs (domain.md, registry, domain-map)
- IPositionalGraphService + ITemplateService + IWorkUnitService registered in web DI container
- FakePositionalGraphService with call tracking + return builders
- `scripts/dope-workflows.ts` with 7 demo scenarios
- `just dope` / `just redope` / `just dope clean` justfile commands
- Doping script automated test (validates 7 scenarios produce valid graphs)
**Depends on**: None
**Key risks**: DI registration may conflict with existing workgraph registrations — test both coexist

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 1.1 | Create `docs/domains/workflow-ui/domain.md` + update registry + domain-map | workflow-ui | Domain files exist, registry updated | Follow file-browser domain as template |
| 1.2 | Register positional-graph services in web DI container (`registerPositionalGraphServices()`) | _platform/positional-graph | `getContainer().resolve(IPositionalGraphService)` returns service in web context | Per finding 01 |
| 1.3 | Build FakePositionalGraphService with call tracking + return builders | _platform/positional-graph | Fake implements IPositionalGraphService, tests pass | Per finding 02. Cover: create, load, addLine, addNode, moveNode, removeNode, getStatus, setInput |
| 1.4 | Build FakeWorkUnitService with call tracking (if not exists) | _platform/positional-graph | Fake implements IWorkUnitService, tests pass | Check if already exists first |
| 1.5 | Create `scripts/dope-workflows.ts` with 7 demo scenarios | workflow-ui | `npx tsx scripts/dope-workflows.ts` creates 7 graphs in `.chainglass/data/workflows/`; covers all 8 node status states | AC-28, AC-30. W005 scenarios: blank, serial, running, question, error, complete, complex |
| 1.6 | Add `just dope` / `just redope` / `just dope clean` / `just dope <name>` to justfile | workflow-ui | All 4 commands work; clean removes all demo-* workflows; specific name creates single scenario | AC-29 |
| 1.7 | Automated test for doping script (validates all 7 scenarios create valid graph structures) | workflow-ui | Test loads each demo graph via IPositionalGraphService, verifies structure | AC-37 |

### Phase 2: Canvas Core + Layout

**Objective**: Build the workflow editor page shell, line rendering, node card display, and the work unit toolbox. No drag-and-drop yet — just rendering.
**Domain**: workflow-ui + _platform/panel-layout (extend)
**Delivers**:
- Workspace-scoped workflow list page and editor page
- PanelShell extended with optional right panel
- WorkflowCanvas rendering lines and node cards from graph.yaml + state.json
- WorkUnitToolbox (right panel) showing available units grouped by type
- WorkflowTempBar with placeholder Run button
- Empty states (no lines, empty line)
- Server actions: loadWorkflow, listWorkflows, createWorkflow
- Unit tests with fakes for all rendering states
**Depends on**: Phase 1 (DI registration, fakes, doped workflows for visual testing)
**Key risks**: PanelShell right panel extension may affect existing pages — test file-browser still works

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 2.1 | Extend PanelShell with optional `right` prop | _platform/panel-layout | PanelShell renders main+right when right prop provided; existing left+main pages unaffected | Per finding 04. Low-medium effort |
| 2.2 | Create workflow list page at `/workspaces/[slug]/workflows/page.tsx` | workflow-ui | Page renders list of workflows from `IPositionalGraphService.list()` | AC-01 (list), AC-22b (new blank + new from template buttons) |
| 2.3 | Create workflow editor page at `/workspaces/[slug]/workflows/[graphSlug]/page.tsx` | workflow-ui | Page loads graph and renders PanelShell with main (canvas) + right (toolbox) | AC-01 (editor) |
| 2.4 | Create server actions: `loadWorkflow`, `listWorkflows`, `createWorkflow` | workflow-ui | Server actions resolve DI, call IPositionalGraphService, return Result types | Follow file-actions.ts pattern |
| 2.5 | Build WorkflowTempBar with placeholder Run button + template/instance breadcrumb | workflow-ui | Temp bar renders breadcrumb + disabled Run button with tooltip; shows "Template > Instance" when viewing instance | AC-01, AC-20, Q7 |
| 2.6 | Build WorkflowCanvas — renders lines as horizontal rows with numbered headers | workflow-ui | Lines render top-to-bottom, numbered, with label, settings gear, transition badge, delete button | AC-02, AC-05 |
| 2.7 | Build WorkflowNodeCard — renders node with type icon, name, status dot, context badge | workflow-ui | Cards render all 8 status states correctly with proper colors | AC-10, AC-11 |
| 2.8 | Build WorkUnitToolbox (right panel) — grouped by type with search | workflow-ui | Toolbox loads units from IWorkUnitService.list(), groups by type, search filters | AC-06 |
| 2.9 | Build empty states (no-lines placeholder, empty-line drop zone) | workflow-ui | Empty workflow shows "+" button; empty line shows dashed placeholder | AC-03 |
| 2.10 | Unit tests for canvas rendering, node card states (all 8), toolbox | workflow-ui | Tests pass using FakePositionalGraphService + FakeWorkUnitService | AC-35 (partial) |
| 2.11 | Update navigation sidebar href from `/workgraphs` to `/workflows` | workflow-ui | Sidebar "Workflows" link goes to new route | Per finding 07 |

### Phase 3: Drag-and-Drop + Persistence

**Objective**: Add drag-and-drop from toolbox to lines, node reordering within/between lines, node deletion, and immediate filesystem persistence.
**Domain**: workflow-ui
**Delivers**:
- Drag from toolbox → line (in-place drop zones, line glow)
- Drag node to reorder within line or move between lines
- Node deletion (context menu + Backspace)
- Running-line restriction (cannot modify active/complete lines)
- All mutations persist immediately to disk via server actions
- Server actions: addNode, removeNode, moveNode, addLine, removeLine
- Naming modals (new blank workflow, new from template, save as template)
- Unit tests for all drag-drop handlers and persistence round-trips
**Depends on**: Phase 2 (canvas renders, server actions exist)
**Key risks**: dnd-kit cross-container drag (toolbox → canvas) may need custom sensors

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 3.1 | Create server actions: addNode, removeNode, moveNode, addLine, removeLine | workflow-ui | Actions call IPositionalGraphService, write to disk, return updated state | AC-04, AC-07, AC-08, AC-09 |
| 3.2 | Build DnD: toolbox → line drag with in-place drop zones | workflow-ui | Dragging from toolbox shows drop zones between nodes (no layout shift), line glow on editable lines | AC-07, W001 |
| 3.3 | Build DnD: node reorder within line + cross-line move | workflow-ui | Nodes can be dragged to new positions; graph.yaml updates immediately | AC-08 |
| 3.4 | Build node deletion (context menu + Backspace) | workflow-ui | Selected node deleted on Backspace; context menu → Delete works; removal persists | AC-09 |
| 3.5 | Implement running-line restriction (lock active/complete lines) | workflow-ui | Cannot drag/delete on running/complete lines; future lines editable; locked lines don't glow during drag | AC-08 (restriction), W001 |
| 3.6 | Build Add Line button + inline label editing | workflow-ui | Add Line appends new line; clicking label enters edit mode; changes persist to graph.yaml | AC-04, AC-05 |
| 3.7 | Build naming modals: new blank (empty input), new from template (composite slug), save as template (pre-filled) | workflow-ui | All 3 modals validate kebab-case, create/save correctly | AC-21, AC-22, AC-22b, W001 naming |
| 3.8 | Unit tests for drag handlers, drop zones, persistence round-trips, naming validation | workflow-ui | Tests cover: toolbox→line, reorder, cross-line, deletion, line restriction, all 3 naming flows | AC-35 (partial) |
| 3.9 | Integration test: server action → disk → reload round-trip | workflow-ui | Add node via action, read back from disk, verify graph.yaml matches | AC-36 (partial) |

### Phase 4: Context Indicators + Select-to-Reveal

**Objective**: Add context badges, gate chips, PCB-style trace visualization on node selection, and the node properties panel.
**Domain**: workflow-ui
**Delivers**:
- Context badges on every node card (green/blue/purple/gray)
- noContext lock icon (🔒)
- Gate chips on blocked nodes (5 gate types with messages)
- Select-to-reveal: upstream PCB traces (full color), downstream traces (muted gray), unrelated nodes dim
- Node properties panel (right panel, replaces toolbox on select)
- Unit tests for context computation, gate chip rendering, trace visibility
**Depends on**: Phase 3 (mutations work, nodes can be selected)
**Key risks**: Context source computation requires calling getContextSource() per node — may need batching for performance

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 4.1 | Build context badge computation from getContextSource() + orchestratorSettings | workflow-ui | Badges show correct colors: green (new), blue (inherited), purple (explicit), gray (N/A) | AC-13 |
| 4.2 | Build noContext lock icon display | workflow-ui | Nodes with noContext: true show 🔒 on title row | AC-14 |
| 4.3 | Build gate chip display on blocked nodes | workflow-ui | Blocked nodes show colored chip with gate name + human-readable message | AC-12 |
| 4.4 | Build select-to-reveal: upstream PCB traces (under-line channels) | workflow-ui | Selecting node shows green/amber/red traces from input sources, routed under lines | AC-15, W002 |
| 4.5 | Build select-to-reveal: downstream muted gray traces | workflow-ui | Direct consumers shown with gray dashed traces | AC-15, W002 |
| 4.6 | Build unrelated-node dimming on selection | workflow-ui | Unrelated nodes fade to ~40% opacity; restore on deselect | AC-15, W002 |
| 4.7 | Build node properties panel (slides into right panel on select) | workflow-ui | Panel shows: unit info, status, context source, inputs, outputs, downstream, "Edit Properties..." button | AC-15, W002 |
| 4.8 | Build line transition gate display (auto arrow / manual lock button) | workflow-ui | Auto shows ↓; manual shows 🔒 gate clickable when preceding line complete | AC-17 |
| 4.9 | Unit tests for context badges, gate chips, trace rendering, properties panel, transition gates | workflow-ui | All visual states tested with fakes | AC-35 (partial) |

### Phase 5: Q&A + Node Properties Modal + Undo/Redo

**Objective**: Add question/answer modal, full node properties edit modal, and in-memory snapshot undo/redo.
**Domain**: workflow-ui
**Delivers**:
- Q&A modal (text, single-choice, multi-choice, confirm + always-on freeform text)
- Node properties edit modal (description, orchestratorSettings, input wiring)
- UndoRedoManager (in-memory snapshots, 50 max)
- Ctrl+Z / Ctrl+Shift+Z keybindings via SDK
- Undo/redo toolbar buttons with stack depth
- Server action: updateNodeConfig, answerQuestion
- Unit tests for Q&A modal, properties modal, undo manager
**Depends on**: Phase 4 (selection works, properties panel shows)
**Key risks**: Undo snapshot restore must write all files atomically — partial write could corrupt state

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 5.1 | Build Q&A modal with 4 question types + always-on freeform text | workflow-ui | Modal supports text, single-choice (radio), multi-choice (checkbox), confirm (yes/no); freeform text always available | AC-18, AC-19 |
| 5.2 | Create server action: answerQuestion | workflow-ui | Calls IPositionalGraphService.answerQuestion(), persists, returns updated state | AC-18 |
| 5.3 | Build node properties edit modal (description, orchestratorSettings, input wiring) | workflow-ui | Modal edits node.yaml fields; save persists; read-only unit info displayed | AC-16 |
| 5.4 | Create server action: updateNodeConfig | workflow-ui | Updates node.yaml on disk, returns updated NodeConfig | AC-16 |
| 5.5 | Build UndoRedoManager (in-memory snapshot pattern) | workflow-ui | Push/undo/redo/invalidate work; max 50 snapshots; structuredClone for isolation | AC-23, W004 |
| 5.6 | Create server action: restoreSnapshot (writes definition + all nodeConfigs back to disk) | workflow-ui | Snapshot restore writes graph.yaml + all nodes/*/node.yaml atomically | AC-23 |
| 5.7 | Wire Ctrl+Z / Ctrl+Shift+Z via SDK keybinding registration | workflow-ui | Keyboard shortcuts trigger undo/redo; registered as workflow.undo / workflow.redo commands | AC-23 |
| 5.8 | Build undo/redo toolbar buttons with stack depth display | workflow-ui | Buttons disabled when empty; tooltip shows next action description; badge shows depth | AC-24 |
| 5.9 | Unit tests for Q&A modal (all 4 types), properties modal, undo manager (push/undo/redo/invalidate) | workflow-ui | Full TDD coverage with fakes | AC-35 (partial) |

### Phase 6: Real-Time SSE Updates

**Objective**: Wire SSE events so the active workflow editor refreshes when graph files change on disk (from CLI, agents, or other tabs).
**Domain**: workflow-ui + _platform/events (extend)
**Delivers**:
- WorkflowWatcherAdapter (watches graph.yaml + state.json + node.yaml changes)
- WorkflowDomainEventAdapter (routes to SSE)
- Client-side SSE subscription hook (useWorkflowSSE)
- External change detection → undo stack invalidation + toast
- Integration test: CLI mutation → SSE event → UI refresh
**Depends on**: Phase 5 (undo invalidation exists)
**Key risks**: File watcher may fire too frequently during rapid mutations — need debounce

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 6.1 | Create WorkflowWatcherAdapter (filters for graph.yaml, state.json, node.yaml) | _platform/events | Adapter detects changes to active workflow files, emits domain events | AC-27, per finding 06 |
| 6.2 | Create WorkflowDomainEventAdapter (routes to SSE channel) | _platform/events | Events broadcast on 'workflows' SSE channel with graph slug | AC-27 |
| 6.3 | Register new adapters in CentralWatcherService bootstrap | _platform/events | Adapters auto-start with notification system | |
| 6.4 | Build useWorkflowSSE hook (client-side subscription for active graph) | workflow-ui | Hook subscribes to SSE, filters by active graphSlug, triggers re-fetch | AC-26 |
| 6.5 | Wire external change → undo stack invalidation + toast | workflow-ui | External SSE event clears undo/redo stacks, shows toast "Workflow changed externally" | AC-25 |
| 6.6 | Self-event suppression (ignore own changes via sourceTabId) | workflow-ui | Own mutations don't trigger SSE refresh; only external changes do | W004 |
| 6.7 | Integration test: modify graph via service → SSE event fires → hook receives | workflow-ui | Test proves end-to-end SSE pipeline for workflow changes | AC-36 (partial) |

### Phase 7: Workgraph Deprecation + Cleanup

**Objective**: Remove all deprecated workgraph UI code, legacy pages, API routes, and event adapters. Update navigation and DI container.
**Domain**: _platform/workgraph (remove) + workflow-ui (finalize)
**Delivers**:
- Remove Plan 022 workgraph UI pages and feature folder
- Remove legacy API routes under `/api/workspaces/[slug]/workgraphs/`
- Remove `/workflow` demo page and `/workflows` + `/workflows/[slug]` placeholder pages
- Remove WorkGraphWatcherAdapter and WorkGraphDomainEventAdapter
- Update DI container (remove workgraph service registrations if only used by web UI)
- Update domain-map to show workgraph as removed
- Final test suite validation (`just fft`)
**Depends on**: Phase 6 (new workflow SSE replaces workgraph SSE)
**Key risks**: Per finding 03, 18+ files reference workgraph outside Plan 022. Must map all dependencies first.

| # | Task | Domain | Success Criteria | Notes |
|---|------|--------|-----------------|-------|
| 7.1 | Map all workgraph references in apps/web/ (grep audit) | _platform/workgraph | Complete list of files referencing workgraph/WorkGraph | Per finding 03. Do before any deletion. |
| 7.2 | Remove Plan 022 feature folder (`apps/web/src/features/022-workgraph-ui/`) | _platform/workgraph | Feature folder deleted, no imports remaining | AC-31 |
| 7.3 | Remove workgraph pages (`/workspaces/[slug]/workgraphs/*`) | _platform/workgraph | Pages deleted or redirected | AC-31 |
| 7.4 | Remove legacy API routes (`/api/workspaces/[slug]/workgraphs/*`) | _platform/workgraph | Routes deleted | AC-32 |
| 7.5 | Remove `/workflow` demo page and `/workflows` + `/workflows/[slug]` pages | workflow-ui | Legacy pages removed | AC-33 |
| 7.6 | Remove WorkGraphWatcherAdapter + WorkGraphDomainEventAdapter | _platform/events | Old adapters removed, new workflow adapters in use | AC-34 |
| 7.7 | Update DI container — remove workgraph service registrations used only by web UI | workflow-ui | Container clean, no orphan registrations | |
| 7.8 | Update domain-map.md — mark workgraph as removed | workflow-ui | Diagram updated | |
| 7.9 | Final validation: `just fft` passes, no workgraph imports in apps/web/ | workflow-ui | Zero workgraph references in web app, all tests green | |

## Acceptance Criteria

- [ ] AC-01: Workflow page at workspace-scoped routes with PanelShell + temp bar
- [ ] AC-02: Lines as horizontal rows, numbered, left-to-right nodes
- [ ] AC-03: Empty states (no lines, empty line)
- [ ] AC-04: Add Line button with immediate persistence
- [ ] AC-05: Line header (label, settings, transition, delete)
- [ ] AC-06: Right panel toolbox grouped by type with search
- [ ] AC-07: Drag toolbox → line with in-place drop zones
- [ ] AC-08: Drag reorder within/between lines, running-line restriction
- [ ] AC-09: Node deletion via context menu/Backspace
- [ ] AC-10: Node cards with type icon, name, status, context badge
- [ ] AC-11: 8 node status colors
- [ ] AC-12: Gate chips on blocked nodes (5 gate types)
- [ ] AC-13: Context badges (green/blue/purple/gray)
- [ ] AC-14: noContext lock icon
- [ ] AC-15: Select-to-reveal: upstream traces, downstream muted, unrelated dim, properties panel
- [ ] AC-16: Node properties edit modal
- [ ] AC-17: Line transition gates (auto/manual)
- [ ] AC-18: Q&A modal (4 question types)
- [ ] AC-19: Always-on freeform text alongside structured input
- [ ] AC-20: Template/instance breadcrumb in temp bar
- [ ] AC-21: New from Template with composite slug modal
- [ ] AC-22: Save as Template with pre-filled slug modal
- [ ] AC-22b: New Blank + New from Template buttons side by side
- [ ] AC-23: In-memory snapshot undo/redo (toolbar buttons — keyboard shortcuts deferred to avoid conflicts with text inputs in modals)
- [ ] AC-24: Undo/redo toolbar buttons with stack depth
- [ ] AC-25: External changes invalidate undo stack + toast
- [ ] AC-26: SSE live updates for active workflow editor
- [ ] AC-27: WorkflowWatcherAdapter for graph file changes
- [ ] AC-28: `just dope` creates 7+ demo workflows
- [ ] AC-29: `just dope clean`, `just dope <name>`, `just redope`
- [ ] AC-30: Demo workflows cover all 8 node status states
- [ ] AC-31: Remove workgraph UI pages
- [ ] AC-32: Remove legacy API routes
- [ ] AC-33: Remove legacy workflow/workflows pages
- [ ] AC-34: Remove workgraph event adapters
- [ ] AC-35: Unit tests with fakes
- [ ] AC-36: Integration tests with real filesystem
- [ ] AC-37: Doping script validation test

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| PanelShell right panel breaks existing pages | Low | High | Test file-browser page after extension |
| dnd-kit cross-container drag complexity | Medium | Medium | Start with simple drop, iterate. Kanban patterns as reference |
| Workgraph deprecation breaks unknown consumers | Medium | High | Full grep audit before any deletion (Task 7.1) |
| @xyflow/react can't be removed (Plan 011 still uses it) | Confirmed | Low | Keep as dependency; only remove Plan 022 usage |
| SSE watcher fires too frequently during rapid edits | Medium | Low | Debounce in WorkflowWatcherAdapter (200ms) |
| Snapshot undo with partial file writes corrupts state | Low | High | Write all files in sequence with error rollback |

## Progress

| Phase | Status | ACs Covered |
|-------|--------|-------------|
| Phase 1: Domain Setup + Foundations | ✅ Complete | AC-28,29,30,37 |
| Phase 2: Canvas Core + Layout | ✅ Complete | AC-01,02,03,04,05,06,10,11,20,22b,35 |
| Phase 3: Drag-and-Drop + Persistence | ✅ Complete | AC-04,07,08,09,21,22b,35 |
| Phase 4: Context Indicators + Select-to-Reveal | ✅ Complete | AC-12,13,14,15,17,35 |
| Phase 5: Q&A + Node Properties Modal + Undo/Redo | ✅ Complete | AC-16,18,19,23,24 |
| Phase 6: Real-Time SSE Updates | Pending | AC-25,26,27 |
| Phase 7: Workgraph Deprecation + Cleanup | Pending | AC-31,32,33,34 |

### Phase 1 Summary

**Completed**: 2026-02-26 | **Commit**: `96329c8`

| Task | Domain | What Changed |
|------|--------|-------------|
| T001 | workflow-ui | Created `docs/domains/workflow-ui/domain.md`, added to registry + domain-map |
| T002 | _platform/positional-graph | Registered `registerPositionalGraphServices()` + WORK_UNIT_LOADER bridge + TemplateService in web DI; added tsconfig path mapping |
| T003 | _platform/positional-graph | Created `packages/positional-graph/src/fakes/` — FakePositionalGraphService (50+ methods, call tracking, 12 return builders) |
| T004 | _platform/positional-graph | Verified FakeWorkUnitService already exported — no changes needed |
| T005 | workflow-ui | Created `scripts/dope-workflows.ts` — 8 scenarios (blank, serial, running, question, error, complete, complex, from-template) |
| T006 | workflow-ui | Added `just dope`, `just redope` to justfile |
| T007 | workflow-ui | Created `test/integration/dope-workflows.test.ts` — 8 tests, all passing |

**Discovery**: Web `tsconfig.json` needed `@chainglass/positional-graph` mapped to `dist/` — Turbopack was resolving from source via root tsconfig paths and couldn't handle `.js` extensions.

### Phase 2 Summary

**Completed**: 2026-02-26 | **Commit**: `f94024c`

| Task | Domain | What Changed |
|------|--------|-------------|
| T001 | workflow-ui | Created workflow list page at `/workspaces/[slug]/workflows` with server component + WorkflowList client |
| T002 | workflow-ui | Created workflow editor page at `/workspaces/[slug]/workflows/[graphSlug]` with standalone flexbox layout (no PanelShell) |
| T003 | workflow-ui | Created `workflow-actions.ts` — 4 server actions (listWorkflows, loadWorkflow, createWorkflow, listWorkUnits) with worktree-aware WorkspaceContext |
| T004 | workflow-ui | Created WorkflowTempBar — graph name, template breadcrumb, disabled Run button |
| T005 | workflow-ui | Created WorkflowCanvas + WorkflowLine + LineTransitionGate — lines as horizontal rows with numbered headers, state borders, transition gates |
| T006 | workflow-ui | Created WorkflowNodeCard — all 8 status states with correct colors, type icons, context badge |
| T007 | workflow-ui | Created WorkUnitToolbox — grouped by type (Agent/Code/Human Input), collapsible, search filter |
| T008 | workflow-ui | Created EmptyCanvasPlaceholder + EmptyLinePlaceholder |
| T009 | workflow-ui | Created 4 test files, 32 unit tests — canvas, node card (all 8 states), toolbox, list |
| T010 | cross-domain | Updated navigation sidebar href from `/workgraphs` to `/workflows` |

**Decisions**:
- Standalone layout instead of PanelShell — workflow editor has different panel needs (no left panel, right sidebar instead)
- `getStatus()` returns all node statuses in one call — no N+1 `getNodeStatus()` needed
- Worktree param flows through list → links → editor via searchParams
- Shared types in `050-workflow-page/types.ts` — importable from both server actions and client components
