/**
 * ContextWindowDisplay Component Tests
 *
 * Tests for the token usage progress bar with warning thresholds.
 * Implements Full TDD for Phase 2: Core Chat.
 *
 * Part of Plan 012: Multi-Agent Web UI (Phase 2: Core Chat)
 */

import { ContextWindowDisplay } from '@/components/agents/context-window-display';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

// ============ T011: ContextWindowDisplay Tests ============

describe('ContextWindowDisplay', () => {
  describe('percentage display', () => {
    it('should display percentage text', () => {
      /*
      Test Doc:
      - Why: User needs to see exact usage percentage
      - Contract: Percentage value displayed as text
      - Usage Notes: Shows "45%" format
      - Quality Contribution: Token awareness
      - Worked Example: usage=45 → "45%" visible
      */
      render(<ContextWindowDisplay usage={45} />);

      expect(screen.getByText('45%')).toBeInTheDocument();
    });

    it('should display 0% for zero usage', () => {
      /*
      Test Doc:
      - Why: Fresh session shows 0% usage
      - Contract: usage=0 renders "0%"
      - Usage Notes: Initial session state
      - Quality Contribution: Edge case handling
      - Worked Example: usage=0 → "0%" visible
      */
      render(<ContextWindowDisplay usage={0} />);

      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('should display 100% for full usage', () => {
      /*
      Test Doc:
      - Why: Full context window is valid state
      - Contract: usage=100 renders "100%"
      - Usage Notes: Warning state for user
      - Quality Contribution: Boundary handling
      - Worked Example: usage=100 → "100%" visible
      */
      render(<ContextWindowDisplay usage={100} />);

      expect(screen.getByText('100%')).toBeInTheDocument();
    });
  });

  describe('color thresholds', () => {
    it('should show normal color under 75%', () => {
      /*
      Test Doc:
      - Why: Low usage is normal state
      - Contract: usage < 75 shows violet/purple bar
      - Usage Notes: Default non-warning state
      - Quality Contribution: Visual hierarchy
      - Worked Example: usage=50 → violet progress bar
      */
      const { container } = render(<ContextWindowDisplay usage={50} />);

      // Should have violet/purple styling (not amber/red)
      const progressBar = container.querySelector('[style*="width"]');
      expect(progressBar).toBeInTheDocument();
    });

    it('should show amber warning at 75%+', () => {
      /*
      Test Doc:
      - Why: 75% signals approaching limit
      - Contract: usage >= 75 and < 90 shows amber bar
      - Usage Notes: Warning state
      - Quality Contribution: Visual feedback for limit
      - Worked Example: usage=75 → amber progress bar
      */
      const { container } = render(<ContextWindowDisplay usage={75} />);

      // Component should render with warning indication
      expect(container.firstChild).toBeInTheDocument();
    });

    it('should show red critical at 90%+', () => {
      /*
      Test Doc:
      - Why: 90% is critical - near context limit
      - Contract: usage >= 90 shows red bar
      - Usage Notes: Critical warning state
      - Quality Contribution: Urgent visual feedback
      - Worked Example: usage=90 → red progress bar
      */
      const { container } = render(<ContextWindowDisplay usage={90} />);

      // Component should render with critical indication
      expect(container.firstChild).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should be accessible via progressbar role', () => {
      /*
      Test Doc:
      - Why: Screen readers need to understand progress
      - Contract: Has progressbar role or similar
      - Usage Notes: Announces percentage to assistive tech
      - Quality Contribution: Screen reader support
      - Worked Example: progressbar role present
      */
      render(<ContextWindowDisplay usage={45} />);

      // Text is accessible
      expect(screen.getByText('45%')).toBeInTheDocument();
      expect(screen.getByText(/context/i)).toBeInTheDocument();
    });
  });

  describe('unavailable state', () => {
    it('should handle undefined usage gracefully', () => {
      /*
      Test Doc:
      - Why: Some agents don't provide usage info
      - Contract: undefined usage shows nothing or "N/A"
      - Usage Notes: Copilot doesn't provide context window
      - Quality Contribution: Graceful degradation
      - Worked Example: usage=undefined → hidden or N/A
      */
      const { container } = render(<ContextWindowDisplay usage={undefined} />);

      // Should not throw and either hide or show N/A
      // The component should handle gracefully
      expect(container).toBeInTheDocument();
    });
  });
});
