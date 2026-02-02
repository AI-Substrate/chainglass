# Positional Graph — Overview

The positional graph is an alternative workflow model where topology is implicit from the ordering of lines, rather than explicit edges. Nodes are placed into ordered lines, and data flows from preceding lines to subsequent lines through named input resolution.

## Core Concepts

### Lines

Lines are ordered containers for nodes. Each line has:

- **ID**: Auto-generated hex identifier (e.g., `line-a4f`)
- **Label**: Optional human-readable name
- **Description**: Optional text describing the line's purpose
- **Transition**: `auto` (default) or `manual` — controls whether the next line's nodes can start automatically when this line completes

Lines are ordered by index (0, 1, 2, ...). Line 0 is always first. Operations like `addLine`, `moveLine`, and `removeLine` maintain this ordering.

### Nodes

Nodes represent work units placed at specific positions within a line. Each node has:

- **ID**: Auto-generated from the unit slug + hex suffix (e.g., `sample-coder-a3f`)
- **Unit slug**: References the WorkUnit definition that describes the node's inputs, outputs, and behavior
- **Execution mode**: `serial` (default) or `parallel` — serial nodes wait for their left neighbor to complete; parallel nodes can start as soon as the line is eligible
- **Position**: Zero-based index within the line

Multiple nodes of the same unit type can exist in the same line (e.g., two `research-concept` nodes).

### Positions and Topology

Position determines execution order and data flow:

- **Within a line**: Left-to-right order (position 0, 1, 2, ...) determines serial execution order
- **Between lines**: Line index determines precedence — line 0 precedes line 1, which precedes line 2
- **No explicit edges**: Topology is entirely determined by line ordering and node positions

This eliminates cycle detection, edge arrays, and the start node bootstrap that exist in the DAG model.

## Data Model

All positional graph data is stored under:

```
<worktree>/.chainglass/data/workflows/<graph-slug>/
  graph.yaml          # Graph structure (lines, nodes)
  state.json          # Runtime state (node completion, transitions)
  nodes/
    <node-id>/
      node.yaml       # Node configuration (unit, execution, inputs)
      data/
        data.json     # Output data from completed nodes
```

### graph.yaml

Defines the graph structure — version, description, and ordered lines with their node arrays:

```yaml
version: "1.0"
description: "Research pipeline"
created_at: "2026-02-01T12:00:00.000Z"
lines:
  - id: line-a4f
    label: "Input"
    transition: auto
    nodes:
      - sample-input-b2c
  - id: line-c8d
    label: "Processing"
    transition: manual
    nodes:
      - sample-coder-e1f
      - sample-reviewer-g3h
```

### node.yaml

Per-node configuration including unit reference, execution mode, and input wiring:

```yaml
unit_slug: sample-coder
execution: serial
description: "Generates code from spec"
inputs:
  spec:
    from_unit: sample-input
    from_output: spec
  config:
    from_node: config-node-a1b
    from_output: settings
```

### state.json

Runtime state tracking node completion and transition triggers:

```json
{
  "graph_status": "in_progress",
  "updated_at": "2026-02-01T12:05:00.000Z",
  "nodes": {
    "sample-input-b2c": {
      "status": "complete",
      "completed_at": "2026-02-01T12:03:00.000Z"
    }
  },
  "transitions": {
    "line-a4f": {
      "triggered": true,
      "triggered_at": "2026-02-01T12:04:00.000Z"
    }
  }
}
```

## Input Resolution

Nodes declare inputs that are wired to outputs from other nodes. Two wiring modes:

### from_unit (Named Resolution)

Searches backward through the graph for all nodes matching the specified unit slug:

1. Same line, positions earlier than the current node (left to right)
2. Preceding lines, nearest first (each line left to right)

All matching nodes are collected — this is the "collect-all" pattern. If the consumer needs data from multiple producers of the same type, all are gathered.

### from_node (Explicit Reference)

Targets a specific node by ID. The node must be in scope (same line earlier position, or any preceding line). Forward references resolve as `waiting`, not as errors.

### Resolution States

Each input resolves to one of three states:

- **available**: All source nodes are complete and their output data is accessible
- **waiting**: Source nodes exist but haven't completed yet
- **error**: Wiring problem (e.g., output not declared on source unit's WorkUnit definition)

The `InputPack.ok` flag is `true` when every **required** input has status `available`. Optional unwired inputs are omitted from the result.

## Readiness (canRun)

A node can run when it passes all four gates in order:

1. **Preceding lines complete**: All nodes on every preceding line must be complete
2. **Transition gate open**: If the immediately preceding line has `transition: manual`, its transition must be triggered
3. **Serial neighbor complete**: If the node has `execution: serial` and isn't at position 0, its left neighbor must be complete
4. **Inputs available**: `collateInputs.ok` must be true (all required inputs resolved)

The algorithm short-circuits on the first failing gate, providing a clear reason for why a node can't run.

## Comparison with DAG Model

| Aspect | DAG (WorkGraph) | Positional Graph |
|--------|-----------------|------------------|
| Topology | Explicit edges, cycle detection | Implicit from line ordering |
| Parallel execution | Requires edge management | Place nodes on same line |
| Data flow | Follow directed edges | Backward search by name |
| Flow control | Start node, edge traversal | Line transitions (auto/manual) |
| Diamond dependencies | Constrained ("no merging") | Natural via collect-all resolution |
| Mental model | Wire nodes with edges | Drop nodes into ordered lines |

## Key Design Decisions

- **No cycle detection needed**: Line ordering prevents cycles by construction
- **No start node**: Line 0 nodes are naturally ready (no predecessors)
- **Transition on lines, not nodes**: Flow control is a property of the boundary between lines
- **Serial default**: Nodes execute in order unless explicitly marked parallel
- **Collect-all resolution**: `from_unit` gathers all matching predecessors, supporting fan-in patterns naturally

## Package Structure

The positional graph lives in `packages/positional-graph/` with:

- `src/schemas/` — Zod schemas for graph.yaml, node.yaml, state.json
- `src/services/` — `PositionalGraphService` (CRUD + input resolution + status)
- `src/adapter/` — `PositionalGraphAdapter` (filesystem signpost + lifecycle)
- `src/interfaces/` — `IPositionalGraphService`, result types, `IWorkUnitLoader`
- `src/errors/` — Error factories (E150-E171)

CLI commands are registered under `cg wf` in `apps/cli/`. See [2-cli-usage.md](./2-cli-usage.md) for command reference.
