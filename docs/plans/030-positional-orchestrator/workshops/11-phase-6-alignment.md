# Workshop 11: Phase 6 Alignment — What ODS Actually Does

**Type**: Design Reconciliation
**Plan**: 030-positional-orchestrator
**Spec**: [positional-orchestrator-spec.md](../positional-orchestrator-spec.md)
**Created**: 2026-02-09
**Status**: Draft

**Related Documents**:
- [Workshop #8: ODS Handover Protocol](08-ods-orchestrator-agent-handover.md) — Original ODS design
- [Workshop #9: Concept Drift Remediation](09-concept-drift-remediation.md) — Two-domain boundary
- [Workshop #10: Node Restart Event](10-node-restart-event.md) — restart-pending mechanics
- [Subtask 001 Execution Log](../tasks/phase-6-ods-action-handlers/001-subtask-concept-drift-remediation.execution.log.md) — What shipped
- [Worked Example: Two-Domain Boundary](../tasks/phase-6-ods-action-handlers/examples/worked-example-two-domain-boundary.ts) — Runnable proof

---

## Purpose

Phase 6 is next. Three workshops (#8, #9, #10) and a shipped subtask have changed what ODS means. This workshop consolidates everything into a single authoritative reference for Phase 6 implementation. It resolves every open question and contradiction so the `/plan-5` dossier can be generated without ambiguity.

## Key Questions Addressed

- Q1: What is the exact IODS interface signature after all reconciliations?
- Q2: What are ODS's handlers and what does each do?
- Q3: How does `resume-node` fit — is it alive, dead, or deferred?
- Q4: What happens to `question-pending` — does ODS ever see it?
- Q5: What service methods does ODS need that don't exist yet?
- Q6: What's the FakePod testing strategy for shared transition ownership?
- Q7: What is the exact Settle → Decide → Act loop contract?
- Q8: Should ONBAS have question-specific logic at all?

---

## Part 1: The Big Picture After All Reconciliations

### What Changed Since Workshop 08 Was Written

| Decision Source | Change | Impact on ODS |
|----------------|--------|---------------|
| Workshop #9 (Concept Drift) | ODS never handles `question-pending` — loop exits first | Remove `handleQuestionPending` entirely |
| Workshop #9 | ODS reads post-execute state, not pod outcomes | Post-execute switch on node status |
| Workshop #9 | `question-pending` is a stop signal like `no-action` | ODS only handles `start-node`, `resume-node`, `no-action` |
| Workshop #10 (Node Restart) | Answered questions go through `node:restart` → `restart-pending` → `ready` → `start-node` | Q&A restart uses `start-node`, not `resume-node` |
| Workshop #10 | `resume-node` is no longer produced by ONBAS for Q&A | `resume-node` needs a decision: keep, remove, or defer |
| Subtask 001 (Shipped) | `handleQuestionAnswer` stamps only — no status transition | Node stays `waiting-question` after answer |
| Subtask 001 | `restart-pending` status exists, reality builder maps to `ready` | `startNode()` accepts `restart-pending` |
| Subtask 001 | 7 event types including `node:restart` | Event system is feature-complete |

### The Resulting ODS Scope

ODS handles **one active request type**. Everything else is a loop exit condition or dead code.

| Request | ODS Does |
|---------|----------|
| `start-node` | Reserve node → create pod → resolve context → invoke agent → read post-execute state |
| ~~`resume-node`~~ | **Dead code** — ONBAS never produces it (Part 5) |
| ~~`question-pending`~~ | **Dead code** — ONBAS never produces it after Subtask 002 (Part 13) |
| `no-action` | **Never reaches ODS** — loop exits before dispatch (Part 6) |

---

## Part 2: The IODS Interface

### Signature

```typescript
interface IODS {
  execute(
    request: OrchestrationRequest,
    ctx: WorkspaceContext,
    reality: PositionalGraphReality,
  ): Promise<OrchestrationExecuteResult>;
}
```

**Key design decisions:**

1. **`OrchestrationRequest` (full union)**: ODS is a general-purpose dispatcher. The loop passes the full ONBAS output without inspecting the type. ODS dispatches on `request.type` internally — `start-node` does real work, `no-action` is a no-op, `resume-node`/`question-pending` return defensive errors (dead code). See Workshop 12 for details.

2. **`reality` is the pre-execution snapshot**: ODS uses it to look up node metadata (unitType, inputs, questions). ODS does NOT read post-execute state — the loop discovers results via Settle on the next iteration.

3. **`ctx` is WorkspaceContext**: Already used throughout the codebase for service calls.

### Constructor Dependencies

```typescript
interface ODSDependencies {
  graphService: IPositionalGraphService;
  podManager: IPodManager;
  contextService: IAgentContextService;
}
```

**Removed from Workshop #8**:
- `notifier: ICentralEventNotifier` — per Workshop #9 OQ-3, domain event emission is deferred. ODS is graph domain; notification is event domain.
- `buildReality` — ODS is fire-and-forget. No post-execute state read. The loop handles discovery on the next iteration.

---

## Part 3: The `handleStartNode` Handler

ODS is **fire-and-forget**. It reserves the node, launches the agent, and returns immediately. It does NOT wait for the agent to finish. The Settle → Decide → Act loop handles discovery of what happened on the next iteration.

> **Workshop #8 correction**: Workshop #8 described ODS as blocking on `pod.execute()` and reading post-execute state. That model is superseded. The event system and ONBAS loop handle all post-execution discovery. ODS is the ignition, not the supervisor.

### Flow

```
1. Check unitType from reality snapshot
   - user-input: No-op — user-input is a UI concern, not orchestration
   - agent/code: Reserve + launch pod (below)

2. Reserve node: graphService.startNode() → pending/restart-pending → starting
   (This is the ONE graph-domain state mutation)

3. Resolve context (agents only):
   - contextService.getContextSource(reality, nodeId)
   - If 'inherit': podManager.getSessionId(fromNodeId)

4. Create pod: podManager.createPod({ nodeId, type, adapter })

5. Launch agent: pod.execute({ inputs, contextSessionId, ctx, graphSlug })
   Fire and forget. ODS does NOT await the result.

6. Return immediately: { ok: true, newStatus: 'starting' }
```

### What Happens After ODS Returns

The agent runs asynchronously. It communicates through events:

```
Agent calls CLI              Event raised          Handler sets
──────────────              ────────────           ────────────
cg wf node start            node:accepted          agent-accepted
cg wf node ask              question:ask           waiting-question
cg wf node end              node:completed         complete
(agent crashes)             node:error             blocked-error
```

Next time the orchestration loop runs:
1. **Settle** processes these events → state updated
2. **ONBAS** reads settled state → decides what's next
3. **ODS** starts another node if one is ready

### Agent Failure Detection

ODS does NOT detect agent failures. Agent failure is discovered by the loop:

| Failure Mode | How Detected | By Whom |
|-------------|-------------|---------|
| Agent never accepted | Node stays `starting` indefinitely | Future watchdog/timeout |
| Agent exited without `end` | Node stays `agent-accepted` indefinitely | Future watchdog/timeout |
| Agent crashed | `node:error` event raised | Settle phase (event handler) |
| Agent asked question | `question:ask` event raised | Settle phase (event handler) |

Stale-node detection (nodes stuck in `starting` or `agent-accepted` for too long) is a monitoring concern, not an ODS concern.

### User-Input Nodes

User-input nodes are a UI concern, not an orchestration concern. The user provides data through the UI or CLI before orchestration runs. ODS treats them as a no-op — if ONBAS somehow produces `start-node` for a user-input node, ODS returns `{ ok: true }` and moves on. See Workshop 12 for details.

---

## Part 4: The `handleNoAction` Handler

```typescript
async handleNoAction(request: NoActionRequest): Promise<OrchestrationExecuteResult> {
  return { ok: true, request };
}
```

Zero side effects. The loop exits after this.

---

## Part 5: The `resume-node` Decision

This is the key open question. Three workshops give conflicting signals:

### The Conflict

| Source | Says |
|--------|------|
| Workshop #8 | ODS has `handleResumeNode`: transitions `waiting-question → agent-accepted`, recreates pod, calls `pod.resumeWithAnswer()` |
| Workshop #9 | `resume-node` stays in union. ONBAS still returns it for answered questions. ODS handles it. |
| Workshop #10 | After `node:restart`, answered questions go through `start-node`. `resume-node` is "no longer produced by ONBAS for Q&A restarts." Recommended: **defer** (option D). |
| Subtask 001 (shipped) | Implemented `node:restart`. `answerQuestion()` now raises both `question:answer` and `node:restart`. After settlement, node is `restart-pending`. Reality builder maps to `ready`. ONBAS returns `start-node`. |

### The Reality After Subtask 001

With the shipped code:

1. `answerQuestion()` raises `question:answer` + `node:restart`
2. After settlement: node is `restart-pending` (not `waiting-question`)
3. Reality builder maps `restart-pending` → `ready`
4. ONBAS sees `ready`, returns `start-node` (not `resume-node`)
5. ODS receives `start-node`, starts the node normally

**ONBAS `visitWaitingQuestion` never fires for answered questions.** By the time ONBAS runs (after Settle), the node is `restart-pending` → `ready`, which is handled by `visitNode`'s `ready` branch, not `visitWaitingQuestion`.

This means `resume-node` is never produced by current ONBAS for Q&A scenarios.

### When Would `resume-node` Fire?

Only if settlement does NOT process the events — i.e., someone answers a question but the `node:restart` event isn't raised or settlement doesn't run. In the current implementation, `answerQuestion()` always raises both events, and the Settle phase always runs before ONBAS. So `resume-node` is **dead code in the current architecture**.

### Decision: Remove `resume-node` from ODS scope. Keep in union as dead code.

**Rationale:**
- `resume-node` is architecturally dead — no production code path produces it after Subtask 001
- Building `handleResumeNode` in Phase 6 would be implementing dead code
- The `ResumeNodeRequest` type stays in the union for forward compatibility (if a future design reintroduces it)
- ONBAS's `visitWaitingQuestion` `isAnswered` branch stays but will never fire after a proper Settle phase
- If we discover a scenario needing it later, we add the handler then

**What this means for Phase 6:**
- ODS dispatches on `start-node` and `no-action` only
- `resume-node` reaching ODS is an error (defensive: return error result)
- `question-pending` never reaches ODS (loop exits first)
- If a future scenario needs explicit resume (e.g., hot-resume without restart), we'll revisit

---

## Part 6: What About `question-pending`?

Workshop #9 was clear: `question-pending` is a **loop exit signal**, not an ODS action.

```
Loop pseudocode:
  while (true) {
    settle()
    request = onbas.getNextAction(reality)

    if request.type === 'no-action' || request.type === 'question-pending':
      return { stopReason: request.type, ... }  // EXIT — ODS never called

    result = ods.execute(request, ctx, reality)  // Only start-node reaches here
    actions.push(result)
  }
```

**ODS never sees `question-pending`.** The loop coordinator (Phase 7's `IGraphOrchestration.run()`) handles it as a stop condition.

### What Happens to Question Surfacing?

Workshop #8 had ODS calling `surfaceQuestion()` and emitting SSE events. Workshop #9 moved this to the event domain.

For Phase 6: **surfacing is out of scope.** It's a web-layer concern handled by a future event handler or web middleware. The orchestration loop exits on `question-pending`, and whatever called `.run()` (web controller, CLI) can read the question from the `finalReality` return value.

---

## Part 7: Missing Service Methods

ODS needs service methods that don't exist yet. Some are new, some need modifications.

### New Methods Needed

| Method | Purpose | Called By |
|--------|---------|-----------|
| ~~`agentAcceptNode(ctx, graphSlug, nodeId)`~~ | ~~Transition `starting → agent-accepted`~~ | **Not Phase 6** — agent accepts itself via CLI events (`node:accepted`) |
| ~~`failNode(ctx, graphSlug, nodeId, error)`~~ | ~~Transition any → `blocked-error`~~ | **Deferred** — ODS is fire-and-forget; error detection is a watchdog concern |
| `surfaceQuestion(ctx, graphSlug, nodeId, qId)` | Set `surfaced_at` on question record | **Deferred** — not Phase 6 scope |

### Existing Methods Needing Changes

| Method | Current Behavior | Needed Change |
|--------|-----------------|---------------|
| `startNode()` | Already accepts `['pending', 'restart-pending']` | **No change** (shipped in Subtask 001) |
| `answerQuestion()` | Already stamps only, raises `node:restart` | **No change** (shipped in Subtask 001) |
| `getNodeStatus()` | Must populate `pendingQuestion` field (DYK-SUB#1) | **Needs fix** — see Part 8 |

### Methods ODS Does NOT Call

- `endNode()` — agent calls this via CLI during execution
- `askQuestion()` — agent calls this via CLI during execution
- `saveOutputData()` / `saveOutputFile()` — agent calls these via CLI

---

## Part 8: The `pendingQuestion` Gap (DYK-SUB#1)

Workshop #8 discovered that `getNodeStatus()` never populates the `pendingQuestion` field on `NodeStatusResult`. This means the reality builder's `NodeReality.pendingQuestionId` is always `undefined` in production.

### Impact

ONBAS `visitWaitingQuestion` checks:
1. `node.status === 'waiting-question'` — works (flat status field)
2. `node.pendingQuestionId` exists — **always fails in production**
3. `questions.find(q => q.id === pendingQuestionId)` — never reached

This means ONBAS would never produce `question-pending` or detect answered questions in production. Tests pass because `buildFakeReality` sets `pendingQuestionId` directly.

### With `node:restart` This Is Less Critical

After Subtask 001, the Q&A restart flow doesn't rely on ONBAS detecting answered questions. The flow is:
1. Answer → `node:restart` → settlement → `restart-pending` → `ready` → `start-node`

ONBAS never needs to see the answered question. But `question-pending` (surfacing unsurfaced questions) DOES still need `pendingQuestionId` to work.

### Resolution

Fix `getNodeStatus()` to populate `pendingQuestion` from `state.nodes[nodeId].pending_question_id`. This is a prerequisite for the orchestration loop to correctly surface questions.

**Phase scope**: This fix should be in Phase 6 (ODS needs the reality to be correct for post-execute reads) or as a Phase 6 prerequisite.

---

## Part 9: FakePod Testing Strategy

ODS is fire-and-forget: it calls `pod.execute()` without awaiting the result, then returns immediately. This dramatically simplifies testing.

### What ODS Tests Verify

ODS tests verify that `handleStartNode`:
1. Calls `graphService.startNode()` to reserve the node
2. Creates a pod with correct parameters (nodeId, type, adapter)
3. Resolves context session for agents (`getContextSource`, `getSessionId`)
4. Launches the pod with correct inputs and context
5. Returns `{ ok: true, newStatus: 'starting' }` immediately

ODS tests do **not** verify what the agent does after launch. That's the event system's job.

### What ODS Tests Do NOT Need

- `onExecute` callback — ODS doesn't read post-execute state
- Post-execute state switching — no 5-way status branch
- `failNode()` calls — error detection is not ODS's job
- Pod destruction logic — lifecycle managed elsewhere
- `buildReality` dependency — no post-execute state read

### Test Infrastructure

- **FakePodManager**: Already exists. Tracks `createPod()` calls, returns FakePod instances.
- **FakePod**: Already exists. Records `execute()` calls. ODS doesn't care about the result.
- **FakeAgentContextService**: Already exists. Returns configured context source.
- **FakePositionalGraphService**: Needed for `startNode()`.

### Test Scenarios

| Scenario | What ODS Does | What Test Verifies |
|----------|--------------|-------------------|
| Agent node (ready) | Reserve, create pod, resolve context, launch | `startNode` called, pod created with context session |
| Agent node (inherit context) | Same + gets session from predecessor | `getContextSource` returns inherit, `getSessionId` called |
| Agent node (new context) | Same, no session ID | `getContextSource` returns new, no session lookup |
| Code node (ready) | Reserve, create pod, launch (no context) | Pod created with type 'code', no context resolution |
| User-input node | No-op — returns `{ ok: true }` | No service calls, no pod created |
| Node not ready | Should not reach ODS | Defensive: return error |

---

## Part 10: The Settle → Decide → Act Contract

This is the loop that Phase 7 (`IGraphOrchestration.run()`) implements, but Phase 6 needs to understand its contract.

### Pseudocode

```typescript
async run(ctx: WorkspaceContext): Promise<OrchestrationRunResult> {
  const actions: OrchestrationAction[] = [];

  while (true) {
    // 1. SETTLE — Event domain processes pending events
    const state = await this.loadState(this.graphSlug);
    const settleResult = this.eventHandlerService.processGraph(
      state, 'orchestrator', 'web'
    );
    if (settleResult.eventsProcessed > 0) {
      await this.persistState(this.graphSlug, state);
    }

    // 2. DECIDE — ONBAS reads settled state
    const reality = await this.buildReality(ctx, this.graphSlug);
    const request = this.onbas.getNextAction(reality);

    // Exit conditions — ODS never sees these
    if (request.type === 'no-action') {
      return { actions, stopReason: request.reason, finalReality: reality };
    }
    if (request.type === 'question-pending') {
      return { actions, stopReason: 'question-pending', finalReality: reality };
    }

    // 3. ACT — ODS executes the node-level request
    const result = await this.ods.execute(request, ctx, reality);
    actions.push({ request, result });

    // Loop continues — next iteration settles events from the action
  }
}
```

### Contract Between Loop and ODS

| Concern | Who Owns It |
|---------|-------------|
| Loading state from disk | Loop |
| Running Settle (EHS.processGraph) | Loop |
| Persisting state after Settle | Loop |
| Building reality | Loop |
| Calling ONBAS | Loop |
| Filtering exit conditions (`no-action`, `question-pending`) | Loop |
| Dispatching to ODS | Loop |
| Reserving node (`startNode`) | ODS |
| Creating pod | ODS |
| Resolving agent context | ODS |
| Launching pod (`pod.execute()` — fire and forget) | ODS |
| Returning result | ODS |
| Discovering what agent did | Loop (via Settle on next iteration) |
| Detecting stale/failed agents | Future watchdog |

### What ODS Assumes

1. **State is settled** before ODS is called — all pending events processed
2. **Reality is fresh** — built from the settled state
3. **Request is node-level** — `start-node` only in practice; defensive error for anything else
4. **graphService methods work** — `startNode()` is available

---

## Part 11: The Complete Phase 6 Scope

### In Scope

| # | What | Why |
|---|------|-----|
| 1 | `IODS` interface (dispatch table pattern) | Foundation — extensible for future handlers |
| 2 | `FakeODS` test double | TDD infrastructure |
| 3 | `handleStartNode` (fire-and-forget) | Core functionality — reserve, launch pod, return |
| 4 | User-input no-op branch | User-input is a UI concern, not orchestration |
| ~~5~~ | ~~`agentAcceptNode()` service method~~ | **Removed** — agent CLI concern, not Phase 6 |
| 6 | Input wiring from reality through to pods | AC-14 |
| 7 | Unit tests for ODS dispatch and start-node | TDD — RED/GREEN per plan constraints |

### Out of Scope

| # | What | Why | When |
|---|------|-----|------|
| 1 | `handleResumeNode` | Dead code — ONBAS never produces it | If needed, future phase |
| 2 | `handleQuestionPending` | Dead code — ONBAS never produces it after Subtask 002 | Never for ODS |
| 3 | Post-execute state read | ODS is fire-and-forget — loop discovers results via Settle | Never for ODS |
| 4 | `failNode()` service method | Error detection is a watchdog/timeout concern, not ODS | Future monitoring |
| 5 | Question surfacing (`surfaceQuestion()`) | Event domain — not graph domain | Future web layer |
| 6 | `ICentralEventNotifier` integration | Domain events for SSE — deferred | Phase 7 or future |
| 7 | `PodOutcome: 'question'` removal | Dead code cleanup — no urgency | Phase 7 or future |
| 8 | `cg wf node start` CLI update for two-phase | CLI changes are out of orchestrator scope | Plan 028 or future |
| 9 | Orchestration loop (`IGraphOrchestration.run()`) | Phase 7 | Phase 7 |
| 10 | ONBAS question logic removal | **Subtask 002** prerequisite (see Part 13) | Before Phase 6 |
| 11 | Stale node detection (stuck starting/agent-accepted) | Monitoring concern | Future watchdog |

---

## Part 13: ONBAS Simplification — Remove All Question-Specific Logic

### The Insight

ONBAS walks the graph looking for **nodes that need actions**. A `waiting-question` node doesn't need an action — it's blocked on a human. ONBAS should skip it, the same way it skips `complete` or `blocked-error`.

With `node:restart` in place (shipped in Subtask 001), ONBAS never needs question-specific logic:

| Scenario | What Happens | ONBAS's Role |
|----------|-------------|-------------|
| Question asked, not answered | Node is `waiting-question` | **Skip** — blocked on human |
| Question answered | `node:restart` fired during settlement → `restart-pending` → `ready` | **Sees `ready`** → returns `start-node` |
| Question surfaced but unanswered | Node is `waiting-question` | **Skip** — still blocked |

ONBAS never needs to inspect question state (surfaced, answered, pending). It never needs `visitWaitingQuestion()`. It never produces `question-pending` or `resume-node`.

### What Changes

| Change | File | Detail |
|--------|------|--------|
| Remove `visitWaitingQuestion()` | `onbas.ts` | Entire function deleted |
| Simplify `visitNode` waiting-question case | `onbas.ts` | `case 'waiting-question': return null;` (skip) |
| ONBAS never produces `question-pending` | `onbas.ts` | Remove the code path entirely |
| ONBAS never produces `resume-node` | `onbas.ts` | `isAnswered` branch removed with `visitWaitingQuestion` |
| Update `diagnoseStuckLine()` | `onbas.ts` | `all-waiting` reason covers question-blocked nodes |
| Update ONBAS unit tests | `test/unit/.../onbas.test.ts` | Remove/update tests for question-specific logic |
| Update `buildFakeReality` | `fake-onbas.ts` | Question fields in `FakeRealityOptions` become irrelevant to ONBAS (keep for reality builder) |

### What Does NOT Change

- `OrchestrationRequest` union — `question-pending` and `resume-node` types **stay in the union** as dead code for forward compatibility
- Type guards — `isQuestionPendingRequest`, `isResumeNodeRequest` stay (harmless)
- Reality builder — still populates question fields (other consumers may need them)
- Event system — unchanged

### ONBAS After Simplification

```typescript
function visitNode(reality, node): OrchestrationRequest | null {
  switch (node.status) {
    case 'complete':
    case 'starting':
    case 'agent-accepted':
    case 'waiting-question':    // Skip — blocked on human
    case 'blocked-error':       // Skip — blocked on error resolution
    case 'pending':             // Skip — deps not met
      return null;

    case 'ready':
      return { type: 'start-node', graphSlug, nodeId, inputs };
  }
}
```

ONBAS becomes: **find the first `ready` node, return `start-node`. If none found, return `no-action` with a diagnostic reason.**

### How Questions Get Attention

The orchestration loop returns `no-action` with `finalReality`. The caller (web controller, CLI) reads `finalReality.questions` or `finalReality.waitingQuestionNodeIds` to discover questions that need human attention. Surfacing is a **UI concern**, not an orchestration concern.

### Subtask 002 Scope

This remediation should happen **before Phase 6 implementation** (same pattern as Subtask 001).

```
Subtask 002: ONBAS Question Logic Removal
Parent: Phase 6 (ODS Action Handlers)

Tasks:
  ST001: Remove visitWaitingQuestion() from onbas.ts
  ST002: Simplify visitNode waiting-question case to return null
  ST003: Update diagnoseStuckLine() — all-waiting covers questions
  ST004: Update ONBAS unit tests (remove question-specific test suites)
  ST005: Update FakeONBAS if needed
  ST006: Fix getNodeStatus() pendingQuestion population (DYK-SUB#1)
  ST007: Amend spec — remove ONBAS question detection from AC-9
  ST008: Update plan — note ONBAS simplification
  ST009: Validate with just fft
```

Note: ST006 (the `pendingQuestion` gap fix) is included here because it's related — the reality builder should still populate question data correctly for consumers other than ONBAS. But ONBAS won't read it.

---

## Part 12: Open Questions (Resolved)

### OQ-1: Should ODS dispatch include a defensive `resume-node` handler?

**RESOLVED: Yes, defensive error.** Return `{ ok: false, error: { code: 'UNSUPPORTED_REQUEST_TYPE' } }`. The dispatch table has a `default` branch that returns an error for any unhandled request type. If `resume-node` or anything else reaches ODS, it's a bug.

### OQ-2: Does ODS need `buildReality` or just `getNodeStatus`?

**RESOLVED: Neither.** ODS is fire-and-forget. No post-execute state read at all. The loop discovers results via Settle on the next iteration. `buildReality` removed from ODSDependencies.

### OQ-3: Should `agentAcceptNode()` exist as a new method?

**RESOLVED: Not Phase 6.** `agentAcceptNode()` is an agent CLI concern — the agent raises `node:accepted` via `cg wf node start`. ODS never calls it. Deferred to the CLI/agent layer.

### OQ-4: How does FakePod's `onExecute` get access to the graph service?

**RESOLVED: Not needed.** ODS is fire-and-forget — it doesn't read post-execute state. FakePod just records that `execute()` was called. No `onExecute` callback needed for ODS testing.

### OQ-5: Does ODS need `failNode()`?

**RESOLVED: No, deferred.** ODS doesn't detect agent failures. Stale node detection (stuck in `starting` or `agent-accepted`) is a monitoring/watchdog concern for a future phase.

---

## Summary

| Principle | Phase 6 Implementation |
|-----------|----------------------|
| ODS is fire-and-forget | Reserve node, launch pod, return immediately |
| ODS handles `start-node` only | One active handler + dispatch table for extensibility |
| `resume-node` is dead code | Not implemented; type stays in union |
| `question-pending` is dead code | ONBAS never produces it; type stays in union |
| ONBAS has zero question logic | `visitWaitingQuestion` removed (Subtask 002 prerequisite) |
| No post-execute state read | Loop discovers results via Settle on next iteration |
| No error detection in ODS | Agent failures detected by watchdog/timeout (future) |
| Two-phase handshake | `startNode()` reserves, agent accepts via `node:accepted` event |
| User-input nodes: no-op | User-input is a UI concern |
| `agentAcceptNode()` not Phase 6 | Agent CLI concern — deferred |
| `failNode()` deferred | Not ODS's job — monitoring concern |
| `pendingQuestion` gap fixed | Subtask 002 prerequisite |
| Settle assumed done | ODS trusts that events are settled before it runs |
| Questions get attention via UI | Loop returns `finalReality`; caller reads question state |

### Prerequisite Subtasks

| Subtask | Scope | Status |
|---------|-------|--------|
| 001: Concept Drift Remediation | Fix `handleQuestionAnswer`, add `node:restart`, two-domain boundary | **Complete** |
| 002: ONBAS Question Logic Removal | Remove `visitWaitingQuestion`, simplify ONBAS to "find ready, return start-node" | **Pending** |
