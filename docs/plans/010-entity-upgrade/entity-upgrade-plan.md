# Entity Graph Architecture Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-01-26
**Spec**: [./entity-upgrade-spec.md](./entity-upgrade-spec.md)
**Status**: DRAFT
**Mode**: Full

---

## Table of Contents

1. [Pre-Implementation Audit Results](#pre-implementation-audit-results)
2. [Executive Summary](#executive-summary)
   - [Key Invariants (Unified Model)](#key-invariants-unified-model)
3. [Prerequisites](#prerequisites)
4. [ADR Ledger](#adr-ledger)
5. [Deviation Ledger](#deviation-ledger)
6. [Technical Context](#technical-context)
7. [Critical Research Findings](#critical-research-findings)
8. [Testing Philosophy](#testing-philosophy)
9. [Test Migration Plan](#test-migration-plan)
10. [Unification Strategy](#unification-strategy)
11. [Entity Data Models](#entity-data-models)
    - [Status Enums](#status-enums-explicit-definitions)
    - [State Transition Rules](#state-transition-rules)
    - [JSON Output Format](#json-output-format)
12. [Phase 1: Entity Interfaces & Pure Data Classes](#phase-1-entity-interfaces--pure-data-classes)
    - [Adapter Method Decision Tree](#adapter-method-decision-tree)
    - [RunListFilter Type Definition](#runlistfilter-type-definition)
13. [Phase 2: Fake Adapters](#phase-2-fake-adapters)
14. [Phase 3: Production Adapters](#phase-3-production-adapters)
15. [Phase 4: CLI `cg runs` Commands](#phase-4-cli-cg-runs-commands)
16. [Phase 5: Documentation](#phase-5-documentation)
17. [Phase 6: Service Unification & Validation](#phase-6-service-unification--validation)
18. [Cross-Cutting Concerns](#cross-cutting-concerns)
19. [Complexity Tracking](#complexity-tracking)
20. [Progress Tracking](#progress-tracking)
21. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Pre-Implementation Audit Results

**Audit Date**: 2026-01-26
**Audit Method**: 7 parallel subagents thoroughly searched the codebase

### Key Finding: Architecture Already Clean

The codebase demonstrates **EXCELLENT alignment** with the unified entity model. No separate adapters or entities for Checkpoint/Run exist - the architecture is already unified.

| Area | Status | Finding |
|------|--------|---------|
| **Workflow Entity** | ✅ CLEAN | Single IWorkflowRegistry handles current/checkpoint/run - no separate ICheckpointAdapter or IRunAdapter exist |
| **Phase Entity** | ✅ CLEAN | Single IPhaseService handles template/run phases - already unified |
| **MCP Server** | ✅ CLEAN | Tool APIs already abstract checkpoint selection - NO changes needed after refactor |
| **CLI Commands** | ⚠️ TERMINOLOGY | 24 cosmetic references to "checkpoint/run/template" in comments/options (not structural) |
| **DI Tokens** | ⚠️ NEEDS ADDITION | 5 critical files need WORKFLOW_ADAPTER/PHASE_ADAPTER token registrations |
| **Tests** | ⚠️ NEEDS UPDATE | 22 files need migration to unified adapters, 5 new files to create |
| **Manual Test** | ⚠️ NEEDS EXPANSION | Phase 5 harness complete, needs parallel entity-upgrade validation suite |

### DI Token Updates Required (5 Critical Files)

| File | Changes Required |
|------|-----------------|
| `packages/shared/src/di-tokens.ts` | ADD: `WORKFLOW_ADAPTER: 'IWorkflowAdapter'`, `PHASE_ADAPTER: 'IPhaseAdapter'` |
| `packages/workflow/src/container.ts` | ADD: 4 registrations (prod + test for both adapters) |
| `apps/cli/src/lib/container.ts` | ADD: 4 registrations (prod + test for both adapters) |

### Test Migration Summary

**Tests to UPDATE (22 files):**
- `test/unit/workflow/checkpoint.test.ts` - 22 tests → migrate to unified adapter
- `test/unit/workflow/compose-checkpoint.test.ts` - 14 tests → migrate to unified adapter
- `test/unit/workflow/versions.test.ts` - 6+ tests → migrate to unified adapter
- `test/unit/workflow/restore.test.ts` - 5+ tests → migrate to unified adapter
- Plus 18 other files with adapter/service references

**Tests to CREATE (5 files):**
- `test/unit/workflow/workflow-adapter.test.ts`
- `test/unit/workflow/phase-adapter.test.ts`
- `test/contracts/unified-workflow-adapter.contract.test.ts`
- `test/contracts/unified-phase-adapter.contract.test.ts`
- `test/integration/adapters/adapter-initialization.test.ts`

### Manual Test Harness Assessment

The existing harness at `manual-test/` is **excellent for Phase 5 CLI validation** and will serve as a **backward compatibility baseline**. For entity upgrade:

1. **Keep existing harness** - Run as regression test to ensure no breakage
2. **Create entity-upgrade harness** - New `entity-test/` with:
   - `01-entity-hydration.sh` (test adapters)
   - `02-entity-navigation.sh` (test graph traversal)
   - `03-entity-json-format.sh` (test toJSON())
   - `04-runs-commands.sh` (test `cg runs list/get`)
3. **Validation Gate**: Both harnesses must pass before merge

### Implications for This Plan

1. **No architectural refactoring needed** - Plan adds new components, doesn't restructure existing
2. **Existing services remain unchanged initially** - Phase 6 (Service Unification) is optional follow-on
3. **MCP tools don't need changes** - They already abstract entity concepts
4. **Tests need migration** - But it's additive, not destructive

---

## Executive Summary

**Problem Statement**: Workflows, Runs, and Phases are currently "diffuse concepts" expressed entirely through service calls and scattered JSON files. There are no entity classes that can be instantiated from filesystem paths, making `cg runs list` impossible and web integration friction-heavy.

### Key Invariants (Unified Model)

These invariants define the unified entity model and MUST be preserved throughout implementation:

```
1. Workflow Source Exclusivity:
   isCurrent XOR isCheckpoint XOR isRun
   (A Workflow is loaded from EXACTLY ONE source - never both checkpoint AND run)

2. Phase Structure Identity:
   Template Phase ≡ Run Phase (same fields, different populated values)
   - Template: exists=false, value=undefined, status='pending'
   - Run: exists=true/false, value=populated, status=runtime

3. Adapter Responsibility:
   Adapters do I/O → Entities are pure data
   (No adapter references in entities, no async methods on entities)

4. Data Locality:
   Each entity loads from its OWN filesystem path, never from parent sources
   (Phase reads from phaseDir, not from parent wf.yaml)
```

**Web/UI Implication**: A single `<WorkflowCard>` component renders current/checkpoint/run by reading flags - no separate component types needed.

**Solution Approach**:
- Create pure data entity classes (Workflow, Phase) with no adapter references
- Unified Workflow entity: current, checkpoint, and run are all workflows (same model, different populated state)
- Create entity adapters (IWorkflowAdapter, IPhaseAdapter) that handle creation and navigation
- Navigation via adapter methods: `phaseAdapter.listForWorkflow(workflow)` not `workflow.phases()`
- Always-fresh filesystem reads (no caching per spec Q5)
- Add `cg runs list/get` CLI commands using WorkflowAdapter.listRuns()

**Expected Outcomes**:
- `cg runs list` command works (critical missing feature)
- Entity graph navigable from any entry point (Phase → Run → Checkpoint → Workflow)
- Web-ready serialization via `toJSON()` on all entities
- Full TDD with Fakes via DI (no vi.mock)

**Success Metrics**:
- All 19 acceptance criteria from spec pass
- Contract tests verify fake/real adapter parity
- `cg runs list --workflow hello-wf` returns filtered runs

---

## Prerequisites

Before beginning implementation, ensure the following setup is complete:

```bash
# Install dependencies
pnpm install

# Verify build succeeds
pnpm build

# Verify tests pass
pnpm test

# Verify linting passes
pnpm lint

# Verify TypeScript compiles
pnpm typecheck
```

**Required Tools**:
- Node.js 18+
- pnpm 8+
- Just task runner

**Codebase Familiarity**:
- Review existing fakes in `packages/workflow/src/fakes/` (FakeWorkflowRegistry, FakePhaseService)
- Review existing adapters in `packages/workflow/src/adapters/` (yaml-parser.adapter.ts, schema-validator.adapter.ts)
- Review DI container patterns in `packages/workflow/src/container.ts`

---

## ADR Ledger

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| [ADR-0004: DI Container Architecture](../../adr/adr-0004-dependency-injection-container-architecture.md) | Accepted | Phase 1, 2, 3 | Use `useFactory` pattern for adapter registration; test containers with fakes |
| [ADR-0006: CLI-Based Workflow Agent Orchestration](../../adr/adr-0006-cli-based-workflow-agent-orchestration.md) | Accepted | Phase 6 | **Canonical exemplar** for web system; documents session management (CWD binding, dual flags), NDJSON parsing, validation gates (DYK-07 through DYK-12) |

**ADR-0004 Compliance**:
- Both entity adapters (WorkflowAdapter, PhaseAdapter) registered via `useFactory` pattern (not `useClass`)
- Test containers use `useValue` with fake instances (FakeWorkflowAdapter, FakePhaseAdapter)
- Child containers for test isolation
- No `@injectable()` decorators

---

## Deviation Ledger

| Principle | Deviation | Justification | Mitigation |
|-----------|-----------|---------------|------------|
| R-ARCH-002: Interfaces in `@chainglass/shared` | Entity adapter interfaces placed in `packages/workflow/src/interfaces/` | These interfaces are workflow-domain-specific and not needed by web app or MCP server packages. Placing in shared would add unnecessary coupling. | If cross-package reuse emerges, refactor to `@chainglass/shared`. Monitor for import requests from other packages. |
| R-ARCH-002: Fakes in `@chainglass/shared` | Entity adapter fakes placed in `packages/workflow/src/fakes/` | Fakes correspond 1:1 with workflow-specific adapters. Moving to shared would separate fakes from their implementations. | If other packages need these fakes, refactor to shared. Current pattern follows existing `packages/workflow/src/fakes/` convention. |
| R-ARCH-002: Adapters in `@chainglass/shared` | Entity adapters placed in `packages/workflow/src/adapters/` | Entity adapters are tightly coupled to workflow domain (wf-status.json parsing, phase lifecycle, etc.). Not general-purpose infrastructure. | If adapters become needed in web/MCP, extract shared subset to `@chainglass/shared`. |

**Note**: The `packages/workflow/` package already contains 7 fakes and 2 adapters following this pattern. This plan extends the existing convention.

---

## Technical Context

### Current System State

```
Current:  Filesystem → Services → DTOs → Consumer assembles "entity" mentally
Proposed: Filesystem → EntityAdapter → Entity → Consumer uses first-class objects
```

**Key Files**:
| Location | Purpose |
|----------|---------|
| `packages/workflow/src/interfaces/` | Service interfaces (IWorkflowRegistry, IPhaseService) |
| `packages/workflow/src/fakes/` | 7 existing fakes (FakeWorkflowRegistry, FakePhaseService, etc.) |
| `packages/workflow/src/container.ts` | DI container factory (production + test) |
| `apps/cli/src/commands/` | CLI command handlers |
| `.chainglass/runs/<slug>/<version>/run-*/` | Run folder structure |

### Integration Requirements

1. **DI Container Integration**: Entity adapters registered via `useFactory` pattern in containers
2. **CLI Integration**: New `registerRunsCommands()` function added to CLI entry point
3. **Backward Compatibility**: Existing services unchanged; entities are additive

### Constraints and Limitations

1. **No caching** (spec Q5): Always read from filesystem
2. **Entities not in DI** (spec Q7): Pure data classes, adapters in DI
3. **Fakes only** (constitution): No vi.mock(), use FakeWorkflowAdapter and FakePhaseAdapter
4. **Path security**: All paths via IPathResolver.join()

### Assumptions

1. Folder structure conventions stable (`.chainglass/runs/<slug>/<version>/run-*`)
2. Existing adapters (IFileSystem, IPathResolver, IYamlParser) sufficient
3. Existing tests can be extended, not rewritten

---

## Critical Research Findings

### 🚨 Critical Discoveries

#### Discovery 01: Entity Constructors Must Be Pure Data
**Impact**: Critical
**Sources**: [Spec Q7 Clarification, Research Dossier IA-03]
**Problem**: Research dossier proposed entities with adapter references for lazy loading. Spec Q7 clarified: "Entities should NOT be in DI."
**Solution**: Entities are pure readonly data classes. No adapter references, no async methods, no private cache fields.
**Example**:
```typescript
// ❌ WRONG - Entity with adapter reference
class Run {
  constructor(
    readonly runId: string,
    private readonly phaseAdapter: IPhaseAdapter  // VIOLATES SPEC Q7
  ) {}
  async phases(): Promise<Phase[]> { ... }  // WRONG - async on entity
}

// ✅ CORRECT - Pure data entity
class Run {
  constructor(
    readonly runId: string,
    readonly runDir: string,
    readonly workflowSlug: string,
    readonly status: RunStatus
  ) {}
  get isComplete(): boolean { return this.status === 'complete'; }  // OK - computed from data
}
```
**Action Required**: All entity classes must have readonly constructor properties only. Navigation via adapters.
**Affects Phases**: Phase 1

---

#### Discovery 02: Data Locality - Load From Entity's Own Path
**Impact**: Critical
**Sources**: [User clarification, filesystem-based design principle]
**Problem**: During compose, data is extracted from wf.yaml into each phase's directory. If we load phase data from the parent wf.yaml instead of the phase's own path, we may get stale data. Similarly, a Run must load from its own wf-status.json, not from checkpoint metadata.
**Solution**: Each entity is self-describing from its own filesystem location. Never load entity data from parent sources.
**Example**:
```typescript
// ❌ WRONG - Loading phase from parent wf.yaml
class PhaseAdapter {
  async fromPath(phaseDir: string): Promise<Phase> {
    const runDir = path.dirname(phaseDir);
    const wfYaml = await this.fs.readFile(`${runDir}/wf.yaml`);  // STALE SOURCE
    return new Phase(wfYaml.phases[phaseName]);
  }
}

// ✅ CORRECT - Loading phase from its own path
class PhaseAdapter {
  async fromPath(phaseDir: string): Promise<Phase> {
    const phaseStatus = await this.fs.readFile(`${phaseDir}/phase-status.json`);  // ENTITY'S OWN PATH
    return new Phase(phaseStatus);
  }
}
```
**Action Required**: All adapters read from entity's own filesystem location, never from parent or template sources.
**Affects Phases**: Phase 3

---

#### Discovery 03: No Caching - Always Fresh Reads (Corollary to Discovery 02)
**Impact**: Critical
**Sources**: [Spec Q5 Resolution, Spec AC-16, AC-17]
**Problem**: Research dossier showed lazy-loading caches like `_checkpoints?: Checkpoint[]`. Spec Q5 explicitly chose "No caching."
**Solution**: Adapters always read from filesystem. Each call to `listRuns()` or `getPhases()` does fresh I/O.
**Example**:
```typescript
// ❌ WRONG - Cached lazy loading
class RunAdapter {
  private cache = new Map<string, Run>();
  async fromPath(runDir: string): Promise<Run> {
    if (this.cache.has(runDir)) return this.cache.get(runDir)!;
    // ...
  }
}

// ✅ CORRECT - Always fresh
class RunAdapter {
  async fromPath(runDir: string): Promise<Run> {
    const status = await this.fs.readFile(path.join(runDir, 'wf-run/wf-status.json'));
    return new Run(...);  // Always reads filesystem
  }
}
```
**Action Required**: No caching in adapters. If consumers need caching, they implement it.
**Affects Phases**: Phase 3

---

#### Discovery 04: Path Security Mandatory for Entity Hydration
**Impact**: Critical
**Sources**: [IPathResolver interface docs, packages/shared/src/interfaces/path-resolver.interface.ts]
**Problem**: Entity adapters derive parent paths from filesystem structure. String manipulation without validation could enable path traversal attacks.
**Solution**: MANDATORY use of `IPathResolver.join()` for all path operations in adapters. Never use `path.join()` directly.
**Example**:
```typescript
// ❌ WRONG - Direct path manipulation
class RunAdapter {
  async getWorkflow(run: Run): Promise<Workflow> {
    const workflowDir = path.dirname(path.dirname(path.dirname(run.runDir)));  // UNSAFE
    return this.workflowAdapter.fromPath(workflowDir);
  }
}

// ✅ CORRECT - Use pathResolver
class RunAdapter {
  async getWorkflow(run: Run): Promise<Workflow> {
    const workflowsDir = this.pathResolver.join(this.basePath, '.chainglass/workflows');
    return this.workflowAdapter.fromSlug(run.workflowSlug);  // Use slug, not path manipulation
  }
}
```
**Action Required**: All adapters inject IPathResolver. Code review gate for path operations.
**Affects Phases**: Phase 3

---

### ⚠️ High Impact Discoveries

#### Discovery 05: DI Token Pattern Required
**Impact**: High
**Sources**: [ADR-0004, packages/workflow/src/container.ts]
**Problem**: Entity adapters need DI registration following existing patterns.
**Solution**: Add tokens to `WORKFLOW_DI_TOKENS`. Production uses `useFactory`, test uses `useValue` with fakes.
**Example**:
```typescript
// packages/shared/src/di-tokens.ts
export const WORKFLOW_DI_TOKENS = {
  // ... existing tokens
  WORKFLOW_ADAPTER: 'IWorkflowAdapter',
  PHASE_ADAPTER: 'IPhaseAdapter',
};
```
**Action Required**: Add 2 new tokens. Register in both packages/workflow and apps/cli containers.
**Affects Phases**: Phase 1, Phase 2, Phase 3

---

#### Discovery 06: Fake Adapter Contract Tests Required
**Impact**: High
**Sources**: [Constitution § 3.3, test/contracts/filesystem.contract.test.ts]
**Problem**: New Fake adapters must maintain parity with real adapters. Divergence causes tests to pass but production to fail.
**Solution**: Contract test suite runs identical tests against both fake and real implementations.
**Example**:
```typescript
// test/contracts/workflow-adapter.contract.test.ts
export function workflowAdapterContractTests(
  name: string,
  setup: () => { adapter: IWorkflowAdapter; cleanup: () => Promise<void> }
) {
  describe(`${name} implements IWorkflowAdapter contract`, () => {
    it('returns empty array when no runs exist', async () => { ... });
    it('lists runs matching status filter', async () => { ... });
    it('loads from current/ as template', async () => { ... });
    it('loads from run/ with runtime state', async () => { ... });
  });
}

// Run for both
workflowAdapterContractTests('FakeWorkflowAdapter', () => ({ adapter: new FakeWorkflowAdapter(), cleanup: async () => {} }));
workflowAdapterContractTests('WorkflowAdapter', () => setupRealAdapterWithTempDir());
```
**Action Required**: Create contract test factory for WorkflowAdapter and PhaseAdapter.
**Affects Phases**: Phase 2, Phase 3

---

#### Discovery 07: Error Handling - EntityNotFoundError
**Impact**: High
**Sources**: [Spec Q6 Resolution]
**Problem**: Missing parents (e.g., run exists but checkpoint deleted) must fail fast per spec Q6.
**Solution**: Create `EntityNotFoundError` with context fields. Throw on missing required data.
**Example**:
```typescript
// packages/workflow/src/errors/entity-not-found.error.ts
export class EntityNotFoundError extends Error {
  constructor(
    readonly entityType: 'Workflow' | 'Checkpoint' | 'Run' | 'Phase',
    readonly identifier: string,
    readonly path: string,
    readonly parentContext?: string
  ) {
    super(`${entityType} '${identifier}' not found at ${path}${parentContext ? ` (parent: ${parentContext})` : ''}`);
    this.name = 'EntityNotFoundError';
  }
}
```
**Action Required**: Create error class. All adapters throw on missing required data.
**Affects Phases**: Phase 3

---

#### Discovery 08: CLI Command Registration Pattern
**Impact**: High
**Sources**: [Research Dossier PS-01, apps/cli/src/commands/workflow.command.ts]
**Problem**: New `cg runs` command group needs proper registration without colliding with existing commands.
**Solution**: Create `registerRunsCommands()` function in new `runs.command.ts` file. Reserve error codes E040-E049.
**Action Required**: Create runs command module. Register in CLI entry point.
**Affects Phases**: Phase 4

---

#### Discovery 09: Unified Entity Model - Services Will Use Adapters
**Impact**: High
**Sources**: [Concept drift analysis, unification requirement]
**Problem**: Having CLI/MCP use DTOs while adapters use entities creates drift and dual maintenance.
**Solution**: Entities are THE canonical representation. Services will be updated to use adapters internally and return entities. CLI/MCP will consume entities via `toJSON()`.
**Example**:
```typescript
// BEFORE (DTOs)
class PhaseService {
  async prepare(runDir, phase): Promise<PrepareResult> {  // DTO
    // ... manual filesystem reads
    return { phase, inputs: { required, resolved } };
  }
}

// AFTER (Entities via Adapters)
class PhaseService {
  constructor(private phaseAdapter: IPhaseAdapter) {}

  async prepare(runDir, phase): Promise<Phase> {  // Entity
    // ... do prepare work
    return this.phaseAdapter.fromPath(phaseDir);  // Returns rich entity
  }
}

// CLI/MCP
const phase = await phaseService.prepare(runDir, 'gather');
console.log(JSON.stringify(phase.toJSON()));  // Unified output
```
**Action Required**: After entity adapters are complete, update services to use them. CLI/MCP format entities via `toJSON()`.
**Affects Phases**: Phase 3, Phase 4 (and future Phase 6: Service Unification)

---

## Testing Philosophy

### Testing Approach
**Selected Approach**: Full TDD
**Rationale**: Entity graph with bidirectional navigation requires comprehensive test coverage to ensure navigation correctness and adapter-entity contracts.

### Test-Driven Development

For each component:
1. **RED**: Write test first, verify it fails
2. **GREEN**: Implement minimal code to pass test
3. **REFACTOR**: Improve quality while keeping tests green

### Test Documentation

Every test must include:
```typescript
/*
Test Doc:
- Why: [business/regression reason]
- Contract: [plain-English invariant]
- Usage Notes: [how to call API, gotchas]
- Quality Contribution: [what failure this catches]
- Worked Example: [inputs/outputs]
*/
```

### Mock Usage Policy

**Policy**: Fakes via DI (no vi.mock/jest.mock)
**Rationale**: Codebase has 16+ established Fake classes. Constitution explicitly bans mocking libraries.

**Patterns**:
- **State Storage** (FakeFileSystem pattern): Map-based with `setFile()`/`getFile()` helpers
- **Call Capture** (FakePhaseService pattern): Records calls with `getLastCall()`/`getCalls()`

**New Fakes Required**:
- `FakeWorkflowAdapter` - State storage pattern (handles current, checkpoint, and run workflows)
- `FakePhaseAdapter` - State storage pattern (handles template and run phases)

### Contract Tests

All adapters require contract tests verifying fake/real parity:
```typescript
// Same test suite runs against both implementations
workflowAdapterContractTests('FakeWorkflowAdapter', () => new FakeWorkflowAdapter());
workflowAdapterContractTests('WorkflowAdapter', () => createProductionAdapter(tempDir));
```

### Test Migration Plan

Based on the pre-implementation audit, the following test files need attention:

#### Tests to UPDATE (22 files) - Migrate to Unified Adapters

| File | Tests | Action | Phase |
|------|-------|--------|-------|
| `test/unit/workflow/checkpoint.test.ts` | 22 | Update to use FakeWorkflowAdapter.checkpoint() | Phase 3 |
| `test/unit/workflow/compose-checkpoint.test.ts` | 14 | Update to use unified adapter | Phase 3 |
| `test/unit/workflow/versions.test.ts` | 6+ | Update to use FakeWorkflowAdapter.listCheckpoints() | Phase 3 |
| `test/unit/workflow/restore.test.ts` | 5+ | Update to use FakeWorkflowAdapter.restore() | Phase 3 |
| `test/unit/workflow/phase-service.test.ts` | 20+ | Update to verify Phase entity output | Phase 6 |
| `test/unit/workflow/workflow-service.test.ts` | Multiple | Update to verify Workflow entity output | Phase 6 |
| `test/contracts/workflow-registry.contract.test.ts` | Multiple | Extend for adapter methods | Phase 3 |
| `test/contracts/workflow-service.contract.test.ts` | Multiple | Extend for entity return types | Phase 6 |
| `test/contracts/phase-service.contract.test.ts` | Multiple | Extend for entity return types | Phase 6 |
| `test/integration/cli/wf-compose.test.ts` | 535 lines | Verify entity JSON output | Phase 6 |
| `test/integration/cli/phase-commands.test.ts` | 1535 lines | Verify entity JSON output | Phase 6 |

#### Tests to CREATE (5 files)

| File | Purpose | Phase |
|------|---------|-------|
| `test/unit/workflow/workflow-adapter.test.ts` | Test FakeWorkflowAdapter implementation | Phase 2 |
| `test/unit/workflow/phase-adapter.test.ts` | Test FakePhaseAdapter implementation | Phase 2 |
| `test/contracts/workflow-adapter.contract.test.ts` | Contract tests for IWorkflowAdapter | Phase 3 |
| `test/contracts/phase-adapter.contract.test.ts` | Contract tests for IPhaseAdapter | Phase 3 |
| `test/integration/adapters/adapter-initialization.test.ts` | DI container wiring tests | Phase 3 |

#### Tests NOT Affected (25+ files)

These test files are orthogonal to entity adapters and need no changes:
- `test/unit/config/*` (14 files)
- `test/unit/shared/*` (9 files)
- `test/unit/mcp-server/*` (6 files)
- `test/contracts/filesystem.contract.test.ts`
- `test/contracts/logger.contract.test.ts`

---

## Unification Strategy

### Entities Are THE Canonical Model

Entities are not a parallel representation - they ARE the representation. After this work:

```
                    ┌─────────────────┐
                    │  Filesystem     │
                    │  (current/,     │
                    │   checkpoints/, │
                    │   runs/)        │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │  Entity Adapters │
                    │ (IWorkflowAdapter│  ← Unified: current/checkpoint/run
                    │  IPhaseAdapter)  │  ← Unified: template/run phases
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │    Entities     │  ← CANONICAL
                    │  (Workflow,     │    Same model, different populated state
                    │   Phase)        │
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
    ┌──────▼──────┐   ┌──────▼──────┐   ┌──────▼──────┐
    │   Services  │   │     CLI     │   │  MCP Server │
    │ (use adapters│   │ (toJSON())  │   │ (toJSON())  │
    │  internally) │   └─────────────┘   └─────────────┘
    └─────────────┘
```

### Concept Drift Reconciliation

Known differences between current CLI/MCP output and entity model:

| Current (DTOs) | Entity Model | Resolution |
|----------------|--------------|------------|
| `ValidatedFile { name, path, valid }` | `outputs[{ exists, valid }]` | Entity richer - add `exists` |
| `PrepareResult.inputs.required[]` separate | `inputFiles[].required` embedded | Entity cleaner - single structure |
| `extractedParams: Record<string,unknown>` | `outputParameters[{ name, value, source }]` | Entity preserves metadata |
| No message tracking | `inputMessages[{ exists, answered }]` | Entity richer |
| `CheckpointInfo.hash` | `Checkpoint.hash` | Aligned (use `hash`) |

**Resolution**: Entities are richer. When services return entities, CLI/MCP get the rich data via `toJSON()`.

### Service Unification (Phase 6 - Included in This Plan)

After entities and adapters are stable, services will be updated:
1. Services inject adapters via DI
2. Services use adapters for entity loading
3. Services return entities instead of DTOs
4. DTOs (`PrepareResult`, `ValidateResult`, etc.) deprecated or made internal
5. CLI/MCP format entities via `toJSON()`
6. Manual test harness updated to verify unified output

---

## Entity Data Models

This section defines the complete data model for each entity. Entities are **full views of filesystem state** - they load all data from their own path, not from parent sources.

### Status Enums (Explicit Definitions)

```typescript
// Workflow run status (top-level execution state)
type RunStatus = 'pending' | 'active' | 'complete' | 'failed';

// Phase execution status (detailed lifecycle)
type PhaseRunStatus =
  | 'pending'   // Not started, waiting for prior phases
  | 'ready'     // Dependencies met, can be started
  | 'active'    // Currently executing
  | 'blocked'   // Waiting for input (message answer, file)
  | 'accepted'  // Agent work done, awaiting orchestrator acceptance
  | 'complete'  // Successfully finished
  | 'failed';   // Terminated with error

// Relationships:
// - Run.status === 'active' when ANY phase is active/blocked/accepted
// - Run.status === 'complete' when ALL phases are complete
// - Run.status === 'failed' when ANY required phase is failed
// - Run.status === 'pending' only at initial creation (before first phase starts)
```

### State Transition Rules

**Workflow State Transitions** (source type is immutable after load):

| Current State | Valid Transitions | Trigger |
|---------------|-------------------|---------|
| (none) → current | Load from `current/` | `fromCurrent()` |
| (none) → checkpoint | Load from `checkpoints/vXXX/` | `fromCheckpoint()` |
| (none) → run | Load from `runs/.../run-*/` | `fromRun()` |
| current → checkpoint | User creates version | `cg wf checkpoint` (creates new entity) |
| checkpoint → run | User composes workflow | `cg wf compose` (creates new entity) |

**Note**: These are *creation* transitions. A loaded entity never changes its source type.

**Phase State Transitions**:

```
pending ──────► ready ──────► active ──────► accepted ──────► complete
    │              │             │              │
    │              │             ▼              │
    │              │         blocked ◄─────────┘
    │              │             │
    └──────────────┴─────────────┴──────────────────────────► failed
```

| From | To | Trigger |
|------|----|---------|
| pending | ready | All prior phases complete, dependencies met |
| ready | active | Phase execution starts |
| active | blocked | Waiting for input (message answer, required file) |
| blocked | active | Input received |
| active | accepted | Agent marks work complete |
| accepted | complete | Orchestrator accepts (or auto-accept) |
| ANY | failed | Unrecoverable error |

### JSON Output Format

All entity `toJSON()` methods output **camelCase** property names (standard JSON convention):

```typescript
// Workflow.toJSON() example:
{
  "slug": "hello-workflow",
  "version": "1.0.0",
  "isCurrent": true,
  "isCheckpoint": false,
  "isRun": false,
  "checkpoint": null,           // null, not undefined (JSON serializable)
  "run": null,
  "phases": [
    {
      "name": "gather",
      "status": "pending",
      "inputFiles": [...],
      "outputs": [...]
    }
  ]
}

// Export TypeScript types for web consumption:
export type WorkflowJSON = ReturnType<Workflow['toJSON']>;
export type PhaseJSON = ReturnType<Phase['toJSON']>;
```

**Backward Compatibility**: Phase 6 tasks must verify `toJSON()` output matches existing CLI JSON format where possible.

### Phase Entity (Most Complex)

The Phase entity must capture **everything** on the filesystem for that phase:

```typescript
class Phase {
  // ===== Identity =====
  readonly name: string;                    // Phase name (e.g., 'gather')
  readonly phaseDir: string;                // Absolute path to phase directory
  readonly runDir: string;                  // Parent run directory (for navigation)

  // ===== From Definition (wf-phase.yaml) =====
  readonly description: string;
  readonly order: number;                   // 1-based execution order

  // ===== Input Files (with exists status) =====
  readonly inputFiles: ReadonlyArray<{
    name: string;
    required: boolean;
    description?: string;
    fromPhase?: string;
    exists: boolean;                        // Does file exist on disk?
    path: string;                           // Resolved filesystem path
  }>;

  // ===== Input Parameters (with resolved values) =====
  readonly inputParameters: ReadonlyArray<{
    name: string;
    required: boolean;
    description?: string;
    fromPhase?: string;
    value: unknown | undefined;             // Resolved value from params.json
  }>;

  // ===== Input Messages (with exists/answered status) =====
  readonly inputMessages: ReadonlyArray<{
    id: string;                             // Message ID (e.g., '001')
    type: 'single_choice' | 'multi_choice' | 'free_text' | 'confirm';
    from: 'agent' | 'orchestrator';
    required: boolean;
    subject: string;
    prompt?: string;
    options?: Array<{ key: string; label: string; description?: string }>;
    description?: string;
    exists: boolean;                        // Does m-{id}.json exist?
    answered: boolean;                      // Has answer been provided?
  }>;

  // ===== Output Files (with exists/valid status) =====
  readonly outputs: ReadonlyArray<{
    name: string;
    type: 'file';
    required: boolean;
    schema?: string;
    description?: string;
    exists: boolean;                        // Does output file exist?
    valid: boolean;                         // Passed schema validation?
    path: string;                           // Resolved filesystem path
  }>;

  // ===== Output Parameters (with extracted values) =====
  readonly outputParameters: ReadonlyArray<{
    name: string;
    source: string;
    query: string;
    description?: string;
    value: unknown | undefined;             // Extracted value (if finalized)
  }>;

  // ===== Runtime State (from wf-status.json) =====
  readonly status: PhaseRunStatus;          // pending|ready|active|blocked|accepted|complete|failed
  readonly startedAt?: Date;
  readonly completedAt?: Date;

  // ===== Phase State (from wf-phase.json) =====
  readonly facilitator: 'agent' | 'orchestrator';
  readonly state: PhaseState;
  readonly statusHistory: ReadonlyArray<StatusEntry>;

  // ===== Messages (loaded from messages/ folder) =====
  readonly messages: ReadonlyArray<Message>;

  // ===== Computed Properties =====
  get duration(): number | undefined;       // ms between started and completed
  get isPending(): boolean;
  get isReady(): boolean;
  get isActive(): boolean;
  get isBlocked(): boolean;
  get isComplete(): boolean;
  get isFailed(): boolean;
  get isDone(): boolean;                    // complete || failed

  // ===== Serialization =====
  toJSON(): object;                         // Full snapshot for API/web
}
```

**Filesystem Structure** (all loaded by PhaseAdapter):
```
<phase_name>/
├── wf-phase.yaml              # → description, order, inputs, outputs definitions
├── commands/main.md           # Agent instructions (not in entity)
├── schemas/*.schema.json      # For validation (not in entity)
└── run/
    ├── inputs/
    │   ├── files/             # → inputFiles[].exists, inputFiles[].path
    │   ├── data/              # JSON data from prior phases
    │   └── params.json        # → inputParameters[].value
    ├── messages/m-{id}.json   # → messages[], inputMessages[].exists/answered
    ├── outputs/               # → outputs[].exists, outputs[].valid
    └── wf-data/
        ├── wf-phase.json      # → facilitator, state, statusHistory
        └── output-params.json # → outputParameters[].value
```

### Run Entity (Convenience Alias)

Since a Run is just a Workflow loaded from a run directory, you can use `Workflow` directly. However, for convenience when you KNOW you're working with a run:

```typescript
// Run is a type alias for a Workflow that has run metadata
type Run = Workflow & { run: NonNullable<Workflow['run']> };

// Or use Workflow directly and check:
if (workflow.isRun) {
  console.log(workflow.run!.runId);     // Safe - we know it's a run
  console.log(workflow.run!.status);
}
```

**Navigation**:
- `workflowAdapter.listRuns(slug)` → returns `Workflow[]` where each `isRun === true`
- `workflowAdapter.fromRun(runDir)` → returns `Workflow` with `run` populated

### Workflow Entity (Unified: Current, Checkpoint, or Run)

A Workflow can be loaded from three sources - the model is the same, only the populated state differs:

| Source | `isCurrent` | `checkpoint` | `run` | Phase values populated? |
|--------|-------------|--------------|-------|-------------------------|
| `current/` | true | undefined | undefined | No (template) |
| `checkpoints/v001/` | false | `{ordinal, hash, ...}` | undefined | No (frozen template) |
| `runs/.../run-*/` | false | `{ordinal, hash, ...}` | `{runId, status, ...}` | Yes (runtime state) |

```typescript
class Workflow {
  readonly slug: string;                    // e.g., 'hello-workflow'
  readonly workflowDir: string;             // Absolute path to source
  readonly version: string;                 // Semantic version from wf.yaml
  readonly description?: string;

  // ===== Phases (ALWAYS present - same structure regardless of source) =====
  readonly phases: ReadonlyArray<Phase>;    // Full phase definitions/state

  // ===== Source Context =====
  readonly isCurrent: boolean;              // true if from current/ (editable)

  // ===== Checkpoint Metadata (if loaded from checkpoint or run) =====
  readonly checkpoint?: {
    readonly ordinal: number;               // 1-based version number
    readonly hash: string;                  // 8-char content hash
    readonly createdAt: Date;
    readonly comment?: string;
  };

  // ===== Run Metadata (if loaded from a run) =====
  readonly run?: {
    readonly runId: string;                 // e.g., 'run-2026-01-25-001'
    readonly runDir: string;                // Absolute path to run
    readonly status: RunStatus;             // pending|active|complete|failed
    readonly createdAt: Date;
  };

  // ===== Computed =====
  get isCheckpoint(): boolean { return this.checkpoint !== undefined && this.run === undefined; }
  get isRun(): boolean { return this.run !== undefined; }
  get isTemplate(): boolean { return this.isCurrent || this.isCheckpoint; }

  // Optional: explicit source for API clarity (alternative to checking flags)
  get source(): 'current' | 'checkpoint' | 'run' {
    if (this.isCurrent) return 'current';
    if (this.isRun) return 'run';
    return 'checkpoint';
  }

  toJSON(): object;
}
```

**Key Principle**: The Phase structure is identical whether from template or run. The difference is whether values are populated:

```typescript
// Template phase (current/ or checkpoint/)
phase.inputFiles[0].exists    // false (file doesn't exist yet)
phase.inputFiles[0].value     // undefined (not resolved)
phase.outputs[0].exists       // false (not created yet)
phase.status                  // 'pending' (default for templates)

// Run phase (with runtime state)
phase.inputFiles[0].exists    // true or false (actual filesystem state)
phase.inputFiles[0].value     // actual resolved value
phase.outputs[0].exists       // true or false (actual state)
phase.status                  // 'active', 'complete', etc. (runtime state)
```

This is not an error state - templates simply have unpopulated values. The model is unified.

---

## Phase 1: Entity Interfaces & Pure Data Classes

**Objective**: Create the foundational entity interfaces, adapter interfaces, and pure data entity classes.

**Deliverables**:
- `IWorkflowAdapter` interface (unified: handles current, checkpoint, and run sources)
- `IPhaseAdapter` interface (works with template or run phases)
- `Workflow` entity class (unified model with optional checkpoint/run metadata)
- `Phase` entity class (same structure for template and run, values populated or not)
- `EntityNotFoundError` error class
- DI tokens added to WORKFLOW_DI_TOKENS

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Interface design changes later | Medium | Medium | Thorough review before Phase 2 |
| Entity property gaps | Low | Medium | Compare against wf-status.json schema |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 1.1 | [ ] | Write tests for EntityNotFoundError | 1 | Tests verify: message format, properties (entityType, identifier, path, parentContext) | - | test/unit/workflow/entity-not-found-error.test.ts |
| 1.2 | [ ] | Implement EntityNotFoundError class | 1 | All tests from 1.1 pass | - | packages/workflow/src/errors/entity-not-found.error.ts |
| 1.2b | [ ] | **Create CLI error classes for E040-E049 codes** | 1 | Error classes: RunNotFoundError (E040), RunsDirNotFoundError (E041), InvalidRunStatusError (E042), RunCorruptError (E043). All extend base error with code property. | - | packages/workflow/src/errors/run-errors.ts |
| 1.3 | [ ] | Define IWorkflowAdapter interface | 2 | Methods: `fromCurrent(slug)`, `fromCheckpoint(slug, version)`, `fromRun(runDir)`, `listCheckpoints(slug)`, `listRuns(slug, filter?)`, `exists(slug)`. JSDoc on each. Include `RunListFilter` type. | - | Unified adapter for current/checkpoint/run |
| 1.4 | [ ] | Define IPhaseAdapter interface | 1 | Methods: `fromPath(phaseDir): Promise<Phase>`, `listForWorkflow(wf): Promise<Phase[]>`. JSDoc on each. | - | Unified: same Phase structure from both template and run sources |

### Adapter Method Decision Tree

Use this to select the correct adapter method:

| Goal | Adapter Method | Returns | Phases Populated? |
|------|----------------|---------|-------------------|
| Load editable template | `workflowAdapter.fromCurrent(slug)` | Workflow (isCurrent=true) | No (unpopulated) |
| Load immutable snapshot | `workflowAdapter.fromCheckpoint(slug, version)` | Workflow (isCheckpoint=true) | No (unpopulated) |
| Load execution with state | `workflowAdapter.fromRun(runDir)` | Workflow (isRun=true) | Yes (runtime values) |
| List all versions | `workflowAdapter.listCheckpoints(slug)` | Workflow[] (all isCheckpoint) | No |
| List executions | `workflowAdapter.listRuns(slug, filter?)` | Workflow[] (all isRun) | Yes |
| Check if workflow exists | `workflowAdapter.exists(slug)` | boolean | N/A |
| Load single phase | `phaseAdapter.fromPath(phaseDir)` | Phase | Depends on source |
| List phases for workflow | `phaseAdapter.listForWorkflow(workflow)` | Phase[] | Depends on workflow source |

### RunListFilter Type Definition

```typescript
// Formally defined filter for listRuns()
interface RunListFilter {
  status?: RunStatus | RunStatus[];     // Filter by run status
  createdAfter?: Date;                  // Runs created after this date
  createdBefore?: Date;                 // Runs created before this date
  limit?: number;                       // Max results (for pagination)
}

// Usage:
const activeRuns = await workflowAdapter.listRuns('hello-wf', { status: 'active' });
const recentFailed = await workflowAdapter.listRuns('hello-wf', {
  status: 'failed',
  createdAfter: new Date('2026-01-01'),
  limit: 10
});
```
| 1.5 | [ ] | Write tests for Workflow entity (template mode) | 2 | Tests: load from current/, isCurrent=true, checkpoint=undefined, phases have unpopulated values | - | |
| 1.6 | [ ] | Write tests for Workflow entity (checkpoint mode) | 2 | Tests: load from checkpoint/, isCheckpoint=true, checkpoint metadata populated | - | |
| 1.7 | [ ] | Write tests for Workflow entity (run mode) | 2 | Tests: load from run/, isRun=true, run metadata populated, phases have runtime state | - | |
| 1.8 | [ ] | Implement Workflow entity class | 2 | All tests from 1.5-1.7 pass, unified model for all sources | - | packages/workflow/src/entities/workflow.ts |
| 1.9 | [ ] | Write tests for Phase entity | 3 | Tests: constructor with full data model, exists/answered/valid flags (unpopulated for templates, populated for runs), status helpers, duration, toJSON() | - | Same structure for template and run phases |
| 1.10 | [ ] | Implement Phase entity class | 2 | All tests from 1.9 pass, includes all fields from Entity Data Models section | - | packages/workflow/src/entities/phase.ts |
| 1.11 | [ ] | Add DI tokens to WORKFLOW_DI_TOKENS | 1 | 2 new tokens: WORKFLOW_ADAPTER, PHASE_ADAPTER | - | packages/shared/src/di-tokens.ts |
| 1.12 | [ ] | Create barrel exports for entities | 1 | `import { Workflow, Phase } from '@chainglass/workflow'` works | - | packages/workflow/src/entities/index.ts |
| 1.13 | [ ] | Create barrel exports for interfaces | 1 | IWorkflowAdapter, IPhaseAdapter exported from packages/workflow/src/interfaces/index.ts | - | |

### Test Examples (Write First!)

```typescript
// test/unit/workflow/workflow-entity.test.ts
describe('Workflow entity (unified model)', () => {
  it('should load from current/ as editable template', () => {
    /*
    Test Doc:
    - Why: current/ is the editable working copy of a workflow
    - Contract: isCurrent=true, checkpoint=undefined, run=undefined
    - Usage Notes: Phases exist but have unpopulated runtime values
    - Quality Contribution: Ensures template vs run distinction is clear
    - Worked Example: Load from current/ → workflow.isCurrent === true
    */
    const workflow = new Workflow({
      slug: 'hello-workflow',
      workflowDir: '.chainglass/workflows/hello-workflow/current',
      version: '1.0.0',
      isCurrent: true,
      phases: [/* phase definitions with unpopulated values */],
    });

    expect(workflow.isCurrent).toBe(true);
    expect(workflow.isCheckpoint).toBe(false);
    expect(workflow.isRun).toBe(false);
    expect(workflow.checkpoint).toBeUndefined();
    expect(workflow.run).toBeUndefined();
  });

  it('should load from checkpoint/ with version metadata', () => {
    /*
    Test Doc:
    - Why: Checkpoints are immutable versioned snapshots
    - Contract: isCheckpoint=true, checkpoint metadata populated
    - Usage Notes: Same structure as current/, just frozen
    - Quality Contribution: Ensures checkpoint metadata preserved
    - Worked Example: Load from checkpoint/ → workflow.checkpoint.hash exists
    */
    const workflow = new Workflow({
      slug: 'hello-workflow',
      workflowDir: '.chainglass/workflows/hello-workflow/checkpoints/v001-abc123',
      version: '1.0.0',
      isCurrent: false,
      checkpoint: { ordinal: 1, hash: 'abc123', createdAt: new Date(), comment: 'Initial' },
      phases: [/* same structure, unpopulated values */],
    });

    expect(workflow.isCurrent).toBe(false);
    expect(workflow.isCheckpoint).toBe(true);
    expect(workflow.isRun).toBe(false);
    expect(workflow.checkpoint?.hash).toBe('abc123');
  });

  it('should load from run/ with runtime state', () => {
    /*
    Test Doc:
    - Why: Runs have actual execution state and populated values
    - Contract: isRun=true, run metadata populated, phases have runtime values
    - Usage Notes: Phases will have exists/valid/answered populated
    - Quality Contribution: Ensures run state is properly captured
    - Worked Example: Load from run/ → workflow.run.status exists, phases populated
    */
    const workflow = new Workflow({
      slug: 'hello-workflow',
      workflowDir: '.chainglass/runs/hello-workflow/v001-abc123/run-2026-01-25-001',
      version: '1.0.0',
      isCurrent: false,
      checkpoint: { ordinal: 1, hash: 'abc123', createdAt: new Date() },
      run: { runId: 'run-2026-01-25-001', runDir: '...', status: 'active', createdAt: new Date() },
      phases: [/* same structure, but with populated runtime values */],
    });

    expect(workflow.isCurrent).toBe(false);
    expect(workflow.isCheckpoint).toBe(false);
    expect(workflow.isRun).toBe(true);
    expect(workflow.run?.status).toBe('active');
  });
});

// test/unit/workflow/phase-entity.test.ts
describe('Phase entity', () => {
  it('should track input file exists status', () => {
    /*
    Test Doc:
    - Why: Phase must show complete filesystem state including which files exist
    - Contract: inputFiles[].exists reflects actual filesystem state
    - Usage Notes: exists is set by PhaseAdapter when loading from path
    - Quality Contribution: Catches UI showing missing files as present
    - Worked Example: Phase with 2 inputs, 1 exists → inputFiles[0].exists=true, [1].exists=false
    */
    const phase = new Phase({
      name: 'gather',
      phaseDir: '/run/phases/gather',
      runDir: '/run',
      description: 'Gather data',
      order: 1,
      inputFiles: [
        { name: 'request.md', required: true, exists: true, path: '/run/phases/gather/run/inputs/files/request.md' },
        { name: 'context.json', required: false, exists: false, path: '/run/phases/gather/run/inputs/files/context.json' },
      ],
      // ... other fields
    });

    expect(phase.inputFiles[0].exists).toBe(true);
    expect(phase.inputFiles[1].exists).toBe(false);
  });

  it('should track output validation status', () => {
    /*
    Test Doc:
    - Why: Phase outputs may exist but fail schema validation
    - Contract: outputs[].exists and outputs[].valid are independent flags
    - Usage Notes: valid is only meaningful if exists is true
    - Quality Contribution: Catches invalid outputs being treated as complete
    - Worked Example: Output exists but fails schema → exists=true, valid=false
    */
    const phase = new Phase({
      name: 'gather',
      // ...
      outputs: [
        { name: 'response.md', type: 'file', required: true, exists: true, valid: true, path: '...' },
        { name: 'data.json', type: 'file', required: true, schema: 'data.schema.json', exists: true, valid: false, path: '...' },
      ],
    });

    expect(phase.outputs[0].valid).toBe(true);
    expect(phase.outputs[1].exists).toBe(true);
    expect(phase.outputs[1].valid).toBe(false);  // Exists but invalid
  });

  it('should track message answered status', () => {
    /*
    Test Doc:
    - Why: Messages may exist but not yet be answered
    - Contract: inputMessages[].exists and inputMessages[].answered are independent
    - Usage Notes: answered is only meaningful if exists is true
    - Quality Contribution: Catches unanswered required messages blocking progress
    - Worked Example: Message exists, not answered → exists=true, answered=false
    */
    const phase = new Phase({
      name: 'gather',
      // ...
      inputMessages: [
        { id: '001', type: 'free_text', from: 'orchestrator', required: true, subject: 'Request', exists: true, answered: true },
        { id: '002', type: 'single_choice', from: 'agent', required: true, subject: 'Question', exists: true, answered: false },
      ],
    });

    expect(phase.inputMessages[0].answered).toBe(true);
    expect(phase.inputMessages[1].exists).toBe(true);
    expect(phase.inputMessages[1].answered).toBe(false);
  });
});
```

### Non-Happy-Path Coverage
- [ ] EntityNotFoundError with all optional fields
- [ ] Entity with undefined optional properties
- [ ] toJSON() excludes undefined fields cleanly

### Commands

```bash
# Run entity tests
pnpm test --filter @chainglass/workflow -- --grep "entity"

# Run error class tests
pnpm test --filter @chainglass/workflow -- --grep "EntityNotFoundError"

# Type check
pnpm typecheck --filter @chainglass/workflow

# Verify exports work
pnpm build --filter @chainglass/workflow
```

### Acceptance Criteria
- [ ] All 14 tasks complete (including 1.2b error classes)
- [ ] All entity tests passing (`pnpm test --filter @chainglass/workflow`)
- [ ] TypeScript strict mode passes (`pnpm typecheck`)
- [ ] No adapter references in entity classes
- [ ] Entities only have readonly properties + computed getters
- [ ] Unified Workflow model works for current/checkpoint/run sources
- [ ] CLI error classes E040-E049 created and tested

---

## Phase 2: Fake Adapters

**Objective**: Create fake implementations for entity adapters to enable TDD of production adapters.

**Deliverables**:
- FakeWorkflowAdapter (unified: handles current, checkpoint, and run)
- FakePhaseAdapter (unified: handles template and run phases)
- Test helper methods (setWorkflow, setPhase, simulateError, reset)
- Fakes registered in test containers

**Dependencies**: Phase 1 complete (interfaces defined)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Fake diverges from real | Medium | High | Contract tests in Phase 3 |
| Missing test helpers | Low | Medium | Add as needed during Phase 3 |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Write tests for FakeWorkflowAdapter | 2 | Tests: setWorkflow (current/checkpoint/run variants), fromCurrent, fromCheckpoint, fromRun, listCheckpoints, listRuns with filters | - | Follow FakeFileSystem pattern |
| 2.2 | [ ] | Implement FakeWorkflowAdapter | 3 | All tests from 2.1 pass, handles all three source types | - | packages/workflow/src/fakes/fake-workflow-adapter.ts |
| 2.3 | [ ] | Write tests for FakePhaseAdapter | 2 | Tests: setPhase, fromPath, listForWorkflow (works for template and run workflows) | - | |
| 2.4 | [ ] | Implement FakePhaseAdapter | 2 | All tests from 2.3 pass | - | packages/workflow/src/fakes/fake-phase-adapter.ts |
| 2.5 | [ ] | Register fakes in workflow test container | 2 | createWorkflowTestContainer() resolves both adapters. Verify: `container.resolve(WORKFLOW_DI_TOKENS.WORKFLOW_ADAPTER)` returns FakeWorkflowAdapter | - | packages/workflow/src/container.ts |
| 2.6 | [ ] | Register fakes in CLI test container | 2 | createCliTestContainer() resolves both adapters | - | apps/cli/src/lib/container.ts |
| 2.7 | [ ] | Write container resolution tests | 1 | Tests verify both adapters resolve from test container | - | test/unit/workflow/container.test.ts |
| 2.8 | [ ] | Create barrel exports for fakes | 1 | FakeWorkflowAdapter, FakePhaseAdapter exported from packages/workflow/src/fakes/index.ts | - | |

### Test Examples (Write First!)

```typescript
// test/unit/workflow/fake-workflow-adapter.test.ts
describe('FakeWorkflowAdapter', () => {
  let adapter: FakeWorkflowAdapter;

  beforeEach(() => {
    adapter = new FakeWorkflowAdapter();
  });

  it('should return empty array when no runs set', async () => {
    /*
    Test Doc:
    - Why: Empty state must be handled gracefully
    - Contract: listRuns() returns [] when no runs exist
    - Usage Notes: Use setWorkflow() with run metadata to populate
    - Quality Contribution: Catches null reference errors
    - Worked Example: new FakeWorkflowAdapter().listRuns('hello-wf') → []
    */
    const runs = await adapter.listRuns('hello-wf');
    expect(runs).toEqual([]);
  });

  it('should filter runs by status', async () => {
    /*
    Test Doc:
    - Why: cg runs list --status flag requires filtering
    - Contract: listRuns() with status filter returns only matching runs
    - Usage Notes: Filter applied to run.status property
    - Quality Contribution: Catches filter logic bugs
    - Worked Example: 2 runs (active, complete), filter active → 1 run
    */
    adapter.setWorkflow(createWorkflowRun({ slug: 'hello-wf', runStatus: 'active' }));
    adapter.setWorkflow(createWorkflowRun({ slug: 'hello-wf', runStatus: 'complete' }));

    const filtered = await adapter.listRuns('hello-wf', { status: 'active' });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].run?.status).toBe('active');
  });

  it('should load workflow from current/', async () => {
    /*
    Test Doc:
    - Why: Current is the editable template
    - Contract: fromCurrent() returns workflow with isCurrent=true
    - Usage Notes: Template phases have unpopulated values
    - Quality Contribution: Ensures current vs checkpoint distinction
    - Worked Example: fromCurrent('hello-wf') → workflow.isCurrent === true
    */
    adapter.setWorkflow(createWorkflowCurrent({ slug: 'hello-wf' }));

    const workflow = await adapter.fromCurrent('hello-wf');

    expect(workflow.isCurrent).toBe(true);
    expect(workflow.isCheckpoint).toBe(false);
    expect(workflow.isRun).toBe(false);
  });

  it('should load workflow from checkpoint/', async () => {
    /*
    Test Doc:
    - Why: Checkpoints are frozen templates
    - Contract: fromCheckpoint() returns workflow with checkpoint metadata
    - Usage Notes: Same structure as current, just frozen
    - Quality Contribution: Ensures checkpoint metadata preserved
    - Worked Example: fromCheckpoint('hello-wf', 'v001') → workflow.checkpoint.ordinal === 1
    */
    adapter.setWorkflow(createWorkflowCheckpoint({ slug: 'hello-wf', ordinal: 1, hash: 'abc123' }));

    const workflow = await adapter.fromCheckpoint('hello-wf', 'v001-abc123');

    expect(workflow.isCheckpoint).toBe(true);
    expect(workflow.checkpoint?.ordinal).toBe(1);
  });
});
```

### Non-Happy-Path Coverage
- [ ] simulateError() causes adapter methods to throw
- [ ] reset() clears all stored entities
- [ ] Non-existent workflow returns undefined (fromCurrent on unknown slug)

### Commands

```bash
# Run fake adapter tests
pnpm test --filter @chainglass/workflow -- --grep "Fake"

# Verify container registration
pnpm test --filter @chainglass/workflow -- --grep "container"

# Type check
pnpm typecheck --filter @chainglass/workflow
```

### Acceptance Criteria
- [ ] All 8 tasks complete
- [ ] All fake tests passing (`pnpm test --filter @chainglass/workflow -- --grep "Fake"`)
- [ ] Fakes resolve from test containers (container test passes)
- [ ] Each fake has setWorkflow, setPhase, reset helpers
- [ ] Fakes implement same interface as production adapters

---

## Phase 3: Production Adapters

**Objective**: Implement real adapters that hydrate entities from filesystem and provide navigation.

**Deliverables**:
- WorkflowAdapter (unified: handles current/, checkpoints/, runs/)
- PhaseAdapter (unified: handles template and run phases)
- Contract tests verifying fake/real parity
- Adapters registered in production containers

**Dependencies**: Phase 1 (interfaces), Phase 2 (fakes for testing)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Filesystem structure assumptions wrong | Low | High | Validate against existing runs |
| Path security vulnerability | Low | Critical | Mandatory pathResolver.join() |
| Performance with many runs | Medium | Medium | Filter before hydration |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Write tests for WorkflowAdapter.fromCurrent() | 2 | Tests: loads from current/, returns Workflow with isCurrent=true, phases unpopulated | - | Use FakeFileSystem |
| 3.2 | [ ] | Write tests for WorkflowAdapter.fromCheckpoint() | 2 | Tests: loads from checkpoints/vXXX-hash/, returns Workflow with checkpoint metadata | - | |
| 3.3 | [ ] | Write tests for WorkflowAdapter.fromRun() | 2 | Tests: loads from runs/, returns Workflow with run metadata, phases have runtime state | - | |
| 3.4 | [ ] | Write tests for WorkflowAdapter.listCheckpoints() | 2 | Tests: lists checkpoints sorted by ordinal desc | - | |
| 3.5 | [ ] | Write tests for WorkflowAdapter.listRuns() | 3 | Tests: lists runs with status/workflow filters, filters applied before hydration | - | Critical for CLI |
| 3.6 | [ ] | Implement WorkflowAdapter | 4 | All tests from 3.1-3.5 pass, uses pathResolver, handles all three sources | - | packages/workflow/src/adapters/workflow.adapter.ts |
| 3.7 | [ ] | Write tests for PhaseAdapter.fromPath() | 2 | Tests: loads phase from path, populates exists/valid/answered flags | - | |
| 3.8 | [ ] | Write tests for PhaseAdapter.listForWorkflow() | 2 | Tests: lists all phases for a workflow (template or run) | - | |
| 3.9 | [ ] | Implement PhaseAdapter | 3 | All tests from 3.7-3.8 pass | - | packages/workflow/src/adapters/phase.adapter.ts |
| 3.10 | [ ] | Create contract test factory for WorkflowAdapter | 2 | Single test suite runs against fake AND real | - | test/contracts/workflow-adapter.contract.test.ts |
| 3.11 | [ ] | Create contract test factory for PhaseAdapter | 2 | Single test suite runs against fake AND real | - | test/contracts/phase-adapter.contract.test.ts |
| 3.12 | [ ] | Run contract tests for WorkflowAdapter | 1 | Fake and real pass identical tests | - | |
| 3.13 | [ ] | Run contract tests for PhaseAdapter | 1 | Fake and real pass identical tests | - | |
| 3.14 | [ ] | Write graph navigation integration tests | 2 | Test: Workflow (run) → phases, Phase → parent Workflow | - | test/unit/workflow/entity-navigation.test.ts |
| 3.15 | [ ] | Register adapters in workflow production container | 2 | createWorkflowProductionContainer() resolves both adapters | - | |
| 3.16 | [ ] | Register adapters in CLI production container | 2 | createCliProductionContainer() resolves both adapters | - | |
| 3.17 | [ ] | Create barrel exports for adapters | 1 | WorkflowAdapter, PhaseAdapter exported from packages/workflow/src/adapters/index.ts | - | |

### Test Examples (Write First!)

```typescript
// test/unit/workflow/workflow-adapter.test.ts
describe('WorkflowAdapter', () => {
  let adapter: WorkflowAdapter;
  let fakeFs: FakeFileSystem;
  let pathResolver: IPathResolver;

  beforeEach(() => {
    fakeFs = new FakeFileSystem();
    pathResolver = new PathResolverAdapter('/test');
    adapter = new WorkflowAdapter(fakeFs, pathResolver);
  });

  it('should load workflow from current/ as editable template', async () => {
    /*
    Test Doc:
    - Why: current/ is the working copy for edits
    - Contract: fromCurrent() returns Workflow with isCurrent=true, phases unpopulated
    - Usage Notes: Template phases have exists=false, values undefined
    - Quality Contribution: Ensures template vs run distinction
    - Worked Example: current/wf.yaml → workflow.isCurrent=true
    */
    const currentDir = '/test/.chainglass/workflows/hello-wf/current';
    fakeFs.setFile(`${currentDir}/wf.yaml`, YAML.stringify({
      name: 'hello-wf', version: '1.0.0', phases: [{ name: 'gather' }]
    }));

    const workflow = await adapter.fromCurrent('hello-wf');

    expect(workflow.isCurrent).toBe(true);
    expect(workflow.isCheckpoint).toBe(false);
    expect(workflow.isRun).toBe(false);
    expect(workflow.phases[0].inputFiles[0]?.exists).toBe(false);  // Unpopulated
  });

  it('should load workflow from run/ with runtime state', async () => {
    /*
    Test Doc:
    - Why: Core functionality - entity hydration from run filesystem
    - Contract: fromRun() reads wf-status.json and returns Workflow with run metadata
    - Usage Notes: Phases have populated exists/valid/answered flags
    - Quality Contribution: Catches JSON parse errors, missing fields
    - Worked Example: runDir with valid wf-status.json → Workflow.isRun=true
    */
    const runDir = '/test/.chainglass/runs/hello-wf/v001-abc123/run-2026-01-25-001';
    fakeFs.setFile(`${runDir}/wf-run/wf-status.json`, JSON.stringify({
      workflow: { slug: 'hello-wf', version: '1.0.0', version_hash: 'abc123' },
      run: { id: 'run-2026-01-25-001', status: 'active', created_at: '2026-01-25T10:00:00Z' },
      phases: { gather: { order: 1, status: 'complete' } }
    }));

    const workflow = await adapter.fromRun(runDir);

    expect(workflow.isRun).toBe(true);
    expect(workflow.run?.runId).toBe('run-2026-01-25-001');
    expect(workflow.run?.status).toBe('active');
    expect(workflow.checkpoint?.hash).toBe('abc123');
  });

  it('should throw EntityNotFoundError when wf-status.json missing', async () => {
    /*
    Test Doc:
    - Why: Fail fast on corrupt data per spec Q6
    - Contract: fromRun() throws EntityNotFoundError when required file missing
    - Usage Notes: Catch and handle or let propagate
    - Quality Contribution: Catches silent failures
    - Worked Example: runDir without wf-status.json → throws EntityNotFoundError
    */
    const runDir = '/test/.chainglass/runs/hello-wf/v001-abc/run-missing';
    // No file set

    await expect(adapter.fromRun(runDir))
      .rejects.toThrow(EntityNotFoundError);
  });

  it('should list runs with status filter', async () => {
    /*
    Test Doc:
    - Why: cg runs list --status requires filtering
    - Contract: listRuns() with status filter returns only matching runs
    - Usage Notes: Filter applied before hydration for performance
    - Quality Contribution: Catches filter bugs
    - Worked Example: 2 runs (active, complete), filter active → 1 run
    */
    // Setup: create 2 runs with different statuses
    // ... filesystem setup ...

    const filtered = await adapter.listRuns('hello-wf', { status: 'active' });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].run?.status).toBe('active');
  });
});
```

### Non-Happy-Path Coverage
- [ ] EntityNotFoundError on missing wf-status.json
- [ ] EntityNotFoundError on malformed JSON
- [ ] Empty list when no runs exist
- [ ] Filter returns empty array when no matches
- [ ] Non-existent workflow returns undefined for fromCurrent()

### Commands

```bash
# Run all workflow package tests
pnpm test --filter @chainglass/workflow

# Run specific adapter tests
pnpm test --filter @chainglass/workflow -- --grep "WorkflowAdapter"

# Run contract tests
pnpm test --filter @chainglass/workflow -- --grep "contract"

# Verify TypeScript compiles
pnpm typecheck --filter @chainglass/workflow

# Verify linting passes
pnpm lint --filter @chainglass/workflow

# Build package
pnpm build --filter @chainglass/workflow
```

### Acceptance Criteria
- [ ] All 17 tasks complete
- [ ] All adapter tests passing (`pnpm test --filter @chainglass/workflow`)
- [ ] Contract tests pass for fake AND real (WorkflowAdapter and PhaseAdapter)
- [ ] All adapters use pathResolver.join() (code review verified)
- [ ] Graph navigation test passes (Workflow → phases, Phase → parent Workflow)
- [ ] TypeScript strict mode passes (`pnpm typecheck`)

---

## Phase 4: CLI `cg runs` Commands

**Objective**: Add `cg runs list` and `cg runs get` commands using the unified WorkflowAdapter.

**Deliverables**:
- `registerRunsCommands()` function
- `cg runs list` with --workflow, --status, -o flags
- `cg runs get <run-id>` command
- Console and JSON output formatting

**Dependencies**: Phase 3 complete (WorkflowAdapter implemented with listRuns/fromRun)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Command name collision | Low | Medium | Separate registerRunsCommands() |
| Output format inconsistency | Low | Low | Follow existing workflow command patterns |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Write tests for registerRunsCommands() | 2 | Tests: commands registered, no collision with workflow commands | - | test/unit/cli/runs-command.test.ts |
| 4.2 | [ ] | Create registerRunsCommands() function | 1 | Function exists, empty handlers | - | apps/cli/src/commands/runs.command.ts |
| 4.3 | [ ] | Write tests for `cg runs list` handler | 2 | Tests: calls workflowAdapter.listRuns(), returns runs | - | |
| 4.4 | [ ] | Implement `cg runs list` handler | 2 | Uses IWorkflowAdapter.listRuns(), formats output | - | |
| 4.5 | [ ] | Write tests for --workflow filter | 1 | Tests: filter passed to adapter.list() | - | |
| 4.6 | [ ] | Add --workflow filter flag | 1 | Filter applied, only matching runs shown | - | |
| 4.7 | [ ] | Write tests for --status filter | 1 | Tests: filter passed to adapter.list() | - | |
| 4.8 | [ ] | Add --status filter flag | 1 | Filter applied, only matching runs shown | - | |
| 4.9 | [ ] | Write tests for -o json output | 1 | Tests: JSON array output matches Run.toJSON() | - | |
| 4.10 | [ ] | Add -o/--output format flag | 1 | Supports: table (default), json, wide, name | - | |
| 4.11 | [ ] | Write tests for `cg runs get` handler | 2 | Tests: finds run by ID, shows details | - | |
| 4.12 | [ ] | Implement `cg runs get <run-id>` | 2 | Shows run details including phases | - | |
| 4.13 | [ ] | Write tests for runs.list console formatter | 1 | Tests: table headers, column alignment, data rendering | - | TDD for formatter |
| 4.14 | [ ] | Add console output formatter for runs.list | 2 | Table format: NAME, WORKFLOW, VERSION, STATUS, AGE | - | Follow workflow list pattern |
| 4.15 | [ ] | Write tests for runs.get console formatter | 1 | Tests: detailed view layout, phase list rendering | - | TDD for formatter |
| 4.16 | [ ] | Add console output formatter for runs.get | 2 | Detailed view with phases | - | |
| 4.17 | [ ] | Register runs commands in CLI entry point | 1 | `cg runs list` works | - | apps/cli/src/cli.ts, add after registerWorkflowCommands() |
| 4.18 | [ ] | Integration test: full CLI roundtrip | 2 | Test creates run, lists it, gets it | - | test/integration/cli/runs-cli.integration.test.ts |

### Test Examples (Write First!)

```typescript
// test/unit/cli/runs-command.test.ts
describe('cg runs list', () => {
  let fakeWorkflowAdapter: FakeWorkflowAdapter;
  let handler: RunsListHandler;

  beforeEach(() => {
    fakeWorkflowAdapter = new FakeWorkflowAdapter();
    handler = new RunsListHandler(fakeWorkflowAdapter);
  });

  it('should list all runs when no filters provided', async () => {
    /*
    Test Doc:
    - Why: Default behavior shows all runs
    - Contract: listRuns() with no args returns all runs
    - Usage Notes: Default format is table
    - Quality Contribution: Catches filter bugs that hide runs
    - Worked Example: 3 runs exist → 3 runs displayed
    */
    fakeWorkflowAdapter.setWorkflow(createWorkflowRun({ slug: 'hello-wf', runId: 'run-001' }));
    fakeWorkflowAdapter.setWorkflow(createWorkflowRun({ slug: 'hello-wf', runId: 'run-002' }));

    const result = await handler.execute({});

    expect(result.runs).toHaveLength(2);
  });

  it('should filter runs by workflow', async () => {
    /*
    Test Doc:
    - Why: --workflow flag must filter correctly
    - Contract: Only runs matching workflow slug returned
    - Usage Notes: Exact match on slug
    - Quality Contribution: Catches filter propagation bugs
    - Worked Example: --workflow hello-wf → only hello-wf runs
    */
    fakeWorkflowAdapter.setWorkflow(createWorkflowRun({ slug: 'hello-wf', runId: 'run-001' }));
    fakeWorkflowAdapter.setWorkflow(createWorkflowRun({ slug: 'other-wf', runId: 'run-002' }));

    const result = await handler.execute({ workflow: 'hello-wf' });

    expect(result.runs).toHaveLength(1);
    expect(result.runs[0].slug).toBe('hello-wf');
  });
});
```

### Non-Happy-Path Coverage
- [ ] No runs exist → empty table, no error
- [ ] Invalid --status value → helpful error message
- [ ] Run not found for `cg runs get` → error code, message

### Commands

```bash
# Run CLI tests
pnpm test --filter @chainglass/cli

# Run specific runs command tests
pnpm test --filter @chainglass/cli -- --grep "runs"

# Smoke test CLI commands
pnpm --filter @chainglass/cli exec cg runs list --help
pnpm --filter @chainglass/cli exec cg runs get --help

# Integration test (requires built CLI)
pnpm build --filter @chainglass/cli
pnpm --filter @chainglass/cli exec cg runs list

# Full quality check
pnpm typecheck --filter @chainglass/cli
pnpm lint --filter @chainglass/cli
```

### Acceptance Criteria
- [ ] All 18 tasks complete
- [ ] `cg runs list` shows table of runs
- [ ] `cg runs list --workflow hello-wf` filters correctly
- [ ] `cg runs list --status failed` filters correctly
- [ ] `cg runs list -o json` outputs valid JSON array
- [ ] `cg runs get run-001` shows detailed run info
- [ ] Error codes E040-E049 used for run command errors (see packages/workflow/src/errors/)
- [ ] All tests passing (`pnpm test --filter @chainglass/cli`)

---

## Phase 5: Documentation

**Objective**: Document entity architecture for developers extending the system.

**Deliverables**:
- `docs/how/workflows/6-entity-architecture.md` - Entity graph overview and navigation patterns
- Updated `docs/how/workflows/3-cli-reference.md` with `cg runs` commands

**Dependencies**: Phase 4 complete (commands implemented)

**Discovery & Placement Decision**:
- **Existing**: `docs/how/workflows/` has files 1-5 covering overview, authoring, CLI, MCP, management
- **Decision**: Add new file `6-entity-architecture.md` (next number in sequence)
- **Update**: Extend `3-cli-reference.md` with new runs commands

### Tasks (Lightweight Approach for Documentation)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 5.1 | [ ] | Survey existing docs/how/workflows/ files | 1 | Documented current structure | - | |
| 5.2 | [ ] | Create docs/how/workflows/6-entity-architecture.md | 2 | Overview, navigation patterns, adapter usage, entry points | - | |
| 5.3 | [ ] | Update docs/how/workflows/3-cli-reference.md | 2 | Add `cg runs list` and `cg runs get` sections | - | |
| 5.4 | [ ] | Review documentation for clarity | 1 | Peer review passed | - | |

### Content Outlines

**docs/how/workflows/6-entity-architecture.md**:
- Introduction: Why entities exist (vs DTOs)
- Key Invariants (unified model principles)
- Unified Workflow model: current, checkpoint, and run are all Workflows (same structure, different populated state)
- Phase entity: same structure for template and run phases (values populated or not)
- Adapter Method Decision Tree (when to use which method)
- Code examples for common operations
- Testing with fake adapters (FakeWorkflowAdapter, FakePhaseAdapter)
- JSON Output Format: camelCase convention, TypeScript types for web
- Common Pitfalls section (avoid async on entities, use adapters for hydration)

**docs/how/workflows/3-cli-reference.md** additions:
- `cg runs list` command with flags
- `cg runs get <run-id>` command
- Output format examples
- Filtering examples

### Commands

```bash
# Check for broken links in documentation
find docs/how/workflows -name "*.md" -exec grep -l "\[.*\](.*)" {} \; | xargs -I {} sh -c 'echo "Checking {}"; cat {} | grep -oE "\[.*\]\([^)]+\)"'

# Verify markdown formatting (if markdownlint installed)
npx markdownlint docs/how/workflows/*.md || echo "markdownlint not installed, skipping"
```

### Acceptance Criteria
- [ ] All 4 tasks complete
- [ ] `6-entity-architecture.md` covers navigation patterns
- [ ] CLI reference updated with runs commands
- [ ] No broken links (manually verified or via link checker)
- [ ] Code examples in docs compile (copy-paste test)

---

## Phase 6: Service Unification & Validation

**Objective**: Update services to use entity adapters internally, ensure CLI/MCP output uses entities via `toJSON()`, deprecate DTOs, and **validate the entire refactor via manual test harnesses**.

**Deliverables**:
- Services refactored to inject and use entity adapters
- Services return entities instead of DTOs
- CLI/MCP commands format entities via `toJSON()`
- DTOs (`PrepareResult`, `ValidateResult`, etc.) deprecated
- **Entity-specific test harness created (`entity-test/`)**
- **Both manual test harnesses pass (existing + entity-specific)**
- MCP tools return entity JSON format

**Dependencies**: Phase 3 (adapters), Phase 4 (CLI commands), Phase 5 (docs)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing CLI output format | High | Medium | Ensure `toJSON()` matches current output shape where possible |
| MCP tool output changes | High | Medium | Version MCP tools or ensure backward compatible |
| Service test updates | Medium | Low | Update tests to use entities |
| Manual test regression | Low | High | Run BOTH existing and entity-specific harnesses |

### Tasks (Full TDD Approach - Validation Harnesses First)

**TDD Discipline**: Per spec, validation harnesses define expected behavior BEFORE implementation. Tasks 6.1-6.4 create harnesses and expected outputs, then tasks 6.5-6.17 implement against those harnesses, then tasks 6.18-6.22 execute final validation gates.

#### Part A: Define Expected Behavior (Harness Creation)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 6.1 | [ ] | **Create entity-test/ harness structure** | 2 | Directory with: 01-entity-hydration.sh, 02-entity-navigation.sh, 03-entity-json-format.sh, 04-runs-commands.sh | - | **TDD: Define expected behavior first** |
| 6.2 | [ ] | **Create entity-test/MODE-1-ENTITY-E2E.md guide** | 2 | Covers: adapter loading, entity.toJSON() verification, `cg runs` commands | - | **TDD: Test guide before implementation** |
| 6.3 | [ ] | **Create entity-test/expected-outputs/*.json** | 2 | JSON schemas for: workflow-current.json, workflow-checkpoint.json, workflow-run.json, phase-complete.json | - | **TDD: Expected outputs define pass criteria** |
| 6.4 | [ ] | Update manual-test/ harness assertions for entity JSON | 2 | Scripts updated to validate new entity JSON output format (syntax only, not logic) | - | manual-test/*.sh assertions |

#### Part B: Service & CLI Implementation (Against Harnesses)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 6.5 | [ ] | Write tests for PhaseService using PhaseAdapter | 2 | Tests: prepare() returns Phase entity with full data model | - | Refactor existing tests |
| 6.6 | [ ] | Refactor PhaseService.prepare() to use PhaseAdapter | 3 | Returns `Phase` entity, all existing CLI behavior preserved | - | packages/workflow/src/services/phase.service.ts |
| 6.7 | [ ] | Refactor PhaseService.validate() to use PhaseAdapter | 2 | Returns `Phase` entity with outputs[].exists/valid | - | |
| 6.8 | [ ] | Refactor PhaseService.finalize() to use PhaseAdapter | 2 | Returns `Phase` entity with outputParameters[].value | - | |
| 6.9 | [ ] | Refactor PhaseService.accept/handover() to use PhaseAdapter | 2 | Returns `Phase` entity | - | |
| 6.10 | [ ] | Write tests for WorkflowService using adapters | 2 | Tests: compose() returns Workflow entity (with run metadata) | - | |
| 6.11 | [ ] | Refactor WorkflowService.compose() to use WorkflowAdapter | 3 | Returns `Workflow` entity (isRun=true) with phases | - | |
| 6.12 | [ ] | Refactor WorkflowService.info() to use WorkflowAdapter | 2 | Returns `Workflow` entity | - | |
| 6.13 | [ ] | Update CLI workflow commands to use entity.toJSON() | 2 | Output format MUST be backward compatible (no breaking changes) | - | apps/cli/src/commands/workflow.command.ts |
| 6.14 | [ ] | Update CLI phase commands to use entity.toJSON() | 2 | Output format MUST be backward compatible (no breaking changes) | - | apps/cli/src/commands/phase.command.ts |
| 6.15 | [ ] | Update MCP phase tools to return entity.toJSON() | 2 | `phase_prepare`, `phase_validate`, `phase_finalize` return entity JSON | - | packages/mcp-server/src/tools/ |
| 6.16 | [ ] | Update MCP workflow tools to return entity.toJSON() | 2 | `wf_compose` returns Workflow entity JSON (with run metadata) | - | |
| 6.17 | [ ] | Deprecate DTO types with @deprecated JSDoc | 1 | `PrepareResult`, `ValidateResult`, etc. marked deprecated | - | |

#### Part C: Validation Gate Execution (Pass/Fail Gates)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|-----|--------|------|----|------------------|-----|-------|
| 6.18 | [ ] | **VALIDATION GATE 1: Execute manual-test/ harness** | 2 | All MODE-1 steps pass - proves backward compatibility | - | **BLOCKING: Must pass before merge** |
| 6.19 | [ ] | **VALIDATION GATE 2: Execute entity-test/ harness** | 2 | All entity-specific validations pass | - | **BLOCKING: Must pass before merge** |
| 6.20 | [ ] | Execute MODE-2-AGENT-VALIDATION test | 2 | External agent can work with entity JSON | - | Optional: Can defer if agent unavailable |
| 6.21 | [ ] | Update 4-mcp-reference.md with entity output examples | 2 | MCP docs show entity JSON format | - | docs/how/workflows/4-mcp-reference.md |
| 6.22 | [ ] | **Final verification: All automated tests pass** | 1 | `pnpm test` exits 0 with all tests green | - | **BLOCKING: CI gate** |

### Entity Test Harness Structure

**Location**: `entity-test/` (parallel to existing `manual-test/`)

```
entity-test/
├── 01-entity-hydration.sh     # Test WorkflowAdapter.fromRun(), fromCurrent(), fromCheckpoint()
├── 02-entity-navigation.sh    # Test Workflow → phases[], Phase → parent workflow
├── 03-entity-json-format.sh   # Validate entity.toJSON() output shape
├── 04-runs-commands.sh        # Test `cg runs list`, `cg runs get`
├── check-entity-state.sh      # Comprehensive entity state reporter
├── MODE-1-ENTITY-E2E.md       # Step-by-step entity validation guide
├── expected-outputs/          # Expected JSON shapes for validation
│   ├── workflow-current.json
│   ├── workflow-checkpoint.json
│   ├── workflow-run.json
│   └── phase-complete.json
└── results/                   # Test run outputs (gitignored)
    └── .gitignore
```

**Validation Gate Requirements**:
1. **GATE 1**: `manual-test/` MODE-1 passes (backward compatibility)
2. **GATE 2**: `entity-test/` all scripts pass (entity correctness)
3. Both gates must pass before merge

### Commands

```bash
# Run service tests
pnpm test --filter @chainglass/workflow -- --grep "Service"

# Run MCP tests
pnpm test --filter @chainglass/mcp-server

# Full integration test
pnpm test

# Existing manual test execution (backward compat)
cd manual-test && ./01-clean-slate.sh && ./02-init-project.sh && ...

# Entity test execution
cd entity-test && ./01-entity-hydration.sh && ./02-entity-navigation.sh && ...

# Verify CLI output unchanged
pnpm --filter @chainglass/cli exec cg workflow compose hello-wf | jq .

# Verify entity JSON format
pnpm --filter @chainglass/cli exec cg runs list -o json | jq '.runs[0].isRun'
```

### Acceptance Criteria

**Behavioral Assertions** (testable by unit/integration tests):
- [ ] All 22 tasks complete (Part A: 4, Part B: 13, Part C: 5)
- [ ] Services return entities, not DTOs
- [ ] CLI output format is **100% backward compatible** - no breaking changes allowed
- [ ] MCP tool output is entity.toJSON()
- [ ] DTOs marked @deprecated
- [ ] All automated tests passing (`pnpm test`)

**Validation Gates** (blocking merge):
- [ ] **GATE 1 PASS**: `manual-test/` MODE-1 all steps pass (proves backward compat)
- [ ] **GATE 2 PASS**: `entity-test/` all scripts pass (proves entity correctness)
- [ ] **GATE 3 PASS**: CI pipeline green (`pnpm test && pnpm typecheck && pnpm lint`)

**Optional** (can defer with documented reason):
- [ ] MODE-2-AGENT-VALIDATION passes (requires external agent)

---

## Cross-Cutting Concerns

### Security Considerations

**Path Security**:
- All adapters MUST use `IPathResolver.join()` for path operations
- Never use `path.join()` or string concatenation for paths
- Code review gate: any PR touching adapters requires path security review

**Input Validation**:
- Workflow slug validated against pattern `^[a-z][a-z0-9-]*$`
- Run ID validated against pattern `^run-\d{4}-\d{2}-\d{2}-\d{3}$`

### Observability

**Logging Strategy**:
- Adapters log at DEBUG level for fromPath/list operations
- Adapters log at WARN level for EntityNotFoundError
- CLI commands log at INFO level for successful operations

### Error Tracking

**Error Codes for Runs Commands**:
| Code | Name | HTTP Status | Description |
|------|------|-------------|-------------|
| E040 | RUN_NOT_FOUND | 404 | Run with specified ID not found |
| E041 | RUNS_DIR_NOT_FOUND | 404 | Runs directory does not exist |
| E042 | INVALID_RUN_STATUS | 400 | Invalid status filter value |
| E043 | RUN_CORRUPT | 500 | Run exists but wf-status.json invalid |

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| WorkflowAdapter | 4 | Large | S=2,I=0,D=1,N=1,F=0,T=2 | Unified: handles current/checkpoint/run, scans directories, hydrates entities, multiple filters | Contract tests, filter-first |
| Entity Interfaces | 2 | Small | S=1,I=0,D=0,N=1,F=0,T=0 | 2 interfaces (unified), new pattern to codebase | Thorough review |
| CLI runs commands | 2 | Small | S=1,I=0,D=0,N=0,F=0,T=1 | Follows existing patterns | Integration tests |
| Service Unification | 4 | Large | S=2,I=1,D=1,N=1,F=1,T=2 | Refactors all services, changes CLI/MCP output | Backward compat checks |
| Entity Test Harness | 2 | Small | S=1,I=0,D=0,N=0,F=0,T=1 | Mirrors existing manual-test/ structure | Follow existing patterns |
| Validation Gates | 2 | Small | S=1,I=0,D=0,N=0,F=1,T=2 | Two harnesses must pass before merge | Explicit gate criteria |

### Task Count Summary

| Phase | Tasks | Status |
|-------|-------|--------|
| Phase 1: Entity Interfaces & Pure Data Classes | 14 | Not Started |
| Phase 2: Fake Adapters | 8 | Not Started |
| Phase 3: Production Adapters | 17 | Not Started |
| Phase 4: CLI `cg runs` Commands | 18 | Not Started |
| Phase 5: Documentation | 4 | Not Started |
| Phase 6: Service Unification & Validation | 22 | Not Started |
| **TOTAL** | **83** | |

### Phase Dependency Graph

```
Phase 1 (Interfaces & Entities)
    │
    ▼
Phase 2 (Fake Adapters)
    │
    ▼
Phase 3 (Production Adapters)
    │
    ├──────────────┬──────────────┐
    ▼              ▼              ▼
Phase 4        Phase 5        (parallel)
(CLI runs)     (Docs)
    │              │
    └──────────────┴──────────────┐
                                  ▼
                           Phase 6 (Service Unification & Validation)
                                  │
                                  ▼
                           MERGE TO MAIN
```

**Critical Path**: Phase 1 → Phase 2 → Phase 3 → Phase 6 (validation gates)

---

## Progress Tracking

### Phase Completion Checklist
- [x] Phase 1: Entity Interfaces & Pure Data Classes (14 tasks) - ✅ Complete
- [x] Phase 2: Fake Adapters (8 tasks) - ✅ Complete
- [x] Phase 3: Production Adapters (17 tasks) - ✅ Complete
- [x] Phase 4: CLI `cg runs` Commands (18 tasks) - ✅ Complete
- [x] Phase 5: Documentation (4 tasks) - ✅ Complete
- [x] Phase 6: Service Unification & Validation (22 tasks) - ✅ **COMPLETE** (2026-01-26)
  - [x] Part A: Harness Creation (T001a-T004) - TDD: Define expected behavior
  - [x] Part B: Implementation (T005-T017) - Develop against harnesses
  - [x] Part C: Validation Gates (T018-T022) - Execute pass/fail gates
  - [x] **GATE 1 PASS**: Manual test harness (T018) - ALL 7 SCRIPTS PASSED
  - [x] **GATE 2 PASS**: Entity JSON validation (T019) - Workflow + Phase entities validated
  - [x] **GATE 3 PASS**: CI pipeline green (T022) - 1840 tests pass

### Validation Strategy

**TDD Approach**: Harnesses are created FIRST (Phase 6 Part A), then implementation proceeds against them (Part B), then gates are executed (Part C).

```
Phase 6 Structure (TDD Discipline):

Part A: Define Expected Behavior
┌─────────────────────────────────────────────────────────────┐
│  6.1-6.4: Create entity-test/ harness + expected outputs    │
│           Update manual-test/ assertions                    │
│           (Harnesses define pass criteria BEFORE impl)      │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
Part B: Implement Against Harnesses
┌─────────────────────────────────────────────────────────────┐
│  6.5-6.17: Refactor services, CLI, MCP                      │
│            (Run harness scripts during development)         │
│            CLI output MUST be 100% backward compatible      │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
Part C: Execute Validation Gates (BLOCKING)
┌─────────────────────────────────────────────────────────────┐
│   manual-test/            entity-test/          CI          │
│   ┌─────────────┐         ┌─────────────┐   ┌─────────┐    │
│   │ MODE-1-FULL │         │ All scripts │   │pnpm test│    │
│   │ (backward   │         │ (entity     │   │typecheck│    │
│   │  compat)    │         │  correct)   │   │lint     │    │
│   └──────┬──────┘         └──────┬──────┘   └────┬────┘    │
│          │                       │               │          │
│          ▼                       ▼               ▼          │
│   ┌────────────┐         ┌────────────┐   ┌────────────┐   │
│   │ GATE 1     │         │ GATE 2     │   │ GATE 3     │   │
│   │ PASS       │         │ PASS       │   │ PASS       │   │
│   └──────┬─────┘         └──────┬─────┘   └──────┬─────┘   │
│          │                      │                │          │
│          └──────────────────────┼────────────────┘          │
│                                 ▼                           │
│                        ┌──────────────┐                     │
│                        │  MERGE OK    │                     │
│                        └──────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

### STOP Rule
**IMPORTANT**: This plan must be complete before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## Subtasks Registry

Mid-implementation detours requiring structured tracking.

| ID | Created | Phase | Parent Task | Reason | Status | Dossier |
|----|---------|-------|-------------|--------|--------|---------|
| 001-subtask-cg-agent-cli-command | 2026-01-26 | Phase 6: Service Unification & Validation | T001a | AgentService infrastructure exists but no CLI to invoke agents; required for manual test harness | [x] Complete | [Link](tasks/phase-6-service-unification-validation/001-subtask-cg-agent-cli-command.md) |

---

## Change Footnotes Ledger

**Footnote Numbering Authority**: plan-6a-update-progress is the **single source of truth** for footnote numbering across the entire plan.

| Footnote | Phase | Task | Description | Added |
|----------|-------|------|-------------|-------|
| [^1] | Phase 6 | T005-T009 | PhaseService refactoring: Extended result types with optional Phase entity | 2026-01-26 |
| [^2] | Phase 6 | T010-T011 | WorkflowService refactoring: Extended result types with optional Workflow entity | 2026-01-26 |
| [^3] | Phase 6 | T018-T019 | **Validation Gates PASSED**: Manual test harness (7 scripts) + Entity JSON validation. Discovered 6 critical issues (DYK-07 through DYK-12) and fixed them. Key learnings: Claude Code sessions CWD-bound, `--fork-session --resume` required together, AgentService error handling, NDJSON CLI output, workflow registration for `cg runs`. | 2026-01-26 |

---

*Plan Version 1.0.0 - Created 2026-01-26*
