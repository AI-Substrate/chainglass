/**
 * File Mutation Actions — create, delete, rename
 *
 * Secure file/folder CRUD operations with path security,
 * duplicate detection, filename validation, and typed results.
 *
 * Plan 068: Add File/Folder Features — Phase 1
 */

import * as nodePath from 'node:path';
import type { IFileSystem, IPathResolver } from '@chainglass/shared';
import { PathSecurityError } from '@chainglass/shared';
import { validateFileName } from '../lib/validate-filename';

// ==================== Result Types ====================

export type CreateResult =
  | { ok: true; path: string }
  | { ok: false; error: 'exists' | 'security' | 'invalid-name'; message: string };

export type DeleteResult =
  | { ok: true }
  | {
      ok: false;
      error: 'not-found' | 'security' | 'too-large';
      message: string;
      itemCount?: number;
    };

export type RenameResult =
  | { ok: true; oldPath: string; newPath: string }
  | { ok: false; error: 'not-found' | 'exists' | 'security' | 'invalid-name'; message: string };

// ==================== Options Interfaces ====================

export interface CreateFileOptions {
  worktreePath: string;
  /** Directory relative to worktree root where the file will be created */
  dirPath: string;
  /** File name (not a path — validated for git-portable characters) */
  fileName: string;
  fileSystem: IFileSystem;
  pathResolver: IPathResolver;
}

export interface CreateFolderOptions {
  worktreePath: string;
  /** Directory relative to worktree root where the folder will be created */
  dirPath: string;
  /** Folder name (not a path — validated for git-portable characters) */
  folderName: string;
  fileSystem: IFileSystem;
  pathResolver: IPathResolver;
}

export interface DeleteItemOptions {
  worktreePath: string;
  /** Path relative to worktree root of the item to delete */
  itemPath: string;
  fileSystem: IFileSystem;
  pathResolver: IPathResolver;
}

export interface RenameItemOptions {
  worktreePath: string;
  /** Current path relative to worktree root */
  oldPath: string;
  /** New name (not a path — validated for git-portable characters) */
  newName: string;
  fileSystem: IFileSystem;
  pathResolver: IPathResolver;
}

// ==================== Constants ====================

/** Maximum direct children before rejecting folder deletion */
export const MAX_DELETE_CHILDREN = 5000;

// ==================== Shared Helpers ====================

/**
 * Resolve and validate a path within the worktree.
 * Returns the absolute path, or a security error result.
 * DYK-01: For create ops, pass the parent directory path (target doesn't exist yet).
 */
async function resolveAndValidatePath(
  worktreePath: string,
  relativePath: string,
  fileSystem: IFileSystem,
  pathResolver: IPathResolver
): Promise<{ absolutePath: string } | { ok: false; error: 'security'; message: string }> {
  let absolutePath: string;
  try {
    absolutePath = pathResolver.resolvePath(worktreePath, relativePath);
  } catch (e) {
    if (e instanceof PathSecurityError) {
      return { ok: false, error: 'security', message: `Path security violation: ${relativePath}` };
    }
    throw e;
  }

  // Symlink escape check: resolve real path and verify containment
  try {
    const checkPath = (await fileSystem.exists(absolutePath))
      ? absolutePath
      : nodePath.dirname(absolutePath);
    if (await fileSystem.exists(checkPath)) {
      const realPath = await fileSystem.realpath(checkPath);
      const normalizedRoot = worktreePath.endsWith('/') ? worktreePath : `${worktreePath}/`;
      if (realPath !== worktreePath && !realPath.startsWith(normalizedRoot)) {
        return { ok: false, error: 'security', message: 'Symlink escape detected' };
      }
    }
  } catch {
    // realpath failure on non-existent parent is OK for create ops
  }

  return { absolutePath };
}

// ==================== Service Functions ====================

export async function createFileService(options: CreateFileOptions): Promise<CreateResult> {
  const { worktreePath, dirPath, fileName, fileSystem, pathResolver } = options;

  const nameCheck = validateFileName(fileName);
  if (!nameCheck.ok) {
    return { ok: false, error: 'invalid-name', message: `Invalid filename: ${fileName}` };
  }

  const relativePath = dirPath ? `${dirPath}/${fileName}` : fileName;
  const resolved = await resolveAndValidatePath(
    worktreePath,
    relativePath,
    fileSystem,
    pathResolver
  );
  if ('ok' in resolved) return resolved;

  if (await fileSystem.exists(resolved.absolutePath)) {
    return { ok: false, error: 'exists', message: `Already exists: ${relativePath}` };
  }

  await fileSystem.writeFile(resolved.absolutePath, '');
  return { ok: true, path: relativePath };
}

export async function createFolderService(options: CreateFolderOptions): Promise<CreateResult> {
  const { worktreePath, dirPath, folderName, fileSystem, pathResolver } = options;

  const nameCheck = validateFileName(folderName);
  if (!nameCheck.ok) {
    return { ok: false, error: 'invalid-name', message: `Invalid folder name: ${folderName}` };
  }

  // FT-002: Validate parent directory exists and is safe (prevents symlink ancestor escape)
  if (dirPath) {
    const parentResolved = await resolveAndValidatePath(
      worktreePath,
      dirPath,
      fileSystem,
      pathResolver
    );
    if ('ok' in parentResolved) return parentResolved;
    if (!(await fileSystem.exists(parentResolved.absolutePath))) {
      return { ok: false, error: 'security', message: `Parent directory missing: ${dirPath}` };
    }
  }

  const relativePath = dirPath ? `${dirPath}/${folderName}` : folderName;
  const resolved = await resolveAndValidatePath(
    worktreePath,
    relativePath,
    fileSystem,
    pathResolver
  );
  if ('ok' in resolved) return resolved;

  if (await fileSystem.exists(resolved.absolutePath)) {
    return { ok: false, error: 'exists', message: `Already exists: ${relativePath}` };
  }

  // Non-recursive mkdir — parent must already exist (validated above)
  await fileSystem.mkdir(resolved.absolutePath);
  return { ok: true, path: relativePath };
}

export async function deleteItemService(options: DeleteItemOptions): Promise<DeleteResult> {
  const { worktreePath, itemPath, fileSystem, pathResolver } = options;

  const resolved = await resolveAndValidatePath(worktreePath, itemPath, fileSystem, pathResolver);
  if ('ok' in resolved) return resolved;

  if (!(await fileSystem.exists(resolved.absolutePath))) {
    return { ok: false, error: 'not-found', message: `Not found: ${itemPath}` };
  }

  const stats = await fileSystem.stat(resolved.absolutePath);

  if (stats.isDirectory) {
    // Safety check: reject folders with too many direct children
    const children = await fileSystem.readDir(resolved.absolutePath);
    if (children.length > MAX_DELETE_CHILDREN) {
      return {
        ok: false,
        error: 'too-large',
        message: `Folder has ${children.length} items — too many to delete from the browser`,
        itemCount: children.length,
      };
    }
    await fileSystem.rmdir(resolved.absolutePath, { recursive: true });
  } else {
    await fileSystem.unlink(resolved.absolutePath);
  }

  return { ok: true };
}

export async function renameItemService(options: RenameItemOptions): Promise<RenameResult> {
  const { worktreePath, oldPath, newName, fileSystem, pathResolver } = options;

  const nameCheck = validateFileName(newName);
  if (!nameCheck.ok) {
    return { ok: false, error: 'invalid-name', message: `Invalid name: ${newName}` };
  }

  // Resolve source path
  const oldResolved = await resolveAndValidatePath(worktreePath, oldPath, fileSystem, pathResolver);
  if ('ok' in oldResolved) return oldResolved;

  if (!(await fileSystem.exists(oldResolved.absolutePath))) {
    return { ok: false, error: 'not-found', message: `Not found: ${oldPath}` };
  }

  // Compute new relative path: same parent directory + new name
  const parentDir = nodePath.dirname(oldPath);
  const newRelativePath = parentDir === '.' ? newName : `${parentDir}/${newName}`;

  // Resolve destination path
  const newResolved = await resolveAndValidatePath(
    worktreePath,
    newRelativePath,
    fileSystem,
    pathResolver
  );
  if ('ok' in newResolved) return newResolved;

  if (await fileSystem.exists(newResolved.absolutePath)) {
    return { ok: false, error: 'exists', message: `Already exists: ${newRelativePath}` };
  }

  await fileSystem.rename(oldResolved.absolutePath, newResolved.absolutePath);
  return { ok: true, oldPath, newPath: newRelativePath };
}
