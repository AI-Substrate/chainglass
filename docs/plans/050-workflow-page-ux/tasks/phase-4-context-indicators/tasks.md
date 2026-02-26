# Phase 4: Context Indicators + Select-to-Reveal — Tasks

**Plan**: [workflow-page-ux-plan.md](../../workflow-page-ux-plan.md)
**Phase**: Phase 4: Context Indicators + Select-to-Reveal
**Generated**: 2026-02-26
**Status**: Ready for implementation

---

## Executive Briefing

- **Purpose**: Add visual intelligence to the workflow editor — users can see at a glance why a node is blocked, where its context comes from, and how data flows between nodes. Selecting a node reveals its full dependency neighborhood.
- **What We're Building**: Context badges (colored corner squares), noContext lock icons, gate chips on blocked nodes, select-to-reveal with upstream/downstream traces, node properties panel (replaces toolbox on select), and unit tests for all visual states.
- **Goals**:
  - ✅ Context badges on every node card (green/blue/purple/gray)
  - ✅ Lock icon on noContext nodes
  - ✅ Gate chips showing which of 5 readiness gates is blocking
  - ✅ Select-to-reveal dims unrelated nodes, highlights upstream/downstream
  - ✅ Node properties panel shows inputs, outputs, status, context source
  - ✅ Line transition gates are interactive (manual gate clickable when ready)
  - ✅ Unit tests for context computation, gate rendering, properties panel
- **Non-Goals**:
  - ❌ No node properties edit modal (Phase 5)
  - ❌ No Q&A modal (Phase 5)
  - ❌ No undo/redo (Phase 5)
  - ❌ No SSE live updates (Phase 6)
  - ❌ No PCB-style routed traces (simplified highlight approach for v1)

---

## Prior Phase Context

### Phase 3: Drag-and-Drop + Persistence (Complete)

**A. Deliverables**: 11 mutation server actions, useWorkflowMutations hook, DnD from toolbox to canvas with drop zones, node deletion, running-line restriction, Add Line + inline label editing, naming modals, WorkflowListClient.

**B. Dependencies Exported**:
- `WorkflowDragData` union type (ToolboxDragData | NodeDragData)
- `useWorkflowMutations` hook with addNode/removeNode/moveNode/addLine/removeLine/setLineLabel
- `selectedNodeId` state managed in WorkflowEditor
- Custom collision detection (pointerWithin → rectIntersection → closestCenter)
- `NamingModal` with kebab-case validation

**C. Gotchas**:
- Empty lines marked "complete" by graph engine — `isLineEditable` must check `nodes.length === 0`
- dnd-kit drop zones must always be mounted (not conditional render) for collision registration
- `pointerWithin` alone unreliable for small targets — custom multi-strategy needed
- `useId()` required on DndContext to prevent SSR hydration mismatch

**D. Incomplete Items**: New from Template modal (template picker deferred). Save as Template (editor toolbar button deferred). Full sortable node reorder (useSortable — deferred, basic moveNode via drop zones works).

**E. Patterns to Follow**: WorkflowEditor manages `graphStatus` + `isDragging` + `selectedNodeId` state. Components receive callbacks. Server actions return reloaded `GraphStatusResult`. Drop zones always mounted, visibility toggled via CSS.

---

## Pre-Implementation Check

| File | Exists? | Domain | Action | Notes |
|------|---------|--------|--------|-------|
| `apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx` | ✅ Yes | workflow-ui | MODIFY | Add gate chip, noContext lock, real context badge logic |
| `apps/web/src/features/050-workflow-page/components/workflow-canvas.tsx` | ✅ Yes | workflow-ui | MODIFY | Add node dimming when selection active |
| `apps/web/src/features/050-workflow-page/components/workflow-line.tsx` | ✅ Yes | workflow-ui | MODIFY | Add dimming on unrelated nodes |
| `apps/web/src/features/050-workflow-page/components/workflow-editor.tsx` | ✅ Yes | workflow-ui | MODIFY | Wire properties panel, swap toolbox/properties on select |
| `apps/web/src/features/050-workflow-page/components/node-properties-panel.tsx` | ❌ No | workflow-ui | CREATE | Read-only properties panel showing node detail |
| `apps/web/src/features/050-workflow-page/components/gate-chip.tsx` | ❌ No | workflow-ui | CREATE | Colored chip showing blocking gate |
| `apps/web/src/features/050-workflow-page/components/line-transition-gate.tsx` | ✅ Yes | workflow-ui | MODIFY | Make manual gate clickable |
| `apps/web/src/features/050-workflow-page/lib/context-badge.ts` | ❌ No | workflow-ui | CREATE | Pure function: compute badge color from NodeStatusResult |
| `test/unit/web/features/050-workflow-page/context-badge.test.ts` | ❌ No | workflow-ui | CREATE | Test context badge computation |
| `test/unit/web/features/050-workflow-page/gate-chip.test.tsx` | ❌ No | workflow-ui | CREATE | Test gate chip rendering |
| `test/unit/web/features/050-workflow-page/node-properties-panel.test.tsx` | ❌ No | workflow-ui | CREATE | Test properties panel rendering |

---

## Tasks

| Status | ID | Task | Domain | Path(s) | Done When | Notes |
|--------|-----|------|--------|---------|-----------|-------|
| [ ] | T001 | Build context badge computation — pure function from NodeStatusResult + lineIndex | workflow-ui | `apps/web/src/features/050-workflow-page/lib/context-badge.ts` | Function takes NodeStatusResult + lineIndex, returns 'green' / 'blue' / 'purple' / 'gray'. Rules: gray for non-agent, green for noContext/global/first-on-line-0, purple for explicit contextFrom, blue for inherited-from-left. Unit tests cover all rules. | AC-13. W002 color table. Needs lineIndex param (DYK #2). |
| [ ] | T002 | Wire real context badge colors into WorkflowNodeCard | workflow-ui | `apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx` | Node cards show computed context badge colors instead of placeholder. Update `nodeStatusToCardProps()` to call context badge function. | AC-13. Replace the hardcoded `contextColor: node.noContext ? 'gray' : 'green'` with real computation. |
| [ ] | T003 | Add noContext lock icon to node cards | workflow-ui | `apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx` | Nodes with `noContext: true` show 🔒 icon next to the unit name in header row. | AC-14. Simple conditional render from `nodeStatusToCardProps`. |
| [ ] | T004 | Build GateChip component for blocked nodes with expandable gate list | workflow-ui | `apps/web/src/features/050-workflow-page/components/gate-chip.tsx`<br/>`apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx` | Pending/blocked nodes show a colored chip with first blocking gate name + message. Click chip → inline accordion expands showing all 5 gates with pass/fail (green check / colored icon). Only one card expanded at a time. Card grows in place. 5 gate colors (red/amber/orange/blue/purple per W002). Chip only renders when node is not ready and not running/complete. | AC-12. DYK #5: single chip + expandable list. |
| [ ] | T004b | Build context flow indicators between adjacent nodes | workflow-ui | `apps/web/src/features/050-workflow-page/components/context-flow-indicator.tsx`<br/>`apps/web/src/features/050-workflow-page/components/workflow-line.tsx` | Small inline indicator rendered between adjacent node cards on the same line. Blue arrow (──▶) when context flows from left to right (serial, no noContext). Gray X (──✕) when right node has noContext (isolated). Gray dots (···) for parallel nodes (no context inheritance). Computed from adjacent pair's NodeStatusResult (execution, noContext, contextFrom). | AC-13. Complements context badge — badge shows *what* context, indicator shows *where* it flows between neighbors. |
| [ ] | T005 | Build select-to-reveal: dim unrelated nodes on selection | workflow-ui | `apps/web/src/features/050-workflow-page/lib/related-nodes.ts`<br/>`apps/web/src/features/050-workflow-page/components/workflow-canvas.tsx`<br/>`apps/web/src/features/050-workflow-page/components/workflow-node-card.tsx` | Build `computeRelatedNodes(selectedNodeId, allLines)` pure function returning `RelatedNodesResult` with upstream/downstream relationships + `relatedNodeIds` Set. When `selectedNodeId` set: unrelated nodes fade to ~40% opacity. Handles all InputEntry variants (available/waiting/error). Consumers filter by relation type as needed. | AC-15. DYK #1: single function, multiple consumers. |
| [ ] | T006 | Build node properties panel (right panel on select) | workflow-ui | `apps/web/src/features/050-workflow-page/components/node-properties-panel.tsx`<br/>`apps/web/src/features/050-workflow-page/components/workflow-editor.tsx` | When a node is selected, right panel swaps from toolbox to properties panel. Shows: unit info (type, slug), node status, context source, inputs (with resolution status), outputs, downstream consumers, "Edit Properties..." button (disabled — Phase 5). Back button returns to toolbox. | AC-15. Data from NodeStatusResult + inputPack. |
| [ ] | T007 | Make line transition gate interactive | workflow-ui | `apps/web/src/features/050-workflow-page/components/line-transition-gate.tsx` | Manual gate is clickable when preceding line is complete — clicking would trigger transition (wired to server action). Auto gate is display-only. Gate shows lock icon that pulses/glows when actionable. | AC-17. Need `triggerTransition` server action or use existing `updateLineOrchestratorSettings`. |
| [ ] | T008 | Unit tests for context badges, gate chips, properties panel, dimming | workflow-ui | `test/unit/web/features/050-workflow-page/context-badge.test.ts`<br/>`test/unit/web/features/050-workflow-page/gate-chip.test.tsx`<br/>`test/unit/web/features/050-workflow-page/node-properties-panel.test.tsx` | Context badge: all 4 color rules tested. Gate chip: all 5 gate types rendered with correct colors. Properties panel: renders all sections from NodeStatusResult. Dimming: related/unrelated classification tested. | AC-35 (partial). |

---

## Context Brief

### Key Data Available (no new API calls needed)

`GraphStatusResult` from `getStatus()` already provides everything Phase 4 needs per node:

```typescript
NodeStatusResult {
  nodeId, unitSlug, unitType,         // identity
  status,                              // execution status
  noContext, contextFrom,              // context source
  readyDetail: {                       // 5 readiness gates
    precedingLinesComplete,
    transitionOpen,
    serialNeighborComplete,
    contextFromReady,
    inputsAvailable,
    unitFound,
    reason?
  },
  inputPack: {                         // input resolution
    inputs: Record<string, InputEntry>,
    ok: boolean
  },
  position, lineId, execution          // placement
}
```

No additional server actions needed — all Phase 4 rendering is pure computation from existing data.

### Context Badge Rules (from W002)

| Color | Rule | Condition |
|-------|------|-----------|
| Gray | Non-agent node | `unitType !== 'agent'` |
| Green | New/global context | `noContext: true` OR position 0 on first line OR parallel node |
| Purple | Explicit contextFrom | `contextFrom` is set and not null |
| Blue | Inherited from left | Default for serial agents (inherit from left neighbor) |

### Gate Chip Rules (from W002)

First failing gate shown (priority order 1→5):
1. **Preceding Lines** (red) — `!readyDetail.precedingLinesComplete`
2. **Transition** (amber) — `!readyDetail.transitionOpen`
3. **Serial Neighbor** (orange) — `!readyDetail.serialNeighborComplete`
4. **Context From** (blue) — `readyDetail.contextFromReady === false`
5. **Inputs** (purple) — `!readyDetail.inputsAvailable`

### Related Nodes Computation (for dimming)

Given selected node S:
- **Upstream**: Nodes referenced in S's `inputPack.inputs[*].detail.from_node`
- **Downstream**: All nodes N where N's `inputPack.inputs[*].detail.from_node === S.nodeId`
- **Related set**: {S} ∪ upstream ∪ downstream
- **Unrelated**: All other nodes → dim to 40% opacity

---

## Directory Layout

```
docs/plans/050-workflow-page-ux/
  └── tasks/phase-4-context-indicators/
      ├── tasks.md                    ← this file
      ├── tasks.fltplan.md            ← flight plan
      └── execution.log.md            ← created by plan-6
```
