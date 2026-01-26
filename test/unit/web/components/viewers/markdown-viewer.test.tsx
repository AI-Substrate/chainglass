/**
 * MarkdownViewer Component Tests - TDD RED Phase
 *
 * Tests for the MarkdownViewer component with source/preview toggle.
 * Source mode uses FileViewer (Phase 2), Preview mode uses pre-rendered markdown.
 *
 * Following Phase 2 test patterns:
 * - Tier 2 testing strategy: receive pre-rendered content as props
 * - Test Doc format for documentation
 * - No mocks (Fakes Only policy R-TEST-007)
 *
 * @vitest-environment jsdom
 */

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import type { ViewerFile } from '@chainglass/shared';

import {
  SAMPLE_TYPESCRIPT_CODE,
  TYPESCRIPT_HIGHLIGHTED_HTML,
} from '../../../../fixtures/highlighted-html-fixtures';

// Import will fail until component is created (RED phase)
import { MarkdownViewer } from '../../../../../apps/web/src/components/viewers/markdown-viewer';

describe('MarkdownViewer', () => {
  // Sample markdown file for tests
  const sampleMarkdownFile: ViewerFile = {
    path: 'docs/README.md',
    filename: 'README.md',
    content: `# Hello World

This is a **bold** paragraph.

\`\`\`typescript
const x = 1;
\`\`\`
`,
  };

  // Pre-rendered preview HTML (simulates MarkdownServer output)
  const samplePreviewHtml = `
    <article class="prose">
      <h1>Hello World</h1>
      <p>This is a <strong>bold</strong> paragraph.</p>
      <pre class="shiki"><code>const x = 1;</code></pre>
    </article>
  `;

  describe('source mode (default)', () => {
    it('should render in source mode by default', () => {
      /*
      Test Doc:
      - Why: Source mode is the default for markdown files (matches FileViewer behavior)
      - Contract: MarkdownViewer starts in source mode showing raw markdown
      - Usage Notes: Uses useMarkdownViewerState hook with mode='source' default
      - Quality Contribution: Catches default mode initialization issues
      - Worked Example: Initial render → FileViewer visible, preview hidden
      */
      render(
        <MarkdownViewer
          file={sampleMarkdownFile}
          highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML}
          preview={<div data-testid="preview-content">Preview</div>}
        />
      );

      // Source mode: should see the FileViewer
      expect(screen.getByRole('region', { name: /code viewer/i })).toBeInTheDocument();
      // Preview content should not be visible
      expect(screen.queryByTestId('preview-content')).not.toBeInTheDocument();
    });

    it('should display source toggle button as active', () => {
      /*
      Test Doc:
      - Why: Visual indicator shows current mode
      - Contract: Source button has active/pressed state
      - Usage Notes: aria-pressed for accessibility
      - Quality Contribution: Catches toggle state display issues
      - Worked Example: Source button has aria-pressed="true"
      */
      render(
        <MarkdownViewer
          file={sampleMarkdownFile}
          highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML}
          preview={<div>Preview</div>}
        />
      );

      const sourceButton = screen.getByRole('button', { name: /source/i });
      expect(sourceButton).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('toggle buttons', () => {
    it('should show Source and Preview toggle buttons', () => {
      /*
      Test Doc:
      - Why: Users need buttons to switch between modes
      - Contract: Both Source and Preview buttons are visible
      - Usage Notes: Buttons in toolbar area
      - Quality Contribution: Catches missing toggle UI
      - Worked Example: Both buttons present in DOM
      */
      render(
        <MarkdownViewer
          file={sampleMarkdownFile}
          highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML}
          preview={<div>Preview</div>}
        />
      );

      expect(screen.getByRole('button', { name: /source/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /preview/i })).toBeInTheDocument();
    });

    it('should toggle to preview mode when Preview button is clicked', async () => {
      /*
      Test Doc:
      - Why: Core toggle functionality
      - Contract: Clicking Preview shows preview content
      - Usage Notes: Uses toggleMode from useMarkdownViewerState
      - Quality Contribution: Catches toggle handler issues
      - Worked Example: Click Preview → preview visible, source hidden
      */
      const user = userEvent.setup();
      render(
        <MarkdownViewer
          file={sampleMarkdownFile}
          highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML}
          preview={<div data-testid="preview-content">Preview Content</div>}
        />
      );

      // Initially in source mode
      expect(screen.queryByTestId('preview-content')).not.toBeInTheDocument();

      // Click Preview button
      await user.click(screen.getByRole('button', { name: /preview/i }));

      // Now in preview mode
      expect(screen.getByTestId('preview-content')).toBeInTheDocument();
    });

    it('should toggle back to source mode', async () => {
      /*
      Test Doc:
      - Why: Users need to switch back to source
      - Contract: Toggling mode is bidirectional
      - Usage Notes: Click Source after being in Preview
      - Quality Contribution: Catches one-way toggle bugs
      - Worked Example: Preview → Source → FileViewer visible again
      */
      const user = userEvent.setup();
      render(
        <MarkdownViewer
          file={sampleMarkdownFile}
          highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML}
          preview={<div data-testid="preview-content">Preview</div>}
        />
      );

      // Toggle to preview
      await user.click(screen.getByRole('button', { name: /preview/i }));
      expect(screen.getByTestId('preview-content')).toBeInTheDocument();

      // Toggle back to source
      await user.click(screen.getByRole('button', { name: /source/i }));
      expect(screen.queryByTestId('preview-content')).not.toBeInTheDocument();
      expect(screen.getByRole('region', { name: /code viewer/i })).toBeInTheDocument();
    });

    it('should update button states on toggle', async () => {
      /*
      Test Doc:
      - Why: Visual feedback for current mode
      - Contract: Active button has aria-pressed="true"
      - Usage Notes: Accessibility requirement
      - Quality Contribution: Catches state sync issues
      - Worked Example: Toggle → button states update accordingly
      */
      const user = userEvent.setup();
      render(
        <MarkdownViewer
          file={sampleMarkdownFile}
          highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML}
          preview={<div>Preview</div>}
        />
      );

      const sourceButton = screen.getByRole('button', { name: /source/i });
      const previewButton = screen.getByRole('button', { name: /preview/i });

      // Initially source is active
      expect(sourceButton).toHaveAttribute('aria-pressed', 'true');
      expect(previewButton).toHaveAttribute('aria-pressed', 'false');

      // Toggle to preview
      await user.click(previewButton);

      // Now preview is active
      expect(sourceButton).toHaveAttribute('aria-pressed', 'false');
      expect(previewButton).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('preview mode', () => {
    it('should render preview content when in preview mode', async () => {
      /*
      Test Doc:
      - Why: Preview mode shows formatted markdown
      - Contract: Preview ReactNode is rendered in preview mode
      - Usage Notes: Preview is pre-rendered by Server Component
      - Quality Contribution: Catches preview rendering issues
      - Worked Example: Toggle to preview → preview content visible
      */
      const user = userEvent.setup();
      render(
        <MarkdownViewer
          file={sampleMarkdownFile}
          highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML}
          preview={
            <article className="prose">
              <h1>Hello World</h1>
              <p>
                This is a <strong>bold</strong> paragraph.
              </p>
            </article>
          }
        />
      );

      await user.click(screen.getByRole('button', { name: /preview/i }));

      // Preview content should be visible
      expect(screen.getByRole('heading', { name: /hello world/i })).toBeInTheDocument();
      expect(screen.getByText(/bold/)).toBeInTheDocument();
    });

    it('should hide FileViewer when in preview mode', async () => {
      /*
      Test Doc:
      - Why: Only one mode should be visible at a time
      - Contract: FileViewer hidden when preview is shown
      - Usage Notes: Conditional rendering based on isPreviewMode
      - Quality Contribution: Catches both modes showing simultaneously
      - Worked Example: Preview mode → no FileViewer region
      */
      const user = userEvent.setup();
      render(
        <MarkdownViewer
          file={sampleMarkdownFile}
          highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML}
          preview={<div data-testid="preview">Preview</div>}
        />
      );

      await user.click(screen.getByRole('button', { name: /preview/i }));

      // FileViewer should be hidden
      expect(screen.queryByRole('region', { name: /code viewer/i })).not.toBeInTheDocument();
    });
  });

  describe('mode persistence', () => {
    it('should persist mode after multiple toggles', async () => {
      /*
      Test Doc:
      - Why: Mode should not reset unexpectedly
      - Contract: Multiple toggles maintain correct state
      - Usage Notes: State managed by useMarkdownViewerState
      - Quality Contribution: Catches state persistence bugs
      - Worked Example: source → preview → source → preview works correctly
      */
      const user = userEvent.setup();
      render(
        <MarkdownViewer
          file={sampleMarkdownFile}
          highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML}
          preview={<div data-testid="preview">Preview</div>}
        />
      );

      const sourceButton = screen.getByRole('button', { name: /source/i });
      const previewButton = screen.getByRole('button', { name: /preview/i });

      // Toggle multiple times
      await user.click(previewButton);
      expect(screen.getByTestId('preview')).toBeInTheDocument();

      await user.click(sourceButton);
      expect(screen.queryByTestId('preview')).not.toBeInTheDocument();

      await user.click(previewButton);
      expect(screen.getByTestId('preview')).toBeInTheDocument();

      // Final state: preview mode
      expect(previewButton).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('styling', () => {
    it('should have markdown-viewer class on container', () => {
      /*
      Test Doc:
      - Why: CSS hook for styling
      - Contract: Container has markdown-viewer class
      - Usage Notes: Used by markdown-viewer.css
      - Quality Contribution: Catches missing CSS class
      - Worked Example: Container element has markdown-viewer class
      */
      render(
        <MarkdownViewer
          file={sampleMarkdownFile}
          highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML}
          preview={<div>Preview</div>}
        />
      );

      const container = document.querySelector('.markdown-viewer');
      expect(container).toBeInTheDocument();
    });

    it('should apply prose class to preview container', async () => {
      /*
      Test Doc:
      - Why: Typography styling via @tailwindcss/typography
      - Contract: Preview wrapped in prose class
      - Usage Notes: prose dark:prose-invert for theme support
      - Quality Contribution: Catches missing typography styling
      - Worked Example: Preview has prose class
      */
      const user = userEvent.setup();
      render(
        <MarkdownViewer
          file={sampleMarkdownFile}
          highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML}
          preview={
            <article className="prose dark:prose-invert">
              <h1>Test</h1>
            </article>
          }
        />
      );

      await user.click(screen.getByRole('button', { name: /preview/i }));

      const proseContainer = document.querySelector('.prose');
      expect(proseContainer).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('should have ARIA labels on container', () => {
      /*
      Test Doc:
      - Why: Screen readers need semantic information
      - Contract: Container has descriptive aria-label
      - Usage Notes: Label includes filename context
      - Quality Contribution: Catches accessibility violations
      - Worked Example: aria-label="Markdown viewer for README.md"
      */
      render(
        <MarkdownViewer
          file={sampleMarkdownFile}
          highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML}
          preview={<div>Preview</div>}
        />
      );

      const container = document.querySelector('.markdown-viewer');
      expect(container).toHaveAttribute('aria-label', 'Markdown viewer for README.md');
    });

    it('should have toggle button group with role', () => {
      /*
      Test Doc:
      - Why: Toggle buttons should be grouped semantically
      - Contract: Buttons in a group with role="group"
      - Usage Notes: Helps screen reader navigation
      - Quality Contribution: Catches toggle group accessibility issues
      - Worked Example: role="group" with aria-label
      */
      render(
        <MarkdownViewer
          file={sampleMarkdownFile}
          highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML}
          preview={<div>Preview</div>}
        />
      );

      const buttonGroup = screen.getByRole('group', { name: /view mode/i });
      expect(buttonGroup).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('should handle undefined file gracefully', () => {
      /*
      Test Doc:
      - Why: Component may receive undefined during loading
      - Contract: Renders without crashing
      - Usage Notes: Check for undefined before rendering
      - Quality Contribution: Prevents null pointer exceptions
      - Worked Example: undefined file → renders with fallback
      */
      render(
        <MarkdownViewer file={undefined} highlightedHtml="" preview={<div>No content</div>} />
      );

      // Should render without crashing
      const container = document.querySelector('.markdown-viewer');
      expect(container).toBeInTheDocument();
    });
  });

  describe('GFM features (AC-11)', () => {
    it('should render GFM table as HTML table element', async () => {
      /*
      Test Doc:
      - Why: GFM tables must render as semantic HTML tables
      - Contract: Tables in markdown become <table> elements
      - Usage Notes: remark-gfm handles table parsing
      - Quality Contribution: Validates AC-11 table requirement
      - Worked Example: | col | col | → <table><thead>...
      */
      const user = userEvent.setup();
      render(
        <MarkdownViewer
          file={sampleMarkdownFile}
          highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML}
          preview={
            <article className="prose">
              <table>
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Tables</td>
                    <td>Complete</td>
                  </tr>
                </tbody>
              </table>
            </article>
          }
        />
      );

      await user.click(screen.getByRole('button', { name: /preview/i }));

      // Table should be rendered
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: /feature/i })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: /complete/i })).toBeInTheDocument();
    });

    it('should render task list with checkboxes', async () => {
      /*
      Test Doc:
      - Why: Task lists should have interactive checkboxes
      - Contract: - [x] becomes checked checkbox, - [ ] becomes unchecked
      - Usage Notes: remark-gfm handles task list parsing
      - Quality Contribution: Validates AC-11 task list requirement
      - Worked Example: - [x] done → <input type="checkbox" checked>
      */
      const user = userEvent.setup();
      render(
        <MarkdownViewer
          file={sampleMarkdownFile}
          highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML}
          preview={
            <article className="prose">
              <ul>
                <li>
                  <input type="checkbox" checked readOnly /> Completed task
                </li>
                <li>
                  <input type="checkbox" readOnly /> Pending task
                </li>
              </ul>
            </article>
          }
        />
      );

      await user.click(screen.getByRole('button', { name: /preview/i }));

      // Checkboxes should be rendered
      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes).toHaveLength(2);
      expect(checkboxes[0]).toBeChecked();
      expect(checkboxes[1]).not.toBeChecked();
    });

    it('should render strikethrough as <del> element', async () => {
      /*
      Test Doc:
      - Why: Strikethrough text must use semantic <del> element
      - Contract: ~~text~~ becomes <del>text</del>
      - Usage Notes: remark-gfm handles strikethrough parsing
      - Quality Contribution: Validates AC-11 strikethrough requirement
      - Worked Example: ~~deleted~~ → <del>deleted</del>
      */
      const user = userEvent.setup();
      render(
        <MarkdownViewer
          file={sampleMarkdownFile}
          highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML}
          preview={
            <article className="prose">
              <p>
                This is <del>deleted</del> text.
              </p>
            </article>
          }
        />
      );

      await user.click(screen.getByRole('button', { name: /preview/i }));

      // Strikethrough should use <del> element
      const delElement = document.querySelector('del');
      expect(delElement).toBeInTheDocument();
      expect(delElement).toHaveTextContent('deleted');
    });

    it('should render autolinks as clickable links', async () => {
      /*
      Test Doc:
      - Why: URLs should be automatically linkified
      - Contract: https://example.com becomes <a href="...">
      - Usage Notes: remark-gfm handles autolink parsing
      - Quality Contribution: Validates AC-11 autolink requirement
      - Worked Example: https://nextjs.org → <a href="https://nextjs.org">
      */
      const user = userEvent.setup();
      render(
        <MarkdownViewer
          file={sampleMarkdownFile}
          highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML}
          preview={
            <article className="prose">
              <p>
                Check out <a href="https://nextjs.org">https://nextjs.org</a> for more info.
              </p>
            </article>
          }
        />
      );

      await user.click(screen.getByRole('button', { name: /preview/i }));

      // Link should be rendered
      const link = screen.getByRole('link', { name: /nextjs\.org/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', 'https://nextjs.org');
    });

    it('should render code fence with syntax highlighting', async () => {
      /*
      Test Doc:
      - Why: Code blocks must have syntax highlighting
      - Contract: Code fences get Shiki classes via @shikijs/rehype
      - Usage Notes: Pre-rendered by MarkdownServer with Shiki
      - Quality Contribution: Validates code block rendering
      - Worked Example: ```typescript → <pre class="shiki">...
      */
      const user = userEvent.setup();
      render(
        <MarkdownViewer
          file={sampleMarkdownFile}
          highlightedHtml={TYPESCRIPT_HIGHLIGHTED_HTML}
          preview={
            <article className="prose">
              <pre className="shiki" style={{ backgroundColor: '#fff' }}>
                <code>
                  <span className="line">
                    <span style={{ color: '#D73A49' }}>const</span>
                    <span style={{ color: '#005CC5' }}> x</span>
                    <span style={{ color: '#D73A49' }}> =</span>
                    <span style={{ color: '#005CC5' }}> 1</span>
                  </span>
                </code>
              </pre>
            </article>
          }
        />
      );

      await user.click(screen.getByRole('button', { name: /preview/i }));

      // Shiki output should be present
      const preElement = document.querySelector('pre.shiki');
      expect(preElement).toBeInTheDocument();
    });
  });
});
