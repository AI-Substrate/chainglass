# Workshop: ODS Orchestrator-Agent Handover Protocol

**Type**: Design Reconciliation
**Plan**: 030-positional-orchestrator
**Spec**: [research-dossier.md](../research-dossier.md)
**Created**: 2026-02-06
**Status**: Draft

**Related Documents**:
- [workshops.md](../workshops.md) — Workshop index
- [orchestration-request.md](02-orchestration-request.md) — ODS handler pseudo-implementations (SUPERSEDED by this workshop)
- [work-unit-pods.md](04-work-unit-pods.md) — ODS integration section lines 924-1061 (SUPERSEDED by this workshop)
- [onbas.md](05-onbas.md) — Walk algorithm, visitWaitingQuestion
- [e2e-integration-testing.md](06-e2e-integration-testing.md) — Human-as-agent pattern, Q2 resolution
- [e2e-sample-flow.ts](../../../docs/how/dev/workgraph-run/e2e-sample-flow.ts) — Reference implementation for handover protocol

---

## Purpose

Reconcile the **shared transition ownership** execution model (from `e2e-sample-flow.ts` and Workshop #6) with the Phase 6 dossier and earlier workshop pseudo-implementations (Workshops #2 and #4) that incorrectly assumed **ODS manages all state transitions** after pod execution.

The correct model is **shared ownership**: the orchestrator, agent, and external actors each own specific state transitions during the node lifecycle. The agent writes its own state changes during execution via CLI commands, the orchestrator owns reservation/failure/surfacing/resume, and external actors own answer storage. For code work units, the code executor plays the agent role — it owns the same transitions but the orchestrator may manage more of the flow since code units are deterministic.

This workshop answers:
- Who owns each state transition in the orchestrator-agent lifecycle?
- What does ODS actually do when handling each request type?
- How does the pod execution result map to graph state under shared transition ownership?
- What changes are needed to existing types and ONBAS logic?

---

## The Conflict

### What Workshops #2 and #4 Said (WRONG)

Workshop #4 lines 928-999 showed ODS calling `endNode()` and `askQuestion()` after pod execution:

```
Pod returns outcome: 'completed' → ODS calls graphService.endNode()
Pod returns outcome: 'question'  → ODS calls graphService.askQuestion()
```

This implies the orchestrator manages all state transitions — the pod/agent produces a result, and ODS writes it to state.

### What the User Clarified (CORRECT)

From the user's design intent and `e2e-sample-flow.ts`:

> Orchestrator hands over to agent. Agent officially accepts or takes control of the task via CLI, does work, raises errors, questions and when its ready it hands back after 'end'. If the agent exits and has not called end, then that is an error stage that we will handle later.

The agent calls `cg wf node start`, `cg wf node ask`, `cg wf node save-output-data`, and `cg wf node end` **during execution**. These are real CLI commands that write to `state.json` directly. When the pod returns, the state has already been updated by the agent.

Note: This is **shared transition ownership**, not purely "agent-owns-transitions". The orchestrator owns reservation (`startNode`), failure detection (`failNode`), question surfacing (`surfaceQuestion`), and resume coordination (`agentAcceptNode` for the `waiting-question → agent-accepted` resume path). The agent owns acceptance, question asking, output saving, and completion. External actors own answer storage. For code work units, the code executor plays the agent role.

### Evidence from e2e-sample-flow.ts

Mock mode (lines 260-326) shows the sequence. Note: in the old implementation, `start` was called by the test harness playing both orchestrator and agent roles. Under the two-phase model, this maps to two distinct steps:

```typescript
// ORCHESTRATOR reserves the node (pending → starting):
//   Internally: graphService.startNode() → status = 'starting'
//   In old e2e-sample-flow, this was implicit (no separate reserve step)

// AGENT accepts and takes control (starting → agent-accepted):
await runCli(['wg', 'node', 'start', GRAPH_SLUG, nodeId]);
// → node is now 'agent-accepted'

// AGENT does all the work via CLI:
await runCli(['wg', 'node', 'ask', GRAPH_SLUG, nodeId, ...]);      // asks question
await runCli(['wg', 'node', 'answer', GRAPH_SLUG, nodeId, ...]);   // answers it
await runCli(['wg', 'node', 'save-output-data', GRAPH_SLUG, ...]);  // saves outputs
await runCli(['wg', 'node', 'end', GRAPH_SLUG, nodeId]);           // completes node
// → node is now 'complete'
```

The orchestrator's `runAgentWithQuestionLoop` (lines 364-451) confirms: after the agent exits, the orchestrator **reads** the node status to discover what happened. It never writes it.

---

## The Two-Phase Handshake

### Why Two Phases?

A single "start" is ambiguous. If the orchestrator sets a working state and then the agent never picks up (pod crashes during startup, agent can't parse instructions, adapter fails), the node looks active but nobody is working on it. The orchestrator can't distinguish "agent is actively working" from "agent never showed up."

Similarly, if the agent is the only one to set state, the node stays `ready` during pod startup. In a future async/parallel model, ONBAS could walk again and try to start the same node twice.

The solution: **two distinct states representing two distinct events**.

### The Two States

Added to `NodeExecutionStatusSchema`:

```typescript
// state.schema.ts
export const NodeExecutionStatusSchema = z.enum([
  'starting',          // NEW — orchestrator has reserved this node
  'agent-accepted',    // NEW — agent has picked up this work
  'waiting-question',
  'blocked-error',
  'complete',
]);
```

| State | Set By | Meaning |
|-------|--------|---------|
| (no entry) | — | `pending` — not started, not ready |
| (computed) | Reality Builder | `ready` — all preconditions met, eligible for start |
| `starting` | **Orchestrator** | "I've committed to starting this node. Pod is being created." |
| `agent-accepted` | **Agent** | "I've picked up this work. I'm in control." |

`running` is removed as a stored state. It is replaced by two states with clear ownership.

### The Handshake Protocol

```
┌──────────────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR DOMAIN                            │
│                                                                   │
│  1. ONBAS walks graph → returns StartNodeRequest (node is ready) │
│  2. ODS receives request                                         │
│  3. ODS calls graphService.startNode()                           │
│       → node status = 'starting'                                 │
│       → started_at set                                           │
│       → ONBAS will skip this node on future walks                │
│  4. ODS creates pod, resolves context session                    │
│  5. ODS calls pod.execute() ─── HANDOVER ──────────────────┐     │
│                                                              │     │
│  ┌───────────────────────────────────────────────────────────┘     │
│  │                                                                 │
│  │  ┌──────────────────────────────────────────────────────────┐  │
│  │  │                  AGENT DOMAIN                              │  │
│  │  │                                                            │  │
│  │  │  Agent starts up, reads instructions from starter prompt.  │  │
│  │  │                                                            │  │
│  │  │  • cg wf node start     → 'starting' → 'agent-accepted'  │  │
│  │  │                           THIS IS THE ACCEPTANCE SIGNAL    │  │
│  │  │                                                            │  │
│  │  │  Agent now has control:                                    │  │
│  │  │  • cg wf node ask       → creates question,               │  │
│  │  │                           node → 'waiting-question'        │  │
│  │  │  • cg wf node save-output-data → saves output             │  │
│  │  │  • cg wf node save-output-file → saves file output        │  │
│  │  │  • cg wf node end       → node → 'complete'               │  │
│  │  │                                                            │  │
│  │  │  Agent process exits (cleanly or not).                     │  │
│  │  └──────────────────────────────────────────────────────────┘  │
│  │                                                                 │
│  └── HANDBACK ───────────────────────────────────────────────┐     │
│                                                               │     │
│  6. pod.execute() returns PodExecuteResult                   │     │
│  7. ODS reads resulting node state from reality              │     │
│  8. ODS persists session ID, destroys pod if appropriate     │     │
│  9. ODS emits domain events                                  │     │
│  10. ODS returns OrchestrationExecuteResult                  │     │
│                                                                     │
│  11. Orchestration loop rebuilds reality                     │     │
│  12. ONBAS walks again, sees new state                       │     │
└──────────────────────────────────────────────────────────────────┘
```

### What Each State Tells You

After pod.execute() returns, ODS re-reads node state:

| Post-Execute State | What Happened | ODS Response |
|-------------------|---------------|--------------|
| `complete` | Agent accepted, did work, called `end` | Destroy pod, emit node-completed |
| `waiting-question` | Agent accepted, asked a question, exited | Keep pod alive (session needed), emit node-waiting |
| `agent-accepted` | Agent accepted but exited without `end` | Error: agent didn't hand back. Destroy pod, mark blocked-error |
| `starting` | **Agent never called `start`** — never accepted | Error: agent failed to pick up. Destroy pod, mark blocked-error |
| `blocked-error` | Agent hit an error during execution | Destroy pod, emit error |

The two-phase model gives us **two distinct failure diagnostics**:
- `starting` after exit = agent never showed up (startup failure, bad instructions, adapter crash)
- `agent-accepted` after exit = agent showed up but didn't finish (bug, timeout, forgot to call end)

### State Transition Ownership (Revised)

| Transition | Owner | Mechanism | When |
|-----------|-------|-----------|------|
| pending → ready | Reality Builder | Computed from readiness rules | Each reality rebuild |
| pending → **starting** | **Orchestrator** (ODS) | `graphService.startNode()` | ODS handles start-node request |
| **starting** → **agent-accepted** | **Agent** | `cg wf node start` (→ `graphService.agentAcceptNode()` NEW) | Agent picks up work |
| agent-accepted → waiting-question | **Agent** | `cg wf node ask` (→ `graphService.askQuestion()`) | During agent execution |
| waiting-question → agent-accepted | **Orchestrator** (ODS) | `graphService.agentAcceptNode()` | ODS handles resume-node request |
| agent-accepted → complete | **Agent** | `cg wf node end` (→ `graphService.endNode()`) | During agent execution |
| starting → blocked-error | **Orchestrator** (ODS) | `graphService.failNode()` | After pod exits without agent accepting |
| agent-accepted → blocked-error | **Orchestrator** (ODS) | `graphService.failNode()` | After pod exits without agent calling end |
| surfaced_at | **Orchestrator** (ODS) | `graphService.surfaceQuestion()` (NEW) | When handling question-pending |

### Changes to startNode() and New agentAcceptNode()

Current `startNode()` transitions `pending` → `running`. Under the two-phase model:

- `startNode()` transitions `pending` → `starting` (orchestrator reserves)
- NEW `agentAcceptNode()` transitions `starting` → `agent-accepted` (agent picks up)

```
graphService.startNode()        →  sets 'starting'        (called by ODS)
graphService.agentAcceptNode()  →  sets 'agent-accepted'  (called by agent via CLI)
```

The existing `cg wf node start` CLI command calls BOTH in sequence for non-orchestrated use:
```typescript
// CLI handler for `cg wf node start`
await graphService.startNode(ctx, graphSlug, nodeId);        // pending → starting
await graphService.agentAcceptNode(ctx, graphSlug, nodeId);  // starting → agent-accepted
```

In the orchestrated path, ODS calls `startNode()` and the agent calls `agentAcceptNode()` separately.

### ONBAS Impact

ONBAS `visitNode` needs to handle both new statuses:

```typescript
case 'starting':
  return null;  // Orchestrator has reserved this, waiting for agent to accept

case 'agent-accepted':
  return null;  // Agent is working on this
```

Both are "skip" — the node is spoken for.

### What ODS Does NOT Do After Pod Returns

ODS does **not** call any of these after pod.execute() returns:
- `graphService.endNode()` — the agent called `end` during execution
- `graphService.askQuestion()` — the agent called `ask` during execution
- `graphService.saveOutputData()` — the agent called `save-output-data` during execution
- `graphService.agentAcceptNode()` — the agent called `start` during execution

---

## Reinterpreting PodExecuteResult

### Current Schema

```typescript
PodOutcomeSchema = z.enum(['completed', 'question', 'error', 'terminated']);
```

### What These Actually Mean

Under shared transition ownership, `PodExecuteResult.outcome` represents the **process exit status**, not the graph state:

| Outcome | Process Meaning | Graph State (read after) | ODS Action |
|---------|----------------|-------------------------|------------|
| `completed` | Agent process exited cleanly (exit code 0) | **Unknown** — must re-read state | Re-read node state, act accordingly |
| `error` | Agent process crashed or adapter threw | Probably still `starting` or `agent-accepted` | Re-read state; mark `blocked-error` if not complete |
| `terminated` | Agent was killed (e.g., timeout) | Probably still `starting` or `agent-accepted` | Re-read state; mark `blocked-error` if not complete |
| `question` | **DEAD CODE** — `AgentPod.mapAgentResult()` never produces this | N/A | Remove or repurpose |

### The 'completed' Ambiguity

When an agent exits cleanly (`outcome: 'completed'`), the node could be in ANY state:

1. **complete** — agent accepted, did work, called `end` → done, destroy pod
2. **waiting-question** — agent accepted, asked question, exited → question lifecycle begins
3. **agent-accepted** — agent accepted but exited WITHOUT calling `end` → error ("agent didn't hand back")
4. **starting** — agent NEVER called `start` → error ("agent never accepted")

ODS must re-read the node's state to know which case applies.

### Decision: Remove 'question' from PodOutcome

`AgentPod.mapAgentResult()` maps `AgentResult.status` which has values: `completed`, `failed`, `killed`. There is no `question` status from `IAgentAdapter`. The `question` outcome was designed for the old model where the pod itself reported questions.

**Resolution**: Remove `question` from `PodOutcomeSchema`. The three remaining outcomes (`completed`, `error`, `terminated`) correctly describe process exit states.

Also remove `question` from `PodExecuteResultSchema` (the optional `question: PodQuestionSchema` field).

---

## The Post-Execute State Read

When pod.execute() returns, ODS must discover what the agent did. This requires re-reading the node state.

### How ODS Gets Updated State

ODS receives `reality` as a parameter to `execute()` (per DYK insight #2). But this reality is a **snapshot from before pod execution** — it's stale.

ODS needs fresh state. Two options:

1. **Re-build reality**: Call the reality builder to get a fresh snapshot
2. **Read node state directly**: Call `graphService.getStatus()` and look up the node

**Decision**: ODS calls a `buildReality` function (injected dependency) to get a fresh `PositionalGraphReality` after pod execution. This keeps ODS working with the same Reality type everywhere and gives it access to question state, not just node status.

Wait — this contradicts DYK insight #2 which removed `buildReality` from the constructor. Let's reconcile:

- DYK #2 said: ODS receives reality as a parameter to avoid building it internally
- But: ODS needs to re-read state AFTER pod execution changes it
- The reality passed as parameter is the **pre-execution** snapshot
- The **post-execution** read is a different concern

**Revised Decision**: ODS receives both:
1. `reality` as a parameter (the pre-execution snapshot, for node lookup and context resolution)
2. `buildReality` as a constructor dependency (for post-execution state re-read)

The signature becomes:
```typescript
interface IODS {
  execute(
    request: OrchestrationRequest,
    ctx: WorkspaceContext,
    reality: PositionalGraphReality
  ): Promise<OrchestrationExecuteResult>;
}

// Constructor dependencies:
interface ODSDependencies {
  graphService: IPositionalGraphService;
  podManager: IPodManager;
  contextService: IAgentContextService;
  notifier: ICentralEventNotifier;
  buildReality: (ctx: WorkspaceContext, graphSlug: string) => Promise<PositionalGraphReality>;
}
```

### Post-Execute Logic

```typescript
// After pod.execute() returns:
const freshReality = await this.deps.buildReality(ctx, graphSlug);
const freshNode = freshReality.nodes.get(nodeId);

switch (freshNode.status) {
  case 'complete':
    // Agent accepted, did work, called 'end' — clean exit
    this.deps.podManager.destroyPod(nodeId);
    return { ok: true, request, newStatus: 'complete', sessionId };

  case 'waiting-question':
    // Agent accepted, called 'ask', exited — question lifecycle starts
    // Pod stays alive (session needed for resumption)
    return { ok: true, request, newStatus: 'waiting-question', sessionId };

  case 'agent-accepted':
    // Agent accepted but exited without calling 'end' — error condition
    // "If the agent exits and has not called end, then that is an error stage"
    await this.deps.graphService.failNode(ctx, graphSlug, nodeId, {
      code: 'AGENT_EXIT_WITHOUT_END',
      message: 'Agent accepted but exited without calling end',
    });
    this.deps.podManager.destroyPod(nodeId);
    return { ok: false, request, error: { code: 'AGENT_EXIT_WITHOUT_END', ... } };

  case 'starting':
    // Agent never called 'start' — never accepted the work
    await this.deps.graphService.failNode(ctx, graphSlug, nodeId, {
      code: 'AGENT_NEVER_ACCEPTED',
      message: 'Agent process exited without accepting the node (never called start)',
    });
    this.deps.podManager.destroyPod(nodeId);
    return { ok: false, request, error: { code: 'AGENT_NEVER_ACCEPTED', ... } };

  case 'blocked-error':
    // Agent hit an error condition during execution
    this.deps.podManager.destroyPod(nodeId);
    return { ok: false, request, newStatus: 'blocked-error' };
}
```

---

## The Question Lifecycle (Revised)

Under shared transition ownership, the question lifecycle has clear ownership:

```
Step  Who              What                                   State After
────  ───              ────                                   ───────────
1     ODS              Calls graphService.startNode()         starting
2     ODS              Calls pod.execute()                    starting (subprocess launched)
3     Agent            Calls `cg wf node start`              agent-accepted (ACCEPTANCE)
4     Agent            Calls `cg wf node ask`                waiting-question, question stored
5     Agent            Process exits (cleanly)                waiting-question (unchanged)
6     ODS              Re-reads state, sees question          Returns newStatus: 'waiting-question'
7     ONBAS            Walks graph, finds unsurfaced Q        Returns question-pending request
8     ODS              Calls surfaceQuestion()                surfaced_at set
9     External         User/UI answers question               answer stored, answered_at set
10    ONBAS            Walks graph, finds answered Q          Returns resume-node request
11    ODS              Calls agentAcceptNode()¹               node → agent-accepted
12    ODS              Calls pod.resumeWithAnswer()           Agent re-invoked with answer
```

¹ **ONBAS gap resolution** — see next section.

### Step-by-Step Detail

**Steps 1-3: Orchestrator starts, agent accepts**

ODS calls `startNode()` (pending → starting), creates pod, calls `pod.execute()`. Agent starts up, calls `cg wf node start` which invokes `graphService.agentAcceptNode()` (starting → agent-accepted). The agent now has control.

**Steps 4-5: Agent asks question and exits**

The agent calls `cg wf node ask` which invokes `graphService.askQuestion()`:
- Node status transitions: agent-accepted → waiting-question
- Question record created in state.json with `asked_at`
- Agent continues or exits. If it exits cleanly after asking, pod.execute() returns `outcome: 'completed'`.

**Step 6: ODS reads resulting state**

ODS re-reads reality, sees node is `waiting-question`. This is not an error — it's normal question flow. ODS persists the session ID (agent will be resumed later), does NOT destroy the pod.

**Steps 7-8: ONBAS finds unsurfaced question, ODS surfaces it**

ONBAS `visitWaitingQuestion` finds the question with `isSurfaced === false`, returns `question-pending` request. ODS handles it by calling `graphService.surfaceQuestion()` (NEW method) to set `surfaced_at`.

**Step 9: External answer**

A user or UI provides the answer via `cg wf node answer`, which calls `graphService.answerQuestion()`. This stores the answer and `answered_at` in the question record. **Crucially**: `answerQuestion()` currently transitions the node from `waiting-question` → `running`. This is problematic — see ONBAS gap below.

**Steps 10-12: ONBAS finds answered question, ODS resumes agent**

ONBAS walks graph, finds the answered question, returns `resume-node` request. ODS calls `agentAcceptNode()` to transition waiting-question → agent-accepted, retrieves the pod (or recreates it with the persisted session ID), calls `pod.resumeWithAnswer()`. The agent is re-invoked with the answer as a prompt and the existing session for context continuity.

---

## The ONBAS Resume-Node Gap

### The Problem

Current `answerQuestion()` in `positional-graph.service.ts` does two things:
1. Stores the answer + `answered_at` in the question record
2. Transitions node status from `waiting-question` → `running`
3. Clears `pending_question_id`

But ONBAS `visitWaitingQuestion` (onbas.ts:110-154) only runs for nodes with `status === 'waiting-question'`. If `answerQuestion()` already moved the node out of that status, ONBAS never sees the answered question and never produces a `resume-node` request.

### Root Cause

`answerQuestion()` was designed for the old execution model where answering immediately meant resuming. Under orchestrated execution, answering and resuming are separate steps.

### Resolution: answerQuestion() should NOT transition node status

`answerQuestion()` should:
- Store the answer + `answered_at` ✅
- Clear `pending_question_id` ❌ (ONBAS needs this to find the question)
- Transition node status ❌ (ONBAS needs the node in `waiting-question`)

**Decision**: `answerQuestion()` should ONLY store the answer. The node stays in `waiting-question` with `pending_question_id` intact. ONBAS can then find the answered question and produce a `resume-node` request. ODS's `handleResumeNode` transitions the node back to `agent-accepted` before calling `pod.resumeWithAnswer()`.

This means ODS `handleResumeNode` needs to:
1. Transition node status: `waiting-question` → `agent-accepted` (via `agentAcceptNode()`)
2. Clear `pending_question_id`
3. Get or recreate pod
4. Call `pod.resumeWithAnswer()`

The cleanest fix: **`answerQuestion()` should not transition the node**. The answer is stored, the node stays in `waiting-question`, and ONBAS produces a `resume-node` request so ODS can orchestrate the actual resumption (re-invoke agent with session).

For backward compatibility with CLI tests: Plan 028's CLI tests may need updating, but those tests don't use the orchestrator — they use direct CLI commands. The `cg wf node answer` command can continue to work, it just won't auto-resume. The separate `cg wf run` command will handle resumption via the orchestrator.

**FINAL Decision**: Modify `answerQuestion()` to not transition node status or clear `pending_question_id`. Store the answer + `answered_at` only. This is the correct behavior for orchestrated execution. Update any tests that depend on the old behavior.

### DYK-SUB#1: getNodeStatus() Never Populates pendingQuestion

**Discovered during subtask audit**: `getNodeStatus()` (positional-graph.service.ts:1054-1074) never sets the `pendingQuestion` field on `NodeStatusResult`, despite the field being declared on the interface (line 269). The reality builder reads `ns.pendingQuestion?.questionId` to populate `NodeReality.pendingQuestionId` — which is therefore always `undefined` in production.

This means ONBAS `visitWaitingQuestion` Gate 2 (`node.pendingQuestionId exists`) always fails in real (non-test) code. The `resume-node` request is never produced. Tests pass because `buildFakeReality` sets `pendingQuestionId` directly, bypassing the real builder chain.

**Resolution**: `getNodeStatus()` must read `pending_question_id` from state and populate `pendingQuestion` on the result. Fixed in the two-phase handshake subtask (T003).

### Additional Implementation Gaps Discovered

The following gaps were found during the subtask dossier audit and are fixed by the subtask:

1. `saveOutputData()`/`saveOutputFile()` guard `status !== 'running'` — agents call these while `agent-accepted`; guard must change
2. `GraphStatusResult.runningNodes` / `LineStatusResult.runningNodes` — filter `=== 'running'`, always empty post-migration; renamed to `activeNodes` filtering `starting` OR `agent-accepted`
3. `StartNodeResult.status?: 'running'` and `AnswerQuestionResult.status?: 'running'` — interface type literals need updating
4. `nodeNotRunningError` helper — needs rename and message update

---

## Revised ODS Handlers

### handleStartNode

```typescript
async handleStartNode(
  request: StartNodeRequest,
  ctx: WorkspaceContext,
  reality: PositionalGraphReality
): Promise<OrchestrationExecuteResult> {
  const { graphSlug, nodeId, inputs } = request;
  const node = reality.nodes.get(nodeId)!;

  // ── User-input: no pod needed ──────────────────────
  if (node.unitType === 'user-input') {
    // User-input nodes are completed externally (user provides data via CLI)
    // ODS reserves the node then immediately accepts
    // because there is no agent to do the acceptance
    await this.deps.graphService.startNode(ctx, graphSlug, nodeId);        // → starting
    await this.deps.graphService.agentAcceptNode(ctx, graphSlug, nodeId);  // → agent-accepted
    this.deps.notifier.emit('workgraphs', 'node-started', { graphSlug, nodeId });
    return { ok: true, request, newStatus: 'agent-accepted' };
  }

  // ── Phase 1: Orchestrator reserves node ────────────
  // pending → starting (prevents double-start from ONBAS)
  await this.deps.graphService.startNode(ctx, graphSlug, nodeId);

  // ── Create pod ─────────────────────────────────────
  const pod = this.deps.podManager.createPod({
    nodeId,
    type: node.unitType,                    // 'agent' | 'code'
    adapter: /* resolved from unit */,       // IAgentAdapter or IScriptRunner
  });

  // ── Resolve context session (agents only) ──────────
  let contextSessionId: string | undefined;
  if (node.unitType === 'agent') {
    const ctxResult = this.deps.contextService.getContextSource(reality, nodeId);
    if (ctxResult.source === 'inherit') {
      contextSessionId = this.deps.podManager.getSessionId(ctxResult.fromNodeId);
    }
  }

  // ── Phase 2: Invoke agent (HANDOVER) ───────────────
  // Agent is expected to call `cg wf node start` (→ agentAcceptNode)
  // which transitions starting → agent-accepted (the acceptance signal)
  const podResult = await pod.execute({
    inputs,
    contextSessionId,
    ctx,
    graphSlug,
  });

  // ── HANDBACK — agent has exited ────────────────────
  // Persist session
  if (podResult.sessionId) {
    this.deps.podManager.setSessionId(nodeId, podResult.sessionId);
    await this.deps.podManager.persistSessions(ctx, graphSlug);
  }

  // Re-read state — always, regardless of process outcome
  // The agent may have made progress even if the process crashed
  const fresh = await this.deps.buildReality(ctx, graphSlug);
  const freshNode = fresh.nodes.get(nodeId)!;

  switch (freshNode.status) {
    case 'complete':
      // Agent accepted, did work, called 'end'
      this.deps.podManager.destroyPod(nodeId);
      this.deps.notifier.emit('workgraphs', 'node-completed', { graphSlug, nodeId });
      return { ok: true, request, newStatus: 'complete', sessionId: podResult.sessionId };

    case 'waiting-question':
      // Agent accepted, asked a question, exited — pod stays alive
      this.deps.notifier.emit('workgraphs', 'node-waiting', { graphSlug, nodeId });
      return { ok: true, request, newStatus: 'waiting-question', sessionId: podResult.sessionId };

    case 'agent-accepted':
      // Agent accepted but exited without 'end'
      await this.deps.graphService.failNode(ctx, graphSlug, nodeId, {
        code: 'AGENT_EXIT_WITHOUT_END',
        message: 'Agent accepted but exited without calling end',
      });
      this.deps.podManager.destroyPod(nodeId);
      return { ok: false, request, error: { code: 'AGENT_EXIT_WITHOUT_END', message: '...', nodeId } };

    case 'starting':
      // Agent NEVER called 'start' — never accepted the work
      await this.deps.graphService.failNode(ctx, graphSlug, nodeId, {
        code: 'AGENT_NEVER_ACCEPTED',
        message: 'Agent exited without accepting the node',
      });
      this.deps.podManager.destroyPod(nodeId);
      return { ok: false, request, error: { code: 'AGENT_NEVER_ACCEPTED', message: '...', nodeId } };

    case 'blocked-error':
      // Agent (or the pod itself) hit an error
      this.deps.podManager.destroyPod(nodeId);
      return { ok: false, request, newStatus: 'blocked-error' };

    default:
      this.deps.podManager.destroyPod(nodeId);
      return { ok: false, request, error: { code: 'UNEXPECTED_STATE', message: `${freshNode.status}`, nodeId } };
  }
}
```

### handleResumeNode

```typescript
async handleResumeNode(
  request: ResumeNodeRequest,
  ctx: WorkspaceContext,
  reality: PositionalGraphReality
): Promise<OrchestrationExecuteResult> {
  const { graphSlug, nodeId, questionId, answer } = request;

  // ── Transition: waiting-question → agent-accepted ──
  // ODS owns this transition for resume (no agent acceptance needed —
  // agent is being re-invoked into an already-accepted session)
  await this.deps.graphService.agentAcceptNode(ctx, graphSlug, nodeId);

  // ── Get or recreate pod ────────────────────────────
  let pod = this.deps.podManager.getPod(nodeId);
  if (!pod) {
    // Pod was destroyed (process restart). Recreate with persisted session.
    const node = reality.nodes.get(nodeId)!;
    pod = this.deps.podManager.createPod({
      nodeId,
      type: node.unitType as 'agent' | 'code',
      adapter: /* resolved from unit */,
    });
  }

  // ── Resume with answer (HANDOVER) ─────────────────
  const podResult = await pod.resumeWithAnswer(questionId, answer, {
    inputs: { ok: true, inputs: {} },   // Inputs already consumed on first execute
    ctx,
    graphSlug,
  });

  // ── HANDBACK — same post-execute state read ────────
  if (podResult.sessionId) {
    this.deps.podManager.setSessionId(nodeId, podResult.sessionId);
    await this.deps.podManager.persistSessions(ctx, graphSlug);
  }

  // Re-read state and determine outcome
  // (Same switch as handleStartNode post-execute —
  //  except 'starting' is impossible since we already set 'agent-accepted')
  const fresh = await this.deps.buildReality(ctx, graphSlug);
  const freshNode = fresh.nodes.get(nodeId)!;
  // ... same switch on freshNode.status ...
}
```

Note: On resume, the agent does NOT call `cg wf node start` again. The node is already accepted — we're continuing an existing session. ODS calls `agentAcceptNode()` directly to transition `waiting-question` → `agent-accepted` because the agent already proved acceptance on the first invocation.

### handleQuestionPending

```typescript
async handleQuestionPending(
  request: QuestionPendingRequest,
  ctx: WorkspaceContext,
  reality: PositionalGraphReality
): Promise<OrchestrationExecuteResult> {
  const { graphSlug, nodeId, questionId, questionText, questionType, options } = request;

  // Set surfaced_at (NEW method on IPositionalGraphService)
  await this.deps.graphService.surfaceQuestion(ctx, graphSlug, nodeId, questionId);

  // Emit event for UI consumption
  this.deps.notifier.emit('workgraphs', 'question-surfaced', {
    graphSlug,
    nodeId,
    questionId,
    questionText,
    questionType,
    options,
  });

  return { ok: true, request };
}
```

### handleNoAction

```typescript
async handleNoAction(
  request: NoActionRequest
): Promise<OrchestrationExecuteResult> {
  // No side effects
  return { ok: true, request };
}
```

---

## FakePod Testing Implications

### The Problem

Under shared transition ownership, the agent modifies state.json during execution. In unit tests, there is no real agent. `FakePod.execute()` returns a configured `PodExecuteResult`, but it doesn't modify any graph state. So when ODS re-reads state after pod execution, the node is still in `starting` — and ODS treats this as AGENT_NEVER_ACCEPTED.

### The Solution: onExecute Callback

`FakePod` needs an `onExecute` callback that runs during `execute()` to simulate what the agent would do:

```typescript
interface FakePodConfig {
  /** What the pod returns */
  result: PodExecuteResult;

  /**
   * Side effects the "agent" performs during execution.
   * Called before the result is returned.
   * Use this to call graphService methods that the agent would call via CLI.
   */
  onExecute?: () => Promise<void>;
}
```

Test setup example:

```typescript
// Simulate an agent that accepts, does work, and calls 'end'
fakePodManager.configurePod('node-1', {
  result: { outcome: 'completed', sessionId: 'sess-1' },
  onExecute: async () => {
    // Simulate: agent calls `cg wf node start` (acceptance)
    await fakeGraphService.agentAcceptNode(ctx, graphSlug, 'node-1');  // starting → agent-accepted
    // Simulate: agent calls `cg wf node end`
    await fakeGraphService.endNode(ctx, graphSlug, 'node-1');          // agent-accepted → complete
  },
});

// Simulate an agent that accepts, asks a question, and exits
fakePodManager.configurePod('node-2', {
  result: { outcome: 'completed', sessionId: 'sess-2' },
  onExecute: async () => {
    // Simulate: agent calls `cg wf node start` (acceptance)
    await fakeGraphService.agentAcceptNode(ctx, graphSlug, 'node-2');
    // Simulate: agent calls `cg wf node ask`
    await fakeGraphService.askQuestion(ctx, graphSlug, 'node-2', {
      type: 'single',
      text: 'Which language?',
      options: ['TypeScript', 'Python'],
    });
  },
});

// Simulate an agent that accepts but exits without calling 'end'
fakePodManager.configurePod('node-3', {
  result: { outcome: 'completed', sessionId: 'sess-3' },
  onExecute: async () => {
    // Agent accepts but never completes
    await fakeGraphService.agentAcceptNode(ctx, graphSlug, 'node-3');
    // No endNode — state stays 'agent-accepted' → ODS detects AGENT_EXIT_WITHOUT_END
  },
});

// Simulate an agent that never even accepts (crashes on startup)
fakePodManager.configurePod('node-4', {
  result: { outcome: 'completed', sessionId: 'sess-4' },
  // No onExecute at all — state stays 'starting' → ODS detects AGENT_NEVER_ACCEPTED
});
```

This keeps the test infrastructure honest — the FakePod simulates the agent's side effects, and ODS's post-execute state read works correctly.

---

## Required Changes Summary

### New States

| State | Value | In Schema | Set By |
|-------|-------|-----------|--------|
| `starting` | Added to `NodeExecutionStatusSchema` | `state.schema.ts` | Orchestrator (ODS) via `startNode()` |
| `agent-accepted` | Added to `NodeExecutionStatusSchema` | `state.schema.ts` | Agent via `agentAcceptNode()` |

Note: `running` is **removed** as a stored status. It is replaced by `starting` and `agent-accepted` which have unambiguous ownership.

### New Methods Needed

| Method | Where | Purpose |
|--------|-------|---------|
| `agentAcceptNode(ctx, graphSlug, nodeId)` | `IPositionalGraphService` | Transition `starting` → `agent-accepted` (agent acceptance) |
| `surfaceQuestion(ctx, graphSlug, nodeId, questionId)` | `IPositionalGraphService` | Set `surfaced_at` on question record |
| `failNode(ctx, graphSlug, nodeId, error)` | `IPositionalGraphService` | Transition any → `blocked-error` with error details |

### Schema Changes

| Change | File | Detail |
|--------|------|--------|
| Replace `'running'` with `'starting'`, `'agent-accepted'` in `NodeExecutionStatusSchema` | `state.schema.ts` | Two-phase handshake states |
| Remove `'question'` from `PodOutcomeSchema` | `pod.schema.ts` | Dead code — AgentPod never produces this |
| Remove `question` field from `PodExecuteResultSchema` | `pod.schema.ts` | No longer needed |
| Replace `'running'` with `'starting'`, `'agent-accepted'` in `ExecutionStatus` | `reality.types.ts` | Matches schema change |

### Behavior Changes

| Change | Component | Detail |
|--------|-----------|--------|
| `startNode()` transitions to `starting` (not `running`) | `PositionalGraphService` | Orchestrator reservation |
| `answerQuestion()` should NOT transition node | `PositionalGraphService` | Keep node in `waiting-question`, keep `pending_question_id` |
| ONBAS `visitNode` handles `starting` and `agent-accepted` | `onbas.ts` | Both return null (skip — node is spoken for) |
| ODS re-reads state after pod execution | ODS | New `buildReality` dependency for post-execute state check |
| FakePod gains `onExecute` callback | `FakePodManager` | Simulates agent CLI calls during test execution |
| `cg wf node start` CLI maps to `agentAcceptNode()` | CLI handler | Agent calls start → `agentAcceptNode()` (starting → agent-accepted) |

### What Stays The Same

- ONBAS `walkForNextAction` — structure unchanged (add cases for new states)
- `OrchestrationRequest` types — unchanged
- `OrchestrationExecuteResult` type — unchanged
- `IWorkUnitPod` interface — unchanged
- `AgentPod.mapAgentResult()` — already only maps completed/error/terminated

---

## Open Questions Resolved

### OQ-1: Should answerQuestion() keep node in waiting-question?

**YES.** `answerQuestion()` should only store the answer. The node stays in `waiting-question` with `pending_question_id` intact. ONBAS detects the answered question and produces `resume-node`. ODS handles the actual resumption (transitioning node and re-invoking agent).

### OQ-2: Should FakePod gain onExecute callback?

**YES.** The `onExecute` callback simulates agent CLI calls during test execution. Without it, ODS's post-execute state read would always see `starting` (no agent modified state), making it impossible to test the happy path.

### OQ-3: How does ODS re-read state?

Via `buildReality` injected as a constructor dependency. After pod.execute() returns, ODS calls `buildReality(ctx, graphSlug)` to get a fresh snapshot reflecting any state changes the agent made during execution.

### OQ-4: Remove outcome: 'question' from PodOutcomeSchema?

**YES.** It's dead code. `AgentPod.mapAgentResult()` never produces it. Remove from schema and result type.

### OQ-5: Pod lifecycle when agent asks question?

Pod stays alive when agent asks a question and exits. The session ID is persisted. When ONBAS produces `resume-node`, ODS retrieves the pod (or recreates it with the persisted session) and calls `resumeWithAnswer()`.

---

## Impact on Phase 6 Dossier

The Phase 6 tasks.md needs revision to reflect shared transition ownership and two-phase handshake:

1. **T001 (IODS interface)**: Add `buildReality` to ODSDependencies
2. **T002 (FakeODS)**: Update to match new handler semantics
3. **T003/T004 (start-node)**: Replace "ODS calls endNode/askQuestion" with post-execute state read; use `starting` and `agent-accepted` states
4. **T005/T006 (resume-node)**: ODS transitions node via `agentAcceptNode()` before resuming
5. **T007/T008 (question-pending)**: Add surfaceQuestion() — this was already identified in DYK #1
6. **T010 (input wiring)**: Unchanged — InputPack flow still goes from request to pod.execute()
7. **New**: Replace `running` with `starting`/`agent-accepted` in schemas and types
8. **New**: Add PodOutcomeSchema cleanup task (remove 'question')
9. **New**: Add answerQuestion() behavior change task

---

## Glossary

| Term | Definition |
|------|------------|
| **Handover** | The moment ODS calls pod.execute() and the agent takes control |
| **Handback** | The moment pod.execute() returns and ODS regains control |
| **Two-phase handshake** | Orchestrator sets `starting` (reservation), agent sets `agent-accepted` (acceptance) |
| **starting** | Node state meaning "orchestrator has reserved this node, pod is being created, agent not yet accepted" |
| **agent-accepted** | Node state meaning "agent has picked up the work and is in control" |
| **Shared transition ownership** | Design principle: orchestrator, agent, and external actors each own specific state transitions. Agent writes start/ask/end/save-output during execution via CLI. Orchestrator owns reservation/failure/surfacing/resume. External actors own answer storage. |
| **Post-execute state read** | ODS re-reads reality after pod returns to discover what the agent did |
| **Process exit status** | What PodExecuteResult.outcome represents — how the process exited, not what state the node is in |

---

## Summary

The orchestrator-agent handover follows a clear protocol:

1. **ODS reserves the node** (pending → `starting`) and creates a pod
2. **Pod.execute() hands control to the agent** — the agent is a subprocess
3. **Agent accepts** — calls `cg wf node start` (starting → `agent-accepted`)
4. **Agent does work** — asks questions, saves outputs, calls end — all via CLI → graphService
5. **Agent exits** — pod.execute() returns with a process exit status
6. **ODS reads resulting state** — rebuilds reality to discover what the agent actually did
7. **ODS reacts accordingly** — destroys pod on completion, keeps pod alive on question, marks error on unexpected exit

The key insight: **ODS never tells the graph service what the agent did — it reads what the agent did.** The agent speaks for itself through CLI commands. ODS is a traffic controller, not a translator.

The two-phase handshake (`starting` → `agent-accepted`) gives the orchestrator clear diagnostics: did the agent never show up, or did it show up and fail to finish? This distinction matters for retry logic, error reporting, and debugging.
