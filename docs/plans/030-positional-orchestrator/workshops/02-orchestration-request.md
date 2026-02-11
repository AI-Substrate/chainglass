# Workshop: OrchestrationRequest

**Type**: Data Model
**Plan**: 030-positional-orchestrator
**Spec**: [research-dossier.md](../research-dossier.md)
**Created**: 2026-02-05
**Status**: Draft

**Related Documents**:
- [workshops.md](../workshops.md) — Workshop index
- [positional-graph-reality.md](01-positional-graph-reality.md) — Snapshot consumed by ONBAS
- [research-dossier.md](../research-dossier.md) — Prior art and existing interfaces

---

## Purpose

Define the discriminated union type that ONBAS produces and ODS consumes. `OrchestrationRequest` is the contract between "what should happen next?" and "do it." Every action the orchestrator can take must be expressible as one of these request types.

## Key Questions Addressed

- What are all the OR types the orchestrator can return?
- What payload does each type carry?
- How does ODS map each type to concrete actions?
- What invariants must each type satisfy?
- How do we handle graph-level vs node-level requests?

---

## Design Principles

### 1. Closed Set of Actions

The union is **exhaustive** — if ONBAS returns a request, ODS knows exactly how to handle it. No `unknown` or extensibility here; the set is finite and well-defined.

### 2. Each Type is Self-Contained

Every request carries all the data ODS needs to execute. No second lookup required. If `start-node` needs inputs, the inputs are in the payload.

### 3. Discriminated by `type` Field

Following the established WorkUnit pattern, all variants share a `type` discriminator for type-safe handling:

```typescript
switch (request.type) {
  case 'start-node': /* ... */ break;
  case 'resume-node': /* ... */ break;
  // TypeScript ensures exhaustiveness
}
```

### 4. Common Fields at Union Level

All request types share `graphSlug`. Some share `nodeId`. The discriminated union enables type-safe access.

---

## OrchestrationRequest Types

Based on the walk algorithm from [PositionalGraphReality Workshop](01-positional-graph-reality.md), ONBAS can return exactly four request types:

| Type | When Emitted | What ODS Does |
|------|--------------|---------------|
| `start-node` | Node is `ready` | Start execution, set status to `running` |
| `resume-node` | Question answered, node `waiting-question` | Resume execution with answer |
| `question-pending` | Question not yet surfaced | Mark surfaced, emit to user |
| `no-action` | Nothing actionable | Do nothing (loop stops) |

### Why These Four?

**`start-node`**: A node has all gates passing (`ready === true`) and status is `ready`. Begin execution.

**`resume-node`**: A node asked a question, the user answered it, the node is still `waiting-question`. Resume with the answer.

**`question-pending`**: A node asked a question (status `waiting-question`) but the question hasn't been surfaced to the user yet. ODS must emit the question and mark it surfaced.

**`no-action`**: The walk found nothing actionable. This happens when:
- All nodes are complete (graph done)
- Nodes are running or waiting for input
- A transition gate is blocking
- A surfaced question awaits user answer

---

## Schema Definitions

### TypeScript Types

```typescript
// ============================================
// OrchestrationRequest — Discriminated Union
// ============================================

/**
 * The complete set of actions ONBAS can request ODS to execute.
 * Exhaustive — every possible next action is represented.
 */
export type OrchestrationRequest =
  | StartNodeRequest
  | ResumeNodeRequest
  | QuestionPendingRequest
  | NoActionRequest;

// ── Base fields (not a type, just documentation) ──
// All requests carry graphSlug for routing
// Node-level requests also carry nodeId

// ────────────────────────────────────────────────────
// StartNodeRequest
// ────────────────────────────────────────────────────

/**
 * Request to start executing a node.
 *
 * Emitted when:
 * - Node status is 'ready' (all gates pass)
 *
 * ODS action:
 * - Set node status to 'running'
 * - Create or retrieve WorkUnitPod for node
 * - Start execution with provided inputs
 * - Record started_at timestamp
 */
export interface StartNodeRequest {
  readonly type: 'start-node';

  /** Graph containing the node */
  readonly graphSlug: string;

  /** Node to start */
  readonly nodeId: string;

  /** Resolved inputs for execution (from collateInputs) */
  readonly inputs: InputPack;
}

// ────────────────────────────────────────────────────
// ResumeNodeRequest
// ────────────────────────────────────────────────────

/**
 * Request to resume a node that was waiting for a question answer.
 *
 * Emitted when:
 * - Node status is 'waiting-question'
 * - The pending question has been answered (isAnswered === true)
 *
 * ODS action:
 * - Resume the node's WorkUnitPod with the answer
 * - Node status remains 'running' until next event
 */
export interface ResumeNodeRequest {
  readonly type: 'resume-node';

  /** Graph containing the node */
  readonly graphSlug: string;

  /** Node to resume */
  readonly nodeId: string;

  /** Question that was answered */
  readonly questionId: string;

  /** The user's answer (type varies by question type) */
  readonly answer: unknown;
}

// ────────────────────────────────────────────────────
// QuestionPendingRequest
// ────────────────────────────────────────────────────

/**
 * Request to surface a question to the user.
 *
 * Emitted when:
 * - Node status is 'waiting-question'
 * - Question exists but isSurfaced === false
 *
 * ODS action:
 * - Mark question as surfaced (set surfaced_at timestamp)
 * - Emit question to user interface (via event, callback, etc.)
 * - The walk continues past this node on subsequent loops
 *
 * Note: This request is emitted ONCE per question. After ODS marks
 * it surfaced, ONBAS will skip past it until the answer arrives.
 */
export interface QuestionPendingRequest {
  readonly type: 'question-pending';

  /** Graph containing the node */
  readonly graphSlug: string;

  /** Node that asked the question */
  readonly nodeId: string;

  /** Question identifier */
  readonly questionId: string;

  /** Question text to display */
  readonly questionText: string;

  /** Question type determines input UI */
  readonly questionType: 'text' | 'single' | 'multi' | 'confirm';

  /** Options for single/multi questions */
  readonly options?: readonly string[];

  /** Default value (for pre-filling input) */
  readonly defaultValue?: string | boolean;
}

// ────────────────────────────────────────────────────
// NoActionRequest
// ────────────────────────────────────────────────────

/**
 * Indicates nothing actionable was found.
 *
 * Emitted when:
 * - All nodes are complete
 * - All ready nodes are already running
 * - A transition gate is blocking progress
 * - All surfaced questions await user answers
 *
 * ODS action:
 * - Do nothing
 * - Orchestration loop stops
 *
 * The optional `reason` and `lineId` fields provide debugging info.
 */
export interface NoActionRequest {
  readonly type: 'no-action';

  /** Graph that was walked */
  readonly graphSlug: string;

  /** Why no action was found (for debugging) */
  readonly reason?: NoActionReason;

  /** Line ID if transition-blocked */
  readonly lineId?: string;
}

/**
 * Reasons why the walk produced no action.
 */
export type NoActionReason =
  | 'graph-complete'       // All lines complete
  | 'transition-blocked'   // Manual transition not triggered
  | 'all-waiting'          // Nodes running or waiting for input/answer
  | 'graph-failed';        // Graph is in failed state

// ============================================
// Type Guards
// ============================================

export function isStartNodeRequest(req: OrchestrationRequest): req is StartNodeRequest {
  return req.type === 'start-node';
}

export function isResumeNodeRequest(req: OrchestrationRequest): req is ResumeNodeRequest {
  return req.type === 'resume-node';
}

export function isQuestionPendingRequest(req: OrchestrationRequest): req is QuestionPendingRequest {
  return req.type === 'question-pending';
}

export function isNoActionRequest(req: OrchestrationRequest): req is NoActionRequest {
  return req.type === 'no-action';
}

// ============================================
// Utility: Node-Level Requests
// ============================================

/**
 * Requests that target a specific node.
 * Useful for filtering or routing.
 */
export type NodeLevelRequest = StartNodeRequest | ResumeNodeRequest | QuestionPendingRequest;

export function isNodeLevelRequest(req: OrchestrationRequest): req is NodeLevelRequest {
  return req.type !== 'no-action';
}

/**
 * Extract nodeId from any node-level request.
 */
export function getNodeId(req: OrchestrationRequest): string | undefined {
  if (isNodeLevelRequest(req)) {
    return req.nodeId;
  }
  return undefined;
}
```

### Zod Schemas

```typescript
import { z } from 'zod';
import { InputPackSchema } from './input.schema.js';

// ── NoActionReason ────────────────────────────────
export const NoActionReasonSchema = z.enum([
  'graph-complete',
  'transition-blocked',
  'all-waiting',
  'graph-failed',
]);
export type NoActionReason = z.infer<typeof NoActionReasonSchema>;

// ── StartNodeRequest ──────────────────────────────
export const StartNodeRequestSchema = z.object({
  type: z.literal('start-node'),
  graphSlug: z.string().regex(/^[a-z][a-z0-9-]*$/),
  nodeId: z.string().min(1),
  inputs: InputPackSchema,
}).strict();
export type StartNodeRequest = z.infer<typeof StartNodeRequestSchema>;

// ── ResumeNodeRequest ─────────────────────────────
export const ResumeNodeRequestSchema = z.object({
  type: z.literal('resume-node'),
  graphSlug: z.string().regex(/^[a-z][a-z0-9-]*$/),
  nodeId: z.string().min(1),
  questionId: z.string().min(1),
  answer: z.unknown(),
}).strict();
export type ResumeNodeRequest = z.infer<typeof ResumeNodeRequestSchema>;

// ── QuestionPendingRequest ────────────────────────
export const QuestionPendingRequestSchema = z.object({
  type: z.literal('question-pending'),
  graphSlug: z.string().regex(/^[a-z][a-z0-9-]*$/),
  nodeId: z.string().min(1),
  questionId: z.string().min(1),
  questionText: z.string().min(1),
  questionType: z.enum(['text', 'single', 'multi', 'confirm']),
  options: z.array(z.string()).optional(),
  defaultValue: z.union([z.string(), z.boolean()]).optional(),
}).strict();
export type QuestionPendingRequest = z.infer<typeof QuestionPendingRequestSchema>;

// ── NoActionRequest ───────────────────────────────
export const NoActionRequestSchema = z.object({
  type: z.literal('no-action'),
  graphSlug: z.string().regex(/^[a-z][a-z0-9-]*$/),
  reason: NoActionReasonSchema.optional(),
  lineId: z.string().optional(),
}).strict();
export type NoActionRequest = z.infer<typeof NoActionRequestSchema>;

// ── OrchestrationRequest (Discriminated Union) ───
export const OrchestrationRequestSchema = z.discriminatedUnion('type', [
  StartNodeRequestSchema,
  ResumeNodeRequestSchema,
  QuestionPendingRequestSchema,
  NoActionRequestSchema,
]);
export type OrchestrationRequest = z.infer<typeof OrchestrationRequestSchema>;
```

---

## ODS Action Mapping

When ODS receives an OrchestrationRequest, it executes the corresponding action. This table shows the complete mapping:

| OR Type | ODS Method | State Changes | Events Emitted |
|---------|------------|---------------|----------------|
| `start-node` | `startNode()` | status → running, started_at set | `node-started` |
| `resume-node` | `resumeNode()` | (none directly, pod runs) | `node-resumed` |
| `question-pending` | `surfaceQuestion()` | question.surfaced_at set | `question-surfaced` |
| `no-action` | — | none | none |

### ODS Handler Signatures

```typescript
interface IOrchestrationDoerService {
  /**
   * Execute any orchestration request.
   * Routes to specific handler based on request.type.
   */
  execute(
    ctx: WorkspaceContext,
    request: OrchestrationRequest
  ): Promise<OrchestrationResult>;
}

interface OrchestrationResult {
  /** True if action was executed successfully */
  readonly ok: boolean;

  /** Error details if ok === false */
  readonly error?: OrchestrationError;

  /** The request that was executed (echo back) */
  readonly request: OrchestrationRequest;

  /** For start-node: the pod session ID */
  readonly sessionId?: string;

  /** For any action: the updated node status */
  readonly newStatus?: ExecutionStatus;
}

interface OrchestrationError {
  readonly code: string;
  readonly message: string;
  readonly nodeId?: string;
}
```

### Handler Pseudo-Implementation

```typescript
async execute(
  ctx: WorkspaceContext,
  request: OrchestrationRequest
): Promise<OrchestrationResult> {
  switch (request.type) {
    case 'start-node':
      return this.handleStartNode(ctx, request);

    case 'resume-node':
      return this.handleResumeNode(ctx, request);

    case 'question-pending':
      return this.handleQuestionPending(ctx, request);

    case 'no-action':
      // Nothing to do
      return { ok: true, request };

    default:
      // TypeScript ensures exhaustiveness
      const _exhaustive: never = request;
      throw new Error(`Unknown request type: ${JSON.stringify(_exhaustive)}`);
  }
}

private async handleStartNode(
  ctx: WorkspaceContext,
  request: StartNodeRequest
): Promise<OrchestrationResult> {
  const { graphSlug, nodeId, inputs } = request;

  // 1. Update state: node → running
  await this.graphService.startNode(ctx, graphSlug, nodeId);

  // 2. Get/create pod for node
  const pod = await this.podManager.getPod(ctx, graphSlug, nodeId);

  // 3. Determine context (session to inherit)
  const contextSource = this.contextService.getContextSource(/* ... */);
  const contextSessionId = contextSource.source === 'inherit'
    ? await this.podManager.getSessionId(ctx, graphSlug, contextSource.fromNodeId!)
    : undefined;

  // 4. Execute pod
  const podResult = await pod.execute(inputs, contextSessionId);

  // 5. Emit event
  this.notifier.emit('workgraphs', 'node-started', { graphSlug, nodeId });

  return {
    ok: true,
    request,
    sessionId: podResult.sessionId,
    newStatus: 'running',
  };
}

private async handleResumeNode(
  ctx: WorkspaceContext,
  request: ResumeNodeRequest
): Promise<OrchestrationResult> {
  const { graphSlug, nodeId, questionId, answer } = request;

  // 1. Get the pod (should already exist)
  const pod = await this.podManager.getPod(ctx, graphSlug, nodeId);

  // 2. Resume with answer
  await pod.answerQuestion(questionId, answer);

  // 3. Emit event
  this.notifier.emit('workgraphs', 'node-resumed', { graphSlug, nodeId, questionId });

  return { ok: true, request };
}

private async handleQuestionPending(
  ctx: WorkspaceContext,
  request: QuestionPendingRequest
): Promise<OrchestrationResult> {
  const { graphSlug, nodeId, questionId, questionText, questionType, options } = request;

  // 1. Mark question as surfaced (set surfaced_at)
  await this.graphService.markQuestionSurfaced(ctx, graphSlug, questionId);

  // 2. Emit question to user interface
  this.notifier.emit('workgraphs', 'question-surfaced', {
    graphSlug,
    nodeId,
    questionId,
    questionText,
    questionType,
    options,
  });

  return { ok: true, request };
}
```

---

## Invariants

Each request type has invariants that ONBAS must satisfy before emitting:

### StartNodeRequest Invariants

1. **Node exists**: `reality.nodes.has(nodeId)` is true
2. **Node is ready**: `node.status === 'ready'`
3. **All gates pass**: `node.ready === true`
4. **Inputs available**: `inputs.ok === true`
5. **Not already running**: Node is not in `running` status

### ResumeNodeRequest Invariants

1. **Node exists**: `reality.nodes.has(nodeId)` is true
2. **Node waiting**: `node.status === 'waiting-question'`
3. **Question exists**: `reality.questions.find(q => q.questionId === questionId)`
4. **Question answered**: `question.isAnswered === true`
5. **Answer present**: `answer !== undefined`

### QuestionPendingRequest Invariants

1. **Node exists**: `reality.nodes.has(nodeId)` is true
2. **Node waiting**: `node.status === 'waiting-question'`
3. **Question exists**: Question with `questionId` exists
4. **Not surfaced**: `question.isSurfaced === false`
5. **Not answered**: `question.isAnswered === false`

### NoActionRequest Invariants

1. **Graph exists**: `graphSlug` is valid
2. **No startable nodes**: No node in `ready` status
3. **No resumable nodes**: No `waiting-question` node with answered question
4. **No unsurfaced questions**: All questions either surfaced or answered

---

## Request Lifecycle

```
┌─────────────────────────────────────────────────────────────────────┐
│                      ONBAS → ODS → State                            │
└─────────────────────────────────────────────────────────────────────┘

                    ONBAS (pure function)
                           │
                           ▼
              ┌────────────────────────┐
              │  OrchestrationRequest  │
              │  (discriminated union) │
              └────────────────────────┘
                           │
                           ▼
                    ODS (executor)
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
    ┌──────────┐    ┌──────────┐    ┌──────────┐
    │ PodMgr   │    │  State   │    │  Events  │
    │ execute  │    │  update  │    │  emit    │
    └──────────┘    └──────────┘    └──────────┘
          │                │                │
          ▼                ▼                ▼
       Pods run      state.json        UI notified
```

---

## Examples

### Example 1: Fresh Node Ready to Start

```typescript
const request: StartNodeRequest = {
  type: 'start-node',
  graphSlug: 'feature-spec-pipeline',
  nodeId: 'node-001',
  inputs: {
    ok: true,
    inputs: {
      'user-prompt': {
        name: 'user-prompt',
        value: 'Build a REST API for user management',
        sourceNodeId: 'node-000',
        outputName: 'prompt',
      },
    },
  },
};

// ODS executes:
// 1. graphService.startNode(ctx, 'feature-spec-pipeline', 'node-001')
// 2. pod = podManager.getPod(ctx, graphSlug, 'node-001')
// 3. pod.execute(inputs, contextSessionId)
// 4. notifier.emit('workgraphs', 'node-started', { ... })
```

### Example 2: Question Answered, Node Resumes

```typescript
const request: ResumeNodeRequest = {
  type: 'resume-node',
  graphSlug: 'feature-spec-pipeline',
  nodeId: 'node-002',
  questionId: 'q-001',
  answer: 'Option B: Use PostgreSQL',
};

// ODS executes:
// 1. pod = podManager.getPod(ctx, graphSlug, 'node-002')
// 2. pod.answerQuestion('q-001', 'Option B: Use PostgreSQL')
// 3. notifier.emit('workgraphs', 'node-resumed', { ... })
```

### Example 3: Question Needs to be Surfaced

```typescript
const request: QuestionPendingRequest = {
  type: 'question-pending',
  graphSlug: 'feature-spec-pipeline',
  nodeId: 'node-002',
  questionId: 'q-001',
  questionText: 'Which database should we use?',
  questionType: 'single',
  options: ['Option A: MongoDB', 'Option B: PostgreSQL', 'Option C: SQLite'],
};

// ODS executes:
// 1. graphService.markQuestionSurfaced(ctx, graphSlug, 'q-001')
// 2. notifier.emit('workgraphs', 'question-surfaced', { ... })
//
// Next loop, ONBAS will skip this question (isSurfaced === true)
// until the user answers it
```

### Example 4: Nothing to Do

```typescript
const request: NoActionRequest = {
  type: 'no-action',
  graphSlug: 'feature-spec-pipeline',
  reason: 'transition-blocked',
  lineId: 'line-001',
};

// ODS does nothing
// Orchestrator loop exits
// User must trigger transition manually (e.g., `cg wf advance`)
```

### Example 5: Graph Complete

```typescript
const request: NoActionRequest = {
  type: 'no-action',
  graphSlug: 'feature-spec-pipeline',
  reason: 'graph-complete',
};

// ODS does nothing
// Graph has finished successfully
```

---

## Testing Patterns

### Unit Testing ONBAS with Fake Reality

```typescript
import { describe, it, expect } from 'vitest';
import { walkForNextAction } from './onbas.js';
import { buildFakeReality } from './test-helpers.js';

describe('walkForNextAction', () => {
  it('returns start-node for ready node', () => {
    const reality = buildFakeReality({
      nodes: [
        { nodeId: 'node-001', status: 'ready', ready: true },
      ],
    });

    const request = walkForNextAction(reality);

    expect(request.type).toBe('start-node');
    expect(request).toEqual({
      type: 'start-node',
      graphSlug: 'test-graph',
      nodeId: 'node-001',
      inputs: expect.objectContaining({ ok: true }),
    });
  });

  it('returns resume-node when question answered', () => {
    const reality = buildFakeReality({
      nodes: [
        { nodeId: 'node-001', status: 'waiting-question', pendingQuestionId: 'q-001' },
      ],
      questions: [
        { questionId: 'q-001', nodeId: 'node-001', isSurfaced: true, isAnswered: true, answer: 'Yes' },
      ],
    });

    const request = walkForNextAction(reality);

    expect(request.type).toBe('resume-node');
    expect(request).toMatchObject({
      nodeId: 'node-001',
      questionId: 'q-001',
      answer: 'Yes',
    });
  });

  it('returns question-pending for unsurfaced question', () => {
    const reality = buildFakeReality({
      nodes: [
        { nodeId: 'node-001', status: 'waiting-question', pendingQuestionId: 'q-001' },
      ],
      questions: [
        { questionId: 'q-001', nodeId: 'node-001', isSurfaced: false, isAnswered: false, text: 'Continue?' },
      ],
    });

    const request = walkForNextAction(reality);

    expect(request.type).toBe('question-pending');
    expect(request).toMatchObject({
      nodeId: 'node-001',
      questionId: 'q-001',
      questionText: 'Continue?',
    });
  });

  it('returns no-action when all nodes running', () => {
    const reality = buildFakeReality({
      nodes: [
        { nodeId: 'node-001', status: 'running' },
        { nodeId: 'node-002', status: 'running' },
      ],
    });

    const request = walkForNextAction(reality);

    expect(request.type).toBe('no-action');
  });
});
```

### Unit Testing ODS with Fake Dependencies

```typescript
import { describe, it, expect, vi } from 'vitest';
import { OrchestrationDoerService } from './ods.js';

describe('OrchestrationDoerService', () => {
  it('handles start-node by starting pod', async () => {
    const mockGraphService = {
      startNode: vi.fn().mockResolvedValue({ errors: [] }),
    };
    const mockPodManager = {
      getPod: vi.fn().mockResolvedValue({
        execute: vi.fn().mockResolvedValue({ sessionId: 'sess-001' }),
      }),
    };
    const mockNotifier = { emit: vi.fn() };

    const ods = new OrchestrationDoerService(
      mockGraphService,
      mockPodManager,
      mockNotifier,
    );

    const result = await ods.execute(ctx, {
      type: 'start-node',
      graphSlug: 'test-graph',
      nodeId: 'node-001',
      inputs: { ok: true, inputs: {} },
    });

    expect(result.ok).toBe(true);
    expect(mockGraphService.startNode).toHaveBeenCalledWith(ctx, 'test-graph', 'node-001');
    expect(mockPodManager.getPod).toHaveBeenCalledWith(ctx, 'test-graph', 'node-001');
    expect(mockNotifier.emit).toHaveBeenCalledWith(
      'workgraphs',
      'node-started',
      expect.objectContaining({ nodeId: 'node-001' }),
    );
  });
});
```

---

## Open Questions

### Q1: Should `start-node` include context source info?

**RESOLVED**: No.

ONBAS answers "what should happen next?" — the action. Session context inheritance is "how to execute" — that's the agent/pod system's concern, not ONBAS's.

`StartNodeRequest` carries:
- Which node to start
- What inputs to provide

How the pod manages session context (inherit from predecessor, start fresh, etc.) is an internal concern of the agent execution layer. This maintains clean separation between the orchestrator's decision logic and the execution system's runtime concerns.

### Q2: Should failed nodes produce an OR?

**RESOLVED**: No. Skip silently.

A `blocked-error` node is a dead end — it can't progress and doesn't need action. The walk skips past it.

If failures block all progress paths, the graph-level status becomes `failed` and `no-action` returns with `reason: 'graph-failed'`. This is sufficient for signaling that the graph can't proceed.

Retry logic (if needed) would be a separate system concern — perhaps a CLI command like `cg wf retry node-001` that resets the node's state and lets the next ONBAS walk pick it up as `ready`.

### Q3: Should `question-pending` include answer schema?

**RESOLVED**: No.

The `questionType` field already implies the answer format:

| questionType | Expected Answer |
|--------------|-----------------|
| `text` | `string` |
| `confirm` | `boolean` |
| `single` | `string` (one of `options`) |
| `multi` | `string[]` (subset of `options`) |

Validation happens when the answer is submitted (in the answer-handling code), not when the question is surfaced. Adding a full Zod schema to the OR would be over-engineering.

### Q4: Timeout handling — new OR type?

**RESOLVED**: Not in v1. Future consideration.

Timeout detection requires infrastructure we don't have yet:
- Heartbeat mechanism for running pods
- Expected duration per work unit type
- Configurable timeout thresholds

For v1, a running node stays running until it completes, fails, or asks a question. Timeout handling can be added later with a `timeout-node` OR type if needed.

---

## Relationship to Other Workshops

| Workshop | Relationship |
|----------|--------------|
| **PositionalGraphReality** | ONBAS walks reality to produce OR |
| **ONBAS** | Implements `walkForNextAction(reality) → OR` |
| **ODS** | Consumes OR, executes actions |
| **AgentContextService** | ODS uses it to determine session inheritance |
| **WorkUnitPods** | ODS manages pods via PodManager |

---

## File Location

```
packages/positional-graph/
└── src/
    └── features/030-orchestration/
        ├── orchestration-request.schema.ts   # Zod schemas
        ├── orchestration-request.types.ts    # TypeScript interfaces
        ├── orchestration-request.guards.ts   # Type guard functions
        └── index.ts                          # Re-exports
```

---

## Implementation Checklist

- [ ] Create `orchestration-request.types.ts` with interfaces
- [ ] Create `orchestration-request.schema.ts` with Zod schemas
- [ ] Create `orchestration-request.guards.ts` with type guards
- [ ] Add `NoActionReason` enum for debugging
- [ ] Export from feature index
- [ ] Add unit tests for type guards
- [ ] Add schema validation tests
- [ ] Update ONBAS to return these types (depends on Workshop #5)
- [ ] Update ODS to handle these types (depends on Workshop #6)

---

## Glossary

| Term | Expansion | Definition |
|------|-----------|------------|
| **OR** | OrchestrationRequest | Discriminated union type representing the next action for the orchestrator. Four variants: `start-node`, `resume-node`, `question-pending`, `no-action`. |
| **ONBAS** | OrchestrationNextBestActionService | Pure-function rules engine that walks a `PositionalGraphReality` snapshot and returns an OR. The "brain" — decides what happens next. |
| **ODS** | OrchestrationDoerService | Executor that consumes an OR and performs the action — starting pods, surfacing questions, resuming nodes, updating state. |
| **Reality** | PositionalGraphReality | Read-only snapshot of the entire graph state at a moment in time. Input to ONBAS. |
| **Pod** | WorkUnitPod | Ephemeral execution container that wraps a single node's agent adapter or script runner. |
| **PodManager** | IPodManager | Per-graph registry that creates/tracks/destroys pods and persists session IDs. |
| **NodeReality** | — | Per-node snapshot: status, readiness, inputs, position, pending question. |
| **LineReality** | — | Per-line snapshot: transition state, completeness, node list. |
| **InputPack** | — | Collated input data for a node, resolved from upstream outputs. |
| **WorkUnit** | — | Declarative definition of what a node does: prompt template (agent), script (code), or question (user-input). |
| **NoActionReason** | — | String enum explaining why ONBAS returned `no-action`: `graph-complete`, `graph-failed`, `transition-blocked`, `all-waiting`. |

---

## Summary

`OrchestrationRequest` is a **discriminated union of four types** representing every possible action the orchestrator can take:

| Type | Purpose |
|------|---------|
| `start-node` | Begin executing a ready node |
| `resume-node` | Continue a node after question answered |
| `question-pending` | Surface a question to the user |
| `no-action` | Nothing to do (loop exits) |

The design follows established patterns:
- Discriminated by `type` field (like WorkUnit)
- Each variant self-contained with full payload
- Type guards for safe narrowing
- Zod schemas for runtime validation

ONBAS produces these requests. ODS consumes them. The contract is explicit and exhaustive.
