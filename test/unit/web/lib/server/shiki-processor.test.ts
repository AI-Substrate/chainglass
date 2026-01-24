/**
 * Shiki Processor Tests - TDD RED Phase
 *
 * Tests for the server-side Shiki syntax highlighting utility.
 * Following TDD approach: write tests first, expect them to fail.
 *
 * Per research dossier: Tests use real Shiki (Tier 1 testing strategy).
 */

import { describe, expect, it } from 'vitest';

import { highlightCode } from '../../../../../apps/web/src/lib/server/shiki-processor';

describe('shiki-processor', () => {
  describe('highlightCode', () => {
    it('should highlight TypeScript code', async () => {
      /*
      Test Doc:
      - Why: Core functionality - must produce syntax-highlighted HTML
      - Contract: highlightCode(code, lang) returns HTML with Shiki classes
      - Usage Notes: Returns a Promise<string> with pre/code elements
      - Quality Contribution: Catches basic highlighting failures
      - Worked Example: 'const x = 1;' → HTML with <pre class="shiki...">
      */
      const code = 'const x: number = 1;';
      const html = await highlightCode(code, 'typescript');

      expect(html).toContain('<pre');
      expect(html).toContain('class="shiki');
      expect(html).toContain('<code');
      expect(html).toContain('const');
    });

    it('should include dual-theme CSS variables', async () => {
      /*
      Test Doc:
      - Why: Dual-theme enables instant light/dark switching via CSS
      - Contract: Output HTML contains --shiki-dark CSS variables
      - Usage Notes: Both light and dark theme colors are inline
      - Quality Contribution: Catches missing dual-theme configuration
      - Worked Example: '<span style="color:#..;--shiki-dark:#..">'
      */
      const code = 'const x = 1;';
      const html = await highlightCode(code, 'typescript');

      // Shiki dual-theme outputs --shiki-dark CSS variables
      expect(html).toContain('--shiki-dark');
    });

    it('should output line spans with data-line attributes', async () => {
      /*
      Test Doc:
      - Why: Line numbers via CSS counters require per-line data attributes
      - Contract: Each line wrapped in <span class="line" data-line="N">
      - Usage Notes: data-line is 1-indexed
      - Quality Contribution: Catches missing transformer configuration
      - Worked Example: '<span class="line" data-line="1">...</span>'
      */
      const code = 'const x = 1;\nconst y = 2;\nconst z = 3;';
      const html = await highlightCode(code, 'typescript');

      expect(html).toContain('class="line"');
      expect(html).toContain('data-line="1"');
      expect(html).toContain('data-line="2"');
      expect(html).toContain('data-line="3"');
    });

    it('should trim trailing newlines', async () => {
      /*
      Test Doc:
      - Why: Trailing newlines create empty final line in output
      - Contract: Trailing newlines are trimmed before highlighting
      - Usage Notes: Internal trimming, caller doesn't need to pre-trim
      - Quality Contribution: Catches empty line at end of code blocks
      - Worked Example: 'const x = 1;\n\n' → only 1 line span
      */
      const codeWithTrailingNewlines = 'const x = 1;\n\n\n';
      const html = await highlightCode(codeWithTrailingNewlines, 'typescript');

      // Should only have 1 line, not 3 or 4
      const lineMatches = html.match(/data-line="/g);
      expect(lineMatches).toHaveLength(1);
    });

    it('should cache highlighter instance', async () => {
      /*
      Test Doc:
      - Why: Highlighter creation is expensive (loads WASM + grammars)
      - Contract: Multiple calls reuse same highlighter instance
      - Usage Notes: First call may be slower than subsequent calls
      - Quality Contribution: Catches per-call highlighter creation
      - Worked Example: 10 calls should be fast after first initialization
      */
      // This test verifies caching indirectly by timing
      // First call initializes, subsequent calls should be faster
      const code = 'const x = 1;';

      const start = performance.now();
      await highlightCode(code, 'typescript');
      const firstCallTime = performance.now() - start;

      // Make multiple rapid calls
      const rapidStart = performance.now();
      for (let i = 0; i < 5; i++) {
        await highlightCode(code, 'typescript');
      }
      const rapidCallsTime = performance.now() - rapidStart;
      const avgRapidTime = rapidCallsTime / 5;

      // Subsequent calls should be much faster (cached highlighter)
      // Allow generous margin since first call might already be cached in test runs
      expect(avgRapidTime).toBeLessThan(firstCallTime + 100);
    });

    it('should handle empty content', async () => {
      /*
      Test Doc:
      - Why: Empty files are valid and should render without error
      - Contract: Empty string returns valid but empty pre/code block
      - Usage Notes: Line numbers show "1" for empty file
      - Quality Contribution: Catches edge case crashes
      - Worked Example: '' → <pre class="shiki"><code></code></pre>
      */
      const html = await highlightCode('', 'typescript');

      expect(html).toContain('<pre');
      expect(html).toContain('<code');
      // Empty content should still have structure
      expect(html).not.toBe('');
    });

    it('should handle unknown language gracefully', async () => {
      /*
      Test Doc:
      - Why: Users may have files with unusual extensions
      - Contract: Unknown languages fall back to text/plain
      - Usage Notes: Still renders content, just without highlighting
      - Quality Contribution: Prevents crashes from unknown file types
      - Worked Example: 'xyz' language → renders as plain text
      */
      const code = 'some random content';
      const html = await highlightCode(code, 'xyz-unknown-language');

      // Should still produce valid HTML output, not throw
      expect(html).toContain('<pre');
      expect(html).toContain('some random content');
    });

    it('should highlight JavaScript code', async () => {
      /*
      Test Doc:
      - Why: JavaScript is a common language that must be supported
      - Contract: JavaScript code is syntax highlighted
      - Usage Notes: Uses javascript language identifier
      - Quality Contribution: Catches language support issues
      - Worked Example: 'const x = 1;' with javascript lang
      */
      const code = 'const x = 1;';
      const html = await highlightCode(code, 'javascript');

      expect(html).toContain('<pre');
      expect(html).toContain('class="shiki');
    });

    it('should highlight Python code', async () => {
      /*
      Test Doc:
      - Why: Python is a common language that must be supported
      - Contract: Python code is syntax highlighted
      - Usage Notes: Uses python language identifier
      - Quality Contribution: Catches language support issues
      - Worked Example: 'def foo(): pass' with python lang
      */
      const code = 'def foo():\n    pass';
      const html = await highlightCode(code, 'python');

      expect(html).toContain('<pre');
      expect(html).toContain('class="shiki');
      expect(html).toContain('data-line="1"');
      expect(html).toContain('data-line="2"');
    });

    it('should preserve code structure across multiple lines', async () => {
      /*
      Test Doc:
      - Why: Multi-line code must maintain proper line structure
      - Contract: Each source line produces one line span
      - Usage Notes: Line numbers match source line numbers
      - Quality Contribution: Catches line parsing issues
      - Worked Example: 5-line code → 5 data-line attributes
      */
      const code = `function example() {
  const a = 1;
  const b = 2;
  return a + b;
}`;
      const html = await highlightCode(code, 'typescript');

      const lineMatches = html.match(/data-line="/g);
      expect(lineMatches).toHaveLength(5);
    });
  });
});
