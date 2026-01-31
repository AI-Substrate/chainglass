/**
 * ThinkingBlock Component Tests
 *
 * TDD tests for the thinking/reasoning block component.
 * Tests verify: collapsed default, distinct styling, expand/collapse, keyboard.
 *
 * Part of Plan 015: Better Agents (Phase 4: UI Components)
 *
 * @module test/unit/web/components/agents/thinking-block.test.tsx
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

// Import will fail until component is created (TDD RED phase)
import { ThinkingBlock } from '@/components/agents/thinking-block';

// ============ T006: ThinkingBlock Rendering Tests ============

describe('ThinkingBlock', () => {
  describe('T006: rendering and styling', () => {
    it('renders "Thinking..." header text', () => {
      /**
       * Test Doc:
       * - Why: Users need to identify thinking blocks (AC5)
       * - Contract: "Thinking" text visible in header
       * - Usage Notes: Consistent label across adapters
       * - Quality Contribution: Block identification
       * - Worked Example: <ThinkingBlock> → "Thinking" visible
       */
      render(<ThinkingBlock content="I am reasoning about this problem..." />);
      expect(screen.getByText(/thinking/i)).toBeInTheDocument();
    });

    it('is collapsed by default (AC6a)', () => {
      /**
       * Test Doc:
       * - Why: Thinking blocks display but start collapsed (AC6a)
       * - Contract: aria-expanded="false" on initial render
       * - Usage Notes: Visible but compact
       * - Quality Contribution: Clean default state
       * - Worked Example: Render → collapsed state
       */
      render(<ThinkingBlock content="I am reasoning about this problem..." />);
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('has distinct visual styling from chat messages (AC6)', () => {
      /**
       * Test Doc:
       * - Why: Thinking blocks must look different (AC6)
       * - Contract: Different background/border from regular messages
       * - Usage Notes: Muted/subtle styling to differentiate
       * - Quality Contribution: Visual hierarchy
       * - Worked Example: Has thinking-specific class styling
       */
      const { container } = render(
        <ThinkingBlock content="I am reasoning about this problem..." />
      );
      const block = container.firstChild as HTMLElement;
      // Should have distinct styling (muted background, different border)
      expect(block).toHaveClass(/border|bg/);
    });

    it('shows thinking icon', () => {
      /**
       * Test Doc:
       * - Why: Visual indicator for thinking content (AC6)
       * - Contract: Brain/thinking icon displayed
       * - Usage Notes: Uses Lucide Brain or similar
       * - Quality Contribution: Quick visual identification
       * - Worked Example: Icon visible in header
       */
      render(<ThinkingBlock content="I am reasoning about this problem..." />);
      // Check for icon presence
      const icons = document.querySelectorAll('[aria-hidden="true"]');
      expect(icons.length).toBeGreaterThan(0);
    });

    it('does not show content when collapsed', () => {
      /**
       * Test Doc:
       * - Why: Collapsed state hides verbose content
       * - Contract: Content not visible when collapsed
       * - Usage Notes: Keeps UI clean
       * - Quality Contribution: Clean collapsed view
       * - Worked Example: Collapsed → content hidden
       */
      render(<ThinkingBlock content="Long reasoning content that should be hidden" />);
      expect(screen.queryByText(/Long reasoning content/)).not.toBeInTheDocument();
    });
  });

  // ============ T007: Expand/Collapse Behavior Tests ============

  describe('T007: expand/collapse behavior', () => {
    it('expands when clicked', async () => {
      /**
       * Test Doc:
       * - Why: Users can read thinking on demand (AC5)
       * - Contract: Click → aria-expanded="true"
       * - Usage Notes: Toggle behavior
       * - Quality Contribution: Interactive disclosure
       * - Worked Example: Click → expanded
       */
      const user = userEvent.setup();
      render(<ThinkingBlock content="I am reasoning about this problem..." />);

      const button = screen.getByRole('button');
      await user.click(button);

      expect(button).toHaveAttribute('aria-expanded', 'true');
    });

    it('collapses when expanded and clicked', async () => {
      /**
       * Test Doc:
       * - Why: Toggle behavior for collapse
       * - Contract: Click expanded → collapsed
       * - Usage Notes: Standard disclosure pattern
       * - Quality Contribution: Expected toggle
       * - Worked Example: Expanded → Click → collapsed
       */
      const user = userEvent.setup();
      render(<ThinkingBlock content="I am reasoning about this problem..." />);

      const button = screen.getByRole('button');
      await user.click(button); // expand
      await user.click(button); // collapse

      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('shows content when expanded', async () => {
      /**
       * Test Doc:
       * - Why: Expanded view shows reasoning (AC5)
       * - Contract: Content visible when expanded
       * - Usage Notes: Full thinking content displayed
       * - Quality Contribution: Full content access
       * - Worked Example: Expanded → content visible
       */
      const user = userEvent.setup();
      render(<ThinkingBlock content="I am reasoning about this problem in detail." />);

      await user.click(screen.getByRole('button'));

      expect(screen.getByText(/reasoning about this problem/)).toBeInTheDocument();
    });

    it('toggles with Enter key', async () => {
      /**
       * Test Doc:
       * - Why: Keyboard accessibility (AC16)
       * - Contract: Enter toggles expand/collapse
       * - Usage Notes: Standard button behavior
       * - Quality Contribution: Keyboard support
       * - Worked Example: Focus + Enter → expanded
       */
      const user = userEvent.setup();
      render(<ThinkingBlock content="I am reasoning about this problem..." />);

      const button = screen.getByRole('button');
      button.focus();
      await user.keyboard('{Enter}');

      expect(button).toHaveAttribute('aria-expanded', 'true');
    });

    it('toggles with Space key', async () => {
      /**
       * Test Doc:
       * - Why: Keyboard accessibility (AC16)
       * - Contract: Space toggles expand/collapse
       * - Usage Notes: Alternative to Enter
       * - Quality Contribution: Keyboard support
       * - Worked Example: Focus + Space → expanded
       */
      const user = userEvent.setup();
      render(<ThinkingBlock content="I am reasoning about this problem..." />);

      const button = screen.getByRole('button');
      button.focus();
      await user.keyboard(' ');

      expect(button).toHaveAttribute('aria-expanded', 'true');
    });

    it('has aria-controls linking to content region (AC14)', () => {
      /**
       * Test Doc:
       * - Why: ARIA compliance for screen readers (AC14)
       * - Contract: aria-controls matches content region id
       * - Usage Notes: Required for disclosure pattern
       * - Quality Contribution: Accessibility
       * - Worked Example: aria-controls matches content id
       */
      render(<ThinkingBlock content="I am reasoning..." thinkingId="think-123" />);

      const button = screen.getByRole('button');
      const controlsId = button.getAttribute('aria-controls');
      expect(controlsId).toBeTruthy();
      expect(document.getElementById(controlsId ?? '')).toBeInTheDocument();
    });

    it('can be focused via Tab', async () => {
      /**
       * Test Doc:
       * - Why: Keyboard navigation (AC16)
       * - Contract: Tab focuses the button
       * - Usage Notes: Part of tab order
       * - Quality Contribution: Keyboard accessibility
       * - Worked Example: Tab → button focused
       */
      const user = userEvent.setup();
      render(<ThinkingBlock content="I am reasoning..." />);

      await user.tab();

      expect(screen.getByRole('button')).toHaveFocus();
    });
  });

  // ============ Edge Cases ============

  describe('edge cases', () => {
    it('handles empty content gracefully', () => {
      /**
       * Test Doc:
       * - Why: Defensive programming
       * - Contract: Empty content doesn't crash
       * - Usage Notes: Shows header, no content
       * - Quality Contribution: Robustness
       * - Worked Example: content="" → renders header
       */
      render(<ThinkingBlock content="" />);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('handles very long thinking content', async () => {
      /**
       * Test Doc:
       * - Why: Thinking can be verbose
       * - Contract: Long content displays correctly
       * - Usage Notes: May scroll or truncate
       * - Quality Contribution: Layout stability
       * - Worked Example: 10000 chars → no layout break
       */
      const user = userEvent.setup();
      const longContent = 'Thinking step '.repeat(1000);
      render(<ThinkingBlock content={longContent} />);

      await user.click(screen.getByRole('button'));

      // Should render without breaking
      expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    });

    it('handles signature prop for Claude thinking', () => {
      /**
       * Test Doc:
       * - Why: Claude thinking includes signature (optional field)
       * - Contract: signature prop handled gracefully
       * - Usage Notes: May display or ignore
       * - Quality Contribution: Adapter compatibility
       * - Worked Example: signature="xyz" → no crash
       */
      render(<ThinkingBlock content="I am reasoning..." signature="claude-thinking-abc123" />);
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('handles unicode and formatting in content', async () => {
      /**
       * Test Doc:
       * - Why: Thinking may contain special characters
       * - Contract: Unicode renders correctly
       * - Usage Notes: No encoding issues
       * - Quality Contribution: Internationalization
       * - Worked Example: "思考中..." → renders
       */
      const user = userEvent.setup();
      render(<ThinkingBlock content="Thinking: 思考中... 🤔 考え" />);

      await user.click(screen.getByRole('button'));

      expect(screen.getByText(/思考中/)).toBeInTheDocument();
    });
  });
});
