/**
 * Tests for formatGraphStatus() — Plan 036 Phase 3.
 *
 * Test Doc:
 * - Why: Validate graph status view renders correctly for all node states and graph layouts
 * - Contract: formatGraphStatus produces a log-friendly string with correct glyphs, separators, and progress
 * - Usage Notes: Uses buildFakeReality() to construct test fixtures. Set execution/ready/status explicitly.
 * - Quality Contribution: Catches glyph mapping errors, separator logic bugs, progress counting errors
 * - Worked Example: 2-line graph with 3 nodes → header + "Line 0: ✅ n1\n  Line 1: 🔶 n2 → ⚪ n3\n  Progress: 1/3 complete"
 *
 * @packageDocumentation
 */

import { describe, expect, it } from 'vitest';
import { buildFakeReality } from '../../../../../packages/positional-graph/src/features/030-orchestration/fake-onbas.js';
import { formatGraphStatus } from '../../../../../packages/positional-graph/src/features/030-orchestration/reality.format.js';

// ── Core Tests ──────────────────────────────────────────

describe('formatGraphStatus()', () => {
  it('renders header with graphSlug and status', () => {
    const reality = buildFakeReality({
      graphSlug: 'my-pipeline',
      graphStatus: 'in_progress',
      nodes: [{ nodeId: 'n1', status: 'complete' }],
    });

    const result = formatGraphStatus(reality);

    expect(result).toContain('Graph: my-pipeline (in_progress)');
  });

  it('renders complete node as ✅', () => {
    const reality = buildFakeReality({
      nodes: [{ nodeId: 'done-node', status: 'complete' }],
    });

    const result = formatGraphStatus(reality);

    expect(result).toContain('✅ done-node');
  });

  it('renders blocked-error as ❌', () => {
    const reality = buildFakeReality({
      nodes: [{ nodeId: 'err-node', status: 'blocked-error' }],
    });

    const result = formatGraphStatus(reality);

    expect(result).toContain('❌ err-node');
  });

  it('renders starting as 🔶', () => {
    const reality = buildFakeReality({
      nodes: [{ nodeId: 'run-node', status: 'starting', ready: true }],
    });

    const result = formatGraphStatus(reality);

    expect(result).toContain('🔶 run-node');
  });

  it('renders agent-accepted as 🔶', () => {
    const reality = buildFakeReality({
      nodes: [{ nodeId: 'acc-node', status: 'agent-accepted', ready: true }],
    });

    const result = formatGraphStatus(reality);

    expect(result).toContain('🔶 acc-node');
  });

  it('renders waiting-question as ⏸️', () => {
    const reality = buildFakeReality({
      nodes: [{ nodeId: 'wait-node', status: 'waiting-question' }],
    });

    const result = formatGraphStatus(reality);

    expect(result).toContain('⏸️ wait-node');
  });

  it('renders pending + ready as ⬜', () => {
    const reality = buildFakeReality({
      nodes: [{ nodeId: 'ready-node', status: 'pending', ready: true }],
    });

    const result = formatGraphStatus(reality);

    expect(result).toContain('⬜ ready-node');
  });

  it('renders pending + not-ready as ⚪', () => {
    const reality = buildFakeReality({
      nodes: [{ nodeId: 'wait-node', status: 'pending', ready: false }],
    });

    const result = formatGraphStatus(reality);

    expect(result).toContain('⚪ wait-node');
  });

  it('serial nodes use → separator', () => {
    const reality = buildFakeReality({
      lines: [{ nodeIds: ['n1', 'n2'] }],
      nodes: [
        { nodeId: 'n1', status: 'complete', positionInLine: 0 },
        { nodeId: 'n2', status: 'pending', positionInLine: 1, execution: 'serial' },
      ],
    });

    const result = formatGraphStatus(reality);

    expect(result).toContain('✅ n1 → ⚪ n2');
  });

  it('parallel nodes use │ separator', () => {
    const reality = buildFakeReality({
      lines: [{ nodeIds: ['n1', 'n2'] }],
      nodes: [
        { nodeId: 'n1', status: 'starting', ready: true, positionInLine: 0, execution: 'parallel' },
        { nodeId: 'n2', status: 'starting', ready: true, positionInLine: 1, execution: 'parallel' },
      ],
    });

    const result = formatGraphStatus(reality);

    expect(result).toContain('🔶 n1 │ 🔶 n2');
  });

  it('progress line shows count', () => {
    const reality = buildFakeReality({
      lines: [{ nodeIds: ['n1', 'n2', 'n3'] }],
      nodes: [
        { nodeId: 'n1', status: 'complete', positionInLine: 0 },
        { nodeId: 'n2', status: 'complete', positionInLine: 1 },
        { nodeId: 'n3', status: 'pending', positionInLine: 2 },
      ],
    });

    const result = formatGraphStatus(reality);

    expect(result).toContain('Progress: 2/3 complete');
  });

  it('progress shows failure count', () => {
    const reality = buildFakeReality({
      lines: [{ nodeIds: ['n1', 'n2', 'n3'] }],
      nodes: [
        { nodeId: 'n1', status: 'complete', positionInLine: 0 },
        { nodeId: 'n2', status: 'blocked-error', positionInLine: 1 },
        { nodeId: 'n3', status: 'complete', positionInLine: 2 },
      ],
    });

    const result = formatGraphStatus(reality);

    expect(result).toContain('Progress: 2/3 complete (1 failed)');
  });

  it('no ANSI codes in output', () => {
    const reality = buildFakeReality({
      nodes: [{ nodeId: 'n1', status: 'complete' }],
    });

    const result = formatGraphStatus(reality);

    // biome lint doesn't allow \x1b in regex, so check via string
    expect(result.includes('\x1b[')).toBe(false);
  });
});

// ── Edge Cases ──────────────────────────────────────────

describe('formatGraphStatus() edge cases', () => {
  it('single-node line has no separator', () => {
    const reality = buildFakeReality({
      nodes: [{ nodeId: 'solo', status: 'complete' }],
    });

    const result = formatGraphStatus(reality);

    expect(result).toContain('Line 0: ✅ solo');
    expect(result).not.toContain('→');
    expect(result).not.toContain('│');
  });

  it('all-complete graph', () => {
    const reality = buildFakeReality({
      graphStatus: 'complete',
      lines: [{ nodeIds: ['a', 'b'] }],
      nodes: [
        { nodeId: 'a', status: 'complete', positionInLine: 0 },
        { nodeId: 'b', status: 'complete', positionInLine: 1 },
      ],
    });

    const result = formatGraphStatus(reality);

    expect(result).toContain('Progress: 2/2 complete');
    expect(result).not.toContain('failed');
  });

  it('all-failed graph', () => {
    const reality = buildFakeReality({
      graphStatus: 'failed',
      lines: [{ nodeIds: ['a', 'b'] }],
      nodes: [
        { nodeId: 'a', status: 'blocked-error', positionInLine: 0 },
        { nodeId: 'b', status: 'blocked-error', positionInLine: 1 },
      ],
    });

    const result = formatGraphStatus(reality);

    expect(result).toContain('Progress: 0/2 complete (2 failed)');
  });

  it('empty graph (zero lines)', () => {
    const reality = buildFakeReality({
      graphSlug: 'empty-graph',
      graphStatus: 'pending',
      lines: [],
      nodes: [],
    });

    const result = formatGraphStatus(reality);

    expect(result).toContain('Graph: empty-graph (pending)');
    expect(result).toContain('Progress: 0/0 complete');
  });

  it('restart-pending renders as ⏸️', () => {
    const reality = buildFakeReality({
      nodes: [{ nodeId: 'retry-node', status: 'restart-pending' }],
    });

    const result = formatGraphStatus(reality);

    expect(result).toContain('⏸️ retry-node');
  });

  it('failed node with siblings still running', () => {
    const reality = buildFakeReality({
      graphStatus: 'in_progress',
      lines: [{ nodeIds: ['a', 'b', 'c'] }],
      nodes: [
        { nodeId: 'a', status: 'blocked-error', positionInLine: 0, execution: 'parallel' },
        {
          nodeId: 'b',
          status: 'agent-accepted',
          ready: true,
          positionInLine: 1,
          execution: 'parallel',
        },
        { nodeId: 'c', status: 'starting', ready: true, positionInLine: 2, execution: 'parallel' },
      ],
    });

    const result = formatGraphStatus(reality);

    expect(result).toContain('❌ a │ 🔶 b │ 🔶 c');
    expect(result).toContain('(1 failed)');
  });

  it('handles missing node in map defensively', () => {
    const reality = buildFakeReality({
      lines: [{ nodeIds: ['exists', 'ghost'] }],
      nodes: [{ nodeId: 'exists', status: 'complete' }],
    });

    const result = formatGraphStatus(reality);

    expect(result).toContain('✅ exists');
    expect(result).toContain('❓ ghost');
  });
});
