# Workflow Execution & Harness Integration — Master Index

**Created**: 2025-03-16  
**Contracts Documented**: 11 (IC-01 through IC-11)  
**Scope**: Orchestration interfaces, pod lifecycle, agent execution, CLI contracts, event streaming

---

## 📚 Documentation Files

This analysis contains **three companion documents**:

### 1. **INTERFACE_CONTRACTS.md** (457 lines) — COMPREHENSIVE REFERENCE
Full specifications for all 11 interfaces with:
- Complete type signatures
- Method descriptions
- Data structures and enums
- Event type details
- Status handling logic
- File references

**Use when**: You need complete technical specifications or are implementing an interface.

### 2. **INTERFACE_QUICK_REFERENCE.md** (342 lines) — DEVELOPER CHEATSHEET
One-page visual reference with:
- Table of all contracts
- Call chains and control flows
- State machines and progression diagrams
- Persistence contracts
- Dependency graphs
- Implementation checklist

**Use when**: You're working quickly and need to understand interactions at a glance.

### 3. **INTERFACE_INDEX.md** (this file)
Navigation guide and summary for all documentation.

**Use when**: You need to find something or understand the scope of this analysis.

---

## 🎯 The 11 Interface Contracts

### Core Orchestration (IC-01 through IC-04)

| ID | Interface | File | Key Purpose |
|----|-----------|------|-------------|
| **IC-01** | `IOrchestrationService` | `orchestration-service.types.ts` | Singleton factory for per-graph orchestration handles |
| **IC-02** | `IGraphOrchestration` | `orchestration-service.types.ts`<br>`graph-orchestration.ts` | Per-graph handle; implements Settle→Decide→Act loop |
| **IC-03** | `DriveEvent` | `orchestration-service.types.ts` | Telemetry discriminated union (iteration\|idle\|status\|error) |
| **IC-04** | `DriveResult` + `DriveOptions` | `orchestration-service.types.ts` | Drive() exit contract + configuration |

### Execution Adapters (IC-05 through IC-07)

| ID | Interface | File | Key Purpose |
|----|-----------|------|-------------|
| **IC-05** | `IAgentAdapter` | `agent-adapter.interface.ts`<br>`agent-types.ts` | Agent execution: run(), compact(), terminate() |
| **IC-06** | `IPodManager` | `pod-manager.types.ts` | Pod lifecycle + session persistence |
| **IC-07** | `IONBAS` | `onbas.types.ts`<br>`onbas.ts` | Next-best-action decision service |

### Integration Contracts (IC-08 through IC-10)

| ID | Interface | File | Key Purpose |
|----|-----------|------|-------------|
| **IC-08** | `HarnessEnvelope` | `harness/cli/output.ts` | CLI subprocess JSON output contract |
| **IC-09** | SSE Event Mapping | `workflow-execution-route.ts` | Server-to-browser event contract |
| **IC-10** | `IWorkflowExecutionManager` | `workflow-execution-manager.types.ts` | Execution lifecycle orchestrator |

### Context (IC-11)

| ID | Interface | File | Key Purpose |
|----|-----------|------|-------------|
| **IC-11** | `WorkspaceContext` | `workspace-context.interface.ts` | Filesystem→workspace resolution |

---

## 🔄 System Architecture Overview

```
LAYER 1: WEB BROWSER (React)
  └─ GlobalState subscriptions to workflow-execution:* paths
     ← SSE events from server

LAYER 2: WEB SERVER (Next.js)
  └─ IWorkflowExecutionManager (IC-10)
     ├─ start() → creates ExecutionHandle
     ├─ Broadcasts DriveEvent callbacks via ISSEBroadcaster
     └─ SSE contracts (IC-09)

LAYER 3: ORCHESTRATION ENGINE (Graph Processing)
  └─ IOrchestrationService (IC-01)
     └─ IGraphOrchestration (IC-02) → drive()
        ├─ LOOP: run() iteration
        ├─ IONBAS.getNextAction() (IC-07)
        ├─ DriveEvent telemetry (IC-03)
        └─ DriveResult on exit (IC-04)

LAYER 4: POD EXECUTION (Agent & Code)
  └─ IPodManager (IC-06)
     ├─ AgentPod: IAgentAdapter (IC-05)
     └─ CodePod: IScriptRunner

LAYER 5: CLI HARNESS (Subprocess)
  └─ HarnessEnvelope (IC-08)
     └─ JSON output contract for parent process

CONTEXT: WorkspaceContext (IC-11)
  └─ Required everywhere above for file I/O and identification
```

---

## 🌊 Main Execution Flow

### Scenario: "Start Orchestration from Web UI"

```
1. User clicks "Run Graph" button in browser

2. WEB: server action workflowExecutionActions.start()
   └─ Calls: IWorkflowExecutionManager.start(ctx, graphSlug)

3. MANAGER: Create ExecutionHandle
   ├─ key = base64url(worktreePath:graphSlug)
   ├─ status = 'starting'
   ├─ controller = new AbortController()
   └─ Resolve WorkspaceContext (IC-11)

4. MANAGER: Obtain orchestration handle
   └─ orchestrationService.get(ctx, graphSlug) → IGraphOrchestration

5. ORCHESTRATION: Start drive() loop
   └─ drive(options: {
        onEvent: (event: DriveEvent) ← IC-03
        signal: controller.signal ← IC-10
      })

6. LOOP ITERATION: run()
   ├─ 1. EHS.processGraph() [settle events]
   ├─ 2. buildReality() [snapshot]
   ├─ 3. IONBAS.getNextAction(reality) [IC-07 decide]
   ├─ 4. Exit check (if no-action, return)
   ├─ 5. IODS.execute(request)
   │   └─ IPodManager.createPod() [IC-06]
   │       └─ IWorkUnitPod.execute()
   │           └─ IAgentAdapter.run(options) [IC-05]
   │               ├─ input: AgentRunOptions
   │               └─ output: AgentResult
   ├─ 6. onEvent(DriveEvent) callback [IC-03]
   │   └─ MANAGER updates ExecutionHandle
   │   └─ ISSEBroadcaster.send() [IC-09]
   │       └─ Server sends execution-update event
   │           └─ Browser receives via SSE
   │               └─ GlobalState updates workflow-execution:* paths
   └─ 7. Record OrchestrationAction

7. LOOP: Repeat until DriveExitReason [IC-04]
   ├─ complete: graph succeeded
   ├─ failed: graph failed
   ├─ max-iterations: safety limit hit
   └─ stopped: user clicked Stop (signal received)

8. MANAGER: Handle.cleanup()
   └─ IPodManager.destroyAllPods() [IC-06]
   └─ IPodManager.persistSessions() [IC-06]

9. BROWSER: Re-render with final status
```

---

## 📊 Key Data Types Reference

### Status Values

```typescript
// Node-level (ExecutionStatus)
pending | ready | starting | agent-accepted | waiting-question 
| blocked-error | restart-pending | interrupted | complete

// Manager-level (ManagerExecutionStatus)
idle | starting | running | stopping | stopped | completed | failed

// Drive loop (DriveExitReason)
complete | failed | max-iterations | stopped

// Agent (AgentStatus)
completed | failed | killed

// Harness (HarnessStatus)
ok | error | degraded
```

### Key Events

```typescript
// DriveEvent (IC-03) - orchestration telemetry
{ type: 'iteration', message, data: OrchestrationRunResult }
{ type: 'idle', message }
{ type: 'status', message }
{ type: 'error', message, error? }

// SSE Event (IC-09) - browser update
{ type: 'execution-update', key, status, iterations, lastEventType, lastMessage }
{ type: 'execution-removed', key }

// HarnessEnvelope (IC-08) - CLI output
{ command, status, timestamp, data?, error? }
```

---

## 🔍 Quick Lookup by Task

### I need to...

**...understand how orchestration starts**
→ Read IC-10 (IWorkflowExecutionManager) then IC-01 (IOrchestrationService)

**...understand the orchestration loop**
→ Read IC-02 (IGraphOrchestration.run()) and IC-07 (IONBAS.getNextAction())

**...understand agent execution**
→ Read IC-05 (IAgentAdapter) and IC-06 (IPodManager)

**...understand event streaming to browser**
→ Read IC-03 (DriveEvent), IC-09 (SSE mapping), IC-10 (ExecutionManager broadcast)

**...understand CLI integration**
→ Read IC-08 (HarnessEnvelope)

**...understand session persistence**
→ Read IC-06 (IPodManager.persistSessions/loadSessions)

**...add a new orchestration feature**
→ Check INTERFACE_QUICK_REFERENCE.md "Checklist: Adding New Feature"

**...debug execution status**
→ Reference state machine in INTERFACE_QUICK_REFERENCE.md or ExecutionStatus enum in INTERFACE_CONTRACTS.md

---

## 📂 File Organization

```
/packages/positional-graph/src/features/030-orchestration/
├─ orchestration-service.types.ts          ← IC-01, IC-02, IC-03, IC-04
├─ orchestration-service.ts                ← IOrchestrationService impl
├─ graph-orchestration.ts                  ← IGraphOrchestration impl
├─ onbas.types.ts                          ← IC-07
├─ onbas.ts                                ← visitNode(), logic
├─ pod-manager.types.ts                    ← IC-06
├─ pod.types.ts                            ← IWorkUnitPod
├─ script-runner.types.ts                  ← IScriptRunner
├─ reality.types.ts                        ← ExecutionStatus enum

/packages/shared/src/interfaces/
├─ agent-adapter.interface.ts              ← IC-05
├─ agent-types.ts                          ← AgentResult, AgentRunOptions

/packages/workflow/src/interfaces/
├─ workspace-context.interface.ts          ← IC-11

/harness/src/cli/
├─ output.ts                               ← IC-08

/apps/web/src/features/074-workflow-execution/
├─ workflow-execution-manager.types.ts     ← IC-10
├─ workflow-execution-manager.ts           ← IWorkflowExecutionManager impl

/apps/web/src/lib/state/
├─ workflow-execution-route.ts             ← IC-09
```

---

## 🔑 Critical Concepts

### 1. **Two-Level Orchestration Pattern** (IC-01, IC-02)
- **Service-level**: IOrchestrationService (singleton, DI-registered)
- **Handle-level**: IGraphOrchestration (per-graph, cached by graphSlug)
- One WorkspaceContext → One service instance → Many handles (one per graph)

### 2. **Settle → Decide → Act Loop** (IC-02, IC-07)
The orchestration loop in `run()` repeats 7 steps:
1. EHS.processGraph() — settle pending events
2. buildReality() — snapshot entire graph
3. IONBAS.getNextAction() — decide what to do next
4. Exit check — return if no-action
5. ODS.execute() — act on the decision
6. onEvent(DriveEvent) — emit telemetry
7. Record OrchestrationAction

### 3. **Agent-Agnostic Polling** (IC-02, IC-04)
The `drive()` method knows nothing about agents, pods, or nodes.
It's a pure polling loop:
- Calls run() repeatedly
- Handles delays (actionDelayMs, idleDelayMs)
- Respects AbortSignal for cancellation
- Emits DriveEvent callbacks

### 4. **Pod Manager Persistence** (IC-06)
Sessions persist across pod destruction:
- Pod is ephemeral (in-memory, per execution)
- Session ID is durable (persisted to disk)
- On resume: load session → create new pod → pass sessionId to adapter

### 5. **SSE Broadcasting Architecture** (IC-09, IC-10)
ExecutionManager → ISSEBroadcaster → SSE channel → Browser → GlobalState
- Event: `execution-update` with (key, status, iterations, lastEventType, lastMessage)
- Mapped to GlobalState paths: `workflow-execution:{key}:status`, etc.

### 6. **ExecutionStatus Progression** (IC-07)
IONBAS.visitNode() switches on ExecutionStatus to decide if a node can start:
```
complete → skip
starting/agent-accepted → skip (already running)
waiting-question → skip (awaiting answer)
blocked-error → skip (unrecoverable)
interrupted → skip
ready → return StartNodeRequest (except user-input)
pending → skip (not ready)
```

---

## 🚀 Usage Examples

### Example 1: Start Orchestration
```typescript
// See IC-10 and INTERFACE_QUICK_REFERENCE "Starting Orchestration (Complete Example)"
```

### Example 2: Listen to Execution Events
```typescript
orchestrationHandle.drive({
  onEvent: (event: DriveEvent) => {
    switch (event.type) {
      case 'iteration':
        console.log(`Completed iteration`, event.data.iterations);
        break;
      case 'idle':
        console.log('Waiting for next action opportunity');
        break;
      case 'error':
        console.error('Orchestration error:', event.error);
        break;
    }
  },
});
```

### Example 3: Resume Session After Question
```typescript
// From pod result: { status: 'waiting-question', pendingQuestionId }
// User answers via question:answer event
// ODS restarts node with same sessionId
// IAgentAdapter.run() is called with sessionId (resumes existing session)
// Agent context is preserved across resumption
```

---

## ⚠️ Critical Contracts (Must Understand)

| Contract | Why Critical |
|----------|-------------|
| IC-02 | Core loop; if wrong, nothing works |
| IC-06 | Session persistence; loss = lost agent context |
| IC-07 | Decision logic; wrong = incorrect execution order |
| IC-10 | Execution lifecycle; must handle stop gracefully |

---

## 📋 Testing Considerations

- **IC-01/IC-02**: Mock IOrchestrationService; test handle caching
- **IC-03/IC-04**: Verify event emission; check exit reasons
- **IC-05**: Mock IAgentAdapter; test error handling, session resumption
- **IC-06**: Test pod creation/destruction; verify session persistence
- **IC-07**: Test visitNode() logic for each ExecutionStatus value
- **IC-08**: Verify HarnessEnvelope formatting; test error codes
- **IC-09**: Verify SSE events broadcast; check GlobalState mapping
- **IC-10**: Test state machine transitions; verify signal handling
- **IC-11**: Verify WorkspaceContext resolution; test worktree detection

---

## 🔗 Related Plans & Phases

- **Plan 030**: Orchestration service & graph processing core
- **Plan 036**: Drive loop, idle polling, event streaming
- **Plan 074**: Workflow execution from web UI (this analysis scope)
- **Plan 070**: Agent runner harness
- **Plan 014**: Workspace context & worktree discovery
- **Plan 059**: Server event routing & GlobalState integration

---

## 📝 Document Maintenance

**Last Updated**: 2025-03-16  
**Source Repository**: `/Users/jordanknight/substrate/074-actaul-real-agents`

To update:
1. Review affected interface files (listed in this index)
2. Update INTERFACE_CONTRACTS.md with new signatures
3. Update INTERFACE_QUICK_REFERENCE.md with new data types/flows
4. Update this index with new IDs (IC-12, IC-13, etc.)

---

## 📞 Quick Reference Links

- **Orchestration Loop**: INTERFACE_CONTRACTS.md IC-02 "Loop Pattern"
- **Event Flow**: INTERFACE_QUICK_REFERENCE.md "DriveEvent Flow"
- **Status Machine**: INTERFACE_QUICK_REFERENCE.md "ManagerExecutionStatus State Machine"
- **Starting Guide**: INTERFACE_QUICK_REFERENCE.md "Starting Orchestration (Complete Example)"
- **Dependency Graph**: INTERFACE_QUICK_REFERENCE.md "Dependency Graph"
- **Implementation Checklist**: INTERFACE_QUICK_REFERENCE.md "Checklist: Adding New Feature"

---

**End of Index**

