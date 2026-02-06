/**
 * Test Doc:
 * - Why: AgentContextService determines whether an agent inherits a session from a prior
 *   agent or starts fresh. Incorrect context inheritance breaks conversation continuity
 *   across workflow steps.
 * - Contract: getContextSource() is a pure function that applies 5 positional rules
 *   deterministically: (0) non-agent → not-applicable, (1) first on line 0 → new,
 *   (2) first on line N>0 → walk ALL previous lines for agent → inherit or new,
 *   (3) parallel → new, (4) serial not-first → walk left past non-agents → inherit or new.
 *   Every result includes a non-empty reason string.
 * - Usage Notes: Pass a PositionalGraphReality snapshot and a nodeId. The function
 *   constructs a View internally — no need to pre-build one. For testing, construct
 *   minimal PositionalGraphReality objects as plain data with ReadonlyMap.
 * - Quality Contribution: Catches regressions in context inheritance rules, walk-back
 *   behavior (DYK-I10, DYK-I13), and reason string accuracy.
 * - Worked Example: Graph with agent on line 0, agent first on line 1 →
 *   getContextSource(reality, 'line1-agent') returns { source: 'inherit', fromNodeId: 'line0-agent', reason: '...' }
 */

import { describe, expect, it } from 'vitest';
// T003 RED: This import will fail until T004 creates the module
import { getContextSource } from '../../../../../packages/positional-graph/src/features/030-orchestration/agent-context.js';
import type {
  ContextSourceResult,
  InheritContextResult,
} from '../../../../../packages/positional-graph/src/features/030-orchestration/agent-context.schema.js';
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

// ============================================
// T003: Core Rule Tests (5 Rules)
// ============================================

describe('getContextSource', () => {
  describe('Rule 0: non-agent → not-applicable', () => {
    it('returns not-applicable for a code node', () => {
      const codeNode = makeNode({
        nodeId: 'code-1',
        unitType: 'code',
        lineIndex: 0,
        positionInLine: 0,
      });
      const line = makeLine({
        lineId: 'line-0',
        index: 0,
        nodeIds: ['code-1'],
      });
      const reality = makeReality([codeNode], [line]);

      const result = getContextSource(reality, 'code-1');

      expect(isNotApplicable(result)).toBe(true);
      expect(result.source).toBe('not-applicable');
      expect(result.reason.length).toBeGreaterThan(0);
    });

    it('returns not-applicable for a user-input node', () => {
      const uiNode = makeNode({
        nodeId: 'ui-1',
        unitType: 'user-input',
        lineIndex: 0,
        positionInLine: 0,
      });
      const line = makeLine({
        lineId: 'line-0',
        index: 0,
        nodeIds: ['ui-1'],
      });
      const reality = makeReality([uiNode], [line]);

      const result = getContextSource(reality, 'ui-1');

      expect(isNotApplicable(result)).toBe(true);
    });
  });

  describe('Rule 1: first agent on line 0 → new', () => {
    it('returns new for first agent on line 0', () => {
      const agent = makeNode({
        nodeId: 'agent-1',
        unitType: 'agent',
        lineIndex: 0,
        positionInLine: 0,
      });
      const line = makeLine({
        lineId: 'line-0',
        index: 0,
        nodeIds: ['agent-1'],
      });
      const reality = makeReality([agent], [line]);

      const result = getContextSource(reality, 'agent-1');

      expect(isNewContext(result)).toBe(true);
      expect(result.source).toBe('new');
      expect(result.reason.length).toBeGreaterThan(0);
    });
  });

  describe('Rule 2: first on line N>0 → cross-line inherit', () => {
    it('inherits from first agent on previous line', () => {
      const agentLine0 = makeNode({
        nodeId: 'builder',
        unitType: 'agent',
        lineIndex: 0,
        positionInLine: 0,
      });
      const agentLine1 = makeNode({
        nodeId: 'reviewer',
        unitType: 'agent',
        lineIndex: 1,
        positionInLine: 0,
      });
      const line0 = makeLine({
        lineId: 'line-0',
        index: 0,
        nodeIds: ['builder'],
      });
      const line1 = makeLine({
        lineId: 'line-1',
        index: 1,
        nodeIds: ['reviewer'],
      });
      const reality = makeReality([agentLine0, agentLine1], [line0, line1]);

      const result = getContextSource(reality, 'reviewer');

      expect(isInheritContext(result)).toBe(true);
      expect((result as InheritContextResult).fromNodeId).toBe('builder');
      expect(result.reason.length).toBeGreaterThan(0);
    });
  });

  describe('Rule 3: parallel agent → new', () => {
    it('returns new for a parallel agent', () => {
      const agent = makeNode({
        nodeId: 'parallel-agent',
        unitType: 'agent',
        lineIndex: 1,
        positionInLine: 1,
        execution: 'parallel',
      });
      const prevAgent = makeNode({
        nodeId: 'prev-agent',
        unitType: 'agent',
        lineIndex: 0,
        positionInLine: 0,
      });
      const line0 = makeLine({
        lineId: 'line-0',
        index: 0,
        nodeIds: ['prev-agent'],
      });
      const line1 = makeLine({
        lineId: 'line-1',
        index: 1,
        nodeIds: ['some-first', 'parallel-agent'],
      });
      const firstOnLine1 = makeNode({
        nodeId: 'some-first',
        unitType: 'agent',
        lineIndex: 1,
        positionInLine: 0,
      });
      const reality = makeReality([prevAgent, firstOnLine1, agent], [line0, line1]);

      const result = getContextSource(reality, 'parallel-agent');

      expect(isNewContext(result)).toBe(true);
      expect(result.source).toBe('new');
    });
  });

  describe('Rule 4: serial not-first → inherit from left agent', () => {
    it('inherits from immediate left agent neighbor', () => {
      const agentA = makeNode({
        nodeId: 'agent-a',
        unitType: 'agent',
        lineIndex: 0,
        positionInLine: 0,
        execution: 'serial',
      });
      const agentB = makeNode({
        nodeId: 'agent-b',
        unitType: 'agent',
        lineIndex: 0,
        positionInLine: 1,
        execution: 'serial',
      });
      const line = makeLine({
        lineId: 'line-0',
        index: 0,
        nodeIds: ['agent-a', 'agent-b'],
      });
      const reality = makeReality([agentA, agentB], [line]);

      const result = getContextSource(reality, 'agent-b');

      expect(isInheritContext(result)).toBe(true);
      expect((result as InheritContextResult).fromNodeId).toBe('agent-a');
    });
  });

  // ============================================
  // T005: Edge Case Tests (Walk-Back)
  // ============================================

  describe('Rule 2 walk-back: cross-line skips non-agent lines (DYK-I10)', () => {
    it('walks past line with only code nodes to find agent on earlier line', () => {
      const agentLine0 = makeNode({
        nodeId: 'agent-0',
        unitType: 'agent',
        lineIndex: 0,
        positionInLine: 0,
      });
      const codeLine1 = makeNode({
        nodeId: 'code-1',
        unitType: 'code',
        lineIndex: 1,
        positionInLine: 0,
      });
      const agentLine2 = makeNode({
        nodeId: 'agent-2',
        unitType: 'agent',
        lineIndex: 2,
        positionInLine: 0,
      });
      const line0 = makeLine({
        lineId: 'line-0',
        index: 0,
        nodeIds: ['agent-0'],
      });
      const line1 = makeLine({
        lineId: 'line-1',
        index: 1,
        nodeIds: ['code-1'],
      });
      const line2 = makeLine({
        lineId: 'line-2',
        index: 2,
        nodeIds: ['agent-2'],
      });
      const reality = makeReality([agentLine0, codeLine1, agentLine2], [line0, line1, line2]);

      const result = getContextSource(reality, 'agent-2');

      // Line 1 has no agent, so walk-back continues to line 0
      expect(isInheritContext(result)).toBe(true);
      expect((result as InheritContextResult).fromNodeId).toBe('agent-0');
    });
  });

  describe('Rule 2 walk-back: no agent on any previous line → new', () => {
    it('returns new when all previous lines have only non-agent nodes', () => {
      const codeLine0 = makeNode({
        nodeId: 'code-0',
        unitType: 'code',
        lineIndex: 0,
        positionInLine: 0,
      });
      const codeLine1 = makeNode({
        nodeId: 'code-1',
        unitType: 'code',
        lineIndex: 1,
        positionInLine: 0,
      });
      const agentLine2 = makeNode({
        nodeId: 'agent-2',
        unitType: 'agent',
        lineIndex: 2,
        positionInLine: 0,
      });
      const line0 = makeLine({
        lineId: 'line-0',
        index: 0,
        nodeIds: ['code-0'],
      });
      const line1 = makeLine({
        lineId: 'line-1',
        index: 1,
        nodeIds: ['code-1'],
      });
      const line2 = makeLine({
        lineId: 'line-2',
        index: 2,
        nodeIds: ['agent-2'],
      });
      const reality = makeReality([codeLine0, codeLine1, agentLine2], [line0, line1, line2]);

      const result = getContextSource(reality, 'agent-2');

      expect(isNewContext(result)).toBe(true);
    });
  });

  describe('Rule 4 walk-back: serial walks past code nodes (DYK-I13)', () => {
    it('walks left past code node to find agent', () => {
      const agentA = makeNode({
        nodeId: 'agent-a',
        unitType: 'agent',
        lineIndex: 0,
        positionInLine: 0,
        execution: 'serial',
      });
      const codeB = makeNode({
        nodeId: 'code-b',
        unitType: 'code',
        lineIndex: 0,
        positionInLine: 1,
        execution: 'serial',
      });
      const agentC = makeNode({
        nodeId: 'agent-c',
        unitType: 'agent',
        lineIndex: 0,
        positionInLine: 2,
        execution: 'serial',
      });
      const line = makeLine({
        lineId: 'line-0',
        index: 0,
        nodeIds: ['agent-a', 'code-b', 'agent-c'],
      });
      const reality = makeReality([agentA, codeB, agentC], [line]);

      const result = getContextSource(reality, 'agent-c');

      expect(isInheritContext(result)).toBe(true);
      expect((result as InheritContextResult).fromNodeId).toBe('agent-a');
    });
  });

  describe('Rule 4 walk-back: serial walks past user-input nodes', () => {
    it('walks left past user-input node to find agent', () => {
      const agentA = makeNode({
        nodeId: 'agent-a',
        unitType: 'agent',
        lineIndex: 0,
        positionInLine: 0,
        execution: 'serial',
      });
      const uiB = makeNode({
        nodeId: 'ui-b',
        unitType: 'user-input',
        lineIndex: 0,
        positionInLine: 1,
        execution: 'serial',
      });
      const agentC = makeNode({
        nodeId: 'agent-c',
        unitType: 'agent',
        lineIndex: 0,
        positionInLine: 2,
        execution: 'serial',
      });
      const line = makeLine({
        lineId: 'line-0',
        index: 0,
        nodeIds: ['agent-a', 'ui-b', 'agent-c'],
      });
      const reality = makeReality([agentA, uiB, agentC], [line]);

      const result = getContextSource(reality, 'agent-c');

      expect(isInheritContext(result)).toBe(true);
      expect((result as InheritContextResult).fromNodeId).toBe('agent-a');
    });
  });

  describe('Rule 4 walk-back: serial inherits from parallel agent', () => {
    it('inherits from parallel agent to its left (DYK-I13 updated)', () => {
      const parallelA = makeNode({
        nodeId: 'parallel-a',
        unitType: 'agent',
        lineIndex: 0,
        positionInLine: 0,
        execution: 'parallel',
      });
      const serialB = makeNode({
        nodeId: 'serial-b',
        unitType: 'agent',
        lineIndex: 0,
        positionInLine: 1,
        execution: 'serial',
      });
      const line = makeLine({
        lineId: 'line-0',
        index: 0,
        nodeIds: ['parallel-a', 'serial-b'],
      });
      const reality = makeReality([parallelA, serialB], [line]);

      const result = getContextSource(reality, 'serial-b');

      // Parallel mode only affects the parallel node itself — serial can inherit from it
      expect(isInheritContext(result)).toBe(true);
      expect((result as InheritContextResult).fromNodeId).toBe('parallel-a');
    });
  });

  describe('Rule 4 walk-back: no agent to the left → new', () => {
    it('returns new when only code nodes are to the left', () => {
      const codeA = makeNode({
        nodeId: 'code-a',
        unitType: 'code',
        lineIndex: 0,
        positionInLine: 0,
        execution: 'serial',
      });
      const agentB = makeNode({
        nodeId: 'agent-b',
        unitType: 'agent',
        lineIndex: 0,
        positionInLine: 1,
        execution: 'serial',
      });
      const line = makeLine({
        lineId: 'line-0',
        index: 0,
        nodeIds: ['code-a', 'agent-b'],
      });
      const reality = makeReality([codeA, agentB], [line]);

      const result = getContextSource(reality, 'agent-b');

      expect(isNewContext(result)).toBe(true);
    });
  });

  describe('Guard: node not found → not-applicable', () => {
    it('returns not-applicable for an unknown nodeId', () => {
      const line = makeLine({ lineId: 'line-0', index: 0, nodeIds: [] });
      const reality = makeReality([], [line]);

      const result = getContextSource(reality, 'nonexistent');

      expect(isNotApplicable(result)).toBe(true);
      expect(result.reason).toContain('not found');
    });
  });

  describe('Reason strings', () => {
    it('all variants include non-empty reason strings', () => {
      // Create a graph that exercises all 3 result types
      const agent0 = makeNode({
        nodeId: 'a0',
        unitType: 'agent',
        lineIndex: 0,
        positionInLine: 0,
      });
      const codeNode = makeNode({
        nodeId: 'c0',
        unitType: 'code',
        lineIndex: 0,
        positionInLine: 1,
      });
      const agent1 = makeNode({
        nodeId: 'a1',
        unitType: 'agent',
        lineIndex: 1,
        positionInLine: 0,
      });
      const line0 = makeLine({
        lineId: 'line-0',
        index: 0,
        nodeIds: ['a0', 'c0'],
      });
      const line1 = makeLine({
        lineId: 'line-1',
        index: 1,
        nodeIds: ['a1'],
      });
      const reality = makeReality([agent0, codeNode, agent1], [line0, line1]);

      // new (Rule 1)
      const newResult = getContextSource(reality, 'a0');
      expect(newResult.reason.length).toBeGreaterThan(0);

      // not-applicable (Rule 0)
      const naResult = getContextSource(reality, 'c0');
      expect(naResult.reason.length).toBeGreaterThan(0);

      // inherit (Rule 2)
      const inheritResult = getContextSource(reality, 'a1');
      expect(inheritResult.reason.length).toBeGreaterThan(0);
    });
  });
});
