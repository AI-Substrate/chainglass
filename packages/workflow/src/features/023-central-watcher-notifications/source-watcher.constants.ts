/**
 * Plan 045: Live File Events
 *
 * Ignore patterns for source file watchers. These directories and files
 * generate noise that should never reach the file change event pipeline.
 *
 * Per Workshop 02: Worktree-Wide Watcher Strategy
 * Per ADR-0008: .chainglass is watched separately by data watchers
 */

/** Patterns passed to chokidar `ignored` option for source file watchers */
export const SOURCE_WATCHER_IGNORED: (string | RegExp)[] = [
  // Version control
  '**/.git/**',
  // Package managers
  '**/node_modules/**',
  '**/vendor/**',
  '**/.pnpm-store/**',
  // Build output
  '**/dist/**',
  '**/build/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/.cache/**',
  '**/coverage/**',
  // Python
  '**/__pycache__/**',
  // IDE directories
  '**/.idea/**',
  '**/.vscode/**',
  // Editor swap/backup files
  /\.swp$/,
  /\.swo$/,
  /~$/,
  // OS files
  '**/.DS_Store',
  '**/Thumbs.db',
  // Chainglass data (watched by data watchers per ADR-0008)
  '**/.chainglass/**',
  // Lock files (high-churn, not user-authored)
  '**/pnpm-lock.yaml',
  '**/package-lock.json',
  '**/yarn.lock',
];
