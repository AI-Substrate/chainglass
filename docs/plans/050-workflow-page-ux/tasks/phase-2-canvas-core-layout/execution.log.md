# Execution Log: Phase 2 — Canvas Core + Layout

**Plan**: 050-workflow-page-ux
**Phase**: Phase 2
**Started**: 2026-02-26

---

## Task Log

### T003: Server actions ✅

**Files created**:
- `apps/web/app/actions/workflow-actions.ts` — 4 server actions: `listWorkflows`, `loadWorkflow`, `createWorkflow`, `listWorkUnits`. Each resolves DI container, builds WorkspaceContext from workspace slug, delegates to IPositionalGraphService/IWorkUnitService.
- `apps/web/src/features/050-workflow-page/types.ts` — Shared types (WorkflowSummary, result types) for both server actions and client components.

**Discovery**: `GraphStatusResult` already contains `lines: LineStatusResult[]` with `nodes: NodeStatusResult[]` per line. One `getStatus()` call provides all node statuses with computed readiness — no N+1 `getNodeStatus()` calls needed. `loadWorkflow` uses sequential load→getStatus (load first to check errors before status call).

**Evidence**: `npx tsc --noEmit` passes clean for workflow-actions.ts.

### T006: WorkflowNodeCard ✅

**Files created**:
- `apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx` — Renders type icon, unit name, description (truncated), status dot (8 colors per W001), context badge. Exports `STATUS_MAP` for all 8 states, `nodeStatusToCardProps()` converter.

**TDD evidence (RED → GREEN)**:
- RED: `pnpm vitest run test/unit/web/features/050-workflow-page/workflow-node-card.test.tsx` — failed: component did not exist yet
- GREEN: After creating component — 14 tests pass (all 8 statuses render correct data-status attribute, 3 unit types show correct icons, context badge defaults/colors)
- AC Mapping: AC-10, AC-11

### T008: Empty states ✅

**Files created**:
- `apps/web/src/features/050-workflow-page/components/empty-states.tsx` — `EmptyCanvasPlaceholder` (centered "+" with instructions) and `EmptyLinePlaceholder` (dashed border with drop text).

### T004: WorkflowTempBar ✅

**Files created**:
- `apps/web/src/features/050-workflow-page/components/workflow-temp-bar.tsx` — Graph name left, optional template breadcrumb, disabled Run button right.

### T007: WorkUnitToolbox ✅

**Files created**:
- `apps/web/src/features/050-workflow-page/components/work-unit-toolbox.tsx` — Groups by type (Agent/Code/Human Input), collapsible groups, search filter, empty state. Static list only (drag in Phase 3).

**TDD evidence (RED → GREEN)**:
- RED: `pnpm vitest run test/unit/web/features/050-workflow-page/work-unit-toolbox.test.tsx` — failed: component did not exist
- GREEN: After creating component — 5 tests pass (empty state, grouping, search filter, collapse)
- AC Mapping: AC-06

### T005: WorkflowCanvas + WorkflowLine + LineTransitionGate ✅

**Files created**:
- `apps/web/src/features/050-workflow-page/components/workflow-canvas.tsx` — Renders lines top-to-bottom with transition gates between them. Add Line button at bottom. Empty canvas shows placeholder.
- `apps/web/src/features/050-workflow-page/components/workflow-line.tsx` — Horizontal row with numbered header, label, settings/delete placeholders, transition badge. Line state borders: blue (running), green (complete), red (error).
- `apps/web/src/features/050-workflow-page/components/line-transition-gate.tsx` — Arrow (auto) or lock button (manual) between lines.

**TDD evidence (RED → GREEN)**:
- RED: `pnpm vitest run test/unit/web/features/050-workflow-page/workflow-canvas.test.tsx` — failed: components did not exist
- GREEN: After creating components — 8 tests pass (empty canvas placeholder, line rendering with numbered headers, node cards inside lines, empty line placeholder, transition gates, add line button, blue border for running, green border for complete)
- AC Mapping: AC-02, AC-03, AC-04, AC-05

### T002: Workflow editor page ✅

**Files created**:
- `apps/web/src/features/050-workflow-page/components/workflow-editor-layout.tsx` — Standalone flexbox: top bar + main + right sidebar (260px, resizable). No PanelShell dependency.
- `apps/web/src/features/050-workflow-page/components/workflow-editor.tsx` — Client component composing layout + temp bar + canvas + toolbox.
- `apps/web/app/(dashboard)/workspaces/[slug]/workflows/[graphSlug]/page.tsx` — Server component: loads graph + units via server actions, passes to WorkflowEditor. Error state for missing workflows.

### T001: Workflow list page ✅

**Files created**:
- `apps/web/src/features/050-workflow-page/components/workflow-list.tsx` — Client component rendering workflow items as clickable cards. Shows slug, description, line/node counts, status dot. Empty state. Links to editor page.
- `apps/web/app/(dashboard)/workspaces/[slug]/workflows/page.tsx` — Server component: lists workflows via server action. Header with disabled "New Blank" + "New from Template" buttons.

**TDD evidence (RED → GREEN)**:
- RED: `pnpm vitest run test/unit/web/features/050-workflow-page/workflow-list.test.tsx` — failed: component did not exist
- GREEN: After creating component — 5 tests pass (empty state, workflow items, descriptions, counts, links)
- AC Mapping: AC-01 (list), AC-22b (buttons)

### T009: Unit tests ✅

**Files created**:
- `test/unit/web/features/050-workflow-page/workflow-node-card.test.tsx` — 14 tests
- `test/unit/web/features/050-workflow-page/workflow-canvas.test.tsx` — 8 tests
- `test/unit/web/features/050-workflow-page/work-unit-toolbox.test.tsx` — 5 tests
- `test/unit/web/features/050-workflow-page/workflow-list.test.tsx` — 5 tests

**Evidence**: 32 tests pass, 4 test files. Full suite: 4611 tests pass (335 files), 0 failures.

### T010: Navigation update ✅

**Files modified**:
- `apps/web/src/lib/navigation-utils.ts` — Changed workspace nav "Workflows" href from `/workgraphs` to `/workflows`.

**Evidence**: Simple string replacement, existing nav tests unaffected.
