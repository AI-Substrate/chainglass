/**
 * Directory Listing Service
 *
 * Lazy per-directory file listing. Uses git ls-files for git repos
 * (respects .gitignore), falls back to readDir for non-git workspaces.
 *
 * Phase 4: File Browser — Plan 041
 * DYK-P4-03: Scoped to requested directory only (not full tree)
 * Finding 05: execFile with array args for git commands
 */

import { execFile } from 'node:child_process';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { type IFileSystem, type IPathResolver, PathSecurityError } from '@chainglass/shared';

const execFileAsync = promisify(execFile);

export interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  path: string;
}

export interface ListDirectoryOptions {
  worktreePath: string;
  dirPath: string;
  isGit: boolean;
  fileSystem: IFileSystem;
  pathResolver?: IPathResolver;
}

export interface ListDirectoryResult {
  entries: FileEntry[];
}

/**
 * List files and directories in a workspace directory.
 * Scoped to one level — does not recurse (lazy loading on expand).
 */
export async function listDirectory(options: ListDirectoryOptions): Promise<ListDirectoryResult> {
  const { worktreePath, dirPath, isGit, fileSystem, pathResolver } = options;

  // Security: reject absolute paths
  if (dirPath && path.isAbsolute(dirPath)) {
    throw new PathSecurityError('Absolute paths not allowed', worktreePath, dirPath);
  }

  // Security: validate path stays within workspace
  if (pathResolver) {
    pathResolver.resolvePath(worktreePath, dirPath || '.');
  } else if (dirPath.includes('..')) {
    throw new PathSecurityError('Path traversal not allowed', worktreePath, dirPath);
  }

  const absoluteDir = dirPath ? path.join(worktreePath, dirPath) : worktreePath;

  if (isGit) {
    return listFromGit(worktreePath, dirPath);
  }

  return listFromReadDir(absoluteDir, dirPath, fileSystem);
}

async function listFromGit(worktreePath: string, dirPath: string): Promise<ListDirectoryResult> {
  const args = ['ls-files', '--full-name'];
  if (dirPath) {
    args.push('--', `${dirPath}/`);
  }

  const { stdout } = await execFileAsync('git', args, { cwd: worktreePath });
  const allPaths = stdout.trim().split('\n').filter(Boolean);

  // Extract one-level entries relative to dirPath
  const prefix = dirPath ? `${dirPath}/` : '';
  const seen = new Set<string>();
  const entries: FileEntry[] = [];

  for (const filePath of allPaths) {
    const relative = prefix ? filePath.slice(prefix.length) : filePath;
    if (!relative) continue;

    const slashIndex = relative.indexOf('/');
    if (slashIndex === -1) {
      // Direct file
      if (!seen.has(relative)) {
        seen.add(relative);
        entries.push({
          name: relative,
          type: 'file',
          path: filePath,
        });
      }
    } else {
      // Directory (first segment)
      const dirName = relative.slice(0, slashIndex);
      if (!seen.has(dirName)) {
        seen.add(dirName);
        entries.push({
          name: dirName,
          type: 'directory',
          path: prefix + dirName,
        });
      }
    }
  }

  return { entries };
}

async function listFromReadDir(
  absoluteDir: string,
  dirPath: string,
  fileSystem: IFileSystem
): Promise<ListDirectoryResult> {
  let items: string[];
  try {
    items = await fileSystem.readDir(absoluteDir);
  } catch {
    return { entries: [] };
  }

  const entries: FileEntry[] = [];

  for (const item of items) {
    const fullPath = path.join(absoluteDir, item);
    const relativePath = dirPath ? `${dirPath}/${item}` : item;

    try {
      const stats = await fileSystem.stat(fullPath);
      entries.push({
        name: item,
        type: stats.isDirectory ? 'directory' : 'file',
        path: relativePath,
      });
    } catch {
      // Skip items we can't stat
    }
  }

  return { entries };
}

// Re-export from client-safe module
export type { TreeEntry } from './format-tree';
import type { TreeEntry } from './format-tree';

// ==================== Recursive Tree Listing ====================

export interface ListTreeOptions {
  worktreePath: string;
  dirPath: string;
  fileSystem: IFileSystem;
  maxDepth?: number;
}

/**
 * Recursively list all files and directories as a tree structure.
 * Uses git ls-files for efficient listing, falls back to readDir.
 */
export async function listDirectoryTree(options: ListTreeOptions): Promise<TreeEntry[]> {
  const { worktreePath, dirPath, fileSystem, maxDepth = 10 } = options;

  try {
    const args = ['ls-files', '--full-name'];
    if (dirPath) args.push('--', `${dirPath}/`);

    const { stdout } = await execFileAsync('git', args, { cwd: worktreePath });
    const allPaths = stdout.trim().split('\n').filter(Boolean);
    return buildTreeFromPaths(allPaths, dirPath, maxDepth);
  } catch {
    return buildTreeFromReadDir(worktreePath, dirPath, fileSystem, 0, maxDepth);
  }
}

function buildTreeFromPaths(paths: string[], rootDir: string, maxDepth: number): TreeEntry[] {
  const prefix = rootDir ? `${rootDir}/` : '';
  const tree: TreeEntry[] = [];

  for (const filePath of paths) {
    const relative = prefix ? filePath.slice(prefix.length) : filePath;
    if (!relative) continue;

    const parts = relative.split('/');
    if (parts.length > maxDepth) continue;

    let parentList = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const entryPath = prefix + parts.slice(0, i + 1).join('/');

      let existing = parentList.find((e) => e.name === part);
      if (!existing) {
        existing = {
          name: part,
          type: isFile ? 'file' : 'directory',
          path: entryPath,
          children: isFile ? undefined : [],
        };
        parentList.push(existing);
      }

      if (!isFile && existing.children) {
        parentList = existing.children;
      }
    }
  }

  return tree;
}

async function buildTreeFromReadDir(
  worktreePath: string,
  dirPath: string,
  fileSystem: IFileSystem,
  depth: number,
  maxDepth: number
): Promise<TreeEntry[]> {
  if (depth >= maxDepth) return [];

  const absoluteDir = dirPath ? path.join(worktreePath, dirPath) : worktreePath;
  let items: string[];
  try {
    items = await fileSystem.readDir(absoluteDir);
  } catch {
    return [];
  }

  const entries: TreeEntry[] = [];
  for (const item of items) {
    const fullPath = path.join(absoluteDir, item);
    const relativePath = dirPath ? `${dirPath}/${item}` : item;

    try {
      const stats = await fileSystem.stat(fullPath);
      if (stats.isDirectory) {
        const children = await buildTreeFromReadDir(
          worktreePath,
          relativePath,
          fileSystem,
          depth + 1,
          maxDepth
        );
        entries.push({ name: item, type: 'directory', path: relativePath, children });
      } else {
        entries.push({ name: item, type: 'file', path: relativePath });
      }
    } catch {
      // Skip items we can't stat
    }
  }

  return entries;
}
