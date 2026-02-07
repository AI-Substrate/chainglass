# Workshop: Event Schema and Storage

**Type**: Data Model / Storage Design
**Plan**: 032-node-event-system
**Spec**: [node-event-system-spec.md](../node-event-system-spec.md)
**Created**: 2026-02-07
**Status**: Draft

**Related Documents**:
- [Workshop #01: Node Event System](01-node-event-system.md) — event types, registry, CLI design, overall architecture
- [State schema source](../../../../packages/positional-graph/src/schemas/state.schema.ts) — current state.json schema
- [Positional graph service](../../../../packages/positional-graph/src/services/positional-graph.service.ts) — loadState/persistState

---

## Purpose

Workshop #01 designed the event system at a conceptual level — event types, registry, CLI surface. This workshop specifies the **concrete data shapes**: what a NodeEvent looks like in `state.json`, how the event log grows, what the schema migration looks like field-by-field, and how events coexist with current question/error/output mechanisms during the migration period.

A developer implementing the event system should keep this workshop open alongside the state schema file. Every JSON structure shown here is the literal format that will appear on disk.

## Key Questions Addressed

- What does a NodeEvent record look like in state.json?
- Where does the events array live — per-node or top-level?
- How does the state.json schema change, and what's backward compatible?
- How do events coexist with the current questions array during migration?
- What does a node's complete state look like at each lifecycle stage?
- How are event IDs generated?
- What are the new node status values and how do they map to events?

---

## Current State: What state.json Looks Like Today

Before designing the change, here is the exact current format.

### Current Schema (Plan 028)

```typescript
// packages/positional-graph/src/schemas/state.schema.ts

export const NodeExecutionStatusSchema = z.enum([
  'running',
  'waiting-question',
  'blocked-error',
  'complete',
]);

export const NodeStateEntrySchema = z.object({
  status: NodeExecutionStatusSchema,
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  pending_question_id: z.string().optional(),
  error: NodeStateEntryErrorSchema.optional(),
});

export const StateSchema = z.object({
  graph_status: GraphStatusSchema,          // 'pending' | 'in_progress' | 'complete' | 'failed'
  updated_at: z.string().datetime(),
  nodes: z.record(NodeStateEntrySchema).optional(),
  transitions: z.record(TransitionEntrySchema).optional(),
  questions: z.array(QuestionSchema).optional(),
});
```

### Current state.json — Node Running

```json
{
  "graph_status": "in_progress",
  "updated_at": "2026-02-07T10:00:00Z",
  "nodes": {
    "spec-builder-c4d": {
      "status": "running",
      "started_at": "2026-02-07T10:00:00Z"
    }
  },
  "transitions": {},
  "questions": []
}
```

### Current state.json — Question Asked

```json
{
  "graph_status": "in_progress",
  "updated_at": "2026-02-07T10:02:00Z",
  "nodes": {
    "spec-builder-c4d": {
      "status": "waiting-question",
      "started_at": "2026-02-07T10:00:00Z",
      "pending_question_id": "2026-02-07T10:02:00.000Z_f4e"
    }
  },
  "transitions": {},
  "questions": [
    {
      "question_id": "2026-02-07T10:02:00.000Z_f4e",
      "node_id": "spec-builder-c4d",
      "type": "single",
      "text": "Which framework should the spec target?",
      "options": ["React", "Vue", "Angular"],
      "asked_at": "2026-02-07T10:02:00Z"
    }
  ]
}
```

**Key observations about today's format:**
- Nodes without entries are implicitly `pending` (no explicit pending status)
- Questions live in a top-level `questions[]` array, separate from nodes
- `pending_question_id` on the node entry links to the question
- No event log — state changes are direct mutations

---

## New State: What state.json Will Look Like

### Design Decision: Events Live Per-Node

Events are stored in a per-node `events` array inside the node's state entry, NOT in a top-level array like questions.

**Why per-node, not top-level?**

| Approach | Pros | Cons |
|----------|------|------|
| Per-node `events[]` | Events belong to a node; easy to read all events for one node; clean ownership | Querying across nodes requires iterating |
| Top-level `events[]` | Easy cross-node queries | Awkward: each event needs `node_id`; mirrors the current questions[] problem; large flat array |

The current top-level `questions[]` is a design we're moving away from. Events make more sense co-located with their node — when you inspect a node's state, you see its complete history.

### New Status Enum

```typescript
export const NodeExecutionStatusSchema = z.enum([
  'starting',           // NEW — orchestrator has reserved this node
  'agent-accepted',     // NEW — agent acknowledged and is working
  'waiting-question',   // existing
  'blocked-error',      // existing
  'complete',           // existing
]);
```

The existing `'running'` status is replaced by two statuses: `'starting'` (orchestrator reserved) and `'agent-accepted'` (agent acknowledged). This is the two-phase handshake from Workshop #08.

**Note**: There is still no explicit `'pending'` status. Nodes without an entry in `state.json` remain implicitly pending.

### NodeEvent Schema

```typescript
export const EventSourceSchema = z.enum(['agent', 'executor', 'orchestrator', 'human']);
export type EventSource = z.infer<typeof EventSourceSchema>;

export const EventStatusSchema = z.enum(['new', 'acknowledged', 'handled']);
export type EventStatus = z.infer<typeof EventStatusSchema>;

export const NodeEventSchema = z.object({
  event_id: z.string().min(1),
  event_type: z.string().min(1),
  source: EventSourceSchema,
  payload: z.record(z.unknown()),
  status: EventStatusSchema,
  stops_execution: z.boolean(),
  created_at: z.string().datetime(),
  acknowledged_at: z.string().datetime().optional(),
  handled_at: z.string().datetime().optional(),
  handler_notes: z.string().optional(),
});
export type NodeEvent = z.infer<typeof NodeEventSchema>;
```

### Updated NodeStateEntry Schema

```typescript
export const NodeStateEntrySchema = z.object({
  status: NodeExecutionStatusSchema,
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),

  // Plan 028 — RETAINED for backward compatibility during migration
  pending_question_id: z.string().optional(),
  error: NodeStateEntryErrorSchema.optional(),

  // Plan 032 — NEW
  events: z.array(NodeEventSchema).optional(),
});
```

### Updated State Schema

```typescript
export const StateSchema = z.object({
  graph_status: GraphStatusSchema,
  updated_at: z.string().datetime(),
  nodes: z.record(NodeStateEntrySchema).optional(),
  transitions: z.record(TransitionEntrySchema).optional(),

  // Plan 028 — RETAINED for backward compatibility during migration
  questions: z.array(QuestionSchema).optional(),
});
```

**Migration note**: The top-level `questions[]` array and per-node `pending_question_id` / `error` fields are kept during the migration period. Events are the authoritative source; these fields are derived from the event log for backward compatibility. See [Migration Strategy](#migration-strategy) section.

---

## Event ID Generation

Format: `evt_<timestamp_hex>_<random_4hex>`

```typescript
function generateEventId(): string {
  const timestamp = Date.now().toString(16);  // monotonic ordering
  const random = Math.random().toString(16).slice(2, 6);  // collision prevention
  return `evt_${timestamp}_${random}`;
}
```

**Examples:**
```
evt_18d5a3b2c00_a3f1
evt_18d5a3b2c01_7e2d
evt_18d5a3b2c50_0b44
```

**Why this format?**
- `evt_` prefix: human-readable, easily greppable
- Hex timestamp: monotonically increasing = natural ordering in the log
- Random suffix: prevents collision if two events are raised in the same millisecond
- Compare with current question IDs: `2026-02-07T10:02:00.000Z_f4e` — similar pattern, different encoding

---

## Complete Lifecycle Walkthroughs

### Walkthrough 1: Node Acceptance Through Completion (Happy Path)

#### Stage 1: Orchestrator starts the node

The orchestrator calls `startNode()`. Status transitions from implicit-pending to `starting`.

```json
{
  "graph_status": "in_progress",
  "updated_at": "2026-02-07T10:00:00Z",
  "nodes": {
    "spec-builder-c4d": {
      "status": "starting",
      "started_at": "2026-02-07T10:00:00Z",
      "events": []
    }
  }
}
```

**Note**: `events` starts as an empty array. `startNode()` is an orchestrator-internal operation — it does NOT create an event. The orchestrator is reserving the node, not communicating through the event protocol.

#### Stage 2: Agent accepts the node

Agent calls `cg wf node accept <graph> <nodeId>` or `cg wf node event raise <graph> <nodeId> node:accepted '{}'`.

```json
{
  "graph_status": "in_progress",
  "updated_at": "2026-02-07T10:00:05Z",
  "nodes": {
    "spec-builder-c4d": {
      "status": "agent-accepted",
      "started_at": "2026-02-07T10:00:00Z",
      "events": [
        {
          "event_id": "evt_18d5a3b2c00_a3f1",
          "event_type": "node:accepted",
          "source": "agent",
          "payload": {},
          "status": "handled",
          "stops_execution": false,
          "created_at": "2026-02-07T10:00:05Z",
          "handled_at": "2026-02-07T10:00:05Z"
        }
      ]
    }
  }
}
```

**Why `status: "handled"` immediately?** `node:accepted` has no deferred processing. The handler applies the state transition (`starting` -> `agent-accepted`) and the event is fully handled in one step. No intermediate `new` or `acknowledged` state.

#### Stage 3: Agent saves output data

Agent calls `cg wf node event raise <graph> <nodeId> output:save-data '{"name":"language","value":"typescript"}'`.

```json
{
  "graph_status": "in_progress",
  "updated_at": "2026-02-07T10:01:00Z",
  "nodes": {
    "spec-builder-c4d": {
      "status": "agent-accepted",
      "started_at": "2026-02-07T10:00:00Z",
      "events": [
        {
          "event_id": "evt_18d5a3b2c00_a3f1",
          "event_type": "node:accepted",
          "source": "agent",
          "payload": {},
          "status": "handled",
          "stops_execution": false,
          "created_at": "2026-02-07T10:00:05Z",
          "handled_at": "2026-02-07T10:00:05Z"
        },
        {
          "event_id": "evt_18d5a3b5800_7e2d",
          "event_type": "output:save-data",
          "source": "agent",
          "payload": { "name": "language", "value": "typescript" },
          "status": "handled",
          "stops_execution": false,
          "created_at": "2026-02-07T10:01:00Z",
          "handled_at": "2026-02-07T10:01:00Z"
        }
      ]
    }
  }
}
```

**Side effect**: The handler also writes the output to `nodes/spec-builder-c4d/data/data.json`:

```json
{
  "outputs": {
    "language": "typescript"
  }
}
```

**The event log records that it happened; the output file stores the actual data.** Events don't replace the existing output storage — they wrap it with tracking.

#### Stage 4: Agent completes

Agent calls `cg wf node end <graph> <nodeId>`.

```json
{
  "graph_status": "in_progress",
  "updated_at": "2026-02-07T10:05:00Z",
  "nodes": {
    "spec-builder-c4d": {
      "status": "complete",
      "started_at": "2026-02-07T10:00:00Z",
      "completed_at": "2026-02-07T10:05:00Z",
      "events": [
        {
          "event_id": "evt_18d5a3b2c00_a3f1",
          "event_type": "node:accepted",
          "source": "agent",
          "payload": {},
          "status": "handled",
          "stops_execution": false,
          "created_at": "2026-02-07T10:00:05Z",
          "handled_at": "2026-02-07T10:00:05Z"
        },
        {
          "event_id": "evt_18d5a3b5800_7e2d",
          "event_type": "output:save-data",
          "source": "agent",
          "payload": { "name": "language", "value": "typescript" },
          "status": "handled",
          "stops_execution": false,
          "created_at": "2026-02-07T10:01:00Z",
          "handled_at": "2026-02-07T10:01:00Z"
        },
        {
          "event_id": "evt_18d5a3c4600_0b44",
          "event_type": "node:completed",
          "source": "agent",
          "payload": {},
          "status": "handled",
          "stops_execution": true,
          "created_at": "2026-02-07T10:05:00Z",
          "handled_at": "2026-02-07T10:05:00Z"
        }
      ]
    }
  }
}
```

**3 events** tell the complete story: accepted, saved output, completed.

---

### Walkthrough 2: Question/Answer Lifecycle

This walkthrough shows the full Q&A flow with all three event lifecycle states.

#### Stage 1: Agent asks a question

Agent calls `cg wf node event raise <graph> <nodeId> question:ask '{"type":"single","text":"Which framework?","options":["React","Vue","Angular"]}'`.

```json
{
  "nodes": {
    "spec-builder-c4d": {
      "status": "waiting-question",
      "started_at": "2026-02-07T10:00:00Z",
      "pending_question_id": "evt_18d5a3d2000_c1a9",
      "events": [
        {
          "event_id": "evt_18d5a3b2c00_a3f1",
          "event_type": "node:accepted",
          "source": "agent",
          "payload": {},
          "status": "handled",
          "stops_execution": false,
          "created_at": "2026-02-07T10:00:05Z",
          "handled_at": "2026-02-07T10:00:05Z"
        },
        {
          "event_id": "evt_18d5a3d2000_c1a9",
          "event_type": "question:ask",
          "source": "agent",
          "payload": {
            "type": "single",
            "text": "Which framework?",
            "options": ["React", "Vue", "Angular"]
          },
          "status": "new",
          "stops_execution": true,
          "created_at": "2026-02-07T10:02:00Z"
        }
      ]
    }
  },
  "questions": [
    {
      "question_id": "evt_18d5a3d2000_c1a9",
      "node_id": "spec-builder-c4d",
      "type": "single",
      "text": "Which framework?",
      "options": ["React", "Vue", "Angular"],
      "asked_at": "2026-02-07T10:02:00Z"
    }
  ]
}
```

**Three things happen simultaneously:**
1. Node status -> `waiting-question`
2. Event appended with `status: "new"` (nobody has processed it yet)
3. `pending_question_id` set (backward compat)
4. Question added to top-level `questions[]` (backward compat)

The event starts as `"new"` because `question:ask` requires external action — someone needs to surface the question to a user and then answer it.

#### Stage 2: Orchestrator acknowledges (surfaces) the question

ONBAS walks the graph, finds the `new` question:ask event, returns `question-pending`. ODS acknowledges the question.

```json
{
  "event_id": "evt_18d5a3d2000_c1a9",
  "event_type": "question:ask",
  "source": "agent",
  "payload": {
    "type": "single",
    "text": "Which framework?",
    "options": ["React", "Vue", "Angular"]
  },
  "status": "acknowledged",
  "stops_execution": true,
  "created_at": "2026-02-07T10:02:00Z",
  "acknowledged_at": "2026-02-07T10:02:05Z"
}
```

The backward-compat `questions[]` entry also gets updated:

```json
{
  "question_id": "evt_18d5a3d2000_c1a9",
  "node_id": "spec-builder-c4d",
  "type": "single",
  "text": "Which framework?",
  "options": ["React", "Vue", "Angular"],
  "asked_at": "2026-02-07T10:02:00Z",
  "surfaced_at": "2026-02-07T10:02:05Z"
}
```

#### Stage 3: Human answers the question

Human calls `cg wf node event raise <graph> <nodeId> question:answer '{"question_event_id":"evt_18d5a3d2000_c1a9","answer":"React"}' --source human`.

Two events are now relevant — the ask and the answer:

```json
{
  "nodes": {
    "spec-builder-c4d": {
      "status": "waiting-question",
      "started_at": "2026-02-07T10:00:00Z",
      "events": [
        {
          "event_id": "evt_18d5a3b2c00_a3f1",
          "event_type": "node:accepted",
          "source": "agent",
          "payload": {},
          "status": "handled",
          "stops_execution": false,
          "created_at": "2026-02-07T10:00:05Z",
          "handled_at": "2026-02-07T10:00:05Z"
        },
        {
          "event_id": "evt_18d5a3d2000_c1a9",
          "event_type": "question:ask",
          "source": "agent",
          "payload": {
            "type": "single",
            "text": "Which framework?",
            "options": ["React", "Vue", "Angular"]
          },
          "status": "handled",
          "stops_execution": true,
          "created_at": "2026-02-07T10:02:00Z",
          "acknowledged_at": "2026-02-07T10:02:05Z",
          "handled_at": "2026-02-07T10:10:00Z",
          "handler_notes": "Answered by human: React"
        },
        {
          "event_id": "evt_18d5a4a1400_55bc",
          "event_type": "question:answer",
          "source": "human",
          "payload": {
            "question_event_id": "evt_18d5a3d2000_c1a9",
            "answer": "React"
          },
          "status": "handled",
          "stops_execution": false,
          "created_at": "2026-02-07T10:10:00Z",
          "handled_at": "2026-02-07T10:10:00Z"
        }
      ]
    }
  },
  "questions": [
    {
      "question_id": "evt_18d5a3d2000_c1a9",
      "node_id": "spec-builder-c4d",
      "type": "single",
      "text": "Which framework?",
      "options": ["React", "Vue", "Angular"],
      "asked_at": "2026-02-07T10:02:00Z",
      "surfaced_at": "2026-02-07T10:02:05Z",
      "answer": "React",
      "answered_at": "2026-02-07T10:10:00Z"
    }
  ]
}
```

**What happened:**
1. The `question:ask` event transitioned: `new` -> `acknowledged` -> `handled`
2. A new `question:answer` event was appended
3. The `question:ask` event got `handler_notes` recording what happened
4. Backward-compat: `questions[]` entry got `answer` and `answered_at`
5. Node status remains `waiting-question` — ONBAS detects the answer on next walk and issues `resume-node`
6. `pending_question_id` is cleared on the node entry

**Important**: The node status does NOT change when an answer is provided. The answer is stored. ONBAS detects the answered question on its next walk and generates a `resume-node` request. This keeps the event system decoupled from the orchestration loop.

---

### Walkthrough 3: Error Path

#### Agent reports an error

```json
{
  "nodes": {
    "spec-builder-c4d": {
      "status": "blocked-error",
      "started_at": "2026-02-07T10:00:00Z",
      "error": {
        "code": "AGENT_TIMEOUT",
        "message": "Failed to generate spec within time limit",
        "details": { "elapsed_seconds": 300 }
      },
      "events": [
        {
          "event_id": "evt_18d5a3b2c00_a3f1",
          "event_type": "node:accepted",
          "source": "agent",
          "payload": {},
          "status": "handled",
          "stops_execution": false,
          "created_at": "2026-02-07T10:00:05Z",
          "handled_at": "2026-02-07T10:00:05Z"
        },
        {
          "event_id": "evt_18d5a4f6800_e234",
          "event_type": "node:error",
          "source": "agent",
          "payload": {
            "code": "AGENT_TIMEOUT",
            "message": "Failed to generate spec within time limit",
            "details": { "elapsed_seconds": 300 },
            "recoverable": false
          },
          "status": "handled",
          "stops_execution": true,
          "created_at": "2026-02-07T10:05:00Z",
          "handled_at": "2026-02-07T10:05:00Z"
        }
      ]
    }
  }
}
```

**Backward compat**: The `error` field on the node entry is populated from the event payload. The event log is the source of truth; the `error` field is derived.

---

### Walkthrough 4: Progress Updates (Informational Only)

Progress events don't change node status. They're purely informational — the event log is the only place they exist.

```json
{
  "event_id": "evt_18d5a3c0000_3b21",
  "event_type": "progress:update",
  "source": "agent",
  "payload": {
    "message": "Analyzing spec requirements...",
    "percent": 25
  },
  "status": "handled",
  "stops_execution": false,
  "created_at": "2026-02-07T10:00:30Z",
  "handled_at": "2026-02-07T10:00:30Z"
}
```

Progress events go straight from `new` to `handled` — there's nothing to acknowledge or defer.

---

## Event Lifecycle: Which Events Use Which States

Not every event needs all three lifecycle states. This table shows the typical path:

| Event Type | Typical Lifecycle | Why |
|------------|-------------------|-----|
| `node:accepted` | `new` -> `handled` | Immediate: state transition applied on raise |
| `node:completed` | `new` -> `handled` | Immediate: state transition applied on raise |
| `node:error` | `new` -> `handled` | Immediate: error recorded on raise |
| `question:ask` | `new` -> `acknowledged` -> `handled` | Deferred: needs external answer |
| `question:answer` | `new` -> `handled` | Immediate: answer stored on raise |
| `output:save-data` | `new` -> `handled` | Immediate: data persisted on raise |
| `output:save-file` | `new` -> `handled` | Immediate: file copied on raise |
| `progress:update` | `new` -> `handled` | Immediate: logged only, no side effects |

**Rule of thumb**: Only events that require external action (another actor to do something) pass through `acknowledged`. Currently that's just `question:ask` — the orchestrator acknowledges it (surfaces to user), then waits for a human answer.

---

## Migration Strategy

**Approach: Single write path (Option B).** `raiseEvent()` is the only write path for node state changes. No dual-write, no gradual migration. Service methods become thin wrappers.

### Schema change

```typescript
export const NodeStateEntrySchema = z.object({
  status: NodeExecutionStatusSchema,     // updated enum (adds starting, agent-accepted)
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  events: z.array(NodeEventSchema).optional(),   // NEW — the event log

  // Backward-compat: derived from events, kept for consumers that haven't migrated
  pending_question_id: z.string().optional(),
  error: NodeStateEntryErrorSchema.optional(),
});
```

Existing state.json files without `events` parse without error (optional field).

### How it works

1. All service methods (`endNode`, `askQuestion`, `saveOutputData`, etc.) construct an event payload and call `raiseEvent()`
2. `raiseEvent()` validates the event, appends it to the log, and runs the event handler
3. The event handler applies side effects: status transitions, output writes, timestamp updates
4. After the handler runs, derived fields (`pending_question_id`, `error`) are recomputed from the event log
5. State is persisted atomically

There is no dual-write phase. The event system is the implementation from day one. The backward-compat fields are computed projections, not independent state.

### Backward compatibility for consumers

The top-level `questions[]` array and per-node `pending_question_id` / `error` fields remain in the schema as **derived projections**. After each event raise, these are recomputed from the event log:

| Field | Derived From | Logic |
|-------|-------------|-------|
| `pending_question_id` | Latest `question:ask` event without a matching `question:answer` | Set to ask event's `event_id` if unanswered; cleared when answered |
| `error` | Latest `node:error` event | Copy `code`, `message`, `details` from the error event's payload |
| `questions[]` (top-level) | All `question:ask` + `question:answer` event pairs | Reconstructed from events; `surfaced_at` from `acknowledged_at`, `answer` from answer event |

This means existing code that reads `pending_question_id` or `error` continues to work without changes. The projections are computed, not independently written.

The derivation runs after every event raise. It ensures the old fields stay in sync without changing any code that reads them.

---

## File Location and Storage

### Where events are stored

Events live in `state.json` inside the node's state entry:

```
.chainglass/data/workflows/<graph-slug>/
├── graph.yaml           # graph structure (unchanged)
├── state.json           # execution state (events added here)
├── pod-sessions.json    # pod session persistence (unchanged)
└── nodes/
    └── <nodeId>/
        ├── node.yaml    # node config (unchanged)
        └── data/
            ├── data.json    # output values (unchanged)
            └── outputs/     # output files (unchanged)
```

Events do NOT create new files. They are part of `state.json`. Output events (`output:save-data`, `output:save-file`) still write to the existing `data/data.json` and `data/outputs/` locations — the event records that the write happened, the actual data goes where it always went.

### Size considerations

A typical node lifecycle produces 3-8 events. Each event is ~200 bytes. A node with a question cycle might have 5-6 events (~1KB). Even a complex node with multiple questions and outputs would produce fewer than 50 events (~10KB).

The 1000-event-per-node bound is a safety limit, not an expected range. At ~200 bytes per event, 1000 events is ~200KB per node — well within JSON parsing limits.

---

## Validation Rules

### On event raise

1. **Event type exists** in registry (E190 if not)
2. **Payload validates** against registered Zod schema (E191 if not)
3. **Source is allowed** for this event type (E192 if not)
4. **Node is in valid state** for this event type (E193 if not)
5. **Question references valid** for question:answer (E194 if question doesn't exist, E195 if already answered)

### Valid states per event type

| Event Type | Valid Node States |
|------------|-------------------|
| `node:accepted` | `starting` |
| `node:completed` | `agent-accepted` |
| `node:error` | `starting`, `agent-accepted` |
| `question:ask` | `agent-accepted` |
| `question:answer` | `waiting-question` |
| `output:save-data` | `agent-accepted` |
| `output:save-file` | `agent-accepted` |
| `progress:update` | `starting`, `agent-accepted`, `waiting-question` |

**Note**: `progress:update` is the most permissive — agents can report progress even while waiting for a question answer (e.g., "Waiting for your response on framework choice...").

---

## ONBAS Event Log Reading

ONBAS reads the event log to determine sub-state for nodes in `waiting-question`:

```typescript
function determineQuestionSubState(node: NodeReality): 'question-pending' | 'resume-node' | 'skip' {
  const events = node.events ?? [];

  // Find latest question:ask event
  const askEvents = events.filter(e => e.event_type === 'question:ask');
  if (askEvents.length === 0) return 'skip';  // shouldn't happen if status is waiting-question

  const latestAsk = askEvents[askEvents.length - 1];

  // Check if it's been acknowledged yet
  if (latestAsk.status === 'new') {
    return 'question-pending';  // ODS needs to surface this
  }

  // Check if there's a matching answer
  const hasAnswer = events.some(
    e => e.event_type === 'question:answer'
      && e.payload.question_event_id === latestAsk.event_id
  );

  if (hasAnswer) {
    return 'resume-node';  // answer available, agent can resume
  }

  return 'skip';  // acknowledged but not answered — wait for human
}
```

**This replaces** the current pattern of checking `pending_question_id`, `surfaced_at`, and `answer` on the Question object. The event log is richer — it tracks the full lifecycle and can handle multiple questions per node naturally.

---

## Open Questions

### Q1: Should output:save-data events store the full value in the event payload?

**RESOLVED: Yes, for small values. Truncated reference for large values.**

The event payload stores `{ "name": "language", "value": "typescript" }` — the actual value. This provides a complete audit trail without requiring a separate file read.

For very large values (>10KB), the handler should store a reference instead: `{ "name": "large-output", "value": "[stored in data/data.json]", "size_bytes": 50000 }`. The data still goes to `data/data.json` as usual; the event references it.

Implementation: check `JSON.stringify(value).length` before storing. If > 10KB, store a reference. The threshold is configurable but 10KB is a sensible default.

### Q2: Should output:save-file events store the file content?

**RESOLVED: No. Store the path reference only.**

File events store `{ "name": "script", "source_path": "/abs/path/to/source.sh" }`. The actual file is copied to `data/outputs/` by the handler. The event records the operation, not the file contents.

### Q3: Should `startNode()` create an event?

**RESOLVED: No. `startNode()` is an orchestrator-internal operation.**

The orchestrator reserving a node (`pending` -> `starting`) is not an event in the node communication protocol. It's a precondition. Events are for communication between actors (agent, executor, human, orchestrator) and the node. The orchestrator setting up the node is internal bookkeeping.

The first event on every node is `node:accepted` — the agent or executor acknowledging they've received the work.

### Q4: What happens to the events array when a node is reset (if ever)?

**OPEN**: Currently there's no node reset mechanism. If one is added in the future, the events array should be archived (moved to a separate file) rather than deleted, preserving the audit trail.

---

## Summary

| Aspect | Current (Plan 028) | New (Plan 032) |
|--------|-------------------|----------------|
| Node statuses | running, waiting-question, blocked-error, complete | starting, agent-accepted, waiting-question, blocked-error, complete |
| Event storage | None | `events[]` array per node in state.json |
| Question storage | Top-level `questions[]` + per-node `pending_question_id` | Events in node log + backward-compat fields |
| Error storage | Per-node `error` field | Error event in log + backward-compat field |
| Audit trail | Timestamps only (started_at, completed_at) | Full event log with source, lifecycle, payload |
| Output tracking | Side effect only (files written) | Event records write + files still written |
| Who did what | Unknown | `source` field on every event |
