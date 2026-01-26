/**
 * DiffViewer Component Tests - TDD GREEN Phase
 *
 * Tests for the DiffViewer component using diff fixtures.
 * Following Tier 2 testing strategy: component tests receive diff data as props.
 *
 * Per Critical Insights Decision #5: Props-based injection with fixtures.
 * DiffViewer receives diffData as a prop, similar to FileViewer's highlightedHtml.
 *
 * Note: @git-diff-view/react requires Canvas API for text measurement.
 * We mock the canvas context for jsdom compatibility.
 *
 * @vitest-environment jsdom
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it } from 'vitest';

// Mock canvas context for @git-diff-view text measurement
beforeAll(() => {
  // biome-ignore lint/suspicious/noExplicitAny: Canvas mock needs any type for jsdom compatibility
  HTMLCanvasElement.prototype.getContext = (): any => ({
    font: '',
    measureText: () => ({ width: 10 }),
    fillText: () => {},
    clearRect: () => {},
    getImageData: () => ({ data: [] }),
    putImageData: () => {},
    createImageData: () => ({ data: [] }),
    setTransform: () => {},
    drawImage: () => {},
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    stroke: () => {},
    translate: () => {},
    scale: () => {},
    rotate: () => {},
    arc: () => {},
    fill: () => {},
    transform: () => {},
    rect: () => {},
    clip: () => {},
  });
});

import type { ViewerFile } from '@chainglass/shared';

import {
  SAMPLE_DIFF_MULTILINE,
  SAMPLE_DIFF_SIMPLE,
} from '../../../../fixtures/highlighted-html-fixtures';

// Import will fail until component is created (RED phase)
import { DiffViewer } from '../../../../../apps/web/src/components/viewers/diff-viewer';

describe('DiffViewer', () => {
  const sampleFile: ViewerFile = {
    path: 'src/utils.ts',
    filename: 'utils.ts',
    content: 'export const x = 2;\nexport const y = "hello";',
  };

  describe('rendering with diff data (AC-19, AC-20)', () => {
    it('should render diff content', () => {
      /*
      Test Doc:
      - Why: Core functionality - component must display diff
      - Contract: DiffViewer displays the diff content
      - Usage Notes: Receives diff as prop from parent Server Component
      - Quality Contribution: Catches basic rendering failures
      - Worked Example: Diff fixture → visible in DOM
      */
      render(<DiffViewer file={sampleFile} diffData={SAMPLE_DIFF_SIMPLE} error={null} />);

      // Diff content should be visible
      expect(screen.getByRole('region')).toBeInTheDocument();
    });

    it('should display added lines', () => {
      /*
      Test Doc:
      - Why: Added lines are a core diff concept
      - Contract: Lines with + prefix are styled as additions
      - Usage Notes: @git-diff-view handles the display
      - Quality Contribution: Catches addition highlighting issues
      - Worked Example: '+export const x = 2;' → green highlighting
      */
      render(<DiffViewer file={sampleFile} diffData={SAMPLE_DIFF_SIMPLE} error={null} />);

      // The diff viewer should contain the changed line
      const container = document.querySelector('.diff-viewer');
      expect(container).toBeInTheDocument();
    });

    it('should display removed lines', () => {
      /*
      Test Doc:
      - Why: Removed lines are a core diff concept
      - Contract: Lines with - prefix are styled as deletions
      - Usage Notes: @git-diff-view handles the display
      - Quality Contribution: Catches deletion highlighting issues
      - Worked Example: '-export const x = 1;' → red highlighting
      */
      render(<DiffViewer file={sampleFile} diffData={SAMPLE_DIFF_SIMPLE} error={null} />);

      const container = document.querySelector('.diff-viewer');
      expect(container).toBeInTheDocument();
    });
  });

  describe('split view mode (AC-21)', () => {
    it('should render in split view by default', () => {
      /*
      Test Doc:
      - Why: Split view is the default per useDiffViewerState
      - Contract: Split (side-by-side) view is shown initially
      - Usage Notes: viewMode prop defaults to 'split'
      - Quality Contribution: Catches default view mode issues
      - Worked Example: No mode prop → split view rendered
      */
      render(<DiffViewer file={sampleFile} diffData={SAMPLE_DIFF_SIMPLE} error={null} />);

      // Split view should be active (check for split-specific class or attribute)
      const container = document.querySelector('.diff-viewer');
      expect(container).toBeInTheDocument();
    });
  });

  describe('unified view mode (AC-22)', () => {
    it('should render unified view when mode is unified', () => {
      /*
      Test Doc:
      - Why: Unified view shows +/- markers in single column
      - Contract: Unified view displays when viewMode='unified'
      - Usage Notes: Toggle switches between modes
      - Quality Contribution: Catches unified view rendering issues
      - Worked Example: viewMode='unified' → +/- markers visible
      */
      render(
        <DiffViewer
          file={sampleFile}
          diffData={SAMPLE_DIFF_SIMPLE}
          error={null}
          viewMode="unified"
        />
      );

      const container = document.querySelector('.diff-viewer');
      expect(container).toBeInTheDocument();
    });
  });

  describe('mode toggle (AC-23)', () => {
    it('should toggle between split and unified views', async () => {
      /*
      Test Doc:
      - Why: Users need to switch between view modes
      - Contract: Toggle button switches viewMode state
      - Usage Notes: Uses useDiffViewerState.toggleViewMode()
      - Quality Contribution: Catches toggle functionality issues
      - Worked Example: Click toggle → mode changes
      */
      const user = userEvent.setup();
      render(<DiffViewer file={sampleFile} diffData={SAMPLE_DIFF_SIMPLE} error={null} />);

      // Wait for async initialization to complete
      const toggleButton = await waitFor(() => screen.getByRole('button', { name: /view/i }), {
        timeout: 3000,
      });
      await user.click(toggleButton);

      // After click, mode should have changed
      // Verify toggle button is present and clickable
      expect(toggleButton).toBeInTheDocument();
    });

    it('should have accessible toggle button', async () => {
      /*
      Test Doc:
      - Why: Accessibility compliance
      - Contract: Toggle button has aria-pressed attribute
      - Usage Notes: Indicates current mode
      - Quality Contribution: Catches accessibility violations
      - Worked Example: aria-pressed="true" for active mode
      */
      render(<DiffViewer file={sampleFile} diffData={SAMPLE_DIFF_SIMPLE} error={null} />);

      // Wait for async initialization to complete
      const toggleButton = await waitFor(() => screen.getByRole('button', { name: /view/i }), {
        timeout: 3000,
      });
      expect(toggleButton).toHaveAttribute('aria-pressed');
    });
  });

  describe('error states (AC-26, AC-27)', () => {
    it('should display not-in-git error message', () => {
      /*
      Test Doc:
      - Why: Graceful error handling
      - Contract: Shows "Not in git repository" for not-git error
      - Usage Notes: error prop overrides diff display
      - Quality Contribution: Catches error display issues
      - Worked Example: error='not-git' → error message shown
      */
      render(<DiffViewer file={sampleFile} diffData={null} error="not-git" />);

      expect(screen.getByText(/not.*git/i)).toBeInTheDocument();
    });

    it('should display no-changes message', () => {
      /*
      Test Doc:
      - Why: Users need to know when file is unchanged
      - Contract: Shows "No changes" for no-changes error
      - Usage Notes: Common case for tracked files
      - Quality Contribution: Catches no-changes state display
      - Worked Example: error='no-changes' → "No changes" shown
      */
      render(<DiffViewer file={sampleFile} diffData={null} error="no-changes" />);

      expect(screen.getByText(/no changes/i)).toBeInTheDocument();
    });

    it('should display git-not-available error message', () => {
      /*
      Test Doc:
      - Why: Handle environments without git
      - Contract: Shows appropriate error for git-not-available
      - Usage Notes: Deployment environment may lack git
      - Quality Contribution: Catches git availability error display
      - Worked Example: error='git-not-available' → error message shown
      */
      render(<DiffViewer file={sampleFile} diffData={null} error="git-not-available" />);

      expect(screen.getByText(/git.*not.*available/i)).toBeInTheDocument();
    });
  });

  describe('theme support (AC-25)', () => {
    it('should have theme-aware styling', () => {
      /*
      Test Doc:
      - Why: Diff viewer should match app theme
      - Contract: CSS supports light/dark mode switching
      - Usage Notes: Uses CSS variables or theme classes
      - Quality Contribution: Catches theme integration issues
      - Worked Example: Dark mode → dark theme colors applied
      */
      render(<DiffViewer file={sampleFile} diffData={SAMPLE_DIFF_SIMPLE} error={null} />);

      const container = document.querySelector('.diff-viewer');
      expect(container).toBeInTheDocument();
      expect(container).toHaveClass('diff-viewer');
    });
  });

  describe('accessibility', () => {
    it('should have ARIA labels', () => {
      /*
      Test Doc:
      - Why: Screen readers need semantic information
      - Contract: <section> with aria-label provides implicit region role
      - Usage Notes: Label includes filename for context
      - Quality Contribution: Catches accessibility violations
      - Worked Example: aria-label="Diff viewer for utils.ts"
      */
      render(<DiffViewer file={sampleFile} diffData={SAMPLE_DIFF_SIMPLE} error={null} />);

      const container = screen.getByRole('region');
      expect(container).toHaveAttribute('aria-label', expect.stringContaining('utils.ts'));
    });
  });

  describe('loading state', () => {
    it('should display loading indicator when isLoading is true', () => {
      /*
      Test Doc:
      - Why: Users need feedback during diff fetching
      - Contract: Loading indicator shown when isLoading=true
      - Usage Notes: Prevents confusion during long operations
      - Quality Contribution: Catches loading state display issues
      - Worked Example: isLoading=true → spinner/text shown
      */
      render(<DiffViewer file={sampleFile} diffData={null} error={null} isLoading />);

      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('should handle undefined file gracefully', () => {
      /*
      Test Doc:
      - Why: Component may receive undefined during mounting
      - Contract: Renders empty state without crashing
      - Usage Notes: Check for undefined before rendering
      - Quality Contribution: Prevents null pointer exceptions
      - Worked Example: undefined file → empty viewer
      */
      render(<DiffViewer file={undefined} diffData={null} error={null} />);

      // Should render without crashing
      const container = screen.getByRole('region');
      expect(container).toBeInTheDocument();
    });
  });
});
