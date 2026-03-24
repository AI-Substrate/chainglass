# Workshop: Workflow Error Visibility & Diagnostics

**Type**: Integration Pattern
**Plan**: 076-harness-workflow-runner
**Spec**: [harness-workflow-runner-spec.md](../harness-workflow-runner-spec.md)
**Created**: 2026-03-24
**Status**: Draft

**Related Documents**:
- [Workshop 008: Harness Wishlist](008-harness-wishlist-fixes.md) — related UX friction
- [workflow-execution.md](../../../how/workflow-execution.md) — execution architecture

**Domain Context**:
- **Primary Domain**: workflow-ui — execution status display, node rendering
- **Related Domains**: _platform/positional-graph (node status, errors), _platform/events (SSE broadcast)

---

## Purpose

Design how errors and diagnostics surface in the workflow UI. Today, when a workflow fails, the user sees a red "Error" badge on a node and "failed" in the status — but **no details**. You can't see _what_ failed, _why_, or _what to do about it_. The CLI gives you full error details via `--detailed`, but the browser gives you nothing actionable.

This workshop designs two features:
1. **Workflow-level diagnostics** — a log/diagnostic mode toggled from the toolbar
2. **Per-node error display** — click a failed node, see the error

## Key Questions Addressed

- What data is already available on the server that the UI doesn't show?
- How should workflow-wide diagnostics be presented (inline vs panel vs page)?
- How should per-node errors surface when you click a failed/blocked node?
- What SSE events need to change to carry error details?

---

## What Data Exists Today (But Is Hidden)

The `--detailed` CLI endpoint (`GET /detailed`) already returns rich per-node data:

```json
{
  "id": "sample-spec-builder-e52",
  "status": "blocked-error",
  "error": {
    "code": "POD_EXECUTION_FAILED",
    "message": "ENOENT: no such file or directory, open '.../node-starter-prompt.md'"
  },
  "startedAt": "2026-03-24T03:31:13.737Z",
  "completedAt": null,
  "blockedBy": [],
  "sessionId": null
}
```

The SSE `execution-update` event carries:

```json
{
  "status": "running",
  "iterations": 2,
  "lastEventType": "status",
  "lastMessage": "Graph: jordo-test (in_progress)\n..."
}
```

**The gap**: SSE carries workflow-level status but not per-node errors. The detailed endpoint has everything but the UI never calls it.

---

## Design: Two-Layer Error Visibility

```
┌─────────────────────────────────────────────────────────────────┐
│ TOOLBAR                                                         │
│  [Run ▶]  [Stop ⏹]   Status: Failed   │ 📋 Diagnostics │      │
│                                                                 │
│  ┌─ DIAGNOSTICS PANEL (toggled) ──────────────────────────────┐ │
│  │ Execution: failed after 3 iterations (12s)                 │ │
│  │ Last event: POD_EXECUTION_FAILED                           │ │
│  │                                                            │ │
│  │ Nodes:                                                     │ │
│  │  ✅ test-user-input-7cf  complete  (48s)                   │ │
│  │  ❌ sample-spec-builder  blocked-error                     │ │
│  │     ENOENT: no such file or directory...                   │ │
│  │  ⏸ sample-coder-242     pending (blocked by neighbor)      │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ┌──────────────────────────────────────────────────────────────┐│
│ │                    CANVAS                                    ││
│ │  [user-input ✅]  ──→  [spec-builder ❌]  →  [coder ⏸]     ││
│ │                              ▲                               ││
│ │                         click for detail                     ││
│ └──────────────────────────────────────────────────────────────┘│
│                                                                 │
│ ┌── NODE DETAIL (right panel, on click) ───────────────────────┐│
│ │ sample-spec-builder-e52                                      ││
│ │ Status: blocked-error                                        ││
│ │ Started: 03:31:13                                            ││
│ │                                                              ││
│ │ ┌─ Error ──────────────────────────────────────────────────┐ ││
│ │ │ Code: POD_EXECUTION_FAILED                               │ ││
│ │ │ ENOENT: no such file or directory, open                  │ ││
│ │ │ '/.../node-starter-prompt.md'                            │ ││
│ │ └──────────────────────────────────────────────────────────┘ ││
│ │                                                              ││
│ │ Inputs: spec (unwired)                                       ││
│ │ Outputs: spec (not saved)                                    ││
│ └──────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer 1: Workflow Diagnostics Panel

### Trigger

A **Diagnostics** button in the toolbar (next to Run/Stop/Restart). Toggles a collapsible panel below the toolbar.

```
[ ▶ Run ]  [ ⏹ Stop ]        Status: failed (3 iterations, 12s)      [ 📋 Diagnostics ]
```

- Always visible (not just during execution)
- Badge/dot shows error count when panel is closed
- Keyboard shortcut: `Ctrl+D` or `Cmd+D`

### Panel Content

The panel calls `GET /detailed` (the same endpoint the CLI uses) and renders a summary:

```
┌─ Diagnostics ─────────────────────────────────────────────┐
│                                                           │
│  Execution: failed after 3 iterations (12s)               │
│  Started: 03:31:13  •  Stopped: 03:31:25                  │
│                                                           │
│  ┌─ Nodes ──────────────────────────────────────────────┐ │
│  │ ✅ test-user-input-7cf    complete     48s            │ │
│  │ ❌ sample-spec-builder    blocked-error               │ │
│  │    POD_EXECUTION_FAILED: ENOENT: no such file...      │ │
│  │ ⏸ sample-coder-242       pending                     │ │
│  │    Blocked by: serial-neighbor                        │ │
│  └──────────────────────────────────────────────────────┘ │
│                                                           │
│  [ Refresh ]  [ Copy as JSON ]                            │
└───────────────────────────────────────────────────────────┘
```

### Data Source

**Option A**: Poll `GET /detailed` on toggle (and on SSE `execution-update` events)
**Option B**: New SSE event type `execution-diagnostic` with full per-node data

**Recommended: Option A** — poll on toggle + re-fetch on status change. The detailed endpoint already exists and returns everything we need. Adding a new SSE event type is overkill for a diagnostic panel that's toggled manually.

**Implementation**:

```typescript
// New hook: useDiagnostics(graphSlug, worktreePath)
function useDiagnostics(graphSlug: string, worktreePath: string) {
  const [data, setData] = useState<DetailedResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const executionStatus = useGlobalState(`workflow-execution:${key}:status`);

  const refresh = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/.../detailed?worktreePath=...`);
    setData(await res.json());
    setLoading(false);
  }, [graphSlug, worktreePath]);

  // Auto-refresh when execution status changes
  useEffect(() => {
    if (executionStatus) refresh();
  }, [executionStatus]);

  return { data, loading, refresh };
}
```

### Component Structure

```
WorkflowEditor
  └── WorkflowTempBar
       ├── ExecutionButtons (existing)
       ├── ExecutionStatusBadge (existing lastMessage area)
       └── DiagnosticsToggle (NEW)
  └── DiagnosticsPanel (NEW, collapsible)
       ├── ExecutionSummary (status, timing, iterations)
       └── NodeList
            └── NodeDiagnosticRow (status icon, name, error if any, timing)
  └── WorkflowCanvas (existing)
  └── NodePropertiesPanel (existing, enhanced)
```

---

## Layer 2: Per-Node Error Display

### Current State

When you click a node, the right panel (`NodePropertiesPanel`) shows:
- Unit slug and type
- Input sources (with wiring errors)
- Context source

It does **not** show:
- Node execution status
- Error details
- Timing (started/completed)
- Session ID
- BlockedBy reasons

### Design

Enhance `NodePropertiesPanel` with an **Error section** that appears when the node has an error:

```
┌─ Node Properties ──────────────────────────────┐
│ sample-spec-builder-e52                        │
│ Type: agent  •  Unit: sample-spec-builder      │
│                                                │
│ ┌─ Status ───────────────────────────────────┐ │
│ │ ❌ blocked-error                           │ │
│ │ Started: 03:31:13                          │ │
│ │ Duration: —                                │ │
│ └────────────────────────────────────────────┘ │
│                                                │
│ ┌─ Error ────────────────────────────────────┐ │
│ │ POD_EXECUTION_FAILED                       │ │
│ │                                            │ │
│ │ ENOENT: no such file or directory, open    │ │
│ │ '/Users/jordanknight/substrate/074-actaul  │ │
│ │ -real-agents/packages/positional-graph/    │ │
│ │ dist/features/030-orchestration/           │ │
│ │ node-starter-prompt.md'                    │ │
│ │                                            │ │
│ │ [ Copy Error ]                             │ │
│ └────────────────────────────────────────────┘ │
│                                                │
│ ── Inputs ──                                   │
│ (existing input source display)                │
│                                                │
│ ── Context ──                                  │
│ (existing context display)                     │
└────────────────────────────────────────────────┘
```

### Where Does the Error Data Come From?

The node's `error` field is already in the graph state on disk (written by ODS when a pod fails). The question is how to get it to the UI.

**Option A**: Enhance the existing `loadWorkflow()` server action to include error fields from node status
**Option B**: Call `/detailed` endpoint and extract per-node errors
**Option C**: Read node error from graph state file directly in the server component

**Recommended: Option A** — the `loadWorkflow()` / `graphStatus` data that the page already fetches should include node error information. This is the most natural path — the data flows through the same channel everything else uses.

**What needs to change**:

1. `GraphStatusResult` (or whatever `loadWorkflow` returns) needs to include the node `error` field
2. `WorkflowNodeCard` needs to pass error data through to `NodePropertiesPanel`
3. `NodePropertiesPanel` renders the error section when present

### Error Display Rules

| Node Status | Error Display | Where |
|-------------|---------------|-------|
| `blocked-error` | Full error (code + message) | Properties panel + diagnostics panel |
| `complete` | None | — |
| `pending` | BlockedBy reasons | Gate chip (existing) |
| `ready` | None | — |
| `starting` / `agent-accepted` | None (in progress) | — |
| `waiting-question` | Question pending indicator | Existing Q&A badge |

---

## Layer 3: Execution Status Enhancement (Bonus)

The toolbar currently shows `lastMessage` in small faded text. For better visibility:

### Current
```
[ ▶ Run ]   No status text when idle
             Faded white text during execution
```

### Proposed
```
[ ▶ Run ]                                                    [ 📋 Diagnostics ]

         ↕ when execution active or recently finished:

[ ⏹ Stop ]  🔴 Failed — POD_EXECUTION_FAILED (3 iterations, 12s)  [ 📋 Diagnostics ]
[ ▶ Retry ] [ ↺ Restart ]
```

Status badge colors:
- 🟢 Running (green pulse)
- 🔴 Failed (red, persistent until restart)
- 🟡 Stopped (amber)
- ✅ Completed (green, solid)
- ⚪ Idle (no badge)

---

## Implementation Priority

| Priority | What | Effort | Impact |
|----------|------|--------|--------|
| **P1** | Per-node error in properties panel | Small | User clicks failed node → sees why |
| **P2** | Diagnostics toggle button + panel | Medium | Full workflow view with all node states + errors |
| **P3** | Enhanced status badge in toolbar | Small | Glanceable execution state |

**P1 alone** solves the immediate pain ("I clicked the node and can't see why it failed"). P2 gives the full picture. P3 is polish.

---

## Data Flow Summary

```
Engine (drive loop)
  │
  ├─ Node error occurs
  │   └─ ODS writes error to node state (disk)
  │       └─ NodeEventService writes node:error event
  │           └─ FileWatcher detects change
  │               └─ CentralEventNotifier broadcasts
  │                   └─ SSE 'workflow-execution' channel
  │                       └─ UI: status badge updates
  │
  ├─ loadWorkflow() / graphStatus (page load)
  │   └─ Reads node state from disk
  │       └─ CURRENTLY: status, inputs, context
  │       └─ NEEDED: + error { code, message }
  │
  └─ GET /detailed (diagnostics panel)
      └─ Returns full getReality() dump
          └─ Per-node: status, error, timing, blockedBy, sessionId
```

---

## Decisions

| ID | Question | Status | Decision |
|----|----------|--------|----------|
| D1 | Data source for diagnostics panel? | RESOLVED | Poll `GET /detailed` on toggle + auto-refresh on SSE status change |
| D2 | Data source for per-node errors? | RESOLVED | Enhance `loadWorkflow()` to include error field from node state |
| D3 | Diagnostics panel position? | RESOLVED | Collapsible below toolbar, above canvas |
| D4 | Should errors auto-dismiss? | RESOLVED | No — persist until workflow is restarted |
| D5 | Copy button format? | OPEN | JSON? Plain text? Both? |
| D6 | Separate plan or fold into 076? | OPEN | Likely a new plan (UI feature, not harness tooling) |

---

## Quick Reference: What to Build

```
P1 — Per-node error (small):
  1. Enhance GraphStatusResult to include node error field
  2. Pass error through WorkflowNodeCard → NodePropertiesPanel
  3. Render error section (code + message + copy button)

P2 — Diagnostics panel (medium):
  1. Add DiagnosticsToggle button to WorkflowTempBar
  2. Create DiagnosticsPanel component (collapsible)
  3. useDiagnostics hook → GET /detailed → render node list
  4. Auto-refresh on SSE execution-update events

P3 — Status badge (small):
  1. Replace lastMessage text with colored status badge
  2. Show error summary inline when status === 'failed'
  3. Persistent until restart
```
