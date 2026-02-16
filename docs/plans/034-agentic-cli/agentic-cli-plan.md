# Agentic CLI: Agent System Redesign and Real Agent Validation — Implementation Plan

**Plan Version**: 1.1.0
**Created**: 2026-02-16
**Spec**: [./agentic-cli-spec.md](./agentic-cli-spec.md)
**Status**: READY

**Mode**: Full
**File Management**: PlanPak
**Testing Approach**: Full TDD
**Mock Usage**: Fakes only (no vi.fn/jest.fn)

**Workshops**:
- [01-cli-agent-run-and-e2e-testing.md](./workshops/01-cli-agent-run-and-e2e-testing.md) — CLI Flow + E2E Testing
- [02-unified-agent-design.md](../033-real-agent-pods/workshops/02-unified-agent-design.md) — Core Interface Design
- [03-cli-first-real-agents.md](../033-real-agent-pods/workshops/03-cli-first-real-agents.md) — Build Order & Phase A/B

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Context](#technical-context)
3. [Critical Research Findings](#critical-research-findings)
4. [Testing Philosophy](#testing-philosophy)
5. [File Placement Manifest](#file-placement-manifest)
6. [Phase 1: Types, Interfaces, and PlanPak Setup](#phase-1-types-interfaces-and-planpak-setup)
7. [Phase 2: Core Implementation with TDD](#phase-2-core-implementation-with-tdd)
8. [Phase 3: CLI Command Update with TDD](#phase-3-cli-command-update-with-tdd)
9. [Phase 4: Real Agent Integration Tests](#phase-4-real-agent-integration-tests)
10. [Phase 5: Export Wiring and Documentation](#phase-5-export-wiring-and-documentation)
11. [Cross-Cutting Concerns](#cross-cutting-concerns)
12. [Complexity Tracking](#complexity-tracking)
13. [Progress Tracking](#progress-tracking)
14. [Deviation Ledger](#deviation-ledger)
15. [Change Footnotes Ledger](#change-footnotes-ledger)

---

## Executive Summary

**Problem**: The current `AgentInstance` (Plan 019, 425 lines) is tightly coupled to web concerns — it depends on `IAgentNotifierService` for SSE broadcasting, `IAgentStorageAdapter` for persistence, and stores events internally via `getEvents()`. This makes it unsuitable for the orchestration system (Plan 033), which needs a domain-agnostic agent wrapper. Meanwhile, `AgentManagerService` lacks a session index and same-instance guarantee needed for re-attaching to running agents.

**Solution**: Redesign `AgentInstance` and `AgentManagerService` per Workshop 02's specification:
- Remove notifier, storage, events, and intent from `AgentInstance`
- Add metadata bag, event pass-through handlers, `compact()`, 3-state status model
- Add session index with same-instance guarantee to `AgentManagerService`
- Update CLI commands (`cg agent run`, `cg agent compact`) to use the new system
- Validate with three test tiers: unit (fast), real agent integration (both adapters), CLI E2E

**Expected outcomes**:
- A domain-agnostic `IAgentInstance` usable by CLI, orchestration, and (future) web UI
- Proven session chaining, compaction, event capture, and parallel execution with real agents
- Comprehensive contract test parity between fakes and real implementations
- All existing tests remain green (`just fft` passes)

---

## Technical Context

### Current System State

| Component | Location | Lines | Dependencies |
|-----------|----------|-------|-------------|
| `IAgentInstance` | `packages/shared/src/features/019-agent-manager-refactor/agent-instance.interface.ts` | ~65 | — |
| `AgentInstance` | `packages/shared/src/features/019-agent-manager-refactor/agent-instance.ts` | 425 | `IAgentAdapter`, `IAgentNotifierService`, `IAgentStorageAdapter` |
| `IAgentManagerService` | `packages/shared/src/features/019-agent-manager-refactor/agent-manager.interface.ts` | ~60 | — |
| `AgentManagerService` | `packages/shared/src/features/019-agent-manager-refactor/agent-manager.service.ts` | 277 | `AdapterFactory`, `IAgentNotifierService`, `IAgentStorageAdapter` |
| `FakeAgentInstance` | `packages/shared/src/features/019-agent-manager-refactor/fake-agent-instance.ts` | ~200 | Composes `FakeAgentAdapter` |
| `FakeAgentManagerService` | `packages/shared/src/features/019-agent-manager-refactor/fake-agent-manager.service.ts` | ~150 | — |
| CLI agent command | `apps/cli/src/commands/agent.command.ts` | 257 | `AgentService` (not AgentManagerService) |
| CLI DI container | `apps/cli/src/lib/container.ts` | ~283 | Registers `AgentService` only |
| Contract tests | `test/contracts/agent-instance.contract*.ts`, `test/contracts/agent-manager.contract*.ts` | — | Tests getEvents, setIntent, notifier |
| Real agent tests | `test/integration/real-agent-multi-turn.test.ts` | 383 | `IAgentAdapter` level (kept as-is) |

### What Changes

| Removed from AgentInstance | Added to AgentInstance |
|---------------------------|----------------------|
| `IAgentNotifierService` dependency | `metadata: Record<string, unknown>` |
| `IAgentStorageAdapter` dependency | `setMetadata(key, value)` |
| `getEvents()` / event storage | `addEventHandler(handler)` / `removeEventHandler(handler)` |
| `setIntent()` / intent | `isRunning` (convenience getter) |
| `_captureEvent()` / `_persistInstance()` | `compact()` (new operation) |
| `broadcastStatus/Event/Intent` calls | Per-run `onEvent` option |
| `static hydrate()` | `sessionId` in config (pre-set for resumption) |

### Integration Requirements

- `IAgentAdapter` interface remains **unchanged** (AC-48)
- `AgentService` (thin timeout wrapper) remains **unchanged** as a module (AC-49)
- CLI no longer registers `AgentService` — all commands use `AgentManagerService` (AC-34b)
- Plan 030 E2E tests continue passing (they use `FakeAgentAdapter` directly, AC-50)
- Web UI will **deliberately break** (per spec Q6) — TypeScript errors flag consumers for a future plan

### Constraints

- No `vi.fn()`, `jest.fn()`, or `vi.spyOn()` — fakes only (constitution P4)
- Interface-first development: interface → fake → tests → real (constitution P2)
- TDD: RED → GREEN → REFACTOR (constitution P3)
- All agent real tests wrapped in `describe.skipIf` for CI safety

---

## Critical Research Findings

### Discovery 01: AgentInstance Has 425 Lines of Web-Coupled Code
**Impact**: Critical
**What**: Current AgentInstance depends on notifier, storage, and stores events internally. The redesign removes all three, reducing to ~120 lines focused on adapter delegation and lifecycle.
**Action**: New implementation in `features/034-agentic-cli/agent-instance.ts`. Old 019 files stay but exports redirect.
**Affects Phases**: 1, 2

### Discovery 02: CLI Uses AgentService, Not AgentManagerService
**Impact**: Critical
**What**: The CLI container registers only `AgentService` (thin timeout wrapper) at `CLI_DI_TOKENS.AGENT_SERVICE`. `AgentManagerService` is not registered in the CLI at all. Plan 034 must add `AgentManagerService` registration and switch both `cg agent run` and `cg agent compact` to use it.
**Action**: Add `CLI_DI_TOKENS.AGENT_MANAGER` registration in container. Update command handlers.
**Affects Phases**: 3

### Discovery 03: Plan 019 Types Not Exported at Package Level
**Impact**: High
**What**: `packages/shared/src/index.ts` exports `AgentService`, `AdapterFactory`, and event types, but NOT `IAgentInstance`, `AgentInstance`, `IAgentManagerService`, or `AgentManagerService`. These must be imported from the feature barrel directly.
**Action**: Phase 5 adds proper barrel exports from the 034 feature folder to `@chainglass/shared`.
**Affects Phases**: 5

### Discovery 04: Contract Tests Cover Old Interface
**Impact**: High
**What**: Existing contract tests in `test/contracts/agent-instance.contract.ts` test `getEvents()`, `setIntent()`, and notifier integration. These must be completely rewritten for the new interface.
**Action**: New contract test suite covering status transitions, double-run guard, compact guard, event handlers, metadata, same-instance guarantee.
**Affects Phases**: 2

### Discovery 05: Web API Route Breaks on getEvents() Removal
**Impact**: High (but deliberate per spec Q6)
**What**: `/apps/web/app/api/agents/[id]/route.ts` line 71 calls `agent.getEvents()`. This will produce a TypeScript compile error. Per spec Q6, this is deliberately left broken for a future plan.
**Action**: No action in Plan 034. Leave compile errors as markers for future web reconnection plan.
**Affects Phases**: None (deliberate)

### Discovery 06: Web DI Container Passes Notifier/Storage to AgentManagerService
**Impact**: High (but deliberate per spec Q6)
**What**: `/apps/web/src/lib/di-container.ts` lines 392-419 construct `AgentManagerService` with `notifier` and `storage` parameters. The new constructor takes only `adapterFactory`.
**Action**: No action in Plan 034. Compile error left for future web plan.
**Affects Phases**: None (deliberate)

### Discovery 07: FakeAgentAdapter Already Has setNextResult/setRunDelay
**Impact**: Medium (positive — infrastructure already exists)
**What**: `FakeAgentAdapter` already supports `setNextResult()`, `setRunDelay()`, and event emission during `run()`. This is exactly what the unit tests need. No changes to FakeAgentAdapter required.
**Action**: Use existing FakeAgentAdapter as-is for all unit tests.
**Affects Phases**: 2

### Discovery 08: Session Index Update Mechanism (RESOLVED)
**Impact**: Medium
**What**: When `AgentInstance.run()` completes and gets a sessionId, the `AgentManagerService`'s session index must be updated.
**Decision**: RESOLVED — Option B: Manager attaches an internal event handler at instance creation time. When `run()` completes and a sessionId is available, the handler updates `_sessionIndex`. This keeps the session index logic inside the manager rather than leaking it into AgentInstance.
**Action**: `AgentManagerService.getNew()` and `getWithSessionId()` both attach a post-run handler to the created instance that updates the session index.
**Affects Phases**: 2

### Discovery 09: Timeout Enforcement Gap (RESOLVED)
**Impact**: Medium
**What**: `AgentService.run()` enforces a 10-minute timeout via `Promise.race()`. With `AgentService` removed from CLI wiring, this timeout enforcement is lost.
**Decision**: RESOLVED — Option A: Add optional `timeoutMs` to `AgentRunOptions`. `AgentInstance.run()` enforces via `Promise.race()` when set. CLI handler passes timeout from config service (default 600_000ms / 10 minutes).
**Action**: Add `timeoutMs?: number` to `AgentRunOptions` in types.ts (Phase 1). Implement `Promise.race()` in `AgentInstance.run()` (Phase 2). CLI handler passes timeout (Phase 3).
**Affects Phases**: 1, 2, 3

### Discovery 10: Compact Differs Between Adapters
**Impact**: Medium
**What**: Claude Code adapter delegates compact to `run({ prompt: '/compact', sessionId })`. Copilot SDK explicitly avoids calling `run()` (would destroy session) and instead resumes session, sends `/compact`, keeps alive. The `AgentInstance.compact()` abstraction hides this difference.
**Action**: `compact()` simply delegates to `adapter.compact(sessionId)` — adapter handles the difference. Test both adapters.
**Affects Phases**: 2, 4

### Discovery 11: Plan 030 E2E Uses FakeAgentAdapter Directly
**Impact**: Low (positive — no breakage)
**What**: `test/e2e/positional-graph-orchestration-e2e.ts` creates `FakeAgentAdapter` and wires it through `ODS` without going through `AgentManagerService`. Since `IAgentAdapter` is unchanged, these tests won't break.
**Action**: No changes needed. AC-50 satisfied automatically.
**Affects Phases**: None

### Discovery 12: FakeAgentAdapter Needs setNextCompactResult
**Impact**: Medium
**What**: The workshop unit tests call `adapter.setNextCompactResult(...)` but the current `FakeAgentAdapter` may not have this method. Need to verify and add if missing.
**Action**: Check `FakeAgentAdapter` for `compact()` support. Add `setNextCompactResult()` if missing.
**Affects Phases**: 2

---

## Testing Philosophy

### Testing Approach

- **Selected Approach**: Full TDD
- **Rationale**: Breaking interface redesign with contract parity requirements and real agent validation across two adapter types
- **Focus Areas**: Contract parity, same-instance guarantee, event pass-through, real agent session chaining, parallel execution, status transitions
- **Excluded**: Web UI reconnection (future plan); adapter internals (already tested)

### Test-Driven Development

All implementation follows RED-GREEN-REFACTOR:
1. **RED**: Write test, verify it fails (TypeScript compilation or assertion failure)
2. **GREEN**: Implement minimal code to pass the test
3. **REFACTOR**: Improve code quality while keeping tests green

### Interface-First Development (Constitution P2)

For each component:
1. Write interface (Phase 1)
2. Write fake (Phase 2)
3. Write tests using fake (Phase 2)
4. Write real implementation (Phase 2)
5. Contract tests verify fake-real parity (Phase 2)

### Mock Usage

Fakes only. No `vi.fn()`, `jest.fn()`, `vi.spyOn()`, or Sinon stubs.

Test doubles used:
- `FakeAgentAdapter` — existing, unchanged (setNextResult, setRunDelay, event emission)
- `FakeAgentInstance` — new, implements IAgentInstance with test helpers
- `FakeAgentManagerService` — new, implements IAgentManagerService with same-instance guarantee

Real agent tests use actual `ClaudeCodeAdapter` and `SdkCopilotAdapter` (skipped in CI).

### Three Test Tiers

```
Tier 1: UNIT TESTS (fast, FakeAgentAdapter)
  AgentInstance, AgentManagerService, fakes, contract parity
  Runs in CI. < 5 seconds.

Tier 2: REAL AGENT INTEGRATION (both adapters, skipped by default)
  AgentInstance wrapping real ClaudeCodeAdapter / SdkCopilotAdapter
  describe.skipIf(!hasClaudeCli()) / describe.skipIf(!hasCopilotSdk())
  30-120 seconds per test. Manual only.

Tier 3: CLI E2E (shell out to cg agent run, skipped by default)
  Spawn CLI process, verify stdout/exit codes, session chaining
  describe.skipIf(!existsSync(CLI_PATH) || !hasClaudeCli())
  60-180 seconds. Manual only.
```

### Non-Determinism Handling

Real agent tests use structural assertions only:

| Assertable | Example | Why Reliable |
|-----------|---------|--------------|
| Status | `expect(status).toBe('stopped')` | Adapter always reports |
| SessionId | `expect(sessionId).toBeTruthy()` | Always returned |
| Event count | `expect(events.length).toBeGreaterThan(0)` | Any prompt produces events |
| Event types | `events.some(e => e.type === 'text_delta')` | Text always generated |
| Handler parity | `handler1.length === handler2.length` | Same dispatch |

Content assertions (exact text, specific word) are NOT used.

---

## File Placement Manifest

| File | Classification | Location | Rationale |
|------|---------------|----------|-----------|
| `agent-instance.interface.ts` | plan-scoped | `packages/shared/src/features/034-agentic-cli/` | New interface for this plan |
| `agent-manager-service.interface.ts` | plan-scoped | `packages/shared/src/features/034-agentic-cli/` | New interface for this plan |
| `types.ts` | plan-scoped | `packages/shared/src/features/034-agentic-cli/` | CreateAgentParams, AgentInstanceConfig, AgentRunOptions, etc. |
| `agent-instance.ts` | plan-scoped | `packages/shared/src/features/034-agentic-cli/` | AgentInstance implementation |
| `agent-manager-service.ts` | plan-scoped | `packages/shared/src/features/034-agentic-cli/` | AgentManagerService implementation |
| `index.ts` | plan-scoped | `packages/shared/src/features/034-agentic-cli/` | Barrel exports |
| `fakes/fake-agent-instance.ts` | plan-scoped | `packages/shared/src/features/034-agentic-cli/fakes/` | Test double |
| `fakes/fake-agent-manager-service.ts` | plan-scoped | `packages/shared/src/features/034-agentic-cli/fakes/` | Test double |
| `fakes/index.ts` | plan-scoped | `packages/shared/src/features/034-agentic-cli/fakes/` | Barrel exports for fakes |
| `agent-run-handler.ts` | plan-scoped | `apps/cli/src/features/034-agentic-cli/` | Updated handleAgentRun |
| `agent-compact-handler.ts` | plan-scoped | `apps/cli/src/features/034-agentic-cli/` | Updated handleAgentCompact |
| `terminal-event-handler.ts` | plan-scoped | `apps/cli/src/features/034-agentic-cli/` | Terminal output formatters |
| `parse-meta-options.ts` | plan-scoped | `apps/cli/src/features/034-agentic-cli/` | --meta key=value parser |
| `container.ts` | cross-cutting | `apps/cli/src/lib/container.ts` | DI wiring update |
| `agent.command.ts` | cross-cutting | `apps/cli/src/commands/agent.command.ts` | Command registration update |
| `index.ts` | cross-cutting | `packages/shared/src/index.ts` | Barrel export update |
| `agent-instance.test.ts` | plan-scoped | `test/unit/features/034-agentic-cli/` | Unit tests |
| `agent-manager-service.test.ts` | plan-scoped | `test/unit/features/034-agentic-cli/` | Unit tests |
| `agent-instance-contract.test.ts` | plan-scoped | `test/unit/features/034-agentic-cli/` | Contract parity suite |
| `agent-manager-contract.test.ts` | plan-scoped | `test/unit/features/034-agentic-cli/` | Contract parity suite |
| `terminal-event-handler.test.ts` | plan-scoped | `test/unit/features/034-agentic-cli/` | Terminal handler tests |
| `cli-agent-handlers.test.ts` | plan-scoped | `test/unit/features/034-agentic-cli/` | CLI handler tests |
| `parse-meta-options.test.ts` | plan-scoped | `test/unit/features/034-agentic-cli/` | Unit tests for --meta parser |
| `agent-instance-real.test.ts` | plan-scoped | `test/integration/` | Real agent integration |
| `agent-cli-e2e.test.ts` | plan-scoped | `test/e2e/` | CLI E2E tests |

---

## Phase 1: Types, Interfaces, and PlanPak Setup

**Objective**: Define all type contracts and create the PlanPak directory structure. Everything compiles but nothing is implemented.

**Deliverables**:
- PlanPak feature folders created
- `IAgentInstance` interface (redesigned per Workshop 02)
- `IAgentManagerService` interface (redesigned per Workshop 02)
- Supporting types: `AgentInstanceConfig`, `CreateAgentParams`, `AgentRunOptions`, `AgentEventHandler`, `AgentInstanceStatus`, `AgentFilter`
- Barrel exports

**Dependencies**: None (foundational phase)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Type naming conflicts with Plan 019 | Medium | Medium | Use distinct imports from 034 feature folder; 019 types stay as-is |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 1.0 | [ ] | Create PlanPak feature folder structure | 1 | Directories exist: `packages/shared/src/features/034-agentic-cli/`, `packages/shared/src/features/034-agentic-cli/fakes/`, `apps/cli/src/features/034-agentic-cli/`, `test/unit/features/034-agentic-cli/` | - | T000 PlanPak setup |
| 1.1 | [ ] | Define `types.ts` with all supporting types | 1 | `AgentInstanceStatus`, `AgentEventHandler`, `AgentInstanceConfig`, `CreateAgentParams`, `AgentRunOptions`, `AgentFilter` compile correctly | - | Per Workshop 02 |
| 1.2 | [ ] | Define `agent-instance.interface.ts` (IAgentInstance) | 1 | Interface includes: id, name, type, workspace, status, isRunning, sessionId, createdAt, updatedAt, metadata, setMetadata, addEventHandler, removeEventHandler, run, compact, terminate | - | Per AC-01, AC-02 |
| 1.3 | [ ] | Define `agent-manager-service.interface.ts` (IAgentManagerService) | 1 | Interface includes: getNew, getWithSessionId, getAgent, getAgents, terminateAgent, initialize | - | Per AC-14-21 |
| 1.4 | [ ] | Create barrel `index.ts` for 034 feature | 1 | All types and interfaces importable from feature barrel | - | |

### Acceptance Criteria
- [ ] All types and interfaces compile (`tsc --noEmit` passes)
- [ ] PlanPak directories exist
- [ ] No implementation code (interfaces only)
- [ ] AC-01, AC-02, AC-03, AC-10, AC-13 type contracts expressed

---

## Phase 2: Core Implementation with TDD

**Objective**: Implement AgentInstance, AgentManagerService, and their fakes using TDD. Write contract tests that verify fake-real parity.

**Deliverables**:
- `AgentInstance` implementation (~120 lines, domain-agnostic)
- `AgentManagerService` implementation (session index, same-instance guarantee)
- `FakeAgentInstance` with test helpers
- `FakeAgentManagerService` with test helpers
- Contract test suite running against both real and fake
- Unit tests for all components

**Dependencies**: Phase 1 (interfaces must exist)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| FakeAgentAdapter missing compact support | Medium | Medium | Check and add setNextCompactResult if needed (Discovery 12) |
| Session index update timing | Low | Medium | Use internal handler per Workshop 02 design |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 2.1 | [ ] | Write AgentInstance unit tests (RED) | 2 | Tests cover: status transitions (AC-04), double-run guard (AC-05), event pass-through (AC-06, AC-07, AC-08), per-run onEvent (AC-09), metadata (AC-10), isRunning (AC-11), terminate (AC-12), compact transitions (AC-12a), compact no-session guard (AC-12b), compact working guard (AC-12c), compact token metrics (AC-12d), sessionId tracking. All fail initially. | - | Per Workshop 01 test code |
| 2.2 | [ ] | Write AgentManagerService unit tests (RED) | 2 | Tests cover: getNew creates no-session instance (AC-14), getWithSessionId pre-sets session (AC-15), same-instance guarantee (AC-16), different sessions different instances (AC-17), getAgent by ID (AC-18), getAgents with filter (AC-19), terminateAgent cleanup (AC-20), constructor accepts only adapterFactory (AC-21), session index update after run (AC-22). All fail initially. | - | Per Workshop 01 test code |
| 2.3 | [ ] | Verify FakeAgentAdapter supports compact | 1 | FakeAgentAdapter has `compact()` method and `setNextCompactResult()` helper. Add if missing. | - | Discovery 12 |
| 2.4 | [ ] | Implement FakeAgentInstance | 2 | Implements IAgentInstance with test helpers: `setStatus()`, `assertRunCalled()`, `reset()`, configurable status/metadata. Composable with FakeAgentAdapter. | - | AC-23, AC-25 |
| 2.5 | [ ] | Implement FakeAgentManagerService | 2 | Implements IAgentManagerService with same-instance guarantee, session index, test helpers: `addAgent()`, `getCreatedAgents()`, `reset()`. | - | AC-24 |
| 2.6 | [ ] | Implement AgentInstance (GREEN) | 3 | All tests from 2.1 pass. Status model: working/stopped/error. Event pass-through via Set of handlers. Metadata bag. compact() delegates to adapter.compact(). | - | AC-04 through AC-12d |
| 2.7 | [ ] | Implement AgentManagerService (GREEN) | 3 | All tests from 2.2 pass. Session index (_sessionIndex Map). Same-instance guarantee. Internal handler for session index update after run(). | - | AC-14 through AC-22 |
| 2.8 | [ ] | Write contract test suite for IAgentInstance | 2 | Shared test function runs against both AgentInstance (with FakeAgentAdapter) and FakeAgentInstance. Covers: status transitions, double-run guard, compact guard, session tracking, metadata, event pass-through, isRunning. | - | AC-26, AC-28 |
| 2.9 | [ ] | Write contract test suite for IAgentManagerService | 2 | Shared test function runs against both AgentManagerService and FakeAgentManagerService. Covers: getNew, getWithSessionId same-instance, getAgent, getAgents, terminateAgent. | - | AC-27 |
| 2.10 | [ ] | Update fakes barrel exports | 1 | `features/034-agentic-cli/fakes/index.ts` exports both fakes. Feature barrel re-exports fakes. | - | |
| 2.11 | [ ] | Refactor: review code quality | 1 | All tests still pass. Code follows idioms. No unnecessary complexity. | - | REFACTOR step |

### Test Examples (Write First!)

```typescript
// test/unit/features/034-agentic-cli/agent-instance.test.ts
describe('AgentInstance', () => {
  let adapter: FakeAgentAdapter;
  let instance: AgentInstance;

  beforeEach(() => {
    adapter = new FakeAgentAdapter();
    instance = new AgentInstance({
      id: 'test-1', name: 'test-agent', type: 'claude-code',
      workspace: '/tmp/test', adapter,
    });
  });

  it('starts with status stopped', () => {
    /**
     * Test Doc:
     * - Why: Validates initial state contract (AC-03)
     * - Contract: New instances begin in stopped state
     * - Usage Notes: Constructor does not trigger run
     * - Quality Contribution: Catches initialization bugs
     * - Worked Example: new AgentInstance({...}) -> status === 'stopped', isRunning === false
     */
    expect(instance.status).toBe('stopped');
    expect(instance.isRunning).toBe(false);
  });

  it('transitions stopped -> working -> stopped on successful run', async () => {
    /**
     * Test Doc:
     * - Why: Core lifecycle contract (AC-04)
     * - Contract: run() transitions through working to stopped on success
     * - Usage Notes: Status is working DURING adapter.run(), stopped AFTER
     * - Quality Contribution: Prevents stuck-in-working bugs
     * - Worked Example: adapter returns {status:'completed', sessionId:'ses-1'} -> instance.status === 'stopped', instance.sessionId === 'ses-1'
     */
    adapter.setNextResult({ status: 'completed', output: 'done', sessionId: 'ses-1' });
    await instance.run({ prompt: 'test' });
    expect(instance.status).toBe('stopped');
    expect(instance.sessionId).toBe('ses-1');
  });

  it('throws on double-run (concurrent guard)', async () => {
    /**
     * Test Doc:
     * - Why: Prevents concurrent execution on same instance (AC-05)
     * - Contract: run() while working throws, first run completes normally
     * - Usage Notes: Guard protects against accidental re-entry
     * - Quality Contribution: Prevents race conditions
     * - Worked Example: run() started with delay -> second run() rejects with /already running/i -> first run completes
     */
    adapter.setRunDelay(100);
    adapter.setNextResult({ status: 'completed', output: 'done', sessionId: 'ses-1' });
    const firstRun = instance.run({ prompt: 'test' });
    await expect(instance.run({ prompt: 'test2' })).rejects.toThrow(/already running/i);
    await firstRun;
  });

  it('compact throws if no session', async () => {
    /**
     * Test Doc:
     * - Why: Can't compact what doesn't exist (AC-12b)
     * - Contract: compact() without sessionId throws immediately
     * - Usage Notes: Must run() first to establish a session
     * - Quality Contribution: Catches invalid operation sequence
     * - Worked Example: fresh instance (no run()) -> compact() rejects with /no session/i
     */
    await expect(instance.compact()).rejects.toThrow(/no session/i);
  });
});
```

### Non-Happy-Path Coverage
- [ ] `run()` with adapter throwing (status → error)
- [ ] `compact()` with adapter throwing (status → error)
- [ ] `terminate()` with no sessionId (graceful no-op)
- [ ] Multiple handlers, one throws (others still receive events)
- [ ] `setMetadata()` preserves existing keys
- [ ] `removeEventHandler()` with unregistered handler (no-op)

### Acceptance Criteria
- [ ] All unit tests pass (AC-04 through AC-12d, AC-14 through AC-22)
- [ ] Contract tests pass for both real and fake implementations (AC-26, AC-27, AC-28)
- [ ] Fakes provide test helpers (AC-23, AC-24, AC-25)
- [ ] `just fft` passes (no regressions, AC-47)
- [ ] No mocks used — fakes only

---

## Phase 3: CLI Command Update with TDD

**Objective**: Update `cg agent run` and `cg agent compact` CLI commands to use `AgentManagerService` / `AgentInstance`. Add terminal event handlers and DI wiring.

**Deliverables**:
- Updated `handleAgentRun` using AgentManagerService
- Updated `handleAgentCompact` using AgentManagerService
- Terminal event handler (human-readable, verbose, NDJSON, quiet modes). **Quiet mode**: outputs only the final summary line (human-readable, not JSON). Scripts needing machine-readable output should use `--stream` for NDJSON.
- `--meta` option parser
- DI container updated (AgentManagerService registered, AgentService removed)
- Unit tests for all CLI components

**Dependencies**: Phase 2 (AgentInstance and AgentManagerService must be implemented)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Timeout enforcement gap (Discovery 09) | Medium | Medium | Add optional timeout to AgentRunOptions or wrap in CLI handler |
| Output format change breaks scripts | Low | Low | `--stream` NDJSON output is unchanged; human-readable is new default |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 3.1 | [ ] | Write terminal event handler tests (RED) | 2 | Tests cover: human-readable output format (text_delta, message, tool_call, tool_result, thinking), verbose mode shows thinking/tool results, NDJSON mode outputs raw JSON, quiet mode suppresses events. All fail initially. | - | Per Workshop 01 event handler code |
| 3.2 | [ ] | Implement terminal event handlers (GREEN) | 2 | `createTerminalEventHandler(name, options)` and `ndjsonEventHandler` pass all tests. | - | Per Workshop 01 |
| 3.3 | [ ] | Write parse-meta-options tests (RED) | 1 | Tests cover: `--meta key=value` parsing, multiple metas, invalid format, empty value. | - | |
| 3.4 | [ ] | Implement parse-meta-options (GREEN) | 1 | All tests pass. | - | |
| 3.5 | [ ] | Write CLI agent handler tests (RED) | 2 | Tests cover: handleAgentRun creates via getNew (AC-29), handleAgentRun creates via getWithSessionId when --session (AC-30), handleAgentCompact uses getWithSessionId (AC-34a), event handlers attached based on --stream/--verbose/--quiet (AC-31, AC-32), session ID printed on completion (AC-33), exit codes (AC-34). Uses FakeAgentManagerService. All fail initially. | - | Per AC-29 through AC-34b |
| 3.6 | [ ] | Implement handleAgentRun and handleAgentCompact (GREEN) | 2 | All tests from 3.5 pass. Handlers use AgentManagerService. | - | Per Workshop 01 handler code |
| 3.7 | [ ] | Update DI container | 2 | `CLI_DI_TOKENS.AGENT_MANAGER` registered with AgentManagerService. AgentService no longer registered. Container builds and resolves correctly. | - | Per AC-34b, Workshop 01 DI section |
| 3.8 | [ ] | Update agent.command.ts command registration | 1 | `cg agent run` and `cg agent compact` wired to new handlers. New options (--name, --meta, --verbose, --quiet) registered. | - | Per Workshop 01 command surface |
| 3.9 | [ ] | Verify `just fft` passes | 1 | All existing tests pass. No regressions. | - | AC-47 |

### Test Examples (Write First!)

```typescript
// test/unit/features/034-agentic-cli/terminal-event-handler.test.ts
describe('createTerminalEventHandler', () => {
  it('formats text_delta with name prefix', () => {
    /**
     * Test Doc:
     * - Why: Validates human-readable terminal output (AC-31)
     * - Contract: text_delta events produce "[name] content" format
     * - Usage Notes: Default output mode for cg agent run. Pass output collector via options.
     * - Quality Contribution: Ensures readable CLI experience
     * - Worked Example: text_delta {content:'Hello world'} -> output contains '[test-agent] Hello world'
     */
    const output: string[] = [];
    const collector = (s: string) => { output.push(s); return true; };

    const handler = createTerminalEventHandler('test-agent', { write: collector });
    handler({
      type: 'text_delta',
      timestamp: new Date().toISOString(),
      data: { content: 'Hello world' },
    });

    expect(output.join('')).toContain('[test-agent] Hello world');
  });
});
```

### Acceptance Criteria
- [ ] `cg agent run -t claude-code -p <prompt>` uses AgentManagerService (AC-29)
- [ ] `cg agent run -s <sessionId>` uses getWithSessionId (AC-30)
- [ ] Terminal event output works in all modes (AC-31, AC-32)
- [ ] Session ID printed on completion (AC-33)
- [ ] Exit code 0/1 correct (AC-34)
- [ ] `cg agent compact` uses AgentManagerService (AC-34a, AC-34b)
- [ ] `just fft` passes (AC-47)

---

## Phase 4: Real Agent Integration Tests

**Objective**: Prove the redesigned AgentInstance works with real Claude Code CLI and Copilot SDK. Test session chaining, compaction, event handlers, parallel execution, and cross-adapter parity.

**Deliverables**:
- Tier 2: Real agent integration tests (`test/integration/agent-instance-real.test.ts`)
- Tier 3: CLI E2E tests (`test/e2e/agent-cli-e2e.test.ts`)
- Cross-adapter parity tests
- All wrapped in `describe.skipIf` for CI safety

**Dependencies**: Phase 2 (AgentInstance/AgentManagerService) and Phase 3 (CLI commands)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Real agents are slow (30-120s each) | High | Medium | Minimal prompts, structural assertions, timeout 120s |
| Auth tokens expire during suite | Low | Medium | Independent tests, fresh instances each test |
| Non-deterministic output | High | Low | Structural assertions only (status, sessionId, event counts) |

### Tasks (Full TDD Approach)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 4.1 | [ ] | Write Claude Code integration tests | 2 | Tests: new session (AC-35), session resume (AC-36), multiple handlers (AC-37), parallel agents (AC-38), compact+resume (AC-38a). All wrapped in `describe.skipIf(!hasClaudeCli())`. | - | Per Workshop 01 Tier 2 tests |
| 4.2 | [ ] | Write Copilot SDK integration tests | 2 | Tests: same pattern as 4.1 but with SdkCopilotAdapter (AC-40 through AC-43a). Wrapped in `describe.skipIf(!hasCopilotSdk())`. | - | Per Workshop 01 |
| 4.3 | [ ] | Write cross-adapter parity tests | 2 | Tests: both produce text events (AC-45), both support resume (AC-46), both support compact (AC-46a). Requires both adapters simultaneously. Wrapped in `describe.skipIf(!hasClaudeCli() \|\| !hasCopilotSdk())`. | - | Per AC-45, AC-46, AC-46a |
| 4.4 | [ ] | Write CLI E2E tests | 2 | Tests: new session via CLI, session chaining across invocations, compact via CLI, stream mode NDJSON. All wrapped in `describe.skipIf`. | - | Per Workshop 01 Tier 3 tests |
| 4.5 | [ ] | Run real agent tests manually and verify | 1 | All Tier 2 and Tier 3 tests pass when CLIs are available. Results documented in execution log. | - | Manual verification |
| 4.6 | [ ] | Verify CI skip behavior | 1 | Tests are properly skipped when CLI not available. `just fft` passes with tests skipped (AC-39, AC-44). | - | AC-39, AC-44 |

### Test Examples (Write First!)

```typescript
// test/integration/agent-instance-real.test.ts
describe.skipIf(!hasClaudeCli())(
  'AgentInstance with ClaudeCodeAdapter',
  { timeout: 120_000 },
  () => {
    let manager: AgentManagerService;

    beforeAll(() => {
      const processManager = new UnixProcessManager(new FakeLogger());
      const adapterFactory: AdapterFactory = () =>
        new ClaudeCodeAdapter(processManager, { logger: new FakeLogger() });
      manager = new AgentManagerService(adapterFactory);
    });

    it('creates new session and gets completed status', async () => {
      /**
       * Test Doc:
       * - Why: Proves AgentInstance wrapping real adapter works (AC-35)
       * - Contract: run() with real adapter produces completed status + sessionId
       * - Usage Notes: Requires Claude CLI installed and authenticated
       * - Quality Contribution: Validates real integration, not just fakes
       * - Worked Example: run({prompt:'What is 2+2?'}) -> status==='stopped', sessionId truthy, events.length > 0
       */
      const instance = manager.getNew({
        name: 'test-new', type: 'claude-code', workspace: process.cwd(),
      });
      const events: AgentEvent[] = [];
      instance.addEventHandler((e) => events.push(e));

      await instance.run({ prompt: 'What is 2+2? Reply with just the number.' });

      expect(instance.status).toBe('stopped');
      expect(instance.sessionId).toBeTruthy();
      expect(events.length).toBeGreaterThan(0);
    });
  }
);
```

### Acceptance Criteria
- [ ] Claude Code: new session, resume, handlers, parallel, compact (AC-35 through AC-38a)
- [ ] Copilot SDK: same test suite (AC-40 through AC-43a)
- [ ] Cross-adapter parity validated (AC-45, AC-46, AC-46a)
- [ ] CLI E2E: session chaining, compact, stream mode
- [ ] All tests have `describe.skipIf` for CI safety (AC-39, AC-44)
- [ ] `just fft` passes with real tests skipped (AC-47)

---

## Phase 5: Export Wiring and Documentation

**Objective**: Wire up barrel exports so consumers can import from `@chainglass/shared`, update README and docs/how/ with the new agent system guide.

**Deliverables**:
- Barrel exports from `packages/shared/src/index.ts`
- Old 019 export redirects to 034 (or parallel exports)
- README.md quick-start section for new API
- `docs/how/agent-system/` detailed guide

**Dependencies**: Phases 2-4 (all implementation and tests complete)

**Risks**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Export conflicts with 019 types | Medium | Medium | Use distinct export paths; 019 exports can be deprecated |

### Tasks (Lightweight Approach for Documentation)

| # | Status | Task | CS | Success Criteria | Log | Notes |
|---|--------|------|----|------------------|-----|-------|
| 5.1 | [ ] | Update `packages/shared/src/index.ts` barrel exports | 1 | New types/interfaces importable from `@chainglass/shared`: IAgentInstance, AgentInstance, IAgentManagerService, AgentManagerService, FakeAgentInstance, FakeAgentManagerService, all types | - | Discovery 03 |
| 5.2 | [ ] | Verify old 019 exports don't conflict | 1 | Old 019 barrel re-exports from 034 where type names match. Where types changed shape (IAgentInstance), the old barrel does NOT re-export them — producing TypeScript errors in web consumers (deliberate per spec Q6). CLI and shared compile cleanly. | - | |
| 5.3 | [ ] | Update README.md with quick-start | 2 | README contains code example showing `getNew()` and `getWithSessionId()` usage, lists available CLI commands (`cg agent run`, `cg agent compact`), links to `docs/how/agent-system/` | - | Per Documentation Strategy |
| 5.4 | [ ] | Create `docs/how/agent-system/1-overview.md` | 2 | Contains: text-based status state diagram (stopped/working/error), lists all IAgentInstance methods with one-line descriptions, explains event pass-through pattern vs old event storage | - | Per Documentation Strategy |
| 5.5 | [ ] | Create `docs/how/agent-system/2-usage.md` | 2 | Contains: event handler registration code example, session chaining code example (run → get sessionId → getWithSessionId → run again), testing patterns showing FakeAgentInstance/FakeAgentManagerService usage | - | Per Documentation Strategy |
| 5.6 | [ ] | Final regression check: `just fft` | 1 | All tests pass. No compile errors in packages/shared, apps/cli. Web errors are expected and deliberate. | - | AC-47, AC-50 |

### Acceptance Criteria
- [ ] All new types importable from `@chainglass/shared` (AC-47)
- [ ] README updated with quick-start
- [ ] docs/how/agent-system/ guides created
- [ ] `just fft` passes (final regression, AC-47)
- [ ] Existing Plan 030 E2E tests pass (AC-50)
- [ ] AgentService unchanged as module (AC-49)
- [ ] IAgentAdapter unchanged (AC-48)

---

## Cross-Cutting Concerns

### Security Considerations

- No new external API surfaces (CLI-only changes)
- Session IDs from adapters are opaque strings — no user input validation needed
- `--prompt-file` path validation preserved (existing `pathResolver.resolvePath()`)
- `--meta` values are treated as opaque (stored in metadata bag, not executed)

### Observability

- Event pass-through enables any consumer to observe agent behavior
- Terminal event handler provides human-readable agent activity
- Token metrics captured in metadata after `compact()` (AC-12d)
- `updatedAt` timestamp tracks last state change

### Error Handling

- Double-run guard throws immediately (AC-05, AC-12c)
- Compact without session throws immediately (AC-12b)
- Adapter failures transition to `error` status
- `terminate()` always transitions to `stopped` regardless of adapter errors
- CLI outputs `AgentResult` with `status='failed'` and exit code 1 on errors

### Documentation

Per Documentation Strategy (Hybrid):
- **README.md**: Quick-start for `getNew()` / `getWithSessionId()` API
- **docs/how/agent-system/**: Detailed lifecycle guide, event patterns, testing patterns
- **Target audience**: Developers building on the agent system (web UI reconnection, workflow integration)

---

## Complexity Tracking

| Component | CS | Label | Breakdown (S,I,D,N,F,T) | Justification | Mitigation |
|-----------|-----|-------|------------------------|---------------|------------|
| AgentInstance redesign | 3 | Medium | S=1,I=0,D=0,N=0,F=0,T=2 | Multiple consumers, breaking interface, contract tests needed | Interface-first development, comprehensive contract tests |
| AgentManagerService | 3 | Medium | S=1,I=0,D=0,N=1,F=0,T=1 | Session index with same-instance guarantee is novel pattern | Workshop 02 walk-throughs, focused unit tests |
| CLI command update | 2 | Small | S=1,I=0,D=0,N=0,F=0,T=1 | DI wiring change, handler refactor | Existing command structure preserved |
| Real agent tests | 2 | Small | S=0,I=1,D=0,N=0,F=0,T=1 | Two external adapters, non-deterministic | skipIf guards, structural assertions |
| Overall plan | 3 | Medium | S=2,I=1,D=0,N=0,F=0,T=2 | Cross-cutting shared+CLI changes, real agent testing | Phased approach, comprehensive workshops |

---

## Progress Tracking

### Phase Completion Checklist

- [ ] Phase 1: Types, Interfaces, and PlanPak Setup
- [ ] Phase 2: Core Implementation with TDD
- [ ] Phase 3: CLI Command Update with TDD
- [ ] Phase 4: Real Agent Integration Tests
- [ ] Phase 5: Export Wiring and Documentation

### STOP Rule

**IMPORTANT**: This plan must be complete before creating tasks. After writing this plan:
1. Run `/plan-4-complete-the-plan` to validate readiness
2. Only proceed to `/plan-5-phase-tasks-and-brief` after validation passes

---

## Deviation Ledger

This plan follows constitution principles P1-P5 and ADR constraints throughout, with one deliberate deviation:

| Principle / Rule | Why Needed | Simpler Alternative Rejected | Risk Mitigation |
|-----------------|------------|------------------------------|-----------------|
| R-ARCH-002: Interfaces in `interfaces/`, fakes in `fakes/` | PlanPak groups all plan-scoped files in `features/034-agentic-cli/` for co-location and traceability. Plan 019 already established this pattern for agent files. | Splitting interfaces/fakes/implementations across 4+ directories loses co-location benefit and makes plan provenance harder to trace. | Barrel exports from feature folder; `@chainglass/shared` re-exports in Phase 5. Consumers import from package barrel, not feature paths. |
| R-TEST-006: Unit tests in `test/unit/[package]/`, contracts in `test/contracts/` | PlanPak keeps test files co-located with the plan that created them in `test/unit/features/034-agentic-cli/`. Contract tests live alongside unit tests for discoverability. | Scattering tests across `test/unit/shared/`, `test/unit/cli/`, and `test/contracts/` disconnects them from the feature they validate. | All tests run via `just fft` regardless of location. CI configuration unchanged. Contract tests clearly named `*-contract.test.ts`. |

**Constitution compliance** (no deviations):
- **P1**: Clean Architecture — interfaces in shared, implementations behind interfaces
- **P2**: Interface-First — Phase 1 defines interfaces before any implementation
- **P3**: TDD — RED-GREEN-REFACTOR throughout Phases 2-4
- **P4**: Fakes Over Mocks — FakeAgentInstance, FakeAgentManagerService, FakeAgentAdapter
- **P5**: Fast Feedback — `just fft` runs all unit tests in < 5 seconds

### ADR Ledger

| ADR | Status | Affects Phases | Notes |
|-----|--------|----------------|-------|
| ADR-0004 (DI Container Architecture) | Active | Phase 3 | CLI container wiring follows DI pattern. Registration respects IMP-002 bootstrap sequence (config pre-loaded). No direct instantiation in handlers (Decision 7). |
| ADR-0006 (CLI-Based Workflow Agent Orchestration) | Active | All | Plan 034 is Phase A of this ADR's vision |
| ADR-0009 (Module Registration Function Pattern) | Active | Phase 3 | Container registration follows module pattern |
| ADR-0010 (Central Domain Event Notification) | Active | Phase 2 | AgentInstance no longer depends on IAgentNotifierService. Web reconnection plan must re-integrate via central event system per ADR-0010 pattern. |
| ADR-0011 (First-Class Domain Concepts) | Active | Phase 1, 2 | AgentInstance and AgentManagerService follow interface-first service pattern per ADR-0011 signals (shared state, multiple callers, domain name, crosses files). |

---

## Change Footnotes Ledger

[^1]: [To be added during implementation via plan-6a]
[^2]: [To be added during implementation via plan-6a]
[^3]: [To be added during implementation via plan-6a]
[^4]: [To be added during implementation via plan-6a]
[^5]: [To be added during implementation via plan-6a]
