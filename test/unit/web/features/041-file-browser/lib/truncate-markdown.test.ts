/**
 * Plan recent-changes-feed T014 — TDD `truncateMarkdown` per Finding 06.
 *
 * Six binding cases from the plan:
 *  1. front-matter-only doc → empty output (no prose to show)
 *  2. front-matter + prose → excerpt starts AFTER the closing `---`
 *  3. boundary lands inside a fenced code block → extend to closing fence
 *  4. boundary lands inside a list item → preserve item integrity
 *  5. single line longer than maxChars → truncate at maxChars + ellipsis
 *  6. empty input → empty output, never throws
 */

import { describe, expect, it } from 'vitest';
import { truncateMarkdown } from '../../../../../../apps/web/src/features/041-file-browser/lib/truncate-markdown';

describe('truncateMarkdown — Finding 06 binding cases', () => {
  it('Case 1 — front-matter-only doc returns empty string', () => {
    const input = '---\ntitle: hello\nauthor: jordan\n---\n';
    expect(truncateMarkdown(input)).toBe('');
  });

  it('Case 2 — front matter + prose: excerpt starts AFTER closing ---', () => {
    const input = '---\ntitle: hello\n---\n\nThis is the first paragraph.\n\nSecond paragraph.\n';
    const out = truncateMarkdown(input);
    expect(out).toContain('This is the first paragraph.');
    expect(out).not.toContain('title:');
    expect(out).not.toContain('---');
  });

  it('Case 3 — boundary inside a code fence extends to closing fence (no split)', () => {
    // maxLines=3 forces the boundary to land at line "const y = 2;"
    // — inside the ``` fence. The output should include the closing ```.
    const input =
      'Intro text.\n\n```ts\nconst x = 1;\nconst y = 2;\nconst z = 3;\n```\n\nTrailing prose.\n';
    const out = truncateMarkdown(input, { maxLines: 3, maxChars: 9999 });
    expect(out).toContain('```ts');
    // Must include the closing fence — count of ``` should be even.
    const fenceCount = (out.match(/```/g) ?? []).length;
    expect(fenceCount % 2).toBe(0);
    expect(fenceCount).toBeGreaterThanOrEqual(2);
    // Must NOT include the trailing prose (we only extended through the fence).
    expect(out).not.toContain('Trailing prose');
  });

  it('Case 4 — boundary on a list marker extends to the item end (F002 lock)', () => {
    // F002 fix: previous test used maxLines=2, which stopped on the first
    // item's continuation that was already pushed. A broken impl would
    // still pass. With maxLines=3 the boundary lands ON `- Second item line`
    // (the marker itself); the list-extension MUST then include
    // `  also wraps here.` AND MUST NOT include the sibling `- Third item.`.
    const input =
      '- First item with a continuation\n  that wraps to two lines.\n- Second item line\n  also wraps here.\n- Third item.\n';
    const out = truncateMarkdown(input, { maxLines: 3, maxChars: 9999 });
    expect(out).toContain('Second item line');
    // List-extension carries the continuation in.
    expect(out).toContain('also wraps here.');
    // …but stops at the next sibling marker (preserves item integrity).
    expect(out).not.toContain('Third item.');
  });

  it('Case 4 (continuation boundary) — does not chop the continuation, stops at sibling marker', () => {
    // Boundary on the continuation `  that wraps to two lines.` (maxLines=2).
    // List-extension must NOT advance past the next top-level marker
    // `- Second item line`.
    const input =
      '- First item with a continuation\n  that wraps to two lines.\n- Second item line\n  also wraps here.\n- Third item.\n';
    const out = truncateMarkdown(input, { maxLines: 2, maxChars: 9999 });
    expect(out).toContain('that wraps to two lines.');
    expect(out).not.toContain('Second item line');
    expect(out).not.toContain('also wraps here.');
  });

  it('Case 5 — single overlong line truncates at maxChars with ellipsis', () => {
    const input = 'a'.repeat(2000);
    const out = truncateMarkdown(input, { maxLines: 8, maxChars: 50 });
    expect(out.endsWith('…')).toBe(true);
    // Body before the ellipsis should be ≤ maxChars
    expect(out.slice(0, -1).length).toBeLessThanOrEqual(50);
  });

  it('Case 6 — empty input returns empty string and does not throw', () => {
    expect(truncateMarkdown('')).toBe('');
    // Whitespace-only also returns empty.
    expect(truncateMarkdown('   \n\n   ')).toBe('');
  });
});

describe('truncateMarkdown — additional invariants', () => {
  it('respects maxLines as a non-empty-line counter', () => {
    const input = 'line1\n\nline2\n\nline3\n\nline4\n';
    const out = truncateMarkdown(input, { maxLines: 2, maxChars: 9999 });
    expect(out).toContain('line1');
    expect(out).toContain('line2');
    expect(out).not.toContain('line4');
  });

  it('returns the full body when within both limits (no truncation)', () => {
    const input = 'short doc\nwith two lines\n';
    const out = truncateMarkdown(input, { maxLines: 8, maxChars: 600 });
    expect(out).toContain('short doc');
    expect(out).toContain('with two lines');
    // No ellipsis appended when the body fits.
    expect(out).not.toContain('…');
  });

  it('handles CRLF line endings the same as LF', () => {
    const lf = 'line a\nline b\nline c\n';
    const crlf = 'line a\r\nline b\r\nline c\r\n';
    expect(truncateMarkdown(lf)).toBe(truncateMarkdown(crlf));
  });

  it('does not panic on a single ``` (unterminated fence) — returns what it has', () => {
    const input = 'prose\n```ts\nconst x = 1;\n';
    // Unterminated fence at EOF — we should not loop forever or throw.
    expect(() => truncateMarkdown(input, { maxLines: 2, maxChars: 9999 })).not.toThrow();
  });
});
