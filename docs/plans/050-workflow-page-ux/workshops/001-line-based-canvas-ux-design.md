# Workshop: Line-Based Canvas UX Design

**Type**: UI Design / Storage Design
**Plan**: 050-workflow-page-ux
**Spec**: (pending — pre-spec workshop)
**Created**: 2026-02-26
**Status**: Draft

**Related Documents**:
- [Research Dossier](../research-dossier.md)
- [Positional Graph Domain](../../../domains/_platform/positional-graph/domain.md)
- [Plan 022 Workgraph UI](../../022-workgraph-ui/) (deprecated reference)
- [Workshop 002: Context Flow Indicators](./002-context-flow-indicator-design.md) (upcoming)

**Domain Context**:
- **Primary Domain**: `workflow-ui` (new business domain)
- **Related Domains**: `_platform/positional-graph` (data model), `_platform/panel-layout` (layout system)

---

## Purpose

Define the visual paradigm for rendering positional graph workflows in the browser. The positional model uses **numbered lines containing ordered nodes** — fundamentally different from the old DAG/edge-wiring model. This workshop establishes how lines, nodes, and their relationships render visually, how users interact with them, and how the layout maps to the underlying data model.

## Key Questions Addressed

- How do lines render visually? (horizontal rows? vertical lanes? swimlanes?)
- How do nodes arrange within a line? (left-to-right serial, stacked parallel?)
- How does the user add lines and nodes? (buttons, drag-drop, context menu?)
- How does the layout handle scrolling for large workflows?
- How do line transitions (auto/manual) appear visually?
- What does an empty workflow look like? (the "big +" starting state)

---

## Data Model → Visual Model Mapping

### Core Data Structure (from graph.yaml)

```yaml
lines:
  - id: line-001
    label: "Gather Requirements"
    nodes: [spec-writer-a1b, reviewer-c2d]   # Left-to-right order
    orchestratorSettings:
      transition: "auto"
      autoStartLine: true
  - id: line-002
    label: "Implementation"  
    nodes: [dev-agent-e3f, test-runner-g4h, code-review-i5j]
    orchestratorSettings:
      transition: "manual"      # Gate between lines
      autoStartLine: false
```

### Visual Mapping Rules

| Data Concept | Visual Representation |
|---|---|
| `lines[]` array | Horizontal rows, stacked top-to-bottom |
| `line.nodes[]` array | Cards within row, left-to-right by array index |
| Line index (0, 1, 2...) | Line number label on left edge |
| `transition: "manual"` | Gate indicator between lines (lock icon) |
| `transition: "auto"` | Flow arrow between lines |
| `execution: "serial"` | Chain link between adjacent nodes |
| `execution: "parallel"` | Fork indicator on node |
| Empty line | Drop zone with dashed border |
| Empty graph | Full-page centered "+" button |

---

## Page Layout

### Overall Structure (PanelShell Pattern)

```
┌───────────────────────────────────────────────────────────────────────────┐
│  Temp Bar: [Template ▸ Instance]                      [▶ Run (disabled)] │
├───────────────────────────────────────────────────────────┬───────────────┤
│                                                           │               │
│                       Main Panel                          │  Right Panel  │
│                                                           │               │
│  ┌─ Line 1: "Gather Requirements" ──────────────────┐    │  Work Units   │
│  │                                                    │    │               │
│  │  ┌──────────┐    ┌──────────┐                     │    │  🔍 Search..  │
│  │  │spec-writer│───▶│ reviewer │                     │    │               │
│  │  │  🤖 agent │    │ 🤖 agent │                     │    │  ▾ Agents (3) │
│  │  │  ● ready  │    │ ○ pending│                     │    │  ┌──────────┐ │
│  │  └──────────┘    └──────────┘                     │    │  │🤖 spec-  │ │
│  └────────────────────────────────────────────────────┘    │  │  writer  │ │
│                        │                                   │  └──────────┘ │
│                   ═══╤═══  (manual gate)                   │  ┌──────────┐ │
│                      │                                     │  │🤖 dev-   │ │
│  ┌─ Line 2: "Implementation" ───────────────────────┐    │  │  agent   │ │
│  │                                                    │    │  └──────────┘ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐        │    │  ┌──────────┐ │
│  │  │dev-agent │  │test-runner│  │code-review│        │    │  │🤖 review │ │
│  │  │  🤖 agent│  │  ⚙️ code │  │ 🤖 agent │        │    │  │  -er     │ │
│  │  │  ○ pending│  │  ○ pending│  │ ○ pending│        │    │  └──────────┘ │
│  │  └──────────┘  └──────────┘  └──────────┘        │    │               │
│  └────────────────────────────────────────────────────┘    │  ▾ Code (1)   │
│                                                           │  ┌──────────┐ │
│                                         [+ Add Line]      │  │⚙️ test-  │ │
│                                                           │  │  runner  │ │
│                                                           │  └──────────┘ │
├───────────────────────────────────────────────────────────┴───────────────┤
│  Status Bar: 6 nodes │ 2 lines │ Modified │ Last saved: 12:34:56         │
└───────────────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

| Zone | Component | Behavior |
|------|-----------|----------|
| Temp Bar | `WorkflowTempBar` | Template/instance breadcrumb, placeholder Run button (disabled). Future: replaced by shared ExplorerBar domain. |
| Main Panel | `WorkflowCanvas` | Scrollable area containing all lines and nodes. No per-line add buttons — drag-only from right panel. |
| Right Panel | `WorkUnitToolbox` | Always visible. List of available work units grouped by type. Drag source for adding nodes to lines. |
| Line Container | `WorkflowLine` | Numbered row, holds nodes, shows label. Drop zones appear dynamically during drag. |
| Node Card | `WorkflowNodeCard` | Work unit visualization, status, context badge, actions |
| Gate Indicator | `LineTransitionGate` | Between lines, shows auto/manual transition |
| Status Bar | `WorkflowStatusBar` | Node count, line count, save status, last modified |

---

## Line Rendering

### Line Container Design

```
┌─ ① "Gather Requirements" ─────────────── ⚙️ ─── auto ─── ✕ ──┐
│                                                                  │
│   [Node] [Node] [Node] ...                                      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**Elements:**
- **Line number** (①②③): Circled number on left edge, bold
- **Label**: Editable text, click to rename (inline edit)
- **Settings gear** (⚙️): Opens line settings popover (transition mode, auto-start, description)
- **Transition badge**: "auto" or "manual" tag — visual indicator
- **Delete** (✕): Remove line (with confirmation if nodes present)
- **No per-line add button** — nodes are added exclusively by dragging from the right panel toolbox

### Line States

| State | Visual |
|-------|--------|
| Empty (no nodes) | Dashed border, "Drop work units here" placeholder text |
| Has nodes, inactive | Default gray border, number in muted color |
| **Drag active (editable)** | **Subtle glow/highlight, [+] drop zones appear between nodes and at end (in-place, no layout shift)** |
| **Drag active (locked)** | **No glow, no drop zones — line is running or has completed, cannot be modified** |
| Active line (currently executing) | Blue left border (4px), number in blue, subtle blue tint. **Locked for editing — must pause/stop agents first.** |
| Complete line | Green left border, green checkmark on number, muted opacity. **Locked for editing.** |
| Error in line | Red left border, red exclamation on number |
| Future line (not yet started, preceding lines still running) | Default gray border. **Editable — drop zones appear during drag.** |

### Between Lines: Transition Gate

```
═══════════════════════════╤═══════════════════════════
                           │
                     ┌─────┴─────┐
                     │  🔒 Manual │    ← Click to trigger transition
                     └─────┬─────┘
                           │
═══════════════════════════╧═══════════════════════════
```

- **Auto transition**: Simple downward arrow `↓` (no user action needed)
- **Manual transition**: Lock icon + "Manual" label. Clickable button to trigger. Glows when preceding line is complete and awaiting trigger.

---

## Node Card Design

### Standard Node Card (120px × 100px minimum)

```
┌──────────────────────┐
│ 🤖  spec-writer      │  ← Type icon + unit name
│                      │
│ "Write spec from     │  ← Description (truncated)
│  requirements"       │
│                      │
│ ● Ready    ║ 🟢 G   │  ← Status + Context indicator
└──────────────────────┘
```

### Node Card Elements

| Element | Position | Purpose |
|---------|----------|---------|
| Type icon | Top-left | 🤖 Agent, ⚙️ Code, 👤 Human Input |
| Unit name | Top, after icon | Work unit slug (truncated if long) |
| Description | Middle | From node.yaml description (2 lines max) |
| Status indicator | Bottom-left | Colored dot + label |
| Context badge | Bottom-right corner | Colored square showing context source (Workshop 002) |
| Drag handle | Left edge (on hover) | 6-dot grip icon, cursor changes to grab |
| Actions menu | Top-right (on hover) | ⋮ menu → Edit, Delete, Properties, Move |

### Node Status Colors

| Status | Color | Icon | Label |
|--------|-------|------|-------|
| pending | Gray (#9CA3AF) | ○ | Pending |
| ready | Blue (#3B82F6) | ● | Ready |
| starting | Blue (pulsing) | ◉ | Starting... |
| agent-accepted | Blue (animated) | ⟳ | Running |
| waiting-question | Purple (#8B5CF6) | ? | Question |
| blocked-error | Red (#EF4444) | ✕ | Error |
| restart-pending | Amber (#F59E0B) | ↻ | Restarting |
| complete | Green (#22C55E) | ✓ | Complete |

### Node Card Interactions

| Action | Trigger | Result |
|--------|---------|--------|
| Select | Click | Blue outline, shows properties in right panel (future) |
| Edit | Double-click or ⋮ → Edit | Opens modal with unit config |
| Delete | ⋮ → Delete or Backspace (when selected) | Remove from line, update graph.yaml |
| Drag within line | Grab handle + drag | Reorder within same line |
| Drag between lines | Grab handle + drag to another line | Move to target line at drop position |
| Hover | Mouse enter | Show drag handle, actions menu |
| Question indicator | Click purple ? badge | Opens Q&A modal |
| Error indicator | Click red ✕ badge | Opens error detail popover |

---

## Work Unit Toolbox (Left Panel)

### Layout

```
┌─ Work Units ──────────────┐
│                            │
│  🔍 Search...              │
│                            │
│  ▾ Agents (3)              │
│  ┌────────────────────┐    │
│  │ 🤖 spec-writer     │    │  ← Draggable
│  │    Writes specs     │    │
│  └────────────────────┘    │
│  ┌────────────────────┐    │
│  │ 🤖 dev-agent       │    │
│  │    Implements code  │    │
│  └────────────────────┘    │
│  ┌────────────────────┐    │
│  │ 🤖 reviewer        │    │
│  │    Reviews changes  │    │
│  └────────────────────┘    │
│                            │
│  ▾ Code (1)                │
│  ┌────────────────────┐    │
│  │ ⚙️ test-runner     │    │
│  │    Runs test suite  │    │
│  └────────────────────┘    │
│                            │
│  ▸ Human Input (0)         │
│                            │
└────────────────────────────┘
```

**Behaviors:**
- Units grouped by type: Agent, Code, Human Input
- Groups collapsible (▾/▸)
- Search filters across all groups
- Drag from toolbox → drop on line = addNode()
- Same unit can be added to multiple lines (new node instance each time)
- Toolbox loads from `IWorkUnitService.list(ctx)` on mount

---

## Empty States

### Brand New Workflow (No Lines)

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│                                                     │
│                    ┌─────────┐                      │
│                    │         │                      │
│                    │    +    │                      │
│                    │         │                      │
│                    └─────────┘                      │
│                                                     │
│              Create your first line                 │
│                                                     │
│         Drag work units from the right panel       │
│         or click + to add a line                   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Line With No Nodes

```
┌─ ① "New Line" ────────────────────────────── ⚙️ ──┐
│                                                      │
│   ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐   │
│   │  Drop work units here from the right panel   │   │
│   └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### No Work Units Available

Right panel shows:
```
┌─ Work Units ──────────────┐
│                            │
│  No work units found.      │
│                            │
│  Run `just dope-agents`    │
│  to add sample agents.     │
│                            │
└────────────────────────────┘
```

---

## Interaction Flows

### Adding a Line

```
User clicks [+ Add Line] at bottom of canvas
    │
    ├── New line appended with auto-generated label "Line N"
    ├── graph.yaml updated immediately (addLine API)
    ├── Line appears with empty drop zone
    └── Label is in edit mode (cursor in text field)
```

### Drag-and-Drop: Toolbox → Line

```
User starts dragging "spec-writer" from right panel toolbox
    │
    ├── Ghost card follows cursor
    ├── Editable lines glow subtly (lines that are running/complete do NOT glow)
    ├── In-place [+] drop zones appear:
    │   ├── Between each pair of adjacent nodes (overlay, no layout shift)
    │   └── At the end of each editable line
    │
    ├── User drops on a [+] zone in Line 1
    │   ├── addNode(ctx, graphSlug, lineId, unitSlug, {atPosition: dropIndex})
    │   ├── graph.yaml + node.yaml written immediately
    │   ├── New node card appears at drop position
    │   ├── Context flow indicators and dependency badges update immediately
    │   ├── toast.success("Added spec-writer to Line 1")
    │   └── SSE broadcast → other clients update
    │
    └── User drops outside valid zone or on a locked (running/complete) line
        └── No-op, ghost card returns to toolbox
```

### Drag-and-Drop: Reorder Within/Between Lines

```
User grabs node handle within Line 1
    │
    ├── Check: is this line editable? (not running or complete)
    │   ├── No → drag not initiated, cursor shows 🚫
    │   └── Yes → continue
    │
    ├── Card lifts (slight scale + shadow)
    ├── [+] insertion zones appear between other nodes on editable lines
    │
    ├── User drops at new position (same line)
    │   ├── moveNode(ctx, graphSlug, nodeId, {toPosition: newIndex})
    │   ├── graph.yaml updated
    │   ├── Context flow + deps refresh immediately
    │   └── Smooth animation to new position
    │
    └── User drops on different (editable) line
        ├── moveNode(ctx, graphSlug, nodeId, {toLineId, toPosition})
        ├── Node disappears from source, appears in target
        └── Context flow + deps refresh immediately for both lines
```

### Editing a Node

```
User double-clicks node card  OR  clicks ⋮ → Edit
    │
    └── Modal opens with:
        ├── Unit info (read-only): type, slug, description
        ├── Node description (editable text)
        ├── Orchestrator settings:
        │   ├── Execution: [Serial ▾] / [Parallel ▾]
        │   ├── Wait for previous: [✓]
        │   ├── No context: [ ]
        │   └── Context from: [Select node ▾] (dropdown of eligible nodes)
        ├── Input wiring:
        │   └── Per-input: source node + output selector
        └── [Save] [Cancel]
```

---

## Scrolling & Overflow

### Horizontal Scroll (Within Lines)
- Lines with many nodes scroll horizontally
- Horizontal scrollbar appears at bottom of line container
- Scroll indicators (fade + arrow) on edges when content overflows

### Vertical Scroll (Between Lines)
- Canvas scrolls vertically when lines exceed viewport
- Sticky line numbers on left edge while scrolling
- "Jump to line" keyboard shortcut (Ctrl+G → line number)

### Zoom (Future Enhancement — OOS for v1)
- v1: Fixed zoom (100%), scroll only
- Future: Ctrl+scroll to zoom, minimap in corner

---

## Responsive Considerations

| Viewport | Adaptation |
|----------|------------|
| Desktop (>1200px) | Full layout: toolbox + canvas |
| Tablet (768-1200px) | Collapsible toolbox (toggle button), canvas takes full width |
| Mobile (<768px) | Out of scope — show "Use desktop for workflow editor" message |

---

## Data ↔ Visual Mapping (Complete Reference)

```
graph.yaml                          Visual
─────────────────────────────────   ──────────────────────────
lines[0]                        →   Line 1 (top)
  .id = "line-001"              →   Internal reference
  .label = "Gather"             →   "① Gather" header text
  .nodes = ["a1b", "c2d"]      →   Two cards, left-to-right
  .orchestratorSettings
    .transition = "auto"        →   ↓ arrow below line
    .autoStartLine = true       →   No gate UI
lines[1]                        →   Line 2 (below)
  .orchestratorSettings
    .transition = "manual"      →   🔒 gate between lines 1-2

nodes/a1b/node.yaml             →   First card in Line 1
  .unit_slug = "spec-writer"    →   Card title
  .orchestratorSettings
    .execution = "serial"       →   Chain link to next node
    .noContext = false           →   Green context badge (G)
    .contextFrom = null          →   Default inheritance

state.json                      →   Status overlay
  .nodes["a1b"].status          →   Status dot color + label
  .graph_status                 →   Overall status badge
```

---

## Technical Implementation Notes

### NOT Using ReactFlow for Lines

**Decision**: Build custom line-based canvas rather than using ReactFlow's freeform node positioning.

**Rationale**:
- ReactFlow is designed for freeform DAGs with arbitrary (x,y) positioning
- Positional model has **constrained layout**: nodes belong to lines, lines are rows
- Forcing ReactFlow into swimlane mode requires fighting the framework
- Custom HTML/CSS with dnd-kit is simpler and more maintainable
- ReactFlow adds 150KB+ bundle weight for features we won't use (minimap, edge routing)

**Approach**: Use `@dnd-kit/core` + `@dnd-kit/sortable` for all drag-and-drop. Lines are `<div>` rows with flexbox. Nodes are sortable items within each line. Cross-line dragging uses dnd-kit's `DragOverlay`.

### Component Tree

```
WorkflowPage (server component)
└── WorkflowClient (client component)
    ├── WorkflowTempBar (placeholder — future: shared ExplorerBar domain)
    ├── PanelShell
    │   ├── MainPanel
    │   │   └── WorkflowCanvas
    │   │       ├── EmptyCanvasPlaceholder (when no lines)
    │   │       ├── WorkflowLine[] (DnD droppable)
    │   │       │   ├── LineHeader (number, label, settings)
    │   │       │   ├── SortableNodeList (DnD sortable context)
    │   │       │   │   ├── WorkflowNodeCard[] (DnD sortable items)
    │   │       │   │   └── DropZone[] (in-place [+] zones, visible during drag only)
    │   │       │   └── EndDropZone (append position, visible during drag only)
    │   │       ├── LineTransitionGate[] (between lines)
    │   │       └── AddLineButton
    │   └── RightPanel
    │       └── WorkUnitToolbox (always visible)
    │           └── WorkUnitDragItem[] (DnD source)
    └── WorkflowStatusBar
```

### State Management

```typescript
// URL params (persisted via nuqs)
interface WorkflowURLState {
  graph: string;          // Graph slug
  template?: string;      // Source template slug
  instance?: string;      // Instance ID
  selectedNode?: string;  // Currently selected node ID
  activeLine?: string;    // Focused line ID
}

// React state (in WorkflowCanvas)
interface WorkflowCanvasState {
  definition: PositionalGraphDefinition;  // From graph.yaml
  state: GraphState;                       // From state.json
  isDirty: boolean;                        // Unsaved changes
  undoStack: GraphSnapshot[];              // For undo/redo
  dragState: DragState | null;             // Active drag operation
}
```

### File Persistence Strategy

Every mutation immediately writes to disk:
1. User drags node → `addNode()` server action → writes graph.yaml
2. Server action returns updated definition
3. Client state updates optimistically
4. SSE broadcasts change to other clients
5. Undo stack captures pre-mutation snapshot

---

## Naming Conventions (Clarified 2026-02-26)

All slugs are kebab-case: `^[a-z][a-z0-9-]*$`

### Create New (Blank Workflow)

- Modal prompts for slug — **blank input**, user must type it
- Inline validation shows kebab-case regex feedback
- No auto-generation — user owns the name

```
┌─ New Workflow ────────────────────────────────┐
│                                                │
│  Name your workflow:                           │
│  ┌────────────────────────────────────────┐    │
│  │                                        │    │
│  └────────────────────────────────────────┘    │
│  Must be lowercase, letters/digits/hyphens     │
│                                                │
│                         [Cancel]  [Create]      │
└────────────────────────────────────────────────┘
```

### Create from Template

- Modal with **composite slug**: `{template-name}-{editable-middle}-{hash}`
- Template name prefix and hash suffix are **locked** (non-editable, visually distinct)
- Middle section is **pre-filled with a suggestion** (e.g. date or short desc) but user can edit it
- This ensures uniqueness (hash) while giving user control over the descriptive middle

```
┌─ New from Template: ci-pipeline ──────────────┐
│                                                │
│  Instance name:                                │
│                                                │
│  ci-pipeline- ┌────────────┐ -c3f             │
│  (locked)     │ feb-26-run │ (locked hash)    │
│               └────────────┘                   │
│               ↑ editable, pre-filled           │
│                                                │
│  Full slug: ci-pipeline-feb-26-run-c3f         │
│                                                │
│                         [Cancel]  [Create]      │
└────────────────────────────────────────────────┘
```

### Save as Template

- Modal with slug input **pre-filled with current graph slug** (user edits)
- Warns if template slug already exists (overwrite confirmation)

```
┌─ Save as Template ────────────────────────────┐
│                                                │
│  Template name:                                │
│  ┌────────────────────────────────────────┐    │
│  │ my-pipeline                            │    │  ← pre-filled from graph slug
│  └────────────────────────────────────────┘    │
│  Must be lowercase, letters/digits/hyphens     │
│                                                │
│                         [Cancel]  [Save]        │
└────────────────────────────────────────────────┘
```

---

## Open Questions

### Q1: Should we use ReactFlow at all?

**RESOLVED**: No. Build custom HTML/CSS canvas with dnd-kit. Positional model is constrained and doesn't benefit from ReactFlow's freeform positioning. See Technical Implementation Notes above.

### Q2: How do parallel nodes render within a line?

**RESOLVED**: Same row, left-to-right like serial nodes. The visual difference is the **chain link** indicator:
- Serial: `[Node A] ──▶ [Node B]` (arrow between)
- Parallel: `[Node A]    [Node B]` (no arrow, fork icon on each)

Node cards have a small icon in top-right showing execution mode.

### Q3: Maximum nodes per line before horizontal scroll?

**OPEN**: Depends on viewport width and card size. At 120px card width + 16px gap, a 1200px canvas fits ~8 nodes. Recommend scroll at 8+ nodes with fade indicators.

### Q4: Can users reorder lines (not just nodes)?

**RESOLVED**: Yes. Lines are draggable via their number/header. Uses same dnd-kit sortable pattern but at the line level. Maps to reordering `lines[]` array in graph.yaml.

---

## Summary

The line-based canvas replaces ReactFlow's freeform DAG with a constrained, row-based layout using HTML/CSS and dnd-kit. Lines are numbered horizontal rows, nodes are cards within rows, and all mutations persist immediately to disk. The visual model maps directly to the positional graph data model — no translation layer needed.
