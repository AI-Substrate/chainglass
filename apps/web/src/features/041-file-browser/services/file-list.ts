/**
 * File List Service
 *
 * Returns all file paths + filesystem mtime for a workspace.
 * Uses `git ls-files --cached --others [--exclude-standard]` + `fs.stat()`.
 * Non-git fallback uses recursive readDir (depth-limited to 10).
 *
 * Feature 2: File Tree Quick Filter — Plan 049
 * Workshop 001: Cache architecture — CachedFileEntry needs mtime for sort-by-recent
 */

import { execFile } from 'node:child_process';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface FileListEntry {
  path: string;
  mtime: number;
}

export type FileListResult = { ok: true; files: FileListEntry[] } | { ok: false; error: 'not-git' };

/**
 * Get all files in a worktree with their filesystem mtime.
 * @param worktreePath - Absolute path to the workspace root
 * @param includeHidden - When true, omits --exclude-standard (shows ignored/hidden files)
 */
export async function getFileList(
  worktreePath: string,
  includeHidden = false
): Promise<FileListResult> {
  try {
    const args = ['ls-files', '--cached', '--others'];
    if (!includeHidden) {
      args.push('--exclude-standard');
    }

    const { stdout } = await execFileAsync('git', args, {
      cwd: worktreePath,
      maxBuffer: 10 * 1024 * 1024, // 10MB for large repos
    });

    const paths = stdout.trim().split('\n').filter(Boolean);
    // Deduplicate (--cached + --others can overlap for modified tracked files)
    const uniquePaths = [...new Set(paths)].sort();

    const entries = await Promise.all(
      uniquePaths.map(async (filePath): Promise<FileListEntry | null> => {
        try {
          const fullPath = join(worktreePath, filePath);
          const st = await stat(fullPath);
          return { path: filePath, mtime: st.mtimeMs };
        } catch {
          // File was deleted between ls-files and stat — skip it
          return null;
        }
      })
    );

    return { ok: true, files: entries.filter((e): e is FileListEntry => e !== null) };
  } catch {
    // Not a git repository — try readDir fallback
    try {
      const files = await readDirRecursive(worktreePath, '', 10);
      return { ok: true, files };
    } catch {
      return { ok: false, error: 'not-git' };
    }
  }
}

/** Recursive readDir fallback for non-git workspaces (depth-limited). */
async function readDirRecursive(
  basePath: string,
  relativePath: string,
  maxDepth: number
): Promise<FileListEntry[]> {
  if (maxDepth <= 0) return [];

  const fullPath = relativePath ? join(basePath, relativePath) : basePath;
  const dirEntries = await readdir(fullPath, { withFileTypes: true });
  const results: FileListEntry[] = [];

  for (const entry of dirEntries) {
    // Skip .git directory
    if (entry.name === '.git') continue;
    const entryRelative = relativePath ? `${relativePath}/${entry.name}` : entry.name;

    if (entry.isFile()) {
      try {
        const st = await stat(join(basePath, entryRelative));
        results.push({ path: entryRelative, mtime: st.mtimeMs });
      } catch {
        // Skip inaccessible files
      }
    } else if (entry.isDirectory()) {
      const children = await readDirRecursive(basePath, entryRelative, maxDepth - 1);
      results.push(...children);
    }
  }

  return results.sort((a, b) => a.path.localeCompare(b.path));
}
