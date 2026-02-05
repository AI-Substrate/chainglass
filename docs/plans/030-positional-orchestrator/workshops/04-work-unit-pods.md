# Workshop: WorkUnitPods

**Type**: Integration Pattern
**Plan**: 030-positional-orchestrator
**Spec**: [research-dossier.md](../research-dossier.md)
**Created**: 2026-02-05
**Status**: Draft

**Related Documents**:
- [workshops.md](../workshops.md) — Workshop index
- [positional-graph-reality.md](01-positional-graph-reality.md) — Snapshot with podSessions map
- [orchestration-request.md](02-orchestration-request.md) — OR types that ODS translates into pod actions
- [agent-context-service.md](03-agent-context-service.md) — Context inheritance (ODS calls before pod.execute)
- [research-dossier.md](../research-dossier.md) — IWorkUnitPodManager proposed contract

---

## Purpose

Define the execution container abstraction that bridges WorkUnit definitions (what to run) with agent/code adapters (how to run it). Pods manage the runtime lifecycle of a single node's execution — starting agents, running code, handling questions, and tracking session IDs for resumption.

**Separation of Concerns**:
- **WorkUnit** — Declares behavior (prompt template, script, inputs/outputs)
- **Pod** — Manages execution (adapter calls, session tracking, question protocol)
- **ODS** — Orchestrates lifecycle (creates pods, passes inputs, handles events)
- **PodManager** — Tracks active pods and session IDs across the graph

## Key Questions Addressed

- What does a pod do vs what the node/state tracks?
- How are pods created, and what do they need to start?
- How does the question/answer protocol flow through pods?
- How are session IDs stored for resumption across restarts?
- How do code pods differ from agent pods?
- What does FakePodManager look like for TDD?

---

## Design Principles

### 1. Pod = Execution, Node = State

The pod manages runtime concerns: calling the agent adapter, running scripts, relaying questions. The node (via `state.json` and `PositionalGraphService`) tracks durable state: status, timestamps, question records, outputs.

**Pod owns**:
- Agent adapter interaction (run, compact, terminate)
- Script execution
- Session ID (in-memory, persisted by PodManager)
- Question relay (receive from agent → surface to ODS)

**Node owns (via PositionalGraphService)**:
- Status transitions (pending → running → complete)
- Timestamps (started_at, completed_at)
- Question records (asked_at, answered_at, surfaced_at)
- Output data/files
- Error records

### 2. Pods Are Ephemeral, Sessions Are Durable

Pods are in-memory objects that exist while a node is executing. When the process restarts, pods don't survive — but session IDs do (persisted in `podSessions` state). PodManager can recreate a pod for a node and resume its session.

### 3. One Pod Per Node (At Most)

A node has at most one active pod. If a node is `running`, there's a pod. If `waiting-question`, the pod may be suspended or destroyed (the session ID allows recreation). If `complete`, the pod is cleaned up but the session ID persists.

### 4. Discriminated by Unit Type

Pods behave differently based on `unitType`:

| Unit Type | Pod Behavior |
|-----------|-------------|
| `agent` | Uses `IAgentAdapter.run()`, supports sessions, handles questions |
| `code` | Runs script (e.g., shell command), no sessions, no questions |
| `user-input` | No pod needed — handled directly by state (user answers via CLI/UI) |

### 5. Pod Does Not Update State

Pods execute work and return results. State updates happen in ODS, which calls `PositionalGraphService` methods. This keeps pods focused on execution and avoids dual-write problems.

---

## Conceptual Model

```
┌─────────────────────────────────────────────────────────────┐
│                        PodManager                           │
├─────────────────────────────────────────────────────────────┤
│ • activePods: Map<nodeId, IWorkUnitPod>                     │
│ • sessions: Map<nodeId, sessionId>                          │
├─────────────────────────────────────────────────────────────┤
│ • createPod(ctx, graphSlug, nodeId, unit) → IWorkUnitPod    │
│ • getPod(nodeId) → IWorkUnitPod | undefined                 │
│ • getSessionId(nodeId) → string | undefined                 │
│ • destroyPod(nodeId) → void                                 │
│ • getSessions() → Map<nodeId, sessionId>                    │
│ • loadSessions(ctx, graphSlug) → void                       │
│ • persistSessions(ctx, graphSlug) → void                    │
└─────────────────────────────────────────────────────────────┘
           │
           ├── AgentPod (wraps IAgentAdapter)
           ├── CodePod (wraps script execution)
           └── (user-input has no pod)

┌─────────────────────────────────────────────────────────────┐
│                      IWorkUnitPod                            │
├─────────────────────────────────────────────────────────────┤
│ • readonly nodeId: string                                    │
│ • readonly unitType: 'agent' | 'code'                       │
│ • readonly sessionId: string | undefined                     │
├─────────────────────────────────────────────────────────────┤
│ • execute(options: PodExecuteOptions) → PodExecuteResult     │
│ • resumeWithAnswer(questionId, answer) → PodExecuteResult    │
│ • terminate() → void                                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Schema Definitions

### TypeScript Types

```typescript
// ============================================
// PodExecuteOptions — What the pod needs to start
// ============================================

export interface PodExecuteOptions {
  /** Resolved inputs from collateInputs */
  readonly inputs: InputPack;

  /** Session ID to resume (from context inheritance) */
  readonly contextSessionId?: string;

  /** Workspace context for file operations */
  readonly ctx: WorkspaceContext;

  /** Graph slug (for output paths) */
  readonly graphSlug: string;

  /** Callback for pod events (question asked, output produced, etc.) */
  readonly onEvent?: PodEventHandler;
}

// ============================================
// PodExecuteResult — What the pod returns
// ============================================

export interface PodExecuteResult {
  /** How execution ended */
  readonly outcome: PodOutcome;

  /** Session ID for future resumption (agents only) */
  readonly sessionId?: string;

  /** Output data produced (key = output name, value = data) */
  readonly outputs?: Record<string, unknown>;

  /** Error details if outcome is 'error' */
  readonly error?: PodError;

  /** Question details if outcome is 'question' */
  readonly question?: PodQuestion;
}

export type PodOutcome =
  | 'completed'        // Work finished successfully
  | 'question'         // Paused, waiting for answer
  | 'error'            // Failed
  | 'terminated';      // Killed externally

export interface PodError {
  readonly code: string;
  readonly message: string;
}

export interface PodQuestion {
  readonly questionId: string;
  readonly questionType: 'text' | 'single' | 'multi' | 'confirm';
  readonly text: string;
  readonly options?: readonly string[];
  readonly defaultValue?: string | boolean;
}

// ============================================
// PodEventHandler — Real-time event streaming
// ============================================

export type PodEventHandler = (event: PodEvent) => void;

export type PodEvent =
  | PodOutputEvent
  | PodQuestionEvent
  | PodProgressEvent;

export interface PodOutputEvent {
  readonly type: 'output';
  readonly name: string;
  readonly value: unknown;
}

export interface PodQuestionEvent {
  readonly type: 'question';
  readonly question: PodQuestion;
}

export interface PodProgressEvent {
  readonly type: 'progress';
  readonly message: string;
}

// ============================================
// IWorkUnitPod — The Pod Interface
// ============================================

export interface IWorkUnitPod {
  /** Node this pod is executing for */
  readonly nodeId: string;

  /** Unit type discriminator */
  readonly unitType: 'agent' | 'code';

  /** Current session ID (agents only, undefined until first execute) */
  readonly sessionId: string | undefined;

  /**
   * Execute the work unit.
   *
   * For agents: Calls IAgentAdapter.run() with prompt + inputs
   * For code: Runs script with inputs as environment/args
   *
   * Returns when execution completes, pauses (question), or fails.
   */
  execute(options: PodExecuteOptions): Promise<PodExecuteResult>;

  /**
   * Resume execution after a question is answered.
   *
   * For agents: Calls IAgentAdapter.run() with answer as prompt,
   *   using existing sessionId for context continuity.
   * For code: Not applicable (code units don't ask questions).
   */
  resumeWithAnswer(
    questionId: string,
    answer: unknown,
    options: PodExecuteOptions
  ): Promise<PodExecuteResult>;

  /**
   * Terminate execution.
   *
   * For agents: Calls IAgentAdapter.terminate(sessionId)
   * For code: Kills running process
   */
  terminate(): Promise<void>;
}
```

### Zod Schemas

```typescript
import { z } from 'zod';

// ── PodOutcome ────────────────────────────────────
export const PodOutcomeSchema = z.enum([
  'completed',
  'question',
  'error',
  'terminated',
]);

// ── PodError ──────────────────────────────────────
export const PodErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
}).strict();

// ── PodQuestion ───────────────────────────────────
export const PodQuestionSchema = z.object({
  questionId: z.string().min(1),
  questionType: z.enum(['text', 'single', 'multi', 'confirm']),
  text: z.string().min(1),
  options: z.array(z.string()).optional(),
  defaultValue: z.union([z.string(), z.boolean()]).optional(),
}).strict();

// ── PodExecuteResult ──────────────────────────────
export const PodExecuteResultSchema = z.object({
  outcome: PodOutcomeSchema,
  sessionId: z.string().optional(),
  outputs: z.record(z.unknown()).optional(),
  error: PodErrorSchema.optional(),
  question: PodQuestionSchema.optional(),
}).strict();
```

---

## PodManager Interface

```typescript
/**
 * Manages pod lifecycle and session persistence for a graph.
 */
export interface IPodManager {
  /**
   * Create a pod for a node. Returns existing pod if one is active.
   *
   * @param ctx - Workspace context
   * @param graphSlug - Graph containing the node
   * @param nodeId - Node to create pod for
   * @param unit - Loaded WorkUnitInstance (agent or code)
   * @returns The created or existing pod
   */
  createPod(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    unit: WorkUnitInstance
  ): IWorkUnitPod;

  /**
   * Get the active pod for a node (if any).
   */
  getPod(nodeId: string): IWorkUnitPod | undefined;

  /**
   * Get the stored session ID for a node.
   * Available even after pod is destroyed.
   */
  getSessionId(nodeId: string): string | undefined;

  /**
   * Record a session ID for a node (called after pod.execute returns).
   */
  setSessionId(nodeId: string, sessionId: string): void;

  /**
   * Destroy the active pod for a node. Session ID is retained.
   */
  destroyPod(nodeId: string): void;

  /**
   * Get all tracked sessions (for PositionalGraphReality.podSessions).
   */
  getSessions(): ReadonlyMap<string, string>;

  /**
   * Load persisted sessions from disk.
   * Called on startup/rehydration.
   */
  loadSessions(ctx: WorkspaceContext, graphSlug: string): Promise<void>;

  /**
   * Persist sessions to disk.
   * Called after session changes.
   */
  persistSessions(ctx: WorkspaceContext, graphSlug: string): Promise<void>;
}
```

---

## AgentPod Implementation

### How Agent Execution Works

```
ODS calls pod.execute(options)
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│ AgentPod.execute()                                           │
│                                                             │
│ 1. Build prompt:                                            │
│    • Get template from unit.getPrompt()                     │
│    • Substitute input values into template                  │
│    • If contextSessionId provided → use for session resume  │
│                                                             │
│ 2. Call agentAdapter.run({                                  │
│      prompt: renderedPrompt,                                │
│      sessionId: contextSessionId,                           │
│      cwd: workspacePath,                                    │
│      onEvent: (event) => { ... }                            │
│    })                                                       │
│                                                             │
│ 3. Handle result:                                           │
│    • agentResult.status === 'completed'                     │
│      → return { outcome: 'completed', sessionId }           │
│    • agentResult.status === 'failed'                        │
│      → return { outcome: 'error', error: { ... } }         │
│    • question detected during execution                     │
│      → return { outcome: 'question', question: { ... } }   │
│                                                             │
│ 4. Store sessionId for future resumption                    │
└─────────────────────────────────────────────────────────────┘
```

### Prompt Construction

```typescript
/**
 * Build the prompt string from unit template + inputs.
 */
function buildAgentPrompt(
  templateContent: string,
  inputs: InputPack
): string {
  let prompt = templateContent;

  // Substitute input placeholders: {{input_name}}
  for (const [name, resolution] of Object.entries(inputs.inputs)) {
    const placeholder = `{{${name}}}`;
    const value = typeof resolution.value === 'string'
      ? resolution.value
      : JSON.stringify(resolution.value);
    prompt = prompt.replaceAll(placeholder, value);
  }

  return prompt;
}
```

### Session Resumption Flow

```
First execution:
  pod.execute({ contextSessionId: 'sess-from-prev-node' })
  → agentAdapter.run({ prompt, sessionId: 'sess-from-prev-node' })
  → AgentResult { sessionId: 'new-sess-001' }
  → PodManager stores 'node-X' → 'new-sess-001'

Question flow:
  pod.execute(...) → AgentResult mid-stream detects question
  → return { outcome: 'question', sessionId: 'new-sess-001', question: {...} }
  → ODS calls graphService.askQuestion()
  → (user answers)
  → ODS calls pod.resumeWithAnswer(qId, answer, options)

Resume after answer:
  pod.resumeWithAnswer(qId, 'Option B', options)
  → agentAdapter.run({ prompt: 'Answer: Option B', sessionId: 'new-sess-001' })
  → continues in same session
```

### Implementation

```typescript
import type { IAgentAdapter, AgentRunOptions, AgentResult } from '@chainglass/shared';
import type { AgenticWorkUnitInstance } from '../features/029-agentic-work-units/workunit.classes.js';

export class AgentPod implements IWorkUnitPod {
  readonly unitType = 'agent' as const;
  private _sessionId: string | undefined;

  constructor(
    readonly nodeId: string,
    private readonly unit: AgenticWorkUnitInstance,
    private readonly agentAdapter: IAgentAdapter,
  ) {}

  get sessionId(): string | undefined {
    return this._sessionId;
  }

  async execute(options: PodExecuteOptions): Promise<PodExecuteResult> {
    const { inputs, contextSessionId, ctx, onEvent } = options;

    // 1. Build prompt
    const templateContent = await this.unit.getPrompt(ctx);
    const prompt = buildAgentPrompt(templateContent, inputs);

    // 2. Determine session to use
    const sessionId = contextSessionId ?? this._sessionId;

    // 3. Run agent
    const runOptions: AgentRunOptions = {
      prompt,
      sessionId,
      cwd: ctx.worktreePath,
      onEvent: onEvent ? this.mapAgentEvents(onEvent) : undefined,
    };

    try {
      const result = await this.agentAdapter.run(runOptions);
      this._sessionId = result.sessionId;

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

  async resumeWithAnswer(
    questionId: string,
    answer: unknown,
    options: PodExecuteOptions
  ): Promise<PodExecuteResult> {
    if (!this._sessionId) {
      return {
        outcome: 'error',
        error: {
          code: 'POD_NO_SESSION',
          message: `Cannot resume node '${this.nodeId}': no session ID`,
        },
      };
    }

    // Format the answer as a prompt continuation
    const answerPrompt = formatAnswerPrompt(questionId, answer);

    const runOptions: AgentRunOptions = {
      prompt: answerPrompt,
      sessionId: this._sessionId,
      cwd: options.ctx.worktreePath,
      onEvent: options.onEvent ? this.mapAgentEvents(options.onEvent) : undefined,
    };

    try {
      const result = await this.agentAdapter.run(runOptions);
      this._sessionId = result.sessionId;

      return this.mapAgentResult(result);
    } catch (err) {
      return {
        outcome: 'error',
        error: {
          code: 'POD_AGENT_RESUME_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  async terminate(): Promise<void> {
    if (this._sessionId) {
      await this.agentAdapter.terminate(this._sessionId);
    }
  }

  private mapAgentResult(result: AgentResult): PodExecuteResult {
    switch (result.status) {
      case 'completed':
        return {
          outcome: 'completed',
          sessionId: result.sessionId,
        };

      case 'failed':
        return {
          outcome: 'error',
          sessionId: result.sessionId,
          error: {
            code: 'AGENT_FAILED',
            message: result.stderr ?? `Agent failed with exit code ${result.exitCode}`,
          },
        };

      case 'killed':
        return {
          outcome: 'terminated',
          sessionId: result.sessionId,
        };
    }
  }

  private mapAgentEvents(handler: PodEventHandler): (event: AgentEvent) => void {
    return (event) => {
      // Map agent-level events to pod-level events
      // Only forward progress-relevant events
      if (event.type === 'text-delta') {
        handler({ type: 'progress', message: event.content });
      }
    };
  }
}

function formatAnswerPrompt(questionId: string, answer: unknown): string {
  const answerStr = typeof answer === 'string' ? answer : JSON.stringify(answer);
  return `Answer to question ${questionId}: ${answerStr}`;
}
```

---

## CodePod Implementation

Code pods are simpler — they run a script and return outputs. No sessions, no questions.

```typescript
export class CodePod implements IWorkUnitPod {
  readonly unitType = 'code' as const;
  readonly sessionId = undefined; // Code units never have sessions

  constructor(
    readonly nodeId: string,
    private readonly unit: CodeUnitInstance,
    private readonly scriptRunner: IScriptRunner,
  ) {}

  async execute(options: PodExecuteOptions): Promise<PodExecuteResult> {
    const { inputs, ctx, onEvent } = options;

    // 1. Get script content
    const scriptContent = await this.unit.getScript(ctx);

    // 2. Build environment from inputs
    const env = buildScriptEnv(inputs);

    // 3. Run script
    try {
      const result = await this.scriptRunner.run({
        script: scriptContent,
        cwd: ctx.worktreePath,
        env,
        timeout: this.unit.code.timeout ?? 60, // Default 60 seconds
        onOutput: onEvent
          ? (line: string) => onEvent({ type: 'progress', message: line })
          : undefined,
      });

      if (result.exitCode === 0) {
        return {
          outcome: 'completed',
          outputs: result.outputs,
        };
      } else {
        return {
          outcome: 'error',
          error: {
            code: 'SCRIPT_FAILED',
            message: `Script exited with code ${result.exitCode}: ${result.stderr}`,
          },
        };
      }
    } catch (err) {
      return {
        outcome: 'error',
        error: {
          code: 'POD_SCRIPT_EXECUTION_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  async resumeWithAnswer(): Promise<PodExecuteResult> {
    return {
      outcome: 'error',
      error: {
        code: 'POD_NOT_SUPPORTED',
        message: 'Code units do not support question/answer protocol',
      },
    };
  }

  async terminate(): Promise<void> {
    this.scriptRunner.kill();
  }
}

function buildScriptEnv(inputs: InputPack): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [name, resolution] of Object.entries(inputs.inputs)) {
    // Convert input name to UPPER_SNAKE_CASE env var
    const envKey = `INPUT_${name.toUpperCase()}`;
    env[envKey] = typeof resolution.value === 'string'
      ? resolution.value
      : JSON.stringify(resolution.value);
  }
  return env;
}
```

### IScriptRunner Interface

```typescript
/**
 * Thin wrapper around child process execution.
 */
export interface IScriptRunner {
  run(options: ScriptRunOptions): Promise<ScriptRunResult>;
  kill(): void;
}

export interface ScriptRunOptions {
  readonly script: string;
  readonly cwd: string;
  readonly env: Record<string, string>;
  readonly timeout: number; // seconds
  readonly onOutput?: (line: string) => void;
}

export interface ScriptRunResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly outputs: Record<string, unknown>;
}
```

---

## PodManager Implementation

```typescript
export class PodManager implements IPodManager {
  private readonly activePods = new Map<string, IWorkUnitPod>();
  private readonly sessions = new Map<string, string>();

  constructor(
    private readonly agentAdapter: IAgentAdapter,
    private readonly scriptRunner: IScriptRunner,
  ) {}

  createPod(
    ctx: WorkspaceContext,
    graphSlug: string,
    nodeId: string,
    unit: WorkUnitInstance
  ): IWorkUnitPod {
    // Return existing pod if active
    const existing = this.activePods.get(nodeId);
    if (existing) return existing;

    // Create type-specific pod
    let pod: IWorkUnitPod;

    switch (unit.type) {
      case 'agent':
        pod = new AgentPod(nodeId, unit, this.agentAdapter);
        break;
      case 'code':
        pod = new CodePod(nodeId, unit, this.scriptRunner);
        break;
      case 'user-input':
        throw new Error(
          `Cannot create pod for user-input unit '${unit.slug}' on node '${nodeId}'. ` +
          `User-input nodes are handled directly by the state layer.`
        );
    }

    this.activePods.set(nodeId, pod);
    return pod;
  }

  getPod(nodeId: string): IWorkUnitPod | undefined {
    return this.activePods.get(nodeId);
  }

  getSessionId(nodeId: string): string | undefined {
    return this.sessions.get(nodeId);
  }

  setSessionId(nodeId: string, sessionId: string): void {
    this.sessions.set(nodeId, sessionId);
  }

  destroyPod(nodeId: string): void {
    this.activePods.delete(nodeId);
    // Session ID is NOT deleted — retained for context inheritance
  }

  getSessions(): ReadonlyMap<string, string> {
    return this.sessions;
  }

  async loadSessions(ctx: WorkspaceContext, graphSlug: string): Promise<void> {
    // Load from .chainglass/graphs/<graphSlug>/pod-sessions.json
    // Populate this.sessions map
    // If file doesn't exist, start empty (no error)
  }

  async persistSessions(ctx: WorkspaceContext, graphSlug: string): Promise<void> {
    // Serialize this.sessions to JSON
    // Write to .chainglass/graphs/<graphSlug>/pod-sessions.json
    // Use atomic write pattern
  }
}
```

### Session Persistence Format

```json
{
  "sessions": {
    "node-001": "sess-abc-123",
    "node-002": "sess-def-456"
  },
  "persisted_at": "2026-02-05T14:30:00Z"
}
```

Stored at: `.chainglass/graphs/<graphSlug>/pod-sessions.json`

---

## User-Input Nodes: No Pod

User-input nodes do not get pods. Their "execution" is:
1. ODS detects a `start-node` OR for a user-input node
2. ODS calls `graphService.askQuestion()` directly (using the unit's question definition)
3. When the user answers, `answerQuestion()` is called, and `endNode()` completes it

This is entirely state-driven — no pod needed. ODS handles user-input nodes as a special case in `handleStartNode()`:

```typescript
// In ODS.handleStartNode():
if (node.unitType === 'user-input') {
  // No pod — create question directly from unit definition
  const unit = await this.workUnitService.load(ctx, node.unitSlug);
  if (unit.type !== 'user-input') { /* error */ }

  await this.graphService.startNode(ctx, graphSlug, nodeId);

  const qResult = await this.graphService.askQuestion(ctx, graphSlug, nodeId, {
    type: unit.user_input.question_type,
    text: unit.user_input.prompt,
    options: unit.user_input.options?.map(o => o.label),
    default: unit.user_input.default,
  });

  return { ok: true, request, newStatus: 'waiting-question' };
}
```

---

## Question Detection in Agent Pods

### The Problem

Agents don't have a structured question protocol built into `IAgentAdapter`. When an agent "asks a question," it's currently expressed through the agent's output text or events. We need a mechanism for agents to signal that they're asking a question.

### Approach: Convention-Based Detection

For v1, agent questions are detected through a convention in the agent's output or through a tool call event:

**Option A: Structured tool call** (preferred if agent supports tool use)
```typescript
// Agent calls a tool named 'ask_question'
{
  type: 'tool-call',
  toolName: 'ask_question',
  input: {
    type: 'single',
    text: 'Which database should we use?',
    options: ['PostgreSQL', 'MongoDB', 'SQLite']
  }
}
```

**Option B: Output parsing** (fallback for agents without tool use)
```typescript
// Agent outputs a structured marker
// QUESTION: {"type":"single","text":"Which database?","options":["PostgreSQL","MongoDB"]}
```

### Detection Implementation

```typescript
/**
 * Detect question requests from agent events or output.
 * Returns the first question found, or undefined.
 */
function detectQuestion(
  agentEvents: AgentEvent[],
  agentOutput: string
): PodQuestion | undefined {
  // Strategy 1: Look for tool call events
  for (const event of agentEvents) {
    if (event.type === 'tool-call' && event.toolName === 'ask_question') {
      return parseToolCallQuestion(event.input);
    }
  }

  // Strategy 2: Parse output for question markers
  return parseOutputQuestion(agentOutput);
}
```

### Question Flow Through the Stack

```
Agent asks question (via tool call or output)
        │
        ▼
AgentPod.execute() detects question
        │
        ▼
Returns PodExecuteResult {
  outcome: 'question',
  sessionId: 'sess-001',
  question: {
    questionId: generateId(),
    questionType: 'single',
    text: 'Which database?',
    options: ['PostgreSQL', 'MongoDB']
  }
}
        │
        ▼
ODS receives result
        │
        ├── Calls graphService.askQuestion(ctx, graphSlug, nodeId, question)
        │     → Node status → 'waiting-question'
        │     → Question stored in state.json
        │
        ├── Calls podManager.setSessionId(nodeId, 'sess-001')
        │     → Session persisted for later resumption
        │
        └── Returns to orchestration loop
              → Next ONBAS walk finds question-pending → surfaces it
```

---

## ODS Integration

### Complete ODS.handleStartNode Flow

```typescript
private async handleStartNode(
  ctx: WorkspaceContext,
  request: StartNodeRequest
): Promise<OrchestrationResult> {
  const { graphSlug, nodeId, inputs } = request;
  const reality = await this.buildReality(ctx, graphSlug);
  const node = reality.nodes.get(nodeId)!;

  // ── User-input: no pod ──────────────────────────
  if (node.unitType === 'user-input') {
    return this.handleUserInputStart(ctx, graphSlug, nodeId, node.unitSlug);
  }

  // ── Update state: node → running ────────────────
  await this.graphService.startNode(ctx, graphSlug, nodeId);

  // ── Load work unit ──────────────────────────────
  const loadResult = await this.workUnitService.load(ctx, node.unitSlug);
  if (!loadResult.unit) {
    return { ok: false, request, error: { code: 'UNIT_LOAD_FAILED', message: '...' } };
  }

  // ── Create pod ──────────────────────────────────
  const pod = this.podManager.createPod(ctx, graphSlug, nodeId, loadResult.unit);

  // ── Determine context session (agents only) ─────
  let contextSessionId: string | undefined;
  if (node.unitType === 'agent') {
    const contextResult = this.contextService.getContextSource(reality, nodeId);
    if (contextResult.source === 'inherit') {
      contextSessionId = this.podManager.getSessionId(contextResult.fromNodeId);
    }
  }

  // ── Execute pod ─────────────────────────────────
  const podResult = await pod.execute({
    inputs,
    contextSessionId,
    ctx,
    graphSlug,
    onEvent: (event) => this.handlePodEvent(graphSlug, nodeId, event),
  });

  // ── Handle result ───────────────────────────────
  if (podResult.sessionId) {
    this.podManager.setSessionId(nodeId, podResult.sessionId);
    await this.podManager.persistSessions(ctx, graphSlug);
  }

  switch (podResult.outcome) {
    case 'completed':
      await this.graphService.endNode(ctx, graphSlug, nodeId, {
        outputs: podResult.outputs,
      });
      this.podManager.destroyPod(nodeId);
      return { ok: true, request, newStatus: 'complete', sessionId: podResult.sessionId };

    case 'question':
      await this.graphService.askQuestion(ctx, graphSlug, nodeId, podResult.question!);
      return { ok: true, request, newStatus: 'waiting-question', sessionId: podResult.sessionId };

    case 'error':
      // Node marked as blocked-error by graphService
      this.podManager.destroyPod(nodeId);
      return { ok: false, request, error: podResult.error };

    case 'terminated':
      this.podManager.destroyPod(nodeId);
      return { ok: true, request, newStatus: 'blocked-error' };
  }
}
```

### ODS.handleResumeNode Flow

```typescript
private async handleResumeNode(
  ctx: WorkspaceContext,
  request: ResumeNodeRequest
): Promise<OrchestrationResult> {
  const { graphSlug, nodeId, questionId, answer } = request;

  // ── Answer the question in state ────────────────
  await this.graphService.answerQuestion(ctx, graphSlug, nodeId, questionId, answer);

  // ── Get or recreate pod ─────────────────────────
  let pod = this.podManager.getPod(nodeId);
  if (!pod) {
    // Pod was destroyed (process restart). Recreate from unit.
    const node = (await this.buildReality(ctx, graphSlug)).nodes.get(nodeId)!;
    const loadResult = await this.workUnitService.load(ctx, node.unitSlug);
    if (!loadResult.unit) {
      return { ok: false, request, error: { code: 'UNIT_LOAD_FAILED', message: '...' } };
    }
    pod = this.podManager.createPod(ctx, graphSlug, nodeId, loadResult.unit);
  }

  // ── Resume with answer ──────────────────────────
  const podResult = await pod.resumeWithAnswer(questionId, answer, {
    inputs: { ok: true, inputs: {} }, // Inputs already consumed on first execute
    ctx,
    graphSlug,
    onEvent: (event) => this.handlePodEvent(graphSlug, nodeId, event),
  });

  // ── Handle result (same as execute) ─────────────
  if (podResult.sessionId) {
    this.podManager.setSessionId(nodeId, podResult.sessionId);
    await this.podManager.persistSessions(ctx, graphSlug);
  }

  switch (podResult.outcome) {
    case 'completed':
      await this.graphService.endNode(ctx, graphSlug, nodeId, {
        outputs: podResult.outputs,
      });
      this.podManager.destroyPod(nodeId);
      return { ok: true, request, newStatus: 'complete', sessionId: podResult.sessionId };

    case 'question':
      await this.graphService.askQuestion(ctx, graphSlug, nodeId, podResult.question!);
      return { ok: true, request, newStatus: 'waiting-question', sessionId: podResult.sessionId };

    case 'error':
      this.podManager.destroyPod(nodeId);
      return { ok: false, request, error: podResult.error };

    case 'terminated':
      this.podManager.destroyPod(nodeId);
      return { ok: true, request, newStatus: 'blocked-error' };
  }
}
```

---

## FakePodManager (For TDD)

### Interface

```typescript
export class FakePodManager implements IPodManager {
  private readonly pods = new Map<string, FakePod>();
  private readonly sessions = new Map<string, string>();
  private readonly createHistory: Array<{
    graphSlug: string;
    nodeId: string;
    unitSlug: string;
  }> = [];

  /**
   * Pre-configure what a pod returns when executed.
   */
  configurePod(nodeId: string, config: FakePodConfig): void;

  /**
   * Pre-seed session IDs (simulates loaded state).
   */
  seedSession(nodeId: string, sessionId: string): void;

  /**
   * Get creation history for assertions.
   */
  getCreateHistory(): ReadonlyArray<{ graphSlug: string; nodeId: string; unitSlug: string }>;

  /**
   * Reset all state.
   */
  reset(): void;

  // IPodManager implementation...
  createPod(ctx, graphSlug, nodeId, unit): IWorkUnitPod;
  getPod(nodeId): IWorkUnitPod | undefined;
  getSessionId(nodeId): string | undefined;
  setSessionId(nodeId, sessionId): void;
  destroyPod(nodeId): void;
  getSessions(): ReadonlyMap<string, string>;
  async loadSessions(): Promise<void>;    // No-op
  async persistSessions(): Promise<void>; // No-op (records calls)
}

export interface FakePodConfig {
  /** Result to return from execute() */
  executeResult: PodExecuteResult;

  /** Result to return from resumeWithAnswer() */
  resumeResult?: PodExecuteResult;

  /** Session ID to assign */
  sessionId?: string;
}
```

### FakePod

```typescript
export class FakePod implements IWorkUnitPod {
  readonly unitType: 'agent' | 'code';
  private _sessionId: string | undefined;
  private executeCallCount = 0;
  private resumeCallCount = 0;
  private terminated = false;

  constructor(
    readonly nodeId: string,
    private readonly config: FakePodConfig,
    unitType: 'agent' | 'code' = 'agent',
  ) {
    this.unitType = unitType;
    this._sessionId = config.sessionId;
  }

  get sessionId(): string | undefined {
    return this._sessionId;
  }

  async execute(options: PodExecuteOptions): Promise<PodExecuteResult> {
    this.executeCallCount++;
    const result = this.config.executeResult;
    if (result.sessionId) {
      this._sessionId = result.sessionId;
    }
    return result;
  }

  async resumeWithAnswer(
    questionId: string,
    answer: unknown,
    options: PodExecuteOptions
  ): Promise<PodExecuteResult> {
    this.resumeCallCount++;
    const result = this.config.resumeResult ?? this.config.executeResult;
    if (result.sessionId) {
      this._sessionId = result.sessionId;
    }
    return result;
  }

  async terminate(): Promise<void> {
    this.terminated = true;
  }

  // Test helpers
  get wasExecuted(): boolean { return this.executeCallCount > 0; }
  get wasResumed(): boolean { return this.resumeCallCount > 0; }
  get wasTerminated(): boolean { return this.terminated; }
  get executionCount(): number { return this.executeCallCount; }
}
```

### Usage in Tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

describe('ODS with FakePodManager', () => {
  let fakePodManager: FakePodManager;
  let ods: OrchestrationDoerService;

  beforeEach(() => {
    fakePodManager = new FakePodManager();
    ods = new OrchestrationDoerService(
      fakeGraphService,
      fakePodManager,
      fakeContextService,
      fakeWorkUnitService,
      fakeNotifier,
    );
  });

  it('starts agent pod and records session', async () => {
    fakePodManager.configurePod('node-001', {
      executeResult: {
        outcome: 'completed',
        sessionId: 'sess-abc',
        outputs: { result: 'done' },
      },
    });

    const result = await ods.execute(ctx, {
      type: 'start-node',
      graphSlug: 'test-graph',
      nodeId: 'node-001',
      inputs: { ok: true, inputs: {} },
    });

    expect(result.ok).toBe(true);
    expect(result.newStatus).toBe('complete');
    expect(fakePodManager.getSessionId('node-001')).toBe('sess-abc');
  });

  it('resumes pod after question answered', async () => {
    // Seed prior session
    fakePodManager.seedSession('node-002', 'sess-existing');

    fakePodManager.configurePod('node-002', {
      executeResult: { outcome: 'completed', sessionId: 'sess-existing' },
      resumeResult: { outcome: 'completed', sessionId: 'sess-existing' },
    });

    const result = await ods.execute(ctx, {
      type: 'resume-node',
      graphSlug: 'test-graph',
      nodeId: 'node-002',
      questionId: 'q-001',
      answer: 'PostgreSQL',
    });

    expect(result.ok).toBe(true);
    const pod = fakePodManager.getPod('node-002') as FakePod;
    expect(pod.wasResumed).toBe(true);
  });

  it('handles question-producing pod', async () => {
    fakePodManager.configurePod('node-003', {
      executeResult: {
        outcome: 'question',
        sessionId: 'sess-new',
        question: {
          questionId: 'q-002',
          questionType: 'single',
          text: 'Which approach?',
          options: ['A', 'B'],
        },
      },
    });

    const result = await ods.execute(ctx, {
      type: 'start-node',
      graphSlug: 'test-graph',
      nodeId: 'node-003',
      inputs: { ok: true, inputs: {} },
    });

    expect(result.ok).toBe(true);
    expect(result.newStatus).toBe('waiting-question');
    expect(fakePodManager.getSessionId('node-003')).toBe('sess-new');
  });
});
```

---

## Examples

### Example 1: Agent Node — Complete Execution

```
Graph: Line 0 [user-prompt] → Line 1 [spec-builder (agent)]

1. ONBAS: start-node { nodeId: 'spec-builder', inputs: {...} }
2. ODS:
   a. graphService.startNode(ctx, 'graph-1', 'spec-builder')
   b. workUnitService.load(ctx, 'spec-builder') → AgenticWorkUnitInstance
   c. podManager.createPod(ctx, 'graph-1', 'spec-builder', unit) → AgentPod
   d. contextService.getContextSource(reality, 'spec-builder') → { source: 'new' }
   e. pod.execute({ inputs, ctx, graphSlug: 'graph-1' })
      → agentAdapter.run({ prompt: '...', cwd: '/workspace' })
      → AgentResult { sessionId: 'sess-001', status: 'completed' }
   f. podManager.setSessionId('spec-builder', 'sess-001')
   g. graphService.endNode(ctx, 'graph-1', 'spec-builder', { outputs: {...} })
   h. podManager.destroyPod('spec-builder')
```

### Example 2: Agent Node — Question Flow

```
1. ONBAS: start-node { nodeId: 'reviewer', inputs: {...} }
2. ODS:
   a. pod.execute(options)
      → Agent calls ask_question tool
      → PodExecuteResult { outcome: 'question', sessionId: 'sess-002',
          question: { questionId: 'q-001', text: 'Which approach?', ... } }
   b. graphService.askQuestion(ctx, 'graph-1', 'reviewer', question)
   c. podManager.setSessionId('reviewer', 'sess-002')
   d. Node status → 'waiting-question'

3. ONBAS (next loop): question-pending { nodeId: 'reviewer', questionId: 'q-001' }
4. ODS: graphService.markQuestionSurfaced(ctx, 'graph-1', 'q-001')

   [User answers 'Option B']

5. ONBAS: resume-node { nodeId: 'reviewer', questionId: 'q-001', answer: 'Option B' }
6. ODS:
   a. graphService.answerQuestion(ctx, 'graph-1', 'reviewer', 'q-001', 'Option B')
   b. pod = podManager.getPod('reviewer') ?? recreate
   c. pod.resumeWithAnswer('q-001', 'Option B', options)
      → agentAdapter.run({ prompt: 'Answer: Option B', sessionId: 'sess-002' })
      → AgentResult { sessionId: 'sess-002', status: 'completed' }
   d. graphService.endNode(ctx, 'graph-1', 'reviewer')
```

### Example 3: Code Node — Script Execution

```
1. ONBAS: start-node { nodeId: 'linter', inputs: {...} }
2. ODS:
   a. graphService.startNode(ctx, 'graph-1', 'linter')
   b. workUnitService.load(ctx, 'eslint-runner') → CodeUnitInstance
   c. podManager.createPod(ctx, 'graph-1', 'linter', unit) → CodePod
   d. pod.execute({ inputs, ctx, graphSlug: 'graph-1' })
      → scriptRunner.run({ script: 'eslint ...', cwd: '/workspace', env: {...} })
      → ScriptRunResult { exitCode: 0, outputs: { report: '...' } }
   e. graphService.endNode(ctx, 'graph-1', 'linter', { outputs: { report: '...' } })
   f. podManager.destroyPod('linter')
```

### Example 4: Session Inheritance Across Lines

```
Line 0: [prompter (agent)]   → Session: sess-100
Line 1: [spec-builder (agent)] → inherits from prompter

1. ODS starts prompter:
   pod.execute({ inputs, ctx })
   → sessionId: 'sess-100'
   podManager.setSessionId('prompter', 'sess-100')

2. ODS starts spec-builder:
   contextService.getContextSource(reality, 'spec-builder')
   → { source: 'inherit', fromNodeId: 'prompter' }
   contextSessionId = podManager.getSessionId('prompter') → 'sess-100'
   pod.execute({ inputs, contextSessionId: 'sess-100', ctx })
   → agentAdapter.run({ prompt: '...', sessionId: 'sess-100' })
   → Agent continues with prompter's conversation context
   → sessionId: 'sess-101' (new session derived from 100)
```

### Example 5: Process Restart Recovery

```
Before restart:
  podManager sessions: { 'node-001': 'sess-abc', 'node-002': 'sess-def' }
  persisted to pod-sessions.json

After restart:
  1. podManager.loadSessions(ctx, 'graph-1')
     → sessions loaded from pod-sessions.json
  2. ONBAS finds node-002 still waiting-question (answer received)
  3. ONBAS: resume-node { nodeId: 'node-002', answer: 'Yes' }
  4. ODS:
     pod = podManager.getPod('node-002') → undefined (pods lost)
     unit = workUnitService.load(ctx, 'reviewer')
     pod = podManager.createPod(ctx, 'graph-1', 'node-002', unit) → new AgentPod
     pod.resumeWithAnswer('q-001', 'Yes', {
       ... // sessionId comes from podManager.getSessionId('node-002') → 'sess-def'
     })
```

---

## Open Questions

### Q1: How does AgentPod detect that the agent asked a question?

**OPEN**: Two approaches identified:

**Option A: Tool call convention** — The agent's system prompt includes an `ask_question` tool. When the agent calls it, we intercept via `onEvent`. This is structured and reliable but requires agent cooperation.

**Option B: Output parsing** — Parse agent output for a structured marker (e.g., `QUESTION: {...}`). More fragile but works with any agent.

**Recommendation**: Option A for v1. The work unit definition can declare whether question support is enabled, and the agent prompt template can include the tool definition.

### Q2: Should CodePod outputs be parsed from stdout?

**OPEN**: How does a code unit declare its outputs?

**Option A: Structured JSON on stdout** — Script prints `OUTPUT:{"key":"value"}` and pod parses it.

**Option B: File-based outputs** — Script writes to known paths (e.g., `.chainglass/graphs/<slug>/outputs/<nodeId>/<outputName>`).

**Option C: Exit code only** — Code units produce no structured output; they're side-effect only (linting, formatting).

**Recommendation**: Option B for file outputs, Option C for simple scripts. The work unit definition's `outputs` array determines which approach applies. If `outputs` is empty, no parsing needed.

### Q3: Should PodManager be per-graph or global?

**RESOLVED**: Per-graph.

Each graph has its own session namespace. A PodManager instance tracks pods and sessions for a single graph. ODS creates or retrieves the PodManager for the graph being orchestrated.

```typescript
class OrchestrationDoerService {
  private readonly podManagers = new Map<string, IPodManager>();

  private getPodManager(graphSlug: string): IPodManager {
    let pm = this.podManagers.get(graphSlug);
    if (!pm) {
      pm = new PodManager(this.agentAdapter, this.scriptRunner);
      this.podManagers.set(graphSlug, pm);
    }
    return pm;
  }
}
```

### Q4: Should pod execution be fire-and-forget or blocking?

**RESOLVED**: Blocking.

`pod.execute()` returns a `Promise<PodExecuteResult>` that resolves when the agent/script completes (or asks a question). ODS awaits this. The orchestration loop is:

```
loop:
  1. Build reality
  2. ONBAS → OR
  3. ODS executes (blocks until pod returns)
  4. State updated
  5. Go to 1
```

For parallel nodes, ODS starts multiple pods in sequence (one per ONBAS loop iteration). The first pod runs to completion, then the next is started. True concurrent execution (multiple pods running simultaneously) is a future optimization.

**Rationale**: Sequential execution is simpler, avoids concurrent state mutation, and matches the "one action per loop" ONBAS design. Parallel nodes still benefit from independent contexts and non-blocking gates — they just start one at a time.

---

## Relationship to Other Workshops

| Workshop | Relationship |
|----------|--------------|
| **PositionalGraphReality** | `podSessions` map populated from PodManager |
| **OrchestrationRequest** | `start-node` and `resume-node` ORs trigger pod actions |
| **AgentContextService** | Returns `fromNodeId` → PodManager provides sessionId |
| **ONBAS** | Produces ORs that lead to pod operations (indirect) |
| **ODS** | Creates pods, calls execute/resume, handles results |

---

## File Location

```
packages/positional-graph/
└── src/
    └── features/030-orchestration/
        ├── pod.types.ts              # PodExecuteOptions, PodExecuteResult, PodEvent, IWorkUnitPod
        ├── pod.schema.ts             # Zod schemas for PodExecuteResult, PodQuestion
        ├── pod.agent.ts              # AgentPod implementation
        ├── pod.code.ts               # CodePod implementation
        ├── pod-manager.ts            # PodManager implementation
        ├── pod-manager.interface.ts  # IPodManager interface
        ├── script-runner.interface.ts# IScriptRunner interface
        ├── fake-pod-manager.ts       # FakePodManager + FakePod for testing
        ├── pod.agent.test.ts         # AgentPod unit tests
        ├── pod.code.test.ts          # CodePod unit tests
        └── pod-manager.test.ts       # PodManager unit tests
```

---

## Implementation Checklist

- [ ] Create `pod.types.ts` with IWorkUnitPod, PodExecuteOptions, PodExecuteResult
- [ ] Create `pod.schema.ts` with Zod schemas
- [ ] Create `pod-manager.interface.ts` with IPodManager
- [ ] Create `script-runner.interface.ts` with IScriptRunner
- [ ] Create `pod.agent.ts` with AgentPod (wraps IAgentAdapter)
- [ ] Create `pod.code.ts` with CodePod (wraps IScriptRunner)
- [ ] Create `pod-manager.ts` with PodManager implementation
- [ ] Create `fake-pod-manager.ts` with FakePodManager + FakePod
- [ ] Add session persistence (load/persist from pod-sessions.json)
- [ ] Add unit tests for AgentPod (execute, resumeWithAnswer, terminate)
- [ ] Add unit tests for CodePod (execute, error handling, timeout)
- [ ] Add unit tests for PodManager (create, destroy, session tracking)
- [ ] Add unit tests for FakePodManager (TDD verification)
- [ ] Export from feature index
- [ ] Integrate with ODS handleStartNode/handleResumeNode (depends on Workshop #6)

---

## Glossary

| Term | Expansion | Definition |
|------|-----------|------------|
| **OR** | OrchestrationRequest | Discriminated union type representing the next action for the orchestrator. ODS translates ORs into pod operations. |
| **ONBAS** | OrchestrationNextBestActionService | Pure-function rules engine that decides what happens next. Not aware of pods. |
| **ODS** | OrchestrationDoerService | Executor that consumes ORs. Creates pods via PodManager, calls `pod.execute()` / `pod.resumeWithAnswer()`, updates state. |
| **Reality** | PositionalGraphReality | Read-only snapshot including `podSessions` map. Built from service state + PodManager session registry. |
| **Pod** | IWorkUnitPod | Ephemeral execution container for a single node. Two concrete types: `AgentPod` (wraps `IAgentAdapter`) and `CodePod` (wraps `IScriptRunner`). |
| **PodManager** | IPodManager | Per-graph registry that creates/tracks/destroys pods. Persists session IDs in `pod-sessions.json` for restart recovery. |
| **FakePod** | — | Test double for `IWorkUnitPod`. Returns pre-configured `PodExecuteResult` (completed, question, error). |
| **FakePodManager** | — | Test double for `IPodManager`. Creates `FakePod` instances with configurable behavior. Tracks all calls for assertions. |
| **PodExecuteResult** | — | Return type of `pod.execute()`: `{ outcome: 'completed' \| 'question' \| 'error' \| 'terminated', outputs?, question?, error? }`. |
| **Session ID** | — | Opaque string identifying an agent conversation. Stored per-node in PodManager. Enables session resumption and context inheritance. |
| **WorkUnit** | — | Declarative definition of what a node does. Pod type is determined by `unitType`: agent → `AgentPod`, code → `CodePod`, user-input → no pod. |
| **InputPack** | — | Collated input data passed to `pod.execute()` as part of `PodExecuteOptions`. |

---

## Summary

WorkUnitPods are the **execution layer** of the orchestration system. They bridge the gap between "what to run" (WorkUnit definitions) and "how to run it" (agent adapters, script runners).

**Key Points**:
1. **Two pod types**: AgentPod (wraps IAgentAdapter) and CodePod (wraps IScriptRunner)
2. **No pod for user-input**: Handled directly by ODS + state layer
3. **PodManager tracks sessions**: Session IDs persist across restarts via pod-sessions.json
4. **Pods don't update state**: ODS reads pod results and calls PositionalGraphService
5. **FakePodManager enables TDD**: Configure pod results upfront, assert interactions after
6. **Blocking execution**: pod.execute() resolves when work completes (or asks question)
7. **Session inheritance**: ODS passes `contextSessionId` from PodManager when AgentContextService says to inherit
