/*
Test Doc:
- Why: ONBAS is the decision engine that determines the next action from a graph snapshot (AC-3, AC-4)
- Contract: walkForNextAction is pure, synchronous, stateless; walks lines 0→N, nodes by position;
            returns first actionable OrchestrationRequest; waiting-question always skips (event-based lifecycle per Workshop 12)
- Usage Notes: Import walkForNextAction from onbas.ts; pass a PositionalGraphReality; get an OrchestrationRequest
- Quality Contribution: Prevents walk order bugs, incorrect no-action reasons; confirms question lifecycle is fully event-driven
- Worked Example: buildFakeReality({ nodes: [{ nodeId: 'A', status: 'ready' }] }) → walkForNextAction → { type: 'start-node', nodeId: 'A' }
*/

import { describe, expect, it } from 'vitest';

import {
  FakeONBAS,
  buildFakeReality,
} from '../../../../../packages/positional-graph/src/features/030-orchestration/fake-onbas.js';
import {
  ONBAS,
  walkForNextAction,
} from '../../../../../packages/positional-graph/src/features/030-orchestration/onbas.js';

// ═══════════════════════════════════════════════════════
// FakeONBAS sanity tests (T001 verification)
// ═══════════════════════════════════════════════════════

describe('FakeONBAS', () => {
  it('returns no-action by default when no action configured', () => {
    const fake = new FakeONBAS();
    const reality = buildFakeReality();
    const result = fake.getNextAction(reality);
    expect(result.type).toBe('no-action');
  });

  it('returns configured action via setNextAction', () => {
    const fake = new FakeONBAS();
    const action = {
      type: 'start-node' as const,
      graphSlug: 'g',
      nodeId: 'A',
      inputs: { ok: true, inputs: {} },
    };
    fake.setNextAction(action);

    const result = fake.getNextAction(buildFakeReality());
    expect(result).toEqual(action);
  });

  it('queues multiple actions via setActions — last repeats', () => {
    const fake = new FakeONBAS();
    const a1 = {
      type: 'start-node' as const,
      graphSlug: 'g',
      nodeId: 'A',
      inputs: { ok: true, inputs: {} },
    };
    const a2 = { type: 'no-action' as const, graphSlug: 'g', reason: 'graph-complete' as const };
    fake.setActions([a1, a2]);

    expect(fake.getNextAction(buildFakeReality())).toEqual(a1);
    expect(fake.getNextAction(buildFakeReality())).toEqual(a2);
    expect(fake.getNextAction(buildFakeReality())).toEqual(a2); // last repeats
  });

  it('tracks call history', () => {
    const fake = new FakeONBAS();
    const r1 = buildFakeReality({ graphSlug: 'g1' });
    const r2 = buildFakeReality({ graphSlug: 'g2' });
    fake.getNextAction(r1);
    fake.getNextAction(r2);
    expect(fake.getHistory()).toHaveLength(2);
    expect(fake.getHistory()[0].graphSlug).toBe('g1');
    expect(fake.getHistory()[1].graphSlug).toBe('g2');
  });

  it('reset clears everything', () => {
    const fake = new FakeONBAS();
    fake.setNextAction({ type: 'no-action', graphSlug: 'g', reason: 'graph-complete' });
    fake.getNextAction(buildFakeReality());
    fake.reset();
    expect(fake.getHistory()).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════
// ONBAS class wrapper
// ═══════════════════════════════════════════════════════

describe('ONBAS class wrapper', () => {
  it('delegates to walkForNextAction', () => {
    const onbas = new ONBAS();
    const reality = buildFakeReality({
      nodes: [{ nodeId: 'A', status: 'ready' }],
    });
    const result = onbas.getNextAction(reality);
    expect(result.type).toBe('start-node');
  });
});

// ═══════════════════════════════════════════════════════
// T002: Basic walk tests
// ═══════════════════════════════════════════════════════

describe('walkForNextAction — basic walk', () => {
  it('returns start-node for a single ready node', () => {
    const reality = buildFakeReality({
      nodes: [{ nodeId: 'A', status: 'ready' }],
    });

    const result = walkForNextAction(reality);

    expect(result).toEqual({
      type: 'start-node',
      graphSlug: 'test-graph',
      nodeId: 'A',
      inputs: { ok: true, inputs: {} },
    });
  });

  it('returns graph-complete when graph is already complete', () => {
    const reality = buildFakeReality({
      graphStatus: 'complete',
      nodes: [{ nodeId: 'A', status: 'complete' }],
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
      nodes: [{ nodeId: 'A', status: 'blocked-error' }],
    });

    const result = walkForNextAction(reality);

    expect(result).toEqual({
      type: 'no-action',
      graphSlug: 'test-graph',
      reason: 'graph-failed',
    });
  });

  it('returns no-action for empty graph (no nodes)', () => {
    const reality = buildFakeReality({
      nodes: [],
      lines: [{ nodeIds: [] }],
    });

    const result = walkForNextAction(reality);

    expect(result.type).toBe('no-action');
    expect(result).toHaveProperty('reason', 'graph-complete');
  });

  it('passes custom inputs through to start-node', () => {
    const reality = buildFakeReality({
      nodes: [{ nodeId: 'A', status: 'ready', inputPack: { ok: true, inputs: { name: 'test' } } }],
    });

    const result = walkForNextAction(reality);

    expect(result).toMatchObject({
      type: 'start-node',
      inputs: { ok: true, inputs: { name: 'test' } },
    });
  });
});

// ═══════════════════════════════════════════════════════
// T003: Multi-line walk order tests
// ═══════════════════════════════════════════════════════

describe('walkForNextAction — multi-line walk order', () => {
  it('visits lines in index order (0, 1, 2)', () => {
    const reality = buildFakeReality({
      lines: [{ nodeIds: ['A'], isComplete: true }, { nodeIds: ['B'] }],
      nodes: [
        { nodeId: 'A', status: 'complete', lineIndex: 0, positionInLine: 0 },
        { nodeId: 'B', status: 'ready', lineIndex: 1, positionInLine: 0 },
      ],
    });

    const result = walkForNextAction(reality);

    expect(result).toMatchObject({ type: 'start-node', nodeId: 'B' });
  });

  it('visits nodes by position within a line', () => {
    const reality = buildFakeReality({
      nodes: [
        { nodeId: 'B', status: 'complete', positionInLine: 0 },
        { nodeId: 'A', status: 'ready', positionInLine: 1 },
        { nodeId: 'C', status: 'ready', positionInLine: 2 },
      ],
      lines: [{ nodeIds: ['B', 'A', 'C'] }],
    });

    const result = walkForNextAction(reality);

    // First actionable after B (complete, skip) is A at position 1
    expect(result).toMatchObject({ type: 'start-node', nodeId: 'A' });
  });

  it('first actionable stops walk — does not continue to later nodes', () => {
    const reality = buildFakeReality({
      nodes: [
        { nodeId: 'A', status: 'ready', positionInLine: 0 },
        { nodeId: 'B', status: 'ready', positionInLine: 1 },
      ],
      lines: [{ nodeIds: ['A', 'B'] }],
    });

    const result = walkForNextAction(reality);

    // Should return A (first actionable), not B
    expect(result).toMatchObject({ type: 'start-node', nodeId: 'A' });
  });

  it('crosses from complete line to next line', () => {
    const reality = buildFakeReality({
      lines: [
        { nodeIds: ['A'], isComplete: true },
        { nodeIds: ['B'], isComplete: true },
        { nodeIds: ['C'] },
      ],
      nodes: [
        { nodeId: 'A', status: 'complete', lineIndex: 0, positionInLine: 0 },
        { nodeId: 'B', status: 'complete', lineIndex: 1, positionInLine: 0 },
        { nodeId: 'C', status: 'ready', lineIndex: 2, positionInLine: 0 },
      ],
    });

    const result = walkForNextAction(reality);

    expect(result).toMatchObject({ type: 'start-node', nodeId: 'C' });
  });

  it('empty line is traversed (passthrough)', () => {
    const reality = buildFakeReality({
      lines: [{ nodeIds: [], isComplete: true }, { nodeIds: ['A'] }],
      nodes: [{ nodeId: 'A', status: 'ready', lineIndex: 1, positionInLine: 0 }],
    });

    const result = walkForNextAction(reality);

    expect(result).toMatchObject({ type: 'start-node', nodeId: 'A' });
  });

  it('walks across three lines to find ready node on last line', () => {
    const reality = buildFakeReality({
      lines: [
        { nodeIds: ['A', 'B'], isComplete: true },
        { nodeIds: ['C'], isComplete: true },
        { nodeIds: ['D'] },
      ],
      nodes: [
        { nodeId: 'A', status: 'complete', lineIndex: 0, positionInLine: 0 },
        { nodeId: 'B', status: 'complete', lineIndex: 0, positionInLine: 1 },
        { nodeId: 'C', status: 'complete', lineIndex: 1, positionInLine: 0 },
        { nodeId: 'D', status: 'ready', lineIndex: 2, positionInLine: 0 },
      ],
    });

    const result = walkForNextAction(reality);

    expect(result).toMatchObject({ type: 'start-node', nodeId: 'D' });
  });

  it('parallel node on same line is actionable even when serial neighbor is running', () => {
    const reality = buildFakeReality({
      nodes: [
        { nodeId: 'A', status: 'running', positionInLine: 0, execution: 'serial' },
        { nodeId: 'B', status: 'ready', positionInLine: 1, execution: 'parallel' },
      ],
      lines: [{ nodeIds: ['A', 'B'] }],
    });

    const result = walkForNextAction(reality);

    // A is running (skip), B is ready → start B
    expect(result).toMatchObject({ type: 'start-node', nodeId: 'B' });
  });
});

// ═══════════════════════════════════════════════════════
// T004: Waiting-question skip behavior (Workshop 12 — event-based lifecycle)
// ═══════════════════════════════════════════════════════

describe('walkForNextAction — waiting-question skip', () => {
  it('waiting-question node is always skipped regardless of question state', () => {
    const reality = buildFakeReality({
      nodes: [
        { nodeId: 'A', status: 'waiting-question', pendingQuestionId: 'q1', positionInLine: 0 },
        { nodeId: 'B', status: 'ready', positionInLine: 1 },
      ],
      questions: [
        { questionId: 'q1', nodeId: 'A', isSurfaced: true, isAnswered: true, answer: 'blue' },
      ],
      lines: [{ nodeIds: ['A', 'B'] }],
    });

    const result = walkForNextAction(reality);

    // Even with an answered question, ONBAS skips — question lifecycle is event-driven
    expect(result).toMatchObject({ type: 'start-node', nodeId: 'B' });
  });

  it('waiting-question with unsurfaced question is skipped', () => {
    const reality = buildFakeReality({
      nodes: [
        { nodeId: 'A', status: 'waiting-question', pendingQuestionId: 'q1', positionInLine: 0 },
        { nodeId: 'B', status: 'ready', positionInLine: 1 },
      ],
      questions: [
        {
          questionId: 'q1',
          nodeId: 'A',
          text: 'What?',
          questionType: 'text',
          isSurfaced: false,
          isAnswered: false,
        },
      ],
      lines: [{ nodeIds: ['A', 'B'] }],
    });

    const result = walkForNextAction(reality);

    expect(result).toMatchObject({ type: 'start-node', nodeId: 'B' });
  });

  it('sole waiting-question node on incomplete line → all-waiting', () => {
    const reality = buildFakeReality({
      nodes: [{ nodeId: 'A', status: 'waiting-question', pendingQuestionId: 'q1' }],
      questions: [{ questionId: 'q1', nodeId: 'A', isSurfaced: true, isAnswered: false }],
      lines: [{ nodeIds: ['A'], isComplete: false }],
    });

    const result = walkForNextAction(reality);

    expect(result).toEqual({
      type: 'no-action',
      graphSlug: 'test-graph',
      reason: 'all-waiting',
    });
  });
});

// ═══════════════════════════════════════════════════════
// T005: No-action scenario tests
// ═══════════════════════════════════════════════════════

describe('walkForNextAction — no-action scenarios', () => {
  it('all-running on a line → no-action with all-waiting', () => {
    const reality = buildFakeReality({
      nodes: [
        { nodeId: 'A', status: 'running' },
        { nodeId: 'B', status: 'running' },
      ],
      lines: [{ nodeIds: ['A', 'B'], isComplete: false }],
    });

    const result = walkForNextAction(reality);

    expect(result).toEqual({
      type: 'no-action',
      graphSlug: 'test-graph',
      reason: 'all-waiting',
    });
  });

  it('transition-blocked — manual transition not triggered', () => {
    const reality = buildFakeReality({
      lines: [
        { nodeIds: ['A'], isComplete: true },
        { nodeIds: ['B'], transitionOpen: false, lineId: 'line-001' },
      ],
      nodes: [
        { nodeId: 'A', status: 'complete', lineIndex: 0, positionInLine: 0 },
        { nodeId: 'B', status: 'ready', lineIndex: 1, positionInLine: 0 },
      ],
    });

    const result = walkForNextAction(reality);

    expect(result).toEqual({
      type: 'no-action',
      graphSlug: 'test-graph',
      reason: 'transition-blocked',
      lineId: 'line-001',
    });
  });

  it('waiting-question on incomplete line → all-waiting', () => {
    const reality = buildFakeReality({
      nodes: [{ nodeId: 'A', status: 'waiting-question', pendingQuestionId: 'q1' }],
      questions: [
        {
          questionId: 'q1',
          nodeId: 'A',
          isSurfaced: true,
          isAnswered: false,
        },
      ],
      lines: [{ nodeIds: ['A'], isComplete: false }],
    });

    const result = walkForNextAction(reality);

    expect(result).toEqual({
      type: 'no-action',
      graphSlug: 'test-graph',
      reason: 'all-waiting',
    });
  });

  it('diagnoseStuckLine with running+waiting → all-waiting', () => {
    const reality = buildFakeReality({
      nodes: [
        { nodeId: 'A', status: 'running', positionInLine: 0 },
        { nodeId: 'B', status: 'waiting-question', pendingQuestionId: 'q1', positionInLine: 1 },
      ],
      questions: [{ questionId: 'q1', nodeId: 'B', isSurfaced: true, isAnswered: false }],
      lines: [{ nodeIds: ['A', 'B'], isComplete: false }],
    });

    const result = walkForNextAction(reality);

    expect(result).toEqual({
      type: 'no-action',
      graphSlug: 'test-graph',
      reason: 'all-waiting',
    });
  });

  it('blocked-error only → graph-failed', () => {
    const reality = buildFakeReality({
      nodes: [{ nodeId: 'A', status: 'blocked-error' }],
      lines: [{ nodeIds: ['A'], isComplete: false }],
    });

    const result = walkForNextAction(reality);

    expect(result).toEqual({
      type: 'no-action',
      graphSlug: 'test-graph',
      reason: 'graph-failed',
    });
  });

  it('pending nodes only → all-waiting', () => {
    const reality = buildFakeReality({
      nodes: [
        { nodeId: 'A', status: 'pending' },
        { nodeId: 'B', status: 'pending' },
      ],
      lines: [{ nodeIds: ['A', 'B'], isComplete: false }],
    });

    const result = walkForNextAction(reality);

    expect(result).toEqual({
      type: 'no-action',
      graphSlug: 'test-graph',
      reason: 'all-waiting',
    });
  });

  it('lineId is present only for transition-blocked reason', () => {
    // transition-blocked has lineId
    const blockedReality = buildFakeReality({
      lines: [{ nodeIds: ['A'], transitionOpen: false, lineId: 'ln-0' }],
      nodes: [{ nodeId: 'A', status: 'ready', lineIndex: 0, positionInLine: 0 }],
    });
    const blockedResult = walkForNextAction(blockedReality);
    expect(blockedResult).toHaveProperty('lineId', 'ln-0');

    // all-waiting does NOT have lineId
    const waitingReality = buildFakeReality({
      nodes: [{ nodeId: 'A', status: 'running' }],
      lines: [{ nodeIds: ['A'], isComplete: false }],
    });
    const waitingResult = walkForNextAction(waitingReality);
    expect(waitingResult).not.toHaveProperty('lineId');
  });

  it('graph-complete short circuit does not set lineId', () => {
    const reality = buildFakeReality({
      graphStatus: 'complete',
      lines: [{ nodeIds: ['A'], isComplete: true }],
      nodes: [{ nodeId: 'A', status: 'complete' }],
    });
    const result = walkForNextAction(reality);
    expect(result).not.toHaveProperty('lineId');
  });
});

// ═══════════════════════════════════════════════════════
// T006: Skip logic tests (table-driven)
// ═══════════════════════════════════════════════════════

describe('walkForNextAction — skip logic', () => {
  const skipStatuses = ['complete', 'running', 'pending', 'blocked-error'] as const;

  it.each(skipStatuses)('skips %s node and continues walk', (status) => {
    const reality = buildFakeReality({
      nodes: [
        { nodeId: 'skip-me', status, positionInLine: 0 },
        { nodeId: 'target', status: 'ready', positionInLine: 1 },
      ],
      lines: [{ nodeIds: ['skip-me', 'target'] }],
    });

    const result = walkForNextAction(reality);

    expect(result).toMatchObject({ type: 'start-node', nodeId: 'target' });
  });

  it('ready node is not skipped — returns start-node', () => {
    const reality = buildFakeReality({
      nodes: [{ nodeId: 'A', status: 'ready' }],
    });

    const result = walkForNextAction(reality);

    expect(result.type).toBe('start-node');
  });

  it('waiting-question is always skipped (event-driven lifecycle)', () => {
    const reality = buildFakeReality({
      nodes: [
        { nodeId: 'A', status: 'waiting-question', pendingQuestionId: 'q1', positionInLine: 0 },
        { nodeId: 'B', status: 'ready', positionInLine: 1 },
      ],
      questions: [{ questionId: 'q1', nodeId: 'A', isSurfaced: true, isAnswered: false }],
      lines: [{ nodeIds: ['A', 'B'] }],
    });

    const result = walkForNextAction(reality);

    expect(result).toMatchObject({ type: 'start-node', nodeId: 'B' });
  });
});

// ═══════════════════════════════════════════════════════
// T008: Purity / determinism tests (AC-4)
// ═══════════════════════════════════════════════════════

describe('walkForNextAction — purity and determinism', () => {
  it('same input produces same output across N calls', () => {
    const reality = buildFakeReality({
      nodes: [
        { nodeId: 'A', status: 'complete', positionInLine: 0 },
        { nodeId: 'B', status: 'ready', positionInLine: 1 },
      ],
      lines: [{ nodeIds: ['A', 'B'] }],
    });

    const results = Array.from({ length: 10 }, () => walkForNextAction(reality));

    // All 10 results should be identical
    for (const result of results) {
      expect(result).toEqual(results[0]);
    }
  });

  it('does not mutate the input reality', () => {
    const reality = buildFakeReality({
      nodes: [{ nodeId: 'A', status: 'ready' }],
    });

    // Snapshot state before
    const nodesBefore = reality.nodes.size;
    const linesBefore = reality.lines.length;
    const questionsBefore = reality.questions.length;

    walkForNextAction(reality);

    // Nothing changed
    expect(reality.nodes.size).toBe(nodesBefore);
    expect(reality.lines.length).toBe(linesBefore);
    expect(reality.questions.length).toBe(questionsBefore);
  });

  it('is synchronous — returns OrchestrationRequest, not Promise', () => {
    const reality = buildFakeReality({
      nodes: [{ nodeId: 'A', status: 'ready' }],
    });

    const result = walkForNextAction(reality);

    // Not a promise
    expect(result).not.toHaveProperty('then');
    expect(result.type).toBe('start-node');
  });

  it('two different inputs produce different outputs', () => {
    const readyReality = buildFakeReality({
      nodes: [{ nodeId: 'A', status: 'ready' }],
    });
    const completeReality = buildFakeReality({
      graphStatus: 'complete',
      nodes: [{ nodeId: 'A', status: 'complete' }],
      lines: [{ nodeIds: ['A'], isComplete: true }],
    });

    const r1 = walkForNextAction(readyReality);
    const r2 = walkForNextAction(completeReality);

    expect(r1.type).toBe('start-node');
    expect(r2.type).toBe('no-action');
  });
});
