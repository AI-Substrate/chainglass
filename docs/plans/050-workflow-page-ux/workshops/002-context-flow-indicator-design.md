# Workshop: Context Flow Indicator Design

**Type**: UI Design
**Plan**: 050-workflow-page-ux
**Spec**: (pending — pre-spec workshop)
**Created**: 2026-02-26
**Status**: Draft

**Related Documents**:
- [Workshop 001: Line-Based Canvas UX Design](./001-line-based-canvas-ux-design.md)
- [Positional Graph Domain](../../../domains/_platform/positional-graph/domain.md)
- [Research Dossier](../research-dossier.md)

**Domain Context**:
- **Primary Domain**: `workflow-ui` (new business domain)
- **Related Domains**: `_platform/positional-graph` (context resolution engine)

---

## Purpose

Define how context flow, readiness gates, and input wiring are visually represented on node cards. Users must understand at a glance: what context each node gets, why a node can't run yet, and how data flows between nodes.

## Key Questions Addressed

- How does the user see which context each node inherits?
- How are the 5 readiness gates shown (what's blocking a node)?
- How are input wires visualized (from_node vs from_unit)?
- What color scheme distinguishes context types?
- How does noContext isolation appear?

---

## The 5-Gate Readiness Model

Each node must pass 5 gates before it can execute. Gates are checked in order — the first failure determines the blocking reason displayed to the user.

| Gate | Name | Blocks When | Visual Signal | Data Source |
|------|------|-------------|---------------|-------------|
| 1 | Preceding Lines | Earlier lines have incomplete nodes | Red upstream indicator | `readyDetail.precedingLinesComplete` |
| 2 | Transition | Manual transition not triggered | Amber lock icon | `readyDetail.transitionOpen` |
| 3 | Serial Neighbor | Left neighbor not complete (serial mode) | Orange chain link | `readyDetail.serialNeighborComplete` |
| 4 | Context From | `contextFrom` target not complete | Blue inheritance arrow | `readyDetail.contextFromReady` |
| 5 | Inputs | Required inputs not available | Purple input indicator | `inputPack.ok` |

### Gate Indicator on Node Card

When a node is blocked (status = pending), the card shows a small **gate chip** at the bottom:

```
┌──────────────────────┐
│ 🤖  dev-agent        │
│                      │
│ "Implement feature"  │
│                      │
│ ○ Pending            │
│ ⛔ Line 1 incomplete │  ← Gate chip (red, showing Gate 1 reason)
└──────────────────────┘
```

**Gate chip colors and messages:**

| Gate | Chip Color | Message Examples |
|------|------------|-----------------|
| 1 | Red (#EF4444) | "Line 1 incomplete (2 nodes remaining)" |
| 2 | Amber (#F59E0B) | "Awaiting manual transition" |
| 3 | Orange (#F97316) | "Waiting for spec-writer" |
| 4 | Blue (#3B82F6) | "Waiting for context from reviewer" |
| 5 | Purple (#8B5CF6) | "Input 'query' not available" |

When multiple gates fail, only the **first** (highest priority) is shown — with a "+N more" indicator if others also fail.

---

## Context Source Indicators

### The Context Badge

Every node card shows a **small colored square** in the bottom-right corner indicating where its agent context comes from.

```
┌──────────────────────┐
│ 🤖  spec-writer      │
│                      │
│ "Write specification"│
│                      │
│ ● Ready       ┌──┐  │
│                │🟢│  │  ← Context badge (green = global/new)
│                └──┘  │
└──────────────────────┘
```

### Context Badge Colors

| Color | Meaning | Tooltip | When |
|-------|---------|---------|------|
| 🟢 Green | Global context (new session) | "New context — first agent" | R3: Global agent, R1: noContext, R4: parallel pos>0 |
| 🔵 Blue | Inherited from left neighbor | "Context from: spec-writer (left)" | R5: Left-hand rule default |
| 🟣 Purple | Inherited from explicit node | "Context from: reviewer (explicit)" | R2: contextFrom set |
| ⚫ Gray | Not applicable | "Non-agent node" | R0: Code or user-input node |

### Context Badge with `noContext` Isolation

Nodes with `noContext: true` show a distinctive badge:

```
┌──────────────────────┐
│ 🤖  dev-agent    🔒  │  ← Lock icon next to type icon
│                      │
│ "Independent work"   │
│                      │
│ ● Ready       ┌──┐  │
│                │🟢│  │  ← Green (new/isolated context)
│                └──┘  │
└──────────────────────┘
```

The 🔒 lock icon on the title row signals "this agent runs in isolation" without needing to open properties.

---

## Context Flow Lines (Between Nodes)

### Default Context Inheritance (Left-Hand Rule)

When a serial agent inherits from its left neighbor, a **subtle dashed line** connects them:

```
┌──────────┐         ┌──────────┐
│spec-writer│╌╌╌╌╌╌╌▶│ dev-agent│
│  🟢 new  │ context │  🔵 left │
└──────────┘         └──────────┘
```

- **Dashed line**: Light gray, subtle — only visible on hover or when "Show Context" mode is active
- **Arrow direction**: Left → Right (context flows from source to consumer)
- **Color**: Matches the badge color of the target node

### Explicit `contextFrom` Override

When a node has `contextFrom` set to a non-neighbor, a **colored arc** connects them:

```
┌──────────┐    ┌──────────┐    ┌──────────┐
│spec-writer│    │ dev-agent│    │ reviewer │
│  🟢 new  │    │  🔵 left │    │  🟣 from │
└──────────┘    └──────────┘    └─────┬────┘
                                      │
                     ╭────────────────╯
                     │  context from spec-writer
                     ▼
              ┌──────────┐
              │  tester  │
              │  🟣 from │
              └──────────┘
```

- **Solid colored line**: Purple, visible when either node is selected or in "Show Context" mode
- **Label on line**: "context from [node name]" on hover

### Cross-Line Context

When context flows from a preceding line, the dashed line crosses the line boundary:

```
Line 1: [spec-writer 🟢] [reviewer 🔵]
                ╎
           ═════╪═══════  (line transition)
                ╎
Line 2: [dev-agent 🔵]    ← inherits from reviewer (R5 cross-line)
```

---

## Input Wiring Visualization

### Interaction Model: Select-to-Reveal

Canvas is **clean by default** — no input wires visible. When a user **clicks/selects a node**, its full dependency neighborhood is revealed in two visual tiers:

**Tier 1 — Upstream (inputs + context source): Full color**
1. **Selected node** gets a strong highlight border
2. **Input source nodes** glow with colored outlines (matching their data status)
3. **PCB-style traces** appear routing from sources to the selected node — full-color (green/amber/red per status)
4. **Context source node** (if inheriting) gets a subtle context-colored outline matching its badge color

**Tier 2 — Downstream (consumers + dependents): Muted/gray**
5. **Consumer nodes** (nodes that take this node's outputs as inputs) get a lighter outline — traces render in **muted gray** (#9CA3AF) with dashed style, visually distinct from the upstream full-color traces
6. **Transitive dependents** (nodes that depend on consumers, etc.) are NOT traced — only direct consumers. Keeps it manageable.

**Dimming**
7. **Unrelated nodes dim** — nodes with no upstream, downstream, or context relationship to the selected node fade to ~40% opacity, visually receding so the dependency neighborhood stands out

**Properties + Deselect**
8. **Properties panel** appears (see below) showing node details
9. **Deselect** (click canvas background or Escape) → all traces disappear, nodes restore full opacity, properties panel closes

### Visual Summary: Upstream vs Downstream

```
                     UPSTREAM (full color)              DOWNSTREAM (muted gray)
                     ─────────────────────              ───────────────────────

  [spec-writer ✓]──── green trace ────▶ [SELECTED NODE] ----gray trace---▶ [pr-creator ○]
                                              │
  [config-a1b ◐]──── amber trace ────▶       │         ----gray trace---▶ [deployer ○]
                                              │
                                              │
  [unrelated ○]  ← dimmed to 40% opacity
```

**Rationale**: Upstream = "where does my data come from?" (actionable — user can fix broken wiring). Downstream = "what will break if I remove this node?" (informational — shown but de-emphasized).

### PCB Trace Routing

Connector lines route like **printed circuit board traces** — clean right-angle channels that avoid overlapping node cards.

**Within the same line** — traces route below the node cards in a channel area under the line:

```
┌──────────┐    ┌──────────┐    ┌──────────┐
│spec-writer│    │ dev-agent│    │ reviewer │  ← SELECTED
│  ✓ done  │    │  ✓ done  │    │  ● ready │
└──────┬───┘    └──────┬───┘    └────┬─────┘
       │               │             │
       └───────────────┴─────────────┘  ← PCB traces (green = available)
         query input      spec input
```

The under-line channel is a thin strip (~8px) below each line container. Traces run horizontally in this channel, with short vertical stubs connecting up to source/target nodes.

**Cross-line connections** — traces run vertically in the gap between lines (consistent PCB style):

```
Line 1: ┌──────────┐    ┌──────────┐
         │spec-writer│    │ reviewer │
         │  ✓ done  │    │  ✓ done  │
         └──────┬───┘    └──────────┘
                │
    ════════════╪═══════════════════════  (line transition gap)
                │
Line 2: ┌──────┴───┐    ┌──────────┐
         │ dev-agent│    │  tester  │  ← SELECTED
         │  ● ready │    │ ○ pending│
         └──────┬───┘    └──────────┘
                │                │
                └────────────────┘  ← PCB trace (green, under-line)
                  code input
```

Vertical traces run in the space between line containers (where transition gates live). They connect to the under-line channel of each line.

### Trace Colors (Status-Driven)

| Input Status | Trace Color | Trace Style | Meaning |
|---|---|---|---|
| Available (data ready) | Green (#22C55E) | Solid 2px | Source complete, data loaded |
| Waiting (source pending) | Amber (#F59E0B) | Dashed 2px | Source not yet complete |
| Error (wiring broken) | Red (#EF4444) | Dotted 2px | Invalid reference, missing node, etc. |

Colors match the gate chip palette for consistency.

### Trace Labels

Each trace has a **small label** near its midpoint (visible on hover, or always if few traces):
- Format: `input-name ← output-name` (e.g., `spec ← specification`)
- Label appears in a small pill/badge floating on the trace

### `from_unit` Multi-Source Traces

When an input uses `from_unit` resolution, multiple source nodes may match. All matching sources get traces:

```
Line 1: [analyzer-1 ✓] [analyzer-2 ✓]
              │               │
              └───────┬───────┘   ← Two green traces merge
                      │
Line 2:        [consumer ● ready]  ← SELECTED
                 input: "analysis" (from_unit: "analyzer")
```

The detail popover shows which sources matched and their individual data availability.

### Input Status Per Node (Detail Popover)

When a node is selected, a **popover** (or inline panel below the node) shows the full input breakdown:

```
┌─ Inputs for: reviewer ──────────────────┐
│                                          │
│  spec          ● Available               │  ← Green dot + green trace
│  └── from: spec-writer → specification   │
│                                          │
│  settings      ◐ Waiting                 │  ← Amber dot + amber trace
│  └── from_unit: config → settings        │
│      (node config-a1b not yet complete)  │
│                                          │
│  review_data   ✕ Error                   │  ← Red dot + red trace
│  └── from_node: nonexistent-xyz (E164)   │
│      Node not found in graph             │
│                                          │
└──────────────────────────────────────────┘
```

---

## Toolbar Controls

### View Mode Toggles

The canvas toolbar includes toggles for additional overlay information:

```
[📊 Show All Status Gates]
```

| Mode | What's Visible | Default |
|------|---------------|---------|
| Normal (no toggle) | Node cards with status dots and context badges. **Select-to-reveal** for input traces. | ✅ Always on |
| Show All Status Gates | Gate chips on ALL pending nodes (not just selected) | Off |

**Key change from earlier design**: No "Show Context" or "Show Inputs" toolbar toggles. Input wiring is revealed by **selecting a node** (select-to-reveal pattern). This keeps the canvas clean and avoids visual overload on complex graphs.

Context inheritance (agent session flow) is shown via the **context badges** on every node card (always visible, Workshop 002 core design).

---

## Node Properties Panel

When a node is selected, a **properties panel** slides in below the right-panel toolbox (or replaces it temporarily). This gives the user a focused view of the selected node without opening a modal.

### Properties Panel Layout

```
┌─ Properties: spec-writer-a1b ─────┐
│                                    │
│  Unit: spec-writer (🤖 Agent v1)   │
│  Status: ● Ready                   │
│                                    │
│  ── Context ─────────────────────  │
│  Source: 🟢 New (global agent)     │
│  Execution: Serial                 │
│  No Context: No                    │
│                                    │
│  ── Inputs (2) ──────────────────  │
│  spec     ● Available              │
│   └─ spec-writer → specification   │
│  config   ◐ Waiting                │
│   └─ from_unit: config → settings  │
│                                    │
│  ── Outputs (1) ─────────────────  │
│  result   → used by: reviewer      │
│                                    │
│  ── Downstream (1) ──────────────  │
│  reviewer  (takes: result)         │
│                                    │
│            [Edit Properties...]     │
└────────────────────────────────────┘
```

### What's Shown

| Section | Content | Source |
|---------|---------|-------|
| Header | Unit name, type icon, version, node ID | node.yaml + unit.yaml |
| Status | Current status dot + label, gate chip if blocked | getNodeStatus() |
| Context | Context source badge + label, execution mode, noContext flag | getContextSource() + orchestratorSettings |
| Inputs | Per-input: name, status dot, source trace summary | collateInputs() |
| Outputs | Per-output: name, which downstream nodes consume it | Reverse lookup from graph |
| Downstream | Direct consumers listed with which input they take | Reverse input resolution |
| Edit button | Opens full edit modal (Workshop 003 node properties modal) | — |

### Panel Behavior

- **Appears on node select** — slides in from right or replaces toolbox content with a back button
- **Disappears on deselect** — toolbox returns
- **Read-only by default** — "Edit Properties..." button opens the full modal for changes
- **Live updates** — if SSE event changes the selected node's status, panel refreshes automatically

---

## Color System Summary

### Complete Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Green | #22C55E | New/global context, available inputs, complete status |
| Blue | #3B82F6 | Left-neighbor context, ready status, contextFrom gate |
| Purple | #8B5CF6 | Explicit contextFrom, waiting-question, input gate |
| Amber | #F59E0B | Manual transition gate, restart-pending |
| Orange | #F97316 | Serial neighbor gate |
| Red | #EF4444 | Error, preceding lines gate, error inputs |
| Gray | #9CA3AF | Not applicable, pending, waiting inputs |

### Accessibility

- All status indicators use **icon + color** (never color alone)
- Gate chips include text labels
- Context badges show tooltip on hover with full explanation
- Sufficient contrast ratios (WCAG AA minimum) against card backgrounds

---

## Data API for Context Indicators

### What the UI Needs Per Node

```typescript
interface NodeVisualState {
  // From getNodeStatus()
  status: NodeStatus;
  
  // From readyDetail (when status = pending)
  blockingGate?: 'preceding' | 'transition' | 'serial' | 'contextFrom' | 'inputs';
  blockingDetail?: string;  // Human-readable reason
  
  // From getContextSource()
  contextSource: 'new' | 'inherit' | 'not-applicable';
  contextFromNodeId?: string;  // If inherit
  contextReason: string;       // "Left neighbor 'spec-writer'"
  
  // From node.yaml orchestratorSettings
  isNoContext: boolean;
  isParallel: boolean;
  hasExplicitContextFrom: boolean;
  
  // From collateInputs() (only when selected or in Inputs mode)
  inputPack?: {
    inputs: Record<string, {
      status: 'available' | 'waiting' | 'error';
      sources: Array<{ nodeId: string; output: string; hasData: boolean }>;
    }>;
    ok: boolean;
  };
}
```

### Fetching Strategy

- **On mount**: Load graph definition + state for all nodes → compute statuses + context sources
- **On selection**: Fetch `collateInputs()` for selected node (lazy — don't fetch for all nodes)
- **On SSE event**: Refresh state.json → recompute affected node statuses
- **Periodic**: No polling — SSE events drive all updates

---

## Open Questions

### Q1: Should context flow lines be always visible or toggle-only?

**RESOLVED**: Toggle-only (via toolbar "Context" mode). Default view shows only badge + gate chip. Context lines add visual noise for large workflows.

### Q2: How to show cross-line context inheritance?

**RESOLVED**: Same dashed line style, but it crosses the line transition gate. A small "↑" indicator on the badge tooltip shows "inherited from Line N".

### Q3: Should input wires show data values?

**RESOLVED**: No — too noisy. Input detail panel (on node selection) shows source nodes and availability. Actual data values are in the node inspector (future feature).

---

## Summary

Context indicators use a layered system: always-visible **context badges** (colored corner squares) on every node, **gate chips** on blocked nodes showing the blocking reason, and toggleable **flow lines** for detailed context/input tracing. The color system is consistent: green=new, blue=inherited, purple=explicit, with gate-specific colors for blocking reasons. All indicators are accessible (icon+color+text) and data-driven from the existing `readyDetail`, `ContextSourceResult`, and `InputPack` APIs.
