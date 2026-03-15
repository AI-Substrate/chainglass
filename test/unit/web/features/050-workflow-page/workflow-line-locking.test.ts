/**
 * Tests for isLineEditable() with execution-aware locking.
 *
 * Verifies:
 * - Backwards-compatible: no executionStatus = existing behavior
 * - 'stopping' locks ALL lines (hard stop in progress)
 * - 'running'/'stopped' uses existing per-line logic
 * - 'idle'/undefined = existing behavior
 * - Empty lines always editable
 *
 * Plan 074 Phase 4 — T009
 */

import { isLineEditable } from '@/features/050-workflow-page/components/workflow-line';
import type { LineStatusResult } from '@chainglass/positional-graph';
import { describe, expect, it } from 'vitest';

// ── Helpers ────────────────────────────────────────────────────────

function makeLine(overrides: Partial<LineStatusResult> = {}): LineStatusResult {
  return {
    lineId: 'line-1',
    label: 'Test Line',
    transition: 'auto',
    complete: false,
    nodes: [{ nodeId: 'n1', unitSlug: 'unit-1', unitType: 'agent', status: 'pending' }],
    runningNodes: [],
    blockedNodes: [],
    ...overrides,
  } as LineStatusResult;
}

const emptyLine = makeLine({ nodes: [], complete: true });
const pendingLine = makeLine({ complete: false, runningNodes: [] });
const runningLine = makeLine({
  complete: false,
  runningNodes: [{ nodeId: 'n1' }] as LineStatusResult['runningNodes'],
});
const completeLine = makeLine({ complete: true, runningNodes: [] });

// ── Tests ──────────────────────────────────────────────────────────

describe('isLineEditable', () => {
  describe('backwards-compatible (no executionStatus)', () => {
    it('empty lines are always editable', () => {
      expect(isLineEditable(emptyLine)).toBe(true);
    });

    it('pending lines with no running nodes are editable', () => {
      expect(isLineEditable(pendingLine)).toBe(true);
    });

    it('lines with running nodes are not editable', () => {
      expect(isLineEditable(runningLine)).toBe(false);
    });

    it('complete lines are not editable', () => {
      expect(isLineEditable(completeLine)).toBe(false);
    });
  });

  describe('idle executionStatus (same as no status)', () => {
    it('pending line is editable when idle', () => {
      expect(isLineEditable(pendingLine, 'idle')).toBe(true);
    });

    it('empty line is editable when idle', () => {
      expect(isLineEditable(emptyLine, 'idle')).toBe(true);
    });
  });

  describe('stopping executionStatus — all lines locked', () => {
    it('empty lines are locked during stopping', () => {
      expect(isLineEditable(emptyLine, 'stopping')).toBe(false);
    });

    it('pending lines are locked during stopping', () => {
      expect(isLineEditable(pendingLine, 'stopping')).toBe(false);
    });

    it('running lines are locked during stopping', () => {
      expect(isLineEditable(runningLine, 'stopping')).toBe(false);
    });

    it('complete lines are locked during stopping', () => {
      expect(isLineEditable(completeLine, 'stopping')).toBe(false);
    });
  });

  describe('running executionStatus — per-line logic applies', () => {
    it('pending line is editable (future node)', () => {
      expect(isLineEditable(pendingLine, 'running')).toBe(true);
    });

    it('running line is not editable', () => {
      expect(isLineEditable(runningLine, 'running')).toBe(false);
    });

    it('complete line is not editable', () => {
      expect(isLineEditable(completeLine, 'running')).toBe(false);
    });

    it('empty line is editable during running', () => {
      expect(isLineEditable(emptyLine, 'running')).toBe(true);
    });
  });

  describe('stopped executionStatus — per-line logic applies', () => {
    it('pending line is editable when stopped', () => {
      expect(isLineEditable(pendingLine, 'stopped')).toBe(true);
    });

    it('complete line is not editable when stopped', () => {
      expect(isLineEditable(completeLine, 'stopped')).toBe(false);
    });
  });
});
