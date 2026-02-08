# Workshop: IEventHandlerService and the Question Ownership Problem

**Type**: Architecture Decision / Phase 7 Redesign
**Plan**: 032-node-event-system
**Spec**: [node-event-system-spec.md](../node-event-system-spec.md)
**Created**: 2026-02-08
**Status**: Draft

**Related Documents**:
- [Workshop 10: Event Processing in the Orchestration Loop](./10-event-processing-in-the-orchestration-loop.md) — Settle/Decide/Act, IEventHandlerService concept
- [Workshop 09: INodeEventService](./09-first-class-node-event-service.md) — Per-node service interface
- [Workshop 06: raiseEvent/handleEvents Separation](./06-inline-handlers-and-subscriber-stamps.md) — Subscriber stamps, CLI vs ODS handlers
- [Plan 030 Workshop 05: ONBAS](../../030-positional-orchestrator/workshops/05-onbas.md) — Graph walker, pure decisions
- [Plan 030 Workshop 08: ODS Handover](../../030-positional-orchestrator/workshops/08-ods-orchestrator-agent-handover.md) — Pod lifecycle, shared transition ownership
- [ADR-0011: First-Class Domain Concepts Over Diffuse Functions](../../../../adr/adr-0011-first-class-domain-concepts.md) — Service elevation criteria

---

## Purpose

Phase 7 was drafted as "ONBAS Adaptation and Backward-Compat Projections" — teaching ONBAS to read the event log and subscriber stamps to determine question sub-states. This workshop argues that design is wrong and proposes a replacement.

**The core problem**: Workshop 10 established a three-phase orchestration loop — Settle, Decide, Act. If the Event Handler Service (Settle phase) processes all events *before* ONBAS runs, then flat fields (`status`, `pending_question_id`) are already correct by the time ONBAS sees the graph. ONBAS doesn't need to read events at all.

But there's a deeper question: **should ONBAS even own question surfacing?** ONBAS is a pure rules engine that answers "what is the next graph progression action?" Question surfacing — pushing a question to the UI — is a *reaction to an event*, not a *graph progression decision*. It belongs in a handler, not in the walk algorithm.

**Three realizations explored in this workshop**:

1. **ONBAS never needs to read events.** The Event Handler Service settles events before ONBAS runs. Flat fields are truth-after-settlement.

2. **`question-pending` is not graph progression.** It's a side-effect that should be handled by a web-specific event handler (`pushQuestionToUI`), not returned as an OrchestrationRequest.

3. **Phase 7 should build IEventHandlerService**, not adapt ONBAS. The original design compensated for the absence of the service that Workshop 10 designed.

## Key Questions Addressed

- Q1: Does ONBAS need to read the event log?
- Q2: Is `question-pending` a graph progression decision?
- Q3: What replaces `question-pending` in the ONBAS walk?
- Q4: What is IEventHandlerService and where does it live?
- Q5: What changes in ONBAS?
- Q6: What changes in existing code (remediation)?
- Q7: What happens to AC-16?
- Q8: How does this affect Plan 030 Phases 6-8?

---

## Part 1: Why ONBAS Should Not Read Events

### The Current Design (Phases 1-5)

ONBAS is a pure, synchronous, stateless function. It receives a `PositionalGraphReality` snapshot and returns an `OrchestrationRequest`. It reads flat fields:

```
NodeReality {
  status: 'waiting-question'
  pendingQuestionId: 'q1'
}

QuestionReality {
  questionId: 'q1'
  isSurfaced: false  ← computed from surfaced_at
  isAnswered: false  ← computed from answer
}
```

ONBAS's `visitWaitingQuestion()` checks three sub-states:

| Sub-state | Condition | Returns |
|-----------|-----------|---------|
| Unsurfaced | `!isSurfaced && !isAnswered` | `question-pending` |
| Surfaced, unanswered | `isSurfaced && !isAnswered` | `null` (skip) |
| Answered | `isAnswered` | `resume-node` |

### The Original Phase 7 Plan

Phase 7 was going to extend `NodeReality` with an `events` field, then rewrite `visitWaitingQuestion()` to check events and stamps instead of flat fields:

```
// Pseudocode from the original Phase 7 design
unstamped question:ask event → question-pending
question:ask with matching question:answer → resume-node
question:ask stamped by orchestrator → skip
```

### Why This Is Wrong

Workshop 10 establishes that the **Event Handler Service runs before ONBAS** in the orchestration loop:

```
SETTLE: EHS processes all events for all nodes
        → handlers fire (state transitions, UI notifications, stamps)
        → state persisted

DECIDE: ONBAS reads settled state
        → flat fields are already correct
        → returns OrchestrationRequest

ACT:    ODS executes the decision
```

After the Settle phase:
- A `question:ask` event has already been handled → `node.status = 'waiting-question'`, `node.pending_question_id` set
- A `question:answer` event has already been handled → `node.status = 'starting'`, `node.pending_question_id` cleared
- All stamps are applied

**ONBAS reads flat fields. Flat fields are correct. ONBAS never needs to read events.**

The original Phase 7 tried to make ONBAS compensate for the absence of the Event Handler Service. Now that Workshop 10 has designed that service, the compensation is unnecessary.

---

## Part 2: The Question Ownership Problem

### What Does ONBAS Do?

ONBAS answers one question: **"What is the next graph progression action?"**

Its four response types map to four progression actions:

| Type | Meaning | Graph-Level Decision? |
|------|---------|----------------------|
| `start-node` | Begin executing a ready node | **Yes** — advancing the graph |
| `resume-node` | Continue a node after answer | **Yes** — resuming work |
| `no-action` | Nothing actionable | **Yes** — graph is stable |
| `question-pending` | Surface a question to the UI | **No** — this is a side-effect |

`question-pending` stands out. It doesn't advance the graph. It doesn't change any node's status. It triggers a *notification* — "display this question to the user." That's a reaction to an event, not a graph progression decision.

### Where Question Surfacing Actually Belongs

Workshop 10 already showed this. In the question lifecycle roleplay (Part 5, Act 2), the Event Handler Service processes `question:ask` with web-specific handlers:

```
Handler 1: transitionToWaitingQuestion (context: both)
  → node.status = 'waiting-question'  [already done by CLI — idempotent]
  → stamp('state-transition')

Handler 2: pushQuestionToUI (context: web)
  → emit SSE event to ICentralEventNotifier
  → web UI shows question dialog
  → stamp('ui-notification')

Handler 3: sendOwnerNotification (context: web)
  → (future) email/slack notification
  → stamp('notification')
```

Question surfacing happens during **Settle**, not during **Decide**. By the time ONBAS runs, the question has already been pushed to the UI. ONBAS doesn't need to return `question-pending` — the work is already done.

### What ONBAS Should Do Instead

When ONBAS encounters a `waiting-question` node, it should check:

1. **Is the question answered?** (Answered means `handleQuestionAnswer` ran — node status is now `starting`, `pending_question_id` is cleared) → `resume-node`
2. **Is the node still `waiting-question`?** → `null` (skip — continue walk)

There's no need for the "unsurfaced" sub-state. Surfacing is the Event Handler Service's job. ONBAS sees `waiting-question` → skip. ONBAS sees `starting` (post-answer) → check if this is a resumption.

Wait — there's a subtlety. After `handleQuestionAnswer` runs, the node transitions to `starting`. But how does ONBAS know this is a *resumption* vs. an initial start? Currently:

- `starting` means "orchestrator reserved, agent hasn't accepted yet"
- After answer, handler sets `status = 'starting'` (mimicking the handshake restart)

ONBAS already handles `starting` nodes — it skips them (the orchestration loop started them, and they're waiting for agent acceptance). The resume path would need the **Act** phase to re-invoke the pod with the answer, which means ODS must detect "this node was previously `waiting-question` and now has an answer."

Let's think about this differently.

### The Clean Answer-Resume Path

The answer handler (Phase 4, `handleQuestionAnswer`) currently sets:
```typescript
ctx.node.pending_question_id = undefined;
ctx.node.status = 'starting';
```

This was a design decision (DYK #1b) to re-enter the two-phase handshake. But the orchestration loop (Plan 030 Phase 7) needs a way to distinguish "fresh start" from "resume after answer."

**Option A: Keep `question-pending` in ONBAS but change its meaning.**
Instead of "surface this question," it means "there exists an unsurfaced question." But surfacing now happens in the Event Handler Service. So `question-pending` becomes a stop condition: "a question was just surfaced, stop the loop and wait for the user to answer."

**Option B: Remove `question-pending` from ONBAS entirely.**
ONBAS sees `waiting-question` → skip. The loop stops because ONBAS returns `no-action` (reason: `all-waiting`). The question was already surfaced by the EHS.

**Option C: New `resume-node` detection via answered question.**
After `handleQuestionAnswer`, the node status changes to something that ONBAS can detect as "ready to resume." This could be a new status like `answer-received`, or we could check the event log for a recent `question:answer`.

### Recommended: Option A (Refined)

Keep `question-pending` but redefine its contract:

**Before (current)**: "Surface this question to the user."
**After (redefined)**: "A question exists that needs attention — the loop should stop."

The practical difference:
- **Before**: ODS receives `question-pending` and calls `surfaceQuestion()` to set `surfaced_at`
- **After**: The EHS already surfaced the question (web handler pushed it to the UI). ONBAS returns `question-pending` purely as a **stop signal** — the orchestration loop exits, waiting for the user to answer.

For `resume-node`, the answer handler should set the node to a state ONBAS recognizes:

```typescript
// handleQuestionAnswer — revised
ctx.node.pending_question_id = undefined;
ctx.node.status = 'agent-accepted';  // Ready to resume, not 'starting'
```

Wait, but `agent-accepted` means "agent is actively working." The node's pod might not be alive anymore. We need to think about this in terms of what ODS does:

1. ONBAS returns `resume-node` with the answer
2. ODS checks if a pod exists for this node
3. If yes: `pod.resumeWithAnswer(answer)`
4. If no: create new pod, pass answer as initial context

This means ONBAS needs to detect the "answer ready to deliver" state. Two viable approaches:

**Approach A: Use `resume-node` for answered questions, keep question sub-state logic in ONBAS.**

ONBAS still checks `QuestionReality.isAnswered` → returns `resume-node`. This works today and doesn't require changes to the walk algorithm. The `question-pending` return type is kept as a loop-stop signal for unsurfaced questions (during CLI-only runs where no EHS exists) or dropped entirely if the EHS handles all surfacing.

**Approach B: New node status `answer-received` that ONBAS treats like `ready`.**

The answer handler sets `node.status = 'answer-received'`. ONBAS has a new case that maps this to `resume-node`. Clean separation, but adds a new status value.

**We recommend Approach A** — it's the least disruptive. The existing `visitWaitingQuestion()` logic already handles the answered case correctly. The only change is removing the "unsurfaced" sub-state path (question surfacing moves to the EHS).

---

## Part 3: IEventHandlerService Design

### What It Is

IEventHandlerService is a **graph-wide** event processor. It iterates all nodes in a graph, finds events that haven't been stamped by the specified subscriber, dispatches them to registered handlers filtered by context, and stamps them. It is the **Settle** phase of the orchestration loop.

This is different from `INodeEventService` (Phase 5), which operates on a single node. INodeEventService's `handleEvents()` method does the per-node processing. IEventHandlerService orchestrates across the graph.

### Interface

```typescript
export interface ProcessGraphResult {
  readonly nodesVisited: number;
  readonly eventsProcessed: number;
  readonly handlerInvocations: number;
}

export interface IEventHandlerService {
  /**
   * Process all unhandled events for all nodes in the graph.
   *
   * Iterates every node in state.nodes, finds events not stamped by
   * the given subscriber, dispatches to registered handlers filtered
   * by context, stamps processed events.
   *
   * Caller is responsible for persisting state after this returns.
   */
  processGraph(
    state: State,
    subscriber: string,
    context: 'cli' | 'web'
  ): ProcessGraphResult;
}
```

### Implementation Strategy

IEventHandlerService is a thin orchestration wrapper around `INodeEventService.handleEvents()`:

```typescript
class EventHandlerService implements IEventHandlerService {
  constructor(private readonly nodeEventService: INodeEventService) {}

  processGraph(state: State, subscriber: string, context: 'cli' | 'web'): ProcessGraphResult {
    let nodesVisited = 0;
    let eventsProcessed = 0;
    let handlerInvocations = 0;

    const nodes = state.nodes ?? {};
    for (const nodeId of Object.keys(nodes)) {
      nodesVisited++;

      // Count unstamped events before processing
      const unstamped = this.nodeEventService.getUnstampedEvents(state, nodeId, subscriber);
      if (unstamped.length === 0) continue;

      eventsProcessed += unstamped.length;

      // Delegate to per-node processing
      this.nodeEventService.handleEvents(state, nodeId, subscriber, context);

      // Count handler invocations (approximation: handlers per event * events)
      // Actual count comes from the handler registry, but this is sufficient for diagnostics
      handlerInvocations += unstamped.length; // TODO: refine with actual handler count
    }

    return { nodesVisited, eventsProcessed, handlerInvocations };
  }
}
```

### Where It Lives

```
packages/positional-graph/src/features/032-node-event-system/
  event-handler-service.interface.ts      ← IEventHandlerService, ProcessGraphResult
  event-handler-service.ts                ← EventHandlerService implementation
  fake-event-handler-service.ts           ← FakeEventHandlerService test double
```

This is the right feature folder. IEventHandlerService is part of the node event system — it composes `INodeEventService` to operate at graph scope. It does not belong in `030-orchestration/` because it has no dependency on ONBAS, ODS, or the orchestration loop. The orchestration loop *uses* it, but the service itself is about event processing.

### Relationship to INodeEventService

```
IEventHandlerService (graph-wide)
  └── uses INodeEventService (per-node) for each node
        └── uses EventHandlerRegistry for handler dispatch
              └── uses HandlerContext for handler invocation
```

IEventHandlerService does NOT duplicate INodeEventService logic. It orchestrates calls to it across all nodes in the graph.

---

## Part 4: Impact Analysis

### Changes to ONBAS

**Minimal.** The existing ONBAS walk algorithm is almost entirely correct. The only change:

1. **Remove the "unsurfaced question" sub-state** from `visitWaitingQuestion()`:
   - Current: `!isSurfaced && !isAnswered` → return `question-pending`
   - New: `!isAnswered` → return `null` (skip — question is being handled)
   - Or: keep `question-pending` as a stop signal but change the semantics

Actually — even this may not need to change yet. Let's trace the two execution contexts:

**CLI context (no orchestration loop):**
- Agent asks question via CLI → `raiseEvent` + `handleEvents('cli', 'cli')`
- No EHS runs. No web handler. Question is NOT surfaced.
- Question exists in `state.questions[]` (backward compat dual-write)
- Next time `cg wf run` is called (future), the orchestration loop starts:
  - EHS runs → `pushQuestionToUI` fires → question surfaced
  - ONBAS runs → sees `waiting-question`, unsurfaced → returns... what?
  - With EHS: question was just surfaced by EHS. ONBAS should return `no-action` or `question-pending` as stop signal.
  - Without EHS: current behavior returns `question-pending` → ODS surfaces it

**Web/orchestrator context:**
- Agent asks question → `raiseEvent` + `handleEvents('cli', 'cli')` (during pod execution)
- Orchestration loop runs → EHS processes graph → `pushQuestionToUI` fires
- ONBAS runs → sees `waiting-question` → returns... stop signal

The key insight: **in both contexts, by the time ONBAS runs within the orchestration loop, the EHS has already surfaced the question.** The only case where `question-pending` as "surface this" makes sense is if there's no EHS — which is the current Phase 1-6 reality.

**Recommendation**: Don't change ONBAS now. Build IEventHandlerService. When the orchestration loop (Plan 030 Phase 7) integrates EHS + ONBAS + ODS, the loop code will check the stop condition. `question-pending` remains a valid stop condition — it just means "a question needs user attention" rather than "surface this question." The semantic shift is in the *consumer* (ODS/loop), not in ONBAS itself.

### Changes to Existing Code

**No remediation needed.** The existing codebase is correct for the current execution model (CLI-only, no orchestration loop). IEventHandlerService is additive — it doesn't require modifying anything that already works.

Specifically:
- `handleQuestionAnswer` handler: sets `status = 'starting'` → this is fine, the orchestration loop (Plan 030 Phase 7) will handle the resume semantics
- `askQuestion()` / `answerQuestion()` dual writes: still needed for backward compat, will be removed when flat fields are fully deprecated
- ONBAS `visitWaitingQuestion()`: still correct for the CLI-only world; the orchestration loop will wrap it with EHS

### Impact on AC-16

AC-16 states: *"ONBAS reads event log for sub-state determination."*

**AC-16 should be revised or dropped.** ONBAS doesn't need to read the event log. The Event Handler Service processes events before ONBAS runs, and flat fields are the correct source of truth after settlement.

Proposed revision:
- **Old AC-16**: ONBAS reads event log for sub-state determination
- **New AC-16**: IEventHandlerService processes all unhandled events across the graph before ONBAS walks. ONBAS continues to read flat fields.

Or simply: AC-16 is satisfied by the existence of IEventHandlerService + the unchanged flat-field reading in ONBAS.

### Impact on AC-17

AC-17 states: *"State schema is backward compatible."*

**AC-17 is already satisfied** by Phase 2's schema changes. No impact from this redesign.

### Impact on Plan 030

**Plan 030 Phase 6 (ODS)**: ODS's `handleQuestionPending` was going to call `surfaceQuestion()`. With the EHS, question surfacing moves to a web handler. ODS's handler for `question-pending` becomes: do nothing (it's a stop condition). Or ODS doesn't even receive `question-pending` — the orchestration loop exits before calling ODS.

**Plan 030 Phase 7 (Orchestration Loop)**: The loop integrates IEventHandlerService as the Settle phase. This is the exact integration point Workshop 10 designed. The Phase 7 dossier should reference IEventHandlerService from Plan 032.

**Plan 030 Phase 8 (E2E)**: Tests will exercise the full Settle → Decide → Act loop, including EHS processing.

---

## Part 5: Revised Phase 7 Scope

### What the Original Phase 7 Did (Now Obsolete)

1. Extend `NodeReality` with events field
2. Update reality builder to populate events from state
3. Rewrite ONBAS `visitWaitingQuestion()` to read events + stamps
4. Property tests proving event-based = flat-field parity
5. Integration test through reality builder → ONBAS

### What the New Phase 7 Should Do

1. **Build `IEventHandlerService` interface** — graph-wide event processor
2. **Build `EventHandlerService` implementation** — iterates nodes, delegates to INodeEventService
3. **Build `FakeEventHandlerService`** — test double with call history
4. **Write unit tests** — graph processing, empty graphs, mixed stamped/unstamped events
5. **Write integration test** — raise events across multiple nodes, process graph, verify all handlers fired
6. **Register web-specific handlers** — `pushQuestionToUI` (emits to ICentralEventNotifier), possibly `sendOwnerNotification` (stub)
7. **Regression verification** — `just fft` clean

### What's NOT in the New Phase 7

- ONBAS changes (none needed)
- Reality builder changes (none needed)
- NodeReality extensions (none needed)
- Property tests for event-based vs flat-field parity (no longer relevant)

### New File Manifest

```
packages/positional-graph/src/features/032-node-event-system/
  event-handler-service.interface.ts      [NEW] IEventHandlerService, ProcessGraphResult
  event-handler-service.ts                [NEW] EventHandlerService implementation
  fake-event-handler-service.ts           [NEW] FakeEventHandlerService
  event-handlers.ts                       [MODIFIED] Add web-specific handlers (pushQuestionToUI)

test/unit/positional-graph/features/032-node-event-system/
  event-handler-service.test.ts           [NEW] Unit tests for EventHandlerService
  web-event-handlers.test.ts              [NEW] Tests for web-specific handlers

test/integration/positional-graph/
  event-handler-service.integration.test.ts [NEW] Integration test: multi-node graph processing
```

---

## Part 6: Web-Specific Handlers

Workshop 10 (Part 5) identified three web-specific handlers for `question:ask`:

1. **transitionToWaitingQuestion** (context: `both`) — already exists, handles state transition
2. **pushQuestionToUI** (context: `web`) — emits SSE event via `ICentralEventNotifier`
3. **sendOwnerNotification** (context: `web`) — future, email/slack notification

For Phase 7, we implement #2 and stub #3:

```typescript
// pushQuestionToUI handler
function pushQuestionToUI(ctx: HandlerContext): void {
  // The actual SSE emission requires ICentralEventNotifier,
  // which is a Plan 027 dependency. For now, this handler
  // stamps the event as "ui-notified" — the orchestration loop
  // checks for this stamp and emits via its own CEN reference.
  ctx.stamp('ui-notification', {
    type: 'question-surfaced',
    question_id: (ctx.event.payload as { question_id?: string }).question_id,
  });
}
```

The actual SSE emission may need to be deferred to the orchestration loop, since handlers don't have access to the DI container. The handler's job is to *mark* that the question should be surfaced. The orchestration loop reads the stamp and emits. Alternatively, the handler could receive the CEN reference via closure at registration time — this is a detail for Phase 7 implementation to work out.

For now, the handler stamps the event. The stamp serves as a flag: "this question has been processed for UI notification." The orchestration loop (Plan 030 Phase 7) will read stamps and decide whether to emit SSE events.

---

## Part 7: Summary of Decisions

| Decision | Recommendation | Rationale |
|----------|---------------|-----------|
| Does ONBAS read events? | **No** | EHS settles events before ONBAS runs; flat fields are truth-after-settlement |
| Remove `question-pending`? | **No** (keep as stop signal) | Semantic shift: "question needs attention" not "surface this question" |
| Change ONBAS code? | **Not now** | Current logic works; semantic shift is in the consumer (loop), not ONBAS |
| What is Phase 7? | **Build IEventHandlerService** | Graph-wide event processor, the Settle phase |
| Where does it live? | `features/032-node-event-system/` | Part of the event system, used by the orchestration loop |
| Any remediation needed? | **No** | Existing code is correct for current CLI-only execution |
| Revise AC-16? | **Yes** | Change from "ONBAS reads events" to "EHS processes events before ONBAS" |
| Impact on Plan 030? | **Positive** | Phase 6 ODS simplifies (no `surfaceQuestion`), Phase 7 loop gains EHS |

---

## Part 8: Cross-Plan Sequencing (Updated)

```
Plan 032 Phases 1-6 ✅ Complete

Plan 032 Phase 7 (NEW): Build IEventHandlerService
  → Interface, implementation, fake, tests
  → Web-specific handler stubs
  → ~No ONBAS changes needed

Plan 032 Phase 8: E2E Validation Script
  → Exercises full event lifecycle including graph-wide processing

Plan 030 Phase 6: ODS Action Handlers
  → handleStartNode, handleResumeNode, handleNoAction
  → handleQuestionPending simplified (stop signal, not surfacing)
  → Post-execute state read unchanged

Plan 030 Phase 7: Orchestration Entry Point + Loop
  → Integrate IEventHandlerService as Settle phase
  → Loop: Settle → Decide → Act
  → Import IEventHandlerService from Plan 032's feature folder

Plan 030 Phase 8: E2E and Integration Testing
  → Full loop with EHS + ONBAS + ODS
```

---

## Conclusion

The original Phase 7 tried to solve a problem that doesn't exist once IEventHandlerService is built. ONBAS is a pure decision engine that reads settled state — it doesn't need to read events. Question surfacing is a handler responsibility, not a walk algorithm responsibility.

The new Phase 7 builds the missing piece: `IEventHandlerService`, the graph-wide event processor that constitutes the Settle phase of the orchestration loop. This is a natural next step from Phase 5 (which built `INodeEventService` for per-node processing) and directly enables Plan 030's orchestration loop.

No existing code needs remediation. ONBAS stays pure. The semantic shift in `question-pending` happens in the consumer (the orchestration loop), not in ONBAS itself.
