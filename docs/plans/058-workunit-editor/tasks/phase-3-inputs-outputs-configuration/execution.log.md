# Execution Log: Phase 3 — Inputs/Outputs Configuration

**Started**: 2026-03-01
**Completed**: 2026-03-01
**Phase**: Phase 3: Inputs/Outputs Configuration
**Plan**: [workunit-editor-plan.md](../../workunit-editor-plan.md)

---

## Task Log

### T001: InputOutputCard
- Created `input-output-card.tsx` — expandable card with collapsed summary (name, type badge, required indicator, drag handle/lock icon) and expanded form (name, type, data_type conditional, required checkbox, description)
- ARIA: `aria-expanded`, `aria-controls`, `ChevronRight` rotate-90, `useId()` for unique IDs, `htmlFor`/`id` on all labels
- Accepts sortable refs (`sortableRef`, `activatorRef`, `dragListeners`) as props for dnd-kit integration
- Locked mode for reserved params: lock icon, disabled fields, no drag handle, no delete

### T002: InputOutputCardList
- Created `input-output-card-list.tsx` — DndContext + SortableContext container with PointerSensor (distance:8) + KeyboardSensor
- SortableCard wrapper uses `useSortable` with `setActivatorNodeRef` (v10 API) on grip handle
- Two callbacks: `onStructuralChange` (add/remove/reorder) and `onFieldChange` (field edits)
- Empty state message: "No inputs defined. Click + to add an input."
- `hydrateClientIds()` / `stripClientIds()` / `validateItems()` exported for reuse
- `_clientId` via `crypto.randomUUID()` for stable SortableContext keys

### T003: Drag reorder
- Built into T002's SortableCard component — `useSortable`, `CSS.Transform.toString()`, `arrayMove`, `setActivatorNodeRef` on grip handle
- Auto-collapse on drag start, reduced opacity + shadow during drag

### T004: Reserved params
- `getReservedParams(unitType)` returns `main-prompt` for agent, `main-script` for code, empty for user-input
- Injected via `reservedParams` prop — rendered as locked cards above user cards, never in save payload

### T005: Validation
- `validateItems()` — name required, regex `/^[a-z][a-z0-9_]*$/`, uniqueness (flags both occurrences), data_type required when type='data'
- Red border + inline error text on invalid fields

### T006: Wire into WorkUnitEditor + editor page
- Layout fix: main panel `overflow-hidden` → `overflow-y-auto`
- CodeMirror fix: agent/code editors `h-full` → removed, `flex-1 min-h-0` → `min-h-[400px]`
- Editor page passes `unit.inputs` and `unit.outputs` as props
- WorkUnitEditor renders InputOutputCardList sections below content editor with SaveIndicator

### T007: Auto-save + tests
- Dual auto-save instances (inputs + outputs) with delay:500ms
- Structural ops: `flush()` → `trigger(newArray)` → `flush()` for immediate save
- Field edits: `trigger(newArray)` only (debounced 500ms)
- Unmount cleanup: `useEffect(() => () => flush(), [flush])` for both lists
- 12 tests: hydrateClientIds, stripClientIds, validateItems (empty name, invalid format, duplicates, data_type conditional, reserved name rejection)

## Evidence

- **Tests**: 335 files, 4739 tests passed (+12 new)
- **`just fft`**: passes clean (lint + format + typecheck + test)
- **Next.js MCP `get_errors`**: "No errors detected" across all 3 unit types
- **Browser verification**: Screenshots confirm agent editor (main-prompt reserved), code editor (main-script reserved), user-input editor (no reserved params, empty inputs state)
- **TypeScript**: `tsc --noEmit` passes clean
