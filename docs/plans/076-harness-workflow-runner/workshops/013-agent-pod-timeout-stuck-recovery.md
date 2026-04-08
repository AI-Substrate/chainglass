# Workshop: Agent Pod Timeout & Stuck Node Recovery

**Type**: Integration Pattern
**Plan**: 076-harness-workflow-runner
**Created**: 2026-03-29
**Status**: Draft

**Related Documents**:
- [Workshop 011: Observability](011-workflow-observability-agent-integration.md) — identified silent failures
- [Workshop 012: Unified Logs](012-unified-execution-logs.md) — STUCK_STARTING diagnostic

**Domain Context**:
- **Primary Domain**: _platform/positional-graph — ODS, ONBAS, AgentPod, PodManager
- **Related Domains**: shared (SdkCopilotAdapter, AgentInstance)

---

## Purpose

When `jordo-test` ran, the `sample-coder` node got stuck at `starting` for 73 hours. The drive loop ran 200 idle iterations over 33 minutes, then exited. The pod's `execute()` promise hung forever — never resolved, never rejected. No error, no timeout, no recovery.

This workshop designs fixes for two bugs:
1. **No timeout on agent execution** — pods can hang indefinitely
2. **No stuck-node detection** — ONBAS treats `starting` as "running" forever

## Root Cause Analysis

### What Happened (jordo-test, 2026-03-26)

```
03:31:54  sample-input          complete (0.5s)
03:31:59  sample-spec-builder   accepted → complete (40s)     session: f6cf9ea2
03:32:49  sample-spec-reviewer  accepted → complete (38s)     session: f6cf9ea2 (inherited)
03:33:29  sample-coder          started → HUNG FOREVER        session: f6cf9ea2 (inherited)
04:02:36  Drive loop exited     200 iterations exhausted
```

### The Chain of Failure

```
ODS.execute()
  │
  ├─ buildPodParams() → inherited session f6cf9ea2 (3rd reuse of same session)
  │                      ↓
  │                 agentManager.getWithSessionId(f6cf9ea2)
  │                      ↓
  │                 Returns SAME AgentInstance (already used twice)
  │
  ├─ pod.execute()  ← FIRE AND FORGET (.then/.catch, NOT awaited)
  │     │
  │     └─ agentInstance.run({ prompt, cwd })
  │           │
  │           └─ adapter.run({ prompt, sessionId: f6cf9ea2 })
  │                 │
  │                 ├─ client.resumeSession(f6cf9ea2)
  │                 │
  │                 └─ session.sendAndWait({ prompt })  ← NO TIMEOUT
  │                       │
  │                       └─ 💀 HUNG — SDK never returned
  │
  └─ return { ok: true, newStatus: 'starting' }  ← returned immediately

ONBAS sees:
  sample-coder: status=starting → hasRunning=true → no actions → idle

Drive loop:
  200 × (ONBAS → idle → sleep 10s → repeat) → maxIterations → exit
  Pod promise: still hanging, orphaned
```

### Two Bugs

| Bug | Location | Effect |
|-----|----------|--------|
| **No timeout** | `AgentPod.execute()` → `AgentInstance.run()` → `SdkCopilotAdapter.run()` | `sendAndWait` hangs indefinitely |
| **No stuck detection** | `ONBAS.run()` treats `starting` as running | Node blocks the line forever, drive loop idles until maxIterations |

---

## Fix 1: Agent Execution Timeout

### Current Code (no timeout)

```typescript
// AgentPod.execute()
const result = await this.agentInstance.run({
  prompt,
  cwd: options.ctx.worktreePath,
  // ← NO timeout
});

// AgentInstance.run()
const result = await this._adapter.run({
  prompt,
  sessionId: this._sessionId,
  cwd: options.cwd,
  // ← NO timeout passed through
});

// SdkCopilotAdapter.run()
await session.sendAndWait({ prompt }, options.timeout);
// ← options.timeout is undefined → SDK default (may be infinite)
```

### Fix: Thread Timeout Through the Chain

```typescript
// AgentPod.execute() — add configurable timeout
const POD_AGENT_TIMEOUT_MS = 300_000; // 5 minutes default

async execute(options: PodExecuteOptions): Promise<PodExecuteResult> {
  const template = this._hasExecuted ? loadResumePrompt() : loadStarterPrompt();
  const prompt = this.resolveTemplate(template, options);
  this._hasExecuted = true;

  try {
    const result = await this.agentInstance.run({
      prompt,
      cwd: options.ctx.worktreePath,
      timeout: POD_AGENT_TIMEOUT_MS,  // ← NEW
    });
    return this.mapAgentResult(result);
  } catch (err) {
    return {
      outcome: 'error',
      error: {
        code: 'POD_AGENT_EXECUTION_ERROR',
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}
```

```typescript
// AgentInstance.run() — pass timeout to adapter
const adapterOptions: AdapterRunOptions = {
  prompt: options.prompt,
  sessionId: this._sessionId ?? undefined,
  cwd: options.cwd,
  onEvent: (event) => this._dispatch(event, options.onEvent),
  timeout: options.timeout,  // ← Thread through
};
```

The `SdkCopilotAdapter.run()` already accepts and passes `options.timeout` to `sendAndWait` — it just never receives one.

### Timeout Value

| Scenario | Timeout | Rationale |
|----------|---------|-----------|
| Default pod execution | 5 minutes | Agents should accept + do work within this window |
| Graph-level override | `orchestratorSettings.agentTimeout` | Per-workflow configuration |
| Resumed session (inherited) | Same as default | Inherited context shouldn't change timeout |

**Decision D1**: Should timeout be configurable per-node or per-workflow?

**Recommendation**: Per-workflow via `orchestratorSettings.agentTimeout` in `graph.yaml`. Per-node is over-engineering for now.

---

## Fix 2: Stuck Node Detection in ONBAS

### Current Code (starting = running)

```typescript
// ONBAS.run() — diagnose phase
case 'starting':
case 'agent-accepted':
  hasRunning = true;  // ← Treated as running, no age check
  break;
```

ONBAS sees `starting` and says "something is running, no actions needed." It never checks **how long** the node has been starting.

### Fix: Stuck Starting Detection

```typescript
// ONBAS.run() — diagnose phase
case 'starting': {
  const startedAt = nodeState?.started_at;
  if (startedAt) {
    const elapsed = Date.now() - new Date(startedAt).getTime();
    if (elapsed > STUCK_STARTING_THRESHOLD_MS) {
      // Node has been "starting" too long — treat as failed
      stuckNodes.push(node.nodeId);
      break;
    }
  }
  hasRunning = true;
  break;
}
case 'agent-accepted':
  hasRunning = true;
  break;
```

When a stuck node is detected, ONBAS should return a **new action type**: `error-node`.

```typescript
// New ONBAS action
if (stuckNodes.length > 0) {
  return {
    actions: stuckNodes.map(nodeId => ({
      type: 'error-node' as const,
      nodeId,
      error: {
        code: 'STUCK_STARTING',
        message: `Node started ${elapsed}ms ago with no accept event`,
      },
    })),
    stopReason: null,
  };
}
```

ODS handles `error-node` by writing a `node:error` event and transitioning to `blocked-error`.

### Threshold Value

| Option | Value | Tradeoff |
|--------|-------|----------|
| 60s | Conservative | Catches stuck fast, but real agents may need >60s on first turn |
| 120s | Balanced | Most agents accept within 30s; 120s gives margin |
| 300s | Lenient | Matches pod timeout; stuck detection only after timeout |

**Recommendation**: 120s. If the agent hasn't accepted in 2 minutes, something is wrong. This is independent of the pod execution timeout (5 min) — the stuck detection fires even if the pod promise is still hanging.

**Decision D2**: Should stuck detection also apply to `agent-accepted` (running but never completing)?

**OPEN**: Leaning yes with a longer threshold (10 min for accepted → complete). But this is a separate concern — an agent doing real work may take a long time. Start with `starting` only.

---

## Fix 3: Drain Pending Errors Before Exit

### Current Code

When drive loop exits at maxIterations, it doesn't drain `pendingErrors`. If a pod failed in the `.catch()` handler, the error is in the ODS `pendingErrors` Map but never written to state.

### Fix

```typescript
// GraphOrchestration.drive() — before returning
// Drain any pending errors that accumulated during the final iteration
const finalErrors = ods.drainErrors();
for (const [nodeId, error] of finalErrors) {
  await eventService.raise(nodeId, 'node:error', {
    code: error.code,
    message: error.message,
  });
}
```

This ensures that even if the drive loop exits, any pod errors are persisted to `state.json` and show up in `wf-logs`.

---

## Fix 4: server.json Bind-Mount (Recurring Issue)

The preflight check shows a stale `server.json` with port 3101 (container) even after restarting the dev server. This keeps recurring because:

1. Container writes `server.json` to `apps/web/.chainglass/server.json`
2. Host bind-mounts `..:/app` in Docker, so the container's write goes to the host filesystem
3. Host dev server also writes to the same path
4. Whichever writes last wins — if the container is running when the host restarts, the container's stale file persists

### Fix

The container should write to a **different path** that doesn't collide with the host:

```yaml
# docker-compose.yml
environment:
  - CHAINGLASS_SERVER_JSON_DIR=/tmp/chainglass  # Container-only path
```

Or simpler: `instrumentation.ts` should skip writing `server.json` when `CHAINGLASS_CONTAINER=true` (the container doesn't need it — the justfile injects `--server-url` directly).

**Decision D3**: Skip server.json write in container or write to different path?

**Recommendation**: Skip write when `CHAINGLASS_CONTAINER=true`. The container never reads its own server.json — all container CLI calls use explicit `--server-url` injection from the justfile.

---

## Implementation Priority

| Priority | Fix | Effort | Impact |
|----------|-----|--------|--------|
| **P1** | Thread timeout through AgentPod → AgentInstance → adapter | Small | Pods can't hang forever |
| **P2** | ONBAS stuck-starting detection (120s threshold) | Small | Nodes auto-fail instead of blocking |
| **P3** | Drain pendingErrors on drive loop exit | Tiny | Errors always persisted to state |
| **P4** | Skip server.json in container | Tiny | Eliminates recurring bind-mount conflict |

**P1+P2 together** solve the `jordo-test` failure. P3+P4 are cleanup.

---

## Decisions

| ID | Question | Status | Decision |
|----|----------|--------|----------|
| D1 | Timeout per-node or per-workflow? | RESOLVED | Per-workflow via `orchestratorSettings.agentTimeout`, default 5min |
| D2 | Detect stuck `agent-accepted` too? | OPEN | Leaning yes with longer threshold (10min), but separate fix |
| D3 | Container server.json: skip or different path? | RESOLVED | Skip write when `CHAINGLASS_CONTAINER=true` |
| D4 | What happens to orphaned pod promises on drive exit? | OPEN | Currently leaked. Could track and cancel via AbortController. Future work. |

---

## Expected Result After Fixes

```
$ just wf-logs jordo-test

jordo-test — failed (3/5 nodes, 7m elapsed)
════════════════════════════════════════════════════════════

  03:31:54  ✅ sample-input completed (0.5s)
  03:32:09  🔄 sample-spec-builder accepted → ✅ complete (40s)
  03:32:57  🔄 sample-spec-reviewer accepted → ✅ complete (38s)
  03:33:29  ▶ sample-coder started
  03:35:29  ❌ sample-coder STUCK_STARTING — no accept after 120s
            ⏸ sample-tester pending (blocked: preceding-lines)

Diagnostics:
  ❌ STUCK_STARTING: sample-coder started 120s ago with no accept event
    Fix: Check agent adapter. Was GH_TOKEN set? Try: just wf-restart jordo-test
```

Instead of running for 33 minutes and silently dying, the node fails in 2 minutes with a clear error.
