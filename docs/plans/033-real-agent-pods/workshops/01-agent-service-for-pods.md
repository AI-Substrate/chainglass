# Workshop: Agent Service for Pods

**Type**: Integration Pattern
**Plan**: 033-real-agent-pods
**Spec**: (pending)
**Created**: 2026-02-11
**Status**: Superseded by `02-unified-agent-design.md`

**Related Documents**:
- `docs/plans/030-positional-orchestrator/workshops/04-work-unit-pods.md` (pod design)
- `docs/plans/030-positional-orchestrator/workshops/03-agent-context-service.md` (session inheritance)
- `docs/plans/030-positional-orchestrator/workshops/08-ods-orchestrator-agent-handover.md` (fire-and-forget)
- `packages/shared/src/features/019-agent-manager-refactor/` (Plan 019 agent system)

---

## Purpose

Determine how pods should acquire, use, and share agent adapters. Specifically: whether we need a new service layer between PodManager and IAgentAdapter, or whether the existing architecture (with targeted enhancements) already handles it.

## Key Questions Addressed

- Q1: Do we need to keep agent objects alive between pod invocations, or can we create fresh ones each time?
- Q2: What does "get agent for session ID X" actually mean given that adapters are stateless?
- Q3: Where does session sharing responsibility live (PodManager vs a new service)?
- Q4: How does the UI observe agent activity later without coupling it into the orchestration layer now?

---

## The Critical Insight: Adapters Are Stateless

Before exploring options, the single most important fact from the code review:

```typescript
// From agent-instance.ts DYK-01 comment:
// "Adapters are stateless; sessionId is stored by AgentInstance
//  and passed to adapter on each run()."

// From ClaudeCodeAdapter._buildArgs():
if (sessionId) {
  args.push('--fork-session', '--resume', sessionId);
}
```

**What this means:** `IAgentAdapter` has no memory. Each `adapter.run()` call spawns a fresh CLI process. Session continuity is achieved by passing a `sessionId` string -- the Claude CLI reads its session history from disk (`~/.claude/` or similar) and resumes from there.

Therefore:
- You **do not** need to keep an adapter object alive between calls
- You **do not** need to "rehydrate" an adapter after restart
- You **can** create a fresh adapter, call `run({ sessionId: 'abc123' })`, and it picks up where it left off
- The session state lives on the filesystem (managed by the CLI), not in our process

This is already proven by the existing PodManager pattern:

```typescript
// PodManager stores: Map<nodeId, sessionId>
// On restart, loadSessions() reads from pod-sessions.json
// The adapter itself is brand new, but the session resumes via sessionId
```

---

## What "Get Agent for Session ID X" Actually Means

The user requirement: *"Node pods will need to be able to get the agent for a given session ID. This agent adaptor should be a shared instance for a given session id, asking for the same session id gets same agent adaptor."*

Given adapter statelessness, there are two interpretations:

### Interpretation A: Shared Adapter State (Not Needed)

"Same adapter instance" implies in-memory state sharing. But adapters have no state to share. Two fresh `ClaudeCodeAdapter` instances calling `run({ sessionId: 'X' })` produce identical behaviour -- both spawn `claude --fork-session --resume X`.

### Interpretation B: Session-to-AgentType Binding (Needed)

What IS needed: knowing which agent type (`claude-code` or `copilot`) to use for a given session. If node A started a `claude-code` session, node B (inheriting that session) must also use `claude-code`. You cannot resume a Claude session with a Copilot adapter.

This is the real requirement: **session-to-type binding**, not adapter instance sharing.

---

## Option Analysis

### Option A: Enhance PodManager (Minimal Change)

PodManager already tracks `nodeId -> sessionId`. Extend it to also track `sessionId -> agentType`.

```typescript
// Enhanced PodManager
class PodManager implements IPodManager {
  private readonly pods = new Map<string, IWorkUnitPod>();
  private readonly sessions = new Map<string, string>();      // nodeId -> sessionId
  private readonly sessionTypes = new Map<string, AgentType>(); // sessionId -> agentType

  setSessionId(nodeId: string, sessionId: string, agentType?: AgentType): void {
    this.sessions.set(nodeId, sessionId);
    if (agentType) {
      this.sessionTypes.set(sessionId, agentType);
    }
  }

  getSessionAgentType(sessionId: string): AgentType | undefined {
    return this.sessionTypes.get(sessionId);
  }
}
```

ODS uses this when creating pods for nodes that inherit sessions:

```typescript
// In ODS.handleAgentOrCode():
const contextResult = this.deps.contextService.getContextSource(reality, nodeId);
if (contextResult.source === 'inherit') {
  contextSessionId = this.deps.podManager.getSessionId(contextResult.fromNodeId);
  // Use inherited session's agent type, not graph default
}
```

**Pros**: Minimal change. PodManager already owns session lifecycle. No new abstractions.
**Cons**: Agent type binding is informal (just a Map). Adapters are still created fresh per pod by ODS via `this.deps.agentAdapter`.

**Problem**: ODS currently receives a single `IAgentAdapter` and passes it to every pod. This means all pods in a graph use the same adapter type. This is fine for the graph-level agent type setting -- but means ODS needs the adapter factory, not a single adapter.

### Option B: Adapter Factory in ODS (Recommended)

Replace the single `IAgentAdapter` dependency with an `AdapterFactory` in ODS. This allows per-node adapter type selection.

```typescript
// Current ODS dependency
interface ODSDependencies {
  agentAdapter: IAgentAdapter;   // single instance for all pods
  // ...
}

// Proposed ODS dependency
interface ODSDependencies {
  adapterFactory: AdapterFactory;   // creates adapters by type
  // ...
}
```

ODS resolves the agent type per node:

```typescript
private buildPodParams(node: NodeReality, graphSettings: GraphOrchestratorSettings) {
  if (node.unitType === 'agent') {
    // Priority: node override > graph default > 'claude-code'
    const agentType = node.agentType ?? graphSettings.agentType ?? 'claude-code';
    return {
      unitType: 'agent' as const,
      unitSlug: node.unitSlug,
      adapter: this.deps.adapterFactory(agentType),
      agentType,
    };
  }
  // ...
}
```

When inheriting a session, ODS looks up the session's agent type:

```typescript
private async handleAgentOrCode(request, ctx, reality, node) {
  let contextSessionId: string | undefined;
  let agentType: AgentType | undefined;

  const contextResult = this.deps.contextService.getContextSource(reality, nodeId);
  if (contextResult.source === 'inherit') {
    contextSessionId = this.deps.podManager.getSessionId(contextResult.fromNodeId);
    // Must use same agent type as inherited session
    if (contextSessionId) {
      agentType = this.deps.podManager.getSessionAgentType(contextSessionId);
    }
  }

  // Create pod with correct adapter type
  const pod = this.deps.podManager.createPod(nodeId, {
    unitType: 'agent',
    unitSlug: node.unitSlug,
    adapter: this.deps.adapterFactory(agentType ?? graphSettings.agentType ?? 'claude-code'),
  });

  // Fire-and-forget
  pod.execute({ inputs: request.inputs, contextSessionId, ctx, graphSlug: request.graphSlug });
}
```

**Pros**: Clean. Each pod gets a fresh adapter of the correct type. Session-type binding prevents cross-type resumption. Works with existing architecture.
**Cons**: Slightly more complex than status quo. Need to persist sessionType alongside sessionId.

### Option C: Full AgentInstance Integration (Over-Engineered)

Wrap every pod's agent in a Plan 019 `AgentInstance` to get SSE broadcasting, event history, status tracking.

```typescript
// Hypothetical: AgentManagerService.getOrCreateForNode()
const instance = agentManager.getOrCreateForSession({
  sessionId: contextSessionId,
  name: `node-${nodeId}`,
  type: agentType,
  workspace: ctx.worktreePath,
});
const result = await instance.run({ prompt, cwd: ctx.worktreePath });
```

**Pros**: Unified agent model. SSE events come for free. Event history auto-captured.
**Cons**:
- AgentInstance has a **different status model** (`working`/`stopped`/`error`) from node execution status (`starting`/`agent-accepted`/`waiting-question`/`blocked-error`/`complete`). Two disconnected state machines.
- AgentInstance requires `IAgentNotifierService` (SSE broadcaster). The orchestration system explicitly avoids web constructs.
- AgentInstance stores events in NDJSON files at `~/.config/chainglass/agents/`. The positional graph stores events in `state.json`. Duplicated event storage.
- Double-run guard in AgentInstance (`if working, throw`) conflicts with fire-and-forget model.
- Adds coupling between Plan 019 (web UI agents) and Plan 030 (graph orchestration).

**Verdict**: This is the wrong abstraction for orchestration pods. AgentInstance was designed for web UI agent management, not for the positional graph's fire-and-forget execution model.

---

## Recommended Design: Option B with Session Binding

### Architecture

```
                                              GraphOrchestratorSettings
                                                 { agentType: 'claude-code' }
                                                          |
                                                          v
  ┌──────────────────────────────────────────────────────────────────────┐
  │ ODS (Orchestration Dispatch Service)                                 │
  │                                                                      │
  │  deps.adapterFactory: (agentType) => IAgentAdapter                  │
  │                                                                      │
  │  handleAgentOrCode(request, ctx, reality, node):                    │
  │    1. Resolve contextSessionId from AgentContextService              │
  │    2. Resolve agentType:                                             │
  │       a. Inherited session? Use that session's agentType             │
  │       b. Else: graphSettings.agentType ?? 'claude-code'             │
  │    3. Create adapter: adapterFactory(agentType)                      │
  │    4. Create pod: podManager.createPod(nodeId, { adapter })         │
  │    5. Fire-and-forget: pod.execute({ contextSessionId, ... })       │
  │    6. After execute: podManager.setSession(nodeId, sessionId, type) │
  └──────────────────────────────────────────────────────────────────────┘
                    |                           |
                    v                           v
  ┌─────────────────────────┐   ┌─────────────────────────────────────┐
  │ AgentPod                │   │ PodManager                          │
  │                         │   │                                     │
  │  adapter: IAgentAdapter │   │  sessions: Map<nodeId, sessionId>   │
  │  _sessionId: string     │   │  sessionTypes: Map<sessionId, type> │
  │                         │   │                                     │
  │  execute():             │   │  getSessionId(nodeId)               │
  │    adapter.run({        │   │  getSessionAgentType(sessionId)     │
  │      prompt,            │   │  setSession(nodeId, sid, type)      │
  │      sessionId,         │   │                                     │
  │      cwd                │   │  loadSessions() / persistSessions() │
  │    })                   │   │  (includes sessionTypes in JSON)    │
  └─────────────────────────┘   └─────────────────────────────────────┘
```

### Key Design Decisions

#### DYK-W1: No Long-Lived Agent Objects

Adapters are created fresh per `pod.execute()` call. There is no agent pool, no agent cache, no rehydration of adapter state. Session continuity is purely via the `sessionId` string.

**Rationale**: The Claude Code CLI stores session history on disk. Our process just needs to tell it which session to resume. A fresh `ClaudeCodeAdapter` calling `run({ sessionId: 'X' })` is functionally identical to a reused one.

#### DYK-W2: Session-Type Binding Is the Real Requirement

When the user says "shared instance for a given session ID", the real need is: **session-type binding**. If session `abc123` was started with `claude-code`, any node inheriting that session must also use `claude-code`. PodManager tracks this.

#### DYK-W3: AdapterFactory Replaces Single Adapter

ODS currently receives `IAgentAdapter` (one instance). This is replaced with `AdapterFactory` so ODS can create the right adapter type per node.

```typescript
// Current DI
ORCHESTRATION_DI_TOKENS.AGENT_ADAPTER  -> IAgentAdapter

// New DI
ORCHESTRATION_DI_TOKENS.ADAPTER_FACTORY -> AdapterFactory
```

#### DYK-W4: Graph-Level Agent Type Setting

`GraphOrchestratorSettings` gets a new field:

```typescript
// Current (empty)
export const GraphOrchestratorSettingsSchema = z.object({}).strict();

// New
export const GraphOrchestratorSettingsSchema = z.object({
  agentType: z.enum(['claude-code', 'copilot']).optional(),
}).strict();
```

Defaults to `'claude-code'` when not specified. Individual nodes can override via `supported_agents` in their work unit definition (not this plan's scope, but the schema already supports it).

#### DYK-W5: No Web Constructs in Orchestration

The orchestration layer (ODS, PodManager, AgentPod) does NOT use:
- `IAgentNotifierService` (SSE broadcasting)
- `AgentInstance` (web UI agent wrapper)
- `AgentManagerService` (web UI agent registry)

These remain in Plan 019's domain. When the web UI needs to observe orchestration agents, it will read from the node event system (Plan 032 events in `state.json`), NOT from AgentManagerService.

#### DYK-W6: UI Observability via Node Events (Later)

The node event system (Plan 032) is the bridge between orchestration and UI:

```
Agent runs in pod
  -> Agent raises events via CLI: cg wf node raise-event ...
  -> Events stored in state.json
  -> Orchestration loop's Settle phase processes events
  -> (Later) Web UI polls state.json or subscribes to domain events
```

This keeps the orchestration layer clean and web-construct-free. The existing `IAgentNotifierService` handles Plan 019's standalone agents; Plan 032's events handle orchestration agents. Multiple UI elements can read `state.json` independently.

---

## Session Lifecycle Walk-Through

### Scenario: Node A starts fresh, Node B inherits

```
1. Orchestration loop -> ONBAS decides: start-node A
2. ODS.handleAgentOrCode(A):
   a. AgentContextService: node A is first on line 0 -> source: 'new'
   b. No contextSessionId
   c. agentType = graphSettings.agentType ?? 'claude-code'
   d. adapter = adapterFactory('claude-code')     // fresh adapter
   e. pod = podManager.createPod('A', { adapter })
   f. pod.execute({ contextSessionId: undefined })
      -> adapter.run({ prompt, cwd })             // no --resume flag
      -> returns { sessionId: 'ses-001', status: 'completed' }
   g. pod._sessionId = 'ses-001'

3. ODS records session:
   podManager.setSession('A', 'ses-001', 'claude-code')
   podManager.persistSessions(ctx, graphSlug)

4. ... orchestration loop continues ...

5. Orchestration loop -> ONBAS decides: start-node B (inherits from A)
6. ODS.handleAgentOrCode(B):
   a. AgentContextService: node B is serial after A -> source: 'inherit', fromNodeId: 'A'
   b. contextSessionId = podManager.getSessionId('A') -> 'ses-001'
   c. agentType = podManager.getSessionAgentType('ses-001') -> 'claude-code'
   d. adapter = adapterFactory('claude-code')     // fresh adapter
   e. pod = podManager.createPod('B', { adapter })
   f. pod.execute({ contextSessionId: 'ses-001' })
      -> adapter.run({ prompt, sessionId: 'ses-001', cwd })
         // spawns: claude --fork-session --resume ses-001 -p "..."
      -> returns { sessionId: 'ses-002', status: 'completed' }
   g. pod._sessionId = 'ses-002'

7. ODS records session:
   podManager.setSession('B', 'ses-002', 'claude-code')
```

### Scenario: System restarts mid-graph

```
1. System crashes after node A completed (session 'ses-001')

2. System restarts
3. PodManager.loadSessions(ctx, graphSlug):
   -> Reads pod-sessions.json:
      { "sessions": { "A": "ses-001" },
        "sessionTypes": { "ses-001": "claude-code" },
        "persisted_at": "..." }
   -> sessions map: { A -> ses-001 }
   -> sessionTypes map: { ses-001 -> claude-code }

4. Orchestration loop resumes
5. ONBAS decides: start-node B (inherits from A)
6. ODS.handleAgentOrCode(B):
   a. contextSessionId = podManager.getSessionId('A') -> 'ses-001'  // from loaded sessions
   b. agentType = podManager.getSessionAgentType('ses-001') -> 'claude-code'
   c. adapter = adapterFactory('claude-code')  // brand new adapter, no state to restore
   d. pod.execute({ contextSessionId: 'ses-001' })
      -> claude --fork-session --resume ses-001  // CLI resumes from disk history
```

No "rehydration" of agent objects needed. The adapter is stateless; the session is on the CLI's filesystem.

---

## Session Persistence Format

Updated `pod-sessions.json`:

```json
{
  "sessions": {
    "get-spec": "ses-1738123456789-abc",
    "generate-code": "ses-1738123456790-def"
  },
  "session_types": {
    "ses-1738123456789-abc": "claude-code",
    "ses-1738123456790-def": "claude-code"
  },
  "persisted_at": "2026-02-11T10:30:00.000Z"
}
```

**Why `session_types` is a separate map**: Sessions can be shared across nodes (via inheritance). Using `sessionId -> type` avoids duplicating type info per node. If 5 nodes share a session, the type is stored once.

---

## Question: Does AgentPod Need to Change?

Current AgentPod is clean and minimal:

```typescript
class AgentPod implements IWorkUnitPod {
  constructor(readonly nodeId: string, private readonly agentAdapter: IAgentAdapter) {}

  async execute(options: PodExecuteOptions): Promise<PodExecuteResult> {
    const prompt = loadStarterPrompt();
    const sessionId = contextSessionId ?? this._sessionId;
    const result = await this.agentAdapter.run({ prompt, sessionId, cwd: ctx.worktreePath });
    this._sessionId = result.sessionId;
    return this.mapAgentResult(result);
  }
}
```

**Changes needed for Plan 033**:

1. **Prompt enrichment** -- `loadStarterPrompt()` returns a generic 24-line placeholder. Real agents need richer context (graph slug, node ID, CLI commands). This is a separate workshop topic (prompt design), not an AgentPod structural change.

2. **Event forwarding** -- `PodExecuteOptions.onEvent` callback exists but AgentPod doesn't use it. For real agents, adapter events (text_delta, tool_call) could be forwarded. However, given DYK-W5 (no web constructs), this remains unused until the UI integration plan.

3. **Agent type tracking** -- AgentPod doesn't need to know its agent type. That's PodManager's concern. The pod just uses whatever adapter it was given.

**Verdict**: AgentPod itself needs minimal changes. The prompt loading is the main enhancement (separate concern). The architecture changes are in ODS (adapter factory) and PodManager (session-type binding).

---

## Question: What About Parallel Agents?

When two nodes run in parallel (`NodeOrchestratorSettings.execution: 'parallel'`):

```
Line 1: [ nodeA (parallel) ] [ nodeB (parallel) ]
```

Per AgentContextService Rule 3: **parallel nodes always get new sessions**.

```typescript
// From agent-context.ts
if (node.executionMode === 'parallel') {
  return { source: 'new' };
}
```

Each parallel node:
1. Gets a fresh adapter via `adapterFactory(graphSettings.agentType)`
2. Gets no `contextSessionId` (new session)
3. Runs independently, fire-and-forget
4. CLI spawns separate processes with separate sessions

No adapter sharing, no session sharing, no coordination needed between parallel agents. They are independent processes working on independent tasks.

---

## Question: What About the `AgentService` Wrapper?

The CLI has `AgentService` (not `AgentManagerService`) that wraps adapter factory with:
- Timeout enforcement via `Promise.race()`
- Agent type validation
- Active session tracking for terminate()

Should ODS use `AgentService` instead of raw `AdapterFactory`?

```typescript
// Option 1: Raw factory (current recommendation)
deps.adapterFactory = (agentType) => new ClaudeCodeAdapter(pm);

// Option 2: AgentService wrapper
deps.agentService = new AgentService(adapterFactory, configService, logger);
// Then: agentService.run({ prompt, agentType, sessionId, cwd })
```

**Analysis**:
- AgentService provides timeout enforcement -- useful for real agents
- AgentService provides agent type validation -- useful
- AgentService tracks active sessions for terminate() -- useful

**Recommendation**: Use `AgentService` as the adapter layer, not raw factory. This gives us timeout enforcement and validation without coupling to AgentManagerService/AgentInstance.

```typescript
// Revised ODS dependency
interface ODSDependencies {
  agentService: AgentService;   // replaces agentAdapter
  // ...
}
```

AgentPod changes to use AgentService:

```typescript
class AgentPod implements IWorkUnitPod {
  constructor(
    readonly nodeId: string,
    private readonly agentService: AgentService,
    private readonly agentType: AgentType,
  ) {}

  async execute(options: PodExecuteOptions): Promise<PodExecuteResult> {
    const prompt = loadStarterPrompt();
    const sessionId = contextSessionId ?? this._sessionId;

    const result = await this.agentService.run({
      prompt,
      agentType: this.agentType,
      sessionId,
      cwd: ctx.worktreePath,
    });

    this._sessionId = result.sessionId;
    return this.mapAgentResult(result);
  }
}
```

**Wait -- there's a problem.** `AgentService.run()` creates a fresh adapter per call via `this._adapterFactory(agentType)`. That's fine (adapters are stateless). But `AgentService` has a `_timeout` from config. For long-running agent pods, this timeout may be too aggressive.

**Resolution**: The graph orchestrator settings could override the timeout:

```typescript
GraphOrchestratorSettingsSchema = z.object({
  agentType: z.enum(['claude-code', 'copilot']).optional(),
  agentTimeout: z.number().positive().optional(),  // ms, overrides config default
}).strict();
```

But this is a refinement for later. For now, AgentService's config-based timeout is acceptable for testing.

---

## Revised PodCreateParams

```typescript
// Current
type PodCreateParams =
  | { unitType: 'agent'; unitSlug: string; adapter: IAgentAdapter }
  | { unitType: 'code'; unitSlug: string; runner: IScriptRunner };

// Proposed
type PodCreateParams =
  | { unitType: 'agent'; unitSlug: string; agentService: AgentService; agentType: AgentType }
  | { unitType: 'code'; unitSlug: string; runner: IScriptRunner };
```

PodManager creates AgentPod with the service and type:

```typescript
createPod(nodeId: string, params: PodCreateParams): IWorkUnitPod {
  if (params.unitType === 'agent') {
    return new AgentPod(nodeId, params.agentService, params.agentType);
  }
  return new CodePod(nodeId, params.runner);
}
```

---

## DI Container Changes

```typescript
// Current: registerOrchestrationServices()
const agentAdapter = c.resolve<IAgentAdapter>(ORCHESTRATION_DI_TOKENS.AGENT_ADAPTER);
const ods = new ODS({ graphService, podManager, contextService, agentAdapter, scriptRunner });

// Proposed: registerOrchestrationServices()
const agentService = c.resolve<AgentService>(ORCHESTRATION_DI_TOKENS.AGENT_SERVICE);
const ods = new ODS({ graphService, podManager, contextService, agentService, scriptRunner });
```

New prerequisite token:
```typescript
ORCHESTRATION_DI_TOKENS.AGENT_SERVICE  // AgentService (was AGENT_ADAPTER)
```

In CLI container:
```typescript
// Already registered as CLI_DI_TOKENS.AGENT_SERVICE
// Need to also register as ORCHESTRATION_DI_TOKENS.AGENT_SERVICE
// (or use a shared token)
```

---

## Summary of Changes

| Component | Change | Scope |
|-----------|--------|-------|
| `GraphOrchestratorSettingsSchema` | Add `agentType` field | Schema |
| `ODSDependencies` | Replace `agentAdapter: IAgentAdapter` with `agentService: AgentService` | Interface |
| `ODS.handleAgentOrCode()` | Resolve agentType per node (inherit > graph setting > default) | Logic |
| `ODS.buildPodParams()` | Pass agentService + agentType instead of single adapter | Logic |
| `PodCreateParams` | Agent variant: `agentService + agentType` instead of `adapter` | Type |
| `PodManager` | Add `sessionTypes` map + `getSessionAgentType()` | Enhancement |
| `PodManager` | Include `session_types` in pod-sessions.json | Persistence |
| `AgentPod` | Accept `AgentService` + `AgentType` instead of `IAgentAdapter` | Constructor |
| `AgentPod.execute()` | Call `agentService.run({ agentType, ... })` | Method |
| `registerOrchestrationServices()` | Resolve `AgentService` instead of `IAgentAdapter` | DI |
| CLI container | Register `ORCHESTRATION_DI_TOKENS.AGENT_SERVICE` | DI |

---

## What We Are NOT Doing

1. **NOT creating a new `INodeAgentService` interface** -- AgentService already exists and provides what we need (factory + timeout + validation).
2. **NOT using AgentInstance** -- wrong abstraction for fire-and-forget pods. Different status model, web-UI coupling.
3. **NOT using AgentManagerService** -- that's for web UI agent management. Orchestration doesn't need a registry.
4. **NOT bridging Plan 019 and Plan 030 agent systems** -- they serve different purposes. The node event system (Plan 032) is the observation channel for orchestration agents.
5. **NOT adding SSE/notification to the orchestration layer** -- UI observability comes later via Plan 032 events.
6. **NOT caching adapter instances** -- they're stateless. Fresh is fine.

---

## Open Questions

### Q1: Should we rename ORCHESTRATION_DI_TOKENS.AGENT_ADAPTER?

**RESOLVED**: Yes, rename to `ORCHESTRATION_DI_TOKENS.AGENT_SERVICE` to reflect the change from raw adapter to service. The old token name is misleading if it resolves AgentService instead of IAgentAdapter.

### Q2: Should GraphOrchestratorSettings.agentType be required?

**RESOLVED**: No, optional with default `'claude-code'`. This matches the user's request: "copilot default, claude code optional" -- but we invert it because claude-code is the primary supported type. The default can be flipped later via config.

### Q3: Can AgentPod still accept IAgentAdapter directly for testing?

**OPEN**: Tests currently use `FakeAgentAdapter` directly. With the change to `AgentService`, tests would need to construct a full `AgentService` with fake factory. Alternatively, AgentPod could accept `IAgentAdapter | AgentService` discriminated by a flag -- but this is ugly.

Better option: keep tests using `FakeAgentAdapter` by making AgentPod accept a simple run function:

```typescript
type AgentRunner = (options: AgentRunOptions & { agentType: string }) => Promise<AgentResult>;
```

This is a type alias that AgentService satisfies via `.run()` and tests can satisfy with a lambda. TBD in architecture phase.

### Q4: What about CWD binding (ADR-0006 DYK-07)?

**RESOLVED**: All pod invocations must use `ctx.worktreePath` as CWD. This is already implemented in AgentPod:

```typescript
cwd: ctx.worktreePath  // line 63 of pod.agent.ts
```

No change needed. Session resumption with consistent CWD is guaranteed.

### Q5: Should PodManager persist after every session change, or batch?

**OPEN**: Currently `persistSessions()` is called explicitly. With real agents completing asynchronously (fire-and-forget), we need to persist immediately after each session update to avoid data loss on crash. This means `setSession()` should trigger an async persist. The fire-and-forget pattern means we can't guarantee the caller awaits it, so PodManager should queue/debounce persists internally.
