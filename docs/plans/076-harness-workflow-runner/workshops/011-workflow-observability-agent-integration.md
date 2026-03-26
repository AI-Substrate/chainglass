# Workshop: Workflow Observability & Agent Integration

**Type**: Integration Pattern
**Plan**: 076-harness-workflow-runner
**Created**: 2026-03-26
**Status**: Draft

**Related Documents**:
- [Workshop 009: Error Visibility](009-workflow-error-visibility.md) — per-node errors in properties panel
- [Workshop 010: Closing the Dev Loop](010-closing-the-dev-loop.md) — host/container workflow

**Domain Context**:
- **Primary Domains**: workflow-ui (observability), agents (chat integration)
- **Related Domains**: _platform/positional-graph (ODS, pod execution), _platform/events (SSE)

---

## Purpose

Three interconnected problems:
1. **Blind execution** — user can't see what's happening during a workflow run (no logs, no progress, no pod output)
2. **No agent chat access** — clicking an agent node doesn't let you see or interact with the running agent
3. **Silent pod failures** — agent pods fail fire-and-forget with no visibility; nodes stuck at "starting" with no explanation

## The Core Problem

**There is no single place to see what happened in a workflow run.** The data exists but is scattered:

| Data | Location | How to Access |
|------|----------|---------------|
| Node statuses | `.chainglass/data/workflows/{slug}/state.json` | `cg wf show --detailed` |
| Node events (accept/complete/error) | `state.json → nodes.{id}.events[]` | Buried in state, not surfaced |
| Pod sessions (agent ID mapping) | `pod-sessions.json` | Manual file read |
| Agent conversation/output | `~/.config/chainglass/agents/{id}/events.ndjson` | Have to find the agent ID first |
| ODS errors (pending) | In-memory `pendingErrors` Map | Lost on restart, never persisted |
| Drive events (ONBAS decisions) | SSE broadcast, cached in harness | `just harness workflow logs` |

**What's needed**: A single `GET /api/.../workflows/{slug}/logs` endpoint (and `cg wf logs` CLI command) that returns a unified, chronological execution log — all node transitions, agent output summaries, errors, timing — in one response. Same data, one call, no spelunking.

## Key Questions Addressed

- What real-time information should surface during workflow execution?
- How should agent nodes connect to the existing chat/overlay system?
- Why do pods fail silently and how do we make failures visible?
- What's the minimum viable "workflow doctor" check?

---

## Problem 1: Blind Execution

### What the User Sees Today

```
┌─────────────────────────────────────────────────────┐
│ jordo-test │ Running │ iter 3 │ Graph: in_progress  │
│                                                     │
│  Line 1: [sample-input ✅]                          │
│  Line 2: [spec-builder ✅] → [spec-reviewer ✅]    │
│  Line 3: [sample-coder 🟡 Starting]  → [tester ⏸]  │
│                                                     │
│  Right Panel: "Blocked-Error" badge, gates, inputs  │
│  But: NO logs. NO agent output. NO pod status.      │
│  "Starting" with no explanation of WHY.             │
└─────────────────────────────────────────────────────┘
```

### What the User Needs

```
┌─────────────────────────────────────────────────────┐
│ jordo-test │ Running │ iter 3                       │
│                                                     │
│  [sample-coder 🟡 Starting — pod spawned 12s ago]   │
│                                                     │
│  Right Panel:                                       │
│    Status: starting (12s elapsed)                   │
│    Pod: spawned, waiting for agent to accept        │
│    Agent: copilot (claude-sonnet-4.6)               │
│    Session: (not yet assigned)                      │
│                                                     │
│    [ View Agent Chat ▶ ]   ← opens agent overlay    │
│                                                     │
│    Recent Events:                                   │
│    03:33:29 Pod spawned for sample-coder-5c0        │
│    03:33:29 Agent type: copilot                     │
│    03:33:30 Waiting for agent to call node accept   │
│    03:33:42 ⚠ No accept after 12s                   │
└─────────────────────────────────────────────────────┘
```

### Design: Execution Timeline in Properties Panel

Add a **Timeline** section to `NodePropertiesPanel` below the error section. Shows recent node events from `state.json`:

```typescript
// Data already exists in state.json → node.events[]
interface NodeEvent {
  event_id: string;
  event_type: 'node:accepted' | 'node:completed' | 'node:error' | 'node:question' | ...;
  source: 'executor' | 'agent' | 'orchestrator';
  payload: Record<string, unknown>;
  created_at: string;
}
```

**Implementation**:
1. `NodeStatusResult` already has access to stored state with events
2. Add `events?: NodeEvent[]` to the `NodeStatusResult` type (or a summary)
3. Render in `NodePropertiesPanel` as a compact timeline
4. For `starting` status with no events: show "Waiting for agent to accept (Xs elapsed)"

### Design: Elapsed Time on Starting Nodes

When a node is `starting`, show how long it's been:

```tsx
{node.status === 'starting' && node.startedAt && (
  <div className="text-amber-500 text-[11px]">
    Starting — {Math.round((Date.now() - new Date(node.startedAt).getTime()) / 1000)}s elapsed
    {elapsedSeconds > 30 && ' (may be stuck)'}
  </div>
)}
```

---

## Problem 2: Agent Chat Access from Workflow

### Current State

The agents page (`/workspaces/[slug]/agents/[id]`) already has:
- **AgentChatView** — full chat with streaming, history, status
- **AgentManagerService** — central registry, agents queryable by ID
- **SSE updates** — real-time message streaming

But the workflow page has **no link to it**. When you click an agent node, you see gates and inputs — not the agent's conversation.

### Design: "View Agent" Button in Properties Panel

When a node has a `sessionId` (agent has started), show a button:

```tsx
{/* Agent Actions */}
{node.unitType === 'agent' && (
  <section>
    <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50 mb-1.5">
      Agent
    </h4>
    {node.sessionId ? (
      <>
        <div className="text-[11px] text-muted-foreground/60 mb-2">
          Session: {node.sessionId.substring(0, 8)}...
        </div>
        <a
          href={`/workspaces/${workspaceSlug}/agents/${agentId}`}
          className="w-full px-3 py-2 text-xs font-medium rounded-lg border border-green-300 
                     dark:border-green-700 bg-green-50 dark:bg-green-950 text-green-700 
                     dark:text-green-300 hover:bg-green-100 cursor-pointer block text-center"
        >
          View Agent Chat
        </a>
      </>
    ) : node.status === 'starting' ? (
      <div className="text-[11px] text-amber-500">
        Agent spawning — waiting for session...
      </div>
    ) : (
      <div className="text-[11px] text-muted-foreground/50">
        Agent not yet started
      </div>
    )}
  </section>
)}
```

**Challenge**: The properties panel has `sessionId` but needs the `agentId` (UUID) to build the URL. The ODS stores the mapping in `pod-sessions.json`.

**Resolution Options**:

| Option | Approach | Pros | Cons |
|--------|----------|------|------|
| A | Add `agentId` to `NodeStatusResult` | Clean, direct link | Needs service change |
| B | Link by sessionId, agents page resolves | No service change | Agents page needs session lookup |
| C | Embed agent overlay inline in workflow page | Best UX — no page navigation | Complex, needs AgentChatView extraction |

**Recommended: Option A** for now. Add `agentId` field from `pod-sessions.json` to `NodeStatusResult`. Simple, enables the link.

**Future: Option C** — embed `AgentChatView` as a slide-over panel in the workflow page. Click "View Agent" → panel slides in from right, showing full chat. Click back → returns to properties. This is the "full interactive mode" the user wants.

---

## Problem 3: Silent Pod Failures — Why "Starting" Gets Stuck

### Root Cause Analysis

From ODS (`ods.ts` line 142-164):

```typescript
// Pod execution is FIRE-AND-FORGET — not awaited
pod.execute(prompt, runOptions)
  .then((result) => {
    node.sessionId = result.sessionId;  // Capture on success
  })
  .catch((error) => {
    // Error goes to pendingErrors queue — BUT node status stays "starting"
    this.pendingErrors.set(nodeId, { code: 'POD_EXECUTION_FAILED', message: error.message });
  });

return { ok: true, newStatus: 'starting' };  // Returns immediately
```

**The bug**: When the pod fails (e.g., CopilotClient can't authenticate), the error goes to `pendingErrors` but the node stays at `starting`. The error is only drained on the *next* ODS cycle — and by then ONBAS sees "starting" as "running" and doesn't dispatch new actions.

**The fix path**:
1. ODS `pendingErrors` draining already exists (Phase 1 fix)
2. But the node status transition from `starting` → `blocked-error` needs to happen when the error is drained
3. ONBAS `diagnose()` should detect: node at `starting` for >30s with no sessionId → flag as potentially stuck

### Immediate Diagnostic: Why This Specific Run Failed

The dev server creates `CopilotClient({ cliArgs: [...] })` at DI registration. This requires:
1. `GH_TOKEN` in the environment (or `gh auth` configured)
2. The Copilot CLI installed and accessible

**Check**: Was GH_TOKEN set when the dev server started? If not, CopilotClient instantiation may have succeeded (it's lazy) but the first `.run()` call fails silently in the fire-and-forget pod.

### Design: `wf doctor` Command

A workflow readiness check that validates everything before running:

```bash
$ just wf-doctor jordo-test

Workflow Doctor: jordo-test
═══════════════════════════

Structure:
  ✓ 5 nodes across 3 lines
  ✓ All work units found
  ✓ All required inputs wired

Inputs Chain:
  ✓ sample-input → requirements → sample-spec-builder
  ✓ sample-spec-builder → spec → sample-spec-reviewer
  ✓ sample-spec-reviewer → reviewed_spec → sample-coder
  ✓ sample-coder → language, code → sample-tester

Agent Readiness:
  ✓ Agent type: copilot
  ✓ GH_TOKEN: set (gh auth token works)
  ✗ Copilot SDK: CopilotClient connection test failed
    Fix: Restart dev server with GH_TOKEN exported

Runtime:
  ✓ Dev server running (PID 12345, port 3000)
  ✓ CLI build fresh
  ✓ No stale drive.lock

Result: 1 issue found — fix before running
```

**Implementation**: A new CLI command `cg wf doctor <slug>` that:
1. Loads graph, checks all units exist
2. Validates input wiring chain (collateInputs for each node)
3. Checks agent environment (GH_TOKEN, adapter connectivity)
4. Checks runtime state (server running, CLI fresh, no stale locks)

This could also be a button in the UI toolbar — "Doctor" icon next to Run/Stop.

---

## Implementation Priority

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| **P1** | Elapsed time on "starting" nodes | Tiny | Shows the node IS stuck, not just slow |
| **P2** | "View Agent Chat" button in properties panel | Small | Opens existing agent page |
| **P3** | Node event timeline in properties panel | Medium | Shows what happened and when |
| **P4** | `wf doctor` CLI command | Medium | Catches problems before they happen |
| **P5** | Inline agent chat overlay in workflow page | Large | Full interactive mode without page navigation |
| **P6** | Fix silent pod failures (ODS error → status transition) | Medium | Nodes don't get stuck at "starting" |

---

## Decisions

| ID | Question | Status | Decision |
|----|----------|--------|----------|
| D1 | How to link agent node → agent chat? | OPEN | Leaning Option A (agentId in NodeStatusResult) |
| D2 | Inline agent overlay or navigate to agents page? | OPEN | Start with navigate (P2), then inline (P5) |
| D3 | Should `wf doctor` be CLI-only or also UI button? | OPEN | CLI first, UI button later |
| D4 | Show node events from state.json in panel? | OPEN | Yes, but need to add to NodeStatusResult |
| D5 | Fix fire-and-forget pod errors? | OPEN | Yes, but separate plan/fix — complex ODS change |
