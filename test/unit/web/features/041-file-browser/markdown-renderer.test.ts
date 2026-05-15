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
  // Shiki cold-start can be slow in CI — increase timeout for first render
  it('renders basic markdown to HTML', { timeout: 30_000 }, async () => {
    const html = await renderMarkdownToHtml('# Hello\n\nWorld');
    expect(html).toContain('<h1 id="hello">Hello</h1>');
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

  it('renders YAML frontmatter as a key/value HTML block above the body', async () => {
    const md = [
      '---',
      'description: Long-running code-review companion',
      'tags: [code-review, companion]',
      '---',
      '',
      '# Hello',
      '',
      'Body text.',
    ].join('\n');
    const html = await renderMarkdownToHtml(md);
    expect(html).toContain('data-frontmatter="true"');
    expect(html).toContain('Front matter');
    expect(html).toContain('Long-running code-review companion');
    expect(html).toContain('<li>code-review</li>');
    expect(html).toContain('<li>companion</li>');
    // Frontmatter block precedes the body heading.
    const fmIdx = html.indexOf('data-frontmatter');
    const headingIdx = html.indexOf('<h1 id="hello">Hello</h1>');
    expect(fmIdx).toBeGreaterThan(-1);
    expect(headingIdx).toBeGreaterThan(fmIdx);
  });

  it('passes through markdown unchanged when there is no frontmatter', async () => {
    const html = await renderMarkdownToHtml('# Plain doc\n\nNo metadata.');
    expect(html).not.toContain('data-frontmatter');
    expect(html).toContain('<h1 id="plain-doc">Plain doc</h1>');
  });

  it('escapes HTML in frontmatter values to prevent injection', async () => {
    const md = ['---', 'title: "<script>alert(1)</script>"', '---', '', 'body'].join('\n');
    const html = await renderMarkdownToHtml(md);
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('falls through gracefully when frontmatter YAML is malformed', async () => {
    const md = ['---', 'this is: : not valid: yaml', '---', '', '# Body'].join('\n');
    // Should not throw; preface block omitted; body still renders.
    const html = await renderMarkdownToHtml(md);
    expect(html).toContain('<h1 id="body">Body</h1>');
    expect(html).not.toContain('data-frontmatter');
  });
});
