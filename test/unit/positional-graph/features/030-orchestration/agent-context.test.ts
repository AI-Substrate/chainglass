/**
 * Test Doc:
 * - Why: AgentContextService determines whether an agent inherits a session from a prior
 *   agent or starts fresh. Incorrect context inheritance breaks conversation continuity
 *   across workflow steps — e.g., a reviewer inheriting a parallel worker's session
 *   instead of the spec-writer's global session.
 * - Contract: getContextSource() is a pure function that applies 6 positional rules
 *   deterministically (first match wins):
 *   R0: non-agent → not-applicable
 *   R1: noContext → new
 *   R2: contextFrom set → inherit from specified node (runtime guard)
 *   R3: I am the global agent → new
 *   R4: parallel AND pos > 0 → new
 *   R5: serial left walk + global fallback → inherit
 *   Every result includes a non-empty reason string.
 * - Usage Notes: Pass a PositionalGraphReality snapshot and a nodeId. The function
 *   constructs a View internally. For testing, use makeRealityFromLines() to build
 *   minimal reality objects from nested line/node arrays.
 * - Quality Contribution: Catches regressions in context inheritance rules, global agent
 *   selection, left-hand rule behaviour, and noContext/contextFrom overrides.
 * - Worked Example: Graph with spec-writer on line 1, parallel noContext workers on line 2,
 *   reviewer on line 3 → getContextSource(reality, 'reviewer') returns
 *   { source: 'inherit', fromNodeId: 'spec-writer', reason: '...' }
 */

import { describe, expect, it } from 'vitest';
import { getContextSource } from '../../../../../packages/positional-graph/src/features/030-orchestration/agent-context.js';
import type { InheritContextResult } from '../../../../../packages/positional-graph/src/features/030-orchestration/agent-context.schema.js';
import {
  isInheritContext,
  isNewContext,
  isNotApplicable,
} from '../../../../../packages/positional-graph/src/features/030-orchestration/agent-context.types.js';
import type {
  LineReality,
  NodeReality,
  PositionalGraphReality,
} from '../../../../../packages/positional-graph/src/features/030-orchestration/reality.types.js';

// ============================================
// Test Fixture Helpers
// ============================================

function makeNode(overrides: Partial<NodeReality> & { nodeId: string }): NodeReality {
  return {
    lineIndex: 0,
    positionInLine: 0,
    unitSlug: 'test-unit',
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
    ...overrides,
  };
}

function makeLine(
  overrides: Partial<LineReality> & { lineId: string; index: number }
): LineReality {
  return {
    label: undefined,
    transition: 'auto',
    transitionTriggered: false,
    isComplete: false,
    isEmpty: false,
    canRun: true,
    precedingLinesComplete: true,
    transitionOpen: true,
    nodeIds: [],
    ...overrides,
  };
}

function makeReality(
  nodes: NodeReality[],
  lines: LineReality[],
  overrides: Partial<PositionalGraphReality> = {}
): PositionalGraphReality {
  const nodeMap = new Map<string, NodeReality>();
  for (const n of nodes) {
    nodeMap.set(n.nodeId, n);
  }
  return {
    graphSlug: 'test-graph',
    version: '1.0.0',
    snapshotAt: '2026-02-06T12:00:00Z',
    graphStatus: 'in_progress',
    lines,
    nodes: nodeMap,
    questions: [],
    podSessions: new Map(),
    currentLineIndex: 0,
    readyNodeIds: [],
    runningNodeIds: [],
    waitingQuestionNodeIds: [],
    blockedNodeIds: [],
    completedNodeIds: [],
    pendingQuestions: [],
    isComplete: false,
    isFailed: false,
    totalNodes: nodes.length,
    completedCount: 0,
    ...overrides,
  };
}

/**
 * Convenience helper: build a reality from nested line arrays.
 * Each inner array is a list of nodes on that line; positions and line indices
 * are auto-assigned.
 */
function makeRealityFromLines(
  lineNodes: NodeReality[][],
  overrides: Partial<PositionalGraphReality> = {}
): PositionalGraphReality {
  const allNodes: NodeReality[] = [];
  const lines: LineReality[] = [];
  for (let li = 0; li < lineNodes.length; li++) {
    const nodeIds: string[] = [];
    for (let pi = 0; pi < lineNodes[li].length; pi++) {
      const n: NodeReality = { ...lineNodes[li][pi], lineIndex: li, positionInLine: pi };
      allNodes.push(n);
      nodeIds.push(n.nodeId);
    }
    lines.push(makeLine({ lineId: `line-${li}`, index: li, nodeIds }));
  }
  return makeReality(allNodes, lines, overrides);
}

// ============================================
// Context Engine Tests — Global Session + Left Neighbor Model (6 Rules)
// ============================================

describe('getContextSource — Global Session + Left Neighbor', () => {
  // ── R0: Non-agent → not-applicable ─────────────────

  describe('R0: non-agent', () => {
    it('returns not-applicable for a code node', () => {
      const reality = makeRealityFromLines([[makeNode({ nodeId: 'code-1', unitType: 'code' })]]);
      const result = getContextSource(reality, 'code-1');
      expect(result.source).toBe('not-applicable');
      expect(result.reason.length).toBeGreaterThan(0);
    });

    it('returns not-applicable for a user-input node', () => {
      const reality = makeRealityFromLines([
        [makeNode({ nodeId: 'human', unitType: 'user-input' })],
      ]);
      const result = getContextSource(reality, 'human');
      expect(result.source).toBe('not-applicable');
    });
  });

  // ── R1: noContext → new ─────────────────

  describe('R1: noContext', () => {
    it('returns new for a serial agent with noContext', () => {
      const reality = makeRealityFromLines([
        [makeNode({ nodeId: 'global', execution: 'serial' })],
        [makeNode({ nodeId: 'isolated', execution: 'serial', noContext: true })],
      ]);
      const result = getContextSource(reality, 'isolated');
      expect(result.source).toBe('new');
    });

    it('returns new for a parallel pos 0 agent with noContext', () => {
      const reality = makeRealityFromLines([
        [makeNode({ nodeId: 'global', execution: 'serial' })],
        [makeNode({ nodeId: 'worker', execution: 'parallel', noContext: true })],
      ]);
      const result = getContextSource(reality, 'worker');
      expect(result.source).toBe('new');
    });
  });

  // ── R2: contextFrom override ─────────────────

  describe('R2: contextFrom', () => {
    it('inherits from specified node, overriding default', () => {
      const reality = makeRealityFromLines([
        [
          makeNode({ nodeId: 'A', execution: 'serial' }),
          makeNode({ nodeId: 'B', execution: 'serial', noContext: true }),
        ],
        [makeNode({ nodeId: 'R', execution: 'serial', contextFrom: 'B' })],
      ]);
      const result = getContextSource(reality, 'R');
      expect(result.source).toBe('inherit');
      expect((result as InheritContextResult).fromNodeId).toBe('B');
    });

    it('returns new when contextFrom targets a non-agent (runtime guard)', () => {
      const reality = makeRealityFromLines([
        [makeNode({ nodeId: 'code-1', unitType: 'code' })],
        [makeNode({ nodeId: 'R', execution: 'serial', contextFrom: 'code-1' })],
      ]);
      const result = getContextSource(reality, 'R');
      expect(result.source).toBe('new');
    });

    it('returns new when contextFrom targets nonexistent node (runtime guard)', () => {
      const reality = makeRealityFromLines([
        [makeNode({ nodeId: 'A', execution: 'serial' })],
        [makeNode({ nodeId: 'R', execution: 'serial', contextFrom: 'does-not-exist' })],
      ]);
      const result = getContextSource(reality, 'R');
      expect(result.source).toBe('new');
    });
  });

  // ── R3: Global agent → new ─────────────────

  describe('R3: global agent', () => {
    it('returns new for the first eligible agent in graph', () => {
      const reality = makeRealityFromLines([
        [makeNode({ nodeId: 'global', execution: 'serial' })],
        [makeNode({ nodeId: 'second', execution: 'serial' })],
      ]);
      const result = getContextSource(reality, 'global');
      expect(result.source).toBe('new');
    });

    it('returns new for global agent on line > 0 (line 0 has only user-input)', () => {
      const reality = makeRealityFromLines([
        [makeNode({ nodeId: 'human', unitType: 'user-input' })],
        [makeNode({ nodeId: 'spec', execution: 'serial' })],
      ]);
      const result = getContextSource(reality, 'spec');
      expect(result.source).toBe('new');
    });
  });

  // ── R4: Parallel pos > 0 → new ─────────────────

  describe('R4: parallel at pos > 0', () => {
    it('returns new for parallel agent at pos > 0 without noContext', () => {
      const reality = makeRealityFromLines([
        [makeNode({ nodeId: 'global', execution: 'serial' })],
        [
          makeNode({ nodeId: 'w1', execution: 'parallel' }),
          makeNode({ nodeId: 'w2', execution: 'parallel' }),
        ],
      ]);
      const result = getContextSource(reality, 'w2');
      expect(result.source).toBe('new');
    });
  });

  // ── R5: Serial left walk + global fallback ─────────────────

  describe('R5: serial left walk + global fallback', () => {
    it('pos 0 with no left neighbor inherits from global', () => {
      const reality = makeRealityFromLines([
        [makeNode({ nodeId: 'global', execution: 'serial' })],
        [makeNode({ nodeId: 'B', execution: 'serial' })],
      ]);
      const result = getContextSource(reality, 'B');
      expect(result.source).toBe('inherit');
      expect((result as InheritContextResult).fromNodeId).toBe('global');
    });

    it('walks left and finds agent neighbor', () => {
      const reality = makeRealityFromLines([
        [makeNode({ nodeId: 'global', execution: 'serial' })],
        [
          makeNode({ nodeId: 'B', execution: 'serial' }),
          makeNode({ nodeId: 'C', execution: 'serial' }),
          makeNode({ nodeId: 'D', execution: 'serial' }),
        ],
      ]);
      const result = getContextSource(reality, 'D');
      expect(result.source).toBe('inherit');
      expect((result as InheritContextResult).fromNodeId).toBe('C');
    });

    it('left walk skips code nodes', () => {
      const reality = makeRealityFromLines([
        [makeNode({ nodeId: 'global', execution: 'serial' })],
        [
          makeNode({ nodeId: 'B', execution: 'serial' }),
          makeNode({ nodeId: 'code-1', unitType: 'code' }),
          makeNode({ nodeId: 'C', execution: 'serial' }),
        ],
      ]);
      const result = getContextSource(reality, 'C');
      expect(result.source).toBe('inherit');
      expect((result as InheritContextResult).fromNodeId).toBe('B');
    });

    it('left walk inherits from parallel left neighbor (absolute rule)', () => {
      const reality = makeRealityFromLines([
        [makeNode({ nodeId: 'global', execution: 'serial' })],
        [
          makeNode({ nodeId: 'PA', execution: 'parallel' }),
          makeNode({ nodeId: 'PB', execution: 'parallel' }),
          makeNode({ nodeId: 'AGG', execution: 'serial' }),
        ],
      ]);
      const result = getContextSource(reality, 'AGG');
      expect(result.source).toBe('inherit');
      expect((result as InheritContextResult).fromNodeId).toBe('PB');
    });

    it('left walk inherits from noContext left neighbor (absolute rule)', () => {
      // Scenario 6 from Workshop 03: C inherits from N's fresh session
      const reality = makeRealityFromLines([
        [makeNode({ nodeId: 'A', execution: 'serial' })],
        [
          makeNode({ nodeId: 'B', execution: 'serial' }),
          makeNode({ nodeId: 'N', execution: 'serial', noContext: true }),
          makeNode({ nodeId: 'C', execution: 'serial' }),
        ],
      ]);
      const result = getContextSource(reality, 'C');
      expect(result.source).toBe('inherit');
      expect((result as InheritContextResult).fromNodeId).toBe('N');
    });

    it('parallel at pos 0 without noContext inherits from global', () => {
      const reality = makeRealityFromLines([
        [makeNode({ nodeId: 'global', execution: 'serial' })],
        [
          makeNode({ nodeId: 'w1', execution: 'parallel' }),
          makeNode({ nodeId: 'w2', execution: 'parallel' }),
        ],
      ]);
      const result = getContextSource(reality, 'w1');
      expect(result.source).toBe('inherit');
      expect((result as InheritContextResult).fromNodeId).toBe('global');
    });
  });

  // ── Scenario 3: The E2E Pipeline (motivating case) ─────────────────

  describe('Scenario 3: E2E Pipeline', () => {
    it('reviewer at pos 0 inherits from global, skipping noContext parallel line', () => {
      const reality = makeRealityFromLines([
        [makeNode({ nodeId: 'human', unitType: 'user-input' })],
        [makeNode({ nodeId: 'spec', execution: 'serial' })],
        [
          makeNode({ nodeId: 'prog-a', execution: 'parallel', noContext: true }),
          makeNode({ nodeId: 'prog-b', execution: 'parallel', noContext: true }),
        ],
        [
          makeNode({ nodeId: 'reviewer', execution: 'serial' }),
          makeNode({ nodeId: 'summariser', execution: 'serial' }),
        ],
      ]);

      const specResult = getContextSource(reality, 'spec');
      expect(specResult.source).toBe('new'); // R3: global agent

      const progAResult = getContextSource(reality, 'prog-a');
      expect(progAResult.source).toBe('new'); // R1: noContext

      const progBResult = getContextSource(reality, 'prog-b');
      expect(progBResult.source).toBe('new'); // R1: noContext

      const reviewerResult = getContextSource(reality, 'reviewer');
      expect(reviewerResult.source).toBe('inherit');
      expect((reviewerResult as InheritContextResult).fromNodeId).toBe('spec'); // R5: global fallback

      const summariserResult = getContextSource(reality, 'summariser');
      expect(summariserResult.source).toBe('inherit');
      expect((summariserResult as InheritContextResult).fromNodeId).toBe('reviewer'); // R5: left walk
    });
  });

  // ── Edge cases ─────────────────

  describe('Edge cases', () => {
    it('all agents have noContext → every node gets new', () => {
      const reality = makeRealityFromLines([
        [makeNode({ nodeId: 'A', execution: 'serial', noContext: true })],
        [makeNode({ nodeId: 'B', execution: 'serial', noContext: true })],
      ]);
      expect(getContextSource(reality, 'A').source).toBe('new');
      expect(getContextSource(reality, 'B').source).toBe('new');
    });

    it('nonexistent node → not-applicable', () => {
      const reality = makeRealityFromLines([[makeNode({ nodeId: 'A', execution: 'serial' })]]);
      const result = getContextSource(reality, 'does-not-exist');
      expect(result.source).toBe('not-applicable');
    });

    it('every result has non-empty reason string', () => {
      const reality = makeRealityFromLines([
        [makeNode({ nodeId: 'human', unitType: 'user-input' })],
        [makeNode({ nodeId: 'spec', execution: 'serial' })],
        [makeNode({ nodeId: 'worker', execution: 'parallel', noContext: true })],
        [makeNode({ nodeId: 'reviewer', execution: 'serial' })],
      ]);
      for (const nodeId of ['human', 'spec', 'worker', 'reviewer']) {
        const result = getContextSource(reality, nodeId);
        expect(result.reason.length).toBeGreaterThan(0);
      }
    });
  });
});
