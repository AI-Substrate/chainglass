# Agentic Development Harness - Key Findings (IC-01 through IC-14)

## Quick Reference: 14 Core Interfaces & Contracts

### **IC-01: REST API Routes — Workspace Management**
**GET /api/workspaces** and **GET /api/workspaces/[slug]**
- Auth required (NextAuth)
- Optional query: `?include=worktrees`
- Resolves via `IWorkspaceService` from DI container
- No caching — always fresh reads
- Returns workspace objects with preferences and worktree info

---

### **IC-02: REST API Routes — Agent Management & Execution**
**POST/GET /api/agents**, **GET/DELETE /api/agents/[id]**, **POST /api/agents/[id]/run**
- Agent CRUD: Create (POST), List (GET), Delete (DELETE)
- Execution: **POST /api/agents/[id]/run** with `{ prompt, cwd? }`
- Double-run guard: Returns 409 Conflict if agent already running
- Event broadcast: `agent_created`, `agent_terminated` via SSE
- Agent types: `'claude-code' | 'copilot' | 'copilot-cli'`
- Per-agent event history stored for rehydration

---

### **IC-03: REST API Routes — File & Sample Operations**
**GET /api/workspaces/[slug]/files** and **GET /api/workspaces/[slug]/samples**
- File listing with optional recursive tree mode
- Sample discovery for workflow templates
- Security: Path traversal protection, absolute paths only
- Integrates: `IFileSystem` and `ISampleService` from DI

---

### **IC-04: Server-Sent Events (SSE) Routes**
**GET /api/events/[channel]** and **GET /api/agents/events**
- Multi-channel pub/sub via `SSEManager`
- Generic channel with alphanumeric validation
- Dedicated agent events channel
- Heartbeat: 30s intervals
- Event format: `event: <type>\ndata: <json>\n\n`
- Automatic cleanup on disconnect

---

### **IC-05: Server Actions — Workspace & Sample Mutations**
**addWorkspace(formData)** and **addSample(...)**
- Form-based mutations (NextAuth form actions)
- Validation via Zod schemas
- Cache invalidation: `revalidatePath()`
- WorkspaceService validates filesystem existence

---

### **IC-06: Server Actions — Workflow CRUD & Orchestration**
**listWorkflows()**, **loadWorkflow()**, **createWorkflow()**, **listWorkUnits()**
**addNode()**, **removeNode()**, **moveNode()**, **addLine()**, **removeLine()**
**setInput()**, **getNodeStatus()**, **answerQuestion()**
**saveAsTemplate()**, **instantiateTemplate()**, **listTemplates()**
- Full workflow authoring: CRUD operations on graphs, nodes, lines, connections
- Status queries: Real-time execution status for nodes, lines, graphs
- Q&A protocol: Handle user input prompts during execution
- Template lifecycle: Create templates from live graphs, instantiate, refresh

---

### **IC-07: IWorkspaceService Interface**
**Located**: `/packages/workflow/src/interfaces/workspace-service.interface.ts`
```typescript
interface IWorkspaceService {
  add(name, path, options?): Promise<AddWorkspaceResult>
  list(): Promise<Workspace[]>
  remove(slug): Promise<RemoveWorkspaceResult>
  getInfo(slug): Promise<WorkspaceInfo | null>
  resolveContext(path): Promise<WorkspaceContext | null>
  resolveContextFromParams(slug, worktreePath?): Promise<WorkspaceContext | null>
  updatePreferences(slug, prefs): Promise<WorkspaceOperationResult>
}
```
- Validates paths: Must be absolute, no `..`, must exist on filesystem
- Returns errors[] array (never throws for expected errors)
- `WorkspaceInfo` includes: slug, name, path, worktrees[], hasGit, createdAt
- Preferences: emoji, color, starred, sortOrder, starredWorktrees

---

### **IC-08: IPositionalGraphService Interface**
**Located**: `/packages/positional-graph/src/interfaces/positional-graph-service.interface.ts`
**775 lines**: Comprehensive workflow graph manipulation

**Graph CRUD**:
```typescript
create(ctx, slug): Promise<GraphCreateResult>
load(ctx, slug): Promise<PGLoadResult>
show(ctx, slug): Promise<PGShowResult>
delete(ctx, slug): Promise<BaseResult>
list(ctx): Promise<PGListResult>
```

**Line Operations**:
```typescript
addLine(ctx, graphSlug, options?): Promise<AddLineResult>
removeLine(ctx, graphSlug, lineId): Promise<BaseResult>
moveLine(ctx, graphSlug, lineId, toIndex): Promise<BaseResult>
setLineLabel/setLineDescription(ctx, graphSlug, lineId, text): Promise<BaseResult>
```

**Node Operations**:
```typescript
addNode(ctx, graphSlug, lineId, unitSlug, options?): Promise<AddNodeResult>
removeNode(ctx, graphSlug, nodeId): Promise<BaseResult>
moveNode(ctx, graphSlug, nodeId, options): Promise<BaseResult>
showNode(ctx, graphSlug, nodeId): Promise<NodeShowResult>
```

**Status & Execution**:
```typescript
getNodeStatus(ctx, graphSlug, nodeId): Promise<NodeStatusResult>
getLineStatus(ctx, graphSlug, lineId): Promise<LineStatusResult>
getStatus(ctx, graphSlug): Promise<GraphStatusResult>
startNode(ctx, graphSlug, nodeId): Promise<StartNodeResult>
canEnd(ctx, graphSlug, nodeId): Promise<CanEndResult>
endNode(ctx, graphSlug, nodeId, message?): Promise<EndNodeResult>
```

**Input Resolution**:
```typescript
setInput(ctx, graphSlug, nodeId, inputName, source): Promise<BaseResult>
removeInput(ctx, graphSlug, nodeId, inputName): Promise<BaseResult>
collateInputs(ctx, graphSlug, nodeId): Promise<InputPack>
getInputData(ctx, graphSlug, nodeId, inputName): Promise<GetInputDataResult>
getInputFile(ctx, graphSlug, nodeId, inputName): Promise<GetInputFileResult>
```

**Events**:
```typescript
raiseNodeEvent(ctx, graphSlug, nodeId, eventType, payload, source): Promise<RaiseNodeEventResult>
getNodeEvents(ctx, graphSlug, nodeId, filter?): Promise<GetNodeEventsResult>
stampNodeEvent(ctx, graphSlug, nodeId, eventId, subscriber, action, data?): Promise<StampNodeEventResult>
```

**Snapshot & State**:
```typescript
loadGraphState(ctx, graphSlug): Promise<State>
persistGraphState(ctx, graphSlug, state): Promise<void>
restoreSnapshot(ctx, graphSlug, definition, nodeConfigs): Promise<BaseResult>
loadAllNodeConfigs(ctx, graphSlug): Promise<{ nodeConfigs, errors }>
```

---

### **IC-09: IOrchestrationService & IGraphOrchestration Interfaces**
**Located**: `/packages/positional-graph/src/features/030-orchestration/orchestration-service.types.ts`

**Two-Level Pattern**: Singleton service creates per-graph handles

```typescript
// Singleton
interface IOrchestrationService {
  get(ctx: WorkspaceContext, graphSlug: string): Promise<IGraphOrchestration>
}

// Per-Graph Handle
interface IGraphOrchestration {
  readonly graphSlug: string
  run(): Promise<OrchestrationRunResult>
  drive(options?: DriveOptions): Promise<DriveResult>
  getReality(): Promise<PositionalGraphReality>
}
```

**run() Cycle**: Settle events → Build reality → ONBAS → ODS → Record → Repeat

**drive() Options**:
```typescript
interface DriveOptions {
  maxIterations?: number         // Default: 200
  actionDelayMs?: number         // Default: 100 ms
  idleDelayMs?: number           // Default: 10,000 ms
  onEvent?: (event: DriveEvent) => void | Promise<void>
}
```

**DriveEvent Types**: `'iteration' | 'idle' | 'status' | 'error'`

**Exit Reasons**: `'complete' | 'failed' | 'max-iterations'`

**Key**: No timeout enforcement — agents can run for hours

---

### **IC-10: Agent Service Interfaces**
**Files**: 
- `/packages/shared/src/features/019-agent-manager-refactor/agent-manager.interface.ts`
- `/packages/shared/src/features/019-agent-manager-refactor/agent-instance.interface.ts`
- `/packages/workflow/src/interfaces/agent-session-service.interface.ts`

**IAgentManagerService** (Central Registry):
```typescript
interface IAgentManagerService {
  initialize(): Promise<void>
  createAgent(params: CreateAgentParams): IAgentInstance
  getAgent(id: string): IAgentInstance | null
  getAgents(filter?: AgentFilter): IAgentInstance[]
  terminateAgent(id: string): Promise<boolean>
}
```

**IAgentInstance** (Self-Contained Agent):
```typescript
interface IAgentInstance {
  readonly id: string
  readonly name: string
  readonly type: 'claude-code' | 'copilot' | 'copilot-cli'
  readonly workspace: string
  readonly status: 'working' | 'stopped' | 'error'
  readonly intent: string
  readonly sessionId: string | null
  readonly createdAt: Date
  readonly updatedAt: Date
  
  run(options: AgentRunOptions): Promise<AgentResult>
  terminate(): Promise<AgentResult>
  getEvents(options?: GetEventsOptions): AgentStoredEvent[]
  updateIntent(intent: string): void
}
```

**Status State Machine**: `stopped → working → stopped|error` (3 states only)

**IAgentSessionService** (Legacy):
```typescript
interface IAgentSessionService {
  createSession(ctx, type): Promise<CreateSessionResult>
  getSession(ctx, sessionId): Promise<AgentSession | null>
  listSessions(ctx): Promise<AgentSession[]>
  deleteSession(ctx, sessionId): Promise<DeleteSessionResult>
  updateSessionStatus(ctx, sessionId, status): Promise<UpdateSessionStatusResult>
}
```

---

### **IC-11: ITemplateService Interface**
**Located**: `/packages/workflow/src/interfaces/template-service.interface.ts`

```typescript
interface ITemplateService {
  // Template creation
  saveFrom(ctx, graphSlug, templateSlug): Promise<SaveFromResult>
  
  // Discovery
  listWorkflows(ctx): Promise<ListWorkflowsResult>
  showWorkflow(ctx, templateSlug): Promise<ShowWorkflowResult>
  
  // Instance creation
  instantiate(ctx, templateSlug, instanceId): Promise<InstantiateResult>
  listInstances(ctx, templateSlug): Promise<ListInstancesResult>
  
  // Instance updates
  refresh(ctx, templateSlug, instanceId): Promise<RefreshResult>
}
```

**Template Anatomy**: `graph.yaml` + `nodes/*/node.yaml` + `units/`

**Instantiation**: Strips runtime state (state.json, outputs/, events)

**Refresh**: Full directory replacement per unit (graph topology never modified)

---

### **IC-12: CLI Command Structure**
**Located**: `/apps/cli/src/commands/`

**Workflow Commands**:
```bash
cg workflow list
cg workflow info <slug>
cg workflow checkpoint <slug> [--force] [--comment "..."]
cg workflow restore <slug> <version> [--force]
cg workflow versions <slug>
cg workflow compose <slug> [--checkpoint <version>]
```

**Agent Commands**:
```bash
cg agent run
  -t, --type <type>           # 'claude-code' or 'copilot'
  -p, --prompt <text>         # Prompt text
  -f, --prompt-file <path>    # Read from file
  -s, --session <id>          # Session ID for resumption
  -c, --cwd <path>            # Working directory
  --name <name>               # Human-readable name
  --meta <key=value>          # Metadata (repeatable)
  --stream                    # Stream events as NDJSON
  --verbose                   # Human-readable events
  --quiet                     # Suppress output

cg agent compact
  -t, --type <type>           # Agent type
  -s, --session <id>          # Session ID (required)
  -c, --cwd <path>            # Working directory
  --quiet                     # Suppress output
```

**Other Commands**:
- `cg positional-graph [list|create|info|delete|...]`
- `cg template [list|save|instantiate|...]`
- `cg sample [list|add|...]`
- `cg workspace [list|add|remove|...]`
- `cg unit [list|info|...]`

**Architecture**: DI container `createCliProductionContainer()`, no timeout

---

### **IC-13: Health Check Endpoint**
**GET /api/health**
- No auth required
- Returns: `{ status: 'ok' }` (HTTP 200)
- Purpose: Load balancer probes, monitoring

---

### **IC-14: Terminal Session Management**
**GET /api/terminal**
- Auth required
- Returns: `{ sessions: SessionInfo[], tmux: boolean }`
- SessionInfo: `{ name, attached, windows, created }`
- Executes: `tmux list-sessions` on host
- Purpose: Discover tmux sessions for copilot-cli targeting

---

## Harness Implementation Pattern

### **Phase 1: Bootstrap**
```typescript
const container = getContainer();
const wsService = container.resolve<IWorkspaceService>(WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE);
const ctx = await wsService.resolveContextFromParams('my-workspace');
```

### **Phase 2: Create Workflow**
```typescript
const pgService = container.resolve<IPositionalGraphService>(POSITIONAL_GRAPH_DI_TOKENS.POSITIONAL_GRAPH_SERVICE);
const { graphSlug } = (await pgService.create(ctx, 'test-flow')).data;
const { lineId } = (await pgService.addLine(ctx, graphSlug)).data;
const { nodeId } = (await pgService.addNode(ctx, graphSlug, lineId, 'code-unit')).data;
```

### **Phase 3: Run Orchestration**
```typescript
const orchService = container.resolve<IOrchestrationService>(POSITIONAL_GRAPH_DI_TOKENS.ORCHESTRATION_SERVICE);
const handle = await orchService.get(ctx, graphSlug);
const result = await handle.drive({
  maxIterations: 50,
  onEvent: (event) => console.log(`[${event.type}] ${event.message}`)
});
```

### **Phase 4: Agent Interaction**
```typescript
const agentMgr = container.resolve<IAgentManagerService>(SHARED_DI_TOKENS.AGENT_MANAGER_SERVICE);
const agent = agentMgr.createAgent({
  name: 'Test Agent',
  type: 'claude-code',
  workspace: 'my-workspace'
});
const result = await agent.run({ prompt: 'Write a test' });
const events = agent.getEvents();
```

### **Phase 5: Monitor via SSE**
```typescript
const eventSource = new EventSource('/api/agents/events');
eventSource.addEventListener('agent_status', (e) => {
  const { agentId, status } = JSON.parse(e.data);
  console.log(`Agent ${agentId}: ${status}`);
});
```

---

## DI Token Reference

| Token | Service | Package |
|-------|---------|---------|
| `WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE` | IWorkspaceService | workflow |
| `WORKSPACE_DI_TOKENS.SAMPLE_SERVICE` | ISampleService | workflow |
| `POSITIONAL_GRAPH_DI_TOKENS.POSITIONAL_GRAPH_SERVICE` | IPositionalGraphService | positional-graph |
| `POSITIONAL_GRAPH_DI_TOKENS.ORCHESTRATION_SERVICE` | IOrchestrationService | positional-graph |
| `POSITIONAL_GRAPH_DI_TOKENS.TEMPLATE_SERVICE` | ITemplateService | workflow |
| `POSITIONAL_GRAPH_DI_TOKENS.WORKUNIT_SERVICE` | IWorkUnitService | positional-graph |
| `SHARED_DI_TOKENS.AGENT_MANAGER_SERVICE` | IAgentManagerService | shared |
| `SHARED_DI_TOKENS.FILESYSTEM` | IFileSystem | shared |

---

## Key Design Principles

1. **No Caching**: All operations fetch fresh state from disk/DB
2. **Error Arrays**: Services return `{ success, errors[] }` instead of throwing
3. **WorkspaceContext Required**: All graph/agent operations need workspace resolution
4. **DI-First**: All services resolved from container, never direct instantiation
5. **SSE Multi-Channel**: Real-time updates via event streaming
6. **Agent Status Machine**: 3 states (working/stopped/error) with double-run guard
7. **Orchestration Polling**: `drive()` repeatedly calls `run()` until completion
8. **No Timeout Enforcement**: Agents can run indefinitely
9. **Template Immutability**: Templates are read-only; instantiate for modifications
10. **Form Actions**: Server mutations use NextAuth form actions with Zod validation

---

## Browser Automation Touchpoints

| Action | Route/Method | Auth | Returns |
|--------|-------------|------|---------|
| List workspaces | GET /api/workspaces | Yes | WorkspaceListItem[] |
| Create agent | POST /api/agents | Yes | IAgentInstance |
| Run prompt | POST /api/agents/[id]/run | Yes | { success: boolean } |
| Get agent status | GET /api/agents/[id] | Yes | IAgentInstance + events |
| Monitor events | GET /api/agents/events (SSE) | Yes | Agent events stream |
| List workflows | Server action listWorkflows() | Yes | TemplateManifest[] |
| Load workflow | Server action loadWorkflow() | Yes | PositionalGraphDefinition |
| Create workflow | Server action createWorkflow() | Yes | { graphSlug, lineId } |
| Add node | Server action addNode() | Yes | { nodeId, lineId, position } |
| Get status | Server action getNodeStatus() | Yes | NodeStatusResult |
| Drive orchestration | TypeScript only | N/A | OrchestrationRunResult[] |

