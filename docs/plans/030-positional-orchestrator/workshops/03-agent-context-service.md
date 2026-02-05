# Workshop: AgentContextService

**Type**: Integration Pattern
**Plan**: 030-positional-orchestrator
**Spec**: [research-dossier.md](../research-dossier.md)
**Created**: 2026-02-05
**Status**: Draft

**Related Documents**:
- [workshops.md](../workshops.md) — Workshop index
- [positional-graph-reality.md](01-positional-graph-reality.md) — Snapshot containing node topology
- [orchestration-request.md](02-orchestration-request.md) — OR does NOT carry context info (resolved)
- [research-dossier.md](../research-dossier.md) — IAgentContextService proposed contract

---

## Purpose

Define the rules and implementation for determining which session context an agent node should inherit (or whether to start fresh). This is the "how to execute" layer that the orchestration system uses when starting agent nodes.

**Separation of Concerns**:
- **ONBAS** answers "what should happen next?" → `OrchestrationRequest`
- **AgentContextService** answers "how should this agent start?" → `ContextSourceResult`
- **ODS** orchestrates both: gets OR from ONBAS, gets context from AgentContextService, executes

This workshop does NOT modify `OrchestrationRequest` — it defines a standalone service that ODS calls when handling `start-node` requests for agent work units.

## Key Questions Addressed

- What are the context inheritance rules for each node position?
- How does `unitType` affect context inheritance (agents only)?
- What is the lookup algorithm for finding the source node?
- How do we handle edge cases (no prior agent, code nodes, user-input)?
- How does this integrate with ODS's `start-node` handler?

---

## Design Principles

### 1. Pure Function on Reality

`AgentContextService.getContextSource()` is a **pure function**. It takes a `PositionalGraphReality` snapshot and a `nodeId`, and returns a `ContextSourceResult`. No side effects, no async, no external lookups.

```typescript
getContextSource(reality: PositionalGraphReality, nodeId: string): ContextSourceResult
```

### 2. Only Agent Nodes Have Context

- **Agent nodes**: May inherit or start fresh
- **Code nodes**: No context concept — they execute and complete
- **User-input nodes**: No context — they're passive data sources

The service still returns a result for non-agent nodes, but it's always `{ source: 'not-applicable', reason: '...' }`.

### 3. Rules Are Positional

Context inheritance is determined by the node's **position** in the graph:
- Which line is it on?
- Where is it in the line (first, middle, last)?
- What execution mode (serial vs parallel)?

### 4. Session ID Lookup is Separate

`AgentContextService` answers "inherit from which node?" — it returns a `fromNodeId`. The actual session ID lookup happens in ODS/PodManager:

```typescript
// In ODS.handleStartNode():
const contextResult = this.contextService.getContextSource(reality, nodeId);

if (contextResult.source === 'inherit') {
  const sessionId = this.podManager.getSessionId(graphSlug, contextResult.fromNodeId!);
  await pod.execute(inputs, sessionId);
} else {
  await pod.execute(inputs); // Fresh session
}
```

---

## Context Inheritance Rules

### Rule Matrix

| Position | Execution Mode | Rule | Source |
|----------|----------------|------|--------|
| First on line 0 | any | **New context** | No predecessor exists |
| First on line N (N>0) | any | **Inherit from first AGENT on line N-1** | Cross-line continuity |
| Not first | serial | **Inherit from left neighbor** (if agent) | Serial chain |
| Not first | parallel | **New context** | Independent execution |

### Why These Rules?

**First node on line 0**: The graph starts here. No prior work exists to inherit from.

**First node on line N (N>0)**: Continues the "main thread" from the previous line. We pick the **first AGENT node** on the previous line because:
- It's deterministic (always same source)
- It represents the primary work of that line
- Code/user-input nodes don't have sessions

**Serial not-first**: Serial execution means waiting for the left neighbor to complete. Inheriting context enables multi-step agent workflows on the same line.

**Parallel not-first**: Parallel execution means independent work. Each parallel agent gets a fresh context to avoid state conflicts.

### Edge Cases

#### No Agent on Previous Line

If line N-1 has only code or user-input nodes (no agents), the first node on line N gets **new context**.

```
Line 0: [user-prompt] [code-validator]    ← no agents
Line 1: [spec-builder (first, agent)]     ← new context (no agent to inherit from)
```

#### First Node is Non-Agent

If the first node on a line is a code unit, context lookup is `not-applicable`. If the second node is an agent with serial execution, it also gets **new context** (the left neighbor has no session).

```
Line 1: [code-linter (serial)] → [spec-builder (serial, agent)]
                                  ↑ new context (code node has no session)
```

#### Mixed Agent/Code Serial Chain

If a serial agent follows a code node, the agent gets new context. If a serial agent follows another agent, it inherits.

```
Line 1: [agent-A (serial)] → [code-B (serial)] → [agent-C (serial)]
        ↑ new or inherited   ↑ not-applicable    ↑ new context (code-B has no session)
```

#### Parallel Agent Following Serial Agent

Even though there's a "left neighbor", parallel nodes don't wait and don't inherit.

```
Line 1: [agent-A (serial)] → [agent-B (parallel)] → [agent-C (parallel)]
        ↑ inherits from L0    ↑ new context          ↑ new context
```

#### No-Context Flag (Future)

Nodes may have an `orchestratorSettings.noContext: true` flag that forces new context regardless of position. This overrides all inheritance rules.

---

## Schema Definitions

### TypeScript Types

```typescript
// ============================================
// ContextSourceResult — The Service Return Type
// ============================================

/**
 * Result of context source lookup.
 * Tells ODS where to get session context from (or that it doesn't apply).
 */
export type ContextSourceResult =
  | InheritContextResult
  | NewContextResult
  | NotApplicableResult;

/**
 * Inherit session context from another node's completed execution.
 */
export interface InheritContextResult {
  readonly source: 'inherit';

  /** Node ID to get session from */
  readonly fromNodeId: string;

  /** Human-readable explanation */
  readonly reason: string;
}

/**
 * Start with fresh session context.
 */
export interface NewContextResult {
  readonly source: 'new';

  /** Human-readable explanation */
  readonly reason: string;
}

/**
 * Context concept doesn't apply (code units, user-input, etc.)
 */
export interface NotApplicableResult {
  readonly source: 'not-applicable';

  /** Human-readable explanation */
  readonly reason: string;
}

// ============================================
// Type Guards
// ============================================

export function isInheritContext(result: ContextSourceResult): result is InheritContextResult {
  return result.source === 'inherit';
}

export function isNewContext(result: ContextSourceResult): result is NewContextResult {
  return result.source === 'new';
}

export function isNotApplicable(result: ContextSourceResult): result is NotApplicableResult {
  return result.source === 'not-applicable';
}
```

### Zod Schemas

```typescript
import { z } from 'zod';

// ── InheritContextResult ─────────────────────────
export const InheritContextResultSchema = z.object({
  source: z.literal('inherit'),
  fromNodeId: z.string().min(1),
  reason: z.string().min(1),
}).strict();
export type InheritContextResult = z.infer<typeof InheritContextResultSchema>;

// ── NewContextResult ─────────────────────────────
export const NewContextResultSchema = z.object({
  source: z.literal('new'),
  reason: z.string().min(1),
}).strict();
export type NewContextResult = z.infer<typeof NewContextResultSchema>;

// ── NotApplicableResult ──────────────────────────
export const NotApplicableResultSchema = z.object({
  source: z.literal('not-applicable'),
  reason: z.string().min(1),
}).strict();
export type NotApplicableResult = z.infer<typeof NotApplicableResultSchema>;

// ── ContextSourceResult (Discriminated Union) ───
export const ContextSourceResultSchema = z.discriminatedUnion('source', [
  InheritContextResultSchema,
  NewContextResultSchema,
  NotApplicableResultSchema,
]);
export type ContextSourceResult = z.infer<typeof ContextSourceResultSchema>;
```

---

## Service Interface

```typescript
/**
 * Determines which session context an agent node should inherit.
 * Pure function — no side effects, no async.
 */
export interface IAgentContextService {
  /**
   * Get the context source for a node.
   *
   * @param reality - Graph snapshot
   * @param nodeId - The node to determine context for
   * @returns Context source (inherit, new, or not-applicable)
   */
  getContextSource(
    reality: PositionalGraphReality,
    nodeId: string
  ): ContextSourceResult;
}
```

---

## Implementation

### Algorithm

```typescript
import type { PositionalGraphReality, NodeReality } from './reality.types.js';
import type { ContextSourceResult } from './context.types.js';

export class AgentContextService implements IAgentContextService {
  getContextSource(
    reality: PositionalGraphReality,
    nodeId: string
  ): ContextSourceResult {
    const node = reality.nodes.get(nodeId);

    if (!node) {
      return {
        source: 'not-applicable',
        reason: `Node '${nodeId}' not found in reality`,
      };
    }

    // ── Rule 0: Only agents have context ────────────
    if (node.unitType !== 'agent') {
      return {
        source: 'not-applicable',
        reason: `Node '${nodeId}' is ${node.unitType}, not an agent`,
      };
    }

    // ── Rule 1: Check for noContext flag ────────────
    // Future: if (node.orchestratorSettings?.noContext) { return new }

    // ── Rule 2: First node on line 0 ────────────────
    if (node.lineIndex === 0 && node.positionInLine === 0) {
      return {
        source: 'new',
        reason: 'First node on first line — no predecessor exists',
      };
    }

    // ── Rule 3: First node on line N (N>0) ──────────
    if (node.positionInLine === 0 && node.lineIndex > 0) {
      const previousLine = reality.lines[node.lineIndex - 1];
      const firstAgentOnPrevLine = this.findFirstAgentOnLine(reality, previousLine);

      if (firstAgentOnPrevLine) {
        return {
          source: 'inherit',
          fromNodeId: firstAgentOnPrevLine.nodeId,
          reason: `First on line ${node.lineIndex} — inherits from first agent on line ${node.lineIndex - 1}`,
        };
      } else {
        return {
          source: 'new',
          reason: `First on line ${node.lineIndex} — no agent on previous line`,
        };
      }
    }

    // ── Rule 4: Parallel execution ──────────────────
    if (node.execution === 'parallel') {
      return {
        source: 'new',
        reason: 'Parallel execution — independent context',
      };
    }

    // ── Rule 5: Serial execution (inherit from left) ─
    const leftNeighbor = this.getLeftNeighbor(reality, node);

    if (!leftNeighbor) {
      return {
        source: 'new',
        reason: 'Serial but no left neighbor (should not happen)',
      };
    }

    if (leftNeighbor.unitType === 'agent') {
      return {
        source: 'inherit',
        fromNodeId: leftNeighbor.nodeId,
        reason: `Serial — inherits from left neighbor '${leftNeighbor.nodeId}'`,
      };
    } else {
      return {
        source: 'new',
        reason: `Serial — left neighbor '${leftNeighbor.nodeId}' is ${leftNeighbor.unitType}, not agent`,
      };
    }
  }

  /**
   * Find the first agent node on a line (by position).
   */
  private findFirstAgentOnLine(
    reality: PositionalGraphReality,
    line: LineReality
  ): NodeReality | undefined {
    for (const nodeId of line.nodeIds) {
      const node = reality.nodes.get(nodeId);
      if (node && node.unitType === 'agent') {
        return node;
      }
    }
    return undefined;
  }

  /**
   * Get the node immediately to the left (position - 1) on the same line.
   */
  private getLeftNeighbor(
    reality: PositionalGraphReality,
    node: NodeReality
  ): NodeReality | undefined {
    if (node.positionInLine === 0) {
      return undefined;
    }

    const line = reality.lines[node.lineIndex];
    const leftNodeId = line.nodeIds[node.positionInLine - 1];
    return reality.nodes.get(leftNodeId);
  }
}
```

### Visual Decision Tree

```
getContextSource(reality, nodeId)
        │
        ▼
   ┌─────────────┐
   │ Node exists?│
   └─────────────┘
        │
    no  │  yes
        ▼    └──────────────────────────────────────────┐
   not-applicable                                        ▼
   "Node not found"                              ┌───────────────┐
                                                 │ unitType=agent│
                                                 └───────────────┘
                                                        │
                                                    no  │  yes
                                                        ▼    └──────────────────┐
                                               not-applicable                    ▼
                                               "Not an agent"           ┌────────────────────┐
                                                                        │ line=0, position=0 │
                                                                        └────────────────────┘
                                                                               │
                                                                           yes │  no
                                                                               ▼    └────────────────┐
                                                                         new context                  ▼
                                                                         "First on L0"      ┌─────────────────┐
                                                                                            │ position=0, L>0 │
                                                                                            └─────────────────┘
                                                                                                    │
                                                                                                yes │  no
                                                                                                    ▼    └──────────┐
                                                                                        ┌─────────────────────┐     │
                                                                                        │ First agent on L-1? │     ▼
                                                                                        └─────────────────────┘  ┌──────────┐
                                                                                               │                 │ parallel?│
                                                                                           yes │  no             └──────────┘
                                                                                               ▼    └──────            │
                                                                                         inherit           ▼       yes │  no
                                                                                         from agent     new ctx        ▼    └──────┐
                                                                                                        "no agent"  new ctx       ▼
                                                                                                                    "parallel" ┌────────────────┐
                                                                                                                               │ left = agent?  │
                                                                                                                               └────────────────┘
                                                                                                                                       │
                                                                                                                                   yes │  no
                                                                                                                                       ▼    └───────┐
                                                                                                                                 inherit           ▼
                                                                                                                                 from left      new ctx
                                                                                                                                               "left not agent"
```

---

## Integration with ODS

### ODS.handleStartNode() Pseudo-Code

```typescript
private async handleStartNode(
  ctx: WorkspaceContext,
  request: StartNodeRequest
): Promise<OrchestrationResult> {
  const { graphSlug, nodeId, inputs } = request;

  // 1. Get the current reality (for context lookup)
  const reality = await this.buildReality(ctx, graphSlug);
  const node = reality.nodes.get(nodeId);

  // 2. Update state: node → running
  await this.graphService.startNode(ctx, graphSlug, nodeId);

  // 3. Get/create pod for node
  const pod = await this.podManager.getPod(ctx, graphSlug, nodeId);

  // 4. Determine context source (only for agents)
  let contextSessionId: string | undefined;

  if (node?.unitType === 'agent') {
    const contextResult = this.contextService.getContextSource(reality, nodeId);

    if (isInheritContext(contextResult)) {
      // Get session ID from source node
      contextSessionId = this.podManager.getSessionId(
        ctx,
        graphSlug,
        contextResult.fromNodeId
      );

      // Log the inheritance for debugging
      this.logger.debug(
        `Node '${nodeId}' inherits context from '${contextResult.fromNodeId}' ` +
        `(session: ${contextSessionId ?? 'not found'})`
      );
    } else if (isNewContext(contextResult)) {
      this.logger.debug(`Node '${nodeId}' starts with new context: ${contextResult.reason}`);
    }
  }

  // 5. Execute pod
  const podResult = await pod.execute(inputs, contextSessionId);

  // 6. Emit event
  this.notifier.emit('workgraphs', 'node-started', { graphSlug, nodeId });

  return {
    ok: true,
    request,
    sessionId: podResult.sessionId,
    newStatus: 'running',
  };
}
```

---

## Examples

### Example 1: Simple Linear Graph

```
Line 0: [user-prompt (user-input)]
Line 1: [spec-builder (agent, serial)]
Line 2: [coder (agent, serial)]
```

| Node | Context Source |
|------|----------------|
| `user-prompt` | not-applicable (user-input) |
| `spec-builder` | new (first agent on L1, L0 has no agents) |
| `coder` | inherit from `spec-builder` (first agent on L1) |

### Example 2: Parallel Agents

```
Line 0: [user-prompt (user-input)]
Line 1: [reviewer-A (agent, serial)] → [reviewer-B (agent, parallel)] → [reviewer-C (agent, parallel)]
```

| Node | Context Source |
|------|----------------|
| `user-prompt` | not-applicable |
| `reviewer-A` | new (first on L1, L0 has no agents) |
| `reviewer-B` | new (parallel execution) |
| `reviewer-C` | new (parallel execution) |

### Example 3: Serial Chain with Code Unit

```
Line 0: [prompter (agent, serial)]
Line 1: [linter (code, serial)] → [reviewer (agent, serial)] → [fixer (agent, serial)]
```

| Node | Context Source |
|------|----------------|
| `prompter` | new (first on L0) |
| `linter` | not-applicable (code) |
| `reviewer` | new (left neighbor `linter` is code, not agent) |
| `fixer` | inherit from `reviewer` (serial, left is agent) |

### Example 4: Cross-Line Inheritance

```
Line 0: [setup (code)] → [prompter (agent)]
Line 1: [spec-builder (agent)] → [spec-reviewer (agent)]
Line 2: [coder (agent)]
```

| Node | Context Source |
|------|----------------|
| `setup` | not-applicable (code) |
| `prompter` | new (left is code) |
| `spec-builder` | inherit from `prompter` (first agent on L0) |
| `spec-reviewer` | inherit from `spec-builder` (serial, left is agent) |
| `coder` | inherit from `spec-builder` (first agent on L1) |

### Example 5: Line with No Agents

```
Line 0: [user-prompt (user-input)]
Line 1: [validator (code)] → [formatter (code)]
Line 2: [builder (agent)]
```

| Node | Context Source |
|------|----------------|
| `user-prompt` | not-applicable |
| `validator` | not-applicable |
| `formatter` | not-applicable |
| `builder` | new (L1 has no agents to inherit from) |

---

## Testing Patterns

### Unit Testing with Fake Reality

```typescript
import { describe, it, expect } from 'vitest';
import { AgentContextService } from './agent-context.service.js';
import { buildFakeReality, buildFakeNode, buildFakeLine } from './test-helpers.js';

describe('AgentContextService', () => {
  const service = new AgentContextService();

  describe('getContextSource', () => {

    it('returns not-applicable for non-agent nodes', () => {
      const reality = buildFakeReality({
        nodes: [
          buildFakeNode({ nodeId: 'code-001', unitType: 'code', lineIndex: 0, positionInLine: 0 }),
        ],
        lines: [buildFakeLine({ lineId: 'line-0', nodeIds: ['code-001'] })],
      });

      const result = service.getContextSource(reality, 'code-001');

      expect(result.source).toBe('not-applicable');
      expect(result.reason).toContain('code');
    });

    it('returns new context for first agent on line 0', () => {
      const reality = buildFakeReality({
        nodes: [
          buildFakeNode({ nodeId: 'agent-001', unitType: 'agent', lineIndex: 0, positionInLine: 0 }),
        ],
        lines: [buildFakeLine({ lineId: 'line-0', nodeIds: ['agent-001'] })],
      });

      const result = service.getContextSource(reality, 'agent-001');

      expect(result.source).toBe('new');
      expect(result.reason).toContain('First');
    });

    it('inherits from first agent on previous line', () => {
      const reality = buildFakeReality({
        nodes: [
          buildFakeNode({ nodeId: 'prev-agent', unitType: 'agent', lineIndex: 0, positionInLine: 0 }),
          buildFakeNode({ nodeId: 'curr-agent', unitType: 'agent', lineIndex: 1, positionInLine: 0 }),
        ],
        lines: [
          buildFakeLine({ lineId: 'line-0', nodeIds: ['prev-agent'], index: 0 }),
          buildFakeLine({ lineId: 'line-1', nodeIds: ['curr-agent'], index: 1 }),
        ],
      });

      const result = service.getContextSource(reality, 'curr-agent');

      expect(result.source).toBe('inherit');
      expect(result).toHaveProperty('fromNodeId', 'prev-agent');
    });

    it('inherits from left neighbor in serial chain', () => {
      const reality = buildFakeReality({
        nodes: [
          buildFakeNode({ nodeId: 'left-agent', unitType: 'agent', lineIndex: 0, positionInLine: 0, execution: 'serial' }),
          buildFakeNode({ nodeId: 'right-agent', unitType: 'agent', lineIndex: 0, positionInLine: 1, execution: 'serial' }),
        ],
        lines: [
          buildFakeLine({ lineId: 'line-0', nodeIds: ['left-agent', 'right-agent'] }),
        ],
      });

      const result = service.getContextSource(reality, 'right-agent');

      expect(result.source).toBe('inherit');
      expect(result).toHaveProperty('fromNodeId', 'left-agent');
    });

    it('returns new context for parallel node', () => {
      const reality = buildFakeReality({
        nodes: [
          buildFakeNode({ nodeId: 'left-agent', unitType: 'agent', lineIndex: 0, positionInLine: 0, execution: 'serial' }),
          buildFakeNode({ nodeId: 'parallel-agent', unitType: 'agent', lineIndex: 0, positionInLine: 1, execution: 'parallel' }),
        ],
        lines: [
          buildFakeLine({ lineId: 'line-0', nodeIds: ['left-agent', 'parallel-agent'] }),
        ],
      });

      const result = service.getContextSource(reality, 'parallel-agent');

      expect(result.source).toBe('new');
      expect(result.reason).toContain('parallel');
    });

    it('returns new when left neighbor is code', () => {
      const reality = buildFakeReality({
        nodes: [
          buildFakeNode({ nodeId: 'left-code', unitType: 'code', lineIndex: 0, positionInLine: 0, execution: 'serial' }),
          buildFakeNode({ nodeId: 'right-agent', unitType: 'agent', lineIndex: 0, positionInLine: 1, execution: 'serial' }),
        ],
        lines: [
          buildFakeLine({ lineId: 'line-0', nodeIds: ['left-code', 'right-agent'] }),
        ],
      });

      const result = service.getContextSource(reality, 'right-agent');

      expect(result.source).toBe('new');
      expect(result.reason).toContain('code');
    });

    it('returns new when previous line has no agents', () => {
      const reality = buildFakeReality({
        nodes: [
          buildFakeNode({ nodeId: 'code-node', unitType: 'code', lineIndex: 0, positionInLine: 0 }),
          buildFakeNode({ nodeId: 'agent-node', unitType: 'agent', lineIndex: 1, positionInLine: 0 }),
        ],
        lines: [
          buildFakeLine({ lineId: 'line-0', nodeIds: ['code-node'], index: 0 }),
          buildFakeLine({ lineId: 'line-1', nodeIds: ['agent-node'], index: 1 }),
        ],
      });

      const result = service.getContextSource(reality, 'agent-node');

      expect(result.source).toBe('new');
      expect(result.reason).toContain('no agent');
    });

  });
});
```

### Table-Driven Tests

```typescript
describe('AgentContextService (table-driven)', () => {
  const service = new AgentContextService();

  const cases = [
    {
      name: 'non-agent node',
      nodeId: 'code-001',
      setup: { unitType: 'code', lineIndex: 0, positionInLine: 0 },
      expected: { source: 'not-applicable' },
    },
    {
      name: 'first agent on line 0',
      nodeId: 'agent-001',
      setup: { unitType: 'agent', lineIndex: 0, positionInLine: 0 },
      expected: { source: 'new' },
    },
    {
      name: 'parallel agent',
      nodeId: 'parallel-001',
      setup: { unitType: 'agent', lineIndex: 0, positionInLine: 1, execution: 'parallel' },
      expected: { source: 'new' },
    },
    // ... more cases
  ];

  cases.forEach(({ name, nodeId, setup, expected }) => {
    it(name, () => {
      const reality = buildSingleNodeReality(nodeId, setup);
      const result = service.getContextSource(reality, nodeId);
      expect(result.source).toBe(expected.source);
    });
  });
});
```

---

## Open Questions

### Q1: Should context inheritance skip non-agent nodes when looking backward?

**RESOLVED**: Yes.

When looking for "first agent on previous line", we only consider agent nodes. Code and user-input nodes don't have sessions, so they can't be context sources.

When looking for "left neighbor" in serial execution, we check `unitType === 'agent'`. If the left neighbor is not an agent, we return `new` context rather than searching further left.

**Rationale**: Simple rules are easier to reason about. "Inherit from immediate left if it's an agent, otherwise start fresh" is clearer than "search leftward until you find an agent."

### Q2: Should there be a `noContext` flag to force fresh context?

**RESOLVED**: Yes, but not in v1.

Add to node's `orchestratorSettings`:
```typescript
orchestratorSettings: {
  execution: 'serial' | 'parallel',
  noContext?: boolean, // Force new context regardless of position
}
```

Implementation:
```typescript
// Early return in getContextSource:
if (node.orchestratorSettings?.noContext === true) {
  return { source: 'new', reason: 'noContext flag set' };
}
```

**Deferred**: This adds complexity and isn't needed for basic workflows. Add when use case emerges.

### Q3: How do we handle a source node that failed or never ran?

**RESOLVED**: Return the source node ID anyway; let PodManager handle missing sessions.

If `getContextSource()` returns `inherit from 'node-X'` but `node-X` never ran (or failed before creating a session), the `podManager.getSessionId()` call returns `undefined`. ODS then starts the new node with a fresh context.

This keeps the context service pure — it determines **where** to inherit from, not **whether** the source is valid. Validity is a runtime concern for ODS/PodManager.

### Q4: What about agent nodes that complete but don't persist their session?

**RESOLVED**: Session persistence is PodManager's responsibility, not AgentContextService's.

PodManager must persist session IDs for completed agent nodes (in state.json or a separate file). If a session ID is missing when needed, ODS falls back to new context with a warning.

---

## Relationship to Other Workshops

| Workshop | Relationship |
|----------|--------------|
| **PositionalGraphReality** | Provides the snapshot with `nodes`, `lines`, `unitType`, `positionInLine` |
| **OrchestrationRequest** | Does NOT contain context info; context is ODS's concern |
| **ONBAS** | Produces OR; unaware of context service |
| **ODS** | Calls `contextService.getContextSource()` when handling `start-node` |
| **WorkUnitPods** | PodManager provides `getSessionId(fromNodeId)` |

---

## File Location

```
packages/positional-graph/
└── src/
    └── features/030-orchestration/
        ├── context.types.ts            # ContextSourceResult types
        ├── context.schema.ts           # Zod schemas
        ├── context.service.ts          # AgentContextService implementation
        ├── context.service.interface.ts # IAgentContextService interface
        └── context.service.test.ts     # Unit tests
```

---

## Implementation Checklist

- [ ] Create `context.types.ts` with result types and type guards
- [ ] Create `context.schema.ts` with Zod schemas
- [ ] Create `context.service.interface.ts` with `IAgentContextService`
- [ ] Create `context.service.ts` with `AgentContextService` implementation
- [ ] Add unit tests with fake reality
- [ ] Add table-driven tests for all rule combinations
- [ ] Export from feature index
- [ ] Integrate with ODS `handleStartNode()` (depends on Workshop #6)
- [ ] Document session ID persistence requirements for PodManager

---

## Glossary

| Term | Expansion | Definition |
|------|-----------|------------|
| **OR** | OrchestrationRequest | Discriminated union type representing the next action for the orchestrator. Four variants: `start-node`, `resume-node`, `question-pending`, `no-action`. |
| **ONBAS** | OrchestrationNextBestActionService | Pure-function rules engine that walks a `PositionalGraphReality` snapshot and returns an OR. |
| **ODS** | OrchestrationDoerService | Executor that consumes an OR and performs the action. Calls AgentContextService when handling `start-node` for agent nodes. |
| **Reality** | PositionalGraphReality | Read-only snapshot of the entire graph state. Input to both ONBAS and AgentContextService. |
| **Pod** | WorkUnitPod | Ephemeral execution container for a node. Receives the `contextSessionId` determined by AgentContextService. |
| **PodManager** | IPodManager | Per-graph registry that tracks pod session IDs. Provides the session ID that AgentContextService's `inherit` result points to. |
| **ContextSourceResult** | — | Return type of `getContextSource()`: `{ source: 'inherit' \| 'new' \| 'not-applicable', sourceNodeId?, reason }`. |
| **Session ID** | — | Opaque string identifying an agent conversation session. Enables context continuity when a new node inherits from a prior agent. |
| **NodeReality** | — | Per-node snapshot: status, readiness, unit type, position, execution mode. Used to determine context inheritance rules. |
| **WorkUnit** | — | Declarative definition of what a node does. Only `agent` units have meaningful context inheritance. |
| **InputPack** | — | Collated input data for a node, resolved from upstream outputs. |

---

## Summary

`AgentContextService` answers **"how should this agent start?"** by determining whether to inherit session context from a prior node or start fresh.

**Key Points**:
1. **Pure function** on `PositionalGraphReality` — no side effects
2. **Three outcomes**: `inherit`, `new`, or `not-applicable`
3. **Rules are positional**: line index, position in line, execution mode
4. **Separation**: Context service says "inherit from X", PodManager provides session ID
5. **Integration**: ODS calls context service when handling `start-node` for agents

The rules are intentionally simple:
- First on line 0 → new
- First on line N → inherit from first agent on line N-1 (or new if none)
- Serial not-first → inherit from left if agent (or new if code/user-input)
- Parallel → always new
