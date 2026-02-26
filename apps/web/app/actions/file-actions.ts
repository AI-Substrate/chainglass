'use server';

/**
 * File Browser Server Actions — readFile + saveFile
 *
 * Server actions callable from client components.
 * Delegate to service layer for actual file operations.
 * Returns highlighted HTML + markdown preview alongside content (D1, D2, D4).
 *
 * Phase 4: File Browser — Plan 041
 */

import { SHARED_DI_TOKENS, WORKSPACE_DI_TOKENS } from '@chainglass/shared';
import type { IFileSystem, IPathResolver } from '@chainglass/shared';
import type { IWorkspaceService } from '@chainglass/workflow';
import {
  type ReadFileResult,
  type SaveFileResult,
  readFileAction as readFileService,
  saveFileAction as saveFileService,
} from '../../src/features/041-file-browser/services/file-actions';
import { getContainer } from '../../src/lib/bootstrap-singleton';
import { renderMarkdownToHtml } from '../../src/lib/server/markdown-renderer';
import { highlightCode } from '../../src/lib/server/shiki-processor';

export async function readFile(
  slug: string,
  worktreePath: string,
  filePath: string
): Promise<ReadFileResult> {
  const container = getContainer();
  const fileSystem = container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
  const pathResolver = container.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);

  return readFileService({
    worktreePath,
    filePath,
    fileSystem,
    pathResolver,
    highlightFn: highlightCode,
    renderMarkdownFn: renderMarkdownToHtml,
  });
}

export async function saveFile(
  slug: string,
  worktreePath: string,
  filePath: string,
  content: string,
  expectedMtime?: string,
  force?: boolean
): Promise<SaveFileResult> {
  const container = getContainer();
  const fileSystem = container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
  const pathResolver = container.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);

  return saveFileService({
    worktreePath,
    filePath,
    content,
    expectedMtime,
    force,
    fileSystem,
    pathResolver,
  });
}

// Wrapper for lazy diff loading (D3) — 'use server' requires async fn exports
export async function fetchGitDiff(filePath: string, cwd?: string) {
  const { getGitDiff } = await import('../../src/lib/server/git-diff-action');
  return getGitDiff(filePath, cwd);
}

// Wrapper for changed-files filter
export async function fetchChangedFiles(worktreePath: string) {
  const { getChangedFiles } = await import(
    '../../src/features/041-file-browser/services/changed-files'
  );
  return getChangedFiles(worktreePath);
}

// Upload file to scratch/paste/ — Plan 044
export type { UploadFileResult } from '../../src/features/041-file-browser/services/upload-file';

export async function uploadFile(formData: FormData) {
  const { uploadFileService } = await import(
    '../../src/features/041-file-browser/services/upload-file'
  );

  const file = formData.get('file') as File | null;
  const worktreePath = formData.get('worktreePath') as string;

  if (!file || file.size === 0) {
    return { ok: false as const, error: 'no-file' as const };
  }

  const container = getContainer();
  const fileSystem = container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
  const pathResolver = container.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return uploadFileService({
    worktreePath,
    fileName: file.name,
    mimeType: file.type,
    content: buffer,
    fileSystem,
    pathResolver,
  });
}

// Working changes — git status --porcelain parser (Plan 043 Phase 2)
export async function fetchWorkingChanges(worktreePath: string) {
  const { getWorkingChanges } = await import(
    '../../src/features/041-file-browser/services/working-changes'
  );
  return getWorkingChanges(worktreePath);
}

// Recent files — git log --name-only parser (Plan 043 Phase 2)
export async function fetchRecentFiles(worktreePath: string, limit = 20) {
  const { getRecentFiles } = await import(
    '../../src/features/041-file-browser/services/recent-files'
  );
  return getRecentFiles(worktreePath, limit);
}

// Diff stats — git diff HEAD --shortstat parser (Plan 049 Feature 1)
export async function fetchDiffStats(
  worktreePath: string
): Promise<import('../../src/features/041-file-browser/services/diff-stats').DiffStatsResult> {
  const { getDiffStats } = await import('../../src/features/041-file-browser/services/diff-stats');
  return getDiffStats(worktreePath);
}

// File existence check — lightweight stat for ExplorerPanel (Plan 043 Phase 2)
// Security: resolves trusted root from slug via IWorkspaceService, not client worktreePath.
export async function fileExists(
  slug: string,
  worktreePath: string,
  filePath: string
): Promise<boolean> {
  const nodePath = await import('node:path');
  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const fileSystem = container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
  const pathResolver = container.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);

  // Resolve trusted root from slug
  const info = await workspaceService.getInfo(slug);
  if (!info) return false;
  // Verify worktreePath is a known worktree for this workspace
  const trustedRoot = info.worktrees.find((w) => w.path === worktreePath)?.path ?? info.path;

  try {
    const absolutePath = pathResolver.resolvePath(trustedRoot, filePath);
    const realPath = await fileSystem.realpath(absolutePath);
    if (!realPath.startsWith(trustedRoot + nodePath.default.sep) && realPath !== trustedRoot) {
      return false;
    }
    const stat = await fileSystem.stat(realPath);
    return !stat.isDirectory;
  } catch {
    return false;
  }
}

// Path type check — returns 'file', 'directory', or false (Plan 043)
export async function pathExists(
  slug: string,
  worktreePath: string,
  filePath: string
): Promise<'file' | 'directory' | false> {
  const nodePath = await import('node:path');
  const container = getContainer();
  const workspaceService = container.resolve<IWorkspaceService>(
    WORKSPACE_DI_TOKENS.WORKSPACE_SERVICE
  );
  const fileSystem = container.resolve<IFileSystem>(SHARED_DI_TOKENS.FILESYSTEM);
  const pathResolver = container.resolve<IPathResolver>(SHARED_DI_TOKENS.PATH_RESOLVER);

  const info = await workspaceService.getInfo(slug);
  if (!info) return false;
  const trustedRoot = info.worktrees.find((w) => w.path === worktreePath)?.path ?? info.path;

  try {
    const absolutePath = pathResolver.resolvePath(trustedRoot, filePath);
    const realPath = await fileSystem.realpath(absolutePath);
    if (!realPath.startsWith(trustedRoot + nodePath.default.sep) && realPath !== trustedRoot) {
      return false;
    }
    const stat = await fileSystem.stat(realPath);
    return stat.isDirectory ? 'directory' : 'file';
  } catch {
    return false;
  }
}
