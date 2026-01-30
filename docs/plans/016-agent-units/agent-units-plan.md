# WorkGraph Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-01-27
**Spec**: [agent-units-spec.md](./agent-units-spec.md)
**Status**: DRAFT

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Technical Context](#2-technical-context)
3. [Critical Research Findings](#3-critical-research-findings)
4. [Testing Philosophy](#4-testing-philosophy)
5. [Implementation Phases](#5-implementation-phases)
   - [Phase 1: Package Foundation & Core Interfaces](#phase-1-package-foundation--core-interfaces)
   - [Phase 2: WorkUnit System](#phase-2-workunit-system)
   - [Phase 3: WorkGraph Core](#phase-3-workgraph-core)
   - [Phase 4: Node Operations & DAG Validation](#phase-4-node-operations--dag-validation)
   - [Phase 5: Execution Engine](#phase-5-execution-engine)
   - [Phase 6: CLI Integration](#phase-6-cli-integration)
6. [Cross-Cutting Concerns](#6-cross-cutting-concerns)
7. [Complexity Tracking](#7-complexity-tracking)
8. [Progress Tracking](#8-progress-tracking)
9. [References](#9-references)
10. [Change Footnotes Ledger](#10-change-footnotes-ledger)

---

## 1. Executive Summary

**Problem Statement**: The legacy workflow system uses a rigid template→checkpoint→run model with linear phase sequences. Users need flexible, reusable workflows with DAG structures, explicit data dependencies, and node-by-node execution.

**Solution Approach**:
- Create new `packages/workgraph/` package following existing architectural patterns
- Implement WorkUnits (AgentUnit, CodeUnit, UserInputUnit) as reusable templates
- Implement WorkGraphs as DAGs of WorkNodes with explicit input/output wiring
- Add CLI commands (`cg wg`, `cg unit`) following established command patterns
- Filesystem-based storage in `.chainglass/work-graphs/` and `.chainglass/units/`

**Expected Outcomes**:
- Users can create reusable WorkUnits once and compose them into multiple graphs
- Fail-fast validation catches input/output mismatches at node insertion time
- Explicit, re-entrant node execution with question/answer handover flow
- Git-friendly YAML/JSON storage format

**Success Metrics**:
- All 17 acceptance criteria from spec pass
- Full TDD coverage with contract tests for all interfaces
- CLI commands work with `--json` output for agent consumption

---

## 2. Technical Context

### 2.1 Current System State

The existing architecture provides:
- **@chainglass/shared**: Core interfaces (IFileSystem, ILogger, IPathResolver), fakes, adapters
- **@chainglass/workflow**: Legacy phase-based workflow system (coexists, not modified)
- **apps/cli**: Commander.js CLI with DI container pattern
- **packages/mcp-server**: MCP protocol integration

### 2.2 Integration Requirements

WorkGraph must integrate with:
- DI container pattern using tsyringe with token constants
- Result types pattern (errors array, never throw)
- Output adapter pattern (console/JSON formatters)
- CLI command registration pattern

### 2.3 Directory Structure

```
packages/workgraph/                    # NEW PACKAGE
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts                       # Barrel exports
│   ├── interfaces/                    # All interfaces
│   │   ├── index.ts
│   │   ├── workunit.interface.ts
│   │   ├── workgraph.interface.ts
│   │   ├── workgraph-service.interface.ts
│   │   ├── workunit-service.interface.ts
│   │   └── worknode-service.interface.ts
│   ├── services/                      # Implementations
│   │   ├── workunit.service.ts
│   │   ├── workgraph.service.ts
│   │   └── worknode.service.ts
│   ├── adapters/                      # YAML/schema adapters
│   │   ├── workunit-parser.adapter.ts
│   │   ├── workgraph-parser.adapter.ts
│   │   └── workgraph-validator.adapter.ts
│   ├── schemas/                       # Zod schemas
│   │   ├── workunit.schema.ts
│   │   ├── workgraph.schema.ts
│   │   └── worknode.schema.ts
│   ├── fakes/                         # Test doubles
│   │   ├── index.ts
│   │   ├── fake-workunit-service.ts
│   │   ├── fake-workgraph-service.ts
│   │   └── fake-worknode-service.ts
│   ├── errors/                        # Error definitions
│   │   └── workgraph-errors.ts
│   └── types/                         # Type definitions
│       ├── workunit.types.ts
│       ├── workgraph.types.ts
│       └── result.types.ts
└── test/
    ├── unit/
    └── contracts/

apps/cli/src/commands/
├── workgraph.command.ts               # NEW: cg wg commands
└── unit.command.ts                    # NEW: cg unit commands

.chainglass/
├── units/                             # WorkUnit library
│   └── <unit-slug>/
│       ├── unit.yaml
│       └── commands/main.md           # For AgentUnits
└── work-graphs/                       # WorkGraph instances
    └── <graph-slug>/
        ├── work-graph.yaml            # Structure (nodes + edges)
        ├── state.json                 # Runtime state
        └── nodes/
            └── <node-id>/
                ├── node.yaml          # Node config
                └── data/
                    ├── data.json      # Output data
                    └── outputs/       # File outputs
```

### 2.4 Constraints

- **No modification of legacy workflow**: `packages/workflow/` remains unchanged
- **Single user assumption**: No concurrent access handling required
- **Local filesystem only**: No remote/cloud storage
- **Explicit execution**: No "run all" or auto-next behavior
- **v1 limitations**: No merging (diamond patterns), no subgraphs, no unit versioning

---

## 3. Critical Research Findings

### 3.1 Discovery Synthesis

The parallel research phase identified 32 discoveries across 4 domains. After deduplication and impact analysis, the following are critical for implementation:

---

### 🚨 Critical Discovery 01: DI Pattern with Child Containers

**Impact**: Critical
**Sources**: [S1-01, S4-02]

**Problem**: Services cannot be singletons - each CLI command needs a fresh container to prevent state leakage.

**Root Cause**: tsyringe singleton registrations persist state across commands, causing test pollution and production bugs.

**Solution**: Use `container.createChildContainer()` for each command. Register with `useFactory`, never `useValue` for services.

**Example**:
```typescript
// ✅ CORRECT - Fresh container per command
export function createWorkgraphProductionContainer(): DependencyContainer {
  const childContainer = container.createChildContainer();
  childContainer.register<IWorkGraphService>(WORKGRAPH_DI_TOKENS.SERVICE, {
    useFactory: (c) => new WorkGraphService(
      c.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM),
      c.resolve<IWorkGraphParser>(WORKGRAPH_DI_TOKENS.PARSER)
    )
  });
  return childContainer;
}

// ❌ WRONG - Singleton causes state leakage
container.registerSingleton<IWorkGraphService>(WORKGRAPH_DI_TOKENS.SERVICE, WorkGraphService);
```

**Action Required**: Create `createWorkgraphProductionContainer()` and `createWorkgraphTestContainer()` in package

**Affects Phases**: Phase 1, Phase 6

---

### 🚨 Critical Discovery 02: Result Types with Errors Array

**Impact**: Critical
**Sources**: [S1-02, S4-03]

**Problem**: Services must never throw exceptions for validation failures. All results must include an errors array.

**Root Cause**: Exception-based error handling breaks agent workflows - agents need structured errors they can parse and act on.

**Solution**: All service methods return `Promise<T extends BaseResult>` where BaseResult includes `errors: ResultError[]`.

**Example**:
```typescript
// ✅ CORRECT - Return errors in result
async addNode(graphSlug: string, afterNode: string, unitSlug: string): Promise<AddNodeResult> {
  const errors: ResultError[] = [];

  const unit = await this.loadUnit(unitSlug);
  if (!unit) {
    errors.push({
      code: 'E104',
      message: `Unit not found: ${unitSlug}`,
      action: `Run 'cg unit list' to see available units`
    });
    return { nodeId: '', errors };
  }

  // Continue only if no errors...
  return { nodeId: newNode.id, errors };
}

// ❌ WRONG - Throwing exceptions
async addNode(graphSlug: string, afterNode: string, unitSlug: string): Promise<string> {
  const unit = await this.loadUnit(unitSlug);
  if (!unit) throw new UnitNotFoundError(unitSlug);  // BAD!
  return newNode.id;
}
```

**Action Required**: Define WorkGraph result types extending BaseResult. Error codes E101-E199 reserved for WorkGraph.

**Affects Phases**: Phase 1, Phase 2, Phase 3, Phase 4, Phase 5

---

### 🚨 Critical Discovery 03: Atomic File Writes Required

**Impact**: Critical
**Sources**: [S2-02, S3-07]

**Problem**: If process crashes mid-write, incomplete JSON files corrupt workflow state permanently.

**Root Cause**: Node.js fs.writeFile() is not atomic. Half-written files are persisted on disk.

**Solution**: Implement atomic write pattern: write to temp file, then atomic rename.

**Example**:
```typescript
// ✅ CORRECT - Atomic write pattern
async writeAtomically(path: string, content: string): Promise<void> {
  const tempPath = `${path}.tmp`;
  await this.fs.writeFile(tempPath, content);
  await this.fs.rename(tempPath, path);  // Atomic on POSIX
}

// ❌ WRONG - Non-atomic write
async write(path: string, content: string): Promise<void> {
  await this.fs.writeFile(path, content);  // Crash here = corruption
}
```

**Action Required**: All state.json and data.json writes must use atomic pattern

**Affects Phases**: Phase 3, Phase 5

---

### 🚨 Critical Discovery 04: DAG Cycle Detection Required

**Impact**: Critical
**Sources**: [S2-07, S3-06]

**Problem**: Circular dependencies cause infinite loops or deadlocks during execution.

**Root Cause**: Current workflow system assumes linear phases. WorkGraph generalizes to DAGs without cycle validation.

**Solution**: Implement DFS-based cycle detection at edge insertion time.

**Example**:
```typescript
function hasCycle(graph: Map<string, string[]>): { hasCycle: boolean; path?: string[] } {
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): boolean {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    for (const neighbor of graph.get(node) ?? []) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recStack.has(neighbor)) {
        path.push(neighbor);  // Complete the cycle
        return true;
      }
    }

    recStack.delete(node);
    path.pop();
    return false;
  }

  for (const node of graph.keys()) {
    if (!visited.has(node) && dfs(node)) {
      return { hasCycle: true, path };
    }
  }
  return { hasCycle: false };
}
```

**Action Required**: Implement cycle detection in add-after validation. Error E108 for cycles.

**Affects Phases**: Phase 4

---

### 🚨 Critical Discovery 05: Input/Output Name Matching

**Impact**: Critical
**Sources**: [S3-03, spec]

**Problem**: Unit definitions can change after nodes are added, breaking input wiring.

**Root Cause**: No unit versioning in v1. Input names must match exactly between output and input.

**Solution**: Validate at insertion time. Store unit schema snapshot in node.yaml for future validation.

**Example**:
```yaml
# node.yaml - stores unit schema at creation time
id: write-poem-b2c
unit: write-poem
unit_schema_snapshot:
  inputs:
    - name: text
      type: data
      data_type: text
      required: true
  outputs:
    - name: poem
      type: file
      required: true
inputs:
  text:
    from: user-input-text-a7f
    output: text
```

**Action Required**: Input wiring validation at add-after. Error E103 for missing inputs.

**Affects Phases**: Phase 4

---

### High Impact Discovery 06: CLI Command Registration Pattern

**Impact**: High
**Sources**: [S1-04, S4-04]

**Problem**: CLI commands must follow established patterns for consistency and testability.

**Solution**: Export `registerWorkGraphCommands(program: Command)` and `registerUnitCommands(program: Command)`. Import and call in `bin/cg.ts`.

**Action Required**: Follow workflow.command.ts pattern exactly

**Affects Phases**: Phase 6

---

### High Impact Discovery 07: Output Adapter Pattern

**Impact**: High
**Sources**: [S1-03]

**Problem**: All CLI output must go through output adapters for consistent formatting.

**Solution**: Add format methods to ConsoleOutputAdapter for all WorkGraph result types. Support `--json` flag.

**Action Required**: Extend ConsoleOutputAdapter with workgraph.* format methods

**Affects Phases**: Phase 6

---

### High Impact Discovery 08: Fake Implementation Pattern

**Impact**: High
**Sources**: [S1-06, S4-05]

**Problem**: Every interface needs a corresponding Fake for testing.

**Solution**: Create FakeWorkGraphService, FakeWorkUnitService, FakeWorkNodeService with call tracking.

**Action Required**: Include call arrays and setter methods for configuring responses

**Affects Phases**: Phase 1, Phase 2, Phase 3

---

### High Impact Discovery 09: Error Code Allocation

**Impact**: High
**Sources**: [S2-03, S4-08]

**Problem**: Error codes must not overlap with existing ranges.

**Solution**: Allocate E101-E199 for WorkGraph:
- E101-E109: Graph operations (create, load, save)
- E110-E119: Node execution errors
- E120-E129: Unit operations
- E130-E139: I/O operations
- E140-E149: Validation errors

**Action Required**: Document all error codes in workgraph-errors.ts

**Affects Phases**: All phases

---

### High Impact Discovery 10: Path Security

**Impact**: High
**Sources**: [S2-06]

**Problem**: Directory traversal attacks via '..' in paths.

**Solution**: Reject any path containing '..' before resolution. Use IPathResolver for all path operations.

**Action Required**: Validate paths in all services that accept user input

**Affects Phases**: Phase 2, Phase 3, Phase 5

---

### Medium Impact Discovery 11: Node ID Format

**Impact**: Medium
**Sources**: [S2-04, spec]

**Problem**: Node IDs must be unique and human-readable.

**Solution**: Format `<unit-slug>-<hex3>` (e.g., `write-poem-b2c`). Generate 3 random hex chars. `start` is reserved.

**Action Required**: Implement ID generation with collision detection

**Affects Phases**: Phase 4

---

### Medium Impact Discovery 12: Type Coercion at Save Time

**Impact**: Medium
**Sources**: [S3-08]

**Problem**: CLI accepts string values but outputs may have specific types (number, boolean, json).

**Solution**: Parse/coerce values at save-output-data time. Error E123 for type mismatch.

**Action Required**: Implement type validation in save-output-data command

**Affects Phases**: Phase 5

---

## 4. Testing Philosophy

### 4.1 Testing Approach

**Selected Approach**: Full TDD (Test-Driven Development)

**Rationale**: This is a new package with complex validation logic. TDD ensures comprehensive coverage and documents expected behavior through tests.

### 4.2 Test-Driven Development

Follow RED-GREEN-REFACTOR cycle:
1. **RED**: Write test first, verify it fails
2. **GREEN**: Implement minimal code to pass test
3. **REFACTOR**: Improve code quality while keeping tests green

### 4.3 Test Documentation Format

Every test includes a 5-field Test Doc comment:

```typescript
it('should reject cycle in graph', async () => {
  /*
  Test Doc:
  - Why: Cycles cause infinite loops during execution
  - Contract: addNode() returns E108 error if edge would create cycle
  - Usage Notes: Use hasCycle() helper before adding any edge
  - Quality Contribution: Prevents deadlock in production workflows
  - Worked Example: A→B→C, add C→A = E108 with cycle path [A,B,C,A]
  */
  // test implementation
});
```

### 4.4 Mock Usage

**Policy**: Fakes over mocks. NO `vi.mock()`, `jest.mock()`, `vi.spyOn()`.

Use full fake implementations:
- FakeWorkGraphService with call tracking
- FakeFileSystem from @chainglass/shared
- FakeLogger for assertion on logs

### 4.5 Test Organization

```
test/
├── unit/
│   └── workgraph/
│       ├── workunit-service.test.ts
│       ├── workgraph-service.test.ts
│       ├── worknode-service.test.ts
│       └── cycle-detection.test.ts
├── contracts/
│   └── workgraph/
│       ├── workunit-service.contract.ts
│       └── workgraph-service.contract.ts
└── integration/
    └── workgraph/
        └── full-workflow.test.ts
```

---

## 5. Implementation Phases

### Phase 1: Package Foundation & Core Interfaces

**Objective**: Create the `packages/workgraph/` package structure with all interfaces, types, and DI container setup.

**Deliverables**:
- Package.json with proper dependencies
- TypeScript configuration
- All interface definitions
- All Zod schemas
- DI token definitions
- Container factory functions
- Fake implementations

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Interface design changes | Medium | Medium | Design interfaces from spec first, validate with tests |
| DI integration issues | Low | High | Follow existing container.ts pattern exactly |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.1 | [ ] | Create packages/workgraph/ directory structure | 1 | Directory structure matches plan | - | |
| 1.2 | [ ] | Create package.json with dependencies | 1 | pnpm install succeeds | - | |
| 1.3 | [ ] | Create tsconfig.json | 1 | tsc --noEmit passes | - | |
| 1.4 | [ ] | Write contract tests for IWorkUnitService | 2 | Tests define interface contract | - | TDD: RED phase |
| 1.5 | [ ] | Write contract tests for IWorkGraphService | 2 | Tests define interface contract | - | TDD: RED phase |
| 1.6 | [ ] | Write contract tests for IWorkNodeService | 2 | Tests define interface contract | - | TDD: RED phase |
| 1.7 | [ ] | Define WorkUnit Zod schemas | 2 | Schema validates sample YAML | - | |
| 1.8 | [ ] | Define WorkGraph Zod schemas | 2 | Schema validates sample YAML | - | |
| 1.9 | [ ] | Define WorkNode Zod schemas | 2 | Schema validates sample YAML | - | |
| 1.10 | [ ] | Define result types extending BaseResult | 2 | All result types have errors array | - | Per Critical Discovery 02 |
| 1.11 | [ ] | Define error codes E101-E149 | 1 | All errors documented | - | Per Discovery 09 |
| 1.12 | [ ] | Create DI tokens (WORKGRAPH_DI_TOKENS) | 1 | Tokens exported | - | |
| 1.13 | [ ] | Create FakeWorkUnitService | 2 | Fake has call tracking | - | |
| 1.14 | [ ] | Create FakeWorkGraphService | 2 | Fake has call tracking | - | |
| 1.15 | [ ] | Create FakeWorkNodeService | 2 | Fake has call tracking | - | |
| 1.16 | [ ] | Create createWorkgraphProductionContainer() | 2 | Container resolves all services | - | Per Critical Discovery 01 |
| 1.17 | [ ] | Create createWorkgraphTestContainer() | 2 | Container resolves fakes | - | |
| 1.18 | [ ] | Create barrel exports (index.ts files) | 1 | Imports work from package | - | |

### Test Examples

```typescript
describe('IWorkGraphService contract', () => {
  it('should return errors array on invalid graph', async () => {
    /*
    Test Doc:
    - Why: Services must never throw, always return errors
    - Contract: create() returns result with errors array if slug invalid
    - Usage Notes: Check result.errors.length > 0 before using result data
    - Quality Contribution: Ensures agent-friendly error handling
    - Worked Example: create('') returns { graphSlug: '', errors: [E101] }
    */
    const service = createService();
    const result = await service.create('');

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe('E101');
    expect(result.graphSlug).toBe('');
  });
});
```

### Acceptance Criteria
- [ ] `pnpm -F @chainglass/workgraph build` succeeds
- [ ] `pnpm -F @chainglass/workgraph test` passes
- [ ] All interfaces exported from package
- [ ] All fakes exported from package/fakes
- [ ] Container factories work in CLI

---

### Phase 2: WorkUnit System

**Objective**: Implement WorkUnit loading, validation, and management (`cg unit` commands).

**Deliverables**:
- WorkUnitService implementation
- WorkUnit parser adapter
- WorkUnit validator adapter
- Unit scaffolding (create command)

**Dependencies**: Phase 1 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| YAML parsing edge cases | Medium | Low | Use existing yaml package patterns |
| Schema evolution | Low | Medium | Snapshot schemas at node creation |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Write tests for WorkUnitService.list() | 2 | Tests cover: empty dir, multiple units, invalid units | - | |
| 2.2 | [ ] | Implement WorkUnitService.list() | 2 | All tests pass | - | |
| 2.3 | [ ] | Write tests for WorkUnitService.load() | 2 | Tests cover: found, not found, invalid YAML | - | |
| 2.4 | [ ] | Implement WorkUnitService.load() | 2 | All tests pass | - | |
| 2.5 | [ ] | Write tests for WorkUnitService.create() | 2 | Tests cover: agent, code, user-input scaffolds | - | |
| 2.6 | [ ] | Implement WorkUnitService.create() | 3 | All tests pass, scaffolds created | - | |
| 2.7 | [ ] | Write tests for WorkUnitService.validate() | 2 | Tests cover: valid, schema errors, missing files | - | |
| 2.8 | [ ] | Implement WorkUnitService.validate() | 2 | All tests pass | - | |
| 2.9 | [ ] | Create WorkUnitParserAdapter | 2 | YAML parsing works | - | |
| 2.10 | [ ] | Create WorkUnitValidatorAdapter | 2 | Schema validation works | - | |
| 2.11 | [ ] | Integration test: full unit lifecycle | 3 | create → validate → list → load | - | |

### Acceptance Criteria
- [ ] All unit tests pass
- [ ] Contract tests pass for both fake and real service
- [ ] Can create all three unit types (agent, code, user-input)
- [ ] Validation catches all schema errors with actionable messages

---

### Phase 3: WorkGraph Core

**Objective**: Implement WorkGraph creation, loading, and basic operations.

**Deliverables**:
- WorkGraphService implementation
- WorkGraph parser adapter
- work-graph.yaml and state.json management
- Atomic file write utilities

**Dependencies**: Phase 2 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| State file corruption | Low | High | Atomic writes per Discovery 03 |
| Concurrent access | Low | Medium | Document single-user assumption |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Write tests for WorkGraphService.create() | 2 | Tests cover: success, duplicate, invalid slug | - | |
| 3.2 | [ ] | Implement WorkGraphService.create() | 3 | All tests pass, creates directory structure | - | |
| 3.3 | [ ] | Write tests for WorkGraphService.load() | 2 | Tests cover: found, not found, corrupted | - | |
| 3.4 | [ ] | Implement WorkGraphService.load() | 2 | All tests pass | - | |
| 3.5 | [ ] | Write tests for WorkGraphService.show() | 2 | Tests cover: linear, diverging graphs | - | |
| 3.6 | [ ] | Implement WorkGraphService.show() | 2 | Tree output matches spec | - | |
| 3.7 | [ ] | Write tests for WorkGraphService.status() | 2 | Tests cover: all node states | - | |
| 3.8 | [ ] | Implement WorkGraphService.status() | 2 | Status table matches spec | - | |
| 3.9 | [ ] | Implement atomic write utility | 2 | Temp file + rename pattern | - | Per Critical Discovery 03 |
| 3.10 | [ ] | Write tests for state.json management | 2 | State persists across loads | - | |
| 3.11 | [ ] | Implement state.json manager | 2 | Atomic writes, corruption detection | - | |

### Acceptance Criteria
- [ ] All unit tests pass
- [ ] Graph creation produces correct directory structure
- [ ] State persists correctly across process restarts
- [ ] Atomic writes prevent corruption

---

### Phase 4: Node Operations & DAG Validation

**Objective**: Implement add-after, remove, and DAG validation.

**Deliverables**:
- Node ID generation
- add-after with input validation
- Cycle detection
- remove with cascade support

**Dependencies**: Phase 3 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Cycle detection bugs | Medium | High | Comprehensive test cases |
| Input wiring complexity | Medium | Medium | Exact name matching per spec |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Write tests for node ID generation | 2 | Tests cover: format, uniqueness, collision | - | Per Discovery 11 |
| 4.2 | [ ] | Implement node ID generation | 2 | Format: <unit>-<hex3> | - | |
| 4.3 | [ ] | Write tests for cycle detection | 3 | Tests cover: no cycle, simple cycle, complex cycle | - | Per Critical Discovery 04 |
| 4.4 | [ ] | Implement cycle detection algorithm | 3 | DFS-based detection works | - | |
| 4.5 | [ ] | Write tests for add-after (success) | 2 | Tests cover: valid wiring | - | |
| 4.6 | [ ] | Write tests for add-after (failure) | 2 | Tests cover: missing input, cycle | - | |
| 4.7 | [ ] | Implement add-after with validation | 3 | All tests pass, E103 for missing input | - | Per Critical Discovery 05 |
| 4.8 | [ ] | Write tests for remove (leaf node) | 2 | Tests cover: leaf removal | - | |
| 4.9 | [ ] | Write tests for remove (with dependents) | 2 | Tests cover: E102, --cascade | - | |
| 4.10 | [ ] | Implement remove with cascade | 3 | All tests pass | - | |

### Acceptance Criteria
- [ ] All unit tests pass
- [ ] AC-04 through AC-08 from spec verified
- [ ] AC-16 (cycle detection) verified
- [ ] Input validation catches all mismatches

---

### Phase 5: Execution Engine

**Objective**: Implement node execution, I/O operations, and handover flow.

**Deliverables**:
- WorkNodeService for execution commands
- Input resolution (dynamic traversal)
- Output saving with type validation
- Question/answer handover flow

**Dependencies**: Phase 4 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Re-execution invalidation | Medium | High | Clear downstream outputs |
| Type coercion edge cases | Medium | Low | Strict validation |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 5.1 | [ ] | Write tests for can-run check | 2 | Tests cover: ready, blocked | - | |
| 5.2 | [ ] | Implement can-run | 2 | All tests pass | - | |
| 5.3 | [ ] | Write tests for start command | 2 | Tests cover: success, already running, blocked | - | |
| 5.4 | [ ] | Implement start | 2 | Status transitions correctly | - | |
| 5.5 | [ ] | Write tests for end command | 2 | Tests cover: success, missing outputs | - | |
| 5.6 | [ ] | Implement end | 2 | Validates outputs before completion | - | |
| 5.7 | [ ] | Write tests for input resolution | 3 | Tests cover: data, file, chained inputs | - | |
| 5.8 | [ ] | Implement get-input-data and get-input-file | 3 | Dynamic traversal works | - | |
| 5.9 | [ ] | Write tests for save-output-data | 2 | Tests cover: types, overwrite | - | Per Discovery 12 |
| 5.10 | [ ] | Implement save-output-data with type validation | 2 | Type coercion works | - | |
| 5.11 | [ ] | Write tests for save-output-file | 2 | Tests cover: copy, overwrite | - | |
| 5.12 | [ ] | Implement save-output-file | 2 | File copied to node storage | - | |
| 5.13 | [ ] | Write tests for ask command | 2 | Tests cover: all question types | - | |
| 5.14 | [ ] | Implement ask with auto-handback | 2 | Status → waiting-question | - | |
| 5.15 | [ ] | Write tests for answer command | 2 | Tests cover: answer validation | - | |
| 5.16 | [ ] | Implement answer | 2 | Answer stored in data.json | - | |
| 5.17 | [ ] | Write tests for clear command | 2 | Tests cover: output clearing, downstream invalidation | - | |
| 5.18 | [ ] | Implement clear with invalidation | 3 | Downstream nodes marked ready | - | |
| 5.19 | [ ] | Write tests for bootstrap prompt generation | 2 | Prompt matches spec format | - | |
| 5.20 | [ ] | Implement bootstrap prompt generation | 2 | Prompt includes all instructions | - | |

### Acceptance Criteria
- [ ] All unit tests pass
- [ ] AC-09 through AC-13 from spec verified
- [ ] Question/answer handover works end-to-end
- [ ] Re-execution clears downstream outputs

---

### Phase 6: CLI Integration

**Objective**: Add `cg wg` and `cg unit` commands to CLI.

**Deliverables**:
- workgraph.command.ts with all wg commands
- unit.command.ts with all unit commands
- Output adapter extensions
- Integration with DI container

**Dependencies**: Phase 5 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Command conflicts | Low | Medium | Use unique command names |
| Output formatting | Low | Low | Follow existing patterns |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 6.1 | [ ] | Add format methods to ConsoleOutputAdapter | 3 | All workgraph.* types formatted | - | Per Discovery 07 |
| 6.2 | [ ] | Create unit.command.ts | 2 | registerUnitCommands() exported | - | |
| 6.3 | [ ] | Implement cg unit list | 2 | Lists units in table format | - | |
| 6.4 | [ ] | Implement cg unit info | 2 | Shows unit details | - | |
| 6.5 | [ ] | Implement cg unit create | 2 | Creates scaffold | - | |
| 6.6 | [ ] | Implement cg unit validate | 2 | Validates unit definition | - | |
| 6.7 | [ ] | Create workgraph.command.ts | 2 | registerWorkGraphCommands() exported | - | |
| 6.8 | [ ] | Implement cg wg create | 2 | Creates graph with start node | - | |
| 6.9 | [ ] | Implement cg wg show | 2 | Tree output matches spec | - | |
| 6.10 | [ ] | Implement cg wg status | 2 | Status table matches spec | - | |
| 6.11 | [ ] | Implement cg wg node add-after | 3 | Node added with validation | - | |
| 6.12 | [ ] | Implement cg wg node remove | 2 | Node removed with cascade option | - | |
| 6.13 | [ ] | Implement cg wg node exec | 3 | Launches agent with bootstrap | - | |
| 6.14 | [ ] | Implement all node lifecycle commands | 3 | start, end, can-run, can-end | - | |
| 6.15 | [ ] | Implement all node I/O commands | 3 | list-inputs/outputs, get/save | - | |
| 6.16 | [ ] | Implement ask/answer commands | 2 | Handover flow works | - | |
| 6.17 | [ ] | Register commands in bin/cg.ts | 1 | Commands available in CLI | - | |
| 6.18 | [ ] | Add --json flag to all list/info commands | 1 | JSON output works | - | |
| 6.19 | [ ] | Integration test: full workflow via CLI | 3 | End-to-end test passes | - | |

### Acceptance Criteria
- [ ] All CLI commands work per spec
- [ ] `--json` flag produces valid JSON
- [ ] All acceptance criteria from spec verified via CLI
- [ ] Help text is accurate and useful

---

## 6. Cross-Cutting Concerns

### 6.1 Security Considerations

- **Path traversal prevention**: Reject paths containing '..' (Discovery 10)
- **Input validation**: All user inputs validated before use
- **No credential storage**: WorkGraphs don't handle secrets

### 6.2 Observability

- **Structured logging**: Use ILogger for all log output
- **Error codes**: Consistent E-codes for all errors
- **Debug output**: Support `--verbose` flag for detailed logging

### 6.3 Documentation

- **Location**: Primary docs in spec and command flows files
- **API docs**: TypeDoc comments on all public interfaces
- **Examples**: Spec includes complete example sessions

---

## 7. Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| DAG Cycle Detection | 3 | Medium | S=1,I=1,D=0,N=1,F=0,T=2 | Algorithm complexity, edge cases | Comprehensive test suite |
| Add-After Validation | 3 | Medium | S=1,I=1,D=1,N=0,F=0,T=2 | Input wiring logic | Test all edge cases |
| Execution Engine | 4 | Large | S=2,I=1,D=2,N=1,F=1,T=2 | State management, handover flow | Staged implementation, atomic writes |
| CLI Integration | 3 | Medium | S=2,I=1,D=0,N=0,F=0,T=2 | Many commands | Follow existing patterns |

---

## 8. Progress Tracking

### Phase Completion Checklist

- [ ] Phase 1: Package Foundation & Core Interfaces - NOT STARTED
- [ ] Phase 2: WorkUnit System - NOT STARTED
- [ ] Phase 3: WorkGraph Core - NOT STARTED
- [ ] Phase 4: Node Operations & DAG Validation - NOT STARTED
- [ ] Phase 5: Execution Engine - NOT STARTED
- [ ] Phase 6: CLI Integration - NOT STARTED

### STOP Rule

**IMPORTANT**: This plan must be complete before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## 9. References

- **Spec**: [agent-units-spec.md](./agent-units-spec.md)
- **Research Dossier**: [research-dossier.md](./research-dossier.md)
- **WorkGraph Command Flows**: [workgraph-command-flows.md](./workgraph-command-flows.md)
- **WorkUnit Command Flows**: [work-unit-command-flows.md](./work-unit-command-flows.md)
- **WorkGraph Data Model**: [workgraph-data-model.md](./workgraph-data-model.md)
- **WorkUnit Data Model**: [workunit-data-model.md](./workunit-data-model.md)
- **Constitution**: [constitution.md](../../project-rules/constitution.md)
- **Architecture**: [architecture.md](../../project-rules/architecture.md)

---

## 10. Change Footnotes Ledger

**NOTE**: This section will be populated during implementation by plan-6a-update-progress.

**Footnote Numbering Authority**: plan-6a-update-progress is the **single source of truth** for footnote numbering across the entire plan.

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]

---

*Plan Version 1.0.0 - Created 2026-01-27*
