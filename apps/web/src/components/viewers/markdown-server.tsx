/**
 * MarkdownServer - Server Component for rendering markdown preview
 *
 * Uses react-markdown with:
 * - remark-gfm for GitHub Flavored Markdown (tables, task lists, strikethrough)
 * - @shikijs/rehype for syntax-highlighted code blocks
 *
 * Configuration follows DYK decisions:
 * - DYK #1: Use @shikijs/rehype instead of custom CodeBlock component
 * - DYK #2: cssVariablePrefix: '--shiki' matches Phase 2 FileViewer CSS
 *
 * @see MarkdownViewer for the client component wrapper
 */

import rehypeShiki from '@shikijs/rehype';
import { MarkdownAsync } from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
        remarkPlugins={[remarkGfm]}
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
      >
        {content}
      </MarkdownAsync>
    </article>
  );
}
