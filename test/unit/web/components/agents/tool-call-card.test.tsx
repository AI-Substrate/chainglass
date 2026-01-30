/**
 * ToolCallCard Component Tests
 *
 * TDD tests for the tool call rendering component.
 * Tests verify: header, status icons, expand/collapse, auto-expand on error, truncation.
 *
 * Part of Plan 015: Better Agents (Phase 4: UI Components)
 *
 * @module test/unit/web/components/agents/tool-call-card.test.tsx
 */

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

// Import will fail until component is created (TDD RED phase)
import { ToolCallCard } from '@/components/agents/tool-call-card';

// ============ T001: ToolCallCard Rendering Tests ============

describe('ToolCallCard', () => {
  describe('T001: header and status rendering', () => {
    it('renders tool name in header', () => {
      /**
       * Test Doc:
       * - Why: Users need to see which tool was invoked (AC1)
       * - Contract: toolName prop appears in visible header
       * - Usage Notes: toolName from AgentToolCallEvent.data.toolName
       * - Quality Contribution: Core tool identification
       * - Worked Example: toolName="Bash" → "Bash" visible in header
       */
      render(<ToolCallCard toolName="Bash" status="running" input="npm test" output="" />);
      expect(screen.getByText('Bash')).toBeInTheDocument();
    });

    it('shows running status indicator when status is running', () => {
      /**
       * Test Doc:
       * - Why: Users need real-time feedback on tool execution (AC8)
       * - Contract: status="running" shows Running indicator
       * - Usage Notes: Blue pulsing dot per prototype
       * - Quality Contribution: Real-time status awareness
       * - Worked Example: status="running" → "Running" visible
       */
      render(<ToolCallCard toolName="Bash" status="running" input="npm test" output="" />);
      expect(screen.getByText(/running/i)).toBeInTheDocument();
    });

    it('shows complete status indicator when status is complete', () => {
      /**
       * Test Doc:
       * - Why: Users need to know when tool finished (AC2)
       * - Contract: status="complete" shows Complete indicator
       * - Usage Notes: Green checkmark per prototype
       * - Quality Contribution: Completion confirmation
       * - Worked Example: status="complete" → "Complete" visible
       */
      render(
        <ToolCallCard
          toolName="Bash"
          status="complete"
          input="npm test"
          output="All tests passed"
        />
      );
      expect(screen.getByText(/complete/i)).toBeInTheDocument();
    });

    it('shows error status indicator when status is error', () => {
      /**
       * Test Doc:
       * - Why: Errors need immediate visibility (AC12)
       * - Contract: status="error" shows Error indicator with red styling
       * - Usage Notes: Red dot and "Error" text
       * - Quality Contribution: Error awareness
       * - Worked Example: status="error" → "Error" visible
       */
      render(
        <ToolCallCard
          toolName="Bash"
          status="error"
          input="npm test"
          output="ENOENT: file not found"
          isError
        />
      );
      expect(screen.getByText(/error/i)).toBeInTheDocument();
    });

    it('renders with distinct visual styling from chat messages (AC11)', () => {
      /**
       * Test Doc:
       * - Why: Tool calls must be visually distinct from chat (AC11)
       * - Contract: Component has border/background different from LogEntry
       * - Usage Notes: Card-like appearance with border
       * - Quality Contribution: Visual hierarchy
       * - Worked Example: Component has rounded border styling
       */
      const { container } = render(
        <ToolCallCard toolName="Bash" status="running" input="npm test" output="" />
      );
      // Should have a bordered container element
      const card = container.firstChild as HTMLElement;
      expect(card).toHaveClass(/border|rounded/);
    });

    it('displays tool icon appropriate to tool type', () => {
      /**
       * Test Doc:
       * - Why: Visual affordance for tool type (AC11)
       * - Contract: Icon rendered (Terminal for Bash, code for others)
       * - Usage Notes: Uses Lucide icons
       * - Quality Contribution: Quick tool identification
       * - Worked Example: Terminal icon visible
       */
      render(<ToolCallCard toolName="Bash" status="running" input="npm test" output="" />);
      // Should have an icon element (could be SVG or element with specific role)
      // The icon is decorative, so we check for aria-hidden
      const icons = document.querySelectorAll('[aria-hidden="true"]');
      expect(icons.length).toBeGreaterThan(0);
    });
  });

  // ============ T002: Expand/Collapse Behavior Tests ============

  describe('T002: expand/collapse behavior', () => {
    it('is collapsed by default', () => {
      /**
       * Test Doc:
       * - Why: Keep UI compact until user wants details (AC3)
       * - Contract: aria-expanded="false" on initial render
       * - Usage Notes: Header visible, body hidden
       * - Quality Contribution: Clean default state
       * - Worked Example: Render → aria-expanded="false"
       */
      render(
        <ToolCallCard
          toolName="Bash"
          status="complete"
          input="npm test"
          output="All tests passed"
        />
      );
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('expands when header is clicked', async () => {
      /**
       * Test Doc:
       * - Why: Users need to see tool details on demand (AC3)
       * - Contract: Click header → aria-expanded="true"
       * - Usage Notes: Uses button for accessibility
       * - Quality Contribution: Interactive disclosure
       * - Worked Example: Click → aria-expanded changes to "true"
       */
      const user = userEvent.setup();
      render(
        <ToolCallCard
          toolName="Bash"
          status="complete"
          input="npm test"
          output="All tests passed"
        />
      );

      const button = screen.getByRole('button');
      await user.click(button);

      expect(button).toHaveAttribute('aria-expanded', 'true');
    });

    it('collapses when expanded header is clicked', async () => {
      /**
       * Test Doc:
       * - Why: Toggle behavior for compact/expanded view
       * - Contract: Click expanded card → collapses
       * - Usage Notes: Toggle state on each click
       * - Quality Contribution: Expected disclosure pattern
       * - Worked Example: Expanded → Click → collapsed
       */
      const user = userEvent.setup();
      render(
        <ToolCallCard
          toolName="Bash"
          status="complete"
          input="npm test"
          output="All tests passed"
        />
      );

      const button = screen.getByRole('button');
      await user.click(button); // expand
      await user.click(button); // collapse

      expect(button).toHaveAttribute('aria-expanded', 'false');
    });

    it('shows input and output when expanded', async () => {
      /**
       * Test Doc:
       * - Why: Expanded view shows full details (AC3)
       * - Contract: Expanded state reveals input and output
       * - Usage Notes: Input = command, output = result
       * - Quality Contribution: Full tool visibility
       * - Worked Example: Expanded → input and output visible
       */
      const user = userEvent.setup();
      render(
        <ToolCallCard
          toolName="Bash"
          status="complete"
          input="npm test"
          output="All tests passed"
        />
      );

      await user.click(screen.getByRole('button'));

      expect(screen.getByText('npm test')).toBeInTheDocument();
      expect(screen.getByText('All tests passed')).toBeInTheDocument();
    });

    it('hides input and output when collapsed', () => {
      /**
       * Test Doc:
       * - Why: Collapsed view is compact (AC3)
       * - Contract: Collapsed state hides details
       * - Usage Notes: Only header visible
       * - Quality Contribution: Clean collapsed state
       * - Worked Example: Collapsed → no input/output text
       */
      render(
        <ToolCallCard
          toolName="Bash"
          status="complete"
          input="npm test"
          output="All tests passed"
        />
      );

      // Output should not be visible in collapsed state
      // Note: Input might be shown in header preview
      expect(screen.queryByText('All tests passed')).not.toBeInTheDocument();
    });

    it('has aria-controls linking to content region', () => {
      /**
       * Test Doc:
       * - Why: ARIA compliance for screen readers (AC14)
       * - Contract: aria-controls matches content region id
       * - Usage Notes: Required for disclosure pattern
       * - Quality Contribution: Accessibility compliance
       * - Worked Example: aria-controls="panel-id" matches content id
       */
      render(
        <ToolCallCard
          toolName="Bash"
          status="complete"
          input="npm test"
          output="All tests passed"
          toolCallId="test-123"
        />
      );

      const button = screen.getByRole('button');
      const controlsId = button.getAttribute('aria-controls');
      expect(controlsId).toBeTruthy();
      // The controlled element should exist (even if hidden)
      expect(document.getElementById(controlsId ?? '')).toBeInTheDocument();
    });
  });

  // ============ T003: Auto-expand on Error Tests ============

  describe('T003: auto-expand on error (AC12a)', () => {
    it('auto-expands when isError is true on initial render', () => {
      /**
       * Test Doc:
       * - Why: Errors need immediate visibility (AC12a)
       * - Contract: isError=true → aria-expanded="true" on mount
       * - Usage Notes: Overrides default collapsed state
       * - Quality Contribution: Error visibility guarantee
       * - Worked Example: isError=true → expanded immediately
       */
      render(
        <ToolCallCard
          toolName="Bash"
          status="error"
          input="npm test"
          output="Error: ENOENT"
          isError
        />
      );

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-expanded', 'true');
    });

    it('auto-expands when isError changes from false to true', () => {
      /**
       * Test Doc:
       * - Why: Runtime errors need immediate attention (AC12a)
       * - Contract: isError false→true triggers expansion
       * - Usage Notes: useEffect watches isError prop
       * - Quality Contribution: Dynamic error handling
       * - Worked Example: Rerender with isError=true → expands
       */
      const { rerender } = render(
        <ToolCallCard toolName="Bash" status="running" input="npm test" output="" isError={false} />
      );

      // Initially collapsed
      expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');

      // Rerender with error
      rerender(
        <ToolCallCard
          toolName="Bash"
          status="error"
          input="npm test"
          output="Error: ENOENT"
          isError
        />
      );

      // Should auto-expand
      expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    });

    it('shows error output when auto-expanded', () => {
      /**
       * Test Doc:
       * - Why: Error details must be visible (AC12)
       * - Contract: Auto-expand shows error output
       * - Usage Notes: Red styling on error output
       * - Quality Contribution: Error visibility
       * - Worked Example: isError → error output visible
       */
      render(
        <ToolCallCard
          toolName="Bash"
          status="error"
          input="npm test"
          output="Error: ENOENT: file not found"
          isError
        />
      );

      expect(screen.getByText(/ENOENT/)).toBeInTheDocument();
    });

    it('allows user to collapse error card after auto-expand', async () => {
      /**
       * Test Doc:
       * - Why: User should control view even after auto-expand
       * - Contract: Click can collapse auto-expanded error
       * - Usage Notes: User preference takes precedence
       * - Quality Contribution: User control
       * - Worked Example: Auto-expanded error → click → collapsed
       */
      const user = userEvent.setup();
      render(
        <ToolCallCard
          toolName="Bash"
          status="error"
          input="npm test"
          output="Error: ENOENT"
          isError
        />
      );

      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-expanded', 'true');

      await user.click(button);
      expect(button).toHaveAttribute('aria-expanded', 'false');
    });
  });

  // ============ T004: Output Truncation Tests ============

  describe('T004: output truncation (AC13a)', () => {
    it('shows full output when under 20 lines', async () => {
      /**
       * Test Doc:
       * - Why: Short output needs no truncation (AC13a)
       * - Contract: Output ≤20 lines shows complete
       * - Usage Notes: No "Show more" link needed
       * - Quality Contribution: Full visibility for short output
       * - Worked Example: 5 lines → all visible, no "Show more"
       */
      const user = userEvent.setup();
      const shortOutput = 'line 1\nline 2\nline 3\nline 4\nline 5';
      render(
        <ToolCallCard toolName="Bash" status="complete" input="echo test" output={shortOutput} />
      );

      await user.click(screen.getByRole('button'));

      expect(screen.getByText(/line 1/)).toBeInTheDocument();
      expect(screen.getByText(/line 5/)).toBeInTheDocument();
      expect(screen.queryByText(/show more/i)).not.toBeInTheDocument();
    });

    it('truncates output at 20 lines with "Show more" link', async () => {
      /**
       * Test Doc:
       * - Why: Long output shouldn't overwhelm UI (AC13a)
       * - Contract: Output >20 lines shows first 20 + "Show more"
       * - Usage Notes: Shows "X more lines" count
       * - Quality Contribution: Manageable output display
       * - Worked Example: 50 lines → 20 visible + "Show more (30 more lines)"
       */
      const user = userEvent.setup();
      const longOutput = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n');
      render(
        <ToolCallCard toolName="Bash" status="complete" input="cat bigfile" output={longOutput} />
      );

      // Get the header button specifically (has aria-expanded)
      const headerButton = screen.getByRole('button', { expanded: false });
      await user.click(headerButton);

      expect(screen.getByText(/line 1/)).toBeInTheDocument();
      expect(screen.getByText(/show more/i)).toBeInTheDocument();
      // Should indicate remaining lines
      expect(screen.getByText(/30.*more.*line/i)).toBeInTheDocument();
    });

    it('truncates output at 2000 characters with "Show more" link', async () => {
      /**
       * Test Doc:
       * - Why: Character limit for very long single lines (AC13a)
       * - Contract: Output >2000 chars truncates with "Show more"
       * - Usage Notes: Character count complements line count
       * - Quality Contribution: Handles dense output
       * - Worked Example: 5000 char output → truncated + "Show more"
       */
      const user = userEvent.setup();
      const longOutput = 'x'.repeat(5000);
      render(
        <ToolCallCard toolName="Bash" status="complete" input="cat dense" output={longOutput} />
      );

      // Get the header button specifically (has aria-expanded)
      const headerButton = screen.getByRole('button', { expanded: false });
      await user.click(headerButton);

      expect(screen.getByText(/show more/i)).toBeInTheDocument();
    });

    it('shows full output after clicking "Show more"', async () => {
      /**
       * Test Doc:
       * - Why: Users can expand truncated output on demand
       * - Contract: Click "Show more" → full output visible
       * - Usage Notes: Reveals all hidden content
       * - Quality Contribution: Full access when needed
       * - Worked Example: Click "Show more" → all 50 lines visible
       */
      const user = userEvent.setup();
      const longOutput = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n');
      render(
        <ToolCallCard toolName="Bash" status="complete" input="cat bigfile" output={longOutput} />
      );

      // Get the header button specifically (has aria-expanded)
      const headerButton = screen.getByRole('button', { expanded: false });
      await user.click(headerButton);
      await user.click(screen.getByText(/show more/i));

      expect(screen.getByText(/line 50/)).toBeInTheDocument();
      expect(screen.queryByText(/show more/i)).not.toBeInTheDocument();
    });

    it('shows "Show less" after expanding truncated output', async () => {
      /**
       * Test Doc:
       * - Why: Users can re-collapse expanded output
       * - Contract: After "Show more" → "Show less" appears
       * - Usage Notes: Toggle between truncated/full
       * - Quality Contribution: Reversible action
       * - Worked Example: Expanded → "Show less" visible
       */
      const user = userEvent.setup();
      const longOutput = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join('\n');
      render(
        <ToolCallCard toolName="Bash" status="complete" input="cat bigfile" output={longOutput} />
      );

      // Get the header button specifically (has aria-expanded)
      const headerButton = screen.getByRole('button', { expanded: false });
      await user.click(headerButton);
      await user.click(screen.getByText(/show more/i));

      expect(screen.getByText(/show less/i)).toBeInTheDocument();
    });
  });

  // ============ T011: Keyboard Navigation Tests ============

  describe('T011: keyboard navigation (AC16)', () => {
    it('can be focused via Tab', async () => {
      /**
       * Test Doc:
       * - Why: Keyboard users need tab navigation (AC16)
       * - Contract: Tab focuses the card button
       * - Usage Notes: Button is focusable
       * - Quality Contribution: Keyboard accessibility
       * - Worked Example: Tab → button focused
       */
      const user = userEvent.setup();
      render(<ToolCallCard toolName="Bash" status="complete" input="npm test" output="passed" />);

      await user.tab();

      expect(screen.getByRole('button')).toHaveFocus();
    });

    it('toggles expand/collapse with Enter key', async () => {
      /**
       * Test Doc:
       * - Why: Enter activates buttons (AC16)
       * - Contract: Enter on focused button toggles state
       * - Usage Notes: Standard keyboard interaction
       * - Quality Contribution: Keyboard interactivity
       * - Worked Example: Focus + Enter → expanded
       */
      const user = userEvent.setup();
      render(<ToolCallCard toolName="Bash" status="complete" input="npm test" output="passed" />);

      const button = screen.getByRole('button');
      button.focus();
      await user.keyboard('{Enter}');

      expect(button).toHaveAttribute('aria-expanded', 'true');
    });

    it('toggles expand/collapse with Space key', async () => {
      /**
       * Test Doc:
       * - Why: Space activates buttons (AC16)
       * - Contract: Space on focused button toggles state
       * - Usage Notes: Alternative to Enter
       * - Quality Contribution: Keyboard interactivity
       * - Worked Example: Focus + Space → expanded
       */
      const user = userEvent.setup();
      render(<ToolCallCard toolName="Bash" status="complete" input="npm test" output="passed" />);

      const button = screen.getByRole('button');
      button.focus();
      await user.keyboard(' ');

      expect(button).toHaveAttribute('aria-expanded', 'true');
    });

    it('has visible focus indicator', () => {
      /**
       * Test Doc:
       * - Why: Users need to see focused element (AC16)
       * - Contract: Focus ring visible on button
       * - Usage Notes: Uses focus-visible styling
       * - Quality Contribution: Focus visibility
       * - Worked Example: Focus → ring/outline visible
       */
      render(<ToolCallCard toolName="Bash" status="complete" input="npm test" output="passed" />);

      const button = screen.getByRole('button');
      // Check for focus ring classes (Tailwind focus-visible)
      expect(button.className).toMatch(/focus|outline|ring/);
    });
  });

  // ============ T013: ARIA Live Region Tests ============

  describe('T013: ARIA live region (AC15)', () => {
    it('has aria-live region for status updates', () => {
      /**
       * Test Doc:
       * - Why: Screen readers announce status changes (AC15)
       * - Contract: Status has aria-live="polite"
       * - Usage Notes: Polite = doesn't interrupt
       * - Quality Contribution: Screen reader support
       * - Worked Example: Status region has aria-live
       */
      render(<ToolCallCard toolName="Bash" status="running" input="npm test" output="" />);

      const liveRegion = screen.getByText(/running/i).closest('[aria-live]');
      expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    });

    it('announces status change from running to complete', () => {
      /**
       * Test Doc:
       * - Why: Completion should be announced (AC15)
       * - Contract: Status text changes trigger announcement
       * - Usage Notes: aria-live region content changes
       * - Quality Contribution: Dynamic announcements
       * - Worked Example: "Running" → "Complete" announced
       */
      const { rerender } = render(
        <ToolCallCard toolName="Bash" status="running" input="npm test" output="" />
      );

      expect(screen.getByText(/running/i)).toBeInTheDocument();

      rerender(<ToolCallCard toolName="Bash" status="complete" input="npm test" output="passed" />);

      expect(screen.getByText(/complete/i)).toBeInTheDocument();
    });
  });

  // ============ Edge Cases ============

  describe('edge cases', () => {
    it('handles empty output gracefully', async () => {
      /**
       * Test Doc:
       * - Why: Defensive programming for edge cases
       * - Contract: Empty output doesn't break component
       * - Usage Notes: Shows "No output" or similar
       * - Quality Contribution: Robustness
       * - Worked Example: output="" → no crash
       */
      const user = userEvent.setup();
      render(<ToolCallCard toolName="Bash" status="complete" input="echo" output="" />);

      await user.click(screen.getByRole('button'));

      // Should not crash and should show something meaningful
      expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    });

    it('handles very long tool name', () => {
      /**
       * Test Doc:
       * - Why: Defensive against unusual tool names
       * - Contract: Long tool name truncates or wraps
       * - Usage Notes: CSS handles overflow
       * - Quality Contribution: Layout stability
       * - Worked Example: 100 char name → doesn't break layout
       */
      const longName = 'A'.repeat(100);
      render(<ToolCallCard toolName={longName} status="complete" input="test" output="ok" />);

      // Should render without breaking
      expect(screen.getByRole('button')).toBeInTheDocument();
    });

    it('handles unicode and emoji in output', async () => {
      /**
       * Test Doc:
       * - Why: Real tool output may contain unicode
       * - Contract: Unicode/emoji renders correctly
       * - Usage Notes: No encoding issues
       * - Quality Contribution: Internationalization
       * - Worked Example: "✅ 日本語" → renders correctly
       */
      const user = userEvent.setup();
      render(
        <ToolCallCard
          toolName="Bash"
          status="complete"
          input="echo test"
          output="✅ Success 日本語 🎉"
        />
      );

      await user.click(screen.getByRole('button'));

      expect(screen.getByText(/✅ Success 日本語 🎉/)).toBeInTheDocument();
    });
  });
});
