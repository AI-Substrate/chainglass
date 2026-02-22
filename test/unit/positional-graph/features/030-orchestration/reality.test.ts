/**
 * Test Doc:
 * - Why: PositionalGraphReality is the foundational data model for the orchestration system.
 *   Every downstream phase (ONBAS, ODS, orchestration loop) depends on this snapshot.
 * - Contract: buildPositionalGraphReality() composes GraphStatusResult + State + pod sessions
 *   into an immutable PositionalGraphReality snapshot. Never re-implements gate logic.
 * - Usage Notes: Builder is a pure function. Tests construct GraphStatusResult and State as
 *   plain objects — no service fakes needed.
 * - Quality Contribution: Catches regressions in snapshot composition, accessor computation,
 *   and view lookups. Prevents gate logic duplication.
 * - Worked Example: GraphStatusResult with 2 lines, 3 nodes, 1 question → PositionalGraphReality
 *   with correct lines, nodes Map, questions, pod sessions, and all convenience accessors.
 */

import type { State } from '@chainglass/positional-graph';
import type {
  GraphStatusResult,
  LineStatusResult,
  NodeStatusResult,
} from '@chainglass/positional-graph/interfaces';
import { describe, expect, it } from 'vitest';
import { buildPositionalGraphReality } from '../../../../../packages/positional-graph/src/features/030-orchestration/reality.builder.js';
import { PositionalGraphRealityView } from '../../../../../packages/positional-graph/src/features/030-orchestration/reality.view.js';

// ============================================
// Test Fixture Helpers
// ============================================

function makeNodeStatus(
  overrides: Partial<NodeStatusResult> & { nodeId: string; unitSlug: string }
): NodeStatusResult {
  return {
    unitType: 'agent',
    execution: 'serial',
    lineId: 'line-000',
    position: 0,
    status: 'pending',
    ready: false,
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

function makeLineStatus(
  overrides: Partial<LineStatusResult> & { lineId: string; index: number }
): LineStatusResult {
  return {
    label: undefined,
    transition: 'auto',
    transitionTriggered: false,
    complete: false,
    empty: false,
    canRun: true,
    precedingLinesComplete: true,
    transitionOpen: true,
    starterNodes: [],
    nodes: [],
    readyNodes: [],
    runningNodes: [],
    waitingQuestionNodes: [],
    blockedNodes: [],
    completedNodes: [],
    ...overrides,
  };
}

function makeGraphStatus(overrides: Partial<GraphStatusResult> = {}): GraphStatusResult {
  return {
    graphSlug: 'test-graph',
    version: '1.0.0',
    description: 'Test graph',
    status: 'pending',
    totalNodes: 0,
    completedNodes: 0,
    lines: [],
    readyNodes: [],
    runningNodes: [],
    waitingQuestionNodes: [],
    blockedNodes: [],
    completedNodeIds: [],
    ...overrides,
  };
}

function makeState(overrides: Partial<State> = {}): State {
  return {
    graph_status: 'pending',
    updated_at: '2026-02-06T10:00:00Z',
    ...overrides,
  };
}

const SNAPSHOT_AT = '2026-02-06T12:00:00Z';

// ============================================
// T006: Builder Tests
// ============================================

describe('buildPositionalGraphReality', () => {
  describe('T006: snapshot construction', () => {
    it('builds snapshot from empty graph', () => {
      const result = buildPositionalGraphReality({
        statusResult: makeGraphStatus(),
        state: makeState(),
        snapshotAt: SNAPSHOT_AT,
      });

      expect(result.graphSlug).toBe('test-graph');
      expect(result.version).toBe('1.0.0');
      expect(result.snapshotAt).toBe(SNAPSHOT_AT);
      expect(result.graphStatus).toBe('pending');
      expect(result.lines).toHaveLength(0);
      expect(result.nodes.size).toBe(0);
      expect(result.questions).toHaveLength(0);
      expect(result.podSessions.size).toBe(0);
      expect(result.totalNodes).toBe(0);
    });

    it('maps single line with one node', () => {
      const node = makeNodeStatus({
        nodeId: 'node-001',
        unitSlug: 'spec-builder',
        unitType: 'agent',
        lineId: 'line-000',
        position: 0,
        status: 'ready',
        ready: true,
      });
      const line = makeLineStatus({
        lineId: 'line-000',
        index: 0,
        nodes: [node],
        readyNodes: ['node-001'],
      });
      const statusResult = makeGraphStatus({
        status: 'in_progress',
        totalNodes: 1,
        lines: [line],
        readyNodes: ['node-001'],
      });

      const result = buildPositionalGraphReality({
        statusResult,
        state: makeState({ graph_status: 'in_progress' }),
        snapshotAt: SNAPSHOT_AT,
      });

      expect(result.lines).toHaveLength(1);
      expect(result.lines[0].lineId).toBe('line-000');
      expect(result.lines[0].index).toBe(0);
      expect(result.lines[0].nodeIds).toEqual(['node-001']);
      expect(result.nodes.size).toBe(1);
      const nr = result.nodes.get('node-001');
      expect(nr).toBeDefined();
      expect(nr?.nodeId).toBe('node-001');
      expect(nr?.unitSlug).toBe('spec-builder');
      expect(nr?.unitType).toBe('agent');
      expect(nr?.lineIndex).toBe(0);
      expect(nr?.positionInLine).toBe(0);
      expect(nr?.status).toBe('ready');
      expect(nr?.ready).toBe(true);
    });

    it('maps multi-line graph with mixed statuses', () => {
      const node1 = makeNodeStatus({
        nodeId: 'node-001',
        unitSlug: 'user-prompt',
        unitType: 'user-input',
        lineId: 'line-000',
        position: 0,
        status: 'complete',
        ready: false,
        completedAt: '2026-02-06T10:00:00Z',
      });
      const node2 = makeNodeStatus({
        nodeId: 'node-002',
        unitSlug: 'spec-builder',
        unitType: 'agent',
        lineId: 'line-001',
        position: 0,
        status: 'running',
        ready: false,
        startedAt: '2026-02-06T10:05:00Z',
      });
      const node3 = makeNodeStatus({
        nodeId: 'node-003',
        unitSlug: 'spec-reviewer',
        unitType: 'agent',
        lineId: 'line-001',
        position: 1,
        status: 'pending',
        ready: false,
        execution: 'serial',
      });

      const line0 = makeLineStatus({
        lineId: 'line-000',
        index: 0,
        nodes: [node1],
        complete: true,
        completedNodes: ['node-001'],
      });
      const line1 = makeLineStatus({
        lineId: 'line-001',
        index: 1,
        nodes: [node2, node3],
        runningNodes: ['node-002'],
      });
      const statusResult = makeGraphStatus({
        status: 'in_progress',
        totalNodes: 3,
        completedNodes: 1,
        lines: [line0, line1],
        runningNodes: ['node-002'],
        completedNodeIds: ['node-001'],
      });

      const result = buildPositionalGraphReality({
        statusResult,
        state: makeState({ graph_status: 'in_progress' }),
        snapshotAt: SNAPSHOT_AT,
      });

      expect(result.lines).toHaveLength(2);
      expect(result.nodes.size).toBe(3);
      expect(result.nodes.get('node-001')?.status).toBe('complete');
      expect(result.nodes.get('node-002')?.status).toBe('running');
      expect(result.nodes.get('node-003')?.status).toBe('pending');
      expect(result.totalNodes).toBe(3);
      expect(result.completedCount).toBe(1);
    });

    it('maps node with pending question', () => {
      const node = makeNodeStatus({
        nodeId: 'node-001',
        unitSlug: 'coder',
        unitType: 'agent',
        lineId: 'line-000',
        position: 0,
        status: 'waiting-question',
        pendingQuestion: {
          questionId: 'q-001',
          text: 'Which approach?',
          questionType: 'single',
          options: [
            { key: 'A', label: 'Option A' },
            { key: 'B', label: 'Option B' },
          ],
          askedAt: '2026-02-06T10:00:00Z',
        },
      });
      const line = makeLineStatus({
        lineId: 'line-000',
        index: 0,
        nodes: [node],
        waitingQuestionNodes: ['node-001'],
      });
      const statusResult = makeGraphStatus({
        status: 'in_progress',
        totalNodes: 1,
        lines: [line],
        waitingQuestionNodes: ['node-001'],
      });

      const result = buildPositionalGraphReality({
        statusResult,
        state: makeState({ graph_status: 'in_progress' }),
        snapshotAt: SNAPSHOT_AT,
      });

      const nr = result.nodes.get('node-001');
      expect(nr).toBeDefined();
      expect(nr?.pendingQuestionId).toBe('q-001');
    });

    it('maps node with error', () => {
      const node = makeNodeStatus({
        nodeId: 'node-001',
        unitSlug: 'coder',
        unitType: 'agent',
        lineId: 'line-000',
        position: 0,
        status: 'blocked-error',
        error: { code: 'E500', message: 'Agent crashed', occurredAt: '2026-02-06T10:00:00Z' },
      });
      const line = makeLineStatus({
        lineId: 'line-000',
        index: 0,
        nodes: [node],
        blockedNodes: ['node-001'],
      });
      const statusResult = makeGraphStatus({
        status: 'failed',
        totalNodes: 1,
        lines: [line],
        blockedNodes: ['node-001'],
      });

      const result = buildPositionalGraphReality({
        statusResult,
        state: makeState({ graph_status: 'failed' }),
        snapshotAt: SNAPSHOT_AT,
      });

      const nr = result.nodes.get('node-001');
      expect(nr).toBeDefined();
      expect(nr?.error).toEqual({
        code: 'E500',
        message: 'Agent crashed',
        occurredAt: '2026-02-06T10:00:00Z',
      });
    });

    it('maps questions with 3 lifecycle states', () => {
      const statusResult = makeGraphStatus({ status: 'in_progress', totalNodes: 1 });
      const state = makeState({
        graph_status: 'in_progress',
        questions: [
          // Asked only (not surfaced)
          {
            question_id: 'q-001',
            node_id: 'node-001',
            type: 'text',
            text: 'What name?',
            asked_at: '2026-02-06T10:00:00Z',
          },
          // Surfaced (surfaced_at set, no answer)
          {
            question_id: 'q-002',
            node_id: 'node-002',
            type: 'single',
            text: 'Which approach?',
            options: ['A', 'B'],
            asked_at: '2026-02-06T10:01:00Z',
            surfaced_at: '2026-02-06T10:02:00Z',
          },
          // Answered
          {
            question_id: 'q-003',
            node_id: 'node-003',
            type: 'confirm',
            text: 'Continue?',
            asked_at: '2026-02-06T10:00:00Z',
            surfaced_at: '2026-02-06T10:01:00Z',
            answer: true,
            answered_at: '2026-02-06T10:05:00Z',
          },
        ],
      });

      const result = buildPositionalGraphReality({
        statusResult,
        state,
        snapshotAt: SNAPSHOT_AT,
      });

      expect(result.questions).toHaveLength(3);

      // Asked only
      const q1 = result.questions[0];
      expect(q1.questionId).toBe('q-001');
      expect(q1.isSurfaced).toBe(false);
      expect(q1.isAnswered).toBe(false);
      expect(q1.surfacedAt).toBeUndefined();

      // Surfaced
      const q2 = result.questions[1];
      expect(q2.questionId).toBe('q-002');
      expect(q2.isSurfaced).toBe(true);
      expect(q2.isAnswered).toBe(false);
      expect(q2.surfacedAt).toBe('2026-02-06T10:02:00Z');
      // DYK-I2: options normalized from string[] to { key, label }[]
      expect(q2.options).toEqual([
        { key: 'A', label: 'A' },
        { key: 'B', label: 'B' },
      ]);

      // Answered
      const q3 = result.questions[2];
      expect(q3.questionId).toBe('q-003');
      expect(q3.isSurfaced).toBe(true);
      expect(q3.isAnswered).toBe(true);
      expect(q3.answer).toBe(true);
      expect(q3.answeredAt).toBe('2026-02-06T10:05:00Z');
    });

    it('maps pod sessions from input Map', () => {
      const statusResult = makeGraphStatus({ totalNodes: 2 });
      const podSessions = new Map([
        ['node-001', 'session-abc'],
        ['node-002', 'session-def'],
      ]);

      const result = buildPositionalGraphReality({
        statusResult,
        state: makeState(),
        podSessions,
        snapshotAt: SNAPSHOT_AT,
      });

      expect(result.podSessions.size).toBe(2);
      expect(result.podSessions.get('node-001')).toBe('session-abc');
      expect(result.podSessions.get('node-002')).toBe('session-def');
    });

    it('preserves InputPack on NodeReality', () => {
      const inputPack = {
        ok: true,
        inputs: {
          spec: {
            status: 'available' as const,
            detail: {
              inputName: 'spec',
              required: true,
              sources: [{ sourceNodeId: 'node-000', sourceOutput: 'spec', data: 'hello' }],
            },
          },
        },
      };
      const node = makeNodeStatus({
        nodeId: 'node-001',
        unitSlug: 'coder',
        unitType: 'agent',
        lineId: 'line-000',
        position: 0,
        status: 'ready',
        ready: true,
        inputPack,
      });
      const line = makeLineStatus({
        lineId: 'line-000',
        index: 0,
        nodes: [node],
      });
      const statusResult = makeGraphStatus({ totalNodes: 1, lines: [line] });

      const result = buildPositionalGraphReality({
        statusResult,
        state: makeState(),
        snapshotAt: SNAPSHOT_AT,
      });

      const nr = result.nodes.get('node-001');
      expect(nr).toBeDefined();
      expect(nr?.inputPack).toEqual(inputPack);
    });

    it('uses current timestamp when snapshotAt not provided', () => {
      const before = new Date().toISOString();
      const result = buildPositionalGraphReality({
        statusResult: makeGraphStatus(),
        state: makeState(),
      });
      const after = new Date().toISOString();

      expect(result.snapshotAt >= before).toBe(true);
      expect(result.snapshotAt <= after).toBe(true);
    });

    it('defaults podSessions to empty Map when not provided', () => {
      const result = buildPositionalGraphReality({
        statusResult: makeGraphStatus(),
        state: makeState(),
        snapshotAt: SNAPSHOT_AT,
      });

      expect(result.podSessions.size).toBe(0);
    });

    it('maps line properties correctly', () => {
      const line = makeLineStatus({
        lineId: 'line-000',
        index: 0,
        label: 'Setup',
        transition: 'manual',
        transitionTriggered: true,
        complete: true,
        empty: false,
        canRun: false,
        precedingLinesComplete: true,
        transitionOpen: true,
        nodes: [],
      });
      const statusResult = makeGraphStatus({ lines: [line] });

      const result = buildPositionalGraphReality({
        statusResult,
        state: makeState(),
        snapshotAt: SNAPSHOT_AT,
      });

      const lr = result.lines[0];
      expect(lr.lineId).toBe('line-000');
      expect(lr.label).toBe('Setup');
      expect(lr.transition).toBe('manual');
      expect(lr.transitionTriggered).toBe(true);
      expect(lr.isComplete).toBe(true);
      expect(lr.isEmpty).toBe(false);
      expect(lr.canRun).toBe(false);
      expect(lr.precedingLinesComplete).toBe(true);
      expect(lr.transitionOpen).toBe(true);
    });

    it('maps readyDetail from NodeStatusResult', () => {
      const node = makeNodeStatus({
        nodeId: 'node-001',
        unitSlug: 'coder',
        unitType: 'agent',
        lineId: 'line-000',
        position: 0,
        status: 'pending',
        ready: false,
        readyDetail: {
          precedingLinesComplete: false,
          transitionOpen: true,
          serialNeighborComplete: true,
          inputsAvailable: false,
          unitFound: true,
          reason: 'Waiting for preceding lines',
        },
      });
      const line = makeLineStatus({ lineId: 'line-000', index: 0, nodes: [node] });
      const statusResult = makeGraphStatus({ totalNodes: 1, lines: [line] });

      const result = buildPositionalGraphReality({
        statusResult,
        state: makeState(),
        snapshotAt: SNAPSHOT_AT,
      });

      const nr = result.nodes.get('node-001');
      expect(nr).toBeDefined();
      expect(nr?.readyDetail.precedingLinesComplete).toBe(false);
      expect(nr?.readyDetail.inputsAvailable).toBe(false);
      expect(nr?.readyDetail.reason).toBe('Waiting for preceding lines');
    });
  });

  // ============================================
  // T008: Convenience Accessor Tests
  // ============================================

  describe('T008: convenience accessors', () => {
    it('isComplete is true when graphStatus is complete', () => {
      const node = makeNodeStatus({
        nodeId: 'node-001',
        unitSlug: 'task',
        unitType: 'agent',
        lineId: 'line-000',
        position: 0,
        status: 'complete',
        completedAt: '2026-02-06T10:00:00Z',
      });
      const line = makeLineStatus({
        lineId: 'line-000',
        index: 0,
        complete: true,
        nodes: [node],
        completedNodes: ['node-001'],
      });
      const statusResult = makeGraphStatus({
        status: 'complete',
        totalNodes: 1,
        completedNodes: 1,
        lines: [line],
        completedNodeIds: ['node-001'],
      });

      const result = buildPositionalGraphReality({
        statusResult,
        state: makeState({ graph_status: 'complete' }),
        snapshotAt: SNAPSHOT_AT,
      });

      expect(result.isComplete).toBe(true);
      expect(result.isFailed).toBe(false);
    });

    it('isFailed is true when graphStatus is failed', () => {
      const node = makeNodeStatus({
        nodeId: 'node-001',
        unitSlug: 'task',
        unitType: 'agent',
        lineId: 'line-000',
        position: 0,
        status: 'blocked-error',
        error: { code: 'E500', message: 'fail', occurredAt: '2026-02-06T10:00:00Z' },
      });
      const line = makeLineStatus({
        lineId: 'line-000',
        index: 0,
        nodes: [node],
        blockedNodes: ['node-001'],
      });
      const statusResult = makeGraphStatus({
        status: 'failed',
        totalNodes: 1,
        lines: [line],
        blockedNodes: ['node-001'],
      });

      const result = buildPositionalGraphReality({
        statusResult,
        state: makeState({ graph_status: 'failed' }),
        snapshotAt: SNAPSHOT_AT,
      });

      expect(result.isFailed).toBe(true);
      expect(result.isComplete).toBe(false);
    });

    it('readyNodeIds contains only ready nodes', () => {
      const n1 = makeNodeStatus({
        nodeId: 'node-001',
        unitSlug: 'a',
        unitType: 'agent',
        lineId: 'line-000',
        position: 0,
        status: 'ready',
        ready: true,
      });
      const n2 = makeNodeStatus({
        nodeId: 'node-002',
        unitSlug: 'b',
        unitType: 'agent',
        lineId: 'line-000',
        position: 1,
        status: 'ready',
        ready: true,
        execution: 'parallel',
      });
      const n3 = makeNodeStatus({
        nodeId: 'node-003',
        unitSlug: 'c',
        unitType: 'agent',
        lineId: 'line-000',
        position: 2,
        status: 'running',
        execution: 'parallel',
      });
      const line = makeLineStatus({
        lineId: 'line-000',
        index: 0,
        nodes: [n1, n2, n3],
        readyNodes: ['node-001', 'node-002'],
        runningNodes: ['node-003'],
      });
      const statusResult = makeGraphStatus({
        status: 'in_progress',
        totalNodes: 3,
        lines: [line],
        readyNodes: ['node-001', 'node-002'],
        runningNodes: ['node-003'],
      });

      const result = buildPositionalGraphReality({
        statusResult,
        state: makeState({ graph_status: 'in_progress' }),
        snapshotAt: SNAPSHOT_AT,
      });

      expect(result.readyNodeIds).toEqual(['node-001', 'node-002']);
      expect(result.runningNodeIds).toEqual(['node-003']);
    });

    it('currentLineIndex points to first incomplete line', () => {
      const n1 = makeNodeStatus({
        nodeId: 'node-001',
        unitSlug: 'a',
        unitType: 'user-input',
        lineId: 'line-000',
        position: 0,
        status: 'complete',
      });
      const n2 = makeNodeStatus({
        nodeId: 'node-002',
        unitSlug: 'b',
        unitType: 'agent',
        lineId: 'line-001',
        position: 0,
        status: 'ready',
        ready: true,
      });
      const line0 = makeLineStatus({
        lineId: 'line-000',
        index: 0,
        complete: true,
        nodes: [n1],
      });
      const line1 = makeLineStatus({
        lineId: 'line-001',
        index: 1,
        nodes: [n2],
      });
      const statusResult = makeGraphStatus({
        status: 'in_progress',
        totalNodes: 2,
        lines: [line0, line1],
      });

      const result = buildPositionalGraphReality({
        statusResult,
        state: makeState({ graph_status: 'in_progress' }),
        snapshotAt: SNAPSHOT_AT,
      });

      expect(result.currentLineIndex).toBe(1);
    });

    it('DYK-I3: currentLineIndex equals lines.length when all lines complete', () => {
      const n1 = makeNodeStatus({
        nodeId: 'node-001',
        unitSlug: 'a',
        unitType: 'user-input',
        lineId: 'line-000',
        position: 0,
        status: 'complete',
      });
      const n2 = makeNodeStatus({
        nodeId: 'node-002',
        unitSlug: 'b',
        unitType: 'agent',
        lineId: 'line-001',
        position: 0,
        status: 'complete',
      });
      const line0 = makeLineStatus({
        lineId: 'line-000',
        index: 0,
        complete: true,
        nodes: [n1],
      });
      const line1 = makeLineStatus({
        lineId: 'line-001',
        index: 1,
        complete: true,
        nodes: [n2],
      });
      const statusResult = makeGraphStatus({
        status: 'complete',
        totalNodes: 2,
        completedNodes: 2,
        lines: [line0, line1],
        completedNodeIds: ['node-001', 'node-002'],
      });

      const result = buildPositionalGraphReality({
        statusResult,
        state: makeState({ graph_status: 'complete' }),
        snapshotAt: SNAPSHOT_AT,
      });

      // Past-the-end sentinel: 2 lines → currentLineIndex = 2
      expect(result.currentLineIndex).toBe(2);
    });

    it('currentLineIndex is 0 for empty graph', () => {
      const result = buildPositionalGraphReality({
        statusResult: makeGraphStatus(),
        state: makeState(),
        snapshotAt: SNAPSHOT_AT,
      });

      expect(result.currentLineIndex).toBe(0);
    });

    it('pendingQuestions filters out answered questions', () => {
      const statusResult = makeGraphStatus({ status: 'in_progress', totalNodes: 2 });
      const state = makeState({
        graph_status: 'in_progress',
        questions: [
          {
            question_id: 'q-001',
            node_id: 'n1',
            type: 'text',
            text: 'Q1?',
            asked_at: '2026-02-06T10:00:00Z',
          },
          {
            question_id: 'q-002',
            node_id: 'n2',
            type: 'text',
            text: 'Q2?',
            asked_at: '2026-02-06T10:00:00Z',
            answer: 'yes',
            answered_at: '2026-02-06T10:05:00Z',
          },
        ],
      });

      const result = buildPositionalGraphReality({
        statusResult,
        state,
        snapshotAt: SNAPSHOT_AT,
      });

      expect(result.pendingQuestions).toHaveLength(1);
      expect(result.pendingQuestions[0].questionId).toBe('q-001');
    });

    it('totalNodes and completedCount from statusResult', () => {
      const statusResult = makeGraphStatus({ totalNodes: 5, completedNodes: 3 });
      const result = buildPositionalGraphReality({
        statusResult,
        state: makeState(),
        snapshotAt: SNAPSHOT_AT,
      });

      expect(result.totalNodes).toBe(5);
      expect(result.completedCount).toBe(3);
    });

    it('waitingQuestionNodeIds and blockedNodeIds from statusResult', () => {
      const statusResult = makeGraphStatus({
        status: 'in_progress',
        waitingQuestionNodes: ['node-001'],
        blockedNodes: ['node-002'],
      });
      const result = buildPositionalGraphReality({
        statusResult,
        state: makeState({ graph_status: 'in_progress' }),
        snapshotAt: SNAPSHOT_AT,
      });

      expect(result.waitingQuestionNodeIds).toEqual(['node-001']);
      expect(result.blockedNodeIds).toEqual(['node-002']);
    });

    it('completedNodeIds from statusResult', () => {
      const statusResult = makeGraphStatus({
        completedNodeIds: ['node-001', 'node-002'],
      });
      const result = buildPositionalGraphReality({
        statusResult,
        state: makeState(),
        snapshotAt: SNAPSHOT_AT,
      });

      expect(result.completedNodeIds).toEqual(['node-001', 'node-002']);
    });
  });
});

// ============================================
// T010: PositionalGraphRealityView Lookup Tests
// ============================================

describe('PositionalGraphRealityView', () => {
  // Shared multi-line fixture: line-0 (complete user-input + agent serial), line-1 (ready agent)
  function buildMultiLineView() {
    const node1 = makeNodeStatus({
      nodeId: 'node-001',
      unitSlug: 'user-prompt',
      unitType: 'user-input',
      lineId: 'line-000',
      position: 0,
      status: 'complete',
      ready: false,
      execution: 'serial',
      completedAt: '2026-02-06T10:00:00Z',
    });
    const node2 = makeNodeStatus({
      nodeId: 'node-002',
      unitSlug: 'spec-builder',
      unitType: 'agent',
      lineId: 'line-000',
      position: 1,
      status: 'complete',
      ready: false,
      execution: 'serial',
      completedAt: '2026-02-06T10:05:00Z',
    });
    const node3 = makeNodeStatus({
      nodeId: 'node-003',
      unitSlug: 'spec-reviewer',
      unitType: 'agent',
      lineId: 'line-001',
      position: 0,
      status: 'ready',
      ready: true,
    });

    const line0 = makeLineStatus({
      lineId: 'line-000',
      index: 0,
      nodes: [node1, node2],
      complete: true,
      completedNodes: ['node-001', 'node-002'],
    });
    const line1 = makeLineStatus({
      lineId: 'line-001',
      index: 1,
      nodes: [node3],
      readyNodes: ['node-003'],
    });

    const statusResult = makeGraphStatus({
      status: 'in_progress',
      totalNodes: 3,
      completedNodes: 2,
      lines: [line0, line1],
      readyNodes: ['node-003'],
      completedNodeIds: ['node-001', 'node-002'],
    });

    const state = makeState({
      graph_status: 'in_progress',
      questions: [
        {
          question_id: 'q-001',
          node_id: 'node-001',
          type: 'text',
          text: 'Enter project name',
          asked_at: '2026-02-06T09:55:00Z',
          surfaced_at: '2026-02-06T09:56:00Z',
          answer: 'my-project',
          answered_at: '2026-02-06T09:57:00Z',
        },
      ],
    });

    const podSessions = new Map([['node-002', 'session-abc']]);

    const reality = buildPositionalGraphReality({
      statusResult,
      state,
      podSessions,
      snapshotAt: SNAPSHOT_AT,
    });

    return new PositionalGraphRealityView(reality);
  }

  describe('T010-1: node and line lookups', () => {
    it('getNode returns correct NodeReality for existing node', () => {
      const view = buildMultiLineView();
      const node = view.getNode('node-002');

      expect(node).toBeDefined();
      expect(node?.nodeId).toBe('node-002');
      expect(node?.unitSlug).toBe('spec-builder');
      expect(node?.unitType).toBe('agent');
    });

    it('getNode returns undefined for missing node', () => {
      const view = buildMultiLineView();
      expect(view.getNode('nonexistent')).toBeUndefined();
    });

    it('getLine returns correct LineReality for existing line', () => {
      const view = buildMultiLineView();
      const line = view.getLine('line-001');

      expect(line).toBeDefined();
      expect(line?.lineId).toBe('line-001');
      expect(line?.index).toBe(1);
    });

    it('getLine returns undefined for missing line', () => {
      const view = buildMultiLineView();
      expect(view.getLine('nonexistent')).toBeUndefined();
    });

    it('getLineByIndex returns correct line', () => {
      const view = buildMultiLineView();
      const line = view.getLineByIndex(0);

      expect(line).toBeDefined();
      expect(line?.lineId).toBe('line-000');
    });

    it('getLineByIndex returns undefined for out-of-range index', () => {
      const view = buildMultiLineView();
      expect(view.getLineByIndex(99)).toBeUndefined();
    });

    it('getNodesByLine returns all nodes on the line in order', () => {
      const view = buildMultiLineView();
      const nodes = view.getNodesByLine('line-000');

      expect(nodes).toHaveLength(2);
      expect(nodes[0].nodeId).toBe('node-001');
      expect(nodes[1].nodeId).toBe('node-002');
    });

    it('getNodesByLine returns empty array for missing line', () => {
      const view = buildMultiLineView();
      expect(view.getNodesByLine('nonexistent')).toEqual([]);
    });
  });

  describe('T010-2: neighbor lookups', () => {
    it('getLeftNeighbor returns previous serial node on same line', () => {
      const view = buildMultiLineView();
      const left = view.getLeftNeighbor('node-002');

      expect(left).toBeDefined();
      expect(left?.nodeId).toBe('node-001');
    });

    it('getLeftNeighbor returns undefined for first node in line', () => {
      const view = buildMultiLineView();
      expect(view.getLeftNeighbor('node-001')).toBeUndefined();
    });

    it('getLeftNeighbor returns undefined for missing node', () => {
      const view = buildMultiLineView();
      expect(view.getLeftNeighbor('nonexistent')).toBeUndefined();
    });
  });

  describe('T010-3: question, pod session, and utility lookups', () => {
    it('getQuestion returns correct QuestionReality', () => {
      const view = buildMultiLineView();
      const q = view.getQuestion('q-001');

      expect(q).toBeDefined();
      expect(q?.questionId).toBe('q-001');
      expect(q?.text).toBe('Enter project name');
      expect(q?.isAnswered).toBe(true);
    });

    it('getQuestion returns undefined for missing question', () => {
      const view = buildMultiLineView();
      expect(view.getQuestion('nonexistent')).toBeUndefined();
    });

    it('getPodSession returns session ID for node with session', () => {
      const view = buildMultiLineView();
      expect(view.getPodSession('node-002')).toBe('session-abc');
    });

    it('getPodSession returns undefined for node without session', () => {
      const view = buildMultiLineView();
      expect(view.getPodSession('node-001')).toBeUndefined();
    });

    it('isFirstInLine returns true for position-0 node', () => {
      const view = buildMultiLineView();
      expect(view.isFirstInLine('node-001')).toBe(true);
      expect(view.isFirstInLine('node-003')).toBe(true);
    });

    it('isFirstInLine returns false for non-first node', () => {
      const view = buildMultiLineView();
      expect(view.isFirstInLine('node-002')).toBe(false);
    });

    it('isFirstInLine returns false for missing node', () => {
      const view = buildMultiLineView();
      expect(view.isFirstInLine('nonexistent')).toBe(false);
    });

    it('getCurrentLine returns first incomplete line', () => {
      const view = buildMultiLineView();
      const current = view.getCurrentLine();

      expect(current).toBeDefined();
      expect(current?.lineId).toBe('line-001');
      expect(current?.index).toBe(1);
    });

    it('getCurrentLine returns undefined when all lines complete', () => {
      const node1 = makeNodeStatus({
        nodeId: 'n1',
        unitSlug: 'task',
        unitType: 'agent',
        lineId: 'l0',
        position: 0,
        status: 'complete',
        ready: false,
      });
      const line0 = makeLineStatus({ lineId: 'l0', index: 0, nodes: [node1], complete: true });
      const statusResult = makeGraphStatus({
        status: 'complete',
        totalNodes: 1,
        completedNodes: 1,
        lines: [line0],
        completedNodeIds: ['n1'],
      });
      const reality = buildPositionalGraphReality({
        statusResult,
        state: makeState({ graph_status: 'complete' }),
        snapshotAt: SNAPSHOT_AT,
      });
      const view = new PositionalGraphRealityView(reality);

      // DYK-I3: currentLineIndex === lines.length (past-the-end sentinel)
      expect(view.getCurrentLine()).toBeUndefined();
    });

    it('data getter returns underlying PositionalGraphReality', () => {
      const view = buildMultiLineView();
      const data = view.data;

      expect(data.graphSlug).toBe('test-graph');
      expect(data.nodes.size).toBe(3);
    });
  });
});
