# Positional Graph Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-01-31
**Spec**: [./positional-graph-spec.md](./positional-graph-spec.md)
**Status**: COMPLETE
**Mode**: Full
**File Management**: PlanPak

**Workshops**:
- [positional-graph-prototype.md](./workshops/positional-graph-prototype.md) — Data Model + CLI Flow
- [workflow-execution-rules.md](./workshops/workflow-execution-rules.md) — Execution Rules, canRun Algorithm, getStatus API

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Project Structure](#project-structure)
6. [File Placement Manifest](#file-placement-manifest)
7. [Phase 1: WorkUnit Type Extraction](#phase-1-workunit-type-extraction)
8. [Phase 2: Schema, Types, and Filesystem Adapter](#phase-2-schema-types-and-filesystem-adapter)
9. [Phase 3: Graph and Line CRUD Operations](#phase-3-graph-and-line-crud-operations)
10. [Phase 4: Node Operations with Positional Invariants](#phase-4-node-operations-with-positional-invariants)
11. [Phase 5: Input Wiring and Status Computation](#phase-5-input-wiring-and-status-computation)
12. [Phase 6: CLI Integration](#phase-6-cli-integration)
13. [Phase 7: Integration Tests, E2E, and Documentation](#phase-7-integration-tests-e2e-and-documentation)
14. [Cross-Cutting Concerns](#cross-cutting-concerns)
15. [Complexity Tracking](#complexity-tracking)
16. [Progress Tracking](#progress-tracking)
17. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: The DAG-based WorkGraph model has accumulated friction: manual edge wiring, a 5-layer connection bug, the start node bootstrap problem, the "no merging" constraint already violated in practice (diamond dependencies work in tests), and a dual add-node API split between CLI and UI mental models.

**Solution**: A new `packages/positional-graph/` package implementing a **positional graph** — ordered lines containing nodes, where topology is implicit from line ordering. Data flows from preceding lines to subsequent lines through named input resolution, not edge wiring. The package provides schemas, a service layer, filesystem persistence, and CLI commands under `cg wf` — coexisting independently alongside the existing WorkGraph system.

**Expected outcomes**:
- Simpler workflow authoring (place nodes in lines, not wire edges)
- Elimination of cycle detection, edge arrays, start node sentinel, and dual add-node APIs
- Preservation of WorkUnit input/output declarations with a new resolution mechanism
- Full TDD with no mocks, real filesystem operations in all tests

---

## Technical Context

### Current System State
- WorkGraph lives in `packages/workgraph/` (1388-line WorkGraphService, 1980-line WorkNodeService)
- WorkUnit types (`InputDeclaration`, `OutputDeclaration`, `WorkUnit`) are defined in `packages/workgraph/src/interfaces/workunit-service.interface.ts`
- Workspace data storage follows the `WorkspaceDataAdapterBase` pattern from `packages/workflow/`
- CLI commands registered via `registerWorkGraphCommands()` in `apps/cli/src/commands/workgraph.command.ts`
- DI tokens defined in `packages/shared/src/di-tokens.ts`

### Integration Requirements
- Consume `WorkspaceContext` from `@chainglass/workflow` (first parameter on every service method)
- Consume `BaseResult`, `IFileSystem`, `IPathResolver` from `@chainglass/shared`
- WorkUnit types must be extracted to `@chainglass/workflow` before the positional graph can consume them without depending on the full workgraph package
- CLI integrates via Commander.js with `resolveOrOverrideContext` pattern
- DI uses `useFactory` registration per ADR-0004

### Constraints
- No modifications to existing WorkGraph system
- Filesystem-only persistence (YAML for structure, JSON for state)
- All validation in service layer, not CLI
- Error codes in the E150-E179 range
- Full TDD — tests written before implementation

### Assumptions
- `WorkspaceDataAdapterBase` pattern is stable (confirmed: used by `SampleAdapter`, `AgentEventAdapter`)
- WorkUnit definitions consumed read-only
- `resolveOrOverrideContext` CLI pattern works unchanged for `cg wf` commands

---

## Critical Research Findings

### Synthesis from Research Dossier + Workshop + Prior Learnings

Research was conducted via 7 parallel subagents during the `/plan-1a-explore` phase, producing 65 findings. The workshop document provides authoritative design decisions. Below are the deduplicated, renumbered findings ordered by impact.

---

### 🚨 Critical Discovery 01: WorkUnit Types Must Be Extracted Before Implementation
**Impact**: Critical
**Sources**: [DC-01, IC-06, Spec Q6]
**Problem**: `InputDeclaration`, `OutputDeclaration`, and `WorkUnit` types are defined inside `@chainglass/workgraph`. The positional graph needs these types but should not depend on the full workgraph service layer.
**Solution**: Move these types to `@chainglass/workflow` alongside `WorkspaceContext`. Re-export from workgraph for backward compatibility.
**Action Required**: Phase 1 prerequisite — extract types before any positional graph code.
**Affects Phases**: Phase 1 (blocking), Phase 2-5 (consuming)

### 🚨 Critical Discovery 02: Position IS Topology — Not Just Layout
**Impact**: Critical
**Sources**: [PL-08, PS-10, Workshop §Conceptual Model]
**Problem**: In the current DAG model, position (`layout.json`) is purely visual while topology (`edges[]`) determines execution. In the positional graph, position IS topology.
**Solution**: Line ordering in `graph.yaml` defines execution order and data flow direction. `layout.json` simplifies to viewport-only. The schema treats position as a first-class semantic concept.
**Action Required**: Schema design must encode position-as-semantics, not position-as-rendering.
**Affects Phases**: Phase 2 (schema), Phase 5 (status computation)

### 🚨 Critical Discovery 03: Cycle Detection Eliminated by Construction
**Impact**: Critical
**Sources**: [PL-04, PS-04, IA-05]
**Problem**: The current DAG requires a 133-line DFS cycle detection module invoked on every edge insertion.
**Solution**: Sequential line ordering guarantees acyclicity. Data flows from line N to line N+1 only. No cycle detection code needed.
**Action Required**: Do not implement or port any cycle detection logic.
**Affects Phases**: Phase 3-5

### Critical Discovery 04: Start Node Bootstrap Problem Eliminated
**Impact**: Critical
**Sources**: [PL-01, PL-03, IA-02]
**Problem**: The DAG requires a hardcoded `start` node (always `complete`) as a bootstrap sentinel. Nodes after `start` cannot have required inputs.
**Solution**: Line 0 IS the entry point. No sentinel node. Nodes on line 0 are naturally "ready" (no preceding lines).
**Action Required**: Graph creation produces one empty line, no start node.
**Affects Phases**: Phase 3 (create), Phase 5 (canRun)

### Critical Discovery 05: Unified Add-Node API Replaces Dual Pattern
**Impact**: High
**Sources**: [PL-06, IA-03, IA-04]
**Problem**: The DAG has two add-node APIs: `addNodeAfter()` (CLI, creates edge) and `addUnconnectedNode()` (UI, no edge). Different mental models.
**Solution**: Single `addNode(ctx, graphSlug, lineId, unitSlug, options?)` API. Both CLI and UI specify (line, position). No edges involved.
**Action Required**: Design one `addNode` method on `IPositionalGraphService`.
**Affects Phases**: Phase 4

### Critical Discovery 06: Atomic File Writes Must Be Reused
**Impact**: High
**Sources**: [PL-12, PS-05, IA-07]
**Problem**: Concurrent writes or crashes can corrupt YAML/JSON state files.
**Solution**: Reuse `atomicWriteFile()` and `atomicWriteJson()` from `packages/workgraph/src/services/atomic-file.ts`. These use temp-then-rename pattern.
**Action Required**: Reimplement atomic write (temp-then-rename) locally in positional-graph package to avoid workgraph dependency. Same pattern, independent code.
**Affects Phases**: Phase 2

### Critical Discovery 07: Named Input Resolution is the Core Novelty
**Impact**: High
**Sources**: [PL-02, Workshop §Input Resolution, Spec AC-6]
**Problem**: DAG resolves inputs by following explicit edge `{from, output}` references. Positional graph uses `from_unit` slug-based named predecessor search.
**Solution**: Per workshop: `collateInputs` searches preceding lines for nodes matching `from_unit` slug, resolves ordinal disambiguation with `:N` syntax, falls back to `from_node` explicit ID. Returns three-state `InputPack` (available/waiting/error).
**Action Required**: Implement the resolution algorithm exactly as specified in workshop §Input Resolution.
**Affects Phases**: Phase 5

### Critical Discovery 08: Three-State InputPack Drives Both canRun and Execution
**Impact**: High
**Sources**: [Workshop §collateInputs, Spec Goal 7]
**Problem**: DAG duplicates traversal — `canRun()` and `getInputData()` both walk edges independently.
**Solution**: Single `collateInputs` traversal produces `InputPack`. `canRun` checks `pack.ok` plus positional/transition gates. Execution reads `available` entries for data. No second traversal.
**Action Required**: `collateInputs` is the foundation — implement and test it thoroughly before `canRun`.
**Affects Phases**: Phase 5

### Critical Discovery 09: Line Transition Property Replaces Control Nodes; Execution is Per-Node
**Impact**: High
**Sources**: [Workshop §Transition, PL-05, Execution Rules Workshop §1, §6]
**Problem**: DAG workshopped GATE/BRANCH/JOIN control nodes but never implemented them. Execution mode was originally per-line.
**Solution**: Line `transition` property (`auto`/`manual`) governs inter-line flow. Auto = next line starts when all nodes complete. Manual = orchestrator must trigger explicitly. Execution mode (`serial`/`parallel`) is a **per-node** property (serial default). A single line can mix serial and parallel nodes to create independent execution chains.
**Action Required**: Implement transition checking in `getStatus` logic. Implement per-node serial/parallel in Gate 3 of canRun.
**Affects Phases**: Phase 2 (schema), Phase 4 (setNodeExecution), Phase 5 (canRun/getStatus)

### Critical Discovery 10: DI Container Registration Pattern is Well-Established
**Impact**: High
**Sources**: [PS-02, DC-05, ADR-0009]
**Problem**: New package needs DI integration.
**Solution**: Follow `registerWorkgraphServices(container, yamlParserToken)` pattern from ADR-0009. Define `POSITIONAL_GRAPH_DI_TOKENS` in `@chainglass/shared`. Create `registerPositionalGraphServices()` module registration function.
**Action Required**: Register new tokens and services in shared DI tokens file.
**Affects Phases**: Phase 2 (tokens), Phase 3 (service registration)

### Critical Discovery 11: Workspace Storage Path Pattern
**Impact**: High
**Sources**: [PL-11, ADR-0008, DC-03]
**Problem**: Data must be workspace-scoped per worktree.
**Solution**: Store under `ctx.worktreePath/.chainglass/data/workflows/<slug>/`. Use `WorkspaceContext.worktreePath` (not `workspacePath`). Follow the `getDomainPath(ctx)`/`getEntityPath(ctx, slug)` helper pattern from `WorkspaceDataAdapterBase`.
**Action Required**: Implement adapter with `domain = 'workflows'`.
**Affects Phases**: Phase 2

### Critical Discovery 12: Existing Error Code Ranges and Factory Pattern
**Impact**: Medium
**Sources**: [IC-10, Workshop §Error Codes]
**Problem**: Error codes must not collide with existing E101-E149 range.
**Solution**: Per workshop: E150-E155 for structure errors, E160-E164 for input resolution errors (E165 removed — forward references are not errors), E170-E171 for status errors. Use factory function pattern from `workgraph-errors.ts`.
**Action Required**: Define error factory functions in new error codes file.
**Affects Phases**: Phase 2 (error codes), Phase 3-5 (usage)

### Critical Discovery 13: Contract Tests Run Against Real Implementations Only
**Impact**: Medium
**Sources**: [Spec Q3, QT-02, QT-03]
**Problem**: Spec mandates "avoid mocks entirely." Existing workgraph contract tests only run against fakes — a known gap.
**Solution**: Positional graph tests use real `IPositionalGraphService` with real filesystem. No fake service implementations. No `vi.mock()`, `vi.spyOn()`, or mock libraries.
**Action Required**: All tests use real service instances against temp directories.
**Affects Phases**: Phase 2-7

### Critical Discovery 14: Node ID Generation Pattern Reusable
**Impact**: Medium
**Sources**: [IA-09, PS-08, Workshop §Node IDs]
**Problem**: Node IDs follow `<unitSlug>-<hex3>` pattern.
**Solution**: Reuse `generateNodeId()` from `packages/workgraph/src/services/node-id.ts`. Same collision-avoidance logic. Line IDs follow `line-<hex3>` pattern (same hex3 generation, different prefix).
**Action Required**: Reimplement hex3 ID generation locally in positional-graph package (same pattern as workgraph, no cross-package import). Create `generateLineId` and `generateNodeId` variants.
**Affects Phases**: Phase 2 (ID generation), Phase 3-4 (usage)

### Critical Discovery 15: CLI Parent Options Inheritance for Nested Commands
**Impact**: Medium
**Sources**: [CLI pattern analysis]
**Problem**: Commander.js nested commands (e.g., `cg wf node add`) require parent option inheritance via `cmd.parent?.opts()`.
**Solution**: Follow the established `wrapAction` + parent opts pattern from `workgraph.command.ts`. All `wf` subcommands get `--json` and `--workspace-path` from parent.
**Action Required**: Use `cmd.parent?.opts()` pattern in all nested command handlers.
**Affects Phases**: Phase 6

### Critical Discovery 16: Stored Status Takes Precedence Over Computed
**Impact**: Medium
**Sources**: [PL-01, PS-03, IC-03]
**Problem**: Node status has both computed values (`pending`, `ready`) and stored values (`running`, `complete`, etc.).
**Solution**: If `state.json` has a stored status for a node, use it. Only compute `pending`/`ready` for nodes without stored status. This is the same hybrid pattern used by the DAG model.
**Action Required**: Status computation must check stored state first.
**Affects Phases**: Phase 5

### Critical Discovery 17: Change Detection Pattern for UI Instance (Future)
**Impact**: Low (future UI phase)
**Sources**: [PL-09, PL-10]
**Problem**: UI instances need change detection and dispose guards.
**Solution**: JSON hash comparison before emitting `changed` events. `isDisposed` flag checked before and after async operations. Documented for future UI phase.
**Action Required**: Not needed for CLI prototype. Document in plan for future reference.
**Affects Phases**: None (future)

---

## Testing Philosophy

### Testing Approach
- **Selected Approach**: Full TDD
- **Rationale**: Complex positional resolution logic, new data model with structural invariants, and service contracts require test-first development
- **Focus Areas**: `collateInputs` resolution, `canRun` computation, line/node CRUD with invariants, input wiring, filesystem adapter

### Test-Driven Development
- Write tests FIRST (RED)
- Implement minimal code (GREEN)
- Refactor for quality (REFACTOR)

### Test Documentation
Every test includes:
```
Purpose: [what truth this test proves]
Quality Contribution: [how this prevents bugs]
Acceptance Criteria: [measurable assertions]
```

### Mock Usage
- **Avoid mocks entirely**: real data/fixtures only
- Use real filesystem adapter with temp directories
- Use real service implementations in all tests
- Only exception: `vi.useFakeTimers()` if needed for timing-sensitive tests
- No `vi.mock()`, `vi.spyOn()`, `jest.mock()`, Sinon, or any mocking library

### Test Layers
| Layer | Focus | Real vs Fake |
|-------|-------|--------------|
| Unit | Schema validation, ID generation, InputPack logic, canRun rules | Real implementations, in-memory data |
| Contract | Service interface behavior | Real service, real filesystem (temp dir) |
| Integration | Full lifecycle: create → add lines/nodes → wire → collate → canRun | Real service, real filesystem |
| E2E | Complete operational flow via CLI-like script | Real service, real filesystem |

---

## Project Structure

```
/home/jak/substrate/026-positional-graph/
├── packages/
│   ├── positional-graph/                    # NEW: @chainglass/positional-graph
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                     # Barrel exports
│   │       ├── interfaces/
│   │       │   └── positional-graph-service.interface.ts
│   │       ├── schemas/
│   │       │   ├── graph.schema.ts          # PositionalGraphDefinitionSchema
│   │       │   ├── node.schema.ts           # NodeConfigSchema, InputResolutionSchema
│   │       │   └── state.schema.ts          # State schema
│   │       ├── services/
│   │       │   ├── positional-graph.service.ts
│   │       │   ├── id-generation.ts         # generateLineId, generateNodeId
│   │       │   └── input-resolution.ts      # collateInputs, canRun logic
│   │       ├── errors/
│   │       │   └── positional-graph-errors.ts
│   │       ├── adapter/
│   │       │   └── positional-graph.adapter.ts
│   │       └── container.ts                 # DI registration
│   ├── workflow/                             # EXISTING: extract WorkUnit types here
│   │   └── src/
│   │       └── interfaces/
│   │           └── workunit.types.ts        # NEW: extracted types
│   └── shared/                              # EXISTING: add DI tokens
│       └── src/
│           └── di-tokens.ts                 # ADD: POSITIONAL_GRAPH_DI_TOKENS
├── apps/
│   └── cli/
│       └── src/
│           ├── commands/
│           │   ├── positional-graph.command.ts  # NEW: cg wf commands
│           │   └── index.ts                     # EDIT: add export
│           ├── bin/
│           │   └── cg.ts                        # EDIT: register commands
│           └── lib/
│               └── container.ts                 # EDIT: register services
├── test/
│   ├── unit/
│   │   └── positional-graph/                    # NEW: unit tests
│   │       ├── schemas.test.ts
│   │       ├── id-generation.test.ts
│   │       ├── input-resolution.test.ts
│   │       └── can-run.test.ts
│   ├── integration/
│   │   └── positional-graph/                    # NEW: integration tests
│   │       ├── graph-lifecycle.test.ts
│   │       └── input-wiring-lifecycle.test.ts
│   └── e2e/
│       └── positional-graph-e2e.ts              # NEW: E2E script
└── docs/
    ├── how/
    │   └── positional-graph/                    # NEW: documentation
    │       ├── 1-overview.md
    │       └── 2-cli-usage.md
    └── plans/
        └── 026-positional-graph/
            └── positional-graph-plan.md          # This file
```

---

## File Placement Manifest

| File | Classification | Location | Rationale |
|------|---------------|----------|-----------|
| `positional-graph-service.interface.ts` | plan-scoped | `packages/positional-graph/src/interfaces/` | Serves only this plan |
| `graph.schema.ts` | plan-scoped | `packages/positional-graph/src/schemas/` | Serves only this plan |
| `node.schema.ts` | plan-scoped | `packages/positional-graph/src/schemas/` | Serves only this plan |
| `state.schema.ts` | plan-scoped | `packages/positional-graph/src/schemas/` | Serves only this plan |
| `positional-graph.service.ts` | plan-scoped | `packages/positional-graph/src/services/` | Serves only this plan |
| `id-generation.ts` | plan-scoped | `packages/positional-graph/src/services/` | Serves only this plan |
| `input-resolution.ts` | plan-scoped | `packages/positional-graph/src/services/` | Serves only this plan |
| `positional-graph-errors.ts` | plan-scoped | `packages/positional-graph/src/errors/` | Serves only this plan |
| `positional-graph.adapter.ts` | plan-scoped | `packages/positional-graph/src/adapter/` | Serves only this plan |
| `container.ts` | plan-scoped | `packages/positional-graph/src/` | Serves only this plan |
| `index.ts` | plan-scoped | `packages/positional-graph/src/` | Barrel exports |
| `workunit.types.ts` | shared-new | `packages/workflow/src/interfaces/` | Needed by workgraph + positional-graph |
| `POSITIONAL_GRAPH_DI_TOKENS` | cross-cutting | `packages/shared/src/di-tokens.ts` | DI registration, wiring |
| `positional-graph.command.ts` | plan-scoped | `apps/cli/src/commands/` | CLI surface for this plan |
| Test files | plan-scoped | `test/unit/positional-graph/`, `test/integration/positional-graph/` | Tests for this plan |
| Documentation | plan-scoped | `docs/how/positional-graph/` | Docs for this plan |

---

## Phase 1: WorkUnit Type Extraction

**Objective**: Extract WorkUnit type definitions from `@chainglass/workgraph` to `@chainglass/workflow` so the positional graph package can consume them without depending on the full workgraph.

**Deliverables**:
- `InputDeclaration`, `OutputDeclaration`, `WorkUnit` types moved to `@chainglass/workflow`
- Re-exports from `@chainglass/workgraph` for backward compatibility
- All existing tests pass unchanged

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing workgraph consumers | Medium | High | Re-export from workgraph barrel, run full test suite |
| Circular dependency between workflow and workgraph | Low | High | Types only (no runtime code), verify with `pnpm build` |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.1 | [x] | Identify all WorkUnit type exports from `@chainglass/workgraph` | 1 | List of types to extract documented | [^1] | Read workunit-service.interface.ts and workunit.schema.ts |
| 1.2 | [x] | Create `packages/workflow/src/interfaces/workunit.types.ts` with extracted types | 2 | Types compile, exported from workflow barrel | [^1] | Renamed to WorkUnitInput/WorkUnitOutput to avoid InputDeclaration collision |
| 1.3 | [x] | Update `@chainglass/workgraph` to re-export from `@chainglass/workflow` | 2 | workgraph barrel still exports same types, no consumer changes needed | [^1] | Import from `@chainglass/workflow/interfaces` subpath |
| 1.4 | [x] | Run full test suite and build | 1 | `just check` passes, zero errors | [^1] | 187 test files, 2694 tests, 0 failures |

### Acceptance Criteria
- [x] `InputDeclaration`, `OutputDeclaration`, `WorkUnit` importable from `@chainglass/workflow`
- [x] All existing `@chainglass/workgraph` consumers unchanged (verify: `pnpm test --filter @chainglass/workgraph` — zero new failures)
- [x] `just check` passes — zero failures across lint (`just lint`), typecheck (`just typecheck`), test (`just test`), build (`pnpm build`)

---

## Phase 2: Schema, Types, and Filesystem Adapter

**Objective**: Define the positional graph data model (Zod schemas, TypeScript types), ID generation utilities, error codes, and filesystem persistence adapter.

**Deliverables**:
- `packages/positional-graph/` package scaffold with `package.json`, `tsconfig.json`
- Zod schemas for graph definition, node config, state, input resolution
- ID generation utilities (`generateLineId`, reuse `generateNodeId`)
- Error code factory functions (E150-E171)
- Filesystem adapter extending `WorkspaceDataAdapterBase`
- DI tokens in `@chainglass/shared`
- Unit tests for all schemas, ID generation, error codes

**Dependencies**: Phase 1 must be complete (WorkUnit types in workflow)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Schema design doesn't match workshop | Low | Medium | Workshop is authoritative — follow it exactly |
| Package build setup issues | Medium | Low | Copy structure from packages/workgraph |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 2.1 | [x] | Create `packages/positional-graph/` package scaffold | 2 | package.json, tsconfig.json, src/index.ts compile, pnpm workspace recognizes package | [📋](tasks/phase-2-schema-types-and-filesystem-adapter/execution.log.md#task-t001) | Model after packages/workgraph structure [^2] |
| 2.2 | [x] | Write tests for Zod schemas (graph definition, line, node config, input resolution, state) | 3 | Tests cover: valid parse, invalid slug, min-1-line constraint, execution/transition enums (execution is per-node with serial default), node config with optional inputs and execution field, InputResolution union (from_unit vs from_node) | [📋](tasks/phase-2-schema-types-and-filesystem-adapter/execution.log.md#task-t002) | Per Workshop §Zod Schemas [^3] |
| 2.3 | [x] | Implement Zod schemas to pass tests | 3 | All schema tests pass, types exported from barrel | [📋](tasks/phase-2-schema-types-and-filesystem-adapter/execution.log.md#task-t003) | PositionalGraphDefinitionSchema, LineDefinitionSchema, NodeConfigSchema, InputResolutionSchema, StateSchema [^3] |
| 2.4 | [x] | Write tests for ID generation (line IDs, node IDs) | 2 | Tests cover: format validation (line-xxx, unit-xxx), uniqueness, collision avoidance, hex3 pattern | [📋](tasks/phase-2-schema-types-and-filesystem-adapter/execution.log.md#task-t004) | Per Workshop §Line IDs, §Node IDs [^4] |
| 2.5 | [x] | Implement ID generation utilities | 1 | All ID generation tests pass | [📋](tasks/phase-2-schema-types-and-filesystem-adapter/execution.log.md#task-t005) | generateLineId(existingIds), reimplemented hex3 locally [^4] |
| 2.6 | [x] | Write tests for error code factory functions | 2 | Tests cover: E150-E171 codes, message content, structured ResultError output | [📋](tasks/phase-2-schema-types-and-filesystem-adapter/execution.log.md#task-t006) | Per Workshop §Error Codes [^5] |
| 2.7 | [x] | Implement error code factory functions | 2 | All error tests pass | [📋](tasks/phase-2-schema-types-and-filesystem-adapter/execution.log.md#task-t007) | Factory pattern matching workgraph-errors.ts [^5] |
| 2.8 | [x] | Add `POSITIONAL_GRAPH_DI_TOKENS` to `@chainglass/shared` | 1 | Tokens exported from shared barrel | [📋](tasks/phase-2-schema-types-and-filesystem-adapter/execution.log.md#task-t008) | 2 tokens only (per DYK-I4) [^6] |
| 2.9 | [x] | Write tests for filesystem adapter (signpost pattern + dir lifecycle + atomicWriteFile) | 3 | Tests cover: getGraphDir path, ensureGraphDir, listGraphSlugs, graphExists, removeGraph, atomicWriteFile | [📋](tasks/phase-2-schema-types-and-filesystem-adapter/execution.log.md#task-t009) | Signpost adapter per DYK-I1 [^7] |
| 2.10 | [x] | Implement filesystem adapter | 3 | All adapter tests pass, atomic writes used | [📋](tasks/phase-2-schema-types-and-filesystem-adapter/execution.log.md#task-t010) | Extends WorkspaceDataAdapterBase, domain='workflows', signpost pattern [^7] |
| 2.11 | [x] | Create DI container registration function | 2 | `registerPositionalGraphServices()` works per ADR-0009 | [📋](tasks/phase-2-schema-types-and-filesystem-adapter/execution.log.md#task-t011) | Adapter factory: (fs, pathResolver) only per DYK-I5 [^8] |

### Test Examples (Write First!)

```typescript
describe('PositionalGraphDefinitionSchema', () => {
  test('should accept valid graph with one line', () => {
    /*
    Purpose: Proves the minimum valid graph structure
    Quality Contribution: Catches schema regressions
    Acceptance Criteria: Parse succeeds, types correct
    */
    const valid = {
      slug: 'my-pipeline',
      version: '1.0.0',
      created_at: '2026-01-31T00:00:00Z',
      lines: [{
        id: 'line-a4f',
        transition: 'auto',
        nodes: [],
      }],
    };
    const result = PositionalGraphDefinitionSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  test('should reject graph with zero lines', () => {
    /*
    Purpose: Enforces at-least-one-line invariant
    Quality Contribution: Prevents empty graph creation
    Acceptance Criteria: Parse fails with min length error
    */
    const invalid = {
      slug: 'bad',
      version: '1.0.0',
      created_at: '2026-01-31T00:00:00Z',
      lines: [],
    };
    const result = PositionalGraphDefinitionSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
```

### Acceptance Criteria
- [x] All Zod schemas match workshop specifications exactly
- [x] ID generation produces unique `line-<hex3>` and `<slug>-<hex3>` IDs
- [x] Error codes E150-E171 defined with factory functions
- [x] Filesystem adapter provides path signpost + directory lifecycle + atomicWriteFile utility (per DYK-I1)
- [x] Package builds: `pnpm build --filter @chainglass/positional-graph` — zero errors
- [x] Unit tests pass: 93 new tests (50 schema + 10 ID gen + 18 error + 15 adapter) — all green

---

## Phase 3: Graph and Line CRUD Operations

**Objective**: Implement the graph lifecycle (create, load, show, delete, list) and line operations (add, remove, move, set properties) in the service layer.

**Deliverables**:
- `IPositionalGraphService` interface (graph + line methods)
- `PositionalGraphService` implementation
- Tests for all graph and line operations

**Dependencies**: Phase 2 must be complete (schemas, adapter, error codes)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| At-least-one-line invariant edge cases | Medium | Medium | Test: cannot remove last line (E156), insert preserves ordering |
| Line move reindexing | Low | Medium | Array splice operations, test boundary conditions |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 3.1 | [x] | Define `IPositionalGraphService` interface (graph + line methods) | 2 | Interface compiles, all method signatures match workshop §Service Interface | [📋](tasks/phase-3-graph-and-line-crud-operations/execution.log.md) | Completed |
| 3.2 | [x] | Write tests for graph CRUD (create, load, show, delete, list) | 3 | Tests cover: create produces 1 empty line, load returns graph, show formats output, delete removes files, list returns all slugs, create duplicate E105 | [📋](tasks/phase-3-graph-and-line-crud-operations/execution.log.md) | Completed |
| 3.3 | [x] | Implement graph CRUD to pass tests | 3 | All graph CRUD tests pass | [📋](tasks/phase-3-graph-and-line-crud-operations/execution.log.md) | Completed |
| 3.4 | [x] | Write tests for line operations (add, remove, move, set properties) | 3 | Tests cover: append line, insert at index, insert after/before lineId, remove empty line, remove non-empty fails E151, remove with cascade, move line to new index, set transition/label/description (no execution mode — that's per-node), cannot remove last line E156 | [📋](tasks/phase-3-graph-and-line-crud-operations/execution.log.md) | Completed |
| 3.5 | [x] | Implement line operations to pass tests | 3 | All line operation tests pass | [📋](tasks/phase-3-graph-and-line-crud-operations/execution.log.md) | Completed |
| 3.6 | [x] | Write tests for line invariant edge cases | 2 | Tests cover: invalid line index E152, line not found E150, duplicate line ID prevention | [📋](tasks/phase-3-graph-and-line-crud-operations/execution.log.md) | Completed |
| 3.7 | [x] | Verify line operations maintain ordering consistency | 1 | After any line operation, lines array indices are contiguous and deterministic | [📋](tasks/phase-3-graph-and-line-crud-operations/execution.log.md) | Completed |

### Acceptance Criteria
- [x] `cg wf create <slug>` produces graph with one empty line
- [x] Lines can be added (append, insert at index, before/after ID), removed, moved
- [x] At-least-one-line invariant enforced (E156 on remove-last-line)
- [x] Line properties (label, description, transition) can be set; execution mode is per-node, not per-line
- [x] All operations return `BaseResult` with appropriate error codes
- [x] Tests pass with real filesystem: `pnpm test --filter @chainglass/positional-graph` — graph CRUD and line operation tests green

---

## Phase 4: Node Operations with Positional Invariants

**Objective**: Implement node operations (add, remove, move within/between lines, set description) while maintaining all positional invariants.

**Deliverables**:
- Node operations on `IPositionalGraphService`
- `node.yaml` persistence per node
- Invariant enforcement (unique IDs, no orphans, deterministic ordering)

**Dependencies**: Phase 3 must be complete (graph and line operations)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Move-between-lines atomicity | Medium | Medium | Load, validate both lines exist, mutate both, persist in single write |
| WorkUnit validation at add time | Low | Low | Only validate unit exists, not input satisfaction |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 4.1 | [x] | Write tests for node add operations | 3 | Tests cover: append to line, insert at position, add with description, generated node ID format, node.yaml created on disk, WorkUnit existence validated (E155), line not found (E150) | [📋](tasks/phase-4-node-operations-with-positional-invariants/execution.log.md) | Completed |
| 4.2 | [x] | Implement node add to pass tests | 3 | All add tests pass, node.yaml persisted, graph.yaml updated | [📋](tasks/phase-4-node-operations-with-positional-invariants/execution.log.md) | Completed |
| 4.3 | [x] | Write tests for node remove | 2 | Tests cover: remove updates graph.yaml and deletes node dir, node not found E153 | [📋](tasks/phase-4-node-operations-with-positional-invariants/execution.log.md) | Completed |
| 4.4 | [x] | Implement node remove to pass tests | 2 | All remove tests pass | [📋](tasks/phase-4-node-operations-with-positional-invariants/execution.log.md) | Completed |
| 4.5 | [x] | Write tests for node move (within line, between lines) | 3 | Tests cover: move within line changes position, move to another line (append), move to another line at position, source line updated, target line updated, invalid position E154 | [📋](tasks/phase-4-node-operations-with-positional-invariants/execution.log.md) | Completed |
| 4.6 | [x] | Implement node move to pass tests | 3 | All move tests pass | [📋](tasks/phase-4-node-operations-with-positional-invariants/execution.log.md) | Completed |
| 4.7 | [x] | Write tests for node description and show | 2 | Tests cover: set description updates node.yaml, show returns node details with line and position | [📋](tasks/phase-4-node-operations-with-positional-invariants/execution.log.md) | Completed |
| 4.8 | [x] | Implement node description and show to pass tests | 2 | All tests pass | [📋](tasks/phase-4-node-operations-with-positional-invariants/execution.log.md) | Completed |
| 4.9 | [x] | Write tests for setNodeExecution | 2 | Tests cover: set execution to serial/parallel, persisted in node.yaml, node not found E153 | [📋](tasks/phase-4-node-operations-with-positional-invariants/execution.log.md) | Completed |
| 4.10 | [x] | Implement setNodeExecution to pass tests | 1 | All tests pass | [📋](tasks/phase-4-node-operations-with-positional-invariants/execution.log.md) | Completed |
| 4.11 | [x] | Write invariant enforcement tests | 2 | Tests cover: unique node IDs across graph, node belongs to exactly one line, deterministic ordering after operations | [📋](tasks/phase-4-node-operations-with-positional-invariants/execution.log.md) | Completed |

### Acceptance Criteria
- [x] Nodes can be added to any line at any position
- [x] Nodes can be removed, cleaning up `node.yaml` and `graph.yaml`
- [x] Nodes can be moved within a line (reposition) and between lines
- [x] Node descriptions can be set via `setNodeDescription`
- [x] All positional invariants hold after every operation (unique IDs, no orphans, deterministic ordering)
- [x] WorkUnit existence validated at add time
- [x] Tests pass: `pnpm test --filter @chainglass/positional-graph` — node operation and invariant tests green

---

## Phase 5: Input Wiring and Status Computation

**Objective**: Implement input wiring (`setInput`, `removeInput`), the `collateInputs` resolution algorithm, and `getStatus` computation (canRun is the internal 4-gate algorithm; the public API is `getNodeStatus`/`getLineStatus`/`getStatus`).

**Deliverables**:
- Input wiring operations
- `collateInputs` — the core resolution method
- `getNodeStatus` / `getLineStatus` / `getStatus` — status at node/line/graph scope (readiness is a field, not a separate method)
- `InputPack` type with three-state entries

**Dependencies**: Phase 4 must be complete (node operations)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Multi-source resolution edge cases | High | Medium | Extensive test coverage for ordinal disambiguation, same-line serial, forward references |
| `from_unit` ambiguity | Medium | Medium | Per workshop: if multiple match and no ordinal, collect from all. Test this explicitly |
| canRun rule interactions | Medium | Medium | Test each rule independently, then test combinations |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 5.1 | [x] | Write tests for input wiring operations (setInput, removeInput) | 2 | Tests cover: wire from_unit, wire from_node, remove input, persist in node.yaml, input not declared E160 | [📋](tasks/phase-5-input-wiring-and-status-computation/execution.log.md#task-t002-write-input-wiring-tests-red) | [^9] |
| 5.2 | [x] | Implement input wiring to pass tests | 2 | All wiring tests pass, node.yaml updated | [📋](tasks/phase-5-input-wiring-and-status-computation/execution.log.md#task-t003-implement-setinput-removeinput-green) | [^9] |
| 5.3 | [x] | Write tests for collateInputs — single source resolution | 3 | Tests cover: available (source complete with data), waiting (source found, not complete), error (no matching node E161), error (output not declared E163), waiting (forward reference resolves as waiting, not an error) | [📋](tasks/phase-5-input-wiring-and-status-computation/execution.log.md#task-t004-t007-collate-inputs-tests-red-single-pass) | Core algorithm. Forward refs are not errors — they resolve as `waiting`. [^10] |
| 5.4 | [x] | Write tests for collateInputs — multi-source resolution | 3 | Tests cover: multiple nodes matching from_unit (collect all), ordinal disambiguation (:1, :2), invalid ordinal E164, ambiguous predecessor E162, partial availability (some sources complete, some waiting) | [📋](tasks/phase-5-input-wiring-and-status-computation/execution.log.md#task-t004-t007-collate-inputs-tests-red-single-pass) | [^10] |
| 5.5 | [x] | Write tests for collateInputs — from_node explicit resolution | 2 | Tests cover: direct node ID lookup, node not in preceding lines resolves as waiting (not an error), node not found E153 | [📋](tasks/phase-5-input-wiring-and-status-computation/execution.log.md#task-t004-t007-collate-inputs-tests-red-single-pass) | [^10] |
| 5.6 | [x] | Write tests for collateInputs — optional vs required inputs | 2 | Tests cover: optional input error doesn't block ok, required input error blocks ok, optional waiting doesn't block ok | [📋](tasks/phase-5-input-wiring-and-status-computation/execution.log.md#task-t004-t007-collate-inputs-tests-red-single-pass) | [^10] |
| 5.7 | [x] | Implement collateInputs to pass all resolution tests | 3 | All collateInputs tests pass | [📋](tasks/phase-5-input-wiring-and-status-computation/execution.log.md#task-t008-implement-collateinputs-green) | Search preceding lines, resolve by unit slug or node ID [^10] |
| 5.8 | [x] | Write tests for canRun (internal 4-gate algorithm) | 3 | Tests cover: all preceding lines complete → ready, preceding line incomplete → pending, manual transition gate blocks, serial left neighbor incomplete blocks (per-node, not per-line), parallel skips Gate 3, collateInputs ok required, combinations of rules | [📋](tasks/phase-5-input-wiring-and-status-computation/execution.log.md#task-t009-write-canrun-tests-red) | canRun is internal; public API is getNodeStatus [^11] |
| 5.9 | [x] | Implement canRun to pass tests | 3 | All canRun tests pass | [📋](tasks/phase-5-input-wiring-and-status-computation/execution.log.md#task-t010-implement-canrun-green) | 4 gates: preceding lines + transition + serial neighbor + collateInputs [^11] |
| 5.10 | [x] | Write tests for getNodeStatus / getLineStatus / getStatus | 3 | Tests cover: node status with readyDetail, line status with starterNodes and convenience buckets, graph status with overall state, stored status preserved, mixed statuses across lines, StarterReadiness for chain-starters | [📋](tasks/phase-5-input-wiring-and-status-computation/execution.log.md#task-t011-write-status-api-tests-red) | Three levels, one pattern — per execution rules workshop §12 [^12] |
| 5.11 | [x] | Implement getNodeStatus / getLineStatus / getStatus | 3 | All status tests pass | [📋](tasks/phase-5-input-wiring-and-status-computation/execution.log.md#task-t012-implement-getlinestatus-getstatus-green) | getNodeStatus computes readiness + resolves inputs; getLineStatus calls getNodeStatus for all nodes; getStatus calls getLineStatus for all lines [^12] |

### Test Examples (Write First!)

```typescript
describe('collateInputs', () => {
  test('should return available when source node is complete with output data', () => {
    /*
    Purpose: Proves basic single-source input resolution works
    Quality Contribution: Core data flow mechanism
    Acceptance Criteria: InputPack entry has status 'available' with source data
    */
    // Setup: graph with 2 lines, line 0 has completed node with output
    // Line 1 has node with input wired to from_unit: 'sample-input'
    // Assert: collateInputs returns { ok: true, inputs: { spec: { status: 'available', ... } } }
  });

  test('should collect from all matching nodes when no ordinal specified', () => {
    /*
    Purpose: Proves multi-source collection works
    Quality Contribution: Prevents data loss in diamond-like patterns
    Acceptance Criteria: sources[] contains data from both matching nodes
    */
    // Setup: 2 nodes with same unit_slug on line 0, consumer on line 1
    // Assert: available.sources has 2 entries
  });
});
```

### Acceptance Criteria
- [x] `setInput` wires node input to named predecessor or explicit node ID
- [x] `removeInput` removes input wiring
- [x] `collateInputs` resolves each input to available/waiting/error
- [x] Multi-source inputs collect from all matching nodes
- [x] Ordinal disambiguation (`:1`, `:2`) works correctly
- [x] `getNodeStatus` returns readiness detail (4 gates), input resolution, pending questions, errors
- [x] `getLineStatus` returns per-node status, starter nodes, convenience buckets
- [x] `getStatus` returns graph-wide status (overall state, per-line detail, flat convenience lists)
- [x] Forward references resolve as `waiting` (not an error — no E165)
- [x] Tests pass: `pnpm test --filter @chainglass/positional-graph` — input resolution, collateInputs, canRun, and status tests green

---

## Phase 6: CLI Integration

**Objective**: Wire the positional graph service to CLI commands under `cg wf`, following established Commander.js patterns.

**Deliverables**:
- `positional-graph.command.ts` with all `cg wf` commands
- Registration in CLI container and command index
- `--json` and `--workspace-path` options on all commands

**Dependencies**: Phase 5 must be complete (all service methods)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CLI command naming conflicts | Low | Low | Use `wf` prefix, distinct from `wg` |
| Nested command option inheritance | Medium | Low | Use established `cmd.parent?.opts()` pattern |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 6.1 | [x] | Create `positional-graph.command.ts` with graph commands (create, show, status, delete, list) | 3 | Commands registered, workspace context resolved, service called, output formatted | [📋](tasks/phase-6-cli-integration/execution.log.md#tasks-t001-t004-command-implementations) | Completed [^14] |
| 6.2 | [x] | Add line commands (add, remove, move, set) | 3 | Nested `wf line` subcommands work with parent option inheritance | [📋](tasks/phase-6-cli-integration/execution.log.md#tasks-t001-t004-command-implementations) | Completed [^14] |
| 6.3 | [x] | Add node commands (add, remove, move, show, set, set-input, remove-input, collate) | 3 | Nested `wf node` subcommands work | [📋](tasks/phase-6-cli-integration/execution.log.md#tasks-t001-t004-command-implementations) | Completed [^14] |
| 6.4 | [x] | Add status command (node/line/graph scope) | 2 | `cg wf status <graph>` works, `--node` and `--line` flags narrow scope | [📋](tasks/phase-6-cli-integration/execution.log.md#tasks-t001-t004-command-implementations) | Completed [^14] |
| 6.5 | [x] | Register commands in CLI container and command index | 2 | `registerPositionalGraphServices()` called in CLI container, `registerPositionalGraphCommands` exported and called in cg.ts | [📋](tasks/phase-6-cli-integration/execution.log.md#task-t005--t006-di-registration--iworkunitloader-bridge) | Completed [^14] |
| 6.6 | [x] | Verify all commands with `--json` output | 2 | JSON output follows structured format for all commands | [📋](tasks/phase-6-cli-integration/execution.log.md#task-t008-json-output-verification) | Completed [^14] |

### Acceptance Criteria
- [x] All `cg wf` commands from spec AC-1 through AC-8 work
- [x] `--json` flag produces structured JSON output
- [x] `--workspace-path` overrides workspace context
- [x] Error codes displayed with descriptive messages
- [x] Existing `cg wg` commands unaffected
- [x] Manual smoke test: `cg wf create test-graph && cg wf show test-graph && cg wf list --json` — valid output
- [x] `cg wf --help` lists all subcommands (graph, line, node, status)

---

## Phase 7: Integration Tests, E2E, and Documentation

**Objective**: Validate the complete system with integration tests, an E2E prototype script, and user-facing documentation.

**Deliverables**:
- Integration test suite (full filesystem lifecycle)
- E2E prototype script exercising all operations
- Documentation in `docs/how/positional-graph/`

**Dependencies**: Phase 6 must be complete (CLI commands)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Integration test flakiness from filesystem | Low | Medium | Use temp dirs, clean up in afterEach |
| E2E script execution environment | Low | Low | Use tsx for direct TS execution |

### Tasks

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 7.1 | [x] | Write integration test: full graph lifecycle | 3 | Test exercises: create → add lines → add nodes → move nodes → wire inputs → collate → canRun → status → delete | [📋](tasks/phase-7-integration-tests-e2e-and-documentation/execution.log.md#task-t001-write-integration-test--full-graph-lifecycle) | Completed [^15] |
| 7.2 | [x] | Write integration test: input wiring lifecycle | 3 | Test exercises: create graph → add producer/consumer nodes → wire inputs → verify resolution → test multi-source → test ordinal disambiguation | [📋](tasks/phase-7-integration-tests-e2e-and-documentation/execution.log.md#task-t002-write-integration-test--input-wiring-lifecycle) | Completed [^15] |
| 7.3 | [x] | Create E2E prototype script | 3 | Script runs end-to-end using service API (not CLI), validates all operations from workshop §E2E Prototype | [📋](tasks/phase-7-integration-tests-e2e-and-documentation/execution.log.md#task-t003-create-e2e-prototype-script) | Completed — 33 operations verified [^15] |
| 7.4 | [x] | Survey existing `docs/how/` and create documentation plan | 1 | New `docs/how/positional-graph/` directory planned, no conflicts with existing docs | [📋](tasks/phase-7-integration-tests-e2e-and-documentation/execution.log.md#task-t004-survey-existing-docshow) | Completed [^15] |
| 7.5 | [x] | Create `docs/how/positional-graph/1-overview.md` | 2 | Covers: concepts (lines, nodes, positions), data model, comparison with DAG model, key differences | [📋](tasks/phase-7-integration-tests-e2e-and-documentation/execution.log.md#task-t005-create-1-overviewmd) | Completed [^15] |
| 7.6 | [x] | Create `docs/how/positional-graph/2-cli-usage.md` | 2 | Covers: all cg wf commands with examples, common workflows, error code reference | [📋](tasks/phase-7-integration-tests-e2e-and-documentation/execution.log.md#task-t006-create-2-cli-usagemd) | Completed [^15] |
| 7.7 | [x] | Run full quality check | 1 | `just check` passes (test, typecheck, lint, build) | [📋](tasks/phase-7-integration-tests-e2e-and-documentation/execution.log.md#task-t007-quality-gate) | 2923 tests, 0 failures [^15] |

### Acceptance Criteria
- [x] Integration tests exercise full lifecycle with real filesystem
- [x] E2E script validates complete operational flow
- [x] Documentation covers concepts, CLI usage, and data model
- [x] Full quality gate: `just check` — zero failures across lint, typecheck, test, build
- [x] E2E script executes: `tsx test/e2e/positional-graph-e2e.ts` — zero errors, success message
- [x] No regressions to existing `cg wg` commands (`pnpm test --filter @chainglass/workgraph` — zero new failures)

---

## Cross-Cutting Concerns

### Security Considerations
- **Path traversal prevention**: Validate slugs with `/^[a-z][a-z0-9-]*$/` regex (same as workgraph)
- **Input sanitization**: All user input goes through Zod schema validation before persistence
- **No executable code in graph definitions**: YAML/JSON only, no eval or code execution

### Observability
- **Structured error codes**: E150-E179 range with agent-friendly `ResultError` objects
- **No logging in service layer**: Errors communicated via `BaseResult.errors`
- **CLI output**: Console and JSON output adapters for human and machine consumers

### Documentation
- **Location**: `docs/how/positional-graph/` (per spec Documentation Strategy)
- **Content**: Overview (concepts, data model) and CLI usage guide
- **Target audience**: Developers working on or extending the positional graph system
- **Maintenance**: Updated alongside implementation

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| Overall Feature | 4 | Large | S=2,I=1,D=2,N=1,F=0,T=2 | New package, schemas, service, adapter, CLI, error codes | Phased delivery, TDD, workshop-driven design |
| `collateInputs` | 3 | Medium | S=1,I=1,D=1,N=2,F=0,T=1 | Novel resolution algorithm, multi-source edge cases | Extensive test coverage, workshop specification |
| `canRun` | 3 | Medium | S=1,I=0,D=1,N=1,F=0,T=2 | Multiple interacting rules (position, transition, serial, inputs) | Test each rule independently, then combinations |
| CLI surface | 3 | Medium | S=2,I=1,D=0,N=0,F=0,T=1 | Many commands, nested structure | Follow established workgraph.command.ts pattern |

---

## Progress Tracking

### Phase Completion Checklist
- [x] Phase 1: WorkUnit Type Extraction - Complete
- [x] Phase 2: Schema, Types, and Filesystem Adapter - Complete
- [x] Phase 3: Graph and Line CRUD Operations - Complete
- [x] Phase 4: Node Operations with Positional Invariants - Complete
- [x] Phase 5: Input Wiring and Status Computation - Complete
- [x] Phase 6: CLI Integration - Complete
- [x] Phase 7: Integration Tests, E2E, and Documentation - Complete

**Overall Progress: 7/7 phases (100%) — PLAN COMPLETE**

### STOP Rule
**IMPORTANT**: This plan must be complete before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## Gate Compliance

### Constitution Gate
No deviations from constitution required. The plan follows all principles:
- **Principle 1**: Clean architecture with interface-first design
- **Principle 2**: Interface defined before implementation (Phase 3 defines interface, Phase 3-5 implement)
- **Principle 3**: Full TDD throughout
- **Principle 4**: No mocks, real implementations only (per spec Q3)
- **Principle 7**: Shared types in `@chainglass/shared` (DI tokens) and `@chainglass/workflow` (WorkUnit types)

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| (none) | — | — | — |

### Architecture Gate
No layer-boundary violations. The positional graph package follows the same structure as `@chainglass/workgraph`:
- Interfaces define contracts
- Service implements business logic
- Adapter handles filesystem persistence
- CLI consumes via DI container

### ADR Ledger

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0004 (DI Architecture) | Active | Phase 2-6 | useFactory registration, child containers |
| ADR-0006 (CLI Orchestration) | Active | Phase 6 | Commander.js pattern for cg wf commands |
| ADR-0008 (Workspace Storage) | Active | Phase 2 | Per-worktree data under .chainglass/data/ |
| ADR-0009 (Module Registration) | Active | Phase 2-6 | registerPositionalGraphServices() pattern |
| (No ADR for graph model) | Recommended | — | Spec has ADR seeds; recommend /plan-3a-adr before finalizing |

---

## Change Footnotes Ledger

[^1]: Phase 1 complete (2026-01-31). WorkUnit types extracted to `@chainglass/workflow/interfaces/workunit.types.ts`. Renamed to `WorkUnitInput`/`WorkUnitOutput` with backward-compat aliases. Workgraph imports from `@chainglass/workflow/interfaces` subpath. `just check` green: 187 files, 2694 tests, 0 failures.
[^2]: Phase 2, Task 2.1 — Package scaffold
  - `file:packages/positional-graph/package.json`
  - `file:packages/positional-graph/tsconfig.json`
  - `file:packages/positional-graph/src/index.ts`
  - `file:tsconfig.json` (root — added path alias)
  - `file:vitest.config.ts` (root — added resolve alias)

[^3]: Phase 2, Tasks 2.2-2.3 — Zod schemas (50 tests)
  - `file:packages/positional-graph/src/schemas/graph.schema.ts`
  - `file:packages/positional-graph/src/schemas/node.schema.ts`
  - `file:packages/positional-graph/src/schemas/state.schema.ts`
  - `file:packages/positional-graph/src/schemas/index.ts`
  - `file:test/unit/positional-graph/schemas.test.ts`

[^4]: Phase 2, Tasks 2.4-2.5 — ID generation (10 tests)
  - `function:packages/positional-graph/src/services/id-generation.ts:generateLineId`
  - `function:packages/positional-graph/src/services/id-generation.ts:generateNodeId`
  - `file:test/unit/positional-graph/id-generation.test.ts`

[^5]: Phase 2, Tasks 2.6-2.7 — Error code factories (18 tests)
  - `file:packages/positional-graph/src/errors/positional-graph-errors.ts`
  - `file:packages/positional-graph/src/errors/index.ts`
  - `file:test/unit/positional-graph/error-codes.test.ts`

[^6]: Phase 2, Task 2.8 — DI tokens
  - `file:packages/shared/src/di-tokens.ts` (added POSITIONAL_GRAPH_DI_TOKENS)
  - `file:packages/shared/src/index.ts` (added barrel export)

[^7]: Phase 2, Tasks 2.9-2.10 — Filesystem adapter + atomicWriteFile (15 tests)
  - `class:packages/positional-graph/src/adapter/positional-graph.adapter.ts:PositionalGraphAdapter`
  - `function:packages/positional-graph/src/services/atomic-file.ts:atomicWriteFile`
  - `file:test/unit/positional-graph/adapter.test.ts`

[^8]: Phase 2, Task 2.11 — DI container registration
  - `function:packages/positional-graph/src/container.ts:registerPositionalGraphServices`

[^9]: Phase 5, Tasks T001-T003 — Interface types + input wiring (9 tests)
  - `file:packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` (NarrowWorkUnit types, InputPack, CanRunResult, Status types, method signatures)
  - `file:packages/positional-graph/src/interfaces/index.ts` (barrel export)
  - `file:packages/positional-graph/src/services/positional-graph.service.ts` (setInput, removeInput, stubs)
  - `file:test/unit/positional-graph/input-wiring.test.ts`

[^10]: Phase 5, Tasks T004-T008 — collateInputs algorithm (15 tests)
  - `function:packages/positional-graph/src/services/input-resolution.ts:collateInputs`
  - `function:packages/positional-graph/src/services/input-resolution.ts:findSourcesByUnit`
  - `function:packages/positional-graph/src/services/input-resolution.ts:isInScope`
  - `function:packages/positional-graph/src/services/input-resolution.ts:loadNodeData`
  - `function:packages/positional-graph/src/services/input-resolution.ts:loadAllNodeConfigs`
  - `function:packages/positional-graph/src/services/input-resolution.ts:resolveInput`
  - `file:test/unit/positional-graph/collate-inputs.test.ts`

[^11]: Phase 5, Tasks T009-T010 — canRun 4-gate algorithm (12 tests)
  - `function:packages/positional-graph/src/services/input-resolution.ts:canRun`
  - `method:packages/positional-graph/src/services/positional-graph.service.ts:PositionalGraphService.getNodeStatus`
  - `file:test/unit/positional-graph/can-run.test.ts`

[^12]: Phase 5, Tasks T011-T013 — Status API + triggerTransition (10 tests)
  - `method:packages/positional-graph/src/services/positional-graph.service.ts:PositionalGraphService.getLineStatus`
  - `method:packages/positional-graph/src/services/positional-graph.service.ts:PositionalGraphService.getStatus`
  - `method:packages/positional-graph/src/services/positional-graph.service.ts:PositionalGraphService.triggerTransition`
  - `file:test/unit/positional-graph/status.test.ts`

[^13]: Phase 5, Task T014 — Quality gate
  - Full suite: 2908 tests passed, 0 failures, 0 lint errors, typecheck pass, build successful

[^14]: Phase 6 — CLI Integration (10 tasks complete)
  - `file:apps/cli/src/commands/positional-graph.command.ts` (graph, line, node, status, trigger commands)
  - `file:apps/cli/src/commands/command-helpers.ts` (shared CLI helpers extracted)
  - `file:apps/cli/src/lib/container.ts` (DI registration + IWorkUnitLoader bridge)
  - `file:apps/cli/src/bin/cg.ts` (command registration)
  - `file:apps/cli/src/commands/index.ts` (export)
  - `file:packages/shared/src/adapters/console-output.adapter.ts` (wf.* formatters)
  - `file:test/unit/cli/command-helpers.test.ts` (8 tests)
  - Full suite: 2916 tests passed, 0 failures

[^15]: Phase 7 — Integration Tests, E2E, and Documentation (7 tasks complete)
  - `file:test/integration/positional-graph/graph-lifecycle.test.ts` (1 test, full lifecycle)
  - `file:test/integration/positional-graph/input-wiring-lifecycle.test.ts` (6 tests, input resolution)
  - `file:test/e2e/positional-graph-e2e.ts` (33 operations, real filesystem)
  - `file:docs/how/positional-graph/1-overview.md` (concepts, data model, DAG comparison)
  - `file:docs/how/positional-graph/2-cli-usage.md` (all cg wf commands, error codes)
  - Full suite: 2923 tests passed, 0 failures

[^16]: Subtask 001 — Property Bags and Orchestrator Settings (13 tasks, 19 new tests)
  - `file:packages/positional-graph/src/schemas/enums.schema.ts` (new — ExecutionSchema, TransitionModeSchema extracted)
  - `file:packages/positional-graph/src/schemas/properties.schema.ts` (new — 3 open-bag schemas with .catchall)
  - `file:packages/positional-graph/src/schemas/orchestrator-settings.schema.ts` (new — base + 3 entity-specific strict schemas)
  - `file:packages/positional-graph/src/schemas/graph.schema.ts` (removed top-level transition, added properties/orchestratorSettings)
  - `file:packages/positional-graph/src/schemas/node.schema.ts` (removed top-level execution/config, added properties/orchestratorSettings)
  - `file:packages/positional-graph/src/schemas/index.ts` (re-exports all new schemas and types)
  - `file:packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` (removed old setters, added 6 update methods)
  - `file:packages/positional-graph/src/services/positional-graph.service.ts` (backfill migration, 6 new methods, accessor pattern refactor)
  - `file:packages/positional-graph/src/services/input-resolution.ts` (Gate 2/3 updated to orchestratorSettings)
  - `file:apps/cli/src/commands/positional-graph.command.ts` (kubectl-style get/set, prototype pollution guard)
  - `file:test/unit/positional-graph/properties-and-orchestrator.test.ts` (new — 19 tests)
  - 6 existing test files updated for new schema shape
  - Full suite: 2959 tests passed, 0 failures

---

**Plan 026-positional-graph is COMPLETE.** All 7 phases implemented and verified.

---

## Subtasks Registry

Mid-implementation detours requiring structured tracking.

| ID | Created | Phase | Parent Task | Reason | Status | Dossier |
|----|---------|-------|-------------|--------|--------|---------|
| 001-subtask-align-docs-with-execution-rules-workshop | 2026-02-01 | Phase 1: WorkUnit Type Extraction | T001-T006 (all) | Execution rules workshop introduced per-node execution model, getStatus API, E165 removal — spec/plan/prototype workshop need alignment before Phase 2 | [x] Complete | [Link](tasks/phase-1-workunit-type-extraction/001-subtask-align-docs-with-execution-rules-workshop.md) |
| 001-subtask-property-bags-and-orchestrator-settings | 2026-02-03 | Phase 7: Integration Tests, E2E, and Documentation | Post-completion | Add properties (open bag) and orchestratorSettings (typed) fields to Graph, Line, and Node schemas | [x] Complete [^16] | [Link](tasks/phase-7-integration-tests-e2e-and-documentation/001-subtask-property-bags-and-orchestrator-settings.md) |
