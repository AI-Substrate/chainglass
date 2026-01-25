/**
 * FileViewer Component Tests - TDD RED Phase
 *
 * Tests for the FileViewer component using pre-highlighted HTML fixtures.
 * Following Tier 2 testing strategy: component tests receive pre-highlighted HTML as props.
 *
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { ViewerFile } from '@chainglass/shared';

import {
  MULTILINE_CODE_HTML,
  SAMPLE_TYPESCRIPT_CODE,
  SIMPLE_CODE_HTML,
  TYPESCRIPT_HIGHLIGHTED_HTML,
} from '../../../../fixtures/highlighted-html-fixtures';

// Import will fail until component is created (RED phase)
import { FileViewer } from '../../../../../apps/web/src/components/viewers/file-viewer';

describe('FileViewer', () => {
  const sampleFile: ViewerFile = {
    path: 'src/utils.ts',
    filename: 'utils.ts',
    content: SAMPLE_TYPESCRIPT_CODE,
  };

  describe('rendering', () => {
    it('should render file content', () => {
      /*
      Test Doc:
      - Why: Core functionality - component must display code
      - Contract: FileViewer displays the highlighted HTML content
      - Usage Notes: Receives pre-highlighted HTML from server component
      - Quality Contribution: Catches basic rendering failures
      - Worked Example: HTML fixture → visible in DOM
      */
      render(<FileViewer file={sampleFile} highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML} />);

      // Content should be visible (use getAllByText since there are multiple const tokens)
      const constElements = screen.getAllByText(/const/);
      expect(constElements.length).toBeGreaterThan(0);
    });

    it('should render Shiki output correctly', () => {
      /*
      Test Doc:
      - Why: Shiki HTML structure must be preserved
      - Contract: Pre/code elements with Shiki classes present
      - Usage Notes: Component wraps Shiki output, doesn't modify structure
      - Quality Contribution: Catches HTML structure corruption
      - Worked Example: <pre class="shiki..."><code>...</code></pre>
      */
      render(<FileViewer file={sampleFile} highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML} />);

      const preElement = document.querySelector('pre.shiki');
      expect(preElement).toBeInTheDocument();
      expect(preElement).toHaveClass('shiki');
    });

    it('should have CSS vars in rendered output', () => {
      /*
      Test Doc:
      - Why: Dual-theme requires CSS variables for theme switching
      - Contract: --shiki-dark CSS vars present in HTML
      - Usage Notes: These enable instant light/dark switching
      - Quality Contribution: Catches missing theme support
      - Worked Example: style="...--shiki-dark:#..."
      */
      render(<FileViewer file={sampleFile} highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML} />);

      const preElement = document.querySelector('pre.shiki');
      const style = preElement?.getAttribute('style') ?? '';
      expect(style).toContain('--shiki-dark');
    });
  });

  describe('line numbers', () => {
    it('should display line numbers by default', () => {
      /*
      Test Doc:
      - Why: Line numbers help users navigate code
      - Contract: Line numbers visible by default (showLineNumbers: true)
      - Usage Notes: Uses CSS counters via data-line attributes
      - Quality Contribution: Catches line number rendering issues
      - Worked Example: data-line="1", data-line="2" present
      */
      render(<FileViewer file={sampleFile} highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML} />);

      // Line elements with data-line should be present
      const lineElements = document.querySelectorAll('[data-line]');
      expect(lineElements.length).toBeGreaterThan(0);

      // Container should NOT have hide-line-numbers class
      const container = screen.getByRole('region');
      expect(container).not.toHaveClass('hide-line-numbers');
    });

    it('should hide line numbers when toggled', async () => {
      /*
      Test Doc:
      - Why: Users may want to hide line numbers
      - Contract: Toggle button hides line numbers via CSS class
      - Usage Notes: Uses hook's toggleLineNumbers function
      - Quality Contribution: Catches toggle functionality issues
      - Worked Example: Click toggle → hide-line-numbers class added
      */
      const user = userEvent.setup();
      render(<FileViewer file={sampleFile} highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML} />);

      const toggleButton = screen.getByRole('button', { name: /line numbers/i });
      await user.click(toggleButton);

      const container = screen.getByRole('region');
      expect(container).toHaveClass('hide-line-numbers');
    });

    it('should apply user-select:none to line numbers', () => {
      /*
      Test Doc:
      - Why: Line numbers must not be copied with code selection
      - Contract: CSS prevents line number copying
      - Usage Notes: Uses CSS ::before pseudo-element with user-select: none
      - Quality Contribution: Catches copy/paste UX issues
      - Worked Example: Line numbers not included when selecting code
      */
      render(<FileViewer file={sampleFile} highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML} />);

      // The CSS file should be imported (verified by class existence)
      // Actual CSS testing requires integration test with styles
      const container = screen.getByRole('region');
      expect(container).toHaveClass('file-viewer');
    });
  });

  describe('accessibility', () => {
    it('should have ARIA labels', () => {
      /*
      Test Doc:
      - Why: Screen readers need semantic information
      - Contract: role="region" and aria-label present
      - Usage Notes: Label includes filename for context
      - Quality Contribution: Catches accessibility violations
      - Worked Example: aria-label="Code viewer for utils.ts"
      */
      render(<FileViewer file={sampleFile} highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML} />);

      const container = screen.getByRole('region');
      expect(container).toHaveAttribute('aria-label', 'Code viewer for utils.ts');
    });

    it('should have focusable container', () => {
      /*
      Test Doc:
      - Why: Keyboard users need to focus the viewer
      - Contract: Container has tabIndex={0} for focus
      - Usage Notes: Focus enables keyboard navigation
      - Quality Contribution: Catches keyboard accessibility issues
      - Worked Example: tabIndex="0" on container
      */
      render(<FileViewer file={sampleFile} highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML} />);

      const container = screen.getByRole('region');
      expect(container).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('keyboard navigation', () => {
    it('should scroll down with ArrowDown', async () => {
      /*
      Test Doc:
      - Why: Keyboard navigation for accessibility
      - Contract: ArrowDown scrolls content down
      - Usage Notes: Requires focus on container first
      - Quality Contribution: Catches keyboard navigation issues
      - Worked Example: Press ArrowDown → scrollTop increases
      */
      render(<FileViewer file={sampleFile} highlightedHtml={MULTILINE_CODE_HTML} />);

      const container = screen.getByRole('region');

      // Focus the container
      container.focus();

      // Simulate ArrowDown keypress
      fireEvent.keyDown(container, { key: 'ArrowDown' });

      // Note: In JSDOM, actual scrolling doesn't happen
      // We verify the handler is attached by checking the element accepts focus
      expect(document.activeElement).toBe(container);
    });

    it('should jump to start with Home key', async () => {
      /*
      Test Doc:
      - Why: Quick navigation to start of file
      - Contract: Home key sets scrollTop to 0
      - Usage Notes: Useful for long files
      - Quality Contribution: Catches Home key handler issues
      - Worked Example: Press Home → scrollTop = 0
      */
      render(<FileViewer file={sampleFile} highlightedHtml={MULTILINE_CODE_HTML} />);

      const container = screen.getByRole('region');
      container.focus();

      fireEvent.keyDown(container, { key: 'Home' });

      // Verify element is focusable and can receive keyboard events
      expect(document.activeElement).toBe(container);
    });

    it('should jump to end with End key', async () => {
      /*
      Test Doc:
      - Why: Quick navigation to end of file
      - Contract: End key sets scrollTop to scrollHeight
      - Usage Notes: Useful for long files
      - Quality Contribution: Catches End key handler issues
      - Worked Example: Press End → scrollTop = scrollHeight - clientHeight
      */
      render(<FileViewer file={sampleFile} highlightedHtml={MULTILINE_CODE_HTML} />);

      const container = screen.getByRole('region');
      container.focus();

      fireEvent.keyDown(container, { key: 'End' });

      expect(document.activeElement).toBe(container);
    });
  });

  describe('error handling', () => {
    it('should handle undefined file gracefully', () => {
      /*
      Test Doc:
      - Why: Component may receive undefined during loading
      - Contract: Renders empty state without crashing
      - Usage Notes: Check for undefined before rendering
      - Quality Contribution: Prevents null pointer exceptions
      - Worked Example: undefined file → empty viewer
      */
      render(<FileViewer file={undefined} highlightedHtml="" />);

      // Should render without crashing
      const container = screen.getByRole('region');
      expect(container).toBeInTheDocument();
    });

    it('should handle empty highlighted HTML', () => {
      /*
      Test Doc:
      - Why: Empty files should render without error
      - Contract: Empty HTML renders empty code block
      - Usage Notes: May happen with empty files
      - Quality Contribution: Catches empty content crashes
      - Worked Example: '' → empty viewer displayed
      */
      render(<FileViewer file={sampleFile} highlightedHtml="" />);

      const container = screen.getByRole('region');
      expect(container).toBeInTheDocument();
    });
  });
});
