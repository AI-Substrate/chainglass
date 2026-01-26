'use server';

/**
 * Server Action for fetching git diff.
 *
 * Uses execFile with array arguments for command injection prevention.
 * Validates file paths with PathResolverAdapter for path traversal prevention.
 *
 * Per Critical Insights Decision #2: Defense in depth with
 * PathResolverAdapter + execFile array args.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { PathResolverAdapter, PathSecurityError } from '@chainglass/shared';

import type { DiffResult } from '@chainglass/shared';

const execFileAsync = promisify(execFile);
const pathResolver = new PathResolverAdapter();

// FIX-004: Cache git availability check to avoid spawning git --version on every request
let gitAvailableCache: boolean | null = null;

/**
 * Get the project root directory.
 * Uses process.cwd() which in Next.js dev/build is the project root.
 */
function getProjectRoot(): string {
  return process.cwd();
}

/**
 * Check if git is available on the system.
 * Result is cached after first check.
 */
async function isGitAvailable(): Promise<boolean> {
  if (gitAvailableCache !== null) {
    return gitAvailableCache;
  }
  try {
    await execFileAsync('git', ['--version']);
    gitAvailableCache = true;
    return true;
  } catch {
    gitAvailableCache = false;
    return false;
  }
}

/**
 * Check if a directory is inside a git repository.
 */
async function isGitRepository(cwd: string): Promise<boolean> {
  try {
    await execFileAsync('git', ['rev-parse', '--git-dir'], { cwd });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the git diff for a file.
 *
 * @param filePath - Path to the file, relative to project root
 * @returns DiffResult with diff content or error
 *
 * @example
 * const result = await getGitDiff('src/components/Button.tsx');
 * if (result.error) {
 *   console.log('Error:', result.error);
 * } else {
 *   console.log('Diff:', result.diff);
 * }
 */
export async function getGitDiff(filePath: string): Promise<DiffResult> {
  const projectRoot = getProjectRoot();

  // 1. Check if git is available
  if (!(await isGitAvailable())) {
    return { diff: null, error: 'git-not-available' };
  }

  // 2. Check if we're in a git repository
  if (!(await isGitRepository(projectRoot))) {
    return { diff: null, error: 'not-git' };
  }

  // 3. Validate path stays within project (prevents traversal attacks)
  let validatedPath: string;
  try {
    validatedPath = pathResolver.resolvePath(projectRoot, filePath);
  } catch (err) {
    if (err instanceof PathSecurityError) {
      // Path traversal attempt - treat as "not in git" to avoid info leak
      return { diff: null, error: 'not-git' };
    }
    throw err;
  }

  // 4. Get the relative path for git (git diff needs repo-relative paths)
  const relativePath = pathResolver.relative(projectRoot, validatedPath);

  // 5. Run git diff with array arguments (no shell interpretation)
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--', relativePath], {
      cwd: projectRoot,
      maxBuffer: 10 * 1024 * 1024, // 10MB max for large diffs
    });

    // Empty output means no changes
    if (!stdout.trim()) {
      return { diff: null, error: 'no-changes' };
    }

    return { diff: stdout, error: null };
  } catch (err) {
    // Git command failed - could be file doesn't exist, not tracked, etc.
    // For simplicity, treat as no-changes
    return { diff: null, error: 'no-changes' };
  }
}
