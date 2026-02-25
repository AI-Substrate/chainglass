/**
 * Plan 045: Live File Events
 *
 * Ignore patterns for source file watchers. These directories and files
 * generate noise that should never reach the file change event pipeline.
 *
 * Per Workshop 02: Worktree-Wide Watcher Strategy
 * Per ADR-0008: .chainglass is watched separately by data watchers
 */

/**
 * Directory segments that should be ignored by source watchers.
 * Uses path-segment matching (checking split('/') segments) for reliability,
 * since chokidar's glob-based `ignored` doesn't always work with ** patterns.
 */
const IGNORED_SEGMENTS = new Set([
  '.git',
  'node_modules',
  'vendor',
  '.pnpm-store',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.cache',
  'coverage',
  '__pycache__',
  '.idea',
  '.vscode',
  '.chainglass',
]);

/** File names to always ignore */
const IGNORED_FILES = new Set([
  '.DS_Store',
  'Thumbs.db',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
]);

/** Patterns passed to chokidar `ignored` option for source file watchers */
export const SOURCE_WATCHER_IGNORED: (string | RegExp | ((path: string) => boolean))[] = [
  // Function-based matching is most reliable with chokidar
  (filePath: string) => {
    const segments = filePath.split('/');
    // Check if any path segment is in the ignored set
    for (const seg of segments) {
      if (IGNORED_SEGMENTS.has(seg)) return true;
    }
    // Check ignored file basenames
    const basename = segments[segments.length - 1];
    if (basename && IGNORED_FILES.has(basename)) return true;
    return false;
  },
  // Editor swap/backup files
  /\.swp$/,
  /\.swo$/,
  /~$/,
];
