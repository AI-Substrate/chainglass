# Domain: Positional Graph

**Slug**: `_platform/positional-graph`
**Type**: infrastructure
**Created**: 2026-02-25
**Created By**: extracted from existing codebase (Plan 048)
**Status**: active
**C4 Diagram**: [C4 Component](../../../c4/components/_platform/positional-graph.md)

## Purpose

Core graph engine that powers the line-based workflow execution system. Owns the positional graph database (structure, state, persistence), the node execution state machine, the orchestration loop (Reality/ONBAS/ODS/drive), the node event system, and work unit loading. Provides the runtime for all agentic workflow execution — without this domain, no workflows can run.

## Boundary

### Owns

- Workflow template and instance lifecycle: saveFrom, instantiate, refresh, status queries (via `@chainglass/workflow` package, Plan 048)
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

- Legacy workflow system (wf.yaml, phases, checkpoints, runs) — being removed
- Workspace context resolution — belongs to `@chainglass/workflow` package (shared utility, not template-specific)
- Workspace context resolution — belongs to `@chainglass/workflow` package
- Legacy graph CRUD wrapper — belongs to `_platform/workgraph` domain (deprecated)
- CLI command presentation — Consumer domain per ADR-0012
- Web UI presentation — Consumer domain per ADR-0012
- Agent instance management (IAgentInstance, IAgentManagerService) — Agent domain per ADR-0012
- Filesystem abstraction (IFileSystem, IPathResolver) — `_platform/file-ops` domain

## Contracts (Public Interface)

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `IPositionalGraphService` | Interface | CLI (`cg wf` commands), dev/test-graphs, tests | Primary graph CRUD, status, state, node/line operations, input wiring, output storage, node events/orchestration core |
| `IOrchestrationService` | Interface | CLI (`cg wf` container), tests | DI-registered factory — returns per-graph `IGraphOrchestration` handles |
| `IGraphOrchestration` | Interface | CLI (`cg wf drive` handler), tests | Per-graph orchestration handle with `run()` and `drive()` |
| `IEventHandlerService` | Interface | CLI (`cg wf` container), tests | Node event handling, routing, and settle-phase processing |
| `INodeEventService` | Interface | Internal (orchestration), tests | Event store — persist, query, stamp node events |
| `IWorkUnitService` | Interface | CLI (`cg wf` container), tests | Work unit loading, listing, type resolution (positional-graph variant) |
| `IWorkUnitLoader` | Interface | Internal (graph service), tests | Narrow interface for work unit existence validation during addNode |
| `IScriptRunner` | Interface | Internal (ODS), tests | Code node execution contract |
| `ITemplateService` | Interface | CLI (`cg template`), web, tests | Template CRUD — saveFrom, listWorkflows, showWorkflow, instantiate, listInstances, refresh (Plan 048) |
| `IInstanceService` | Interface | CLI, web, tests | Instance status queries — getStatus (Plan 048) |
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
| `OrchestrationService` | Factory for per-graph orchestration handles | PositionalGraphService, ONBAS, EHS, createPerHandleDeps factory |
| `GraphOrchestration` | Per-graph orchestration loop (settle→decide→act), abort-aware | PositionalGraphService, EventHandlerService, ONBAS, ODS, abortableSleep |
| `ODS` | Orchestration Dispatch — fire-and-forget launch | PodManager, AgentContext |
| `ONBAS` | Next-Best-Action decisions — pure, stateless | Reality snapshot (read-only) |
| `PodManager` | Pod lifecycle management | AgentPod, CodePod, ScriptRunner |
| `NodeEventService` | Event store — persist, query, stamp | IFileSystem (state.json) |
| `EventHandlerService` | Event routing and handler invocation | NodeEventService, EventHandlerRegistry |
| `NodeEventRegistry` | Event type definitions and validation | Core event types |
| `WorkUnitService` (029) | Work unit loading and validation | WorkUnitAdapter, Zod schemas |
| `WorkUnitAdapter` (029) | Filesystem loading of unit.yaml | IFileSystem, IPathResolver |
| `InspectService` (040) | Rich graph introspection | PositionalGraphService |
| `TemplateManifestSchema` | Template directory validation (Plan 048) | Zod, `z.infer<>` |
| `InstanceMetadataSchema` | Instance.yaml validation (Plan 048) | Zod, `z.infer<>` |
| `FakeTemplateService` | Test double for ITemplateService (Plan 048) | Call tracking + return builders |
| `FakeInstanceService` | Test double for IInstanceService (Plan 048) | Call tracking + return builders |
| `TemplateService` | Real ITemplateService — saveFrom, list, show, instantiate, listInstances, refresh (Plan 048 Phase 2) | IFileSystem, IPathResolver, IYamlParser, TemplateAdapter, InstanceAdapter |
| `TemplateAdapter` | Filesystem path resolution for templates at .chainglass/templates/workflows/ (Plan 048 Phase 2) | IFileSystem, IPathResolver |
| `InstanceAdapter` | Filesystem path resolution for instances at .chainglass/instances/ (Plan 048 Phase 2) | IFileSystem, IPathResolver |
| `InstanceWorkUnitAdapter` | IWorkUnitLoader for instance-local unit resolution (Plan 048 Phase 2) | IFileSystem, IPathResolver, IYamlParser, basePath |
| `InstanceGraphAdapter` | PositionalGraphAdapter scoped to one instance path (Plan 048 Phase 3) | IFileSystem, IPathResolver, instancePath |
| `FakePositionalGraphService` | Test double for IPositionalGraphService (Plan 050) | Call tracking + return builders |

## Source Location

Primary: `packages/positional-graph/src/`

| File/Area | Role | Notes |
|-----------|------|-------|
| `packages/positional-graph/src/services/` | Core services (graph engine, input resolution, ID gen, atomic writes) | 4 files |
| `packages/positional-graph/src/interfaces/` | Master service interface | IPositionalGraphService (~50 methods) |
| `packages/positional-graph/src/schemas/` | Graph, node, state, properties, enums, orchestrator-settings | 6 files, Zod source of truth |
| `packages/positional-graph/src/adapter/` | Filesystem persistence adapters | PositionalGraphAdapter, InstanceGraphAdapter, InstanceWorkUnitAdapter |
| `packages/positional-graph/src/features/029-agentic-work-units/` | WorkUnit types, schema, service, adapter, classes, fakes | 8+ files |
| `packages/positional-graph/src/features/030-orchestration/` | Orchestration, ODS, ONBAS, Reality, Pods, Agent context, Script runner | ~30 files |
| `packages/positional-graph/src/features/032-node-event-system/` | Event service, handler, registry, schemas, core types, fakes | ~20 files |
| `packages/positional-graph/src/features/040-graph-inspect/` | Graph inspection and formatting | 4 files |
| `packages/positional-graph/src/errors/` | Error codes and factories | E150-E189 |
| `packages/positional-graph/src/container.ts` | DI registration functions | Wires all services |
| `packages/positional-graph/src/index.ts` | Barrel exports | Public API surface |
| `packages/workflow/src/schemas/workflow-template.schema.ts` | Template manifest Zod schema | Plan 048 |
| `packages/workflow/src/schemas/instance-metadata.schema.ts` | Instance metadata Zod schema | Plan 048 |
| `packages/workflow/src/interfaces/template-service.interface.ts` | ITemplateService contract | Plan 048 |
| `packages/workflow/src/interfaces/instance-service.interface.ts` | IInstanceService contract | Plan 048 |
| `packages/workflow/src/fakes/fake-template-service.ts` | Test double | Plan 048 |
| `packages/workflow/src/fakes/fake-instance-service.ts` | Test double | Plan 048 |
| `packages/workflow/src/services/template.service.ts` | TemplateService real implementation | Plan 048 Phase 2 |
| `packages/workflow/src/adapters/template.adapter.ts` | Template path resolution | Plan 048 Phase 2 |
| `packages/workflow/src/adapters/instance.adapter.ts` | Instance path resolution | Plan 048 Phase 2 |
| `packages/positional-graph/src/adapter/instance-workunit.adapter.ts` | Instance-local unit loader | Plan 048 Phase 2 |
| `packages/positional-graph/src/fakes/` | Test doubles (FakePositionalGraphService) | Plan 050 Phase 1 |

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
| 048 | Workflow templates & instances — template/instance schemas, ITemplateService, IInstanceService, fakes, contract tests (Phase 1) | 2026-02-25 |
| 048-P2 | Template/Instance service + CLI — TemplateService (6 methods), TemplateAdapter, InstanceAdapter, InstanceWorkUnitAdapter, 6 CLI commands, advanced-pipeline template, Workshop 003 unified storage (Phase 2) | 2026-02-25 |
| 048-P3 | Integration testing + InstanceGraphAdapter — pre-resolved adapter for instance graph routing, 5 integration tests proving lifecycle/isolation/refresh/template-isolation (Phase 3) | 2026-02-26 |
| 048-P4 | E2E test migration + docs — template generation script, smoke + simple-serial templates, withTemplateWorkflow() helper, 5 e2e lifecycle tests, workflow-templates.md guide, README quick-start (Phase 4) | 2026-02-26 |
| 050-P1 | FakePositionalGraphService, fakes barrel export, web DI registration (Phase 1) | 2026-02-26 |
| 061-P3 | Removed PGService Q&A methods/types (askQuestion, answerQuestion, getAnswer); consumers migrated to workflow-events convenience API | 2026-03-01 |
| 074-P1 | Orchestration contracts: AbortSignal in drive() with 'stopped' exit, 'interrupted' status in ExecutionStatus/ONBAS/Zod schemas, compound cache key (worktreePath\|slug), per-handle PodManager+ODS via factory | 2026-03-15 |
