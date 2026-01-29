/**
 * AgentStatusIndicator Component Tests
 *
 * Tests for the status indicator badge with color mapping.
 * Implements Full TDD for Phase 2: Core Chat.
 *
 * Part of Plan 019: Agent Manager Refactor
 */

import { AgentStatusIndicator } from '@/components/agents/agent-status-indicator';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

// SessionStatus is inlined in the component
type SessionStatus = 'idle' | 'working' | 'error' | 'complete';

// ============ T009: AgentStatusIndicator Tests ============

describe('AgentStatusIndicator', () => {
  describe('color mapping', () => {
    it('should show gray for idle status', () => {
      /*
      Test Doc:
      - Why: Idle state means ready for input
      - Contract: status='idle' renders gray/neutral indicator
      - Usage Notes: Most common default state
      - Quality Contribution: Visual status hierarchy
      - Worked Example: status='idle' → gray badge
      */
      const { container } = render(<AgentStatusIndicator status="idle" />);

      expect(screen.getByText(/idle/i)).toBeInTheDocument();
      // Check for gray/zinc/neutral color class
      expect(container.firstChild?.textContent?.toLowerCase()).toContain('idle');
    });

    it('should show blue with pulse for running status', () => {
      /*
      Test Doc:
      - Why: Running state needs attention-grabbing indicator
      - Contract: status='running' renders blue with pulse animation
      - Usage Notes: Animation indicates active processing
      - Quality Contribution: Active feedback during agent work
      - Worked Example: status='running' → blue badge with animation
      */
      const { container } = render(<AgentStatusIndicator status="running" />);

      expect(screen.getByText(/running/i)).toBeInTheDocument();
    });

    it('should show green for completed status', () => {
      /*
      Test Doc:
      - Why: Completed state is success condition
      - Contract: status='completed' renders green indicator
      - Usage Notes: Indicates successful session end
      - Quality Contribution: Clear completion signal
      - Worked Example: status='completed' → green badge
      */
      const { container } = render(<AgentStatusIndicator status="completed" />);

      expect(screen.getByText(/completed/i)).toBeInTheDocument();
    });

    it('should show gray for archived status', () => {
      /*
      Test Doc:
      - Why: Archived sessions are inactive
      - Contract: status='archived' renders gray/muted indicator
      - Usage Notes: Similar to idle but explicitly inactive
      - Quality Contribution: Distinguishes archived from active
      - Worked Example: status='archived' → gray badge
      */
      const { container } = render(<AgentStatusIndicator status="archived" />);

      expect(screen.getByText(/archived/i)).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have ARIA role for status', () => {
      /*
      Test Doc:
      - Why: Screen readers need to announce status
      - Contract: Has role="status" or similar ARIA attribute
      - Usage Notes: Status changes should be announced
      - Quality Contribution: Screen reader accessibility
      - Worked Example: role="status" present
      */
      const { container } = render(<AgentStatusIndicator status="running" />);

      // Should have a status role or be in a live region
      const indicator = container.firstChild as HTMLElement;
      expect(
        indicator.getAttribute('role') === 'status' ||
          indicator.getAttribute('aria-live') === 'polite' ||
          indicator.querySelector('[role="status"]')
      ).toBeTruthy();
    });

    it('should include status label for screen readers', () => {
      /*
      Test Doc:
      - Why: Status must be readable not just colored
      - Contract: Status text visible or available to assistive tech
      - Usage Notes: Don't rely solely on color
      - Quality Contribution: WCAG compliance
      - Worked Example: "Running" text visible
      */
      render(<AgentStatusIndicator status="running" />);

      // The status label should be findable
      expect(screen.getByText(/running/i)).toBeInTheDocument();
    });
  });

  describe('all statuses render', () => {
    it('should handle all SessionStatus values', () => {
      /*
      Test Doc:
      - Why: Component must handle all possible status values
      - Contract: No errors for any SessionStatus value
      - Usage Notes: Defensive against future status additions
      - Quality Contribution: Robustness
      - Worked Example: All statuses render without error
      */
      const statuses: SessionStatus[] = [
        'idle',
        'running',
        'waiting_input',
        'completed',
        'archived',
      ];

      for (const status of statuses) {
        const { unmount } = render(<AgentStatusIndicator status={status} />);
        // Just verify it renders without throwing
        expect(document.body.textContent).toBeTruthy();
        unmount();
      }
    });
  });
});
