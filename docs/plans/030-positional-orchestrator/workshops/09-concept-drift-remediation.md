# Workshop 09: Concept Drift Remediation — Two Domains, Clean Boundaries

**Type**: Design Reconciliation
**Plan**: 030-positional-orchestrator
**Spec**: [positional-orchestrator-spec.md](../positional-orchestrator-spec.md)
**Created**: 2026-02-09
**Status**: Draft

**Related Documents**:
- [concept-drift-audit-030-vs-032.md](../concept-drift-audit-030-vs-032.md) — Full audit report
- [08-ods-orchestrator-agent-handover.md](08-ods-orchestrator-agent-handover.md) — Workshop #8: Shared transition ownership
- Plan 032 Workshops 10-13 — Settle → Decide → Act, ONBAS question ownership, EHS design, E2E design
- [node-event-system-plan.md](../../032-node-event-system/node-event-system-plan.md) — Plan 032 (COMPLETE)

---

## Purpose

Plan 030 was designed before Plan 032 existed. Now that the Node Event System is complete, the concepts in 030 need realignment. This workshop establishes the clean boundary between two domains and systematically identifies every place the original design crossed it.

---

## Part 1: The Two Domains

There are two domains. They have one responsibility each.

### Graph Domain (Plan 030)

**Responsibility**: Move the graph forward.

| Component | Question It Answers |
|-----------|-------------------|
| ONBAS | "What node should we deal with next?" |
| ODS | "How do we deal with it?" (create pod, invoke agent, read result) |
| Orchestration Loop | "Keep going until there's nothing left to do." |

Graph domain components read state. They don't care HOW it got there — whether an agent raised an event, a human typed a CLI command, or a test directly mutated a fixture. The state is the truth. They read it and act.

ONBAS is pure: snapshot in, decision out. ODS is effectful: it creates pods, invokes agents, and reads the state that resulted. Neither touches the event log.

### Event Domain (Plan 032)

**Responsibility**: Record things that happened and maintain consistent state.

| Component | Question It Answers |
|-----------|-------------------|
| Event Types + Schemas | "What kinds of things can happen?" |
| INodeEventService | "Record this event. Process these events." |
| Event Handlers | "When X happens, what state changes follow?" |
| IEventHandlerService | "Settle all pending events across the graph." |
| CLI Commands | "How do agents and humans report what happened?" |

Event domain components own the communication protocol. When an agent accepts a node, that's an event. When it completes, errors, asks a question, reports progress — events. The handlers apply the state consequences: status transitions, timestamps, error fields, question IDs.

### The Principle

```
Events record and react.     → "X happened, update state accordingly."
Graph components read and act. → "State says Y, do the next thing."
```

The orchestration loop's Settle → Decide → Act pattern (Workshop 10) makes this explicit:

1. **Settle** (Event Domain): `IEventHandlerService.processGraph()` — process all pending events, apply state transitions
2. **Decide** (Graph Domain): `ONBAS.getNextAction()` — read settled state, decide what's next
3. **Act** (Graph Domain): `ODS.execute()` — carry out the decision

Events flow into state. ONBAS reads state. ODS changes reality (creates pods, invokes agents). The agent's actions produce more events. Loop.

---

## Part 2: Where the Original Design Crossed the Boundary

Plan 030 was designed when event recording and state mutation were the same thing — a single service call like `graphService.endNode()` did both. Now they're separated. Here is every place the original design has a graph component doing event-domain work, or an event component making graph-domain decisions.

### Violation 1: ODS Calling State-Mutation Service Methods

**Original design**: After pod exits, ODS inspects `PodExecuteResult.outcome` and calls:
- `outcome: 'completed'` → `graphService.endNode()`
- `outcome: 'question'` → `graphService.askQuestion()`
- `outcome: 'error'` → `graphService.failNode()`

**Why it's wrong**: The agent already did these things during execution. It called `cg wf node end` (which raises `node:completed`, handler sets `status: complete`). It called `cg wf node raise-event question:ask` (handler sets `status: waiting-question`). ODS calling them again is either redundant or contradictory.

**Fix**: ODS reads node state after pod exit. The state already reflects what the agent did. ODS reacts to the state, not to the pod outcome.

```
Post-Execute State    Meaning                             ODS Response
─────────────────    ────────                             ────────────
complete             Agent completed (raised node:completed)   Destroy pod
waiting-question     Agent asked question (raised question:ask) Clean up pod reference
blocked-error        Agent or system error (raised node:error)  Log, clean up pod
agent-accepted       Agent accepted but pod exited abnormally   Error condition
starting             Agent never accepted                       Error condition
```

### Violation 2: Pod Outcomes as Authoritative Dispatch

**Original design**: `PodOutcomeSchema: 'completed' | 'question' | 'error' | 'terminated'` — ODS branches on this enum.

**Why it's wrong**: The pod outcome is a hint. The node's state — maintained by event handlers — is the truth. An agent could raise `node:completed` and then the pod could crash (outcome: `error`). The state says `complete`. That's what happened.

**Fix**: ODS branches on node status, not pod outcome. Pod outcome becomes diagnostic metadata for logging.

### Violation 3: ODS Surfacing Questions

**Original design**: When ONBAS returns `question-pending`, ODS calls `graphService.surfaceQuestion()`, sets `surfaced_at`, and emits a domain event via `ICentralEventNotifier`.

**Why it's wrong**: Question surfacing is communication — telling a human "there's a question waiting." That's event domain. ODS is graph domain. ODS should never receive `question-pending` in the first place.

**Fix**: `question-pending` is a loop exit signal. The orchestration loop stops. A web-context event handler (future) handles surfacing during the Settle phase. ODS never sees `question-pending`.

### Violation 4: `question-pending` as an ODS Action

**Original design**: ODS has a `handleQuestionPending()` handler that surfaces questions and emits notifications.

**Why it's wrong**: `question-pending` is a graph-domain decision: "there's nothing actionable, the graph is waiting." It's a stop signal, same category as `no-action`. The loop exits before reaching ODS.

**Fix**: Remove `handleQuestionPending` from ODS entirely. The loop exits on `question-pending` just as it exits on `no-action`.

### Violation 5: Event Handler Making a Graph Decision

**Original design (Plan 032)**: `handleQuestionAnswer` transitions `waiting-question → starting` and clears `pending_question_id`.

**Why it's wrong**: Deciding that a node should resume execution is a graph-domain decision — that's ONBAS's job. The handler's job is recording: "an answer was provided." The transition from `waiting-question` to re-invocation is an orchestration decision that involves creating a pod, passing the answer, and handing over to the agent. That's ODS.

**Consequence if uncorrected**: After settlement, the node is `starting`. ONBAS skips `starting` nodes (they mean "pod being created"). No one creates the pod. Node is orphaned.

**Fix**: `handleQuestionAnswer` stamps the event and cross-stamps the ask event. It does NOT transition status or clear `pending_question_id`. The node stays `waiting-question`. ONBAS's existing `visitWaitingQuestion()` detects the answered question and returns `resume-node`. ODS handles the actual transition during resumption.

```typescript
// BEFORE (event handler making graph decision):
function handleQuestionAnswer(ctx: HandlerContext): void {
  // ... cross-stamp logic ...
  ctx.node.pending_question_id = undefined;  // graph decision
  ctx.node.status = 'starting';              // graph decision
  ctx.stamp('state-transition');
}

// AFTER (event handler recording):
function handleQuestionAnswer(ctx: HandlerContext): void {
  // ... cross-stamp logic ...
  // Node stays waiting-question. ONBAS detects answered question.
  // ODS handles the transition during resume.
  ctx.stamp('answer-recorded');
}
```

### Violation 6: IEventHandlerService Listed as Phase 7 Deliverable

**Original design**: Plan 030 Phase 7 lists `IEventHandlerService` as something to build.

**Why it's wrong**: `IEventHandlerService` is event-domain infrastructure. Plan 032 built it completely (29 tests, fake included, E2E validated). Phase 7 needs to import it, not build it.

**Fix**: Mark the Phase 7 subtask as SUPERSEDED by Plan 032. Phase 7 imports and uses `IEventHandlerService`, it doesn't create it.

### Violation 7: Spec ACs Mixing Domains

**AC-6** says ODS "updates node status to running." ODS doesn't update status — event handlers do. ODS reserves the node (a pre-event action: `pending → starting`) and creates the pod. That's it.

**AC-9** says "Agent pod returns outcome: 'question' — ODS stores question in state, node becomes waiting-question." The agent raises `question:ask` via CLI during execution. The handler transitions to `waiting-question`. ODS discovers this state after pod exit.

**AC-9 step 3** says "ODS marks question as surfaced." Web handler does this.

**Fix**: Amend ACs to reflect the two-domain boundary.

### Violation 8: Critical Finding 07 Mixes Domains

Finding 07 says "ONBAS detects question state; ODS performs state updates." The second half crosses the boundary. Event handlers perform state updates. ODS reads the result and executes graph actions (create pod, invoke agent).

**Fix**: Rewrite Finding 07: "Event handlers maintain question state. ONBAS reads question state. ODS executes graph actions when ONBAS returns `resume-node`."

---

## Part 3: The Clean Boundary

### What Each Domain Owns

| Concern | Domain | Component | What It Does |
|---------|--------|-----------|-------------|
| Node status transitions | Event | Handlers | `node:accepted` → status = agent-accepted, etc. |
| Question state changes | Event | Handlers | `question:ask` → status = waiting-question, etc. |
| Error recording | Event | Handlers | `node:error` → status = blocked-error, error field set |
| Progress tracking | Event | Handlers | `progress:update` → stamp (informational) |
| Answer recording | Event | Handlers | `question:answer` → cross-stamp ask event |
| Event settlement | Event | EHS | `processGraph()` — stamp and apply all pending handlers |
| CLI communication | Event | CLI commands | Agent talks to the system via `cg wf node *` |
| "What's next?" | Graph | ONBAS | Reads settled state, returns `OrchestrationRequest` |
| "Do it" | Graph | ODS | Creates pod, invokes agent, reads post-execute state |
| Node reservation | Graph | ODS | `pending → starting` via `startNode()` (pre-event) |
| Pod lifecycle | Graph | PodManager | Create, track, destroy pods |
| Context continuity | Graph | AgentContextService | Determine context source from position |
| Loop coordination | Graph | OrchestrationService | Settle → Decide → Act → repeat |
| Question surfacing | Event | Web handler (future) | Sets `surfaced_at`, emits SSE notification |

### Node Reservation Is Not an Event

One status transition belongs to the graph domain: `pending → starting`. This is ODS reserving a node before pod creation. It's not something the agent did. It's not communication. It's the orchestrator claiming a node so no other loop iteration picks it up. It happens via `graphService.startNode()`, which is a direct state mutation, not an event.

Everything after `starting` is the agent's domain (via events):
- `starting → agent-accepted` = `node:accepted` event
- `agent-accepted → complete` = `node:completed` event
- `agent-accepted → waiting-question` = `question:ask` event
- `* → blocked-error` = `node:error` event

### ODS's Actual Job

ODS is a graph component. It takes ONBAS's decision and makes it real:

| Request | ODS Does | ODS Does NOT Do |
|---------|----------|-----------------|
| `start-node` | Reserve node, create pod, resolve context, invoke agent, read post-execute state | Call `endNode()`, `askQuestion()`, raise events |
| `resume-node` | Clear `pending_question_id`, transition `waiting-question → starting`, recreate pod, invoke with answer, read post-execute state | Process events, surface questions |
| `question-pending` | **Never receives this** — loop exits first | — |
| `no-action` | Return success with zero side effects | — |

### ONBAS Doesn't Change

ONBAS already does the right thing. It reads flat state fields and returns a decision:

- `ready` node → `start-node`
- `waiting-question` with answered question → `resume-node`
- `waiting-question` with unsurfaced question → `question-pending`
- `waiting-question` with surfaced, unanswered question → skip
- `starting`, `agent-accepted`, `complete`, `blocked-error`, `pending` → skip

With Violation 5 fixed (handler doesn't transition on answer), ONBAS naturally detects answered questions and returns `resume-node`. Zero code changes.

---

## Part 4: Required Changes

### Category A: Plan 032 Code Changes (Event Handler Fix)

The one place Plan 032 crossed into the graph domain.

| # | Change | File | Detail |
|---|--------|------|--------|
| A1 | `handleQuestionAnswer` stops transitioning | `event-handlers.ts:34-49` | Remove status transition and `pending_question_id` clear. Change stamp to `answer-recorded`. |
| A2 | Update handler tests | `test/unit/.../event-handlers.test.ts` | Assert node stays `waiting-question`. Assert stamp is `answer-recorded`. |
| A3 | Update E2E script | `test/e2e/node-event-system-visual-e2e.ts` | After answer, node is `waiting-question` not `starting`. |
| A4 | Update `answerQuestion()` return | `positional-graph.service.ts:~2162` | Returns `status: 'waiting-question'` not `status: 'starting'`. |
| A5 | Update `AnswerQuestionResult` type | `positional-graph-service.interface.ts` | Status field includes `'waiting-question'`. |

### Category B: Spec Amendments

| # | Change | Detail |
|---|--------|--------|
| B1 | AC-6: Fix ODS description | Replace "updates node status to running" with "reserves node (`pending → starting`), creates pod, invokes agent, reads post-execute state." |
| B2 | AC-9: Rewrite question lifecycle | Remove "Agent pod returns outcome: 'question'" and "ODS stores question in state." Replace with event-based flow: agent raises `question:ask` during execution, handler transitions to `waiting-question`, ONBAS detects answered question, ODS resumes. |
| B3 | AC-9 step 3: Remove ODS question surfacing | Question surfacing is a web handler concern, not ODS. |
| B4 | Add AC for Settle phase | "IEventHandlerService.processGraph() runs before each ONBAS walk, processing all unstamped events across all nodes." |
| B5 | Goal 4: Reframe question protocol | Remove "Questions surface to users through the orchestration loop." Replace with "Questions are events. The orchestration loop exits when a question needs attention. Surfacing is handled by event infrastructure." |
| B6 | Non-Goal 5: Clarify event emission | Replace "Domain events are emitted (via Plan 027 ICentralEventNotifier)" with "Event settlement is handled by Plan 032's IEventHandlerService. Domain event emission for SSE is a future concern." |

### Category C: Plan Document Updates

| # | Change | Detail |
|---|--------|--------|
| C1 | Phase 7 subtask: IEventHandlerService | Mark SUPERSEDED by Plan 032. |
| C2 | Phase 7 description | Add Settle → Decide → Act. Reference EHS import from Plan 032. |
| C3 | Phase 6 scope: Remove question surfacing | ODS does NOT handle `question-pending`. |
| C4 | Phase 6 dossier | Archive stale dossier. Regenerate via `/plan-5`. |
| C5 | Critical Finding 07 | Rewrite: "Event handlers maintain question state. ONBAS reads it. ODS executes graph actions." |
| C6 | Workshop list | Add Workshop #8 (complete) and Workshop #9 (this). |

### Category D: Existing Code (Phases 1-5)

| # | File | Change Needed? | Why |
|---|------|---------------|-----|
| D1 | `reality.builder.ts` | No | Reads flat fields. Compatible. |
| D2 | `orchestration-request.schema.ts` | No | All 4 variants remain valid. `resume-node` still produced by ONBAS. |
| D3 | `agent-context.ts` | No | Orthogonal to events. |
| D4 | Pods / PodManager | No | Pod lifecycle unchanged. `PodOutcome: 'question'` is dead code — defer removal. |
| D5 | `onbas.ts` | **No** | Already correct. `visitWaitingQuestion` handles answered questions naturally. |

### Category E: Phase 6 ODS Implementation (New Dossier)

| # | Task | Detail |
|---|------|--------|
| E1 | Define `IODS` interface | `execute(request, ctx, reality)` — dispatches on request type |
| E2 | FakeODS | Pre-configured results, call history, reset |
| E3 | handleStartNode | Reserve → create pod → resolve context → invoke → post-execute state read |
| E4 | handleResumeNode | Clear question → transition `waiting-question → starting` → recreate pod → invoke with answer → post-execute state read |
| E5 | handleNoAction | No-op return |
| E6 | Post-execute state reader | Shared logic for start/resume: switch on node status after pod exit |

---

## Part 5: What Stays

Components already on the correct side of the boundary. No changes needed.

| Component | Phase | Domain | Why It's Fine |
|-----------|-------|--------|--------------|
| `PositionalGraphReality` + builder | 1 | Graph | Reads flat fields. Doesn't know events exist. |
| `NodeReality` type | 1 | Graph | Has `status`, `pendingQuestionId`, `error` — flat fields maintained by handlers. |
| `OrchestrationRequest` union | 2 | Graph | 4 variants: graph decisions. All valid. |
| Type guards | 2 | Graph | Check discriminant. Unchanged. |
| `AgentContextService` | 3 | Graph | Context from position. Orthogonal. |
| `IWorkUnitPod` interface | 4 | Graph | Pods execute agents. Unaware of events. |
| `AgentPod` / `CodePod` | 4 | Graph | Wrap adapters/runners. Unchanged. |
| `IPodManager` | 4 | Graph | Manages pod lifecycles. Unchanged. |
| ONBAS `walkForNextAction` | 5 | Graph | Pure function on flat state. Works correctly with Violation 5 fix. |
| `FakeONBAS` / `buildFakeReality` | 5 | Graph | Test infrastructure. Unchanged. |
| 6 event types + handlers (minus A1) | 032 | Event | Record and react. All correct except `handleQuestionAnswer`. |
| `INodeEventService` | 032 | Event | Raise, handle, query. Stays in event domain. |
| `IEventHandlerService` | 032 | Event | Graph-wide settlement. Used by graph domain (Settle phase) but lives in event domain. |
| CLI commands | 032 | Event | Agent communication protocol. Unchanged. |

---

## Part 6: Integration Topology

### Dependency Direction

```
030-orchestration  ──imports──▶  032-node-event-system
                                        │
                                  (no reverse imports)
```

Plan 030 imports from Plan 032. Plan 032 has zero imports from Plan 030. This is correct: the graph domain uses event infrastructure, not the reverse.

### What Plan 030 Imports from Plan 032

```typescript
// Phase 7: Orchestration Entry Point (Settle phase)
import {
  EventHandlerService,
  FakeEventHandlerService,
  type IEventHandlerService,
  type ProcessGraphResult,
} from '@chainglass/positional-graph/features/032-node-event-system';
```

That's it. Four imports. The graph domain uses exactly one event-domain capability: `processGraph()` in the Settle phase.

### What Plan 030 Does NOT Import

Everything else in Plan 032 is internal to the event domain:
- `raiseEvent`, `handleEvents` — internal to `INodeEventService`
- Individual handler functions — internal to `createEventHandlerRegistry`
- Event payload types — agents interact via CLI, not in-process
- `generateEventId` — event internals
- Error factories E190-E197 — event internals
- Registry types, stamp types — event internals

### The Settle Phase: Where Domains Meet

The orchestration loop's Settle phase is the one point where domains interact:

```typescript
// Inside the loop (Phase 7)
const state = await this.loadState(graphSlug);
const settleResult = this.eventHandlerService.processGraph(state, 'orchestrator', 'web');
if (settleResult.eventsProcessed > 0) {
  await this.persistState(graphSlug, state);
}
// State is now settled. Graph domain takes over.
```

`processGraph()` is called by the graph domain but belongs to the event domain. It processes events, applies handlers, stamps completion. After it returns, the state is consistent and the graph domain can read it safely.

---

## Part 7: Execution Order

### Remediation Before Phase 6

```
Step 1: Apply Category A (Plan 032 handler fix)
        → handleQuestionAnswer stops transitioning
        → Tests updated, E2E updated, answerQuestion() updated
        → just fft passes

Step 2: Apply Category B (Spec amendments)
        → AC-6, AC-9, new AC for Settle phase
        → Goal 4 and Non-Goal 5 reframed

Step 3: Apply Category C (Plan document updates)
        → IEventHandlerService subtask SUPERSEDED
        → Phase 6/7 descriptions updated
        → Finding 07 rewritten
        → Stale Phase 6 dossier archived

Step 4: Regenerate Phase 6 dossier
        → /plan-5 --phase "Phase 6: ODS Action Handlers"
        → Incorporates all remediation decisions

Step 5: Implement Phase 6
Step 6: Regenerate Phase 7 dossier
Step 7: Implement Phase 7
Step 8: Phase 8 E2E testing
```

---

## Open Questions (Resolved)

### OQ-1: Should `question-pending` be removed from OrchestrationRequest?

**No.** Keep it. It's a valid graph-domain decision: "a question needs attention, stop the loop." The type stays in the union. The semantic shift is in the consumer (loop exits) not the producer (ONBAS).

### OQ-2: Should `surfaceQuestion()` be implemented in Phase 6?

**No.** Defer. Phase 6 is graph domain (ODS). Question surfacing is event domain (future web handler).

### OQ-3: Should `ICentralEventNotifier` be used by ODS?

**Defer.** ODS is graph domain. Domain event emission for SSE consumers is a separate concern. Phase 7 or a future plan can add it to the loop if needed.

### OQ-4: Should FakePod's `onExecute` callback simulate events?

**Simulate the end result, not the event flow.** FakePod's callback sets node state directly (status, timestamps, question fields). This is what the state looks like AFTER events have been processed. ODS tests test ODS, not the event system.

### OQ-5: Does `PodOutcome: 'question'` need removal?

**Defer.** Dead code. AgentPod never produces it. Doesn't affect anything. Clean up later.

---

## Summary

| Principle | Consequence |
|-----------|------------|
| Events record and react | Handlers set status, timestamps, error fields. They don't make orchestration decisions. |
| Graph components read and act | ONBAS reads flat state. ODS creates pods and invokes agents. Neither touches events. |
| ODS reads state, not outcomes | Post-execute: inspect node status. Pod outcome is diagnostic. |
| `question-pending` is a stop signal | Loop exits. ODS never receives it. Surfacing is event domain. |
| Handlers don't orchestrate | `handleQuestionAnswer` records the answer. ONBAS decides to resume. ODS does it. |
| Settle is the bridge | `processGraph()` runs in the loop but belongs to event domain. After it returns, graph domain takes over. |
| ONBAS doesn't change | Already reads flat state. Already handles answered questions. Zero code changes. |
| Phases 1-5 don't change | All on the correct side of the boundary. |
