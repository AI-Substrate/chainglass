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
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { parse as parseYaml } from 'yaml';

import { remarkMermaid } from '../remark-mermaid';

/** Match a YAML frontmatter block at the very start of a document. */
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

/** Escape a string for safe interpolation into HTML text content. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Render a single frontmatter value as an HTML fragment. */
function renderFrontmatterValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '<span class="opacity-60">—</span>';
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return escapeHtml(String(value));
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '<span class="opacity-60">[]</span>';
    const items = value.map((v) => `<li>${renderFrontmatterValue(v)}</li>`).join('');
    return `<ul class="list-disc pl-5 my-0">${items}</ul>`;
  }
  if (typeof value === 'object') {
    return `<pre class="text-xs whitespace-pre-wrap my-0">${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
  }
  return escapeHtml(String(value));
}

/**
 * Render a parsed frontmatter object as a key/value HTML table inside a
 * styled \`<aside>\`. Wrapped in a \`<details>\` so it stays out of the way
 * for long frontmatter blocks but defaults to open.
 *
 * The output is plain HTML with Tailwind utility classes that match the
 * surrounding markdown preview styles. No client-side script.
 */
function renderFrontmatterBlock(meta: Record<string, unknown>): string {
  const rows = Object.entries(meta)
    .map(
      ([k, v]) =>
        `<tr class="border-b border-border/40 last:border-0">` +
        `<th class="text-left align-top py-1 pr-4 font-medium text-muted-foreground whitespace-nowrap">${escapeHtml(k)}</th>` +
        `<td class="align-top py-1">${renderFrontmatterValue(v)}</td>` +
        `</tr>`
    )
    .join('');
  return (
    `<aside class="not-prose mb-4 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm" data-frontmatter="true">` +
    `<details open>` +
    `<summary class="cursor-pointer select-none text-xs uppercase tracking-wide text-muted-foreground">Front matter</summary>` +
    `<table class="w-full mt-2 text-sm"><tbody>${rows}</tbody></table>` +
    `</details>` +
    `</aside>`
  );
}

/**
 * Strip a YAML frontmatter block from the start of \`source\` (if present),
 * parse it, and return both the rendered HTML preface and the markdown
 * body. Returns \`{ prefaceHtml: '', body: source }\` when there's no
 * frontmatter or the YAML is malformed (the raw \`---\` block then falls
 * through to \`remarkFrontmatter\` which renders it as nothing).
 */
function extractFrontmatterPreface(source: string): { prefaceHtml: string; body: string } {
  const m = FRONTMATTER_RE.exec(source);
  if (!m) return { prefaceHtml: '', body: source };
  const yamlText = m[1] ?? '';
  let parsed: unknown;
  try {
    parsed = parseYaml(yamlText);
  } catch {
    return { prefaceHtml: '', body: source };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { prefaceHtml: '', body: source };
  }
  const prefaceHtml = renderFrontmatterBlock(parsed as Record<string, unknown>);
  return { prefaceHtml, body: source.slice(m[0].length) };
}

/**
 * Renders markdown content to an HTML string with syntax highlighting
 * and mermaid diagram markers.
 *
 * Mermaid code blocks are output as:
 *   `<div data-mermaid="true" data-mermaid-code="..."></div>`
 * The client-side MermaidRenderer picks these up for rendering.
 */
export async function renderMarkdownToHtml(content: string): Promise<string> {
  // Pull the YAML frontmatter (if any) off the top before remark touches
  // the body. We render it ourselves as a small key/value table that
  // appears at the top of the preview — much friendlier than burying the
  // metadata as raw \`---\` text or stripping it silently. The remaining
  // body is what feeds into the markdown pipeline.
  //
  // Source mode and the rich editor are unaffected: they read the raw
  // file content (which still contains the original \`---\` block), so
  // saving from rich-edit doesn't drop the frontmatter.
  const { prefaceHtml, body } = extractFrontmatterPreface(content);

  const result = await unified()
    .use(remarkParse)
    .use(remarkFrontmatter, ['yaml'])
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
    .process(body);

  return prefaceHtml + String(result);
}
