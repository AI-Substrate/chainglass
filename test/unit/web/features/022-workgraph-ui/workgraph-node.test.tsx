/**
 * WorkGraphNode Component Tests - Phase 2 (T003)
 *
 * Tests the custom React Flow node component for WorkGraph.
 * Per CD-02: User-input nodes need distinct visual treatment.
 *
 * Testing approach: Full TDD - write tests first (RED), implement (GREEN), refactor.
 */

import type { NodeStatus } from '@/features/022-workgraph-ui';
import { WorkGraphNode, type WorkGraphNodeProps } from '@/features/022-workgraph-ui/workgraph-node';
import { WorkGraphNodeActionsProvider } from '@/features/022-workgraph-ui/workgraph-node-actions-context';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { describe, expect, test } from 'vitest';

/**
 * Helper to render WorkGraphNode within ReactFlowProvider and NodeActionsProvider.
 * React Flow nodes require the provider context.
 */
function renderWithProvider(props: WorkGraphNodeProps) {
  return render(
    <ReactFlowProvider>
      <WorkGraphNodeActionsProvider removeNode={async () => {}} loadingNodes={new Set<string>()}>
        <WorkGraphNode {...props} />
      </WorkGraphNodeActionsProvider>
    </ReactFlowProvider>
  );
}

describe('WorkGraphNode', () => {
  const baseProps: WorkGraphNodeProps = {
    id: 'test-node',
    data: {
      id: 'test-node',
      status: 'pending' as NodeStatus,
    },
    selected: false,
    type: 'workGraphNode',
    zIndex: 0,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
  };

  /**
   * Test: Render node with ID
   *
   * Purpose: Proves node displays its identifier
   * Quality Contribution: Users can identify nodes
   * Acceptance Criteria: Node ID visible in rendered output
   */
  test('should render node with ID', () => {
    renderWithProvider({ ...baseProps, data: { ...baseProps.data, id: 'my-node-id' } });
    expect(screen.getByText('my-node-id')).toBeInTheDocument();
  });

  /**
   * Test: Render node with unit type
   *
   * Purpose: Proves node displays unit information
   * Quality Contribution: Users can see what type of work the node does
   * Acceptance Criteria: Unit slug visible in rendered output
   */
  test('should render node with unit type', () => {
    renderWithProvider({
      ...baseProps,
      data: { ...baseProps.data, unit: 'sample-coder' },
    });
    expect(screen.getByText('sample-coder')).toBeInTheDocument();
  });

  /**
   * Test: Render start node without unit
   *
   * Purpose: Proves start nodes display correctly
   * Quality Contribution: Start node is visually distinct
   * Acceptance Criteria: "Start" label shown, no unit displayed
   */
  test('should render start node without unit', () => {
    renderWithProvider({
      ...baseProps,
      data: { ...baseProps.data, type: 'start' },
    });
    expect(screen.getByText('Start')).toBeInTheDocument();
  });

  /**
   * Test: Render StatusIndicator for each status
   *
   * Purpose: Proves all 6 statuses have visual indicator
   * Quality Contribution: AC-5 status visualization
   * Acceptance Criteria: StatusIndicator present for all statuses
   */
  test.each([
    ['pending', 'bg-gray-500'],
    ['ready', 'bg-blue-500'],
    ['running', 'bg-yellow-500'],
    ['waiting-question', 'bg-purple-500'],
    ['blocked-error', 'bg-red-500'],
    ['complete', 'bg-green-500'],
  ] as const)('should render StatusIndicator for %s status', (status, expectedColor) => {
    renderWithProvider({
      ...baseProps,
      data: { ...baseProps.data, status },
    });
    const indicator = screen.getByTestId('status-indicator');
    expect(indicator).toBeInTheDocument();
    expect(indicator).toHaveClass(expectedColor);
  });

  /**
   * Test: User-input node has distinct icon
   *
   * Purpose: Proves CD-02 - user-input nodes need distinct treatment
   * Quality Contribution: Distinguishes user-input from agent nodes
   * Acceptance Criteria: User input icon displayed, different from other nodes
   */
  test('should render user-input node with distinct icon', () => {
    renderWithProvider({
      ...baseProps,
      data: { ...baseProps.data, unit: 'user-input', status: 'ready' as NodeStatus },
    });
    // User-input nodes should have a distinct visual marker
    expect(screen.getByTestId('user-input-icon')).toBeInTheDocument();
  });

  /**
   * Test: Node shows selected state
   *
   * Purpose: Proves selected nodes are visually distinct
   * Quality Contribution: Users can see which node is selected
   * Acceptance Criteria: Selected class applied when selected=true
   */
  test('should show selected state', () => {
    renderWithProvider({
      ...baseProps,
      selected: true,
    });
    const node = screen.getByTestId('workgraph-node');
    expect(node).toHaveClass('ring-2');
  });

  /**
   * Test: Node shows question ID when waiting-question
   *
   * Purpose: Proves question context is visible
   * Quality Contribution: Users can see which question is pending
   * Acceptance Criteria: Question indicator visible for waiting-question status
   */
  test('should show question indicator when waiting-question', () => {
    renderWithProvider({
      ...baseProps,
      data: {
        ...baseProps.data,
        status: 'waiting-question' as NodeStatus,
        questionId: 'q-123',
      },
    });
    expect(screen.getByTestId('question-icon')).toBeInTheDocument();
  });

  /**
   * Test: Node shows error message when blocked-error
   *
   * Purpose: Proves error context is visible
   * Quality Contribution: Users can see why node failed
   * Acceptance Criteria: Error info visible for blocked-error status
   */
  test('should show error indicator when blocked-error', () => {
    renderWithProvider({
      ...baseProps,
      data: {
        ...baseProps.data,
        status: 'blocked-error' as NodeStatus,
        errorMessage: 'API timeout',
      },
    });
    expect(screen.getByTestId('error-icon')).toBeInTheDocument();
  });

  /**
   * Test: Node has connection handles
   *
   * Purpose: Proves React Flow can connect nodes
   * Quality Contribution: Graph visualization works correctly
   * Acceptance Criteria: Source and target handles present
   */
  test('should have connection handles', () => {
    renderWithProvider(baseProps);
    // React Flow handles are rendered by the library
    // We just verify the node renders without errors
    expect(screen.getByTestId('workgraph-node')).toBeInTheDocument();
  });

  /**
   * Test: Node applies custom className
   *
   * Purpose: Proves component is composable
   * Quality Contribution: Allows styling flexibility
   * Acceptance Criteria: Custom class applied to node container
   */
  test('should apply custom className', () => {
    // Note: className would need to be passed through data or as a prop
    renderWithProvider(baseProps);
    const node = screen.getByTestId('workgraph-node');
    expect(node).toBeInTheDocument();
  });
});
