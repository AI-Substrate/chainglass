# Workflow Execution & Harness Integration Interface Documentation

## IC-01: IOrchestrationService
**Location**: `packages/positional-graph/src/features/030-orchestration/orchestration-service.types.ts`

Singleton factory for per-graph orchestration handles. Provides handle caching by graphSlug.

```typescript
interface IOrchestrationService {
  get(ctx: WorkspaceContext, graphSlug: string): Promise<IGraphOrchestration>;
  evict(worktreePath: string, graphSlug: string): void;
}
```

**Methods**:
- `get()`: Creates or returns cached IGraphOrchestration handle for a graph
- `evict()`: Removes cached handle to force fresh creation on next get()

**Caller**: WorkflowExecutionManager (Plan 074)

---

## IC-02: IGraphOrchestration (GraphOrchestrationHandle)
**Location**: `packages/positional-graph/src/features/030-orchestration/orchestration-service.types.ts`

Per-graph orchestration handle implementing the Settle→Decide→Act loop.
Implementation: `GraphOrchestration` class in `graph-orchestration.ts`

```typescript
interface IGraphOrchestration {
  readonly graphSlug: string;
  run(): Promise<OrchestrationRunResult>;
  drive(options?: DriveOptions): Promise<DriveResult>;
  getReality(): Promise<PositionalGraphReality>;
  cleanup(): Promise<void>;
}
```

**Methods**:
- `run()`: Single orchestration loop iteration (settle→build reality→ONBAS→exit check→ODS)
- `drive()`: Repeatedly calls run() until graph completes or exits (agent-agnostic polling)
- `getReality()`: Fresh PositionalGraphReality snapshot (read-only)
- `cleanup()`: Terminate all running pods and persist sessions (Plan 074)

**Loop Pattern** (in run()):
1. EHS.processGraph() — settle pending events
2. buildPositionalGraphReality() — snapshot graph
3. ONBAS.getNextAction() — decide what to do
4. Exit check — return if no-action
5. ODS.execute() — act on decision
6. Record action — timestamp and store

---

## IC-03: DriveEvent (Telemetry Contract)
**Location**: `packages/positional-graph/src/features/030-orchestration/orchestration-service.types.ts`

Discriminated union of events emitted during drive() execution. Orchestration-domain only.

```typescript
type DriveEvent =
  | { readonly type: 'iteration'; readonly message: string; readonly data: OrchestrationRunResult }
  | { readonly type: 'idle'; readonly message: string }
  | { readonly type: 'status'; readonly message: string }
  | { readonly type: 'error'; readonly message: string; readonly error?: unknown };

type DriveEventType = DriveEvent['type'];
```

**Event Types**:
- `iteration`: Single run() completed; contains full OrchestrationRunResult (actions, stopReason, finalReality)
- `idle`: No-action iteration (all-running, all-waiting, empty, transition-blocked)
- `status`: General status message
- `error`: Orchestration error with optional error details

**Data Carried**:
- `message`: Always present (human-readable)
- `data`: Only on 'iteration' events (OrchestrationRunResult with actions array)
- `error`: Only on 'error' events (optional details)

---

## IC-04: DriveResult (Drive Exit Contract)
**Location**: `packages/positional-graph/src/features/030-orchestration/orchestration-service.types.ts`

Return value of drive() when loop exits.

```typescript
interface DriveResult {
  readonly exitReason: DriveExitReason;
  readonly iterations: number;
  readonly totalActions: number;
}

type DriveExitReason = 'complete' | 'failed' | 'max-iterations' | 'stopped';
```

**Fields**:
- `exitReason`: Why drive() stopped
  - `complete`: Graph reached terminal success
  - `failed`: Graph reached terminal failure
  - `max-iterations`: Safety guard (default 200) tripped
  - `stopped`: User-initiated abort via AbortSignal (Plan 074)
- `iterations`: Total run() calls executed
- `totalActions`: Sum of all OrchestrationAction arrays across iterations

**DriveOptions** (for drive() call):
```typescript
interface DriveOptions {
  readonly maxIterations?: number;           // Default: 200
  readonly actionDelayMs?: number;            // Default: 100 (after action-producing iteration)
  readonly idleDelayMs?: number;              // Default: 10_000 (after no-action iteration)
  readonly onEvent?: (event: DriveEvent) => void | Promise<void>;
  readonly signal?: AbortSignal;              // For cooperative cancellation
}
```

---

## IC-05: IAgentAdapter (Agent Execution Contract)
**Location**: `packages/shared/src/interfaces/agent-adapter.interface.ts`

Interface for AI coding agent adapters. All methods return Promise for long-running ops.

```typescript
interface IAgentAdapter {
  run(options: AgentRunOptions): Promise<AgentResult>;
  compact(sessionId: string): Promise<AgentResult>;
  terminate(sessionId: string): Promise<AgentResult>;
}
```

**Methods**:
- `run()`: Execute prompt through agent. Returns AgentResult with output, sessionId, status, exitCode, tokens
- `compact()`: Send /compact command to reduce context. Returns AgentResult with updated token counts
- `terminate()`: Terminate running session. Returns AgentResult with status='killed' (10s timeout)

**AgentRunOptions**:
```typescript
interface AgentRunOptions {
  readonly prompt: string;
  readonly sessionId?: string;               // Resume existing or create new
  readonly cwd?: string;                      // Working directory
  readonly onEvent?: AgentEventHandler;       // Real-time streaming events
  readonly model?: string;                    // e.g., "gpt-5.4", "claude-sonnet-4"
  readonly reasoningEffort?: CopilotReasoningEffort;
  readonly timeout?: number;                  // Wait timeout (ms), not hard execution timeout
}
```

**AgentResult**:
```typescript
interface AgentResult {
  readonly output: string;
  readonly sessionId: string;
  readonly status: AgentStatus;              // 'completed' | 'failed' | 'killed'
  readonly exitCode: number;                 // 0 for success
  readonly stderr?: string;
  readonly tokens: TokenMetrics | null;      // Null when unavailable (e.g., Copilot)
}

interface TokenMetrics {
  readonly used: number;      // Current turn
  readonly total: number;     // Cumulative session
  readonly limit: number;     // Context window
}
```

---

## IC-06: IPodManager (Pod Lifecycle Contract)
**Location**: `packages/positional-graph/src/features/030-orchestration/pod-manager.types.ts`

Manages pod lifecycle and session persistence for a graph. One IPodManager per graph.

```typescript
interface IPodManager {
  createPod(nodeId: string, params: PodCreateParams): IWorkUnitPod;
  getPod(nodeId: string): IWorkUnitPod | undefined;
  getSessionId(nodeId: string): string | undefined;
  setSessionId(nodeId: string, sessionId: string): void;
  destroyPod(nodeId: string): Promise<void>;
  destroyAllPods(): Promise<void>;
  getSessions(): ReadonlyMap<string, string>;
  loadSessions(ctx: { readonly worktreePath: string }, graphSlug: string): Promise<void>;
  persistSessions(ctx: { readonly worktreePath: string }, graphSlug: string): Promise<void>;
}

type PodCreateParams =
  | { readonly unitType: 'agent'; readonly unitSlug: string; readonly agentInstance: IAgentInstance }
  | { readonly unitType: 'code'; readonly unitSlug: string; readonly runner: IScriptRunner; readonly scriptPath: string };
```

**Lifecycle Methods**:
- `createPod()`: Create new pod or return existing for node. Throws for user-input nodes.
- `getPod()`: Get active pod (if any)
- `destroyPod()`: Terminate then remove pod for single node. Session ID retained.
- `destroyAllPods()`: Terminate and destroy ALL pods (Plan 074: needed for stop/restart)

**Session Methods**:
- `getSessionId()`: Retrieve stored session ID (available after pod destroyed)
- `setSessionId()`: Record session ID after pod.execute returns
- `getSessions()`: Get all tracked sessions (ReadonlyMap<nodeId, sessionId>)
- `loadSessions()`: Rehydrate persisted sessions from disk (no error if missing)
- `persistSessions()`: Persist sessions to disk (atomic write: temp-then-rename)

---

## IC-07: IONBAS (Next-Best-Action Service Contract)
**Location**: `packages/positional-graph/src/features/030-orchestration/onbas.types.ts`

Pure, synchronous, stateless service for determining next orchestration action.

```typescript
interface IONBAS {
  getNextAction(reality: PositionalGraphReality): OrchestrationRequest;
}
```

**Method**:
- `getNextAction()`: Takes graph reality snapshot, returns OrchestrationRequest for next action

**Node Status Handling** (via visitNode() in implementation):
```
status: ExecutionStatus:
  'complete' → return null (skip node)
  'starting' / 'agent-accepted' → return null (skip, already running)
  'waiting-question' → return null (skip, awaiting answer)
  'blocked-error' → return null (skip, cannot recover)
  'interrupted' → return null (skip, interrupted)
  'ready' → return StartNodeRequest (except for user-input nodes, which return null)
  'pending' → return null (skip, not ready)
```

**Exit Logic** (walkForNextAction):
Returns NoActionRequest with reason when graph cannot proceed:
- No startable nodes found
- All running (serial waiting for parallel completion)
- All waiting (on questions)
- All blocked (errors)
- Line transition blocked (serial line not yet triggered)

---

## IC-08: HarnessEnvelope (CLI Subprocess Contract)
**Location**: `harness/src/cli/output.ts`

Canonical JSON envelope format for all harness CLI commands. Exit codes: 0 for ok/degraded, 1 for error only.

```typescript
type HarnessStatus = 'ok' | 'error' | 'degraded';

interface ErrorDetail {
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

interface HarnessEnvelope {
  readonly command: string;
  readonly status: HarnessStatus;
  readonly timestamp: string;          // ISO 8601 datetime
  readonly data?: unknown;             // Success data payload
  readonly error?: ErrorDetail;        // Only when status='error'
}
```

**Error Codes** (E100-E110 range):
```
E100: UNKNOWN
E101: CONTAINER_NOT_RUNNING
E102: BUILD_FAILED
E103: HEALTH_FAILED
E104: CDP_UNAVAILABLE
E105: TEST_FAILED
E106: SCREENSHOT_FAILED
E107: RESULTS_NOT_FOUND
E108: INVALID_ARGS
E109: TIMEOUT
E110: DOCKER_UNAVAILABLE
E120: AGENT_EXECUTION_FAILED
E121: AGENT_NOT_FOUND
E122: AGENT_AUTH_MISSING
E123: AGENT_TIMEOUT
E124: AGENT_VALIDATION_FAILED
E125: AGENT_RUN_FOLDER_FAILED
E126: CONSOLE_LOGS_FAILED
```

**Helper Functions**:
```typescript
formatSuccess<T>(command: string, data: T, status?: 'ok' | 'degraded'): HarnessEnvelope
formatError(command: string, code: HarnessErrorCode, message: string, details?: unknown): HarnessEnvelope
parseEnvelope(json: string): HarnessEnvelope
printEnvelope(envelope: HarnessEnvelope): void
exitWithEnvelope(envelope: HarnessEnvelope): never
```

**Pattern**: Agents parse JSON envelope from harness stdout to determine success/failure and extract data.

---

## IC-09: SSE Workflow Execution Events (Server-to-Browser Contract)
**Location**: `apps/web/src/lib/state/workflow-execution-route.ts`

Server-sent events for workflow execution state updates mapped to GlobalStateSystem.

```typescript
ServerEvent types:
  { type: 'execution-update', key: string, status: ManagerExecutionStatus, iterations: number, lastEventType: string, lastMessage: string }
  { type: 'execution-removed', key: string }

State Domain: 'workflow-execution'
State Paths:
  workflow-execution:{key}:status          → ManagerExecutionStatus
  workflow-execution:{key}:iterations      → number
  workflow-execution:{key}:lastEventType   → string (DriveEventType)
  workflow-execution:{key}:lastMessage     → string
```

**Event Mapping** (mapEvent):
- `execution-update`: Sets all four properties above
- `execution-removed`: Removes status property (cascade removal)

**ExecutionKey Format**: Base64url-encoded `${worktreePath}:${graphSlug}` (safe for GlobalState paths)

---

## IC-10: IWorkflowExecutionManager (Workflow Execution Orchestrator)
**Location**: `apps/web/src/features/074-workflow-execution/workflow-execution-manager.types.ts`

Manager for workflow execution lifecycle. Bridges WorkflowExecutionManager service and orchestration.

```typescript
interface IWorkflowExecutionManager {
  start(ctx: { workspaceSlug: string; worktreePath: string }, graphSlug: string): Promise<StartResult>;
  stop(worktreePath: string, graphSlug: string): Promise<StopResult>;
  restart(ctx: { workspaceSlug: string; worktreePath: string }, graphSlug: string): Promise<StartResult>;
  getStatus(worktreePath: string, graphSlug: string): ManagerExecutionStatus;
  getHandle(worktreePath: string, graphSlug: string): ExecutionHandle | undefined;
  getSerializableStatus(worktreePath: string, graphSlug: string): SerializableExecutionStatus | undefined;
  listRunning(): ExecutionHandle[];
  cleanup(): Promise<void>;
  resumeAll(): Promise<void>;
}

type ManagerExecutionStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'completed' | 'failed';

interface ExecutionHandle {
  readonly key: ExecutionKey;
  readonly worktreePath: string;
  readonly graphSlug: string;
  readonly workspaceSlug: string;
  status: ManagerExecutionStatus;
  controller: AbortController | null;           // For cancellation
  drivePromise: Promise<DriveResult> | null;
  orchestrationHandle: IGraphOrchestration | null;
  iterations: number;
  totalActions: number;
  lastEventType: string;
  lastMessage: string;
  startedAt: string | null;
  stoppedAt: string | null;
}

interface SerializableExecutionStatus {
  readonly key: ExecutionKey;
  readonly worktreePath: string;
  readonly graphSlug: string;
  readonly workspaceSlug: string;
  readonly status: ManagerExecutionStatus;
  readonly iterations: number;
  readonly totalActions: number;
  readonly lastEventType: string;
  readonly lastMessage: string;
  readonly startedAt: string | null;
  readonly stoppedAt: string | null;
}
```

**Lifecycle Methods**:
- `start()`: Initiate execution (creates AbortController, calls drive() with onEvent callback for SSE broadcasts)
- `stop()`: Graceful abort via signal (sets status→stopping→stopped, calls orchestrationHandle.cleanup())
- `restart()`: Evict handle, terminate pods, start fresh execution
- `resumeAll()`: Called on server startup; resumes persisted executions from registry (Phase 5)
- `cleanup()`: Terminate all active executions

**Status/Query Methods**:
- `getStatus()`: Current ManagerExecutionStatus for execution
- `getHandle()`: Raw ExecutionHandle (non-serializable fields: AbortController, Promise)
- `getSerializableStatus()`: Safe snapshot for server actions (excludes non-serializable fields)
- `listRunning()`: All active execution handles

**Dependencies** (ExecutionManagerDeps):
- `orchestrationService`: IOrchestrationService
- `graphService`: IPositionalGraphService
- `workspaceService`: IWorkspaceService
- `broadcaster`: ISSEBroadcaster (sends execution-update events)
- `registry`: IExecutionRegistry (persistent state for restart recovery)
- `worktreeExists`: Validation function for resume

---

## IC-11: WorkspaceContext (Required for Orchestration Startup)
**Location**: `packages/workflow/src/interfaces/workspace-context.interface.ts`

Context resolved from filesystem path. Required to run orchestration.

```typescript
interface WorkspaceContext {
  readonly workspaceSlug: string;              // URL-safe identifier
  readonly workspaceName: string;
  readonly workspacePath: string;              // Root path of registered workspace
  readonly worktreePath: string;               // Current worktree (may differ in git worktrees)
  readonly worktreeBranch: string | null;      // Current branch (null if main worktree)
  readonly isMainWorktree: boolean;
  readonly hasGit: boolean;
}
```

**Usage**: Passed to IOrchestrationService.get() and used throughout orchestration for:
- File operations (worktreePath)
- Session/pod persistence paths
- Graph state loading/persisting
- Workspace identification for registry

---

## Summary: Workflow Execution Flow

```
IWorkflowExecutionManager.start()
  ↓
IOrchestrationService.get(ctx, graphSlug) → IGraphOrchestration
  ↓
IGraphOrchestration.drive(options)
  ├─ onEvent: DriveEvent callback → SSE broadcast (execution-update)
  ├─ signal: AbortSignal for cancellation
  │
  └─ Loop: run() until DriveExitReason
      ├─ 1. EHS.processGraph() (settle)
      ├─ 2. buildReality() → PositionalGraphReality
      ├─ 3. IONBAS.getNextAction() → OrchestrationRequest
      ├─ 4. Exit check (no-action?)
      └─ 5. IODS.execute(request)
            └─ IPodManager.createPod() → IWorkUnitPod
                 ├─ AgentPod: IAgentAdapter.run() → AgentResult
                 └─ CodePod: IScriptRunner.run() → ScriptRunResult

IPodManager.persistSessions() → SSE workflow-execution:{key}:status events

Harness CLI (subprocess):
  ├─ Receives HarnessEnvelope JSON on stdout
  ├─ Parses status, errorCode (if status='error')
  └─ Extracts data payload
```

