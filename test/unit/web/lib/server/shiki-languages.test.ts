/**
 * Shiki Multi-Language Tests
 *
 * Verifies that the shiki-processor correctly highlights 15+ programming languages
 * as required by AC-3.
 */

import { describe, expect, it } from 'vitest';

import { highlightCode } from '../../../../../apps/web/src/lib/server/shiki-processor';

describe('shiki-processor: Multi-Language Support (AC-3)', () => {
  const languageTests = [
    {
      name: 'TypeScript',
      lang: 'typescript',
      code: 'const x: number = 1;',
      expected: ['const', 'number'],
    },
    {
      name: 'JavaScript',
      lang: 'javascript',
      code: 'const y = "hello";',
      expected: ['const', 'hello'],
    },
    {
      name: 'Python',
      lang: 'python',
      code: 'def hello():\n    print("world")',
      expected: ['def', 'print'],
    },
    {
      name: 'C#',
      lang: 'csharp',
      code: 'public class Foo { }',
      expected: ['public', 'class'],
    },
    {
      name: 'Go',
      lang: 'go',
      code: 'func main() { fmt.Println("hi") }',
      expected: ['func', 'main'],
    },
    {
      name: 'Rust',
      lang: 'rust',
      code: 'fn main() { println!("hello"); }',
      expected: ['fn', 'main'],
    },
    {
      name: 'Java',
      lang: 'java',
      code: 'public class Main { }',
      expected: ['public', 'class'],
    },
    {
      name: 'YAML',
      lang: 'yaml',
      code: 'key: value\nlist:\n  - item1',
      expected: ['key', 'value'],
    },
    {
      name: 'JSON',
      lang: 'json',
      code: '{"name": "test"}',
      expected: ['name', 'test'],
    },
    {
      name: 'SQL',
      lang: 'sql',
      code: 'SELECT * FROM users WHERE id = 1;',
      expected: ['SELECT', 'FROM'],
    },
    {
      name: 'Bash',
      lang: 'bash',
      code: '#!/bin/bash\necho "hello"',
      expected: ['echo', 'hello'],
    },
    {
      name: 'HTML',
      lang: 'html',
      code: '<div class="container">Hello</div>',
      expected: ['div', 'class'],
    },
    {
      name: 'CSS',
      lang: 'css',
      code: '.container { color: red; }',
      expected: ['container', 'color'],
    },
    {
      name: 'Kotlin',
      lang: 'kotlin',
      code: 'fun main() { println("hi") }',
      expected: ['fun', 'main'],
    },
    {
      name: 'Ruby',
      lang: 'ruby',
      code: 'def hello\n  puts "world"\nend',
      expected: ['def', 'puts'],
    },
    {
      name: 'PHP',
      lang: 'php',
      code: '<?php echo "hello"; ?>',
      expected: ['echo', 'hello'],
    },
    {
      name: 'Markdown',
      lang: 'markdown',
      code: '# Heading\n\n**Bold** text',
      expected: ['Heading', 'Bold'],
    },
    {
      name: 'TSX',
      lang: 'tsx',
      code: 'const App = () => <div>Hello</div>;',
      expected: ['const', 'App'],
    },
    {
      name: 'JSX',
      lang: 'jsx',
      code: 'const App = () => <div>Hello</div>;',
      expected: ['const', 'div'],
    },
    {
      name: 'Dockerfile',
      lang: 'dockerfile',
      code: 'FROM node:18\nRUN npm install',
      expected: ['FROM', 'RUN'],
    },
  ];

  it.each(languageTests)(
    'should highlight $name code',
    async ({ lang, code, expected }) => {
      /*
      Test Doc:
      - Why: AC-3 requires 15+ languages to be supported
      - Contract: Each language produces syntax-highlighted HTML
      - Usage Notes: Uses shiki-processor.highlightCode()
      - Quality Contribution: Catches language support regressions
      - Worked Example: TypeScript code → highlighted HTML with tokens
      */
      const html = await highlightCode(code, lang);

      // Should produce valid Shiki output
      expect(html).toContain('<pre');
      expect(html).toContain('class="shiki');

      // Should contain expected tokens in the output
      for (const token of expected) {
        expect(html).toContain(token);
      }
    }
  );

  it('should handle all 20 languages in a single test run', async () => {
    /*
    Test Doc:
    - Why: Verify the highlighter can process multiple languages efficiently
    - Contract: All languages complete without error
    - Usage Notes: Tests singleton caching across languages
    - Quality Contribution: Catches highlighter initialization issues
    - Worked Example: 20 sequential calls → all succeed
    */
    const results = await Promise.all(
      languageTests.map(({ lang, code }) => highlightCode(code, lang))
    );

    // All should succeed
    expect(results.length).toBe(languageTests.length);
    results.forEach((html) => {
      expect(html).toContain('<pre');
      expect(html).toContain('class="shiki');
    });
  });
});
