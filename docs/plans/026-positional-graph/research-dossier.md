# Research Report: Positional Graph — Replacing the DAG Model

**Generated**: 2026-01-31T06:25:00Z
**Research Query**: "WorkGraph DAG replacement with positional graph — sequential lines/rows/buckets"
**Mode**: Plan-Associated (branch 026-positional-graph)
**Location**: docs/plans/026-positional-graph/research-dossier.md
**FlowSpace**: Available
**Findings**: 65 findings from 7 parallel subagents

## Executive Summary

### What It Does
The current WorkGraph system is a **DAG-based workflow engine** that manages work units (AgentUnit, CodeUnit, UserInputUnit) as nodes in a directed acyclic graph. Nodes are linked by explicit edges (`{from, to}`), data flows through explicit input mappings, and execution order is determined by edge traversal. The system spans CLI, web UI (React Flow), and a service layer with filesystem-based persistence.

### Business Purpose
WorkGraph enables multi-step agent orchestration — a user defines a pipeline of AI agents and code tasks, each consuming the output of predecessors. The DAG model was chosen as a step up from the legacy linear phase-based system (Plan 003), but it has accumulated friction: manual edge wiring in the UI, a 5-layer connection data flow, the "no merging" constraint, and the start node bootstrap problem.

### Key Insights
1. **The DAG model's limitations are already being felt** — Plan 022 (UI) had to bolt on `addUnconnectedNode` and `connectNodes` to support drag-drop, and diamond dependencies already work in tests despite being a documented v1 non-goal
2. **A positional model eliminates 3 entire subsystems**: cycle detection, edge-based validation, and the dual add-node API — while making diamond dependencies and parallel execution natural
3. **The core data flow mechanism (named inputs/outputs) can be preserved** — what changes is how inputs are resolved (from "follow edge to specific node" to "look in preceding row/bucket")
4. **15 prior learnings from 6 completed plans** provide institutional knowledge that directly informs the redesign

### Quick Stats
- **Components**: ~30 source files, 3 core services (WorkGraphService 1388 LOC, WorkNodeService 1980 LOC, WorkUnitService 474 LOC)
- **Dependencies**: 20+ files import from `@chainglass/workgraph`; consumers span CLI, web API, web UI, and tests
- **Test Coverage**: 17 test files (4 unit backend, 3 contract, 2 integration, 8 UI unit)
- **Complexity**: HIGH — `WorkGraphService` is a 1388-line God class mixing topology, persistence, status computation, and validation
- **Prior Learnings**: 15 relevant discoveries from plans 016, 017, 021, 022

---

## How It Currently Works

### Entry Points

| Entry Point | Type | Location | Purpose |
|------------|------|----------|---------|
| `cg wg create` | CLI | `apps/cli/src/commands/workgraph.command.ts` | Create graph with start node |
| `cg wg show` | CLI | Same file | Display tree view of graph |
| `cg wg status` | CLI | Same file | Show node statuses |
| `cg wg node add-after` | CLI | Same file | Add node with edge wiring |
| `cg wg node can-run` | CLI | Same file | Check if node is ready |
| `cg wg node start/end` | CLI | Same file | Execute node lifecycle |
| `GET /api/.../workgraphs` | API | `apps/web/app/api/workspaces/[slug]/workgraphs/route.ts` | List graphs |
| `GET /api/.../workgraphs/[slug]` | API | `apps/web/app/api/.../[graphSlug]/route.ts` | Get graph data |
| `POST /api/.../nodes` | API | `apps/web/app/api/.../nodes/route.ts` | Add node |
| `POST /api/.../edges` | API | `apps/web/app/api/.../edges/route.ts` | Connect nodes |
| WorkGraph Canvas | UI | `apps/web/src/features/022-workgraph-ui/workgraph-canvas.tsx` | Visual editor |

### Core Execution Flow

1. **Graph Creation** (`WorkGraphService.create()`, lines 122-173):
   - Creates `work-graph.yaml` with `nodes: ['start'], edges: []`
   - Creates `state.json` with `start` node marked `complete`
   - Creates `nodes/start/node.yaml`

2. **Node Addition** (`WorkGraphService.addNodeAfter()`, lines 532-701):
   - Validates graph exists, after-node exists
   - Loads WorkUnit definition for input/output declarations
   - Gets after-node's outputs via `getNodeOutputs()`
   - **Wires inputs by strict name matching** (output name must equal input name)
   - Generates unique node ID (`<unitSlug>-<hex3>`)
   - **Runs cycle detection** on proposed edges
   - Persists `node.yaml` with input mappings, updates `work-graph.yaml` edges

3. **Status Computation** (`WorkGraphService.status()`, lines 383-514):
   - Builds upstream map from edges: `Map<nodeId, upstreamNodeIds[]>`
   - For each node: stored status wins; otherwise computes `ready` (all upstream complete) or `pending`
   - Nodes with no incoming edges and no stored status = `disconnected`

4. **canRun Validation** (`WorkNodeService.canRun()`, lines 176-237):
   - Finds upstream nodes via `graph.edges.filter(e => e.to === nodeId).map(e => e.from)`
   - Returns `canRun: true` if all upstream nodes are `complete`
   - Returns `blockingNodes[]` listing what's not yet done

5. **Data Flow** (`WorkNodeService.getInputData()`, lines 815-965):
   - Reads `node.yaml` to find input mapping `{from: sourceNodeId, output: outputName}`
   - Reads source node's `data/data.json`, extracts `outputs[outputName]`
   - Returns the data value

### Data Flow Diagram
```
work-graph.yaml (topology)     state.json (runtime)     layout.json (UI positions)
  ├─ slug                        ├─ graph_status           ├─ version
  ├─ nodes: string[]             ├─ updated_at             ├─ nodes: {id: {position}}
  └─ edges: [{from, to}]        └─ nodes: {id: {status}}  └─ viewport

nodes/<nodeId>/
  ├─ node.yaml (config + input mappings)
  └─ data/
      ├─ data.json (outputs: {name: value})
      └─ outputs/<name>.md (file outputs)
```

### State Management

**Node Status (7 values, split computed vs stored):**

| Status | Type | Meaning |
|--------|------|---------|
| `pending` | Computed | Upstream not complete |
| `ready` | Computed | All upstream complete, can start |
| `disconnected` | Computed | No incoming edges |
| `running` | Stored | Work in progress |
| `waiting-question` | Stored | Agent asked question |
| `blocked-error` | Stored | Agent reported error |
| `complete` | Stored | Finished successfully |

**Transition path**: `pending` → `ready` → `running` → `complete` (with branches to `waiting-question` and `blocked-error`)

---

## Architecture & Design

### Component Map

```
packages/workgraph/src/
├── interfaces/
│   ├── workgraph-service.interface.ts  (GraphEdge, WorkGraphDefinition, IWorkGraphService)
│   ├── worknode-service.interface.ts   (IWorkNodeService)
│   └── workunit-service.interface.ts   (WorkUnit, InputDeclaration, OutputDeclaration)
├── services/
│   ├── workgraph.service.ts            (1388 LOC — topology, persistence, status, validation)
│   ├── worknode.service.ts             (1980 LOC — execution lifecycle, data flow)
│   ├── workunit.service.ts             (474 LOC — unit template management)
│   ├── cycle-detection.ts              (133 LOC — DFS 3-color cycle detection)
│   ├── node-id.ts                      (node ID generation <slug>-<hex3>)
│   ├── atomic-file.ts                  (temp-then-rename atomic writes)
│   └── bootstrap-prompt.ts             (agent execution prompt generation)
├── schemas/
│   ├── workgraph.schema.ts             (Zod: WorkGraphDefinition, GraphEdge, State)
│   ├── worknode.schema.ts              (Zod: NodeConfig, InputMapping, NodeData)
│   ├── workunit.schema.ts              (Zod: WorkUnit, IO declarations)
│   └── layout.schema.ts               (Zod: layout positions, viewport)
├── fakes/                              (3 fake service implementations for testing)
├── errors/                             (workgraph-errors.ts — E101-E149 error codes)
└── container.ts                        (DI registration: registerWorkgraphServices())
```

### Design Patterns Identified

1. **Result Monad** (PS-01): Every method returns `BaseResult` with `errors: ResultError[]`; empty = success
2. **DI Container with Factory Registration** (PS-02): tsyringe with `useFactory` pattern
3. **Implicit State Machine** (PS-03): 7-value `NodeStatus` with computed/stored split
4. **DFS Cycle Detection** (PS-04): 3-color marking at edge insertion time
5. **Filesystem Repository** (PS-05): Directory hierarchy with atomic writes
6. **Observer Pattern** (PS-06): UI instances emit `changed` events to subscribers
7. **Externally Orchestrated Execution** (PS-07): No auto-execution; orchestrator drives node lifecycle
8. **Schema-Driven Validation** (PS-09): Zod schemas as single source of truth, dual JSON Schema export
9. **Separated Layout Persistence** (PS-10): `layout.json` separate from `work-graph.yaml` and `state.json`

### System Boundaries
- **Internal**: `@chainglass/workgraph` package boundary with interface-based DI
- **External**: Filesystem-only persistence (no database, no cloud services)
- **UI Boundary**: `WorkGraphFlowData` serialized format between server and client

---

## Dependencies & Integration

### What This Depends On

| Dependency | Type | Purpose | Risk if Changed |
|------------|------|---------|-----------------|
| `@chainglass/shared` | Required | `BaseResult`, `IFileSystem`, `IPathResolver`, DI tokens | Medium |
| `@chainglass/workflow` | Required | `WorkspaceContext` type (first param on every method) | Medium |
| `zod` | Required | Schema definitions for all data types | Low |
| `@xyflow/react` | UI only | React Flow canvas rendering | High for UI |
| `tsyringe` | Required | DI container | Low |

### What Depends on This

- **CLI**: 19+ commands in `workgraph.command.ts`
- **Web API**: 4 route files (list, detail, nodes, edges)
- **Web UI**: 12 files in `022-workgraph-ui` feature module
- **Tests**: 17 test files across 3 test layers
- **Total**: 20+ direct consumers

### Agent Execution Integration
`WorkNodeService` drives agent execution through `canRun()` → `markReady()` → `start()` → `end()` lifecycle. `BootstrapPromptService` generates agent prompts based on unit definition and input wiring. The agent system's scheduling is entirely derived from DAG edge traversal.

---

## Quality & Testing

### Current Test Coverage

| Layer | Files | Coverage |
|-------|-------|----------|
| Unit (backend) | 4 | Cycle detection, node ID, container, workspace isolation |
| Contract | 3 | Service behavioral contracts (fake vs real parity) |
| Integration | 2 | Full lifecycle with real filesystem |
| Unit (UI) | 8 | Instance, service, flow hook, SSE, canvas, node, edge, toolbox |

### Known Issues & Technical Debt

| Issue | Severity | Location | Impact |
|-------|----------|----------|--------|
| `WorkGraphService` is 1388-line God class | Medium | `workgraph.service.ts` | Hard to modify |
| UI mutations are optimistic-only (no server persistence) | High | `workgraph-ui.instance.ts:407,479,530` | Data loss risk |
| DELETE edges returns 501 Not Implemented | Medium | `edges/route.ts:205` | Missing feature |
| Contract tests only run against fakes | Medium | `test/contracts/` | Fake drift undetected |
| No performance benchmarks | Low | N/A | No baseline for migration |
| Dual status computation (server + client) | Medium | Two implementations | Could diverge |
| `findPendingQuestionId()` uses sync `readFileSync` | Low | `worknode.service.ts:1370` | Blocking I/O |

---

## Modification Considerations

### What a Positional Graph Replaces

| Component | Current DAG Mechanism | Positional Replacement |
|-----------|----------------------|----------------------|
| `WorkGraphDefinition.edges` | `GraphEdge[]` with `{from, to}` | Ordered buckets/lines array |
| `detectCycle()` | DFS 3-color algorithm | **Removed** — sequential = acyclic by construction |
| `addNodeAfter()` | Creates edge, wires inputs | Place in bucket at position |
| `connectNodes()` | Creates explicit edge | **Removed** or repurposed |
| `canConnect()` | Edge compatibility + cycle check | Position-based compatibility only |
| `canRun()` | `edges.filter(e => e.to === nodeId)` | "All nodes in previous bucket complete" |
| `status()` upstream map | Built from `edges` array | Built from bucket positions |
| `getInputData()` | Follows `InputMapping.from` to source node | Reads from named outputs in preceding bucket |
| `findDependentNodes()` | `edges.filter(e => e.from === nodeId)` | Nodes in next bucket |
| `buildEdgesArray()` (UI) | Maps edges to React Flow edges | Generate from bucket adjacency |
| `start` sentinel node | Hardcoded as always-complete | **Removed** — first bucket IS the entry |

### Safe to Modify
- **Atomic file utilities** (`atomic-file.ts`): Reusable as-is
- **Node ID generation** (`node-id.ts`): Independent of graph topology
- **WorkUnit definitions**: IO declaration system unchanged
- **DI container structure**: Token pattern stable
- **SSE notification pattern**: Graph-model-agnostic
- **Result monad pattern**: Transport-level, no changes needed

### Danger Zones
- **`WorkGraphDefinition` type**: Exported everywhere, 20+ consumers
- **`GraphEdge` type**: The semantic core of the DAG model
- **`InputMapping` type**: Encodes explicit node-to-node data flow
- **`IWorkGraphService` API**: All 9 methods have CLI/API consumers
- **Fake implementations**: 3 fakes (1373 combined LOC) mirror production 1:1

---

## Prior Learnings (From Previous Implementations)

### Critical

**PL-01: Start Node Bootstrap Problem** (Plan 016, Phase 3)
- The start node must be `complete` at creation but `status()` computes from upstream
- *Action*: The positional graph can eliminate START entirely — first bucket IS the entry point

**PL-02: Strict Name Matching for Input Wiring** (Plan 016, Phase 4)
- Output `text` wires to input `text`, but `text` → `topic` fails (E103)
- *Action*: Decide whether positional graph uses name matching or positional availability (all outputs from prior bucket)

**PL-03: First Node After START Must Have No Required Inputs** (Plan 016, Phase 4)
- Adding a node after START fails if the unit has required inputs
- *Action*: Positional graph eliminates this — bucket 0 is the natural input bucket

### Decisions

**PL-04: Cycle Detection Unnecessary** — Sequential ordering guarantees acyclicity
**PL-06: Unified CLI/UI Add-Node API** — Both specify position, not "after" relationships
**PL-07: Disconnected Nodes** — Decide if all nodes must be in a bucket or if staging is needed
**PL-13: Direct Output Pattern** — Support PENDING → COMPLETE for data-only nodes
**PL-14: Backend-First Validation** — Put all rules in service layer, UI is thin wrapper
**PL-15: Phased Interfaces** — Define `IPositionalGraphCore` (read-only) then extend with mutations

### Gotchas to Preserve

**PL-09: Change Detection** — `refresh()` must compare before/after, only emit on actual change
**PL-10: Dispose Guard** — Check `isDisposed` before AND after async operations
**PL-11: Workspace-Scoped Paths** — All storage via `WorkspaceContext`, dual-path pattern
**PL-12: Atomic File Writes** — Reuse `atomicWriteFile()` / `atomicWriteJson()`

### Prior Learnings Summary

| ID | Type | Source Plan | Key Insight | Action |
|----|------|-------------|-------------|--------|
| PL-01 | critical | 016 | Start node bootstrap problem | Eliminate START; first bucket is entry |
| PL-02 | critical | 016 | Strict name matching for wiring | Decide: name match vs positional availability |
| PL-03 | critical | 016 | First node can't have required inputs | First bucket handles this naturally |
| PL-04 | decision | 016 | Cycle detection exists | Drop entirely — sequential = acyclic |
| PL-05 | insight | 016 | Special nodes concept | Map to "bucket types" instead |
| PL-06 | decision | 022 | Dual add-node API (CLI vs UI) | Unify: both specify (bucket, slot) |
| PL-07 | decision | 022 | Disconnected nodes for experimentation | Decide: staging area or always-positioned? |
| PL-08 | insight | 022 | Position as layout vs semantics | Position IS the topology, not just rendering |
| PL-09 | gotcha | 022 | Render thrashing without change detection | Preserve emit-only-on-change pattern |
| PL-10 | gotcha | 022 | Async dispose race condition | Include `isDisposed` guard from start |
| PL-11 | arch | 021 | Workspace-scoped storage paths | Use `WorkspaceContext` from day one |
| PL-12 | arch | 016 | Atomic file writes prevent corruption | Reuse `atomic-file.ts` utilities |
| PL-13 | decision | 017 | end() from PENDING for data-only nodes | Support passive completion |
| PL-14 | decision | 022 | UI should be thin wrapper | All validation in service layer |
| PL-15 | decision | 022 | Phased interfaces prevent surprises | Core read-only first, mutations second |

---

## Critical Discoveries

### Discovery 01: Diamond Dependencies Already Work
**Impact**: Critical
**Source**: DE-07 (Plan 022 documentation), QT-03 (test analysis)
**What**: Despite Plan 016 explicitly listing "no merging (diamond patterns)" as a v1 limitation, the Plan 022 UI already handles diamond dependencies. Tests pass for diamond dependency status computation. The codebase has already outgrown the original DAG constraint.
**Why It Matters**: This validates the positional graph direction — the team was already pushing past the single-predecessor rule.

### Discovery 02: Position Merges Layout and Topology
**Impact**: Critical
**Source**: PS-10, PL-08
**What**: Currently, position (`layout.json`) is purely visual while topology (`work-graph.yaml` edges) determines execution order. In a positional graph, position IS topology. This is a fundamental paradigm shift: the x,y coordinates on screen literally define data flow.
**Required Action**: The new schema must treat position as a first-class semantic concept. `layout.json` simplifies to viewport-only; bucket/line ordering lives in the graph definition.

### Discovery 03: The 5-Layer Connection Bug
**Impact**: High
**Source**: DE-07 (node connection workshop)
**What**: The current UI→API→backend connection flow has 5 layers and a documented bug where empty handle names break validation. The positional graph completely eliminates explicit connections, removing this entire failure mode.

### Discovery 04: No Prior ADR for Graph Model
**Impact**: Medium
**Source**: DE-08
**What**: The DAG model was adopted without a formal ADR. The ADR seeds in Plan 016 spec were never promoted. A positional graph redesign should produce a formal ADR documenting why the change was made.

---

## External Research Opportunities

### Research Opportunity 1: Positional/Sequential Graph Models in Workflow Systems

**Why Needed**: The codebase has no prior art for positional graph models. The team needs to understand how other workflow engines handle sequential/bucket-based execution models.
**Impact on Plan**: Directly informs the naming convention (line/row/bucket/stage/lane) and the data flow model.
**Source Findings**: DE-10 (no prior discussion of alternatives), PS-08 (naming needs)

**Ready-to-use prompt:**
```
/deepresearch "Explore how production workflow engines implement sequential/positional execution models (as opposed to explicit DAG edges). Specifically:

CONTEXT: We have a TypeScript-based workflow engine that currently uses explicit directed edges between nodes. We want to replace this with a 'positional graph' where nodes are organized into ordered rows/lines/buckets, and data flows positionally (from row N to row N+1) rather than through explicit edges.

RESEARCH QUESTIONS:
1. What naming conventions do workflow tools use for sequential groupings? (stages, lanes, phases, rows, buckets, tiers, layers, swim lanes)
2. How do systems like GitHub Actions (jobs matrix), Azure DevOps pipelines (stages), Tekton (tasks in pipelines), and Argo Workflows handle positional/sequential execution?
3. How do these systems handle data flow between sequential stages — implicit (all outputs available) vs explicit (declare dependencies)?
4. How do they handle parallel execution within a stage?
5. What are the trade-offs of positional-only vs hybrid (position + optional explicit links)?
6. How do they handle 'fan-out' patterns where one stage feeds multiple next stages?

STACK: TypeScript, filesystem-based persistence (YAML/JSON), React Flow UI, Node.js
OUTPUT: Comparative analysis with recommendations for our naming and data flow model"
```

**Results location**: Save results to `docs/plans/026-positional-graph/external-research/positional-graph-models.md`

### Research Opportunity 2: React Flow Grid/Lane Layout Patterns

**Why Needed**: The current UI uses React Flow with free-form directed edges. A positional graph needs a grid/lane/swimlane layout instead.
**Impact on Plan**: Determines whether React Flow can be adapted or needs replacement.
**Source Findings**: DC-07 (UI consumption pattern), IC-08 (serialization contracts)

**Ready-to-use prompt:**
```
/deepresearch "How to implement grid-based, lane-based, or swimlane layouts in React Flow (@xyflow/react).

CONTEXT: We have a React Flow canvas that currently renders a DAG with explicit directed edges. We're moving to a 'positional graph' where nodes are organized into horizontal rows (like swimlanes or pipeline stages). Each row contains 1+ nodes that execute left-to-right or in parallel.

RESEARCH QUESTIONS:
1. Does React Flow support lane/swimlane/grid layouts natively or via plugins?
2. What's the best approach for rendering sequential rows with optional visual connectors between them?
3. How to handle node drag-drop within constrained rows (horizontal only within a row, can move between rows)?
4. Are there React Flow examples of pipeline/stage-based visualizations?
5. Should we use React Flow's sub-flows or grouping features for rows?
6. Alternative libraries optimized for lane-based workflow visualization?

STACK: React 19, @xyflow/react, TypeScript, Next.js 16
OUTPUT: Implementation approach with code examples"
```

**Results location**: Save results to `docs/plans/026-positional-graph/external-research/react-flow-grid-layout.md`

---

## Appendix: File Inventory

### Core Files (packages/workgraph/src/)

| File | Purpose | Lines |
|------|---------|-------|
| `services/workgraph.service.ts` | Graph CRUD, topology, status computation | 1388 |
| `services/worknode.service.ts` | Node execution lifecycle, data flow | 1980 |
| `services/workunit.service.ts` | Unit template management | 474 |
| `services/cycle-detection.ts` | DFS cycle detection | 133 |
| `services/node-id.ts` | Node ID generation | ~80 |
| `services/atomic-file.ts` | Atomic file writes | 57 |
| `services/bootstrap-prompt.ts` | Agent prompt generation | ~200 |
| `interfaces/workgraph-service.interface.ts` | Graph types and API contract | 384 |
| `interfaces/worknode-service.interface.ts` | Node types and API contract | 260 |
| `interfaces/workunit-service.interface.ts` | Unit types and API contract | 141 |
| `schemas/workgraph.schema.ts` | Zod schemas for graph/state | 106 |
| `schemas/worknode.schema.ts` | Zod schemas for node config/data | ~115 |
| `schemas/workunit.schema.ts` | Zod schemas for unit definitions | ~100 |
| `schemas/layout.schema.ts` | Zod schemas for UI layout | 141 |
| `container.ts` | DI registration | ~130 |
| `errors/workgraph-errors.ts` | Error factory functions E101-E149 | ~150 |
| `fakes/fake-workgraph-service.ts` | Test fake | 464 |
| `fakes/fake-worknode-service.ts` | Test fake | 909 |
| `fakes/fake-workunit-service.ts` | Test fake | 238 |

### UI Files (apps/web/src/features/022-workgraph-ui/)

| File | Purpose |
|------|---------|
| `workgraph-ui.types.ts` | UI type definitions |
| `workgraph-ui.instance.ts` | Client-side graph model |
| `workgraph-ui.service.ts` | Caching service |
| `use-workgraph-flow.ts` | React Flow data transformation |
| `use-workgraph-api.ts` | API mutation hooks |
| `use-workgraph-sse.ts` | Real-time SSE updates |
| `workgraph-canvas.tsx` | React Flow canvas component |
| `workgraph-node.tsx` | Custom node component |
| `workunit-toolbox.tsx` | Draggable unit toolbox |
| `status-indicator.tsx` | Status badge component |
| `drop-handler.ts` | Drag-drop coordinate conversion |
| `sse-broadcast.ts` | Server-side SSE broadcasting |
| `fake-workgraph-ui-instance.ts` | UI test fake |
| `fake-workgraph-ui-service.ts` | UI test fake |

### Test Files (17)

| Layer | File |
|-------|------|
| Unit | `test/unit/workgraph/cycle-detection.test.ts` (375 lines) |
| Unit | `test/unit/workgraph/node-id.test.ts` (249 lines) |
| Unit | `test/unit/workgraph/container-registration.test.ts` |
| Unit | `test/unit/workgraph/fake-workspace-isolation.test.ts` |
| Contract | `test/contracts/workgraph-service.contract.test.ts` |
| Contract | `test/contracts/worknode-service.contract.test.ts` |
| Contract | `test/contracts/workunit-service.contract.test.ts` |
| Integration | `test/integration/workgraph/workgraph-lifecycle.test.ts` |
| Integration | `test/integration/workgraph/workunit-lifecycle.test.ts` |
| UI Unit | `test/unit/web/features/022-workgraph-ui/workgraph-ui.instance.test.ts` |
| UI Unit | `test/unit/web/features/022-workgraph-ui/workgraph-ui.service.test.ts` |
| UI Unit | `test/unit/web/features/022-workgraph-ui/use-workgraph-flow.test.ts` |
| UI Unit | `test/unit/web/features/022-workgraph-ui/use-workgraph-sse.test.ts` |
| UI Unit | `test/unit/web/features/022-workgraph-ui/workgraph-node.test.tsx` |
| UI Unit | `test/unit/web/features/022-workgraph-ui/workgraph-canvas.test.tsx` |
| UI Unit | `test/unit/web/features/022-workgraph-ui/edge-connection.test.ts` |
| UI Unit | `test/unit/web/features/022-workgraph-ui/workunit-toolbox.test.tsx` |

---

## Next Steps

**External Research Opportunities identified (2):**
1. Positional/Sequential Graph Models in Workflow Systems — run `/deepresearch` prompt above
2. React Flow Grid/Lane Layout Patterns — run `/deepresearch` prompt above

**After External Research (or skipping):**
- Run `/plan-1b-specify "positional graph"` to create specification
- Unresolved research opportunities will be noted as soft warnings

---

**Research Complete**: 2026-01-31T06:25:00Z
**Report Location**: docs/plans/026-positional-graph/research-dossier.md
