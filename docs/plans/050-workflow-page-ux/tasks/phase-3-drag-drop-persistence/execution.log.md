# Execution Log: Phase 3 — Drag-and-Drop + Persistence

**Plan**: 050-workflow-page-ux
**Phase**: Phase 3
**Started**: 2026-02-26

---

## Task Log

### T001: Mutation server actions ✅

**Files modified**:
- `apps/web/app/actions/workflow-actions.ts` — Added 11 mutation actions: addNode, removeNode, moveNode, addLine, removeLine, setLineLabel, setLineDescription, updateLineSettings, saveAsTemplate, instantiateTemplate, listTemplates. All use `reloadStatus()` helper for post-mutation refresh.
- `apps/web/src/features/050-workflow-page/types.ts` — Added MutationResult, AddNodeMutationResult, TemplateSummary, ListTemplatesResult, InstantiateTemplateResult, WorkflowDragData union types.

**TDD evidence (RED → GREEN)**:
- RED: TypeScript compilation failed — missing ITemplateService import, InstanceMetadata had `slug` not `instanceId`
- GREEN: `npx tsc --noEmit` passes clean after fixing field names

### T002: useWorkflowMutations hook ✅

**Files created**:
- `apps/web/src/features/050-workflow-page/hooks/use-workflow-mutations.ts` — Centralizes addNode/removeNode/moveNode/addLine/removeLine/setLineLabel. Each calls server action and updates GraphStatusResult via `onStatusUpdate` callback.

### T003: DnD toolbox → line ✅

**Files modified/created**:
- `apps/web/src/features/050-workflow-page/components/workflow-editor.tsx` — Wrapped in DndContext with custom collision detection (pointerWithin → rectIntersection → closestCenter). DragOverlay for toolbox ghost. handleDragEnd dispatches addNode/moveNode based on WorkflowDragData discriminated union.
- `apps/web/src/features/050-workflow-page/components/work-unit-toolbox.tsx` — DraggableUnit with useDraggable + ToolboxDragData. touch-action:none for pointer events.
- `apps/web/src/features/050-workflow-page/components/drop-zone.tsx` — Created. Always-mounted useDroppable targets, visually hidden when not dragging (w-1 opacity-0), expand to w-10/w-14 on drag. Full-width variant for empty lines (min-h-[80px]).

**TDD evidence (RED → GREEN)**:
- RED: Drop zones not detected — dnd-kit can't find zero-size elements; empty lines marked "complete" by graph engine (trivially complete = 0 nodes)
- GREEN: Fixed isLineEditable to treat empty lines as editable; drop zones always rendered (not conditionally mounted); custom collision detection for reliable small-target hits

### T004: Node reorder foundation ✅

**Files modified**:
- `apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx` — Added isSelected, isEditable, onSelect, onDelete props. Selection ring on click. Delete button in header.

### T005: Node deletion ✅

**Files modified**:
- `apps/web/src/features/050-workflow-page/components/workflow-editor.tsx` — Backspace on selected node triggers removeNode. handleDeleteNode clears selection.
- `apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx` — Delete button (✕) with stopPropagation.

### T006: Running-line restriction ✅

**Files modified**:
- `apps/web/src/features/050-workflow-page/components/workflow-line.tsx` — isLineEditable checks complete + runningNodes; empty lines always editable. showDropZones gated on isDragging && editable. Line glow ring during drag on editable lines only. Delete button disabled on non-empty/locked lines.

### T007: Add Line + inline label editing ✅

**Files modified**:
- `apps/web/src/features/050-workflow-page/components/workflow-line.tsx` — Click-to-edit label with useState + input. Blur/Enter saves via setLineLabel. Delete only on empty editable lines.
- `apps/web/src/features/050-workflow-page/components/workflow-canvas.tsx` — Add Line button wired to mutations.addLine. Empty canvas placeholder wired.

### T008: Naming modals ✅

**Files created**:
- `apps/web/src/features/050-workflow-page/components/naming-modal.tsx` — NamingModal with kebab-case validation (^[a-z][a-z0-9-]*$). Auto-lowercase on input. dialog element for a11y.
- `apps/web/src/features/050-workflow-page/components/workflow-list-client.tsx` — Client wrapper with New Blank button wired to NamingModal → createWorkflow → router.push to editor.

**TDD evidence (RED → GREEN)**:
- RED: `pnpm vitest run test/unit/web/features/050-workflow-page/naming-modal.test.tsx` — test expected "INVALID" to show error but modal auto-lowercases input
- GREEN: Fixed test to use "1-starts-with-number" which genuinely fails validation; 13 tests pass

### T009: Unit tests ✅

**Files created**:
- `test/unit/web/features/050-workflow-page/naming-modal.test.tsx` — 13 tests: validateSlug (6 cases), NamingModal (7 cases: render, disabled, enabled, error, confirm, cancel, pre-fill)

**Evidence**: 45 tests pass across 5 test files (32 Phase 2 + 13 Phase 3).
