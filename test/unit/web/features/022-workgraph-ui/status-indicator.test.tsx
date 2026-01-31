/**
 * StatusIndicator Component Tests - Phase 2 (T005)
 *
 * Tests the 6 status visual treatments (colors, icons, animations).
 * Per AC-5: Status visualization with distinct visual treatments.
 *
 * Testing approach: Full TDD - write tests first (RED), implement (GREEN), refactor.
 */

import type { NodeStatus } from '@/features/022-workgraph-ui';
import { StatusIndicator } from '@/features/022-workgraph-ui/status-indicator';
import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

describe('StatusIndicator', () => {
  /**
   * Test: Render pending status with gray color
   *
   * Purpose: Proves pending state has correct visual treatment
   * Quality Contribution: Users see inactive nodes clearly
   * Acceptance Criteria: Gray background, no icon
   */
  test('should render pending status with gray color', () => {
    render(<StatusIndicator status="pending" />);
    const indicator = screen.getByTestId('status-indicator');
    expect(indicator).toHaveClass('bg-gray-500');
    // Pending should not have an icon - just the dot
    expect(screen.queryByTestId('status-icon')).not.toBeInTheDocument();
  });

  /**
   * Test: Render ready status with blue color and play icon
   *
   * Purpose: Proves ready state has correct visual treatment
   * Quality Contribution: Users can see nodes ready to execute
   * Acceptance Criteria: Blue background, play icon
   */
  test('should render ready status with blue color and play icon', () => {
    render(<StatusIndicator status="ready" />);
    const indicator = screen.getByTestId('status-indicator');
    expect(indicator).toHaveClass('bg-blue-500');
    expect(screen.getByTestId('status-icon')).toBeInTheDocument();
  });

  /**
   * Test: Render running status with yellow color and spinner
   *
   * Purpose: Proves running state has correct visual treatment
   * Quality Contribution: Users can see active processing
   * Acceptance Criteria: Yellow background, spinner animation
   */
  test('should render running status with yellow color and spinner', () => {
    render(<StatusIndicator status="running" />);
    const indicator = screen.getByTestId('status-indicator');
    expect(indicator).toHaveClass('bg-yellow-500');
    const spinner = screen.getByTestId('spinner-icon');
    expect(spinner).toBeInTheDocument();
    expect(spinner).toHaveClass('animate-spin');
  });

  /**
   * Test: Render waiting-question status with purple color and question icon
   *
   * Purpose: Proves waiting-question state has correct visual treatment
   * Quality Contribution: Users can see nodes waiting for input
   * Acceptance Criteria: Purple background, question mark icon
   */
  test('should render waiting-question status with purple color and question icon', () => {
    render(<StatusIndicator status="waiting-question" />);
    const indicator = screen.getByTestId('status-indicator');
    expect(indicator).toHaveClass('bg-purple-500');
    expect(screen.getByTestId('question-icon')).toBeInTheDocument();
  });

  /**
   * Test: Render blocked-error status with red color and error icon
   *
   * Purpose: Proves blocked-error state has correct visual treatment
   * Quality Contribution: Users can see failed nodes clearly
   * Acceptance Criteria: Red background, X/error icon
   */
  test('should render blocked-error status with red color and error icon', () => {
    render(<StatusIndicator status="blocked-error" />);
    const indicator = screen.getByTestId('status-indicator');
    expect(indicator).toHaveClass('bg-red-500');
    expect(screen.getByTestId('error-icon')).toBeInTheDocument();
  });

  /**
   * Test: Render complete status with green color and check icon
   *
   * Purpose: Proves complete state has correct visual treatment
   * Quality Contribution: Users can see finished nodes clearly
   * Acceptance Criteria: Green background, checkmark icon
   */
  test('should render complete status with green color and check icon', () => {
    render(<StatusIndicator status="complete" />);
    const indicator = screen.getByTestId('status-indicator');
    expect(indicator).toHaveClass('bg-green-500');
    expect(screen.getByTestId('check-icon')).toBeInTheDocument();
  });

  /**
   * Test: All 6 status types have distinct colors
   *
   * Purpose: Proves all statuses are visually distinguishable
   * Quality Contribution: AC-5 complete status visualization
   * Acceptance Criteria: Each status has unique color class
   */
  test('should have distinct colors for all 6 status types', () => {
    const statusColors: Record<NodeStatus, string> = {
      pending: 'bg-gray-500',
      ready: 'bg-blue-500',
      running: 'bg-yellow-500',
      'waiting-question': 'bg-purple-500',
      'blocked-error': 'bg-red-500',
      complete: 'bg-green-500',
    };

    for (const [status, expectedColor] of Object.entries(statusColors)) {
      const { unmount } = render(<StatusIndicator status={status as NodeStatus} />);
      const indicator = screen.getByTestId('status-indicator');
      expect(indicator).toHaveClass(expectedColor);
      unmount();
    }
  });

  /**
   * Test: StatusIndicator accepts custom className
   *
   * Purpose: Proves component is composable with custom styles
   * Quality Contribution: Allows use in different contexts
   * Acceptance Criteria: Custom class is applied alongside defaults
   */
  test('should accept custom className', () => {
    render(<StatusIndicator status="pending" className="my-custom-class" />);
    const indicator = screen.getByTestId('status-indicator');
    expect(indicator).toHaveClass('my-custom-class');
    expect(indicator).toHaveClass('bg-gray-500'); // Still has default
  });

  /**
   * Test: Render with size variants
   *
   * Purpose: Proves component supports different sizes
   * Quality Contribution: Flexible for different UI contexts
   * Acceptance Criteria: Size prop affects dimensions
   */
  test('should render with different sizes', () => {
    const { rerender } = render(<StatusIndicator status="pending" size="sm" />);
    expect(screen.getByTestId('status-indicator')).toHaveClass('w-4', 'h-4');

    rerender(<StatusIndicator status="pending" size="md" />);
    expect(screen.getByTestId('status-indicator')).toHaveClass('w-6', 'h-6');

    rerender(<StatusIndicator status="pending" size="lg" />);
    expect(screen.getByTestId('status-indicator')).toHaveClass('w-8', 'h-8');
  });
});
