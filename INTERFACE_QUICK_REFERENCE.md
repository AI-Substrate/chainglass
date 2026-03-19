# Workflow Execution Interface Contracts — Quick Reference

## 🎯 All 11 Interface Contracts at a Glance

| Contract | File | Purpose | Key Methods |
|----------|------|---------|-------------|
| **IC-01** `IOrchestrationService` | `orchestration-service.types.ts` | Singleton factory | `get(ctx, graphSlug)`, `evict()` |
| **IC-02** `IGraphOrchestration` | `orchestration-service.types.ts` | Per-graph orchestration handle | `run()`, `drive()`, `getReality()`, `cleanup()` |
| **IC-03** `DriveEvent` | `orchestration-service.types.ts` | Telemetry union | `type: 'iteration'\|'idle'\|'status'\|'error'` |
| **IC-04** `DriveResult` | `orchestration-service.types.ts` | Loop exit result | `exitReason`, `iterations`, `totalActions` |
| **IC-05** `IAgentAdapter` | `agent-adapter.interface.ts` | Agent execution adapter | `run()`, `compact()`, `terminate()` |
| **IC-06** `IPodManager` | `pod-manager.types.ts` | Pod lifecycle + persistence | `createPod()`, `destroyAllPods()`, `persistSessions()` |
| **IC-07** `IONBAS` | `onbas.types.ts` | Next-best-action service | `getNextAction(reality)` |
| **IC-08** `HarnessEnvelope` | `harness/cli/output.ts` | CLI output contract | `formatSuccess()`, `formatError()`, helpers |
| **IC-09** SSE Events | `workflow-execution-route.ts` | Browser event mapping | `execution-update`, `execution-removed` |
| **IC-10** `IWorkflowExecutionManager` | `workflow-execution-manager.types.ts` | Execution lifecycle | `start()`, `stop()`, `restart()`, `resumeAll()` |
| **IC-11** `WorkspaceContext` | `workspace-context.interface.ts` | Workspace resolution | `workspaceSlug`, `worktreePath`, etc. |

---

## 🔀 One-Page Call Chain

```
┌─ WEB UI (React)
│
├─ [server action] workflowExecutionActions.start()
│   ↓
├─ WorkflowExecutionManager.start(ctx, graphSlug)
│   ├─ ctx: WorkspaceContext (IC-11)
│   ├─ Creates ExecutionHandle
│   ├─ Creates AbortController
│   │   ↓
│   └─ OrchestratedService.get(ctx, graphSlug) → IGraphOrchestration (IC-01, IC-02)
│       ↓
│       ├─ orchestration.drive(options: DriveOptions)
│       │   ├─ onEvent: (event: DriveEvent) ← IC-03
│       │   ├─ signal: AbortSignal ← IC-10 AbortController
│       │   │
│       │   └─ LOOP:
│       │       ├─ run() → OrchestrationRunResult
│       │       │   ├─ 1. EHS.processGraph() [settle events]
│       │       │   ├─ 2. buildReality()
│       │       │   ├─ 3. IONBAS.getNextAction() [IC-07]
│       │       │   │   └─ visitNode() switches on ExecutionStatus
│       │       │   ├─ 4. Check: if no-action return
│       │       │   ├─ 5. ODS.execute(request)
│       │       │   │   └─ IPodManager.createPod() [IC-06]
│       │       │   │       └─ IWorkUnitPod.execute()
│       │       │   │           └─ AgentPod: IAgentAdapter.run() [IC-05]
│       │       │   │               ├─ input: AgentRunOptions
│       │       │   │               └─ output: AgentResult
│       │       │   ├─ 6. onEvent(DriveEvent) callback [IC-03]
│       │       │   │   └─ broadcast via ISSEBroadcaster
│       │       │   │       └─ execution-update SSE event [IC-09]
│       │       │   └─ 7. Record OrchestrationAction
│       │       │
│       │       └─ [REPEAT] until DriveExitReason [IC-04]
│       │
│       └─ Returns DriveResult [IC-04]
│           ├─ exitReason: complete|failed|max-iterations|stopped
│           ├─ iterations: number
│           └─ totalActions: number
│
├─ Server broadcasts execution-update events to browsers [IC-09]
│   └─ Maps to GlobalState paths: workflow-execution:{key}:status, etc.
│
└─ Browser renders execution status via GlobalState subscriptions
```

---

## 🌊 DriveEvent Flow (Telemetry Streaming)

```typescript
// From orchestration.drive() → onEvent callback

DriveEvent examples:

1. ITERATION (complete run() execution)
   {
     type: 'iteration',
     message: 'Completed iteration 5 of max 200',
     data: OrchestrationRunResult {
       actions: [
         { request, result, timestamp },
         { request, result, timestamp },
       ],
       stopReason: 'no-action' | 'complete' | 'failed',
       finalReality: PositionalGraphReality,
       iterations: 5,
     }
   }

2. IDLE (no actions in this iteration)
   {
     type: 'idle',
     message: 'No actions available. Polling in 10 seconds...',
   }

3. STATUS (progress update)
   {
     type: 'status',
     message: 'Node xyz started',
   }

4. ERROR (unrecoverable error)
   {
     type: 'error',
     message: 'Pod execution failed',
     error: { code, message, details? },
   }
```

---

## 🔌 HarnessEnvelope Format (CLI Output Contract)

```typescript
// All harness CLI commands emit this JSON to stdout

{
  command: 'build' | 'test' | 'health' | etc.,
  status: 'ok' | 'error' | 'degraded',
  timestamp: '2025-03-16T18:00:00Z',
  data?: { /* command-specific data */ },
  error?: {
    code: 'E101' | 'E102' | /* ErrorCode */,
    message: 'Human readable message',
    details?: { /* error context */ },
  },
}

// Exit codes:
// - 0 for status='ok' or 'degraded'
// - 1 for status='error'
```

---

## 📊 ExecutionStatus Progression (Node Lifecycle)

```
pending
  ↓ [inputs available]
ready
  ↓ [ODS starts pod]
starting
  ↓ [agent accepts prompt]
agent-accepted
  ├→ waiting-question [user interaction needed]
  │  ↓ [question answered via event]
  │  → agent-accepted
  ├→ blocked-error [unrecoverable failure]
  └→ complete [execution finished]
```

---

## 🎛️ IPodManager Session Persistence

```typescript
// Session lifecycle:

1. createPod(nodeId, params)     // AgentPod or CodePod created (in-memory)
   ↓
2. pod.execute(options)          // Agent runs, returns sessionId
   ↓
3. podManager.setSessionId(nodeId, sessionId)  // Record in memory
   ↓
4. [node may ask question or fail]
   ↓
5. podManager.persistSessions(ctx, graphSlug)  // Write to disk
   ├─ File: {worktreePath}/.chainglass/pods/{graphSlug}.json
   └─ Format: { nodeId → sessionId }
   ↓
6. [on restart/resume]
   ↓
7. podManager.loadSessions(ctx, graphSlug)  // Rehydrate from disk
   ↓
8. pod.execute() with sessionId  // Resume session for resumption

// destroyAllPods() [Plan 074]:
// - Terminates all active pods via adapter.terminate()
// - Session IDs retained on disk
// - Called by cleanup() or orchestrationHandle.stop()
```

---

## 🎯 ManagerExecutionStatus State Machine (IC-10)

```
idle
  ↓ [manager.start()]
starting
  ↓ [drive() begins]
running
  ├→ [manager.stop() signal]
  │  ↓
  │  stopping
  │  ↓ [drive() receives abort]
  │  stopped
  ├→ [graph completes]
  │  ↓
  │  completed
  └→ [unrecoverable error]
     ↓
     failed
```

---

## 🚀 Starting Orchestration (Complete Example)

```typescript
// Caller (server action):
const result = await workflowExecutionManager.start(
  {
    workspaceSlug: 'my-workspace',
    worktreePath: '/home/user/workspace/my-repo',
  },
  'graph-001'  // graphSlug
);

// Inside WorkflowExecutionManager.start():
1. Create ExecutionHandle with key = base64url(worktreePath:graphSlug)
2. ctx = WorkspaceContext (IC-11) - already resolved
3. orchestrationService.get(ctx, graphSlug) → IGraphOrchestration
4. orchestrationHandle.drive({
     maxIterations: 200,
     actionDelayMs: 100,
     idleDelayMs: 10_000,
     onEvent: (event: DriveEvent) => {
       // Update ExecutionHandle
       status = ManagerExecutionStatus
       iterations = event.data?.iterations
       lastEventType = event.type
       lastMessage = event.message
       
       // Broadcast SSE event
       broadcaster.send('workflow-execution', {
         type: 'execution-update',
         key: handle.key,
         status, iterations, lastEventType, lastMessage,
       })
     },
     signal: handle.controller.signal,
   })

5. Returns DriveResult { exitReason, iterations, totalActions }
```

---

## 📋 All ExecutionStatus Values (Node-level)

```typescript
type ExecutionStatus =
  | 'pending'           // Waiting for readiness conditions
  | 'ready'             // All conditions met, can start
  | 'starting'          // Pod is being created
  | 'agent-accepted'    // Agent acknowledged prompt
  | 'waiting-question'  // Awaiting user Q&A response
  | 'blocked-error'     // Unrecoverable error
  | 'restart-pending'   // Queued for restart after event
  | 'interrupted'       // Interrupt signal received
  | 'complete';         // Execution finished
```

---

## 🔗 Dependency Graph

```
IWorkflowExecutionManager (IC-10)
  ├─ IOrchestrationService (IC-01)
  │   └─ IGraphOrchestration (IC-02)
  │       ├─ IONBAS (IC-07)
  │       ├─ IPodManager (IC-06)
  │       │   ├─ IWorkUnitPod
  │       │   │   ├─ IAgentAdapter (IC-05)
  │       │   │   └─ IScriptRunner
  │       │   └─ Session persistence
  │       └─ IEventHandlerService
  ├─ ISSEBroadcaster
  │   └─ DriveEvent (IC-03) → execution-update (IC-09)
  ├─ IWorkspaceService
  └─ IExecutionRegistry (Phase 5)

WorkspaceContext (IC-11)
  ├─ Required by IOrchestrationService.get()
  └─ Required by all orchestration operations

HarnessEnvelope (IC-08)
  └─ Used by subprocess CLI communication
```

---

## 💾 Storage Contracts

```
Sessions:
  {worktreePath}/.chainglass/pods/{graphSlug}.json
  Format: { nodeId: sessionId, ... }

Execution Registry (Phase 5):
  TBD — For restart recovery on server restart

Graph State:
  Loaded/persisted via IPositionalGraphService
  Mutated by: EHS.processGraph() → EventHandlerService
```

---

## ✅ Checklist: Adding New Orchestration Feature

```
□ Does it involve starting/stopping orchestration?
  → Interact with IWorkflowExecutionManager (IC-10)

□ Does it need to run orchestration loop?
  → Use IGraphOrchestration.drive() with DriveOptions (IC-02, IC-04)
  → Listen to DriveEvent callbacks (IC-03)

□ Need to execute an agent?
  → Use IAgentAdapter via IPodManager (IC-05, IC-06)

□ Need to determine next action?
  → Call IONBAS.getNextAction() (IC-07)

□ Integrating workspace resolution?
  → Use WorkspaceContext (IC-11)

□ Harness CLI integration?
  → Emit HarnessEnvelope JSON (IC-08)

□ Need browser event updates?
  → Emit via ISSEBroadcaster → execution-update (IC-09, IC-10)
```

