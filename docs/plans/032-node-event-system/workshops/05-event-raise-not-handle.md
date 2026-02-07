# Workshop: Events Should Be Raised, Not Handled Inline

**Type**: Architectural Correction
**Plan**: 032-node-event-system
**Spec**: [node-event-system-spec.md](../node-event-system-spec.md)
**Created**: 2026-02-07
**Status**: Draft

**Related Documents**:
- [Workshop 01: Node Event System](./01-node-event-system.md) — Q6 Option B (events as implementation)
- [Workshop 04: Do We Need Backward Compat?](./04-do-we-need-backward-compat.md) — compat layer redundancy
- [Workshop 08: ODS Orchestrator Agent Handover](../../030-positional-orchestrator/workshops/08-ods-orchestrator-agent-handover.md) — agent handback protocol
- [Phase 5 Tasks](../tasks/phase-5-service-method-wrappers/tasks.md) — service method wrappers

---

## Purpose

Challenge the assumption that event handlers should run inline inside `raiseEvent()`. The current implementation validates, creates the event, appends it to the log, runs a handler that mutates state, and persists. This workshop argues that the handler step does not belong in `raiseEvent()` — the function should record the fact and return. Processing belongs to the orchestration loop (ONBAS/ODS), which does not exist yet.

## Key Questions Addressed

- Should `raiseEvent()` run handlers inline, or just record the event?
- What happens when an agent raises an event via the CLI?
- Who should process events — the write path or the orchestration loop?
- What is the agent handback mechanism, and how do events fit into it?
- What changes for Phase 5 if handlers are removed from `raiseEvent()`?

---

## The Current Design

`raiseEvent()` (raise-event.ts) runs a 6-step pipeline:

```
validate → create event → append to log → run handler → derive compat → persist
```

The handler step (step 4) mutates node state synchronously:

| Event Type | Handler Action |
|---|---|
| `node:accepted` | Sets status → `agent-accepted`, marks event `handled` |
| `node:completed` | Sets status → `complete`, sets `completed_at`, marks event `handled` |
| `node:error` | Sets status → `blocked-error`, writes `error` object, marks event `handled` |
| `question:ask` | Sets status → `waiting-question`, writes `pending_question_id`, leaves event `new` |
| `question:answer` | Clears `pending_question_id`, marks both ask and answer events `handled` |
| `progress:update` | No state change, marks event `handled` |

This design was established by Workshop 01 Q6 Option B:
> `raiseEvent()` is the single write path for all node state changes. The event handler contains all state transition logic. One path, one source of truth.

---

## The Problem

### What actually happens when an agent raises an event

The agent is a subprocess running inside a pod. It uses the CLI to raise events:

```
cg wf node end --graph my-graph --node task-1
```

This calls a service method → which calls `raiseEvent()` → which runs the handler inline → which mutates state → which persists. The agent's process continues running.

But consider the intended lifecycle from Workshop 08:

```
1. ODS selects node, builds pod, launches agent subprocess
2. Agent does work, calling CLI commands as it goes
3. Agent raises a stopping event (node:completed, node:error, question:ask)
4. CLI shows: "[AGENT INSTRUCTION] This event requires you to stop. Exit now."
5. Agent exits
6. pod.execute() returns PodExecuteResult
7. ODS re-reads state via buildReality()
8. ODS discovers what the agent did and reacts
```

The critical insight from Workshop 08:

> **ODS never tells the graph service what the agent did — it reads what the agent did.**

### The tension

Workshop 01 says: "raiseEvent is the single write path, handler contains all state transition logic."

Workshop 08 says: "ODS reads what the agent did."

If `raiseEvent()` runs the handler (mutating status, setting fields), then ODS isn't "discovering" anything — the state was already fully resolved at raise time. ODS just reads the aftermath.

This works, but it conflates two responsibilities:

1. **Recording the fact**: "agent raised node:completed"
2. **Processing the fact**: "therefore status becomes complete"

### Why this matters

Right now, nothing picks up events. ONBAS is implemented but not wired. ODS doesn't exist. The CLI is the only entry point, and it runs handlers inline because there's no orchestration loop to delegate to.

But the event system is being built precisely so that an orchestration loop CAN exist. If we bake processing into the write path, we're building the orchestration logic twice — once in handlers, once in ODS.

---

## Play It Out: The Three Stopping Scenarios

The agent can stop for three reasons. Each raises a different event with `stopsExecution: true`.

### Scenario A: Agent completes work (`node:completed`)

**Current model (handlers inline):**
```
Agent subprocess:
  → cg wf node end --graph g --node n
  → endNode() calls raiseEvent('node:completed', ...)
  → raiseEvent:
      1. validate (node is agent-accepted ✓)
      2. create event {type: 'node:completed', status: 'new', stops_execution: true}
      3. append event to node.events[]
      4. run handleNodeCompleted():
         - node.status = 'complete'
         - node.completed_at = now
         - event.status = 'handled'
      5. derive backward-compat fields (redundant)
      6. persist state
  → CLI shows: "[AGENT INSTRUCTION] stop and wait for orchestrator"
  → Agent exits

Later:
  → ODS re-reads state
  → Sees node.status === 'complete'
  → Reacts (emits domain event, selects next node, etc.)
```

**Proposed model (raise only):**
```
Agent subprocess:
  → cg wf node end --graph g --node n
  → endNode() calls raiseEvent('node:completed', ...)
  → raiseEvent:
      1. validate (node is agent-accepted ✓)
      2. create event {type: 'node:completed', status: 'new', stops_execution: true}
      3. append event to node.events[]
      4. persist state
  → CLI shows: "[AGENT INSTRUCTION] stop and wait for orchestrator"
  → Agent exits

Later:
  → ODS re-reads state
  → Sees event with type 'node:completed' and status 'new'
  → ODS processes: sets node.status = 'complete', node.completed_at, event.status = 'handled'
  → ODS persists, emits domain event, selects next node
```

### Scenario B: Agent asks a question (`question:ask`)

**Current model (handlers inline):**
```
Agent subprocess:
  → cg wf node ask --graph g --node n --type clarification --text "Which API version?"
  → askQuestion() calls raiseEvent('question:ask', ...)
  → raiseEvent:
      1. validate (node is agent-accepted ✓)
      2. create event {type: 'question:ask', status: 'new', stops_execution: true}
      3. append event to node.events[]
      4. run handleQuestionAsk():
         - node.status = 'waiting-question'
         - node.pending_question_id = event.event_id
         - event.status stays 'new' (comment: "deferred processing")
      5. derive backward-compat fields (redundant — overwrites pending_question_id with same value)
      6. persist state
  → CLI shows: "[AGENT INSTRUCTION] stop and wait for orchestrator"
  → Agent exits

Later:
  → ODS re-reads state
  → Sees node.status === 'waiting-question'
  → ONBAS returns question-pending action
  → Orchestrator surfaces question to human
```

**Proposed model (raise only):**
```
Agent subprocess:
  → cg wf node ask --graph g --node n --type clarification --text "Which API version?"
  → askQuestion() calls raiseEvent('question:ask', ...)
  → raiseEvent:
      1. validate (node is agent-accepted ✓)
      2. create event {type: 'question:ask', status: 'new', stops_execution: true}
      3. append event to node.events[]
      4. persist state
  → CLI shows: "[AGENT INSTRUCTION] stop and wait for orchestrator"
  → Agent exits

Later:
  → ODS re-reads state
  → Sees unprocessed question:ask event
  → ODS processes: sets node.status = 'waiting-question', pending_question_id, event.status = 'acknowledged'
  → ONBAS returns question-pending action
  → Orchestrator surfaces question to human
  → Human answers → raiseEvent('question:answer') → ODS processes → event.status = 'handled'
```

Note: `question:ask` is the event that already admits it can't be fully handled inline — the current handler leaves `event.status` as `new` with the comment "deferred processing. External action required." The raise-only model makes this the norm, not the exception.

### Scenario C: Agent hits an error (`node:error`)

**Current model (handlers inline):**
```
Agent subprocess:
  → cg wf node error --graph g --node n --code "API_TIMEOUT" --message "Upstream API timed out"
  → reportError() calls raiseEvent('node:error', ...)
  → raiseEvent:
      1. validate (node is agent-accepted ✓)
      2. create event {type: 'node:error', status: 'new', stops_execution: true}
      3. append event to node.events[]
      4. run handleNodeError():
         - node.status = 'blocked-error'
         - node.error = {code: 'API_TIMEOUT', message: 'Upstream API timed out'}
         - event.status = 'handled'
      5. derive backward-compat fields (redundant — overwrites error with same value)
      6. persist state
  → CLI shows: "[AGENT INSTRUCTION] stop and wait for orchestrator"
  → Agent exits

Later:
  → ODS re-reads state
  → Sees node.status === 'blocked-error'
  → ONBAS skips blocked node (or escalates if it's the only one remaining)
```

**Proposed model (raise only):**
```
Agent subprocess:
  → cg wf node error --graph g --node n --code "API_TIMEOUT" --message "Upstream API timed out"
  → reportError() calls raiseEvent('node:error', ...)
  → raiseEvent:
      1. validate (node is agent-accepted ✓)
      2. create event {type: 'node:error', status: 'new', stops_execution: true}
      3. append event to node.events[]
      4. persist state
  → CLI shows: "[AGENT INSTRUCTION] stop and wait for orchestrator"
  → Agent exits

Later:
  → ODS re-reads state
  → Sees unprocessed node:error event
  → ODS processes: sets node.status = 'blocked-error', writes error object, event.status = 'handled'
  → ODS checks payload.recoverable flag (currently unused — now ODS can act on it)
  → ONBAS skips or retries based on ODS decision
```

Note: The error payload includes a `recoverable` flag that is stored but currently unused by any logic. In the raise-only model, ODS is the natural place to act on it — retry automatically if recoverable, escalate if not.

### The pattern across all three

In every scenario the agent's side is identical:
1. Agent calls CLI command
2. `raiseEvent()` records the event
3. CLI reads `stops_execution: true`, shows the stop instruction
4. Agent exits

What differs is **who processes the event** and **when**. In the current model, processing happens at raise time. In the proposed model, processing happens when ODS runs.

### What changes

| Aspect | Inline handlers | Raise only |
|---|---|---|
| `raiseEvent()` responsibility | Record + process | Record only |
| State mutation | Immediate (at raise time) | Deferred (at orchestration time) |
| `event.status` after raise | `handled` (most events) | `new` (all events) |
| `node.status` after raise | Already transitioned | Unchanged until ODS processes |
| ODS role | Read aftermath | Discover + process |
| Handler code lives in | event-handlers.ts (called by raiseEvent) | ODS (future, Plan 030 Phase 6) |

---

## The `stopsExecution` Flag

Three event types have `stopsExecution: true`: `node:completed`, `node:error`, `question:ask`.

In the current code, the CLI reads this flag after `raiseEvent()` returns and shows:

```
[AGENT INSTRUCTION] This event requires you to stop.
Exit now and wait for the orchestrator to continue.
```

This is a **directive to the agent**, not a state transition trigger. It tells the agent: "you've raised an event that requires you to hand back to the orchestrator." The agent should exit its subprocess. The pod returns. ODS picks up.

This flag works identically in both models. `raiseEvent()` returns the event with `stops_execution: true`, the CLI displays the instruction, the agent exits. The flag has nothing to do with whether a handler runs inline.

---

## The `acknowledged` Gap

The event status schema defines three states: `new`, `acknowledged`, `handled`.

Workshop 02 describes the intended lifecycle for `question:ask`:

```
new → acknowledged (orchestrator saw it) → handled (answer provided)
```

In the current implementation, `acknowledged` is **never set by any code**. The `handleQuestionAsk` handler intentionally leaves the event at `new`:

```typescript
// question:ask stays 'new' — deferred processing. External action required.
```

This is the correct instinct — `question:ask` requires external action, so it shouldn't be marked as handled. But it also reveals that the handler already knows it can't fully process this event. It's doing half the work (setting `node.status`, `pending_question_id`) while acknowledging the other half is someone else's job.

In the raise-only model, this is cleaner:
- All events start as `new`
- ODS sets `acknowledged` when it picks up an event
- ODS sets `handled` after processing is complete
- The lifecycle works as designed

---

## What About `node.status` Transitions?

The main concern with raise-only: if `raiseEvent()` doesn't set `node.status`, what happens between the agent raising the event and ODS processing it?

**Answer**: Nothing needs to happen. The agent exits after raising a stopping event. No one reads the node status until ODS runs. The intermediate state is:

```
node.status = 'agent-accepted'  (unchanged from before the event)
node.events = [..., {type: 'node:completed', status: 'new'}]  (event recorded)
```

When ODS walks the nodes, it sees: "this node has status `agent-accepted` but has an unprocessed `node:completed` event." ODS processes it.

For non-stopping events like `progress:update` and `node:accepted`, the agent continues working. These events are informational — they don't change the fundamental state of what the agent is doing.

### Edge case: `node:accepted`

Currently, `handleNodeAccepted` sets `node.status` from `starting` to `agent-accepted`. In the raise-only model, the node stays at `starting` until ODS processes the event.

Is this a problem? The agent continues working regardless. The status is a label for the orchestrator to read, not a gate the agent checks. When ODS processes the acceptance event, it transitions the status. In the meantime, the agent has already started doing work — which is exactly what acceptance means.

### Edge case: `question:answer`

`question:answer` is raised by a human or orchestrator (allowed sources: `human`, `orchestrator`), not the agent. The handler currently clears `pending_question_id` and marks both events as `handled`. In the raise-only model, ODS would do this processing on its next walk. Since the answer comes from outside the pod, there's no agent handback concern — ODS is already running.

---

## Error Handling: Not All Errors Are Fatal

The agent raises `node:error` when it encounters a problem. The current handler sets `node.status = 'blocked-error'` and writes the error details. The event has `stopsExecution: true`, so the CLI tells the agent to exit.

In the raise-only model, the event is recorded but `node.status` stays at `agent-accepted`. ODS later sees the error event, transitions to `blocked-error`, and decides what to do (retry, skip, escalate).

The error payload includes a `recoverable` flag (defined in the schema but currently unused by any logic). In the future, ODS could use this to decide whether to retry automatically.

The agent doesn't "hand back" on error in the sense of a controlled exit — it raises the error event, the CLI tells it to stop, and it exits. The pod's process ends. From ODS's perspective, this is the same handback mechanism as a successful completion.

---

## Impact on Phase 5

Phase 5 is "Service Method Wrappers" — thin service methods that construct event payloads and call `raiseEvent()`. The current design assumes `raiseEvent()` handles everything. With the raise-only model:

### What stays the same
- Service methods still call `raiseEvent()`
- `raiseEvent()` still validates, creates events, appends, and persists
- `stopsExecution` flag still returned to CLI
- Event registry, schemas, validation — all unchanged

### What changes
- Handlers are **not called** inside `raiseEvent()`
- `event.status` is always `new` after raise (never `handled`)
- `node.status` is not mutated by `raiseEvent()` — just the event log
- `deriveBackwardCompatFields()` becomes even more pointless (already targeted for removal)
- Phase 5 wrappers become truly thin: construct payload → call raiseEvent → return result

### What moves
- Handler logic moves to Plan 030 Phase 6 (ODS implementation)
- The handler functions themselves (event-handlers.ts) can remain as reference or be moved wholesale into ODS
- Status transition logic is ODS's job, not the event system's job

---

## Recommendation

**Remove handler invocation from `raiseEvent()`.** The pipeline becomes:

```
validate → create event → append to log → persist
```

Four steps. `raiseEvent()` records the fact. Period.

Handler logic (event-handlers.ts) is preserved as a module but not called by `raiseEvent()`. It becomes the starting point for ODS's event processing logic in Plan 030 Phase 6.

### Why now

- Nothing has shipped — no backward compatibility concerns
- The event system is being built as infrastructure for an orchestration loop that doesn't exist yet
- Building processing into the write path means building it twice (once now, once in ODS)
- The `question:ask` handler already acknowledges this by leaving events as `new`
- Workshop 04 already identified redundancy in the compat layer; this extends that insight to all handlers

### Impact on existing tests

Existing `raiseEvent` tests verify the full pipeline including handler effects (status transitions, field writes). These tests will need to be updated:
- Assertions about `node.status` changes after `raiseEvent()` will fail (status no longer changes)
- Assertions about `event.status === 'handled'` will fail (events stay `new`)
- The tests become simpler: verify event was created and appended, not that state was mutated

Event handler tests (event-handlers.test.ts) remain valid — they test the handler functions in isolation. These functions still work; they're just not called from `raiseEvent()` anymore.

---

## Open Questions

### Q1: Should handlers be removed now or in a later phase?

**OPEN**: Removing handlers from `raiseEvent()` is a Phase 5 concern (we're building service wrappers that call `raiseEvent()`). But the test updates are significant. Options:
- **A**: Remove handlers from `raiseEvent()` as part of Subtask 001 (extend the compat drop to a handler drop)
- **B**: Remove handlers as a new Subtask 002 after Subtask 001 completes
- **C**: Keep handlers for now, remove them in Plan 030 Phase 6 when ODS is built

### Q2: What happens to `node.status` validation?

**OPEN**: `raiseEvent()` validates that the node is in a valid state before accepting the event (e.g., `node:completed` requires `agent-accepted`). If handlers don't run, the node stays at `agent-accepted` after `node:completed` is raised. If the agent then tries to raise another event, the validation still checks against `agent-accepted` — which may or may not allow the second event.

In practice, the agent exits after a stopping event, so this isn't a real concern. But it's worth noting.

### Q3: Should event-handlers.ts be deleted or preserved?

**OPEN**: The handler functions represent correct state transition logic. Options:
- **Preserve**: Keep as a module, document as "future ODS processing logic"
- **Move**: Relocate to a `032-node-event-system/processing/` subfolder to signal it's not part of the write path
- **Delete**: Remove entirely, rebuild in ODS from scratch
