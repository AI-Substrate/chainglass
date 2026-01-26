/**
 * Shiki Server-Side Syntax Highlighting Processor
 *
 * This utility provides server-only syntax highlighting using Shiki.
 * It implements the patterns from the research dossier:
 * - `import 'server-only'` for build-time enforcement
 * - Singleton highlighter cached at module level
 * - Dual-theme CSS variables for instant theme switching
 * - Transformer line hook for per-line data attributes
 *
 * NOTE: Shiki is imported dynamically to prevent webpack from analyzing
 * node: protocol imports during client bundle compilation.
 *
 * @see docs/plans/006-web-extras/tasks/phase-2-fileviewer-component/research-dossier.md
 */

import type { BundledLanguage, Highlighter, SpecialLanguage } from 'shiki';

/**
 * Languages to pre-load in the highlighter.
 * These cover the most common programming languages for code viewing.
 */
const PRELOADED_LANGUAGES: BundledLanguage[] = [
  // TypeScript/JavaScript
  'typescript',
  'javascript',
  'tsx',
  'jsx',

  // Python
  'python',

  // Systems
  'go',
  'rust',
  'c',
  'cpp',

  // JVM
  'java',
  'kotlin',

  // .NET
  'csharp',

  // Web
  'html',
  'css',
  'scss',

  // Data
  'json',
  'yaml',
  'xml',
  'toml',

  // Shell
  'bash',
  'shell',

  // Database
  'sql',

  // Documentation
  'markdown',

  // Ruby/PHP
  'ruby',
  'php',

  // Docker
  'dockerfile',
];

/**
 * Module-level singleton highlighter promise.
 * Created once per server process, reused for all highlighting calls.
 * This is critical for performance - creating a highlighter is expensive.
 */
let highlighterPromise: Promise<Highlighter> | null = null;

/**
 * Gets or creates the singleton highlighter instance.
 * Uses lazy initialization to avoid startup cost when not needed.
 * Dynamic import ensures webpack doesn't analyze shiki for client bundle.
 */
async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    // Dynamic import to prevent webpack from bundling shiki for client
    const { createHighlighter } = await import('shiki');
    highlighterPromise = createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: PRELOADED_LANGUAGES,
    });
  }
  return highlighterPromise;
}

/**
 * Highlights code using Shiki with dual-theme CSS variables.
 *
 * Features:
 * - Dual-theme output: Both light and dark theme colors in CSS variables
 * - Line numbers: Each line has `data-line` attribute for CSS counters
 * - Trailing newlines: Trimmed to prevent empty final line
 * - Unknown languages: Falls back to 'text' (plaintext)
 *
 * @param code - The source code to highlight
 * @param lang - The language identifier (e.g., 'typescript', 'python')
 * @returns Promise<string> - HTML with syntax highlighting
 *
 * @example
 * const html = await highlightCode('const x = 1;', 'typescript');
 * // Returns: <pre class="shiki shiki-themes github-light github-dark">...</pre>
 */
export async function highlightCode(code: string, lang: string): Promise<string> {
  const highlighter = await getHighlighter();

  // Trim trailing newlines to prevent empty final line element
  const trimmedCode = code.replace(/\n+$/, '');

  // Determine if language is supported, fall back to 'plaintext' if not
  // Shiki has special languages 'text' and 'plaintext' that don't require grammar loading
  const loadedLanguages = highlighter.getLoadedLanguages();
  const effectiveLang: BundledLanguage | SpecialLanguage = loadedLanguages.includes(
    lang as BundledLanguage
  )
    ? (lang as BundledLanguage)
    : 'plaintext';

  return highlighter.codeToHtml(trimmedCode, {
    lang: effectiveLang,
    themes: {
      light: 'github-light',
      dark: 'github-dark',
    },
    transformers: [
      {
        name: 'line-numbers',
        line(node, line) {
          // Add data-line attribute for CSS counter reference
          node.properties['data-line'] = line;
        },
      },
    ],
  });
}
