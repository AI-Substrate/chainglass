/**
 * Get All Diffs — single git diff command split by file
 *
 * Runs one `git diff` and splits the output into per-file diff strings.
 * O(1) process spawns instead of O(N) per-file calls (DYK-P4-03).
 *
 * Plan 071: PR View & File Notes — Phase 4
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Fetch all file diffs in a single git command.
 *
 * Working mode (no base): `git diff HEAD`
 * Branch mode (with base): `git diff <base>...HEAD`
 *
 * Returns Map<filePath, diffText> where each diff includes the
 * full `diff --git a/... b/...` header through the end of that file's hunks.
 *
 * @param cwd - Worktree path
 * @param base - Optional base ref for branch comparison
 */
export async function getAllDiffs(cwd: string, base?: string): Promise<Map<string, string>> {
  try {
    const args = base ? ['diff', `${base}...HEAD`] : ['diff', 'HEAD'];

    const { stdout } = await execFileAsync('git', args, {
      cwd,
      maxBuffer: 50 * 1024 * 1024, // 50MB for large repos
    });

    return splitDiffByFile(stdout);
  } catch {
    return new Map();
  }
}

/**
 * Split a combined git diff output into per-file chunks.
 *
 * Each chunk starts with `diff --git a/<path> b/<path>` and runs until
 * the next `diff --git` header or end of output.
 *
 * File path is extracted from the `b/` side of the header (handles renames).
 */
export function splitDiffByFile(rawDiff: string): Map<string, string> {
  const result = new Map<string, string>();
  if (!rawDiff.trim()) return result;

  // Split on `diff --git ` while keeping the delimiter
  const chunks = rawDiff.split(/(?=^diff --git )/m);

  for (const chunk of chunks) {
    if (!chunk.trim()) continue;

    // Extract file path from header: `diff --git a/<path> b/<path>`
    const headerMatch = chunk.match(/^diff --git a\/.+ b\/(.+)$/m);
    if (!headerMatch) continue;

    const filePath = headerMatch[1];
    result.set(filePath, chunk);
  }

  return result;
}
