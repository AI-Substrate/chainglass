# Workshop: Per-Instance Work Unit Configuration

**Type**: Data Model / Storage Design
**Plan**: 050-workflow-page-ux
**Spec**: (pending — pre-spec workshop)
**Created**: 2026-02-26
**Status**: Draft

**Related Documents**:
- [Workshop 001: Line-Based Canvas UX Design](./001-line-based-canvas-ux-design.md)
- [Plan 048: Workflow Templates](../../048-wf-web/wf-web-plan.md)
- [Workshop 003: Instance Unified Storage (Plan 048)](../../048-wf-web/workshops/003-instance-unified-storage.md)

**Domain Context**:
- **Primary Domain**: `_platform/positional-graph` (owns node.yaml, unit.yaml schemas)
- **Related Domains**: `workflow-ui` (edits config), `_platform/positional-graph` (runtime reads config)

---

## Purpose

Clarify how per-instance work unit configuration works when the same work unit appears in multiple workflows with different settings. Determine what config lives where, what the UI needs to edit, and how template refresh interacts with per-instance overrides.

## Key Questions Addressed

- What if I have the same work unit in two workflows with different context/parallel settings?
- Where does per-instance config live? On the node or the unit?
- Does template refresh destroy per-instance overrides?
- What does the UI need to let users edit?

---

## Current Architecture: Already Solved

**Key finding**: The per-instance config problem is **already solved** by the existing architecture. The node.yaml / unit.yaml separation cleanly handles it.

### Two-Layer Config Model

```
┌─────────────────────────────────────────────────────┐
│  unit.yaml (Work Unit Definition)                    │
│  ─────────────────────────────────                   │
│  • Identity: slug, type, version                     │
│  • Ports: inputs[], outputs[]                        │
│  • Behavior: promptTemplate, timeout, questionType   │
│  • SHARED across all instances using this unit       │
│  • REFRESHABLE from template source                  │
│  • Location: .../units/<slug>/unit.yaml              │
└─────────────────────────────────────────────────────┘
         ↑ referenced by unit_slug
┌─────────────────────────────────────────────────────┐
│  node.yaml (Node Instance Configuration)             │
│  ────────────────────────────────────                │
│  • Identity: id, unit_slug, created_at               │
│  • Description: per-instance description             │
│  • Input wiring: from_node/from_unit mappings        │
│  • Orchestrator settings:                            │
│    - execution: serial | parallel                    │
│    - waitForPrevious: boolean                        │
│    - noContext: boolean                              │
│    - contextFrom: nodeId (optional)                  │
│  • Properties: {} extensible bag                     │
│  • PER-INSTANCE — unique to each node in each graph  │
│  • NOT overwritten by template refresh               │
│  • Location: .../nodes/<nodeId>/node.yaml            │
└─────────────────────────────────────────────────────┘
```

### Same Unit, Different Workflows — Example

```yaml
# Workflow A: nodes/dev-agent-a1b/node.yaml
id: dev-agent-a1b
unit_slug: dev-agent          # Same unit
orchestratorSettings:
  execution: serial           # Runs in sequence
  noContext: false             # Inherits context
  contextFrom: spec-writer-c3d

# Workflow B: nodes/dev-agent-x7y/node.yaml  
id: dev-agent-x7y
unit_slug: dev-agent          # Same unit!
orchestratorSettings:
  execution: parallel         # Runs in parallel
  noContext: true              # Isolated context
```

Both nodes reference the same `dev-agent` unit definition but have completely different execution settings. This is the design working as intended.

---

## Template Refresh Behavior

### What Refresh DOES Overwrite

```
.chainglass/instances/<template>/<id>/
├── units/                    ← ✅ OVERWRITTEN by refresh
│   ├── dev-agent/
│   │   └── unit.yaml        ← ✅ Replaced with template version
│   └── spec-writer/
│       └── unit.yaml        ← ✅ Replaced with template version
```

### What Refresh Does NOT Touch

```
.chainglass/instances/<template>/<id>/
├── graph.yaml                ← ❌ NOT touched (topology preserved)
├── state.json                ← ❌ NOT touched (runtime state preserved)
├── instance.yaml             ← Updated (refreshed_at timestamp only)
├── nodes/                    ← ❌ NOT touched
│   ├── dev-agent-a1b/
│   │   └── node.yaml        ← ❌ Per-instance config PRESERVED
│   └── spec-writer-c3d/
│       └── node.yaml        ← ❌ Per-instance config PRESERVED
```

**This means**: Users can customize orchestratorSettings on any node, and `cg template refresh` will update the unit definitions (prompts, timeouts, etc.) without destroying per-instance execution config.

---

## What the UI Needs to Edit

### Node Properties Modal

When user edits a node (double-click or ⋮ → Edit), the modal shows:

```
┌─ Edit Node: dev-agent-a1b ──────────────────────────┐
│                                                       │
│  Unit: dev-agent (🤖 Agent v1.0.0)      [Read-only]  │
│                                                       │
│  ── Node Settings ──────────────────────────────────  │
│                                                       │
│  Description:                                         │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Implement the feature based on spec             │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  ── Execution ──────────────────────────────────────  │
│                                                       │
│  Mode:          [Serial ▾]                            │
│  Wait for prev: [✓]                                   │
│  No context:    [ ]                                   │
│  Context from:  [Auto (left neighbor) ▾]              │
│                                                       │
│  ── Input Wiring ───────────────────────────────────  │
│                                                       │
│  query:                                               │
│    Source: [from_node ▾]  Node: [spec-writer ▾]       │
│    Output: [specification ▾]                          │
│                                                       │
│  config:                                              │
│    Source: [from_unit ▾]  Unit: [default-config ▾]    │
│    Output: [settings ▾]                               │
│                                                       │
│  ── Properties (Advanced) ──────────────────────────  │
│                                                       │
│  { }   [Edit JSON]                                    │
│                                                       │
│                              [Cancel]  [Save]         │
└───────────────────────────────────────────────────────┘
```

### Editable Fields (Writes to node.yaml)

| Field | Schema Path | Type | Notes |
|-------|-------------|------|-------|
| Description | `description` | string | Optional, freeform |
| Execution mode | `orchestratorSettings.execution` | `serial` \| `parallel` | Affects context flow |
| Wait for previous | `orchestratorSettings.waitForPrevious` | boolean | Only meaningful in serial |
| No context | `orchestratorSettings.noContext` | boolean | Isolates agent session |
| Context from | `orchestratorSettings.contextFrom` | string? | Node ID dropdown |
| Input wiring | `inputs[name]` | InputResolution | Per-input source config |
| Properties | `properties` | Record | Advanced JSON editor |

### Read-Only Fields (From unit.yaml)

| Field | Source | Purpose |
|-------|--------|---------|
| Unit slug | `unit_slug` | Identity |
| Unit type | unit.yaml → `type` | Icon selection (🤖/⚙️/👤) |
| Unit version | unit.yaml → `version` | Display only |
| Input ports | unit.yaml → `inputs[]` | Determines which inputs to wire |
| Output ports | unit.yaml → `outputs[]` | Available for downstream wiring |

---

## Persistence Flow for UI Edits

```
User changes execution mode from serial → parallel in modal
    │
    ├── Click [Save]
    │
    ├── Server action: updateNodeConfig(ctx, graphSlug, nodeId, changes)
    │   ├── Read current node.yaml
    │   ├── Merge changes into orchestratorSettings
    │   ├── Write updated node.yaml
    │   └── Return updated NodeConfig
    │
    ├── UI updates node card (context badge changes from 🔵 to 🟢)
    │
    └── SSE broadcast → other clients refresh
```

### Required API Addition

The current `IPositionalGraphService` may need a method for updating node config:

```typescript
// Check if this already exists
updateNodeConfig(
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string,
  updates: Partial<NodeConfig>
): Promise<UpdateNodeResult>
```

If not, the alternative is to use the existing property-level setters:
- `setNodeDescription(ctx, graphSlug, nodeId, description)`
- Node orchestrator settings may need a new setter method

---

## Open Questions

### Q1: Should the properties bag be exposed in the UI?

**RESOLVED**: Yes, as an "Advanced" section with a JSON editor. Most users won't need it, but power users can store custom metadata (e.g., cost budgets, retry limits) that future orchestration features can read.

### Q2: Can we edit unit.yaml from the UI?

**RESOLVED**: No. Unit definitions are immutable from the workflow page perspective. To change a unit, users edit the source files and run `cg template refresh`. This maintains the clean separation between reusable definitions and per-instance configuration.

### Q3: What happens if a unit adds new inputs after template refresh?

**OPEN**: After refresh, a unit might define new input ports that the node.yaml doesn't wire. The UI should detect unwired required inputs and show a warning badge on affected nodes. This is a future enhancement — for now, `collateInputs()` already reports `error` status for unwired required inputs.

---

## Summary

The per-instance config problem is **already solved** by the node.yaml / unit.yaml two-layer architecture. `orchestratorSettings` (execution mode, context sharing, parallel) live on `node.yaml` — unique per node instance, preserved through template refresh. The UI modal edits node.yaml fields only. Unit definitions are read-only from the workflow page. No schema changes or new storage patterns needed.
