# Workshop: Event System CLI Commands

**Type**: CLI Flow
**Plan**: 032-node-event-system
**Spec**: [node-event-system-spec.md](../node-event-system-spec.md)
**Created**: 2026-02-08
**Status**: Draft

**Related Documents**:
- [Workshop 06: raiseEvent/handleEvents Separation](./06-inline-handlers-and-subscriber-stamps.md) — raiseEvent returns RaiseEventResult, handleEvents processes
- [Workshop 02: Event Schema and Storage](./02-event-schema-and-storage.md) — NodeEvent schema, storage in state.nodes[nodeId].events
- [Workshop 01: Node Event System](./01-node-event-system.md) — Event type definitions, registry

---

## Purpose

Design the CLI command surface for raising, listing, inspecting, and stamping node events. Today the event system has no CLI exposure — raiseEvent is called internally by service methods, and events are invisible to CLI callers. This workshop defines the commands that make events a first-class CLI concept.

**Primary consumers are agents and CLI tools**, not humans. Agents use `--json` to discover unprocessed events, raise new ones, and stamp events they've handled. Other CLI tools (orchestrators, monitoring scripts, CI pipelines) also consume these commands programmatically. The human-readable output exists for debugging, but the JSON contract is the primary interface.

## Key Questions Addressed

- Q1: What does `cg wf node raise-event` look like and what does it return?
- Q2: How do you list all events for a node, and filter/search them?
- Q3: How do you inspect a single event by ID?
- Q4: How does an agent or CLI tool stamp an event it has processed?
- Q5: What is the JSON output contract for each command?
- Q6: Where do these commands live in the existing `cg wf node` namespace?

---

## Command Summary

| Command | Purpose |
|---------|---------|
| `cg wf node raise-event <graph> <nodeId> <eventType>` | Raise an event and return the new event ID |
| `cg wf node events <graph> <nodeId>` | List events for a node (with filters); get single event by `--id` |
| `cg wf node stamp-event <graph> <nodeId> <eventId>` | Stamp an event as processed by a named subscriber |

Three commands. `events` handles both listing and single-event inspection via `--id`. `stamp-event` lets any caller (agent, tool, human) record that it has processed an event and attach metadata.

---

## Command 1: `cg wf node raise-event`

### Syntax

```
cg wf node raise-event <graph> <nodeId> <eventType> [options]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `graph` | Yes | Graph slug |
| `nodeId` | Yes | Target node ID |
| `eventType` | Yes | Event type from registry (e.g., `node:accepted`, `question:ask`) |

### Options

| Option | Description |
|--------|-------------|
| `--payload <json>` | JSON payload for the event (default: `{}`) |
| `--source <source>` | Event source: `agent`, `executor`, `orchestrator`, `human` (default: `agent`) |

### Flow

```
$ cg wf node raise-event my-graph task-1 node:accepted

┌─────────────────────────────────────────────────────────────┐
│ STEP 1: Resolve context + load service                      │
│   • resolveOrOverrideContext()                              │
│   • getPositionalGraphService()                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 2: Parse payload                                       │
│   • JSON.parse(options.payload) or {} if omitted            │
│   • Return E-code if payload is invalid JSON                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 3: Call raiseEvent                                     │
│   • raiseEvent(deps, graph, nodeId, eventType, payload,     │
│     source)                                                 │
│   • Returns RaiseEventResult { ok, event?, errors }         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ STEP 4: Call handleEvents (Workshop 06 pattern)             │
│   • handleEvents(state, nodeId, 'cli', cliHandlers)         │
│   • State transitions applied, event stamped                │
│   • Persist state                                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│ OUTPUT                                                      │
│                                                             │
│ ✓ Event raised on node 'task-1'                             │
│   Event ID: evt_a1b2c3d4                                    │
│   Type: node:accepted                                       │
│   Source: agent                                              │
│   Status: new                                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Console Output (Human-Readable)

```
$ cg wf node raise-event my-graph task-1 node:accepted

✓ Event raised on node 'task-1'
  Event ID: evt_a1b2c3d4
  Type: node:accepted
  Source: agent
  Status: new
```

With payload:

```
$ cg wf node raise-event my-graph task-1 question:ask \
    --payload '{"type":"text","text":"Which API version?"}' \
    --source agent

✓ Event raised on node 'task-1'
  Event ID: evt_e5f6g7h8
  Type: question:ask
  Source: agent
  Status: new
  Stops Execution: true
```

### JSON Output

```
$ cg wf node raise-event my-graph task-1 node:accepted --json

{
  "success": true,
  "command": "wf.node.raise-event",
  "timestamp": "2026-02-08T10:00:00.000Z",
  "data": {
    "node_id": "task-1",
    "event_id": "evt_a1b2c3d4",
    "event_type": "node:accepted",
    "source": "agent",
    "status": "new",
    "stops_execution": false,
    "created_at": "2026-02-08T10:00:00.000Z"
  }
}
```

### Error Cases

```
$ cg wf node raise-event my-graph task-1 not:real

✗ Event raise failed
  E190: Unknown event type 'not:real'
  Action: Use a registered event type. Available: node:accepted, node:completed,
          node:error, question:ask, question:answer, progress:update
```

```
$ cg wf node raise-event my-graph task-1 question:ask --payload '{"type":"text"}'

✗ Event raise failed
  E191: Invalid payload for event type 'question:ask'
  Action: Payload must include required fields. Missing: text
```

```
$ cg wf node raise-event my-graph task-1 node:completed

✗ Event raise failed
  E193: Node 'task-1' is in state 'starting', which is not valid for 'node:completed'
  Action: Node must be in state 'agent-accepted' to raise 'node:completed'
```

---

## Command 2: `cg wf node events`

### Syntax

```
cg wf node events <graph> <nodeId> [options]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `graph` | Yes | Graph slug |
| `nodeId` | Yes | Target node ID |

### Options

| Option | Description |
|--------|-------------|
| `--id <eventId>` | Show a single event by ID (detailed view) |
| `--type <eventType>` | Filter by event type (e.g., `question:ask`) |
| `--status <status>` | Filter by status: `new`, `acknowledged`, `handled` |
| `--source <source>` | Filter by source: `agent`, `executor`, `orchestrator`, `human` |
| `--last <n>` | Show only the last N events (default: all) |

### List All Events (Default)

```
$ cg wf node events my-graph task-1

Events for node 'task-1' (4 events):

  ID               Type              Source   Status   Created
  ─────────────────────────────────────────────────────────────
  evt_a1b2c3d4     node:accepted     human    new      2026-02-08 10:00:00
  evt_e5f6g7h8     question:ask      agent    new      2026-02-08 10:00:05
  evt_i9j0k1l2     question:answer   human    new      2026-02-08 10:15:30
  evt_m3n4o5p6     node:completed    agent    new      2026-02-08 10:16:00
```

### List with Filters

```
$ cg wf node events my-graph task-1 --type question:ask --type question:answer

Events for node 'task-1' (2 of 4 events):

  ID               Type              Source   Status   Created
  ─────────────────────────────────────────────────────────────
  evt_e5f6g7h8     question:ask      agent    new      2026-02-08 10:00:05
  evt_i9j0k1l2     question:answer   human    new      2026-02-08 10:15:30
```

```
$ cg wf node events my-graph task-1 --last 1

Events for node 'task-1' (last 1 of 4 events):

  ID               Type              Source   Status   Created
  ─────────────────────────────────────────────────────────────
  evt_m3n4o5p6     node:completed    agent    new      2026-02-08 10:16:00
```

### Single Event by ID (Detailed View)

```
$ cg wf node events my-graph task-1 --id evt_e5f6g7h8

Event evt_e5f6g7h8:

  Type:            question:ask
  Source:          agent
  Status:          new
  Stops Execution: true
  Created:         2026-02-08T10:00:05.000Z

  Payload:
    type:    text
    text:    Which API version?

  Stamps:
    cli:
      Stamped:  2026-02-08T10:00:05.100Z
      Action:   state-transition
      Data:     { "from": "agent-accepted", "to": "waiting-question" }
```

### Empty Results

```
$ cg wf node events my-graph task-1 --type node:error

No events found for node 'task-1' matching filters (type=node:error)
```

### JSON Output (List)

```
$ cg wf node events my-graph task-1 --json

{
  "success": true,
  "command": "wf.node.events",
  "timestamp": "2026-02-08T10:20:00.000Z",
  "data": {
    "node_id": "task-1",
    "total": 4,
    "showing": 4,
    "events": [
      {
        "event_id": "evt_a1b2c3d4",
        "event_type": "node:accepted",
        "source": "human",
        "status": "new",
        "stops_execution": false,
        "created_at": "2026-02-08T10:00:00.000Z",
        "stamps": {
          "cli": {
            "stamped_at": "2026-02-08T10:00:00.100Z",
            "action": "state-transition",
            "data": { "from": "starting", "to": "agent-accepted" }
          }
        }
      }
    ]
  }
}
```

### JSON Output (Single Event)

```
$ cg wf node events my-graph task-1 --id evt_e5f6g7h8 --json

{
  "success": true,
  "command": "wf.node.events",
  "timestamp": "2026-02-08T10:20:00.000Z",
  "data": {
    "node_id": "task-1",
    "event": {
      "event_id": "evt_e5f6g7h8",
      "event_type": "question:ask",
      "source": "agent",
      "payload": {
        "type": "text",
        "text": "Which API version?"
      },
      "status": "new",
      "stops_execution": true,
      "created_at": "2026-02-08T10:00:05.000Z",
      "stamps": {
        "cli": {
          "stamped_at": "2026-02-08T10:00:05.100Z",
          "action": "state-transition",
          "data": { "from": "agent-accepted", "to": "waiting-question" }
        }
      }
    }
  }
}
```

### Error Cases

```
$ cg wf node events my-graph task-1 --id evt_nonexistent

✗ Event not found
  E196: No event with ID 'evt_nonexistent' on node 'task-1'
  Action: Use 'cg wf node events my-graph task-1' to see available event IDs
```

```
$ cg wf node events my-graph nonexistent-node

✗ Node not found
  E040: Node 'nonexistent-node' not found in graph 'my-graph'
  Action: Use 'cg wf show my-graph' to see available nodes
```

---

## Command 3: `cg wf node stamp-event`

This is the **event mutation command**. Agents and tools use it to record that they've processed an event and to attach metadata about what they did.

### Syntax

```
cg wf node stamp-event <graph> <nodeId> <eventId> [options]
```

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `graph` | Yes | Graph slug |
| `nodeId` | Yes | Target node ID |
| `eventId` | Yes | Event ID to stamp |

### Options

| Option | Description |
|--------|-------------|
| `--subscriber <name>` | Subscriber name (required). Who is stamping: e.g., `my-agent`, `monitor-tool`, `ci-pipeline` |
| `--action <action>` | What the subscriber did (required). Free-form string: e.g., `processed`, `acknowledged`, `forwarded` |
| `--data <json>` | Optional structured metadata (JSON object) |
| `--set-status <status>` | Optionally update event status: `acknowledged` or `handled` |

### Agent Workflow: Discover and Process Events

This is the typical agent workflow — the reason these commands exist:

```bash
# 1. Agent discovers unprocessed events (no stamp from this agent)
EVENTS=$(cg wf node events my-graph task-1 --status new --json)

# 2. Agent parses JSON, finds events it needs to act on
#    (e.g., a question:ask it needs to handle)

# 3. Agent processes the event (does its work)

# 4. Agent stamps the event to record what it did
cg wf node stamp-event my-graph task-1 evt_e5f6g7h8 \
    --subscriber my-agent \
    --action processed \
    --data '{"decision":"forwarded-to-human","queue":"high-priority"}' \
    --json
```

### Console Output

```
$ cg wf node stamp-event my-graph task-1 evt_e5f6g7h8 \
    --subscriber my-agent --action processed

✓ Event 'evt_e5f6g7h8' stamped
  Subscriber: my-agent
  Action: processed
  Event Status: new
```

With metadata and status change:

```
$ cg wf node stamp-event my-graph task-1 evt_e5f6g7h8 \
    --subscriber ods --action orchestration \
    --data '{"next_node":"task-2"}' \
    --set-status handled

✓ Event 'evt_e5f6g7h8' stamped
  Subscriber: ods
  Action: orchestration
  Event Status: handled
  Data: {"next_node":"task-2"}
```

### JSON Output

```
$ cg wf node stamp-event my-graph task-1 evt_e5f6g7h8 \
    --subscriber my-agent --action processed \
    --data '{"decision":"forwarded"}' --json

{
  "success": true,
  "command": "wf.node.stamp-event",
  "timestamp": "2026-02-08T10:30:00.000Z",
  "data": {
    "node_id": "task-1",
    "event_id": "evt_e5f6g7h8",
    "subscriber": "my-agent",
    "stamp": {
      "stamped_at": "2026-02-08T10:30:00.000Z",
      "action": "processed",
      "data": { "decision": "forwarded" }
    },
    "event_status": "new"
  }
}
```

### Error Cases

```
$ cg wf node stamp-event my-graph task-1 evt_nonexistent \
    --subscriber my-agent --action processed

✗ Event not found
  E196: No event with ID 'evt_nonexistent' on node 'task-1'
  Action: Use 'cg wf node events my-graph task-1' to list available event IDs
```

```
$ cg wf node stamp-event my-graph task-1 evt_e5f6g7h8 \
    --subscriber my-agent --action processed --data 'not-json'

✗ Stamp failed
  E197: Invalid JSON data: not-json
  Action: Provide valid JSON with --data
```

### Idempotency

Stamping the same event with the same subscriber overwrites the previous stamp (latest wins, per Workshop 06 Q4). This means agents can re-process and re-stamp without error.

```bash
# First stamp
cg wf node stamp-event my-graph task-1 evt_e5f6g7h8 \
    --subscriber my-agent --action attempt-1

# Re-stamp (overwrites)
cg wf node stamp-event my-graph task-1 evt_e5f6g7h8 \
    --subscriber my-agent --action attempt-2 \
    --data '{"retry_reason":"timeout"}'
```

---

## Agent Integration Patterns

### Pattern 1: Agent Event Discovery Loop

An agent process that polls for new events on its node:

```bash
# Agent gets its node's events, filtered to unprocessed
RESULT=$(cg wf --json node events my-graph task-1 --status new)

# Parse with jq (or equivalent in agent's language)
EVENT_COUNT=$(echo "$RESULT" | jq '.data.showing')

if [ "$EVENT_COUNT" -gt 0 ]; then
  # Process each event
  echo "$RESULT" | jq -c '.data.events[]' | while read EVENT; do
    EVENT_ID=$(echo "$EVENT" | jq -r '.event_id')
    EVENT_TYPE=$(echo "$EVENT" | jq -r '.event_type')

    # Agent-specific handling
    case "$EVENT_TYPE" in
      "question:ask")
        # Agent processes the question
        ANSWER="v2"
        cg wf node answer my-graph task-1 "$EVENT_ID" "$ANSWER" --json
        ;;
      *)
        # Agent stamps it as acknowledged
        cg wf node stamp-event my-graph task-1 "$EVENT_ID" \
            --subscriber my-agent --action acknowledged --json
        ;;
    esac
  done
fi
```

### Pattern 2: External Tool Monitoring

A CI/CD tool or monitoring script that checks for error events:

```bash
# Check for error events across the node
ERRORS=$(cg wf --json node events my-graph task-1 --type node:error)

ERROR_COUNT=$(echo "$ERRORS" | jq '.data.showing')
if [ "$ERROR_COUNT" -gt 0 ]; then
  # Extract error details
  echo "$ERRORS" | jq -c '.data.events[]' | while read EVENT; do
    EVENT_ID=$(echo "$EVENT" | jq -r '.event_id')
    CODE=$(echo "$EVENT" | jq -r '.payload.code')
    MSG=$(echo "$EVENT" | jq -r '.payload.message')

    # Log and stamp
    echo "Error $CODE on task-1: $MSG"
    cg wf node stamp-event my-graph task-1 "$EVENT_ID" \
        --subscriber ci-monitor --action logged \
        --data "{\"logged_to\":\"datadog\",\"alert_id\":\"ALT-123\"}" --json
  done
fi
```

### Pattern 3: Raise + Read Back (Agent Lifecycle)

An agent raises an event and immediately reads back the result:

```bash
# Raise event and capture the event ID
RESULT=$(cg wf --json node raise-event my-graph task-1 node:accepted --source agent)
EVENT_ID=$(echo "$RESULT" | jq -r '.data.eventId')

# Later: verify the event was processed
EVENT=$(cg wf --json node events my-graph task-1 --id "$EVENT_ID")
STATUS=$(echo "$EVENT" | jq -r '.data.event.status')
STAMPS=$(echo "$EVENT" | jq '.data.event.stamps')
echo "Event $EVENT_ID: status=$STATUS, stamps=$STAMPS"
```

---

## Error Codes

| Code | Message | Cause |
|------|---------|-------|
| E190 | Unknown event type | Event type not in registry |
| E191 | Invalid payload | Payload fails Zod validation for event type |
| E192 | Source not allowed | Event source not in allowedSources for this type |
| E193 | Invalid state transition | Node not in VALID_FROM_STATES for this event type |
| E194 | Question not found | question:answer references nonexistent ask event |
| E195 | Already answered | question:answer for an already-answered question |
| E196 | Event not found | --id references nonexistent event (new code for CLI) |
| E197 | Invalid payload JSON | --payload is not valid JSON (new code for CLI) |

E190-E195 already exist in the event system. E196-E198 are new for CLI.

---

## Implementation Notes

### Handler Pattern

Both commands follow the existing `cg wf node` handler pattern:

```typescript
async function handleNodeRaiseEvent(
  graphSlug: string,
  nodeId: string,
  eventType: string,
  options: RaiseEventOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.raise-event', result));
    process.exit(1);
  }

  // Parse payload
  let payload: Record<string, unknown> = {};
  if (options.payload) {
    try {
      payload = JSON.parse(options.payload);
    } catch {
      const result = {
        errors: [{ code: 'E197', message: `Invalid JSON payload: ${options.payload}`, action: 'Provide valid JSON with --payload' }],
      };
      console.log(adapter.format('wf.node.raise-event', result));
      process.exit(1);
    }
  }

  const source = options.source ?? 'agent';
  const service = getPositionalGraphService();

  // raiseEvent (recording only — no state mutation)
  const result = await service.raiseEvent(ctx, graphSlug, nodeId, eventType, payload, source);
  if (!result.ok) {
    console.log(adapter.format('wf.node.raise-event', { errors: result.errors }));
    process.exit(1);
  }

  // handleEvents (processing — Workshop 06 pattern)
  // CLI layer calls handleEvents, NOT the service layer.
  // This runs registered handlers and writes automatic 'cli' stamps.
  const state = await loadState(ctx, graphSlug);
  handleEvents(state, nodeId, 'cli', cliHandlers);
  await persistState(ctx, graphSlug, state);

  console.log(adapter.format('wf.node.raise-event', {
    node_id: nodeId,
    event_id: result.event!.event_id,
    event_type: result.event!.event_type,
    source: result.event!.source,
    status: result.event!.status,
    stops_execution: result.event!.stops_execution,
    created_at: result.event!.created_at,
    errors: [],
  }));
}
```

### Events List/Get Handler

```typescript
async function handleNodeEvents(
  graphSlug: string,
  nodeId: string,
  options: EventsOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.events', result));
    process.exit(1);
  }

  const service = getPositionalGraphService();
  // Service method loads state and reads node.events[]
  const result = await service.getNodeEvents(ctx, graphSlug, nodeId, {
    id: options.id,
    type: options.type,
    status: options.status,
    source: options.source,
    last: options.last,
  });

  console.log(adapter.format('wf.node.events', result));
  if (result.errors.length > 0) process.exit(1);
}
```

### Stamp Event Handler

```typescript
async function handleNodeStampEvent(
  graphSlug: string,
  nodeId: string,
  eventId: string,
  options: StampEventOptions
): Promise<void> {
  const adapter = createOutputAdapter(options.json ?? false);

  const ctx = await resolveOrOverrideContext(options.workspacePath);
  if (!ctx) {
    const result = { errors: noContextError(options.workspacePath) };
    console.log(adapter.format('wf.node.stamp-event', result));
    process.exit(1);
  }

  // Parse optional data
  let data: Record<string, unknown> | undefined;
  if (options.data) {
    try {
      data = JSON.parse(options.data);
    } catch {
      const result = {
        errors: [{ code: 'E197', message: `Invalid JSON data: ${options.data}`, action: 'Provide valid JSON with --data' }],
      };
      console.log(adapter.format('wf.node.stamp-event', result));
      process.exit(1);
    }
  }

  const service = getPositionalGraphService();
  const result = await service.stampNodeEvent(ctx, graphSlug, nodeId, eventId, {
    subscriber: options.subscriber,
    action: options.action,
    data,
    setStatus: options.setStatus,
  });

  console.log(adapter.format('wf.node.stamp-event', result));
  if (result.errors.length > 0) process.exit(1);
}
```

### Service Method Signatures

Two new service methods needed:

```typescript
// On IPositionalGraphService

// List/get events (for `events` command)
getNodeEvents(
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string,
  filters?: {
    id?: string;
    type?: string | string[];
    status?: string;
    source?: string;
    last?: number;
  }
): Promise<GetNodeEventsResult>;

// Stamp an event (for `stamp-event` command)
stampNodeEvent(
  ctx: WorkspaceContext,
  graphSlug: string,
  nodeId: string,
  eventId: string,
  stamp: {
    subscriber: string;
    action: string;
    data?: Record<string, unknown>;
    setStatus?: 'acknowledged' | 'handled';
  }
): Promise<StampNodeEventResult>;

interface GetNodeEventsResult extends BaseResult {
  node_id?: string;
  total?: number;
  showing?: number;
  events?: NodeEvent[];
  event?: NodeEvent;  // populated when --id is used
}

interface StampNodeEventResult extends BaseResult {
  node_id?: string;
  event_id?: string;
  subscriber?: string;
  stamp?: EventStamp;
  event_status?: string;
}
```

The `raise-event` command calls `raiseEvent()` directly (already exists), so it just needs exposure via the service interface.

### `stampNodeEvent` Internals

The service method `stampNodeEvent()` is orchestration around Workshop 06's low-level `stampEvent()` helper:

```typescript
async stampNodeEvent(ctx, graphSlug, nodeId, eventId, stamp): Promise<StampNodeEventResult> {
  const state = await this.loadState(ctx, graphSlug);
  const event = findEvent(state, nodeId, eventId);  // E196 if not found

  // Use Workshop 06's stampEvent helper for the actual mutation
  stampEvent(event, stamp.subscriber, stamp.action, stamp.data);

  // Optionally update event status + corresponding timestamp
  if (stamp.setStatus === 'acknowledged') {
    event.status = 'acknowledged';
    event.acknowledged_at = new Date().toISOString();
  } else if (stamp.setStatus === 'handled') {
    event.status = 'handled';
    event.handled_at = new Date().toISOString();
  }

  await this.persistState(ctx, graphSlug, state);
  return { node_id: nodeId, event_id: eventId, subscriber: stamp.subscriber, ... };
}
```

Key: `--set-status acknowledged` sets `event.acknowledged_at`, and `--set-status handled` sets `event.handled_at`. The status field and its corresponding timestamp always move together.

### Command Registration

```typescript
// In registerPositionalGraphCommands, under the node group:

node
  .command('raise-event <graph> <nodeId> <eventType>')
  .description('Raise an event on a node. Returns the new event ID.')
  .option('--payload <json>', 'JSON payload for the event', '{}')
  .option('--source <source>', 'Event source (agent|executor|orchestrator|human)', 'agent')
  .action(
    wrapAction(async (graph, nodeId, eventType, localOpts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {};
      await handleNodeRaiseEvent(graph, nodeId, eventType, {
        payload: localOpts.payload,
        source: localOpts.source,
        json: parentOpts.json,
        workspacePath: parentOpts.workspacePath,
      });
    })
  );

node
  .command('events <graph> <nodeId>')
  .description('List events for a node. Use --id to inspect a single event.')
  .option('--id <eventId>', 'Show a single event by ID')
  .option('--type <eventType...>', 'Filter by event type')
  .option('--status <status>', 'Filter by status (new|acknowledged|handled)')
  .option('--source <source>', 'Filter by source (agent|executor|orchestrator|human)')
  .option('--last <n>', 'Show only the last N events')
  .action(
    wrapAction(async (graph, nodeId, localOpts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {};
      await handleNodeEvents(graph, nodeId, {
        id: localOpts.id,
        type: localOpts.type,
        status: localOpts.status,
        source: localOpts.source,
        last: localOpts.last ? parseInt(localOpts.last, 10) : undefined,
        json: parentOpts.json,
        workspacePath: parentOpts.workspacePath,
      });
    })
  );

node
  .command('stamp-event <graph> <nodeId> <eventId>')
  .description('Stamp an event as processed by a subscriber. Attach metadata about what was done.')
  .requiredOption('--subscriber <name>', 'Subscriber name (who is stamping)')
  .requiredOption('--action <action>', 'What the subscriber did')
  .option('--data <json>', 'Structured metadata (JSON object)')
  .option('--set-status <status>', 'Update event status (acknowledged|handled)')
  .action(
    wrapAction(async (graph, nodeId, eventId, localOpts, cmd) => {
      const parentOpts = cmd.parent?.parent?.opts() ?? {};
      await handleNodeStampEvent(graph, nodeId, eventId, {
        subscriber: localOpts.subscriber,
        action: localOpts.action,
        data: localOpts.data,
        setStatus: localOpts.setStatus,
        json: parentOpts.json,
        workspacePath: parentOpts.workspacePath,
      });
    })
  );
```

---

## Two Stamping Paths

There are two distinct ways stamps get written to events. Understanding the difference is critical for agents and tools:

### Path 1: Automatic Stamps (from `handleEvents`)

When any `wf` CLI command runs, the CLI layer calls `handleEvents(state, nodeId, 'cli', cliHandlers)` (Workshop 06). This scans the node's events, runs registered handlers (state transitions), and **automatically stamps each processed event** with subscriber `'cli'`.

These stamps record what the CLI's built-in handlers did — state transitions, error writes, question tracking. The agent doesn't control them; they happen as a side effect of every CLI command.

```
Agent calls: cg wf node raise-event my-graph task-1 node:accepted --json
Internally:
  1. raiseEvent() creates event (status: 'new', no stamps)
  2. handleEvents('cli') runs handler: node.status = 'agent-accepted'
  3. handleEvents('cli') writes automatic stamp:
     stamps.cli = { action: 'state-transition', data: { from: 'starting', to: 'agent-accepted' } }
  4. State persisted
```

### Path 2: Manual Stamps (from `stamp-event` command)

An agent or tool explicitly calls `stamp-event` to record what **it** did with an event. This is independent of `handleEvents` — it just writes a stamp with the caller's chosen subscriber name, action, and data.

```
Agent calls: cg wf node stamp-event my-graph task-1 evt_a1b2c3d4 \
    --subscriber my-agent --action forwarded-to-slack \
    --data '{"channel":"#alerts"}' --json
Internally:
  1. Load state, find event evt_a1b2c3d4
  2. Write stamp: stamps['my-agent'] = { action: 'forwarded-to-slack', data: {...} }
  3. State persisted
```

### Both Coexist on the Same Event

A single event can have both automatic and manual stamps. They serve different purposes and use different subscriber keys:

```json
{
  "event_id": "evt_a1b2c3d4",
  "event_type": "node:accepted",
  "status": "new",
  "stamps": {
    "cli": {
      "stamped_at": "2026-02-08T10:00:00.100Z",
      "action": "state-transition",
      "data": { "from": "starting", "to": "agent-accepted" }
    },
    "my-agent": {
      "stamped_at": "2026-02-08T10:00:01.000Z",
      "action": "forwarded-to-slack",
      "data": { "channel": "#alerts" }
    },
    "ods": {
      "stamped_at": "2026-02-08T10:05:00.000Z",
      "action": "orchestration",
      "data": { "domain_event": "node:accepted" }
    }
  }
}
```

### Skip Logic: Stamps, Not Status

ODS (and any subscriber using `handleEvents`) skips events based on **stamp presence**, not `event.status`. From Workshop 06's `handleEvents`:

```typescript
if (event.stamps?.[subscriber]) continue;  // skip if this subscriber already stamped
```

This means:
- An external tool can set `--set-status handled` without interfering with ODS processing (ODS checks `stamps.ods`, not `status`)
- Multiple subscribers process independently — each only cares about its own stamp key

---

## Design Decisions

### D1: Two Commands, Not Three

Considered separate `events list` and `events get` commands. Rejected because:
- The existing pattern uses `--id` for single-item retrieval within a list command (keeps the namespace flat)
- `cg wf node events my-graph task-1` for listing, `cg wf node events my-graph task-1 --id evt_xxx` for detail
- One service method with optional `id` filter handles both

### D2: `raise-event`, Not `raise` or `emit`

- `raise-event` matches the internal function name (`raiseEvent`)
- `raise` alone is ambiguous (raise what?)
- `emit` implies fire-and-forget pub/sub semantics, which isn't quite right

### D3: `events`, Not `event list`

- Follows the existing pattern: `cg wf node ask` (not `cg wf node question ask`)
- Pluralized noun for the list command matches convention: `cg wf list`, `cg wf unit list`
- Could have been `event-log` but `events` is shorter and clear

### D4: Default Source Is `agent`

The primary consumers of `raise-event` are agents calling via `--json`. Default `agent` matches the most common use case. Humans and tools can override with `--source human` or `--source orchestrator`.

### D5: `--type` Accepts Multiple Values

Commander.js supports variadic options (`<eventType...>`), so `--type question:ask --type question:answer` works naturally. This filters by union (show events matching ANY specified type).

### D6: List View vs Detail View

The list view shows columns: ID, Type, Source, Status, Created. No payload — too wide for a table, and the JSON output includes everything anyway.
The detail view (`--id`) shows everything: payload, stamps, all timestamps.
Agents always use `--json`, which includes full event data in both modes.

### D7: `stamp-event` Is Separate from `raise-event`

Raising and stamping are distinct operations:
- `raise-event` creates a new event (append to log)
- `stamp-event` mutates an existing event (add/update a stamp)

They could be one command with modes, but separate commands are clearer for both humans and agents. An agent's workflow is: `events --json` to discover, then `stamp-event --json` to record processing.

### D8: `--subscriber` Is Required, Free-Form

The subscriber name is required because a stamp without attribution is useless. It's free-form (any string) so agents, tools, and scripts can identify themselves without registry overhead. Convention: use kebab-case descriptive names (`my-agent`, `ci-monitor`, `ods`).

### D9: `--set-status` Is Optional on stamp-event

Most stampers don't change event status — they just record what they did. Only the "closer" (typically ODS, per Workshop 06) sets status to `handled`. The `--set-status` flag is opt-in so agents can participate in the stamp model without needing to understand the full event lifecycle.

---

## Relationship to Existing Commands

The event CLI commands don't replace existing lifecycle/Q&A commands. They coexist:

| Existing Command | What It Does | Event System Relationship |
|------------------|-------------|--------------------------|
| `cg wf node start` | Starts node execution | Internally raises `node:accepted` (after Phase 5 wrappers) |
| `cg wf node end` | Completes node | Internally raises `node:completed` |
| `cg wf node ask` | Asks question | Internally raises `question:ask` |
| `cg wf node answer` | Answers question | Internally raises `question:answer` |
| **`cg wf node raise-event`** | **Raises any event directly** | **Direct access to raiseEvent** |
| **`cg wf node events`** | **Lists/inspects events** | **Reads node.events[]** |
| **`cg wf node stamp-event`** | **Stamps an event as processed** | **Writes subscriber stamp + optional status** |

The existing commands (`start`, `end`, `ask`, `answer`) are ergonomic wrappers with validation and result mapping. The new event commands are the lower-level primitives — they give agents and tools direct access to the event system:

- **`raise-event`**: Raise `progress:update` events (no dedicated command), raise custom event types (future registry extensions), test/debug the event pipeline, agent-driven event injection
- **`events`**: Discover unprocessed events, check event status and stamps, monitor event lifecycle
- **`stamp-event`**: Record what an agent/tool did with an event, attach processing metadata, optionally finalize event status

---

## Open Questions

### Q1: Should raise-event call handleEvents?

**RESOLVED**: Yes. Per Workshop 06, every `wf` CLI command that knows the target node calls handleEvents. raise-event is no exception. The CLI handler calls raiseEvent, then handleEvents, then persists. This ensures state transitions happen immediately.

### Q2: Should events show stamps by default in list view?

**RESOLVED**: No. The list view is a summary table — adding stamps makes it too wide. Stamps are shown in the detail view (`--id`). Agents always use `--json`, which includes full stamp data in both list and detail modes.

### Q3: Do we need an `--all-nodes` flag for events?

**OPEN**: Currently `events` is node-scoped (you must specify `nodeId`). A graph-wide event view could be useful for debugging but adds complexity. Defer unless requested.

### Q4: Should `events` filter by "no stamp from subscriber X"?

**OPEN**: An agent might want `--not-stamped-by my-agent` to find events it hasn't processed. Currently agents must use `--json`, parse the full list, and filter client-side. This could be a future convenience flag if the pattern proves common.

---

## Quick Reference

```bash
# ── Raise Events ──────────────────────────────────────────
cg wf node raise-event my-graph task-1 node:accepted --json
cg wf node raise-event my-graph task-1 question:ask \
    --payload '{"type":"text","text":"Which API?"}' --json
cg wf node raise-event my-graph task-1 progress:update \
    --payload '{"message":"50% done","percent":50}' --json
cg wf node raise-event my-graph task-1 node:error \
    --payload '{"code":"TIMEOUT","message":"Agent timed out"}' --json

# ── List Events ───────────────────────────────────────────
cg wf node events my-graph task-1 --json
cg wf node events my-graph task-1 --type question:ask --json
cg wf node events my-graph task-1 --status new --json
cg wf node events my-graph task-1 --last 3 --json

# ── Get Single Event ──────────────────────────────────────
cg wf node events my-graph task-1 --id evt_a1b2c3d4 --json

# ── Stamp Events ──────────────────────────────────────────
cg wf node stamp-event my-graph task-1 evt_a1b2c3d4 \
    --subscriber my-agent --action processed --json
cg wf node stamp-event my-graph task-1 evt_a1b2c3d4 \
    --subscriber ods --action orchestration \
    --data '{"next_node":"task-2"}' --set-status handled --json

# ── Human-readable (debugging) ────────────────────────────
cg wf node events my-graph task-1
cg wf node events my-graph task-1 --id evt_a1b2c3d4
cg wf node raise-event my-graph task-1 node:accepted --source human
```
