/**
 * WorkflowNodeCard tests — all 8 status states render correctly.
 *
 * Phase 2: Canvas Core + Layout — Plan 050
 * AC-10, AC-11
 */

import {
  type NodeStatus,
  WorkflowNodeCard,
  nodeStatusToCardProps,
} from '@/features/050-workflow-page/components/workflow-node-card';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

const ALL_STATUSES: NodeStatus[] = [
  'pending',
  'ready',
  'starting',
  'agent-accepted',
  'waiting-question',
  'blocked-error',
  'restart-pending',
  'complete',
];

describe('WorkflowNodeCard', () => {
  it('renders unit slug and type icon', () => {
    render(
      <WorkflowNodeCard nodeId="n1" unitSlug="sample-coder" unitType="agent" status="pending" />
    );

    expect(screen.getByText('sample-coder')).toBeDefined();
    expect(screen.getByLabelText('agent')).toBeDefined();
  });

  it('renders description truncated', () => {
    render(
      <WorkflowNodeCard
        nodeId="n1"
        unitSlug="sample-coder"
        unitType="agent"
        status="pending"
        description="A very long description that should be truncated"
      />
    );

    expect(screen.getByText('A very long description that should be truncated')).toBeDefined();
  });

  it.each(ALL_STATUSES)('renders status %s with correct data attribute', (status) => {
    render(
      <WorkflowNodeCard
        nodeId={`node-${status}`}
        unitSlug="test-unit"
        unitType="code"
        status={status}
      />
    );

    const card = screen.getByTestId(`node-card-node-${status}`);
    expect(card.getAttribute('data-status')).toBe(status);
  });

  it('renders all 3 unit types with correct icons', () => {
    const types = [
      { type: 'agent' as const, icon: '🤖' },
      { type: 'code' as const, icon: '⚙️' },
      { type: 'user-input' as const, icon: '👤' },
    ];

    for (const { type, icon } of types) {
      const { unmount } = render(
        <WorkflowNodeCard nodeId={`n-${type}`} unitSlug="test" unitType={type} status="pending" />
      );
      expect(screen.getByLabelText(type).textContent).toBe(icon);
      unmount();
    }
  });

  it('renders context badge with specified color', () => {
    render(
      <WorkflowNodeCard
        nodeId="n1"
        unitSlug="test"
        unitType="agent"
        status="ready"
        contextColor="purple"
      />
    );

    const badge = screen.getByTestId('context-badge-n1');
    expect(badge.className).toContain('bg-violet-500');
  });

  it('defaults context badge to gray', () => {
    render(<WorkflowNodeCard nodeId="n1" unitSlug="test" unitType="agent" status="pending" />);

    const badge = screen.getByTestId('context-badge-n1');
    expect(badge.className).toContain('bg-gray-400');
  });

  it('nodeStatusToCardProps converts NodeStatusResult correctly', () => {
    const nodeStatus = {
      nodeId: 'node-a1b',
      unitSlug: 'sample-coder',
      unitType: 'agent' as const,
      status: 'agent-accepted' as const,
      noContext: false,
      execution: 'serial' as const,
      lineId: 'line-001',
      position: 0,
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

    const props = nodeStatusToCardProps(nodeStatus, 0);
    expect(props.nodeId).toBe('node-a1b');
    expect(props.unitSlug).toBe('sample-coder');
    expect(props.unitType).toBe('agent');
    expect(props.status).toBe('agent-accepted');
    expect(props.contextColor).toBe('green');
    expect(props.noContext).toBe(false);
    expect(props.nodeStatus).toBeDefined();
  });
});
