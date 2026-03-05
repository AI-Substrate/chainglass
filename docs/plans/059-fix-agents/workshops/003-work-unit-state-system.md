# Workshop: WorkUnit State System — Centralized First-Class Status & Question Reporting

**Type**: Integration Pattern / Data Model / State Machine
**Plan**: 059-fix-agents
**Spec**: docs/plans/059-fix-agents/ (in progress)
**Created**: 2026-02-28
**Status**: Draft

**Related Documents**:
- [001-top-bar-agent-ux.md](./001-top-bar-agent-ux.md) — consumes WorkUnit state for top bar chips
- [002-agent-connect-disconnect-ux.md](./002-agent-connect-disconnect-ux.md) — overlay uses WorkUnit state
- [Plan 053 — GlobalStateSystem](../../../domains/_platform/state/domain.md) — underlying pub/sub mechanism
- [Plan 054 — Unified Human Input](../../054-unified-human-input/) — existing question types
- [_platform/events domain](../../../domains/_platform/events/domain.md) — parent domain for this system

**Domain Context**:
- **Primary Domain**: `work-unit-state` (new — top-level business domain, no parent)
- **Related Domains**: `_platform/state` (underlying pub/sub mechanism), `_platform/events` (SSE transport), `_platform/positional-graph` (node execution status), `workflow-ui` (consumer), agents (publisher)

---

## Purpose

Design a centralized system where **any work unit** — agents, code units, user-input nodes, future pod types — can report its execution state and questions to a single place. This enables the top bar, left menu, workflow canvas, and any future consumer to detect questions, status changes, and attention-needs from a single source, regardless of what produced them or which worktree they're running in.

**The one-liner**: A universal "who's doing what and who needs help" registry.

## The Problem Today

Questions and status are reported through **three separate, disconnected channels**:

```
┌─────────────────────────────────────────────────────────────────┐
│ Today: Three Separate Status Channels                           │
│                                                                 │
│  1. AgentNotifierService (Plan 019)                             │
│     agent_status, agent_intent, agent_event → SSE 'agents'      │
│     ❌ Agent-only. No code units, no workflow nodes.            │
│                                                                 │
│  2. MessageService (Plan 054)                                   │
│     create() → wf-phase.json file append                        │
│     ❌ File-based. No real-time event. Scoped to workflow.      │
│                                                                 │
│  3. NodeStatusResult (Plan 032)                                 │
│     status in node state files                                  │
│     ❌ Not published to GlobalStateSystem. Read-only from disk. │
│                                                                 │
│  Result: No single place to ask "who needs attention?"          │
└─────────────────────────────────────────────────────────────────┘
```

## Key Questions Addressed

- Q1: What is a "work unit" and what types report to this system?
- Q2: What does the data model look like?
- Q3: How do questions flow from source to central registry to UI?
- Q4: How does this relate to GlobalStateSystem (Plan 053)?
- Q5: How do agents report to this even when NOT orchestrated by workflow pods?
- Q6: What about cross-worktree visibility?
- Q7: Where does this live in the domain hierarchy?

---

## Q1: What Is a Work Unit?

A **work unit** is anything that executes work and might need attention. The system is intentionally broader than "agents":

| Source Type | Example | Reports Status? | Can Ask Questions? |
|-------------|---------|----------------|-------------------|
| `agent` | Claude Code session, Copilot CLI session | ✅ | ✅ (first-class questions) |
| `code-unit` | Script execution node in workflow | ✅ | ❌ (today — could add later) |
| `user-input` | Human input node in workflow | ✅ | ✅ (the node IS a question) |
| `pod` | Workflow pod running agent work | ✅ | ✅ (via contained agent) |
| `workflow` | Entire workflow run | ✅ | ❌ (but contains units that do) |

### RESOLVED: Source Type Is Open-Ended

Use a string discriminator, not a closed enum. New source types can register without modifying the core system. The system doesn't need to understand what a "code-unit" does — it just stores and publishes its state.

---

## Q2: Data Model

### WorkUnitEntry — The Core Record

```typescript
interface WorkUnitEntry {
  // Identity
  id: string;                    // Globally unique (UUID or composite)
  sourceType: string;            // 'agent' | 'code-unit' | 'user-input' | 'pod' | string
  name: string;                  // Human-readable: "Auth Refactor Agent", "Build Script"
  
  // Location
  workspace: string;             // Worktree slug
  
  // Status
  status: WorkUnitStatus;        // See state machine below
  intent?: string;               // What it's doing: "Refactoring auth module"
  
  // Question (first-class)
  question?: WorkUnitQuestion;   // Non-null when status === 'waiting_input'
  
  // Provenance
  creator: WorkUnitCreator;      // What created this unit
  
  // Timing
  lastActivityAt: string;        // ISO-8601 — updated on every status change
  createdAt: string;             // ISO-8601
  
  // Adapter-specific (opaque to the system)
  sourceRef?: Record<string, unknown>;  // e.g., { sessionId, tmuxPane, nodeId }
}

type WorkUnitStatus = 'working' | 'idle' | 'waiting_input' | 'error';

interface WorkUnitQuestion {
  questionId: string;            // Unique per question
  type: QuestionType;            // 'free_text' | 'single_choice' | 'multi_choice' | 'confirm'
  prompt: string;                // The question text
  choices?: string[];            // For choice types
  defaultValue?: unknown;        // Optional default
  askedAt: string;              // ISO-8601
}

type QuestionType = 'free_text' | 'single_choice' | 'multi_choice' | 'confirm';

interface WorkUnitCreator {
  type: 'user' | 'workflow' | 'pod' | 'system';
  ref?: string;                  // workflow slug, pod ID, etc.
}
```

### Why This Shape

- **`sourceType` is a string, not enum**: Open for extension. A future "review-unit" or "test-runner" can register without touching the core.
- **`question` is inline, not a separate entity**: A work unit has at most one pending question. When answered, the field clears. History lives in the work unit's own event log (NDJSON), not here.
- **`sourceRef` is opaque**: The central system doesn't care that an agent has a sessionId or a tmux pane. That's the agent domain's concern. But it stores the ref so consumers like the overlay can pass it through.
- **`lastActivityAt` drives recency**: The top bar's 24h auto-depopulate rule uses this field. No separate "recent list" needed — just query `lastActivityAt > 24h ago OR status === 'working'`.

### State Machine

```
                    ┌─────────────┐
     register()     │             │
    ────────────►   │    idle     │ ◄──── run completes (no question)
                    │             │
                    └──────┬──────┘
                           │
                    run()  │
                           ▼
                    ┌─────────────┐
                    │             │
                    │   working   │ ◄──── question answered
                    │             │
                    └──┬──────┬───┘
                       │      │
          ask()        │      │  error
                       ▼      ▼
              ┌──────────┐  ┌─────────┐
              │ waiting   │  │  error  │
              │  _input   │  │         │
              └──────────┘  └─────────┘
```

4 states. Simple. The `idle` state means "exists, not currently doing anything." An idle unit in the registry is like a parked car — it's there, you can see it, but it's not moving.

---

## Q3: Question Flow — Source to UI

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Question Flow                                                            │
│                                                                          │
│  SOURCE (agent, workflow node, pod)                                      │
│    │                                                                     │
│    │  workUnitState.askQuestion(unitId, question)                        │
│    ▼                                                                     │
│  WorkUnitStateService                                                    │
│    │  1. Update entry: status = 'waiting_input', question = {...}        │
│    │  2. Persist to disk: agent-recent-list.json (or work-unit-state)    │
│    │  3. Publish to GlobalStateSystem:                                   │
│    │       work-unit:{id}:status = 'waiting_input'                       │
│    │       work-unit:{id}:has-question = true                            │
│    │       work-unit:{id}:question-text = "What auth strategy?"          │
│    │  4. Broadcast SSE event: work_unit_question_asked                   │
│    ▼                                                                     │
│  CONSUMERS (all subscribe via GlobalStateSystem, not direct coupling)    │
│    • Top bar chip: pulsing 🟡, shows question preview                   │
│    • Overlay: shows question UI with answer form                         │
│    • Left menu: badge count on worktree entry                            │
│    • Workflow canvas: node badge shows ❓                                │
│    • Screen flash: green border + ❓ icon (if attention rules met)       │
│                                                                          │
│  USER ANSWERS                                                            │
│    │                                                                     │
│    │  workUnitState.answerQuestion(unitId, answer)                       │
│    ▼                                                                     │
│  WorkUnitStateService                                                    │
│    │  1. Clear question field                                            │
│    │  2. Update status = 'working' (agent resumes) or 'idle'             │
│    │  3. Publish updated state paths                                     │
│    │  4. Route answer to source (agent adapter, workflow engine, etc.)   │
│    ▼                                                                     │
│  SOURCE receives answer and continues                                    │
└──────────────────────────────────────────────────────────────────────────┘
```

### Key Design: Answer Routing

The WorkUnitStateService doesn't know HOW to deliver an answer to the source. It uses a **callback registry**:

```typescript
interface IWorkUnitStateService {
  // Registration
  register(entry: WorkUnitEntry): void;
  unregister(unitId: string): void;
  
  // Status updates (called by sources)
  updateStatus(unitId: string, status: WorkUnitStatus, intent?: string): void;
  
  // Questions (called by sources to ask, by UI to answer)
  askQuestion(unitId: string, question: WorkUnitQuestion): void;
  answerQuestion(unitId: string, answer: QuestionAnswer): void;
  
  // Answer routing (called by sources at registration)
  onAnswer(unitId: string, handler: (answer: QuestionAnswer) => void): void;
  
  // Queries
  getUnit(unitId: string): WorkUnitEntry | null;
  getUnits(filter?: WorkUnitFilter): WorkUnitEntry[];
  getQuestioned(): WorkUnitEntry[];  // All units with pending questions
  
  // Lifecycle
  tidyUp(maxAge?: number): void;  // Remove expired entries (default 24h)
}

interface QuestionAnswer {
  questionId: string;
  type: QuestionType;
  selected?: string[];     // for choice types
  text?: string;           // for free_text
  confirmed?: boolean;     // for confirm
  answeredAt: string;      // ISO-8601
}

interface WorkUnitFilter {
  workspace?: string;
  sourceType?: string;
  status?: WorkUnitStatus;
  hasQuestion?: boolean;
}
```

### Example: Agent Asks a Question

```typescript
// In agent adapter or agent manager, when agent emits a question event:
const workUnitState = container.resolve<IWorkUnitStateService>(WORK_UNIT_STATE_TOKEN);

// At agent creation, register and set up answer routing
workUnitState.register({
  id: agent.id,
  sourceType: 'agent',
  name: agent.name,
  workspace: agent.workspace,
  status: 'idle',
  creator: { type: 'user' },
  sourceRef: { sessionId: agent.sessionId },
  lastActivityAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
});

workUnitState.onAnswer(agent.id, (answer) => {
  // Route answer back to agent — e.g., send as prompt via adapter
  agentInstance.run({ prompt: answer.text ?? answer.selected?.join(', ') ?? 'confirmed' });
});

// Later, when agent asks a question:
workUnitState.askQuestion(agent.id, {
  questionId: 'q-001',
  type: 'single_choice',
  prompt: 'Which authentication strategy should I use?',
  choices: ['JWT', 'Session-based', 'OAuth2'],
  askedAt: new Date().toISOString(),
});
```

### Example: Workflow Node User-Input

```typescript
// In positional-graph orchestrator, when a user-input node becomes ready:
workUnitState.register({
  id: `node-${nodeId}`,
  sourceType: 'user-input',
  name: node.userInput.prompt.slice(0, 50),
  workspace: workspaceSlug,
  status: 'waiting_input',
  question: {
    questionId: `node-${nodeId}-input`,
    type: node.userInput.inputType,
    prompt: node.userInput.prompt,
    choices: node.userInput.options?.map(o => o.label),
    askedAt: new Date().toISOString(),
  },
  creator: { type: 'workflow', ref: workflowSlug },
  sourceRef: { nodeId, graphSlug },
  lastActivityAt: new Date().toISOString(),
  createdAt: new Date().toISOString(),
});

workUnitState.onAnswer(`node-${nodeId}`, (answer) => {
  // Route to positional-graph service to save output data
  pgService.saveOutputData(graphSlug, nodeId, answer);
});
```

---

## Q4: Relationship to GlobalStateSystem (Plan 053)

**WorkUnitStateService publishes TO GlobalStateSystem. It does not replace it.**

```
┌───────────────────────────────────────────────────────────────┐
│ Architecture                                                   │
│                                                                │
│  WorkUnitStateService                                          │
│    ├── Internal: Map<unitId, WorkUnitEntry> (in-memory)        │
│    ├── Persistence: work-unit-state.json per worktree          │
│    ├── Publishes: GlobalStateSystem paths (work-unit:*)        │
│    └── Broadcasts: SSE events via ISSEBroadcaster              │
│                                                                │
│  GlobalStateSystem (Plan 053)                                  │
│    ├── Receives: work-unit:{id}:status, :intent, etc.          │
│    ├── Subscribers: useGlobalState, useGlobalStateList          │
│    └── Pattern: work-unit:*:has-question (all questions)        │
│                                                                │
│  UI Components                                                 │
│    ├── Top bar: useGlobalStateList('work-unit:*:status')        │
│    ├── Overlay: useGlobalState('work-unit:{id}:question-text')  │
│    └── Left menu: useGlobalStateList('work-unit:*:has-question')│
└───────────────────────────────────────────────────────────────┘
```

### State Paths Published

Following Plan 053's `domain:instanceId:property` pattern:

```
work-unit:{id}:status           → 'working' | 'idle' | 'waiting_input' | 'error'
work-unit:{id}:name             → string
work-unit:{id}:source-type      → 'agent' | 'code-unit' | 'user-input' | 'pod' | string
work-unit:{id}:intent           → string
work-unit:{id}:workspace        → string (worktree slug)
work-unit:{id}:has-question     → boolean
work-unit:{id}:question-text    → string (preview of question prompt)
work-unit:{id}:question-type    → QuestionType
work-unit:{id}:creator-type     → 'user' | 'workflow' | 'pod' | 'system'
work-unit:{id}:last-activity-at → ISO-8601 string
```

### Domain Registration

```typescript
function registerWorkUnitStateDomain(state: IStateService): void {
  const already = state.listDomains?.().some(d => d.domain === 'work-unit');
  if (already) return;
  
  state.registerDomain({
    domain: 'work-unit',
    description: 'Centralized work unit execution state — agents, code units, workflow nodes, pods',
    multiInstance: true,
    properties: [
      { key: 'status', description: 'Execution status', typeHint: 'string' },
      { key: 'name', description: 'Human-readable name', typeHint: 'string' },
      { key: 'source-type', description: 'What kind of work unit', typeHint: 'string' },
      { key: 'intent', description: 'Current task description', typeHint: 'string' },
      { key: 'workspace', description: 'Worktree slug', typeHint: 'string' },
      { key: 'has-question', description: 'Whether unit has pending question', typeHint: 'boolean' },
      { key: 'question-text', description: 'Question prompt preview', typeHint: 'string' },
      { key: 'question-type', description: 'Question input type', typeHint: 'string' },
      { key: 'creator-type', description: 'What created this unit', typeHint: 'string' },
      { key: 'last-activity-at', description: 'Last status change timestamp', typeHint: 'string' },
    ],
  });
}
```

---

## Q5: Agents Reporting Without Workflow Orchestration

This is critical — agents must report even when running standalone (user clicks "new agent" in web UI, no workflow involved).

### The Bridge Pattern

The agent manager service wraps each agent operation with WorkUnitStateService calls:

```typescript
// In AgentManagerService or a thin wrapper
class AgentWorkUnitBridge {
  constructor(
    private workUnitState: IWorkUnitStateService,
    private agentManager: IAgentManagerService,
  ) {}
  
  createAgent(params: CreateAgentParams): IAgentInstance {
    const agent = this.agentManager.createAgent(params);
    
    // Register with central state
    this.workUnitState.register({
      id: agent.id,
      sourceType: 'agent',
      name: agent.name,
      workspace: agent.workspace,
      status: 'idle',
      creator: { type: params.creator ?? 'user' },
      sourceRef: { sessionId: agent.sessionId, agentType: agent.type },
      lastActivityAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    });
    
    // Wire answer routing
    this.workUnitState.onAnswer(agent.id, (answer) => {
      // Send answer as next prompt to agent
      agent.run({ prompt: this.formatAnswer(answer) });
    });
    
    return agent;
  }
  
  async runAgent(agentId: string, options: AgentRunOptions): Promise<AgentResult> {
    this.workUnitState.updateStatus(agentId, 'working', options.prompt.slice(0, 80));
    
    try {
      const result = await this.agentManager.getAgent(agentId)!.run({
        ...options,
        onEvent: (event) => {
          // Detect first-class questions from agent events
          if (this.isQuestionEvent(event)) {
            this.workUnitState.askQuestion(agentId, this.extractQuestion(event));
          }
          options.onEvent?.(event);
        },
      });
      
      this.workUnitState.updateStatus(agentId, 'idle');
      return result;
    } catch (error) {
      this.workUnitState.updateStatus(agentId, 'error');
      throw error;
    }
  }
}
```

### How Agents Raise Questions

Today, agents can ask questions through:
1. **Copilot CLI**: `session.question` event in events.jsonl (structured question with choices)
2. **Claude Code**: Tool use requesting user input (less structured)
3. **MessageService**: Orchestrator creates question via `messageService.create()`

The bridge detects question events from the adapter event stream and translates them to `workUnitState.askQuestion()`. This is the single funnel point — regardless of how the underlying agent asks, it flows through the same path.

---

## Q6: Cross-Worktree Visibility

The WorkUnitStateService is **per-server-process** (singleton), not per-worktree. It holds entries from ALL worktrees.

```typescript
// Get all questions across all worktrees
const allQuestions = workUnitState.getQuestioned();

// Get questions for current worktree only
const myQuestions = workUnitState.getUnits({ 
  workspace: currentSlug, 
  hasQuestion: true 
});

// Get questions from OTHER worktrees (for left menu alerts)
const otherQuestions = workUnitState.getUnits({ hasQuestion: true })
  .filter(u => u.workspace !== currentSlug);
```

### State System Supports This Natively

GlobalStateSystem is also per-server-process. Subscribers can use patterns:

```typescript
// Top bar: current worktree's units
// (filtered in component, not in state system — state publishes all)
const allUnits = useGlobalStateList('work-unit:*:status');
const myUnits = allUnits.filter(e => {
  const workspace = stateSystem.get(`work-unit:${e.instanceId}:workspace`);
  return workspace === currentSlug;
});

// Left menu: other worktree questions
const allQuestions = useGlobalStateList('work-unit:*:has-question');
const otherQuestions = allQuestions.filter(e => {
  const workspace = stateSystem.get(`work-unit:${e.instanceId}:workspace`);
  return workspace !== currentSlug && e.value === true;
});
```

---

## Q7: Domain Placement

### RESOLVED: `work-unit-state` — Top-Level Business Domain

**Slug**: `work-unit-state`
**Type**: business
**Parent**: — (none)
**Peers**: `file-browser`, `workflow-ui`

**Why top-level business, not `_platform`**: Every `_platform` domain is a generic mechanism that doesn't know about business concepts — `_platform/state` is pub/sub, `_platform/events` is transport. WorkUnit State has business semantics baked in: it knows what questions are, what "working" means, what tidy-up rules are, what creators are. It's content, not mechanism. The state domain doc itself says: "Domains provide the content; state system provides the mechanism."

**Why not under `_platform/positional-graph`**: Standalone agents (no workflow) publish here too. Making it depend on the orchestration domain would invert the dependency.

**Why top-level**: It's consumed across multiple business contexts — agents, workflows, pods — and doesn't belong to any one of them. It's a cross-cutting business concern: the "who needs help" registry.

### Dependency Direction

```
work-unit-state (business domain)
  ├── DEPENDS ON: _platform/state (publishes to GlobalStateSystem)
  ├── DEPENDS ON: _platform/events (broadcasts via ISSEBroadcaster)
  └── CONSUMED BY: agents, workflow-ui, _platform/panel-layout (top bar)
```

### Proposed Domain Entry (registry.md)

```
| WorkUnit State | work-unit-state | business | — | Plan 059 | active |
```

---

## Persistence

### File: `<worktree>/.chainglass/data/work-unit-state.json`

```json
{
  "version": 1,
  "units": [
    {
      "id": "abc-123",
      "sourceType": "agent",
      "name": "Auth Refactor Agent",
      "workspace": "main",
      "status": "idle",
      "creator": { "type": "user" },
      "sourceRef": { "sessionId": "sess-789", "agentType": "copilot" },
      "lastActivityAt": "2026-02-28T08:00:00Z",
      "createdAt": "2026-02-28T06:00:00Z"
    },
    {
      "id": "node-n3",
      "sourceType": "user-input",
      "name": "Choose database strategy",
      "workspace": "main",
      "status": "waiting_input",
      "question": {
        "questionId": "node-n3-input",
        "type": "single_choice",
        "prompt": "Which database should we use?",
        "choices": ["PostgreSQL", "MySQL", "SQLite"],
        "askedAt": "2026-02-28T08:10:00Z"
      },
      "creator": { "type": "workflow", "ref": "deploy-pipeline" },
      "sourceRef": { "nodeId": "n3", "graphSlug": "deploy-pipeline" },
      "lastActivityAt": "2026-02-28T08:10:00Z",
      "createdAt": "2026-02-28T08:05:00Z"
    }
  ]
}
```

### Tidy-Up Rules

On page load (or server bootstrap):
1. Read `work-unit-state.json`
2. Remove entries where `lastActivityAt` > 24h AND `status` !== `'working'`
3. Write back cleaned file
4. Publish surviving entries to GlobalStateSystem

Working units NEVER expire. Questions NEVER expire (even if old — user must dismiss or answer).

---

## Contracts (Public Interface)

| Contract | Type | Consumers | Description |
|----------|------|-----------|-------------|
| `IWorkUnitStateService` | Interface | Agents, workflow orchestrator, pods, UI | Central registration, status updates, questions |
| `WorkUnitEntry` | Type | All consumers | Core data record |
| `WorkUnitQuestion` | Type | UI question renderers | Structured question with type/choices |
| `QuestionAnswer` | Type | UI answer submission | Typed answer matching question type |
| `WorkUnitStatus` | Type | All consumers | `'working' \| 'idle' \| 'waiting_input' \| 'error'` |
| `WorkUnitCreator` | Type | Top bar chips, provenance display | `{ type, ref? }` |
| `WORK_UNIT_STATE_TOKEN` | DI Token | DI container | Service resolution |
| `FakeWorkUnitStateService` | Fake | All tests | Test double with inspection methods |

---

## Component Architecture

```
packages/shared/src/work-unit-state/
├── types.ts                         # WorkUnitEntry, WorkUnitQuestion, etc.
├── work-unit-state.interface.ts     # IWorkUnitStateService
├── tokens.ts                        # WORK_UNIT_STATE_TOKEN
└── index.ts                         # Barrel exports

apps/web/src/lib/work-unit-state/
├── work-unit-state.service.ts       # Implementation (Map + persist + publish)
├── work-unit-state-publisher.tsx     # React component that publishes to GlobalState
├── work-unit-state-connector.tsx    # Mounts in DashboardShell, registers domain
└── index.ts

apps/web/src/features/059-fix-agents/
├── agent-work-unit-bridge.ts        # Bridges AgentManagerService → WorkUnitStateService
└── index.ts

test/contracts/
├── work-unit-state.contract.ts      # Contract test factory
└── work-unit-state.contract.test.ts # Runs against real + fake
```

---

## Open Questions

### Q1: Should tidy-up be on page load only, or periodic?

**Leaning**: Page load is sufficient. The 24h window is generous. If a user has the page open for 48h straight, a few stale idle entries in the top bar are acceptable. Adding a periodic timer adds complexity for minimal gain.

### Q2: Should the recent list file be per-worktree or global?

**RESOLVED**: Per-worktree at `<worktree>/.chainglass/data/work-unit-state.json`. The WorkUnitStateService aggregates across all worktrees in memory at runtime (server process sees all), but each worktree persists its own entries. Cross-worktree visibility is a runtime concern, not a storage concern.

### Q3: What happens when an answer can't be routed (source crashed)?

**Leaning**: The service stores the answer and updates state (clears question, marks idle). If the source re-registers later, it can check for pending answers. If it never comes back, the answered question is just history. No retry mechanism needed — the user can always re-run the agent.

### Q4: Should we namespace state paths as `work-unit:` or something shorter?

**RESOLVED**: `work-unit:` — matches the domain slug. Clarity over brevity. The paths are machine-consumed, not typed by humans.

---

## Quick Reference

```typescript
// Register a work unit (any source)
workUnitState.register({ id, sourceType, name, workspace, status: 'idle', ... });

// Update status
workUnitState.updateStatus(unitId, 'working', 'Building auth module');
workUnitState.updateStatus(unitId, 'idle');
workUnitState.updateStatus(unitId, 'error');

// Ask a question
workUnitState.askQuestion(unitId, { 
  questionId: 'q1', type: 'single_choice', 
  prompt: 'Which strategy?', choices: ['A', 'B'] 
});

// Answer a question (from UI)
workUnitState.answerQuestion(unitId, { 
  questionId: 'q1', type: 'single_choice', selected: ['A'] 
});

// Query from React components
const status = useGlobalState<string>(`work-unit:${id}:status`);
const hasQ = useGlobalState<boolean>(`work-unit:${id}:has-question`);
const allWorking = useGlobalStateList('work-unit:*:status')
  .filter(e => e.value === 'working');
const allQuestions = useGlobalStateList('work-unit:*:has-question')
  .filter(e => e.value === true);

// Tidy up stale entries
workUnitState.tidyUp(24 * 60 * 60 * 1000); // 24h
```

---

## Replaces / Subsumes

| Existing System | What Happens | Migration |
|-----------------|-------------|-----------|
| AgentNotifierService SSE events (Plan 019) | **Kept** for raw event streaming (text_delta, tool_call). WorkUnitState handles STATUS only. | Agent bridge publishes status to WorkUnitState AND continues SSE for streaming. |
| MessageService questions (Plan 054) | **Kept** for workflow-internal Q&A storage. WorkUnitState is the NOTIFICATION layer. | Workflow orchestrator calls both: `messageService.create()` for persistence + `workUnitState.askQuestion()` for notification. |
| NodeStatusResult.pendingQuestion (Plan 032) | **Superseded** by WorkUnitState question. | Orchestrator registers user-input nodes with WorkUnitState instead of embedding question in NodeStatusResult. |

This system doesn't replace existing systems — it **unifies the notification surface**. Each source system keeps its own storage and logic. WorkUnitState is the "who needs attention?" aggregator.
