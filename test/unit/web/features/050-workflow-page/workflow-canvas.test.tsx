/**
 * WorkflowCanvas + WorkflowLine tests — rendering from GraphStatusResult.
 *
 * Phase 2: Canvas Core + Layout — Plan 050
 * AC-02, AC-03, AC-05
 */

import { WorkflowCanvas } from '@/features/050-workflow-page/components/workflow-canvas';
import type {
  GraphStatusResult,
  LineStatusResult,
  NodeStatusResult,
} from '@chainglass/positional-graph';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

function makeNode(overrides: Partial<NodeStatusResult> = {}): NodeStatusResult {
  return {
    nodeId: 'node-1',
    unitSlug: 'sample-coder',
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
    inputPack: {},
    ...overrides,
  };
}

function makeLine(overrides: Partial<LineStatusResult> = {}): LineStatusResult {
  return {
    lineId: 'line-001',
    index: 0,
    transition: 'auto',
    transitionTriggered: false,
    complete: false,
    empty: false,
    canRun: false,
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

function makeGraphStatus(lines: LineStatusResult[]): GraphStatusResult {
  return {
    graphSlug: 'test-graph',
    version: '1.0.0',
    status: 'pending',
    totalNodes: lines.reduce((sum, l) => sum + l.nodes.length, 0),
    completedNodes: 0,
    lines,
    readyNodes: [],
    runningNodes: [],
    waitingQuestionNodes: [],
    blockedNodes: [],
    completedNodeIds: [],
  };
}

describe('WorkflowCanvas', () => {
  it('renders empty canvas placeholder when no lines', () => {
    render(<WorkflowCanvas graphStatus={makeGraphStatus([])} />);
    expect(screen.getByTestId('empty-canvas')).toBeDefined();
    expect(screen.getByText('Create your first line')).toBeDefined();
  });

  it('renders lines with numbered headers', () => {
    const lines = [
      makeLine({ lineId: 'line-001', label: 'Gather Requirements' }),
      makeLine({ lineId: 'line-002', index: 1, label: 'Implementation' }),
    ];

    render(<WorkflowCanvas graphStatus={makeGraphStatus(lines)} />);
    expect(screen.getByTestId('workflow-canvas')).toBeDefined();
    expect(screen.getByTestId('workflow-line-line-001')).toBeDefined();
    expect(screen.getByTestId('workflow-line-line-002')).toBeDefined();
    expect(screen.getByText('Gather Requirements')).toBeDefined();
    expect(screen.getByText('Implementation')).toBeDefined();
    expect(screen.getByText('1')).toBeDefined();
    expect(screen.getByText('2')).toBeDefined();
  });

  it('renders node cards inside lines', () => {
    const lines = [
      makeLine({
        lineId: 'line-001',
        nodes: [
          makeNode({ nodeId: 'n1', unitSlug: 'spec-writer' }),
          makeNode({ nodeId: 'n2', unitSlug: 'reviewer' }),
        ],
      }),
    ];

    render(<WorkflowCanvas graphStatus={makeGraphStatus(lines)} />);
    expect(screen.getByTestId('node-card-n1')).toBeDefined();
    expect(screen.getByTestId('node-card-n2')).toBeDefined();
    expect(screen.getByText('spec-writer')).toBeDefined();
    expect(screen.getByText('reviewer')).toBeDefined();
  });

  it('shows empty line placeholder when line has no nodes', () => {
    const lines = [makeLine({ lineId: 'line-001', empty: true })];
    render(<WorkflowCanvas graphStatus={makeGraphStatus(lines)} />);
    expect(screen.getByTestId('empty-line')).toBeDefined();
  });

  it('renders transition gates between lines', () => {
    const lines = [
      makeLine({ lineId: 'line-001' }),
      makeLine({ lineId: 'line-002', index: 1, transition: 'manual' }),
    ];

    render(<WorkflowCanvas graphStatus={makeGraphStatus(lines)} />);
    expect(screen.getByTestId('line-transition-gate')).toBeDefined();
    expect(screen.getByText(/Manual/)).toBeDefined();
  });

  it('shows add line button', () => {
    const lines = [makeLine()];
    render(<WorkflowCanvas graphStatus={makeGraphStatus(lines)} />);
    expect(screen.getByTestId('add-line-button')).toBeDefined();
  });

  it('renders line with blue border when running', () => {
    const lines = [makeLine({ lineId: 'line-001', runningNodes: ['n1'] })];
    render(<WorkflowCanvas graphStatus={makeGraphStatus(lines)} />);
    const line = screen.getByTestId('workflow-line-line-001');
    expect(line.className).toContain('border-l-blue-500');
  });

  it('renders line with green border when complete', () => {
    const lines = [makeLine({ lineId: 'line-001', complete: true })];
    render(<WorkflowCanvas graphStatus={makeGraphStatus(lines)} />);
    const line = screen.getByTestId('workflow-line-line-001');
    expect(line.className).toContain('border-l-green-500');
  });
});
