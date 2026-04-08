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
    /**
     * Test Doc (group):
     * - Why: Ensures Phase 4 changes don't break pre-existing node locking behavior.
     * - Contract: isLineEditable(line) without executionStatus matches Plan 050 behavior.
     * - Usage Notes: Empty lines always editable, complete/running lines locked.
     * - Quality Contribution: Regression guard for existing workflow editor users.
     * - Worked Example: emptyLine→true, pendingLine→true, runningLine→false, completeLine→false.
     */
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
    /**
     * Test Doc (group):
     * - Why: Verifies idle execution is equivalent to no execution context.
     * - Contract: isLineEditable(line, 'idle') = isLineEditable(line).
     * - Usage Notes: Idle is the default state before any workflow run.
     * - Quality Contribution: Ensures explicit 'idle' doesn't accidentally lock lines.
     * - Worked Example: pendingLine+'idle'→true, emptyLine+'idle'→true.
     */
    it('pending line is editable when idle', () => {
      expect(isLineEditable(pendingLine, 'idle')).toBe(true);
    });

    it('empty line is editable when idle', () => {
      expect(isLineEditable(emptyLine, 'idle')).toBe(true);
    });
  });

  describe('stopping executionStatus — all lines locked', () => {
    /**
     * Test Doc (group):
     * - Why: During hard stop, ALL lines must be locked to prevent mutations mid-abort.
     * - Contract: isLineEditable(any, 'stopping') always returns false.
     * - Usage Notes: Stopping = abort signal sent, pods being destroyed.
     * - Quality Contribution: Prevents data corruption during stop transition.
     * - Worked Example: emptyLine+'stopping'→false, pendingLine+'stopping'→false.
     */
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
    /**
     * Test Doc (group):
     * - Why: During execution, future nodes must remain editable (spec AC #6).
     * - Contract: isLineEditable(line, 'running') uses per-line logic (running+complete locked, pending editable).
     * - Usage Notes: Users can rearrange future lines while workflow runs.
     * - Quality Contribution: Ensures correct partial-lock behavior per spec.
     * - Worked Example: pendingLine+'running'→true, runningLine+'running'→false.
     */
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
    /**
     * Test Doc (group):
     * - Why: When stopped, completed nodes stay locked but future nodes are editable.
     * - Contract: isLineEditable(line, 'stopped') uses same per-line logic as running.
     * - Usage Notes: Users can edit future lines while workflow is paused.
     * - Quality Contribution: Ensures stopped state doesn't accidentally unlock completed lines.
     * - Worked Example: pendingLine+'stopped'→true, completeLine+'stopped'→false.
     */
    it('pending line is editable when stopped', () => {
      expect(isLineEditable(pendingLine, 'stopped')).toBe(true);
    });

    it('complete line is not editable when stopped', () => {
      expect(isLineEditable(completeLine, 'stopped')).toBe(false);
    });
  });
});
