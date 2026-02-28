# Domain: Workgraph (Legacy)

**Slug**: `_platform/workgraph`
**Type**: infrastructure
**Created**: 2026-02-25
**Created By**: extracted from existing codebase (Plan 048)
**Status**: deprecated

> **Deprecation Notice**: This domain is the legacy graph CRUD wrapper that predates the positional-graph engine. It is being fully removed in a future plan. The positional-graph domain (`_platform/positional-graph`) is its successor. No new features should be added to this domain.

## Purpose

Legacy workspace-scoped graph CRUD adapter layer. Provides graph creation, node management, work unit enumeration, cycle detection, and layout persistence. Originally built as the primary workflow graph system (Plans 016-023), now superseded by the positional-graph engine which adds line-based topology, orchestration, and node events.

## Boundary

### Owns

- Legacy graph CRUD: create, load, show, status via IWorkGraphService
- Legacy node operations: can-run, mark-ready, start, end via IWorkNodeService
- Legacy work unit enumeration and validation via IWorkUnitService (workgraph variant)
- DAG cycle detection algorithm
- Node ID generation (unitSlug + hex3 format)
- Bootstrap prompt generation for node execution
- Visual layout schema (React Flow positions, viewport state)
- Atomic file writes for state.json
- Legacy error codes (E101-E149)

### Does NOT Own

- Positional graph engine (line-based topology, input resolution, 4-gate algorithm) — `_platform/positional-graph`
- Orchestration (Reality, ONBAS, ODS, drive loop) — `_platform/positional-graph`
- Node events (raise, handle, stamp) — `_platform/positional-graph`
- CLI/Web consumer presentation — Consumer domain per ADR-0012
- Agent instance management — Agent domain per ADR-0012
- Filesystem abstraction (IFileSystem, IPathResolver) — `_platform/file-ops`

## Contracts (Public Interface)

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `IWorkGraphService` | Interface | CLI (`cg wg`), tests | Graph CRUD — create, load, show, status, edge management |
| `IWorkNodeService` | Interface | CLI (`cg wg`), tests | Node operations — can-run, mark-ready, start, end |
| `IWorkUnitService` | Interface | CLI (`cg unit`), tests | Work unit enumeration, validation, info |
| `registerWorkgraphServices()` | Function | CLI (container) | DI registration for all workgraph services |
| `WORKGRAPH_DI_TOKENS` | Constants | CLI, web, tests | DI token namespace (defined in @chainglass/shared) |
| `FakeWorkGraphService` | Class | Tests (contract, unit) | Test double with call tracking and return builders |
| `FakeWorkNodeService` | Class | Tests (contract, unit) | Test double for node operations |
| `FakeWorkUnitService` | Class | Tests (contract, unit) | Test double for unit operations |

## Composition (Internal)

| Component | Role | Depends On |
|-----------|------|------------|
| `WorkGraphService` | Graph CRUD — create, load, validate, persist | IFileSystem, IPathResolver, IYamlParser, Zod schemas |
| `WorkNodeService` | Node lifecycle — readiness, execution state | WorkGraphService (reads graph state) |
| `WorkUnitService` | Unit discovery and validation | IFileSystem (glob .chainglass/units/), IYamlParser |
| `CycleDetection` | DAG validation — prevents circular dependencies | Graph adjacency data |
| `NodeId` | ID generation — unitSlug-hex3 format | Existing node IDs (collision avoidance) |
| `BootstrapPrompt` | Execution prompt generation | WorkUnit definition, node config |
| `LayoutSchema` | Visual position/viewport persistence | React Flow position data |
| `AtomicFile` | Safe state writes — temp-then-rename | IFileSystem |

## Source Location

Primary: `packages/workgraph/src/`

| File/Area | Role | Notes |
|-----------|------|-------|
| `packages/workgraph/src/services/` | Core services (7 files) | WorkGraphService, WorkNodeService, WorkUnitService, cycle-detection, node-id, bootstrap-prompt, atomic-file |
| `packages/workgraph/src/interfaces/` | Service contracts (3 files) | IWorkGraphService, IWorkNodeService, IWorkUnitService |
| `packages/workgraph/src/schemas/` | Zod schemas (4 files) | workgraph, worknode, workunit, layout |
| `packages/workgraph/src/fakes/` | Test doubles (3 files) | Fake implementations with call tracking |
| `packages/workgraph/src/errors/` | Error codes and factories | E101-E149 |
| `packages/workgraph/src/container.ts` | DI registration | createWorkgraphProductionContainer, createWorkgraphTestContainer |
| `packages/workgraph/src/index.ts` | Barrel exports | Public API surface |

## Dependencies

### This Domain Depends On

| Domain/Package | What It Consumes | Notes |
|---------------|-----------------|-------|
| `_platform/file-ops` (via @chainglass/shared) | `IFileSystem`, `IPathResolver` | All disk I/O for graph state, unit discovery |
| `@chainglass/shared` | `IYamlParser`, DI tokens, Result types | Foundation utilities |

### Domains That Depend On This

| Consumer | What It Consumes | Notes |
|----------|-----------------|-------|
| CLI (`apps/cli/`) | `IWorkGraphService`, `IWorkNodeService`, `IWorkUnitService` | `cg wg` and `cg unit` commands |
| Test suite | All interfaces + fakes | Unit/integration/contract tests for the package |

## History

| Plan | What Changed | Date |
|------|-------------|------|
| 016 | Original workgraph design — agent units | 2025 |
| 021 | Workspace-scoping refactor — workspace data domain pattern | 2025 |
| 022 | Web UI implementation — React Flow canvas, SSE integration | 2025 |
| 023 | Central watcher notifications — event adapter for file changes | 2025 |
| 027 | Central domain event notifications — domain event adapter | 2025 |
| 048 | Domain extracted from existing codebase; marked deprecated | 2026-02-25 |
| 050 Phase 7 | Web consumers removed (pages, API routes, feature 022, event adapters, DI registrations). Domain is now CLI-only. | 2026-02-27 |

## Successor

**`_platform/positional-graph`** — The positional-graph domain replaces this domain with a line-based topology model that adds orchestration, node events, and input resolution. The two domains have NO cross-imports — they coexist with parallel `IWorkUnitService` interfaces until this domain is fully removed.
