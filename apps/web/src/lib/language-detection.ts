/**
 * Language Detection Utility (Browser-safe copy)
 *
 * Local copy of @chainglass/shared/lib/language-detection.ts to avoid
 * barrel import pulling in Node.js-dependent code (FakeFileSystem, etc.)
 *
 * TODO: Add browser-safe exports to @chainglass/shared package
 */

const SPECIAL_FILENAMES: Record<string, string> = {
  dockerfile: 'dockerfile',
  justfile: 'just',
  makefile: 'makefile',
  license: 'text',
  '.gitignore': 'gitignore',
  '.npmrc': 'properties',
  '.env': 'dotenv',
  '.editorconfig': 'ini',
};

const EXTENSION_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  pyw: 'python',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  rb: 'ruby',
  php: 'php',
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',
  swift: 'swift',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  toml: 'toml',
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  sass: 'sass',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'fish',
  md: 'markdown',
  markdown: 'markdown',
  sql: 'sql',
  graphql: 'graphql',
  gql: 'graphql',
  vue: 'vue',
  svelte: 'svelte',
  ini: 'ini',
  conf: 'properties',
  env: 'dotenv',
};

/**
 * Detects the Shiki language identifier for a given filename.
 */
export function detectLanguage(filename: string): string {
  if (!filename) return 'text';

  const lowerFilename = filename.toLowerCase();
  if (SPECIAL_FILENAMES[lowerFilename]) {
    return SPECIAL_FILENAMES[lowerFilename];
  }

  if (filename.startsWith('.')) {
    if (lowerFilename === '.env' || lowerFilename.startsWith('.env.')) {
      return 'dotenv';
    }
    const withoutDot = filename.slice(1);
    if (!withoutDot.includes('.')) {
      const ext = withoutDot.toLowerCase();
      if (EXTENSION_MAP[ext]) return EXTENSION_MAP[ext];
      if (SPECIAL_FILENAMES[filename]) return SPECIAL_FILENAMES[filename];
    }
  }

  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex === -1) {
    if (SPECIAL_FILENAMES[lowerFilename]) return SPECIAL_FILENAMES[lowerFilename];
    return 'text';
  }

  const extension = filename.slice(lastDotIndex + 1).toLowerCase();
  return EXTENSION_MAP[extension] ?? 'text';
}

/**
 * File data for viewer display.
 * Local type to avoid barrel import from @chainglass/shared pulling Node.js code.
 */
export interface ViewerFile {
  path: string;
  filename: string;
  content: string;
}
