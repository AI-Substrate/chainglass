/**
 * MarkdownInline Component Tests
 *
 * Tests for the lightweight client-side markdown renderer.
 * Verifies markdown elements render correctly without Shiki syntax highlighting.
 *
 * Part of Plan 015: Better Agents (Phase 5 Subtask 002)
 *
 * @module test/unit/web/components/markdown-inline.test.tsx
 */

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MarkdownInline } from '@/components/markdown-inline';

describe('MarkdownInline', () => {
  describe('basic rendering', () => {
    it('renders plain text correctly', () => {
      /**
       * Test Doc:
       * - Why: Basic text should pass through unchanged
       * - Contract: Plain text content renders as text
       * - Worked Example: "Hello world" → "Hello world" in DOM
       */
      render(<MarkdownInline content="Hello world" />);
      expect(screen.getByText('Hello world')).toBeInTheDocument();
    });

    it('renders empty content without error', () => {
      /**
       * Test Doc:
       * - Why: Edge case - empty messages shouldn't crash
       * - Contract: Empty string renders empty container
       * - Worked Example: "" → empty prose div
       */
      const { container } = render(<MarkdownInline content="" />);
      expect(container.querySelector('.prose')).toBeInTheDocument();
    });

    it('applies prose styling classes', () => {
      /**
       * Test Doc:
       * - Why: Consistent styling with MarkdownServer
       * - Contract: prose and prose-sm classes applied
       * - Worked Example: content → container with prose classes
       */
      const { container } = render(<MarkdownInline content="Test" />);
      const proseElement = container.querySelector('.prose');
      expect(proseElement).toBeInTheDocument();
      expect(proseElement).toHaveClass('prose-sm');
      expect(proseElement).toHaveClass('dark:prose-invert');
    });

    it('merges custom className with prose classes', () => {
      /**
       * Test Doc:
       * - Why: Allow custom styling from parent components
       * - Contract: className prop merges with default classes
       * - Worked Example: className="text-sm" → class includes both
       */
      const { container } = render(<MarkdownInline content="Test" className="custom-class" />);
      const proseElement = container.querySelector('.prose');
      expect(proseElement).toHaveClass('custom-class');
      expect(proseElement).toHaveClass('prose-sm');
    });
  });

  describe('markdown elements', () => {
    it('renders headers', () => {
      /**
       * Test Doc:
       * - Why: Agent output frequently uses headers for structure
       * - Contract: # Header renders as h1
       * - Worked Example: "# Title" → <h1>Title</h1>
       */
      render(<MarkdownInline content="# Main Title" />);
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Main Title');
    });

    it('renders h2 headers', () => {
      render(<MarkdownInline content="## Section" />);
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Section');
    });

    it('renders bold text', () => {
      /**
       * Test Doc:
       * - Why: Emphasis is common in agent responses
       * - Contract: **bold** renders as <strong>
       * - Worked Example: "**important**" → <strong>important</strong>
       */
      render(<MarkdownInline content="This is **bold** text" />);
      expect(screen.getByText('bold')).toBeInTheDocument();
      expect(screen.getByText('bold').tagName).toBe('STRONG');
    });

    it('renders italic text', () => {
      render(<MarkdownInline content="This is *italic* text" />);
      expect(screen.getByText('italic')).toBeInTheDocument();
      expect(screen.getByText('italic').tagName).toBe('EM');
    });

    it('renders unordered lists', () => {
      /**
       * Test Doc:
       * - Why: Lists are common in agent explanations
       * - Contract: - items render as <ul><li>
       * - Worked Example: "- item" → <ul><li>item</li></ul>
       */
      render(
        <MarkdownInline
          content={`- First item
- Second item`}
        />
      );
      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent('First item');
      expect(items[1]).toHaveTextContent('Second item');
    });

    it('renders ordered lists', () => {
      render(
        <MarkdownInline
          content={`1. First
2. Second
3. Third`}
        />
      );
      const items = screen.getAllByRole('listitem');
      expect(items).toHaveLength(3);
    });

    it('renders links', () => {
      /**
       * Test Doc:
       * - Why: Agents often include documentation links
       * - Contract: [text](url) renders as <a href="url">
       * - Worked Example: "[docs](http://example.com)" → clickable link
       */
      render(<MarkdownInline content="Check the [documentation](https://example.com)" />);
      const link = screen.getByRole('link', { name: 'documentation' });
      expect(link).toHaveAttribute('href', 'https://example.com');
    });

    it('renders inline code', () => {
      /**
       * Test Doc:
       * - Why: Code references are frequent in agent output
       * - Contract: `code` renders as <code>
       * - Worked Example: "`npm install`" → <code>npm install</code>
       */
      render(<MarkdownInline content="Run `npm install` to install" />);
      const code = screen.getByText('npm install');
      expect(code.tagName).toBe('CODE');
    });

    it('renders code blocks', () => {
      /**
       * Test Doc:
       * - Why: Multi-line code snippets in agent responses
       * - Contract: ``` blocks render as <pre><code>
       * - Worked Example: ```js\ncode\n``` → <pre><code>code</code></pre>
       */
      render(
        <MarkdownInline
          content={`\`\`\`javascript
const x = 1;
\`\`\``}
        />
      );
      const pre = document.querySelector('pre');
      expect(pre).toBeInTheDocument();
      const code = pre?.querySelector('code');
      expect(code).toBeInTheDocument();
      expect(code).toHaveTextContent('const x = 1;');
    });

    it('renders blockquotes', () => {
      render(<MarkdownInline content="> This is a quote" />);
      const blockquote = document.querySelector('blockquote');
      expect(blockquote).toBeInTheDocument();
      expect(blockquote).toHaveTextContent('This is a quote');
    });
  });

  describe('GFM extensions (via remark-gfm)', () => {
    it('renders strikethrough', () => {
      /**
       * Test Doc:
       * - Why: GFM strikethrough for corrections
       * - Contract: ~~text~~ renders as <del>
       * - Worked Example: "~~wrong~~" → <del>wrong</del>
       */
      render(<MarkdownInline content="~~deleted~~ text" />);
      const del = document.querySelector('del');
      expect(del).toBeInTheDocument();
      expect(del).toHaveTextContent('deleted');
    });

    it('renders tables', () => {
      /**
       * Test Doc:
       * - Why: GFM tables for structured data
       * - Contract: | col | renders as <table>
       * - Worked Example: GFM table → <table> with headers and rows
       */
      const tableContent = `
| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
`;
      render(<MarkdownInline content={tableContent} />);
      const table = document.querySelector('table');
      expect(table).toBeInTheDocument();
      expect(screen.getByText('Header 1')).toBeInTheDocument();
      expect(screen.getByText('Cell 1')).toBeInTheDocument();
    });

    it('renders task lists', () => {
      /**
       * Test Doc:
       * - Why: GFM task lists for checklists
       * - Contract: - [ ] renders as checkbox
       * - Worked Example: "- [x] Done" → checked checkbox
       */
      render(
        <MarkdownInline
          content={`- [x] Complete
- [ ] Incomplete`}
        />
      );
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes).toHaveLength(2);
      expect(checkboxes[0]).toBeChecked();
      expect(checkboxes[1]).not.toBeChecked();
    });
  });

  describe('complex content', () => {
    it('renders mixed markdown content', () => {
      /**
       * Test Doc:
       * - Why: Real agent output mixes multiple elements
       * - Contract: Complex markdown renders all elements correctly
       * - Worked Example: Headers + lists + code + bold all render
       */
      const complexContent = `
# Summary

Here are the **key points**:

- First point with \`code\`
- Second point

\`\`\`bash
npm test
\`\`\`
`;
      render(<MarkdownInline content={complexContent} />);

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Summary');
      expect(screen.getByText('key points')).toBeInTheDocument();
      expect(screen.getAllByRole('listitem')).toHaveLength(2);
      expect(document.querySelector('pre')).toBeInTheDocument();
    });

    it('handles very long content', () => {
      /**
       * Test Doc:
       * - Why: Agent responses can be lengthy
       * - Contract: Long content renders without overflow issues
       * - Worked Example: Long text → renders with max-w-none
       */
      const longContent = 'A'.repeat(5000);
      const { container } = render(<MarkdownInline content={longContent} />);
      const proseElement = container.querySelector('.prose');
      expect(proseElement).toHaveClass('max-w-none');
    });
  });
});
