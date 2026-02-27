/**
 * GateChip tests — renders blocking gates with correct colors.
 *
 * Phase 4: Context Indicators — Plan 050
 * AC-12
 */

import { GateChip, computeGates } from '@/features/050-workflow-page/components/gate-chip';
import type { NodeStatusResult } from '@chainglass/positional-graph';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

function makeNode(overrides: Partial<NodeStatusResult> = {}): NodeStatusResult {
  return {
    nodeId: 'n1',
    unitSlug: 'test',
    unitType: 'agent',
    execution: 'serial',
    lineId: 'line-001',
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

describe('computeGates', () => {
  it('returns 5 gates all passing when node is ready', () => {
    const gates = computeGates(makeNode({ ready: true }));
    expect(gates).toHaveLength(5);
    expect(gates.every((g) => g.passing)).toBe(true);
  });

  it('marks preceding lines gate as failing', () => {
    const gates = computeGates(
      makeNode({ readyDetail: { ...makeNode().readyDetail, precedingLinesComplete: false } })
    );
    expect(gates[0].passing).toBe(false);
    expect(gates[0].name).toBe('Preceding Lines');
  });

  it('marks inputs gate as failing', () => {
    const gates = computeGates(
      makeNode({ readyDetail: { ...makeNode().readyDetail, inputsAvailable: false } })
    );
    expect(gates[4].passing).toBe(false);
    expect(gates[4].name).toBe('Inputs');
  });
});

describe('GateChip', () => {
  it('renders nothing for ready nodes', () => {
    const { container } = render(<GateChip node={makeNode({ ready: true })} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for complete nodes', () => {
    const { container } = render(<GateChip node={makeNode({ status: 'complete' })} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders chip for blocked node', () => {
    render(
      <GateChip
        node={makeNode({
          readyDetail: { ...makeNode().readyDetail, precedingLinesComplete: false },
        })}
      />
    );
    expect(screen.getByTestId('gate-chip-n1')).toBeDefined();
    expect(screen.getByText('Earlier lines incomplete')).toBeDefined();
  });

  it('expands to show all gates on click', () => {
    render(
      <GateChip
        node={makeNode({
          readyDetail: {
            ...makeNode().readyDetail,
            precedingLinesComplete: false,
            inputsAvailable: false,
          },
        })}
      />
    );

    // Click to expand
    fireEvent.click(screen.getByText('Earlier lines incomplete'));
    expect(screen.getByTestId('gate-list-n1')).toBeDefined();

    // All 5 gates visible
    expect(screen.getByText(/Preceding Lines/)).toBeDefined();
    expect(screen.getByText(/Transition/)).toBeDefined();
    expect(screen.getByText(/Serial Neighbor/)).toBeDefined();
    expect(screen.getByText(/Context Source/)).toBeDefined();
    expect(screen.getByText(/^Inputs$/)).toBeDefined();
  });
});
