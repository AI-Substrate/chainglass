# Workshop: E2E Integration Testing for Orchestration

**Type**: Integration Pattern
**Plan**: 030-positional-orchestrator
**Spec**: [research-dossier.md](../research-dossier.md)
**Created**: 2026-02-05
**Status**: Draft

**Related Documents**:
- [workshops.md](../workshops.md) — Workshop index
- [positional-graph-reality.md](01-positional-graph-reality.md) — Snapshot type used in unit tests
- [orchestration-request.md](02-orchestration-request.md) — OR types validated in E2E
- [agent-context-service.md](03-agent-context-service.md) — Context rules validated in E2E
- [work-unit-pods.md](04-work-unit-pods.md) — FakePodManager used in integration tests
- [onbas.md](05-onbas.md) — Walk algorithm exercised end-to-end
- [E2E Execution Test (028)](../../../test/e2e/positional-graph-execution-e2e.test.ts) — Prior art: CLI-driven E2E for execution lifecycle
- [E2E Sample Flow (017)](../../../docs/how/dev/workgraph-run/e2e-sample-flow.ts) — Prior art: WorkGraph orchestrator E2E
- [028 CLI & E2E Workshop](../../028-pos-agentic-cli/workshops/cli-and-e2e-flow.md) — Command surface reference

---

## Purpose

Define the end-to-end integration testing strategy for the Plan 030 orchestration system. This workshop answers: **How do we prove that ONBAS, ODS, AgentContextService, PodManager, and the CLI all work together to drive a graph from start to completion — without real agents?**

The key insight from the user: **we are not using real agents in this plan**. Instead, we "do the agent's work for them" — calling CLI commands to ask questions, save outputs, and set state as if we were an agent. The orchestrator decides what to do; the test harness acts as every agent.

## Key Questions Addressed

- What does the E2E test graph look like (lines, nodes, execution modes)?
- How do we "act as the agent" via CLI commands?
- What does the orchestration loop look like from the test's perspective?
- How does the existing `positional-graph-execution-e2e.test.ts` pattern adapt for orchestration?
- What's the boundary between unit tests, integration tests, and E2E tests?
- How do we test question surfacing, context inheritance, and parallel execution?
- What test infrastructure exists and what needs to be created?

---

## Testing Philosophy: No Real Agents

### The Human-as-Agent Pattern

Plan 030 does not integrate real LLM agents. The orchestrator is the focus — it reads graph state, decides what to do next, and executes actions (start nodes, surface questions, resume nodes). To test this, the test harness plays the role of every agent:

```
┌─────────────────────────────────────────────────────────────┐
│                     Test Harness                             │
│                                                              │
│  1. Trigger orchestration loop                               │
│  2. Orchestrator calls ONBAS → "start node X"               │
│  3. ODS starts node X (status → running)                     │
│  4. Loop exits (node X now running, needs agent work)        │
│  5. Test harness "acts as agent":                            │
│     - cg wf node ask ... (ask a question)                    │
│     - cg wf node save-output-data ...                        │
│     - cg wf node end ...                                     │
│  6. Re-trigger orchestration loop                            │
│  7. Orchestrator sees question → surfaces it                 │
│  8. Test harness answers: cg wf node answer ...              │
│  9. Re-trigger orchestration loop                            │
│  10. Orchestrator resumes node, continues...                 │
│                                                              │
│  Repeat until graph is complete.                             │
└─────────────────────────────────────────────────────────────┘
```

### Why This Works

The orchestration system is designed around the **orchestration loop** pattern from Workshop #5 (ONBAS):

```
ONBAS returns → ODS executes → State updated → Reality rebuilt → ONBAS returns again
```

Between ODS executing "start node" and the node completing, **something external must do the work**. In production, that's an agent. In tests, that's the test harness calling CLI commands. The orchestrator doesn't know or care — it only reads state.

---

## Test Pyramid for Plan 030

### Layer 1: Unit Tests (Pure Functions)

Already covered by individual workshops. No agents, no CLI, no filesystem.

| Component | Test Approach | Dependencies |
|-----------|---------------|--------------|
| `walkForNextAction` (ONBAS) | `buildFakeReality` → assert OR | None (pure function) |
| `getContextSource` (AgentContextService) | `buildFakeReality` → assert result | None (pure function) |
| OR type guards | Direct construction → assert shape | None |
| `buildPositionalGraphReality` | Mock service calls → assert snapshot | Mocked `getStatus` |

### Layer 2: Integration Tests (Service Layer)

Test multiple services wired together, using `FakePodManager` + `FakeFileSystem`.

| Test | What It Proves |
|------|---------------|
| ONBAS + Reality Builder | Walk produces correct OR from real service state |
| ODS + PodManager | ODS correctly creates/manages pods for each OR type |
| ODS + AgentContextService | Context inheritance rules applied when starting agents |
| Orchestration Loop | Loop correctly cycles ONBAS → ODS → rebuild |

### Layer 3: E2E Tests (CLI-Driven)

Test the full stack via `cg wf` CLI commands. The test harness is a TypeScript script that:
1. Creates a graph with the CLI
2. Triggers the orchestration loop via CLI (`cg wf run` or equivalent)
3. Observes what the orchestrator did (node started, question surfaced)
4. Acts as the agent (save outputs, ask questions, answer questions)
5. Re-triggers the loop
6. Validates final state

**This is the primary focus of this workshop.**

---

## E2E Test Graph: The Orchestration Pipeline

### Graph Structure

Based on the established 028 E2E test graph but adapted to exercise orchestration patterns. Line 0 is the reserved user-input line — the user provides the initial spec, which then flows into agent nodes on subsequent lines. 4 lines, 8 nodes:

```
┌─────────────────────────────────────────────────────────────┐
│ LINE 0: User Input (reserved, auto transition)               │
│                                                              │
│   [get-spec]                                                 │
│   (user-input)                                               │
│                                                              │
│   Patterns tested:                                           │
│   - user-input node (no pod, ODS handles directly)           │
│   - Line 0 reserved for setup / user input                   │
└─────────────────────────────────────────────────────────────┘
                              │ auto transition
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ LINE 1: Specification (serial, auto transition)              │
│                                                              │
│   [spec-builder]  →  [spec-reviewer]                         │
│   (agent)            (agent)                                 │
│                                                              │
│   Patterns tested:                                           │
│   - agent nodes in serial chain                              │
│   - input from user-input node (spec-builder ← get-spec)     │
│   - serial gate (reviewer waits for builder)                 │
│   - cross-node input wiring                                  │
│   - context inheritance (builder inherits from none → new,   │
│     reviewer inherits from builder)                          │
└─────────────────────────────────────────────────────────────┘
                              │ auto transition
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ LINE 2: Implementation (serial, MANUAL transition to Line 3) │
│                                                              │
│   [coder]  →  [tester]                                       │
│   (agent, Q&A)  (code)                                       │
│                                                              │
│   Patterns tested:                                           │
│   - agent node with question/answer cycle                    │
│   - code node (simple execution, no session)                 │
│   - context inheritance (coder inherits from spec-reviewer)  │
│   - manual transition gate on line completion                │
└─────────────────────────────────────────────────────────────┘
                              │ manual transition (must trigger)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ LINE 3: PR Preparation (parallel + serial)                   │
│                                                              │
│   [alignment-tester] ═══╗                                    │
│   (agent, parallel)     ║                                    │
│                         ╠══► [pr-creator]                    │
│   [pr-preparer]    ═════╝    (agent, serial)                 │
│   (agent, parallel)                                          │
│                                                              │
│   Patterns tested:                                           │
│   - parallel execution (two nodes start independently)       │
│   - serial gate after parallel (pr-creator waits for both)   │
│   - context inheritance for parallel nodes (new context)     │
│   - multiple nodes completing before serial successor        │
└─────────────────────────────────────────────────────────────┘
```

### Input Wiring

| Node | Input | Source |
|------|-------|--------|
| spec-builder | spec | get-spec.spec |
| spec-reviewer | spec | spec-builder.spec |
| coder | spec | spec-reviewer.reviewed_spec (from_unit) |
| tester | language | coder.language |
| tester | code | coder.code |
| alignment-tester | spec | spec-reviewer.reviewed_spec (from_unit) |
| alignment-tester | code | coder.code |
| alignment-tester | test_output | tester.test_output |
| pr-preparer | spec | spec-reviewer.reviewed_spec (from_unit) |
| pr-preparer | test_output | tester.test_output |
| pr-creator | pr_title | pr-preparer.pr_title |
| pr-creator | pr_body | pr-preparer.pr_body |

### Node Types and Expected Behavior

| Node | Unit Type | Has Questions? | Outputs |
|------|-----------|---------------|---------|
| get-spec | user-input | No | `spec` |
| spec-builder | agent | No | `spec` |
| spec-reviewer | agent | No | `reviewed_spec` |
| coder | agent | Yes ("Which language?") | `language`, `code` |
| tester | code | No | `test_output` |
| alignment-tester | agent | No | `alignment_result` |
| pr-preparer | agent | No | `pr_title`, `pr_body` |
| pr-creator | agent | No | `pr_url` |

---

## E2E Flow: Step by Step

The test is a sequential script that alternates between **triggering the orchestrator** and **acting as the agent**. Each section shows what the test does and what it validates.

### Phase 0: Setup

```bash
# Create temp workspace, copy units, register workspace
# (Same pattern as existing positional-graph-execution-e2e.test.ts)

# Create graph (line-000 auto-created)
cg wf create orch-e2e-test

# Add lines
cg wf line add orch-e2e-test                              # line-001
cg wf line add orch-e2e-test                              # line-002
cg wf line set orch-e2e-test line-002 --orch transition=manual
cg wf line add orch-e2e-test                              # line-003

# Line 0: User input (reserved)
cg wf node add orch-e2e-test line-000 sample-get-spec

# Line 1: Specification (agents)
cg wf node add orch-e2e-test line-001 sample-spec-builder
cg wf node add orch-e2e-test line-001 sample-spec-reviewer

# Line 2: Implementation
cg wf node add orch-e2e-test line-002 sample-coder
cg wf node add orch-e2e-test line-002 sample-tester

# Line 3: PR Preparation (parallel + serial)
cg wf node add orch-e2e-test line-003 sample-spec-alignment-tester
cg wf node add orch-e2e-test line-003 sample-pr-preparer
cg wf node add orch-e2e-test line-003 sample-pr-creator

# Set parallel execution on Line 3 parallel nodes
cg wf node set orch-e2e-test $alignmentTester --orch execution=parallel
cg wf node set orch-e2e-test $prPreparer --orch execution=parallel

# Wire all inputs (12 set-input commands)
# spec-builder.spec ← get-spec.spec
# spec-reviewer.spec ← spec-builder.spec
# coder.spec ← spec-reviewer.reviewed_spec (from_unit)
# tester.language ← coder.language
# tester.code ← coder.code
# alignment-tester.spec ← spec-reviewer.reviewed_spec (from_unit)
# alignment-tester.code ← coder.code
# alignment-tester.test_output ← tester.test_output
# pr-preparer.spec ← spec-reviewer.reviewed_spec (from_unit)
# pr-preparer.test_output ← tester.test_output
# pr-creator.pr_title ← pr-preparer.pr_title
# pr-creator.pr_body ← pr-preparer.pr_body
```

### Phase 1: First Orchestration Trigger — User-Input Node

```
┌────────────────────────────────────────────────────────────┐
│ TEST: Trigger orchestration                                 │
│                                                             │
│ EXPECT: ONBAS finds get-spec (ready, user-input)            │
│         ODS handles user-input directly (no pod)            │
│         Since user-input, orchestrator should signal         │
│         "waiting for user input" — the node needs            │
│         external data before it can complete                 │
└────────────────────────────────────────────────────────────┘
```

```bash
# Trigger the orchestration loop
cg wf run orch-e2e-test

# Validate: orchestrator found get-spec, identified it as user-input
# The run command should exit because user-input nodes need external action
cg wf status orch-e2e-test --json
# Expect: get-spec is in a state indicating "awaiting input"
```

**Test harness acts as user providing input:**

```bash
# "Be the user" — provide the spec via the user-input node
cg wf node start orch-e2e-test $getSpec
cg wf node save-output-data orch-e2e-test $getSpec spec \
    '"Create isPrime: returns true for prime numbers, false otherwise"'
cg wf node end orch-e2e-test $getSpec
```

### Phase 2: Second Trigger — Start Agent Nodes (spec-builder, then spec-reviewer)

```bash
# Re-trigger orchestration
cg wf run orch-e2e-test

# EXPECT: ONBAS walks graph:
#   Line 0: get-spec (complete) → proceed
#   Line 1: transitionOpen (auto) → enter
#     spec-builder (ready) → start-node
# ODS starts spec-builder:
#   - InputPack: spec ← get-spec.spec (wired from user-input node)
#   - AgentContextService: first agent on line 1 → new context
#   - PodManager.createPod(spec-builder, agent)
#   - Pod.execute() called → node now "running"
# Loop continues: spec-builder running → no more actions → exit

# Validate: spec-builder is running
cg wf status orch-e2e-test --node $specBuilder --json
# Expect: status = "running"
```

**Test harness acts as the spec-builder agent:**

```bash
# "Be the agent" — spec-builder takes user spec and creates a proper spec
cg wf node save-output-data orch-e2e-test $specBuilder spec \
    '"Create a function isPrime(n) that returns true for prime numbers. Handle edge cases: 0, 1, 2, negative numbers."'
cg wf node end orch-e2e-test $specBuilder
```

```bash
# Re-trigger — spec-reviewer now ready (serial gate satisfied)
cg wf run orch-e2e-test

# EXPECT: spec-reviewer (ready) → start-node
# ODS starts spec-reviewer:
#   - AgentContextService: serial, not first on line → inherit from
#     left neighbor (spec-builder)
#   - PodManager.createPod(spec-reviewer, agent) with inherited session

cg wf status orch-e2e-test --node $specReviewer --json
# Expect: status = "running"
```

**Test harness acts as the spec-reviewer agent:**

```bash
# "Be the agent" — review and approve
cg wf node save-output-data orch-e2e-test $specReviewer reviewed_spec \
    '"APPROVED: Create isPrime function with edge cases for 0, 1, 2, negative numbers"'
cg wf node end orch-e2e-test $specReviewer
```

### Phase 3: Third Trigger — Line 1 Complete, Start Coder

```bash
# Re-trigger
cg wf run orch-e2e-test

# EXPECT: ONBAS walks:
#   Line 0: complete → proceed
#   Line 1: all complete → proceed
#   Line 2: transitionOpen (auto) → enter
#     coder (ready) → start-node
# ODS starts coder:
#   - AgentContextService: first agent on line 2 → inherit from
#     first AGENT on previous line → spec-reviewer's session
#   - PodManager.createPod(coder, agent) with inherited session
# Validate context inheritance happened correctly

cg wf status orch-e2e-test --node $coder --json
# Expect: status = "running"
```

**Test harness acts as the coder agent — asking a question:**

```bash
# "Be the agent" — ask a question before completing
cg wf node ask orch-e2e-test $coder \
    --type single \
    --text "Which programming language should I use?" \
    --options TypeScript Python Go Rust

# Node is now waiting-question
cg wf status orch-e2e-test --node $coder --json
# Expect: status = "waiting-question"
```

### Phase 4: Fourth Trigger — Surface Question

```bash
# Re-trigger
cg wf run orch-e2e-test

# EXPECT: ONBAS walks:
#   Line 0: complete → proceed
#   Line 1: complete → proceed
#   Line 2: enter
#     coder (waiting-question) → visitWaitingQuestion
#       question not surfaced → question-pending OR
# ODS marks question surfaced, loop exits (waiting for user)

# Validate: question was surfaced
# The run command should output the question for the user
```

**Test harness acts as the user answering the question:**

```bash
# "Be the user" — answer the question
cg wf node answer orch-e2e-test $coder $questionId '"TypeScript"'
```

### Phase 5: Fifth Trigger — Resume Coder After Answer

```bash
# Re-trigger
cg wf run orch-e2e-test

# EXPECT: ONBAS walks:
#   coder (waiting-question, answered) → resume-node
# ODS resumes coder:
#   - Pod.resumeWithAnswer(questionId, "TypeScript")
#   - Node status → running
# Loop continues: coder running → no more actions → exit

cg wf status orch-e2e-test --node $coder --json
# Expect: status = "running"
```

**Test harness acts as the coder agent — completing work:**

```bash
# "Be the agent" — save outputs and finish
cg wf node save-output-data orch-e2e-test $coder language '"TypeScript"'
cg wf node save-output-data orch-e2e-test $coder code \
    '"function isPrime(n: number): boolean { if (n < 2) return false; for (let i = 2; i * i <= n; i++) { if (n % i === 0) return false; } return true; }"'
cg wf node end orch-e2e-test $coder
```

### Phase 6: Sixth Trigger — Start Tester (Code Unit)

```bash
# Re-trigger
cg wf run orch-e2e-test

# EXPECT: ONBAS walks:
#   coder (complete) → skip
#   tester (ready) → start-node
# ODS starts tester:
#   - unitType = code → CodePod (no session, no context)
#   - Pod.execute() runs script → completes synchronously
# Loop continues: if code pod completed synchronously, tester → complete
# ONBAS walks again: line 2 complete but transition=manual
# → no-action(transition-blocked)

cg wf status orch-e2e-test --node $tester --json
# If code pods are blocking: status = "running" (test harness must complete)
# If code pods are synchronous in mock: status = "complete"
```

**If blocking (test harness completes the code node):**

```bash
# "Be the code runner" — save output and finish
cg wf node save-output-data orch-e2e-test $tester test_output \
    '"All tests pass: isPrime(2)=true, isPrime(4)=false, isPrime(17)=true"'
cg wf node end orch-e2e-test $tester
```

### Phase 7: Manual Transition Gate

```bash
# Re-trigger
cg wf run orch-e2e-test

# EXPECT: ONBAS walks:
#   Line 0: complete → proceed
#   Line 1: complete → proceed
#   Line 2: complete → proceed... but transition=manual, not triggered
#   Line 3: transitionOpen = false
#   → no-action(transition-blocked, lineId: line-003)

# Validate: run command exits with "transition-blocked" reason
# Validate: Line 3 nodes are not started
cg wf status orch-e2e-test --node $alignmentTester --json
# Expect: status = "pending", ready = false, readyDetail.transitionOpen = false
```

**Test harness triggers the manual transition:**

```bash
# "Be the human" — approve transition to Line 3
cg wf trigger orch-e2e-test line-002
```

### Phase 8: Eighth Trigger — Parallel Execution on Line 2

```bash
# Re-trigger
cg wf run orch-e2e-test

# EXPECT: ONBAS walks Line 3:
#   alignment-tester (ready, parallel) → start-node
# ODS starts alignment-tester
# Loop continues (reality rebuilt):
#   alignment-tester (running) → skip
#   pr-preparer (ready, parallel) → start-node
# ODS starts pr-preparer
# Loop continues:
#   alignment-tester (running) → skip
#   pr-preparer (running) → skip
#   pr-creator (pending, serial gate blocked) → skip
#   Line 3 not complete → no-action(all-waiting)

cg wf status orch-e2e-test --node $alignmentTester --json
# Expect: status = "running"
cg wf status orch-e2e-test --node $prPreparer --json
# Expect: status = "running"
cg wf status orch-e2e-test --node $prCreator --json
# Expect: status = "pending", ready = false
```

This validates that the orchestration loop starts multiple parallel nodes in a single trigger.

**Test harness completes both parallel agents:**

```bash
# "Be the alignment-tester agent"
cg wf node save-output-data orch-e2e-test $alignmentTester alignment_result \
    '"ALIGNED: Implementation matches spec requirements"'
cg wf node end orch-e2e-test $alignmentTester

# "Be the pr-preparer agent"
cg wf node save-output-data orch-e2e-test $prPreparer pr_title \
    '"feat: add isPrime utility function"'
cg wf node save-output-data orch-e2e-test $prPreparer pr_body \
    '"Implements isPrime with edge case handling per spec"'
cg wf node end orch-e2e-test $prPreparer
```

### Phase 9: Ninth Trigger — Start Serial Successor

```bash
# Re-trigger
cg wf run orch-e2e-test

# EXPECT: ONBAS walks:
#   alignment-tester (complete) → skip
#   pr-preparer (complete) → skip
#   pr-creator (ready, serial, both parallel neighbors complete) → start-node
# ODS starts pr-creator:
#   - AgentContextService: serial on line 3, parallel neighbors complete
#     → inherit from one of the parallel nodes (first AGENT? design decision)
# Loop: pr-creator running → no-action(all-waiting)

cg wf status orch-e2e-test --node $prCreator --json
# Expect: status = "running"
```

**Test harness completes the final node:**

```bash
# "Be the pr-creator agent"
cg wf node save-output-data orch-e2e-test $prCreator pr_url \
    '"https://github.com/example/repo/pull/42"'
cg wf node end orch-e2e-test $prCreator
```

### Phase 10: Final Trigger — Graph Complete

```bash
# Re-trigger
cg wf run orch-e2e-test

# EXPECT: ONBAS short-circuits:
#   All nodes complete → graph-complete
#   → no-action(graph-complete)

cg wf status orch-e2e-test --json
# Expect: status = "complete", completedNodes = 8
```

---

## The `cg wf run` Command

### What It Does

The `cg wf run <slug>` command is the CLI entry point for the orchestration loop. It:

1. Builds a `PositionalGraphReality` snapshot
2. Calls `walkForNextAction(reality)` (ONBAS)
3. Executes the returned `OrchestrationRequest` via ODS
4. Loops until exit condition

### Exit Conditions

| Condition | CLI Output | Exit Code |
|-----------|------------|-----------|
| `no-action(graph-complete)` | "Graph complete" | 0 |
| `no-action(graph-failed)` | "Graph failed: ..." | 1 |
| `no-action(transition-blocked)` | "Waiting: manual transition on line-002" | 0 |
| `no-action(all-waiting)` | "Waiting: nodes running or awaiting answers" | 0 |
| `question-pending` | "Question from [node]: [text]" | 0 |
| Infinite loop detected | "Error: same action repeated" | 1 |

### JSON Output

```json
{
  "exitReason": "all-waiting",
  "actionsExecuted": 2,
  "finalRequest": {
    "type": "no-action",
    "graphSlug": "orch-e2e-test",
    "reason": "all-waiting"
  },
  "nodeEvents": [
    { "action": "start-node", "nodeId": "alignment-tester-a1b", "result": "ok" },
    { "action": "start-node", "nodeId": "pr-preparer-c2d", "result": "ok" }
  ]
}
```

### Design Choice: Non-Blocking

The `run` command executes one pass of the orchestration loop and exits. It does NOT poll or wait for agents to finish. This is intentional:

- **CLI-friendly**: each invocation is a discrete step
- **Testable**: test harness controls the pace
- **Debuggable**: can inspect state between each trigger
- **Composable**: a wrapper script or daemon can call `run` repeatedly

A future `cg wf run --watch` could poll and re-trigger, but that's outside Plan 030 scope.

---

## Integration Test Layer: Service-Level Tests

Between ONBAS unit tests and CLI E2E tests, we need integration tests that exercise the full orchestration loop with real services but fake infrastructure.

### Test Infrastructure

```typescript
/**
 * Integration test setup for orchestration loop.
 *
 * Uses:
 * - Real PositionalGraphService (with FakeFileSystem)
 * - Real ONBAS (walkForNextAction)
 * - Real ODS (OrchestrationDoerService)
 * - FakePodManager + FakePod (deterministic execution)
 * - Real AgentContextService
 * - Real RealityBuilder
 */
function createOrchestrationTestHarness(options?: {
  fakePodBehaviors?: Map<string, FakePodBehavior>;
}) {
  const fs = new FakeFileSystem();
  const service = createTestService(fs);
  const podManager = new FakePodManager();
  const contextService = new AgentContextService();
  const realityBuilder = new RealityBuilder(service);
  const onbas = new OrchestrationNextBestActionService();
  const ods = new OrchestrationDoerService({
    service,
    podManager,
    contextService,
  });

  // Configure fake pod behaviors
  if (options?.fakePodBehaviors) {
    for (const [nodeId, behavior] of options.fakePodBehaviors) {
      podManager.setBehavior(nodeId, behavior);
    }
  }

  return {
    service,
    podManager,
    onbas,
    ods,
    realityBuilder,

    /** Run one pass of the orchestration loop */
    async runOnce(graphSlug: string): Promise<OrchestrationLoopResult> {
      return runOrchestrationLoop(
        createTestWorkspaceContext(fs),
        graphSlug,
        { realityBuilder, onbas, ods }
      );
    },

    /** Build a graph using the service directly */
    async buildGraph(graphSlug: string, setup: GraphSetupFn): Promise<void> {
      // ... helper to create lines, nodes, wire inputs
    },
  };
}
```

### FakePodBehavior

The `FakePodManager` from Workshop #4 allows configuring deterministic behaviors per node:

```typescript
interface FakePodBehavior {
  /** What happens when pod.execute() is called */
  onExecute:
    | { outcome: 'completed'; outputs?: Record<string, unknown> }
    | { outcome: 'question'; questionText: string; questionType: string; options?: string[] }
    | { outcome: 'error'; errorMessage: string };

  /** What happens when pod.resumeWithAnswer() is called */
  onResume?:
    | { outcome: 'completed'; outputs?: Record<string, unknown> }
    | { outcome: 'question'; questionText: string; questionType: string };
}
```

### Integration Test Example: Full Pipeline

```typescript
describe('Orchestration Loop Integration', () => {
  it('drives a 4-line pipeline to completion', async () => {
    const harness = createOrchestrationTestHarness({
      fakePodBehaviors: new Map([
        // spec-reviewer: completes immediately with output
        ['spec-reviewer', {
          onExecute: {
            outcome: 'completed',
            outputs: { reviewed_spec: 'APPROVED: ...' },
          },
        }],
        // coder: asks a question, then completes on resume
        ['coder', {
          onExecute: {
            outcome: 'question',
            questionText: 'Which language?',
            questionType: 'single',
            options: ['TypeScript', 'Python'],
          },
          onResume: {
            outcome: 'completed',
            outputs: { language: 'TypeScript', code: 'function isPrime...' },
          },
        }],
        // tester: completes immediately (code unit)
        ['tester', {
          onExecute: {
            outcome: 'completed',
            outputs: { test_output: 'All tests pass' },
          },
        }],
        // ... parallel nodes, pr-creator
      ]),
    });

    // Build the graph
    await harness.buildGraph('test-pipeline', (b) => {
      b.addLine('line-000', { nodes: ['get-spec'] });
      b.addLine('line-001', { nodes: ['spec-builder', 'spec-reviewer'] });
      b.addLine('line-002', { nodes: ['coder', 'tester'], transition: 'manual' });
      b.addLine('line-003', {
        nodes: ['alignment-tester', 'pr-preparer', 'pr-creator'],
        parallelNodes: ['alignment-tester', 'pr-preparer'],
      });
      b.wireInput('spec-builder', 'spec', 'get-spec', 'spec');
      b.wireInput('spec-reviewer', 'spec', 'spec-builder', 'spec');
      // ... more wiring
    });

    // Simulate: user completes get-spec (user-input)
    await harness.service.startNode(ctx, 'test-pipeline', getSpecId);
    await harness.service.saveOutputData(ctx, 'test-pipeline', getSpecId, 'spec', 'Create isPrime');
    await harness.service.endNode(ctx, 'test-pipeline', getSpecId);

    // Run orchestration: should start spec-reviewer, which auto-completes via FakePod
    const result1 = await harness.runOnce('test-pipeline');
    expect(result1.exitReason).toBe('all-waiting');
    // FakePod completed spec-reviewer synchronously

    // Run again: should start coder, which asks a question
    const result2 = await harness.runOnce('test-pipeline');
    expect(result2.exitReason).toBe('question-surfaced');
    expect(result2.finalRequest).toMatchObject({
      type: 'question-pending',
      nodeId: expect.stringContaining('coder'),
    });

    // Answer the question
    await harness.service.answerQuestion(ctx, 'test-pipeline', coderId, questionId, 'TypeScript');

    // Run again: should resume coder (auto-completes via FakePod), then start tester
    const result3 = await harness.runOnce('test-pipeline');
    // ... continues through the pipeline
  });
});
```

---

## Patterns to Test

### Pattern 1: User-Input Node (No Pod)

**Setup**: Graph with a user-input node at position 0.

**Test**:
1. Trigger orchestration → ONBAS returns `start-node` for user-input
2. ODS recognizes `unitType === 'user-input'` → does NOT create pod
3. ODS starts the node (status → running), loop exits
4. Test harness provides data via CLI
5. Re-trigger → node complete, proceeds

**Why this matters**: User-input nodes are special — ODS must handle them without pods.

### Pattern 2: Agent Node with Question Cycle

**Setup**: Agent node that asks a question mid-execution.

**Test**:
1. Trigger → start-node (agent)
2. FakePod.execute() returns `{ outcome: 'question', ... }`
3. ODS records question in state, node → waiting-question
4. Loop continues: ONBAS sees waiting-question, not surfaced → question-pending
5. ODS surfaces question, loop exits
6. Test answers question
7. Re-trigger → ONBAS sees answered → resume-node
8. ODS calls pod.resumeWithAnswer(), pod completes
9. Node → complete

### Pattern 3: Parallel Execution

**Setup**: Line with two parallel nodes and one serial successor.

**Test**:
1. Trigger → start-node(parallel-A)
2. Loop: start-node(parallel-B) (both started in same run)
3. Loop: no-action(all-waiting)
4. Complete both parallel nodes
5. Re-trigger → start-node(serial-C) (both neighbors complete)

### Pattern 4: Manual Transition Gate

**Setup**: Line with manual transition.

**Test**:
1. Complete all nodes on gated line
2. Trigger → no-action(transition-blocked, lineId)
3. Trigger transition: `cg wf trigger <slug> <lineId>`
4. Re-trigger → successor line nodes become ready

### Pattern 5: Context Inheritance

**Setup**: Multi-line graph with agent nodes.

**Test**:
1. Start agent on line 1, record session ID
2. Start agent on line 2 → AgentContextService should resolve to line 1's agent
3. Validate pod was created with inherited session ID

### Pattern 6: Code Node (Synchronous)

**Setup**: Code node after an agent node.

**Test**:
1. Trigger → start-node(code)
2. FakePod.execute() returns immediately with outputs
3. ODS saves outputs, node → complete
4. Loop continues to next action (no separate trigger needed)

### Pattern 7: Error Recovery

**Setup**: Node whose FakePod returns error.

**Test**:
1. Trigger → start-node
2. FakePod.execute() returns `{ outcome: 'error', ... }`
3. ODS records error, node → blocked-error
4. ONBAS: node blocked, line stuck → diagnoseStuckLine
5. If all nodes on line are blocked → graph-failed

---

## E2E Test Script Structure

```typescript
#!/usr/bin/env npx tsx
/**
 * E2E Orchestration Test
 *
 * Tests the complete orchestration lifecycle using CLI commands.
 * No real agents — the test harness "acts as" every agent.
 *
 * Usage:
 *   npx tsx test/e2e/positional-graph-orchestration-e2e.test.ts
 */

import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

const GRAPH_SLUG = 'orch-e2e-test';

// Node and line IDs (populated during setup)
const nodeIds = { /* ... */ };
const lineIds = { /* ... */ };

// ── CLI Runner (reuse from existing E2E) ─────────────────
async function runCli<T>(args: string[]): Promise<CliResult<T>> { /* ... */ }

// ── Test Utilities ────────────────────────────────────────
function section(name: string): void { /* ... */ }
function step(description: string): void { /* ... */ }
function assert(condition: boolean, message: string): void { /* ... */ }
function unwrap<T>(value: T | undefined | null, label: string): T { /* ... */ }

// ── Orchestration Trigger ─────────────────────────────────
interface RunResult {
  exitReason: string;
  actionsExecuted: number;
  nodeEvents?: Array<{ action: string; nodeId: string; result: string }>;
  question?: { nodeId: string; questionId: string; text: string };
}

async function triggerOrchestration(): Promise<RunResult> {
  const result = await runCli<RunResult>(['run', GRAPH_SLUG]);
  assert(result.ok, `Orchestration failed: ${JSON.stringify(result.errors)}`);
  return result.data!;
}

// ── "Act as Agent" Helpers ────────────────────────────────

/** Complete a user-input node with given outputs */
async function actAsUser(nodeId: string, outputs: Record<string, string>): Promise<void> {
  await runCli(['node', 'start', GRAPH_SLUG, nodeId]);
  for (const [name, value] of Object.entries(outputs)) {
    await runCli(['node', 'save-output-data', GRAPH_SLUG, nodeId, name, value]);
  }
  await runCli(['node', 'end', GRAPH_SLUG, nodeId]);
}

/** Complete an agent node (already running) with given outputs */
async function actAsAgent(nodeId: string, outputs: Record<string, string>): Promise<void> {
  for (const [name, value] of Object.entries(outputs)) {
    await runCli(['node', 'save-output-data', GRAPH_SLUG, nodeId, name, value]);
  }
  await runCli(['node', 'end', GRAPH_SLUG, nodeId]);
}

/** Ask a question as if the agent asked it */
async function agentAsksQuestion(
  nodeId: string,
  type: string,
  text: string,
  options?: string[]
): Promise<string> {
  const args = ['node', 'ask', GRAPH_SLUG, nodeId, '--type', type, '--text', text];
  if (options) args.push('--options', ...options);
  const result = await runCli<AskResult>(args);
  assert(result.ok, `Ask failed: ${JSON.stringify(result.errors)}`);
  return unwrap(result.data?.questionId, 'questionId');
}

/** Answer a question as the orchestrator/user */
async function answerQuestion(nodeId: string, questionId: string, answer: string): Promise<void> {
  await runCli(['node', 'answer', GRAPH_SLUG, nodeId, questionId, answer]);
}

// ── Test Sections ─────────────────────────────────────────

async function setup(): Promise<void> {
  // Create workspace, graph, lines, nodes, wire inputs
  // (Same pattern as existing e2e test)
}

async function testPhase1_UserInput(): Promise<void> {
  section('Phase 1: User-Input Node (Line 0)');

  step('Trigger orchestration');
  const result = await triggerOrchestration();
  // Validate: get-spec identified as user-input, orchestrator waiting

  step('Act as user: provide spec');
  await actAsUser(nodeIds.getSpec, {
    spec: '"Create isPrime: returns true for primes, false otherwise"',
  });
}

async function testPhase2_AgentNodes(): Promise<void> {
  section('Phase 2: Agent Nodes (spec-builder → spec-reviewer, Line 1)');

  step('Trigger orchestration');
  const result1 = await triggerOrchestration();
  // Validate: spec-builder started (first agent on line 1, new context)

  step('Act as agent: complete spec-builder');
  await actAsAgent(nodeIds.specBuilder, {
    spec: '"Create isPrime(n) with edge cases for 0, 1, 2, negatives"',
  });

  step('Trigger orchestration (spec-reviewer now ready)');
  const result2 = await triggerOrchestration();
  // Validate: spec-reviewer started (inherits from spec-builder)

  step('Act as agent: complete spec-reviewer');
  await actAsAgent(nodeIds.specReviewer, {
    reviewed_spec: '"APPROVED: isPrime with edge cases"',
  });
}

async function testPhase3_QuestionCycle(): Promise<void> {
  section('Phase 3: Agent with Question (coder, Line 2)');

  step('Trigger orchestration');
  const result1 = await triggerOrchestration();
  // Validate: coder started

  step('Agent asks question');
  const qId = await agentAsksQuestion(
    nodeIds.coder, 'single',
    'Which programming language?',
    ['TypeScript', 'Python', 'Go']
  );

  step('Trigger orchestration (surfaces question)');
  const result2 = await triggerOrchestration();
  // Validate: question-pending returned, question surfaced

  step('Answer question');
  await answerQuestion(nodeIds.coder, qId, '"TypeScript"');

  step('Trigger orchestration (resumes coder)');
  const result3 = await triggerOrchestration();
  // Validate: resume-node executed

  step('Complete coder');
  await actAsAgent(nodeIds.coder, {
    language: '"TypeScript"',
    code: '"function isPrime(n) { ... }"',
  });
}

async function testPhase4_CodeNode(): Promise<void> {
  section('Phase 4: Code Node (tester)');

  step('Trigger orchestration');
  const result = await triggerOrchestration();
  // Validate: tester started (code node)

  step('Act as code runner');
  await actAsAgent(nodeIds.tester, {
    test_output: '"All tests pass"',
  });
}

async function testPhase5_ManualTransition(): Promise<void> {
  section('Phase 5: Manual Transition Gate');

  step('Trigger orchestration');
  const result = await triggerOrchestration();
  // Validate: no-action(transition-blocked)

  step('Trigger manual transition');
  await runCli(['trigger', GRAPH_SLUG, lineIds.line2]);
}

async function testPhase6_ParallelExecution(): Promise<void> {
  section('Phase 6: Parallel Nodes');

  step('Trigger orchestration');
  const result = await triggerOrchestration();
  // Validate: both parallel nodes started

  step('Complete both parallel agents');
  await actAsAgent(nodeIds.alignmentTester, { alignment_result: '"ALIGNED"' });
  await actAsAgent(nodeIds.prPreparer, {
    pr_title: '"feat: add isPrime"',
    pr_body: '"Implements isPrime per spec"',
  });
}

async function testPhase7_FinalNode(): Promise<void> {
  section('Phase 7: Serial Successor (pr-creator)');

  step('Trigger orchestration');
  const result = await triggerOrchestration();
  // Validate: pr-creator started

  step('Complete pr-creator');
  await actAsAgent(nodeIds.prCreator, {
    pr_url: '"https://github.com/example/repo/pull/42"',
  });
}

async function testPhase8_GraphComplete(): Promise<void> {
  section('Phase 8: Graph Complete');

  step('Trigger orchestration');
  const result = await triggerOrchestration();
  // Validate: no-action(graph-complete)

  step('Validate final state');
  const status = await runCli<GraphStatusResult>(['status', GRAPH_SLUG]);
  assert(status.data?.status === 'complete', 'Graph should be complete');
}

async function teardown(): Promise<void> {
  // Clean up temp workspace
}

// ── Main ──────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('='.repeat(65));
  console.log('      E2E Orchestration Test (No Real Agents)');
  console.log('='.repeat(65));

  try {
    await setup();
    await testPhase1_UserInput();
    await testPhase2_AgentNodes();
    await testPhase3_QuestionCycle();
    await testPhase4_CodeNode();
    await testPhase5_ManualTransition();
    await testPhase6_ParallelExecution();
    await testPhase7_FinalNode();
    await testPhase8_GraphComplete();
    await teardown();

    console.log('\n' + '='.repeat(65));
    console.log('                    TEST PASSED');
    console.log('='.repeat(65));
    process.exit(0);
  } catch (error) {
    console.error('\n' + '='.repeat(65));
    console.error('                    TEST FAILED');
    console.error('='.repeat(65));
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
```

---

## Existing Infrastructure Reuse

### What Already Exists

| Component | Location | Reusable? |
|-----------|----------|-----------|
| `runCli<T>()` helper | `test/e2e/positional-graph-execution-e2e.test.ts` | Yes — extract to shared module |
| `section/step/assert/unwrap` | Same file | Yes — extract to shared module |
| Temp workspace setup | Same file | Yes — same pattern |
| Unit copy + workspace registration | Same file | Yes — same pattern |
| NDJSON parsing | Same file | Yes — same logic |
| `FakeWorkUnitService` | `packages/positional-graph/.../fake-workunit.service.ts` | Yes — for integration tests |
| `FakeFileSystem` | Existing test infrastructure | Yes — for integration tests |

### What Needs to Be Created

| Component | Purpose | Test Layer |
|-----------|---------|------------|
| `cg wf run <slug>` CLI command | Orchestration loop trigger | E2E |
| `FakePodManager` + `FakePod` | Deterministic pod execution | Integration |
| `createOrchestrationTestHarness()` | Wire up all services for testing | Integration |
| `actAsAgent/actAsUser` helpers | E2E test readability | E2E |
| `triggerOrchestration()` wrapper | Parse `run` command output | E2E |
| Shared CLI test runner module | Extract from existing e2e | E2E |

### Shared CLI Test Runner

The `runCli`, `section`, `step`, `assert`, `unwrap` helpers should be extracted to a shared module so both the 028 E2E test and the new 030 E2E test can use them:

```
test/
├── e2e/
│   ├── lib/
│   │   └── cli-test-runner.ts           # Shared helpers (extracted)
│   ├── positional-graph-execution-e2e.test.ts  # 028 E2E (existing)
│   └── positional-graph-orchestration-e2e.test.ts  # 030 E2E (NEW)
└── integration/
    └── positional-graph/
        ├── graph-lifecycle.test.ts       # Existing
        └── orchestration-loop.test.ts    # NEW
```

---

## Open Questions

### Q1: How does `cg wf run` interact with running nodes?

The orchestration loop starts nodes but doesn't wait for them. After starting a node, the loop rebuilds reality and finds the node `running`. Since running nodes return null from `visitNode`, the loop either finds the next actionable thing or exits with `all-waiting`.

**But**: in the E2E test, nodes are started by ODS but never actually run (no real agents). The test harness must manually perform the agent work via CLI. So `cg wf run` starts nodes and exits. The test harness then does the agent work. Then `cg wf run` is called again.

**RESOLVED**: `cg wf run` is non-blocking. It runs one pass of the orchestration loop (which may execute multiple actions — e.g., start two parallel nodes) and exits. The test harness then acts as agents, then re-triggers.

### Q2: Should `cg wf run` use real PodManager or FakePodManager?

In E2E tests, we're testing the real CLI. The CLI uses whatever PodManager is configured. Since we have no real agents, the pods will call agent adapters that don't exist.

**RESOLVED**: For E2E tests, `cg wf run` should use a **NullPodManager** or similar — when it "starts" a node, it sets the state to `running` but doesn't actually invoke an agent. This way the test harness can then act as the agent via CLI.

Alternatively: ODS could simply set node status to `running` and return, with agent invocation being a separate step. This is the simpler design — ODS's `start-node` handler sets state, and a separate process (real agent or test harness) does the work.

**Decision**: ODS's `start-node` sets status to `running` and returns. The pod is created but execution is asynchronous (or, for user-input nodes, not needed at all). This makes E2E testing natural — "start" is always just a state change.

### Q3: Should we extract the CLI test runner to a shared module now?

**RESOLVED**: Yes, as part of Phase 1 of implementation. The existing `positional-graph-execution-e2e.test.ts` has all the patterns. Extract `runCli`, `runWorkspaceCommand`, `section`, `step`, `assert`, `unwrap` to `test/e2e/lib/cli-test-runner.ts` and update the existing test to import from there.

### Q4: What about testing the `--watch` mode or event-driven re-trigger?

**RESOLVED**: Out of scope for Plan 030. The E2E test uses manual `cg wf run` triggers. Future plans can add `--watch` mode that polls or subscribes to filesystem events.

### Q5: How do we validate context inheritance in E2E tests?

Context inheritance is an internal detail — the test can't directly observe which session ID was passed to a pod. Options:

- **Option A**: Add a `--verbose` flag to `cg wf run` that logs actions including context decisions
- **Option B**: Add a query command `cg wf node get-session <slug> <nodeId>` that returns the pod session ID
- **Option C**: Test context inheritance only in integration tests (where we have access to PodManager internals)

**RESOLVED**: Option C for now. Context inheritance is tested in integration tests where `FakePodManager.createPod()` call args can be inspected. The E2E test focuses on externally observable behavior.

---

## Relationship to Other Workshops

| Workshop | Relationship |
|----------|--------------|
| **PositionalGraphReality** | `buildFakeReality` for unit tests, reality builder for integration |
| **OrchestrationRequest** | OR types validated in all test layers |
| **AgentContextService** | Tested in integration layer with FakePodManager inspection |
| **WorkUnitPods** | FakePodManager/FakePod are the key integration test infrastructure |
| **ONBAS** | Unit tested independently; integration and E2E test it through the loop |
| **ODS** | (Workshop #6) Central to integration tests; E2E tests via `cg wf run` |

---

## File Locations

```
test/
├── e2e/
│   ├── lib/
│   │   └── cli-test-runner.ts                              # Shared (EXTRACTED)
│   ├── positional-graph-execution-e2e.test.ts              # Existing (028)
│   └── positional-graph-orchestration-e2e.test.ts          # NEW (030)
├── integration/
│   └── positional-graph/
│       ├── graph-lifecycle.test.ts                         # Existing
│       └── orchestration-loop.test.ts                      # NEW (030)
└── unit/
    └── positional-graph/
        ├── onbas.test.ts                                   # From Workshop #5
        ├── agent-context-service.test.ts                   # From Workshop #3
        └── orchestration-request.test.ts                   # From Workshop #2

packages/positional-graph/
└── src/
    └── features/030-orchestration/
        ├── test-helpers.ts                                 # buildFakeReality, FakePod configs
        └── orchestration-test-harness.ts                   # createOrchestrationTestHarness()
```

---

## Implementation Checklist

- [ ] Extract shared CLI test runner to `test/e2e/lib/cli-test-runner.ts`
- [ ] Update existing `positional-graph-execution-e2e.test.ts` to import from shared module
- [ ] Implement `FakePodManager` + `FakePod` (from Workshop #4 spec)
- [ ] Implement `createOrchestrationTestHarness()` factory
- [ ] Write integration tests: `orchestration-loop.test.ts`
  - [ ] Single-node graph completes
  - [ ] Serial chain drives sequentially
  - [ ] Question cycle (ask → surface → answer → resume)
  - [ ] Parallel nodes start in same loop pass
  - [ ] Manual transition blocks successor line
  - [ ] Context inheritance validated via PodManager
  - [ ] Error/blocked-error path
  - [ ] Graph-complete detection
- [ ] Implement `cg wf run <slug>` CLI command
- [ ] Write E2E test: `positional-graph-orchestration-e2e.test.ts`
  - [ ] Setup: create graph, lines, nodes, wire inputs
  - [ ] Phase 1: user-input node
  - [ ] Phase 2: agent node (spec-reviewer)
  - [ ] Phase 3: question cycle (coder)
  - [ ] Phase 4: code node (tester)
  - [ ] Phase 5: manual transition gate
  - [ ] Phase 6: parallel execution
  - [ ] Phase 7: serial successor after parallel
  - [ ] Phase 8: graph-complete validation
  - [ ] Teardown: cleanup temp workspace

---

## Glossary

| Term | Expansion | Definition |
|------|-----------|------------|
| **OR** | OrchestrationRequest | Discriminated union type representing the next action. Four variants: `start-node`, `resume-node`, `question-pending`, `no-action`. |
| **ONBAS** | OrchestrationNextBestActionService | Pure-function rules engine that walks Reality and returns an OR. Tested at unit level with `buildFakeReality`, at integration level through the loop, at E2E level via `cg wf run`. |
| **ODS** | OrchestrationDoerService | Executor that consumes ORs — starts pods, surfaces questions, resumes nodes. Tested at integration level with `FakePodManager`, at E2E level via `cg wf run`. |
| **Reality** | PositionalGraphReality | Read-only snapshot of graph state. Rebuilt each iteration of the orchestration loop. |
| **Pod** | IWorkUnitPod | Ephemeral execution container. In E2E tests, pod execution is replaced by the test harness acting as the agent via CLI. |
| **PodManager** | IPodManager | Per-graph pod registry. `FakePodManager` used in integration tests; real/null PodManager in E2E. |
| **FakePod** | — | Test double for `IWorkUnitPod` with configurable outcomes. |
| **FakePodManager** | — | Test double for `IPodManager`. Creates `FakePod` instances. Central to integration tests. |
| **`cg wf run`** | — | CLI command that triggers one pass of the orchestration loop. Non-blocking — starts nodes and exits. The E2E test harness calls this repeatedly. |
| **Human-as-agent** | — | Testing pattern where the test harness acts as every agent — calling `ask`, `save-output-data`, `answer`, `end` via CLI. |
| **WorkUnit** | — | Declarative definition of what a node does: prompt template (agent), script (code), or question (user-input). |
| **InputPack** | — | Collated input data for a node, resolved from upstream outputs. |

---

## Summary

The E2E integration testing strategy for Plan 030 follows a **human-as-agent** pattern:

1. **`cg wf run`** triggers the orchestration loop (non-blocking, one pass)
2. **The test harness** acts as every agent — saving outputs, asking questions, completing nodes via CLI
3. **Re-triggering `cg wf run`** advances the orchestrator to the next action
4. **Three test layers**: unit (pure functions with fake reality), integration (real services with FakePodManager), E2E (real CLI with manual agent simulation)

The test graph uses a 4-line, 8-node pipeline extending the 028 E2E patterns, exercising all key patterns: user-input nodes, input wiring from user-input to agent nodes, serial/parallel execution, question cycles, manual transitions, context inheritance, code nodes, and graph completion.
