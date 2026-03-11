/**
 * Content Hash — git hash-object wrapper
 *
 * Computes a content hash for a file using `git hash-object`.
 * Used by pr-view-state to detect when a reviewed file has changed on disk.
 *
 * Plan 071: PR View & File Notes — Phase 4
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { PathResolverAdapter, PathSecurityError } from '@chainglass/shared';

const execFileAsync = promisify(execFile);
const pathResolver = new PathResolverAdapter();

/**
 * Compute the git content hash for a file.
 * Returns the SHA-1 hash that git would use for this file's content.
 * Returns empty string if the file doesn't exist, path is invalid, or git fails.
 * Validates path against worktree root to prevent traversal attacks.
 */
export async function computeContentHash(worktreePath: string, filePath: string): Promise<string> {
  try {
    const absolutePath = pathResolver.resolvePath(worktreePath, filePath);

    const { stdout } = await execFileAsync('git', ['hash-object', absolutePath], {
      cwd: worktreePath,
    });
    return stdout.trim();
  } catch (error) {
    if (error instanceof PathSecurityError) return '';
    return '';
  }
}
