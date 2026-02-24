/**
 * File Actions Service — readFile + saveFile
 *
 * Secure file read/write with size limits, binary detection,
 * symlink escape prevention, and mtime conflict detection.
 *
 * Phase 4: File Browser — Plan 041
 * Finding 02: Symlink escape via realpath
 * Finding 06: Atomic write (tmp+rename) for save
 * Finding 09: 5MB size limit, null-byte binary detection
 */

import * as path from 'node:path';
import { detectLanguage } from '@/lib/language-detection';
import type { IFileSystem, IPathResolver } from '@chainglass/shared';
import { PathSecurityError } from '@chainglass/shared';

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// ==================== Read File ====================

export type ReadFileResult =
  | { ok: true; content: string; mtime: string; size: number; language: string }
  | { ok: false; error: 'file-too-large' | 'binary-file' | 'not-found' | 'security' };

export interface ReadFileOptions {
  worktreePath: string;
  filePath: string;
  fileSystem: IFileSystem;
  pathResolver: IPathResolver;
}

export async function readFileAction(options: ReadFileOptions): Promise<ReadFileResult> {
  const { worktreePath, filePath, fileSystem, pathResolver } = options;

  // Security: validate path
  let absolutePath: string;
  try {
    absolutePath = pathResolver.resolvePath(worktreePath, filePath);
  } catch (e) {
    if (e instanceof PathSecurityError) {
      return { ok: false, error: 'security' };
    }
    throw e;
  }

  // Check file exists
  if (!(await fileSystem.exists(absolutePath))) {
    return { ok: false, error: 'not-found' };
  }

  // Security: symlink escape check via realpath
  try {
    const realPath = await fileSystem.realpath(absolutePath);
    if (!realPath.startsWith(worktreePath)) {
      return { ok: false, error: 'security' };
    }
  } catch {
    return { ok: false, error: 'not-found' };
  }

  // Size check
  const stats = await fileSystem.stat(absolutePath);
  if (stats.size > MAX_FILE_SIZE) {
    return { ok: false, error: 'file-too-large' };
  }

  // Read content
  const content = await fileSystem.readFile(absolutePath);

  // Binary detection: null-byte in first 8KB
  const sample = content.slice(0, 8192);
  if (sample.includes('\x00')) {
    return { ok: false, error: 'binary-file' };
  }

  const language = detectLanguage(path.basename(filePath));

  return {
    ok: true,
    content,
    mtime: stats.mtime,
    size: stats.size,
    language,
  };
}

// ==================== Save File ====================

export type SaveFileResult =
  | { ok: true; newMtime: string }
  | { ok: false; error: 'conflict' | 'security'; serverMtime?: string };

export interface SaveFileOptions {
  worktreePath: string;
  filePath: string;
  content: string;
  expectedMtime?: string;
  force?: boolean;
  fileSystem: IFileSystem;
  pathResolver: IPathResolver;
}

export async function saveFileAction(options: SaveFileOptions): Promise<SaveFileResult> {
  const { worktreePath, filePath, content, expectedMtime, force, fileSystem, pathResolver } =
    options;

  // Security: validate path
  let absolutePath: string;
  try {
    absolutePath = pathResolver.resolvePath(worktreePath, filePath);
  } catch (e) {
    if (e instanceof PathSecurityError) {
      return { ok: false, error: 'security' };
    }
    throw e;
  }

  // Mtime conflict check (unless force)
  if (expectedMtime && !force) {
    try {
      const stats = await fileSystem.stat(absolutePath);
      if (stats.mtime !== expectedMtime) {
        return { ok: false, error: 'conflict', serverMtime: stats.mtime };
      }
    } catch {
      // File doesn't exist yet — allow creation
    }
  }

  // Atomic write: write to tmp, then rename
  const tmpPath = `${absolutePath}.tmp`;
  await fileSystem.writeFile(tmpPath, content);
  await fileSystem.rename(tmpPath, absolutePath);

  // Return new mtime
  const newStats = await fileSystem.stat(absolutePath);
  return { ok: true, newMtime: newStats.mtime };
}
