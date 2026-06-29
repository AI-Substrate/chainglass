/**
 * Context badge computation tests — all 4 color rules.
 *
 * Phase 4: Context Indicators — Plan 050
 * AC-13
 */

import { computeContextBadge } from '@/features/050-workflow-page/lib/context-badge';
import type { NodeStatusResult } from '@chainglass/positional-graph';
import { describe, expect, it } from 'vitest';

function makeNode(overrides: Partial<NodeStatusResult> = {}): NodeStatusResult {
  const base = {
    nodeId: 'n1',
    unitSlug: 'test',
    execution: 'serial' as const,
    lineId: 'line-001',
    position: 0,
    status: 'pending' as const,
    ready: false,
    readyDetail: {
      precedingLinesComplete: true,
      transitionOpen: true,
      serialNeighborComplete: true,
      inputsAvailable: true,
      unitFound: true,
    },
    inputPack: { inputs: {}, ok: true },
  };
  if (overrides.unitType === 'user-input') {
    return {
      ...base,
      ...overrides,
      unitType: 'user-input',
      userInput: overrides.userInput ?? {
        prompt: 'Enter a value',
        inputType: 'text',
        outputName: 'value',
      },
    };
  }
  if (overrides.unitType === 'code') {
    return { ...base, ...overrides, unitType: 'code' };
  }
  return { ...base, ...overrides, unitType: 'agent' };
}

describe('computeContextBadge', () => {
  it('returns gray for code nodes', () => {
    expect(computeContextBadge(makeNode({ unitType: 'code' }), 0)).toBe('gray');
  });

  it('returns gray for user-input nodes', () => {
    expect(computeContextBadge(makeNode({ unitType: 'user-input' }), 0)).toBe('gray');
  });

  it('returns green for noContext agents', () => {
    expect(computeContextBadge(makeNode({ noContext: true }), 1)).toBe('green');
  });

  it('returns purple for explicit contextFrom', () => {
    expect(computeContextBadge(makeNode({ contextFrom: 'other-node' }), 0)).toBe('purple');
  });

  it('returns green for first agent on line 0', () => {
    expect(computeContextBadge(makeNode({ position: 0 }), 0)).toBe('green');
  });

  it('returns blue for serial agent on line 0 position > 0', () => {
    expect(computeContextBadge(makeNode({ position: 1 }), 0)).toBe('blue');
  });

  it('returns blue for serial agent on line > 0', () => {
    expect(computeContextBadge(makeNode({ position: 0 }), 1)).toBe('blue');
  });

  it('returns green for parallel agent', () => {
    expect(computeContextBadge(makeNode({ execution: 'parallel', position: 1 }), 0)).toBe('green');
  });

  it('noContext takes priority over contextFrom', () => {
    expect(computeContextBadge(makeNode({ noContext: true, contextFrom: 'x' }), 0)).toBe('green');
  });
});
