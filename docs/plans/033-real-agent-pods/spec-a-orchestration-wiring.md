# Spec A: Orchestration Wiring — ODS and AgentPod Integration

**Mode**: Full
**File Management**: PlanPak
**Parent Spec**: [real-agent-pods-spec.md](real-agent-pods-spec.md)

## Research Context

- **Workshop 02**: [Unified AgentInstance / AgentManagerService Design](workshops/02-unified-agent-design.md) — Complete design: AgentPod wraps IAgentInstance, ODS uses AgentManagerService, PodCreateParams, session lifecycle
- **Workshop 06**: [Plan 030 E2E Upgrade Strategy](workshops/06-plan-030-e2e-upgrade-strategy.md) — Exact diff, verification strategy, change order
- **035 Workshop 01**: [E2E Wiring with Real Agents](../035-agent-orchestration-wiring/workshops/01-e2e-wiring-with-real-agents.md) — Real adapter integration tests for both Claude Code and Copilot SDK
- **Plan 034**: [Agentic CLI](../034-agentic-cli/agentic-cli-plan.md) — **COMPLETE**. Delivered: AgentInstance, AgentManagerService, FakeAgentInstance, FakeAgentManagerService

### What Plan 034 Already Delivered

| Component | Status | Reference |
|-----------|--------|-----------|
| `IAgentInstance` (3-state, event pass-through, metadata) | ✅ Delivered | `packages/shared/src/features/034-agentic-cli/` |
| `AgentManagerService` (getNew/getWithSessionId, session index) | ✅ Delivered | Same |
| `FakeAgentInstance` + `FakeAgentManagerService` | ✅ Delivered | Same `/fakes/` |

## Summary

Rewire the orchestration system (ODS, AgentPod, PodManager) to use Plan 034's `AgentManagerService` and `IAgentInstance` instead of raw `IAgentAdapter`. This is a pure refactoring spec — no new user-facing features, no new CLI commands, no prompts, no real agents. All existing tests are updated for the new interfaces and continue to pass with identical behavior.

The end result: ODS creates agents through `AgentManagerService.getNew()` and `.getWithSessionId()` based on `AgentContextService` outcomes, AgentPod wraps `IAgentInstance` for lifecycle tracking, and the Plan 030 E2E script works unchanged with the new wiring.

## Goals

- **ODS uses AgentManagerService**: Replace the raw `IAgentAdapter` dependency with `IAgentManagerService`, mapping `AgentContextService` outcomes (new/inherit) to `getNew()`/`getWithSessionId()`
- **AgentPod wraps IAgentInstance**: Replace raw adapter with instance wrapper, gaining lifecycle tracking, event pass-through, and session management
- **Graph-level agent type setting**: `GraphOrchestratorSettingsSchema` gets an optional `agentType` field
- **DI container aligned**: Single `AgentManagerService` instance shared between CLI and orchestration tokens
- **Existing tests updated**: All orchestration unit tests (ODS, pod, pod-manager) and the Plan 030 E2E script updated for new interfaces, same behavior
- **Zero behavior change**: This is internal refactoring — the orchestration loop works identically before and after

## Testing Strategy

- **Approach**: Full TDD
- **Rationale**: Cross-cutting interface changes require comprehensive test coverage to catch regressions. Every AC is testable with existing fake infrastructure plus new real agent wiring tests.
- **Focus Areas**: ODS agent creation paths (getNew/getWithSessionId), AgentPod delegation, PodCreateParams shape, DI token resolution, session inheritance chain, real adapter wiring with both Claude Code and Copilot
- **Excluded**: Prompt content testing (Spec B), full pipeline E2E with WF protocol (Spec C), web UI
- **Mock Usage**: Fakes only, no mocks (project convention). `FakeAgentManagerService`, `FakeAgentInstance`, `FakeAgentAdapter` for unit tests. Real `AgentManagerService` + real adapters for wiring integration tests.

## Documentation Strategy

- **Location**: No new documentation
- **Rationale**: Internal refactoring. Existing agent system docs (`docs/how/agent-system/`) are sufficient. ODS/AgentPod internals don't need user-facing docs.

## Non-Goals

- Prompts (starter or resume) — that's Spec B
- `cg wf run` CLI command — that's Spec B
- PodManager execution tracking (trackExecution, waitForAnyCompletion) — that's Spec B
- Full pipeline E2E with WF protocol — that's Spec C
- Terminal event output — that's Spec B
- Web UI integration
- New documentation

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=2, I=1, D=0, N=0, F=0, T=1
  - **S=2**: Cross-cutting interface changes across ODS, AgentPod, PodManager, PodCreateParams, DI container, and ~10 test files
  - **I=1**: Depends on Plan 034 (stable, delivered) and Plan 030 (stable)
  - **T=1**: Mechanical test updates — same assertions, new wiring
- **Confidence**: 0.95 — Workshop 06 scoped this to ~97 lines across 11 files. No unknowns.
- **Dependencies**: Plan 034 (COMPLETE), Plan 030 orchestration (stable)
- **Risks**: Breaking interface change cascades through tests; mitigated by doing all test updates in one pass

## Acceptance Criteria

### ODS Integration

1. **AC-01**: ODS depends on `IAgentManagerService` instead of `IAgentAdapter`. The `ODSDependencies` interface has an `agentManager` field replacing `agentAdapter`.
2. **AC-02**: ODS creates agents via `agentManager.getNew(params)` when `AgentContextService` returns `{ source: 'new' }`.
3. **AC-03**: ODS creates agents via `agentManager.getWithSessionId(sessionId, params)` when `AgentContextService` returns `{ source: 'inherit', fromNodeId }` and a session exists for the source node.
4. **AC-04**: ODS falls back to `agentManager.getNew(params)` when inheriting but the source node has no session (never ran or failed before session creation).
5. **AC-11**: ODS resolves agent type from `reality.settings.agentType` falling back to `'copilot'`.

### AgentPod

6. **AC-05**: AgentPod wraps `IAgentInstance` instead of `IAgentAdapter`. The constructor accepts `(nodeId, agentInstance, unitSlug)`.
7. **AC-06**: AgentPod reads `sessionId` from its `IAgentInstance` (no internal `_sessionId` tracking).
8. **AC-07**: AgentPod delegates `run()` to `agentInstance.run()` and `terminate()` to `agentInstance.terminate()`.

### Types and DI

9. **AC-08**: `PodCreateParams` agent variant has `agentInstance: IAgentInstance` instead of `adapter: IAgentAdapter`.
10. **AC-09**: `PodExecuteOptions.contextSessionId` is removed — session is baked into the `IAgentInstance` at creation.
11. **AC-10**: `GraphOrchestratorSettingsSchema` includes an optional `agentType` field (`'claude-code' | 'copilot'`), defaulting to `'copilot'` when not specified.
12. **AC-12**: DI container has an `ORCHESTRATION_DI_TOKENS.AGENT_MANAGER` token. The CLI container registers the SAME `AgentManagerService` instance for both `CLI_DI_TOKENS.AGENT_MANAGER` and `ORCHESTRATION_DI_TOKENS.AGENT_MANAGER`.

### Test Updates

13. **AC-31**: Plan 030's orchestration E2E script (`positional-graph-orchestration-e2e.ts`) uses `FakeAgentManagerService` instead of `FakeAgentAdapter` in its orchestration stack.
14. **AC-32**: Plan 030's E2E test behavior is unchanged after the wiring update — same assertions, same deterministic flow.
15. **AC-33**: All existing orchestration unit tests (ODS, pod, pod-manager) are updated for the new interfaces and pass.
16. **AC-40**: All existing tests continue to pass (3858+ tests) after the changes.

### Real Agent Wiring Tests

17. **AC-50**: A real agent wiring integration test exists at `test/integration/orchestration-wiring-real.test.ts` that constructs a real orchestration stack (real `AgentManagerService` + real `AdapterFactory`) with both Claude Code and Copilot SDK adapters.
18. **AC-51**: Single-node wiring test: ODS creates an instance via `getNew()`, pod executes with real adapter, agent process spawns, pod acquires a sessionId after completion. Tested for both Claude Code and Copilot.
19. **AC-52**: Session inheritance wiring test: node-b inherits node-a's session via `getWithSessionId()`, real adapter resumes from the inherited session, resulting sessionId differs from source (fork happened). Tested for both adapters.
20. **AC-53**: Event pass-through wiring test: events from the real adapter flow through `IAgentInstance` handlers to a test collector — proving the ODS → pod → instance → adapter → handler chain is intact. Tested for both adapters.
21. **AC-54**: Cross-adapter parity test: both Claude Code and Copilot produce a sessionId and emit text events through the same ODS → pod wiring chain.
22. **AC-55**: All real agent wiring tests use `describe.skip` (not `describe.skipIf`) — documentation/validation tests that are manually unskipped.

## Open Questions

None — all design questions resolved in Workshop 02 and Workshop 06.

## Prior Art

- **Workshop 02**: Complete ODS/AgentPod/PodManager redesign with code examples
- **Workshop 06**: Exact diff (4 lines in E2E), verification strategy, change order
- **035 Workshop 01**: Real adapter wiring tests — construction patterns, skip logic, polling strategy, manual node completion
- **Plan 030 E2E**: `test/e2e/positional-graph-orchestration-e2e.ts` (1128 lines)
- **Plan 034 Real Agent Tests**: `test/integration/agent-instance-real.test.ts` (13 tests) — pattern for real adapter testing

## Clarifications

### Session 2026-02-17

| # | Question | Answer | Spec Update |
|---|----------|--------|-------------|
| Q1 | Workflow mode? | **Full** — CS-3, cross-cutting interface changes, multiple phases | Header already set |
| Q2 | Testing approach? | **Full TDD** — comprehensive coverage for breaking interface change | Added Testing Strategy section |
| Q3 | File management? | **PlanPak** — feature-grouped code | Header already set |
| Q4 | Real agent wiring tests in Spec A? | **Yes** — include in this spec, prove wiring works with both Claude Code and Copilot | Added AC-50 through AC-55; updated non-goals |
| Q5 | Mock/fake policy? | **Fakes only, no mocks** — project convention | Added to Testing Strategy |
| Q6 | Documentation strategy? | **No new docs** — internal refactoring, existing agent system docs sufficient | Added Documentation Strategy section |

**Coverage**: Resolved 6/6 — no outstanding ambiguities. Ready for /plan-3-architect.
