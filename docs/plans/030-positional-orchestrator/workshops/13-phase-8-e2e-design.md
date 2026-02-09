# Workshop: Phase 8 E2E Validation Script Design

**Type**: Integration Pattern
**Plan**: 030-positional-orchestrator
**Spec**: [positional-orchestrator-spec.md](../positional-orchestrator-spec.md)
**Created**: 2026-02-10
**Status**: Draft

**Related Documents**:
- [Workshop #6: E2E Integration Testing](06-e2e-integration-testing.md) — Original E2E strategy (pre-implementation)
- [Workshop #12: ODS Design](12-ods-design.md) — Actual ODS implementation (supersedes Workshop #8)
- [Workshop #9: Concept Drift Remediation](09-concept-drift-remediation.md) — Two-domain boundary rules
- [Workshop #10: Node Restart Event](10-node-restart-event.md) — Restart protocol via events
- [Plan 032 E2E](../../../test/e2e/node-event-system-visual-e2e.ts) — Most recent prior art (41-step hybrid E2E)
- [Phase 7 Worked Example](../tasks/phase-7-orchestration-entry-point/examples/worked-example.ts) — Loop demonstration
- [Phase 6 Worked Example (ODS)](../tasks/phase-6-ods-action-handlers/examples/worked-example-ods-dispatch.ts) — ODS dispatch demonstration
- [Phase 6 Worked Example (Two-Domain)](../tasks/phase-6-ods-action-handlers/examples/worked-example-two-domain-boundary.ts) — Event system domain boundary

---

## Purpose

Design the Phase 8 E2E validation script that proves the entire Plan 030 orchestration system works end-to-end. Workshop #6 defined the strategy before implementation; this workshop reconciles that strategy with what was actually built across Phases 1-7 and Plan 032, and produces a concrete design the implementation can follow.

## Key Questions Addressed

- What changed since Workshop #6 was written? What assumptions no longer hold?
- Should the E2E be a CLI-driven script or an in-process script?
- How does the question/answer lifecycle actually flow through the event system?
- What test infrastructure already exists and what must be created?
- What does the 4-line, 8-node test graph look like as actual YAML fixtures?

---

## Workshop #6 Reconciliation: What Changed

Workshop #6 was written on 2026-02-05, before Phases 1-7 were implemented. Several of its assumptions no longer hold. This section is the authoritative reconciliation.

### Assumption 1: `cg wf run` CLI command exists

**Workshop #6 assumed**: A `cg wf run <slug>` command triggers the orchestration loop from the CLI. The E2E test calls this command repeatedly.

**Reality**: `cg wf run` does not exist. The plan explicitly deferred CLI/web wiring as out of scope. The orchestration system is in-process only — `IOrchestrationService.get(ctx, slug)` returns a handle, `handle.run()` executes the loop.

**Resolution**: The E2E script calls `handle.run()` directly (in-process), matching AC-11: "Tests call `IGraphOrchestration.run()` directly." The test harness acts as agents via CLI commands for agent-facing operations. This is exactly the hybrid model that the Plan 032 E2E uses.

### Assumption 2: ONBAS produces `resume-node` and `question-pending` request types

**Workshop #6 assumed**: The loop exits on `question-pending` (question surfaced), and re-entering triggers `resume-node` after the answer.

**Reality**: ONBAS was simplified (Workshop #11 / Subtask 001). It only produces `start-node` and `no-action`. The `resume-node` and `question-pending` request types are vestigial — they predate Plan 032 (Node Event System) and were designed for a world where the orchestrator directly managed question lifecycle. Once the event system took that over, these types became dead code. They remain in the schema for exhaustive-switch safety but nothing constructs them. ONBAS ignores `waiting-question` nodes (`return null`), and ODS returns `UNSUPPORTED_REQUEST_TYPE` if either type somehow arrives.

The question/answer lifecycle flows entirely through the event system, with control passing between three actors. **Critical**: events have multiple subscribers — the CLI processes as subscriber `'cli'` and the orchestrator processes as subscriber `'orchestrator'`. Each subscriber stamps independently, so the same event fires handlers for both subscribers. Handlers are idempotent on state but each subscriber gets its own stamp.

```
AGENT has control
  → [CLI] cg wf node ask — raises question:ask event
  → CLI subscriber: handleQuestionAsk fires
    → sets waiting-question, records pending_question_id
    → stamps event as 'cli'
  → Agent yields control implicitly: the status transition to
    waiting-question makes the node invisible to ONBAS (it skips
    non-ready nodes). The agent doesn't call a "yield" API — the
    act of asking a question IS the yield. Node is blocked.

ORCHESTRATOR has control (settles, observes)
  → [IN-PROCESS] handle.run()
  → Settle: processGraph('orchestrator') finds question:ask unstamped
    for 'orchestrator' — handleQuestionAsk fires again
    → status already waiting-question (idempotent)
    → stamps event as 'orchestrator'
    THIS IS THE SEAM: a future orchestrator-specific handler could
    detect question events here and notify a UI, or in headless
    automation scenarios, programmatically trigger restart.
  → ONBAS: waiting-question → skip → no-action(all-waiting)
  → Orchestrator yields. Nothing to do — waiting for human.

HUMAN answers
  → [CLI] cg wf node answer — raises question:answer event
  → CLI subscriber: handleQuestionAnswer fires
    → cross-stamps original ask event as 'answer-linked'
    → stamps answer event as 'answer-recorded'
    → does NOT change node status (domain boundary!)
  → Answer recorded. Node still waiting-question.

ORCHESTRATOR has control (decides to restart)
  → [CLI*] cg wf node raise-event node:restart
    (* E2E uses CLI as test convenience. In production, the
       orchestrator raises events in-process as subscriber
       'orchestrator' — the event would be stamped 'orchestrator'
       directly and settle would find it already processed.
       CLI is the agent-facing interface, not the orchestrator's.)
  → E2E: CLI subscriber stamps event as 'cli'
    (Production: orchestrator subscriber stamps as 'orchestrator')
  → handleNodeRestart fires:
    → sets restart-pending, clears pending_question_id
  → [IN-PROCESS] handle.run()
  → Settle: processGraph('orchestrator') finds unstamped events:
    • question:answer — handleQuestionAnswer fires (record-only, stamps)
    • node:restart — E2E: unstamped for 'orchestrator', fires + stamps
      (Production: already stamped for 'orchestrator', skipped)
  → Reality builder: restart-pending → computed ready
  → ONBAS: ready → start-node
  → ODS: startNode() → starting, pod.execute() fire-and-forget
  → Orchestrator yields. Agent has the node again.
```

**Resolution**: The E2E must exercise this full control-handoff sequence. No `resume-node` or `question-pending` in the loop. The orchestrator explicitly raises `node:restart` after the human answers — this is the orchestrator's decision, not the event domain's. The multi-subscriber settle step is where future question-aware orchestrator logic would be added.

### Assumption 3: ODS starts nodes and they "become running" for the orchestrator to discover

**Workshop #6 assumed**: ODS sets status to `running` and returns.

**Reality**: ODS calls `graphService.startNode()` which transitions `pending → starting` (or `restart-pending → starting`), then creates a pod and calls `pod.execute()` without awaiting. The node status is `starting`, not `running`. The agent then calls `cg wf node accept` which fires a `node:accept` event → EHS sets `agent-accepted` status. Eventually `cg wf node end` fires completion events.

**Resolution**: The test must follow the actual agent lifecycle:
1. ODS starts node → status becomes `starting`
2. Test as agent: `accept` → status becomes `agent-accepted`
3. Test as agent: save outputs, then `end` → status becomes `complete`

### Assumption 4: Integration tests use `FakePodManager` with `FakePodBehavior`

**Workshop #6 assumed**: An integration test layer with `createOrchestrationTestHarness()` that uses `FakePodBehavior` to configure deterministic pod outcomes.

**Reality**: The Phase 8 plan tasks (8.1-8.12) describe integration tests, not a separate integration test layer. The existing `FakePodManager` (from Phase 4) tracks pod creation but doesn't have the `FakePodBehavior` concept. The actual `PodManager` creates `AgentPod` or `CodePod` instances — and in the E2E, pod execution is fire-and-forget while the test harness acts as the agent.

**Resolution**: No `FakePodBehavior` is needed. The E2E exercises the real system. The "integration tests" in tasks 8.2-8.8 are actually E2E tests with the in-process hybrid model — they use real services with real filesystem, and the test harness provides agent behavior via CLI.

### Assumption 5: Shared CLI test runner needs to be extracted

**Workshop #6 assumed**: Extract helpers from the 028 E2E to a shared module at `test/e2e/lib/cli-test-runner.ts`.

**Reality**: This extraction already happened. `test/helpers/positional-graph-e2e-helpers.ts` contains `createTestServiceStack`, `runCli`, `createTestWorkspaceContext`, `assert`, `unwrap`, `banner`, `createStepCounter`, `cleanup`. The Plan 032 E2E already uses it.

**Resolution**: Reuse the existing shared helpers. No extraction needed.

---

## E2E Architecture Decision: Hybrid In-Process + CLI

### Why Hybrid?

The orchestrator is an in-process component. It runs in a loop, calling services that read/write the filesystem. Making it go through a CLI command would require:
1. Implementing `cg wf run` (out of scope per plan)
2. Dealing with subprocess marshalling for every loop iteration
3. Losing visibility into loop internals (iterations, actions taken)

But agent actions (start, accept, save-output, ask, answer, end) MUST go through the CLI because:
1. They test the real CLI command surface
2. They exercise the real event system (raise-event wiring)
3. They prove the agent-facing interface works correctly

### The Hybrid Model

```
┌──────────────────────────────────────────────────────────────┐
│                    E2E Test Script                             │
│                                                               │
│  IN-PROCESS (orchestrator territory):                         │
│  ├─ Create graph, lines, nodes (service calls)                │
│  ├─ Wire inputs (service calls)                               │
│  ├─ Build OrchestrationService from real container             │
│  ├─ handle = svc.get(ctx, slug)                               │
│  ├─ result = handle.run()  ← TRIGGERS THE LOOP               │
│  ├─ Assert: result.stopReason, result.actions, etc.           │
│  └─ Load state, verify node statuses                          │
│                                                               │
│  CLI SUBPROCESS (agent territory):                            │
│  ├─ cg wf workspace add ...                                   │
│  ├─ cg wf node accept <slug> <nodeId>                         │
│  ├─ cg wf node save-output-data <slug> <nodeId> <key> <val>  │
│  ├─ cg wf node end <slug> <nodeId>                            │
│  ├─ cg wf node ask <slug> <nodeId> --type ... --text ...      │
│  ├─ cg wf node answer <slug> <nodeId> <qId> <answer>         │
│  └─ cg wf trigger <slug> <lineId>                             │
│                                                               │
│  SETTLE (between loop iterations):                            │
│  ├─ EHS.processGraph(state, 'orchestrator', 'cli')            │
│  └─ graphService.persistGraphState()                          │
│       ↑ Done automatically by GraphOrchestration.run()        │
└──────────────────────────────────────────────────────────────┘
```

### Why Not Full-CLI E2E?

Without `cg wf run`, we can't do full-CLI. But this is actually better:

1. **Faster execution**: No subprocess overhead for the loop
2. **Better diagnostics**: We see `OrchestrationRunResult` with actions, stop reason, iterations
3. **Matches AC-11**: "Tests call `IGraphOrchestration.run()` directly"
4. **Matches prior art**: Plan 032 E2E uses the same hybrid model
5. **Still exercises CLI**: Agent actions go through the real CLI binary

---

## Multi-Subscriber Event Model

Understanding this model is prerequisite for understanding the settle phase and the question lifecycle. The Plan 032 event system uses **per-subscriber stamps** — every event can be processed independently by multiple subscribers.

### How It Works

Each event has a `stamps` field: `Record<subscriberName, EventStamp>`. When a subscriber processes an event, it writes its own stamp. An event is "unstamped" for a subscriber if `!event.stamps?.[subscriber]`.

```
Event: question:ask (raised by agent via CLI)
  stamps: {
    "cli":          { stamped_at: "...", action: "state-transition" }
    "orchestrator": { stamped_at: "...", action: "state-transition" }  ← added later
  }
```

### Two Processing Paths

The same event gets processed twice — once by each subscriber:

| When | Who | Subscriber | Call Site |
|------|-----|-----------|-----------|
| CLI command runs | CLI service | `'cli'` | `eventService.handleEvents(state, nodeId, 'cli', 'cli')` |
| Orchestration loop iterates | GraphOrchestration.run() | `'orchestrator'` | `eventHandlerService.processGraph(state, 'orchestrator', 'cli')` |

Both subscribers run the **same handlers** (all 7 handlers are registered as `context: 'both'`). The state mutations are **idempotent** — setting `status = 'waiting-question'` when it's already `'waiting-question'` is a no-op. But each subscriber stamps independently, proving it saw the event.

### Why This Matters for the E2E

1. **Settle is never a no-op.** When the orchestrator's `processGraph('orchestrator')` runs after CLI actions, it finds events unstamped for `'orchestrator'` and fires handlers. The state is already correct (CLI applied it), but the handlers run.

2. **This is the extension seam.** The orchestrator could register its own handlers that only fire for subscriber `'orchestrator'`. For example, a future `handleQuestionAskOrchestrator` could detect questions and notify a UI, or in headless automation, programmatically trigger restart. In the normal interactive case, the human explicitly triggers restart. The multi-subscriber model was designed for exactly this — different subscribers can react differently to the same event.

3. **The E2E must verify stamps from both subscribers.** After a full question lifecycle, each event should have stamps from both `'cli'` and `'orchestrator'`, proving both paths processed it.

### Idempotency Guarantee

Calling `processGraph` twice with the same subscriber yields `eventsProcessed: 0` on the second call — events already stamped by that subscriber are skipped. This relies on persisting state between calls (which `GraphOrchestration.run()` does: load → processGraph → persist).

### Future Extension: Orchestrator-Specific Handlers

Today both subscribers run the same 7 handlers (all registered as `context: 'both'`). This means `handleQuestionAsk` fires identically for both `'cli'` and `'orchestrator'` — the same idempotent state mutations.

The handler registry already supports `context: 'both' | 'cli' | 'web'`. The extension mechanism for orchestrator-aware question handling would be:

1. **Add an `'orchestrator'` context** to the handler registry
2. **Register an orchestrator-specific handler** like `handleQuestionAskOrchestrator` with `context: 'orchestrator'`
3. This handler fires *only* during the orchestration loop's **settle phase** (`processGraph(state, 'orchestrator', 'cli')` in `graph-orchestration.ts:79`) — the CLI never triggers it
4. The generic `handleQuestionAsk` (context: `'both'`) continues to do its record-keeping for everyone
5. The orchestrator-specific handler adds orchestration-aware behaviour on top — e.g., notifying a connected UI that a question needs attention, or in headless/automation scenarios, auto-raising `node:restart` when an answer arrives from a programmatic source

In the normal interactive case, the restart is **explicitly triggered** by the human or UI — not automatic. The human answers the question and then decides when to restart. Auto-restart would only apply to automation pipelines where questions have programmatic answers and no human is in the loop.

This is a clean additive change: no existing handlers are modified, the CLI path is untouched. The E2E doesn't test this yet (it's future scope), but the multi-subscriber model is the prerequisite seam, and the E2E proves that seam works by exercising both subscriber paths.

---

## Question/Answer Lifecycle: The Complete Flow

This is the most complex pattern to test. The critical thing to track is **who has control of the node** at each moment. Control passes back and forth between the orchestrator and the agent — getting this wrong means state corruption or deadlocks.

### Control Model

```
ORCHESTRATOR has control    ←→    AGENT has control
(decides, dispatches)              (does work, communicates)

The handoff points are:
  ORCHESTRATOR → AGENT:  ODS fires pod.execute() (fire-and-forget)
  AGENT → ORCHESTRATOR:  Agent calls CLI end/ask/error (raises event, yields control)
```

### Phase A: Orchestrator Starts the Node

```
┌─ ORCHESTRATOR has control ────────────────────────────────────┐
│                                                                │
│  1. [IN-PROCESS] handle.run()                                  │
│     → Settle: processGraph() (no pending events yet)           │
│     → Reality: node X is ready                                 │
│     → ONBAS: ready → start-node(X)                             │
│     → ODS: graphService.startNode() → status: pending→starting │
│     → ODS: pod.execute() — FIRE AND FORGET                     │
│     → Loop continues: ONBAS sees starting → skip               │
│     → no-action(all-waiting) → loop exits                      │
│                                                                │
│  result.stopReason = 'no-action'                               │
│  result.actions = [{ request: start-node(X) }]                 │
│                                                                │
│  ─── HANDOFF: Orchestrator yields. Agent now has the node. ─── │
└────────────────────────────────────────────────────────────────┘
```

### Phase B: Agent Does Work, Asks Question

```
┌─ AGENT has control ───────────────────────────────────────────┐
│                                                                │
│  2. [CLI] cg wf node accept <slug> <nodeId>                   │
│     → raises node:accept event                                 │
│     → EHS handler: starting → agent-accepted                   │
│     Agent is now working.                                      │
│                                                                │
│  3. [CLI] cg wf node ask <slug> <nodeId> --type single \      │
│           --text "Which language?" --options TypeScript Python  │
│     → raises question:ask event                                │
│     → EHS handler: sets waiting-question, pending_question_id  │
│     → status: agent-accepted → waiting-question                │
│                                                                │
│  ─── Agent has YIELDED control by asking a question. ───────── │
│  The yield is implicit: the status transition to waiting-       │
│  question makes the node invisible to ONBAS (it returns null   │
│  for non-ready nodes). There is no "yield" API call — the act  │
│  of asking a question IS the yield. Neither agent nor           │
│  orchestrator is actively doing anything — the node waits for  │
│  a human answer.                                                │
└────────────────────────────────────────────────────────────────┘
```

### Phase C: Orchestrator Settles and Observes the Blocked Node

```
┌─ ORCHESTRATOR has control ────────────────────────────────────┐
│                                                                │
│  4. [IN-PROCESS] handle.run()                                  │
│                                                                │
│     SETTLE: processGraph(state, 'orchestrator', 'cli')         │
│     ┌──────────────────────────────────────────────────────┐   │
│     │ question:ask event: unstamped for 'orchestrator'     │   │
│     │ → handleQuestionAsk fires:                           │   │
│     │   • status = 'waiting-question' (already set, noop)  │   │
│     │   • pending_question_id set (already set, noop)      │   │
│     │   • stamps event as 'orchestrator'                   │   │
│     │                                                      │   │
│     │ State mutations are idempotent — CLI already applied  │   │
│     │ them. But the orchestrator's stamp proves it saw the  │   │
│     │ event. THIS IS THE SEAM: a future orchestrator-only   │   │
│     │ handler could detect questions here and notify a UI,  │   │
│     │ or trigger restart in headless automation scenarios.   │   │
│     └──────────────────────────────────────────────────────┘   │
│                                                                │
│     → Reality: node X is waiting-question                      │
│     → ONBAS: waiting-question → skip (return null)             │
│     → No other ready nodes → no-action(all-waiting)            │
│                                                                │
│  result.stopReason = 'no-action'                               │
│  result.actions = [] (nothing started)                          │
│                                                                │
│  Orchestrator sees the node is blocked on a question.          │
│  It cannot do anything until a human answers.                  │
│  ─── Orchestrator yields. Waiting for human. ──────────────── │
└────────────────────────────────────────────────────────────────┘
```

### Phase D: Human Answers, Orchestrator Restarts

```
┌─ HUMAN (external) ────────────────────────────────────────────┐
│                                                                │
│  5. [CLI] cg wf node answer <slug> <nodeId> <qId> "TypeScript"│
│     → raises question:answer event                             │
│     → CLI subscriber: handleQuestionAnswer fires               │
│       • cross-stamps original ask event as 'answer-linked'     │
│       • stamps answer event as 'answer-recorded' (cli)         │
│       • Does NOT change node status (domain boundary!)         │
│     → Node is STILL waiting-question                           │
│                                                                │
│  The answer is recorded but the node hasn't moved yet.         │
│  Someone must decide to restart it. That's the orchestrator's  │
│  job — not the event domain's.                                 │
└────────────────────────────────────────────────────────────────┘

┌─ ORCHESTRATOR has control ────────────────────────────────────┐
│                                                                │
│  6. [CLI*] cg wf node raise-event <slug> <nodeId> node:restart│
│            '{"reason":"question-answered"}'                     │
│     → handleNodeRestart fires:                                 │
│       • sets restart-pending, clears pending_question_id       │
│     → status: waiting-question → restart-pending               │
│                                                                │
│     * E2E TEST: Uses CLI as test harness convenience.          │
│       Stamps event as subscriber 'cli'.                        │
│     * PRODUCTION: Orchestrator raises events IN-PROCESS        │
│       (calling event service directly, not shelling out).      │
│       Stamps event as subscriber 'orchestrator'.               │
│       CLI is the agent-facing interface — agents are external  │
│       processes. The orchestrator is entirely in-process.       │
│                                                                │
│  7. [IN-PROCESS] handle.run()                                  │
│                                                                │
│     SETTLE: processGraph(state, 'orchestrator', 'cli')         │
│     ┌──────────────────────────────────────────────────────┐   │
│     │ E2E: Finds 2 events unstamped for 'orchestrator':    │   │
│     │                                                      │   │
│     │ 1. question:answer → handleQuestionAnswer fires      │   │
│     │    • cross-stamps ask event as 'answer-linked'       │   │
│     │    • stamps answer event as 'orchestrator'           │   │
│     │    • no status change (record-only)                  │   │
│     │                                                      │   │
│     │ 2. node:restart → handleNodeRestart fires            │   │
│     │    • status = restart-pending (already set, noop)    │   │
│     │    • pending_question_id cleared (already, noop)     │   │
│     │    • stamps restart event as 'orchestrator'          │   │
│     │                                                      │   │
│     │ PRODUCTION: node:restart already stamped for          │   │
│     │ 'orchestrator' (raised in-process) — only             │   │
│     │ question:answer needs processing here.                │   │
│     └──────────────────────────────────────────────────────┘   │
│                                                                │
│     → Reality builder: restart-pending → computed ready         │
│     → ONBAS: ready → start-node(X)                             │
│     → ODS: graphService.startNode() → starting                 │
│     → ODS: pod.execute() — FIRE AND FORGET                     │
│     → Loop: starting → skip → no-action(all-waiting)           │
│                                                                │
│  ─── HANDOFF: Orchestrator yields. Agent has the node again. ──│
└────────────────────────────────────────────────────────────────┘
```

### Phase E: Agent Completes

```
┌─ AGENT has control ───────────────────────────────────────────┐
│                                                                │
│  8. [CLI] cg wf node accept <slug> <nodeId>                   │
│     → starting → agent-accepted (re-accept after restart)      │
│                                                                │
│  9. [CLI] cg wf node save-output-data <slug> <nodeId> ...     │
│  10.[CLI] cg wf node end <slug> <nodeId>                      │
│     → raises completion events                                 │
│     → status: agent-accepted → complete                        │
│                                                                │
│  ─── Agent has FINISHED. Control returns to orchestrator. ──── │
└────────────────────────────────────────────────────────────────┘
```

### Control Summary

| Step | Who Has Control | Status | Yield Mechanism | What Happens |
|------|----------------|--------|-----------------|-------------|
| 1 | Orchestrator | pending → starting | ONBAS sees `starting` → skip → no-action exits loop | Loop starts node, fires pod |
| 2 | Agent | starting → agent-accepted | — (agent still working) | Agent accepts work |
| 3 | Agent | agent-accepted → waiting-question | Status transition makes node invisible to ONBAS | Agent asks question — this IS the yield |
| — | Nobody (blocked) | waiting-question | — | Waiting for human answer |
| 4 | Orchestrator | waiting-question | ONBAS returns null for waiting → no-action exits loop | Loop settles events, observes blocked node |
| 5 | Human | waiting-question (answer recorded) | — | Answer stored, status unchanged |
| 6 | Orchestrator | waiting-question → restart-pending | — (continues to step 7) | Orchestrator raises node:restart |
| 7 | Orchestrator | restart-pending → starting | ONBAS sees `starting` → skip → no-action exits loop | Loop re-starts node, fires pod |
| 8-10 | Agent | starting → agent-accepted → complete | Completion event IS the yield | Agent finishes work |

### Who Raises `node:restart`?

This is the orchestrator's responsibility. Workshop #10 (Node Restart Event) defines the protocol; the orchestrator decides WHEN to restart.

**In the E2E**: The test script IS the orchestrator for question lifecycle. After answering, it explicitly raises `node:restart` via CLI. This is correct because:

- The event domain (handlers) only RECORDS — it doesn't make restart decisions
- The graph domain (orchestrator) DECIDES and ACTS — including when to restart
- A production orchestrator daemon would do the same thing between loop passes
- `GraphOrchestration.run()` currently has no question-aware logic (it only calls ONBAS, which skips waiting-question nodes). A future enhancement could add question detection to the loop, but that's not an E2E concern

---

## The Test Graph: 4 Lines, 8 Nodes

### Structure (from Workshop #6, validated against implementation)

```
LINE 0: User Input (auto transition)
  └── get-spec (user-input)

LINE 1: Specification (auto transition)
  ├── spec-builder (agent, serial)
  └── spec-reviewer (agent, serial)

LINE 2: Implementation (MANUAL transition to Line 3)
  ├── coder (agent, serial, has question)
  └── tester (code, serial)

LINE 3: PR Preparation (parallel + serial)
  ├── alignment-tester (agent, parallel)
  ├── pr-preparer (agent, parallel)
  └── pr-creator (agent, serial, after both parallel)
```

### Work Unit Definitions

Minimal YAML files sufficient for the graph service to load:

```yaml
# units/sample-get-spec/unit.yaml
slug: sample-get-spec
name: Get Spec
type: user-input
description: User provides the initial specification
outputs:
  - name: spec
    type: string
```

```yaml
# units/sample-spec-builder/unit.yaml
slug: sample-spec-builder
name: Spec Builder
type: agent
description: Builds a detailed specification from user input
inputs:
  - name: spec
    type: string
    required: true
outputs:
  - name: spec
    type: string
```

```yaml
# units/sample-coder/unit.yaml
slug: sample-coder
name: Coder
type: agent
description: Writes code based on the specification
inputs:
  - name: spec
    type: string
    required: true
outputs:
  - name: language
    type: string
  - name: code
    type: string
```

```yaml
# units/sample-tester/unit.yaml
slug: sample-tester
name: Tester
type: code
description: Runs tests against the code
inputs:
  - name: language
    type: string
    required: true
  - name: code
    type: string
    required: true
outputs:
  - name: test_output
    type: string
```

The remaining units (spec-reviewer, alignment-tester, pr-preparer, pr-creator) follow the same pattern with their respective input/output schemas from the Input Wiring table in Workshop #6.

### Input Wiring Map

| Target Node | Input Key | Source Node | Output Key |
|-------------|-----------|-------------|------------|
| spec-builder | spec | get-spec | spec |
| spec-reviewer | spec | spec-builder | spec |
| coder | spec | spec-reviewer | reviewed_spec |
| tester | language | coder | language |
| tester | code | coder | code |
| alignment-tester | spec | spec-reviewer | reviewed_spec |
| alignment-tester | code | coder | code |
| alignment-tester | test_output | tester | test_output |
| pr-preparer | spec | spec-reviewer | reviewed_spec |
| pr-preparer | test_output | tester | test_output |
| pr-creator | pr_title | pr-preparer | pr_title |
| pr-creator | pr_body | pr-preparer | pr_body |

---

## E2E Script Structure: Act-Based Organization

Following the Plan 032 E2E pattern of organizing by narrative acts:

### ACT 0: Setup (Graph Construction)

```
Step 1:  Create temp workspace, register with CLI
Step 2:  Write work unit YAML files
Step 3:  Create graph: cg wf create orch-e2e-test
Step 4:  Add lines (line-000 auto-created, add line-001, line-002, line-003)
Step 5:  Set line-002 transition=manual
Step 6:  Add all 8 nodes to their lines
Step 7:  Set parallel execution on alignment-tester and pr-preparer
Step 8:  Wire all 12 inputs
Step 9:  Verify graph structure via cg wf status
```

### ACT 1: User Input (Line 0)

**Pattern tested**: User-input node (no pod, ODS handles directly)

```
Step 10: [IN-PROCESS] Build orchestration stack from container
Step 11: [IN-PROCESS] handle = svc.get(ctx, 'orch-e2e-test')
Step 12: [IN-PROCESS] result = handle.run()
         Assert: ONBAS found get-spec (ready, user-input)
         Assert: ODS returned ok (user-input is a no-op)
         Assert: result.stopReason === 'no-action'
         Assert: result.actions[0].request.type === 'start-node'
         Assert: result.actions[0].request.nodeId matches get-spec

Step 13: [CLI] cg wf node start <slug> <getSpec>
Step 14: [CLI] cg wf node save-output-data <slug> <getSpec> spec "Create isPrime..."
Step 15: [CLI] cg wf node end <slug> <getSpec>
Step 16: [IN-PROCESS] Verify get-spec status === 'complete'
```

### ACT 2: Specification Agents (Line 1 — Serial Chain)

**Patterns tested**: Serial agent execution, input wiring from user-input, context inheritance (new session for first agent on line)

```
Step 17: [IN-PROCESS] result = handle.run()
         Assert: spec-builder started (first ready node on line 1)
         Assert: 1 action taken

Step 18: [CLI] cg wf node accept <slug> <specBuilder>
Step 19: [CLI] cg wf node save-output-data <slug> <specBuilder> spec "Detailed spec..."
Step 20: [CLI] cg wf node end <slug> <specBuilder>

Step 21: [IN-PROCESS] result = handle.run()
         Assert: spec-reviewer started (serial successor, now ready)
         Assert: 1 action taken

Step 22: [CLI] cg wf node accept <slug> <specReviewer>
Step 23: [CLI] cg wf node save-output-data <slug> <specReviewer> reviewed_spec "APPROVED..."
Step 24: [CLI] cg wf node end <slug> <specReviewer>
```

### ACT 3: Question/Answer Cycle (Line 2 — Coder Agent)

**Patterns tested**: Question ask, question answer, node restart via event system, re-start after restart

```
Step 25: [IN-PROCESS] result = handle.run()
         Assert: coder started (first ready on line 2, auto transition from line 1)
         Assert: 1 action

Step 26: [CLI] cg wf node accept <slug> <coder>

Step 27: [CLI] cg wf node ask <slug> <coder> --type single --text "Which language?" --options TypeScript Python
         Record questionId from response

Step 28: [IN-PROCESS] result = handle.run()
         Assert: no-action (coder is waiting-question, nothing else ready)

Step 29: [CLI] cg wf node answer <slug> <coder> <questionId> "TypeScript"

Step 30: [CLI] cg wf node raise-event <slug> <coder> node:restart '{"reason":"question-answered"}'

Step 31: [IN-PROCESS] result = handle.run()
         Assert: coder re-started (restart-pending → ready → start-node)
         Assert: 1 action (start-node for coder)

Step 32: [CLI] cg wf node accept <slug> <coder>
Step 33: [CLI] cg wf node save-output-data <slug> <coder> language "TypeScript"
Step 34: [CLI] cg wf node save-output-data <slug> <coder> code "function isPrime..."
Step 35: [CLI] cg wf node end <slug> <coder>
```

### ACT 4: Code Node (Line 2 — Tester)

**Patterns tested**: Code node execution (type=code, no session tracking)

```
Step 36: [IN-PROCESS] result = handle.run()
         Assert: tester started (serial successor to coder)
         Assert: 1 action

Step 37: [CLI] cg wf node start <slug> <tester>
         (Code nodes may need explicit start via CLI rather than agent accept)
Step 38: [CLI] cg wf node save-output-data <slug> <tester> test_output "All tests pass..."
Step 39: [CLI] cg wf node end <slug> <tester>
```

### ACT 5: Manual Transition Gate

**Pattern tested**: Manual transition blocks next line

```
Step 40: [IN-PROCESS] result = handle.run()
         Assert: stopReason === 'no-action'
         Assert: Line 2 complete but line 3 blocked (transition=manual)
         Note: The no-action reason should indicate transition-blocked

Step 41: [CLI] cg wf trigger <slug> line-002
         Assert: success

Step 42: [IN-PROCESS] Verify line-003 transition is now open
```

### ACT 6: Parallel Execution (Line 3)

**Patterns tested**: Two parallel nodes start in one loop pass, serial successor waits

```
Step 43: [IN-PROCESS] result = handle.run()
         Assert: 2 actions taken (alignment-tester AND pr-preparer started)
         Assert: Both are start-node requests
         Assert: pr-creator NOT started (serial gate, both parallel incomplete)

Step 44: [CLI] Complete alignment-tester (accept, save alignment_result, end)
Step 45: [CLI] Complete pr-preparer (accept, save pr_title + pr_body, end)
```

### ACT 7: Serial After Parallel (Line 3 — pr-creator)

**Pattern tested**: Serial successor starts after all parallel predecessors complete

```
Step 46: [IN-PROCESS] result = handle.run()
         Assert: pr-creator started (both parallel done, serial gate open)
         Assert: 1 action

Step 47: [CLI] Complete pr-creator (accept, save pr_url, end)
```

### ACT 8: Graph Complete

**Pattern tested**: Graph reaches complete status, stopReason is graph-complete

```
Step 48: [IN-PROCESS] result = handle.run()
         Assert: stopReason === 'graph-complete'
         Assert: 0 actions taken (nothing to do)

Step 49: [IN-PROCESS] final reality = handle.getReality()
         Assert: reality.isComplete === true
         Assert: reality.totalNodes === 8
         Assert: reality.completedCount === 8
         Assert: all 8 nodes have status === 'complete'
```

### ACT 9: Cleanup

```
Step 50: [CLI] cg wf workspace remove ...
Step 51: Delete temp directory
Step 52: Print summary
```

---

## Error Path Testing

Workshop #6 Pattern 7 (Error Recovery) should be tested as a separate, smaller scenario — not as part of the main 8-node pipeline. Running the happy path and error path in the same graph would complicate the flow.

### Separate Error Test

```
ACT E: Error Recovery (Standalone)

Step E1: Create a minimal 1-line, 2-node graph
Step E2: Start node A via orchestrator
Step E3: [CLI] cg wf node accept <slug> <nodeA>
Step E4: [CLI] cg wf node error <slug> <nodeA> "Something went wrong"
         → raises node:error event → EHS sets blocked-error
Step E5: [IN-PROCESS] result = handle.run()
         Assert: stopReason includes 'graph-failed' or no-action
         Assert: reality shows nodeA as blocked-error
```

This keeps the main pipeline clean while still exercising the error path.

---

## Orchestration Stack Wiring for E2E

The E2E needs to wire a real `OrchestrationService` with all its dependencies. Based on how `registerOrchestrationServices` works in the container:

```typescript
// What the E2E needs to set up:

// 1. Real filesystem services (from shared helpers)
const { service, workspacePath, cleanup } = await createTestServiceStack('orch-e2e');
const ctx = createTestWorkspaceContext(workspacePath);

// 2. Event system (real, from Plan 032)
const nodeEventRegistry = new FakeNodeEventRegistry();
registerCoreEventTypes(nodeEventRegistry);
const eventHandlerRegistry = createEventHandlerRegistry();
const nodeEventService = new NodeEventService({
  registry: nodeEventRegistry,
  loadState: (slug) => service.loadGraphState(ctx, slug),
  persistState: (slug, state) => service.persistGraphState(ctx, slug, state),
});
const eventHandlerService = new EventHandlerService({
  nodeEventService,
  eventHandlerRegistry,
});

// 3. Orchestration stack (real, from Plan 030)
const onbas = new ONBAS();
const contextService = new AgentContextService();
const fs = new NodeFileSystemAdapter();  // or resolve from container
const podManager = new PodManager(fs);
const agentAdapter = new FakeAgentAdapter();  // Agents are simulated by CLI
const scriptRunner = new FakeScriptRunner();  // Code pods are simulated
const ods = new ODS({
  graphService: service,
  podManager,
  contextService,
  agentAdapter,
  scriptRunner,
});
const orchestrationService = new OrchestrationService({
  graphService: service,
  onbas,
  ods,
  eventHandlerService,
});

// 4. Get handle
const handle = await orchestrationService.get(ctx, GRAPH_SLUG);
```

### What's Real vs Fake

| Component | Real or Fake | Why |
|-----------|-------------|-----|
| Filesystem (NodeFileSystemAdapter) | Real | Tests actual YAML I/O, atomic writes |
| PositionalGraphService | Real | Full graph CRUD operations |
| NodeEventService | Real | Event recording and retrieval |
| EventHandlerService | Real | Event processing (settle) |
| ONBAS | Real | Walk algorithm with real reality |
| ODS | Real | Dispatch with real validation |
| AgentContextService | Real | Context resolution |
| PodManager | Real | Pod lifecycle tracking |
| GraphOrchestration | Real | The settle-decide-act loop |
| OrchestrationService | Real | Handle caching |
| AgentAdapter | Fake | No real LLM agents to invoke |
| ScriptRunner | Fake | No real scripts to execute |
| CLI (subprocess) | Real | Tests the actual CLI binary |

The only fakes are `AgentAdapter` and `ScriptRunner` — because there are no real agents or scripts. Everything else is real. This maximizes confidence that the system works end-to-end.

---

## File Structure

```
test/
├── e2e/
│   └── positional-graph-orchestration-e2e.ts      # Main E2E script (standalone)
├── integration/
│   └── positional-graph/
│       └── orchestration-e2e.test.ts              # Vitest wrapper (thin shell)
├── helpers/
│   └── positional-graph-e2e-helpers.ts            # Existing shared helpers
└── fixtures/
    └── orchestration-e2e/
        └── units/                                  # Work unit YAML files
            ├── sample-get-spec/unit.yaml
            ├── sample-spec-builder/unit.yaml
            ├── sample-spec-reviewer/unit.yaml
            ├── sample-coder/unit.yaml
            ├── sample-tester/unit.yaml
            ├── sample-alignment-tester/unit.yaml
            ├── sample-pr-preparer/unit.yaml
            └── sample-pr-creator/unit.yaml
```

### Vitest Wrapper Pattern (from Plan 032)

```typescript
// test/integration/positional-graph/orchestration-e2e.test.ts
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { describe, it } from 'vitest';

const CLI_PATH = 'apps/cli/dist/cli.cjs';

describe('Orchestration E2E', () => {
  const cliExists = existsSync(CLI_PATH);

  it.skipIf(!cliExists)(
    'drives 4-line 8-node pipeline to completion',
    () => {
      execSync(
        'npx tsx test/e2e/positional-graph-orchestration-e2e.ts',
        { stdio: 'inherit', timeout: 120_000 }
      );
    },
    120_000,
  );
});
```

---

## Patterns Exercised (Mapped to Workshop #6)

| # | Workshop #6 Pattern | How Exercised in E2E | Act |
|---|---------------------|---------------------|-----|
| 1 | User-input node (no pod) | get-spec: ODS returns ok, test provides data via CLI | ACT 1 |
| 2 | Agent node with Q&A cycle | coder: ask → answer → node:restart → re-start | ACT 3 |
| 3 | Parallel execution | alignment-tester + pr-preparer start in one run() | ACT 6 |
| 4 | Manual transition gate | line-002 blocks → trigger → line-003 opens | ACT 5 |
| 5 | Context inheritance | Validated via PodManager session tracking (integration-level) | Implicit |
| 6 | Code node (synchronous) | tester: started by ODS, test completes via CLI | ACT 4 |
| 7 | Error recovery | Separate error scenario (ACT E) | Standalone |

### AC Coverage

| AC | Description | Exercised By |
|----|-------------|-------------|
| AC-9 | Question lifecycle | ACT 3 (ask → answer → restart → re-start) |
| AC-11 | In-process testing | All acts (handle.run() called directly) |
| AC-12 | E2E without real agents | Entire script (test harness acts as agents) |
| AC-13 | FakePodManager | Implicit (PodManager tracks, no real pods execute) |
| AC-14 | Input wiring | ACT 2+ (inputs resolved in reality, passed to start-node) |

---

## Prior Art Patterns to Follow

### From Phase 7 Worked Example

- **7-section progressive structure** with descriptive comment blocks
- **Section headers** in console output: `━━━ Section N: Title ━━━`
- **Final "Done" checklist** summarizing what was demonstrated
- **Mix of real and fake objects** with clear rationale

### From Plan 032 E2E

- **Act-based organization** with narrative flow
- **`[IN-PROCESS]` / `[CLI]` annotations** making execution boundary explicit
- **try/finally cleanup** (improvement over Plan 032 which lacked this)
- **State verification pattern**: action → load state → assert fields
- **processGraph idempotency proof** at the end
- **Step counter** from shared helpers

### From Phase 6 Worked Examples

- **`buildFakeReality()` for unit-level validation** (not needed in E2E — we use real reality)
- **Real objects everywhere possible** (Two-Domain Boundary example uses 0 fakes)

---

## Implementation Notes

### The `node:restart` Coordination Issue

The test must raise `node:restart` after answering a question. This is the orchestrator's responsibility in the two-domain model. In a production system, this would be done by a question-monitoring component. In the E2E, the test script does it explicitly:

```typescript
// After answering the question
await runCli(['node', 'raise-event', slug, coderId, 'node:restart',
  JSON.stringify({ reason: 'question-answered' })], workspacePath);
```

This is the correct approach — the E2E test IS the orchestrator for question lifecycle management.

### Pod Execution Fire-and-Forget

ODS calls `pod.execute()` without awaiting. In the E2E, the FakeAgentAdapter means the pod doesn't actually do anything. The test harness then acts as the agent via CLI. The node progresses through statuses:

```
pending → starting (by ODS/startNode)
       → agent-accepted (by CLI accept)
       → waiting-question (by CLI ask, optional)
       → restart-pending (by CLI raise-event node:restart, if Q&A)
       → ready (by reality builder)
       → starting (by ODS/startNode again, if restarted)
       → agent-accepted (by CLI accept again)
       → complete (by CLI end)
```

### Settle Happens Automatically

`GraphOrchestration.run()` calls `processGraph()` at the start of each iteration (step 1 of the loop). This settles any pending events that were raised by CLI commands between iterations. The test does NOT need to call processGraph manually — the loop handles it.

---

## Open Questions

### Q1: Should the error test be inside the main graph or a separate graph?

**RESOLVED**: Separate graph. The main pipeline tests the happy path end-to-end with all 8 nodes. Error recovery uses a minimal graph to keep the test focused. This matches the Phase 8 task structure where 8.2-8.8 are individual pattern tests and 8.9 is the full pipeline.

### Q2: How to handle the work unit YAML files?

**Option A**: Create them as fixture files in `test/fixtures/orchestration-e2e/units/`
**Option B**: Generate them inline in the script (like Plan 032's `createWorkUnitFiles`)

**RESOLVED**: Option B (inline generation). This keeps the test self-contained and matches the Plan 032 pattern. The unit files are minimal — just `slug`, `name`, `type`, `inputs`, `outputs`. Generate them with a helper function.

### Q3: What if ODS's `startNode()` fails because the node isn't in `pending` or `restart-pending`?

ODS validates readiness via `!node.ready` check. The loop should never try to start a node that isn't ready because ONBAS only returns `start-node` for ready nodes. If this ever fails, it's a real bug exposed by the E2E.

### Q4: Should the E2E validate iteration counts and specific action sequences?

**RESOLVED**: Yes for key assertions (how many actions per run, which nodes were started), no for exact iteration counts (which may change if the loop internals evolve). Assert on `result.actions` array content, `result.stopReason`, and final state — not on `result.iterations`.

---

## Summary

The Phase 8 E2E validation script uses a **hybrid in-process + CLI model**:

1. **Orchestration** runs in-process via `handle.run()` (matching AC-11)
2. **Agent actions** run via CLI subprocess (testing real command surface)
3. **Event system** bridges the two: CLI raises events, loop settles them
4. **No `cg wf run` needed** — the test calls the loop directly
5. **All 7 patterns** from Workshop #6 exercised across 9 acts + error scenario
6. **~50 steps** driving an 8-node pipeline from start to graph-complete
7. **Real everything** except AgentAdapter and ScriptRunner

The question/answer lifecycle flows through the event system (Workshop #9/#10), with the test script raising `node:restart` as the orchestrator would in production.
