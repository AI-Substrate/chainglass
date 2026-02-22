# Workshop: Unified AgentInstance / AgentManagerService Design

**Type**: Integration Pattern
**Plan**: 033-real-agent-pods
**Spec**: (pending)
**Created**: 2026-02-16
**Status**: Draft
**Supersedes**: Workshop 01 (01-agent-service-for-pods.md)

**Related Documents**:
- `docs/plans/033-real-agent-pods/workshops/01-agent-service-for-pods.md` (prior exploration, superseded)
- `docs/plans/030-positional-orchestrator/workshops/04-work-unit-pods.md` (pod design)
- `docs/plans/030-positional-orchestrator/workshops/03-agent-context-service.md` (session inheritance rules)
- `docs/plans/030-positional-orchestrator/workshops/08-ods-orchestrator-agent-handover.md` (fire-and-forget)
- `packages/shared/src/features/019-agent-manager-refactor/` (Plan 019 agent system)

---

## Purpose

Define the redesigned AgentInstance and AgentManagerService so that work unit pods use AgentInstance as their agent wrapper. AgentInstance is a **general-purpose agent session wrapper** with no opinion on how it is used -- it runs agents, tracks sessions, carries a property bag, and passes through events. One service, one instance type, any number of use cases.

## Key Questions Addressed

- Q1: What is the AgentInstance entity? What does it own vs. not own?
- Q2: What methods does AgentManagerService expose?
- Q3: How do AgentPod, PodManager, and ODS change?
- Q4: How does session inheritance from AgentContextService map to the API?
- Q5: What happens to AgentService (the thin timeout wrapper)?
- Q6: How do we keep existing agent tests passing?

---

## Design Principles

### P1: AgentInstance Is Domain-Agnostic

AgentInstance does not know about workflows, graphs, nodes, orchestration, web UIs, SSE, or any consumer-specific concept. It is a general-purpose wrapper around an AI agent adapter. One use case is the workflow system. Another is the web chat UI. Others may follow. No concept leakage.

### P2: Events Flow Through, Not Into

The instance does not store events. It passes adapter events through to registered handlers. Consumers decide what to do with events -- write to state.json, broadcast via SSE, print to CLI, collect in a test array. The instance has no opinion.

### P3: No Broadcasting From the Instance

Status changes, metadata updates, and events are not broadcast by the instance. Later, a central event manager will hook into instances and re-emit to SSE, CLI, or other transports. The instance just manages state and passes through adapter events.

### P4: Metadata Is Freeform

The property bag is `Record<string, unknown>`. No typed well-known keys on the interface. Consumers set whatever they need. The orchestration layer might set `nodeId` and `graphSlug`. The web UI might set `chatName`. A CLI tool might set something else entirely. The instance doesn't care.

### P5: Two Ways to Get an Agent

- `getNew()` -- fresh agent, no prior session
- `getWithSessionId()` -- agent that continues an existing session

These map directly to AgentContextService's two actionable outcomes: `{ source: 'new' }` and `{ source: 'inherit', fromNodeId }`.

---

## The AgentInstance Entity

### What It Owns

```typescript
interface IAgentInstance {
  // ── Identity (immutable after creation) ──────────────
  readonly id: string;
  readonly name: string;
  readonly type: AgentType;            // 'claude-code' | 'copilot'
  readonly workspace: string;

  // ── State ────────────────────────────────────────────
  readonly status: AgentInstanceStatus; // 'working' | 'stopped' | 'error'
  readonly isRunning: boolean;          // convenience: status === 'working'
  readonly sessionId: string | null;    // null before first run, updated after each
  readonly createdAt: Date;
  readonly updatedAt: Date;

  // ── Property Bag (freeform, no typed keys) ───────────
  readonly metadata: Readonly<Record<string, unknown>>;
  setMetadata(key: string, value: unknown): void;

  // ── Event Pass-Through ───────────────────────────────
  addEventHandler(handler: AgentEventHandler): void;
  removeEventHandler(handler: AgentEventHandler): void;

  // ── Actions ──────────────────────────────────────────
  run(options: AgentRunOptions): Promise<AgentResult>;
  terminate(): Promise<AgentResult>;
}
```

```typescript
interface AgentRunOptions {
  prompt: string;
  cwd?: string;
  onEvent?: AgentEventHandler;  // per-run handler, in addition to registered handlers
}

type AgentEventHandler = (event: AgentEvent) => void;
```

### What It Does NOT Own

| Concern | Where It Lives Instead |
|---------|------------------------|
| Event storage | Consumer (state.json, NDJSON file, in-memory array) |
| SSE broadcasting | Central event manager (later) |
| Intent tracking | `metadata.intent` if consumer wants it |
| Error lists | Consumer reads from AgentResult or events |
| Question tracking | Consumer reads from events or node status |
| Persistence / hydration | Consumer (PodManager persists sessions, web UI uses storage adapter) |
| Timeout enforcement | Consumer (AgentService for CLI, orchestration loop for pods) |
| Session inheritance logic | AgentContextService + ODS |

### Status Model

Three states. No more.

```
                ┌─────────┐
                │ stopped │ ← initial state
                └────┬────┘
                     │ run()
                     ▼
                ┌─────────┐
                │ working │
                └────┬────┘
                     │ adapter returns
              ┌──────┴──────┐
              ▼              ▼
        ┌─────────┐    ┌─────────┐
        │ stopped │    │  error  │
        └─────────┘    └─────────┘
```

`stopped` means "not running." It does not imply success, completion, or any higher-order concept. The consumer inspects the `AgentResult` returned from `run()` to determine what happened. If the agent asked a question, stopped for human input, timed out, or finished normally -- all of those are `stopped` from the instance's perspective.

`error` means the adapter reported failure (`AgentResult.status === 'failed'`). The instance transitions to `error` so that `isRunning` returns false and the double-run guard works correctly.

### Property Bag

Fully freeform `Record<string, unknown>`. Set at creation via params, updatable later via `setMetadata()`.

```typescript
// Set at creation (by ODS)
const instance = agentManager.getNew({
  type: 'claude-code',
  workspace: '/project',
  metadata: { graphSlug: 'my-graph', nodeId: 'generate-spec' },
});

// Updated during execution (by the agent itself via CLI, or by consumer)
instance.setMetadata('currentStep', 'analyzing dependencies');
instance.setMetadata('progress', '3/5');

// Read by anyone
const nodeId = instance.metadata.nodeId;  // consumer casts as needed
```

The instance does not interpret, validate, or react to metadata. It's a bag.

### Event Pass-Through

The instance does not store events. It passes them from the adapter to registered handlers.

```typescript
class AgentInstance implements IAgentInstance {
  private readonly _eventHandlers = new Set<AgentEventHandler>();

  addEventHandler(handler: AgentEventHandler): void {
    this._eventHandlers.add(handler);
  }

  removeEventHandler(handler: AgentEventHandler): void {
    this._eventHandlers.delete(handler);
  }

  async run(options: AgentRunOptions): Promise<AgentResult> {
    if (this._status === 'working') {
      throw new Error('Agent is already running');
    }

    this._status = 'working';
    this._updatedAt = new Date();

    try {
      const result = await this._adapter.run({
        prompt: options.prompt,
        sessionId: this._sessionId ?? undefined,
        cwd: options.cwd,
        onEvent: (event) => {
          // Pass through to all registered handlers
          for (const handler of this._eventHandlers) {
            handler(event);
          }
          // Also pass to per-run handler if provided
          options.onEvent?.(event);
        },
      });

      this._sessionId = result.sessionId;
      this._status = result.status === 'failed' ? 'error' : 'stopped';
      this._updatedAt = new Date();
      return result;
    } catch (error) {
      this._status = 'error';
      this._updatedAt = new Date();
      throw error;
    }
  }
}
```

Multiple consumers can attach handlers simultaneously:

```typescript
// Orchestration: forward to node event system
instance.addEventHandler((event) => {
  nodeEventWriter.write(graphSlug, nodeId, event);
});

// Later, web layer: forward to SSE
instance.addEventHandler((event) => {
  sseManager.broadcast('agents', 'agent_event', { agentId: instance.id, event });
});

// Testing: collect for assertions
const collected: AgentEvent[] = [];
instance.addEventHandler((event) => collected.push(event));
```

---

## What Gets Removed From Current AgentInstance

The current `AgentInstance` (Plan 019) has ~425 lines. The new one is significantly smaller.

| Removed | Reason |
|---------|--------|
| `IAgentNotifierService` dependency | No broadcasting from instance (P3) |
| `IAgentStorageAdapter` dependency | Persistence is a consumer concern |
| `nullAgentNotifier` / notifier field | No notifier at all |
| `_events: AgentStoredEvent[]` | No event storage (P2) |
| `_captureEvent()` | Replaced by pass-through to handlers |
| `getEvents()` | No event storage |
| `_eventIdCounter` | No event storage |
| `_intent` / `setIntent()` | Use `metadata.intent` if needed |
| `broadcastStatus()` calls | No broadcasting (P3) |
| `broadcastIntent()` calls | No broadcasting (P3) |
| `broadcastEvent()` calls | No broadcasting (P3) |
| `_persistInstance()` | No storage adapter |
| `static hydrate()` | Restoration is just `getWithSessionId(oldSessionId, ...)` |
| `console.log` status/event logging | Consumer concern (event handlers can log) |

| Added | Reason |
|-------|--------|
| `metadata: Record<string, unknown>` | Freeform property bag (P4) |
| `setMetadata(key, value)` | Update the bag |
| `isRunning: boolean` | Convenience getter |
| `addEventHandler(handler)` | Event pass-through (P2) |
| `removeEventHandler(handler)` | Event pass-through (P2) |
| `sessionId` in config | Pre-set for session inheritance |

---

## AgentInstanceConfig

```typescript
// Current
export interface AgentInstanceConfig {
  id: string;
  name: string;
  type: AgentType;
  workspace: string;
}

// New
export interface AgentInstanceConfig {
  id: string;
  name: string;          // immutable after creation
  type: AgentType;
  workspace: string;
  sessionId?: string;    // pre-set for session inheritance
  metadata?: Record<string, unknown>;  // initial property bag
}
```

No `graphSlug`, `nodeId`, or other domain-specific fields on the config. Those go into `metadata` if the consumer wants them there.

---

## The AgentManagerService

### API

```typescript
export interface CreateAgentParams {
  name: string;
  type: AgentType;
  workspace: string;
  sessionId?: string;
  metadata?: Record<string, unknown>;
}

export interface IAgentManagerService {
  /**
   * Create a fresh agent with no prior session.
   */
  getNew(params: CreateAgentParams): IAgentInstance;

  /**
   * Get or create an agent that continues an existing session.
   *
   * If an instance already exists with this sessionId, returns that
   * same instance. Otherwise creates a new one with the sessionId
   * baked in so that the next run() call continues from that session.
   *
   * Same-instance guarantee means multiple consumers (e.g., two UI
   * elements, or the orchestrator + a CLI viewer) get the same object
   * and can independently attach event handlers to it.
   */
  getWithSessionId(sessionId: string, params: CreateAgentParams): IAgentInstance;

  /**
   * Get a specific agent by ID.
   * Returns null if not found.
   */
  getAgent(agentId: string): IAgentInstance | null;

  /**
   * Get all agents, optionally filtered.
   */
  getAgents(filter?: AgentFilter): IAgentInstance[];

  /**
   * Terminate and remove an agent.
   */
  terminateAgent(agentId: string): Promise<boolean>;

  /**
   * Initialize the manager (load persisted agents from storage if available).
   */
  initialize(): Promise<void>;
}
```

### Why `getNew` and `getWithSessionId` Instead of `getOrCreate`

1. **No domain leakage.** `getOrCreateForNode({ graphSlug, nodeId, ... })` put graph concepts on a shared service interface. The service shouldn't know about graphs or nodes.

2. **SessionId is the resumption handle.** When you want to continue a session, you have a sessionId. You don't need a composite key. The caller composes whatever key it needs (PodManager does `nodeId → sessionId` mapping).

3. **Maps directly to AgentContextService outcomes.**

```typescript
// In ODS:
const contextResult = contextService.getContextSource(reality, nodeId);

if (contextResult.source === 'inherit') {
  const sessionId = podManager.getSessionId(contextResult.fromNodeId);
  instance = agentManager.getWithSessionId(sessionId, { name, type, workspace, metadata });
} else {
  instance = agentManager.getNew({ name, type, workspace, metadata });
}
```

4. **Clear intent at the call site.** Reading ODS code, you see immediately whether the agent is fresh or continuing a session. No guessing about what `getOrCreate` with an optional sessionId means.

### Same-Instance Guarantee for `getWithSessionId`

When two callers request the same sessionId, they get the **same `IAgentInstance` object**. This is critical because:

1. **Re-attaching to a running agent.** An agent is running in the background. The user refreshes the webpage or comes back later. The web layer calls `getWithSessionId(sessionId, ...)` and gets the same in-memory instance — the one that's still running. It can then attach new event handlers and see current status (`isRunning`, metadata, etc.) without interrupting the agent.

2. **Multiple event consumers.** Two UI elements (e.g., an event log panel and a status indicator) both attach `addEventHandler()` to the same instance. If they got different objects, one would miss events.

3. **Double-run guard works.** The double-run guard checks `status === 'working'`. If two callers held different instance objects, the guard would not prevent concurrent runs on the same session.

4. **Metadata consistency.** One consumer sets metadata, the other reads it. Same object means both see the same state.

5. **This is a natural property of the service.** The `_agents` map is already keyed by agentId. Adding a `_sessionIndex` (sessionId → agentId) gives O(1) lookup by session without changing the primary map.

```
Agent running in background (started earlier):
  instance X: sessionId='ses-001', status='working'

Caller A: getWithSessionId('ses-001', params)  →  returns SAME instance X (still running!)
  → attaches event handler, sees live events
  → reads instance.isRunning → true

Caller B: getWithSessionId('ses-001', params)  →  returns SAME instance X
  → attaches different event handler

Caller C: getNew(params)                        →  creates NEW instance Y (no session)
```

**Session index lifecycle**: An instance enters the session index when:
- Created via `getWithSessionId(sessionId, ...)` — indexed immediately
- Created via `getNew(...)` then runs — the sessionId is set after `run()` completes; the index is updated at that point

For the post-run index update, the service hooks into the instance's run lifecycle. When `instance.run()` completes and sets a new sessionId, the session index is updated so future `getWithSessionId` calls find it.

```typescript
// After _createInstance in getNew():
// When the instance runs and gets a sessionId, index it
instance.addEventHandler((event) => {
  if (event.type === 'message' && instance.sessionId && !this._sessionIndex.has(instance.sessionId)) {
    this._sessionIndex.set(instance.sessionId, instance.id);
  }
});
```

Alternatively (simpler): the service updates the index lazily when `getWithSessionId` is called, or adds an `onSessionChanged` callback. The exact mechanism is an implementation detail — the important thing is that the index stays current.

### Implementation

```typescript
export class AgentManagerService implements IAgentManagerService {
  private readonly _agents = new Map<string, IAgentInstance>();
  private readonly _sessionIndex = new Map<string, string>();  // sessionId → agentId
  private readonly _adapterFactory: AdapterFactory;

  constructor(adapterFactory: AdapterFactory) {
    this._adapterFactory = adapterFactory;
  }

  getNew(params: CreateAgentParams): IAgentInstance {
    return this._createInstance({
      ...params,
      sessionId: undefined,  // explicitly no session
    });
  }

  getWithSessionId(sessionId: string, params: CreateAgentParams): IAgentInstance {
    // Return existing instance if one already holds this session
    const existingId = this._sessionIndex.get(sessionId);
    if (existingId) {
      const existing = this._agents.get(existingId);
      if (existing) return existing;
    }

    // No existing instance — create one with the session baked in
    const instance = this._createInstance({
      ...params,
      sessionId,
    });

    // Index by sessionId for future lookups
    this._sessionIndex.set(sessionId, instance.id);
    return instance;
  }

  getAgent(agentId: string): IAgentInstance | null {
    return this._agents.get(agentId) ?? null;
  }

  getAgents(filter?: AgentFilter): IAgentInstance[] {
    const all = Array.from(this._agents.values());
    if (filter?.workspace) {
      return all.filter((a) => a.workspace === filter.workspace);
    }
    return all;
  }

  async terminateAgent(agentId: string): Promise<boolean> {
    const agent = this._agents.get(agentId);
    if (!agent) return false;

    try {
      await agent.terminate();
    } catch {
      // Continue with removal even if termination fails
    }

    // Clean up both indexes
    this._agents.delete(agentId);
    if (agent.sessionId) {
      this._sessionIndex.delete(agent.sessionId);
    }
    return true;
  }

  async initialize(): Promise<void> {
    // No-op in base implementation.
    // Web UI subclass or wrapper can add storage-based hydration.
  }

  private _createInstance(params: CreateAgentParams): IAgentInstance {
    const id = generateAgentId();
    assertValidAgentId(id);

    const instance = new AgentInstance(
      {
        id,
        name: params.name,
        type: params.type,
        workspace: params.workspace,
        sessionId: params.sessionId,
        metadata: params.metadata,
      },
      this._adapterFactory,
    );

    this._agents.set(id, instance);

    // If this instance was created with a sessionId, index it
    if (params.sessionId) {
      this._sessionIndex.set(params.sessionId, id);
    }
    return instance;
  }
}
```

**Key change from current**: the constructor takes only `adapterFactory`. No notifier, no storage. Those are consumer concerns that can be layered on top (the web UI wraps instances with event forwarding to SSE; the orchestration layer attaches handlers for node events).

### FakeAgentManagerService

```typescript
export class FakeAgentManagerService implements IAgentManagerService {
  private readonly _agents = new Map<string, IAgentInstance>();
  private readonly _sessionIndex = new Map<string, string>();  // sessionId → agentId
  private readonly _createdAgents: IAgentInstance[] = [];
  private readonly _errors = new Map<string, Error>();
  private _idCounter = 0;

  getNew(params: CreateAgentParams): IAgentInstance {
    return this._createFake(params);
  }

  getWithSessionId(sessionId: string, params: CreateAgentParams): IAgentInstance {
    // Same-instance guarantee: return existing if we have one for this session
    const existingId = this._sessionIndex.get(sessionId);
    if (existingId) {
      const existing = this._agents.get(existingId);
      if (existing) return existing;
    }

    const instance = this._createFake({ ...params, sessionId });
    this._sessionIndex.set(sessionId, instance.id);
    return instance;
  }

  getAgent(agentId: string): IAgentInstance | null {
    return this._agents.get(agentId) ?? null;
  }

  getAgents(filter?: AgentFilter): IAgentInstance[] {
    const all = Array.from(this._agents.values());
    if (filter?.workspace) {
      return all.filter((a) => a.workspace === filter.workspace);
    }
    return all;
  }

  async terminateAgent(agentId: string): Promise<boolean> {
    const agent = this._agents.get(agentId);
    if (!agent) return false;
    await agent.terminate();
    this._agents.delete(agentId);
    if (agent.sessionId) this._sessionIndex.delete(agent.sessionId);
    return true;
  }

  async initialize(): Promise<void> {}

  // ── Test Helpers ───────────────────────────────
  getCreatedAgents(): IAgentInstance[] { return [...this._createdAgents]; }
  addAgent(instance: IAgentInstance): void { this._agents.set(instance.id, instance); }
  reset(): void {
    this._agents.clear();
    this._sessionIndex.clear();
    this._createdAgents.length = 0;
    this._idCounter = 0;
  }

  private _createFake(params: CreateAgentParams): IAgentInstance {
    const id = `agent-${++this._idCounter}`;
    const instance = new FakeAgentInstance({
      id,
      name: params.name,
      type: params.type,
      workspace: params.workspace,
      sessionId: params.sessionId ?? null,
      metadata: params.metadata,
    });
    this._agents.set(id, instance);
    this._createdAgents.push(instance);
    if (params.sessionId) {
      this._sessionIndex.set(params.sessionId, id);
    }
    return instance;
  }
}
```

---

## FakeAgentInstance Changes

```typescript
export interface FakeAgentInstanceOptions {
  id: string;
  name: string;
  type: AgentType;
  workspace: string;
  status?: AgentInstanceStatus;
  sessionId?: string | null;       // already exists
  metadata?: Record<string, unknown>;  // NEW
  createdAt?: Date;
  updatedAt?: Date;
}

export class FakeAgentInstance implements IAgentInstance {
  // ... identity fields (unchanged) ...

  private _metadata: Record<string, unknown>;
  private _eventHandlers = new Set<AgentEventHandler>();

  constructor(options: FakeAgentInstanceOptions) {
    // ... existing setup ...
    this._metadata = { ...(options.metadata ?? {}) };
  }

  get isRunning(): boolean {
    return this._status === 'working';
  }

  get metadata(): Readonly<Record<string, unknown>> {
    return this._metadata;
  }

  setMetadata(key: string, value: unknown): void {
    this._metadata[key] = value;
    this._updatedAt = new Date();
  }

  addEventHandler(handler: AgentEventHandler): void {
    this._eventHandlers.add(handler);
  }

  removeEventHandler(handler: AgentEventHandler): void {
    this._eventHandlers.delete(handler);
  }

  // run(), terminate() remain similar but without notifier/event capture
  // ... test helpers (setStatus, assertRunCalled, etc.) remain ...
}
```

Removed from FakeAgentInstance: `_notifier`, `noopNotifier`, `_events[]`, `addEvent()`, `setEvents()`, `getEvents()`, `configureAdapter()`.

---

## AgentPod Changes

### Current AgentPod

```typescript
// packages/positional-graph/src/features/030-orchestration/pod.agent.ts
export class AgentPod implements IWorkUnitPod {
  readonly unitType = 'agent' as const;
  private _sessionId: string | undefined;

  constructor(
    readonly nodeId: string,
    private readonly agentAdapter: IAgentAdapter,
  ) {}

  async execute(options: PodExecuteOptions): Promise<PodExecuteResult> {
    const prompt = this.loadStarterPrompt();
    const sessionId = options.contextSessionId ?? this._sessionId;
    const result = await this.agentAdapter.run({ prompt, sessionId, cwd });
    this._sessionId = result.sessionId;
    return this.mapAgentResult(result);
  }
}
```

### New AgentPod

```typescript
export class AgentPod implements IWorkUnitPod {
  readonly unitType = 'agent' as const;

  constructor(
    readonly nodeId: string,
    private readonly _agentInstance: IAgentInstance,
  ) {}

  get sessionId(): string | undefined {
    return this._agentInstance.sessionId ?? undefined;
  }

  async execute(options: PodExecuteOptions): Promise<PodExecuteResult> {
    const prompt = this.loadStarterPrompt();
    const result = await this._agentInstance.run({
      prompt,
      cwd: options.ctx.worktreePath,
    });
    return this.mapAgentResult(result);
  }

  async resumeWithAnswer(
    questionId: string,
    answer: string,
    options: PodExecuteOptions,
  ): Promise<PodExecuteResult> {
    const prompt = this.buildResumePrompt(questionId, answer);
    const result = await this._agentInstance.run({
      prompt,
      cwd: options.ctx.worktreePath,
    });
    return this.mapAgentResult(result);
  }

  async terminate(): Promise<void> {
    await this._agentInstance.terminate();
  }
}
```

**What changed**:
1. Wraps `IAgentInstance` instead of `IAgentAdapter`
2. No internal `_sessionId` -- reads from instance
3. No `contextSessionId` parameter -- session baked into instance at creation
4. `run()` delegates to `agentInstance.run()`, not `adapter.run()`

---

## PodCreateParams and PodManager

### PodCreateParams

```typescript
// Current
type PodCreateParams =
  | { unitType: 'agent'; unitSlug: string; adapter: IAgentAdapter }
  | { unitType: 'code'; unitSlug: string; runner: IScriptRunner };

// New
type PodCreateParams =
  | { unitType: 'agent'; unitSlug: string; agentInstance: IAgentInstance }
  | { unitType: 'code'; unitSlug: string; runner: IScriptRunner };
```

### PodManager.createPod

```typescript
createPod(nodeId: string, params: PodCreateParams): IWorkUnitPod {
  const existing = this.pods.get(nodeId);
  if (existing) return existing;

  let pod: IWorkUnitPod;
  if (params.unitType === 'agent') {
    pod = new AgentPod(nodeId, params.agentInstance);
  } else {
    pod = new CodePod(nodeId, params.runner);
  }

  this.pods.set(nodeId, pod);
  return pod;
}
```

PodManager continues to own session persistence (`pod-sessions.json`). It tracks `nodeId → sessionId` and persists/loads from disk. This survives restarts.

---

## PodExecuteOptions Simplification

```typescript
// Current
export interface PodExecuteOptions {
  inputs: Record<string, unknown>;
  contextSessionId?: string;    // session inheritance threaded here
  ctx: WorkspaceContext;
  graphSlug: string;
  onEvent?: PodEventHandler;
}

// New
export interface PodExecuteOptions {
  inputs: Record<string, unknown>;
  // contextSessionId REMOVED -- session baked into AgentInstance at creation
  ctx: WorkspaceContext;
  graphSlug: string;
  onEvent?: PodEventHandler;
}
```

Session inheritance is resolved BEFORE the pod is created (in ODS), not at execute time.

---

## ODS Changes

### ODSDependencies

```typescript
// Current
export interface ODSDependencies {
  readonly graphService: IPositionalGraphService;
  readonly podManager: IPodManager;
  readonly contextService: IAgentContextService;
  readonly agentAdapter: IAgentAdapter;
  readonly scriptRunner: IScriptRunner;
}

// New
export interface ODSDependencies {
  readonly graphService: IPositionalGraphService;
  readonly podManager: IPodManager;
  readonly contextService: IAgentContextService;
  readonly agentManager: IAgentManagerService;
  readonly scriptRunner: IScriptRunner;
}
```

### ODS.handleAgentOrCode

This is where AgentContextService's output maps to the two AgentManagerService methods:

```typescript
private async handleAgentOrCode(
  request: StartNodeRequest,
  ctx: WorkspaceContext,
  reality: PositionalGraphReality,
  node: NodeReality,
): Promise<OrchestrationExecuteResult> {
  const { nodeId } = request;
  const agentType = this.resolveAgentType(node, reality);
  const baseParams: CreateAgentParams = {
    name: `${request.graphSlug}/${nodeId}`,
    type: agentType,
    workspace: ctx.worktreePath,
    metadata: {
      graphSlug: request.graphSlug,
      nodeId,
      unitSlug: node.unitSlug,
    },
  };

  // 1. Reserve the node
  await this.deps.graphService.startNode(ctx, request.graphSlug, nodeId);

  // 2. Resolve session inheritance → maps to getNew vs getWithSessionId
  const contextResult = this.deps.contextService.getContextSource(reality, nodeId);
  let instance: IAgentInstance;

  if (contextResult.source === 'inherit' && contextResult.fromNodeId) {
    // Primary source: PodManager (persisted, survives restarts)
    const sessionId = this.deps.podManager.getSessionId(contextResult.fromNodeId);

    if (sessionId) {
      instance = this.deps.agentManager.getWithSessionId(sessionId, baseParams);
    } else {
      // Source node has no session (never ran, or failed before creating one)
      // Fall back to new context per AgentContextService Q3 resolution
      instance = this.deps.agentManager.getNew(baseParams);
    }
  } else {
    instance = this.deps.agentManager.getNew(baseParams);
  }

  // 3. Create pod with the agent instance
  const pod = this.deps.podManager.createPod(nodeId, {
    unitType: 'agent',
    unitSlug: node.unitSlug,
    agentInstance: instance,
  });

  // 4. Fire-and-forget
  pod.execute({
    inputs: request.inputs,
    ctx,
    graphSlug: request.graphSlug,
  });

  return {
    ok: true,
    request,
    newStatus: 'starting',
    sessionId: instance.sessionId ?? undefined,
  };
}

/**
 * Resolve agent type for a node.
 * Priority: graph setting > default 'claude-code'
 */
private resolveAgentType(
  node: NodeReality,
  reality: PositionalGraphReality,
): AgentType {
  return reality.settings?.agentType ?? 'claude-code';
}
```

### GraphOrchestratorSettings

```typescript
// Current (empty)
export const GraphOrchestratorSettingsSchema = z.object({}).strict();

// New
export const GraphOrchestratorSettingsSchema = z.object({
  agentType: z.enum(['claude-code', 'copilot']).optional(),
}).strict();
```

---

## Session Lifecycle

### How AgentContextService Maps to the API

| AgentContextService Result | ODS Action | AgentManagerService Call |
|---------------------------|------------|------------------------|
| `{ source: 'new' }` | Start fresh | `agentManager.getNew(params)` |
| `{ source: 'inherit', fromNodeId }` | Continue parent's session | `agentManager.getWithSessionId(podManager.getSessionId(fromNodeId), params)` |
| `{ source: 'not-applicable' }` | Not an agent node | Skip (CodePod path) |

### Walk-Through: Node A Fresh, Node B Inherits

```
1. ONBAS decides: start-node A

2. ODS.handleAgentOrCode('A'):
   a. contextService.getContextSource(reality, 'A')
      → { source: 'new', reason: 'First node on first line' }
   b. instance = agentManager.getNew({
        name: 'my-graph/A', type: 'claude-code', workspace: '/project',
        metadata: { graphSlug: 'my-graph', nodeId: 'A' }
      })
      → New AgentInstance, sessionId = null
   c. pod = podManager.createPod('A', { agentInstance: instance })
   d. pod.execute(...)  // fire-and-forget
      → instance.run({ prompt, cwd })
      → adapter.run({ prompt, cwd })         // no --resume flag
      → AgentResult { sessionId: 'ses-001', status: 'completed' }
      → instance.sessionId now 'ses-001'

3. Settle phase:
   Node A's events in state.json → node transitions to 'complete'
   Session sync: podManager.setSessionId('A', 'ses-001')
   podManager.persistSessions()

4. ONBAS decides: start-node B (inherits from A)

5. ODS.handleAgentOrCode('B'):
   a. contextService.getContextSource(reality, 'B')
      → { source: 'inherit', fromNodeId: 'A' }
   b. sessionId = podManager.getSessionId('A') → 'ses-001'
   c. instance = agentManager.getWithSessionId('ses-001', {
        name: 'my-graph/B', type: 'claude-code', workspace: '/project',
        metadata: { graphSlug: 'my-graph', nodeId: 'B' }
      })
      → First call with 'ses-001': creates new AgentInstance, sessionId = 'ses-001'
        (session index: 'ses-001' → instance.id)
   d. pod = podManager.createPod('B', { agentInstance: instance })
   e. pod.execute(...)  // fire-and-forget
      → instance.run({ prompt, cwd })
      → adapter.run({ prompt, sessionId: 'ses-001', cwd })
        // CLI: claude --fork-session --resume ses-001 -p "..."
      → AgentResult { sessionId: 'ses-002', status: 'completed' }
      → instance.sessionId now 'ses-002'
        (session index updated: 'ses-002' → instance.id)
```

### Walk-Through: Re-Attaching to a Running Agent

```
1. Agent for node B is running (started 2 minutes ago)
   instance X: id='agent-42', sessionId='ses-001', status='working'
   Session index: { 'ses-001' → 'agent-42' }

2. User refreshes the web page (or CLI viewer reconnects).

3. Web layer calls: agentManager.getWithSessionId('ses-001', params)
   → Session index lookup: 'ses-001' → 'agent-42'
   → Returns SAME instance X (still running!)

4. Web layer attaches event handler:
   instance.addEventHandler((event) => sseStream.push(event))
   → Immediately starts receiving live events from the running agent

5. Web layer reads state:
   instance.isRunning → true
   instance.status → 'working'
   instance.metadata → { graphSlug: 'my-graph', nodeId: 'B' }
```

The re-attach is zero-cost: no new adapter, no new process, no session lookup. Just a Map get.

### Walk-Through: System Restart Mid-Graph

```
1. System crashes after node A completed (session 'ses-001')
   pod-sessions.json: { "sessions": { "A": "ses-001" } }
   In-memory state is lost (session index, agents map — all gone).

2. System restarts.
   AgentManagerService is empty (fresh process, no in-memory state).
   PodManager.loadSessions() → sessions map: { A → 'ses-001' }

3. EHS processes state.json → A is 'complete'

4. ONBAS decides: start-node B (inherits from A)

5. ODS.handleAgentOrCode('B'):
   a. contextService → { source: 'inherit', fromNodeId: 'A' }
   b. sessionId = podManager.getSessionId('A') → 'ses-001' (from disk)
   c. instance = agentManager.getWithSessionId('ses-001', { ... })
      → Session index empty (fresh process) → creates new instance
      → sessionId = 'ses-001' (baked in)
   d. pod.execute(...)
      → adapter.run({ sessionId: 'ses-001' })
      → CLI resumes from disk session history
```

No hydration needed. The adapter is stateless. The session is on the CLI's filesystem. PodManager persists the `nodeId → sessionId` mapping. The session index is rebuilt naturally as `getWithSessionId` is called — no explicit rebuild step required.

### Walk-Through: Parallel Agents

Per AgentContextService Rule 3: parallel nodes always get new sessions.

```
Line 1: [agent-A (parallel)] [agent-B (parallel)] [agent-C (serial)]

ODS for agent-A:
  contextService → { source: 'new' }
  agentManager.getNew({ metadata: { nodeId: 'A' } })
  → independent session

ODS for agent-B:
  contextService → { source: 'new' }
  agentManager.getNew({ metadata: { nodeId: 'B' } })
  → independent session

ODS for agent-C:
  contextService → { source: 'inherit', fromNodeId: 'B' }
  agentManager.getWithSessionId(podManager.getSessionId('B'), { ... })
  → continues B's session
```

Each parallel agent gets its own AgentInstance and session. No coordination needed.

### Session Sync After Fire-and-Forget

ODS fires `pod.execute()` without awaiting. Session IDs need to be captured for inheritance.

```
Timeline:
  t0: ODS fires pod.execute() (not awaited), returns immediately
  t1: Agent runs... (seconds to minutes)
  t2: Agent completes → adapter returns → instance.sessionId updated
  t3: Agent raised events via CLI → state.json updated
  t4: Settle phase processes state.json → node transitions to 'complete'
  t5: Session sync: podManager.setSessionId(nodeId, pod.sessionId)
  t6: podManager.persistSessions()
  t7: ONBAS decides next node → can now inherit via podManager.getSessionId()
```

**Timing guarantee**: t7 only happens after t4 (settle confirmed completion). t2 happened before t3. So by t7, the sessionId is available via `pod.sessionId` (which reads `instance.sessionId`).

Session sync in the settle phase:
```typescript
// In orchestration loop, after settle:
for (const nodeId of completedNodeIds) {
  const pod = podManager.getPod(nodeId);
  if (pod?.sessionId) {
    podManager.setSessionId(nodeId, pod.sessionId);
  }
}
await podManager.persistSessions(ctx, graphSlug);
```

---

## DI Container Changes

### positional-graph/src/container.ts

```typescript
// Current
const agentAdapter = c.resolve<IAgentAdapter>(ORCHESTRATION_DI_TOKENS.AGENT_ADAPTER);
const ods = new ODS({ ..., agentAdapter, ... });

// New
const agentManager = c.resolve<IAgentManagerService>(ORCHESTRATION_DI_TOKENS.AGENT_MANAGER);
const ods = new ODS({ ..., agentManager, ... });
```

### New DI Token

```typescript
export const ORCHESTRATION_DI_TOKENS = {
  // ...existing...
  AGENT_MANAGER: Symbol('AGENT_MANAGER'),
};
```

### CLI Container

```typescript
// apps/cli/src/lib/container.ts
container.register(ORCHESTRATION_DI_TOKENS.AGENT_MANAGER, {
  useFactory: (c) => {
    const adapterFactory = buildAdapterFactory(c);
    return new AgentManagerService(adapterFactory);
  },
});
```

---

## What We Are NOT Doing in Plan 033

1. **NOT absorbing AgentService.** The CLI's thin timeout wrapper stays as-is for `cg agent run` commands. The orchestration layer doesn't need timeout enforcement -- the settle loop can terminate long-running nodes.

2. **NOT fixing the web UI.** The web hooks (useAgentManager, useAgentInstance) will need adjustment later because `AgentInstance` no longer stores events or broadcasts via notifier. The web layer will attach event handlers to instances and forward to SSE. This is a separate task.

3. **NOT adding timeout to AgentInstance.** Timeout is a consumer concern.

4. **NOT persisting orchestration agents.** PodManager persists sessions. AgentManagerService agents are in-memory only. On restart, they're reconstructed via `getWithSessionId()` with sessions from PodManager.

---

## Impact on Existing Tests

### Tests That Need Changes (AgentInstance Redesign)

| Test File | Change | Reason |
|-----------|--------|--------|
| `test/contracts/agent-instance.contract.test.ts` | Remove notifier from constructor, remove event assertions | Constructor simplified, no events |
| `test/contracts/agent-instance.contract.js` | Update shared assertions | Interface changed (no getEvents, no setIntent) |
| `test/contracts/agent-manager.contract.test.ts` | Update to use `getNew`/`getWithSessionId` | New API methods |
| `test/contracts/agent-notifier.contract.test.ts` | May become obsolete or move to web layer | Notifier decoupled from instance |
| `test/integration/agent-instance.integration.test.ts` | Remove notifier/event assertions, test event pass-through | Redesigned interface |
| `test/integration/agent-notifier.integration.test.ts` | Move to web layer or rewrite | Notifier no longer on instance |
| `test/integration/agent-persistence.integration.test.ts` | Decouple from instance (test storage separately) | Storage removed from instance |
| `test/unit/.../pod.test.ts` | Update to use FakeAgentInstance | AgentPod wraps IAgentInstance |
| `test/unit/.../pod-manager.test.ts` | Update PodCreateParams | `adapter` → `agentInstance` |
| `test/unit/.../ods.test.ts` | Replace agentAdapter with agentManager | ODSDependencies changed |
| `test/unit/.../container-orchestration.test.ts` | Update DI token | AGENT_ADAPTER → AGENT_MANAGER |

### Tests That Should NOT Change

| Test File | Why Unchanged |
|-----------|---------------|
| `test/contracts/agent-adapter.contract.test.ts` | Tests IAgentAdapter, which is unchanged |
| `test/integration/acceptance.test.ts` | Tests AgentService, which is unchanged |
| `test/unit/services/agent-service.test.ts` | AgentService stays as-is |
| `test/unit/cli/agent-command.test.ts` | CLI commands use AgentService, unchanged |
| `test/integration/claude-code-adapter.test.ts` | Tests adapter directly, unchanged |
| `test/integration/sdk-copilot-adapter.test.ts` | Tests adapter directly, unchanged |
| Skipped real-agent tests | Already skipped; may need import updates |

### Test Strategy for New Functionality

```
Level 1: Contract Tests
  New contract test suite for redesigned IAgentInstance:
  - status transitions (stopped → working → stopped|error)
  - double-run guard
  - sessionId tracking (null initially, updated after run)
  - metadata (set at creation, update via setMetadata)
  - event pass-through (addEventHandler receives adapter events)
  - isRunning convenience getter
  - terminate() transitions to stopped

  AgentManagerService contract:
  - getNew() creates fresh instance with no session
  - getWithSessionId() returns same instance for same sessionId (same-instance guarantee)
  - getWithSessionId() creates new instance for unknown sessionId
  - getWithSessionId() creates instance with pre-set session
  - getAgent() returns by ID or null
  - getAgents() with and without filter
  - terminateAgent() terminates and removes

Level 2: Unit Tests
  - AgentPod: test with FakeAgentInstance
  - ODS: test with FakeAgentManagerService (getNew/getWithSessionId paths)
  - PodManager: test with updated PodCreateParams

Level 3: Integration Tests
  - AgentManagerService.getNew() with real AgentInstance + FakeAgentAdapter
  - AgentManagerService.getWithSessionId() pre-sets sessionId correctly
  - Session inheritance: create parent → run → create child with parent's session
  - Event pass-through: handler receives all adapter events during run()

Level 4: E2E Tests
  - Full orchestration pipeline with real agents
  - Parallel agent execution (independent sessions)
  - Session resumption across nodes (inherit path)
  - Agent error handling (status → error, orchestration recovers)
```

---

## Summary of All Changes

| Component | Change | Breaking? |
|-----------|--------|-----------|
| **IAgentInstance** | Remove getEvents, setIntent; add metadata, setMetadata, isRunning, addEventHandler, removeEventHandler | **Yes** (interface redesign) |
| **AgentInstance** | Remove notifier, storage, events, intent; add metadata, event pass-through | **Yes** (internal redesign) |
| **AgentInstanceConfig** | Add `sessionId?`, `metadata?`; remove graphSlug/nodeId (use metadata) | No (additive) |
| **FakeAgentInstance** | Match new interface; remove events/intent/notifier | **Yes** (matches interface) |
| **IAgentManagerService** | Replace `createAgent` with `getNew` + `getWithSessionId` | **Yes** (API change) |
| **AgentManagerService** | Constructor takes only adapterFactory; implement getNew/getWithSessionId; session index for same-instance guarantee | **Yes** (simplified) |
| **FakeAgentManagerService** | Match new interface | **Yes** (matches interface) |
| **CreateAgentParams** | Add `sessionId?`, `metadata?` | No (additive) |
| **PodCreateParams** | Agent variant: `adapter` → `agentInstance` | **Yes** |
| **AgentPod** | Wrap IAgentInstance; remove internal sessionId | **Yes** |
| **PodExecuteOptions** | Remove `contextSessionId` | **Yes** |
| **ODSDependencies** | `agentAdapter` → `agentManager` | **Yes** |
| **ODS.handleAgentOrCode** | Use getNew/getWithSessionId based on context service | **Yes** |
| **GraphOrchestratorSettings** | Add `agentType` field | No (additive) |
| **DI tokens** | Add `AGENT_MANAGER` | No (additive) |
| **Container registration** | Resolve IAgentManagerService instead of IAgentAdapter | **Yes** |

All breaking changes are internal. No public HTTP API or web interface changes.

---

## Open Questions

### Q1: What about the web UI's dependency on notifier and events?

**RESOLVED**: The web UI will need adjustment in a future plan. Currently it uses `IAgentNotifierService` for SSE broadcasting and `getEvents()` for event history. After this redesign, the web layer will:
1. Attach event handlers to instances via `addEventHandler()` and forward to SSE
2. Store events in its own layer if it needs history (or read from the adapter's event log)
3. Broadcast status changes by observing the instance after `run()` completes

This is out of scope for Plan 033. The web UI is not broken -- it just needs reconnection later.

### Q2: Should `createAgent()` still exist alongside `getNew()`?

**RESOLVED**: No. `getNew()` replaces `createAgent()`. Same semantics (always creates), clearer naming alongside `getWithSessionId()`. The web UI's API routes that call `createAgent()` will be updated to call `getNew()`.

### Q3: What about session-type binding?

**RESOLVED**: When ODS calls `getWithSessionId()`, it passes the same `agentType` that the parent node used (resolved from graph settings). Since all nodes in a graph share the same `agentType` setting, cross-type session resumption cannot happen. If per-node agent type overrides are added later, ODS would validate type compatibility before calling `getWithSessionId()`.

### Q4: Should PodManager persist `sessionId → agentType`?

**OPEN**: Currently PodManager stores `nodeId → sessionId`. If we later support per-node agent type overrides, we'd need to know which type a session was created with. For now, all nodes in a graph use the same type, so this is not needed. If needed later, PodManager can add a `sessionTypes` map (as explored in Workshop 01).

### Q5: How does the agent update its own metadata via CLI?

**OPEN**: The agent running inside the CLI (e.g., Claude Code) could call a command like `ppm agent set-meta key value` to update metadata on its instance. This requires:
1. The agent knows its instance ID (passed via starter prompt or env var)
2. A CLI command that resolves the instance and calls `setMetadata()`
3. The CLI command is available in the agent's CWD

Details deferred to a separate workshop or the implementation phase.

---

## Quick Reference

```
Create a fresh agent:
  agentManager.getNew({ name, type, workspace, metadata? })

Continue an existing session (or re-attach to running agent):
  agentManager.getWithSessionId(sessionId, { name, type, workspace, metadata? })
  // Same sessionId → same instance object (same-instance guarantee)

Run a prompt:
  instance.run({ prompt, cwd, onEvent? })

Check if running:
  instance.isRunning

Get session ID:
  instance.sessionId

Read/write metadata:
  instance.metadata                          // read
  instance.setMetadata('key', value)         // write

Listen to adapter events:
  instance.addEventHandler((event) => { ... })
  instance.removeEventHandler(handler)

Terminate:
  instance.terminate()

Session lookup for inheritance:
  podManager.getSessionId(fromNodeId)

Terminate and remove:
  agentManager.terminateAgent(id)
```
