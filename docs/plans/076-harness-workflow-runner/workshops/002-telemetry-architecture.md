# Workshop: Telemetry Architecture

**Type**: Integration Pattern
**Plan**: 076-harness-workflow-runner
**Spec**: [harness-workflow-runner-spec.md](../harness-workflow-runner-spec.md)
**Created**: 2026-03-16
**Status**: Draft

**Related Documents**:
- [Workshop 001 — Harness Workflow Experience](001-harness-workflow-experience.md)
- [Research Dossier](../research-dossier.md)
- [ADR-0010 — Central Domain Event Notification](../../../docs/adr/adr-0010-central-domain-event-notification-architecture.md)

**Domain Context**:
- **Primary Domain**: _(harness — external tooling, per ADR-0014)_
- **Related Domains**: `_platform/positional-graph` (DriveEvent source), `_platform/events` (SSE transport), `_platform/state` (GlobalState sink)

---

## Purpose

Define how the harness observes orchestration execution in real time. The core tension: the harness is external tooling (no monorepo imports, CLI subprocess only), but the richest telemetry lives inside the process running the orchestration engine. This workshop resolves that tension by mapping all observable surfaces and choosing the right combination for each harness command.

## Key Questions Addressed

- How does telemetry flow from the orchestration engine to an external observer?
- What can the harness see without breaking ADR-0014 isolation?
- What's the minimum viable telemetry for each progressive disclosure level?
- Should the harness connect to SSE, poll CLI status, read disk state, or some combination?

---

## The Telemetry Pipeline (As Built)

The orchestration engine already emits rich telemetry — the question is where to tap in.

```
┌─────────────────────────────────────────────────────────────────┐
│ Orchestration Engine (positional-graph)                          │
│                                                                  │
│  GraphOrchestration.drive()                                      │
│    │                                                             │
│    ├─ onEvent(DriveEvent)  ←── 4 types: iteration|idle|status|error
│    │    │                                                        │
│    │    │  DriveEvent.data = OrchestrationRunResult               │
│    │    │    .actions[] — what ONBAS decided, what ODS did        │
│    │    │    .finalReality — full graph snapshot                  │
│    │    │    .stopReason — why this iteration ended               │
│    │    │                                                        │
│    ├─ podManager.persistSessions()  ←── pod-sessions.json        │
│    │                                                             │
│    └─ graphService.persistGraphState()  ←── graph state on disk  │
│                                                                  │
└──────────┬───────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│ WorkflowExecutionManager (web server process)                    │
│                                                                  │
│  handleEvent(DriveEvent)                                         │
│    │                                                             │
│    ├─ Updates internal execution state                           │
│    ├─ broadcastStatus() → ICentralEventNotifier                  │
│    │    channel: 'workflow-execution'                            │
│    │    event: 'execution-update'                                │
│    │    data: { status, iterations, lastEventType, lastMessage } │
│    │                                                             │
│    └─ Debounced registry persistence (10 iters or 30s)           │
│                                                                  │
└──────────┬───────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│ SSE Mux Endpoint (/api/events/mux)                               │
│                                                                  │
│  GET /api/events/mux?channels=workflow-execution                 │
│    │                                                             │
│    ├─ Returns text/event-stream                                  │
│    ├─ 15-second heartbeat                                        │
│    ├─ Up to 20 channels per connection                           │
│    └─ Requires authentication (401 without it)                   │
│                                                                  │
└──────────┬───────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────────────┐
│ Browser (GlobalState)                                            │
│                                                                  │
│  ServerEventRoute maps SSE → GlobalState paths:                  │
│    workflow-execution:{key}:status      → ManagerExecutionStatus │
│    workflow-execution:{key}:iterations  → number                 │
│    workflow-execution:{key}:lastEventType → string               │
│    workflow-execution:{key}:lastMessage   → string               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Observable Surfaces

The harness can observe execution through **5 different surfaces**, each with different fidelity, latency, and isolation tradeoffs:

| Surface | What It Shows | Fidelity | Latency | Isolation | Auth Required |
|---------|--------------|----------|---------|-----------|---------------|
| **1. CG CLI stdout** | `cg wf run --verbose` prints DriveEvents | Medium | Real-time | Full (subprocess) | No |
| **2. CG CLI status** | `cg wf show --detailed` reads graph state | High | On-demand | Full (subprocess) | No |
| **3. SSE endpoint** | `/api/events/mux?channels=workflow-execution` | Medium | ~instant | Full (HTTP) | Yes (DISABLE_AUTH) |
| **4. Disk state files** | pod-sessions.json, graph-state, events.jsonl | High | ~2s (filesystem latency) | Full (file read) | No |
| **5. Server stderr** | `[ODS] Pod execution failed` log lines | Low | Real-time | Requires process access | No |

### Surface 1: CG CLI stdout (subprocess capture)

```bash
$ cg wf run test-workflow --verbose --json 2>&1
```

**What you get**: Every DriveEvent printed by `cli-drive-handler.ts`:
- `[status]` — graph summary per iteration
- `[iteration]` — action count + what ONBAS decided
- `[idle]` — polling, no actions available
- `[error]` — error message + optional error object

**Limitations**: Must parse CLI stdout. Events are formatted text, not raw JSON. Process blocks until workflow completes (or is killed). Pod failures logged to stderr separately.

**Best for**: `harness workflow run` — capture everything from a single subprocess.

### Surface 2: CG CLI status (on-demand polling)

```bash
$ cg wf show test-workflow --detailed --json
```

**What you get**: Current graph state snapshot via `getStatus()` + `loadGraphState()`:
- Per-node status (ready, starting, running, complete, error)
- Timing (startedAt, completedAt)
- Pod session IDs
- Pending questions
- Line-by-line progress

**Limitations**: Point-in-time snapshot, not live stream. Must poll repeatedly. Each call is a subprocess spawn (~100ms overhead).

**Best for**: `harness workflow status` — answer "where is it stuck?" on demand.

### Surface 3: SSE endpoint (live stream)

```bash
$ curl -N "http://localhost:3000/api/events/mux?channels=workflow-execution" \
    -H "Cookie: authjs.session-token=..."
```

**What you get**: Real-time SSE events:
```
data: {"channel":"workflow-execution","type":"execution-update","data":{"status":"running","iterations":5,"lastEventType":"iteration","lastMessage":"1 action(s) taken"}}
```

**Limitations**: Requires authentication (use DISABLE_AUTH=true in dev). Only shows execution-level status (running/stopped/complete), not per-node detail. Needs HTTP connection management.

**Best for**: Live monitoring in `harness workflow run --verbose` mode as a secondary channel.

### Surface 4: Disk state files (direct read)

```bash
# Pod sessions
$ cat .chainglass/data/workflows/test-workflow/pod-sessions.json

# Graph state (via graphService internal path)
$ cat .chainglass/data/workflows/test-workflow/state.json

# Node events
$ cat .chainglass/data/workflows/test-workflow/events.jsonl
```

**What you get**: Raw state exactly as the engine persists it.

**Limitations**: File paths are internal implementation details (could change). Filesystem watcher latency ~2s. Must know the workspace path. Not all state is persisted immediately (debouncing).

**Best for**: Post-mortem forensics. `harness workflow logs` can read event files after execution.

### Surface 5: Server stderr (process logs)

```
[ODS] Pod execution failed for coder-5ec: ENOENT: no such file or directory
```

**What you get**: Unstructured log messages from console.error calls in ODS, PodManager, etc.

**Limitations**: Unstructured text. Only visible if you have access to the server process's stderr. Not available via CLI subprocess or REST API.

**Best for**: Debugging fire-and-forget pod failures. The harness would need to either capture the dev server's output or redirect it to a file.

---

## Recommended Architecture

### Per-Command Telemetry Sources

```
┌────────────────────────────────────────────────────────────────┐
│ harness workflow run                                            │
│                                                                 │
│  PRIMARY:  Surface 1 — CG CLI subprocess (cg wf run --verbose) │
│  BONUS:    Surface 5 — Server stderr capture (if accessible)    │
│  RESULT:   Surface 2 — CG CLI status (cg wf show --detailed)   │
│                                                                 │
│  Flow:                                                          │
│    1. Ensure test data exists (auto-reset if missing)           │
│    2. Spawn `cg wf run test-workflow --verbose --json`          │
│    3. Stream stdout → parse DriveEvents → accumulate telemetry  │
│    4. On exit: call `cg wf show --detailed` for final snapshot  │
│    5. Run assertions against snapshot                           │
│    6. Return HarnessEnvelope with summary + events              │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ harness workflow status                                         │
│                                                                 │
│  PRIMARY:  Surface 2 — CG CLI status (cg wf show --detailed)   │
│                                                                 │
│  Flow:                                                          │
│    1. Call `cg wf show test-workflow --detailed --json`          │
│    2. Parse response into node-level status table               │
│    3. Return HarnessEnvelope with structured status             │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ harness workflow logs                                           │
│                                                                 │
│  PRIMARY:  Surface 4 — Disk state files (events.jsonl)          │
│  BONUS:    Accumulated DriveEvents from last run (if cached)    │
│                                                                 │
│  Flow:                                                          │
│    1. Read .chainglass/data/workflows/{slug}/events.jsonl       │
│    2. Read pod-sessions.json for session mapping                │
│    3. Optionally filter by --node or --errors                   │
│    4. Return HarnessEnvelope with event timeline                │
└────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────┐
│ harness workflow reset                                          │
│                                                                 │
│  No telemetry needed — pure data lifecycle command.             │
│  Delegates to existing test-data clean + create env.            │
└────────────────────────────────────────────────────────────────┘
```

### Why This Architecture

**Decision: CLI subprocess capture as primary telemetry source.**

Rationale:
- Maintains harness isolation per ADR-0014 (no monorepo imports)
- `cg wf run --verbose` already prints DriveEvents — we just parse them
- The CG CLI is the product — if its output is wrong, we want to know
- No auth tokens needed for CLI calls
- Process lifecycle is clean: spawn → capture → wait → done

**Decision: SSE is NOT the primary source (but could be secondary).**

Rationale:
- SSE requires authentication (adds complexity)
- SSE only shows execution-level status, not per-node detail
- SSE is designed for browser clients, not CLI tools
- CLI subprocess gives us everything SSE gives plus more

**Decision: Disk state files for post-mortem forensics only.**

Rationale:
- Direct file access works but couples to internal paths
- Files may not be fully written during execution (debouncing)
- Great for `workflow logs` after the run completes
- Not suitable for real-time observation

---

## DriveEvent Parsing Contract

The harness needs to parse CG CLI verbose output into structured telemetry. Here's what `cli-drive-handler.ts` currently prints:

```typescript
// cli-drive-handler.ts lines 42-65
switch (event.type) {
  case 'status':
    console.log(event.message);      // Always printed
    break;
  case 'iteration':
    if (verbose) console.log(`[iteration] ${event.message}`);
    break;
  case 'idle':
    if (verbose) console.log(`[idle] ${event.message}`);
    break;
  case 'error':
    console.error(`[error] ${event.message}`);
    if (event.error) console.error(event.error);
    break;
}
```

### Option A: Parse text output (fragile)

```
[status] Graph: 4 nodes, 2 complete, 1 running
[iteration] 1 action(s) taken
[idle] Polling for changes...
[error] Pod execution failed: ENOENT
```

Problem: Text format may change. Hard to extract structured data.

### Option B: Add `--json-events` flag to CG CLI (recommended)

```bash
$ cg wf run test-workflow --json-events
```

Each DriveEvent printed as a single JSON line (NDJSON):
```json
{"type":"status","message":"Graph: 4 nodes, 0 complete","timestamp":"2026-03-16T09:00:01Z"}
{"type":"iteration","message":"1 action(s) taken","data":{"actions":[{"type":"start-node","nodeId":"spec-builder-fa0"}],"stopReason":"actions-taken","iterations":1}}
{"type":"idle","message":"Polling for changes...","timestamp":"2026-03-16T09:00:05Z"}
```

**Why Option B**: NDJSON is trivially parseable. Each line is a complete JSON object. The harness reads line by line from stdout, parses each, and accumulates telemetry. No regex. No fragile text parsing. Aligns with the existing pattern (agent runner uses NDJSON for events.ndjson).

### Implementation

Add to `cli-drive-handler.ts`:

```typescript
if (options.jsonEvents) {
  // NDJSON mode: one JSON object per line
  const entry = {
    type: event.type,
    message: event.message,
    timestamp: new Date().toISOString(),
    ...(event.type === 'iteration' ? { data: event.data } : {}),
    ...(event.type === 'error' && event.error ? { error: String(event.error) } : {}),
  };
  console.log(JSON.stringify(entry));
} else {
  // Existing text output (unchanged)
}
```

---

## Fire-and-Forget Pod Failure Observability

**The Problem**: ODS calls `pod.execute()` without awaiting. Errors go to `.catch()` which only calls `console.error()`. No event is emitted. The harness can't see pod failures through any telemetry surface except server stderr.

**Current code** (`ods.ts:136-155`):
```typescript
// Fire and forget — DO NOT await
pod.execute({ inputs, ctx, graphSlug })
  .then(async () => {
    const sid = pod.sessionId;
    if (sid) {
      this.deps.podManager.setSessionId(nodeId, sid);
      await this.deps.podManager.persistSessions(ctx, graphSlug);
    }
  })
  .catch((err) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ODS] Pod execution failed for ${nodeId}: ${msg}`);
  });
```

**Impact**: This is the #1 observability gap. When pods fail, the graph stalls at "starting" with no visible error in any structured telemetry channel.

### Resolution Options

**Option A: Emit a DriveEvent on pod failure** (requires engine change — out of scope per spec)

**Option B: Capture server stderr during `cg wf run`** (recommended)

The harness captures both stdout AND stderr from the `cg wf run` subprocess:
```typescript
const proc = spawn('node', [cliPath, 'wf', 'run', slug, '--json-events']);

proc.stdout.on('data', (chunk) => {
  // Parse NDJSON DriveEvents
});

proc.stderr.on('data', (chunk) => {
  // Capture ODS errors, pod failures, etc.
  stderrBuffer += chunk.toString();
});
```

Then include stderr in the HarnessEnvelope:
```json
{
  "command": "workflow.run",
  "status": "error",
  "data": {
    "exitReason": "max-iterations",
    "stderrLines": [
      "[ODS] Pod execution failed for coder-5ec: ENOENT: no such file or directory"
    ]
  }
}
```

**Option C: Log pod failures to events.jsonl** (hybrid — small engine change + harness reads)

Add to ODS `.catch()`:
```typescript
.catch(async (err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[ODS] Pod execution failed for ${nodeId}: ${msg}`);
  // NEW: Write to event file for harness observability
  await this.deps.graphService.appendEvent(ctx, graphSlug, {
    type: 'pod:error', nodeId, message: msg, timestamp: new Date().toISOString()
  });
});
```

**Recommendation**: Start with **Option B** (captures stderr, zero engine changes). Add **Option C** later if structured pod error events are needed for the `workflow logs` command.

---

## Telemetry Data Structures

### DriveEvent (from orchestration engine)

```typescript
type DriveEvent =
  | { type: 'iteration'; message: string; data: OrchestrationRunResult }
  | { type: 'idle'; message: string }
  | { type: 'status'; message: string }
  | { type: 'error'; message: string; error?: unknown };
```

### OrchestrationRunResult (per iteration)

```typescript
interface OrchestrationRunResult {
  actions: OrchestrationAction[];
  stopReason: string;       // 'actions-taken', 'no-action', 'graph-complete', 'graph-failed'
  finalReality: PositionalGraphReality;
  iterations: number;
}
```

### HarnessEnvelope (harness output)

```typescript
interface WorkflowRunResult {
  workflow: string;
  exitReason: 'complete' | 'failed' | 'max-iterations' | 'stopped' | 'error';
  iterations: number;
  duration: string;
  nodes: Record<string, NodeSummary>;
  events: DriveEventEntry[];    // Accumulated NDJSON entries
  stderrLines: string[];        // Captured server errors
  assertions?: {
    passed: number;
    failed: number;
    total: number;
    details: AssertionResult[];
  };
}
```

---

## Open Questions

### Q1: Should `cg wf run` support `--json-events` natively?

**RESOLVED**: Yes. Add NDJSON event output mode to the CLI drive handler. This is a small, surgical change to `cli-drive-handler.ts` (~15 lines). Aligns with the harness agent runner pattern (events.ndjson).

### Q2: Can the harness connect to SSE without auth?

**RESOLVED**: With `DISABLE_AUTH=true` (harness standard practice), yes. But SSE is secondary — CLI subprocess is the primary telemetry source. SSE can optionally enhance `workflow run --verbose` with real-time browser-visible status.

### Q3: How does the harness capture server stderr?

**RESOLVED**: When `cg wf run` runs as a subprocess, its stderr is available via `proc.stderr`. The harness reads it, buffers lines matching `[ODS]` or `[error]` patterns, and includes them in the HarnessEnvelope. No special infrastructure needed.

---

**Workshop Location**: `docs/plans/076-harness-workflow-runner/workshops/002-telemetry-architecture.md`
