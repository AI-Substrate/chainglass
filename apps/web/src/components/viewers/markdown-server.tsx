/**
 * MarkdownServer - Server Component for rendering markdown preview
 *
 * Uses react-markdown with:
 * - remark-gfm for GitHub Flavored Markdown (tables, task lists, strikethrough)
 * - remark-mermaid to extract mermaid blocks before Shiki processes them
 * - @shikijs/rehype for syntax-highlighted code blocks
 * - MermaidRenderer for mermaid diagram rendering
 *
 * Configuration follows DYK decisions:
 * - Phase 3 DYK #1: Use @shikijs/rehype for syntax highlighting
 * - Phase 3 DYK #2: cssVariablePrefix: '--shiki' matches Phase 2 FileViewer CSS
 * - Phase 4: remark-mermaid extracts mermaid blocks before Shiki
 *
 * @see MarkdownViewer for the client component wrapper
 * @see MermaidRenderer for mermaid diagram rendering
 */

import rehypeShiki from '@shikijs/rehype';
import { MarkdownAsync } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { remarkMermaid } from '../../lib/remark-mermaid';
import { MermaidRenderer } from './mermaid-renderer';

interface MarkdownServerProps {
  /** The raw markdown content to render */
  content: string;
}

/**
 * Async Server Component that renders markdown with syntax highlighting.
 *
 * Uses MarkdownAsync from react-markdown for Server Component support.
 * Code blocks are syntax-highlighted via @shikijs/rehype during AST transformation.
 *
 * @example
 * // In a page.tsx
 * const preview = await MarkdownServer({ content: file.content });
 * return <MarkdownViewer file={file} highlightedHtml={html} preview={preview} />;
 */
export async function MarkdownServer({ content }: MarkdownServerProps) {
  return (
    <article className="prose dark:prose-invert max-w-none">
      <MarkdownAsync
        remarkPlugins={[remarkGfm, remarkMermaid]}
        rehypePlugins={[
          [
            rehypeShiki,
            {
              themes: { light: 'github-light', dark: 'github-dark' },
              defaultColor: 'light', // Render light theme colors inline
              cssVariablePrefix: '--shiki', // Output --shiki-dark CSS vars for dark theme
            },
          ],
        ]}
        components={{
          // Handle div elements - check for mermaid marker from remarkMermaid plugin
          div: (props) => {
            // Cast to access data attributes added by remarkMermaid
            const dataProps = props as Record<string, unknown>;
            const mermaidCode = dataProps['data-mermaid-code'];

            // Check if this is a mermaid diagram
            if (dataProps['data-mermaid'] && typeof mermaidCode === 'string') {
              return <MermaidRenderer code={mermaidCode} />;
            }

            // Regular div - pass through all props
            return <div {...props} />;
          },
        }}
      >
        {content}
      </MarkdownAsync>
    </article>
  );
}
