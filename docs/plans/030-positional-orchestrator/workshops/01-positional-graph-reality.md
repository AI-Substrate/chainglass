# Workshop: PositionalGraphReality

**Type**: Data Model
**Plan**: 030-positional-orchestrator
**Spec**: [research-dossier.md](../research-dossier.md)
**Created**: 2026-02-05
**Status**: Draft

**Related Documents**:
- [workshops.md](../workshops.md) — Workshop index
- [research-dossier.md](../research-dossier.md) — Prior art and existing interfaces

---

## Purpose

Define a snapshot object that captures the entire positional graph's execution state at a moment in time. This snapshot enables:
1. **TDD-first orchestration** — Tests can construct or mutate `PositionalGraphReality` directly without touching filesystems
2. **Pure decision logic** — ONBAS receives a snapshot and returns an `OrchestrationRequest` without side effects
3. **Debugging & observability** — Complete state visible at decision point

## Key Questions Addressed

- What fields does `PositionalGraphReality` contain?
- How is it built from existing `getStatus()` + `state.json`?
- What convenience accessors simplify ONBAS walk logic?
- How does it relate to `GraphStatusResult` (existing) vs new snapshot type?

---

## Design Decision: Extend vs Replace

### Options Considered

| Option | Pros | Cons |
|--------|------|------|
| **A: Use `GraphStatusResult` directly** | No new type, reuse existing | Missing pod session IDs, context tracking |
| **B: Extend `GraphStatusResult` into `PositionalGraphReality`** | Leverages existing structure, additive | Naming confusion, inheritance coupling |
| **C: New `PositionalGraphReality` wrapping `GraphStatusResult`** | Clear separation, composition | Duplication if not careful |

**RESOLVED**: Option C — composition. `PositionalGraphReality` wraps `GraphStatusResult` and adds orchestration-specific fields (pod sessions, context sources). The existing service continues returning `GraphStatusResult`; a separate builder constructs `PositionalGraphReality` when needed.

**Rationale**:
- `GraphStatusResult` is a read model for status queries (CLI, UI)
- `PositionalGraphReality` is a decision model for orchestration
- Different consumers, different concerns

---

## Conceptual Model

```
┌─────────────────────────────────────────────────────────────┐
│                  PositionalGraphReality                     │
├─────────────────────────────────────────────────────────────┤
│ • graphSlug, version, snapshotAt                            │
│ • graphStatus: pending | in_progress | complete | failed    │
│ • lines: LineReality[]                                      │
│ • nodes: Map<nodeId, NodeReality>                           │
│ • questions: QuestionReality[]                              │
│ • podSessions: Map<nodeId, sessionId>                       │
├─────────────────────────────────────────────────────────────┤
│ Convenience Accessors                                       │
│ • currentLineIndex: number                                  │
│ • readyNodeIds: string[]                                    │
│ • runningNodeIds: string[]                                  │
│ • waitingQuestionNodeIds: string[]                          │
│ • pendingQuestions: QuestionReality[]                       │
│ • isComplete: boolean                                       │
│ • isFailed: boolean                                         │
└─────────────────────────────────────────────────────────────┘
           │
           ├── getNode(nodeId) → NodeReality | undefined
           ├── getLine(lineId) → LineReality | undefined
           ├── getLineByIndex(index) → LineReality | undefined
           ├── getNodesByLine(lineId) → NodeReality[]
           ├── getLeftNeighbor(nodeId) → NodeReality | undefined
           ├── getQuestion(questionId) → QuestionReality | undefined
           └── getPodSession(nodeId) → string | undefined
```

---

## Schema Definitions

### Core Types (TypeScript)

```typescript
// ============================================
// PositionalGraphReality — The Snapshot
// ============================================

export interface PositionalGraphReality {
  /** Graph identifier */
  readonly graphSlug: string;

  /** Graph version from graph.yaml */
  readonly version: string;

  /** ISO 8601 timestamp when snapshot was taken */
  readonly snapshotAt: string;

  /** Overall graph execution status */
  readonly graphStatus: 'pending' | 'in_progress' | 'complete' | 'failed';

  /** Lines in positional order (index = position) */
  readonly lines: readonly LineReality[];

  /** Nodes indexed by nodeId for O(1) lookup */
  readonly nodes: ReadonlyMap<string, NodeReality>;

  /** All questions (answered and pending) */
  readonly questions: readonly QuestionReality[];

  /** Pod session IDs indexed by nodeId (for session resumption) */
  readonly podSessions: ReadonlyMap<string, string>;

  // ── Convenience Accessors ──────────────────────

  /** Index of the first incomplete line (0 if all complete) */
  readonly currentLineIndex: number;

  /** Node IDs with status 'ready' */
  readonly readyNodeIds: readonly string[];

  /** Node IDs with status 'running' */
  readonly runningNodeIds: readonly string[];

  /** Node IDs with status 'waiting-question' */
  readonly waitingQuestionNodeIds: readonly string[];

  /** Node IDs with status 'blocked-error' */
  readonly blockedNodeIds: readonly string[];

  /** Node IDs with status 'complete' */
  readonly completedNodeIds: readonly string[];

  /** Questions that have not been answered */
  readonly pendingQuestions: readonly QuestionReality[];

  /** True if graphStatus === 'complete' */
  readonly isComplete: boolean;

  /** True if graphStatus === 'failed' */
  readonly isFailed: boolean;

  /** Total node count across all lines */
  readonly totalNodes: number;

  /** Count of completed nodes */
  readonly completedCount: number;
}

// ============================================
// LineReality — Per-Line State
// ============================================

export interface LineReality {
  /** Line identifier */
  readonly lineId: string;

  /** Position in graph (0-based) */
  readonly index: number;

  /** Optional label from graph.yaml */
  readonly label?: string;

  /** Transition mode: 'auto' or 'manual' */
  readonly transition: 'auto' | 'manual';

  /** True if manual transition has been triggered */
  readonly transitionTriggered: boolean;

  /** True if all nodes on this line are complete */
  readonly isComplete: boolean;

  /** True if line has no nodes */
  readonly isEmpty: boolean;

  /** True if at least one node can start */
  readonly canRun: boolean;

  /** True if all preceding lines are complete */
  readonly precedingLinesComplete: boolean;

  /** True if transition gate is open (auto=always, manual=after trigger) */
  readonly transitionOpen: boolean;

  /** Node IDs in positional order (left to right) */
  readonly nodeIds: readonly string[];
}

// ============================================
// NodeReality — Per-Node State
// ============================================

export interface NodeReality {
  /** Node identifier */
  readonly nodeId: string;

  /** Index of the line this node belongs to */
  readonly lineIndex: number;

  /** Position within the line (0-based, left to right) */
  readonly positionInLine: number;

  /** WorkUnit slug attached to this node */
  readonly unitSlug: string;

  /** WorkUnit type discriminator */
  readonly unitType: 'agent' | 'code' | 'user-input';

  /** Current execution status */
  readonly status: ExecutionStatus;

  /** Execution mode: 'serial' (waits for left) or 'parallel' (independent) */
  readonly execution: 'serial' | 'parallel';

  /** True if all four gates pass */
  readonly ready: boolean;

  /** Individual gate statuses */
  readonly readyDetail: ReadinessDetail;

  /** Resolved inputs (collateInputs result) */
  readonly inputPack: InputPack;

  /** ID of pending question (when status === 'waiting-question') */
  readonly pendingQuestionId?: string;

  /** Error details (when status === 'blocked-error') */
  readonly error?: NodeError;

  /** ISO 8601 when node started */
  readonly startedAt?: string;

  /** ISO 8601 when node completed */
  readonly completedAt?: string;
}

export type ExecutionStatus =
  | 'pending'           // Not started, not ready
  | 'ready'             // All gates pass, can start
  | 'running'           // In progress
  | 'waiting-question'  // Paused for question
  | 'blocked-error'     // Failed
  | 'complete';         // Done

export interface ReadinessDetail {
  /** Gate 1: All nodes on lines 0..N-1 are complete */
  readonly precedingLinesComplete: boolean;

  /** Gate 2: Manual transition triggered (or auto) */
  readonly transitionOpen: boolean;

  /** Gate 3: Left neighbor complete (serial only, parallel always true) */
  readonly serialNeighborComplete: boolean;

  /** Gate 4: All required inputs available */
  readonly inputsAvailable: boolean;

  /** WorkUnit loaded successfully */
  readonly unitFound: boolean;

  /** Human-readable reason if not ready */
  readonly reason?: string;
}

export interface NodeError {
  readonly code: string;
  readonly message: string;
  readonly occurredAt: string;
}

// ============================================
// QuestionReality — Q&A State
// ============================================

export interface QuestionReality {
  /** Unique question identifier */
  readonly questionId: string;

  /** Node that asked the question */
  readonly nodeId: string;

  /** Question type */
  readonly questionType: 'text' | 'single' | 'multi' | 'confirm';

  /** Question text */
  readonly text: string;

  /** Options for single/multi */
  readonly options?: readonly string[];

  /** Default value if any */
  readonly defaultValue?: string | boolean;

  /** ISO 8601 when asked */
  readonly askedAt: string;

  /** ISO 8601 when question was surfaced to user (via question-pending OR) */
  readonly surfacedAt?: string;

  /** True if question has been surfaced (emitted as question-pending) */
  readonly isSurfaced: boolean;

  /** Answer value (undefined if unanswered) */
  readonly answer?: unknown;

  /** ISO 8601 when answered */
  readonly answeredAt?: string;

  /** True if answer is present */
  readonly isAnswered: boolean;
}
```

### Zod Schemas

```typescript
import { z } from 'zod';

// ── ReadinessDetail ───────────────────────────────
export const ReadinessDetailSchema = z.object({
  precedingLinesComplete: z.boolean(),
  transitionOpen: z.boolean(),
  serialNeighborComplete: z.boolean(),
  inputsAvailable: z.boolean(),
  unitFound: z.boolean(),
  reason: z.string().optional(),
}).strict();

// ── NodeError ─────────────────────────────────────
export const NodeErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  occurredAt: z.string().datetime(),
}).strict();

// ── ExecutionStatus ───────────────────────────────
export const ExecutionStatusSchema = z.enum([
  'pending',
  'ready',
  'running',
  'waiting-question',
  'blocked-error',
  'complete',
]);

// ── NodeReality ───────────────────────────────────
export const NodeRealitySchema = z.object({
  nodeId: z.string().min(1),
  lineIndex: z.number().int().min(0),
  positionInLine: z.number().int().min(0),
  unitSlug: z.string().min(1),
  unitType: z.enum(['agent', 'code', 'user-input']),
  status: ExecutionStatusSchema,
  execution: z.enum(['serial', 'parallel']),
  ready: z.boolean(),
  readyDetail: ReadinessDetailSchema,
  inputPack: InputPackSchema, // From existing interface
  pendingQuestionId: z.string().optional(),
  error: NodeErrorSchema.optional(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
}).strict();

// ── LineReality ───────────────────────────────────
export const LineRealitySchema = z.object({
  lineId: z.string().min(1),
  index: z.number().int().min(0),
  label: z.string().optional(),
  transition: z.enum(['auto', 'manual']),
  transitionTriggered: z.boolean(),
  isComplete: z.boolean(),
  isEmpty: z.boolean(),
  canRun: z.boolean(),
  precedingLinesComplete: z.boolean(),
  transitionOpen: z.boolean(),
  nodeIds: z.array(z.string()),
}).strict();

// ── QuestionReality ───────────────────────────────
export const QuestionRealitySchema = z.object({
  questionId: z.string().min(1),
  nodeId: z.string().min(1),
  questionType: z.enum(['text', 'single', 'multi', 'confirm']),
  text: z.string().min(1),
  options: z.array(z.string()).optional(),
  defaultValue: z.union([z.string(), z.boolean()]).optional(),
  askedAt: z.string().datetime(),
  surfacedAt: z.string().datetime().optional(),
  isSurfaced: z.boolean(),
  answer: z.unknown().optional(),
  answeredAt: z.string().datetime().optional(),
  isAnswered: z.boolean(),
}).strict();

// ── PositionalGraphReality (top-level) ────────────
// Note: Map fields serialized as arrays for persistence
export const PositionalGraphRealitySchema = z.object({
  graphSlug: z.string().regex(/^[a-z][a-z0-9-]*$/),
  version: z.string(),
  snapshotAt: z.string().datetime(),
  graphStatus: z.enum(['pending', 'in_progress', 'complete', 'failed']),
  lines: z.array(LineRealitySchema),
  nodes: z.array(NodeRealitySchema), // Serialized from Map
  questions: z.array(QuestionRealitySchema),
  podSessions: z.array(z.tuple([z.string(), z.string()])), // [nodeId, sessionId]

  // Convenience (computed, but stored for direct JSON use)
  currentLineIndex: z.number().int().min(0),
  readyNodeIds: z.array(z.string()),
  runningNodeIds: z.array(z.string()),
  waitingQuestionNodeIds: z.array(z.string()),
  blockedNodeIds: z.array(z.string()),
  completedNodeIds: z.array(z.string()),
  pendingQuestions: z.array(QuestionRealitySchema),
  isComplete: z.boolean(),
  isFailed: z.boolean(),
  totalNodes: z.number().int().min(0),
  completedCount: z.number().int().min(0),
}).strict();
```

---

## Builder: `buildPositionalGraphReality()`

### Interface

```typescript
export interface BuildRealityOptions {
  /** Existing GraphStatusResult (from getStatus) */
  statusResult: GraphStatusResult;

  /** State from state.json */
  state: State;

  /** Pod sessions tracked in memory or persisted */
  podSessions?: Map<string, string>;

  /** Timestamp override for testing */
  snapshotAt?: string;
}

export function buildPositionalGraphReality(
  options: BuildRealityOptions
): PositionalGraphReality;
```

### Implementation

```typescript
import { GraphStatusResult, State } from '../interfaces/index.js';

export function buildPositionalGraphReality(
  options: BuildRealityOptions
): PositionalGraphReality {
  const { statusResult, state, podSessions = new Map(), snapshotAt } = options;
  const now = snapshotAt ?? new Date().toISOString();

  // ── Build lines ─────────────────────────────────
  const lines: LineReality[] = statusResult.lines.map((ls) => ({
    lineId: ls.lineId,
    index: ls.index,
    label: ls.label,
    transition: ls.transition,
    transitionTriggered: ls.transitionTriggered,
    isComplete: ls.complete,
    isEmpty: ls.empty,
    canRun: ls.canRun,
    precedingLinesComplete: ls.precedingLinesComplete,
    transitionOpen: ls.transitionOpen,
    nodeIds: ls.nodes.map((n) => n.nodeId),
  }));

  // ── Build nodes map ─────────────────────────────
  const nodes = new Map<string, NodeReality>();
  for (const ls of statusResult.lines) {
    for (const ns of ls.nodes) {
      // Determine unitType from WorkUnit (requires lookup or stored)
      // For now, we rely on statusResult containing this info
      const unitType = inferUnitType(ns.unitSlug); // See below

      nodes.set(ns.nodeId, {
        nodeId: ns.nodeId,
        lineIndex: ls.index,
        positionInLine: ns.position,
        unitSlug: ns.unitSlug,
        unitType,
        status: ns.status,
        execution: ns.execution,
        ready: ns.ready,
        readyDetail: {
          precedingLinesComplete: ns.readyDetail.precedingLinesComplete,
          transitionOpen: ns.readyDetail.transitionOpen,
          serialNeighborComplete: ns.readyDetail.serialNeighborComplete,
          inputsAvailable: ns.readyDetail.inputsAvailable,
          unitFound: ns.readyDetail.unitFound,
          reason: ns.readyDetail.reason,
        },
        inputPack: ns.inputPack,
        pendingQuestionId: ns.pendingQuestion?.questionId,
        error: ns.error
          ? { code: ns.error.code, message: ns.error.message, occurredAt: ns.error.occurredAt }
          : undefined,
        startedAt: ns.startedAt,
        completedAt: ns.completedAt,
      });
    }
  }

  // ── Build questions ─────────────────────────────
  const questions: QuestionReality[] = (state.questions ?? []).map((q) => ({
    questionId: q.question_id,
    nodeId: q.node_id,
    questionType: q.type,
    text: q.text,
    options: q.options,
    defaultValue: q.default,
    askedAt: q.asked_at,
    surfacedAt: q.surfaced_at,
    isSurfaced: q.surfaced_at !== undefined,
    answer: q.answer,
    answeredAt: q.answered_at,
    isAnswered: q.answer !== undefined,
  }));

  // ── Compute convenience accessors ───────────────
  const currentLineIndex = lines.findIndex((l) => !l.isComplete);
  const readyNodeIds = statusResult.readyNodes;
  const runningNodeIds = statusResult.runningNodes;
  const waitingQuestionNodeIds = statusResult.waitingQuestionNodes;
  const blockedNodeIds = statusResult.blockedNodes;
  const completedNodeIds = statusResult.completedNodeIds;
  const pendingQuestions = questions.filter((q) => !q.isAnswered);

  return {
    graphSlug: statusResult.graphSlug,
    version: statusResult.version,
    snapshotAt: now,
    graphStatus: statusResult.status,
    lines,
    nodes,
    questions,
    podSessions,

    currentLineIndex: currentLineIndex === -1 ? 0 : currentLineIndex,
    readyNodeIds,
    runningNodeIds,
    waitingQuestionNodeIds,
    blockedNodeIds,
    completedNodeIds,
    pendingQuestions,
    isComplete: statusResult.status === 'complete',
    isFailed: statusResult.status === 'failed',
    totalNodes: statusResult.totalNodes,
    completedCount: statusResult.completedNodes,
  };
}
```

---

## Lookup Methods (Class Wrapper)

For ergonomic access, wrap in a class:

```typescript
export class PositionalGraphRealityView {
  constructor(private readonly reality: PositionalGraphReality) {}

  /** Get node by ID */
  getNode(nodeId: string): NodeReality | undefined {
    return this.reality.nodes.get(nodeId);
  }

  /** Get line by ID */
  getLine(lineId: string): LineReality | undefined {
    return this.reality.lines.find((l) => l.lineId === lineId);
  }

  /** Get line by index */
  getLineByIndex(index: number): LineReality | undefined {
    return this.reality.lines[index];
  }

  /** Get all nodes on a line */
  getNodesByLine(lineId: string): NodeReality[] {
    const line = this.getLine(lineId);
    if (!line) return [];
    return line.nodeIds
      .map((id) => this.reality.nodes.get(id))
      .filter((n): n is NodeReality => n !== undefined);
  }

  /** Get left neighbor (previous serial node on same line) */
  getLeftNeighbor(nodeId: string): NodeReality | undefined {
    const node = this.getNode(nodeId);
    if (!node || node.positionInLine === 0) return undefined;
    const line = this.reality.lines[node.lineIndex];
    const leftId = line.nodeIds[node.positionInLine - 1];
    return this.reality.nodes.get(leftId);
  }

  /** Get first agent node on previous line (for context inheritance) */
  getFirstAgentOnPreviousLine(nodeId: string): NodeReality | undefined {
    const node = this.getNode(nodeId);
    if (!node || node.lineIndex === 0) return undefined;
    const prevLine = this.reality.lines[node.lineIndex - 1];
    for (const nid of prevLine.nodeIds) {
      const n = this.reality.nodes.get(nid);
      if (n && n.unitType === 'agent') return n;
    }
    return undefined;
  }

  /** Get question by ID */
  getQuestion(questionId: string): QuestionReality | undefined {
    return this.reality.questions.find((q) => q.questionId === questionId);
  }

  /** Get pod session ID for a node */
  getPodSession(nodeId: string): string | undefined {
    return this.reality.podSessions.get(nodeId);
  }

  /** Check if node is first in its line */
  isFirstInLine(nodeId: string): boolean {
    const node = this.getNode(nodeId);
    return node !== undefined && node.positionInLine === 0;
  }

  /** Get current line (first incomplete) */
  getCurrentLine(): LineReality | undefined {
    return this.reality.lines[this.reality.currentLineIndex];
  }

  /** Underlying data */
  get data(): PositionalGraphReality {
    return this.reality;
  }
}
```

---

## ONBAS Walk Algorithm

This section shows how the Next Best Action Service walks `PositionalGraphReality` to determine what happens next. The walk is **pure** — no side effects, no async, just data in → decision out.

### The Walk

ONBAS visits **each node** in positional order, checking if that node needs action. When it finds one, it returns an `OrchestrationRequest` and stops. The orchestrator executes the request, rebuilds the snapshot, and calls ONBAS again.

```
┌─────────────────────────────────────────────────────────────┐
│                         WALK LOOP                           │
└─────────────────────────────────────────────────────────────┘

for each line in order (0, 1, 2, ...):
  │
  ├─► Check: line.transitionOpen?
  │     no  → return OR { type: 'no-action', reason: 'transition-blocked' }
  │     yes → continue
  │
  ├─► for each node in position order (0, 1, 2, ...):
  │     │
  │     ├─► visit(node) → action?
  │     │     yes → return OR and STOP
  │     │     no  → continue to next node
  │     │
  │     └─► (end of nodes on this line)
  │
  └─► Check: line.isComplete?
        no  → return OR { type: 'no-action' }  // Can't proceed past incomplete line
        yes → continue to next line

// All lines walked and complete, no action found
return OR { type: 'no-action' }
```

### Per-Node Visit Logic

Each node is visited and checked for actionable state:

```
visit(node) → OrchestrationRequest | null

┌──────────────────────┬─────────────────────────────────────────────────┐
│ node.status          │ Action                                          │
├──────────────────────┼─────────────────────────────────────────────────┤
│ 'complete'           │ No action. Continue walk.                       │
├──────────────────────┼─────────────────────────────────────────────────┤
│ 'running'            │ No action (for now). Continue walk.             │
│                      │ Future: may check timeout, progress, etc.       │
├──────────────────────┼─────────────────────────────────────────────────┤
│ 'waiting-question'   │ Check question state:                           │
│                      │   isAnswered    → OR { type: 'resume-node' }    │
│                      │   !isSurfaced   → OR { type: 'question-pending' │
│                      │                    (ODS marks surfaced)         │
│                      │   isSurfaced    → No action. Continue walk.     │
│                      │                    (waiting for user answer)    │
├──────────────────────┼─────────────────────────────────────────────────┤
│ 'blocked-error'      │ No action. Continue walk.                       │
├──────────────────────┼─────────────────────────────────────────────────┤
│ 'ready'              │ OR { type: 'start-node', inputs }               │
├──────────────────────┼─────────────────────────────────────────────────┤
│ 'pending'            │ No action (gates not satisfied). Continue walk. │
└──────────────────────┴─────────────────────────────────────────────────┘
```

### Implementation

```typescript
import type { PositionalGraphReality, NodeReality, QuestionReality } from './reality.types.js';
import type { OrchestrationRequest } from './orchestration-request.types.js';

/**
 * Walk the graph reality node-by-node and determine the next action.
 * Pure function: no side effects, no async.
 */
export function walkForNextAction(
  reality: PositionalGraphReality
): OrchestrationRequest {
  const { graphSlug } = reality;

  // Walk each line in order
  for (const line of reality.lines) {

    // ── Gate check: can we enter this line? ───────
    if (!line.transitionOpen) {
      return {
        type: 'no-action',
        graphSlug,
        reason: 'transition-blocked',
        lineId: line.lineId,
      };
    }

    // ── Visit each node on this line ──────────────
    for (const nodeId of line.nodeIds) {
      const node = reality.nodes.get(nodeId)!;
      const action = visitNode(reality, node);
      if (action) {
        return action;
      }
    }

    // ── Line complete check: can we proceed? ──────
    if (!line.isComplete) {
      // Can't proceed past an incomplete line
      return {
        type: 'no-action',
        graphSlug,
      };
    }
  }

  // All lines walked and complete, no action found
  return {
    type: 'no-action',
    graphSlug,
  };
}

/**
 * Visit a single node and determine if it needs action.
 */
function visitNode(
  reality: PositionalGraphReality,
  node: NodeReality
): OrchestrationRequest | null {
  const { graphSlug } = reality;

  switch (node.status) {
    case 'complete':
      // Done, nothing to do
      return null;

    case 'running':
      // In progress, nothing to do (for now)
      // Future: could check for timeout, heartbeat, etc.
      return null;

    case 'waiting-question': {
      // Find the question for this node
      const question = reality.questions.find(
        (q) => q.questionId === node.pendingQuestionId
      );

      if (!question) {
        // Shouldn't happen, but defensive
        return null;
      }

      if (question.isAnswered) {
        // Answer received, node needs to resume
        return {
          type: 'resume-node',
          graphSlug,
          nodeId: node.nodeId,
          questionId: question.questionId,
          answer: question.answer,
        };
      } else if (!question.isSurfaced) {
        // Question not yet surfaced to user — emit it
        // ODS will mark the question as surfaced
        return {
          type: 'question-pending',
          graphSlug,
          nodeId: node.nodeId,
          questionId: question.questionId,
          questionText: question.text,
          questionType: question.questionType,
          options: question.options,
        };
      } else {
        // Question surfaced, waiting for user answer
        // Continue walk — parallel nodes may still be actionable
        return null;
      }
    }

    case 'blocked-error':
      // Failed, can't do anything with this node
      return null;

    case 'ready':
      // Ready to start
      return {
        type: 'start-node',
        graphSlug,
        nodeId: node.nodeId,
        inputs: node.inputPack,
      };

    case 'pending':
      // Not ready yet (gates not satisfied)
      return null;

    default:
      return null;
  }
}
```

### Orchestration Loop

The orchestrator calls ONBAS in a loop, executing each request before asking for the next:

```
┌─────────────────────────────────────────────────────────────┐
│                    ORCHESTRATION LOOP                       │
└─────────────────────────────────────────────────────────────┘

loop:
  1. Build PositionalGraphReality snapshot
  2. Call walkForNextAction(reality) → OR
  3. Switch on OR.type:
       'start-node'       → ODS starts the node
       'resume-node'      → ODS resumes node with answer
       'question-pending' → Surface question to user, PAUSE loop
       'no-action'        → EXIT loop (nothing to do)
  4. Go to step 1
```

### Example: Serial Execution

```
Graph: Line 0 [node-A] → Line 1 [node-B → node-C]

Initial state: all pending

Loop 1:
  Walk line 0 → visit node-A (ready) → OR: start-node A
  ODS starts A → A now 'running'

Loop 2:
  Walk line 0 → visit node-A (running) → no action
  Line 0 not complete → stop walk
  → OR: no-action

  [Agent A completes externally]

Loop 3:
  Walk line 0 → visit node-A (complete) → no action
  Line 0 complete → continue to line 1
  Walk line 1 → visit node-B (ready) → OR: start-node B
  ODS starts B → B now 'running'

Loop 4:
  Walk line 0 → node-A complete
  Walk line 1 → node-B running → no action, node-C pending (serial, waiting for B)
  Line 1 not complete → stop walk
  → OR: no-action

  [Agent B completes]

Loop 5:
  Walk line 1 → node-B complete, node-C ready → OR: start-node C
  ...
```

### Example: Parallel Execution

```
Graph: Line 0 [node-A (serial), node-B (parallel), node-C (parallel)]

Loop 1:
  Visit node-A (ready) → OR: start-node A

Loop 2:
  Visit node-A (running) → no action
  Visit node-B (ready, parallel) → OR: start-node B

Loop 3:
  Visit node-A (running) → no action
  Visit node-B (running) → no action
  Visit node-C (ready, parallel) → OR: start-node C

Loop 4:
  All running → OR: no-action
```

### Example: Question Flow

```
Graph: Line 0 [node-A]

Loop 1:
  Visit node-A (ready) → OR: start-node A
  ODS starts A

  [Agent asks question "Which approach?"]
  Node A → 'waiting-question', question stored (not surfaced)

Loop 2:
  Visit node-A (waiting-question, not surfaced)
  → OR: question-pending { questionId: 'q-001', text: 'Which approach?' }
  ODS marks question as surfaced

Loop 3:
  Visit node-A (waiting-question, surfaced but not answered) → no action
  Line 0 not complete → stop walk
  → OR: no-action

  [User answers "Option B"]
  Question marked as answered

Loop 4:
  Visit node-A (waiting-question, IS answered)
  → OR: resume-node { nodeId: 'node-A', answer: 'Option B' }
  ODS resumes node A with answer
  Node A → 'running'

Loop 5:
  Visit node-A (running) → no action
  → OR: no-action
```

### Example: Question with Parallel Node

```
Graph: Line 0 [node-A (serial), node-B (parallel)]

Loop 1:
  Visit node-A (ready) → OR: start-node A

Loop 2:
  Visit node-A (running) → no action
  Visit node-B (ready, parallel) → OR: start-node B

  [Agent A asks question "Which approach?"]

Loop 3:
  Visit node-A (waiting-question, not surfaced)
  → OR: question-pending { questionId: 'q-001' }
  ODS marks question surfaced

Loop 4:
  Visit node-A (waiting-question, surfaced) → no action, continue walk
  Visit node-B (running) → no action
  Line 0 not complete → stop walk
  → OR: no-action

  [Node B completes]

Loop 5:
  Visit node-A (waiting-question, surfaced) → no action
  Visit node-B (complete) → no action
  Line 0 not complete (A still waiting) → stop walk
  → OR: no-action

  [User answers question]

Loop 6:
  Visit node-A (waiting-question, answered)
  → OR: resume-node A
```

### Example: Transition Gate

```
Graph: Line 0 [node-A] (transition: manual) → Line 1 [node-B]

Loop 1:
  Walk line 0 → node-A (ready) → OR: start-node A

  [A completes]

Loop 2:
  Walk line 0 → node-A (complete)
  Walk line 1 → transitionOpen = false
  → OR: no-action { reason: 'transition-blocked', lineId: 'line-000' }

  [User triggers transition]

Loop 3:
  Walk line 0 → node-A (complete)
  Walk line 1 → transitionOpen = true → node-B (ready)
  → OR: start-node B
```

### OrchestrationRequest Types Summary

| Type | When | Payload |
|------|------|---------|
| `start-node` | Node is ready | `nodeId`, `inputs` |
| `resume-node` | Question answered, node waiting | `nodeId`, `questionId`, `answer` |
| `question-pending` | Node waiting, question not yet surfaced | `nodeId`, `questionId`, `questionText`, `options` |
| `no-action` | Nothing actionable | `reason?`, `lineId?` (if transition-blocked) |

**Note**: Once `question-pending` is emitted, ODS marks the question as surfaced. Subsequent loops skip past that node (continuing the walk) until the question is answered.

---

## Usage Examples

### Building from Service

```typescript
// In orchestrator
const statusResult = await graphService.getStatus(ctx, graphSlug);
const state = await adapter.loadState(ctx, graphSlug);

const reality = buildPositionalGraphReality({
  statusResult,
  state,
  podSessions: podManager.getSessions(graphSlug),
});

const view = new PositionalGraphRealityView(reality);

// Find next action
if (reality.isComplete) {
  return { type: 'complete', graphSlug, allNodesComplete: true };
}

const firstReady = reality.readyNodeIds[0];
if (firstReady) {
  const node = view.getNode(firstReady)!;
  return { type: 'start-node', graphSlug, nodeId: firstReady, inputs: node.inputPack };
}
```

### Testing (Fake Reality)

```typescript
// In tests — construct directly without filesystem
const reality: PositionalGraphReality = {
  graphSlug: 'test-graph',
  version: '1.0.0',
  snapshotAt: '2026-02-05T10:00:00Z',
  graphStatus: 'in_progress',
  lines: [
    {
      lineId: 'line-001',
      index: 0,
      transition: 'auto',
      transitionTriggered: false,
      isComplete: true,
      isEmpty: false,
      canRun: false,
      precedingLinesComplete: true,
      transitionOpen: true,
      nodeIds: ['node-001'],
    },
    {
      lineId: 'line-002',
      index: 1,
      transition: 'auto',
      transitionTriggered: false,
      isComplete: false,
      isEmpty: false,
      canRun: true,
      precedingLinesComplete: true,
      transitionOpen: true,
      nodeIds: ['node-002', 'node-003'],
    },
  ],
  nodes: new Map([
    ['node-001', {
      nodeId: 'node-001',
      lineIndex: 0,
      positionInLine: 0,
      unitSlug: 'user-prompt',
      unitType: 'user-input',
      status: 'complete',
      execution: 'serial',
      ready: false,
      readyDetail: {
        precedingLinesComplete: true,
        transitionOpen: true,
        serialNeighborComplete: true,
        inputsAvailable: true,
        unitFound: true,
      },
      inputPack: { inputs: {}, ok: true },
      completedAt: '2026-02-05T09:55:00Z',
    }],
    ['node-002', {
      nodeId: 'node-002',
      lineIndex: 1,
      positionInLine: 0,
      unitSlug: 'spec-builder',
      unitType: 'agent',
      status: 'ready',
      execution: 'serial',
      ready: true,
      readyDetail: {
        precedingLinesComplete: true,
        transitionOpen: true,
        serialNeighborComplete: true,
        inputsAvailable: true,
        unitFound: true,
      },
      inputPack: { inputs: {}, ok: true },
    }],
    // ... more nodes
  ]),
  questions: [],
  podSessions: new Map(),

  // Convenience
  currentLineIndex: 1,
  readyNodeIds: ['node-002'],
  runningNodeIds: [],
  waitingQuestionNodeIds: [],
  blockedNodeIds: [],
  completedNodeIds: ['node-001'],
  pendingQuestions: [],
  isComplete: false,
  isFailed: false,
  totalNodes: 2,
  completedCount: 1,
};

// Test ONBAS pure logic
const request = onbas.getNextAction(reality);
expect(request.type).toBe('start-node');
expect(request.nodeId).toBe('node-002');
```

---

## Serialization (Persistence)

For pod session persistence across restarts:

```typescript
// Serialize for JSON storage
function serializeReality(reality: PositionalGraphReality): object {
  return {
    ...reality,
    nodes: Array.from(reality.nodes.values()),
    podSessions: Array.from(reality.podSessions.entries()),
  };
}

// Deserialize from JSON storage
function deserializeReality(data: unknown): PositionalGraphReality {
  const parsed = PositionalGraphRealitySchema.parse(data);
  return {
    ...parsed,
    nodes: new Map(parsed.nodes.map((n) => [n.nodeId, n])),
    podSessions: new Map(parsed.podSessions),
  };
}
```

---

## Open Questions

### Q1: Should `unitType` be resolved at snapshot time or deferred?

**RESOLVED**: Resolve at snapshot time. The builder calls `workUnitService.load()` or uses cached type info from `NodeStatusResult`. This keeps ONBAS pure — no async lookups during decision logic.

If performance becomes an issue, `NodeStatusResult` can be extended to include `unitType` directly.

### Q2: Should `podSessions` be in `PositionalGraphReality` or a separate `PodState`?

**RESOLVED**: Include in `PositionalGraphReality`. Pod sessions are essential for:
- Deciding whether to `continue-agent` vs `start-node`
- Context inheritance lookup

Keeping them in the snapshot ensures ONBAS has everything it needs.

### Q3: How do we handle `unitType` not being in `NodeStatusResult`?

**OPEN**: Current `NodeStatusResult` does not include `unitType`. Options:
1. Extend `NodeStatusResult` to include `unitType` (minor schema change)
2. Builder calls `workUnitService.load()` for each node (expensive)
3. Builder uses a preloaded `Map<unitSlug, unitType>` passed as option

**Recommendation**: Option 1 — add `unitType` to `NodeStatusResult`. It's a natural field and avoids async complexity in builder.

### Q4: State schema needs `surfaced_at` on questions

**RESOLVED**: The existing `QuestionSchema` in `state.schema.ts` needs a new optional field:

```typescript
surfaced_at: z.string().datetime().optional(),
```

This tracks when ONBAS first emitted a `question-pending` OR for this question. ODS sets this when handling `question-pending`. Without it, ONBAS would re-emit the question every loop.

---

## Relationship to Other Workshops

| Workshop | Relationship |
|----------|--------------|
| **OrchestrationRequest** | ONBAS returns OR based on PositionalGraphReality |
| **ONBAS** | Consumes PositionalGraphReality, produces OrchestrationRequest |
| **AgentContextService** | Uses PositionalGraphRealityView to find context source nodes |
| **WorkUnitPods** | Pod sessions stored in podSessions map |
| **ODS** | May update PositionalGraphReality after execution (or re-snapshot) |

---

## File Location

```
packages/positional-graph/
└── src/
    └── features/030-orchestration/
        ├── reality.schema.ts        # Zod schemas
        ├── reality.types.ts         # TypeScript interfaces
        ├── reality.builder.ts       # buildPositionalGraphReality()
        └── reality.view.ts          # PositionalGraphRealityView class
```

---

## Implementation Checklist

- [ ] Add `unitType` field to `NodeStatusResult` in interface
- [ ] Create `reality.types.ts` with all interfaces
- [ ] Create `reality.schema.ts` with Zod schemas
- [ ] Create `reality.builder.ts` with `buildPositionalGraphReality()`
- [ ] Create `reality.view.ts` with `PositionalGraphRealityView` class
- [ ] Add tests: `reality.builder.test.ts`, `reality.view.test.ts`
- [ ] Export from feature index

---

## Glossary

| Term | Expansion | Definition |
|------|-----------|------------|
| **OR** | OrchestrationRequest | Discriminated union type representing the next action for the orchestrator. Four variants: `start-node`, `resume-node`, `question-pending`, `no-action`. |
| **ONBAS** | OrchestrationNextBestActionService | Pure-function rules engine that walks a `PositionalGraphReality` snapshot and returns an `OrchestrationRequest`. The "brain" of the orchestrator. |
| **ODS** | OrchestrationDoerService | Executor that consumes an `OrchestrationRequest` and performs the action — starting pods, surfacing questions, resuming nodes, updating state. |
| **Reality** | PositionalGraphReality | Read-only snapshot of the entire graph state at a moment in time. Input to ONBAS. Built from `getStatus()` + `state.json` + pod sessions. |
| **Pod** | WorkUnitPod | Ephemeral execution container that wraps a single node's agent adapter or script runner. Manages session tracking and question relay. |
| **PodManager** | IPodManager | Per-graph registry that creates/tracks/destroys pods and persists session IDs across restarts in `pod-sessions.json`. |
| **FakePod** | — | Test double for `IWorkUnitPod` with configurable deterministic behavior (complete, question, error). |
| **NodeReality** | — | Per-node snapshot within `PositionalGraphReality`: status, readiness, inputs, position, pending question. |
| **LineReality** | — | Per-line snapshot within `PositionalGraphReality`: transition state, completeness, node list. |
| **QuestionReality** | — | Per-question snapshot: asked/surfaced/answered state, text, options. |
| **InputPack** | — | Collated input data for a node, resolved from upstream outputs. `{ ok: boolean, inputs: Record<string, InputEntry> }`. |
| **WorkUnit** | — | Declarative definition of what a node does: prompt template (agent), script (code), or question (user-input). |

---

## Summary

`PositionalGraphReality` is a **read-only snapshot** capturing the complete state of a positional graph at a moment in time. It:

1. **Wraps** existing `GraphStatusResult` + `State` + pod sessions
2. **Adds** convenience accessors (currentLineIndex, readyNodeIds, etc.)
3. **Enables TDD** — tests construct snapshots directly without filesystem
4. **Keeps ONBAS pure** — no async, no side effects, just data → decision

The builder function translates from existing service outputs to the snapshot format. The view class provides ergonomic lookup methods. Both are designed for composition, not inheritance.
