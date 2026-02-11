# Workshop: OrchestrationNextBestActionService (ONBAS)

**Type**: Integration Pattern
**Plan**: 030-positional-orchestrator
**Spec**: [research-dossier.md](../research-dossier.md)
**Created**: 2026-02-05
**Status**: Draft

**Related Documents**:
- [workshops.md](../workshops.md) — Workshop index
- [positional-graph-reality.md](01-positional-graph-reality.md) — Snapshot input (consumed by ONBAS)
- [orchestration-request.md](02-orchestration-request.md) — Output type (produced by ONBAS)
- [agent-context-service.md](03-agent-context-service.md) — Separate concern, not ONBAS's problem
- [work-unit-pods.md](04-work-unit-pods.md) — Pod lifecycle (ODS's problem, not ONBAS's)
- [research-dossier.md](../research-dossier.md) — IOrchestrationNextBestActionService proposed contract

---

## Purpose

Define the rules engine that walks a `PositionalGraphReality` snapshot and produces an `OrchestrationRequest`. ONBAS is the brain of the orchestrator — it answers "what should happen next?" without performing any side effects.

**What ONBAS Is**:
- A **pure function** — `walkForNextAction(reality) → OrchestrationRequest`
- **Stateless** — receives complete reality, returns complete request
- **Synchronous** — no async, no I/O, no adapter calls
- **Deterministic** — same reality always produces same request

**What ONBAS Is Not**:
- Not responsible for executing actions (that's ODS)
- Not responsible for context inheritance (that's AgentContextService)
- Not responsible for pod management (that's PodManager)
- Not responsible for computing node readiness (that's done when building PositionalGraphReality)

## Key Questions Addressed

- What is the exact walk algorithm?
- What order are nodes visited?
- How do we handle questions that are surfaced but unanswered (skip past)?
- How do we find parallel nodes that can start even when serial siblings are running?
- When should ONBAS return `no-action` and what reason should it report?
- How do we handle edge cases: empty lines, failed graphs, all blocked?
- What does the service interface look like?
- How is ONBAS tested with fake reality snapshots?

---

## Design Principles

### 1. Single Responsibility: Next Action Only

ONBAS does one thing: scan the graph and return the first actionable request. It does not:
- Execute the action
- Compute readiness gates (already done by `buildPositionalGraphReality`)
- Look up session IDs or context sources
- Modify any state

### 2. First-Match Walk

The walk visits nodes in **positional order** (line 0 → line N, position 0 → position N within each line). When it finds the first actionable node, it returns immediately. The orchestration loop handles one action at a time:

```
ONBAS returns → ODS executes → State updated → Reality rebuilt → ONBAS returns again
```

### 3. Readiness Is Pre-Computed

The `PositionalGraphReality` snapshot already contains each node's `status` and `ready` boolean. ONBAS does not re-evaluate gates — it trusts the snapshot.

- `status === 'ready'` means all gates passed at snapshot time
- `status === 'pending'` means one or more gates failed
- Other statuses (`running`, `waiting-question`, `blocked-error`, `complete`) are from stored state

### 4. Graph-Level Short Circuits

Before walking nodes, ONBAS checks graph-level conditions:
- Graph already complete → `no-action` with `graph-complete`
- Graph failed → `no-action` with `graph-failed`

### 5. Enrich NoActionReason

When no action is found, ONBAS provides a reason to aid debugging. The reason is computed at the end of the walk by examining what stopped progress.

---

## Service Interface

```typescript
/**
 * Determines the next best action for a positional graph.
 *
 * Pure function: no side effects, no async, no I/O.
 * Takes a snapshot, returns a request.
 */
export interface IOrchestrationNextBestActionService {
  /**
   * Walk the graph reality and return the next action.
   *
   * @param reality - Complete graph snapshot
   * @returns The next orchestration request
   */
  getNextAction(reality: PositionalGraphReality): OrchestrationRequest;
}
```

### Why an Interface?

Even though ONBAS is a pure function, wrapping it in an interface enables:
- DI registration for ODS to depend on
- Test substitution (FakeONBAS that returns pre-configured results)
- Future extension (e.g., pluggable walk strategies)

### Functional Export

For direct use in tests and simple orchestrators:

```typescript
/**
 * Walk the graph reality node-by-node and determine the next action.
 * Pure function: no side effects, no async.
 */
export function walkForNextAction(
  reality: PositionalGraphReality
): OrchestrationRequest;
```

Both the class and the function share the same implementation.

---

## Walk Algorithm

### Overview

```
walkForNextAction(reality)
        │
        ▼
   ┌─────────────────┐
   │ Graph-level      │
   │ short circuits   │
   │ (complete/failed)│
   └─────────────────┘
        │ (not short-circuited)
        ▼
   ┌─────────────────┐
   │ Walk lines       │──► For each line in order (0, 1, 2, ...)
   │ in order         │
   └─────────────────┘
        │
        ▼
   ┌─────────────────┐
   │ Per line:        │
   │ 1. Check gate    │──► transitionOpen?
   │ 2. Visit nodes   │──► For each node in position order
   │ 3. Check done    │──► line.isComplete?
   └─────────────────┘
        │
        ▼
   ┌─────────────────┐
   │ Walk complete:   │
   │ Determine reason │──► no-action with enriched reason
   └─────────────────┘
```

### Detailed Algorithm

```typescript
export function walkForNextAction(
  reality: PositionalGraphReality
): OrchestrationRequest {
  const { graphSlug } = reality;

  // ── Short circuit: graph-level states ──────────
  if (reality.isComplete) {
    return {
      type: 'no-action',
      graphSlug,
      reason: 'graph-complete',
    };
  }

  if (reality.isFailed) {
    return {
      type: 'no-action',
      graphSlug,
      reason: 'graph-failed',
    };
  }

  // ── Walk each line in positional order ─────────
  for (const line of reality.lines) {

    // Gate: can we enter this line?
    if (!line.transitionOpen) {
      return {
        type: 'no-action',
        graphSlug,
        reason: 'transition-blocked',
        lineId: line.lineId,
      };
    }

    // Visit each node on this line in position order
    for (const nodeId of line.nodeIds) {
      const node = reality.nodes.get(nodeId)!;
      const action = visitNode(reality, node);
      if (action) {
        return action;
      }
    }

    // Can we proceed to the next line?
    if (!line.isComplete) {
      // Can't proceed past an incomplete line.
      // Determine why we're stuck.
      return {
        type: 'no-action',
        graphSlug,
        reason: diagnoseStuckLine(reality, line),
      };
    }
  }

  // All lines walked and complete — nothing else to do
  return {
    type: 'no-action',
    graphSlug,
    reason: 'graph-complete',
  };
}
```

### Per-Node Visit Logic

```typescript
/**
 * Visit a single node and determine if it needs action.
 * Returns an OR if actionable, null to continue walk.
 */
function visitNode(
  reality: PositionalGraphReality,
  node: NodeReality
): OrchestrationRequest | null {
  const { graphSlug } = reality;

  switch (node.status) {
    case 'complete':
      return null;

    case 'running':
      return null;

    case 'waiting-question':
      return visitWaitingQuestion(reality, node);

    case 'blocked-error':
      return null;

    case 'ready':
      return {
        type: 'start-node',
        graphSlug,
        nodeId: node.nodeId,
        inputs: node.inputPack,
      };

    case 'pending':
      return null;

    default:
      return null;
  }
}
```

### Question Visit Logic

```typescript
/**
 * Handle a node in waiting-question status.
 *
 * Three sub-states:
 * 1. Question answered → resume-node
 * 2. Question not surfaced → question-pending
 * 3. Question surfaced, awaiting answer → skip (continue walk)
 */
function visitWaitingQuestion(
  reality: PositionalGraphReality,
  node: NodeReality
): OrchestrationRequest | null {
  const { graphSlug } = reality;

  // Find the pending question
  const question = node.pendingQuestionId
    ? reality.questions.find((q) => q.questionId === node.pendingQuestionId)
    : undefined;

  // Defensive: no question found
  if (!question) {
    // Node says waiting-question but question is missing.
    // This is a data integrity issue. Skip the node.
    return null;
  }

  // Sub-state 1: Question has been answered
  if (question.isAnswered) {
    return {
      type: 'resume-node',
      graphSlug,
      nodeId: node.nodeId,
      questionId: question.questionId,
      answer: question.answer,
    };
  }

  // Sub-state 2: Question not yet surfaced to user
  if (!question.isSurfaced) {
    return {
      type: 'question-pending',
      graphSlug,
      nodeId: node.nodeId,
      questionId: question.questionId,
      questionText: question.text,
      questionType: question.questionType,
      options: question.options,
      defaultValue: question.defaultValue,
    };
  }

  // Sub-state 3: Question surfaced, waiting for user answer
  // Nothing to do — continue walk (parallel nodes may be actionable)
  return null;
}
```

### Stuck Line Diagnosis

When the walk encounters an incomplete line with no actionable nodes, ONBAS enriches the `no-action` reason:

```typescript
/**
 * Determine why a line is stuck (all nodes visited, none actionable).
 *
 * Inspects node statuses on the line to pick the most relevant reason.
 */
function diagnoseStuckLine(
  reality: PositionalGraphReality,
  line: LineReality
): NoActionReason {
  let hasRunning = false;
  let hasWaiting = false;
  let hasBlocked = false;

  for (const nodeId of line.nodeIds) {
    const node = reality.nodes.get(nodeId);
    if (!node) continue;

    switch (node.status) {
      case 'running':
        hasRunning = true;
        break;
      case 'waiting-question':
        hasWaiting = true;
        break;
      case 'blocked-error':
        hasBlocked = true;
        break;
    }
  }

  // Priority order:
  // 1. If anything is running or waiting, we're just waiting
  if (hasRunning || hasWaiting) {
    return 'all-waiting';
  }

  // 2. If everything non-complete is blocked, graph may be stuck
  if (hasBlocked) {
    return 'graph-failed';
  }

  // 3. Fallback: nodes are pending but gates not satisfied
  return 'all-waiting';
}
```

---

## Walk Order: Why Positional?

ONBAS visits nodes in **strict positional order**: line index ascending, then position within line ascending. This is intentional:

### Line Order = Data Flow Direction

Lines are ordered by dependency. Line N depends on lines 0..N-1. Walking in line order ensures we start nodes on earlier lines first — these produce outputs consumed by later lines.

### Position Order = Serial Chain Priority

Within a line, position 0 is the "root" node. Serial nodes at higher positions wait for lower positions. Walking in position order means we start the root before its dependents.

### Parallel Nodes Naturally Emerge

A parallel node at position 1+ doesn't wait for its left neighbor (gate 3 skipped). So even though we walk in position order, a parallel node at position 2 will be `ready` regardless of what position 0 or 1 are doing. The walk finds it and returns `start-node`.

### Example: Position Order with Mixed Execution

```
Line 0: [A (serial, pos 0)] → [B (parallel, pos 1)] → [C (serial, pos 2)]

Walk visit order: A, B, C

Scenario: A is running, B is ready (parallel), C is pending (serial, waiting for B)
  Visit A (running) → null
  Visit B (ready) → start-node B ← FOUND
  (C not visited — walk stops)
```

---

## Graph-Level State Machine

ONBAS's behavior depends on the graph's overall status. The graph status is computed by `buildPositionalGraphReality`:

```
Graph Status        ONBAS Behavior
─────────────      ────────────────────────────────
pending            Walk normally (nodes may be ready)
in_progress        Walk normally (nodes running/waiting)
complete           Short circuit → no-action(graph-complete)
failed             Short circuit → no-action(graph-failed)
```

### When is a graph `failed`?

When at least one node is `blocked-error` AND no nodes are `ready`, `running`, or `waiting-question`. The graph is stuck with no way to progress.

### When is a graph `complete`?

When all nodes across all lines have status `complete`.

---

## Edge Cases

### Empty Line

An empty line (no nodes) is always `isComplete === true` and `transitionOpen === true`. The walk passes through it instantly.

```
Line 0: [node-A]
Line 1: (empty)
Line 2: [node-B]

Walk: Visit A → Visit B (empty line 1 is complete, transition open)
```

### Single-Node Graph

The simplest case: one line, one node. ONBAS either starts it or reports no-action.

```
Line 0: [node-A]

If A is ready → start-node A
If A is running → no-action (all-waiting)
If A is complete → no-action (graph-complete)
```

### All Nodes Blocked

Every non-complete node is `blocked-error`. Graph is stuck.

```
Line 0: [A (blocked-error)]
Line 1: [B (pending — gates fail because line 0 not complete)]

Walk: Visit A (blocked) → null. Line 0 not complete.
diagnoseStuckLine → hasBlocked=true → graph-failed
→ no-action(graph-failed)
```

### Multiple Questions on Same Line

Parallel nodes can independently ask questions. The walk surfaces them one at a time:

```
Line 0: [A (waiting-question, not surfaced)] → [B (waiting-question, not surfaced)]

Loop 1: Visit A → question-pending(A) → ODS surfaces
Loop 2: Visit A (surfaced, waiting) → null → Visit B → question-pending(B) → ODS surfaces
Loop 3: Visit A (surfaced) → null → Visit B (surfaced) → null
        Line 0 not complete → no-action(all-waiting)
```

### Question Answered While Another Pending

A node's question is answered while another node's question is still waiting:

```
Line 0: [A (waiting-question, answered)] → [B (waiting-question, surfaced)]

Loop: Visit A (answered) → resume-node A
(B continues waiting — will be visited in next loop)
```

### Running Node Prevents Line Completion

A line can't complete while any node is `running`, even if all others are `complete`:

```
Line 0: [A (complete)] → [B (running)]
Line 1: [C (ready, but line 0 not complete)]

Walk: Visit A (complete) → null → Visit B (running) → null
Line 0 not complete → no-action(all-waiting)
```

### Manual Transition Blocks Successor Line

When line N has `transition: 'manual'`, line N+1 can't start until triggered:

```
Line 0: [A (complete)] (transition: manual, not triggered)
Line 1: [B (pending)]

Walk: Visit A (complete) → null. Line 0 complete → proceed.
Walk line 1: transitionOpen = false
→ no-action(transition-blocked, lineId: 'line-000')
```

**Note**: The transition gate is on the **successor** line, but the `lineId` in the OR refers to the **predecessor** line that has the manual transition configured. This tells the user which transition to trigger.

Correction based on the existing implementation: `line.transitionOpen` on line 1 reflects whether line 0's manual transition was triggered. The `lineId` in the no-action should be line 1's ID (the line we couldn't enter).

```typescript
// The walk checks line.transitionOpen on the line being entered
if (!line.transitionOpen) {
  return {
    type: 'no-action',
    graphSlug,
    reason: 'transition-blocked',
    lineId: line.lineId, // The line we couldn't enter
  };
}
```

---

## Implementation

### Class Implementation

```typescript
import type { PositionalGraphReality } from './reality.types.js';
import type { OrchestrationRequest, NoActionReason } from './orchestration-request.types.js';

export class OrchestrationNextBestActionService
  implements IOrchestrationNextBestActionService
{
  getNextAction(reality: PositionalGraphReality): OrchestrationRequest {
    return walkForNextAction(reality);
  }
}
```

### File Structure

```
packages/positional-graph/
└── src/
    └── features/030-orchestration/
        ├── onbas.ts                   # walkForNextAction + visitNode + helpers
        ├── onbas.interface.ts         # IOrchestrationNextBestActionService
        ├── onbas.service.ts           # Class wrapper (for DI)
        └── onbas.test.ts             # Comprehensive tests
```

---

## Testing Strategy

### Approach: Table-Driven Tests with Fake Reality

ONBAS is a pure function. Testing is straightforward:
1. Build a `PositionalGraphReality` with specific node statuses
2. Call `walkForNextAction(reality)`
3. Assert the returned `OrchestrationRequest`

No mocks, no async, no filesystem.

### buildFakeReality Helper

```typescript
import type {
  PositionalGraphReality,
  NodeReality,
  LineReality,
  QuestionReality,
} from './reality.types.js';

interface FakeRealityOptions {
  graphSlug?: string;
  graphStatus?: 'pending' | 'in_progress' | 'complete' | 'failed';
  lines?: FakeLineInput[];
  nodes?: FakeNodeInput[];
  questions?: FakeQuestionInput[];
}

interface FakeLineInput {
  lineId?: string;
  index?: number;
  transition?: 'auto' | 'manual';
  transitionTriggered?: boolean;
  transitionOpen?: boolean;
  isComplete?: boolean;
  nodeIds: string[];
}

interface FakeNodeInput {
  nodeId: string;
  lineIndex?: number;
  positionInLine?: number;
  unitSlug?: string;
  unitType?: 'agent' | 'code' | 'user-input';
  status?: ExecutionStatus;
  execution?: 'serial' | 'parallel';
  ready?: boolean;
  inputPack?: InputPack;
  pendingQuestionId?: string;
}

interface FakeQuestionInput {
  questionId: string;
  nodeId: string;
  questionType?: 'text' | 'single' | 'multi' | 'confirm';
  text?: string;
  options?: string[];
  defaultValue?: string | boolean;
  isSurfaced?: boolean;
  isAnswered?: boolean;
  answer?: unknown;
}

/**
 * Build a minimal PositionalGraphReality for testing.
 * Fills in sensible defaults for all optional fields.
 */
export function buildFakeReality(
  options: FakeRealityOptions = {}
): PositionalGraphReality {
  const graphSlug = options.graphSlug ?? 'test-graph';
  const nodes = (options.nodes ?? []).map((n, i) => ({
    nodeId: n.nodeId,
    lineIndex: n.lineIndex ?? 0,
    positionInLine: n.positionInLine ?? i,
    unitSlug: n.unitSlug ?? `unit-${n.nodeId}`,
    unitType: n.unitType ?? 'agent',
    status: n.status ?? 'pending',
    execution: n.execution ?? 'serial',
    ready: n.ready ?? (n.status === 'ready'),
    readyDetail: {
      precedingLinesComplete: true,
      transitionOpen: true,
      serialNeighborComplete: true,
      inputsAvailable: true,
      unitFound: true,
    },
    inputPack: n.inputPack ?? { ok: true, inputs: {} },
    pendingQuestionId: n.pendingQuestionId,
  })) as NodeReality[];

  const nodeMap = new Map(nodes.map((n) => [n.nodeId, n]));

  // Auto-generate lines if not provided
  const lines: LineReality[] = options.lines
    ? options.lines.map((l, i) => ({
        lineId: l.lineId ?? `line-${String(i).padStart(3, '0')}`,
        index: l.index ?? i,
        transition: l.transition ?? 'auto',
        transitionTriggered: l.transitionTriggered ?? false,
        isComplete: l.isComplete ?? l.nodeIds.every((id) => {
          const n = nodeMap.get(id);
          return n?.status === 'complete';
        }),
        isEmpty: l.nodeIds.length === 0,
        canRun: true,
        precedingLinesComplete: true,
        transitionOpen: l.transitionOpen ?? true,
        nodeIds: l.nodeIds,
      }))
    : [
        {
          lineId: 'line-000',
          index: 0,
          transition: 'auto' as const,
          transitionTriggered: false,
          isComplete: nodes.every((n) => n.status === 'complete'),
          isEmpty: nodes.length === 0,
          canRun: true,
          precedingLinesComplete: true,
          transitionOpen: true,
          nodeIds: nodes.map((n) => n.nodeId),
        },
      ];

  const questions: QuestionReality[] = (options.questions ?? []).map((q) => ({
    questionId: q.questionId,
    nodeId: q.nodeId,
    questionType: q.questionType ?? 'text',
    text: q.text ?? 'Default question?',
    options: q.options,
    defaultValue: q.defaultValue,
    askedAt: '2026-02-05T10:00:00Z',
    surfacedAt: q.isSurfaced ? '2026-02-05T10:01:00Z' : undefined,
    isSurfaced: q.isSurfaced ?? false,
    answer: q.answer,
    answeredAt: q.isAnswered ? '2026-02-05T10:02:00Z' : undefined,
    isAnswered: q.isAnswered ?? false,
  }));

  const completedNodeIds = nodes.filter((n) => n.status === 'complete').map((n) => n.nodeId);
  const readyNodeIds = nodes.filter((n) => n.status === 'ready').map((n) => n.nodeId);
  const runningNodeIds = nodes.filter((n) => n.status === 'running').map((n) => n.nodeId);
  const waitingQuestionNodeIds = nodes.filter((n) => n.status === 'waiting-question').map((n) => n.nodeId);
  const blockedNodeIds = nodes.filter((n) => n.status === 'blocked-error').map((n) => n.nodeId);

  const graphStatus = options.graphStatus
    ?? (nodes.length > 0 && nodes.every((n) => n.status === 'complete')
        ? 'complete'
        : nodes.some((n) => n.status !== 'pending')
          ? 'in_progress'
          : 'pending');

  return {
    graphSlug,
    version: '1.0.0',
    snapshotAt: '2026-02-05T10:00:00Z',
    graphStatus,
    lines,
    nodes: nodeMap,
    questions,
    podSessions: new Map(),

    currentLineIndex: lines.findIndex((l) => !l.isComplete),
    readyNodeIds,
    runningNodeIds,
    waitingQuestionNodeIds,
    blockedNodeIds,
    completedNodeIds,
    pendingQuestions: questions.filter((q) => !q.isAnswered),
    isComplete: graphStatus === 'complete',
    isFailed: graphStatus === 'failed',
    totalNodes: nodes.length,
    completedCount: completedNodeIds.length,
  };
}
```

### Test Cases

```typescript
import { describe, it, expect } from 'vitest';
import { walkForNextAction } from './onbas.js';
import { buildFakeReality } from './test-helpers.js';

describe('walkForNextAction', () => {
  // ═══════════════════════════════════════════════
  // Graph-level short circuits
  // ═══════════════════════════════════════════════

  describe('graph-level short circuits', () => {
    it('returns graph-complete when graph is already complete', () => {
      const reality = buildFakeReality({
        graphStatus: 'complete',
        nodes: [
          { nodeId: 'A', status: 'complete' },
        ],
        lines: [{ nodeIds: ['A'], isComplete: true }],
      });

      const result = walkForNextAction(reality);

      expect(result).toEqual({
        type: 'no-action',
        graphSlug: 'test-graph',
        reason: 'graph-complete',
      });
    });

    it('returns graph-failed when graph is failed', () => {
      const reality = buildFakeReality({
        graphStatus: 'failed',
        nodes: [
          { nodeId: 'A', status: 'blocked-error' },
        ],
      });

      const result = walkForNextAction(reality);

      expect(result).toEqual({
        type: 'no-action',
        graphSlug: 'test-graph',
        reason: 'graph-failed',
      });
    });
  });

  // ═══════════════════════════════════════════════
  // Start node
  // ═══════════════════════════════════════════════

  describe('start-node', () => {
    it('starts first ready node on a line', () => {
      const reality = buildFakeReality({
        nodes: [
          { nodeId: 'A', status: 'ready', ready: true },
        ],
      });

      const result = walkForNextAction(reality);

      expect(result.type).toBe('start-node');
      expect(result).toMatchObject({
        nodeId: 'A',
        inputs: { ok: true, inputs: {} },
      });
    });

    it('skips complete nodes and starts next ready', () => {
      const reality = buildFakeReality({
        nodes: [
          { nodeId: 'A', status: 'complete', positionInLine: 0 },
          { nodeId: 'B', status: 'ready', ready: true, positionInLine: 1 },
        ],
      });

      const result = walkForNextAction(reality);

      expect(result).toMatchObject({ type: 'start-node', nodeId: 'B' });
    });

    it('starts parallel node even when serial sibling is running', () => {
      const reality = buildFakeReality({
        nodes: [
          { nodeId: 'A', status: 'running', positionInLine: 0, execution: 'serial' },
          { nodeId: 'B', status: 'ready', ready: true, positionInLine: 1, execution: 'parallel' },
        ],
      });

      const result = walkForNextAction(reality);

      expect(result).toMatchObject({ type: 'start-node', nodeId: 'B' });
    });

    it('starts node on line 1 after line 0 completes', () => {
      const reality = buildFakeReality({
        nodes: [
          { nodeId: 'A', status: 'complete', lineIndex: 0, positionInLine: 0 },
          { nodeId: 'B', status: 'ready', ready: true, lineIndex: 1, positionInLine: 0 },
        ],
        lines: [
          { nodeIds: ['A'], isComplete: true },
          { nodeIds: ['B'], isComplete: false },
        ],
      });

      const result = walkForNextAction(reality);

      expect(result).toMatchObject({ type: 'start-node', nodeId: 'B' });
    });
  });

  // ═══════════════════════════════════════════════
  // Resume node (question answered)
  // ═══════════════════════════════════════════════

  describe('resume-node', () => {
    it('resumes node when question is answered', () => {
      const reality = buildFakeReality({
        nodes: [
          { nodeId: 'A', status: 'waiting-question', pendingQuestionId: 'q-001' },
        ],
        questions: [
          {
            questionId: 'q-001',
            nodeId: 'A',
            isSurfaced: true,
            isAnswered: true,
            answer: 'Option B',
          },
        ],
      });

      const result = walkForNextAction(reality);

      expect(result).toEqual({
        type: 'resume-node',
        graphSlug: 'test-graph',
        nodeId: 'A',
        questionId: 'q-001',
        answer: 'Option B',
      });
    });

    it('prioritizes resume over start (answered question found first)', () => {
      const reality = buildFakeReality({
        nodes: [
          { nodeId: 'A', status: 'waiting-question', positionInLine: 0, pendingQuestionId: 'q-001' },
          { nodeId: 'B', status: 'ready', ready: true, positionInLine: 1, execution: 'parallel' },
        ],
        questions: [
          { questionId: 'q-001', nodeId: 'A', isSurfaced: true, isAnswered: true, answer: 'Yes' },
        ],
      });

      const result = walkForNextAction(reality);

      expect(result).toMatchObject({ type: 'resume-node', nodeId: 'A' });
    });
  });

  // ═══════════════════════════════════════════════
  // Question pending (not yet surfaced)
  // ═══════════════════════════════════════════════

  describe('question-pending', () => {
    it('surfaces unsurfaced question', () => {
      const reality = buildFakeReality({
        nodes: [
          { nodeId: 'A', status: 'waiting-question', pendingQuestionId: 'q-001' },
        ],
        questions: [
          {
            questionId: 'q-001',
            nodeId: 'A',
            questionType: 'single',
            text: 'Which database?',
            options: ['PostgreSQL', 'MongoDB'],
            isSurfaced: false,
            isAnswered: false,
          },
        ],
      });

      const result = walkForNextAction(reality);

      expect(result).toEqual({
        type: 'question-pending',
        graphSlug: 'test-graph',
        nodeId: 'A',
        questionId: 'q-001',
        questionText: 'Which database?',
        questionType: 'single',
        options: ['PostgreSQL', 'MongoDB'],
        defaultValue: undefined,
      });
    });

    it('skips surfaced question and continues walk', () => {
      const reality = buildFakeReality({
        nodes: [
          { nodeId: 'A', status: 'waiting-question', positionInLine: 0, pendingQuestionId: 'q-001' },
          { nodeId: 'B', status: 'ready', ready: true, positionInLine: 1, execution: 'parallel' },
        ],
        questions: [
          { questionId: 'q-001', nodeId: 'A', isSurfaced: true, isAnswered: false },
        ],
      });

      const result = walkForNextAction(reality);

      // Skipped A (surfaced, waiting) → found B (ready)
      expect(result).toMatchObject({ type: 'start-node', nodeId: 'B' });
    });
  });

  // ═══════════════════════════════════════════════
  // No-action scenarios
  // ═══════════════════════════════════════════════

  describe('no-action', () => {
    it('returns all-waiting when nodes are running', () => {
      const reality = buildFakeReality({
        graphStatus: 'in_progress',
        nodes: [
          { nodeId: 'A', status: 'running' },
          { nodeId: 'B', status: 'running' },
        ],
      });

      const result = walkForNextAction(reality);

      expect(result).toMatchObject({
        type: 'no-action',
        reason: 'all-waiting',
      });
    });

    it('returns transition-blocked when manual transition not triggered', () => {
      const reality = buildFakeReality({
        nodes: [
          { nodeId: 'A', status: 'complete', lineIndex: 0, positionInLine: 0 },
          { nodeId: 'B', status: 'pending', lineIndex: 1, positionInLine: 0 },
        ],
        lines: [
          { nodeIds: ['A'], isComplete: true, transition: 'manual', transitionTriggered: false, transitionOpen: true },
          { nodeIds: ['B'], isComplete: false, transitionOpen: false },
        ],
      });

      const result = walkForNextAction(reality);

      expect(result).toMatchObject({
        type: 'no-action',
        reason: 'transition-blocked',
        lineId: expect.any(String),
      });
    });

    it('returns all-waiting when question surfaced but unanswered', () => {
      const reality = buildFakeReality({
        graphStatus: 'in_progress',
        nodes: [
          { nodeId: 'A', status: 'waiting-question', pendingQuestionId: 'q-001' },
        ],
        questions: [
          { questionId: 'q-001', nodeId: 'A', isSurfaced: true, isAnswered: false },
        ],
      });

      const result = walkForNextAction(reality);

      expect(result).toMatchObject({
        type: 'no-action',
        reason: 'all-waiting',
      });
    });

    it('handles empty graph (no lines)', () => {
      const reality = buildFakeReality({
        graphStatus: 'complete',
        nodes: [],
        lines: [],
      });

      const result = walkForNextAction(reality);

      expect(result).toMatchObject({
        type: 'no-action',
        reason: 'graph-complete',
      });
    });

    it('handles empty line (passes through)', () => {
      const reality = buildFakeReality({
        nodes: [
          { nodeId: 'B', status: 'ready', ready: true, lineIndex: 2, positionInLine: 0 },
        ],
        lines: [
          { nodeIds: [], isComplete: true },                    // Line 0: empty
          { nodeIds: [], isComplete: true },                    // Line 1: empty
          { nodeIds: ['B'], isComplete: false },                // Line 2: has ready node
        ],
      });

      const result = walkForNextAction(reality);

      expect(result).toMatchObject({ type: 'start-node', nodeId: 'B' });
    });
  });

  // ═══════════════════════════════════════════════
  // Complex multi-line scenarios
  // ═══════════════════════════════════════════════

  describe('complex scenarios', () => {
    it('walks through completed lines to find first actionable', () => {
      const reality = buildFakeReality({
        nodes: [
          { nodeId: 'A', status: 'complete', lineIndex: 0, positionInLine: 0 },
          { nodeId: 'B', status: 'complete', lineIndex: 1, positionInLine: 0 },
          { nodeId: 'C', status: 'ready', ready: true, lineIndex: 2, positionInLine: 0 },
        ],
        lines: [
          { nodeIds: ['A'], isComplete: true },
          { nodeIds: ['B'], isComplete: true },
          { nodeIds: ['C'], isComplete: false },
        ],
      });

      const result = walkForNextAction(reality);

      expect(result).toMatchObject({ type: 'start-node', nodeId: 'C' });
    });

    it('surfaces questions from earlier lines before starting later lines', () => {
      // Line 0 has a question, line 1 has a ready node
      // But line 0 is not complete, so we can't reach line 1
      const reality = buildFakeReality({
        graphStatus: 'in_progress',
        nodes: [
          { nodeId: 'A', status: 'waiting-question', lineIndex: 0, positionInLine: 0, pendingQuestionId: 'q-001' },
          { nodeId: 'B', status: 'pending', lineIndex: 1, positionInLine: 0 },
        ],
        lines: [
          { nodeIds: ['A'], isComplete: false },
          { nodeIds: ['B'], isComplete: false },
        ],
        questions: [
          { questionId: 'q-001', nodeId: 'A', isSurfaced: false, isAnswered: false, text: 'Continue?' },
        ],
      });

      const result = walkForNextAction(reality);

      expect(result).toMatchObject({
        type: 'question-pending',
        nodeId: 'A',
        questionId: 'q-001',
      });
    });

    it('handles mixed running, question, and ready on same line', () => {
      const reality = buildFakeReality({
        graphStatus: 'in_progress',
        nodes: [
          { nodeId: 'A', status: 'running', positionInLine: 0, execution: 'serial' },
          { nodeId: 'B', status: 'waiting-question', positionInLine: 1, execution: 'parallel', pendingQuestionId: 'q-001' },
          { nodeId: 'C', status: 'ready', ready: true, positionInLine: 2, execution: 'parallel' },
        ],
        questions: [
          { questionId: 'q-001', nodeId: 'B', isSurfaced: true, isAnswered: false },
        ],
      });

      const result = walkForNextAction(reality);

      // A is running (skip), B is waiting (surfaced, skip), C is ready
      expect(result).toMatchObject({ type: 'start-node', nodeId: 'C' });
    });
  });
});
```

### Table-Driven Tests for Visit Logic

```typescript
describe('visitNode (via walkForNextAction)', () => {
  const cases = [
    {
      name: 'complete node → skip',
      node: { nodeId: 'X', status: 'complete' },
      expected: { type: 'no-action' },
    },
    {
      name: 'running node → skip',
      node: { nodeId: 'X', status: 'running' },
      expected: { type: 'no-action' },
    },
    {
      name: 'blocked-error node → skip',
      node: { nodeId: 'X', status: 'blocked-error' },
      expected: { type: 'no-action' },
    },
    {
      name: 'pending node → skip',
      node: { nodeId: 'X', status: 'pending' },
      expected: { type: 'no-action' },
    },
    {
      name: 'ready node → start-node',
      node: { nodeId: 'X', status: 'ready', ready: true },
      expected: { type: 'start-node', nodeId: 'X' },
    },
  ];

  cases.forEach(({ name, node, expected }) => {
    it(name, () => {
      const reality = buildFakeReality({
        graphStatus: 'in_progress',
        nodes: [node],
      });

      const result = walkForNextAction(reality);

      expect(result.type).toBe(expected.type);
      if ('nodeId' in expected) {
        expect(result).toMatchObject({ nodeId: expected.nodeId });
      }
    });
  });
});
```

### Table-Driven Tests for Question States

```typescript
describe('question sub-states', () => {
  const cases = [
    {
      name: 'answered → resume-node',
      question: { isSurfaced: true, isAnswered: true, answer: 'Yes' },
      expected: { type: 'resume-node' },
    },
    {
      name: 'not surfaced → question-pending',
      question: { isSurfaced: false, isAnswered: false },
      expected: { type: 'question-pending' },
    },
    {
      name: 'surfaced but not answered → skip (no-action)',
      question: { isSurfaced: true, isAnswered: false },
      expected: { type: 'no-action' },
    },
  ];

  cases.forEach(({ name, question, expected }) => {
    it(name, () => {
      const reality = buildFakeReality({
        graphStatus: 'in_progress',
        nodes: [
          { nodeId: 'A', status: 'waiting-question', pendingQuestionId: 'q-001' },
        ],
        questions: [
          { questionId: 'q-001', nodeId: 'A', ...question },
        ],
      });

      const result = walkForNextAction(reality);

      expect(result.type).toBe(expected.type);
    });
  });
});
```

---

## Orchestration Loop Integration

ONBAS is called in a loop by the orchestrator. The loop is simple:

```typescript
/**
 * Run the orchestration loop until no more actions can be taken.
 *
 * The loop:
 * 1. Builds a fresh reality snapshot
 * 2. Asks ONBAS for the next action
 * 3. Executes the action via ODS
 * 4. Repeats until no-action
 *
 * Returns when the loop exits (no-action returned).
 */
async function runOrchestrationLoop(
  ctx: WorkspaceContext,
  graphSlug: string,
  deps: {
    realityBuilder: IRealityBuilder;
    onbas: IOrchestrationNextBestActionService;
    ods: IOrchestrationDoerService;
  }
): Promise<OrchestrationLoopResult> {
  const { realityBuilder, onbas, ods } = deps;
  const actions: OrchestrationRequest[] = [];

  while (true) {
    // 1. Fresh snapshot
    const reality = await realityBuilder.build(ctx, graphSlug);

    // 2. Next action
    const request = onbas.getNextAction(reality);
    actions.push(request);

    // 3. Check for loop exit
    if (request.type === 'no-action') {
      return {
        exitReason: request.reason ?? 'no-action',
        actionsExecuted: actions.length - 1, // Exclude the final no-action
        finalRequest: request,
      };
    }

    if (request.type === 'question-pending') {
      // Surface question, then pause loop (user must answer)
      await ods.execute(ctx, request);
      return {
        exitReason: 'question-surfaced',
        actionsExecuted: actions.length,
        finalRequest: request,
      };
    }

    // 4. Execute action
    const result = await ods.execute(ctx, request);
    if (!result.ok) {
      return {
        exitReason: 'execution-error',
        actionsExecuted: actions.length,
        finalRequest: request,
        error: result.error,
      };
    }

    // 5. Loop continues — reality will be rebuilt with updated state
  }
}

interface OrchestrationLoopResult {
  readonly exitReason: string;
  readonly actionsExecuted: number;
  readonly finalRequest: OrchestrationRequest;
  readonly error?: OrchestrationError;
}
```

### Loop Behavior by OR Type

| OR Type | Loop Behavior |
|---------|---------------|
| `start-node` | Execute, continue loop |
| `resume-node` | Execute, continue loop |
| `question-pending` | Execute (surface), **exit loop** (wait for user) |
| `no-action` | **Exit loop** |

### Why Question-Pending Exits the Loop

When ONBAS surfaces a `question-pending`, the loop must pause. The question needs to reach the user (via event/UI), the user needs time to answer, and then the loop should be re-triggered.

The loop is re-entered when:
- User answers a question (answer recorded in state.json)
- A running agent completes or fails
- User triggers a manual transition
- External event (e.g., timer, webhook)

### Safety: Infinite Loop Prevention

The loop rebuilds reality each iteration, so state changes from ODS are reflected. However, if ODS fails to change state (e.g., `startNode` doesn't actually update status), the walk could return the same request forever.

**Guard**: Track the last N requests. If the same request repeats more than 3 times consecutively, break with an error.

```typescript
// In the loop:
if (actions.length >= 3) {
  const last3 = actions.slice(-3);
  if (last3.every((a) =>
    a.type === request.type &&
    ('nodeId' in a ? a.nodeId : '') === ('nodeId' in request ? request.nodeId : '')
  )) {
    return {
      exitReason: 'infinite-loop-detected',
      actionsExecuted: actions.length,
      finalRequest: request,
      error: {
        code: 'ORCHESTRATION_INFINITE_LOOP',
        message: `Same action repeated 3 times: ${request.type} for ${
          'nodeId' in request ? request.nodeId : 'graph'
        }`,
      },
    };
  }
}
```

---

## Determinism Guarantee

Given the same `PositionalGraphReality`, `walkForNextAction` always returns the same `OrchestrationRequest`. This is guaranteed because:

1. **No randomness** — walk order is positional, not random
2. **No external lookups** — everything is in the snapshot
3. **No mutation** — reality is readonly
4. **No async** — synchronous evaluation

This property makes ONBAS trivially testable and debuggable. If a user reports unexpected behavior, capture the `PositionalGraphReality` snapshot and replay it through `walkForNextAction` to reproduce exactly.

---

## Open Questions

### Q1: Should ONBAS return multiple actions?

**RESOLVED**: No. One action per call.

The orchestration loop calls ONBAS repeatedly. Each call returns one action, ODS executes it, state updates, and ONBAS is called again with fresh reality. This keeps the system simple:
- No parallel action coordination
- No partial execution rollback
- Easy to debug (one action at a time)

Parallel nodes start across multiple loop iterations. This is sequential from the loop's perspective but concurrent from the graph's perspective (multiple nodes can be `running` simultaneously).

### Q2: Should ONBAS be aware of `unitType`?

**RESOLVED**: No. ONBAS treats all nodes the same.

ONBAS doesn't care whether a node is agent, code, or user-input. It only looks at `status` and `ready`. The `unitType`-specific behavior lives in ODS (which creates pods, handles user-input directly, etc.).

This keeps ONBAS simple and focused: walk, match status, return request.

### Q3: What if a node is `ready` but has `inputPack.ok === false`?

**RESOLVED**: This shouldn't happen — readiness gates include input availability. If `inputPack.ok` is false, the node should be `pending`, not `ready`.

However, defensively, ONBAS trusts the `status` field. If `status === 'ready'`, it returns `start-node` with whatever `inputPack` is present. The builder is responsible for ensuring consistency between `status` and `inputPack`.

### Q4: Should the loop live in ONBAS or be a separate orchestrator?

**RESOLVED**: Separate. The orchestration loop is not part of ONBAS.

ONBAS is a pure function. The loop that calls ONBAS, executes via ODS, and rebuilds reality is a separate concern — likely in an `OrchestrationService` or `Orchestrator` class that wires ONBAS + ODS + RealityBuilder together.

This separation allows:
- Testing ONBAS in isolation (pure function tests)
- Testing the loop in isolation (with fake ONBAS + fake ODS)
- Different loop strategies (polling, event-driven, CLI-triggered)

### Q5: Should ONBAS track which nodes it has already returned requests for?

**RESOLVED**: No. ONBAS is stateless.

Each call receives a fresh reality. If ODS correctly updates state after executing a request, the next reality will reflect the change (e.g., node moved from `ready` to `running`). ONBAS doesn't need to remember previous calls.

The infinite loop guard in the orchestration loop handles the case where ODS fails to update state.

---

## Relationship to Other Workshops

| Workshop | Relationship |
|----------|--------------|
| **PositionalGraphReality** | ONBAS consumes this snapshot as input |
| **OrchestrationRequest** | ONBAS produces this discriminated union as output |
| **AgentContextService** | Not used by ONBAS — ODS's concern |
| **WorkUnitPods** | Not used by ONBAS — ODS's concern |
| **ODS** | Consumes ONBAS output, executes actions |

---

## File Location

```
packages/positional-graph/
└── src/
    └── features/030-orchestration/
        ├── onbas.ts                   # walkForNextAction + visitNode + diagnoseStuckLine
        ├── onbas.interface.ts         # IOrchestrationNextBestActionService
        ├── onbas.service.ts           # Class wrapper (for DI)
        ├── onbas.test.ts             # Unit tests
        └── test-helpers.ts            # buildFakeReality (shared with other tests)
```

---

## Implementation Checklist

- [ ] Create `onbas.interface.ts` with `IOrchestrationNextBestActionService`
- [ ] Create `onbas.ts` with `walkForNextAction`, `visitNode`, `visitWaitingQuestion`, `diagnoseStuckLine`
- [ ] Create `onbas.service.ts` with class wrapper for DI
- [ ] Create `test-helpers.ts` with `buildFakeReality` helper
- [ ] Add graph-level short circuit tests (complete, failed)
- [ ] Add start-node tests (single, multi-line, parallel)
- [ ] Add resume-node tests (answered question)
- [ ] Add question-pending tests (unsurfaced, surfaced-skip)
- [ ] Add no-action tests (running, transition-blocked, all-waiting)
- [ ] Add edge case tests (empty line, single node, all blocked)
- [ ] Add complex scenario tests (multi-line walk, mixed states)
- [ ] Add table-driven tests for visit logic and question sub-states
- [ ] Export from feature index
- [ ] Integrate with orchestration loop (depends on ODS, Workshop #6)

---

## Glossary

| Term | Expansion | Definition |
|------|-----------|------------|
| **OR** | OrchestrationRequest | Discriminated union type that ONBAS produces. Four variants: `start-node`, `resume-node`, `question-pending`, `no-action`. |
| **ONBAS** | OrchestrationNextBestActionService | This service. Pure-function rules engine: `walkForNextAction(reality) → OrchestrationRequest`. Stateless, synchronous, deterministic. |
| **ODS** | OrchestrationDoerService | Executor that consumes the OR that ONBAS produces. ONBAS has no knowledge of ODS. |
| **Reality** | PositionalGraphReality | Read-only snapshot of the entire graph state. The sole input to `walkForNextAction()`. |
| **Pod** | IWorkUnitPod | Ephemeral execution container. Not used by ONBAS — pods are ODS's concern. |
| **PodManager** | IPodManager | Per-graph pod registry. Not used by ONBAS. |
| **NodeReality** | — | Per-node snapshot within Reality: status, readiness, inputs, position, pending question ID. ONBAS visits each node via `visitNode()`. |
| **LineReality** | — | Per-line snapshot: `transitionOpen`, `isComplete`, `nodeIds`. ONBAS walks lines in order and checks these gates. |
| **QuestionReality** | — | Per-question snapshot: `isSurfaced`, `isAnswered`, `answer`. ONBAS uses these to determine the three question sub-states. |
| **NoActionReason** | — | String explaining why `no-action` was returned: `graph-complete`, `graph-failed`, `transition-blocked`, `all-waiting`. |
| **InputPack** | — | Collated inputs included in `start-node` OR payload. ONBAS reads it from NodeReality but doesn't compute it. |
| **buildFakeReality** | — | Test helper that constructs a `PositionalGraphReality` from minimal options. Fills in sensible defaults for all fields. |

---

## Summary

ONBAS is the **rules engine** of the orchestration system. It is a pure, synchronous, deterministic function that walks a `PositionalGraphReality` snapshot and returns an `OrchestrationRequest`.

**Key Points**:
1. **Pure function**: `walkForNextAction(reality) → OrchestrationRequest`
2. **Positional walk order**: line 0 → line N, position 0 → position N
3. **First-match**: returns on the first actionable node found
4. **Six status cases**: complete (skip), running (skip), waiting-question (three sub-states), blocked-error (skip), ready (start), pending (skip)
5. **Enriched no-action**: graph-complete, graph-failed, transition-blocked, all-waiting
6. **Stateless**: no memory between calls, same input → same output
7. **Not responsible for execution**: ODS handles pods, state, events
8. **Easy to test**: build fake reality, call function, assert result
