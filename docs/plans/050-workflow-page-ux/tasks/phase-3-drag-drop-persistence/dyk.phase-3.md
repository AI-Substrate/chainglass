# DYK: Phase 3 — Drag-and-Drop + Persistence

**Generated**: 2026-02-26
**Context**: Phase 3 tasks dossier review

---

## Insights

### 1. Discriminated DragData Union for onDragEnd (DECISION)

Single DndContext receives both toolbox drops (create node) and canvas node drops (reorder/move). Define `type WorkflowDragData = ToolboxDragData | NodeDragData` discriminated union, set via `useDraggable({ data })` / `useSortable({ data })`. Shared across T002/T003/T004.

### 2. Missing Server Actions Added to T001 (DECISION)

T001 expanded from 7 to 11 actions:
- Added `setLineLabel` — `IPositionalGraphService.setLineLabel()` for inline label editing (T007)
- Added `setLineDescription` — for line settings popover
- Added `updateLineOrchestratorSettings` — transition mode, autoStartLine
- Added `listTemplates` — `ITemplateService.listWorkflows()` for template picker in "New from Template" modal (T008)

### 3. Optimistic Local State for All Mutations (DECISION)

All mutations (reorder, cross-line move, toolbox drop, deletion) update local `GraphStatusResult` immediately before the server round-trip completes:
- **Reorder/move**: Local array splice of node into new position
- **Toolbox drop**: Insert placeholder node with `status: 'pending'` and unit slug
- **Delete**: Remove node from local state immediately
- Server response overwrites local state with authoritative result

Standard React optimistic update pattern. One pattern for all cases.

### 4. Line Settings Gear Opens Popover, Not Modal (DECISION)

The settings gear on line headers opens a small popover (anchored to gear icon) with 3 fields: transition mode (auto/manual), auto-start toggle, description text. Not a full modal — less code, better UX, matches editor conventions (VS Code, Notion).

### 5. removeLine Only Allowed on Empty Lines (DECISION)

- Lines with nodes: delete button disabled — must remove/move all nodes first
- Empty lines: delete immediately, no confirmation needed
- Running/complete lines: delete button disabled (same restriction as DnD)
- Simplest possible UX, no confirmation dialogs
