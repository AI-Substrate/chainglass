# Workshop: raiseEvent/handleEvents Separation, Subscriber Stamps, and Disconnected Event Processing

**Type**: Integration Pattern / State Machine
**Plan**: 032-node-event-system
**Spec**: [node-event-system-spec.md](../node-event-system-spec.md)
**Created**: 2026-02-08
**Status**: Draft

**Related Documents**:
- [Workshop 01: Node Event System](./01-node-event-system.md) — Event type definitions, handler contract
- [Workshop 02: Event Schema and Storage](./02-event-schema-and-storage.md) — NodeEvent JSON structure, status lifecycle
- [Workshop 05: Events Should Be Raised, Not Handled](./05-event-raise-not-handle.md) — Raise-only vs inline handler debate
- ~~Subtask 002: Remove Inline Handlers~~ — Superseded and deleted per Workshop 08 remediation
- [Workshop 08 (Plan 030): Agent Handback Protocol](../../030-positional-orchestrator/workshops/08-ods-orchestrator-agent-handover.md) — ODS reads what agent did

---

## Purpose

Resolve the tension between Workshop 05's "raise-only" recommendation and the practical reality that state transitions must happen immediately for the next CLI command to succeed. Design a clean separation between recording events (`raiseEvent`) and processing them (`handleEvents`), with a subscriber stamp model so multiple independent processors can track their own progress on the same events.

## Key Questions Addressed

- Q1: Should handlers run inside raiseEvent, or separately?
- Q2: Which event types need immediate state mutation vs which can be fully deferred?
- Q3: When both the CLI and the orchestrator need to process the same event, how do they coordinate without coupling?
- Q4: How should subscribers leave notes on events they've processed (the "stamp" concept)?
- Q5: What is the scope of handleEvents — node, graph, or global?
- Q6: How do multiple concurrent agents on the same graph avoid write conflicts?

---

## The Core Tension

Workshop 05 argued: `raiseEvent()` should be a pure recording function — validate, create, append, persist. No state mutations. Processing deferred to ODS.

The problem with pure raise-only:

```
CLI command sequence:
  1. CLI raises node:accepted via raiseEvent
  2. raiseEvent records it — node.status stays 'starting'
  3. CLI raises question:ask via raiseEvent
  4. VALID_FROM_STATES rejects: question:ask requires 'agent-accepted', but status is still 'starting'
  5. COMMAND FAILS — state wasn't updated between raises
```

The CLI and the orchestrator run at different times. The CLI can't wait for the orchestrator to process events. The status must update immediately so the next CLI command succeeds.

But Workshop 05's insight is also valid: ODS should discover and process events, not just read the aftermath. If everything is done at raise time, ODS has nothing to do.

**The resolution**: Separate recording from processing. `raiseEvent()` records. `handleEvents()` processes. The CLI calls both — but they're independent, testable functions with single responsibilities.

---

## Foundational Principle: The Eventing System Is a Node Concept

The event system operates on **nodes**. Events belong to nodes. Handlers process node events and mutate node state.

Pods, agents, humans, ODS, ONBAS — these are all **users** of the eventing system. They raise events and trigger handling. The eventing system has no awareness of who its callers are beyond the `source` field on the event (`agent`, `executor`, `orchestrator`, `human`).

This distinction matters for scoping: handleEvents processes events on a node, not "for an agent" or "for a pod."

---

## How Other Systems Solve This

### The Problem Has a Name: "Multi-Subscriber Independent Processing"

In distributed event-driven systems, the same event frequently needs to be processed by multiple independent consumers at different times. The key patterns:

### Pattern 1: Consumer Offsets (Kafka)

Each consumer group maintains its own offset — a pointer to the last event it processed. The event stream is immutable. Consumers read at their own pace.

```
Event Log:     [evt_1] [evt_2] [evt_3] [evt_4] [evt_5]
                                        ^              ^
CLI consumer offset: -------------------+              |
ODS consumer offset: ----------------------------------+
```

Kafka stores offsets in `__consumer_offsets` — a separate topic. The event payload is never modified by consumers.

**Insight for us**: Subscribers track their own position, not write to the event.

### Pattern 2: Tracking Tokens (Axon Framework)

Each event processor maintains a "tracking token" — its position in the event stream. Tokens are stored in a "Token Store" (database table). Multiple processors can read the same stream independently.

Axon segments the token space for parallelism. Each segment has a claim — only one processor owns a segment at a time, with automatic failover via claim expiration.

**Insight for us**: Per-subscriber state should be stored separately from the event.

### Pattern 3: Event Metadata / Message Envelopes (EventStoreDB, CloudEvents)

Events have two layers: **payload** (business data) and **metadata** (processing context). Metadata includes things like correlation IDs, tenant IDs, subscriber-specific annotations.

EventStoreDB stores stream metadata in a separate `$$stream` structure. Consumers can write metadata without modifying the event payload.

The CloudEvents spec standardizes this as a "message envelope" — headers (metadata) wrapping a body (payload).

**Insight for us**: Processing context belongs in metadata, not payload. Separate concerns.

### Pattern 4: The Transactional Outbox

When you need both immediate local consistency AND deferred processing, the "transactional outbox" pattern writes both the state change and an outbox record in the same database transaction. A separate outbox processor later reads the outbox and dispatches events.

```
Single atomic write:
  1. Append event to node.events[] with status = 'new'
  2. Persist state.json

Then immediately:
  3. handleEvents processes new events, applies state transitions
  4. Persist state.json again (or same write if batched)

Later:
  ODS reads events without its stamp -> processes them
```

**Insight for us**: This is exactly the raiseEvent + handleEvents pattern. raiseEvent is the outbox write. handleEvents is the immediate processor. ODS is the deferred processor.

---

## The Design: raiseEvent + handleEvents Separation

### Two Functions, Single Responsibility Each

```typescript
// raiseEvent — pure recorder
// Validates, creates event, appends to log, persists.
// Does NOT run handlers. Does NOT mutate node state.
async function raiseEvent(
  deps: RaiseEventDeps,
  graphSlug: string,
  nodeId: string,
  eventType: string,
  payload: unknown,
  source: EventSource
): Promise<RaiseEventResult>

// handleEvents — pure processor
// Scans a node's events, runs handlers for unstamped events, stamps them.
// Does NOT validate or create events. Just processes what's there.
function handleEvents(
  state: State,
  nodeId: string,
  subscriber: string,
  handlers: Map<string, EventHandler>
): void
```

### CLI Command Flow

Every `wf` CLI command that knows the target node calls handleEvents after its work:

```
CLI command (e.g., `cg wf node end --graph g --node task-1`):
  1. Service method calls raiseEvent()     -> event recorded, state unchanged
  2. CLI calls handleEvents(state, 'task-1', 'cli', handlers)
                                           -> handlers run, state transitions, stamps written
  3. Persist state
  4. Return result to caller
```

Any `wf` command that has node context runs handleEvents — not just commands that raise events. This makes the system self-healing: if an event was missed (e.g., human answered a question but handleEvents didn't run), the next CLI command on that node catches it.

### ODS Flow

ODS walks the entire graph, processing all nodes:

```
ODS orchestration walk:
  for each node in graph:
    handleEvents(state, nodeId, 'ods', odsHandlers)
  persist state
```

### Why This Is Better Than Handlers Inside raiseEvent

| Concern | Handlers in raiseEvent (current) | raiseEvent + handleEvents (proposed) |
|---|---|---|
| **SRP** | raiseEvent does recording AND processing | Each function has one job |
| **Testability** | Must test recording+processing together | Test each in isolation |
| **ODS discovery** | Events marked `handled`, ODS skips them | Events stay `new`, ODS finds them |
| **Composability** | Handler execution coupled to event creation | handleEvents can run independently of raiseEvent |
| **Self-healing** | Only processes events at raise time | Any CLI command can catch missed events |

---

## Scope of handleEvents: Node-Scoped

### Why Node-Scoped, Not Graph-Scoped

A graph can have 10+ agents running concurrently, each on a different node, each making CLI commands. If handleEvents were graph-scoped:

```
Agent A on node-1: loads state.json, runs handleEvents on ALL nodes
Agent B on node-2: loads state.json, runs handleEvents on ALL nodes
Both persist — last write wins. Agent A's stamps on node-2 get overwritten.
```

Node-scoped handleEvents avoids this: each CLI command only processes events on the node it's operating on. No cross-node write conflicts.

```typescript
// CLI: process events for this node only
handleEvents(state, 'task-1', 'cli', handlers);

// ODS: process events for each node (graph walk, single writer)
for (const nodeId of Object.keys(state.nodes ?? {})) {
  handleEvents(state, nodeId, 'ods', odsHandlers);
}
```

### Who Scopes What

| Caller | Scope | Why |
|---|---|---|
| **CLI** | Single node (the command's target) | Multiple agents may be running on the same graph concurrently |
| **ODS** | All nodes in graph (sequential walk) | ODS is a single writer — no concurrency issues after pods exit |
| **ONBAS** | Read-only (no handleEvents call) | Advisory system, doesn't process events |

### The Self-Healing Property

Even with node-scoped CLI handling, self-healing works for the common case: a human answers a question on node-3, and the next CLI command targeting node-3 (e.g., `cg wf node status --node task-3`) processes the pending answer event.

Cross-node healing (an event on node-3 needs to trigger something on node-7) is orchestration — that's ODS territory. ODS walks the whole graph.

---

## Per-Event-Type Analysis

The question isn't "handlers or no handlers" — it's "what does each subscriber need from each event type?"

### Subscribers

There are three subscribers in this system. They're all just users of the eventing system:

| Subscriber | When It Runs | What It Needs |
|---|---|---|
| **CLI** | Immediately after raiseEvent, during any `wf` command | State transitions so the next CLI command succeeds |
| **ODS** | Later, after pods exit, during graph walk | Discovery of what happened, orchestration decisions |
| **ONBAS** | Later, during graph walk (read-only) | Sub-state determination — does not stamp events |

### Event-by-Event Breakdown

#### `node:accepted`

| Concern | CLI (Immediate) | ODS (Deferred) |
|---|---|---|
| State transition | `starting` -> `agent-accepted` | N/A (already done) |
| Orchestration | N/A | Emit domain event "node accepted" |

**CLI handler needed**: Yes. The next CLI command (e.g., `question:ask`) requires `agent-accepted` status.

#### `node:completed`

| Concern | CLI (Immediate) | ODS (Deferred) |
|---|---|---|
| State transition | `agent-accepted` -> `complete`, set `completed_at` | N/A (already done) |
| Orchestration | N/A | Select next node, emit domain event |

**CLI handler needed**: Yes. State should be correct on disk immediately.

#### `node:error`

| Concern | CLI (Immediate) | ODS (Deferred) |
|---|---|---|
| State transition | -> `blocked-error`, write error object | N/A (already done) |
| Orchestration | N/A | Retry? Escalate? Act on `recoverable` flag |

**CLI handler needed**: Yes. ODS later reads the error event and makes orchestration decisions. The `recoverable` flag in the payload is currently unused — ODS is the natural consumer.

#### `question:ask`

| Concern | CLI (Immediate) | ODS (Deferred) |
|---|---|---|
| State transition | -> `waiting-question`, set `pending_question_id` | N/A |
| Orchestration | N/A | Surface question to human |

**CLI handler needed**: Yes. The current handler already acknowledges deferred processing by leaving `event.status = 'new'`. With the new model, ALL events stay `new` — this becomes the norm.

#### `question:answer`

| Concern | CLI (Immediate) | ODS (Deferred) |
|---|---|---|
| State transition | Clear `pending_question_id`, -> `starting` | N/A |
| Orchestration | N/A | Resume node, launch pod |

**CLI handler needed**: Yes. This event is raised by a human via CLI. The CLI command targets a specific node (`--node task-1`), so node-scoped handleEvents processes it. ODS later discovers the node is ready to be relaunched.

**Note**: Current handler does NOT transition to `starting`. Per DYK #1 and the plan (line 406), it should. This is the T003 fix.

#### `progress:update`

| Concern | CLI (Immediate) | ODS (Deferred) |
|---|---|---|
| State transition | None | None |
| Orchestration | N/A | Metrics/logging (optional) |

**CLI handler needed**: No. Purely informational. The event is recorded and that's it.

### Summary Table

| Event Type | CLI Handler? | What CLI Handler Does | What ODS Does Later |
|---|---|---|---|
| `node:accepted` | Yes | `status -> agent-accepted` | Emit domain event |
| `node:completed` | Yes | `status -> complete`, `completed_at` | Select next node |
| `node:error` | Yes | `status -> blocked-error`, write error | Retry/escalate |
| `question:ask` | Yes | `status -> waiting-question`, `pending_question_id` | Surface question |
| `question:answer` | Yes | Clear `pending_question_id`, `status -> starting` | Resume node, launch pod |
| `progress:update` | No | -- | Metrics/logging |

---

## The Subscriber Stamp Model

### The Problem with `event.status = 'handled'`

The current design uses a single `status` field (`new` -> `acknowledged` -> `handled`) with a single `handled_at` and `handler_notes`. This assumes one subscriber processes each event. But we've established that multiple subscribers need to process the same event:

1. **CLI** applies the state transition (immediate, during command)
2. **ODS** makes orchestration decisions (deferred, after pods exit)

If the CLI marks `event.status = 'handled'`, ODS sees a "handled" event and skips it. But ODS hasn't done its part yet (selecting the next node, surfacing the question, etc.).

### Solution: Subscriber Stamps (Property Bag)

Each subscriber leaves a "stamp" on the event — a record of what it did and when. Multiple stamps can coexist on the same event.

```typescript
// Added to NodeEvent:
{
  // ... existing fields unchanged ...
  stamps?: Record<string, EventStamp>,  // NEW: per-subscriber stamps
}

interface EventStamp {
  /** When this subscriber processed the event */
  stamped_at: string;  // ISO-8601

  /** What the subscriber did */
  action: string;  // free-form, subscriber-defined

  /** Optional structured data the subscriber wants to record */
  data?: Record<string, unknown>;
}
```

### How Stamps Work

```
Event created by raiseEvent():
  status: 'new'
  stamps: (undefined — no one has processed it yet)

handleEvents('cli') runs immediately:
  stamps: {
    'cli': {
      stamped_at: '2026-02-08T10:00:00.000Z',
      action: 'state-transition',
      data: { from: 'starting', to: 'agent-accepted' }
    }
  }
  (event.status stays 'new' — ODS hasn't processed yet)

handleEvents('ods') runs later:
  stamps: {
    'cli': { ... },
    'ods': {
      stamped_at: '2026-02-08T10:05:00.000Z',
      action: 'orchestration',
      data: { domain_event: 'node:accepted', next_action: 'continue-walk' }
    }
  }
  (event.status set to 'handled' — all subscribers done)
```

### Stamps Schema

```typescript
const EventStampSchema = z.object({
  stamped_at: z.string().datetime(),
  action: z.string().min(1),
  data: z.record(z.unknown()).optional(),
});

// Added to NodeEventSchema:
stamps: z.record(z.string(), EventStampSchema).optional(),
```

The `stamps` key is the subscriber name (`'cli'`, `'ods'`). Each subscriber owns its own key. No subscriber modifies another subscriber's stamp (though they can read them for coordination).

### The `stampEvent` Helper

Replaces the current `markHandled()`:

```typescript
function stampEvent(
  event: NodeEvent,
  subscriber: string,
  action: string,
  data?: Record<string, unknown>
): void {
  if (!event.stamps) event.stamps = {};
  event.stamps[subscriber] = {
    stamped_at: new Date().toISOString(),
    action,
    data,
  };
}
```

### handleEvents Implementation

```typescript
function handleEvents(
  state: State,
  nodeId: string,
  subscriber: string,
  handlers: Map<string, EventHandler>
): void {
  const entry = state.nodes?.[nodeId];
  if (!entry) return;

  for (const event of entry.events ?? []) {
    // Skip events this subscriber has already stamped
    if (event.stamps?.[subscriber]) continue;

    const handler = handlers.get(event.event_type);
    if (handler) {
      handler(state, nodeId, event);
      stampEvent(event, subscriber, handler.actionName, handler.stampData?.(state, nodeId, event));
    }
  }
}
```

### ODS Discovery

ODS doesn't need a separate "find unprocessed" query — handleEvents already skips stamped events:

```typescript
// ODS graph walk — same handleEvents, different subscriber name
for (const nodeId of Object.keys(state.nodes ?? {})) {
  handleEvents(state, nodeId, 'ods', odsHandlers);
}
```

ODS only processes events without an `ods` stamp. Events that the CLI already stamped are visible to ODS (it can read `stamps.cli`) but ODS does its own independent processing.

---

## Revised Handler Implementations

### CLI Handlers (Run by handleEvents('cli'))

```typescript
function handleNodeAccepted(state: State, nodeId: string, event: NodeEvent): void {
  const nodes = state.nodes as NonNullable<typeof state.nodes>;
  const previousStatus = nodes[nodeId].status;
  nodes[nodeId].status = 'agent-accepted';
  stampEvent(event, 'cli', 'state-transition', {
    from: previousStatus,
    to: 'agent-accepted',
  });
}

function handleNodeCompleted(state: State, nodeId: string, event: NodeEvent): void {
  const nodes = state.nodes as NonNullable<typeof state.nodes>;
  const previousStatus = nodes[nodeId].status;
  nodes[nodeId].status = 'complete';
  nodes[nodeId].completed_at = new Date().toISOString();
  stampEvent(event, 'cli', 'state-transition', {
    from: previousStatus,
    to: 'complete',
    completed_at: nodes[nodeId].completed_at,
  });
}

function handleNodeError(state: State, nodeId: string, event: NodeEvent): void {
  const nodes = state.nodes as NonNullable<typeof state.nodes>;
  const payload = event.payload as { code: string; message: string; details?: unknown };
  const previousStatus = nodes[nodeId].status;
  nodes[nodeId].status = 'blocked-error';
  nodes[nodeId].error = {
    code: payload.code,
    message: payload.message,
    details: payload.details,
  };
  stampEvent(event, 'cli', 'state-transition', {
    from: previousStatus,
    to: 'blocked-error',
    error_code: payload.code,
  });
}

function handleQuestionAsk(state: State, nodeId: string, event: NodeEvent): void {
  const nodes = state.nodes as NonNullable<typeof state.nodes>;
  const previousStatus = nodes[nodeId].status;
  nodes[nodeId].status = 'waiting-question';
  nodes[nodeId].pending_question_id = event.event_id;
  stampEvent(event, 'cli', 'state-transition', {
    from: previousStatus,
    to: 'waiting-question',
    question_id: event.event_id,
  });
}

function handleQuestionAnswer(state: State, nodeId: string, event: NodeEvent): void {
  const nodes = state.nodes as NonNullable<typeof state.nodes>;
  const payload = event.payload as { question_event_id: string };
  const previousStatus = nodes[nodeId].status;

  // Find and stamp the original ask event
  const nodeEvents = nodes[nodeId].events ?? [];
  const askEvent = nodeEvents.find(
    (e) => e.event_type === 'question:ask' && e.event_id === payload.question_event_id
  );
  if (askEvent) {
    stampEvent(askEvent, 'cli', 'answer-linked', {
      answer_event_id: event.event_id,
      answered_by: event.source,
    });
  }

  // Clear pending and transition to starting (two-phase handshake resume)
  nodes[nodeId].pending_question_id = undefined;
  nodes[nodeId].status = 'starting';
  stampEvent(event, 'cli', 'state-transition', {
    from: previousStatus,
    to: 'starting',
    question_id: payload.question_event_id,
  });
}

// progress:update — no CLI handler needed (purely informational)
```

### ODS Handlers (Future — Plan 030 Phase 6)

```typescript
// ODS handlers don't mutate node state — CLI already did that.
// They make orchestration decisions and stamp events as 'handled'.

function odsProcessNodeCompleted(state: State, nodeId: string, event: NodeEvent): void {
  // Orchestration: determine next node to execute
  const nextNode = selectNextNode(state, nodeId);
  stampEvent(event, 'ods', 'orchestration', {
    next_node_id: nextNode?.id,
    domain_event: 'node:completed',
  });
  // Mark fully handled (both CLI and ODS have processed)
  event.status = 'handled';
  event.handled_at = new Date().toISOString();
}

function odsProcessQuestionAsk(state: State, nodeId: string, event: NodeEvent): void {
  // Orchestration: surface question to human
  surfaceQuestionToHuman(state, nodeId, event);
  stampEvent(event, 'ods', 'acknowledged', {
    surfaced_to: 'human-queue',
  });
  // Set to 'acknowledged' (not 'handled' — waiting for human answer)
  event.status = 'acknowledged';
  event.acknowledged_at = new Date().toISOString();
}
```

---

## Revised Handler Behavior Per Event Type

| Event Type | CLI Handler | CLI Stamp Data | ODS Handler (Future) | ODS Stamp Data |
|---|---|---|---|---|
| `node:accepted` | `status -> agent-accepted` | `{ from, to }` | Emit domain event | `{ domain_event }` |
| `node:completed` | `status -> complete`, `completed_at` | `{ from, to, completed_at }` | Select next node | `{ next_node_id }` |
| `node:error` | `status -> blocked-error`, write error | `{ from, to, error_code }` | Retry/escalate | `{ decision, retry_count? }` |
| `question:ask` | `status -> waiting-question`, `pending_question_id` | `{ from, to, question_id }` | Surface to human | `{ surfaced_to }` |
| `question:answer` | Clear `pending_question_id`, `status -> starting` | `{ from, to, question_id }` | Resume node, launch pod | `{ pod_id? }` |
| `progress:update` | (none) | -- | (none or metrics) | -- |

---

## Complete Processing Flow

### raiseEvent (Recording Only)

```
raiseEvent(deps, graphSlug, nodeId, eventType, payload, source):
  1. Step 1: Type exists? (registry lookup)
  2. Step 2: Payload valid? (Zod schema validation)
  3. Step 3: Source allowed? (allowedSources check)
  4. Step 4: Node in valid state? (VALID_FROM_STATES check)
  5. Step 5: Question reference validation (question:answer only)
  6. Create event (status: 'new', no stamps)
  7. Append to node.events[]
  8. Persist state
  9. Return { ok: true, event }
```

Note: VALID_FROM_STATES works because handleEvents runs between CLI commands. By the time the next raiseEvent is called, the previous event's handler has already updated node.status.

### handleEvents (Processing)

```
handleEvents(state, nodeId, 'cli', handlers):
  for each event in node.events:
    if event.stamps?.cli exists: skip (already processed)
    if handler registered for event.event_type:
      handler(state, nodeId, event)   // mutates state + stamps event
```

### CLI Command Orchestration

```
Any `wf` CLI command targeting a node:
  1. Execute command logic (may call raiseEvent, or not)
  2. handleEvents(state, nodeId, 'cli', cliHandlers)
  3. Persist state
  4. Return result
```

This means even `cg wf node status --node task-1` triggers handleEvents — catching any pending events from other users (e.g., a human answered a question since the last command).

---

## Impact on Subtask 002 and Phase 5

### Subtask 002 — SUPERSEDED

The original Subtask 002 ("Remove Inline Handlers from raiseEvent") is superseded by this workshop. The new scope:

| Original ST Task | New Status |
|---|---|
| ST001: Remove handler call from raiseEvent | **YES** — remove handler invocation from raiseEvent. Handlers move to handleEvents. |
| ST002: Update raiseEvent test | **YES** — events stay `status: 'new'`, no stamps after raiseEvent (stamps come from handleEvents) |
| ST003: Rewrite VALID_FROM_STATES to event-log-based | **NO** — VALID_FROM_STATES works as-is because handleEvents runs between CLI commands |
| ST004: Update E2E walkthrough tests | **REVISED** — tests call raiseEvent + handleEvents, assert stamps instead of `handled` status |
| ST005: Update spec | **YES** — describe raiseEvent/handleEvents separation |
| ST006: Update dossier | **YES** — reflect new architecture |
| ST007: Verify tests | **YES** — `just fft` clean |

New tasks needed:
- Add `stamps` field to `NodeEventSchema`
- Create `stampEvent()` helper
- Create `handleEvents()` function
- Refactor handlers from `markHandled()` to `stampEvent()`
- Wire handleEvents into CLI command flow

### Parent Phase 5 (T003-T011)

- **T003 (Update handleQuestionAnswer)**: Still needed — add `starting` transition. Now writes stamp instead of markHandled.
- **T004-T006 (Contract tests)**: Simplified — test raiseEvent (recording) and handleEvents (processing) separately.
- **T007-T009 (Service wrappers)**: Service methods call raiseEvent only. The CLI layer calls handleEvents. Wrappers stay thin.

**The wrapper pattern**:
```typescript
// Service method — calls raiseEvent (recording only)
async endNode(ctx, graphSlug, nodeId) {
  const canEndResult = await this.canEnd(ctx, graphSlug, nodeId);
  if (!canEndResult.canEnd) return missingOutputError(...);
  const deps = this.createRaiseEventDeps(ctx);
  return raiseEvent(deps, graphSlug, nodeId, 'node:completed', {}, 'agent');
}

// CLI command handler — calls service method + handleEvents
async executeEndNodeCommand(ctx, graphSlug, nodeId) {
  const result = await service.endNode(ctx, graphSlug, nodeId);
  if (!result.ok) return result;
  // Process events (state transitions, stamps)
  const state = await loadState(graphSlug);
  handleEvents(state, nodeId, 'cli', cliHandlers);
  await persistState(graphSlug, state);
  return mapToEndNodeResult(result, state, nodeId);
}
```

The service layer knows about events but not about handling. The CLI layer orchestrates the raise-then-handle sequence. Clean separation.

---

## Impact on NodeEvent Schema

### Minimal Schema Change

```typescript
// node-event.schema.ts — additions only

const EventStampSchema = z.object({
  stamped_at: z.string().datetime(),
  action: z.string().min(1),
  data: z.record(z.unknown()).optional(),
});

export const NodeEventSchema = z.object({
  // ... all existing fields unchanged ...

  /** Per-subscriber processing records */
  stamps: z.record(z.string(), EventStampSchema).optional(),
});
```

The `stamps` field is optional, so existing events without stamps parse fine. No migration needed.

### Backward Compatibility

The existing `status`, `handled_at`, and `handler_notes` fields are preserved. They serve as a "summary" of the event's overall lifecycle. The stamps provide the detailed per-subscriber view.

- `handler_notes` is deprecated in favor of stamps. Existing code that reads it still works.
- `handled_at` is set by ODS (the "closer") when all subscribers have processed.
- `status` lifecycle is unchanged: `new` -> `acknowledged` -> `handled`.

---

## Open Questions

### Q1: Should ONBAS stamp events?

**RESOLVED**: No. ONBAS is a read-only advisory system. It reads event logs to determine sub-states but doesn't process events in the "take action" sense. It shouldn't modify event state.

### Q2: What subscriber names are valid?

**RESOLVED**: Convention-enforced strings. Use `cli`, `ods` as documented conventions, but the schema accepts any string (`z.record(z.string(), EventStampSchema)`). Future subscribers (webhooks, plugins) can use their own names without schema changes.

### Q3: When does an event become 'handled'?

**RESOLVED**: ODS is the "closer." The CLI leaves event status as `new` after stamping. ODS sets `handled` when it stamps (two-subscriber model: CLI + ODS). If a third subscriber emerges later, revisit with a declarative rule engine.

### Q4: Should stamps be immutable?

**RESOLVED**: Mutable (latest wins). This isn't a financial audit trail. If ODS re-processes an event (retry scenario), it overwrites its stamp with the latest result.

### Q5: Schema change timing — Phase 5 or later?

**OPEN**: Should the `stamps` field be added to NodeEventSchema now (Phase 5) or deferred to Plan 030 Phase 6?

- **Option A**: Add stamps in Phase 5. CLI handlers start writing stamps immediately. ODS can be built against a clean contract.
- **Option B**: Defer stamps to Plan 030 Phase 6. CLI handlers keep using `markHandled` for now.

**Recommendation**: Option A. The schema change is one optional field. Getting this right now means ODS has a clean contract to build against.

### Q6: What happens to `handler_notes`?

**RESOLVED**: Keep for backward compat, deprecate in favor of stamps. New code uses stamps. Old code that reads `handler_notes` still works. Remove in a future cleanup pass.

### Q7: Does handleEvents need to persist state, or does the caller persist?

**OPEN**: handleEvents mutates state in-place. Should it also persist?

- **Option A**: handleEvents mutates only. Caller persists. Pro: caller controls the write (can batch with other changes). Con: caller must remember to persist.
- **Option B**: handleEvents takes `persistState` as a dep and persists. Pro: self-contained. Con: may persist unnecessarily if nothing changed.

**Recommendation**: Option A. handleEvents mutates in-place, caller persists. This matches the existing pattern where raiseEvent takes `persistState` as a dep but handleEvents is a pure state mutation.

---

## Summary: The Architecture

```
              CLI Command
                  |
                  v
          +---------------+
          | Service Method |
          | (e.g. endNode) |
          +-------+-------+
                  |
                  v
          +---------------+
          |  raiseEvent() |  <-- pure recorder
          |  validate     |      no state mutation
          |  create event |      no handler execution
          |  append       |
          |  persist      |
          +-------+-------+
                  |
                  v
         +----------------+
         | handleEvents() |  <-- pure processor
         | scan events    |      node-scoped
         | run handlers   |      stamps each event
         | mutate state   |
         +-------+--------+
                  |
                  v
              Persist state
                  |
            ------+------
            TIME PASSES
            pod exits
            ------+------
                  |
                  v
         +----------------+
         | ODS walks graph |
         | handleEvents() |  <-- same function, subscriber='ods'
         | per node        |      graph-scoped walk
         | orchestration   |      sets status='handled'
         +----------------+
```

This model gives us:
- **SRP** — raiseEvent records, handleEvents processes. Two functions, two responsibilities.
- **Immediate state consistency** — handleEvents('cli') runs after every wf command
- **Deferred orchestration** — ODS runs handleEvents('ods') independently, later
- **Per-subscriber tracking** — stamps show who did what and when
- **No coupling** — CLI and ODS don't coordinate; they stamp independently
- **Concurrency-safe** — CLI is node-scoped; no cross-node write conflicts from multiple agents
- **Self-healing** — any wf command on a node catches pending events
- **Testable** — test raiseEvent and handleEvents independently

---

## Worked Example: Complete Q&A Lifecycle with Stamps

```
1. CLI: `cg wf node accept --graph g --node task-1`
   raiseEvent('node:accepted') -> event recorded, status: 'new'
   handleEvents('cli', 'task-1') -> handler runs:
     node.status = 'agent-accepted'
     event.stamps.cli = { action: 'state-transition', data: { from: 'starting', to: 'agent-accepted' } }
   persist

2. CLI: `cg wf node ask --graph g --node task-1 --type clarification --text "Which API?"`
   raiseEvent('question:ask') -> event recorded, status: 'new'
   handleEvents('cli', 'task-1') -> handler runs:
     node.status = 'waiting-question'
     node.pending_question_id = evt_abc
     event.stamps.cli = { action: 'state-transition', data: { from: 'agent-accepted', to: 'waiting-question' } }
   persist

3. Agent exits (pod returns). Time passes.

4. ODS walks graph:
   handleEvents('ods', 'task-1'):
     node:accepted event -> no ods stamp -> ODS processes:
       stamps.ods = { action: 'orchestration', data: { domain_event: 'node:accepted' } }
       event.status = 'handled' (both CLI and ODS done)
     question:ask event -> no ods stamp -> ODS processes:
       stamps.ods = { action: 'acknowledged', data: { surfaced_to: 'human-queue' } }
       event.status = 'acknowledged' (waiting for human answer)
   persist

5. CLI: `cg wf node answer --graph g --node task-1 --question evt_abc --answer "Use v2"`
   raiseEvent('question:answer') -> answer event recorded, status: 'new'
   handleEvents('cli', 'task-1') -> handler runs:
     original ask event stamped: { action: 'answer-linked', data: { answer_event_id: evt_xyz } }
     node.pending_question_id = undefined
     node.status = 'starting'
     answer event.stamps.cli = { action: 'state-transition', data: { from: 'waiting-question', to: 'starting' } }
   persist

6. ODS walks graph:
   handleEvents('ods', 'task-1'):
     question:answer event -> no ods stamp -> ODS processes:
       stamps.ods = { action: 'orchestration', data: { resume_node: true } }
       event.status = 'handled'
     question:ask event -> stamps.ods exists but status='acknowledged' -> ODS updates:
       event.status = 'handled' (answer received, full lifecycle complete)
   persist
   ODS launches new pod for task-1 (node is back to 'starting')
```
