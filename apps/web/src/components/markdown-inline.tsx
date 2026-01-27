/**
 * MarkdownInline - Lightweight client-side markdown renderer for chat messages
 *
 * Uses react-markdown with remark-gfm for GitHub Flavored Markdown support.
 * Designed for agent text output in chat interfaces where full Shiki syntax
 * highlighting is unnecessary overhead.
 *
 * Features:
 * - GFM support: tables, task lists, strikethrough
 * - Prose styling consistent with MarkdownServer
 * - Code blocks render with basic styling (no syntax highlighting)
 * - Sanitized output (react-markdown handles XSS prevention)
 *
 * @see MarkdownServer for full-featured server-side markdown with Shiki
 */
'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import { cn } from '../lib/utils';

export interface MarkdownInlineProps {
  /** The raw markdown content to render */
  content: string;
  /** Additional CSS classes to apply to the container */
  className?: string;
}

/**
 * Client component for rendering markdown in chat messages.
 *
 * @example
 * <MarkdownInline content="# Hello\n\nThis is **bold** text." />
 *
 * @example
 * // With custom styling
 * <MarkdownInline
 *   content={agentResponse}
 *   className="text-sm"
 * />
 */
export function MarkdownInline({ content, className }: MarkdownInlineProps) {
  return (
    <div
      className={cn(
        // Base prose styling - smaller for chat context
        'prose prose-sm dark:prose-invert max-w-none',
        // Tighter spacing for chat messages
        'prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1',
        // Code block styling without Shiki
        'prose-pre:bg-muted prose-pre:border prose-pre:border-border',
        'prose-code:before:content-none prose-code:after:content-none',
        'prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-[0.85em]',
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}

export default MarkdownInline;
