# First-Class Agentic Development Harness - Interface & Contract Documentation

## Overview
This document maps all programmatic interfaces available for building an agentic development harness that can automate testing, orchestration, and workflow execution through both APIs and CLI commands.

---

## IC-01: REST API Routes — Workspace Management
**File**: `/apps/web/app/api/workspaces/route.ts` and `/apps/web/app/api/workspaces/[slug]/route.ts`

### Contracts:
- **GET /api/workspaces**
  - Auth: Required (session via NextAuth)
  - Query: `?include=worktrees` (optional enrichment)
  - Returns: `{ workspaces: WorkspaceListItem[] }`
  - Each item: `{ slug, name, path, createdAt, preferences?, worktrees?, hasGit? }`

- **GET /api/workspaces/[slug]**
  - Auth: Required
  - Params: `slug` (workspace slug)
  - Returns: `{ workspace: { slug, name, path, createdAt, hasGit, worktrees } }`
  - Purpose: Fetch workspace with full worktree information

### Key Features:
- Lazy singleton DI container access (`getContainer()`)
- WorkspaceService resolves from DI (`WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE`)
- No caching — always fresh reads from WorkspaceService

---

## IC-02: REST API Routes — Agent Management & Execution
**Files**: `/apps/web/app/api/agents/route.ts`, `/apps/web/app/api/agents/[id]/route.ts`, `/apps/web/app/api/agents/[id]/run/route.ts`

### Contracts:

#### Create/List Agents
- **GET /api/agents**
  - Auth: Required
  - Query: `?workspace=<workspace>` (optional filter)
  - Returns: Agent array with `{ id, name, type, workspace, status, intent, sessionId, createdAt, updatedAt }`

- **POST /api/agents**
  - Auth: Required
  - Body: `CreateAgentParams = { name, type, workspace, sessionId?, tmuxWindow?, tmuxPane? }`
  - Valid types: `'claude-code' | 'copilot' | 'copilot-cli'`
  - Returns: Created agent (201)
  - Broadcasts: `agent_created` SSE event

#### Agent Operations
- **GET /api/agents/[id]**
  - Auth: Required
  - Returns: Agent + full event history for rehydration
  - Returns 404 if not found

- **DELETE /api/agents/[id]**
  - Auth: Required
  - Terminates and removes agent
  - Broadcasts: `agent_terminated` SSE event
  - Returns: `{ success: true, agentId }`

- **POST /api/agents/[id]/run**
  - Auth: Required
  - Body: `AgentRunOptions = { prompt: string, cwd?: string }`
  - Returns: 200 (success), 409 (already running), 404 (not found)
  - Double-run guard: Throws if agent.status === 'working'

#### Real-Time Events
- **GET /api/agents/events** (SSE)
  - Auth: Required
  - Channel: Single `'agents'` channel (all events broadcast here)
  - Event types: `agent_status`, `agent_intent`, `agent_text_delta`, `agent_text_replace`, `agent_text_append`, `agent_question`, `agent_created`, `agent_terminated`
  - Heartbeat: 30s interval
  - Client-side filtering by agentId

---

## IC-03: REST API Routes — Workflow File Operations
**Files**: `/apps/web/app/api/workspaces/[slug]/files/route.ts`, `/apps/web/app/api/workspaces/[slug]/samples/route.ts`

### Contracts:

#### File Listing
- **GET /api/workspaces/[slug]/files**
  - Auth: Required
  - Query: `dir=<path>`, `worktree=<path>`, `tree=true` (recursive mode)
  - Returns: Directory listing or recursive tree
  - Security: Path traversal rejection, must use absolute worktree path
  - Integrates: `IFileSystem` from DI

#### Sample Listing
- **GET /api/workspaces/[slug]/samples**
  - Auth: Required
  - Query: `worktree=<path>` (optional, defaults to main)
  - Returns: `{ samples: [{ slug, name, description, createdAt }], context }`
  - Uses: `ISampleService` from DI

---

## IC-04: Server-Sent Events (SSE) Routes
**Files**: `/apps/web/app/api/events/[channel]/route.ts`, `/apps/web/app/api/agents/events/route.ts`

### Contracts:

#### Generic Channel SSE
- **GET /api/events/[channel]**
  - Auth: Required
  - Params: `channel` (alphanumeric + `-_` only)
  - Feature: Multi-channel pub/sub via `SSEManager`
  - Event format: `event: <type>\ndata: <json>\n\n`
  - Heartbeat: 30s
  - Cleanup: Automatic on abort

---

## IC-05: Server Actions — Workspace & Sample Mutations
**File**: `/apps/web/app/actions/workspace-actions.ts`

### Contracts:

#### Create Workspace
- **addWorkspace(prevState: ActionState, formData: FormData)**
  - Fields: `name` (required, 1-100 chars), `path` (required, absolute)
  - Validation: Checks filesystem existence, validates against DI WorkspaceService
  - Returns: `ActionState = { success, message?, errors?, fields? }`
  - Cache invalidation: `revalidatePath('/workspaces')`

#### Sample Operations
- **addSample(workspaceSlug, worktreePath?, name, description)**
  - Uses: `ISampleService` from DI
  - Creates sample in workspace context

---

## IC-06: Server Actions — Workflow CRUD & Orchestration
**File**: `/apps/web/app/actions/workflow-actions.ts`

### Key Functions:

- **listWorkflows(workspaceSlug, worktreePath?): Promise<ListWorkflowsResult>**
  - Resolves `WorkspaceContext` via WorkspaceService
  - Returns: `{ data: TemplateManifest[], errors }`

- **loadWorkflow(workspaceSlug, graphSlug, worktreePath?): Promise<LoadWorkflowResult>**
  - Loads: `PositionalGraphDefinition` via IPositionalGraphService
  - Returns full definition for UI editing

- **createWorkflow(workspaceSlug, description?, worktreePath?): Promise<CreateWorkflowResult>**
  - Creates new graph with initial line via IPositionalGraphService
  - Returns: `{ data: { graphSlug, lineId }, errors }`

- **listWorkUnits(workspaceSlug, worktreePath?): Promise<ListWorkUnitsResult>**
  - Lists available work units via IWorkUnitService
  - Returns: Array of `{ slug, inputs, outputs, ... }`

- **addNode(graphSlug, lineId, unitSlug, description?)**
- **removeNode(graphSlug, nodeId)**
- **moveNode(graphSlug, nodeId, toLineId?, toPosition?)**
- **addLine(graphSlug, options)**
- **removeLine(graphSlug, lineId)**
- **setInput(graphSlug, nodeId, inputName, source)**
- **getNodeStatus(graphSlug, nodeId)** — Returns full execution status
- **answerQuestion(graphSlug, nodeId, answer)** — Q&A protocol
- **saveAsTemplate(graphSlug, templateSlug)** — Create reusable template
- **instantiateTemplate(templateSlug, instanceId)** — Create running instance
- **listTemplates(workspaceSlug)** — List available templates

---

## IC-07: IWorkspaceService Interface
**File**: `/packages/workflow/src/interfaces/workspace-service.interface.ts`

### Contract Signature:
```typescript
export interface IWorkspaceService {
  // CRUD
  add(name: string, path: string, options?: AddWorkspaceOptions): Promise<AddWorkspaceResult>
  list(): Promise<Workspace[]>
  remove(slug: string): Promise<RemoveWorkspaceResult>
  
  // Query
  getInfo(slug: string): Promise<WorkspaceInfo | null>
  resolveContext(path: string): Promise<WorkspaceContext | null>
  resolveContextFromParams(slug: string, worktreePath?: string): Promise<WorkspaceContext | null>
  
  // Update
  updatePreferences(slug: string, prefs: Partial<WorkspacePreferences>): Promise<WorkspaceOperationResult>
}
```

### Key Result Types:
```typescript
interface AddWorkspaceResult {
  success: boolean
  workspace?: Workspace
  errors: WorkspaceError[]
}

interface WorkspaceInfo {
  slug: string
  name: string
  path: string
  worktrees: Worktree[]
  hasGit: boolean
  createdAt: Date
}
```

---

## IC-08: IPositionalGraphService Interface
**File**: `/packages/positional-graph/src/interfaces/positional-graph-service.interface.ts`

### Graph CRUD Operations:
```typescript
export interface IPositionalGraphService {
  create(ctx: WorkspaceContext, slug: string): Promise<GraphCreateResult>
  load(ctx: WorkspaceContext, slug: string): Promise<PGLoadResult>
  show(ctx: WorkspaceContext, slug: string): Promise<PGShowResult>
  delete(ctx: WorkspaceContext, slug: string): Promise<BaseResult>
  list(ctx: WorkspaceContext): Promise<PGListResult>
}
```

### Line & Node Operations:
```typescript
// Lines
addLine(ctx, graphSlug, options?): Promise<AddLineResult>
removeLine(ctx, graphSlug, lineId): Promise<BaseResult>
moveLine(ctx, graphSlug, lineId, toIndex): Promise<BaseResult>
setLineLabel/setLineDescription(ctx, graphSlug, lineId, text): Promise<BaseResult>

// Nodes
addNode(ctx, graphSlug, lineId, unitSlug, options?): Promise<AddNodeResult>
removeNode(ctx, graphSlug, nodeId): Promise<BaseResult>
moveNode(ctx, graphSlug, nodeId, options): Promise<BaseResult>
setNodeDescription(ctx, graphSlug, nodeId, text): Promise<BaseResult>
showNode(ctx, graphSlug, nodeId): Promise<NodeShowResult>
```

### Status & Execution:
```typescript
getNodeStatus(ctx, graphSlug, nodeId): Promise<NodeStatusResult>
getLineStatus(ctx, graphSlug, lineId): Promise<LineStatusResult>
getStatus(ctx, graphSlug): Promise<GraphStatusResult>

// Node execution
startNode(ctx, graphSlug, nodeId): Promise<StartNodeResult>
canEnd(ctx, graphSlug, nodeId): Promise<CanEndResult>
endNode(ctx, graphSlug, nodeId, message?): Promise<EndNodeResult>
```

### Input Resolution:
```typescript
setInput(ctx, graphSlug, nodeId, inputName, source): Promise<BaseResult>
removeInput(ctx, graphSlug, nodeId, inputName): Promise<BaseResult>
collateInputs(ctx, graphSlug, nodeId): Promise<InputPack>
getInputData(ctx, graphSlug, nodeId, inputName): Promise<GetInputDataResult>
getInputFile(ctx, graphSlug, nodeId, inputName): Promise<GetInputFileResult>
```

### Event System:
```typescript
raiseNodeEvent(ctx, graphSlug, nodeId, eventType, payload, source): Promise<RaiseNodeEventResult>
getNodeEvents(ctx, graphSlug, nodeId, filter?): Promise<GetNodeEventsResult>
stampNodeEvent(ctx, graphSlug, nodeId, eventId, subscriber, action, data?): Promise<StampNodeEventResult>
```

### Snapshot & State:
```typescript
loadGraphState(ctx, graphSlug): Promise<State>
persistGraphState(ctx, graphSlug, state): Promise<void>
restoreSnapshot(ctx, graphSlug, definition, nodeConfigs): Promise<BaseResult>
loadAllNodeConfigs(ctx, graphSlug): Promise<{ nodeConfigs, errors }>
```

---

## IC-09: IOrchestrationService & IGraphOrchestration Interfaces
**File**: `/packages/positional-graph/src/features/030-orchestration/orchestration-service.types.ts`

### Orchestration Service Singleton:
```typescript
export interface IOrchestrationService {
  get(ctx: WorkspaceContext, graphSlug: string): Promise<IGraphOrchestration>
}
```

### Per-Graph Orchestration Handle:
```typescript
export interface IGraphOrchestration {
  readonly graphSlug: string
  
  run(): Promise<OrchestrationRunResult>
  drive(options?: DriveOptions): Promise<DriveResult>
  getReality(): Promise<PositionalGraphReality>
}
```

### Result Types:
```typescript
interface OrchestrationRunResult extends BaseResult {
  actions: readonly OrchestrationAction[]
  stopReason: 'no-action' | 'graph-complete' | 'graph-failed'
  finalReality: PositionalGraphReality
  iterations: number
}

interface DriveResult {
  exitReason: 'complete' | 'failed' | 'max-iterations'
  iterations: number
  totalActions: number
}

interface DriveOptions {
  maxIterations?: number         // Default: 200
  actionDelayMs?: number         // Default: 100
  idleDelayMs?: number           // Default: 10,000
  onEvent?: (event: DriveEvent) => void | Promise<void>
}

type DriveEvent = 
  | { type: 'iteration'; message: string; data: OrchestrationRunResult }
  | { type: 'idle'; message: string }
  | { type: 'status'; message: string }
  | { type: 'error'; message: string; error?: unknown }
```

### Key Insight:
- Two-level pattern: Singleton service → per-graph handle
- `run()` executes one orchestration iteration (settle events → build reality → ONBAS → ODS)
- `drive()` repeatedly calls `run()` until graph completes (polling loop)
- No timeout enforcement — agents can run for hours

---

## IC-10: Agent Service Interfaces
**Files**: 
- `/packages/shared/src/features/019-agent-manager-refactor/agent-manager.interface.ts`
- `/packages/shared/src/features/019-agent-manager-refactor/agent-instance.interface.ts`
- `/packages/workflow/src/interfaces/agent-session-service.interface.ts`

### IAgentManagerService (Central Registry):
```typescript
export interface IAgentManagerService {
  initialize(): Promise<void>
  createAgent(params: CreateAgentParams): IAgentInstance
  getAgent(id: string): IAgentInstance | null
  getAgents(filter?: AgentFilter): IAgentInstance[]
  terminateAgent(id: string): Promise<boolean>
}

interface CreateAgentParams {
  name: string
  type: 'claude-code' | 'copilot' | 'copilot-cli'
  workspace: string
  sessionId?: string
  tmuxWindow?: string
  tmuxPane?: string
}
```

### IAgentInstance (Self-Contained Agent):
```typescript
export interface IAgentInstance {
  readonly id: string
  readonly name: string
  readonly type: AgentType
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

interface AgentRunOptions {
  prompt: string
  cwd?: string
}

type AgentStoredEvent = AgentEvent & {
  eventId: string
}
```

### IAgentSessionService (Legacy Session Tracking):
```typescript
export interface IAgentSessionService {
  createSession(ctx: WorkspaceContext, type: 'claude' | 'copilot'): Promise<CreateSessionResult>
  getSession(ctx: WorkspaceContext, sessionId: string): Promise<AgentSession | null>
  listSessions(ctx: WorkspaceContext): Promise<AgentSession[]>
  deleteSession(ctx: WorkspaceContext, sessionId: string): Promise<DeleteSessionResult>
  updateSessionStatus(ctx: WorkspaceContext, sessionId: string, status): Promise<UpdateSessionStatusResult>
}
```

---

## IC-11: ITemplateService Interface
**File**: `/packages/workflow/src/interfaces/template-service.interface.ts`

### Contract:
```typescript
export interface ITemplateService {
  // Template creation from live graphs
  saveFrom(ctx: WorkspaceContext, graphSlug: string, templateSlug: string): Promise<SaveFromResult>
  
  // Template discovery
  listWorkflows(ctx: WorkspaceContext): Promise<ListWorkflowsResult>
  showWorkflow(ctx: WorkspaceContext, templateSlug: string): Promise<ShowWorkflowResult>
  
  // Instance creation
  instantiate(ctx: WorkspaceContext, templateSlug: string, instanceId: string): Promise<InstantiateResult>
  
  // Instance management
  listInstances(ctx: WorkspaceContext, templateSlug: string): Promise<ListInstancesResult>
  refresh(ctx: WorkspaceContext, templateSlug: string, instanceId: string): Promise<RefreshResult>
}
```

### Key Contracts:
- Templates bundle: `graph.yaml` + `nodes/*/node.yaml` + `units/`
- Instantiation strips runtime state (state.json, outputs/, events)
- Each instance gets fresh `state.json` with `pending` status
- Refresh: Full directory replacement per unit (graph topology never modified)

---

## IC-12: CLI Command Structure
**Files**: `/apps/cli/src/commands/*.ts`

### Available Commands:

#### Workflow Commands (`cg workflow`)
```bash
cg workflow list              # List all workflow templates
cg workflow info <slug>       # Show workflow details
cg workflow checkpoint <slug> # Create checkpoint from current/
cg workflow restore <slug> <version> # Restore checkpoint
cg workflow versions <slug>   # List checkpoint versions
cg workflow compose <slug>    # Create a run from checkpoint
```

#### Agent Commands (`cg agent`)
```bash
cg agent run
  -t, --type <type>           # 'claude-code' or 'copilot'
  -p, --prompt <text>         # Prompt text
  -f, --prompt-file <path>    # Path to file with prompt
  -s, --session <id>          # Session ID for resumption
  -c, --cwd <path>            # Working directory
  --name <name>               # Human-readable instance name
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

#### Graph Commands (`cg positional-graph`)
#### Template Commands (`cg template`)
#### Sample Commands (`cg sample`)
#### Workspace Commands (`cg workspace`)
#### Unit Commands (`cg unit`)

### CLI Architecture:
- Uses DI container: `createCliProductionContainer()`
- Output adapters: `ConsoleOutputAdapter` or `JsonOutputAdapter`
- No timeout enforcement (agents can run for hours)
- Per Plan 034: Uses AgentManagerService (not legacy AgentService)

---

## IC-13: Health Check Endpoint
**File**: `/apps/web/app/api/health/route.ts`

- **GET /api/health**
  - No auth required
  - Returns: `{ status: 'ok' }` (HTTP 200)
  - Purpose: Load balancer probes, monitoring

---

## IC-14: Terminal Session Management
**File**: `/apps/web/app/api/terminal/route.ts`

- **GET /api/terminal**
  - Auth: Required
  - Returns: `{ sessions: SessionInfo[], tmux: boolean }`
  - SessionInfo: `{ name, attached, windows, created }`
  - Executes: `tmux list-sessions` on host
  - Purpose: Discover available tmux sessions for copilot-cli targeting

---

## Harness Integration Strategy

### 1. **Workspace Bootstrapping**
```
GET /api/workspaces              # List workspaces
POST /api/workspaces (via action) # Add test workspace
GET /api/workspaces/[slug]        # Get workspace details
```

### 2. **Agent Provisioning**
```
POST /api/agents                  # Create test agent
GET /api/agents/events (SSE)      # Listen for status changes
POST /api/agents/[id]/run         # Execute prompt
GET /api/agents/[id]              # Fetch with event history
DELETE /api/agents/[id]           # Cleanup
```

### 3. **Workflow Orchestration**
```
loadWorkflow()                    # Load graph definition
addNode/addLine                   # Build workflow programmatically
instantiateTemplate()             # Or use template
drive(graphSlug)                  # Run orchestration polling loop
getStatus()                       # Monitor execution
```

### 4. **CLI Orchestration** (Alternative)
```bash
cg workflow list                  # Discover templates
cg agent run --type claude-code --prompt "..." # Execute agent
cg positional-graph list          # List graphs
```

### 5. **Real-Time Feedback**
```
SSE /api/events/[channel]        # Custom event channel
SSE /api/agents/events           # Agent updates
drive(..., onEvent)              # Orchestration events
```

---

## Summary Matrix

| Interface | Purpose | Location | DI Token | Key Methods |
|-----------|---------|----------|----------|-------------|
| IWorkspaceService | Workspace CRUD | workflow/ | WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE | add, list, getInfo, resolveContext |
| IPositionalGraphService | Graph CRUD & Orchestration | positional-graph/ | POSITIONAL_GRAPH_DI_TOKENS.POSITIONAL_GRAPH_SERVICE | create, load, addNode, getStatus, startNode |
| IOrchestrationService | Workflow execution loop | positional-graph/ | (no token - get via DI) | get (returns IGraphOrchestration), run/drive |
| IAgentManagerService | Agent registry | shared/ | SHARED_DI_TOKENS.AGENT_MANAGER_SERVICE | createAgent, getAgent, getAgents, terminateAgent |
| IAgentInstance | Single running agent | shared/ | (returned by manager) | run, terminate, getEvents |
| ITemplateService | Reusable templates | workflow/ | POSITIONAL_GRAPH_DI_TOKENS.TEMPLATE_SERVICE | saveFrom, instantiate, listWorkflows |
| IAgentSessionService | Session tracking (legacy) | workflow/ | (custom DI) | createSession, getSession, listSessions |

