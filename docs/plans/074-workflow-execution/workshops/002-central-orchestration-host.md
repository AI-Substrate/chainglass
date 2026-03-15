# Workshop: Central Orchestration Host

**Type**: Integration Pattern / State Machine
**Plan**: 074-workflow-execution
**Spec**: (pre-spec — this workshop informs the spec)
**Created**: 2026-03-13
**Status**: Draft

**Related Documents**:
- [Workshop 001: Execution Wiring](001-execution-wiring-architecture.md)
- [Research Dossier](../research-dossier.md)
- [Deep Research: Next.js Long-Running](../deep-research-nextjs-long-running.md)
- [Deep Research: AbortController](../deep-research-abort-controller.md)

**Domain Context**:
- **Primary Domain**: `_platform/positional-graph` — owns the orchestration engine
- **Related Domains**: `_platform/events` (SSE transport), `_platform/state` (runtime state), `workflow-ui` (consumer)

---

## Purpose

Design a central `WorkflowExecutionManager` that owns the lifecycle of all running workflows across all worktrees — start, stop, restart, status, server-restart recovery — so that individual workflows don't need to emit their own state. The manager knows what every workflow is doing because it IS the thing running them.

## Key Questions Addressed

- How does a single process manage N workflows across M worktrees simultaneously?
- How does state survive server restarts (HMR in dev, process restart in prod)?
- How does the manager publish state without workflows needing to know about SSE/GlobalState?
- What's the DX for a developer wiring a new workflow action?
- How do we keep it approachable — not a distributed systems PhD project?

---

## The Core Idea

One sentence: **A Map of running workflows, keyed by `worktreePath:graphSlug`, that wraps `drive()` and bridges everything to SSE + GlobalState automatically.**

```
┌──────────────────────────────────────────────────────────────────────┐
│                   WorkflowExecutionManager                          │
│                   (globalThis singleton)                             │
│                                                                      │
│   executions: Map<ExecutionKey, ExecutionHandle>                     │
│                                                                      │
│   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐    │
│   │ wt-A:pipeline-1 │  │ wt-A:pipeline-2 │  │ wt-B:pipeline-1 │    │
│   │ status: running  │  │ status: idle     │  │ status: running  │    │
│   │ controller: ✓    │  │ controller: —    │  │ controller: ✓    │    │
│   │ iterations: 12   │  │ iterations: 0    │  │ iterations: 3    │    │
│   └────────┬────────┘  └─────────────────┘  └────────┬────────┘    │
│            │                                          │              │
│            ▼                                          ▼              │
│   GraphOrchestration                        GraphOrchestration       │
│   handle.drive({                            handle.drive({           │
│     signal, onEvent                           signal, onEvent        │
│   })                                        })                       │
│            │                                          │              │
│            └──────────┬───────────────────────────────┘              │
│                       ▼                                              │
│              onEvent callback                                        │
│              ┌───────────────────┐                                   │
│              │ sseManager        │ → SSE channel 'workflow-execution' │
│              │ .broadcast()      │                                   │
│              │                   │                                   │
│              │ stateService      │ → GlobalState paths               │
│              │ .publish()        │   workflow-execution:{key}:status  │
│              └───────────────────┘                                   │
└──────────────────────────────────────────────────────────────────────┘
```

**Why this works**: The manager IS the thing calling `drive()`. It receives every `DriveEvent` via the `onEvent` callback. It doesn't need to poll, subscribe, or coordinate — it's already in the loop.

---

## Execution Key: Multi-Worktree Isolation

Every workflow execution is identified by a compound key:

```typescript
type ExecutionKey = `${string}:${string}`; // worktreePath:graphSlug

function makeKey(worktreePath: string, graphSlug: string): ExecutionKey {
  return `${worktreePath}:${graphSlug}` as ExecutionKey;
}
```

**Why not just graphSlug?** Same graph slug can exist in different worktrees. Worktree A running `my-pipeline` and Worktree B running `my-pipeline` are completely independent — different filesystem state, different pods, different progress.

**Why not a UUID?** The key must be deterministic from (worktreePath, graphSlug) so that:
- Server restart can reconstruct it from the execution registry on disk
- The UI can query status without knowing an opaque ID
- Stop/restart operations can find the right execution from URL params

### OrchestrationService Cache Fix

The existing `OrchestrationService.handles` Map uses `graphSlug` as key. For multi-worktree, change to compound key:

```typescript
// orchestration-service.ts — one-line fix
async get(ctx: WorkspaceContext, graphSlug: string): Promise<IGraphOrchestration> {
  const key = `${ctx.worktreePath}:${graphSlug}`;  // was: graphSlug
  let handle = this.handles.get(key);
  if (!handle) {
    handle = new GraphOrchestration({ graphSlug, ctx, ...this.deps });
    this.handles.set(key, handle);
  }
  return handle;
}
```

No other changes needed. Each `GraphOrchestration` handle already captures `ctx` at construction, so downstream calls (ONBAS, ODS, PodManager) all use the correct worktreePath.

---

## The ExecutionHandle

Each running workflow gets a lightweight handle that tracks its state:

```typescript
interface ExecutionHandle {
  readonly key: ExecutionKey;
  readonly worktreePath: string;
  readonly graphSlug: string;
  readonly workspaceSlug: string;

  // Runtime
  status: ExecutionStatus;
  controller: AbortController | null;
  drivePromise: Promise<DriveResult> | null;

  // Progress (updated every iteration via onEvent)
  iterations: number;
  totalActions: number;
  lastEventType: string;
  lastMessage: string;
  startedAt: string | null;
  stoppedAt: string | null;
}

type ExecutionStatus =
  | 'idle'        // Never started or fully reset
  | 'starting'    // About to call drive()
  | 'running'     // drive() loop active
  | 'stopping'    // Abort signal sent, awaiting cleanup
  | 'stopped'     // Aborted, can resume
  | 'completed'   // Graph finished successfully
  | 'failed';     // Graph errored
```

**Why a flat struct, not a class?** Simpler to serialize for the execution registry (restart recovery). No methods to bind, no prototype chain. The manager owns all behavior.

---

## The Manager API

```typescript
interface IWorkflowExecutionManager {
  // Lifecycle
  start(ctx: WorkspaceContext, graphSlug: string): Promise<StartResult>;
  stop(worktreePath: string, graphSlug: string): Promise<StopResult>;
  restart(ctx: WorkspaceContext, graphSlug: string): Promise<StartResult>;

  // Query
  getStatus(worktreePath: string, graphSlug: string): ExecutionStatus;
  getHandle(worktreePath: string, graphSlug: string): ExecutionHandle | undefined;
  listRunning(): ExecutionHandle[];

  // Server lifecycle
  cleanup(): Promise<void>;          // SIGTERM handler
  resumeAll(): Promise<void>;        // Post-restart recovery
}
```

### start()

```
┌─────────────────────────────────────────────────────────────────┐
│ start(ctx, graphSlug)                                           │
│                                                                 │
│  1. key = makeKey(ctx.worktreePath, graphSlug)                  │
│  2. existing = executions.get(key)                              │
│  3. if existing?.status === 'running' → return { already: true }│
│  4. controller = new AbortController()                          │
│  5. handle = { key, status: 'starting', controller, ... }       │
│  6. executions.set(key, handle)                                 │
│  7. persistRegistry()              ← crash recovery             │
│  8. broadcast status: 'starting'                                │
│  9. orchestrationHandle = await orchService.get(ctx, graphSlug) │
│ 10. handle.drivePromise = orchestrationHandle.drive({           │
│       signal: controller.signal,                                │
│       onEvent: (e) => this.handleEvent(key, e)                  │
│     })                                                          │
│ 11. handle.status = 'running'                                   │
│ 12. broadcast status: 'running'                                 │
│ 13. // drive() runs in background — NOT awaited here            │
│ 14. handle.drivePromise.then(result => {                        │
│       handle.status = result.exitReason === 'complete'          │
│         ? 'completed'                                           │
│         : result.exitReason === 'stopped'                       │
│           ? 'stopped'                                           │
│           : 'failed';                                           │
│       handle.controller = null;                                 │
│       handle.drivePromise = null;                               │
│       persistRegistry();                                        │
│       broadcast final status                                    │
│     })                                                          │
│ 15. return { started: true, key }                               │
└─────────────────────────────────────────────────────────────────┘
```

**Key point: step 10 is NOT awaited.** The server action returns immediately with "started". The `drive()` loop runs in the background for as long as it takes. Step 14's `.then()` handles completion.

### stop()

```
┌─────────────────────────────────────────────────────────────────┐
│ stop(worktreePath, graphSlug)                                   │
│                                                                 │
│  1. key = makeKey(worktreePath, graphSlug)                      │
│  2. handle = executions.get(key)                                │
│  3. if !handle || handle.status !== 'running' → return          │
│  4. handle.status = 'stopping'                                  │
│  5. broadcast status: 'stopping'                                │
│  6. handle.controller.abort()          ← signal fires           │
│  7. await handle.drivePromise          ← wait for drive() exit  │
│  8. // drive() returns with exitReason: 'stopped'               │
│  9. // .then() handler (from start step 14) runs automatically  │
│ 10. // Pods: drive() exit → no more run() calls                 │
│ 11. // Running pods finish their current work naturally          │
│ 12. // (they're fire-and-forget; they write results to disk)    │
│ 13. return { stopped: true }                                    │
└─────────────────────────────────────────────────────────────────┘
```

**What happens to running pods?** When we abort `drive()`, it stops calling `run()`. Running pods continue until they finish (fire-and-forget by design — ADR-0012). Their results land on disk. Next time `drive()` is called, EHS settles those results.

**Why not kill pods on stop?** Because it's safer. The pod might be 90% done. Let it finish. If the user wants a hard reset, they use `restart()`.

### restart()

```
┌─────────────────────────────────────────────────────────────────┐
│ restart(ctx, graphSlug)                                         │
│                                                                 │
│  1. await stop(ctx.worktreePath, graphSlug)  ← stop first       │
│  2. Kill running pods: podManager.destroyAllPods(graphSlug)     │
│  3. Reset graph state to initial:                               │
│     - All nodes → 'pending' or 'ready' (based on readiness)    │
│     - Clear outputs, events, sessions                           │
│     - graphService.resetGraph(ctx, graphSlug)                   │
│  4. executions.delete(key)                                      │
│  5. persistRegistry()                                           │
│  6. broadcast status: 'idle'                                    │
│  7. await start(ctx, graphSlug)             ← fresh start       │
│  8. return { restarted: true }                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Restart = stop + nuke + start.** It's the "hard reset" button. All progress lost, start from scratch.

---

## Server Restart Recovery

### The Execution Registry

The manager persists a lightweight manifest of "what was running" to disk:

```typescript
// Location: <appDataDir>/.chainglass/execution-registry.json
// (NOT per-worktree — this is the central registry)

interface ExecutionRegistry {
  version: 1;
  updatedAt: string;
  executions: ExecutionRegistryEntry[];
}

interface ExecutionRegistryEntry {
  key: ExecutionKey;
  worktreePath: string;
  graphSlug: string;
  workspaceSlug: string;
  status: ExecutionStatus;
  iterations: number;
  startedAt: string;
  stoppedAt: string | null;
}
```

**When is it written?**
- On `start()` — new entry with status 'running'
- On status change — update entry
- On `stop()` / completion — update status
- On `restart()` — remove entry, then add fresh one

**Atomic writes** using the existing `atomicWriteFile()` pattern from PodManager.

### resumeAll() — Post-Restart Recovery

Called from `instrumentation.ts` after the manager is bootstrapped:

```
┌─────────────────────────────────────────────────────────────────┐
│ resumeAll()                                                     │
│                                                                 │
│  1. Read execution-registry.json                                │
│  2. For each entry where status was 'running' or 'starting':   │
│     a. Resolve WorkspaceContext from workspaceSlug + worktreePath│
│     b. Verify worktree still exists on disk                     │
│     c. Verify graph still exists in worktree                    │
│     d. Log: "Resuming {graphSlug} in {worktreePath}"           │
│     e. Call start(ctx, graphSlug)                               │
│        → drive() picks up where it left off automatically       │
│  3. For entries with status 'stopped' / 'completed' / 'failed':│
│     → Just restore the handle with saved status (don't drive)   │
│  4. Clean up entries where worktree no longer exists             │
│  5. Persist cleaned registry                                    │
└─────────────────────────────────────────────────────────────────┘
```

**Why does "just call drive() again" work for resume?**

This is the elegant part. The orchestration engine is inherently resumable:

| What happened at crash | What drive() sees on resume |
|------------------------|----------------------------|
| Node was 'complete' | ONBAS skips it (line 80-81 in onbas.ts) |
| Node was 'starting' | EHS settles any pending events from disk → node becomes complete or stays starting → ONBAS handles it |
| Node was 'agent-accepted' | Same as starting — pod may have written results to disk |
| Pod finished but drive() didn't see it | Events on disk, EHS settles them on first run() pass |
| Pod was mid-execution when server died | Pod process died too — node stays in 'starting'/'agent-accepted'. ONBAS skips in-flight nodes. On restart, orchestrator can re-dispatch (or mark as error) |

**Event stamping prevents double-processing**: `EventHandlerService.processGraph()` uses idempotent stamps (`event.stamps[subscriber]`). Calling it twice on the same events is a no-op.

### Bootstrap Sequence

```typescript
// instrumentation.ts

const globalForExec = globalThis as typeof globalThis & {
  __workflowExecutionManagerInitialized?: boolean;
};

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // ... existing central notifications bootstrap ...

    // Workflow Execution Manager (after DI is ready)
    if (!globalForExec.__workflowExecutionManagerInitialized) {
      globalForExec.__workflowExecutionManagerInitialized = true;

      try {
        const { createWorkflowExecutionManager } = await import(
          './src/features/074-workflow-execution/create-execution-manager'
        );
        const manager = await createWorkflowExecutionManager();
        globalThis.__workflowExecutionManager = manager;

        // Resume any workflows that were running before restart
        await manager.resumeAll();

        // Graceful shutdown
        process.on('SIGTERM', async () => {
          await manager.cleanup();
        });

        console.log('[workflow-execution] Manager initialized');
      } catch (error) {
        globalForExec.__workflowExecutionManagerInitialized = false;
        console.error('[workflow-execution] Failed to initialize:', error);
      }
    }
  }
}
```

**Follows the exact pattern from Plan 027** (`startCentralNotificationSystem`):
- Flag-before-async (set flag → try → reset on failure)
- Dynamic import (tree-shaking friendly)
- SIGTERM cleanup handler
- Runtime check (`NEXT_RUNTIME === 'nodejs'`)

---

## State Broadcasting: The Manager Knows Everything

The manager receives every `DriveEvent` via the `onEvent` callback it passes to `drive()`. This is the integration seam — no extra pubsub, no event bus, no polling.

### handleEvent() — The Bridge

```typescript
private handleEvent(key: ExecutionKey, event: DriveEvent): void {
  const handle = this.executions.get(key);
  if (!handle) return;

  // 1. Update the handle's local state
  handle.iterations = event.type === 'iteration'
    ? (event.data?.iterations ?? handle.iterations + 1)
    : handle.iterations;
  handle.lastEventType = event.type;
  handle.lastMessage = event.message;

  // 2. Broadcast to SSE (reaches all browser tabs)
  this.sseManager.broadcast('workflow-execution', {
    key,
    graphSlug: handle.graphSlug,
    worktreePath: handle.worktreePath,
    workspaceSlug: handle.workspaceSlug,
    eventType: event.type,
    message: event.message,
    status: handle.status,
    iterations: handle.iterations,
    totalActions: handle.totalActions,
  });

  // 3. Publish to GlobalState (reaches subscribed React components)
  this.stateService.publish(
    `workflow-execution:${key}:status`,
    handle.status,
    { origin: 'server', channel: 'workflow-execution' }
  );
  this.stateService.publish(
    `workflow-execution:${key}:lastEvent`,
    { type: event.type, message: event.message, ts: Date.now() },
    { origin: 'server', channel: 'workflow-execution' }
  );
}
```

### What the UI Sees

```typescript
// In WorkflowEditor or workflow-temp-bar.tsx

// Option A: GlobalState (reactive, per-property)
const status = useGlobalState<ExecutionStatus>(
  `workflow-execution:${worktreePath}:${graphSlug}:status`,
  'idle'
);

// Option B: Channel events (richer, message stream)
const { messages } = useChannelEvents('workflow-execution', { maxMessages: 50 });
const myEvents = messages.filter(m => m.data.key === `${worktreePath}:${graphSlug}`);
```

**The workflow itself does nothing.** It doesn't emit events, publish state, or know about SSE. The manager does ALL of that from the `onEvent` callback. This is the central insight.

### ServerEventRouteDescriptor (follows work-unit-state pattern)

```typescript
// workflow-execution-route.ts

export const workflowExecutionRoute: ServerEventRouteDescriptor = {
  channel: 'workflow-execution',
  stateDomain: 'workflow-execution',
  multiInstance: true,  // one instance per ExecutionKey
  properties: [
    { name: 'status', description: 'idle|starting|running|stopping|stopped|completed|failed' },
    { name: 'iterations', description: 'Drive iterations completed' },
    { name: 'lastEventType', description: 'Last DriveEvent type' },
    { name: 'lastMessage', description: 'Status message' },
  ],
  mapEvent: (event) => {
    const { key, status, iterations, eventType, message } = event;
    return {
      instanceId: key,
      values: {
        status: status ?? 'unknown',
        iterations: iterations ?? 0,
        lastEventType: eventType ?? '',
        lastMessage: message ?? '',
      },
    };
  },
};
```

Wire into `state-connector.tsx`:
```typescript
const SERVER_EVENT_ROUTES = [workUnitStateRoute, workflowExecutionRoute];
```

Add channel to `workspace-domain.ts`:
```typescript
export const WorkspaceDomain = {
  // ... existing
  WorkflowExecution: 'workflow-execution',
} as const;
```

Add to `WORKSPACE_SSE_CHANNELS` in workspace layout:
```typescript
const WORKSPACE_SSE_CHANNELS = [
  // ... existing channels
  WorkspaceDomain.WorkflowExecution,
];
```

---

## Server Actions: Thin Wrappers

```typescript
// workflow-actions.ts — add these alongside existing actions

'use server';

import { getWorkflowExecutionManager } from '@/features/074-workflow-execution/get-manager';

export async function runWorkflow(
  workspaceSlug: string,
  worktreePath: string,
  graphSlug: string
): Promise<{ ok: boolean; error?: string }> {
  const manager = getWorkflowExecutionManager();
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  const result = await manager.start(ctx, graphSlug);
  return { ok: result.started };
}

export async function stopWorkflow(
  worktreePath: string,
  graphSlug: string
): Promise<{ ok: boolean }> {
  const manager = getWorkflowExecutionManager();
  await manager.stop(worktreePath, graphSlug);
  return { ok: true };
}

export async function restartWorkflow(
  workspaceSlug: string,
  worktreePath: string,
  graphSlug: string
): Promise<{ ok: boolean }> {
  const manager = getWorkflowExecutionManager();
  const ctx = await resolveWorkspaceContext(workspaceSlug, worktreePath);
  await manager.restart(ctx, graphSlug);
  return { ok: true };
}

export async function getWorkflowExecutionStatus(
  worktreePath: string,
  graphSlug: string
): Promise<{ status: ExecutionStatus; iterations: number }> {
  const manager = getWorkflowExecutionManager();
  const handle = manager.getHandle(worktreePath, graphSlug);
  return {
    status: handle?.status ?? 'idle',
    iterations: handle?.iterations ?? 0,
  };
}
```

**4 actions. Each is 5-8 lines.** All the complexity lives in the manager. Server actions are just thin forwarding functions — exactly the pattern used for existing workflow actions.

---

## Concurrency Model

### How Many Workflows Can Run Simultaneously?

**Answer: As many as Node.js can handle.** Each `drive()` loop is:
- One `run()` call (CPU: <10ms — ONBAS is pure synchronous, ODS dispatches fire-and-forget)
- One `sleep()` (I/O: 100ms-10s, yielded to event loop)
- Filesystem reads/writes (I/O: yielded)

The Node.js event loop handles many concurrent `drive()` loops naturally. They're cooperative — each yields during sleep and I/O.

```
Timeline showing 3 concurrent workflows:

Event Loop: ─────────────────────────────────────────────→ time
             │                    │                    │
WF-1: run()──sleep(100ms)────────run()──sleep(10s)─────run()──
WF-2: ───run()──sleep(100ms)──run()──sleep(100ms)──run()──sleep──
WF-3: ────────run()──sleep(10s)─────────────────────────run()──

No thread contention. No mutex. Just the event loop.
```

### What If Two Workflows Are In The Same Worktree?

Works fine — different graphSlugs, different state files, different pod sessions. The compound key `worktreePath:graphSlug` keeps them isolated.

### What If Someone Calls start() Twice?

Step 3 of `start()`: if the key already exists with status `'running'`, return `{ already: true }`. Idempotent.

---

## Dependency Wiring

The manager needs these resolved from DI at construction:

```typescript
interface ExecutionManagerDeps {
  orchestrationService: IOrchestrationService;
  sseManager: SSEManager;
  stateService: IStateService;
  workspaceService: IWorkspaceService;
  graphService: IPositionalGraphService;
  fs: IFileSystem;
}
```

### createWorkflowExecutionManager() Factory

```typescript
// create-execution-manager.ts

export async function createWorkflowExecutionManager(): Promise<WorkflowExecutionManager> {
  const container = getContainer();

  // Ensure orchestration services are registered (copies CLI pattern)
  registerOrchestrationServices(container);

  const deps: ExecutionManagerDeps = {
    orchestrationService: container.resolve(ORCHESTRATION_DI_TOKENS.ORCHESTRATION_SERVICE),
    sseManager: container.resolve(SSE_DI_TOKENS.SSE_MANAGER),
    stateService: container.resolve(STATE_DI_TOKENS.STATE_SERVICE),
    workspaceService: container.resolve(WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE),
    graphService: container.resolve(POSITIONAL_GRAPH_DI_TOKENS.POSITIONAL_GRAPH_SERVICE),
    fs: container.resolve(SHARED_DI_TOKENS.FILESYSTEM),
  };

  return new WorkflowExecutionManager(deps);
}
```

**Note**: This is where `registerOrchestrationServices()` gets called for the web — the same function the CLI uses. This wires ONBAS, ODS, PodManager, and the full orchestration stack into the web DI container.

---

## Execution Registry: File Format

```json
{
  "version": 1,
  "updatedAt": "2026-03-13T22:30:00.000Z",
  "executions": [
    {
      "key": "/Users/me/project-a:my-pipeline",
      "worktreePath": "/Users/me/project-a",
      "graphSlug": "my-pipeline",
      "workspaceSlug": "project-a",
      "status": "running",
      "iterations": 12,
      "startedAt": "2026-03-13T22:25:00.000Z",
      "stoppedAt": null
    },
    {
      "key": "/Users/me/project-b:data-etl",
      "worktreePath": "/Users/me/project-b",
      "graphSlug": "data-etl",
      "workspaceSlug": "project-b",
      "status": "completed",
      "iterations": 45,
      "startedAt": "2026-03-13T21:00:00.000Z",
      "stoppedAt": "2026-03-13T21:15:00.000Z"
    }
  ]
}
```

**Location**: A central, non-worktree-specific path. Options:
- `~/.chainglass/execution-registry.json` (user-level)
- `<workspace-root>/.chainglass/execution-registry.json` (workspace-level)

**Recommendation**: Workspace-level. Each workspace has its own `.chainglass/` directory. The registry tracks all worktree executions within that workspace. Multiple workspaces = multiple registries. Simple.

Actually — since we need cross-workspace visibility: **user-level** `~/.chainglass/execution-registry.json`. One file, all workspaces, all worktrees.

### Persistence Timing

| Event | Persist? | Why |
|-------|----------|-----|
| start() called | Yes | So restart recovery knows to resume |
| Status changes | Yes | Crash at any point → recovery knows current state |
| Iteration progress | Debounced (every 10 iterations or 30s) | Avoid write storm |
| stop() / completion | Yes | Final state |
| restart() | Yes (delete + add) | Clean slate |

---

## Complete State Flow Diagram

```
User clicks "Run" in browser
         │
         ▼
    Server Action                       ┌─────────────┐
    runWorkflow(slug, wt, graph)   ──→  │ Execution    │
         │                              │ Manager      │
         │ returns immediately          │ (globalThis) │
         │ { ok: true }                 └──────┬───────┘
         │                                     │
         │                              start(ctx, graphSlug)
         │                                     │
         │                              ┌──────▼───────┐
         │                              │  drive()     │ ← runs in background
         │                              │  polling     │
         │                              │  loop        │
         │                              └──────┬───────┘
         │                                     │
         │                              onEvent callback
         │                                     │
         │                              ┌──────▼───────┐
         │                              │ handleEvent()│
         │                              │              │
         │                              │ sseManager   │──→ SSE 'workflow-execution'
         │                              │ .broadcast() │         │
         │                              │              │         ▼
         │                              │ stateService │    MultiplexedSSEProvider
         │                              │ .publish()   │         │
         │                              └──────────────┘         ▼
         │                                              ServerEventRoute
         │                                                       │
         │                                                       ▼
         │                                              GlobalStateSystem
         │                                                       │
         ▼                                                       ▼
    UI gets { ok: true }                                useGlobalState()
    shows "Starting..."                                 shows "Running (3/10)"
```

**Two update paths reach the UI simultaneously:**
1. **Direct SSE** → `useChannelEvents('workflow-execution')` → rich event stream
2. **SSE → GlobalState** → `useGlobalState('workflow-execution:key:status')` → reactive property

**Plus the existing file-watcher path** (Workshop 001) which delivers node-level status changes independently. This means the UI sees both macro-level execution status ("running, iteration 5") AND micro-level node status ("node X is starting") without any new wiring.

---

## DX: What Does a Developer Actually Touch?

### To wire this feature end-to-end:

| # | File | Change | Size |
|---|------|--------|------|
| 1 | `orchestration-service.ts` | Compound cache key | 1 line |
| 2 | `orchestration-service.types.ts` | Add `signal` to DriveOptions, `'stopped'` to DriveExitReason | 3 lines |
| 3 | `graph-orchestration.ts` | Check signal + abortable sleep in drive() | ~15 lines |
| 4 | `workspace-domain.ts` | Add `WorkflowExecution` channel | 1 line |
| 5 | `create-execution-manager.ts` | Factory: resolve deps, create manager | ~20 lines |
| 6 | `workflow-execution-manager.ts` | The manager class | ~200 lines |
| 7 | `execution-registry.ts` | Read/write registry JSON | ~40 lines |
| 8 | `get-manager.ts` | globalThis getter function | ~10 lines |
| 9 | `instrumentation.ts` | Bootstrap manager | ~15 lines |
| 10 | `workflow-execution-route.ts` | ServerEventRouteDescriptor | ~25 lines |
| 11 | `state-connector.tsx` | Add route to array | 1 line |
| 12 | `layout.tsx` (workspace) | Add channel to SSE list | 1 line |
| 13 | `workflow-actions.ts` | 4 server actions | ~30 lines |
| 14 | `workflow-temp-bar.tsx` | Run/Stop/Restart buttons | ~60 lines |
| 15 | `di-container.ts` | Register orchestration services | ~5 lines |

**Total new code: ~425 lines** across 15 files. Of those, only `workflow-execution-manager.ts` (~200 lines) is genuinely "new logic". Everything else is wiring, types, and thin wrappers.

---

## Open Questions

### Q1: Where should the execution registry file live?

**RESOLVED**: User-level `~/.chainglass/execution-registry.json`. This gives cross-workspace visibility from one file, supports the `listRunning()` API across all workspaces, and doesn't pollute any specific worktree.

### Q2: Should pods be killed on stop()?

**RESOLVED**: No. Stop = stop the drive() loop. Running pods finish naturally (fire-and-forget). Their results land on disk and are settled on next drive(). This is safer and matches ADR-0012 (events on disk are the sole interface). Restart = hard reset that kills pods via `podManager.destroyAllPods()`.

### Q3: What if a pod's process died with the server?

**OPEN — leaning toward Option A**:
- **Option A (MVP)**: On resume, nodes stuck in 'starting'/'agent-accepted' stay there. ONBAS skips them (in-flight). The drive() loop idles. User can manually restart those nodes or restart the whole workflow.
- **Option B (future)**: Add a "stale pod detector" that marks nodes as 'blocked-error' if they've been in 'starting' for >5 minutes with no events on disk. This would let ONBAS see them as failed and potentially retry.

### Q4: Should the manager also track per-node status?

**RESOLVED**: No. The manager tracks execution-level state (running/stopped/etc). Per-node status is already handled by the existing file-watcher → SSE → UI pipeline. The manager doesn't duplicate that — it adds the missing orchestration-level state on top.

### Q5: How does the UI know which worktreePath to pass?

**RESOLVED**: The workflow page already runs in the context of a specific workspace + worktree. The worktreePath is available from the page's URL params (same as other workflow actions). The server action receives it as a parameter.

### Q6: Thread safety of the executions Map?

**RESOLVED**: Not a concern. Node.js is single-threaded. All Map operations are synchronous. The `drive()` loops yield during I/O (sleep, file reads), but the event loop guarantees that Map access is never concurrent. No locks needed.

---

## Summary: Why This Design Is Approachable

| Property | How |
|----------|-----|
| **Central** | One singleton manages all workflows. No distributed coordination. |
| **Cross-worktree** | Compound key isolates worktrees. One Map holds everything. |
| **Survives restart** | Lightweight JSON registry + idempotent `drive()` = "just resume". |
| **Self-reporting** | Manager IS the caller of `drive()`, so it sees all events directly. No extra pubsub. |
| **Thin surface** | 4 server actions, each 5-8 lines. All logic in one manager class. |
| **Follows patterns** | globalThis singleton (Plan 027), ServerEventRoute (Plan 072), DI factories (existing). |
| **No new infrastructure** | Uses existing SSE mux, GlobalState, DI, filesystem. Zero new services to deploy. |
| **~425 lines total** | Most of it is wiring. One file (~200 lines) has the actual logic. |
