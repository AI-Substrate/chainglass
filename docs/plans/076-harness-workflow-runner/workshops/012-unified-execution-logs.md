# Workshop: Unified Workflow Execution Logs

**Type**: API Contract + Integration Pattern
**Plan**: 076-harness-workflow-runner
**Spec**: [harness-workflow-runner-spec.md](../harness-workflow-runner-spec.md)
**Created**: 2026-03-26
**Status**: Draft

**Related Documents**:
- [Workshop 011: Observability](011-workflow-observability-agent-integration.md) — identified scattered data problem
- [Workshop 009: Error Visibility](009-workflow-error-visibility.md) — per-node error in UI

**Domain Context**:
- **Primary Domain**: _platform/positional-graph — owns execution state, node events, inspect
- **Related Domains**: workflow-ui (REST endpoint, UI consumption), _(harness)_ (CLI + justfile integration)

---

## Purpose

Design a single endpoint that tells you everything about a workflow run — all node transitions, agent output summaries, errors, timing — in one call. Today this data exists but is scattered across 6 locations and requires manual spelunking to piece together. The endpoint powers three consumers: the CLI (`cg wf logs`), the UI (diagnostics panel), and the harness (`just wf-logs`).

## Key Questions Addressed

- What data should the unified log contain?
- Where does each piece of data come from?
- How should the CLI, UI, and harness consume it?
- What's the minimum viable implementation?

---

## The Data That Exists Today

All of this is already computed or persisted. Nothing new needs to be generated — it just needs to be assembled.

| Data | Source | Already Read By |
|------|--------|-----------------|
| Node statuses (ready/starting/complete/error) | `state.json` → `getStatus()` | `GET /detailed`, `cg wf show` |
| Node events (accept, complete, error, question) | `state.json` → `nodes.{id}.events[]` | `inspect.ts` (CLI --detailed) |
| Node errors (code + message) | `state.json` → `nodes.{id}.error` | `GET /detailed`, properties panel |
| Node timing (started_at, completed_at) | `state.json` → `nodes.{id}` | `GET /detailed` |
| Pod sessions (nodeId → agentSessionId) | `pod-sessions.json` → `getReality()` | `GET /detailed` |
| Agent output (final message) | `AgentResult.output` returned by adapter | **NOT PERSISTED** — ephemeral |
| Agent streaming events | `AgentEvent` callback during session | **NOT PERSISTED** — ephemeral |
| Drive events (iteration/idle/status/error) | `onEvent` callback during drive() | Harness cache only |
| Questions (asked/answered) | `state.json` → `questions[]` | `GET /detailed`, inspect |
| Node outputs (saved data) | `nodes/{id}/data/data.json` | `inspect.ts` |

**Two gaps**: Agent output and drive events are ephemeral — they exist only during execution. Everything else is on disk.

---

## Design: `GET /api/.../workflows/{slug}/logs`

### Response Shape

```typescript
interface WorkflowExecutionLog {
  slug: string;
  status: 'pending' | 'in_progress' | 'complete' | 'failed';
  timing: {
    startedAt: string | null;
    completedAt: string | null;
    durationMs: number | null;
  };
  progress: {
    totalNodes: number;
    completedNodes: number;
    failedNodes: number;
    runningNodes: number;
    pendingNodes: number;
  };

  // Chronological timeline — THE main value
  timeline: TimelineEntry[];

  // Per-node detail — drill down
  nodes: Record<string, NodeLog>;

  // Workflow-level issues (input wiring, missing units, etc.)
  diagnostics: Diagnostic[];
}

interface TimelineEntry {
  timestamp: string;
  nodeId: string;
  unitSlug: string;
  event: string;          // 'started' | 'accepted' | 'completed' | 'error' | 'question-asked' | 'question-answered'
  source: string;         // 'agent' | 'orchestrator' | 'executor' | 'human'
  message: string;        // Human-readable summary
  detail?: unknown;       // Event-specific payload (error code, question text, etc.)
}

interface NodeLog {
  nodeId: string;
  unitSlug: string;
  unitType: 'agent' | 'code' | 'user-input';
  status: string;
  timing: {
    startedAt: string | null;
    completedAt: string | null;
    durationMs: number | null;
  };
  error: { code: string; message: string } | null;
  agentSessionId: string | null;
  events: TimelineEntry[];       // Just this node's events
  outputs: Record<string, unknown>;  // Saved output data
  blockedBy: string[];
}

interface Diagnostic {
  severity: 'error' | 'warning' | 'info';
  nodeId?: string;
  code: string;
  message: string;
  fix?: string;
}
```

### Data Assembly

```
state.json (exists)
  ├─ nodes.{id}.status          → NodeLog.status
  ├─ nodes.{id}.started_at      → NodeLog.timing, TimelineEntry
  ├─ nodes.{id}.completed_at    → NodeLog.timing, TimelineEntry
  ├─ nodes.{id}.error           → NodeLog.error, TimelineEntry(error)
  ├─ nodes.{id}.events[]        → TimelineEntry[] (chronological merge)
  └─ questions[]                 → TimelineEntry(question-asked/answered)

pod-sessions.json (exists)
  └─ sessions.{nodeId}          → NodeLog.agentSessionId

nodes/{id}/data/data.json (exists)
  └─ outputs                    → NodeLog.outputs

getStatus() (exists)
  └─ per-node readiness         → Diagnostic[] (unwired inputs, missing units)
```

**Implementation**: One new function `buildExecutionLog()` in `inspect.ts` (or new file) that calls the same services `inspect` and `detailed` already use — no new data access patterns.

---

## CLI: `cg wf logs <slug>`

### Human-Readable Output (default)

```
$ cg wf logs jordo-test

jordo-test — failed (3/5 nodes complete, 23m elapsed)
════════════════════════════════════════════════════════

03:31:54  sample-input          started
03:31:54  sample-input          accepted (executor)
03:31:54  sample-input          complete (0.5s)
                                  Output: "Build a REST API for todo management"

03:31:59  sample-spec-builder   started
03:32:09  sample-spec-builder   accepted (agent, session f6cf9ea2)
03:32:39  sample-spec-builder   complete (40s)
                                  Output: spec (247 chars)

03:32:49  sample-spec-reviewer  started
03:32:57  sample-spec-reviewer  accepted (agent, session f6cf9ea2 inherited)
03:33:27  sample-spec-reviewer  complete (38s)
                                  Output: reviewed_spec (312 chars)

03:33:29  sample-coder          started
          sample-coder          ⚠ NO ACCEPT after 23m — agent may have failed
                                  Agent: copilot (session f6cf9ea2 inherited)
                                  Diagnosis: Pod spawned but agent never responded.
                                  Check: Was GH_TOKEN set when dev server started?

          sample-tester         pending (blocked: preceding-lines)

Diagnostics:
  ⚠ sample-coder: started 23m ago with no accept event — likely stuck
```

### JSON Output (`--json --pretty`)

Returns the full `WorkflowExecutionLog` structure above.

### Flags

```
cg wf logs <slug>               # Full execution log (human-readable)
cg wf logs <slug> --json         # Full log as JSON
cg wf logs <slug> --node <id>    # Filter to one node
cg wf logs <slug> --errors       # Only error events + diagnostics
cg wf logs <slug> --timeline     # Just the timeline, no node detail
```

---

## REST Endpoint

```
GET /api/workspaces/{slug}/workflows/{graphSlug}/logs?worktreePath=...
```

Returns `WorkflowExecutionLog` JSON.

**Implementation**: Thin route handler that calls `buildExecutionLog()` — same pattern as the `detailed` endpoint.

---

## Justfile: `just wf-logs`

```just
# Show workflow execution log (human-readable timeline + diagnostics)
wf-logs slug *FLAGS:
    #!/usr/bin/env bash
    set -euo pipefail
    REPO_ROOT="$(git rev-parse --show-toplevel)"
    if echo "{{FLAGS}}" | grep -q -- '--container'; then
        just harness-cg wf logs {{slug}} --server
    else
        node "$REPO_ROOT/apps/cli/dist/cli.cjs" wf logs {{slug}} \
          --json --pretty --server \
          --workspace-path "$REPO_ROOT"
    fi
```

**Usage**:
```bash
just wf-logs jordo-test              # Why did it fail? What happened?
just wf-logs jordo-test --errors     # Just the errors
just wf-logs jordo-test --node sample-coder-5c0  # What happened to this node?
```

---

## UI: Diagnostics Panel (Workshop 009 P2)

The same `GET /logs` endpoint powers the diagnostics panel toggle in the toolbar:

```
┌─ 📋 Execution Log ─────────────────────────────────────────┐
│                                                             │
│ 03:31:54  ✅ sample-input          complete (0.5s)          │
│ 03:31:59  ✅ sample-spec-builder   complete (40s)           │
│ 03:32:49  ✅ sample-spec-reviewer  complete (38s)           │
│ 03:33:29  ⚠ sample-coder          starting (23m, no accept)│
│           ⏸ sample-tester         pending                  │
│                                                             │
│ ── Diagnostics ──                                           │
│ ⚠ sample-coder stuck at starting for 23m                    │
│                                                             │
│ [ Refresh ]                                                 │
└─────────────────────────────────────────────────────────────┘
```

One fetch to `/logs`, render the timeline. Auto-refresh on SSE `execution-update` events.

---

## Diagnostics: Automatic Problem Detection

The `diagnostics[]` array in the response catches problems proactively:

| Code | Severity | Condition | Message | Fix |
|------|----------|-----------|---------|-----|
| `STUCK_STARTING` | warning | Node at `starting` for >60s with no `accepted` event | "Node started {N}s ago with no accept" | "Check agent adapter (GH_TOKEN?), check server logs" |
| `UNWIRED_INPUT` | error | Required input has E160 status | "Input '{name}' not wired" | "Wire it: cg wf node set-input ..." |
| `MISSING_UNIT` | error | unitFound = false | "Work unit '{slug}' not found" | "Create it: cg unit create ..." |
| `STALE_LOCK` | warning | drive.lock exists with dead PID | "Stale drive lock from PID {N}" | "Remove: rm .chainglass/data/workflows/{slug}/drive.lock" |
| `NO_AGENT_SESSION` | info | Agent node complete but no sessionId | "No session captured" | Informational |

**Implementation**: After building the timeline, scan for known bad patterns and append diagnostics. This is the "workflow doctor" — built into the log response, not a separate command.

---

## Agent Output Persistence (Gap Fix)

Today, agent output is ephemeral — the `AgentResult.output` string is returned to the pod but never written to disk. To include it in logs:

**Option A**: Pod writes agent output to `nodes/{id}/data/agent-output.txt` after execution
**Option B**: ODS captures `AgentResult.output` and writes a `progress:update` event to node state
**Option C**: Accept the gap — show "Output: (not captured)" in logs, fix later

**Recommended: Option B** — ODS already has the result in `.then()` after pod execution. Add one `eventService.raise('progress:update', { message: result.output.slice(0, 500) })` call. Minimal change, output shows up in timeline.

---

## Implementation Priority

| Priority | What | Effort | Impact |
|----------|------|--------|--------|
| **P1** | `buildExecutionLog()` function + REST endpoint | Medium | Single source of truth |
| **P2** | `cg wf logs` CLI command (human-readable + JSON) | Small | Instant debugging from terminal |
| **P3** | `just wf-logs` shortcut | Tiny | Consistent with other shortcuts |
| **P4** | Diagnostics auto-detection (STUCK_STARTING etc.) | Small | Catches problems proactively |
| **P5** | Agent output persistence (Option B) | Small | "What did the agent actually do?" |
| **P6** | UI diagnostics panel consuming `/logs` | Medium | Visual debugging in browser |

**P1-P4 can ship together** — they're the same feature at different layers.

---

## How This Changes the Development Flow

### Before (today)
```
Agent: "Workflow failed"
→ just wf-status jordo-test          # sees "starting" — why?
→ cat .chainglass/.../state.json     # manual spelunk
→ cat pod-sessions.json              # find session ID
→ find ~/.config/chainglass/agents   # hunt for logs
→ grep for errors                    # still nothing
→ "I don't know why it failed"
```

### After
```
Agent: "Workflow failed"
→ just wf-logs jordo-test
  03:33:29  sample-coder  started
            ⚠ NO ACCEPT after 23m — agent may have failed
            Diagnosis: Pod spawned but agent never responded.
            Check: Was GH_TOKEN set when dev server started?
→ "Oh, GH_TOKEN wasn't exported to the dev server"
```

**One command. Full picture. Actionable diagnosis.**

---

## AGENTS.md Updates

Add to the "Working on Workflows" playbook:

```markdown
#### When something fails

1. **`just wf-logs <slug>`** — shows the full execution timeline with diagnostics
2. Read the timeline — which node failed? What was the error?
3. Check diagnostics — are inputs unwired? Is an agent stuck?
4. Fix the root cause
5. `just wf-restart <slug>`

The logs command is your primary debugging tool. Use it before anything else.
```

Add `just wf-logs` to the shortcuts table:

```markdown
just wf-logs <slug>               # Full execution timeline + diagnostics
just wf-logs <slug> --errors      # Just errors and warnings
```

---

## Decisions

| ID | Question | Status | Decision |
|----|----------|--------|----------|
| D1 | Separate endpoint or extend `/detailed`? | RESOLVED | New `/logs` endpoint — different shape, different purpose |
| D2 | Persist agent output? | OPEN | Leaning Option B (ODS writes progress:update event) |
| D3 | Diagnostics as part of logs or separate `doctor` command? | RESOLVED | Part of logs response — one call, full picture |
| D4 | Drive events in log? | RESOLVED | No — drive events are engine-internal. Node events are what matters. |
| D5 | Live streaming log endpoint? | OPEN | Not for v1 — poll-based. SSE streaming is future enhancement. |
