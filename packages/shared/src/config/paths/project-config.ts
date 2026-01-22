import fs from 'node:fs';
import path from 'node:path';

/**
 * Find the project-level configuration directory by walking up from CWD.
 *
 * Git-style discovery: walks up the directory tree until finding a `.chainglass`
 * directory or reaching the filesystem root.
 *
 * Per Critical Discovery 06 and DYK-06:
 * - Returns null if no .chainglass/ found (not an error)
 * - Does NOT cache results (each call walks fresh for test isolation)
 * - Only returns directories, not files named .chainglass
 *
 * @returns Absolute path to project config directory, or null if not found
 */
export function getProjectConfigDir(): string | null {
  // DYK-06: No caching - always walk fresh. Rationale: one-time startup call,
  // microsecond performance vs. test isolation complexity in parallel Vitest.
  let current = process.cwd();
  const root = path.parse(current).root;

  while (current !== root) {
    const candidate = path.join(current, '.chainglass');
    try {
      const stats = fs.statSync(candidate);
      // Only accept directories, not files
      if (stats.isDirectory()) {
        return candidate;
      }
    } catch {
      // Directory doesn't exist, continue walking up
    }
    current = path.dirname(current);
  }

  // Check root directory as well
  const rootCandidate = path.join(root, '.chainglass');
  try {
    const stats = fs.statSync(rootCandidate);
    if (stats.isDirectory()) {
      return rootCandidate;
    }
  } catch {
    // Not found at root either
  }

  return null;
}
