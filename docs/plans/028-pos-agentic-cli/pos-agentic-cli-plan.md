# Positional Graph Execution Lifecycle Commands Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-03
**Spec**: [./pos-agentic-cli-spec.md](./pos-agentic-cli-spec.md)
**Status**: DRAFT

**Workshops**:
- [cli-and-e2e-flow.md](./workshops/cli-and-e2e-flow.md) - CLI Flow (12 commands, JSON schemas, E2E port)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [Implementation Phases](#implementation-phases)
   - [Phase 1: Foundation - Error Codes and Schemas](#phase-1-foundation---error-codes-and-schemas)
   - [Phase 2: Output Storage](#phase-2-output-storage)
   - [Phase 3: Node Lifecycle](#phase-3-node-lifecycle)
   - [Phase 4: Question/Answer Protocol](#phase-4-questionanswer-protocol)
   - [Phase 5: Input Retrieval](#phase-5-input-retrieval)
   - [Phase 6: E2E Test and Documentation](#phase-6-e2e-test-and-documentation)
6. [Cross-Cutting Concerns](#cross-cutting-concerns)
7. [File Placement Manifest](#file-placement-manifest)
8. [Complexity Tracking](#complexity-tracking)
9. [Progress Tracking](#progress-tracking)
10. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: Plan 026 delivered positional graph structure and status computation, but agents cannot participate in workflows because there are no commands to signal state transitions, report outputs, retrieve inputs, or request orchestrator input via question/answer protocol.

**Solution approach**:
- Add 12 service methods to `IPositionalGraphService` (lifecycle: 3, Q&A: 3, output: 4, input: 2)
- Add 12 CLI commands under `cg wf node`
- Add 7 new error codes (E172-E179, excluding E174)
- Extend state.json schema for questions array and node state fields
- Create E2E test script demonstrating 3-node pipeline execution

**Expected outcomes**:
- Agents can signal start/complete via CLI, enabling orchestrated workflow execution
- Question/answer protocol enables human-in-the-loop orchestrator handoff
- Output storage enables data flow between pipeline nodes
- Input retrieval leverages existing `collateInputs` algorithm

**Success metrics**:
- All 18 acceptance criteria pass
- E2E test executes 3-node pipeline (input → coder → tester) successfully
- 100% error code coverage in tests

---

## Technical Context

### Current System State

The positional graph system (Plan 026) provides:
- Graph structure with ordered lines and positioned nodes
- Status computation via 4-gate readiness algorithm (`canRun`)
- Input resolution via `collateInputs` algorithm
- State persistence in `state.json`

**What's missing**: No commands to drive state transitions from `pending` → `running` → `complete`.

### Integration Requirements

Per ADR-0006 (CLI-Based Workflow Agent Orchestration):
- CLI commands are the orchestration interface
- Agents invoke `cg wf node` commands to signal state
- Session continuity maintained by orchestrator, not by this plan

Per ADR-0008 (Workspace Split Storage):
- Data lives in `.chainglass/data/workflows/{slug}/` (per-worktree)
- State and outputs are git-committed
- All paths resolved via `ctx.worktreePath`

### Constraints and Limitations

1. **No concurrent access support**: Per spec assumption, agents call commands sequentially per node
2. **No auto-execution**: Service computes readiness; orchestrator drives execution
3. **No WorkGraph code reuse**: Clean implementation in `packages/positional-graph/`
4. **Direct output pattern required**: Nodes can skip `start`, go directly to `save-output-data` + `end`

### Assumptions

1. WorkUnit I/O declarations available via `IWorkUnitLoader` for output validation
2. Existing `collateInputs` algorithm correctly resolves inputs from upstream nodes
3. Existing `atomicWriteFile` pattern prevents state corruption

---

## Critical Research Findings

### 🚨 Critical Findings

| # | Finding | Action | Affects Phases |
|---|---------|--------|----------------|
| 01 | Schema foundation must come first | Extend `state.schema.ts` with Question type and NodeStateEntry fields before implementing service methods | Phase 1 |
| 02 | Output storage infrastructure before output methods | Implement `saveOutputData`/`saveOutputFile` before `canEnd`, `endNode`, `getOutputData`, `getOutputFile` | Phase 2, 3 |
| 03 | Path traversal is critical security risk | Validate all file paths using `path.resolve()` + containment check; reject `..` in output names | Phase 2 |
| 04 | Double-start state machine violation | Strict state validation before every mutation; return E172 for invalid transitions | Phase 3 |
| 05 | Question/Answer state desync risk | All Q&A state changes in single atomic write | Phase 4 |

### High Impact Findings

| # | Finding | Action | Affects Phases |
|---|---------|--------|----------------|
| 06 | Error codes must precede service methods | Add E172-E179 to `positional-graph-errors.ts` first | Phase 1 |
| 07 | Input retrieval reuses `collateInputs` | Implement as thin wrappers, not new resolution logic (per PL-02) | Phase 5 |
| 08 | State transition logic needs centralized helper | Create private `transitionNodeState()` for atomic mutations | Phase 3 |
| 09 | Concurrent state.json access is unsupported | Document limitation; use defensive merge strategy | All phases |
| 10 | WorkUnit loader may be unavailable | Graceful degradation in `canEnd`/`endNode` if WorkUnit missing | Phase 3 |

### Medium Impact Findings

| # | Finding | Action | Affects Phases |
|---|---------|--------|----------------|
| 11 | Direct output pattern allows `end` without `start` | Accept both `running` and `ready`/`pending` as valid states for `endNode` | Phase 3 |
| 12 | CLI commands follow service method order | Add CLI handler immediately after each service method is implemented | All phases |
| 13 | No explicit fail command in this plan | Document as known gap; blocked-error status exists but no command sets it | Phase 6 (docs) |
| 14 | Source node incomplete for `getInputData` | Return E178 InputNotAvailable; reuse `collateInputs` waiting status | Phase 5 |
| 15 | Test infrastructure setup before implementation | Create test file structure and helpers first (Full TDD) | Phase 1 |

---

## Testing Philosophy

### Testing Approach

**Selected Approach**: Full TDD
**Rationale**: User specified comprehensive testing; execution lifecycle is critical infrastructure.
**Focus Areas**: State machine transitions, input resolution, output storage, Q&A protocol, error codes

### Test-Driven Development

- Write tests FIRST (RED)
- Implement minimal code (GREEN)
- Refactor for quality (REFACTOR)

### Test Documentation

Every test must include:
```typescript
/**
 * Purpose: [what truth this test proves]
 * Quality Contribution: [how this prevents bugs]
 * Acceptance Criteria: [measurable assertions]
 */
```

### Mock Usage

**Policy**: Avoid mocks — use FakeFileSystem/FakePathResolver as per existing test patterns.
**Rationale**: Existing positional-graph tests use fakes for filesystem abstraction; maintains consistency.

---

## Implementation Phases

### Phase 1: Foundation - Error Codes and Schemas

**Objective**: Establish error codes and schema extensions required by all subsequent phases.

**Deliverables**:
- 7 new error codes (E172-E179, excluding E174) in `positional-graph-errors.ts`
- Extended `StateSchema` with Question type and NodeStateEntry fields
- Test infrastructure with enhanced `stubWorkUnitLoader`
- PlanPak feature folder structure

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Schema backward incompatibility | Low | Medium | Add optional fields only; existing state.json files remain valid |
| Error code collision | Low | Low | E172-E179 range verified unused in research |

#### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.0 | [x] | Create PlanPak feature folder structure | 1 | `/home/jak/substrate/028-pos-agentic-cli/packages/positional-graph/src/features/028-pos-agentic-cli/` exists | [📋](tasks/phase-1-foundation-error-codes-and-schemas/execution.log.md#task-t001) | T001 |
| 1.1 | [x] | Write tests for E172-E179 error factory functions | 2 | Tests verify error code, message format, details parameter | [📋](tasks/phase-1-foundation-error-codes-and-schemas/execution.log.md#task-t002) | T002 |
| 1.2 | [x] | Implement E172-E179 error codes | 2 | All tests from 1.1 pass; error codes exported from errors module | [📋](tasks/phase-1-foundation-error-codes-and-schemas/execution.log.md#task-t003-t004) | T003-T004 |
| 1.3 | [x] | Write tests for Question schema | 2 | Tests verify Zod validation: question_id, node_id, type, text, options, asked_at, answer, answered_at | [📋](tasks/phase-1-foundation-error-codes-and-schemas/execution.log.md#task-t005) | T005 |
| 1.4 | [x] | Write tests for extended NodeStateEntry | 2 | Tests verify pending_question_id and error fields | [📋](tasks/phase-1-foundation-error-codes-and-schemas/execution.log.md#task-t006) | T006 |
| 1.5 | [x] | Extend StateSchema with Question type | 2 | Schema compiles; all tests from 1.3-1.4 pass | [📋](tasks/phase-1-foundation-error-codes-and-schemas/execution.log.md#task-t007-t008) | T007-T008 |
| 1.6 | [x] | Create test helper: stubWorkUnitLoader with output declarations | 2 | Helper returns WorkUnit with configurable inputs/outputs | [📋](tasks/phase-1-foundation-error-codes-and-schemas/execution.log.md#task-t009) | T009 |
| 1.7 | [x] | Update interface exports | 1 | Question, NodeStateEntry types exported from schemas/index.ts | [📋](tasks/phase-1-foundation-error-codes-and-schemas/execution.log.md#task-t008) | T008 |

#### Test Examples

```typescript
// test/unit/positional-graph/execution-errors.test.ts
describe('Execution Lifecycle Error Codes', () => {
  test('E172 InvalidStateTransition includes from and to states', () => {
    /**
     * Purpose: Proves E172 error provides actionable transition context
     * Quality Contribution: Enables debugging of state machine violations
     * Acceptance Criteria: Error includes from state, to state, node ID
     */
    const error = invalidStateTransitionError('node-123', 'complete', 'running');
    expect(error.code).toBe('E172');
    expect(error.message).toContain('complete');
    expect(error.message).toContain('running');
  });

  test('E179 FileNotFound includes source path', () => {
    /**
     * Purpose: Proves file errors provide path for debugging
     * Quality Contribution: Prevents confusion when files are missing
     * Acceptance Criteria: Error includes the missing path
     */
    const error = fileNotFoundError('/path/to/missing.txt');
    expect(error.code).toBe('E179');
    expect(error.message).toContain('/path/to/missing.txt');
  });
});
```

#### Acceptance Criteria
- [x] All error code tests passing (7 error codes)
- [x] Schema extension tests passing
- [x] Test helper usable in subsequent phases
- [x] Existing tests still pass (no regression)

---

### Phase 2: Output Storage

**Objective**: Implement output storage methods that enable data flow between nodes.

**Deliverables**:
- 4 service methods: `saveOutputData`, `saveOutputFile`, `getOutputData`, `getOutputFile`
- 4 CLI commands under `cg wf node`
- Output stored in `nodes/<nodeId>/data.json` and `files/`

**Dependencies**: Phase 1 complete (error codes E175, E179 required)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Path traversal attack | Low | Critical | Validate all paths; containment check before copy |
| Large file memory issues | Low | Medium | Stream copy, don't load into memory |

#### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 2.1 | [x] | Write tests for `saveOutputData` service method | 2 | Tests: saves value to data.json, merges with existing, handles JSON types | [📋](tasks/phase-2-output-storage/execution.log.md#task-t001) | 21 tests for all 4 methods [^4] |
| 2.2 | [x] | Implement `saveOutputData` in service | 2 | All tests from 2.1 pass; atomic write pattern used | [📋](tasks/phase-2-output-storage/execution.log.md#task-t003) | All 4 methods implemented [^4] |
| 2.3 | [x] | Add interface signature for `saveOutputData` | 1 | Interface updated; TypeScript compiles | [📋](tasks/phase-2-output-storage/execution.log.md#task-t002) | 4 result types + 4 signatures [^4] |
| 2.4 | [x] | Add CLI command `cg wf node save-output-data` | 2 | CLI invokes service method; JSON output per workshop | [📋](tasks/phase-2-output-storage/execution.log.md#tasks-t004-t008-t011-t014) | Complete [^4] |
| 2.5 | [x] | Write tests for `saveOutputFile` with path validation | 3 | Tests: copies file, validates path traversal, creates files/ dir | [📋](tasks/phase-2-output-storage/execution.log.md#task-t001) | Included in T001 [^4] |
| 2.6 | [x] | Implement `saveOutputFile` in service | 3 | All tests from 2.5 pass; path containment check enforced | [📋](tasks/phase-2-output-storage/execution.log.md#task-t003) | Implemented with T003 [^4] |
| 2.6a | [x] | Add interface signature for `saveOutputFile` | 1 | Interface updated; TypeScript compiles | [📋](tasks/phase-2-output-storage/execution.log.md#task-t002) | Included in T002 [^4] |
| 2.7 | [x] | Add CLI command `cg wf node save-output-file` | 2 | CLI invokes service; JSON output per workshop | [📋](tasks/phase-2-output-storage/execution.log.md#tasks-t004-t008-t011-t014) | Complete [^4] |
| 2.8 | [x] | Write tests for `getOutputData` | 2 | Tests: reads from data.json, returns E175 if missing | [📋](tasks/phase-2-output-storage/execution.log.md#task-t001) | Included in T001 [^4] |
| 2.9 | [x] | Implement `getOutputData` in service | 2 | All tests from 2.8 pass | [📋](tasks/phase-2-output-storage/execution.log.md#task-t003) | Implemented with T003 [^4] |
| 2.9a | [x] | Add interface signature for `getOutputData` | 1 | Interface updated; TypeScript compiles | [📋](tasks/phase-2-output-storage/execution.log.md#task-t002) | Included in T002 [^4] |
| 2.10 | [x] | Add CLI command `cg wf node get-output-data` | 2 | CLI invokes service; JSON output per workshop | [📋](tasks/phase-2-output-storage/execution.log.md#tasks-t004-t008-t011-t014) | Complete [^4] |
| 2.11 | [x] | Write tests for `getOutputFile` | 2 | Tests: returns absolute path, E175 if missing | [📋](tasks/phase-2-output-storage/execution.log.md#task-t001) | Included in T001 [^4] |
| 2.12 | [x] | Implement `getOutputFile` in service | 2 | All tests from 2.11 pass | [📋](tasks/phase-2-output-storage/execution.log.md#task-t003) | Implemented with T003 [^4] |
| 2.12a | [x] | Add interface signature for `getOutputFile` | 1 | Interface updated; TypeScript compiles | [📋](tasks/phase-2-output-storage/execution.log.md#task-t002) | Included in T002 [^4] |
| 2.13 | [x] | Add CLI command `cg wf node get-output-file` | 2 | CLI invokes service; JSON output per workshop | [📋](tasks/phase-2-output-storage/execution.log.md#tasks-t004-t008-t011-t014) | Complete [^4] |

#### Test Examples

```typescript
// test/unit/positional-graph/output-storage.test.ts
describe('saveOutputFile path validation', () => {
  test('should reject path traversal in source path', async () => {
    /**
     * Purpose: Prevents arbitrary file read via malicious source path
     * Quality Contribution: Critical security control
     * Acceptance Criteria: E179 returned for ../etc/passwd
     */
    const result = await service.saveOutputFile(
      ctx, 'graph-1', 'node-1', 'output-name', '../../../etc/passwd'
    );
    expect(result.success).toBe(false);
    expect(result.errors[0].code).toBe('E179');
  });

  test('should reject path traversal in output name', async () => {
    /**
     * Purpose: Prevents directory escape via malicious output name
     * Quality Contribution: Critical security control
     * Acceptance Criteria: Error returned for ../malicious
     */
    const result = await service.saveOutputFile(
      ctx, 'graph-1', 'node-1', '../malicious', '/valid/source.txt'
    );
    expect(result.success).toBe(false);
  });
});
```

#### Non-Happy-Path Coverage
- [ ] Path traversal in source path → E179
- [ ] Path traversal in output name → error
- [ ] Source file doesn't exist → E179
- [ ] Output name with special characters → sanitized or rejected
- [ ] Overwrite existing output → succeeds (per clarification Q5)

#### Acceptance Criteria
- [ ] All 4 output methods tests passing
- [ ] All 4 CLI commands functional with --json flag
- [ ] Path traversal attacks prevented
- [ ] AC-8, AC-9, AC-10, AC-11 satisfied

---

### Phase 3: Node Lifecycle

**Objective**: Implement state transition methods for node execution lifecycle.

**Deliverables**:
- 3 service methods: `startNode`, `endNode`, `canEnd`
- 3 CLI commands under `cg wf node`
- Centralized `transitionNodeState()` helper

**Dependencies**: Phase 2 complete (`canEnd` depends on output storage)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Invalid state transition | Medium | High | Strict validation before mutation |
| WorkUnit loader unavailable | Low | Medium | Graceful degradation in canEnd |

#### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Write tests for state transition helper | 3 | Tests: validates from-state, writes atomically, handles all transitions | - | execution-lifecycle.test.ts |
| 3.2 | [ ] | Implement private `transitionNodeState()` helper | 3 | All tests from 3.1 pass; atomic write pattern | - | positional-graph.service.ts |
| 3.3 | [ ] | Write tests for `canEnd` service method | 2 | Tests: checks required outputs, returns missing list | - | execution-lifecycle.test.ts |
| 3.4 | [ ] | Implement `canEnd` in service | 2 | All tests from 3.3 pass; graceful degradation if WorkUnit missing | - | positional-graph.service.ts |
| 3.4a | [ ] | Add interface signature for `canEnd` | 1 | Interface updated; TypeScript compiles | - | positional-graph-service.interface.ts |
| 3.5 | [ ] | Add CLI command `cg wf node can-end` | 2 | CLI invokes service; JSON output per workshop | - | positional-graph.command.ts |
| 3.6 | [ ] | Write tests for `startNode` | 3 | Tests: pending→running, ready→running, E172 for invalid states | - | execution-lifecycle.test.ts |
| 3.7 | [ ] | Implement `startNode` in service | 2 | All tests from 3.6 pass; uses transitionNodeState | - | positional-graph.service.ts |
| 3.7a | [ ] | Add interface signature for `startNode` | 1 | Interface updated; TypeScript compiles | - | positional-graph-service.interface.ts |
| 3.8 | [ ] | Add CLI command `cg wf node start` | 2 | CLI invokes service; JSON output per workshop | - | positional-graph.command.ts |
| 3.9 | [ ] | Write tests for `endNode` | 3 | Tests: running→complete, direct output pattern (ready→complete), missing outputs→E175 | - | execution-lifecycle.test.ts |
| 3.10 | [ ] | Implement `endNode` in service | 3 | All tests from 3.9 pass; calls canEnd internally | - | positional-graph.service.ts |
| 3.10a | [ ] | Add interface signature for `endNode` | 1 | Interface updated; TypeScript compiles | - | positional-graph-service.interface.ts |
| 3.11 | [ ] | Add CLI command `cg wf node end` | 2 | CLI invokes service; JSON output per workshop | - | positional-graph.command.ts |

#### Test Examples

```typescript
// test/unit/positional-graph/execution-lifecycle.test.ts
describe('startNode state machine', () => {
  test('should transition from ready to running', async () => {
    /**
     * Purpose: Proves normal start flow works
     * Quality Contribution: Core execution lifecycle
     * Acceptance Criteria: Status becomes running, started_at set
     */
    // Setup: node exists, is ready (all gates pass)
    const result = await service.startNode(ctx, 'graph-1', 'node-1');
    expect(result.success).toBe(true);
    expect(result.data.status).toBe('running');
    expect(result.data.startedAt).toBeDefined();
  });

  test('should reject double start with E172', async () => {
    /**
     * Purpose: Prevents state corruption from duplicate start
     * Quality Contribution: State machine integrity
     * Acceptance Criteria: E172 InvalidStateTransition returned
     */
    await service.startNode(ctx, 'graph-1', 'node-1');
    const result = await service.startNode(ctx, 'graph-1', 'node-1');
    expect(result.success).toBe(false);
    expect(result.errors[0].code).toBe('E172');
  });
});

describe('endNode direct output pattern', () => {
  test('should allow end without start when outputs saved', async () => {
    /**
     * Purpose: Proves AC-4 direct output pattern works
     * Quality Contribution: Enables data-only nodes
     * Acceptance Criteria: ready → complete transition succeeds
     */
    // Setup: node ready, outputs saved via saveOutputData
    await service.saveOutputData(ctx, 'graph-1', 'node-1', 'spec', 'value');
    const result = await service.endNode(ctx, 'graph-1', 'node-1');
    expect(result.success).toBe(true);
    expect(result.data.status).toBe('complete');
  });
});
```

#### Non-Happy-Path Coverage
- [ ] Start on already-running node → E172
- [ ] Start on complete node → E172
- [ ] End on pending node with missing outputs → E175
- [ ] End on waiting-question node → E172
- [ ] canEnd when WorkUnit not found → graceful degradation (warning, allow proceed)

#### Acceptance Criteria
- [ ] All 3 lifecycle methods tests passing
- [ ] All 3 CLI commands functional with --json flag
- [ ] State machine transitions validated
- [ ] AC-1, AC-2, AC-3, AC-4, AC-16, AC-17 satisfied

---

### Phase 4: Question/Answer Protocol

**Objective**: Implement question/answer methods for orchestrator handoff.

**Deliverables**:
- 3 service methods: `askQuestion`, `answerQuestion`, `getAnswer`
- 3 CLI commands under `cg wf node`
- Questions stored in state.json `questions` array

**Dependencies**: Phase 3 complete (uses state transition helper)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Q/A state desync | Medium | High | Single atomic write for all state changes |
| Orphaned questions | Low | Low | Validate state invariants on read |

#### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Write tests for `askQuestion` service method | 3 | Tests: generates timestamp ID, transitions to waiting-question, stores question | - | question-answer.test.ts |
| 4.2 | [ ] | Implement `askQuestion` in service | 3 | All tests from 4.1 pass; atomic write pattern | - | positional-graph.service.ts |
| 4.2a | [ ] | Add interface signature for `askQuestion` | 1 | Interface updated; TypeScript compiles | - | positional-graph-service.interface.ts |
| 4.3 | [ ] | Add CLI command `cg wf node ask` | 2 | CLI supports --type, --text, --options; JSON output per workshop | - | positional-graph.command.ts |
| 4.4 | [ ] | Write tests for `answerQuestion` | 3 | Tests: stores answer, transitions to running, E173 for invalid qId, E177 if not waiting | - | question-answer.test.ts |
| 4.5 | [ ] | Implement `answerQuestion` in service | 3 | All tests from 4.4 pass; clears pendingQuestion atomically | - | positional-graph.service.ts |
| 4.5a | [ ] | Add interface signature for `answerQuestion` | 1 | Interface updated; TypeScript compiles | - | positional-graph-service.interface.ts |
| 4.6 | [ ] | Add CLI command `cg wf node answer` | 2 | CLI invokes service; JSON output per workshop | - | positional-graph.command.ts |
| 4.7 | [ ] | Write tests for `getAnswer` | 2 | Tests: retrieves answer, E173 if qId invalid, answered:false if not answered | - | question-answer.test.ts |
| 4.8 | [ ] | Implement `getAnswer` in service | 2 | All tests from 4.7 pass | - | positional-graph.service.ts |
| 4.8a | [ ] | Add interface signature for `getAnswer` | 1 | Interface updated; TypeScript compiles | - | positional-graph-service.interface.ts |
| 4.9 | [ ] | Add CLI command `cg wf node get-answer` | 2 | CLI invokes service; JSON output per workshop | - | positional-graph.command.ts |

#### Test Examples

```typescript
// test/unit/positional-graph/question-answer.test.ts
describe('askQuestion', () => {
  test('should generate timestamp-based question ID', async () => {
    /**
     * Purpose: Proves question ID format matches PL-08 pattern
     * Quality Contribution: Enables sorting and debugging
     * Acceptance Criteria: ID matches YYYY-MM-DDTHH:mm:ss.sssZ_xxx pattern
     */
    const result = await service.askQuestion(ctx, 'graph-1', 'node-1', {
      type: 'single',
      text: 'Which language?',
      options: ['bash', 'python']
    });
    expect(result.data.questionId).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z_[a-f0-9]+$/);
  });

  test('should require running state', async () => {
    /**
     * Purpose: Prevents questions from non-running nodes
     * Quality Contribution: State machine integrity
     * Acceptance Criteria: E176 NodeNotRunning returned
     */
    // Node is ready, not running
    const result = await service.askQuestion(ctx, 'graph-1', 'node-1', {
      type: 'text',
      text: 'Question?'
    });
    expect(result.success).toBe(false);
    expect(result.errors[0].code).toBe('E176');
  });
});
```

#### Non-Happy-Path Coverage
- [ ] Ask on non-running node → E176
- [ ] Answer with invalid questionId → E173
- [ ] Answer on non-waiting node → E177
- [ ] getAnswer on unanswered question → answered: false
- [ ] Multiple questions from same node → all stored in questions array

#### Acceptance Criteria
- [ ] All 3 Q/A methods tests passing
- [ ] All 3 CLI commands functional with --json flag
- [ ] State consistency maintained (atomic writes)
- [ ] AC-5, AC-6, AC-7, AC-18 satisfied

---

### Phase 5: Input Retrieval

**Objective**: Implement input retrieval methods that reuse existing `collateInputs` algorithm.

**Deliverables**:
- 2 service methods: `getInputData`, `getInputFile`
- 2 CLI commands under `cg wf node`
- Leverages existing `collateInputs` for resolution

**Dependencies**: Phase 2 complete (reads from output storage)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Input resolution complexity | Low | Medium | Reuse collateInputs, don't duplicate |
| Source node incomplete | Medium | Medium | Return E178 with clear message |

#### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 5.1 | [ ] | Write tests for `getInputData` | 3 | Tests: resolves via collateInputs, E178 if source incomplete, E175 if output missing | - | input-retrieval.test.ts |
| 5.2 | [ ] | Implement `getInputData` in service | 2 | All tests from 5.1 pass; wrapper around collateInputs | - | positional-graph.service.ts |
| 5.2a | [ ] | Add interface signature for `getInputData` | 1 | Interface updated; TypeScript compiles | - | positional-graph-service.interface.ts |
| 5.3 | [ ] | Add CLI command `cg wf node get-input-data` | 2 | CLI invokes service; JSON output per workshop | - | positional-graph.command.ts |
| 5.4 | [ ] | Write tests for `getInputFile` | 3 | Tests: returns absolute path, E178/E175 error cases | - | input-retrieval.test.ts |
| 5.5 | [ ] | Implement `getInputFile` in service | 2 | All tests from 5.4 pass; wrapper around collateInputs | - | positional-graph.service.ts |
| 5.5a | [ ] | Add interface signature for `getInputFile` | 1 | Interface updated; TypeScript compiles | - | positional-graph-service.interface.ts |
| 5.6 | [ ] | Add CLI command `cg wf node get-input-file` | 2 | CLI invokes service; JSON output per workshop | - | positional-graph.command.ts |

#### Test Examples

```typescript
// test/unit/positional-graph/input-retrieval.test.ts
describe('getInputData', () => {
  test('should resolve input from complete upstream node', async () => {
    /**
     * Purpose: Proves end-to-end data flow works
     * Quality Contribution: Core pipeline functionality
     * Acceptance Criteria: Returns value from source node
     */
    // Setup: source node complete, output saved
    await service.saveOutputData(ctx, 'graph-1', 'source-node', 'output-name', 'value');
    await service.endNode(ctx, 'graph-1', 'source-node');
    // Target node has input wired to source
    const result = await service.getInputData(ctx, 'graph-1', 'target-node', 'input-name');
    expect(result.data.value).toBe('value');
    expect(result.data.sourceNodeId).toBe('source-node');
  });

  test('should return E178 when source node incomplete', async () => {
    /**
     * Purpose: Prevents reading incomplete inputs
     * Quality Contribution: Data integrity
     * Acceptance Criteria: E178 InputNotAvailable returned
     */
    // Source node running, not complete
    const result = await service.getInputData(ctx, 'graph-1', 'target-node', 'input-name');
    expect(result.success).toBe(false);
    expect(result.errors[0].code).toBe('E178');
  });
});
```

#### Non-Happy-Path Coverage
- [ ] Source node incomplete → E178
- [ ] Source node complete but output missing → E175
- [ ] Input not wired → E160 (existing error)
- [ ] Source node deleted → E153 (existing error)

#### Acceptance Criteria
- [ ] All 2 input retrieval methods tests passing
- [ ] All 2 CLI commands functional with --json flag
- [ ] `collateInputs` reused, not duplicated
- [ ] AC-12, AC-13 satisfied

---

### Phase 6: E2E Test and Documentation

**Objective**: Create E2E test script and documentation for agent developers.

**Deliverables**:
- E2E test script: `e2e-positional-graph-flow.ts`
- Documentation in `docs/how/positional-graph-execution/`
- CLI --help text for all commands

**Dependencies**: Phases 1-5 complete

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| E2E test environment issues | Low | Medium | Use temp directories, cleanup after |
| Documentation drift | Medium | Low | Include in phase acceptance criteria |

#### Tasks (Lightweight Approach for Documentation)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 6.1 | [ ] | Create E2E test script skeleton | 2 | Script structure per workshop; TypeScript compiles | - | test/e2e/positional-graph-execution-e2e.ts |
| 6.2 | [ ] | Implement cleanup and graph creation | 2 | Creates graph, adds lines and nodes | - | Same file |
| 6.3 | [ ] | Implement node1 direct output execution | 2 | save-output-data → end; node complete | - | Same file |
| 6.4 | [ ] | Implement node2 agent with question | 3 | start → ask → answer → save outputs → end | - | Same file |
| 6.5 | [ ] | Implement node3 input retrieval and execution | 2 | get-input-data/file → save outputs → end | - | Same file |
| 6.6 | [ ] | Implement final validation | 2 | All nodes complete, graph complete | - | Same file |
| 6.7 | [ ] | Survey existing docs/how/ structure | 1 | Document existing feature areas | - | Discovery step |
| 6.8 | [ ] | Create docs/how/positional-graph-execution/1-overview.md | 2 | State machine, CLI overview, architecture diagram | - | New docs |
| 6.9 | [ ] | Create docs/how/positional-graph-execution/2-cli-reference.md | 2 | All 12 commands documented with examples | - | New docs |
| 6.10 | [ ] | Create docs/how/positional-graph-execution/3-e2e-flow.md | 2 | Step-by-step E2E flow walkthrough | - | New docs |
| 6.11 | [ ] | Add CLI --help text for all 12 commands | 2 | Help text per workshop specs | - | positional-graph.command.ts |
| 6.12 | [ ] | Run full E2E test | 2 | E2E passes with real filesystem | - | Integration test |

#### Acceptance Criteria
- [ ] E2E test passes (AC-14)
- [ ] All commands return valid JSON (AC-15)
- [ ] Documentation complete in docs/how/positional-graph-execution/
- [ ] CLI --help text matches workshop specs

---

## Cross-Cutting Concerns

### Security Considerations

**Path Traversal Prevention** (Critical):
- All file paths validated using `path.resolve()` before operations
- Output names sanitized: reject `..`, `/`, `\`
- Destination containment check: resolved path must be within node's directory

**Input Validation**:
- JSON values parsed safely (try/catch with error code)
- Node IDs validated before filesystem operations (per PL-09)

### Observability

**Logging Strategy**:
- Service methods log state transitions at INFO level
- Error conditions logged at WARN level
- File operations logged at DEBUG level

**Error Tracking**:
- All errors use structured error codes (E172-E179)
- Error details include context (nodeId, graphSlug, operation)

### Documentation

**Location**: docs/how/positional-graph-execution/ (per Documentation Strategy)

**Content Structure**:
1. `1-overview.md` - State machine, architecture
2. `2-cli-reference.md` - All 12 commands
3. `3-e2e-flow.md` - Step-by-step walkthrough

**Target Audience**: Agent developers, orchestrator implementers

---

## File Placement Manifest

| File | Classification | Location | Rationale |
|------|---------------|----------|-----------|
| Error code additions | cross-cutting | `packages/positional-graph/src/errors/positional-graph-errors.ts` | Extends existing error module |
| State schema extensions | cross-cutting | `packages/positional-graph/src/schemas/state.schema.ts` | Extends existing schema |
| Service method implementations | cross-cutting | `packages/positional-graph/src/services/positional-graph.service.ts` | Extends existing service |
| Interface additions | cross-cutting | `packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` | Extends existing interface |
| CLI command handlers | cross-cutting | `apps/cli/src/commands/positional-graph.command.ts` | Extends existing CLI |
| Unit tests | plan-scoped | `test/unit/positional-graph/execution-lifecycle.test.ts` | New test file |
| Unit tests | plan-scoped | `test/unit/positional-graph/question-answer.test.ts` | New test file |
| Unit tests | plan-scoped | `test/unit/positional-graph/output-storage.test.ts` | New test file |
| Unit tests | plan-scoped | `test/unit/positional-graph/input-retrieval.test.ts` | New test file |
| E2E test | plan-scoped | `test/e2e/positional-graph-execution-e2e.ts` | New test file |
| Documentation | plan-scoped | `docs/how/positional-graph-execution/*.md` | New docs directory |

**Note**: Most implementation extends existing files (cross-cutting), while tests and docs are plan-scoped.

---

## Complexity Tracking

| Component | CS | Label | Breakdown | Justification | Mitigation |
|-----------|-----|-------|-----------|---------------|------------|
| State transition helper | 3 | Medium | S=1,I=1,D=1,N=0,F=0,T=0 | Atomic writes, state validation | Extensive test coverage |
| Path validation in saveOutputFile | 3 | Medium | S=0,I=0,D=0,N=1,F=2,T=0 | Security-critical | Multiple validation layers |
| Q/A atomic state | 3 | Medium | S=0,I=1,D=1,N=0,F=1,T=0 | State consistency risk | Single atomic write |

**Overall Plan Complexity**: CS-2 (per spec), but individual components reach CS-3.

---

## Progress Tracking

### Phase Completion Checklist
- [x] Phase 1: Foundation - Error Codes and Schemas - Complete
- [x] Phase 2: Output Storage - Complete (21 tests, 4 service methods, 4 CLI commands)
- [ ] Phase 3: Node Lifecycle - [Status]
- [ ] Phase 4: Question/Answer Protocol - [Status]
- [ ] Phase 5: Input Retrieval - [Status]
- [ ] Phase 6: E2E Test and Documentation - [Status]

### STOP Rule

**IMPORTANT**: This plan must be complete before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## ADR Ledger

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0006 | Accepted | All | CLI-based orchestration pattern; commands are the interface |
| ADR-0008 | Accepted | All | Workspace split storage; data in `.chainglass/data/workflows/` |

---

## Change Footnotes Ledger

### Phase 1: Foundation - Error Codes and Schemas

[^1]: Phase 1 - Error codes E172-E179 implementation
  - `file:packages/positional-graph/src/errors/positional-graph-errors.ts` - Added 7 error factories
  - `file:packages/positional-graph/src/errors/index.ts` - Exported new error factories
  - `file:test/unit/positional-graph/execution-errors.test.ts` - 16 tests for error codes

[^2]: Phase 1 - Question schema and NodeStateEntry extensions
  - `file:packages/positional-graph/src/schemas/state.schema.ts` - QuestionSchema, NodeStateEntryErrorSchema
  - `file:packages/positional-graph/src/schemas/index.ts` - Exported new schemas and types
  - `file:test/unit/positional-graph/schemas.test.ts` - 22 new tests for Question/NodeStateEntry

[^3]: Phase 1 - Test helper stubWorkUnitLoader
  - `file:test/unit/positional-graph/test-helpers.ts` - stubWorkUnitLoader, createWorkUnit, testFixtures

### Phase 2: Output Storage

[^4]: Phase 2 - Output storage implementation (TDD - 21 tests, 4 service methods, 4 CLI commands)
  - `file:test/unit/positional-graph/output-storage.test.ts` - 21 tests (saveOutputData 6, saveOutputFile 7, getOutputData 4, getOutputFile 4)
  - `file:packages/positional-graph/src/interfaces/positional-graph-service.interface.ts` - SaveOutputDataResult, SaveOutputFileResult, GetOutputDataResult, GetOutputFileResult + 4 method signatures
  - `method:packages/positional-graph/src/services/positional-graph.service.ts:PositionalGraphService.saveOutputData` - Atomic write to data.json
  - `method:packages/positional-graph/src/services/positional-graph.service.ts:PositionalGraphService.saveOutputFile` - File copy with path traversal prevention
  - `method:packages/positional-graph/src/services/positional-graph.service.ts:PositionalGraphService.getOutputData` - Read value from data.json
  - `method:packages/positional-graph/src/services/positional-graph.service.ts:PositionalGraphService.getOutputFile` - Resolve relative to absolute path
  - `function:apps/cli/src/commands/positional-graph.command.ts:handleSaveOutputData` - CLI handler
  - `function:apps/cli/src/commands/positional-graph.command.ts:handleSaveOutputFile` - CLI handler
  - `function:apps/cli/src/commands/positional-graph.command.ts:handleGetOutputData` - CLI handler
  - `function:apps/cli/src/commands/positional-graph.command.ts:handleGetOutputFile` - CLI handler
