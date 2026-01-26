/**
 * Language Detection Utility
 *
 * Maps filenames to Shiki language identifiers using a two-tier approach:
 * 1. Special filename matching (Dockerfile, justfile, Makefile, dotfiles)
 * 2. Extension-based lookup with case normalization
 *
 * Per Shared by Default principle (DYK #2) and Two-tier pattern (DYK #5).
 */

/**
 * Special filenames that need exact matching (tier 1).
 * These are files without extensions or with special naming conventions.
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

/**
 * Extension to Shiki language mapping (tier 2).
 * All extensions stored in lowercase for case-insensitive matching.
 */
const EXTENSION_MAP: Record<string, string> = {
  // TypeScript/JavaScript
  ts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  jsx: 'jsx',
  mjs: 'javascript',
  cjs: 'javascript',

  // Python
  py: 'python',
  pyw: 'python',

  // C#
  cs: 'csharp',

  // Go
  go: 'go',

  // Rust
  rs: 'rust',

  // Ruby
  rb: 'ruby',

  // PHP
  php: 'php',

  // Java/Kotlin
  java: 'java',
  kt: 'kotlin',
  kts: 'kotlin',

  // Swift
  swift: 'swift',

  // C/C++
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',

  // Data formats
  json: 'json',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  toml: 'toml',

  // Web
  html: 'html',
  htm: 'html',
  css: 'css',
  scss: 'scss',
  less: 'less',
  sass: 'sass',

  // Shell
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  fish: 'fish',

  // Documentation
  md: 'markdown',
  markdown: 'markdown',

  // SQL
  sql: 'sql',

  // GraphQL
  graphql: 'graphql',
  gql: 'graphql',

  // Frameworks
  vue: 'vue',
  svelte: 'svelte',

  // Config
  ini: 'ini',
  conf: 'properties',
  env: 'dotenv',
};

/**
 * Detects the Shiki language identifier for a given filename.
 *
 * Uses two-tier detection:
 * 1. First checks for special filenames (Dockerfile, justfile, etc.)
 * 2. Then falls back to extension-based lookup
 *
 * @param filename - The filename (not path) to detect language for
 * @returns Shiki language identifier or 'text' for unknown types
 *
 * @example
 * detectLanguage('Button.tsx') // → 'tsx'
 * detectLanguage('Dockerfile') // → 'dockerfile'
 * detectLanguage('.gitignore') // → 'gitignore'
 * detectLanguage('unknown.xyz') // → 'text'
 */
export function detectLanguage(filename: string): string {
  // Handle empty filename
  if (!filename) {
    return 'text';
  }

  // Tier 1: Check special filenames (case-insensitive)
  const lowerFilename = filename.toLowerCase();
  if (SPECIAL_FILENAMES[lowerFilename]) {
    return SPECIAL_FILENAMES[lowerFilename];
  }

  // Tier 1b: Check dotfiles that start with . and may have additional parts (e.g., .env.local)
  if (filename.startsWith('.')) {
    // Check for .env variants
    if (lowerFilename === '.env' || lowerFilename.startsWith('.env.')) {
      return 'dotenv';
    }

    // Check if it's just a dot followed by an extension (e.g., '.ts')
    const withoutDot = filename.slice(1);
    if (!withoutDot.includes('.')) {
      // It's a dotfile or just an extension
      const ext = withoutDot.toLowerCase();
      if (EXTENSION_MAP[ext]) {
        return EXTENSION_MAP[ext];
      }
      // Try as special filename
      if (SPECIAL_FILENAMES[filename]) {
        return SPECIAL_FILENAMES[filename];
      }
    }
  }

  // Tier 2: Extension-based lookup
  const lastDotIndex = filename.lastIndexOf('.');
  if (lastDotIndex === -1) {
    // No extension - check special filenames one more time with exact match
    if (SPECIAL_FILENAMES[lowerFilename]) {
      return SPECIAL_FILENAMES[lowerFilename];
    }
    return 'text';
  }

  const extension = filename.slice(lastDotIndex + 1).toLowerCase();
  return EXTENSION_MAP[extension] ?? 'text';
}
