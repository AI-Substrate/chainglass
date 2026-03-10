/**
 * Per-File Diff Stats — git diff --numstat parser
 *
 * Returns per-file insertion/deletion counts for both
 * Working mode (vs HEAD) and Branch mode (vs merge-base).
 *
 * Plan 071: PR View & File Notes — Phase 4
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { DiffFileStats } from '../types';

const execFileAsync = promisify(execFile);

/**
 * Get per-file diff stats using `git diff --numstat`.
 *
 * Working mode (no base): `git diff HEAD --numstat`
 * Branch mode (with base): `git diff <base>...HEAD --numstat`
 *
 * @param cwd - Worktree path
 * @param base - Optional base ref for branch comparison
 * @returns Map of file path → { insertions, deletions }
 */
export async function getPerFileDiffStats(
  cwd: string,
  base?: string
): Promise<Map<string, DiffFileStats>> {
  try {
    const args = base ? ['diff', `${base}...HEAD`, '--numstat'] : ['diff', 'HEAD', '--numstat'];

    const { stdout } = await execFileAsync('git', args, { cwd });
    return parseNumstat(stdout);
  } catch {
    return new Map();
  }
}

/**
 * Parse git diff --numstat output into a Map.
 *
 * Format: `<insertions>\t<deletions>\t<filepath>`
 * Binary files show: `-\t-\t<filepath>` → mapped to 0,0
 * Renames show: `<ins>\t<del>\t<old> => <new>` → keyed by new path
 */
export function parseNumstat(output: string): Map<string, DiffFileStats> {
  const stats = new Map<string, DiffFileStats>();

  for (const line of output.split('\n')) {
    if (!line.trim()) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;

    const insertions = parts[0] === '-' ? 0 : Number.parseInt(parts[0], 10);
    const deletions = parts[1] === '-' ? 0 : Number.parseInt(parts[1], 10);
    let filePath = parts[2];

    // Handle renames: "old => new" or "{old => new}/path"
    const renameMatch = filePath.match(/\{(.+?) => (.+?)\}/);
    if (renameMatch) {
      filePath = filePath.replace(renameMatch[0], renameMatch[2]);
    } else if (filePath.includes(' => ')) {
      filePath = filePath.split(' => ')[1];
    }

    stats.set(filePath, {
      insertions: Number.isNaN(insertions) ? 0 : insertions,
      deletions: Number.isNaN(deletions) ? 0 : deletions,
    });
  }

  return stats;
}
