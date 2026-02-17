# Real Agent Pods: WF Integration (Parent Spec)

**Mode**: Full
**File Management**: PlanPak
**Status**: Split into three sub-specs for independent planning and execution

📚 This specification incorporates findings from `research-dossier.md` and six workshops.

## Sub-Specs

This parent spec has been split into three independent, sequentially-dependent specs:

| Spec | Scope | ACs | Depends On |
|------|-------|-----|------------|
| **[Spec A: Orchestration Wiring](spec-a-orchestration-wiring.md)** | ODS → AgentManagerService, AgentPod → IAgentInstance, test updates | 16 | Plan 034 |
| **[Spec B: Prompts and CLI Driver](spec-b-prompts-and-cli-driver.md)** | Starter/resume prompts, `cg wf run`, PodManager execution tracking | 21 | Spec A |
| **[Spec C: Real Agent E2E Tests](spec-c-real-agent-e2e-tests.md)** | Real Claude Code agent tests, session inheritance, parallel execution | 7 | Specs A + B |

Each spec can be planned and implemented independently. The remainder of this file preserves the original unified context (research, goals, non-goals, risks, workshops) that all three specs share.

## Research Context

This plan builds on extensive research and workshopping, plus the completed Plan 034 (Agentic CLI):

- **Research Dossier**: [Real Agent Pods Research](research-dossier.md) — 75+ findings across 7 subagents, 15 prior learnings, 6 critical discoveries
- **Workshop 01**: [Agent Service for Pods](workshops/01-agent-service-for-pods.md) — Superseded exploration of adapter statelessness and session-type binding
- **Workshop 02**: [Unified AgentInstance / AgentManagerService Design](workshops/02-unified-agent-design.md) — Complete design for ODS integration: AgentPod wraps IAgentInstance, ODS uses AgentManagerService, PodCreateParams change, session lifecycle walk-throughs
- **Workshop 03**: [CLI-First Real Agent Execution](workshops/03-cli-first-real-agents.md) — Phase A/B build order, `cg wf run` driver loop, node-starter-prompt template, resume prompt, PodManager execution tracking, three E2E test layers
- **Plan 034**: [Agentic CLI](../034-agentic-cli/agentic-cli-plan.md) — **Phase A COMPLETE** (37 tasks, 141 tests). Delivered: redesigned AgentInstance, AgentManagerService, fakes, CLI commands, real agent tests, documentation
- **034 Workshop 01**: [CLI Agent Run and E2E Testing](../034-agentic-cli/workshops/01-cli-agent-run-and-e2e-testing.md) — Agent system CLI surface, compact(), test tiers

### Key Research Findings

- **Components affected**: ODS (`ods.ts`), AgentPod (`pod.agent.ts`), PodManager (`pod-manager.ts`), PodCreateParams, GraphOrchestratorSettings, DI container, CLI `positional-graph.command.ts`, node-starter-prompt, Plan 030 E2E scripts
- **Critical dependencies**: Plan 034 (delivered), Plan 030 orchestration system (stable), Plan 032 node event system (stable), `IAgentAdapter` interface (unchanged)
- **Modification risks**: ODS dependency change is breaking (agentAdapter → agentManager); PodCreateParams change breaks existing tests; Plan 030 E2E scripts need wiring update
- **Prior learnings**: 15 applicable (PL-01 through PL-15) — most critical: PL-02 (pod never modifies graph state), PL-03 (subscribe before send), PL-10 (two-phase handshake mandatory), PL-14 (describe.skip for real tests)

### What Plan 034 Already Delivered

| Component | Status | Reference |
|-----------|--------|-----------|
| `IAgentInstance` (3-state, event pass-through, metadata) | ✅ Delivered | `packages/shared/src/features/034-agentic-cli/` |
| `AgentManagerService` (getNew/getWithSessionId, session index) | ✅ Delivered | Same |
| `FakeAgentInstance` + `FakeAgentManagerService` | ✅ Delivered | Same `/fakes/` |
| `cg agent run` + `cg agent compact` (CLI) | ✅ Delivered | `apps/cli/src/features/034-agentic-cli/` |
| Contract tests, unit tests, real agent tests | ✅ Delivered | `test/unit/features/034-agentic-cli/`, `test/integration/` |
| Developer documentation | ✅ Delivered | `docs/how/agent-system/` |

## Summary

Make work unit pods run real AI agents within the positional orchestration system. Plan 030 built the orchestration loop (settle-decide-act), Plan 032 built the event system, and Plan 034 rebuilt the agent system (AgentInstance/AgentManagerService). None of these are wired together for real agent execution. This plan bridges that gap: the orchestration dispatch service creates agents through AgentManagerService, pods wrap AgentInstance for lifecycle tracking, a CLI command drives the full loop, and agents receive structured prompts that teach them the workflow protocol.

The end result: `cg wf run my-pipeline` starts an orchestration loop that spawns real Claude Code agents, each agent reads its instructions via CLI commands, does its work, reports completion via CLI events, and the loop advances to the next node — all observable in the terminal with event streaming.

## Goals

- **Pods run real agents**: AgentPod wraps `IAgentInstance` (from Plan 034) instead of raw `IAgentAdapter`, gaining lifecycle tracking, event pass-through, and session management for free
- **Orchestration uses managed agents**: ODS creates agents through `AgentManagerService.getNew()` and `.getWithSessionId()`, mapping directly from `AgentContextService` outcomes (new session vs inherit)
- **Graph-level agent type selection**: Graphs specify which agent type all agentic nodes use (claude-code or copilot), with a sensible default
- **Session inheritance with real sessions**: When a node inherits a session from an upstream node, the real agent CLI resumes from that session's conversation history on disk
- **Agent bootstrap prompt**: A generic `node-starter-prompt.md` template teaches any agentic node the workflow protocol — accept, read inputs, do work, save outputs, complete — using CLI commands parameterized with graph/node IDs
- **Agent resume prompt**: A generic resume prompt for agents restarting after a pause (question answered, error cleared), telling them to check their history and continue
- **CLI-driven graph execution**: `cg wf run <slug>` drives the orchestration loop from the terminal, waiting for real agents between iterations, printing events to stdout
- **Execution tracking**: PodManager tracks fire-and-forget execution promises so the driver loop knows when agents complete and can re-enter the orchestration loop
- **Parallel agent execution**: Multiple agents run concurrently with independent sessions when nodes are configured for parallel execution
- **Observable agent lifecycle**: Agent status (working, stopped, error), questions, and completions are visible through the event system — enabling future web UI integration without changes to the orchestration layer
- **Three-layer test coverage**: Fake E2E (fast CI), real agent integration (focused, skipped), real agent E2E (full pipeline, skipped) — proving the system works with both simulated and real agents
- **Upgrade existing E2E**: Plan 030's orchestration E2E script updated to use the new wiring (FakeAgentManagerService instead of FakeAgentAdapter) without changing test behavior

## Non-Goals

- **Web UI integration**: Reconnecting the web hooks (useAgentManager, useAgentInstance) to the redesigned agent system is a separate future plan
- **SSE broadcasting from orchestration**: Events stay within the orchestration system; no web transport layer
- **TUI / interactive terminal**: `cg wf run` is output-only; no interactive prompts or terminal UI
- **Interactive question handling in the loop**: When an agent asks a question, the loop idles; the human answers from a separate terminal
- **Production daemon / watchdog**: No long-running process management, health monitoring, or auto-restart
- **Copilot agent pods as primary**: Claude Code is the primary adapter; Copilot support is tested but not the deployment target
- **Agent metadata CLI commands** (`cg agent status`, `cg agent kill`): Only meaningful in long-lived processes; deferred
- **Cross-process event broadcasting**: Events observed within the process only
- **Stuck-node auto-detection**: Timeout-based zombie detection is out of scope; agents may run for hours legitimately

## Complexity

- **Score**: CS-4 (large)
- **Breakdown**: S=2, I=1, D=1, N=1, F=1, T=2
  - **S=2 (Surface Area)**: Cross-cutting changes across ODS, AgentPod, PodManager, PodCreateParams, GraphOrchestratorSettings, DI container, CLI command, prompt templates, and multiple test layers
  - **I=1 (Integration)**: Depends on Plan 034 (stable, delivered), Plan 030 orchestration (stable), Plan 032 events (stable). One external dependency: Claude Code CLI
  - **D=1 (Data/State)**: New prompt template files, possible `pod-sessions.json` format extension for session types, `GraphOrchestratorSettingsSchema` extension
  - **N=1 (Novelty)**: Designs are thoroughly workshopped (3 workshops + research dossier). Real agent non-determinism adds uncertainty but structural assertions handle this
  - **F=1 (Non-Functional)**: Real agent tests are slow (30-120s each); need skip guards for CI. No performance or security requirements
  - **T=2 (Testing/Rollout)**: Three distinct test layers. Existing Plan 030 E2E must be upgraded without regression. Real agent tests need auth guards and separate execution path
- **Confidence**: 0.85 — high confidence due to thorough workshopping; minor uncertainty around real agent edge cases
- **Assumptions**:
  - Plan 034 components are stable and correct (141 tests passing)
  - Plan 030 orchestration loop is stable (3858 tests passing)
  - Claude Code CLI is available on dev machines for real agent tests
  - CLI binary name is `cg` (confirmed via `apps/cli/package.json` bin field)
- **Dependencies**:
  - Plan 034 (Agentic CLI) — COMPLETE
  - Plan 030 (Positional Orchestrator) — stable, in-flight
  - Plan 032 (Node Event System) — stable, complete
- **Risks**:
  - Breaking ODS/PodCreateParams changes require updating ALL existing orchestration tests
  - Real agent tests are non-deterministic — assertions must be structural
  - Fire-and-forget Promise tracking adds complexity to PodManager
- **Phases**: Suggested high-level phases:
  1. Core wiring (ODS → AgentManagerService, AgentPod → IAgentInstance, DI changes)
  2. Prompts (node-starter-prompt.md, node-resume-prompt.md)
  3. CLI driver (`cg wf run` command, PodManager execution tracking)
  4. Test upgrade (Plan 030 E2E → FakeAgentManagerService wiring)
  5. Real agent E2E tests (Layers 2-3)
  - Rollout: incremental, each phase testable independently
  - Rollback: revert to raw IAgentAdapter wiring (Plan 030 status quo)

## Acceptance Criteria

### Core Wiring

1. **AC-01**: ODS depends on `IAgentManagerService` instead of `IAgentAdapter`. The `ODSDependencies` interface has an `agentManager` field replacing `agentAdapter`.
2. **AC-02**: ODS creates agents via `agentManager.getNew(params)` when `AgentContextService` returns `{ source: 'new' }`.
3. **AC-03**: ODS creates agents via `agentManager.getWithSessionId(sessionId, params)` when `AgentContextService` returns `{ source: 'inherit', fromNodeId }` and a session exists for the source node.
4. **AC-04**: ODS falls back to `agentManager.getNew(params)` when inheriting but the source node has no session (never ran or failed before session creation).
5. **AC-05**: AgentPod wraps `IAgentInstance` instead of `IAgentAdapter`. The constructor accepts `(nodeId, agentInstance, unitSlug)`.
6. **AC-06**: AgentPod reads `sessionId` from its `IAgentInstance` (no internal `_sessionId` tracking).
7. **AC-07**: AgentPod delegates `run()` to `agentInstance.run()` and `terminate()` to `agentInstance.terminate()`.
8. **AC-08**: `PodCreateParams` agent variant has `agentInstance: IAgentInstance` instead of `adapter: IAgentAdapter`.
9. **AC-09**: `PodExecuteOptions.contextSessionId` is removed — session is baked into the `IAgentInstance` at creation.
10. **AC-10**: `GraphOrchestratorSettingsSchema` includes an optional `agentType` field (`'claude-code' | 'copilot'`), defaulting to `'claude-code'` when not specified.
11. **AC-11**: ODS resolves agent type from `reality.settings.agentType` falling back to `'claude-code'`.
12. **AC-12**: DI container has an `ORCHESTRATION_DI_TOKENS.AGENT_MANAGER` token. The CLI container registers the SAME `AgentManagerService` instance for both `CLI_DI_TOKENS.AGENT_MANAGER` and `ORCHESTRATION_DI_TOKENS.AGENT_MANAGER`.

### Prompts

13. **AC-13**: A `node-starter-prompt.md` template exists with placeholders (`{{graphSlug}}`, `{{nodeId}}`, `{{unitSlug}}`, `{{worktreePath}}`).
14. **AC-14**: The starter prompt instructs agents to: (a) accept the assignment via CLI, (b) read inputs via CLI, (c) do their work, (d) save outputs via CLI, (e) complete via CLI.
15. **AC-15**: The starter prompt includes the question protocol — how to ask a question and the instruction to STOP after asking.
16. **AC-16**: The starter prompt includes error handling — how to report errors and the instruction to fail fast on WF errors.
17. **AC-17**: AgentPod resolves template placeholders before passing the prompt to the agent instance.
18. **AC-18**: A `node-resume-prompt.md` template exists for agents resuming after a pause.
19. **AC-19**: The resume prompt tells the agent to check conversation history, check for answers to questions, and continue work.
20. **AC-20**: AgentPod selects the starter prompt for first runs (no prior sessionId) and the resume prompt for subsequent runs (sessionId exists).

### CLI Driver

21. **AC-21**: `cg wf run <slug>` command exists and drives the orchestration loop.
22. **AC-22**: The driver loop calls `handle.run()` repeatedly, processing one settle-decide-act pass per iteration.
23. **AC-23**: The driver loop waits for running agents between iterations (does not busy-loop).
24. **AC-24**: The driver loop exits with code 0 when the graph completes and code 1 when it fails.
25. **AC-25**: The driver loop has a configurable maximum iteration count to prevent infinite loops.
26. **AC-26**: The driver loop prints orchestration status to stdout (nodes started, nodes completed, idle state).
27. **AC-27**: PodManager tracks fire-and-forget execution promises via `trackExecution(nodeId, promise)`.
28. **AC-28**: PodManager provides `waitForAnyCompletion()` that resolves when any tracked execution finishes.
29. **AC-29**: PodManager provides `hasRunningExecutions()` that returns whether any agents are still running.
30. **AC-30**: Session sync happens after agent completion — PodManager persists `nodeId → sessionId` so subsequent nodes can inherit.

### Existing Test Upgrade

31. **AC-31**: Plan 030's orchestration E2E script (`positional-graph-orchestration-e2e.ts`) uses `FakeAgentManagerService` instead of `FakeAgentAdapter` in its orchestration stack.
32. **AC-32**: Plan 030's E2E test behavior is unchanged after the wiring update — same assertions, same deterministic flow.
33. **AC-33**: All existing orchestration unit tests (ODS, pod, pod-manager) are updated for the new interfaces and pass.

### Real Agent Tests

34. **AC-34**: A real agent E2E test exists that runs a simplified graph (2-3 nodes) with real Claude Code agents through the full orchestration loop.
35. **AC-35**: The real agent E2E verifies: agent accepts assignment, reads inputs, saves outputs, and completes — all via CLI commands.
36. **AC-36**: A real agent integration test verifies session inheritance — a second node inherits the first node's session and the agent resumes from conversation history.
37. **AC-37**: A real agent integration test verifies parallel execution — two agents run concurrently with independent sessions.
38. **AC-38**: Real agent tests use `describe.skip` (not `describe.skipIf`) and are documentation/validation tests that can be manually unskipped.
39. **AC-39**: Real agent tests use structural assertions (status, sessionId presence, event counts) not content assertions.
40. **AC-40**: All existing tests continue to pass (3858+ tests) after the changes.

### Observable Lifecycle

41. **AC-41**: Agent events flow through `IAgentInstance` event handlers to terminal output when running via `cg wf run`.
42. **AC-42**: Terminal output prefixes events with the node ID (e.g., `[spec-writer] I'll create...`).
43. **AC-43**: The orchestration loop can detect when an agent has completed (via PodManager execution tracking) and process completion events in the next settle pass.

## Risks & Assumptions

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Breaking ODS changes cascade through many tests | High | Medium | Systematic test update in dedicated phase; contract tests catch regressions |
| Real agent tests are slow and non-deterministic | High | Low | `describe.skip` guards; structural assertions only; separate `just test-e2e` command |
| Fire-and-forget Promise tracking may have race conditions | Medium | Medium | Comprehensive unit tests for PodManager execution tracking; settle loop provides natural synchronization |
| Agent doesn't follow starter prompt instructions | Medium | Medium | Minimal, clear prompt instructions; test with simple deterministic tasks |
| Plan 030 E2E upgrade introduces regressions | Low | High | Minimal wiring change only; same assertions; run before and after |
| `pod-sessions.json` format change breaks existing persisted sessions | Low | Medium | Additive change (new `session_types` field); backward compatible |

### Assumptions

- Plan 034's AgentInstance and AgentManagerService are stable and correctly implemented (backed by 141 tests)
- Plan 030's orchestration loop (settle-decide-act) is stable and handles the fire-and-forget model correctly
- Claude Code CLI is available on developer machines for real agent tests
- Agents will follow structured prompt instructions (accept → work → complete protocol)
- The CLI binary name is `cg` (confirmed via `apps/cli/package.json` bin field)
- `PodExecuteOptions.contextSessionId` can be removed because session is now baked into the AgentInstance at creation time

## Open Questions

### OQ-01: CLI binary name in agent prompts

**RESOLVED**: The CLI binary is `cg` (and `chainglass`). Confirmed via `apps/cli/package.json` bin field. The original task mentioned `ppm` but that is outdated. All prompts use `cg`. See Workshop 04 Q4.

### OQ-02: Event handler wiring for `cg wf run`

How should terminal event handlers be attached to agent instances created during orchestration? Workshop 03 proposes three options:
- A: Hook on AgentManagerService (`onInstanceCreated`)
- B: ODS wires handler after instance creation
- C: CLI driver attaches handler via metadata nodeId (recommended)

### OQ-03: User-input node behavior in CLI driver

When `cg wf run` encounters a user-input node, should it:
- A: Idle silently until completed externally
- B: Print a message with the command needed to complete the node
- C: Prompt on stdin (violates "no interactivity" constraint)

### OQ-04: Idle timeout for CLI driver

Should `cg wf run` have a configurable idle timeout for when the graph is waiting for external input? Options: no timeout (run until Ctrl+C), optional `--timeout` flag.

### OQ-05: Session type persistence

Should PodManager persist `sessionId → agentType` in `pod-sessions.json` for cross-type safety? Currently all nodes in a graph use the same agent type, making this unnecessary. Needed if per-node agent type overrides are added later.

## ADR Seeds (Optional)

### ADR Seed: ODS Agent Acquisition Strategy

- **Decision Drivers**: Domain agnosticism (P1 from Workshop 02), same-instance guarantee, session inheritance rules from AgentContextService
- **Candidate Alternatives**:
  - A: ODS uses raw AdapterFactory (Workshop 01 design) — simple but no lifecycle tracking
  - B: ODS uses AgentManagerService (Workshop 02 design) — lifecycle tracking, session index, same-instance guarantee
  - C: ODS uses AgentService (thin timeout wrapper) — provides timeout but no session management
- **Stakeholders**: Orchestration system, future web UI, CLI driver

### ADR Seed: Prompt Template Strategy

- **Decision Drivers**: Agents need to understand the WF protocol; prompts must be generic across all agentic nodes; agents should use CLI for all WF operations
- **Candidate Alternatives**:
  - A: Single prompt file with placeholders resolved by AgentPod
  - B: Multi-file prompt system (starter + resume + per-work-unit)
  - C: Programmatic prompt builder (TypeScript function)
- **Stakeholders**: AgentPod, work unit designers, agent prompt engineers

## Workshop Opportunities

| Topic | Type | Why Workshop | Key Questions |
|-------|------|--------------|---------------|
| Node Starter & Resume Prompt Design | CLI Flow | The prompt is the contract between the orchestration system and the agent. It must be precise, complete, and generic enough for any agentic node. Multiple CLI commands, protocols (accept/work/complete/question/error), and edge cases need specification. | What commands does the agent need? What happens if the agent ignores the protocol? How do we handle prompt versioning? Should the prompt be in the repo or generated? |
| PodManager Execution Tracking | State Machine | Fire-and-forget with Promise tracking has subtle timing issues: race between completion and next settle pass, concurrent cleanup, session sync ordering. | When exactly does session sync happen? What if two pods complete simultaneously? How does `waitForAnyCompletion` interact with the settle-decide-act loop? What about error handling in tracked promises? |
| Plan 030 E2E Upgrade Strategy | Integration Pattern | The existing 1539-line E2E script is the most complex test in the codebase. Upgrading its wiring without breaking behavior requires careful analysis. | Which helper functions change? How do we verify the upgraded test is equivalent? Should we run old and new in parallel during transition? |

## Prior Art

- **Plan 030 E2E**: `test/e2e/positional-graph-orchestration-e2e.ts` (1539 lines) — the test to upgrade
- **Plan 030 Workshop 13**: `docs/plans/030-positional-orchestrator/workshops/13-phase-8-e2e-design.md` — E2E design patterns
- **Plan 032 Visual E2E**: `test/e2e/node-event-system-visual-e2e.ts` — event system test pattern
- **Old WF system**: `docs/how/dev/workgraph-run/e2e-sample-flow.ts` (720 lines) — legacy agent execution pattern
- **Existing real agent tests**: `test/integration/real-agent-multi-turn.test.ts` (365 lines) — adapter-level real agent tests
