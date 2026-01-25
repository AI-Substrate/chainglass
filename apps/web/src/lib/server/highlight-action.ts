'use server';

/**
 * Server Action for syntax highlighting.
 *
 * This is guaranteed to run only on the server, avoiding webpack bundling issues.
 */

import type { BundledLanguage, Highlighter, SpecialLanguage } from 'shiki';

const PRELOADED_LANGUAGES: BundledLanguage[] = [
  'typescript',
  'javascript',
  'tsx',
  'jsx',
  'python',
  'go',
  'rust',
  'c',
  'cpp',
  'java',
  'kotlin',
  'csharp',
  'html',
  'css',
  'scss',
  'json',
  'yaml',
  'xml',
  'toml',
  'bash',
  'shell',
  'sql',
  'markdown',
  'ruby',
  'php',
  'dockerfile',
];

let highlighterPromise: Promise<Highlighter> | null = null;

async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    const { createHighlighter } = await import('shiki');
    highlighterPromise = createHighlighter({
      themes: ['github-light', 'github-dark'],
      langs: PRELOADED_LANGUAGES,
    });
  }
  return highlighterPromise;
}

export async function highlightCodeAction(code: string, lang: string): Promise<string> {
  const highlighter = await getHighlighter();
  const trimmedCode = code.replace(/\n+$/, '');
  const loadedLanguages = highlighter.getLoadedLanguages();
  const effectiveLang: BundledLanguage | SpecialLanguage = loadedLanguages.includes(
    lang as BundledLanguage
  )
    ? (lang as BundledLanguage)
    : 'plaintext';

  return highlighter.codeToHtml(trimmedCode, {
    lang: effectiveLang,
    themes: { light: 'github-light', dark: 'github-dark' },
    transformers: [
      {
        name: 'line-numbers',
        line(node, line) {
          node.properties['data-line'] = line;
        },
      },
    ],
  });
}
