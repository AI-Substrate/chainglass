# Positional Graph Orchestration System — Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-05
**Spec**: [./positional-orchestrator-spec.md](./positional-orchestrator-spec.md)
**Status**: DRAFT

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Workshops](#workshops)
4. [Critical Research Findings](#critical-research-findings)
5. [Testing Philosophy](#testing-philosophy)
6. [Project Structure](#project-structure)
7. [Implementation Phases](#implementation-phases)
   - [Phase 1: PositionalGraphReality Snapshot](#phase-1-positionalgraphreality-snapshot)
   - [Phase 2: OrchestrationRequest Discriminated Union](#phase-2-orchestrationrequest-discriminated-union)
   - [Phase 3: AgentContextService](#phase-3-agentcontextservice)
   - [Phase 4: WorkUnitPods and PodManager](#phase-4-workunitpods-and-podmanager)
   - [Phase 5: ONBAS Walk Algorithm](#phase-5-onbas-walk-algorithm)
   - [Phase 6: ODS Action Handlers](#phase-6-ods-action-handlers)
   - [Phase 7: Orchestration Entry Point](#phase-7-orchestration-entry-point)
   - [Phase 8: E2E and Integration Testing](#phase-8-e2e-and-integration-testing)
8. [Cross-Cutting Concerns](#cross-cutting-concerns)
9. [File Placement Manifest](#file-placement-manifest)
10. [Complexity Tracking](#complexity-tracking)
11. [Progress Tracking](#progress-tracking)
12. [ADR Ledger](#adr-ledger)
13. [Deviation Ledger](#deviation-ledger)
14. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

The positional graph (Plan 026) has structure and state but no engine to drive it. This plan delivers an orchestration system — a loop that reads graph state, decides what to do next, executes the decision, and repeats — through 8 phases, each delivering one key component workshopped in detail.

**Solution approach**:
- Phase 1-2: Data models (immutable snapshot + discriminated union for actions)
- Phase 3-4: Internal collaborators (context rules + execution containers)
- Phase 5-6: Decision and execution engines (ONBAS walk + ODS action handlers)
- Phase 7: Entry point facade (IOrchestrationService + IGraphOrchestration)
- Phase 8: End-to-end validation (human-as-agent testing)

**Expected outcomes**: A fully testable orchestration loop that advances graphs through multi-line, multi-node workflows using fake agents, with deterministic behavior proven by comprehensive tests.

---

## Technical Context

### Current System State

- **Plan 026** delivers the positional graph model: ordered lines, serial/parallel nodes, 4-gate readiness, input wiring
- **Plan 027** delivers `ICentralEventNotifier` for domain event broadcast via SSE
- **Plan 029** delivers agentic work units: discriminated types (agent, code, user-input), `IWorkUnitService`, CLI execution lifecycle commands
- **Plan 019** delivers `IAgentAdapter` for agent execution (run, compact, terminate) — accessed via `IAgentManagerService`

### Integration Requirements

- `IPositionalGraphService` (POSITIONAL_GRAPH_DI_TOKENS.POSITIONAL_GRAPH_SERVICE) — graph CRUD, status, state reads
- `IWorkUnitService` (POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE) — work unit loading and type resolution
- `ICentralEventNotifier` (WORKSPACE_DI_TOKENS.CENTRAL_EVENT_NOTIFIER) — domain event emission
- `IAgentManagerService` (SHARED_DI_TOKENS.AGENT_MANAGER_SERVICE) — agent adapter resolution

### Constraints

- All new code in `packages/positional-graph/src/features/030-orchestration/` (PlanPak)
- Only 1 public DI token: `ORCHESTRATION_DI_TOKENS.ORCHESTRATION_SERVICE`
- Internal collaborators (ONBAS, ODS, PodManager, AgentContextService) stay private — not in DI
- Web/CLI wiring explicitly out of scope — tests call `.run()` directly
- Fakes over mocks: no `vi.mock`/`jest.mock` ever

### Assumptions

- Orchestration is single-process: one `run()` invocation at a time per graph
- `getNodeStatus()` correctly implements the 4-gate readiness algorithm
- `IAgentAdapter.run()` returns a stable `sessionId` for resumption
- Graph structure does not change during orchestration
- Line 0 is reserved for user-input/setup nodes with auto-transition

---

## Workshops

**Workshops**: 10 complete
- [Workshop #1: PositionalGraphReality](./workshops/01-positional-graph-reality.md) — Snapshot of entire graph state
- [Workshop #2: OrchestrationRequest](./workshops/02-orchestration-request.md) — Discriminated union for orchestrator actions
- [Workshop #3: AgentContextService](./workshops/03-agent-context-service.md) — Context continuity rules
- [Workshop #4: WorkUnitPods](./workshops/04-work-unit-pods.md) — Execution containers for nodes
- [Workshop #5: ONBAS](./workshops/05-onbas.md) — Rules engine: graph to next action
- [Workshop #6: E2E Integration Testing](./workshops/06-e2e-integration-testing.md) — Human-as-agent E2E + integration test strategy
- [Workshop #7: Orchestration Entry Point](./workshops/07-orchestration-entry-point.md) — IOrchestrationService + IGraphOrchestration
- [Workshop #8: ODS](./workshops/08-ods-orchestrator-agent-handover.md) — Executor: action to state change
- [Workshop #9: Concept Drift Audit](./workshops/09-concept-drift-audit.md) — Plan 030/032 domain boundary alignment
- [Workshop #10: node:restart Mechanics](./workshops/10-node-restart-mechanics.md) — Convention-based restart protocol via event system

---

## Critical Research Findings

Findings sourced from `research-dossier.md` (55+ findings) and workshop analysis. Ordered by impact.

### 01: Snapshot Must Compose Existing Services, Not Duplicate

**Impact**: Critical
**Sources**: Research IA-02, IA-04; Workshop #1
**Problem**: PositionalGraphReality needs data from `getNodeStatus()`, `getLineStatus()`, input resolution, and question state — all already computed by `IPositionalGraphService`.
**Action**: `buildPositionalGraphReality()` calls `IPositionalGraphService.getStatus()` and composes the result with pod session data. Never re-implement gate logic.
**Affects**: Phase 1

### 02: Four-Type Discriminated Union is Exhaustive

**Impact**: Critical
**Sources**: Research PL-09; Workshop #2
**Problem**: The research dossier proposed a 5-type union with `continue-agent` and `complete`. Workshops refined to 4 types: `start-node`, `resume-node`, `question-pending`, `no-action`. The `no-action` variant carries a `reason` field that covers all terminal conditions (graph-complete, graph-failed, all-running, etc.).
**Action**: Implement exactly 4 variants per Workshop #2. Use TypeScript exhaustive `never` check in switch statements.
**Affects**: Phase 2, Phase 5, Phase 6

### 03: IAgentAdapter Has No DI Token

**Impact**: Critical
**Sources**: Research IA-08, IA-14
**Problem**: `IAgentAdapter` is resolved through `IAgentManagerService.getAgent(agentType)`, not directly from the container. Pods cannot inject `IAgentAdapter` directly.
**Action**: PodManager receives `IAgentManagerService` and passes the correct adapter to each pod based on work unit type.
**Affects**: Phase 4, Phase 6

### 04: ONBAS is Pure and Synchronous

**Impact**: Critical
**Sources**: Workshop #5
**Problem**: ONBAS must have zero side effects — no I/O, no adapter calls, no memory between invocations. It receives a snapshot and returns a request.
**Action**: `walkForNextAction(reality: PositionalGraphReality): OrchestrationRequest` is a pure function. No `async`. No injected services.
**Affects**: Phase 5

### 05: Pod Sessions Persist via Atomic Writes

**Impact**: High
**Sources**: Research IA-15; Workshop #4
**Problem**: Pod session IDs must survive server restarts. The existing codebase uses temp-then-rename for all state persistence.
**Action**: PodManager writes `pod-sessions.json` using `IFileSystem.writeFileAtomic()` (or equivalent temp+rename pattern). Sessions are a simple `Record<nodeId, sessionId>` map.
**Affects**: Phase 4

### 06: Context Inheritance is Positional, Not Temporal

**Impact**: High
**Sources**: Workshop #3
**Problem**: An agent's context source is determined by its position in the graph (line index, position within line, execution mode), not by when it ran.
**Action**: Implement `getContextSource()` as a pure function on `PositionalGraphReality` following the 5 rules from Workshop #3.
**Affects**: Phase 3

### 07: Question Lifecycle Is Event-Based (Updated per Workshop 09/10)

**Impact**: High
**Sources**: Workshop #5, #9, #10, Spec AC-9
**Problem**: Originally described as "three states" managed by direct ONBAS/ODS state writes. Plan 032 introduced event handlers that own state transitions for questions. The handler `handleQuestionAnswer` was crossing the domain boundary by transitioning status.
**Action**: Question lifecycle flows through events: `question:ask` (handler sets `waiting-question`), `question:answer` (handler stamps only — no status transition), `node:restart` (handler sets `restart-pending`). ONBAS reads settled state via reality builder. ODS executes graph actions (start-node, resume-node). Two-domain boundary: Event Domain records, Graph Domain decides and acts.
**Affects**: Phase 5, Phase 6

### 08: Existing `canRun` Gates Must Not Be Replaced

**Impact**: High
**Sources**: Research IA-04
**Problem**: The 4-gate readiness algorithm (`canRun`) already handles dependency checks, input availability, predecessor completion, and line readiness. Orchestration reads the result; it does not re-implement the logic.
**Action**: `PositionalGraphReality.readyNodeIds` is derived from nodes where all 4 gates pass. ONBAS trusts this list.
**Affects**: Phase 1, Phase 5

### 09: ICentralEventNotifier Token Location

**Impact**: High
**Sources**: Research IA-10; ADR-0010
**Problem**: The `ICentralEventNotifier` token is `WORKSPACE_DI_TOKENS.CENTRAL_EVENT_NOTIFIER`, not `SHARED_DI_TOKENS.EVENT_NOTIFIER` as some workshop examples show.
**Action**: Use the correct token `WORKSPACE_DI_TOKENS.CENTRAL_EVENT_NOTIFIER` in DI registration.
**Affects**: Phase 7

### 10: Two-Level Pattern Caches Handles by Slug

**Impact**: High
**Sources**: Workshop #7
**Problem**: `IOrchestrationService.get()` must return the same `IGraphOrchestration` handle for the same `graphSlug` within a process lifetime. This avoids re-loading sessions on every call.
**Action**: Service maintains a `Map<string, IGraphOrchestration>` registry. Same slug returns same handle.
**Affects**: Phase 7

### 11: Module Registration Follows ADR-0009

**Impact**: Medium
**Sources**: ADR-0009
**Problem**: Orchestration services must be registered via `registerOrchestrationServices(container)` function, not inline in consumer containers.
**Action**: Export `registerOrchestrationServices()` from `packages/positional-graph/src/container.ts` alongside existing registrations.
**Affects**: Phase 7

### 12: Test Graph is 4-Line, 8-Node Pipeline

**Impact**: Medium
**Sources**: Workshop #6
**Problem**: E2E and integration tests need a shared fixture graph that exercises all patterns.
**Action**: Use the Workshop #6 test graph: Line 0 (get-spec), Line 1 (spec-builder, spec-reviewer), Line 2 (coder, tester, alignment-tester), Line 3 (pr-preparer, pr-creator).
**Affects**: Phase 8

### 13: FakeAgentAdapter Already Exists

**Impact**: Medium
**Sources**: Research IA-14
**Problem**: `FakeAgentAdapter` in the test infrastructure already supports configurable responses, session IDs, and call history tracking.
**Action**: Reuse `FakeAgentAdapter` in pod tests. Do not create a new one.
**Affects**: Phase 4

### 14: State Schema Extensions Must Be Optional

**Impact**: Medium
**Sources**: Spec Risk #1
**Problem**: Adding `surfaced_at` to questions and pod session tracking to state.json must not break existing graphs.
**Action**: All new fields are optional in Zod schemas with `z.optional()` and sensible defaults (null, empty).
**Affects**: Phase 1, Phase 4

### 15: Atomic Writes Use Temp-Then-Rename Pattern

**Impact**: Medium
**Sources**: Research IA-15
**Problem**: All state persistence must use the established atomic write pattern to prevent corruption.
**Action**: Write to temp file first, then rename to target. Use existing `writeFileAtomic` or implement the 2-step pattern.
**Affects**: Phase 4, Phase 6

---

## Testing Philosophy

### Testing Approach

**Selected Approach**: Full TDD (per constitution and spec)
**Rationale**: The spec states "TDD-first development" and the constitution mandates RED-GREEN-REFACTOR
**Focus Areas**: Interface contracts, pure function determinism, fake/real parity via contract tests

### Test-Driven Development

Every phase follows the TDD cycle:
1. Write interface (`.interface.ts`)
2. Write fake (`.fake.ts`) implementing the interface + test helpers
3. Write tests against the fake (RED)
4. Implement the real adapter/service (GREEN)
5. Write contract tests proving fake and real behave identically
6. Refactor for quality (REFACTOR)

### Test Documentation

Every test file includes the 5-field Test Doc comment block:
```typescript
/*
Test Doc:
- Why: <business/bug/regression reason>
- Contract: <invariant(s) this test asserts>
- Usage Notes: <how to use the API; gotchas>
- Quality Contribution: <what failure this catches>
- Worked Example: <inputs/outputs for scanning>
*/
```

### Mock Usage

**Policy**: Fakes over mocks — no `vi.mock`/`jest.mock` ever. All test doubles implement the real interface. Contract tests verify fake/real parity.

---

## Project Structure

```
./  (project root)
├── packages/
│   ├── positional-graph/
│   │   └── src/
│   │       ├── features/
│   │       │   ├── 029-agentic-work-units/    # Existing
│   │       │   └── 030-orchestration/          # NEW (PlanPak feature folder)
│   │       │       ├── index.ts                # Public exports
│   │       │       ├── orchestration-types.ts   # Shared types/schemas
│   │       │       ├── reality.interface.ts
│   │       │       ├── reality.builder.ts
│   │       │       ├── orchestration-request.schema.ts
│   │       │       ├── orchestration-request.types.ts
│   │       │       ├── agent-context.ts            # Pure function utility
│   │       │       ├── agent-context.types.ts
│   │       │       ├── pod.interface.ts
│   │       │       ├── pod.types.ts
│   │       │       ├── agent-pod.ts
│   │       │       ├── code-pod.ts
│   │       │       ├── pod-manager.interface.ts
│   │       │       ├── pod-manager.ts
│   │       │       ├── fake-pod-manager.ts
│   │       │       ├── onbas.interface.ts
│   │       │       ├── onbas.ts
│   │       │       ├── ods.interface.ts
│   │       │       ├── ods.ts
│   │       │       ├── orchestration-service.interface.ts
│   │       │       ├── orchestration-service.ts
│   │       │       ├── graph-orchestration.interface.ts
│   │       │       ├── graph-orchestration.ts
│   │       │       ├── fake-orchestration-service.ts
│   │       │       └── fake-graph-orchestration.ts
│   │       └── container.ts                    # Add registerOrchestrationServices()
│   └── shared/
│       └── src/
│           └── di-tokens.ts                    # Add ORCHESTRATION_DI_TOKENS
├── test/
│   ├── unit/positional-graph/
│   │   └── features/
│   │       └── 030-orchestration/              # Unit tests
│   │           ├── reality.test.ts
│   │           ├── orchestration-request.test.ts
│   │           ├── agent-context.test.ts
│   │           ├── pod.test.ts
│   │           ├── pod-manager.test.ts
│   │           ├── onbas.test.ts
│   │           ├── ods.test.ts
│   │           ├── orchestration-service.test.ts
│   │           └── graph-orchestration.test.ts
│   ├── integration/positional-graph/
│   │   └── orchestration-loop.test.ts          # Integration tests
│   └── e2e/
│       └── orchestration-e2e.test.ts           # E2E human-as-agent tests
└── docs/plans/030-positional-orchestrator/
    └── positional-orchestrator-plan.md          # This file
```

---

## Implementation Phases

### Phase 1: PositionalGraphReality Snapshot

**Objective**: Create an immutable snapshot object that captures the entire graph state for decision-making and testing.

**Workshop**: [01-positional-graph-reality.md](./workshops/01-positional-graph-reality.md)

**Deliverables**:
- `PositionalGraphReality` Zod schema and TypeScript type
- `buildPositionalGraphReality()` builder function
- Convenience accessors: `currentLineIndex`, `readyNodeIds`, `runningNodeIds`, `completedNodeIds`, `waitingQuestionNodeIds`, `pendingQuestions`, `isComplete`, `isFailed`
- Unit tests for snapshot construction and all accessors

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Existing `getStatus()` output shape changes | Low | High | Pin to current interface, add contract test |
| Snapshot grows too large for complex graphs | Low | Medium | Lazy computation for derived fields |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.1 | [x] | Create feature folder `030-orchestration/` and `index.ts` | 1 | Directory exists, empty index.ts compiles | [📋](tasks/phase-1-positionalgraphreality-snapshot/execution.log.md#task-t001-create-feature-folder-030-orchestration-with-barrel-index) | PlanPak setup |
| 1.2 | [x] | Define `PositionalGraphReality` Zod schema and types | 2 | Schema validates sample data, types export cleanly | [📋](tasks/phase-1-positionalgraphreality-snapshot/execution.log.md#task-t004-define-reality-typescript-interfaces) | Per Workshop #1 schema |
| 1.3 | [x] | Write tests for `buildPositionalGraphReality()` | 2 | Tests cover: empty graph, single line, multi-line, mixed statuses, questions, pod sessions | [📋](tasks/phase-1-positionalgraphreality-snapshot/execution.log.md#task-t006-write-builder-tests-red) | RED phase |
| 1.4 | [x] | Implement `buildPositionalGraphReality()` | 3 | All tests from 1.3 pass. Composes `getStatus()` result with pod session data | [📋](tasks/phase-1-positionalgraphreality-snapshot/execution.log.md#task-t007-implement-builder-green) | GREEN phase |
| 1.5 | [x] | Write tests for convenience accessors | 2 | Tests cover: `readyNodeIds`, `runningNodeIds`, `isComplete`, `isFailed`, `pendingQuestions`, all edge cases | [📋](tasks/phase-1-positionalgraphreality-snapshot/execution.log.md#task-t008-write-accessor-tests-red) | RED phase |
| 1.6 | [x] | Implement convenience accessors | 2 | All accessor tests pass | [📋](tasks/phase-1-positionalgraphreality-snapshot/execution.log.md#task-t009-implement-accessors-green) | GREEN phase |
| 1.7 | [x] | Refactor and verify all tests pass | 1 | Clean code, `just fft` passes | [📋](tasks/phase-1-positionalgraphreality-snapshot/execution.log.md#task-t012-refactor-and-verify) | REFACTOR phase |

### Acceptance Criteria
- [x] Snapshot captures all lines, nodes, questions, and pod sessions (AC-1)
- [x] Pre-computed accessors return correct values for all states
- [x] Schema accepts existing state.json without error (backward compatible)
- [x] All tests passing, `just fft` clean

---

### Phase 2: OrchestrationRequest Discriminated Union

**Objective**: Define the exhaustive discriminated union that represents what the orchestrator should do next.

**Workshop**: [02-orchestration-request.md](./workshops/02-orchestration-request.md)

**Deliverables**:
- `OrchestrationRequest` Zod schema with 4 variants
- Type guards for each variant
- `OrchestrationExecuteResult` type for ODS responses
- Unit tests for schema validation and type discrimination

**Dependencies**: Phase 1 (uses `PositionalGraphReality` types for node references)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Missing a request type | Low | High | Exhaustive `never` check catches at compile time |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 2.1 | [x] | Define `OrchestrationRequest` Zod schema with 4 variants | 2 | Schema discriminates on `type` field, all 4 variants parse correctly | [📋](tasks/phase-2-orchestrationrequest-discriminated-union/execution.log.md#task-t001-define-orchestrationrequest-zod-schemas-with-derived-types) | Completed (T001+T002) [^1] |
| 2.2 | [x] | Write tests for type guards and exhaustive checking | 2 | Tests prove: `isStartNode()`, `isResumeNode()`, `isQuestionPending()`, `isNoAction()`, `never` in default case | [📋](tasks/phase-2-orchestrationrequest-discriminated-union/execution.log.md#task-t003-write-type-guard--schema-validation-tests-red) | Completed (T003) [^2] |
| 2.3 | [x] | Implement type guards | 1 | All tests from 2.2 pass | [📋](tasks/phase-2-orchestrationrequest-discriminated-union/execution.log.md#task-t004-implement-type-guards-green) | Completed (T004) [^3] |
| 2.4 | [x] | Define `OrchestrationExecuteResult` type | 1 | Type compiles, covers all ODS outcomes | [📋](tasks/phase-2-orchestrationrequest-discriminated-union/execution.log.md#task-t006-define-orchestrationexecuteresult-type) | Completed (T006) [^4] |
| 2.5 | [x] | Write tests for `no-action` reason variants | 1 | Tests cover all `NoActionReason` values: `graph-complete`, `graph-failed`, `all-running`, `all-waiting`, `empty-graph` | [📋](tasks/phase-2-orchestrationrequest-discriminated-union/execution.log.md#task-t005-write-no-action-reason-tests) | Completed (T005) [^2] |
| 2.6 | [x] | Refactor and verify | 1 | `just fft` clean | [📋](tasks/phase-2-orchestrationrequest-discriminated-union/execution.log.md#task-t007-update-barrel-index--just-fft) | Completed (T007) [^5] |

### Acceptance Criteria
- [x] 4-type discriminated union compiles with exhaustive checking (AC-2)
- [x] Each variant carries all data ODS needs to execute without additional lookups
- [x] Type guards work correctly for all variants
- [x] `just fft` clean

---

### Phase 3: AgentContextService (Pure Function Utility)

**Objective**: Implement context continuity rules that determine which session context a node should inherit. Despite the "Service" suffix (retained for discoverability with Workshop #3), this is a **pure function utility** — no state, no I/O, no DI registration. It takes a `PositionalGraphReality` and a `nodeId` and returns the context source.

**Workshop**: [03-agent-context-service.md](./workshops/03-agent-context-service.md)

**Deliverables**:
- `getContextSource(reality, nodeId): ContextSourceResult` pure function
- `ContextSourceResult` type with `source`, `sourceNodeId`, `reason` fields
- `FakeAgentContextService` for testing (allows overriding context decisions)
- Unit tests covering all 5 context rules

**Dependencies**: Phase 1 (uses `PositionalGraphReality` for graph state queries)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Edge case: line with no agent nodes | Medium | Low | Return `new` with descriptive reason |
| Context source lookup for non-existent session | Low | Medium | Return `new` if source node has no session |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 3.1 | [x] | Define `getContextSource()` function signature and `ContextSourceResult` type | 1 | Function signature compiles, type includes `source`, `sourceNodeId`, `reason` | [📋](tasks/phase-3-agentcontextservice/execution.log.md#task-t001-define-contextsourceresult-zod-schemas--derived-types--type-guards) | T001+T002 [^6] |
| 3.2 | [x] | Write tests for all 5 context rules | 3 | Tests cover: non-agent returns not-applicable, first-on-line-0 returns new, cross-line inherit, serial inherit from left, parallel returns new. Each with `reason` string | [📋](tasks/phase-3-agentcontextservice/execution.log.md#task-t003-write-tests-for-all-5-context-rules-red) | T003 [^7] |
| 3.3 | [x] | Implement `getContextSource()` | 2 | All tests from 3.2 pass | [📋](tasks/phase-3-agentcontextservice/execution.log.md#task-t004-implement-getcontextsource-bare-function--class-wrapper-green) | T004 [^8] |
| 3.4 | [x] | Write edge case tests | 2 | Tests cover: no agent on previous line, code node as left neighbor, user-input node as left neighbor, empty line | [📋](tasks/phase-3-agentcontextservice/execution.log.md#task-t005-write-edge-case-tests--implement) | T005 [^7] |
| 3.5 | [x] | Implement `FakeAgentContextService` | 1 | Fake implements interface, supports `setContextSource()` for test configuration | [📋](tasks/phase-3-agentcontextservice/execution.log.md#task-t006-implement-fakeagentcontextservice) | T006 [^9] |
| 3.6 | [x] | Refactor and verify | 1 | `just fft` clean | [📋](tasks/phase-3-agentcontextservice/execution.log.md#task-t007-update-barrel-index--just-fft) | T007 [^10] |

### Acceptance Criteria
- [x] All 5 context rules produce correct results (AC-5)
- [x] Every result includes a human-readable `reason` string
- [x] Pure function: no side effects, no I/O
- [x] `just fft` clean

---

### Phase 4: WorkUnitPods and PodManager

**Objective**: Create execution containers that wrap nodes and manage agent/code lifecycle, with session persistence for server restarts.

**Workshop**: [04-work-unit-pods.md](./workshops/04-work-unit-pods.md)

**Deliverables**:
- `IWorkUnitPod` interface with `execute()` and `resumeWithAnswer()`
- `AgentPod` and `CodePod` implementations
- `IPodManager` interface with pod lifecycle methods
- `PodManager` implementation with session persistence to `pod-sessions.json`
- `FakePodManager` and `FakePod` for testing
- Unit tests for pod execution, session persistence, and manager lifecycle

**Dependencies**: Phase 1 (types), Phase 2 (execute result types)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Session file corruption on crash | Low | High | Atomic writes (temp-then-rename) |
| IAgentAdapter interface mismatch | Low | Medium | Contract test against FakeAgentAdapter |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 4.1 | [x] | Define `IWorkUnitPod` interface and `PodExecuteResult` types | 2 | Interface compiles, result type covers: completed, question, error, terminated | [📋](tasks/phase-4-workunitpods-and-podmanager/execution.log.md#task-t001-define-pod-types-zod-schemas-iscriptrunner-and-node-starter-prompt) | Per Workshop #4 · [^11] |
| 4.2 | [x] | Write tests for `AgentPod.execute()` | 2 | Tests cover: successful completion, question asked, error, session ID capture | [📋](tasks/phase-4-workunitpods-and-podmanager/execution.log.md#task-t003-write-agentpod-tests-red) | RED phase · [^12] |
| 4.3 | [x] | Implement `AgentPod` | 3 | All tests from 4.2 pass, delegates to `IAgentAdapter.run()` | [📋](tasks/phase-4-workunitpods-and-podmanager/execution.log.md#task-t004-implement-agentpod-green) | GREEN phase · [^13] |
| 4.4 | [x] | Write tests for `CodePod.execute()` | 1 | Tests cover: script execution, no session tracking | [📋](tasks/phase-4-workunitpods-and-podmanager/execution.log.md#task-t005-write-codepod-tests-red--t006-implement-codepod-green) | [^14] |
| 4.5 | [x] | Implement `CodePod` | 1 | All tests from 4.4 pass | [📋](tasks/phase-4-workunitpods-and-podmanager/execution.log.md#task-t005-write-codepod-tests-red--t006-implement-codepod-green) | [^14] |
| 4.6 | [x] | Define `IPodManager` interface | 1 | Interface includes: `getOrCreatePod()`, `loadSessions()`, `persistSessions()`, `getSessionId()` | [📋](tasks/phase-4-workunitpods-and-podmanager/execution.log.md#task-t002-define-ipodmanager-interface) | [^11] |
| 4.7 | [x] | Write tests for `FakePodManager` | 2 | Tests prove: configurable pod behaviors, call history tracking, session seeding | [📋](tasks/phase-4-workunitpods-and-podmanager/execution.log.md#tasks-t007t009t011-write-fakepodmanager-podmanager-and-contract-tests-red) | [^15] |
| 4.8 | [x] | Implement `FakePodManager` | 2 | All tests from 4.7 pass, supports `configurePod()`, `getHistory()`, `reset()` | [📋](tasks/phase-4-workunitpods-and-podmanager/execution.log.md#tasks-t008t010-implement-fakepodmanager-and-podmanager-green) | [^16] |
| 4.9 | [x] | Write tests for real `PodManager` | 2 | Tests cover: pod creation, session persistence to file, session loading from file, atomic writes | [📋](tasks/phase-4-workunitpods-and-podmanager/execution.log.md#tasks-t007t009t011-write-fakepodmanager-podmanager-and-contract-tests-red) | RED phase · [^15] |
| 4.10 | [x] | Implement real `PodManager` | 3 | All tests from 4.9 pass, uses atomic writes for `pod-sessions.json` | [📋](tasks/phase-4-workunitpods-and-podmanager/execution.log.md#tasks-t008t010-implement-fakepodmanager-and-podmanager-green) | GREEN phase · [^16] |
| 4.11 | [x] | Write contract tests (fake vs real PodManager) | 2 | Same assertions pass on both implementations | [📋](tasks/phase-4-workunitpods-and-podmanager/execution.log.md#tasks-t007t009t011-write-fakepodmanager-podmanager-and-contract-tests-red) | [^15] |
| 4.12 | [x] | Refactor and verify | 1 | `just fft` clean | [📋](tasks/phase-4-workunitpods-and-podmanager/execution.log.md#task-t012-update-barrel-index--just-fft) | [^17] |

### Acceptance Criteria
- [x] Pods manage agent/code execution lifecycle (AC-7)
- [x] Pod sessions survive server restarts via `pod-sessions.json` (AC-8)
- [x] FakePodManager enables deterministic testing (AC-13)
- [x] Contract tests pass on both fake and real implementations
- [x] `just fft` clean

---

### Phase 5: ONBAS Walk Algorithm

**Objective**: Implement the stateless rules engine that walks the graph and returns the next best action as an OrchestrationRequest.

**Workshop**: [05-onbas.md](./workshops/05-onbas.md)

**Deliverables**:
- `walkForNextAction(reality): OrchestrationRequest` pure function
- Walk visits lines in index order, nodes in position order
- Handles all node statuses: ready, running, waiting-question (3 sub-states), complete, pending, blocked-error
- Unit tests covering every walk path

**Dependencies**: Phase 1 (PositionalGraphReality), Phase 2 (OrchestrationRequest)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Gate logic misinterpretation | Medium | High | Comprehensive tests per Workshop #5 walk rules |
| Question sub-state detection bugs | Medium | Medium | Explicit tests for each of the 3 question states |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 5.1 | [x] | Define `IONBAS` interface (optional — it is a pure function, but interface aids testing) | 1 | Interface with `walkForNextAction(reality): OrchestrationRequest` | [📋](tasks/phase-5-onbas-walk-algorithm/execution.log.md#task-t001-define-ionbas-interface--fakeonbas--buildfakereality) | [^18] |
| 5.2 | [x] | Write tests for basic walk: single ready node | 1 | Returns `start-node` for the ready node | [📋](tasks/phase-5-onbas-walk-algorithm/execution.log.md#tasks-t002-t006t008-write-all-onbas-tests-red) | RED · [^19] |
| 5.3 | [x] | Write tests for multi-line walk order | 2 | Lines visited 0..N, nodes visited by position, first actionable stops walk | [📋](tasks/phase-5-onbas-walk-algorithm/execution.log.md#tasks-t002-t006t008-write-all-onbas-tests-red) | RED · [^19] |
| 5.4 | [x] | Write tests for question handling | 2 | Unsurfaced question → `question-pending`; surfaced+unanswered → skip; answered → `resume-node` | [📋](tasks/phase-5-onbas-walk-algorithm/execution.log.md#tasks-t002-t006t008-write-all-onbas-tests-red) | RED · [^19] |
| 5.5 | [x] | Write tests for no-action scenarios | 2 | All complete → `graph-complete`; has failure → `graph-failed`; all running → `no-action` with reason; empty graph → `no-action` | [📋](tasks/phase-5-onbas-walk-algorithm/execution.log.md#tasks-t002-t006t008-write-all-onbas-tests-red) | RED · [^19] |
| 5.6 | [x] | Write tests for skip logic | 2 | Running nodes skipped, complete nodes skipped, blocked-error skipped, pending nodes skipped | [📋](tasks/phase-5-onbas-walk-algorithm/execution.log.md#tasks-t002-t006t008-write-all-onbas-tests-red) | RED · [^19] |
| 5.7 | [x] | Implement `walkForNextAction()` | 3 | All tests from 5.2-5.6 pass | [📋](tasks/phase-5-onbas-walk-algorithm/execution.log.md#task-t007-implement-walkfornextaction) | GREEN · [^20] |
| 5.8 | [x] | Write tests proving pure/stateless behavior | 1 | Same input → same output across multiple calls, no side effects | [📋](tasks/phase-5-onbas-walk-algorithm/execution.log.md#tasks-t002-t006t008-write-all-onbas-tests-red) | AC-4 · [^19] |
| 5.9 | [x] | Refactor and verify | 1 | `just fft` clean | [📋](tasks/phase-5-onbas-walk-algorithm/execution.log.md#task-t009-update-barrel--just-fft) | [^21] |

### Acceptance Criteria
- [x] Walk visits lines in index order, nodes in position order (AC-3)
- [x] Each node status maps to the correct action or skip behavior (AC-3)
- [x] Pure, synchronous, stateless — same input always same output (AC-4)
- [x] Question lifecycle handled correctly for all 3 sub-states
- [x] `just fft` clean

---

### Phase 6: ODS Action Handlers

> **UNBLOCKED**: Plan 032 (Node Event System) is COMPLETE (all 8 phases landed). Subtask 001 (Concept Drift Remediation) has aligned the two-domain boundary — event handlers record, ONBAS decides, ODS acts. Phase 6 can now proceed with 7 typed event types (including `node:restart` from Workshop 10) and the Settle-Decide-Act loop pattern.

**Objective**: Implement the executor that takes an OrchestrationRequest from ONBAS and performs the corresponding state changes.

**Workshop**: [Workshop #8](./workshops/08-ods-orchestrator-agent-handover.md) (complete). Design informed by spec AC-6, Workshops #2/#4/#7/#9/#10, and the Settle-Decide-Act loop. ODS uses Plan 032's event-based communication model: EHS settles events, ONBAS reads settled state, ODS executes actions.

**Deliverables**:
- `IODS` interface with `execute(request): OrchestrationExecuteResult`
- ODS implementation with handlers for all 4 request types
- State updates via `IPositionalGraphService`
- Domain event emission via `ICentralEventNotifier`
- Unit tests for each handler

**Dependencies**: Phase 2 (request types), Phase 3 (AgentContextService), Phase 4 (PodManager)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ODS workshop not complete | High | Medium | Spec AC-6 + Workshops #2/#4 provide sufficient detail for handlers |
| State update ordering | Medium | Medium | Tests verify state transitions in correct order |
| Event emission failures | Low | Low | Non-blocking event emission, log errors |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 6.1 | [x] | Define `IODS` interface | 1 | Interface with `execute(request, ctx): Promise<OrchestrationExecuteResult>` | [T003](tasks/phase-6-ods-action-handlers/execution.log.md) | |
| 6.2 | [x] | Write tests for `start-node` handler | 3 | Tests cover: create pod via PodManager, resolve context via AgentContextService, call pod.execute(), update node to running, handle all pod outcomes (completed, question, error) | [T005](tasks/phase-6-ods-action-handlers/execution.log.md) | RED |
| 6.3 | [x] | Implement `start-node` handler | 3 | All tests from 6.2 pass | [T008](tasks/phase-6-ods-action-handlers/execution.log.md) | GREEN |
| 6.4 | [x] | Write tests for `resume-node` handler | 2 | Tests cover: defensive UNSUPPORTED_REQUEST_TYPE error | [T006](tasks/phase-6-ods-action-handlers/execution.log.md) | Simplified per Workshop 11/12 |
| 6.5 | [x] | Implement `resume-node` handler | 2 | All tests from 6.4 pass | [T008](tasks/phase-6-ods-action-handlers/execution.log.md) | Defensive stub |
| 6.6 | [x] | Write tests for `question-pending` handler | 2 | Tests cover: defensive UNSUPPORTED_REQUEST_TYPE error | [T006](tasks/phase-6-ods-action-handlers/execution.log.md) | Simplified per Workshop 11/12 |
| 6.7 | [x] | Implement `question-pending` handler | 1 | All tests from 6.6 pass | [T008](tasks/phase-6-ods-action-handlers/execution.log.md) | Defensive stub |
| 6.8 | [x] | Write tests for `no-action` handler | 1 | Tests prove: no state changes, no side effects | [T006](tasks/phase-6-ods-action-handlers/execution.log.md) | |
| 6.9 | [x] | Implement `no-action` handler | 1 | Pass-through, returns result | [T008](tasks/phase-6-ods-action-handlers/execution.log.md) | |
| 6.10 | [x] | Write tests for input passing to pods | 2 | Tests verify InputPack from reality reaches pod.execute() correctly (AC-14) | [T007](tasks/phase-6-ods-action-handlers/execution.log.md) | |
| 6.11 | [x] | Refactor and verify | 1 | `just fft` clean | [T009](tasks/phase-6-ods-action-handlers/execution.log.md) | |

### Acceptance Criteria
- [x] Each request type handled correctly (AC-6)
- [x] `start-node` creates pod, resolves context, executes, updates state
- [x] `resume-node` retrieves session, resumes with answer — defensive stub per Workshop 11/12
- [x] `question-pending` sets `surfaced_at`, emits domain event — defensive stub per Workshop 11/12
- [x] `no-action` has no side effects
- [x] Input wiring flows from reality through to pods (AC-14)
- [x] `just fft` clean

---

### Phase 7: Orchestration Entry Point

**Objective**: Create the two-level entry point (singleton service + per-graph handle) that composes all internal collaborators into a single developer UX.

**Workshop**: [07-orchestration-entry-point.md](./workshops/07-orchestration-entry-point.md)

**Deliverables**:
- `IOrchestrationService` interface and implementation (singleton, DI-registered)
- `IGraphOrchestration` interface and implementation (per-graph handle)
- `OrchestrationRunResult` type with actions, stop reason, final reality
- `FakeOrchestrationService` and `FakeGraphOrchestration` for downstream testing
- DI token `ORCHESTRATION_DI_TOKENS.ORCHESTRATION_SERVICE` in `packages/shared/src/di-tokens.ts`
- `registerOrchestrationServices()` in `packages/positional-graph/src/container.ts`
- Orchestration loop: build reality → ONBAS → ODS → repeat until stop
- ~~`IEventHandlerService` interface and implementation~~ — **SUPERSEDED**: Delivered by Plan 032 (Node Event System). `EventHandlerService.processGraph()` provides graph-wide event processing (Settle phase).

**Dependencies**: All previous phases (1-6). Phase 7 composes all internal collaborators into a single facade.

**Task ordering**: Task 7.1 (DI token) must be completed before tasks 7.2-7.12, as the token is referenced by interfaces and registration.

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Loop infinite cycle (ONBAS always returns action) | Low | High | Maximum iteration guard (configurable, default 100) |
| Handle caching memory leak | Low | Low | Handles are lightweight; registry cleared on service dispose |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 7.1 | [x] | Add `ORCHESTRATION_DI_TOKENS` to `packages/shared/src/di-tokens.ts` | 1 | Token exists, exports correctly | [T001](tasks/phase-7-orchestration-entry-point/execution.log.md) | Cross-cutting; 1 public + 3 prerequisite tokens |
| 7.2 | [x] | Define `IOrchestrationService` and `IGraphOrchestration` interfaces | 2 | Interfaces compile, match Workshop #7 spec | [T002](tasks/phase-7-orchestration-entry-point/execution.log.md) | Per Workshop #7 |
| 7.3 | [x] | Define `OrchestrationRunResult`, `OrchestrationAction`, `OrchestrationStopReason` types | 2 | Types compile, stop reason covers: no-action, graph-complete, graph-failed | [T003](tasks/phase-7-orchestration-entry-point/execution.log.md) | Per Workshop #7; 3-value union per DYK #3 |
| 7.4 | [x] | Write tests for `FakeOrchestrationService` and `FakeGraphOrchestration` | 2 | Tests prove: configureGraph, run returns queued results, getReality returns configured state, getHistory tracked | [T004](tasks/phase-7-orchestration-entry-point/execution.log.md) | RED |
| 7.5 | [x] | Implement `FakeOrchestrationService` and `FakeGraphOrchestration` | 2 | All tests from 7.4 pass | [T005](tasks/phase-7-orchestration-entry-point/execution.log.md) | GREEN |
| 7.6 | [x] | Write tests for `IGraphOrchestration.run()` loop | 3 | Tests cover: single iteration, multi-iteration, stops on no-action, stops on graph-complete, stops on graph-failed, max iteration guard | [T006](tasks/phase-7-orchestration-entry-point/execution.log.md) | RED |
| 7.7 | [x] | Implement `GraphOrchestration.run()` loop | 3 | All tests from 7.6 pass. Loop: settle → reality → ONBAS → if actionable → ODS → record → repeat | [T007](tasks/phase-7-orchestration-entry-point/execution.log.md) | GREEN |
| 7.8 | [x] | Write tests for `IOrchestrationService.get()` handle caching | 2 | Tests prove: same slug returns same handle, different slug returns different handle | [T008](tasks/phase-7-orchestration-entry-point/execution.log.md) | |
| 7.9 | [x] | Implement `OrchestrationService.get()` with caching | 2 | All tests from 7.8 pass | [T009](tasks/phase-7-orchestration-entry-point/execution.log.md) | |
| 7.10 | [x] | Add `registerOrchestrationServices()` to container | 2 | DI registration resolves IOrchestrationService correctly | [T010](tasks/phase-7-orchestration-entry-point/execution.log.md) | Cross-cutting |
| 7.11 | [x] | Write container integration test | 2 | Container resolves service, `.get()` returns handle, `.run()` executes | [T011](tasks/phase-7-orchestration-entry-point/execution.log.md) | |
| 7.12 | [x] | Refactor and verify | 1 | `just fft` clean | [T013](tasks/phase-7-orchestration-entry-point/execution.log.md) | |

### Acceptance Criteria
- [x] Two-level pattern works: service → per-graph handle (AC-10)
- [x] `run()` executes the full loop: settle → reality → ONBAS → ODS → repeat (AC-11)
- [x] Handle caching returns same handle for same slug (AC-10)
- [x] FakeOrchestrationService supports pre-configured behaviors (AC-10)
- [x] DI registration works via `registerOrchestrationServices()` (ADR-0009)
- [x] ~~IEventHandlerService processes graph-wide events as Settle step before ONBAS~~ — **SUPERSEDED**: Delivered by Plan 032. `EventHandlerService.processGraph()` is the Settle step.
- [x] `just fft` clean

---

### Phase 8: E2E and Integration Testing

**Objective**: Validate the complete orchestration system with human-as-agent E2E tests and multi-service integration tests.

**Workshop**: [06-e2e-integration-testing.md](./workshops/06-e2e-integration-testing.md)

**Deliverables**:
- Integration tests: orchestration loop with FakePodManager on 4-line test graph
- E2E tests: human-as-agent pattern using CLI commands + `.run()` direct calls
- Test fixture: 4-line, 8-node graph exercising all patterns
- All 7 test patterns from Workshop #6 exercised

**Dependencies**: All previous phases (1-7)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| CLI commands not wired for test graph setup | Medium | Medium | Use `IPositionalGraphService` directly for setup, CLI for agent actions |
| Test fixture graph too complex | Low | Medium | Build incrementally, test each pattern in isolation then compose |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 8.1 | [ ] | Create test graph fixture (4-line, 8-node pipeline) | 2 | Graph YAML and work unit definitions for: get-spec (user-input), spec-builder (agent), spec-reviewer (agent), coder (agent), tester (agent), alignment-tester (agent), pr-preparer (code), pr-creator (agent) | - | Per Workshop #6 |
| 8.2 | [ ] | Write integration test: user-input flow | 2 | Tests: user-input node auto-completes, output wired to next line | - | Pattern 1 |
| 8.3 | [ ] | Write integration test: serial agent execution | 2 | Tests: spec-builder starts, completes, spec-reviewer starts with inherited context | - | Pattern 2 + 5 |
| 8.4 | [ ] | Write integration test: question cycle | 2 | Tests: agent asks question, question surfaced, user answers, agent resumes | - | Pattern 3 |
| 8.5 | [ ] | Write integration test: parallel execution | 2 | Tests: coder, tester, alignment-tester all start on same run() call | - | Pattern 4 |
| 8.6 | [ ] | Write integration test: manual transition | 2 | Tests: line 1 requires manual transition, orchestrator waits until transitioned | - | Pattern 6 |
| 8.7 | [ ] | Write integration test: code node execution | 2 | Tests: pr-preparer (code type) executes via CodePod, no session tracking | - | Pattern 7 |
| 8.8 | [ ] | Write integration test: error recovery | 2 | Tests: agent pod returns error, node goes to blocked-error, graph shows failure in reality | - | Pattern 8 |
| 8.9 | [ ] | Write E2E test: full pipeline with human-as-agent | 3 | Full graph from start to completion: get-spec → spec-builder → spec-reviewer → parallel agents → manual transition → code node → pr-creator → graph-complete | - | AC-12 |
| 8.10 | [ ] | Write E2E test: question/answer via CLI | 2 | Agent asks question, test answers via CLI `cg wf answer`, orchestration resumes | - | |
| 8.11 | [ ] | Verify all acceptance criteria in tests | 2 | AC-1 through AC-14 have test coverage | - | |
| 8.12 | [ ] | Final `just fft` validation | 1 | All tests pass, lint clean, format clean | - | |

### Acceptance Criteria
- [ ] E2E tests drive full workflow without real agents (AC-12)
- [ ] All 7 test patterns from Workshop #6 exercised
- [ ] Graph reaches `complete` status with all nodes complete
- [ ] Question lifecycle flows correctly through the system (AC-9)
- [ ] Input wiring flows from user-input to agent nodes (AC-14)
- [ ] `just fft` clean

---

## Cross-Cutting Concerns

### Security Considerations
- No user-facing input beyond CLI arguments (validated by existing CLI framework)
- Pod sessions stored on local filesystem with same permissions as existing state files
- No network calls except through `IAgentAdapter` (which is faked in this plan)

### Observability
- Domain events emitted via `ICentralEventNotifier` for state changes (question surfaced, node started)
- `OrchestrationRunResult` provides full action log for each `run()` call
- `PositionalGraphReality` captures complete state snapshot for debugging

### Documentation
**Strategy**: None (per spec — no documentation phases needed)
- Code is self-documenting through interfaces and Test Doc blocks
- Workshops serve as design documentation

---

## File Placement Manifest

| File | Classification | Location | Rationale |
|------|---------------|----------|-----------|
| All orchestration source | plan-scoped | `packages/positional-graph/src/features/030-orchestration/` | Serves only this plan |
| `ORCHESTRATION_DI_TOKENS` | cross-cutting | `packages/shared/src/di-tokens.ts` | DI tokens must be in shared |
| `registerOrchestrationServices()` | cross-cutting | `packages/positional-graph/src/container.ts` | Module registration per ADR-0009 |
| Unit tests | plan-scoped | `test/unit/positional-graph/features/030-orchestration/` | Test conventions |
| Integration tests | plan-scoped | `test/integration/positional-graph/` | Test conventions |
| E2E tests | plan-scoped | `test/e2e/` | Test conventions |

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| Overall Plan | 4 | Large | S=2,I=1,D=2,N=1,F=0,T=2 | Cross-cutting: new services, schemas, CLI, test infra across 3+ packages | Phase-by-phase delivery, each phase independently testable |
| ONBAS Walk Algorithm | 3 | Medium | S=1,I=0,D=1,N=1,F=0,T=2 | Walk logic has edge cases (question sub-states, parallel nodes, empty lines) | Extensive unit tests per Workshop #5 |
| ODS Action Handlers | 3 | Medium | S=1,I=1,D=1,N=1,F=0,T=1 | Coordinates PodManager, AgentContextService, state updates, events | Each handler tested independently |
| PodManager + Persistence | 3 | Medium | S=1,I=1,D=1,N=0,F=1,T=1 | Session persistence adds fragility; atomic writes needed | Contract tests on fake/real parity |
| Orchestration Loop | 3 | Medium | S=1,I=1,D=0,N=1,F=1,T=1 | Multi-iteration loop with stop conditions | Max iteration guard, integration tests |

---

## Progress Tracking

### Phase Completion Checklist
- [x] Phase 1: PositionalGraphReality Snapshot - COMPLETE
- [x] Phase 2: OrchestrationRequest Discriminated Union - COMPLETE
- [x] Phase 3: AgentContextService - COMPLETE
- [x] Phase 4: WorkUnitPods and PodManager - COMPLETE
- [x] Phase 5: ONBAS Walk Algorithm - COMPLETE
- [x] Phase 6: ODS Action Handlers - COMPLETE
- [x] Phase 7: Orchestration Entry Point - COMPLETE
- [ ] Phase 8: E2E and Integration Testing - Pending (awaiting Phase 7)

### STOP Rule

**IMPORTANT**: This plan must be validated before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## ADR Ledger

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0004 | Accepted | All | DI with `useFactory`, no decorators, child containers |
| ADR-0006 | Accepted | Phase 4, 6 | CLI-based agent orchestration: session continuity, process isolation, CWD binding |
| ADR-0009 | Accepted | Phase 7 | Module registration function pattern for orchestration |
| ADR-0010 | Accepted | Phase 6, 7 | Central event notification via `ICentralEventNotifier` |
| ADR-0011 | Accepted | Phase 7 | First-class domain concepts — IEventHandlerService meets litmus test (subtask) |

---

## Deviation Ledger

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| DI for all collaborators | Internal collaborators (ONBAS, ODS, PodManager, AgentContextService) stay private, not in DI container | Register every collaborator as a DI token — rejected because it exposes implementation detail and creates coupling | Only `ORCHESTRATION_SERVICE` is public; internal wiring tested via integration tests |
| Max iteration guard | `run()` loop has a configurable max-iterations ceiling (default 100) to prevent infinite loops | Trust ONBAS to always terminate — rejected because a bug in walk logic could hang the process | Guard is configurable; tests verify it triggers correctly |
| Workshop #8 not finalized | Phase 6 (ODS) proceeds with design derived from spec + other workshops | Wait for Workshop #8 before planning Phase 6 — rejected to avoid blocking the entire plan | Design fully derivable from AC-6, Workshops #2/#4/#7; Workshop #8 will formalize, not change |

---

## Change Footnotes Ledger

[^1]: Phase 2 Task 2.1 (T001+T002) - Zod schemas + derived types + non-schema types
  - `file:packages/positional-graph/src/features/030-orchestration/orchestration-request.schema.ts`
  - `file:packages/positional-graph/src/features/030-orchestration/orchestration-request.types.ts`

[^2]: Phase 2 Task 2.2+2.5 (T003+T005) - Type guard + schema validation + no-action reason tests
  - `file:test/unit/positional-graph/features/030-orchestration/orchestration-request.test.ts`

[^3]: Phase 2 Task 2.3 (T004) - Type guard implementations
  - `function:packages/positional-graph/src/features/030-orchestration/orchestration-request.guards.ts:isStartNodeRequest`
  - `function:packages/positional-graph/src/features/030-orchestration/orchestration-request.guards.ts:isResumeNodeRequest`
  - `function:packages/positional-graph/src/features/030-orchestration/orchestration-request.guards.ts:isQuestionPendingRequest`
  - `function:packages/positional-graph/src/features/030-orchestration/orchestration-request.guards.ts:isNoActionRequest`
  - `function:packages/positional-graph/src/features/030-orchestration/orchestration-request.guards.ts:isNodeLevelRequest`
  - `function:packages/positional-graph/src/features/030-orchestration/orchestration-request.guards.ts:getNodeId`

[^4]: Phase 2 Task 2.4 (T006) - OrchestrationExecuteResult + OrchestrationError types
  - `file:packages/positional-graph/src/features/030-orchestration/orchestration-request.types.ts`

[^5]: Phase 2 Task 2.6 (T007) - Barrel index update with Phase 2 exports
  - `file:packages/positional-graph/src/features/030-orchestration/index.ts`

[^6]: Phase 3 Task 3.1 (T001+T002) - ContextSourceResult schemas + types + IAgentContextService interface
  - `file:packages/positional-graph/src/features/030-orchestration/agent-context.schema.ts`
  - `file:packages/positional-graph/src/features/030-orchestration/agent-context.types.ts`

[^7]: Phase 3 Task 3.2+3.4 (T003+T005) - Context rule tests + edge case tests
  - `file:test/unit/positional-graph/features/030-orchestration/agent-context.test.ts`

[^8]: Phase 3 Task 3.3 (T004) - getContextSource() bare function + AgentContextService class
  - `function:packages/positional-graph/src/features/030-orchestration/agent-context.ts:getContextSource`
  - `class:packages/positional-graph/src/features/030-orchestration/agent-context.ts:AgentContextService`

[^9]: Phase 3 Task 3.5 (T006) - FakeAgentContextService escape hatch
  - `class:packages/positional-graph/src/features/030-orchestration/fake-agent-context.ts:FakeAgentContextService`

[^10]: Phase 3 Task 3.6 (T007) - Barrel index update with Phase 3 exports
  - `file:packages/positional-graph/src/features/030-orchestration/index.ts`

[^11]: Phase 4 Task 4.1+4.6 (T001+T002) - Pod types, Zod schemas, IScriptRunner, IPodManager interface
  - `file:packages/positional-graph/src/features/030-orchestration/pod.types.ts`
  - `file:packages/positional-graph/src/features/030-orchestration/pod.schema.ts`
  - `file:packages/positional-graph/src/features/030-orchestration/script-runner.types.ts`
  - `file:packages/positional-graph/src/features/030-orchestration/pod-manager.types.ts`
  - `file:packages/positional-graph/src/features/030-orchestration/node-starter-prompt.md`

[^12]: Phase 4 Task 4.2 (T003) - AgentPod tests (RED)
  - `file:test/unit/positional-graph/features/030-orchestration/pod.test.ts`

[^13]: Phase 4 Task 4.3 (T004) - AgentPod implementation (GREEN)
  - `class:packages/positional-graph/src/features/030-orchestration/pod.agent.ts:AgentPod`

[^14]: Phase 4 Task 4.4+4.5 (T005+T006) - CodePod tests + implementation
  - `class:packages/positional-graph/src/features/030-orchestration/pod.code.ts:CodePod`
  - `file:test/unit/positional-graph/features/030-orchestration/pod.test.ts`

[^15]: Phase 4 Task 4.7+4.9+4.11 (T007+T009+T011) - FakePodManager, PodManager, and Contract tests (RED)
  - `file:test/unit/positional-graph/features/030-orchestration/pod-manager.test.ts`

[^16]: Phase 4 Task 4.8+4.10 (T008+T010) - FakePodManager + PodManager implementation (GREEN)
  - `class:packages/positional-graph/src/features/030-orchestration/fake-pod-manager.ts:FakePodManager`
  - `class:packages/positional-graph/src/features/030-orchestration/fake-pod-manager.ts:FakePod`
  - `class:packages/positional-graph/src/features/030-orchestration/pod-manager.ts:PodManager`

[^17]: Phase 4 Task 4.12 (T012) - Barrel index update with Phase 4 exports
  - `file:packages/positional-graph/src/features/030-orchestration/index.ts`

[^18]: Phase 5 Task 5.1 (T001) - IONBAS interface + FakeONBAS + buildFakeReality
  - `file:packages/positional-graph/src/features/030-orchestration/onbas.types.ts`
  - `class:packages/positional-graph/src/features/030-orchestration/fake-onbas.ts:FakeONBAS`
  - `function:packages/positional-graph/src/features/030-orchestration/fake-onbas.ts:buildFakeReality`

[^19]: Phase 5 Task 5.2-5.6+5.8 (T002-T006+T008) - All ONBAS tests (RED)
  - `file:test/unit/positional-graph/features/030-orchestration/onbas.test.ts`

[^20]: Phase 5 Task 5.7 (T007) - walkForNextAction implementation (GREEN)
  - `function:packages/positional-graph/src/features/030-orchestration/onbas.ts:walkForNextAction`
  - `class:packages/positional-graph/src/features/030-orchestration/onbas.ts:ONBAS`

[^21]: Phase 5 Task 5.9 (T009) - Barrel index update with Phase 5 exports
  - `file:packages/positional-graph/src/features/030-orchestration/index.ts`

[^22]: Phase 6 Task 6.1 (T001+T002) - ONBAS simplification (remove question production per Workshop 11/12)
  - `function:packages/positional-graph/src/features/030-orchestration/onbas.ts:walkForNextAction`
  - `file:test/unit/positional-graph/features/030-orchestration/onbas.test.ts`

[^23]: Phase 6 Task 6.1 (T003) - IODS interface and ODSDependencies
  - `file:packages/positional-graph/src/features/030-orchestration/ods.types.ts`

[^24]: Phase 6 Task 6.2-6.10 (T004-T008) - FakeODS, ODS tests + implementation
  - `class:packages/positional-graph/src/features/030-orchestration/fake-ods.ts:FakeODS`
  - `class:packages/positional-graph/src/features/030-orchestration/ods.ts:ODS`
  - `file:test/unit/positional-graph/features/030-orchestration/ods.test.ts`

[^25]: Phase 6 Task 6.11 (T009) - Barrel index update with Phase 6 exports
  - `file:packages/positional-graph/src/features/030-orchestration/index.ts`

[^26]: Phase 7 Task 7.1 (T001) - ORCHESTRATION_DI_TOKENS (1 public + 3 prerequisite)
  - `file:packages/shared/src/di-tokens.ts`

[^27]: Phase 7 Task 7.2+7.3 (T002+T003) - Orchestration service types, interfaces, and result types
  - `file:packages/positional-graph/src/features/030-orchestration/orchestration-service.types.ts`

[^28]: Phase 7 Task 7.4+7.5 (T004+T005) - FakeOrchestrationService + FakeGraphOrchestration
  - `class:packages/positional-graph/src/features/030-orchestration/fake-orchestration-service.ts:FakeOrchestrationService`
  - `class:packages/positional-graph/src/features/030-orchestration/fake-orchestration-service.ts:FakeGraphOrchestration`
  - `file:test/unit/positional-graph/features/030-orchestration/fake-orchestration-service.test.ts`

[^29]: Phase 7 Task 7.6+7.7 (T006+T007) - GraphOrchestration loop tests + implementation
  - `class:packages/positional-graph/src/features/030-orchestration/graph-orchestration.ts:GraphOrchestration`
  - `file:test/unit/positional-graph/features/030-orchestration/graph-orchestration.test.ts`

[^30]: Phase 7 Task 7.8+7.9 (T008+T009) - OrchestrationService caching tests + implementation
  - `class:packages/positional-graph/src/features/030-orchestration/orchestration-service.ts:OrchestrationService`
  - `file:test/unit/positional-graph/features/030-orchestration/orchestration-service.test.ts`

[^31]: Phase 7 Task 7.10+7.11 (T010+T011) - Container registration + integration test
  - `file:packages/positional-graph/src/container.ts`
  - `file:test/unit/positional-graph/features/030-orchestration/container-orchestration.test.ts`

[^32]: Phase 7 Task 7.12 (T012) - Barrel index updates
  - `file:packages/positional-graph/src/features/030-orchestration/index.ts`
  - `file:packages/positional-graph/src/index.ts`
  - `file:packages/shared/src/index.ts`

---

## Subtask Registry

| Phase | Parent Task | Subtask | Status | Dossier |
|-------|-------------|---------|--------|---------|
| 7 | T007 | ~~IEventHandlerService — graph-wide event processing (Settle phase)~~ | SUPERSEDED by Plan 032 | `tasks/phase-7-orchestration-entry-point/subtask-event-handler-service/tasks.md` |
| 6 | T001 | Concept drift remediation — align Plan 030/032 domains before Phase 6 | Complete | `tasks/phase-6-ods-action-handlers/001-subtask-concept-drift-remediation.md` |
| 8 | T009 | Upgrade worked example to cover all orchestration patterns | [x] Complete | `tasks/phase-8-e2e-and-integration-testing/001-subtask-upgrade-worked-example.md` |
