# Positional Graph Orchestration System

## Research Context

- **Components affected**: `packages/positional-graph/` (25+ source files), `apps/cli/` (30+ commands), `packages/shared/` (fakes, events)
- **Critical dependencies**: Plan 026 (positional graph model), Plan 027 (domain events), Plan 029 (agentic work units), Plan 019 (agent adapter)
- **Modification risks**: State schema extension (migration), node status computation (gate additions), input resolution (algorithm sensitivity)
- **Link**: See `research-dossier.md` for full analysis (55+ findings across 7 research domains)

This specification incorporates findings from research-dossier.md and detailed design decisions from 6 workshops.

---

## Summary

Plan 026 introduced the positional graph: an ordered-line workflow model where line position defines execution topology. Nodes live on lines, data flows forward (line N to N+1), and within a line nodes execute in serial or parallel based on their execution mode.

The graph has structure and state but no engine to drive it. This plan delivers an orchestration system with a single entry point — `IOrchestrationService` — that composes five internal collaborators:

1. **Coordinates** the orchestration loop as the sole entry point for web pages and CLI (`IOrchestrationService`)
2. **Reads** the graph's full state into an immutable snapshot (PositionalGraphReality)
3. **Decides** what to do next via a stateless rules engine (ONBAS)
4. **Executes** that decision by controlling execution containers and updating state (ODS)
5. **Manages context continuity** across agent sessions (AgentContextService)
6. **Wraps execution** in self-contained pods that handle agent/code lifecycles (WorkUnitPods)

The developer experience follows a two-level pattern: `IOrchestrationService` is the DI-registered singleton (the factory), and `IGraphOrchestration` is the per-graph handle with identity (the thing you work with). A web page server action or CLI command resolves the service, calls `.get(ctx, graphSlug)` to get a handle for their graph, then calls `.run()` or `.getReality()`. ONBAS, ODS, PodManager, and AgentContextService are internal collaborators — the outside world never touches them directly.

The entire system is designed for TDD-first development: every service accepts injectable dependencies, every decision is a pure function on a fakeable snapshot, and deterministic test doubles replace real agents throughout development. Real agents are not needed until the orchestration loop is proven correct.

---

## Goals

1. **Deterministic orchestration loop**: Given a graph state, the system always produces the same next action. No hidden state, no race conditions in the decision layer.

2. **Observable graph state**: Any consumer (CLI, UI, tests) can request a single snapshot object that captures the entire graph reality — every line, every node, every question, every pod session — at a point in time.

3. **Testable without agents**: The full orchestration loop — snapshot, decide, execute, update — runs with fake pods and deterministic responses. Real agents are a late-stage injection, not a development dependency.

4. **Question/answer protocol**: Agents can ask questions during execution. Questions surface to users through the orchestration loop, answers flow back in, and agents resume with context. The loop does not stall on unanswered questions — it skips past surfaced questions and continues checking other actionable nodes.

5. **Context continuity**: Agent sessions carry forward across serial execution chains. When a spec-builder finishes and a spec-reviewer starts, the reviewer inherits the builder's conversation context. Parallel agents start fresh. The rules are positional and deterministic.

6. **Pod lifecycle management**: Execution containers (pods) are ephemeral in memory but their session state persists to disk. Server restarts do not lose progress — pods rehydrate to an idle state and the orchestrator tells them what to do next.

7. **In-process testability**: The orchestration loop is exercised by calling `IGraphOrchestration.run()` directly in tests. No CLI command or web server wiring is needed to prove the loop works. The interfaces are designed so they can later be called from a long-lived web process (the expected production path) without modification.

8. **Human-as-agent testing**: The E2E test strategy uses the test harness as every agent. CLI commands (`save-output-data`, `ask`, `answer`, `end`) let tests drive the agent side. The test harness calls `IGraphOrchestration.run()` directly to trigger orchestration cycles.

---

## Non-Goals

1. **Real agent integration** — This plan uses fake agents exclusively. Wiring real agents (Plan 019 `IAgentAdapter`) is a follow-on concern.

2. **Concurrent multi-graph orchestration** — One graph runs at a time. Multi-graph scheduling is out of scope.

3. **Distributed execution** — Pods run in-process. No subprocess spawning, no container orchestration, no remote execution.

4. **Web server or CLI orchestration wiring** — The interfaces (`IOrchestrationService`, `IGraphOrchestration`) are designed for future use from a long-lived web process, but this plan does not wire them to server actions or CLI commands. Tests call `.run()` directly. Production wiring is a follow-on concern.

5. **UI/SSE integration** — Domain events are emitted (via Plan 027 `ICentralEventNotifier`) but the UI consumer is not part of this plan.

6. **Retry/timeout policies** — Pods execute once. Failure means `blocked-error`. Retry logic is a follow-on concern.

6. **Dynamic graph modification** — The graph structure is fixed once orchestration begins. No adding/removing nodes mid-execution.

7. **State machine library adoption** — Pod and node lifecycles use simple status enums and switch statements. Formal state machine libraries (XState, etc.) are not warranted at this scale.

8. **Multi-process locking** — Atomic writes (temp-then-rename) prevent corruption. Optimistic concurrency or file locking for concurrent CLI/web access is a follow-on concern.

---

## Complexity

**Score**: CS-4 (large)

**Breakdown**: S=2, I=1, D=2, N=1, F=0, T=2

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| Surface Area (S) | 2 | Cross-cutting: new services, schemas, CLI commands, test infrastructure across 3+ packages |
| Integration (I) | 1 | Depends on Plan 026 graph service, Plan 027 events, Plan 019 agent adapter (all internal) |
| Data/State (D) | 2 | New snapshot schema, pod session persistence, state schema extensions, question lifecycle |
| Novelty (N) | 1 | Well-specified via 6 workshops, but orchestration rules have edge cases requiring discovery |
| Non-Functional (F) | 0 | Standard performance, no compliance or security constraints |
| Testing/Rollout (T) | 2 | Three-layer test strategy (unit, integration, E2E), contract tests on fake+real, `cg wf run` command |

**Total**: P = 8 → CS-4

**Confidence**: 0.85

**Assumptions**:
- Existing `getNodeStatus()` and `getLineStatus()` methods work as documented and can be composed into PositionalGraphReality without modification
- `IAgentAdapter` interface is stable and FakeAgentAdapter provides sufficient test surface
- Atomic write pattern is sufficient for single-process orchestration (no concurrent CLI invocations)

**Dependencies**:
- Plan 026: Positional graph model, `canRun` gates, input resolution
- Plan 027: `ICentralEventNotifier` for domain events
- Plan 029: Work unit definitions, `IWorkUnitService`, discriminated union pattern

**Risks**:
- State schema migration: Adding pod session data and question lifecycle fields to existing `state.json` could break existing fixtures
- Readiness gate interaction: New orchestration logic must compose with (not replace) existing 4-gate algorithm
- Snapshot staleness: Reality snapshot is a point-in-time capture; long orchestration passes could act on stale data

**Phases** (suggested):
1. PositionalGraphReality snapshot model + builder
2. OrchestrationRequest discriminated union + type guards
3. AgentContextService + context rules
4. WorkUnitPods + PodManager + FakePod
5. ONBAS walk algorithm
6. ODS action handlers
7. IOrchestrationService facade (loop coordinator, DI entry point)
8. E2E + integration test suite

---

## Acceptance Criteria

### AC-1: PositionalGraphReality snapshot captures full graph state

Given a graph with lines, nodes, questions, and pod sessions in various states,
when `buildPositionalGraphReality()` is called with the graph status result and stored state,
then the returned snapshot contains:
- All lines with their completion status, transition state, and node membership
- All nodes with their execution status, readiness detail (4 gates), execution mode, unit type, and position
- All questions with their lifecycle state (asked, surfaced, answered)
- All pod session IDs mapped to their nodes
- Pre-computed convenience accessors: `currentLineIndex`, `readyNodeIds`, `runningNodeIds`, `waitingQuestionNodeIds`, `completedNodeIds`, `isComplete`, `isFailed`

### AC-2: OrchestrationRequest is a closed, self-contained discriminated union

Given the four request types (`start-node`, `resume-node`, `question-pending`, `no-action`),
when ONBAS produces any request,
then it is discriminated by the `type` field, carries all data ODS needs to execute without additional lookups, and the set is exhaustive (TypeScript `never` in default case).

### AC-3: ONBAS walks graph and returns deterministic next action

Given a PositionalGraphReality snapshot,
when `walkForNextAction(reality)` is called,
then:
- Lines are visited in index order (0 to N)
- Nodes within a line are visited in position order (0 to N)
- The first actionable node found produces a request; the walk stops immediately
- A `ready` node produces `start-node`
- A `waiting-question` node with an unanswered, unsurfaced question produces `question-pending`
- A `waiting-question` node with an answered question produces `resume-node`
- A `waiting-question` node with a surfaced but unanswered question is skipped (the walk continues)
- Running, complete, pending, and blocked-error nodes are skipped
- If no actionable node is found, `no-action` is returned with a diagnostic reason

### AC-4: ONBAS is a pure, synchronous, stateless function

Given the same PositionalGraphReality input,
when `walkForNextAction()` is called multiple times,
then it returns identical results every time. No side effects, no I/O, no adapter calls, no memory between invocations.

### AC-5: AgentContextService determines context source from position

Given a node in a PositionalGraphReality snapshot,
when `getContextSource(reality, nodeId)` is called,
then:
- Non-agent nodes (code, user-input) return `not-applicable`
- First agent on line 0 returns `new` (no predecessor exists)
- First agent on line N (N>0) returns `inherit` from the first agent node on line N-1 (or `new` if no agent exists on the previous line)
- A serial node that is not first in its line returns `inherit` from its left neighbor (if agent) or `new` (if left neighbor is code/user-input)
- A parallel node returns `new` (independent execution)
- Every result includes a human-readable `reason` string explaining the decision

### AC-6: ODS executes each OrchestrationRequest type correctly

Given an OrchestrationRequest from ONBAS,
when `ODS.execute(request)` is called,
then:
- `start-node`: Creates/retrieves pod via PodManager, resolves context source via AgentContextService, calls `pod.execute()` with inputs and optional context session ID, updates node status to `running`
- `resume-node`: Retrieves pod (or recreates from persisted session), calls `pod.resumeWithAnswer()`, handles result
- `question-pending`: Marks the question as surfaced (`surfaced_at` timestamp), emits domain event for UI notification
- `no-action`: No state changes, no side effects
- All state updates use atomic writes

### AC-7: Pods manage agent/code execution lifecycle

Given a pod created by PodManager for an agent node,
when `pod.execute()` is called,
then:
- AgentPod runs the agent via `IAgentAdapter.run()` with the work unit's prompt, inputs, and optional context session ID
- The result is one of: `completed` (outputs available), `question` (agent asked a question), `error` (execution failed), `terminated` (externally stopped)
- Session ID is captured and persisted for future resumption
- CodePod runs the script synchronously with no session tracking
- User-input nodes have no pod; ODS handles them directly

### AC-8: Pod sessions survive server restarts

Given a graph with running pods that have session IDs,
when the server restarts,
then:
- Pod session IDs are persisted to `pod-sessions.json` in the graph directory
- On restart, `podManager.loadSessions()` reads persisted sessions
- Pods are not auto-recreated; the orchestrator creates them as needed using the persisted session ID for context continuity
- A fresh `cg wf run` after restart correctly resumes where execution left off

### AC-9: Question lifecycle flows through the system

Given an agent that asks a question during execution,
when the orchestration loop runs:
1. Agent pod returns `outcome: 'question'` — ODS stores question in state, node becomes `waiting-question`
2. Next ONBAS walk finds unsurfaced question — returns `question-pending` OR
3. ODS marks question as surfaced (`surfaced_at` set), emits domain event
4. User answers via CLI — answer stored in state
5. Next ONBAS walk finds answered question — returns `resume-node` OR
6. ODS calls `pod.resumeWithAnswer()` — agent continues with answer

### AC-10: Two-level orchestration entry point (service → per-graph handle)

Given a web page server action or CLI command that needs to orchestrate a graph,
when `IOrchestrationService` is resolved from the DI container:
- `service.get(ctx, graphSlug)` returns an `IGraphOrchestration` — a per-graph handle with identity
- The handle exposes `run()` (advance orchestration) and `getReality()` (read-only state)
- `run()` returns `OrchestrationRunResult` with actions taken, stop reason, and final reality
- The handle caches its PodManager — sessions loaded once, reused across `run()` calls
- Same `graphSlug` returns the same handle within a process lifetime
- ONBAS, ODS, PodManager, and AgentContextService are internal — never exposed to consumers
- `FakeOrchestrationService` and `FakeGraphOrchestration` exist for testing with pre-configured behaviors

### AC-11: Orchestration loop is exercised in-process via tests

Given the orchestration services built in this plan,
when tests call `IGraphOrchestration.run()` directly:
- The loop executes in-process: build reality → ONBAS → ODS → repeat
- Multiple iterations may occur within one `run()` call (e.g., start a node, then find another ready node)
- The loop stops when ONBAS returns `no-action` or `question-pending`
- No CLI command or web server wiring is required — production hosting is a follow-on concern
- The interfaces are designed so a future long-lived web process can call `.run()` without modification

### AC-12: E2E tests drive full workflow without real agents

Given the 4-line, 8-node test graph (get-spec, spec-builder, spec-reviewer, coder, tester, alignment-tester, pr-preparer, pr-creator),
when the E2E test runs:
- The test harness creates the graph and wires inputs via CLI
- The test harness calls `IGraphOrchestration.run()` directly to trigger orchestration
- The test harness acts as each agent via CLI: provides output data, asks/answers questions, ends nodes
- Every pattern is exercised: user-input, serial agents, cross-line context inheritance, question/answer cycles, code execution, manual transitions, parallel execution, serial after parallel
- The graph reaches `complete` status with all nodes complete

### AC-13: FakePodManager enables deterministic integration tests

Given the integration test harness,
when tests configure `FakePodManager` with pre-defined behaviors,
then:
- Pods return configured results (outputs, questions, errors) deterministically
- Session IDs can be seeded for context inheritance verification
- Call history is tracked for assertion (which pods were created, in what order, with what inputs)
- Contract tests pass on both `FakePodManager` and real `PodManager` implementations

### AC-14: Input wiring from user-input nodes flows through orchestration

Given a user-input node on line 0 with saved output data,
when an agent node on line 1 has its input wired to the user-input node's output,
then:
- PositionalGraphReality includes the resolved InputPack for the agent node
- ONBAS includes the InputPack in the `start-node` request
- ODS passes the InputPack to the pod during execution
- The agent receives the user-provided data as its input

---

## Risks & Assumptions

### Risks

1. **State schema backward compatibility**: Adding `surfaced_at` to questions, pod session tracking, and new node status fields may break existing graphs. Mitigation: All new fields are optional with sensible defaults; existing state.json files parse without error.

2. **Snapshot freshness**: The PositionalGraphReality is a point-in-time capture. If the orchestration loop takes time (e.g., waiting for a slow file read), the snapshot could be stale. Mitigation: Each loop iteration builds a fresh snapshot.

3. **Gate composition complexity**: ONBAS relies on the existing 4-gate readiness algorithm. If gates are subtly wrong for edge cases (e.g., parallel nodes with `waitForPrevious` flag), the walk algorithm inherits those bugs. Mitigation: Comprehensive unit tests on gate combinations.

4. **Pod session file corruption**: `pod-sessions.json` is a new persistence target subject to the same concurrent-access risks as `state.json`. Mitigation: Use the established atomic write pattern.

5. **Context inheritance edge cases**: When a line has no agent nodes (all code units), the cross-line inheritance rule falls through to "new context." This may surprise users. Mitigation: `AgentContextService` includes a `reason` string in every result, making the logic transparent.

### Assumptions

1. Orchestration is single-process — only one `cg wf run` invocation at a time per graph
2. Existing `getNodeStatus()` correctly implements the 4-gate algorithm for all execution modes
3. `IAgentAdapter` returns a stable `sessionId` that can be used for resumption
4. Graph structure does not change during orchestration (no concurrent `addNode`/`removeNode`)
5. Line 0 is reserved for user-input/setup nodes and uses auto-transition
6. The 4-line, 8-node test graph exercises all orchestration patterns needed for this plan

---

## Open Questions

1. **[NEEDS CLARIFICATION: ODS Workshop]** Workshop #8 (ODS) is still pending. The ODS action handler details are derived from workshops #2 and #4 but the dedicated workshop may surface additional design decisions around error handling, event emission patterns, and state update sequencing.

2. **[DEFERRED: Orchestration cycle trigger after agent completion]** When an agent finishes, something must trigger the next orchestration cycle. This is a production-wiring concern (web process reacting to agent completion) and is out of scope for this plan. The interfaces support it — a future web process calls `graph.run()` when notified — but the trigger mechanism is not designed here.

3. **[NEEDS CLARIFICATION: Parallel node `waitForPrevious` flag]** The user mentions parallel nodes can have a parameter forcing them to wait for the node before. Is this the existing `serialNeighborComplete` gate, or a new flag specific to parallel nodes? The spec assumes this is the existing gate behavior.

---

## ADR Seeds (Optional)

### ADR-1: Snapshot-First Orchestration (Composition Over Mutation)

**Decision Drivers**: Testability (pure functions on immutable data), observability (full state visible at any point), determinism (same input → same output)

**Candidate Alternatives**:
- A. Build PositionalGraphReality snapshot, pass to pure ONBAS function (chosen in workshops)
- B. ONBAS queries services directly during walk (simpler but harder to test, non-deterministic)
- C. Event-sourced state with projections (over-engineered for this scale)

**Stakeholders**: Developer (testing), Orchestrator consumers (CLI, UI), Future maintainers

### ADR-2: Four-Type OrchestrationRequest Union

**Decision Drivers**: Exhaustive type safety, self-contained payloads, clean ODS handler mapping

**Candidate Alternatives**:
- A. Four-type discriminated union: `start-node`, `resume-node`, `question-pending`, `no-action` (chosen in Workshop #2)
- B. Research dossier's five-type union (added `continue-agent` and `complete` types — rejected as overlapping)
- C. Single generic request with action flags (loses type safety)

**Stakeholders**: ONBAS (producer), ODS (consumer), Test authors

### ADR-3: Ephemeral Pods with Persisted Sessions

**Decision Drivers**: Server restart resilience, memory efficiency, simplicity of pod lifecycle

**Candidate Alternatives**:
- A. Pods ephemeral in memory, session IDs persisted to `pod-sessions.json` (chosen in Workshop #4)
- B. Full pod serialization (complex, fragile, unnecessary)
- C. No persistence — restart loses all progress (unacceptable)

**Stakeholders**: Orchestrator, PodManager, Reliability

---

## External Research

No external research conducted. Research dossier identified two opportunities:
1. State machine libraries for TypeScript (XState vs Robot for pod lifecycle)
2. Distributed locking for multi-process graph access

Both were assessed during workshop design and deferred:
- State machine libraries: Simple status enums with switch statements are sufficient at this scale
- Distributed locking: Single-process assumption with atomic writes is sufficient for this plan

---

## Unresolved Research

**Topics**:
- State machine libraries for pod/node lifecycle (from research-dossier.md)
- Distributed locking for multi-process graph access (from research-dossier.md)

**Impact**: Low for this plan. State machine libraries would only simplify pod lifecycle code (6 states, well-defined transitions). Distributed locking is only needed if concurrent multi-process access becomes a requirement.

**Recommendation**: Defer. These topics become relevant when scaling beyond single-process orchestration or when pod lifecycle complexity grows. Neither blocks this plan's execution.

---

## Workshop Opportunities

All workshops for this plan have been completed (7 of 8, with ODS pending):

| Topic | Type | Status | Workshop |
|-------|------|--------|----------|
| PositionalGraphReality snapshot model | Data Model | Complete | [Workshop #1](workshops/01-positional-graph-reality.md) |
| OrchestrationRequest discriminated union | Data Model | Complete | [Workshop #2](workshops/02-orchestration-request.md) |
| AgentContextService context rules | State Machine | Complete | [Workshop #3](workshops/03-agent-context-service.md) |
| WorkUnitPods execution containers | Integration Pattern | Complete | [Workshop #4](workshops/04-work-unit-pods.md) |
| ONBAS walk algorithm | State Machine | Complete | [Workshop #5](workshops/05-onbas.md) |
| E2E integration testing strategy | Integration Pattern | Complete | [Workshop #6](workshops/06-e2e-integration-testing.md) |
| Orchestration entry point & developer UX | Integration Pattern | Complete | [Workshop #7](workshops/07-orchestration-entry-point.md) |
| OrchestrationDoerService (ODS) | Integration Pattern | **Pending** | [Workshop #8](workshops.md#8-orchestrationdoerservice-ods) |

**Recommendation**: Complete Workshop #8 (ODS) before architecture phase to finalize ODS action handler design, error handling patterns, and event emission sequencing. The spec's ODS acceptance criteria (AC-6) are derived from workshops #2 and #4 but may need refinement after the dedicated workshop.
