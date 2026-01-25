/**
 * CodeBlock - Custom code component for react-markdown
 *
 * Routes code fences to appropriate renderers:
 * - language="mermaid" → MermaidRenderer (client-side SVG)
 * - other languages → default <code> element (Shiki-processed)
 *
 * DYK #1 Decision: Use custom component pattern instead of rehype-mermaid.
 * The className survives @shikijs/rehype processing, allowing detection.
 *
 * @see MermaidRenderer for Mermaid diagram rendering
 * @see MarkdownServer for integration with react-markdown
 */
'use client';

import { type ComponentProps, useMemo } from 'react';
import { MermaidRenderer } from './mermaid-renderer';

export type CodeBlockProps = ComponentProps<'code'>;

/**
 * CodeBlock component for routing code fences to appropriate renderers.
 *
 * @example
 * // In MarkdownServer with react-markdown:
 * <MarkdownAsync
 *   components={{ code: CodeBlock }}
 * >
 *   {content}
 * </MarkdownAsync>
 */
export function CodeBlock({ className, children, ...props }: CodeBlockProps) {
  // Extract language from className (e.g., "language-mermaid" → "mermaid")
  const language = useMemo(() => {
    const match = className?.match(/language-(\w+)/);
    return match ? match[1] : null;
  }, [className]);

  // Extract code content as string
  const code = useMemo(() => {
    if (typeof children === 'string') {
      return children.trim();
    }
    // Handle array of children (React nodes)
    if (Array.isArray(children)) {
      return children
        .map((child) => (typeof child === 'string' ? child : ''))
        .join('')
        .trim();
    }
    return '';
  }, [children]);

  // Route mermaid code to MermaidRenderer
  if (language === 'mermaid') {
    return <MermaidRenderer code={code} />;
  }

  // Default: render as code element (already Shiki-processed by @shikijs/rehype)
  return (
    <code className={className} {...props}>
      {children}
    </code>
  );
}
