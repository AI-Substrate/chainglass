# Agent Orchestration Wiring Implementation Plan

**Plan Version**: 1.0.0
**Created**: 2026-02-17
**Spec**: [agent-orchestration-wiring-spec.md](./agent-orchestration-wiring-spec.md)
**Status**: DRAFT

**Workshops**:
- [033 Workshop 02: Unified AgentInstance / AgentManagerService Design](../033-real-agent-pods/workshops/02-unified-agent-design.md) — ODS/AgentPod/PodManager redesign
- [033 Workshop 06: Plan 030 E2E Upgrade Strategy](../033-real-agent-pods/workshops/06-plan-030-e2e-upgrade-strategy.md) — Exact diff, change order
- [035 Workshop 01: E2E Wiring with Real Agents](./workshops/01-e2e-wiring-with-real-agents.md) — Real adapter integration tests

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [File Placement Manifest](#file-placement-manifest)
6. [Phase 1: Types, Interfaces, and Schema Changes](#phase-1-types-interfaces-and-schema-changes)
7. [Phase 2: ODS and AgentPod Rewiring with TDD](#phase-2-ods-and-agentpod-rewiring-with-tdd)
8. [Phase 3: DI Container and Existing Test Updates](#phase-3-di-container-and-existing-test-updates)
9. [Phase 4: Real Agent Wiring Integration Tests](#phase-4-real-agent-wiring-integration-tests)
10. [Cross-Cutting Concerns](#cross-cutting-concerns)
11. [Complexity Tracking](#complexity-tracking)
12. [Phase Completion Checklist](#phase-completion-checklist)
13. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: The orchestration system (ODS, AgentPod, PodManager) uses raw `IAgentAdapter` — a stateless, session-unaware interface. Plan 034 delivered `AgentManagerService` and `IAgentInstance` with lifecycle tracking, session management, and event pass-through. These systems are not yet connected.

**Solution**: Rewire ODS to create agents through `AgentManagerService.getNew()` / `.getWithSessionId()`, replace AgentPod's raw adapter with `IAgentInstance`, update `PodCreateParams` and `GraphOrchestratorSettingsSchema`, align the DI container, update all existing tests, and prove the wiring works with real Claude Code and Copilot adapters.

**Expected outcomes**:
- ODS maps `AgentContextService` outcomes directly to manager methods (new → `getNew`, inherit → `getWithSessionId`)
- AgentPod gains lifecycle tracking and event pass-through for free
- Graph-level agent type selection via `GraphOrchestratorSettingsSchema.agentType`
- All 3858+ existing tests continue to pass
- Real agent wiring tests prove the chain works end-to-end with both adapters

---

## Technical Context

### Current State

```
ODS.handleAgentOrCode()
  → contextService.getContextSource() → { source: 'new' | 'inherit' }
  → buildPodParams(node) → { adapter: this.deps.agentAdapter }  ← SINGLE adapter
  → podManager.createPod(nodeId, { adapter })
  → pod.execute({ contextSessionId, ... })
    → agentAdapter.run({ prompt, sessionId, cwd })
```

**Problems**:
- Single `IAgentAdapter` instance for all pods — no per-node type selection
- `contextSessionId` threaded through `PodExecuteOptions` — session not baked into instance
- No lifecycle tracking on the pod (status, events, metadata)
- No same-instance guarantee for session-based lookups

### Target State

```
ODS.handleAgentOrCode()
  → contextService.getContextSource() → { source: 'new' | 'inherit' }
  → agentManager.getNew(params) or .getWithSessionId(sessionId, params)
  → podManager.createPod(nodeId, { agentInstance })
  → pod.execute({ ... })  ← no contextSessionId
    → agentInstance.run({ prompt, cwd })
      → adapter.run({ prompt, sessionId, cwd })  ← sessionId from instance
```

### Integration Requirements

- Plan 034 components (`IAgentInstance`, `AgentManagerService`, fakes) are stable (141 tests)
- Plan 030 orchestration loop (settle-decide-act) is stable (3858 tests)
- Plan 032 event system is stable
- `IAgentAdapter` interface is UNCHANGED — adapters remain as-is

### ADR Ledger

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0004 | Accepted | Phase 3 | DI bootstrap sequence — container registration order matters |
| ADR-0006 | Accepted | All | CLI-based orchestration — this plan is Phase B wiring of ADR-0006's vision |
| ADR-0009 | Accepted | Phase 3 | Module registration function pattern — `registerOrchestrationServices()` |
| ADR-0011 | Accepted | Phase 1-2 | First-class domain concepts — IAgentInstance interface-first |

### Deviation Ledger

| Principle Violated | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-------------------|------------|------------------------------|-----------------|
| None | — | — | — |

---

## Critical Research Findings

### 01: ODS Uses Single Shared Adapter
**Impact**: Critical
**What**: `ODSDependencies.agentAdapter` is a single `IAgentAdapter` instance passed to ALL agent pods via `buildPodParams()`. No per-node type selection.
**Action**: Replace with `IAgentManagerService`. ODS calls `getNew()` / `getWithSessionId()` per node, each returning an `IAgentInstance` that wraps a type-specific adapter.
**Affects**: Phase 2

### 02: PodCreateParams Is a Discriminated Union
**Impact**: Critical
**What**: `PodCreateParams` has `{ unitType: 'agent', adapter: IAgentAdapter }` variant. Changing `adapter` to `agentInstance` breaks all `createPod` call sites.
**Action**: Update the type, then update all callers (ODS, tests, E2E script).
**Affects**: Phase 1, 2, 3

### 03: contextSessionId Threaded Through PodExecuteOptions
**Impact**: High
**What**: `PodExecuteOptions.contextSessionId` carries the inherited session. AgentPod reads it in `execute()` to pass to `adapter.run()`. With `IAgentInstance`, the session is baked in at creation.
**Action**: Remove `contextSessionId` from `PodExecuteOptions`. Remove from AgentPod's `execute()`. Session comes from the instance.
**Affects**: Phase 1, 2

### 04: registerOrchestrationServices Creates Internal Collaborators
**Impact**: High
**What**: `registerOrchestrationServices()` in `packages/positional-graph/src/container.ts` resolves `IAgentAdapter` from `ORCHESTRATION_DI_TOKENS.AGENT_ADAPTER` and passes it to ODS. Internal collaborators (ONBAS, AgentContextService, PodManager) are created inline, not registered in DI.
**Action**: Change to resolve `IAgentManagerService` from `ORCHESTRATION_DI_TOKENS.AGENT_MANAGER`. CLI container registers the SAME `AgentManagerService` instance for both tokens.
**Affects**: Phase 3

### 05: CLI Container Does NOT Register Orchestration Services
**Impact**: High
**What**: The CLI container (`apps/cli/src/lib/container.ts`) registers `AgentManagerService` at `CLI_DI_TOKENS.AGENT_MANAGER` but does NOT call `registerOrchestrationServices()`. Orchestration is not yet wired in the CLI.
**Action**: Either register `ORCHESTRATION_DI_TOKENS.AGENT_MANAGER` pointing to the same instance, or defer orchestration registration to Spec B when `cg wf run` is implemented. For now, add the token alias so the wiring is testable.
**Affects**: Phase 3

### 06: AgentPod Has resumeWithAnswer Method
**Impact**: Medium
**What**: AgentPod has `resumeWithAnswer(questionId, answer, options)` that constructs a continuation prompt and calls `adapter.run()`. This method also needs updating to use `agentInstance.run()`.
**Action**: Update to delegate to `agentInstance.run()` with the resume prompt.
**Affects**: Phase 2

### 07: GraphOrchestratorSettingsSchema Is Currently Empty
**Impact**: Medium
**What**: `GraphOrchestratorSettingsSchema = z.object({}).strict()`. Adding `agentType` is additive and non-breaking.
**Action**: Add `agentType: z.enum(['claude-code', 'copilot']).default('copilot')`. ODS reads from `reality.settings.agentType` — default applied at schema level.
**Affects**: Phase 1

### 08: E2E Script Has 4 FakeAgentAdapter References
**Impact**: Medium
**What**: Per Workshop 06, exactly 4 lines reference `FakeAgentAdapter` in the E2E script. Minimal change.
**Action**: Swap to `FakeAgentManagerService`. Same behavior — fake agents complete synchronously.
**Affects**: Phase 3

### 09: Real Agent Tests Need Dynamic Imports
**Impact**: Medium
**What**: ClaudeCodeAdapter requires `UnixProcessManager`, SdkCopilotAdapter requires `CopilotClient` (ESM-only). Both must be dynamically imported to avoid loading in unit test context.
**Action**: Follow Plan 034's established pattern: dynamic `await import()` in `beforeAll`.
**Affects**: Phase 4

### 10: No Execution Tracking for Real Agent Wiring Tests
**Impact**: Medium
**What**: Spec B adds `PodManager.trackExecution()`. This spec doesn't have it. Real agent tests need to wait for agent completion.
**Action**: Poll `pod.sessionId` with timeout. Simple, adequate for `describe.skip` tests.
**Affects**: Phase 4

---

## Testing Philosophy

### Testing Approach
- **Selected Approach**: Full TDD
- **Rationale**: Cross-cutting interface changes affect ODS, AgentPod, PodManager, PodCreateParams, DI container, and 10+ test files. Every change must be verified to prevent regressions.
- **Focus Areas**: ODS agent creation paths (getNew/getWithSessionId), AgentPod delegation, PodCreateParams shape, DI token resolution, session inheritance chain, real adapter wiring

### Test-Driven Development
- Write tests FIRST (RED)
- Implement minimal code (GREEN)
- Refactor for quality (REFACTOR)

### Mock Usage
- **Policy**: Fakes only, no mocks (project convention R-TEST-006)
- `FakeAgentManagerService`, `FakeAgentInstance`, `FakeAgentAdapter` for unit tests
- Real `AgentManagerService` + real adapters for wiring integration tests (Phase 4)
- No `vi.mock`, `vi.spyOn`, or mock libraries

### Test Documentation
Every test must include:
```
Purpose: [what truth this test proves]
Quality Contribution: [how this prevents bugs]
Acceptance Criteria: [measurable assertions]
```

---

## File Placement Manifest

| File | Classification | Location | Rationale |
|------|---------------|----------|-----------|
| `types.ts` (GraphOrchestratorSettings extension) | cross-plan-edit | `packages/positional-graph/src/features/030-orchestration/` | Extends existing schema |
| `ods.ts` (rewired) | cross-plan-edit | `packages/positional-graph/src/features/030-orchestration/` | Edits existing ODS |
| `ods.types.ts` (ODSDependencies change) | cross-plan-edit | `packages/positional-graph/src/features/030-orchestration/` | Edits existing types |
| `pod.agent.ts` (rewired) | cross-plan-edit | `packages/positional-graph/src/features/030-orchestration/` | Edits existing AgentPod |
| `pod-manager.types.ts` (PodCreateParams change) | cross-plan-edit | `packages/positional-graph/src/features/030-orchestration/` | Edits existing types |
| `pod.types.ts` (PodExecuteOptions change) | cross-plan-edit | `packages/positional-graph/src/features/030-orchestration/` | Edits existing types |
| `container.ts` (DI token) | cross-plan-edit | `packages/positional-graph/src/container.ts` | DI registration |
| `di-tokens.ts` (new token) | cross-cutting | `packages/shared/src/di-tokens.ts` | Shared token definition |
| `container.ts` (CLI token alias) | cross-plan-edit | `apps/cli/src/lib/container.ts` | DI wiring |
| `ods.test.ts` (updated) | cross-plan-edit | `test/unit/features/030-orchestration/` | Updates existing tests |
| `pod.test.ts` (updated) | cross-plan-edit | `test/unit/features/030-orchestration/` | Updates existing tests |
| `pod-manager.test.ts` (updated) | cross-plan-edit | `test/unit/features/030-orchestration/` | Updates existing tests |
| `orchestration-wiring-real.test.ts` | plan-scoped | `test/integration/` | New real agent wiring tests |

**Note**: No `features/035-agent-orchestration-wiring/` directory needed — this spec edits existing files. The only new file is the real agent wiring test.

---

## Phase 1: Types, Interfaces, and Schema Changes

**Objective**: Update all type definitions and schemas so subsequent phases can compile against the new interfaces.

**Deliverables**:
- Updated `ODSDependencies` interface (`agentAdapter` → `agentManager`)
- Updated `PodCreateParams` (`adapter` → `agentInstance`)
- Updated `PodExecuteOptions` (remove `contextSessionId`)
- Extended `GraphOrchestratorSettingsSchema` with `agentType`
- New `ORCHESTRATION_DI_TOKENS.AGENT_MANAGER` token

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Type changes cascade to many files | High | Low | This phase is types only — compilation errors are expected until Phase 2-3 |

### Tasks

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.1 | [x] | Write unit tests for `GraphOrchestratorSettingsSchema` with `agentType` field | 1 | Tests verify: optional field, valid values, default fallback, invalid rejected | [📋](tasks/phase-1-types-interfaces-and-schema-changes/execution.log.md#task-t001-schema-tests-red) | RED phase · 5 tests, all FAIL [^1] |
| 1.2 | [x] | Add `agentType` to `GraphOrchestratorSettingsSchema` with `.default('copilot')` | 1 | Tests from 1.1 pass. `parse({})` returns `{ agentType: 'copilot' }` | [📋](tasks/phase-1-types-interfaces-and-schema-changes/execution.log.md#task-t002-schema-implementation-green) | GREEN phase · 5 tests pass [^1] |
| 1.3 | [x] | Update `ODSDependencies` interface: `agentAdapter` → `agentManager: IAgentManagerService` | 1 | Interface compiles, imports `IAgentManagerService` from Plan 034 | [📋](tasks/phase-1-types-interfaces-and-schema-changes/execution.log.md#tasks-t003-t004-t005-type-definition-changes-parallel) | Completed [^2] |
| 1.4 | [x] | Update `PodCreateParams` agent variant: `adapter: IAgentAdapter` → `agentInstance: IAgentInstance` | 1 | Type compiles, imports `IAgentInstance` from Plan 034 | [📋](tasks/phase-1-types-interfaces-and-schema-changes/execution.log.md#tasks-t003-t004-t005-type-definition-changes-parallel) | Completed [^3] |
| 1.5 | [x] | Remove `contextSessionId` from `PodExecuteOptions` | 1 | Type compiles, field removed | [📋](tasks/phase-1-types-interfaces-and-schema-changes/execution.log.md#tasks-t003-t004-t005-type-definition-changes-parallel) | Completed · callers updated in Phase 2 [^3] |
| 1.6 | [x] | Add `ORCHESTRATION_DI_TOKENS.AGENT_MANAGER` to `di-tokens.ts` referencing `SHARED_DI_TOKENS.AGENT_MANAGER_SERVICE` (not duplicate string) | 1 | Token exists, value references shared token | [📋](tasks/phase-1-types-interfaces-and-schema-changes/execution.log.md#task-t007-di-token) | Completed [^4] |

### Acceptance Criteria
- [x] All type definitions compile cleanly in isolation
- [x] `GraphOrchestratorSettingsSchema` validates agentType correctly
- [x] `ORCHESTRATION_DI_TOKENS.AGENT_MANAGER` token defined
- [x] `just typecheck` may have errors from unchanged callers (expected — resolved in Phase 2-3)

---

## Phase 2: ODS and AgentPod Rewiring with TDD

**Objective**: Rewire ODS to use `AgentManagerService` and AgentPod to wrap `IAgentInstance`, with comprehensive TDD coverage.

**Deliverables**:
- Rewired ODS using `agentManager.getNew()` / `.getWithSessionId()` with agent type resolution
- Rewired AgentPod wrapping `IAgentInstance`
- Updated PodManager.createPod for new `PodCreateParams`
- Full unit test coverage for all ODS paths and AgentPod delegation

**Dependencies**: Phase 1 (types must be in place)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ODS logic change introduces regression | Medium | High | TDD — write tests first for every code path |
| AgentPod resumeWithAnswer needs careful update | Low | Medium | Test resume path explicitly |

### Tasks

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 2.1 | [x] | Write ODS unit tests: `getNew` path (source='new') | 2 | Tests verify: ODS calls `agentManager.getNew(params)` with correct name, type, workspace, metadata when context is 'new' | [📋](tasks/phase-2-ods-and-agentpod-rewiring-with-tdd/execution.log.md) | RED phase [^5] |
| 2.2 | [x] | Write ODS unit tests: `getWithSessionId` path (source='inherit') | 2 | Tests verify: ODS calls `getWithSessionId(sessionId, params)` when inheriting and session exists | [📋](tasks/phase-2-ods-and-agentpod-rewiring-with-tdd/execution.log.md) | RED phase [^5] |
| 2.3 | [x] | Write ODS unit tests: inherit fallback to `getNew` | 1 | Tests verify: ODS calls `getNew` when inheriting but source node has no session | [📋](tasks/phase-2-ods-and-agentpod-rewiring-with-tdd/execution.log.md) | RED phase [^5] |
| 2.4 | [x] | Write ODS unit tests: agent type resolution | 2 | Tests verify: type from `reality.settings.agentType`, fallback to `'copilot'` | [📋](tasks/phase-2-ods-and-agentpod-rewiring-with-tdd/execution.log.md) | RED phase [^5] |
| 2.5 | [x] | Rewire ODS.handleAgentOrCode() to use `agentManager` | 3 | All tests from 2.1-2.4 pass. ODS creates instances via manager, passes to createPod | [📋](tasks/phase-2-ods-and-agentpod-rewiring-with-tdd/execution.log.md) | GREEN phase [^6] |
| 2.6 | [x] | Write AgentPod unit tests: constructor, delegation, sessionId | 2 | Tests verify: wraps IAgentInstance, delegates run/terminate, reads sessionId from instance | [📋](tasks/phase-2-ods-and-agentpod-rewiring-with-tdd/execution.log.md) | RED phase [^8] |
| 2.7 | [x] | Write AgentPod unit tests: no contextSessionId in execute | 1 | Tests verify: execute() does not pass contextSessionId; session comes from instance | [📋](tasks/phase-2-ods-and-agentpod-rewiring-with-tdd/execution.log.md) | RED phase [^8] |
| 2.8 | [x] | Rewire AgentPod to wrap IAgentInstance | 2 | All tests from 2.6-2.7 pass. Constructor accepts `(nodeId, agentInstance, unitSlug)` | [📋](tasks/phase-2-ods-and-agentpod-rewiring-with-tdd/execution.log.md) | GREEN phase [^8] |
| 2.9 | [x] | Update PodManager.createPod for new PodCreateParams | 1 | createPod reads `agentInstance` from params, passes to AgentPod constructor | [📋](tasks/phase-2-ods-and-agentpod-rewiring-with-tdd/execution.log.md) | [^8] |
| 2.10 | [x] | Update AgentPod.resumeWithAnswer to use instance.run() | 1 | Resume delegates to `agentInstance.run()` with continuation prompt | [📋](tasks/phase-2-ods-and-agentpod-rewiring-with-tdd/execution.log.md) | [^8] |
| 2.11 | [x] | Refactor and verify all Phase 2 tests pass together | 1 | `pnpm vitest run test/unit/features/030-orchestration/` passes | [📋](tasks/phase-2-ods-and-agentpod-rewiring-with-tdd/execution.log.md) | REFACTOR phase |

### Acceptance Criteria
- [x] ODS creates agents through AgentManagerService (getNew/getWithSessionId)
- [x] ODS resolves agent type from graph settings with fallback
- [x] AgentPod wraps IAgentInstance — no internal `_sessionId`
- [x] PodCreateParams agent variant uses `agentInstance`
- [x] All new unit tests pass
- [x] Fakes only — no mocks

---

## Phase 3: DI Container and Existing Test Updates

**Objective**: Align the DI container, update all existing orchestration tests, and verify the Plan 030 E2E script works with new wiring.

**Deliverables**:
- DI container registers `ORCHESTRATION_DI_TOKENS.AGENT_MANAGER`
- CLI container aliases same `AgentManagerService` for both tokens
- All existing ODS, pod, pod-manager unit tests updated
- Plan 030 E2E script updated (4-line wiring change)
- `just fft` passes with 3858+ tests

**Dependencies**: Phase 2 (ODS and AgentPod must be rewired)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| E2E script breaks after wiring change | Low | High | Before/after output diff per Workshop 06 |
| Missed test file in update | Medium | Medium | Grep for `agentAdapter` and `FakeAgentAdapter` across all test files |

### Tasks

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Update `registerOrchestrationServices()` to resolve `AGENT_MANAGER` | 2 | Container resolves `IAgentManagerService` and passes to ODS | - | `packages/positional-graph/src/container.ts` |
| 3.2 | [ ] | Register `ORCHESTRATION_DI_TOKENS.AGENT_MANAGER` in CLI container | 1 | Same `AgentManagerService` instance for both CLI and orchestration tokens | - | `apps/cli/src/lib/container.ts` |
| 3.3 | [ ] | Update ODS unit tests for new interface | 2 | All existing ODS tests pass with `FakeAgentManagerService` replacing `FakeAgentAdapter` | - | `test/unit/features/030-orchestration/ods.test.ts` |
| 3.4 | [ ] | Update AgentPod unit tests for new interface | 2 | All existing pod tests pass with `FakeAgentInstance` replacing `FakeAgentAdapter` | - | `test/unit/features/030-orchestration/pod.test.ts` |
| 3.5 | [ ] | Update PodManager unit tests for new PodCreateParams | 1 | All existing pod-manager tests pass with `agentInstance` in params | - | `test/unit/features/030-orchestration/pod-manager.test.ts` |
| 3.6 | [ ] | Update container orchestration unit tests | 1 | DI token resolution tests pass | - | `test/unit/features/030-orchestration/container-orchestration.test.ts` |
| 3.7 | [ ] | Update Plan 030 E2E script wiring | 1 | `FakeAgentManagerService` replaces `FakeAgentAdapter`. Same 58-step behavior. | - | 4 lines per Workshop 06 |
| 3.8 | [ ] | Verify E2E before/after equivalence | 1 | E2E script exits 0. Output structure matches pre-change run. | - | |
| 3.9 | [ ] | Run `just fft` — full test suite passes | 1 | 3858+ tests pass, 0 failures | - | Gate check |

### Acceptance Criteria
- [ ] DI container correctly resolves `IAgentManagerService` for orchestration
- [ ] CLI container shares same instance for both tokens
- [ ] ALL existing orchestration unit tests pass (unchanged behavior)
- [ ] Plan 030 E2E passes with new wiring (58 steps, exit 0)
- [ ] `just fft` passes (3858+ tests)
- [ ] No `agentAdapter` or `FakeAgentAdapter` references remain in orchestration code or tests (grep verified)

---

## Phase 4: Real Agent Wiring Integration Tests

**Objective**: Prove the ODS → AgentManagerService → AgentInstance → real adapter chain works end-to-end with both Claude Code and Copilot SDK.

**Deliverables**:
- `test/integration/orchestration-wiring-real.test.ts` with 3 suites (Claude, Copilot, parity)
- All tests use `describe.skip` — documentation/validation tests
- Structural assertions only

**Dependencies**: Phase 3 (all wiring must be complete and passing)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Real agent tests slow (30-120s each) | High | Low | `describe.skip` — never runs in CI |
| Claude CLI not available | High | Low | `describe.skip` — manual unskip only |
| Non-deterministic agent output | High | Low | Structural assertions only (status, sessionId, events) |

### Tasks

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Write test scaffolding with real orchestration stack construction | 2 | `createRealOrchestrationStack()` builds real AgentManagerService with both adapter factories | - | Dynamic imports per Plan 034 pattern |
| 4.2 | [ ] | Write Claude Code single-node wiring test | 2 | ODS creates instance via getNew, pod executes, real agent spawns, sessionId acquired | - | `describe.skip`, 120s timeout |
| 4.3 | [ ] | Write Claude Code session inheritance test | 2 | node-b inherits node-a's session via getWithSessionId, fork produces different sessionId | - | Manual node completion for graph advance |
| 4.4 | [ ] | Write Claude Code event pass-through test | 2 | Events from real adapter flow through instance handlers to test collector | - | Verify text_delta or message events |
| 4.5 | [ ] | Write Copilot SDK single-node wiring test | 2 | Same as 4.2 but with SdkCopilotAdapter | - | `describe.skip` |
| 4.6 | [ ] | Write Copilot SDK session inheritance test | 2 | Same as 4.3 but with Copilot | - | `describe.skip` |
| 4.7 | [ ] | Write Copilot SDK event pass-through test | 2 | Same as 4.4 but with Copilot | - | `describe.skip` |
| 4.8 | [ ] | Write cross-adapter parity test | 2 | Both adapters produce sessionId and emit text events through same wiring chain | - | `describe.skip` |
| 4.9 | [ ] | Verify `just fft` still passes (no impact from skipped tests) | 1 | 3858+ tests pass, skipped tests don't interfere | - | Gate check |

### Acceptance Criteria
- [ ] Real orchestration stack constructs with both adapter types
- [ ] Single-node wiring proven for both adapters (sessionId acquired)
- [ ] Session inheritance proven for both adapters (fork sessionId differs)
- [ ] Event pass-through proven for both adapters (events reach handlers)
- [ ] Cross-adapter parity verified
- [ ] All tests use `describe.skip` (not `describe.skipIf`)
- [ ] All assertions are structural (no content assertions)
- [ ] `just fft` passes (existing tests unaffected)

---

## Cross-Cutting Concerns

### Security Considerations
- No new security surface — internal wiring change only
- Real agent tests use existing auth (Claude CLI, Copilot SDK) — no new credentials

### Observability
- No new logging requirements — existing adapter logging continues to work
- Event pass-through from adapter → instance → handlers is the observability path

### Documentation
- No new documentation (per clarification Q6)
- Existing `docs/how/agent-system/` covers AgentInstance/AgentManagerService

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| ODS rewiring | 3 | Medium | S=1,I=1,D=0,N=0,F=0,T=1 | Multiple code paths (new/inherit/fallback), type resolution | TDD for every path |
| Existing test updates | 3 | Medium | S=2,I=0,D=0,N=0,F=0,T=1 | ~10 test files, mechanical but broad | Do all at once per Workshop 06 |
| Real agent wiring tests | 3 | Medium | S=1,I=1,D=0,N=1,F=0,T=0 | Non-deterministic agents, dynamic imports | Structural assertions, describe.skip |
| Overall plan | 3 | Medium | S=2,I=1,D=0,N=0,F=0,T=1 | | |

---

## Phase Completion Checklist

- [x] Phase 1: Types, Interfaces, and Schema Changes — COMPLETE
- [x] Phase 2: ODS and AgentPod Rewiring with TDD — COMPLETE
- [ ] Phase 3: DI Container and Existing Test Updates
- [ ] Phase 4: Real Agent Wiring Integration Tests

### STOP Rule
This plan must be validated before creating tasks. After review:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## Change Footnotes Ledger

[^1]: Phase 1 Tasks 1.1-1.2 — Schema TDD cycle
  - `file:packages/positional-graph/src/schemas/orchestrator-settings.schema.ts`
  - `file:test/unit/schemas/orchestrator-settings.schema.test.ts`

[^2]: Phase 1 Task 1.3 — ODSDependencies type change
  - `file:packages/positional-graph/src/features/030-orchestration/ods.types.ts`

[^3]: Phase 1 Tasks 1.4-1.5 — Pod type changes
  - `file:packages/positional-graph/src/features/030-orchestration/pod-manager.types.ts`
  - `file:packages/positional-graph/src/features/030-orchestration/pod.types.ts`

[^4]: Phase 1 Tasks 1.6 + T006 — Reality type + DI token
  - `file:packages/positional-graph/src/features/030-orchestration/reality.types.ts`
  - `file:packages/shared/src/di-tokens.ts`

[^5]: Phase 2 Tasks 2.1-2.4 — ODS wiring tests
  - `file:test/unit/positional-graph/features/030-orchestration/ods-agent-wiring.test.ts`

[^6]: Phase 2 Task 2.5 — ODS rewiring
  - `file:packages/positional-graph/src/features/030-orchestration/ods.ts`
  - `file:packages/positional-graph/src/features/030-orchestration/ods.types.ts`

[^7]: Phase 2 Task T006 — Reality builder settings
  - `file:packages/positional-graph/src/features/030-orchestration/reality.builder.ts`
  - `file:packages/positional-graph/src/features/030-orchestration/graph-orchestration.ts`

[^8]: Phase 2 Tasks 2.6-2.10 — AgentPod TDD + PodManager
  - `file:test/unit/positional-graph/features/030-orchestration/pod-agent-wiring.test.ts`
  - `file:packages/positional-graph/src/features/030-orchestration/pod.agent.ts`
  - `file:packages/positional-graph/src/features/030-orchestration/pod-manager.ts`
