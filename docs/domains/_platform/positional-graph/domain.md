# Domain: Positional Graph

**Slug**: `_platform/positional-graph`
**Type**: infrastructure
**Created**: 2026-02-25
**Created By**: extracted from existing codebase (Plan 048)
**Status**: active

## Purpose

Core graph engine that powers the line-based workflow execution system. Owns the positional graph database (structure, state, persistence), the node execution state machine, the orchestration loop (Reality/ONBAS/ODS/drive), the node event system, and work unit loading. Provides the runtime for all agentic workflow execution — without this domain, no workflows can run.

## Boundary

### Owns

- Graph structure: lines, nodes, topology, metadata, properties
- Graph state persistence: state.json read/write, atomic file operations
- Node execution lifecycle: starting → agent-accepted → waiting-question → complete (and error/restart branches)
- Input resolution algorithm: literal, from-previous, from-data, from-file resolution modes
- Orchestration subsystem: Reality snapshots, ONBAS (pure decisions), ODS (fire-and-forget launch), `run()` single-pass, `drive()` persistent loop
- Node event system: raise, handle, stamp events; event type registry; event handler registry; core event types
- Work unit loading and validation (positional-graph's own IWorkUnitService variant)
- Pod management: AgentPod, CodePod, PodManager, session lifecycle
- Agent context: execution context provided to agents during node execution
- Script runner: code node execution
- Graph inspection: rich graph structure introspection (Plan 040)
- ID generation: node IDs, line IDs, event IDs
- Error codes: E150-E179 (positional graph), E180-E189 (work units)

### Does NOT Own

- Workflow template registry and lifecycle — belongs to `@chainglass/workflow` package (not yet a formalized domain)
- Workspace context resolution — belongs to `@chainglass/workflow` package
- Legacy graph CRUD wrapper — belongs to `_platform/workgraph` domain (deprecated)
- CLI command presentation — Consumer domain per ADR-0012
- Web UI presentation — Consumer domain per ADR-0012
- Agent instance management (IAgentInstance, IAgentManagerService) — Agent domain per ADR-0012
- Filesystem abstraction (IFileSystem, IPathResolver) — `_platform/file-ops` domain

## Contracts (Public Interface)

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `IPositionalGraphService` | Interface | CLI (`cg wf` commands), dev/test-graphs, tests | Primary graph CRUD, status, state, node/line operations, input wiring, output storage, Q&A protocol |
| `IOrchestrationService` | Interface | CLI (`cg wf` container), tests | DI-registered factory — returns per-graph `IGraphOrchestration` handles |
| `IGraphOrchestration` | Interface | CLI (`cg wf drive` handler), tests | Per-graph orchestration handle with `run()` and `drive()` |
| `IEventHandlerService` | Interface | CLI (`cg wf` container), tests | Node event handling, routing, and settle-phase processing |
| `INodeEventService` | Interface | Internal (orchestration), tests | Event store — persist, query, stamp node events |
| `IWorkUnitService` | Interface | CLI (`cg wf` container), tests | Work unit loading, listing, type resolution (positional-graph variant) |
| `IWorkUnitLoader` | Interface | Internal (graph service), tests | Narrow interface for work unit existence validation during addNode |
| `IScriptRunner` | Interface | Internal (ODS), tests | Code node execution contract |
| `registerPositionalGraphServices()` | Function | CLI (`cg wf` container), web (di-container) | DI registration for all positional-graph services |
| `registerOrchestrationServices()` | Function | CLI (`cg wf` container) | DI registration for orchestration subsystem |
| `POSITIONAL_GRAPH_DI_TOKENS` | Constants | CLI, web, tests | DI token namespace (defined in @chainglass/shared) |
| `ORCHESTRATION_DI_TOKENS` | Constants | CLI, tests | DI token namespace for orchestration services |

## Composition (Internal)

| Component | Role | Depends On |
|-----------|------|------------|
| `PositionalGraphService` | Core engine — graph CRUD, status, state, lifecycle | PositionalGraphAdapter, IFileSystem, IPathResolver, IYamlParser |
| `PositionalGraphAdapter` | Filesystem persistence — load/save graph definitions | IFileSystem, IPathResolver |
| `InputResolution` | Resolve node inputs from various sources | PositionalGraphService (state reads) |
| `OrchestrationService` | Factory for per-graph orchestration handles | PositionalGraphService, ODS, ONBAS, PodManager |
| `GraphOrchestration` | Per-graph orchestration loop (settle→decide→act) | PositionalGraphService, EventHandlerService, ONBAS, ODS |
| `ODS` | Orchestration Dispatch — fire-and-forget launch | PodManager, AgentContext |
| `ONBAS` | Next-Best-Action decisions — pure, stateless | Reality snapshot (read-only) |
| `PodManager` | Pod lifecycle management | AgentPod, CodePod, ScriptRunner |
| `NodeEventService` | Event store — persist, query, stamp | IFileSystem (state.json) |
| `EventHandlerService` | Event routing and handler invocation | NodeEventService, EventHandlerRegistry |
| `NodeEventRegistry` | Event type definitions and validation | Core event types |
| `WorkUnitService` (029) | Work unit loading and validation | WorkUnitAdapter, Zod schemas |
| `WorkUnitAdapter` (029) | Filesystem loading of unit.yaml | IFileSystem, IPathResolver |
| `InspectService` (040) | Rich graph introspection | PositionalGraphService |

## Source Location

Primary: `packages/positional-graph/src/`

| File/Area | Role | Notes |
|-----------|------|-------|
| `packages/positional-graph/src/services/` | Core services (graph engine, input resolution, ID gen, atomic writes) | 4 files |
| `packages/positional-graph/src/interfaces/` | Master service interface | IPositionalGraphService (~50 methods) |
| `packages/positional-graph/src/schemas/` | Graph, node, state, properties, enums, orchestrator-settings | 6 files, Zod source of truth |
| `packages/positional-graph/src/adapter/` | Filesystem persistence adapter | Reads/writes .chainglass/data/workflows/ |
| `packages/positional-graph/src/features/029-agentic-work-units/` | WorkUnit types, schema, service, adapter, classes, fakes | 8+ files |
| `packages/positional-graph/src/features/030-orchestration/` | Orchestration, ODS, ONBAS, Reality, Pods, Agent context, Script runner | ~30 files |
| `packages/positional-graph/src/features/032-node-event-system/` | Event service, handler, registry, schemas, core types, fakes | ~20 files |
| `packages/positional-graph/src/features/040-graph-inspect/` | Graph inspection and formatting | 4 files |
| `packages/positional-graph/src/errors/` | Error codes and factories | E150-E189 |
| `packages/positional-graph/src/container.ts` | DI registration functions | Wires all services |
| `packages/positional-graph/src/index.ts` | Barrel exports | Public API surface |

## Dependencies

### This Domain Depends On

| Domain/Package | What It Consumes | Notes |
|---------------|-----------------|-------|
| `_platform/file-ops` (via @chainglass/shared) | `IFileSystem`, `IPathResolver` | All disk I/O for graph state, unit loading |
| `@chainglass/shared` | `IYamlParser`, DI tokens, Result types, logging | Foundation utilities |
| `@chainglass/workflow` (not yet a domain) | `WorkspaceContext` type | Passed as first param to all service methods |

### Domains That Depend On This

| Consumer | What It Consumes | Notes |
|----------|-----------------|-------|
| CLI (`apps/cli/`) | `IPositionalGraphService`, `IOrchestrationService`, `IEventHandlerService`, `IWorkUnitService` | `cg wf` commands + `cg wf drive` handler |
| Web UI (feature 022) | Via API routes that resolve graph services | workgraph-ui components (not yet a formalized domain) |
| dev/test-graphs | `IPositionalGraphService` | Test fixture infrastructure |
| Test suite | All interfaces | 80+ test files across unit/integration/e2e |

## History

| Plan | What Changed | Date |
|------|-------------|------|
| 026 | Positional graph model — line-based topology, input resolution, 4-gate algorithm | 2025 |
| 029 | Agentic work units — discriminated union types, reserved params | 2025 |
| 030 | Positional orchestrator — Reality, ONBAS, ODS, pod lifecycle | 2025 |
| 032 | Node event system — event types, handlers, settle phase | 2025 |
| 034 | Agentic CLI — agent redesign, manager service | 2025 |
| 036 | CLI orchestration driver — `cg wf run` command, drive loop | 2025-2026 |
| 040 | Graph inspect CLI — graph introspection commands | 2026 |
| 048 | Domain extracted from existing codebase | 2026-02-25 |
