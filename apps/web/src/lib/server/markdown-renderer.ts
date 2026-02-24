/**
 * Server-side Markdown-to-HTML renderer.
 *
 * Extracts the rendering pipeline from MarkdownServer into a reusable
 * function that returns an HTML string. Used by the file browser's
 * readFile server action to provide markdown preview data.
 *
 * Features (same as MarkdownServer):
 * - GFM: tables, task lists, strikethrough
 * - Syntax-highlighted code blocks via @shikijs/rehype
 * - Mermaid blocks preserved as data-mermaid divs for client rendering
 *
 * Workshop D2: Reuse existing rendering pipeline, don't reinvent.
 * Fix FX001-6: Server-side markdown for file browser preview.
 */

import rehypeShiki from '@shikijs/rehype';
import rehypeSlug from 'rehype-slug';
import rehypeStringify from 'rehype-stringify';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';

import { remarkMermaid } from '../remark-mermaid';

/**
 * Renders markdown content to an HTML string with syntax highlighting
 * and mermaid diagram markers.
 *
 * Mermaid code blocks are output as:
 *   `<div data-mermaid="true" data-mermaid-code="..."></div>`
 * The client-side MermaidRenderer picks these up for rendering.
 */
export async function renderMarkdownToHtml(content: string): Promise<string> {
  const result = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMermaid)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeSlug)
    .use(rehypeShiki, {
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: 'light',
      cssVariablePrefix: '--shiki',
    })
    .use(rehypeStringify, { allowDangerousHtml: true })
    .process(content);

  return String(result);
}
