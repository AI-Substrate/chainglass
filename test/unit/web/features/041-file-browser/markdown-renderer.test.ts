/**
 * Markdown Renderer Tests
 *
 * Verifies server-side markdown-to-HTML rendering with GFM,
 * syntax highlighting, and mermaid block preservation.
 *
 * Fix FX001-6: renderMarkdownToHtml
 */

import { renderMarkdownToHtml } from '@/lib/server/markdown-renderer';
import { describe, expect, it } from 'vitest';

describe('renderMarkdownToHtml', () => {
  it('renders basic markdown to HTML', async () => {
    const html = await renderMarkdownToHtml('# Hello\n\nWorld');
    expect(html).toContain('<h1>Hello</h1>');
    expect(html).toContain('<p>World</p>');
  });

  it('renders GFM tables', async () => {
    const md = '| A | B |\n|---|---|\n| 1 | 2 |';
    const html = await renderMarkdownToHtml(md);
    expect(html).toContain('<table>');
    expect(html).toContain('<td>1</td>');
  });

  it('renders GFM task lists', async () => {
    const md = '- [x] Done\n- [ ] Todo';
    const html = await renderMarkdownToHtml(md);
    expect(html).toContain('checked');
  });

  it('syntax-highlights code blocks', async () => {
    const md = '```typescript\nconst x = 1;\n```';
    const html = await renderMarkdownToHtml(md);
    // Shiki wraps in <pre> with class containing 'shiki'
    expect(html).toContain('shiki');
    expect(html).toContain('const');
  });

  it('preserves mermaid blocks as data-mermaid divs', async () => {
    const md = '```mermaid\ngraph TD\n  A-->B\n```';
    const html = await renderMarkdownToHtml(md);
    expect(html).toContain('data-mermaid');
    expect(html).toContain('data-mermaid-code');
  });
});
