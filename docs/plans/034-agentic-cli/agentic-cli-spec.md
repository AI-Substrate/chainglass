# Agentic CLI: Agent System Redesign and Real Agent Validation

**Mode**: Full
**File Management**: PlanPak

## Research Context

This plan builds on extensive research and workshopping from Plan 033 (Real Agent Pods):

- **Workshop 02**: [Unified AgentInstance / AgentManagerService Design](../033-real-agent-pods/workshops/02-unified-agent-design.md) — Complete redesign of IAgentInstance, IAgentManagerService, session index, same-instance guarantee, event pass-through
- **Workshop 03**: [CLI-First Real Agent Execution](../033-real-agent-pods/workshops/03-cli-first-real-agents.md) — CLI command surface, terminal event output, build order (Phase A = agent system, Phase B = WF integration)
- **Research Dossier**: [Real Agent Pods Research](../033-real-agent-pods/research-dossier.md) — 75+ findings, 15 prior learnings, critical discoveries about disconnected agent systems
- **Components affected**: `IAgentInstance`, `AgentInstance`, `IAgentManagerService`, `AgentManagerService`, fakes, contract tests, CLI agent commands
- **Critical dependencies**: `IAgentAdapter` (unchanged), `ClaudeCodeAdapter`, `SdkCopilotAdapter`, DI container wiring
- **Modification risks**: Breaking interface change to IAgentInstance; all consumers (contract tests, integration tests, web hooks, CLI) need updating

## Summary

Redesign the AgentInstance and AgentManagerService to be domain-agnostic agent wrappers with event pass-through, freeform metadata, and a same-instance guarantee for session-based lookups. Validate the redesign with comprehensive unit tests, contract tests, and real agent integration tests against both Claude Code CLI and GitHub Copilot SDK — proving session chaining, event capture, parallel execution, and adapter parity before the workflow system (Plan 033) integrates these components.

This is "Phase A" from Workshop 03's build order: the agent system in isolation, no workflow dependency.

## Goals

- Deliver a redesigned `IAgentInstance` that is domain-agnostic (no workflow, graph, web, or SSE knowledge) with event pass-through handlers, freeform metadata bag, and a 3-state status model
- Deliver a redesigned `IAgentManagerService` with `getNew()` and `getWithSessionId()` API, same-instance guarantee for session-based lookups, and session index
- Deliver matching fakes (`FakeAgentInstance`, `FakeAgentManagerService`) with test helpers
- Prove the redesign works with comprehensive unit tests (fast, no real agents)
- Prove contract parity between fakes and real implementations
- Prove real agent behavior with both Claude Code CLI and Copilot SDK:
  - Session creation and resumption (multi-turn chaining)
  - Session compaction and continuity after compact
  - Event capture across multiple registered handlers
  - Parallel agent sessions (independent, concurrent)
  - Same-instance guarantee across repeated `getWithSessionId` calls
- Update both `cg agent run` and `cg agent compact` CLI commands to use `AgentManagerService` / `AgentInstance` — all operations through a single cohesive path
- Keep existing `AgentService` module untouched (but CLI no longer registers it — all commands route through AgentManagerService)
- Not break the existing Plan 030 E2E tests (they will continue using `FakeAgentAdapter` directly until Plan 033 rewires them)

## Non-Goals

- Workflow integration (AgentPod, ODS, PodManager changes) — deferred to Plan 033
- Web UI updates (hooks, SSE broadcasting, agent dashboard) — separate plan
- `cg wf run` command — Plan 033
- Node starter/resume prompt templates — Plan 033
- Execution Promise tracking on PodManager — Plan 033
- TUI or interactive terminal — not planned
- Copilot as orchestration agent type (Plan 033 graph settings)
- Agent persistence/hydration from storage — consumer concern, not on AgentInstance

## Complexity

- **Score**: CS-3 (medium)
- **Breakdown**: S=2, I=1, D=0, N=0, F=0, T=2
  - S=2: Cross-cutting change — shared package interfaces, fakes, CLI commands, contract tests, integration tests, DI containers
  - I=1: Two external agents (Claude CLI, Copilot SDK) with auth requirements
  - D=0: No schema/migration changes
  - N=0: Well-specified via Workshop 02 — all interfaces, implementations, and walk-throughs designed
  - F=0: Standard testing patterns
  - T=2: Real agent integration tests requiring auth, multi-turn sessions, parallel execution
- **Confidence**: 0.90
- **Assumptions**:
  - Claude Code CLI is installed and authenticated in dev environment
  - Copilot SDK is available and authenticated
  - Workshop 02 design is approved as the implementation target
  - IAgentAdapter interface remains unchanged
- **Dependencies**: None external; both adapters already implemented and tested at adapter level
- **Risks**: Real agent tests are slow (30-120s each) and non-deterministic; need structural assertions not content assertions
- **Phases**:
  1. Interface redesign (IAgentInstance, IAgentManagerService, types)
  2. Implementation (AgentInstance, AgentManagerService, fakes)
  3. Contract and unit tests
  4. CLI command update (`cg agent run`)
  5. Real agent integration tests (both adapters)

## Acceptance Criteria

### AgentInstance Redesign

- AC-01: `IAgentInstance` exposes: `id`, `name`, `type`, `workspace`, `status`, `isRunning`, `sessionId`, `createdAt`, `updatedAt`, `metadata`, `setMetadata()`, `addEventHandler()`, `removeEventHandler()`, `run()`, `compact()`, `terminate()`
- AC-02: `IAgentInstance` does NOT expose: `getEvents()`, `setIntent()`, notifier dependency, storage dependency
- AC-03: Status model has exactly 3 states: `working`, `stopped`, `error`
- AC-04: `run()` transitions status `stopped → working → stopped|error` and updates `sessionId` from adapter result
- AC-05: `run()` throws if called while `status === 'working'` (double-run guard)
- AC-06: `addEventHandler()` registers a handler that receives all adapter events during `run()`
- AC-07: Multiple handlers registered via `addEventHandler()` all receive the same events
- AC-08: `removeEventHandler()` stops event delivery to that handler
- AC-09: Per-run `onEvent` option in `AgentRunOptions` receives events in addition to registered handlers
- AC-10: `metadata` is `Readonly<Record<string, unknown>>`, settable at creation and updatable via `setMetadata(key, value)`
- AC-11: `isRunning` returns `true` iff `status === 'working'`
- AC-12: `terminate()` delegates to adapter and transitions status to `stopped`
- AC-12a: `compact()` delegates to `adapter.compact(sessionId)` and transitions `stopped → working → stopped|error`
- AC-12b: `compact()` throws if `sessionId` is null (no session to compact)
- AC-12c: `compact()` throws if `status === 'working'` (same double-invocation guard as `run()`)
- AC-12d: `compact()` updates token metrics in metadata if adapter returns them
- AC-13: `AgentInstanceConfig` accepts optional `sessionId` and `metadata`

### AgentManagerService Redesign

- AC-14: `getNew(params)` creates a fresh instance with `sessionId === null`
- AC-15: `getWithSessionId(sessionId, params)` creates an instance with sessionId pre-set
- AC-16: `getWithSessionId(sessionId, params)` called twice with the same sessionId returns the **same object** (same-instance guarantee, `===` equality)
- AC-17: `getWithSessionId(sessionId, params)` with a different sessionId returns a different object
- AC-18: `getAgent(id)` returns the instance or `null`
- AC-19: `getAgents(filter?)` returns filtered list
- AC-20: `terminateAgent(id)` terminates, removes from both agents map and session index
- AC-21: Constructor accepts only `AdapterFactory` (no notifier, no storage)
- AC-22: Session index is updated when an instance created via `getNew()` acquires a sessionId after `run()`

### Fakes

- AC-23: `FakeAgentInstance` implements `IAgentInstance` with the same contract as `AgentInstance`
- AC-24: `FakeAgentManagerService` implements `IAgentManagerService` with same-instance guarantee
- AC-25: Both fakes provide test helpers (`setStatus()`, `assertRunCalled()`, `reset()`, etc.)

### Contract Test Parity

- AC-26: A shared contract test suite runs against both `AgentInstance` (with `FakeAgentAdapter`) and `FakeAgentInstance`
- AC-27: A shared contract test suite runs against both `AgentManagerService` and `FakeAgentManagerService`
- AC-28: Contract tests cover: status transitions, double-run guard, compact guard, session tracking, metadata, event pass-through, same-instance guarantee

### CLI Command Update

- AC-29: `cg agent run -t claude-code -p <prompt>` creates an instance via `agentManager.getNew()` and runs it
- AC-30: `cg agent run -t claude-code -s <sessionId> -p <prompt>` creates via `agentManager.getWithSessionId()` and runs it
- AC-31: Event output appears on terminal (default human-readable mode with `[name]` prefix)
- AC-32: `--stream` flag outputs NDJSON events
- AC-33: Session ID is printed on completion for chaining
- AC-34: Exit code 0 for completed, 1 for failed
- AC-34a: `cg agent compact -t claude-code -s <sessionId>` creates via `agentManager.getWithSessionId()` and calls `instance.compact()`
- AC-34b: `cg agent compact` uses AgentManagerService (not AgentService) — same cohesive path as `run`

### Real Agent Integration Tests (Claude Code)

- AC-35: Test creates a new AgentInstance with `ClaudeCodeAdapter`, runs a simple prompt, gets `status === 'completed'` and a non-null `sessionId`
- AC-36: Test resumes the session (via `getWithSessionId` → `run()`) and the agent demonstrates context retention (mentions prior conversation)
- AC-37: Test registers two event handlers; both receive the same events during `run()` (event count matches, events are identical objects)
- AC-38: Test runs two independent instances in parallel; both complete with different sessionIds
- AC-38a: Test compacts a session via `instance.compact()`, then resumes — session continuity preserved
- AC-39: Tests are wrapped in `describe.skipIf(!hasClaudeCli())` for CI safety

### Real Agent Integration Tests (Copilot SDK)

- AC-40: Same as AC-35 but with `SdkCopilotAdapter`
- AC-41: Same as AC-36 but with `SdkCopilotAdapter`
- AC-42: Same as AC-37 but with `SdkCopilotAdapter`
- AC-43: Same as AC-38 but with `SdkCopilotAdapter`
- AC-43a: Same as AC-38a but with `SdkCopilotAdapter`
- AC-44: Tests are wrapped in `describe.skipIf(!hasCopilotSdk())` for CI safety

### Cross-Adapter Parity

- AC-45: Both adapters produce the same event type set (at minimum: `text_delta`, `message`) when given the same simple prompt
- AC-46: Both adapters support session resumption — second run with returned sessionId yields `status === 'completed'`
- AC-46a: Both adapters support compact — `instance.compact()` completes and session remains usable afterward

### Regression Safety

- AC-47: All existing tests pass (`just fft` green) after the redesign
- AC-48: Existing `IAgentAdapter` interface and its implementations are unchanged
- AC-49: Existing `AgentService` (thin timeout wrapper) is unchanged as a module (CLI no longer registers it — all commands use AgentManagerService)
- AC-50: Existing Plan 030 E2E tests continue to pass (they use `FakeAgentAdapter` directly, not AgentManagerService)

## Risks & Assumptions

| Risk | Mitigation |
|------|-----------|
| Real agent tests are slow (30-120s each) | Use `describe.skipIf` for CI; keep prompts minimal ("say hello", "what is 2+2") |
| Non-deterministic LLM output | Assert structural properties (non-empty output, correct types, event counts) not content |
| Auth tokens may expire during test suite | Tests are independent; each creates fresh instances |
| Copilot SDK session handling differs from Claude | Test both independently; contract tests ensure API parity |
| Breaking interface change on IAgentInstance | Comprehensive contract tests ensure fake↔real parity; update all consumers in one pass |
| Existing web UI depends on old AgentInstance | **Deliberate breakage** (Q6). TypeScript errors flag all broken consumers. Web reconnection is a future plan. |

## Open Questions

- **OQ-01**: Should `AgentInstance.run()` update the session index on `AgentManagerService` automatically, or should the service poll? Workshop 02 suggests lazy update via event handler — implementation detail to resolve during build.
- **OQ-02**: Should `FakeAgentInstance.run()` simulate the `working → stopped` delay, or transition synchronously? Current fake transitions synchronously with configurable `runDuration`.
- **OQ-03**: ~~The existing `test/integration/real-agent-multi-turn.test.ts` tests adapter-level multi-turn. Should we keep those as-is and add new instance-level tests, or refactor them to use AgentInstance?~~ **RESOLVED**: Keep both. Old adapter-level tests stay as-is (test IAgentAdapter contract). New instance-level tests cover AgentInstance wrapping real adapters. Two layers of validation.

## ADR Seeds (Optional)

### ADR: AgentInstance as Domain-Agnostic Wrapper

- **Decision Drivers**: Multiple consumers (web UI, orchestration, CLI) with different lifecycle needs; current AgentInstance is tightly coupled to web concerns (SSE notifier, event storage, persistence)
- **Candidate Alternatives**:
  - A: Redesign AgentInstance to be domain-agnostic (Workshop 02 approach) — remove notifier/storage/events, add metadata/handlers
  - B: Create a separate OrchestratorAgentInstance for pods — duplicates core logic
  - C: Have AgentPod use IAgentAdapter directly — loses lifecycle tracking and same-instance guarantee
- **Stakeholders**: Plan 033 (orchestration), Plan 019 (web UI, future reconnection)

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Unified Agent Design | Integration Pattern | Already completed | See Workshop 02 |
| CLI-First Real Agents | CLI Flow | Already completed | See Workshop 03 |

Both workshop opportunities identified for this feature space have already been completed as part of Plan 033 preparation. No additional workshops are needed — the designs are ready for implementation.

## Testing Strategy

- **Approach**: Full TDD
- **Rationale**: Core agent infrastructure with breaking interface changes; comprehensive tests needed to ensure contract parity between fakes and real implementations, and to validate real agent behavior across two adapters
- **Focus Areas**:
  - Contract test parity (FakeAgentInstance ↔ AgentInstance, FakeAgentManagerService ↔ AgentManagerService)
  - Same-instance guarantee (repeated getWithSessionId calls)
  - Event pass-through (multiple handlers, removal, per-run handler)
  - Real agent session chaining (both Claude Code and Copilot SDK)
  - Parallel agent execution
  - Status transition correctness
- **Excluded**: Web UI reconnection tests (separate plan); adapter internals (already tested)
- **Mock Usage**: Fakes only (FakeAgentAdapter, FakeAgentInstance, FakeAgentManagerService) — no vi.fn/jest.fn mocking of internals. Real agent integration tests run against actual Claude Code CLI and Copilot SDK (skipped in CI, manual opt-in).
- **Existing Adapter Tests**: Keep existing `real-agent-multi-turn.test.ts` and `sdk-copilot-adapter.test.ts` as-is (they test IAgentAdapter contract). New tests cover the AgentInstance layer wrapping real adapters. Two layers of validation.

## Documentation Strategy

- **Location**: Hybrid (README + docs/how/)
- **Rationale**: Agent system redesign is significant enough to warrant a developer guide; README gets a quick-start section
- **Content Split**:
  - README: Quick-start for the new `getNew()` / `getWithSessionId()` API, link to detailed guide
  - docs/how/: Detailed agent system guide — AgentInstance lifecycle, event handler patterns, session chaining, same-instance guarantee, testing patterns
- **Target Audience**: Developers building on the agent system (web UI reconnection, workflow integration, new consumers)
- **Maintenance**: Update when AgentInstance interface changes or new consumer patterns emerge

## Clarifications

### Session 2026-02-16

**Q1: Workflow Mode** — Full
Rationale: CS-3 with multiple phases, cross-cutting changes, real agent integration tests requiring gates.

**Q2: Testing Strategy** — Full TDD
Rationale: Breaking interface redesign with contract parity requirements and real agent validation across two adapter types.

**Q3: Mock Usage** — Fakes only
Rationale: Use established fake pattern (FakeAgentAdapter, FakeAgentInstance, FakeAgentManagerService). No vi.fn mocking. Real agent integration tests (skipped in CI) run against actual Claude Code CLI and Copilot SDK.

**Q4: File Management** — PlanPak
Rationale: New code in `features/034-agentic-cli/`. Old Plan 019 files stay but exports redirect to new location. Clean provenance.

**Q5: Documentation** — Hybrid (README + docs/how/)
Rationale: Agent system redesign is significant enough for a developer guide. README gets quick-start; docs/how/ gets detailed patterns.

**Q6: Web UI Breakage** — Let them break
Rationale: TypeScript errors will flag all breakage in web hooks/components that depend on old IAgentInstance (getEvents, setIntent, notifier). Web reconnection is a future plan. Leave compile errors for that plan to fix.

**Q7: Existing Adapter Tests** — Keep both layers
Rationale: Old real-agent-multi-turn.test.ts stays as-is (tests IAgentAdapter). New instance-level tests cover AgentInstance wrapping real adapters. Two validation layers.

**Q8: Code Location** — New 034 PlanPak folder
Rationale: `features/034-agentic-cli/` with new files. Old 019 files stay but exports redirect. Clean plan provenance.

## References

- [Workshop 02: Unified AgentInstance / AgentManagerService Design](../033-real-agent-pods/workshops/02-unified-agent-design.md)
- [Workshop 03: CLI-First Real Agent Execution](../033-real-agent-pods/workshops/03-cli-first-real-agents.md)
- [Workshop 01: Agent Service for Pods](../033-real-agent-pods/workshops/01-agent-service-for-pods.md) (superseded by Workshop 02)
- [Research Dossier: Real Agent Pods](../033-real-agent-pods/research-dossier.md)
- [Plan 030 Workshop 03: AgentContextService](../030-positional-orchestrator/workshops/03-agent-context-service.md)
- [Plan 030 Workshop 13: Phase 8 E2E Design](../030-positional-orchestrator/workshops/13-phase-8-e2e-design.md)
- Existing real agent tests: `test/integration/real-agent-multi-turn.test.ts`, `test/integration/sdk-copilot-adapter.test.ts`
